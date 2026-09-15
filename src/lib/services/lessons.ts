import { getDb } from '../db';

export type CompleteResult =
  | { ok: true; bookingId: number }
  | { ok: false; message: string };

/**
 * 消课：把 booked 的约课置为 completed，
 * 学员课时账记 -1（lesson_ledger），教练带教记录自动生成（coaching_logs）。
 * 一个事务完成，全部带操作人。
 */
export function completeBooking(bookingId: number, operatorId: number): CompleteResult {
  const db = getDb();
  return db.transaction((): CompleteResult => {
    const b = db
      .prepare(`SELECT * FROM bookings WHERE id = ?`)
      .get(bookingId) as
      | {
          id: number;
          student_id: number;
          instructor_id: number;
          vehicle_id: number;
          subject_no: number;
          lesson_date: string;
          start_min: number;
          end_min: number;
          status: 'booked' | 'completed' | 'cancelled';
        }
      | undefined;

    if (!b) return { ok: false, message: '约课记录不存在' };
    if (b.status === 'cancelled') return { ok: false, message: '该约课已取消，不能消课' };
    if (b.status === 'completed') return { ok: false, message: '该约课已消课，请勿重复操作' };

    db.prepare(
      `UPDATE bookings
         SET status = 'completed', completed_by = ?, completed_at = datetime('now','localtime')
       WHERE id = ?`,
    ).run(operatorId, bookingId);

    db.prepare(
      `INSERT INTO lesson_ledger (student_id, booking_id, delta_hours, reason, operator_id)
       VALUES (?, ?, -1, '上课消课', ?)`,
    ).run(b.student_id, bookingId, operatorId);

    db.prepare(
      `INSERT INTO coaching_logs
         (booking_id, student_id, instructor_id, vehicle_id, subject_no, lesson_date, start_min, end_min, completed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      bookingId,
      b.student_id,
      b.instructor_id,
      b.vehicle_id,
      b.subject_no,
      b.lesson_date,
      b.start_min,
      b.end_min,
      operatorId,
    );

    return { ok: true, bookingId };
  })();
}
