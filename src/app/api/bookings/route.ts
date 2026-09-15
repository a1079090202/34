import { NextRequest, NextResponse } from 'next/server';
import { createBooking, listBookings } from '@/lib/services/booking';
import { requireObj, posIntId, dateStr, enumField, int } from '@/lib/validation';
import { requireRole, ROLES } from '@/lib/operator';
import { addDays, todayLocal, isValidDate } from '@/lib/date';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const from = fromParam ?? todayLocal();
  const to = toParam ?? addDays(todayLocal(), 7);
  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    return NextResponse.json(
      { error: '日期区间不合法（需为 YYYY-MM-DD 且起始不晚于结束）' },
      { status: 400 },
    );
  }
  return NextResponse.json({ bookings: listBookings(from, to) });
}

export async function POST(req: NextRequest) {
  const op = requireRole(req, ROLES.staff);
  if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status });

  const parsed = requireObj(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const o = parsed.value;

  // 路由层只做参数校验
  const studentId = posIntId(o, 'studentId');
  const instructorId = posIntId(o, 'instructorId');
  const vehicleId = posIntId(o, 'vehicleId');
  const subjectNo = enumField(o, 'subjectNo', ['2', '3'] as const) ?? int(o, 'subjectNo');
  const lessonDate = dateStr(o, 'lessonDate');
  const startMin = int(o, 'startMin');

  if (studentId === null) return NextResponse.json({ error: '学员 ID 不合法' }, { status: 400 });
  if (instructorId === null) return NextResponse.json({ error: '教练 ID 不合法' }, { status: 400 });
  if (vehicleId === null) return NextResponse.json({ error: '车辆 ID 不合法' }, { status: 400 });
  const subject = typeof subjectNo === 'number' ? subjectNo : Number(subjectNo);
  if (subject !== 2 && subject !== 3) {
    return NextResponse.json({ error: '实操约课科目只能是 2（科二）或 3（科三）' }, { status: 400 });
  }
  if (!lessonDate) return NextResponse.json({ error: '约课日期不合法（YYYY-MM-DD）' }, { status: 400 });
  if (startMin === null || startMin < 0 || startMin >= 24 * 60) {
    return NextResponse.json({ error: '开始时间不合法（当日分钟数 0-1439）' }, { status: 400 });
  }

  // 业务规则全部在服务层：学费闸门 → 教练/车辆冲突 → 同日上限
  const result = createBooking({
    studentId,
    instructorId,
    vehicleId,
    subjectNo: subject as 2 | 3,
    lessonDate,
    startMin,
    operatorId: op.operatorId,
  });

  if (!result.ok) {
    // 规则拦截统一 409，body 里带具体闸门/冲突信息，前端原样展示
    const status = result.error.code === 'not_found' ? 404 : 409;
    return NextResponse.json(
      {
        ok: false,
        code: result.error.code,
        error: result.error.message,
        ...(result.error.code === 'tuition_blocked' ? { tuition: result.error.block } : {}),
        ...(result.error.code === 'booking_blocked' ? { block: result.error.block } : {}),
        ...(result.error.code === 'eligibility_blocked' ? { block: result.error.block } : {}),
      },
      { status },
    );
  }
  return NextResponse.json({ ok: true, id: result.bookingId }, { status: 201 });
}
