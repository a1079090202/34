import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA_SQL } from './schema';

// 默认数据库放店里旧主机的项目目录 data/ 下；测试通过环境变量指到内存库。
// 注意：默认路径必须惰性读取——本模块会先于测试文件里的 env 赋值被 import 求值。
const DEFAULT_DB_PATH = './data/driving-school.db';

declare global {
  // eslint-disable-next-line no-var
  var __drivingSchoolDb: Database.Database | undefined;
}

export function createDb(dbPath: string = process.env.DRIVING_SCHOOL_DB || DEFAULT_DB_PATH): Database.Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}

// Next dev 热重载时复用同一个连接
export function getDb(): Database.Database {
  if (!globalThis.__drivingSchoolDb) {
    globalThis.__drivingSchoolDb = createDb();
  }
  return globalThis.__drivingSchoolDb;
}
