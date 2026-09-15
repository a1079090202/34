// 迁移测试：手工搭一套「没有日期守卫」的旧 schema（含不参与重建的 lesson_ledger），
// 灌入合法数据后跑 migrateDateGuards，断言表重建安全、守卫生效、外键/UNIQUE/索引完好、幂等。
process.env.DRIVING_SCHOOL_DB = ':memory:';

import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { migrateDateGuards } from '@/lib/migrate';
import { DATE_GUARD_MARKER } from '@/lib/schema';

// 旧版建表 DDL：日期列是裸 TEXT（无 /*dg1*/ 守卫），其余约束与现网一致。
const OLD_SCHEMA = `
CREATE TABLE operators (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE students (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE,
  enrollment_date TEXT NOT NULL, expiry_date TEXT NOT NULL,
  total_fee_cents INTEGER NOT NULL, plan TEXT NOT NULL, purchased_hours INTEGER NOT NULL DEFAULT 0,
  note TEXT DEFAULT '', created_by INTEGER NOT NULL REFERENCES operators(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_students_expiry ON students(expiry_date);
CREATE TABLE subject_records (
  id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_no INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  passed_date TEXT, updated_by INTEGER REFERENCES operators(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), UNIQUE (student_id, subject_no)
);
CREATE TABLE instructors (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE vehicles (id INTEGER PRIMARY KEY, plate TEXT NOT NULL UNIQUE, model TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE instructor_vehicles (
  instructor_id INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, PRIMARY KEY (instructor_id, vehicle_id)
);
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id),
  instructor_id INTEGER NOT NULL REFERENCES instructors(id), vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  subject_no INTEGER NOT NULL, lesson_date TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked', created_by INTEGER NOT NULL REFERENCES operators(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  completed_by INTEGER, completed_at TEXT, cancelled_by INTEGER, cancelled_at TEXT, cancel_reason TEXT DEFAULT '',
  CHECK (end_min > start_min)
);
CREATE INDEX idx_bookings_date ON bookings(lesson_date);
CREATE INDEX idx_bookings_student ON bookings(student_id, lesson_date);
CREATE INDEX idx_bookings_instructor ON bookings(instructor_id, lesson_date);
CREATE INDEX idx_bookings_vehicle ON bookings(vehicle_id, lesson_date);
CREATE TABLE coaching_logs (
  id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  student_id INTEGER NOT NULL REFERENCES students(id), instructor_id INTEGER NOT NULL REFERENCES instructors(id),
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id), subject_no INTEGER NOT NULL,
  lesson_date TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
  completed_by INTEGER NOT NULL REFERENCES operators(id),
  completed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_coaching_instructor_date ON coaching_logs(instructor_id, lesson_date);
-- 关键：lesson_ledger 无日期列，不参与重建；迁移不能改坏它对 students/bookings 的外键
CREATE TABLE lesson_ledger (
  id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id),
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id), delta_hours INTEGER NOT NULL,
  reason TEXT NOT NULL, operator_id INTEGER NOT NULL REFERENCES operators(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_lesson_ledger_student ON lesson_ledger(student_id);
CREATE TABLE installments (
  id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL, due_date TEXT NOT NULL, amount_cents INTEGER NOT NULL, UNIQUE (student_id, seq)
);
CREATE INDEX idx_installments_due ON installments(due_date);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id),
  installment_id INTEGER NOT NULL REFERENCES installments(id), amount_cents INTEGER NOT NULL,
  paid_date TEXT NOT NULL, created_by INTEGER NOT NULL REFERENCES operators(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), note TEXT DEFAULT ''
);
CREATE INDEX idx_payments_student ON payments(student_id);
`;

function buildOldDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(OLD_SCHEMA);
  db.exec(`
    INSERT INTO operators (id,name,role) VALUES (1,'前台','front_desk');
    INSERT INTO instructors (id,name) VALUES (1,'陈教练');
    INSERT INTO vehicles (id,plate) VALUES (1,'京A001学');
    INSERT INTO instructor_vehicles VALUES (1,1);
    INSERT INTO students (id,name,phone,enrollment_date,expiry_date,total_fee_cents,plan,purchased_hours,created_by)
      VALUES (1,'学员','139-0001','2026-01-01','2028-01-01',480000,'installments',20,1);
    INSERT INTO subject_records (id,student_id,subject_no,status,passed_date,updated_by) VALUES (1,1,1,'passed','2026-02-10',1);
    INSERT INTO subject_records (id,student_id,subject_no,status,passed_date,updated_by) VALUES (2,1,2,'pending',NULL,1);
    INSERT INTO bookings (id,student_id,instructor_id,vehicle_id,subject_no,lesson_date,start_min,end_min,created_by)
      VALUES (1,1,1,1,2,'2026-09-20',480,540,1);
    INSERT INTO coaching_logs (id,booking_id,student_id,instructor_id,vehicle_id,subject_no,lesson_date,start_min,end_min,completed_by)
      VALUES (1,1,1,1,1,2,'2026-09-20',480,540,1);
    INSERT INTO lesson_ledger (id,student_id,booking_id,delta_hours,reason,operator_id) VALUES (1,1,1,-1,'上课消课',1);
    INSERT INTO installments (id,student_id,seq,due_date,amount_cents) VALUES (1,1,1,'2026-01-01',160000);
    INSERT INTO payments (id,student_id,installment_id,amount_cents,paid_date,created_by) VALUES (1,1,1,160000,'2026-01-02',1);
  `);
  return db;
}

