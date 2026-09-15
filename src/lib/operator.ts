import { NextRequest } from 'next/server';
import { getDb } from './db';

// 店内小系统：操作人由前台/教练在页面顶部下拉选择，请求带 x-operator-id 头。
// 所有写操作留痕都用这个 ID，路由层统一校验它真实存在且未停用。
export function requireOperator(req: NextRequest): { ok: true; operatorId: number } | { ok: false; message: string } {
  const raw = req.headers.get('x-operator-id');
  if (!raw || !/^\d+$/.test(raw)) {
    return { ok: false, message: '缺少操作人信息（x-operator-id），请在页面顶部选择当前操作人' };
  }
  const operatorId = Number(raw);
  const op = getDb()
    .prepare(`SELECT id FROM operators WHERE id = ? AND active = 1`)
    .get(operatorId);
  if (!op) return { ok: false, message: '操作人不存在或已停用' };
  return { ok: true, operatorId };
}
