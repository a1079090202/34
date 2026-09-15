import { describe, it, expect } from 'vitest';
import { evaluateValidity, daysRemaining, YELLOW_WARNING_DAYS } from '@/lib/rules/validity';

describe('有效期倒计时与列表标黄', () => {
  it('剩余 ≥ 60 天不标黄', () => {
    const v = evaluateValidity('2026-11-20', '2026-09-15');
    expect(daysRemaining('2026-11-20', '2026-09-15')).toBe(66);
    expect(v.highlight).toBe(false);
    expect(v.status).toBe('ok');
  });

  it('剩余正好 60 天：不足 60 天的边界判定（60 天不标黄，59 天标黄）', () => {
    const at60 = evaluateValidity('2026-11-14', '2026-09-15'); // 9/15 → 11/14 = 60 天
    expect(at60.daysLeft).toBe(60);
    expect(at60.highlight).toBe(false);

    const at59 = evaluateValidity('2026-11-13', '2026-09-15');
    expect(at59.daysLeft).toBe(59);
    expect(at59.highlight).toBe(true);
    expect(at59.status).toBe('expiring_soon');
  });

  it('种子学员王芳（40 天后到期）应标黄', () => {
    const v = evaluateValidity('2026-10-25', '2026-09-15');
    expect(v.daysLeft).toBe(40);
    expect(v.highlight).toBe(true);
    expect(v.label).toContain('40');
  });

  it('到期当天为第 0 天，标黄；过期后也标黄并显示已过期', () => {
    const zero = evaluateValidity('2026-09-15', '2026-09-15');
    expect(zero.daysLeft).toBe(0);
    expect(zero.highlight).toBe(true);
    expect(zero.status).toBe('expiring_soon');

    const expired = evaluateValidity('2026-09-10', '2026-09-15');
    expect(expired.status).toBe('expired');
    expect(expired.highlight).toBe(true);
    expect(expired.label).toContain('已过期 5 天');
  });

  it('系统时间拨到两天后，倒计时同步减少 2 天（验收第 5 步规则层）', () => {
    const before = evaluateValidity('2026-10-25', '2026-09-15');
    const after = evaluateValidity('2026-10-25', '2026-09-17');
    expect(before.daysLeft - after.daysLeft).toBe(2);
    expect(YELLOW_WARNING_DAYS).toBe(60);
  });
});
