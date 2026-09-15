import { NextRequest, NextResponse } from 'next/server';
import { createStudent, listStudents } from '@/lib/services/students';
import { requireObj, str, posIntId, dateBetween, yuanField, enumField, int } from '@/lib/validation';
import { requireRole, ROLES } from '@/lib/operator';
import { addYears, todayLocal, MIN_DATE } from '@/lib/date';
import { evaluateValidity, findFirstOverdue } from '@/lib/rules';

export async function GET() {
  const today = todayLocal();
  const students = listStudents().map((s) => {
    const v = evaluateValidity(s.expiryDate, today);
    const totalPaid = s.installments.reduce((sum, i) => sum + i.paidCents, 0);
    const overdueSeq = findFirstOverdue(s.installments, today)?.seq ?? null;
    return {
      ...s,
      paidCents: totalPaid,
      validity: { daysLeft: v.daysLeft, status: v.status, label: v.label, highlight: v.highlight },
      overdueSeq,
    };
  });
  return NextResponse.json({ today, students });
}

export async function POST(req: NextRequest) {
  const op = requireRole(req, ROLES.staff);
  if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status });

  const parsed = requireObj(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const o = parsed.value;

  const name = str(o, 'name');
  const phone = str(o, 'phone');
  const enrollmentDate = dateBetween(o, 'enrollmentDate', MIN_DATE, todayLocal());
  const totalFeeCents = yuanField(o, 'totalFeeYuan');
  const plan = enumField(o, 'plan', ['full', 'installments'] as const);
  const purchasedHours = int(o, 'purchasedHours');

  if (!name) return NextResponse.json({ error: '学员姓名必填' }, { status: 400 });
  if (!phone || !/^[\d-]{6,20}$/.test(phone)) {
    return NextResponse.json({ error: '联系电话格式不正确（6-20 位数字/横杠）' }, { status: 400 });
  }
  if (!enrollmentDate) return NextResponse.json({ error: '报名日期不合法或晚于今天（YYYY-MM-DD）' }, { status: 400 });
  if (totalFeeCents === null || totalFeeCents <= 0) {
    return NextResponse.json({ error: '学费金额必须是正数（元，最多两位小数）' }, { status: 400 });
  }
  if (!plan) return NextResponse.json({ error: '缴费方式必须是 full 或 installments' }, { status: 400 });
  if (purchasedHours === null || purchasedHours < 0 || purchasedHours > 200) {
    return NextResponse.json({ error: '购买课时数不合法（0-200）' }, { status: 400 });
  }

  try {
    const id = createStudent({
      name,
      phone,
      enrollmentDate,
      totalFeeCents,
      plan,
      purchasedHours,
      note: str(o, 'note') ?? '',
      operatorId: op.operatorId,
    });
    return NextResponse.json({ ok: true, id, expiryDate: addYears(enrollmentDate, 2) }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && /UNIQUE/.test(e.message)) {
      return NextResponse.json({ error: '该手机号已建档' }, { status: 409 });
    }
    throw e;
  }
}
