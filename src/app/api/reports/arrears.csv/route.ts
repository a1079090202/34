import { NextRequest, NextResponse } from 'next/server';
import { arrearsCsv } from '@/lib/services/reports';
import { currentMonth, isValidMonth } from '@/lib/date';
import { requireRole, ROLES } from '@/lib/operator';

// GET /api/reports/arrears.csv?month=2026-09（CSV 直链，身份可经 ?op= 传入）
export async function GET(req: NextRequest) {
  const op = requireRole(req, ROLES.staff, { allowQuery: true });
  if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status });
  const m = new URL(req.url).searchParams.get('month');
  const month = m === null ? currentMonth() : isValidMonth(m) ? m : null;
  if (!month) {
    return NextResponse.json({ error: 'month 参数格式应为 YYYY-MM' }, { status: 400 });
  }
  const csv = arrearsCsv(month);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="arrears-${month}.csv"`,
    },
  });
}
