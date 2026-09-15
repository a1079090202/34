// 验收辅助：把进程看到的系统时间整体拨快 FAKE_DAYS_OFFSET 天（仅测试用）。
// 用法：FAKE_DAYS_OFFSET=2 node --import ./scripts/fake-clock.mjs node_modules/next/dist/bin/next start -p 3001
const RealDate = globalThis.Date;
const offsetDays = Number(process.env.FAKE_DAYS_OFFSET || 0) * 86400_000;

if (offsetDays) {
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(new RealDate().getTime() + offsetDays);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offsetDays;
    }
  }
  // @ts-expect-error 测试期替换全局 Date
  globalThis.Date = FakeDate;
}
