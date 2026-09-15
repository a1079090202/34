// 规则模块 1：两年有效期倒计时。纯函数，不碰数据库，便于单测。
// 列表标黄阈值：剩余不足 60 天（含第 60 天 → 用 < 60 判定）。
import { parseDate } from '../date';

export const YELLOW_WARNING_DAYS = 60;

export function daysRemaining(expiryDate: string, today: string): number {
  const ms = parseDate(expiryDate).getTime() - parseDate(today).getTime();
  return Math.round(ms / 86_400_000);
}

export type ValidityStatus = 'ok' | 'expiring_soon' | 'expired';

export interface ValidityInfo {
  daysLeft: number;
  status: ValidityStatus;
  /** 列表是否标黄：已过期或不足 60 天 */
  highlight: boolean;
  label: string;
}

export function evaluateValidity(expiryDate: string, today: string): ValidityInfo {
  const daysLeft = daysRemaining(expiryDate, today);
  if (daysLeft < 0) {
    return { daysLeft, status: 'expired', highlight: true, label: `已过期 ${-daysLeft} 天` };
  }
  if (daysLeft < YELLOW_WARNING_DAYS) {
    return { daysLeft, status: 'expiring_soon', highlight: true, label: `剩 ${daysLeft} 天到期` };
  }
  return { daysLeft, status: 'ok', highlight: false, label: `剩 ${daysLeft} 天到期` };
}
