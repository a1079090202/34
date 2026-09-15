import { describe, it, expect } from 'vitest';
import { isValidDate, isValidMonth, parseDate, addDays, MIN_DATE, MAX_DATE } from '@/lib/date';

describe('严格日历校验 isValidDate', () => {
  it('接受真实存在的日期', () => {
    for (const s of ['2026-09-15', '2026-01-01', '2026-12-31', '2024-02-29', '2000-02-29', MIN_DATE, MAX_DATE]) {
      expect(isValidDate(s), s).toBe(true);
    }
  });

  it('拒绝 JS Date 会静默进位的非法日期（核心回归）', () => {
    // 这些用旧实现 new Date(y,m-1,d) 都不会是 NaN，会漏网
    for (const s of [
      '2026-02-31', // → 03-03
      '2026-02-30', // → 03-02
      '2026-02-29', // 2026 平年 → 03-01
      '2026-09-31', // 9 月只有 30 天
      '2026-04-31', // 4 月只有 30 天
      '2026-13-01', // 13 月
      '2026-00-15', // 0 月
      '2026-01-00', // 0 日
      '2026-01-32', // 32 日
    ]) {
      expect(isValidDate(s), s).toBe(false);
    }
  });

  it('拒绝范围外/无意义年份', () => {
    for (const s of ['0000-01-01', '1899-12-31', '2101-01-01', '9999-12-31']) {
      expect(isValidDate(s), s).toBe(false);
    }
  });

  it('拒绝格式不符或非字符串', () => {
    for (const s of ['2026-9-15', '2026-09-1', '20260915', ' 2026-09-15', '2026-09-15 ', '2026/09/15', '']) {
      expect(isValidDate(s), JSON.stringify(s)).toBe(false);
    }
    expect(isValidDate(null)).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
    expect(isValidDate(20260915)).toBe(false);
    expect(isValidDate({})).toBe(false);
  });

  it('类型收窄后 parseDate/addDays 等仍可正常工作', () => {
    const s = '2026-09-15';
    if (isValidDate(s)) {
      expect(parseDate(s).getDate()).toBe(15);
      expect(addDays(s, 1)).toBe('2026-09-16');
    }
  });
});

describe('严格月份校验 isValidMonth', () => {
  it('接受合法月份', () => {
    for (const s of ['2026-01', '2026-09', '2026-12', '1900-01', '2100-12']) {
      expect(isValidMonth(s), s).toBe(true);
    }
  });

  it('拒绝非法月份', () => {
    for (const s of ['2026-00', '2026-13', '2026-1', '2026-9', '0000-01', '2101-01', '2026', '']) {
      expect(isValidMonth(s), s).toBe(false);
    }
  });
});
