// 服务层集成测试：临时内存库，走真实 SQL 事务。
// 必须在导入 db 模块前指定内存库路径。
process.env.DRIVING_SCHOOL_DB = ':memory:';

import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '@/lib/db';
import { createBooking } from '@/lib/services/booking';
import { completeBooking } from '@/lib/services/lessons';
import { recordPayment } from '@/lib/services/payments';
import { addDays, todayLocal } from '@/lib/date';

const db = getDb();
const today = todayLocal();

function setup() {
  const op = Number(db.prepare(`INSERT INTO operators (name, role) VALUES ('测试前台','front_desk')`).run().lastInsertRowid);
  const i1 = Number(db.prepare(`INSERT INTO instructors (name) VALUES ('陈教练')`).run().lastInsertRowid);
  const i2 = Number(db.prepare(`INSERT INTO instructors (name) VALUES ('刘教练')`).run().lastInsertRowid);
  const v1 = Number(db.prepare(`INSERT INTO vehicles (plate, model) VALUES ('测A001','捷达')`).run().lastInsertRowid);
  const v2 = Number(db.prepare(`INSERT INTO vehicles (plate, model) VALUES ('测A002','捷达')`).run().lastInsertRowid);
  db.prepare(`INSERT INTO instructor_vehicles (instructor_id, vehicle_id) VALUES (?, ?)`).run(i1, v1);
  db.prepare(`INSERT INTO instructor_vehicles (instructor_id, vehicle_id) VALUES (?, ?)`).run(i2, v2);
  db.prepare(`INSERT INTO instructor_vehicles (instructor_id, vehicle_id) VALUES (?, ?)`).run(i2, v1);

  const mkStudent = (name: string) =>
    Number(
      db
        .prepare(
          `INSERT INTO students (name, phone, enrollment_date, expiry_date, total_fee_cents, plan, purchased_hours, created_by)
           VALUES (?, ?, ?, ?, 480000, 'installments', 20, ?)`,
        )
        .run(name, `139-${name}`, addDays(today, -100), addDays(today, 630), op)
        .lastInsertRowid,
    );

  // 三期：一期已逾期且缴清、二期逾期未缴、三期未到期
  const mkInstallments = (sid: number, secondPaid: boolean) => {
    const rows: [number, string, number][] = [
      [1, addDays(today, -90), 160000],
      [2, addDays(today, -45), 160000],
      [3, addDays(today, 45), 160000],
    ];
    for (const [seq, due, amount] of rows) {
      const iid = Number(
        db.prepare(`INSERT INTO installments (student_id, seq, due_date, amount_cents) VALUES (?, ?, ?, ?)`).run(sid, seq, due, amount).lastInsertRowid,
      );
      const needPaid = seq === 1 || (seq === 2 && secondPaid);
      if (needPaid) {
        db.prepare(`INSERT INTO payments (student_id, installment_id, amount_cents, paid_date, created_by) VALUES (?, ?, ?, ?, ?)`)
          .run(sid, iid, amount, addDays(today, -80), op);
      }
    }
  };

  const overdue = mkStudent('逾期学员');
  const good = mkStudent('正常学员');
  mkInstallments(overdue, false);
  mkInstallments(good, true);

  return { op, i1, i2, v1, v2, overdue, good };
}

let ctx: ReturnType<typeof setup>;

beforeAll(() => {
  ctx = setup();
});

