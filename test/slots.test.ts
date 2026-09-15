import { describe, it, expect } from 'vitest';
import { LESSON_SLOTS, LESSON_MINUTES, isBookableStartMinute } from '@/lib/rules/slots';

describe('营业时段判定 isBookableStartMinute（前后端共用）', () => {
  it('LESSON_SLOTS 内的开始时刻全部可约', () => {
    for (const s of LESSON_SLOTS) {
      expect(isBookableStartMinute(s.startMin)).toBe(true);
      expect(s.endMin - s.startMin).toBe(LESSON_MINUTES);
    }
  });

  it('非营业整点（凌晨/午休/晚间）一律拒绝', () => {
    for (const m of [0, 7 * 60, 12 * 60, 18 * 60, 19 * 60, 23 * 60]) {
      expect(isBookableStartMinute(m)).toBe(false);
    }
  });

  it('非整点/越界/非整数拒绝', () => {
    expect(isBookableStartMinute(8 * 60 + 30)).toBe(false);
    expect(isBookableStartMinute(-60)).toBe(false);
    expect(isBookableStartMinute(24 * 60)).toBe(false);
    expect(isBookableStartMinute(8.5 * 60)).toBe(false);
    expect(isBookableStartMinute(Number.NaN)).toBe(false);
  });
});
