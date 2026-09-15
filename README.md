# 驾校内部管理系统

给前台和教练在浏览器里用的店内小系统：学员建档、科目进度、两年有效期提醒、教练/车辆排课、学费分期闸门、消课带教、月末 CSV。
数据库是店里旧主机上的一个 SQLite 文件，无需另装数据库服务。

## 技术栈（钉死）

- **Next.js 14 App Router** + **React 18** + **TypeScript（strict）**
- **better-sqlite3**（同步、事务、单文件，WAL 模式）
- 服务端 **Route Handler** 收口：路由层只做参数校验，业务规则全部在服务端模块，**前端不算钱**
- 金额一律按**分（整数）**存储；时间一律按**本地日期** `YYYY-MM-DD`
- 测试：**Vitest**

## 快速开始

```bash
npm install        # 安装依赖（better-sqlite3 会编译原生模块）
npm run seed       # 写入样例数据（8 学员 / 3 教练 / 4 车 / 一周课表）
npm run dev        # 开发模式，http://localhost:3000
# 或生产方式：
npm run build && npm start
```

打开浏览器访问 <http://localhost:3000>，**先在右上角选择当前操作人**（前台/教练），所有约课、消课、收费都会记录这个人。

数据库文件：`data/driving-school.db`（首次启动自动建表）。换机器把整个文件拷走即可。

## 测试

```bash
npm test
```

28 个用例，覆盖需求指定的四条规则：

| 测试文件 | 覆盖内容 |
| --- | --- |
| `test/conflict.test.ts` | 同教练同时段冲突、同车同时段冲突（一车一时段一人）、背靠背不算冲突、取消单不占位、**同日 2 课时上限** |
| `test/tuition.test.ts` | **学费闸门**：逾期应收未收拦截、指明卡在哪一期、部分缴纳按欠额、应缴日当天不逾期 |
| `test/validity.test.ts` | **有效期倒计时**：60/59 天边界、到期日、已过期、**不足 60 天标黄**、时钟拨后两天倒计时同步 |
| `test/booking.service.test.ts` | 真实 SQLite 事务串联：闸门→冲突→上限→消课生成带教记录/课时账→操作人留痕 |

测试固定使用内存库（`:memory:`），不会碰 `data/` 里的营业数据。

## 备份与恢复

```bash
npm run backup     # 在线热备份到 data/backups/driving-school-YYYYMMDD-HHMMSS.db
```

用 SQLite 在线 backup API，营业中也能安全拷贝（WAL 已落盘）。建议在旧主机上加一条系统定时任务，例如每天晚上 9 点：

```cron
0 21 * * * cd /path/to/driving-school && npm run backup >> data/backups/backup.log 2>&1
```

恢复：停掉服务，把备份文件覆盖回 `data/driving-school.db`（连同同名 `-wal`、`-shm` 一起删掉）再启动。

## 样例数据（种子脚本日期相对“今天”生成）

| 对象 | 说明 |
| --- | --- |
| **李娜（id=2）** | 科二已过，**第二期学费 25 天前已到期未缴** —— 约课必被闸门拦下 |
| **王芳（id=3）** | **有效期 40 天后到期**，学员列表整行标黄 |
| 其余 6 人 | 覆盖一次付清、已拿证、新报名、科三在练等状态 |
| 小陈教练（id=1） | 绑定两台车（京A1234学、京A1235学），刘师傅、赵教练各一台 |
| 课表 | 今天起一周排课；另有本月 7 条已消课记录，保证月末报表有数 |

操作人：周敏（前台 id=1）、吴店长（管理员 id=2）、小陈/刘/赵教练（id=3/4/5）。

## 五步验收指南

系统日期为基准（今天的本地日期）。

1. **学费闸门**：约课页选「李娜」→ 任意教练时段提交，红条提示
   `学费闸门：二期学费已逾期（应缴日 …），欠缴 1600.00 元，补交后才能约课`。
   在学员页给李娜登记二期收款 1600 元后再约即放行。
2. **同时段冲突**：给「张伟」约小陈教练明天 **08:00**（该时段小陈已带刘强），
   提示 `教练该时段已有约课（08:00-09:00），请改约其他时段或教练`；时段下拉里已占时段标注「已约满」。
