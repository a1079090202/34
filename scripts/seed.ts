/**
 * 样例数据脚本：npm run seed
 * 重跑会清空业务表后重建（幂等）。
 * 日期全部相对系统本地「今天」生成，保证任何时候跑都满足验收条件：
 *  - 学员 李娜：第二期学费逾期未缴（约课必被学费闸门拦下）
 *  - 学员 王芳：两年有效期剩余不足 60 天（列表整行标黄）
 *  - 3 名教练、4 台车、未来一周已排课表 + 本月前几天已消课记录（月末报表有数）
 */
import Database from 'better-sqlite3';
import { createDb } from '../src/lib/db';
import { addDays, todayLocal } from '../src/lib/date';

const dbPath = process.env.DRIVING_SCHOOL_DB || './data/driving-school.db';
const db: Database.Database = createDb(dbPath);

const today = todayLocal();
const d = (offset: number) => addDays(today, offset);
const cents = (yuan: number) => Math.round(yuan * 100);

function reset() {
  db.exec(`
    DELETE FROM payments;
    DELETE FROM installments;
    DELETE FROM coaching_logs;
    DELETE FROM lesson_ledger;
    DELETE FROM bookings;
    DELETE FROM instructor_vehicles;
    DELETE FROM subject_records;
    DELETE FROM students;
    DELETE FROM vehicles;
    DELETE FROM instructors;
    DELETE FROM operators;
  `);
  const seqTable = db.prepare(`SELECT name FROM sqlite_master WHERE name='sqlite_sequence'`).get();
  if (seqTable) db.exec(`DELETE FROM sqlite_sequence`);
}

reset();

// ---------- 操作人（所有约课/消课/收费留痕用） ----------
const insOp = db.prepare(`INSERT INTO operators (name, role) VALUES (?, ?)`);
const OP = {
  zhou: 0, wu: 0, chen: 0, liu: 0, zhao: 0,
};
OP.zhou = Number(insOp.run('周敏（前台）', 'front_desk').lastInsertRowid);
OP.wu = Number(insOp.run('吴店长（管理员）', 'admin').lastInsertRowid);
OP.chen = Number(insOp.run('小陈教练', 'instructor').lastInsertRowid);
OP.liu = Number(insOp.run('刘师傅', 'instructor').lastInsertRowid);
OP.zhao = Number(insOp.run('赵教练', 'instructor').lastInsertRowid);

// ---------- 教练 ----------
const insIns = db.prepare(`INSERT INTO instructors (name, phone) VALUES (?, ?)`);
const I = { chen: 0, liu: 0, zhao: 0 };
I.chen = Number(insIns.run('小陈教练', '138-0000-0001').lastInsertRowid);
I.liu = Number(insIns.run('刘师傅', '138-0000-0002').lastInsertRowid);
I.zhao = Number(insIns.run('赵教练', '138-0000-0003').lastInsertRowid);

// ---------- 车辆 ----------
const insVeh = db.prepare(`INSERT INTO vehicles (plate, model) VALUES (?, ?)`);
const V: number[] = [];
V.push(Number(insVeh.run('京A1234学', '大众捷达').lastInsertRowid));
V.push(Number(insVeh.run('京A1235学', '大众捷达').lastInsertRowid));
V.push(Number(insVeh.run('京A2234学', '桑塔纳').lastInsertRowid));
V.push(Number(insVeh.run('京A3234学', '比亚迪e3').lastInsertRowid));

// ---------- 教练-车辆绑定：小陈绑两台车 ----------
const bind = db.prepare(`INSERT INTO instructor_vehicles (instructor_id, vehicle_id) VALUES (?, ?)`);
bind.run(I.chen, V[0]);
bind.run(I.chen, V[1]);
bind.run(I.liu, V[2]);
bind.run(I.zhao, V[3]);

// ---------- 学员 ----------
interface SeedStudent {
  no: number; // 返回的自增 ID 按下标取
  name: string;
  phone: string;
  enrollOffset: number;
  feeYuan: number;
  plan: 'full' | 'installments';
  hours: number;
  paidSeq: number[]; // 已缴清的期次
  subjects: ('pending' | 'passed')[]; // 科目一~四
  note?: string;
  overrideExpiryOffset?: number; // 相对今天的到期偏移（天），用于制造 60 天内到期
}

