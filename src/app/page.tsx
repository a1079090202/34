'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, useOperator, isStaffRole } from './client';
import { todayLocal } from '@/lib/date';

interface Installment {
  seq: number;
  dueDate: string;
  amountCents: number;
  paidCents: number;
}
interface Student {
  id: number;
  name: string;
  phone: string;
  enrollmentDate: string;
  expiryDate: string;
  totalFeeCents: number;
  paidCents: number;
  plan: 'full' | 'installments';
  purchasedHours: number;
  consumedHours: number;
  note: string;
  subjects: { subjectNo: number; status: 'pending' | 'passed'; passedDate: string | null }[];
  installments: Installment[];
  validity: { daysLeft: number; status: string; label: string; highlight: boolean };
  overdueSeq: number | null;
}

function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}

export default function StudentsPage() {
  const { operatorId, role } = useOperator();
  const canStaff = isStaffRole(role);
  const [students, setStudents] = useState<Student[]>([]);
  const [today, setToday] = useState(todayLocal());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    enrollmentDate: todayLocal(),
    totalFeeYuan: '',
    plan: 'installments',
    purchasedHours: '20',
  });

  const load = useCallback(async () => {
    const d = await (await fetch('/api/students')).json();
    setStudents(d.students);
    setToday(d.today);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function enroll(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const r = await apiFetch('/api/students', {
      method: 'POST',
      body: JSON.stringify({ ...form, totalFeeYuan: Number(form.totalFeeYuan), purchasedHours: Number(form.purchasedHours) }),
    }, operatorId);
    if (r.ok) {
      setMsg({ kind: 'ok', text: `建档成功，学员 ID=${r.data.id}，有效期至 ${r.data.expiryDate}（两年）` });
      setForm({ ...form, name: '', phone: '', totalFeeYuan: '' });
      load();
    } else {
      setMsg({ kind: 'err', text: r.data.error ?? '建档失败' });
    }
  }

  async function toggleSubject(s: Student, subjectNo: number, status: 'passed' | 'pending') {
    setMsg(null);
    const r = await apiFetch(`/api/students/${s.id}/subject`, {
      method: 'POST',
      body: JSON.stringify({ subjectNo, status, passedDate: today }),
    }, operatorId);
    if (r.ok) load();
    else setMsg({ kind: 'err', text: r.data.error ?? '操作失败' });
  }

  async function pay(s: Student, seq: number, amountYuan: string) {
    setMsg(null);
    const r = await apiFetch('/api/payments', {
      method: 'POST',
      body: JSON.stringify({ studentId: s.id, installmentSeq: seq, amountYuan: Number(amountYuan) }),
    }, operatorId);
    if (r.ok) {
      setMsg({ kind: 'ok', text: `已登记 ${s.name} 第 ${seq} 期收款 ${amountYuan} 元` });
      load();
    } else {
      setMsg({ kind: 'err', text: r.data.error ?? '收款失败' });
    }
  }

  return (
    <div>
      <div className="card">
        <h2>学员报名建档</h2>
        <form className="row" onSubmit={enroll}>
          <div className="field"><label>姓名</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="field"><label>电话</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
          <div className="field"><label>报名日期</label><input type="date" max={todayLocal()} value={form.enrollmentDate} onChange={(e) => setForm({ ...form, enrollmentDate: e.target.value })} /></div>
          <div className="field"><label>学费总额（元）</label><input type="number" step="0.01" min="0" value={form.totalFeeYuan} onChange={(e) => setForm({ ...form, totalFeeYuan: e.target.value })} required /></div>
          <div className="field">
            <label>缴费方式</label>
            <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              <option value="installments">三期分期</option>
              <option value="full">一次付清</option>
            </select>
          </div>
          <div className="field"><label>购买课时</label><input type="number" min="0" value={form.purchasedHours} onChange={(e) => setForm({ ...form, purchasedHours: e.target.value })} /></div>
          <button type="submit" disabled={!operatorId || !canStaff}>建档</button>
          {!operatorId && <span className="muted">请先在右上角选择操作人</span>}
          {operatorId && !canStaff && <span className="muted">教练角色仅可查看名册与消课，建档/收费请用前台或管理员账号</span>}
        </form>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
        <p className="muted">分期应缴日：报名当日 / +45 天 / +90 天；有效期自动按报名日起算两年。系统今天：{today}</p>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h2>学员名册（有效期不足 60 天整行标黄）</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>姓名</th><th>电话</th><th>科目一~四</th>
              <th>有效期</th><th>学费（已收/总额）</th><th>课时余</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <StudentRow key={s.id} s={s} canStaff={canStaff} onToggle={toggleSubject} onPay={pay} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentRow({
  s,
  canStaff,
  onToggle,
  onPay,
}: {
  s: Student;
  canStaff: boolean;
  onToggle: (s: Student, n: number, st: 'passed' | 'pending') => void;
  onPay: (s: Student, seq: number, amount: string) => void;
}) {
  const [paySeq, setPaySeq] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const remainingLessons = s.purchasedHours - s.consumedHours;

  return (
    <tr className={s.validity.highlight ? 'warn' : undefined}>
      <td>{s.id}</td>
      <td><b>{s.name}</b></td>
      <td className="nowrap">{s.phone}</td>
      <td className="nowrap">
        {s.subjects.map((sub) => (
          <button
            key={sub.subjectNo}
            className={`badge ${sub.status === 'passed' ? 'pass' : 'pending'}`}
            style={{ border: '1px solid var(--line)', marginRight: 4, cursor: canStaff ? 'pointer' : 'default' }}
            disabled={!canStaff}
            title={
              !canStaff
                ? '教练角色无科目登记权限'
                : sub.status === 'passed'
                  ? `${sub.passedDate ?? ''} 通过（点击撤销）`
                  : '点击登记通过'
            }
            onClick={() => canStaff && onToggle(s, sub.subjectNo, sub.status === 'passed' ? 'pending' : 'passed')}
          >
            科{sub.subjectNo}{sub.status === 'passed' ? '✓' : ''}
          </button>
        ))}
      </td>
      <td className="nowrap">
        <span className={`badge ${s.validity.status === 'ok' ? 'pass' : 'warn'}`}>{s.validity.label}</span>
        <div className="muted">至 {s.expiryDate}</div>
      </td>
      <td className="nowrap">
        {s.overdueSeq ? <span className="badge danger">第{s.overdueSeq}期逾期</span> : null}
        <div>{yuan(s.paidCents)} / {yuan(s.totalFeeCents)} 元</div>
        <div className="muted">{s.plan === 'full' ? '一次付清' : '三期分期'}</div>
        <div className="muted">
          {s.installments.map((i) => (
            <span key={i.seq} style={{ marginRight: 8 }}>
              {i.seq}期: 应{i.dueDate} {yuan(i.paidCents)}/{yuan(i.amountCents)}
            </span>
          ))}
        </div>
      </td>
      <td>{remainingLessons}（买{s.purchasedHours}/消{s.consumedHours}）</td>
      <td className="nowrap">
        {canStaff ? (
          <div className="row" style={{ gap: 6 }}>
            <select value={paySeq} onChange={(e) => { setPaySeq(e.target.value); const inst = s.installments.find((x) => x.seq === Number(e.target.value)); if (inst) setPayAmount(((inst.amountCents - inst.paidCents) / 100).toFixed(2)); }}>
              <option value="">选期次</option>
              {s.installments.map((i) => <option key={i.seq} value={i.seq}>第{i.seq}期（欠{yuan(i.amountCents - i.paidCents)}）</option>)}
            </select>
            <input style={{ width: 90 }} type="number" step="0.01" min="0" placeholder="元" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            <button className="ghost" disabled={!paySeq || !payAmount} onClick={() => { onPay(s, Number(paySeq), payAmount); setPaySeq(''); setPayAmount(''); }}>收款</button>
            <Link className="btn ghost" href={`/book?studentId=${s.id}`}>约课</Link>
          </div>
        ) : (
          <span className="muted">仅查看</span>
        )}
      </td>
    </tr>
  );
}
