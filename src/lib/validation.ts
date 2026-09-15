// 路由层专用：只做参数校验，不含任何业务规则。
import { isValidDate } from './date';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function requireObj(body: unknown): ValidationResult<Record<string, unknown>> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: '请求体必须是 JSON 对象' };
  }
  return { ok: true, value: body as Record<string, unknown> };
}

export function str(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export function int(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

export function posIntId(o: Record<string, unknown>, key: string): number | null {
  const v = int(o, key);
  return v !== null && v > 0 ? v : null;
}

export function dateStr(o: Record<string, unknown>, key: string): string | null {
  const v = str(o, key);
  return v && isValidDate(v) ? v : null;
}

/** 金额入参：前端传元（最多两位小数），这里转成整数分；拒绝精度外的数字 */
export function yuanField(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  const cents = Math.round(v * 100);
  if (Math.abs(cents / 100 - v) > 1e-9) return null;
  return cents;
}

export function enumField<T extends string>(o: Record<string, unknown>, key: string, allowed: readonly T[]): T | null {
  const v = str(o, key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}
