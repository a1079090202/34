import { describe, it, expect } from 'vitest';
import { checkTuitionGate, type InstallmentDue } from '@/lib/rules/tuition';

// 三期学费 4800 = 1600/1600/1600，单位分
const paid = (seq: number, partial = 0): InstallmentDue => ({
  seq,
  dueDate: ['2026-07-07', '2026-08-21', '2026-10-05'][seq - 1],
  amountCents: 160000,
  paidCents: partial ? partial : 160000,
});
const unpaid = (seq: number): InstallmentDue => ({ ...paid(seq), paidCents: 0 });

describe('学费闸门', () => {
  const TODAY = '2026-09-15';

  it('全部缴清 → 放行', () => {
    expect(checkTuitionGate([paid(1), paid(2), paid(3)], TODAY)).toBeNull();
  });

  it('一期已缴、二期逾期未缴 → 拦下并指明卡在二期', () => {
    const block = checkTuitionGate([paid(1), unpaid(2), unpaid(3)], TODAY);
    expect(block).not.toBeNull();
    expect(block!.seq).toBe(2);
    expect(block!.arrearsCents).toBe(160000);
    expect(block!.message).toContain('二期');
    expect(block!.message).toContain('逾期');
  });

  it('二期只交了一部分且已逾期 → 按欠额拦截（金额按分整数）', () => {
    const block = checkTuitionGate([paid(1), paid(2, 100000), unpaid(3)], TODAY);
    expect(block!.seq).toBe(2);
    expect(block!.arrearsCents).toBe(60000);
  });

  it('二期应缴日还没到（即使没交）→ 放行，不误拦', () => {
    expect(checkTuitionGate([paid(1), unpaid(2), unpaid(3)], '2026-08-20')).toBeNull();
  });

  it('应缴日当天不算逾期，次日才算', () => {
    const dueToday = [{ seq: 1, dueDate: '2026-09-15', amountCents: 100, paidCents: 0 }];
    expect(checkTuitionGate(dueToday, '2026-09-15')).toBeNull();
    expect(checkTuitionGate(dueToday, '2026-09-16')!.seq).toBe(1);
  });

  it('一期二期都逾期时，优先报告最早的一期', () => {
    const block = checkTuitionGate([unpaid(1), unpaid(2)], TODAY);
    expect(block!.seq).toBe(1);
  });
});
