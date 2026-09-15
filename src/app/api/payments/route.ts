import { NextRequest, NextResponse } from 'next/server';
import { recordPayment } from '@/lib/services/payments';
import { requireObj, posIntId, yuanField, dateStr } from '@/lib/validation';
import { requireOperator } from '@/lib/operator';

// 收费：POST /api/payments { studentId, installmentSeq, amountYuan, paidDate? }
// 钱在路由入参处由「元」转成整数分，之后全程服务端处理，前端不算钱。
export async function POST(req: NextRequest) {
  const op = requireOperator(req);
  if (!op.ok) return NextResponse.json({ error: op.message }, { status: 401 });

  const parsed = requireObj(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const o = parsed.value;

  const studentId = posIntId(o, 'studentId');
  const installmentSeq = posIntId(o, 'installmentSeq');
  const amountCents = yuanField(o, 'amountYuan');
  const paidDate = dateStr(o, 'paidDate') ?? undefined;

  if (studentId === null) return NextResponse.json({ error: '学员 ID 不合法' }, { status: 400 });
  if (installmentSeq === null) return NextResponse.json({ error: '期次不合法（1/2/3）' }, { status: 400 });
  if (amountCents === null || amountCents <= 0) {
    return NextResponse.json({ error: '缴费金额必须是正数（元，最多两位小数）' }, { status: 400 });
  }

  const result = recordPayment(studentId, installmentSeq, amountCents, op.operatorId, paidDate);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.message }, { status: 409 });
  return NextResponse.json({ ok: true, id: result.paymentId }, { status: 201 });
}
