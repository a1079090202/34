import { describe, it, expect } from 'vitest';
import { checkLessonExpiry, checkHoursBalance } from '@/lib/rules/eligibility';

describe('有效期闸门 checkLessonExpiry', () => {
  it('上课日早于到期日 → 放行', () => {
    expect(checkLessonExpiry('2026-09-15', '2026-10-25')).toBeNull();
  });

  it('上课日恰为到期日当天 → 放行（到期日当天仍可约）', () => {
    expect(checkLessonExpiry('2026-10-25', '2026-10-25')).toBeNull();
  });

  it('上课日晚于到期日（含已过期学员约今天）→ 拦截', () => {
    const b1 = checkLessonExpiry('2026-10-26', '2026-10-25');
    expect(b1?.reason).toBe('validity_expired');
    const b2 = checkLessonExpiry('2026-09-15', '2026-09-10');
    expect(b2?.reason).toBe('validity_expired');
    expect(b2!.message).toContain('2026-09-10');
  });
});

describe('课时余额闸门 checkHoursBalance', () => {
  it('余额充足 → 放行', () => {
    expect(checkHoursBalance({ purchasedHours: 20, consumedHours: 5, bookedCount: 3 })).toBeNull();
  });

  it('边界：占用 + 本单恰好等于购买课时 → 放行（最后一个课时）', () => {
    expect(checkHoursBalance({ purchasedHours: 2, consumedHours: 1, bookedCount: 0 })).toBeNull();
    expect(checkHoursBalance({ purchasedHours: 2, consumedHours: 0, bookedCount: 1 })).toBeNull();
  });

  it('已消 + 已约占用 已满，再约 → 拦截', () => {
    const b = checkHoursBalance({ purchasedHours: 2, consumedHours: 1, bookedCount: 1 });
    expect(b?.reason).toBe('hours_exhausted');
    expect(b!.message).toContain('课时余额不足');
  });

  it('课时全部已约未消（未消课）→ 拦截', () => {
    const b = checkHoursBalance({ purchasedHours: 1, consumedHours: 0, bookedCount: 1 });
    expect(b?.reason).toBe('hours_exhausted');
  });

  it('课时全部已消课 → 拦截（剩余 0）', () => {
    const b = checkHoursBalance({ purchasedHours: 1, consumedHours: 1, bookedCount: 0 });
    expect(b?.reason).toBe('hours_exhausted');
    expect(b!.message).toContain('剩余可约 0');
  });

  it('购买 0 课时 → 任何约课都拦', () => {
    expect(checkHoursBalance({ purchasedHours: 0, consumedHours: 0, bookedCount: 0 })?.reason).toBe('hours_exhausted');
  });
});
