import { getDb } from '../db';
import { isValidDate, todayLocal } from '../date';

export type PaymentResult =
  | { ok: true; paymentId: number }
  | { ok: false; message: string };

/**
 * 收费：记录一笔回款，必须挂到某一期上。金额单位是分（整数），
 * 允许部分缴款；超过该期应缴余额时拒绝。
 */
export function recordPayment(
  studentId: number,
  installmentSeq: number,
  amountCents: number,
  operatorId: number,
  paidDate: string = todayLocal(),
  note = '',
): PaymentResult {
  const db = getDb();
  return db.transaction((): PaymentResult => {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return { ok: false, message: '缴费金额必须是正整数（分）' };
    }
    if (!isValidDate(paidDate) || paidDate > todayLocal()) {
      return { ok: false, message: '缴费日期不合法或晚于今天' };
    }
    const student = db.prepare(`SELECT id FROM students WHERE id = ?`).get(studentId);
    if (!student) return { ok: false, message: '学员不存在' };

    const inst = db
      .prepare(`SELECT id, amount_cents FROM installments WHERE student_id = ? AND seq = ?`)
      .get(studentId, installmentSeq) as { id: number; amount_cents: number } | undefined;
    if (!inst) return { ok: false, message: `第 ${installmentSeq} 期不存在` };

    const paid = db
      .prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS s FROM payments WHERE installment_id = ?`)
      .get(inst.id) as { s: number };
    if (paid.s + amountCents > inst.amount_cents) {
      return {
        ok: false,
        message: `本期应缴 ${((inst.amount_cents - paid.s) / 100).toFixed(2)} 元，不能多收`,
      };
    }

    const r = db
      .prepare(
        `INSERT INTO payments (student_id, installment_id, amount_cents, paid_date, created_by, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(studentId, inst.id, amountCents, paidDate, operatorId, note);
    return { ok: true, paymentId: Number(r.lastInsertRowid) };
  })();
}
