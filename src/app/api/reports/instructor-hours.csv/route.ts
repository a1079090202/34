import { NextRequest, NextResponse } from 'next/server';
import { instructorHoursCsv, arrearsCsv } from '@/lib/services/reports';
import { currentMonth } from '@/lib/date';

const MONTH_RE = /^\d{4}-\d{2}$/;

function monthFromUrl(req: NextRequest): string | null {
  const m = new URL(req.url).searchParams.get('month');
  if (m === null) return currentMonth();
  return MONTH_RE.test(m) ? m : null;
}

// GET /api/reports/instructor-hours.csv?month=2026-09
export async function GET(req: NextRequest) {
  const month = monthFromUrl(req);
  if (!month) {
    return NextResponse.json({ error: 'month 参数格式应为 YYYY-MM' }, { status: 400 });
  }
  const csv = instructorHoursCsv(month);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="instructor-hours-${month}.csv"`,
    },
  });
}
