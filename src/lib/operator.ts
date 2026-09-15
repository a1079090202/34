import { NextRequest } from 'next/server';
import { getDb } from './db';

// 店内小系统：操作人由前台/教练在页面顶部下拉选择，请求带 x-operator-id 头自称。
// 这不是防外部攻击的登录认证，而是「按角色分权」：服务端据此强制每类写操作的角色，
// 所有写操作留痕都用这个 ID。角色一旦在路由层越权，一律 403。
export type Role = 'front_desk' | 'instructor' | 'admin';

export const ROLES = {
  /** 可办除消课外的前台业务：建档/科目/收费/约课/取消/报表 */
  staff: ['front_desk', 'admin'] as Role[],
  /** 消课：前台、教练、管理员都可以 */
  complete: ['front_desk', 'instructor', 'admin'] as Role[],
};

export interface AuthedOperator {
  ok: true;
  operatorId: number;
  role: Role;
  name: string;
}

export type AuthResult = AuthedOperator | { ok: false; status: 401 | 403; message: string };

function resolveId(req: NextRequest, allowQuery: boolean): string | null {
  const header = req.headers.get('x-operator-id');
  if (header) return header;
  // 报表是浏览器直接跳转的 <a download>，带不了自定义头，允许 ?op=<id> 传同一个身份
  if (allowQuery) return new URL(req.url).searchParams.get('op');
  return null;
}

/**
 * 解析并校验操作人：必须真实存在且未停用，返回其角色。
 * 缺身份/身份非法 → 401；身份有效但不具所需角色 → 403（在 requireRole 里判）。
 */
export function requireOperator(req: NextRequest, opts: { allowQuery?: boolean } = {}): AuthResult {
  const raw = resolveId(req, opts.allowQuery ?? false);
  if (!raw || !/^\d+$/.test(raw)) {
    return { ok: false, status: 401, message: '缺少操作人信息（x-operator-id），请在页面顶部选择当前操作人' };
  }
  const row = getDb()
    .prepare(`SELECT id, name, role FROM operators WHERE id = ? AND active = 1`)
    .get(Number(raw)) as { id: number; name: string; role: Role } | undefined;
  if (!row) return { ok: false, status: 401, message: '操作人不存在或已停用' };
  return { ok: true, operatorId: row.id, role: row.role, name: row.name };
}

/** 在身份校验之上再做角色授权；不在允许名单内 → 403。 */
export function requireRole(req: NextRequest, roles: readonly Role[], opts: { allowQuery?: boolean } = {}): AuthResult {
  const auth = requireOperator(req, opts);
  if (!auth.ok) return auth;
  if (!roles.includes(auth.role)) {
    return { ok: false, status: 403, message: '当前操作人角色无权执行此操作' };
  }
  return auth;
}