describe('约课服务（真实数据库 + 事务）', () => {
  it('验收1：二期逾期未缴的学员约课 → tuition_blocked，写明卡在二期', () => {
    const r = createBooking({
      studentId: ctx.overdue, instructorId: ctx.i1, vehicleId: ctx.v1,
      subjectNo: 2, lessonDate: today, startMin: 8 * 60, operatorId: ctx.op,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('tuition_blocked');
    if (r.error.code === 'tuition_blocked') {
      expect(r.error.block.seq).toBe(2);
      expect(r.error.block.arrearsCents).toBe(160000);
    }
    // 被拦的单子没有落库
    const cnt = db.prepare(`SELECT COUNT(*) c FROM bookings WHERE student_id = ?`).get(ctx.overdue) as { c: number };
    expect(cnt.c).toBe(0);
  });

  it('逾期学员补交二期后可以约课', () => {
    const inst = db.prepare(`SELECT id FROM installments WHERE student_id = ? AND seq = 2`).get(ctx.overdue) as { id: number };
    const pay = recordPayment(ctx.overdue, 2, 160000, ctx.op);
    expect(pay.ok).toBe(true);
    const r = createBooking({
      studentId: ctx.overdue, instructorId: ctx.i1, vehicleId: ctx.v1,
      subjectNo: 2, lessonDate: today, startMin: 8 * 60, operatorId: ctx.op,
    });
    expect(r.ok).toBe(true);
    void inst;
  });

  it('验收2：同教练同时段第二单 → booking_blocked / instructor_busy', () => {
    const r = createBooking({
      studentId: ctx.good, instructorId: ctx.i1, vehicleId: ctx.v1,
      subjectNo: 2, lessonDate: today, startMin: 8 * 60, operatorId: ctx.op,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('booking_blocked');
    if (r.error.code === 'booking_blocked') {
      expect(r.error.block.reason).toBe('instructor_busy');
    }
  });

  it('同车同时段第二单（换教练也不行，一台车同时段只排一人）→ vehicle_busy', () => {
    const r = createBooking({
      studentId: ctx.good, instructorId: ctx.i2, vehicleId: ctx.v1, // v1 同时绑给 i1/i2
      subjectNo: 2, lessonDate: today, startMin: 8 * 60, operatorId: ctx.op,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('booking_blocked');
      if (r.error.code === 'booking_blocked') expect(r.error.block.reason).toBe('vehicle_busy');
    }
  });

  it('验收3：同一学员同一天连续约第三课时 → daily_limit_exceeded', () => {
    const tomorrow = addDays(today, 1);
    const book = (startMin: number, instructorId = ctx.i1, vehicleId = ctx.v1) =>
      createBooking({
        studentId: ctx.good, instructorId, vehicleId,
        subjectNo: 2, lessonDate: tomorrow, startMin, operatorId: ctx.op,
      });

    const first = book(9 * 60);
    expect(first.ok).toBe(true);
    const second = book(11 * 60);
    expect(second.ok).toBe(true);
    const third = book(14 * 60, ctx.i2, ctx.v2); // 换教练换车换时段，仍撞同日上限
    expect(third.ok).toBe(false);
    if (!third.ok && third.error.code === 'booking_blocked') {
      expect(third.error.block.reason).toBe('daily_limit_exceeded');
    }
  });

  it('消课：自动生成带教记录、学员课时账 -1，且不可重复消课', () => {
    const r = createBooking({
      studentId: ctx.good, instructorId: ctx.i1, vehicleId: ctx.v1,
      subjectNo: 3, lessonDate: addDays(today, 3), startMin: 13 * 60, operatorId: ctx.op,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const bookingId = r.bookingId;

    const done = completeBooking(bookingId, ctx.op);
    expect(done.ok).toBe(true);

    const log = db.prepare(`SELECT * FROM coaching_logs WHERE booking_id = ?`).get(bookingId);
    expect(log).toBeTruthy();
    const ledger = db.prepare(`SELECT delta_hours, operator_id FROM lesson_ledger WHERE booking_id = ?`).get(bookingId) as {
      delta_hours: number;
      operator_id: number;
    };
    expect(ledger.delta_hours).toBe(-1);
    expect(ledger.operator_id).toBe(ctx.op);

    const again = completeBooking(bookingId, ctx.op);
    expect(again.ok).toBe(false);
  });

  it('所有写库记录都带操作人', () => {
    const b = db.prepare(`SELECT created_by FROM bookings ORDER BY id LIMIT 1`).get() as { created_by: number };
    expect(b.created_by).toBe(ctx.op);
    const p = db.prepare(`SELECT created_by FROM payments ORDER BY id LIMIT 1`).get() as { created_by: number };
    expect(p.created_by).toBe(ctx.op);
  });
});
