import type Database from 'better-sqlite3';
import { getDb } from '../db';
import { addDays, addYears, isValidDate, todayLocal } from '../date';

export interface NewStudentInput {
  name: string;
  phone: string;
  enrollmentDate: string;
  totalFeeCents: number;
  plan: 'full' | 'installments';
  purchasedHours: number;
  note?: string;
  operatorId: number;
}

function splitInstallments(totalCents: number): number[] {
  const base = Math.floor(totalCents / 3);
  return [base, base, totalCents - 2 * base];
}

export function createStudent(input: NewStudentInput, db: Database.Database = getDb()): number {
  if (!isValidDate(input.enrollmentDate) || input.enrollmentDate > todayLocal()) {
    throw new Error('报名日期不合法或晚于今天');
  }
  const expiryDate = addYears(input.enrollmentDate, 2);
  const amounts =
    input.plan === 'full' ? [input.totalFeeCents] : splitInstallments(input.totalFeeCents);
  // 应缴日：一次付清=报名当日；三期=报名当日 / +45 天 / +90 天
  const dueOffsets = input.plan === 'full' ? [0] : [0, 45, 90];

  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO students
           (name, phone, enrollment_date, expiry_date, total_fee_cents, plan, purchased_hours, note, created_by)
         VALUES (@name, @phone, @enrollmentDate, @expiryDate, @totalFeeCents, @plan, @purchasedHours, @note, @operatorId)`,
      )
      .run({
        name: input.name,
        phone: input.phone,
        enrollmentDate: input.enrollmentDate,
        expiryDate: expiryDate,
        totalFeeCents: input.totalFeeCents,
        plan: input.plan,
        purchasedHours: input.purchasedHours,
        note: input.note ?? '',
        operatorId: input.operatorId,
      });
    const studentId = Number(r.lastInsertRowid);

    const ins = db.prepare(
      `INSERT INTO installments (student_id, seq, due_date, amount_cents)
       VALUES (?, ?, ?, ?)`,
    );
    amounts.forEach((amount, i) => {
      const dueDate = addDays(input.enrollmentDate, dueOffsets[i]);
      ins.run(studentId, i + 1, dueDate, amount);
    });

    const subj = db.prepare(
      `INSERT INTO subject_records (student_id, subject_no, status, updated_by)
       VALUES (?, ?, 'pending', ?)`,
    );
    for (let s = 1; s <= 4; s++) subj.run(studentId, s, input.operatorId);
    return studentId;
  });
  return tx();
}

export interface StudentInstallmentView {
  seq: number;
  dueDate: string;
  amountCents: number;
  paidCents: number;
}

export interface StudentView {
  id: number;
  name: string;
  phone: string;
  enrollmentDate: string;
  expiryDate: string;
  totalFeeCents: number;
  paidCents: number;
  plan: 'full' | 'installments';
  purchasedHours: number;
  consumedHours: number;
  subjects: { subjectNo: number; status: 'pending' | 'passed'; passedDate: string | null }[];
  installments: StudentInstallmentView[];
  note: string;
}

const STUDENT_SELECT = `
  SELECT s.*,
    COALESCE((SELECT SUM(amount_cents) FROM payments p WHERE p.student_id = s.id), 0) AS paid_cents,
    COALESCE((SELECT SUM(delta_hours) FROM lesson_ledger l WHERE l.student_id = s.id), 0) AS consumed_hours
  FROM students s
`;

function hydrate(db: Database.Database, row: Record<string, unknown>): StudentView {
  const studentId = row.id as number;
  const subjects = db
    .prepare(
      `SELECT subject_no, status, passed_date FROM subject_records WHERE student_id = ? ORDER BY subject_no`,
    )
    .all(studentId) as { subject_no: number; status: 'pending' | 'passed'; passed_date: string | null }[];
  const installments = db
    .prepare(
      `SELECT i.seq, i.due_date, i.amount_cents,
              COALESCE((SELECT SUM(amount_cents) FROM payments p WHERE p.installment_id = i.id), 0) AS paid_cents
       FROM installments i WHERE i.student_id = ? ORDER BY i.seq`,
    )
    .all(studentId) as { seq: number; due_date: string; amount_cents: number; paid_cents: number }[];

  return {
    id: studentId,
    name: row.name as string,
    phone: row.phone as string,
    enrollmentDate: row.enrollment_date as string,
    expiryDate: row.expiry_date as string,
    totalFeeCents: row.total_fee_cents as number,
    paidCents: row.paid_cents as number,
    plan: row.plan as 'full' | 'installments',
    purchasedHours: row.purchased_hours as number,
    consumedHours: -(row.consumed_hours as number),
    subjects: subjects.map((s) => ({
      subjectNo: s.subject_no,
      status: s.status,
      passedDate: s.passed_date,
    })),
    installments: installments.map((i) => ({
      seq: i.seq,
      dueDate: i.due_date,
      amountCents: i.amount_cents,
      paidCents: i.paid_cents,
    })),
    note: row.note as string,
  };
}

export function listStudents(): StudentView[] {
  const db = getDb();
  const rows = db.prepare(`${STUDENT_SELECT} ORDER BY s.id`).all() as Record<string, unknown>[];
  return rows.map((r) => hydrate(db, r));
}

export function getStudent(studentId: number): StudentView | null {
  const db = getDb();
  const row = db.prepare(`${STUDENT_SELECT} WHERE s.id = ?`).get(studentId) as
    | Record<string, unknown>
    | undefined;
  return row ? hydrate(db, row) : null;
}

export function setSubjectStatus(
  studentId: number,
  subjectNo: number,
  status: 'pending' | 'passed',
  passedDate: string | null,
  operatorId: number,
): void {
  if (status === 'passed' && (!passedDate || !isValidDate(passedDate) || passedDate > todayLocal())) {
    throw new Error('科目通过日期不合法或晚于今天');
  }
  const db = getDb();
  db.prepare(
    `UPDATE subject_records
       SET status = ?, passed_date = ?, updated_by = ?, updated_at = datetime('now', 'localtime')
     WHERE student_id = ? AND subject_no = ?`,
  ).run(status, status === 'passed' ? passedDate : null, operatorId, studentId, subjectNo);
}
