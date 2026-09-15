// 规则模块 2：约课冲突 + 同日课时上限。纯函数，输入已有约课数组，输出拦截原因。
// 一台车同一时段只排一人；一名教练同一时段也只能带一人；
// 学员同一天最多约 2 课时；同一学员时间重叠自然也算冲突（双保险）。

export const DAILY_LESSON_LIMIT = 2;

export interface ExistingSlot {
  id?: number;
  studentId: number;
  instructorId: number;
  vehicleId: number;
  lessonDate: string;
  startMin: number;
  endMin: number;
  status?: 'booked' | 'completed' | 'cancelled';
}

export interface RequestedSlot {
  studentId: number;
  instructorId: number;
  vehicleId: number;
  lessonDate: string;
  startMin: number;
  endMin: number;
}

export type BookingBlockReason =
  | 'instructor_busy'
  | 'vehicle_busy'
  | 'student_time_overlap'
  | 'daily_limit_exceeded';

export interface BookingBlock {
  reason: BookingBlockReason;
  message: string;
  conflict?: ExistingSlot;
}

function overlaps(a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

function active(s: ExistingSlot): boolean {
  return s.status !== 'cancelled';
}

function formatRange(s: ExistingSlot): string {
  const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  return `${fmt(s.startMin)}-${fmt(s.endMin)}`;
}

/**
 * 校验一笔新约课。返回 BookingBlock 表示拦下，null 表示通过。
 * 注意：学费闸门是独立模块，不在这里判断。
 */
export function checkBookingConflict(
  request: RequestedSlot,
  existing: ExistingSlot[],
): BookingBlock | null {
  if (request.endMin <= request.startMin) {
    return { reason: 'student_time_overlap', message: '时段起止时间不合法' };
  }

  for (const s of existing) {
    if (!active(s) || s.lessonDate !== request.lessonDate) continue;

    if (s.instructorId === request.instructorId && overlaps(s, request)) {
      return {
        reason: 'instructor_busy',
        message: `教练该时段已有约课（${formatRange(s)}），请改约其他时段或教练`,
        conflict: s,
      };
    }
    if (s.vehicleId === request.vehicleId && overlaps(s, request)) {
      return {
        reason: 'vehicle_busy',
        message: `该教练绑定的车辆该时段已被占用（${formatRange(s)}），一台车同时段只排一人，请改约`,
        conflict: s,
      };
    }
    if (s.studentId === request.studentId && overlaps(s, request)) {
      return {
        reason: 'student_time_overlap',
        message: `学员本人该时段已有约课（${formatRange(s)}），请改约`,
        conflict: s,
      };
    }
  }

  // 同日课时上限：数该学员当天所有未取消的单（与时段无关）
  const sameDayCount = existing.filter(
    (s) => active(s) && s.studentId === request.studentId && s.lessonDate === request.lessonDate,
  ).length;
  if (sameDayCount >= DAILY_LESSON_LIMIT) {
    return {
      reason: 'daily_limit_exceeded',
      message: `学员同一天限约 ${DAILY_LESSON_LIMIT} 课时，当天已约 ${sameDayCount} 课时，请改天再约`,
    };
  }

  return null;
}