const students: SeedStudent[] = [
  { no: 0, name: '张伟', phone: '139-0001-0001', enrollOffset: -30, feeYuan: 4800, plan: 'installments', hours: 24, paidSeq: [1], subjects: ['passed', 'pending', 'pending', 'pending'] },
  {
    no: 1, name: '李娜', phone: '139-0001-0002', enrollOffset: -70, feeYuan: 4800, plan: 'installments', hours: 24,
    paidSeq: [1], // 二期（应缴日 = 报名+45 = 25 天前）逾期未缴
    subjects: ['passed', 'passed', 'pending', 'pending'], note: '二期逾期：科三练到一半，尾款风险户',
  },
  {
    no: 2, name: '王芳', phone: '139-0001-0003', enrollOffset: -690, feeYuan: 4800, plan: 'installments', hours: 30,
    paidSeq: [1, 2, 3], subjects: ['passed', 'passed', 'pending', 'pending'],
    overrideExpiryOffset: 40, note: '有效期 40 天后到期，列表应整行标黄',
  },
  { no: 3, name: '刘强', phone: '139-0001-0004', enrollOffset: -200, feeYuan: 4800, plan: 'installments', hours: 28, paidSeq: [1, 2, 3], subjects: ['passed', 'passed', 'passed', 'pending'] },
  { no: 4, name: '陈静', phone: '139-0001-0005', enrollOffset: -10, feeYuan: 4600, plan: 'installments', hours: 20, paidSeq: [1], subjects: ['passed', 'pending', 'pending', 'pending'] },
  { no: 5, name: '杨洋', phone: '139-0001-0006', enrollOffset: -300, feeYuan: 4800, plan: 'full', hours: 32, paidSeq: [1], subjects: ['passed', 'passed', 'passed', 'passed'], note: '已拿证' },
  { no: 6, name: '赵敏', phone: '139-0001-0007', enrollOffset: -5, feeYuan: 4500, plan: 'installments', hours: 20, paidSeq: [1], subjects: ['pending', 'pending', 'pending', 'pending'] },
  { no: 7, name: '孙磊', phone: '139-0001-0008', enrollOffset: -150, feeYuan: 4800, plan: 'installments', hours: 26, paidSeq: [1, 2, 3], subjects: ['passed', 'passed', 'pending', 'pending'] },
];

const insStudent = db.prepare(`
  INSERT INTO students (name, phone, enrollment_date, expiry_date, total_fee_cents, plan, purchased_hours, note, created_by)
  VALUES (@name, @phone, @enroll, @expiry, @fee, @plan, @hours, @note, @by)
`);
const insInstallment = db.prepare(`INSERT INTO installments (student_id, seq, due_date, amount_cents) VALUES (?, ?, ?, ?)`);
const insSubject = db.prepare(`INSERT INTO subject_records (student_id, subject_no, status, passed_date, updated_by) VALUES (?, ?, ?, ?, ?)`);

const S: number[] = [];

db.transaction(() => {
  for (const st of students) {
    const enrollDate = d(st.enrollOffset);
    const expiryDate = st.overrideExpiryOffset !== undefined ? d(st.overrideExpiryOffset) : addDays(enrollDate, 365 * 2);
    const fee = cents(st.feeYuan);
    const id = Number(insStudent.run({
      name: st.name, phone: st.phone, enroll: enrollDate, expiry: expiryDate,
      fee, plan: st.plan, hours: st.hours, note: st.note ?? '', by: OP.zhou,
    }).lastInsertRowid);
    S[st.no] = id;

    // 分期：三期均分，尾差放最后一期；应缴日 报名日/+45/+90
    const seqCount = st.plan === 'full' ? 1 : 3;
    const base = Math.floor(fee / seqCount);
    const amounts = seqCount === 1 ? [fee] : [base, base, fee - 2 * base];
    const offsets = seqCount === 1 ? [0] : [0, 45, 90];
    amounts.forEach((amount, idx) => {
      const seq = idx + 1;
      const r = insInstallment.run(id, seq, addDays(enrollDate, offsets[idx]), amount);
      const installmentId = Number(r.lastInsertRowid);
      if (st.paidSeq.includes(seq)) {
        db.prepare(
          `INSERT INTO payments (student_id, installment_id, amount_cents, paid_date, created_by, note)
           VALUES (?, ?, ?, ?, ?, '种子数据')`,
        ).run(id, installmentId, amount, addDays(enrollDate, offsets[idx] + 3), OP.zhou);
      }
    });

    st.subjects.forEach((status, idx) => {
      const subjectNo = idx + 1;
      insSubject.run(
        id, subjectNo, status,
        status === 'passed' ? addDays(enrollDate, 20 + subjectNo * 15) : null,
        OP.zhou,
      );
    });
  }
})();

// ---------- 课表 ----------
// [日期偏移, 教练, 车下标, 学员下标, 开始小时, 科目, 状态]
type Row = [number, keyof typeof I, number, number, number, 2 | 3, 'booked' | 'completed'];

