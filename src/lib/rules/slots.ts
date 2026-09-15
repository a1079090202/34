// 统一排课时段：1 课时 = 60 分钟。start_min/end_min 为当日零点起的分钟数。
export const LESSON_MINUTES = 60;

export interface SlotDef {
  label: string;
  startMin: number;
  endMin: number;
}

function h(hour: number): SlotDef {
  return { label: `${String(hour).padStart(2, '0')}:00`, startMin: hour * 60, endMin: hour * 60 + LESSON_MINUTES };
}

// 上午 8-12，下午 13-18
export const LESSON_SLOTS: SlotDef[] = [
  h(8), h(9), h(10), h(11),
  h(13), h(14), h(15), h(16), h(17),
];

// 可约课的开始时刻集合——前端下拉与服务端校验共用这一份事实源，
// 避免出现「页面只能选营业时段、API 却能约凌晨/午休」的前后端漂移。
const BOOKABLE_START_MINUTES = new Set(LESSON_SLOTS.map((s) => s.startMin));

export function isBookableStartMinute(startMin: number): boolean {
  return Number.isInteger(startMin) && BOOKABLE_START_MINUTES.has(startMin);
}
