// 数据库行类型
export interface OperatorRow {
  id: number;
  name: string;
  role: 'front_desk' | 'instructor' | 'admin';
  active: number;
}

export interface StudentRow {
  id: number;
  name: string;
  phone: string;
  enrollment_date: string;
  expiry_date: string;
  total_fee_cents: number;
  plan: 'full' | 'installments';
  purchased_hours: number;
  note: string;
  created_by: number;
}

export interface InstallmentRow {
  id: number;
  student_id: number;
  seq: number;
  due_date: string;
  amount_cents: number;
  paid_cents: number; // 由 payments 聚合
}

export interface BookingRow {
  id: number;
  student_id: number;
  instructor_id: number;
  vehicle_id: number;
  subject_no: number;
  lesson_date: string;
  start_min: number;
  end_min: number;
  status: 'booked' | 'completed' | 'cancelled';
  created_by: number;
  completed_by: number | null;
  cancelled_by: number | null;
  cancel_reason: string;
}
