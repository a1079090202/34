import { NextRequest, NextResponse } from 'next/server';
import { setSubjectStatus } from '@/lib/services/students';
import { requireObj, posIntId, dateBetween, enumField } from '@/lib/validation';
import { requireRole, ROLES } from '@/lib/operator';
import { todayLocal, MIN_DATE } from '@/lib/date';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const op = requireRole(req, ROLES.staff);
  if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status });

  const studentId = Number(params.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    return NextResponse.json({ error: '学员 ID 不合法' }, { status: 400 });
  }

  const parsed = requireObj(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const o = parsed.value;

  const subjectNo = posIntId(o, 'subjectNo');
  const status = enumField(o, 'status', ['pending', 'passed'] as const);
  if (subjectNo === null || subjectNo < 1 || subjectNo > 4) {
    return NextResponse.json({ error: '科目编号必须是 1-4' }, { status: 400 });
  }
  if (!status) return NextResponse.json({ error: '状态必须是 pending 或 passed' }, { status: 400 });

  const passedDate = status === 'passed' ? dateBetween(o, 'passedDate', MIN_DATE, todayLocal()) : null;
  if (status === 'passed' && !passedDate) {
    return NextResponse.json({ error: '通过日期不合法或晚于今天（YYYY-MM-DD）' }, { status: 400 });
  }

  setSubjectStatus(studentId, subjectNo, status, passedDate, op.operatorId);
  return NextResponse.json({ ok: true });
}
