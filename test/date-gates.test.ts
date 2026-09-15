// 服务层日期闸门 + 数据库 CHECK 兜底的集成测试（内存库，真实事务）。
process.env.DRIVING_SCHOOL_DB = ':memory:';

import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '@/lib/db';
import { createStudent } from '@/lib/services/students';
import { setSubjectStatus } from '@/lib/services/students';
import { createBooking } from '@/lib/services/booking';
import { recordPayment } from '@/lib/services/payments';
import { addDays, todayLocal } from '@/lib/date';

const db = getDb();
const today = todayLocal();

let op: number;
let instructor: number;
let vehicle: number;
let student: number;

beforeAll(() => {
  op = Number(db.prepare(`INSERT INTO operators (name, role) VALUES ('前台','front_desk')`).run().lastInsertRowid);
  instructor = Number(db.prepare(`INSERT INTO instructors (name) VALUES ('陈教练')`).run().lastInsertRowid);
  vehicle = Number(db.prepare(`INSERT INTO vehicles (plate, model) VALUES ('测A001','捷达')`).run().lastInsertRowid);
  db.prepare(`INSERT INTO instructor_vehicles (instructor_id, vehicle_id) VALUES (?, ?)`).run(instructor, vehicle);
  // 合法学员：当天报名、一次付清（一期即当天应缴且已缴清，避免学费闸门干扰）
  student = createStudent({
    name: '正常', phone: '139-0000', enrollmentDate: today,
    totalFeeCents: 480000, plan: 'full', purchasedHours: 20, operatorId: op,
  });
  const instRow = db.prepare(`SELECT id FROM installments WHERE student_id=? AND seq=1`).get(student) as { id: number };
  db.prepare(`INSERT INTO payments (student_id, installment_id, amount_cents, paid_date, created_by)
    VALUES (?, ?, 480000, ?, ?)`).run(student, instRow.id, today, op);
});

describe('服务层相对自然边界', () => {
  it('报名日期晚于今天 → createStudent 抛错', () => {
    expect(() =>
      createStudent({
        name: '未来报名', phone: '139-0002', enrollmentDate: addDays(today, 1),
        totalFeeCents: 100, plan: 'full', purchasedHours: 1, operatorId: op,
      }),
    ).toThrow(/报名日期/);
  });

  it('日历非法的报名日期 → createStudent 抛错', () => {
    expect(() =>
      createStudent({
        name: '非法报名', phone: '139-0003', enrollmentDate: '2026-02-31',
        totalFeeCents: 100, plan: 'full', purchasedHours: 1, operatorId: op,
      }),
    ).toThrow(/报名日期/);
  });

  it('缴费日期晚于今天 → recordPayment 拒绝', () => {
    // 再开一笔分期以制造未缴余额：直接给该学员加一期
    db.prepare(`INSERT INTO installments (student_id, seq, due_date, amount_cents) VALUES (?, 5, ?, 10000)`)
      .run(student, addDays(today, 30));
    const r = recordPayment(student, 5, 10000, op, addDays(today, 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('缴费日期');
  });

  it('科目通过日期晚于今天 → setSubjectStatus 抛错', () => {
    expect(() => setSubjectStatus(student, 1, 'passed', addDays(today, 1), op)).toThrow(/通过日期/);
  });

  it('约课日期日历非法 → bad_slot（而非落入冲突/学费逻辑）', () => {
    const r = createBooking({
      studentId: student, instructorId: instructor, vehicleId: vehicle,
      subjectNo: 2, lessonDate: '2026-13-40', startMin: 8 * 60, operatorId: op,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('bad_slot');
  });

  it('约课日期为过去 → bad_slot', () => {
    const r = createBooking({
      studentId: student, instructorId: instructor, vehicleId: vehicle,
      subjectNo: 2, lessonDate: addDays(today, -1), startMin: 8 * 60, operatorId: op,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('bad_slot');
  });

  it('合法的当天约课仍然成功', () => {
    const r = createBooking({
      studentId: student, instructorId: instructor, vehicleId: vehicle,
      subjectNo: 2, lessonDate: today, startMin: 8 * 60, operatorId: op,
    });
    expect(r.ok).toBe(true);
  });
});

describe('数据库 CHECK 兜底（绕过服务层裸 INSERT）', () => {
  const throws = (sql: string, ...p: unknown[]): boolean => {
    try { db.prepare(sql).run(...p); return false; } catch { return true; }
  };

  it('students.enrollment_date 非法日期被硬拒', () => {
    expect(throws(
      `INSERT INTO students (id,name,phone,enrollment_date,expiry_date,total_fee_cents,plan,created_by)
       VALUES (901,'x','139-9001','2026-02-31','2028-01-01',1,'full',?)`, op,
    )).toBe(true);
  });

  it('bookings.lesson_date 非法日期被硬拒', () => {
    expect(throws(
      `INSERT INTO bookings (student_id,instructor_id,vehicle_id,subject_no,lesson_date,start_min,end_min,created_by)
       VALUES (?,?,?,2,'2026-13-01',0,60,?)`, student, instructor, vehicle, op,
    )).toBe(true);
  });

  it('payments.paid_date 年份越界（0000 年）被硬拒', () => {
    const instId = db.prepare(`SELECT id FROM installments WHERE student_id=? AND seq=5`).get(student) as { id: number };
    expect(throws(
      `INSERT INTO payments (student_id,installment_id,amount_cents,paid_date,created_by)
       VALUES (?,?,1,'0000-01-01',?)`, student, instId.id, op,
    )).toBe(true);
  });
});
