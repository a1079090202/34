// 全部金额以「分」为单位存整数；课时以「个」为单位（1 课时 = 60 分钟）。
// 日期一律存本地日期字符串 YYYY-MM-DD，不做时区换算。
//
// 日期列一律带 CHECK 守卫（日历真实存在 + 年份 1900-2100），纵深防御非法日期入库：
//   - 非空列：CHECK (date(c) IS c AND c BETWEEN ...)
//   - 可空列：CHECK (c IS NULL OR (...))
// 关键：相等判断必须用 IS 不能用 = —— date('2026-13-01') 返回 NULL，
// 用 = 时表达式为 NULL 会被 CHECK 当「通过」放行；IS 才会得到 false。
// 守卫里的 /*dg1*/ 标记会随建表 SQL 存进 sqlite_master，供迁移幂等检测。

const DATE_MIN = `'1900-01-01'`;
const DATE_MAX = `'2100-12-31'`;
export const DATE_GUARD_MARKER = '/*dg1*/';

/** 非空日期列守卫 */
function dg(col: string): string {
  return `CHECK (date(${col}) IS ${col} AND ${col} BETWEEN ${DATE_MIN} AND ${DATE_MAX}) ${DATE_GUARD_MARKER}`;
}

/** 可空日期列守卫：NULL 放行，非空则必须是真实日期 */
function ndg(col: string): string {
  return `CHECK (${col} IS NULL OR (date(${col}) IS ${col} AND ${col} BETWEEN ${DATE_MIN} AND ${DATE_MAX})) ${DATE_GUARD_MARKER}`;
}

export interface TableDef {
  name: string;
  /** 列 + 约束体；fresh 建表与重建迁移共用，杜绝两处 schema 漂移 */
  body: string;
  /** 显式索引的完整 DDL（UNIQUE 自动索引随建表自动重建，不列在这里） */
  indexes: string[];
  /** 是否含日期守卫、参与表重建迁移 */
  guarded: boolean;
  /** INSERT ... SELECT 拷贝时使用的显式列名（重建迁移用，避免 SELECT * 漂移） */
  columns: string[];
}