let db: Database.Database;

beforeAll(() => {
  db = buildOldDb();
  migrateDateGuards(db);
});

const rejects = (sql: string, params: unknown[] = []): boolean => {
  try {
    db.prepare(sql).run(...params);
    return false;
  } catch {
    return true;
  }
};

describe('日期守卫表重建迁移', () => {
  it('迁移后 user_version=1 且每张表 DDL 含守卫标记', () => {
    expect(Number(db.pragma('user_version', { simple: true }))).toBe(1);
    for (const t of ['students', 'subject_records', 'bookings', 'installments', 'payments', 'coaching_logs']) {
      const sql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(t) as { sql: string };
      expect(sql.sql).toContain(DATE_GUARD_MARKER);
    }
  });

  it('数据行数与主键完整保留', () => {
    expect((db.prepare('SELECT COUNT(*) n FROM students').get() as { n: number }).n).toBe(1);
    expect((db.prepare('SELECT COUNT(*) n FROM subject_records').get() as { n: number }).n).toBe(2);
    expect((db.prepare('SELECT COUNT(*) n FROM bookings').get() as { n: number }).n).toBe(1);
    expect((db.prepare('SELECT COUNT(*) n FROM coaching_logs').get() as { n: number }).n).toBe(1);
    expect((db.prepare('SELECT COUNT(*) n FROM lesson_ledger').get() as { n: number }).n).toBe(1);
    expect((db.prepare('SELECT COUNT(*) n FROM installments').get() as { n: number }).n).toBe(1);
    expect((db.prepare('SELECT COUNT(*) n FROM payments').get() as { n: number }).n).toBe(1);
    const row = db.prepare('SELECT enrollment_date, expiry_date FROM students WHERE id=1').get() as {
      enrollment_date: string;
      expiry_date: string;
    };
    expect(row).toEqual({ enrollment_date: '2026-01-01', expiry_date: '2028-01-01' });
  });

  it('非空日期列：非法/越界日期被 CHECK 硬拒', () => {
    expect(rejects(`INSERT INTO students (id,name,phone,enrollment_date,expiry_date,total_fee_cents,plan,created_by)
      VALUES (2,'x','139-0002','2026-02-31','2028-01-01',1,'full',1)`)).toBe(true);
    expect(rejects(`INSERT INTO bookings (id,student_id,instructor_id,vehicle_id,subject_no,lesson_date,start_min,end_min,created_by)
      VALUES (2,1,1,1,2,'2026-13-01',480,540,1)`)).toBe(true);
    expect(rejects(`INSERT INTO bookings (id,student_id,instructor_id,vehicle_id,subject_no,lesson_date,start_min,end_min,created_by)
      VALUES (3,1,1,1,2,'0000-01-01',480,540,1)`)).toBe(true);
    expect(rejects(`INSERT INTO installments (id,student_id,seq,due_date,amount_cents) VALUES (2,1,2,'2026-00-15',1)`)).toBe(true);
    expect(rejects(`INSERT INTO payments (id,student_id,installment_id,amount_cents,paid_date,created_by)
      VALUES (2,1,1,1,'2026-09-31',1)`)).toBe(true);
  });

  it('可空列 passed_date：NULL 放行，非法非空日期拒绝', () => {
    expect(rejects(`INSERT INTO subject_records (id,student_id,subject_no,status,passed_date,updated_by)
      VALUES (3,1,3,'pending',NULL,1)`)).toBe(false);
    expect(rejects(`INSERT INTO subject_records (id,student_id,subject_no,status,passed_date,updated_by)
      VALUES (4,1,4,'passed','2026-13-01',1)`)).toBe(true);
  });

  it('未重建的 lesson_ledger 外键仍然强制（迁移未改坏引用）', () => {
    expect(rejects(`INSERT INTO lesson_ledger (id,student_id,booking_id,delta_hours,reason,operator_id)
      VALUES (2,999,999,-1,'x',1)`)).toBe(true);
    // 既有那行的引用仍有效
    const fk = db.prepare('PRAGMA foreign_key_check').all();
    expect(fk.length).toBe(0);
  });

  it('UNIQUE 与显式索引仍在', () => {
    expect(rejects(`INSERT INTO installments (id,student_id,seq,due_date,amount_cents) VALUES (3,1,1,'2026-05-01',1)`)).toBe(true);
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    const names = idx.map((r) => r.name);
    for (const want of ['idx_bookings_date', 'idx_students_expiry', 'idx_installments_due', 'idx_payments_student', 'idx_lesson_ledger_student']) {
      expect(names).toContain(want);
    }
  });

  it('再迁移一次幂等（不重建、不报错）', () => {
    expect(() => migrateDateGuards(db)).not.toThrow();
    expect((db.prepare('SELECT COUNT(*) n FROM students').get() as { n: number }).n).toBe(1);
  });
});
