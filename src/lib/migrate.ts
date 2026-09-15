// 一次性迁移：给旧库的日期列补上 CHECK 守卫。
// SQLite 无法 ALTER TABLE ADD CONSTRAINT，只能按官方「表重建」流程换表。
// 幂等：已迁移过（user_version>=1 或所有目标表 DDL 已含标记）则零操作。
import type Database from 'better-sqlite3';
import {
  DATE_GUARD_TABLES,
  DATE_GUARD_MARKER,
  createTableSql,
  type TableDef,
} from './schema';

const SCHEMA_VERSION = 1;

function tableSql(db: Database.Database, name: string): string | undefined {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { sql: string } | undefined;
  return row?.sql ?? undefined;
}

/**
 * 给缺失日期守卫的表做原地重建。成功后把 user_version 置为 1。
 * 任一步失败（含 foreign_key_check 发现违例）都会随事务整体回滚，库保持原样。
 */
export function migrateDateGuards(db: Database.Database): void {
  if (Number(db.pragma('user_version', { simple: true })) >= SCHEMA_VERSION) return;

  // 只迁移「表已存在但 DDL 里还没有守卫标记」的表；全新库直接跳过重建。
  const pending: TableDef[] = DATE_GUARD_TABLES.filter((t) => {
    const sql = tableSql(db, t.name);
    return sql !== undefined && !sql.includes(DATE_GUARD_MARKER);
  });

  if (pending.length === 0) {
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    return;
  }

  // foreign_keys 的开关在事务内无效，必须在事务外切换；迁移完务必恢复。
  db.pragma('foreign_keys = OFF');
  try {
    const tx = db.transaction(() => {
      // 1) 先用临时名建新表（外键仍指向此刻存在的真实父表），并显式列拷数据。
      for (const t of pending) {
        db.exec(createTableSql(`${t.name}_new`, t.body, false));
        const cols = t.columns.join(', ');
        db.prepare(`INSERT INTO ${t.name}_new (${cols}) SELECT ${cols} FROM ${t.name}`).run();
      }
      // 2) 全部拷完后统一 DROP 旧表、RENAME 新表上位。
      //    DROP 不改写他表外键；被 RENAME 的 *_new 无人引用，故不会污染
      //    不参与重建的 lesson_ledger 的外键（默认 RENAME 才会改写引用）。
      for (const t of pending) db.exec(`DROP TABLE ${t.name}`);
      for (const t of pending) db.exec(`ALTER TABLE ${t.name}_new RENAME TO ${t.name}`);
      // 3) 重建显式索引（UNIQUE 自动索引已随建表恢复）。
      for (const t of pending) for (const ix of t.indexes) db.exec(ix);

      // 4) 提交前校验所有外键关系仍然成立。
      const violations = db.prepare(`PRAGMA foreign_key_check`).all();
      if (violations.length > 0) {
        throw new Error(`迁移中止：外键校验发现 ${violations.length} 条违例`);
      }
    });
    tx();
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
