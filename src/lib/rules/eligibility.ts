// 规则模块 4：约课资格——两年有效期 + 课时余额。纯函数，输入数据、输出拦截原因，不碰数据库。

export interface HoursBalance {
  purchasedHours: number; // 购买总课时
  consumedHours: number; // 已消课（lesson_ledger 汇总，completed 单数）
  bookedCount: number; // 已约未消（status='booked'）占用的课时数
}

export type EligibilityReason = 'validity_expired' | 'hours_exhausted';

export interface EligibilityBlock {
  reason: EligibilityReason;
  message: string;
}

/**
 * 有效期闸门：上课日期不得晚于两年有效期到期日（到期日当天仍可约，次日起拦）。
 * 定宽 ISO 日期串字典序即时间序。
 */
export function checkLessonExpiry(lessonDate: string, expiryDate: string): EligibilityBlock | null {
  if (lessonDate > expiryDate) {
    return {
      reason: 'validity_expired',
      message: `学员有效期已于 ${expiryDate} 到期，约课日期不能晚于到期日，请先办理续期`,
    };
  }
  return null;
}

/**
 * 课时余额闸门：已消课 + 已约未消占用 + 本单 不得超过购买课时。
 * 取消单不占位；已约未消与已消课互斥（消课后状态转为 completed，不再计入 booked），不会重复计数。
 */
export function checkHoursBalance(balance: HoursBalance): EligibilityBlock | null {
  const used = balance.consumedHours + balance.bookedCount;
  if (used + 1 > balance.purchasedHours) {
    const remaining = Math.max(0, balance.purchasedHours - used);
    return {
      reason: 'hours_exhausted',
      message:
        `课时余额不足：购买 ${balance.purchasedHours} 课时，已消 ${balance.consumedHours}、已约未消 ${balance.bookedCount}，` +
        `当前剩余可约 ${remaining} 课时，请先加购课时`,
    };
  }
  return null;
}
