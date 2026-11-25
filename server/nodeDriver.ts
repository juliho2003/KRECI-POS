import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { DbDriver } from './sqliteAdapter.ts';

export function createNodeSqliteDriver(dataDir?: string): DbDriver {
  const dir = dataDir || path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const dbPath = path.join(dir, 'kr_oncue.db');
  const nativeDb = new Database(dbPath);
  nativeDb.pragma('journal_mode = WAL');
  nativeDb.pragma('foreign_keys = ON');

  return {
    isServerless: false,
    exec(sql: string) {
      nativeDb.exec(sql);
    },
    pragma(pragmaStatement: string) {
      nativeDb.pragma(pragmaStatement);
    },
    prepare(sql: string) {
      return nativeDb.prepare(sql);
    },
    transaction<T extends (...args: any[]) => any>(fn: T): T {
      return nativeDb.transaction(fn) as unknown as T;
    },
    async backup(destPath: string) {
      await nativeDb.backup(destPath);
    },
    exportBytes() {
      return null;
    },
    getSizeBytes() {
      try {
        nativeDb.pragma('wal_checkpoint(PASSIVE)');
        return fs.statSync(dbPath).size;
      } catch {
        return 0;
      }
    },
    getDbPath() {
      return dbPath;
    },
  };
}
