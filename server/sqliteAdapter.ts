import fs from 'fs';
import path from 'path';

export interface DbRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface DbStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): DbRunResult;
}

export interface DbDriver {
  isServerless: boolean;
  exec(sql: string): void;
  pragma(pragmaStatement: string): void;
  prepare(sql: string): DbStatement;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  backup(destPath: string): Promise<void>;
  exportBytes(): Uint8Array | null;
  getSizeBytes(): number;
  getDbPath(): string;
}

type SqlJsDatabase = {
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  run(sql: string, params?: unknown): void;
  prepare(sql: string): {
    bind(params?: unknown): boolean;
    step(): boolean;
    getAsObject(params?: unknown): Record<string, unknown>;
    free(): void;
  };
  getRowsModified(): number;
  export(): Uint8Array;
};

function sanitizeSqlValue(val: unknown): string | number | Uint8Array | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'number' || typeof val === 'string' || val instanceof Uint8Array) return val;
  if (typeof val === 'bigint') return Number(val);
  return String(val);
}

function normalizeSqlJsParams(sql: string, params: unknown[]): Record<string, string | number | Uint8Array | null> | Array<string | number | Uint8Array | null> | undefined {
  if (params.length === 0) return undefined;
  if (
    params.length === 1 &&
    params[0] !== null &&
    typeof params[0] === 'object' &&
    !Array.isArray(params[0]) &&
    !(params[0] instanceof Uint8Array)
  ) {
    const rawObj = params[0] as Record<string, unknown>;
    const bound: Record<string, string | number | Uint8Array | null> = {};
    // Only bind named parameters referenced in the SQL string so extra object properties do not fail
    const matches = sql.match(/[@:$][a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
    for (const token of matches) {
      const key = token.slice(1);
      if (key in rawObj) {
        bound[token] = sanitizeSqlValue(rawObj[key]);
      } else if (token in rawObj) {
        bound[token] = sanitizeSqlValue(rawObj[token]);
      }
    }
    return bound;
  }
  return params.map(sanitizeSqlValue);
}

export async function createSqlJsDriver(
  initialBytes?: Uint8Array | null,
  dbPathLabel = 'netlify-blobs://kr-oncue-pos/kr_oncue.sqlite'
): Promise<DbDriver> {
  const sqlModule = await import('sql.js/dist/sql-wasm-inline.js');
  const initSqlJs = (sqlModule.default || sqlModule) as () => Promise<{
    Database: new (data?: ArrayLike<number> | Buffer | null) => SqlJsDatabase;
  }>;
  const SQL = await initSqlJs();
  const sqlDb = initialBytes && initialBytes.byteLength > 0 ? new SQL.Database(initialBytes) : new SQL.Database();
  let txDepth = 0;

  return {
    isServerless: true,

    exec(sql: string) {
      sqlDb.exec(sql);
    },

    pragma(pragmaStatement: string) {
      const clean = pragmaStatement.trim();
      if (!clean) return;
      if (/^journal_mode\s*=/i.test(clean) || /^wal_checkpoint/i.test(clean)) {
        return;
      }
      sqlDb.exec(`PRAGMA ${clean};`);
    },

    prepare(sql: string): DbStatement {
      return {
        get(...params: unknown[]) {
          const stmt = sqlDb.prepare(sql);
          try {
            const normalized = normalizeSqlJsParams(sql, params);
            if (normalized !== undefined) {
              stmt.bind(normalized);
            }
            if (!stmt.step()) return undefined;
            return stmt.getAsObject();
          } finally {
            stmt.free();
          }
        },
        all(...params: unknown[]) {
          const stmt = sqlDb.prepare(sql);
          try {
            const normalized = normalizeSqlJsParams(sql, params);
            if (normalized !== undefined) {
              stmt.bind(normalized);
            }
            const rows: Record<string, unknown>[] = [];
            while (stmt.step()) {
              rows.push(stmt.getAsObject());
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params: unknown[]): DbRunResult {
          const normalized = normalizeSqlJsParams(sql, params);
          sqlDb.run(sql, normalized);
          const changes = sqlDb.getRowsModified();
          const idRes = sqlDb.exec('SELECT last_insert_rowid() AS id');
          const lastInsertRowid = Number(idRes[0]?.values?.[0]?.[0] ?? 0);
          return { changes, lastInsertRowid };
        },
      };
    },

    transaction<T extends (...args: any[]) => any>(fn: T): T {
      return ((...args: any[]) => {
        const sp = `sp_${txDepth}`;
        if (txDepth === 0) {
          sqlDb.exec('BEGIN');
        } else {
          sqlDb.exec(`SAVEPOINT ${sp}`);
        }
        txDepth += 1;
        try {
          const result = fn(...args);
          txDepth -= 1;
          if (txDepth === 0) {
            sqlDb.exec('COMMIT');
          } else {
            sqlDb.exec(`RELEASE SAVEPOINT ${sp}`);
          }
          return result;
        } catch (err) {
          txDepth -= 1;
          if (txDepth === 0) {
            try {
              sqlDb.exec('ROLLBACK');
            } catch {
              // ignore rollback errors if transaction already aborted
            }
          } else {
            try {
              sqlDb.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
              sqlDb.exec(`RELEASE SAVEPOINT ${sp}`);
            } catch {
              // ignore
            }
          }
          throw err;
        }
      }) as T;
    },

    async backup(destPath: string) {
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(destPath, Buffer.from(sqlDb.export()));
    },

    exportBytes() {
      return sqlDb.export();
    },

    getSizeBytes() {
      return sqlDb.export().byteLength;
    },

    getDbPath() {
      return dbPathLabel;
    },
  };
}
