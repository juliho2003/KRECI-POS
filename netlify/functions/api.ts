import { connectLambda, getStore } from '@netlify/blobs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import serverless from 'serverless-http';
import { createApiApp } from '../../server/createApp.ts';
import { getDatabaseDriver, initDatabase, setDatabaseDriver } from '../../server/db.ts';
import { createSqlJsDriver } from '../../server/sqliteAdapter.ts';

const STORE_NAME = 'kr-oncue-pos';
const BLOB_KEY = 'kr_oncue.sqlite';
const TMP_DB_PATH = path.join(os.tmpdir(), 'kr_oncue_netlify.sqlite');
const SERVER_START_TIME = Date.now();

let currentEtag: string | null = null;
let dbInitialized = false;
let blobsAvailable = false;

const app = createApiApp({
  runtime: 'netlify',
  realtimeMode: 'polling',
  port: 443,
  serverStartTime: SERVER_START_TIME,
});

const serverlessHandler = serverless(app, {
  binary: ['application/octet-stream'],
});

type NetlifyEvent = {
  httpMethod?: string;
  blobs?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
};

function getBlobStoreSafe() {
  try {
    return getStore({ name: STORE_NAME, consistency: 'strong' });
  } catch {
    return null;
  }
}

async function ensureServerlessDb(event: NetlifyEvent): Promise<void> {
  if (event.blobs) {
    try {
      connectLambda(event as unknown as Parameters<typeof connectLambda>[0]);
      blobsAvailable = true;
    } catch {
      blobsAvailable = false;
    }
  }

  const store = getBlobStoreSafe();
  if (store) {
    blobsAvailable = true;
    try {
      const meta = await store.getMetadata(BLOB_KEY, { consistency: 'strong' });
      const remoteEtag = meta?.etag ?? null;

      if (!dbInitialized || (remoteEtag && remoteEtag !== currentEtag)) {
        let initialBytes: Uint8Array | null = null;
        if (remoteEtag) {
          const buf = await store.get(BLOB_KEY, { type: 'arrayBuffer', consistency: 'strong' });
          if (buf) {
            initialBytes = new Uint8Array(buf);
          }
        }
        const driver = await createSqlJsDriver(initialBytes, `netlify-blobs://${STORE_NAME}/${BLOB_KEY}`);
        setDatabaseDriver(driver);
        initDatabase();
        dbInitialized = true;
        currentEtag = remoteEtag;

        // Seed initial DB into Netlify Blobs on very first boot
        if (!remoteEtag) {
          const exported = driver.exportBytes();
          if (exported) {
            const ab = exported.buffer.slice(exported.byteOffset, exported.byteOffset + exported.byteLength) as ArrayBuffer;
            const res = await store.set(BLOB_KEY, ab);
            currentEtag = res.etag ?? null;
          }
        }
        return;
      }
      return;
    } catch {
      // Fall through to /tmp fallback if Blobs store cannot be reached (e.g., local offline dev)
      blobsAvailable = false;
    }
  }

  if (!dbInitialized) {
    let initialBytes: Uint8Array | null = null;
    if (fs.existsSync(TMP_DB_PATH)) {
      initialBytes = new Uint8Array(fs.readFileSync(TMP_DB_PATH));
    }
    const driver = await createSqlJsDriver(initialBytes, TMP_DB_PATH);
    setDatabaseDriver(driver);
    initDatabase();
    dbInitialized = true;
    const exported = driver.exportBytes();
    if (exported) {
      fs.writeFileSync(TMP_DB_PATH, Buffer.from(exported));
    }
  }
}

async function persistServerlessDb(): Promise<void> {
  const driver = getDatabaseDriver();
  const exported = driver.exportBytes();
  if (!exported) return;

  try {
    fs.writeFileSync(TMP_DB_PATH, Buffer.from(exported));
  } catch {
    // ignore /tmp write failure
  }

  if (!blobsAvailable) return;
  const store = getBlobStoreSafe();
  if (!store) return;

  try {
    const ab = exported.buffer.slice(exported.byteOffset, exported.byteOffset + exported.byteLength) as ArrayBuffer;
    const writeRes = await store.set(BLOB_KEY, ab);
    if (writeRes?.etag) {
      currentEtag = writeRes.etag;
    }
  } catch (err) {
    console.error('Failed to persist SQLite state to Netlify Blobs:', err);
  }
}

export const handler = async (event: NetlifyEvent, context: Record<string, unknown> = {}) => {
  await ensureServerlessDb(event);
  const response = (await serverlessHandler(event, context)) as { statusCode?: number; [key: string]: unknown };
  const method = String(event.httpMethod || 'GET').toUpperCase();
  if (
    (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE') &&
    (response?.statusCode ?? 500) < 400
  ) {
    await persistServerlessDb();
  }
  return response;
};