3. **同日两课时上限**：张伟明天已排两课时（09:00、11:00），再约第三单（哪怕换教练换车换时段）→
   `学员同一天限约 2 课时，当天已约 2 课时，请改天再约`。
4. **月末两张 CSV**：课表/消课页底部按钮，或直接访问
   - `/api/reports/instructor-hours.csv?month=YYYY-MM`（教练带教课时表）
   - `/api/reports/arrears.csv?month=YYYY-MM`（学员欠费表，分/元双列，UTF-8 BOM，Excel 直开不乱码）
5. **两天后标黄**：把旧主机系统时间往后调 2 天后重启（`npm start`），
   学员列表所有倒计时减少 2 天（王芳 40 → 38 天，仍黄）；到期日穿越 60 天边界的学员会新变黄。
   开发期可用仓库自带的时钟偏移工具在另一端口验证，不动系统时间：
   ```bash
   FAKE_DAYS_OFFSET=2 node --import ./scripts/fake-clock.mjs node_modules/next/dist/bin/next start -p 3001
   # 对比 http://localhost:3000/api/students 与 :3001 的 validity 字段
   ```

## 业务规则落点（各自独立模块，路由层不掺规则）

| 规则 | 模块 | 说明 |
| --- | --- | --- |
| 有效期倒计时 | `src/lib/rules/validity.ts` | 到期日 − 今天；`< 60` 天或已过期 → `highlight=true`，列表标黄 |
| 约课冲突/上限 | `src/lib/rules/conflict.ts` | 教练、车辆、学员本人三组时间重叠判定 + 同日 2 课时计数；取消单不占位；整点 1 课时 |
| 学费闸门 | `src/lib/rules/tuition.ts` | 存在 `应缴日 < 今天 且 已收 < 应收` 的分期即拦，返回期次/欠额；约课时在数据库事务内先过闸再查冲突 |

三者都是**纯函数**，输入数据、输出拦截原因，不碰数据库，可独立单测。

## 数据模型要点

- `students`：建档即自动生成有效期（报名日 +2 年）、4 条科目记录、1 或 3 条分期
  - 三期应缴日：报名当日 / +45 天 / +90 天，金额三等分、尾差放第三期
- `installments` / `payments`：分期应收与流水；支持部分缴款，超收拒绝
- `bookings`：约课单（booked / completed / cancelled），写入时事务内重查冲突防并发
- `lesson_ledger`：消课记 `-1`，学员课时账
- `coaching_logs`：消课时**自动生成**的教练带教记录，月末课时表从这里汇总
- 所有写表带操作人：`created_by` / `completed_by` / `cancelled_by` / `updated_by`

## HTTP API 一览

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET/POST | `/api/students` | 名册（含 validity/逾期标记）/ 报名建档 |
| POST | `/api/students/:id/subject` | 登记科目一~四通过/撤销 |
| GET | `/api/resources` | 教练、车辆及绑定关系 |
| GET | `/api/operators` | 操作人下拉 |
| GET/POST | `/api/bookings` | 查课表 / 约课（闸门+冲突+上限） |
| POST | `/api/bookings/:id/complete` | 消课（扣课时 + 生成带教记录） |
| DELETE | `/api/bookings/:id` | 取消约课 |
| POST | `/api/payments` | 登记收费（元入参→分，全程服务端） |
| GET | `/api/reports/instructor-hours.csv?month=YYYY-MM` | 教练带教课时表 |
| GET | `/api/reports/arrears.csv?month=YYYY-MM` | 学员欠费表 |

写操作需带请求头 `x-operator-id: <操作人ID>`。

## 目录结构

```
scripts/seed.ts            样例数据（幂等，可重跑）
scripts/backup.mjs         在线热备份
scripts/fake-clock.mjs     验收用时钟偏移（不入业务）
src/lib/rules/             三条独立规则（纯函数）
src/lib/services/          事务与数据库操作
src/app/api/               Route Handler（只做参数校验）
src/app/                   学员页 / 约课页 / 课表消课页
test/                      Vitest 单元与服务层集成测试
```
