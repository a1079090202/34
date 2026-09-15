import { NextRequest, NextResponse } from 'next/server';
import { cancelBooking } from '@/lib/services/booking';
import { requireObj, str } from '@/lib/validation';
import { requireRole, ROLES } from '@/lib/operator';

// 取消约课：DELETE /api/bookings/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const op = requireRole(req, ROLES.staff);
  if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status });

  const bookingId = Number(params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return NextResponse.json({ error: '约课 ID 不合法' }, { status: 400 });
  }

  let reason = '';
  const parsed = requireObj(await req.json().catch(() => ({})));
  if (parsed.ok) reason = str(parsed.value, 'reason') ?? '';

  const ok = cancelBooking(bookingId, op.operatorId, reason);
  if (!ok) return NextResponse.json({ ok: false, error: '约课不存在或已不可取消' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
