import { describe, it, expect } from 'vitest';
import { checkBookingConflict, DAILY_LESSON_LIMIT } from '@/lib/rules/conflict';
import type { ExistingSlot, RequestedSlot } from '@/lib/rules/conflict';

const base: RequestedSlot = {
  studentId: 1,
  instructorId: 10,
  vehicleId: 100,
  lessonDate: '2026-09-16',
  startMin: 9 * 60,
  endMin: 10 * 60,
};

const slot = (p: Partial<ExistingSlot>): ExistingSlot => ({
  studentId: 2,
  instructorId: 11,
  vehicleId: 101,
  lessonDate: '2026-09-16',
  startMin: 8 * 60,
  endMin: 9 * 60,
  status: 'booked',
  ...p,
});

describe('约课冲突规则', () => {
  it('无任何已约课时放行', () => {
    expect(checkBookingConflict(base, [])).toBeNull();
  });

  it('同教练同时段第二单 → instructor_busy 拦截', () => {
    const existing = [slot({ instructorId: 10, vehicleId: 100, startMin: 9 * 60, endMin: 10 * 60, studentId: 5 })];
    const block = checkBookingConflict(base, existing);
    expect(block!.reason).toBe('instructor_busy');
    expect(block!.message).toContain('改约');
  });

  it('同车同时段（不同教练）→ vehicle_busy 拦截', () => {
    const existing = [slot({ instructorId: 11, vehicleId: 100, studentId: 5, startMin: 9 * 60 + 30, endMin: 10 * 60 + 30 })];
    const block = checkBookingConflict(base, existing);
    expect(block!.reason).toBe('vehicle_busy');
  });

  it('学员本人时间重叠 → student_time_overlap', () => {
    const existing = [slot({ instructorId: 99, vehicleId: 999, studentId: 1, startMin: 9 * 60 + 30, endMin: 10 * 60 + 30 })];
    const block = checkBookingConflict(base, existing);
    expect(block!.reason).toBe('student_time_overlap');
  });

  it('背靠背时段（08-09 与 09-10）不算重叠，放行', () => {
    const existing = [slot({ instructorId: 10, vehicleId: 100, startMin: 8 * 60, endMin: 9 * 60 })];
    expect(checkBookingConflict(base, existing)).toBeNull();
  });

  it('已取消的单不占时段', () => {
    const existing = [slot({ instructorId: 10, vehicleId: 100, startMin: 9 * 60, endMin: 10 * 60, status: 'cancelled' })];
    expect(checkBookingConflict(base, existing)).toBeNull();
  });

  it('不同日期互不影响', () => {
    const existing = [slot({ instructorId: 10, vehicleId: 100, lessonDate: '2026-09-17', startMin: 9 * 60, endMin: 10 * 60 })];
    expect(checkBookingConflict(base, existing)).toBeNull();
  });
});

describe('学员同日两课时上限', () => {
  it(`当天已约 ${DAILY_LESSON_LIMIT} 课时（不同时段）→ 第三单 daily_limit_exceeded`, () => {
    const existing = [
      slot({ studentId: 1, instructorId: 10, vehicleId: 100, startMin: 8 * 60, endMin: 9 * 60 }),
      slot({ studentId: 1, instructorId: 10, vehicleId: 100, startMin: 10 * 60, endMin: 11 * 60 }),
    ];
    const third: RequestedSlot = { ...base, startMin: 14 * 60, endMin: 15 * 60, vehicleId: 102, instructorId: 12 };
    const block = checkBookingConflict(third, existing);
    expect(block!.reason).toBe('daily_limit_exceeded');
    expect(block!.message).toContain('2 课时');
  });

  it('当天只有 1 课时，第二课时放行', () => {
    const existing = [slot({ studentId: 1, instructorId: 10, vehicleId: 100, startMin: 8 * 60, endMin: 9 * 60 })];
    const second: RequestedSlot = { ...base, startMin: 10 * 60, endMin: 11 * 60, vehicleId: 102, instructorId: 12 };
    expect(checkBookingConflict(second, existing)).toBeNull();
  });

  it('上限只按同一学员计算，别的学员当天排满不影响', () => {
    const existing = [
      slot({ studentId: 9, instructorId: 12, vehicleId: 102, startMin: 8 * 60, endMin: 9 * 60 }),
      slot({ studentId: 9, instructorId: 12, vehicleId: 102, startMin: 10 * 60, endMin: 11 * 60 }),
    ];
    expect(checkBookingConflict(base, existing)).toBeNull();
  });
});
