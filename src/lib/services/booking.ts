import type Database from 'better-sqlite3';
import { getDb } from '../db';
import { todayLocal } from '../date';
import {
  checkBookingConflict,
  checkTuitionGate,
  type BookingBlock,
  type ExistingSlot,
  type RequestedSlot,
  type TuitionBlock,
} from '../rules';
import { LESSON_MINUTES } from '../rules/slots';
import { isVehicleBoundToInstructor } from './resources';

export interface BookingInput {
  studentId: number;
  instructorId: number;
  vehicleId: number;
  subjectNo: 2 | 3;
  lessonDate: string;
  startMin: number;
  operatorId: number;
}

export type BookingError =
  | { code: 'not_found'; message: string }
  | { code: 'vehicle_not_bound'; message: string }
  | { code: 'bad_slot'; message: string }
  | { code: 'tuition_blocked'; block: TuitionBlock; message: string }
  | { code: 'booking_blocked'; block: BookingBlock; message: string };

export type BookingResult = { ok: true; bookingId: number } | { ok: false; error: BookingError };

function getInstallments(db: Database.Database, studentId: number) {
  return db
    .prepare(
      `SELECT i.seq, i.due_date AS dueDate, i.amount_cents AS amountCents,
              COALESCE((SELECT SUM(amount_cents) FROM payments p WHERE p.installment_id = i.id), 0) AS paidCents
       FROM installments i WHERE i.student_id = ? ORDER BY i.seq`,
    )
    .all(studentId) as { seq: number; dueDate: string; amountCents: number; paidCents: number }[];
}

function getDaySlots(db: Database.Database, lessonDate: string): ExistingSlot[] {
  const rows = db
    .prepare(
      `SELECT id, student_id AS studentId, instructor_id AS instructorId, vehicle_id AS vehicleId,
              lesson_date AS lessonDate, start_min AS startMin, end_min AS endMin, status
       FROM bookings WHERE lesson_date = ?`,
    )
    .all(lessonDate) as ExistingSlot[];
  return rows;
}

/**
 * 约课核心。规则全部在独立模块里算：
 *   1) 学费闸门 checkTuitionGate（逾期应收未收 → 拦，写明卡在哪一期）
 *   2) 约课冲突/同日上限 checkBookingConflict（教练、车、学员本人）
 * 路由层只做参数校验，金额永远不经过前端计算。
 */
export function createBooking(input: BookingInput, db: Database.Database = getDb()): BookingResult {
  const student = db.prepare(`SELECT id FROM students WHERE id = ?`).get(input.studentId);
  if (!student) {
    return { ok: false, error: { code: 'not_found', message: '学员不存在' } };
  }
  const instructor = db.prepare(`SELECT 1 FROM instructors WHERE id = ? AND active = 1`).get(input.instructorId);
  if (!instructor) {
    return { ok: false, error: { code: 'not_found', message: '教练不存在或已停用' } };
  }
  const vehicle = db.prepare(`SELECT 1 FROM vehicles WHERE id = ? AND active = 1`).get(input.vehicleId);
  if (!vehicle) {
    return { ok: false, error: { code: 'not_found', message: '车辆不存在或已停用' } };
  }
  if (!isVehicleBoundToInstructor(input.instructorId, input.vehicleId, db)) {
    return {
      ok: false,
      error: { code: 'vehicle_not_bound', message: '该车辆未绑定到此教练，请选择教练名下车辆' },
    };
  }
  if (input.startMin < 0 || input.startMin + LESSON_MINUTES > 24 * 60 || input.startMin % 60 !== 0) {
    return { ok: false, error: { code: 'bad_slot', message: '约课时段不合法（整点 1 课时）' } };
  }
  if (input.lessonDate < todayLocal()) {
    return { ok: false, error: { code: 'bad_slot', message: '不能约过去的日期' } };
  }

  const request: RequestedSlot = {
    studentId: input.studentId,
    instructorId: input.instructorId,
    vehicleId: input.vehicleId,
    lessonDate: input.lessonDate,
    startMin: input.startMin,
    endMin: input.startMin + LESSON_MINUTES,
  };

  const result = db.transaction((): BookingResult => {
    // 闸门 1：学费（先查账再看时间，钱的问题优先暴露）
    const tuition = checkTuitionGate(getInstallments(db, input.studentId), todayLocal());
    if (tuition) {
      return { ok: false, error: { code: 'tuition_blocked', block: tuition, message: tuition.message } };
    }

    // 闸门 2：教练/车辆同时段冲突 + 同日两课时上限
    const block = checkBookingConflict(request, getDaySlots(db, input.lessonDate));
    if (block) {
      return { ok: false, error: { code: 'booking_blocked', block, message: block.message } };
    }

    const r = db
      .prepare(
        `INSERT INTO bookings
           (student_id, instructor_id, vehicle_id, subject_no, lesson_date, start_min, end_min, created_by)
         VALUES (@studentId, @instructorId, @vehicleId, @subjectNo, @lessonDate, @startMin, @endMin, @operatorId)`,
      )
      .run({
        studentId: input.studentId,
        instructorId: input.instructorId,
        vehicleId: input.vehicleId,
        subjectNo: input.subjectNo,
        lessonDate: input.lessonDate,
        startMin: input.startMin,
        endMin: request.endMin,
        operatorId: input.operatorId,
      });
    return { ok: true, bookingId: Number(r.lastInsertRowid) };
  })();

  return result;
}

export interface BookingView {
  id: number;
  studentId: number;
  studentName: string;
  instructorId: number;
  instructorName: string;
  vehicleId: number;
  plate: string;
  subjectNo: number;
  lessonDate: string;
  startMin: number;
  endMin: number;
  status: 'booked' | 'completed' | 'cancelled';
}

export function listBookings(from: string, to: string): BookingView[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT b.id, b.student_id AS studentId, s.name AS studentName,
              b.instructor_id AS instructorId, i.name AS instructorName,
              b.vehicle_id AS vehicleId, v.plate,
              b.subject_no AS subjectNo, b.lesson_date AS lessonDate,
              b.start_min AS startMin, b.end_min AS endMin, b.status
       FROM bookings b
       JOIN students s ON s.id = b.student_id
       JOIN instructors i ON i.id = b.instructor_id
       JOIN vehicles v ON v.id = b.vehicle_id
       WHERE b.lesson_date BETWEEN ? AND ? AND b.status != 'cancelled'
       ORDER BY b.lesson_date, b.start_min, b.id`,
    )
    .all(from, to) as BookingView[];
}

export function cancelBooking(bookingId: number, operatorId: number, reason: string): boolean {
  const db = getDb();
  const r = db
    .prepare(
      `UPDATE bookings
         SET status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now','localtime'), cancel_reason = ?
       WHERE id = ? AND status = 'booked'`,
    )
    .run(operatorId, reason, bookingId);
  return r.changes > 0;
}
