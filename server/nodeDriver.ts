import fs from 'fs';
import path from 'path';
import { createSqlJsDriver, type DbDriver } from './sqliteAdapter.ts';

function persistAtomic(dbPath: string, bytes: Uint8Array | null): void {
  if (!bytes) return;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${dbPath}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.from(bytes));
  fs.renameSync(tmpPath, dbPath);
}

export async function createNodeSqliteDriver(dataDir?: string): Promise<DbDriver> {
  const dir = dataDir || path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const dbPath = path.join(dir, 'kr_oncue.db');

  let initialBytes: Uint8Array | null = null;
  if (fs.existsSync(dbPath)) {
    try {
      const raw = fs.readFileSync(dbPath);
      if (raw.byteLength >= 100) {
        // Normalize WAL format bytes (offset 18-19) if leftover from native WAL mode so sql.js can open cleanly
        if (raw[18] === 2 || raw[19] === 2) {
          raw[18] = 1;
          raw[19] = 1;
        }
        initialBytes = new Uint8Array(raw);
      }
    } catch {
      initialBytes = null;
    }
  }

  let flushing = false;
  const flushToDisk = (drv: DbDriver) => {
    if (flushing) return;
    flushing = true;
    try {
      persistAtomic(dbPath, drv.exportBytes());
      for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
        if (fs.existsSync(sidecar)) {
          try {
            fs.unlinkSync(sidecar);
          } catch {
            // ignore sidecar cleanup failure
          }
        }
      }
    } catch (err) {
      console.error('Failed to persist local SQLite database:', err);
    } finally {
      flushing = false;
    }
  };

  let driver: DbDriver;
  try {
    driver = await createSqlJsDriver(initialBytes, dbPath, {
      isServerless: false,
      onWrite: flushToDisk,
    });
    if (initialBytes) {
      // Verify database schema exists on load (guards against uncheckpointed legacy WAL files)
      const tbl = driver
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory' LIMIT 1")
        .get() as { name?: string } | undefined;
      if (!tbl?.name) {
        throw new Error('Legacy DB missing core tables');
      }
    }
  } catch {
    if (fs.existsSync(dbPath)) {
      const backupName = `${dbPath}.bak-${Date.now()}`;
      try {
        fs.renameSync(dbPath, backupName);
      } catch {
        // ignore backup rename failure
      }
    }
    driver = await createSqlJsDriver(null, dbPath, {
      isServerless: false,
      onWrite: flushToDisk,
    });
  }

  // Ensure db file exists on disk immediately
  if (!fs.existsSync(dbPath)) {
    flushToDisk(driver);
  }

  return driver;
}
