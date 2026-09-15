'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch, useOperator } from '../client';
import { LESSON_SLOTS } from '@/lib/rules/slots';
import { addDays, todayLocal } from '@/lib/date';

interface Student { id: number; name: string; }
interface Vehicle { id: number; plate: string; model: string; }
interface Instructor { id: number; name: string; vehicles: Vehicle[]; }
interface Booking {
  id: number; studentId: number; studentName: string;
  instructorId: number; instructorName: string; vehicleId: number; plate: string;
  subjectNo: number; lessonDate: string; startMin: number; endMin: number; status: string;
}

function fmtMin(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function BookInner() {
  const { operatorId } = useOperator();
  const sp = useSearchParams();
  const [students, setStudents] = useState<Student[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [form, setForm] = useState({
    studentId: sp.get('studentId') ?? '',
    instructorId: '',
    vehicleId: '',
    subjectNo: '2',
    lessonDate: todayLocal(),
    startMin: String(LESSON_SLOTS[0].startMin),
  });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadDay = useCallback(async (date: string) => {
    const d = await (await fetch(`/api/bookings?from=${date}&to=${date}`)).json();
    setBookings(d.bookings);
  }, []);

  useEffect(() => {
    fetch('/api/students').then((r) => r.json()).then((d) => setStudents(d.students.map((s: { id: number; name: string }) => ({ id: s.id, name: s.name }))));
    fetch('/api/resources').then((r) => r.json()).then((d) => {
      setInstructors(d.instructors);
      if (d.instructors[0]) {
        setForm((f) => {
          const insId = f.instructorId ? Number(f.instructorId) : d.instructors[0].id;
          const ins = d.instructors.find((x: Instructor) => x.id === insId);
          return { ...f, instructorId: String(insId), vehicleId: String(ins?.vehicles[0]?.id ?? '') };
        });
      }
    });
  }, []);

  useEffect(() => { loadDay(form.lessonDate); }, [form.lessonDate, loadDay]);

  const instructor = useMemo(
    () => instructors.find((i) => i.id === Number(form.instructorId)),
    [instructors, form.instructorId],
  );

  // 该教练当天已占时段
  const busyStarts = useMemo(() => {
    const set = new Set<number>();
    bookings.filter((b) => b.instructorId === Number(form.instructorId)).forEach((b) => {
      for (let m = b.startMin; m < b.endMin; m += 60) set.add(m);
    });
    return set;
  }, [bookings, form.instructorId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const r = await apiFetch('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        studentId: Number(form.studentId),
        instructorId: Number(form.instructorId),
        vehicleId: Number(form.vehicleId),
        subjectNo: Number(form.subjectNo),
        lessonDate: form.lessonDate,
        startMin: Number(form.startMin),
      }),
    }, operatorId);
    if (r.ok) {
      setMsg({ kind: 'ok', text: `约课成功（单号 ${r.data.id}）` });
      loadDay(form.lessonDate);
    } else {
      // 学费闸门/冲突/上限：服务端返回什么，界面就显示什么，不前端算钱
      setMsg({ kind: 'err', text: r.data.error ?? '约课失败' });
    }
  }

  return (
    <div>
      <div className="card">
        <h2>约课（先过学费闸门，再查教练/车辆冲突与同日两课时上限）</h2>
        <form className="row" onSubmit={submit}>
          <div className="field">
            <label>学员</label>
            <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
              <option value="">选学员</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.id} - {s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>教练</label>
            <select value={form.instructorId} onChange={(e) => {
              const ins = instructors.find((i) => i.id === Number(e.target.value));
              setForm({ ...form, instructorId: e.target.value, vehicleId: String(ins?.vehicles[0]?.id ?? '') });
            }}>
              {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>车辆（该教练绑定）</label>
            <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
              {instructor?.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} {v.model}</option>)}
            </select>
          </div>
          <div className="field">
            <label>科目</label>
            <select value={form.subjectNo} onChange={(e) => setForm({ ...form, subjectNo: e.target.value })}>
              <option value="2">科二</option>
              <option value="3">科三</option>
            </select>
          </div>
          <div className="field">
            <label>日期</label>
            <input type="date" value={form.lessonDate} min={todayLocal()} onChange={(e) => setForm({ ...form, lessonDate: e.target.value })} />
          </div>
          <div className="field">
            <label>时段（1 课时）</label>
            <select value={form.startMin} onChange={(e) => setForm({ ...form, startMin: e.target.value })}>
              {LESSON_SLOTS.map((s) => (
                <option key={s.startMin} value={s.startMin} disabled={busyStarts.has(s.startMin)}>
                  {s.label}{busyStarts.has(s.startMin) ? '（已约满）' : ''}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={!operatorId || !form.studentId || !form.vehicleId}>约课</button>
          {!operatorId && <span className="muted">请先在右上角选择操作人</span>}
        </form>
        {msg && <div className={`msg ${msg.kind}`}><b>{msg.kind === 'ok' ? '✅ ' : '⛔ '}</b>{msg.text}</div>}
      </div>

      <div className="card">
        <h2>{form.lessonDate} 当天已排课</h2>
        {bookings.length === 0 ? <p className="muted">当天暂无约课</p> : (
          <table>
            <thead><tr><th>时段</th><th>学员</th><th>教练</th><th>车辆</th><th>科目</th><th>状态</th></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td className="nowrap">{fmtMin(b.startMin)}-{fmtMin(b.endMin)}</td>
                  <td>{b.studentName}</td>
                  <td>{b.instructorName}</td>
                  <td>{b.plate}</td>
                  <td>科{b.subjectNo}</td>
                  <td><span className={`badge ${b.status === 'completed' ? 'done' : 'booked'}`}>{b.status === 'completed' ? '已消课' : '已约'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="muted">加载中…</div>}>
      <BookInner />
    </Suspense>
  );
}
