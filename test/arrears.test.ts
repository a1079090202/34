// 欠费报表必须是「截至月末」的时点快照：之后月份的补缴不能冲减历史月末欠费。
process.env.DRIVING_SCHOOL_DB = ':memory:';

import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '@/lib/db';
import { arrearsCsv } from '@/lib/services/reports';

const db = getDb();

// 简单 CSV 解析（本用例数据无逗号/引号/换行）；返回去掉 BOM 后的二维数组
function parseCsv(csv: string): string[][] {
  return csv
    .replace(/^﻿/, '')
    .trim()
    .split('\r\n')
    .map((line) => line.split(','));}

function rowsFor(csv: string, phone: string) {
  const [, ...data] = parseCsv(csv);
  return data
    .filter((r) => r[2] === phone)
    .map((r) => ({ seq: Number(r[3]), due: r[4], amount: Number(r[5]), paid: Number(r[6]), owe: Number(r[7]) }));
}

beforeAll(() => {
  const op = Number(db.prepare(`INSERT INTO operators (name, role) VALUES ('前台','front_desk')`).run().lastInsertRowid);

  const mkStudent = (name: string, phone: string) =>
    Number(
      db
        .prepare(
          `INSERT INTO students (name, phone, enrollment_date, expiry_date, total_fee_cents, plan, purchased_hours, created_by)
           VALUES (?, ?, '2026-06-01', '2028-06-01', 480000, 'installments', 20, ?)`,
        )
        .run(name, phone, op).lastInsertRowid,
    );

  // 学员 A：二期应缴日 7/15，7 月一分未缴，8/10 才全额补缴
  const a = mkStudent('晚缴学员', '139-1001');
  const aInst = Number(
    db.prepare(`INSERT INTO installments (student_id, seq, due_date, amount_cents) VALUES (?, 2, '2026-07-15', 160000)`)
      .run(a).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO payments (student_id, installment_id, amount_cents, paid_date, created_by) VALUES (?, ?, 160000, '2026-08-10', ?)`,
  ).run(a, aInst, op);

  // 学员 B：应缴日 7/10，7/20 部分缴 60000，8/05 补齐剩余 100000
  const b = mkStudent('部分补缴', '139-1002');
  const bInst = Number(
    db.prepare(`INSERT INTO installments (student_id, seq, due_date, amount_cents) VALUES (?, 1, '2026-07-10', 160000)`)
      .run(b).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO payments (student_id, installment_id, amount_cents, paid_date, created_by) VALUES (?, ?, 60000, '2026-07-20', ?)`,
  ).run(b, bInst, op);
  db.prepare(
    `INSERT INTO payments (student_id, installment_id, amount_cents, paid_date, created_by) VALUES (?, ?, 100000, '2026-08-05', ?)`,
  ).run(b, bInst, op);

  // 学员 C：6 月应缴、6 月已缴清——7 月报表里不应出现
  const c = mkStudent('已结清', '139-1003');
  const cInst = Number(
    db.prepare(`INSERT INTO installments (student_id, seq, due_date, amount_cents) VALUES (?, 1, '2026-06-10', 160000)`)
      .run(c).lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO payments (student_id, installment_id, amount_cents, paid_date, created_by) VALUES (?, ?, 160000, '2026-06-20', ?)`,
  ).run(c, cInst, op);
});

describe('欠费报表时点口径（历史月份可复现）', () => {
  it('7 月报表：8 月才补缴的 A，截至 7/31 仍全额欠费 160000', () => {
    const rows = rowsFor(arrearsCsv('2026-07'), '139-1001');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seq: 2, amount: 160000, paid: 0, owe: 160000 });
  });

  it('7 月报表：B 只计入 7/20 的部分缴款，欠 100000（8/05 的补款不计入）', () => {
    const rows = rowsFor(arrearsCsv('2026-07'), '139-1002');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ paid: 60000, owe: 100000 });
  });

  it('7 月报表：6 月已结清的 C 不出现', () => {
    expect(rowsFor(arrearsCsv('2026-07'), '139-1003')).toHaveLength(0);
  });

  it('8 月报表：A、B 当月已缴清，均不再出现', () => {
    const csv = arrearsCsv('2026-08');
    expect(rowsFor(csv, '139-1001')).toHaveLength(0);
    expect(rowsFor(csv, '139-1002')).toHaveLength(0);
  });

  it('可复现性：同一份历史月份（2026-07）重复导出结果逐字节一致', () => {
    expect(arrearsCsv('2026-07')).toBe(arrearsCsv('2026-07'));
  });
});
