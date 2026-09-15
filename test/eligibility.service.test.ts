// 约课资格闸门（有效期 / 课时余额）服务层集成：真实 SQLite 事务。
process.env.DRIVING_SCHOOL_DB = ':memory:';

import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '@/lib/db';
import { createBooking, cancelBooking } from '@/lib/services/booking';
import { completeBooking } from '@/lib/services/lessons';
import { addDays, todayLocal } from '@/lib/date';

const db = getDb();
const today = todayLocal();

let op: number;
let instructor: number;
let vehicle: number;

function mkStudent(name: string, expiry: string, purchasedHours: number): number {
  const id = Number(
    db
      .prepare(
        `INSERT INTO students (name, phone, enrollment_date, expiry_date, total_fee_cents, plan, purchased_hours, created_by)
         VALUES (?, ?, ?, ?, 480000, 'full', ?, ?)`,
      )
      .run(name, `139-${name}`, today, expiry, purchasedHours, op).lastInsertRowid,
  );
  // 一次付清、今天到期且已全额缴清 → 学费闸门永远放行，不干扰资格测试
  const instId = Number(
    db.prepare(`INSERT INTO installments (student_id, seq, due_date, amount_cents) VALUES (?, 1, ?, 480000)`).run(id, today).lastInsertRowid,
  );
  db.prepare(`INSERT INTO payments (student_id, installment_id, amount_cents, paid_date, created_by) VALUES (?, ?, 480000, ?, ?)`)
    .run(id, instId, today, op);
  return id;
}

const book = (studentId: number, dayOffset: number, startMin = 8 * 60) =>
  createBooking({
    studentId, instructorId: instructor, vehicleId: vehicle,
    subjectNo: 2, lessonDate: addDays(today, dayOffset), startMin, operatorId: op,
  });

beforeAll(() => {
  op = Number(db.prepare(`INSERT INTO operators (name, role) VALUES ('前台','front_desk')`).run().lastInsertRowid);
  instructor = Number(db.prepare(`INSERT INTO instructors (name) VALUES ('陈教练')`).run().lastInsertRowid);
  vehicle = Number(db.prepare(`INSERT INTO vehicles (plate, model) VALUES ('测A001','捷达')`).run().lastInsertRowid);
  db.prepare(`INSERT INTO instructor_vehicles (instructor_id, vehicle_id) VALUES (?, ?)`).run(instructor, vehicle);
});

describe('约课资格闸门：两年有效期', () => {
  it('有效期已过期的学员约今天 → validity_expired', () => {
    const s = mkStudent('过期学员', addDays(today, -1), 20);
    const r = book(s, 0);
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === 'eligibility_blocked') expect(r.error.block.reason).toBe('validity_expired');
    else throw new Error('应被有效期闸门拦截');
  });

  it('上课日晚于到期日 → 拦截；到期日当天仍可约', () => {
    const s = mkStudent('即将到期', addDays(today, 5), 20);
    const beyond = book(s, 6);
    expect(beyond.ok).toBe(false);
    if (!beyond.ok && beyond.error.code === 'eligibility_blocked') {
      expect(beyond.error.block.reason).toBe('validity_expired');
    } else throw new Error('晚于到期日应拦截');

    const onDueDay = book(s, 5);
    expect(onDueDay.ok).toBe(true);
  });
});

describe('约课资格闸门：课时余额（消课+已约占用）', () => {
  it('只买 1 课时：第一单成功，再约第二单（换日期）→ hours_exhausted', () => {
    const s = mkStudent('一课时', addDays(today, 365), 1);
    expect(book(s, 10).ok).toBe(true);
    const second = book(s, 11);
    expect(second.ok).toBe(false);
    if (!second.ok && second.error.code === 'eligibility_blocked') {
      expect(second.error.block.reason).toBe('hours_exhausted');
    } else throw new Error('第二单应被课时闸门拦截');
  });

  it('取消已约单后释放占用，可再次约课', () => {
    const s = mkStudent('取消释放', addDays(today, 365), 1);
    const first = book(s, 12);
    expect(first.ok).toBe(true);
    if (first.ok) expect(cancelBooking(first.bookingId, op, '临时有事')).toBe(true);
    expect(book(s, 13).ok).toBe(true);
  });

  it('消课后占用按已消计算：买 1 课时，消课后再约 → 拦', () => {
    const s = mkStudent('消课耗尽', addDays(today, 365), 1);
    const r = book(s, 14);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(completeBooking(r.bookingId, op).ok).toBe(true);
    }
    const again = book(s, 15);
    expect(again.ok).toBe(false);
    if (!again.ok && again.error.code === 'eligibility_blocked') {
      expect(again.error.block.reason).toBe('hours_exhausted');
    } else throw new Error('消课耗尽后应拦截');
  });

  it('买 2 课时：已消 1 + 已约 1 占满，第三单（再约）拦', () => {
    const s = mkStudent('两课时', addDays(today, 365), 2);
    const first = book(s, 20);
    expect(first.ok).toBe(true);
    if (first.ok) expect(completeBooking(first.bookingId, op).ok).toBe(true); // 消 1
    expect(book(s, 21).ok).toBe(true); // 已约 1，合计 2，放行
    const third = book(s, 22); // 合计 3 > 2
    expect(third.ok).toBe(false);
    if (!third.ok && third.error.code === 'eligibility_blocked') {
      expect(third.error.block.reason).toBe('hours_exhausted');
    } else throw new Error('超出购买课时应拦截');
  });
});
