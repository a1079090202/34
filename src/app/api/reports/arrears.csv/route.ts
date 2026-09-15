import { NextRequest, NextResponse } from 'next/server';
import { arrearsCsv } from '@/lib/services/reports';
import { currentMonth } from '@/lib/date';

const MONTH_RE = /^\d{4}-\d{2}$/;

// GET /api/reports/arrears.csv?month=2026-09
export async function GET(req: NextRequest) {
  const m = new URL(req.url).searchParams.get('month');
  const month = m === null ? currentMonth() : MONTH_RE.test(m) ? m : null;
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
