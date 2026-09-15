'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, useOperator, isStaffRole } from '../client';
import { addDays, currentMonth, todayLocal } from '@/lib/date';

interface Booking {
  id: number; studentId: number; studentName: string;
  instructorId: number; instructorName: string; vehicleId: number; plate: string;
  subjectNo: number; lessonDate: string; startMin: number; endMin: number;
  status: 'booked' | 'completed';
}

function fmtMin(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export default function SchedulePage() {
  const { operatorId, role } = useOperator();
  const canStaff = isStaffRole(role);
  const [from, setFrom] = useState(todayLocal());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const d = await (await fetch(`/api/bookings?from=${from}&to=${addDays(from, 13)}`)).json();
    setBookings(d.bookings);
  }, [from]);

  useEffect(() => { load(); }, [load]);

  async function complete(id: number) {
    setMsg(null);
    const r = await apiFetch(`/api/bookings/${id}/complete`, { method: 'POST' }, operatorId);
    if (r.ok) {
      setMsg({ kind: 'ok', text: `单号 ${id} 已消课：学员课时账 -1，教练带教记录已自动生成` });
      load();
    } else setMsg({ kind: 'err', text: r.data.error ?? '消课失败' });
  }

  async function cancel(id: number) {
    setMsg(null);
    const r = await apiFetch(`/api/bookings/${id}`, { method: 'DELETE', body: JSON.stringify({ reason: '前台取消' }) }, operatorId);
    if (r.ok) { setMsg({ kind: 'ok', text: `单号 ${id} 已取消` }); load(); }
    else setMsg({ kind: 'err', text: r.data.error ?? '取消失败' });
  }

  const days = [...new Set(bookings.map((b) => b.lessonDate))].sort();

  return (
    <div>
      <div className="card">
        <h2>课表 / 消课</h2>
        <div className="row">
          <div className="field"><label>起始日期</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <span className="muted">显示起两周内的约课；消课后自动生成教练带教记录并扣减学员课时</span>
        </div>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      </div>

      {days.map((day) => (
        <div className="card" key={day}>
          <h2>{day}</h2>
          <table>
            <thead><tr><th>时段</th><th>学员</th><th>教练</th><th>车辆</th><th>科目</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {bookings.filter((b) => b.lessonDate === day).map((b) => (
                <tr key={b.id}>
                  <td className="nowrap">{fmtMin(b.startMin)}-{fmtMin(b.endMin)}</td>
                  <td>{b.studentName}</td>
                  <td>{b.instructorName}</td>
                  <td>{b.plate}</td>
                  <td>科{b.subjectNo}</td>
                  <td><span className={`badge ${b.status === 'completed' ? 'done' : 'booked'}`}>{b.status === 'completed' ? '已消课' : '待上课'}</span></td>
                  <td className="nowrap">
                    {b.status === 'booked' ? (
                      <span className="row" style={{ gap: 6 }}>
                        <button onClick={() => complete(b.id)} disabled={!operatorId}>消课</button>
                        {canStaff && (
                          <button className="ghost" onClick={() => cancel(b.id)} disabled={!operatorId}>取消</button>
                        )}
                      </span>
                    ) : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {days.length === 0 && <div className="card"><p className="muted">该区间暂无约课</p></div>}

      <div className="card">
        <h2>月末报表（CSV）</h2>
        {!operatorId ? (
          <p className="muted">请先在右上角选择当前操作人</p>
        ) : !canStaff ? (
          <p className="muted">教练角色无报表下载权限，请用前台或管理员账号</p>
        ) : (
          <>
            <p className="muted">默认导出当前自然月（{currentMonth()}），可在 URL 上指定月份。</p>
            <div className="row">
              <a className="btn" href={`/api/reports/instructor-hours.csv?month=${currentMonth()}&op=${operatorId}`}>下载教练带教课时表</a>
              <a className="btn ghost" href={`/api/reports/arrears.csv?month=${currentMonth()}&op=${operatorId}`}>下载学员欠费表</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
