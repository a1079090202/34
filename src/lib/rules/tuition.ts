// 规则模块 3：学费闸门。纯函数。
// 存在「应缴日已过（due_date < 今天）且未缴清」的分期时，约课直接拦下，
// 并指明卡在第几期、欠多少分。金额一律用分（整数）。

export interface InstallmentDue {
  seq: number;
  dueDate: string; // YYYY-MM-DD
  amountCents: number;
  paidCents: number;
}

export interface TuitionBlock {
  seq: number;
  dueDate: string;
  amountCents: number;
  paidCents: number;
  arrearsCents: number;
  message: string;
}

/**
 * @param today 本地日期 YYYY-MM-DD
 * 逾期 = 应缴日严格早于今天（应缴日当天不算逾期）
 */
export function checkTuitionGate(installments: InstallmentDue[], today: string): TuitionBlock | null {
  const overdue = installments
    .filter((i) => i.dueDate < today && i.paidCents < i.amountCents)
    .sort((a, b) => a.seq - b.seq);

  if (overdue.length === 0) return null;

  const first = overdue[0];
  const arrearsCents = first.amountCents - first.paidCents;
  return {
    seq: first.seq,
    dueDate: first.dueDate,
    amountCents: first.amountCents,
    paidCents: first.paidCents,
    arrearsCents,
    message: `学费闸门：${seqLabel(first.seq)}学费已逾期（应缴日 ${first.dueDate}），` +
      `欠缴 ${(arrearsCents / 100).toFixed(2)} 元，补交后才能约课`,
  };
}

function seqLabel(seq: number): string {
  const map: Record<number, string> = { 1: '一期', 2: '二期', 3: '三期' };
  return map[seq] ?? `${seq} 期`;
}
