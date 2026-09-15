// 全部金额以「分」为单位存整数；课时以「个」为单位（1 课时 = 60 分钟）。
// 日期一律存本地日期字符串 YYYY-MM-DD，不做时区换算。
export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS operators (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('front_desk', 'instructor', 'admin')),
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS students (
  id                INTEGER PRIMARY KEY,
  name              TEXT NOT NULL,
  phone             TEXT NOT NULL UNIQUE,
  enrollment_date   TEXT NOT NULL,           -- 报名建档日 YYYY-MM-DD
  expiry_date       TEXT NOT NULL,           -- 两年有效期到期日
  total_fee_cents   INTEGER NOT NULL CHECK (total_fee_cents >= 0),
  plan              TEXT NOT NULL CHECK (plan IN ('full', 'installments')),
  purchased_hours   INTEGER NOT NULL DEFAULT 0,  -- 购买总课时
  note              TEXT DEFAULT '',
  created_by        INTEGER NOT NULL REFERENCES operators(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_students_expiry ON students(expiry_date);

-- 科目一~科目四通过状态
CREATE TABLE IF NOT EXISTS subject_records (
  id           INTEGER PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_no   INTEGER NOT NULL CHECK (subject_no BETWEEN 1 AND 4),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed')),
  passed_date  TEXT,
  updated_by   INTEGER REFERENCES operators(id),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (student_id, subject_no)
);

CREATE TABLE IF NOT EXISTS instructors (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  phone  TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vehicles (
  id     INTEGER PRIMARY KEY,
  plate  TEXT NOT NULL UNIQUE,
  model  TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

-- 教练-车辆绑定（一名教练可绑多台车）
CREATE TABLE IF NOT EXISTS instructor_vehicles (
  instructor_id INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  PRIMARY KEY (instructor_id, vehicle_id)
);

-- 约课记录（一台车/一名教练同一时段只能有一条非取消单，由服务层事务校验）
CREATE TABLE IF NOT EXISTS bookings (
  id            INTEGER PRIMARY KEY,
  student_id    INTEGER NOT NULL REFERENCES students(id),
  instructor_id INTEGER NOT NULL REFERENCES instructors(id),
  vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id),
  subject_no    INTEGER NOT NULL CHECK (subject_no BETWEEN 2 AND 3), -- 实操课：科二/科三
  lesson_date   TEXT NOT NULL,                 -- 本地日期 YYYY-MM-DD
  start_min     INTEGER NOT NULL,              -- 当日起始分钟 0-1439
  end_min       INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'booked'
                CHECK (status IN ('booked', 'completed', 'cancelled')),
  created_by    INTEGER NOT NULL REFERENCES operators(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  completed_by  INTEGER REFERENCES operators(id),
  completed_at  TEXT,
  cancelled_by  INTEGER REFERENCES operators(id),
  cancelled_at  TEXT,
  cancel_reason TEXT DEFAULT '',
  CHECK (end_min > start_min)
);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(lesson_date);
CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings(student_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_bookings_instructor ON bookings(instructor_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle ON bookings(vehicle_id, lesson_date);

-- 消课后自动生成的教练带教记录
CREATE TABLE IF NOT EXISTS coaching_logs (
  id            INTEGER PRIMARY KEY,
  booking_id    INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  student_id    INTEGER NOT NULL REFERENCES students(id),
  instructor_id INTEGER NOT NULL REFERENCES instructors(id),
  vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id),
  subject_no    INTEGER NOT NULL,
  lesson_date   TEXT NOT NULL,
  start_min     INTEGER NOT NULL,
  end_min       INTEGER NOT NULL,
  completed_by  INTEGER NOT NULL REFERENCES operators(id),
  completed_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_coaching_instructor_date ON coaching_logs(instructor_id, lesson_date);

-- 学员课时账：消课记一笔 -1
CREATE TABLE IF NOT EXISTS lesson_ledger (
  id          INTEGER PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES students(id),
  booking_id  INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  delta_hours INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  operator_id INTEGER NOT NULL REFERENCES operators(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_lesson_ledger_student ON lesson_ledger(student_id);

-- 学费分期：full 计划只有 1 期；installments 有 3 期，每期有应缴日
CREATE TABLE IF NOT EXISTS installments (
  id           INTEGER PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL CHECK (seq >= 1),
  due_date     TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  UNIQUE (student_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_installments_due ON installments(due_date);

CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY,
  student_id     INTEGER NOT NULL REFERENCES students(id),
  installment_id INTEGER NOT NULL REFERENCES installments(id),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_date      TEXT NOT NULL,
  created_by     INTEGER NOT NULL REFERENCES operators(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  note           TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
`;
