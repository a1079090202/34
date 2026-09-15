import { getDb } from '../db';
import { monthRange } from '../date';

// CSV 工具：字段转义 + BOM，Excel 直接打开不乱码
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/**
 * 月末表 1：教练带教课时表。
 * 按教练汇总指定自然月内已消课（coaching_logs）课时数。
 */
export function instructorHoursCsv(month: string): string {
  const db = getDb();
  const { start, end } = monthRange(month);
  const rows = db
    .prepare(
      `SELECT i.id AS instructor_id, i.name AS instructor_name,
              COUNT(l.id) AS lessons
       FROM instructors i
       LEFT JOIN coaching_logs l
         ON l.instructor_id = i.id AND l.lesson_date BETWEEN ? AND ?
       GROUP BY i.id, i.name
       ORDER BY i.id`,
    )
    .all(start, end) as { instructor_id: number; instructor_name: string; lessons: number }[];

  return toCsv(
    ['教练ID', '教练姓名', '带教课时数', '统计区间起', '统计区间止'],
    rows.map((r) => [r.instructor_id, r.instructor_name, r.lessons, start, end]),
  );
}

/**
 * 月末表 2：学员欠费表（时点快照，历史月份可复现）。
 * 「截至该月末」仍未缴清的分期（应收 > 已收），逐期列出；金额按分/元两列输出。
 * 关键：已收金额必须只统计 paid_date <= 月末的回款——之后月份的补缴不能冲减
 * 历史月末的欠费，否则重跑历史月份会得到与当时不同的结果。
 */
export function arrearsCsv(month: string): string {
  const db = getDb();
  const { end } = monthRange(month);
  const rows = db
    .prepare(
      `SELECT s.id AS student_id, s.name AS student_name, s.phone,
              i.seq, i.due_date, i.amount_cents,
              COALESCE((SELECT SUM(amount_cents) FROM payments p
                         WHERE p.installment_id = i.id AND p.paid_date <= @end), 0) AS paid_cents
       FROM installments i
       JOIN students s ON s.id = i.student_id
       WHERE paid_cents < i.amount_cents AND i.due_date <= @end
       ORDER BY i.due_date, s.id, i.seq`,
    )
    .all({ end }) as {
      student_id: number;
      student_name: string;
      phone: string;
      seq: number;
      due_date: string;
      amount_cents: number;
      paid_cents: number;
    }[];

  return toCsv(
    [
      '学员ID',
      '学员姓名',
      '电话',
      '欠费期次',
      '应缴日',
      '应收金额_分',
      '已收金额_分',
      '欠缴金额_分',
      '应收金额_元',
      '已收金额_元',
      '欠缴金额_元',
    ],
    rows.map((r) => {
      const owe = r.amount_cents - r.paid_cents;
      return [
        r.student_id,
        r.student_name,
        r.phone,
        r.seq,
        r.due_date,
        r.amount_cents,
        r.paid_cents,
        owe,
        (r.amount_cents / 100).toFixed(2),
        (r.paid_cents / 100).toFixed(2),
        (owe / 100).toFixed(2),
      ];
    }),
  );
}
