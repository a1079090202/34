import { NextRequest, NextResponse } from 'next/server';
import { completeBooking } from '@/lib/services/lessons';
import { requireRole, ROLES } from '@/lib/operator';

// 消课：POST /api/bookings/:id/complete
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const op = requireRole(req, ROLES.complete);
  if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status });

  const bookingId = Number(params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return NextResponse.json({ error: '约课 ID 不合法' }, { status: 400 });
  }

  const result = completeBooking(bookingId, op.operatorId);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.message }, { status: 409 });
  return NextResponse.json({ ok: true, id: result.bookingId });
}
