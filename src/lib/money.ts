// 金额只在展示层转成元；数据库与规则层永远用分（整数）。
export function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100);
}

export function centsToYuan(cents: number): number {
  return cents / 100;
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