// 已消课记录锚定在「本月」，保证当月导出的带教课时表始终有数：
// 每月 4 号以后排在前 3 天；1-3 号则排今天起 3 天（种子预置消课）。
const dom = new Date().getDate();
const compOffsets = dom >= 4 ? [-3, -2, -1] : dom === 3 ? [-2, -1, 0] : dom === 2 ? [-1, 0, 1] : [0, 1, 2];
// 消课记录用晚间 18/19/20 点，与白天约课时段（8-17）错开，不污染冲突校验场景

const schedule: Row[] = [
  // 本月已消课（保证月末带教课时表有数）
  [compOffsets[0], 'chen', 0, 0, 18, 2, 'completed'],
  [compOffsets[0], 'liu', 2, 3, 19, 3, 'completed'],
  [compOffsets[0], 'zhao', 3, 2, 20, 3, 'completed'],
  [compOffsets[1], 'chen', 1, 4, 18, 2, 'completed'],
  [compOffsets[1], 'liu', 2, 7, 19, 2, 'completed'],
  [compOffsets[2], 'chen', 0, 3, 18, 3, 'completed'],
  [compOffsets[2], 'zhao', 3, 6, 19, 2, 'completed'],

  // 未来一周课表（offset 0 = 今天）
  [0, 'chen', 0, 0, 8, 2, 'booked'],
  [0, 'chen', 1, 3, 9, 2, 'booked'],
  [0, 'liu', 2, 2, 10, 3, 'booked'],
  [0, 'zhao', 3, 4, 14, 2, 'booked'],

  [1, 'chen', 0, 3, 8, 2, 'booked'],
  [1, 'liu', 2, 0, 9, 2, 'booked'],
  [1, 'zhao', 3, 2, 10, 3, 'booked'],
  [1, 'chen', 1, 4, 13, 2, 'booked'],
  [1, 'liu', 2, 6, 14, 2, 'booked'],

  [2, 'chen', 0, 2, 8, 3, 'booked'],
  [2, 'zhao', 3, 3, 9, 3, 'booked'],
  [2, 'liu', 2, 7, 13, 2, 'booked'],
  [2, 'chen', 1, 0, 15, 2, 'booked'],

  [3, 'chen', 0, 6, 8, 2, 'booked'],
  [3, 'liu', 2, 7, 10, 2, 'booked'],
  [3, 'zhao', 3, 0, 14, 2, 'booked'],

  [4, 'chen', 1, 2, 9, 3, 'booked'],
  [4, 'liu', 2, 4, 11, 2, 'booked'],
  [4, 'zhao', 3, 3, 15, 3, 'booked'],

  [5, 'chen', 0, 3, 8, 3, 'booked'],
  [5, 'liu', 2, 6, 10, 2, 'booked'],
  [5, 'zhao', 3, 7, 16, 2, 'booked'],

  [6, 'chen', 0, 0, 9, 3, 'booked'],
  [6, 'zhao', 3, 2, 10, 3, 'booked'],
  [6, 'liu', 2, 4, 13, 2, 'booked'],
  [6, 'chen', 1, 6, 16, 2, 'booked'],
];

const insBooking = db.prepare(`
  INSERT INTO bookings (student_id, instructor_id, vehicle_id, subject_no, lesson_date, start_min, end_min,
                        status, created_by, completed_by, completed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

db.transaction(() => {
  for (const [off, insKey, vi, si, hour, subject, status] of schedule) {
    const r = insBooking.run(
      S[si], I[insKey], V[vi], subject, d(off),
      hour * 60, hour * 60 + 60, status,
      OP.zhou,
      status === 'completed' ? OP.chen : null,
      status === 'completed' ? d(off) : null,
    );
    const bookingId = Number(r.lastInsertRowid);
    if (status === 'completed') {
      db.prepare(
        `INSERT INTO lesson_ledger (student_id, booking_id, delta_hours, reason, operator_id)
         VALUES (?, ?, -1, '上课消课', ?)`,
      ).run(S[si], bookingId, OP.chen);
      db.prepare(
        `INSERT INTO coaching_logs
           (booking_id, student_id, instructor_id, vehicle_id, subject_no, lesson_date, start_min, end_min, completed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(bookingId, S[si], I[insKey], V[vi], subject, d(off), hour * 60, hour * 60 + 60, OP.chen);
    }
  }
})();

console.log(`✅ 种子数据完成（数据库：${dbPath}，本地今天：${today}）`);
console.log(`   学员 ${students.length} 名；教练 3 名；车辆 4 台；约课 ${schedule.length} 条`);
console.log(`   验收重点：李娜(id=${S[1]}) 二期逾期；王芳(id=${S[2]}) 40 天后到期应标黄`);
db.close();