export const TABLES: TableDef[] = [
  {
    name: 'operators',
    guarded: false,
    columns: ['id', 'name', 'role', 'active', 'created_at'],
    indexes: [],
    body: `
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('front_desk', 'instructor', 'admin')),
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
`.trim(),
  },
  {
    name: 'students',
    guarded: true,
    columns: [
      'id', 'name', 'phone', 'enrollment_date', 'expiry_date', 'total_fee_cents',
      'plan', 'purchased_hours', 'note', 'created_by', 'created_at',
    ],
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_students_expiry ON students(expiry_date)',
    ],
    body: `
  id                INTEGER PRIMARY KEY,
  name              TEXT NOT NULL,
  phone             TEXT NOT NULL UNIQUE,
  enrollment_date   TEXT NOT NULL ${dg('enrollment_date')},
  expiry_date       TEXT NOT NULL ${dg('expiry_date')},  -- 两年有效期到期日
  total_fee_cents   INTEGER NOT NULL CHECK (total_fee_cents >= 0),
  plan              TEXT NOT NULL CHECK (plan IN ('full', 'installments')),
  purchased_hours   INTEGER NOT NULL DEFAULT 0,  -- 购买总课时
  note              TEXT DEFAULT '',
  created_by        INTEGER NOT NULL REFERENCES operators(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
`.trim(),
  },
  {
    name: 'subject_records',
    guarded: true,
    columns: ['id', 'student_id', 'subject_no', 'status', 'passed_date', 'updated_by', 'updated_at'],
    indexes: [],
    body: `
  id           INTEGER PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_no   INTEGER NOT NULL CHECK (subject_no BETWEEN 1 AND 4),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed')),
  passed_date  TEXT ${ndg('passed_date')},
  updated_by   INTEGER REFERENCES operators(id),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (student_id, subject_no)
`.trim(),
  },
  {
    name: 'instructors',
    guarded: false,
    columns: ['id', 'name', 'phone', 'active'],
    indexes: [],
    body: `
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  phone  TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
`.trim(),
  },
  {
    name: 'vehicles',
    guarded: false,
    columns: ['id', 'plate', 'model', 'active'],
    indexes: [],
    body: `
  id     INTEGER PRIMARY KEY,
  plate  TEXT NOT NULL UNIQUE,
  model  TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
`.trim(),
  },
  {
    name: 'instructor_vehicles',
    guarded: false,
    columns: ['instructor_id', 'vehicle_id'],
    indexes: [],
    body: `
  instructor_id INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  PRIMARY KEY (instructor_id, vehicle_id)
`.trim(),
  },
  {
    name: 'bookings',
    guarded: true,
    columns: [
      'id', 'student_id', 'instructor_id', 'vehicle_id', 'subject_no', 'lesson_date',
      'start_min', 'end_min', 'status', 'created_by', 'created_at', 'completed_by',
      'completed_at', 'cancelled_by', 'cancelled_at', 'cancel_reason',
    ],
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(lesson_date)',
      'CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings(student_id, lesson_date)',
      'CREATE INDEX IF NOT EXISTS idx_bookings_instructor ON bookings(instructor_id, lesson_date)',
      'CREATE INDEX IF NOT EXISTS idx_bookings_vehicle ON bookings(vehicle_id, lesson_date)',
    ],
    body: `
  id            INTEGER PRIMARY KEY,
  student_id    INTEGER NOT NULL REFERENCES students(id),
  instructor_id INTEGER NOT NULL REFERENCES instructors(id),
  vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id),
  subject_no    INTEGER NOT NULL CHECK (subject_no BETWEEN 2 AND 3), -- 实操课：科二/科三
  lesson_date   TEXT NOT NULL ${dg('lesson_date')}, -- 本地日期 YYYY-MM-DD
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
`.trim(),
  },
  {
    name: 'coaching_logs',
    guarded: true,
    columns: [
      'id', 'booking_id', 'student_id', 'instructor_id', 'vehicle_id', 'subject_no',
      'lesson_date', 'start_min', 'end_min', 'completed_by', 'completed_at',
    ],
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_coaching_instructor_date ON coaching_logs(instructor_id, lesson_date)',
    ],
    body: `
  id            INTEGER PRIMARY KEY,
  booking_id    INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  student_id    INTEGER NOT NULL REFERENCES students(id),
  instructor_id INTEGER NOT NULL REFERENCES instructors(id),
  vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id),
  subject_no    INTEGER NOT NULL,
  lesson_date   TEXT NOT NULL ${dg('lesson_date')},
  start_min     INTEGER NOT NULL,
  end_min       INTEGER NOT NULL,
  completed_by  INTEGER NOT NULL REFERENCES operators(id),
  completed_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
`.trim(),
  },
  {
    name: 'lesson_ledger',
    guarded: false,
    columns: ['id', 'student_id', 'booking_id', 'delta_hours', 'reason', 'operator_id', 'created_at'],
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_lesson_ledger_student ON lesson_ledger(student_id)',
    ],
    body: `
  id          INTEGER PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES students(id),
  booking_id  INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  delta_hours INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  operator_id INTEGER NOT NULL REFERENCES operators(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
`.trim(),
  },
  {
    name: 'installments',
    guarded: true,
    columns: ['id', 'student_id', 'seq', 'due_date', 'amount_cents'],
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_installments_due ON installments(due_date)',
    ],
    body: `
  id           INTEGER PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL CHECK (seq >= 1),
  due_date     TEXT NOT NULL ${dg('due_date')},
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  UNIQUE (student_id, seq)
`.trim(),
  },
  {
    name: 'payments',
    guarded: true,
    columns: [
      'id', 'student_id', 'installment_id', 'amount_cents', 'paid_date',
      'created_by', 'created_at', 'note',
    ],
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id)',
    ],
    body: `
  id             INTEGER PRIMARY KEY,
  student_id     INTEGER NOT NULL REFERENCES students(id),
  installment_id INTEGER NOT NULL REFERENCES installments(id),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_date      TEXT NOT NULL ${dg('paid_date')},
  created_by     INTEGER NOT NULL REFERENCES operators(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  note           TEXT DEFAULT ''
`.trim(),
  },
];

/** 建表语句：fresh 用 IF NOT EXISTS；重建迁移用 {name}_new 名（见 migrate.ts） */
export function createTableSql(name: string, body: string, ifNotExists: boolean): string {
  return `CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${name} (\n${body}\n)`;
}

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

${TABLES.map((t) => createTableSql(t.name, t.body, true)).join(';\n\n')};

${TABLES.flatMap((t) => t.indexes).join(';\n')};
`.trimStart();

/**
 * 表重建顺序（父表在前）。只含带日期守卫、需要从旧 schema 迁移的表。
 * lesson_ledger 无日期列，不重建——现代重建顺序（先建 _new、拷数据、
 * 最后统一 DROP+RENAME）不会改写它对 students/bookings 的外键引用。
 */
export const DATE_GUARD_TABLES: TableDef[] = TABLES.filter((t) => t.guarded);
