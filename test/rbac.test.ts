// RBAC 路由鉴权：直接调用 Route Handler，验证 401（无身份）/ 403（越权）/ 放行。
process.env.DRIVING_SCHOOL_DB = ':memory:';

import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { POST as postStudents } from '@/app/api/students/route';
import { POST as postSubject } from '@/app/api/students/[id]/subject/route';
import { POST as postPayments } from '@/app/api/payments/route';
import { POST as postBookings } from '@/app/api/bookings/route';
import { DELETE as cancelBooking } from '@/app/api/bookings/[id]/route';
import { POST as completeBooking } from '@/app/api/bookings/[id]/complete/route';
import { GET as arrearsCsv } from '@/app/api/reports/arrears.csv/route';
import { GET as hoursCsv } from '@/app/api/reports/instructor-hours.csv/route';

const BASE = 'http://localhost';
let ids: { front: number; instructor: number; admin: number };

function jsonReq(path: string, method: string, operatorId: number | null, body: unknown = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (operatorId !== null) headers.set('x-operator-id', String(operatorId));
  return new NextRequest(`${BASE}${path}`, { method, headers, body: JSON.stringify(body) });
}

beforeAll(() => {
  const db = getDb();
  const ins = db.prepare(`INSERT INTO operators (name, role) VALUES (?, ?)`);
  const front = Number(ins.run('前台', 'front_desk').lastInsertRowid);
  const instructor = Number(ins.run('教练', 'instructor').lastInsertRowid);
  const admin = Number(ins.run('店长', 'admin').lastInsertRowid);
  ids = { front, instructor, admin };
});

// 对 staff-only 写接口：无身份 401、教练 403、前台/管理员通过鉴权（进入参数/业务校验，故非 401/403）
describe.each([
  ['建档 POST /api/students', (op: number | null) => postStudents(jsonReq('/api/students', 'POST', op))],
  ['科目登记 POST /api/students/1/subject', (op: number | null) =>
    postSubject(jsonReq('/api/students/1/subject', 'POST', op, { subjectNo: 1, status: 'pending' }), { params: { id: '1' } })],
  ['收费 POST /api/payments', (op: number | null) => postPayments(jsonReq('/api/payments', 'POST', op))],
  ['约课 POST /api/bookings', (op: number | null) => postBookings(jsonReq('/api/bookings', 'POST', op))],
  ['取消 DELETE /api/bookings/999', (op: number | null) =>
    cancelBooking(jsonReq('/api/bookings/999', 'DELETE', op, { reason: 'x' }), { params: { id: '999' } })],
] as const)('%s', (_name, call) => {
  it('无操作人 → 401', async () => {
    expect((await call(null)).status).toBe(401);
  });
  it('教练越权 → 403', async () => {
    expect((await call(ids.instructor)).status).toBe(403);
  });
  it('前台放行（进入后续校验，不再是 401/403）', async () => {
    const s = (await call(ids.front)).status;
    expect([401, 403]).not.toContain(s);
  });
  it('管理员放行（进入后续校验，不再是 401/403）', async () => {
    const s = (await call(ids.admin)).status;
    expect([401, 403]).not.toContain(s);
  });
});

describe('消课 POST /api/bookings/999/complete（三角色均可）', () => {
  const call = (op: number | null) =>
    completeBooking(jsonReq('/api/bookings/999/complete', 'POST', op), { params: { id: '999' } });
  it('无操作人 → 401', async () => {
    expect((await call(null)).status).toBe(401);
  });
  it('教练可消课（记录不存在 → 409，而非 403）', async () => {
    expect((await call(ids.instructor)).status).toBe(409);
  });
  it('前台、管理员也可消课', async () => {
    expect((await call(ids.front)).status).toBe(409);
    expect((await call(ids.admin)).status).toBe(409);
  });
});

describe('报表 CSV（staff only，支持 ?op= 直链身份）', () => {
  const get = (handler: typeof arrearsCsv, path: string) => handler(new NextRequest(`${BASE}${path}`));

  it('无身份 → 401（头与 ?op= 都没有）', async () => {
    expect((await get(arrearsCsv, '/api/reports/arrears.csv?month=2026-09')).status).toBe(401);
  });
  it('教练经 ?op= 访问 → 403', async () => {
    expect((await get(arrearsCsv, `/api/reports/arrears.csv?month=2026-09&op=${ids.instructor}`)).status).toBe(403);
  });
  it('前台/管理员经 ?op= 下载 → 200 CSV', async () => {
    const a = await get(arrearsCsv, `/api/reports/arrears.csv?month=2026-09&op=${ids.front}`);
    expect(a.status).toBe(200);
    expect(a.headers.get('content-type')).toContain('text/csv');
    const b = await get(hoursCsv, `/api/reports/instructor-hours.csv?month=2026-09&op=${ids.admin}`);
    expect(b.status).toBe(200);
  });
  it('前台经请求头访问 → 200', async () => {
    const req = new NextRequest(`${BASE}/api/reports/arrears.csv?month=2026-09`, {
      headers: { 'x-operator-id': String(ids.front) },
    });
    expect((await arrearsCsv(req)).status).toBe(200);
  });
});
