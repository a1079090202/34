#!/usr/bin/env node
// 备份旧主机上的 SQLite 数据库：npm run backup
// 用 better-sqlite3 的在线 backup API，营业中也能安全拷（WAL 一并落盘）。
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dbPath = process.env.DRIVING_SCHOOL_DB || './data/driving-school.db';
const backupDir = './data/backups';
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

const now = new Date();
const stamp =
  `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` +
  `-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
const target = join(backupDir, `driving-school-${stamp}.db`);

const db = new Database(dbPath, { readonly: false });
db.backup(target)
  .then(() => {
    console.log(`✅ 已备份到 ${target}`);
    db.close();
  })
  .catch((err) => {
    console.error('备份失败：', err);
    db.close();
    process.exit(1);
  });
