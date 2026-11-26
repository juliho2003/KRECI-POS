import fs from 'fs';
import os from 'os';
import path from 'path';
import { SEED_INVENTORY } from './seedInventory.ts';
import type { DbDriver } from './sqliteAdapter.ts';
import type {
  ActivityLogEntry,
  BudgetItem,
  BudgetRequest,
  BusinessStat,
  BusinessUnit,
  Client,
  DashboardSummary,
  EquipmentCategoryCode,
  InventoryItem,
  InventoryStatus,
  LineItem,
  MaintenanceSlip,
  Payment,
  PaymentStatus,
  Quote,
  QuoteStatus,
  Rental,
  RentalStatus,
  ServerSavepoint,
  ServerUser,
  ServerUserAccess,
  SharedDraft,
} from '../src/types.ts';

let db!: DbDriver;

export function setDatabaseDriver(driver: DbDriver): void {
  db = driver;
}

export function getDatabaseDriver(): DbDriver {
  if (!db) {
    throw new Error('Database driver has not been initialized');
  }
  return db;
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sequences (
      prefix TEXT PRIMARY KEY,
      current_val INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL DEFAULT '',
      focus_label TEXT NOT NULL DEFAULT '',
      accent_color TEXT NOT NULL DEFAULT '#d97706',
      is_default INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory (
      code TEXT PRIMARY KEY,
      business_id TEXT NOT NULL DEFAULT 'kr-oncue',
      category_code TEXT NOT NULL,
      category_name TEXT NOT NULL,
      name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      placement TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      qty_on_hand INTEGER NOT NULL DEFAULT 1,
      qty_out INTEGER NOT NULL DEFAULT 0,
      qty_reserved INTEGER NOT NULL DEFAULT 0,
      rental_rate REAL NOT NULL DEFAULT 0,
      condition TEXT NOT NULL DEFAULT 'Good',
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      remarks TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      organization TEXT NOT NULL DEFAULT '',
      contact_no TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_no TEXT NOT NULL UNIQUE,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      client_name TEXT NOT NULL,
      organization TEXT NOT NULL DEFAULT '',
      contact_no TEXT NOT NULL DEFAULT '',
      event_name TEXT NOT NULL DEFAULT '',
      venue TEXT NOT NULL DEFAULT '',
      event_date TEXT NOT NULL DEFAULT '',
      expected_return_date TEXT NOT NULL DEFAULT '',
      days INTEGER NOT NULL DEFAULT 1,
      delivery_charge REAL NOT NULL DEFAULT 0,
      discount_percent REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      converted_slip_no TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quote_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      inventory_code TEXT NOT NULL,
      equipment_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      rental_rate REAL NOT NULL DEFAULT 0,
      days INTEGER NOT NULL DEFAULT 1,
      amount REAL NOT NULL DEFAULT 0,
      remarks TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS rentals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slip_no TEXT NOT NULL UNIQUE,
      dr_no TEXT NOT NULL UNIQUE,
      return_no TEXT,
      quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      borrower_name TEXT NOT NULL,
      organization TEXT NOT NULL DEFAULT '',
      contact_no TEXT NOT NULL DEFAULT '',
      event_purpose TEXT NOT NULL DEFAULT '',
      venue TEXT NOT NULL DEFAULT '',
      date_issued TEXT NOT NULL,
      date_out TEXT NOT NULL,
      expected_return TEXT NOT NULL,
      return_date TEXT,
      days_overall INTEGER NOT NULL DEFAULT 1,
      subtotal REAL NOT NULL DEFAULT 0,
      delivery_charge REAL NOT NULL DEFAULT 0,
      discount_percent REAL NOT NULL DEFAULT 0,
      additional_charges REAL NOT NULL DEFAULT 0,
      total_rental_amount REAL NOT NULL DEFAULT 0,
      deposit_advance REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      condition_upon_release TEXT NOT NULL DEFAULT 'Good',
      condition_upon_return TEXT NOT NULL DEFAULT '',
      inspection_result TEXT NOT NULL DEFAULT '',
      released_by TEXT NOT NULL DEFAULT '',
      delivery_personnel TEXT NOT NULL DEFAULT '',
      vehicle_driver TEXT NOT NULL DEFAULT '',
      inspected_by TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'DISPATCHED',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rental_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rental_id INTEGER NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
      inventory_code TEXT NOT NULL,
      equipment_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      rental_rate REAL NOT NULL DEFAULT 0,
      days INTEGER NOT NULL DEFAULT 1,
      amount REAL NOT NULL DEFAULT 0,
      remarks TEXT NOT NULL DEFAULT '',
      condition_out TEXT NOT NULL DEFAULT 'Good',
      accessories TEXT NOT NULL DEFAULT '',
      qty_returned INTEGER NOT NULL DEFAULT 0,
      missing_qty INTEGER NOT NULL DEFAULT 0,
      damages TEXT NOT NULL DEFAULT '',
      add_charges REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no TEXT NOT NULL UNIQUE,
      rental_id INTEGER REFERENCES rentals(id) ON DELETE SET NULL,
      slip_no TEXT NOT NULL DEFAULT '',
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      received_from TEXT NOT NULL,
      organization TEXT NOT NULL DEFAULT '',
      contact_no TEXT NOT NULL DEFAULT '',
      event_purpose TEXT NOT NULL DEFAULT '',
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      payment_status TEXT NOT NULL DEFAULT 'Paid in Full',
      rental_charges REAL NOT NULL DEFAULT 0,
      delivery_charges REAL NOT NULL DEFAULT 0,
      additional_charges REAL NOT NULL DEFAULT 0,
      discount_percent REAL NOT NULL DEFAULT 0,
      total_amount_due REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      outstanding_balance REAL NOT NULL DEFAULT 0,
      amount_in_words TEXT NOT NULL DEFAULT '',
      reference_no TEXT NOT NULL DEFAULT '',
      received_by TEXT NOT NULL DEFAULT '',
      authorized_by TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance_slips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slip_no TEXT NOT NULL UNIQUE,
      inventory_code TEXT NOT NULL,
      equipment_name TEXT NOT NULL,
      brand_model TEXT NOT NULL DEFAULT '',
      location_storage TEXT NOT NULL DEFAULT '',
      date_requested TEXT NOT NULL,
      required_by TEXT NOT NULL DEFAULT '',
      requested_by TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      contact_no TEXT NOT NULL DEFAULT '',
      repair_type TEXT NOT NULL DEFAULT 'Corrective',
      priority_level TEXT NOT NULL DEFAULT 'Normal',
      reported_problem TEXT NOT NULL,
      proposed_repair TEXT NOT NULL DEFAULT '',
      safety_out_of_service INTEGER NOT NULL DEFAULT 1,
      estimated_parts_cost REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      other_cost REAL NOT NULL DEFAULT 0,
      actual_total_cost REAL NOT NULL DEFAULT 0,
      technician TEXT NOT NULL DEFAULT '',
      work_performed TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_no TEXT NOT NULL UNIQUE,
      date_requested TEXT NOT NULL,
      required_date TEXT NOT NULL DEFAULT '',
      requested_by TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT 'Production',
      contact_no TEXT NOT NULL DEFAULT '',
      expense_category TEXT NOT NULL DEFAULT 'Operations',
      priority TEXT NOT NULL DEFAULT 'Normal',
      purpose TEXT NOT NULL,
      event_name TEXT NOT NULL DEFAULT '',
      venue TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      payee_supplier TEXT NOT NULL DEFAULT '',
      requested_budget REAL NOT NULL DEFAULT 0,
      available_budget REAL NOT NULL DEFAULT 0,
      actual_spent REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      items_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shared_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      client_id INTEGER,
      client_name TEXT NOT NULL DEFAULT '',
      organization TEXT NOT NULL DEFAULT '',
      contact_no TEXT NOT NULL DEFAULT '',
      event_name TEXT NOT NULL DEFAULT '',
      venue TEXT NOT NULL DEFAULT '',
      date_out TEXT NOT NULL DEFAULT '',
      expected_return TEXT NOT NULL DEFAULT '',
      days INTEGER NOT NULL DEFAULT 1,
      delivery_charge REAL NOT NULL DEFAULT 0,
      discount_percent REAL NOT NULL DEFAULT 0,
      deposit_advance REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Cash',
      notes TEXT NOT NULL DEFAULT '',
      items_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS server_saves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      saved_by TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      counts_json TEXT NOT NULL DEFAULT '{}',
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS server_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'Team Member',
      color TEXT NOT NULL DEFAULT '#d97706',
      access_level TEXT NOT NULL DEFAULT 'EDITOR',
      can_edit INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      invite_token TEXT NOT NULL UNIQUE,
      added_by TEXT NOT NULL DEFAULT 'Host',
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const ensureColumn = (table: string, column: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  ensureColumn('inventory', 'business_id', "TEXT NOT NULL DEFAULT 'kr-oncue'");
  ensureColumn('inventory', 'image_url', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('quotes', 'business_id', "TEXT NOT NULL DEFAULT 'kr-oncue'");
  ensureColumn('rentals', 'business_id', "TEXT NOT NULL DEFAULT 'kr-oncue'");
  ensureColumn('rentals', 'is_internal', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('payments', 'business_id', "TEXT NOT NULL DEFAULT 'kr-oncue'");
  ensureColumn('shared_drafts', 'business_id', "TEXT NOT NULL DEFAULT 'kr-oncue'");
  ensureColumn('server_users', 'active_view', "TEXT NOT NULL DEFAULT 'pos'");
  ensureColumn('server_users', 'editing_key', 'TEXT');
  ensureColumn('server_users', 'device_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('server_users', 'device_name', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('server_users', 'device_ip', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('server_users', 'online_active', 'INTEGER NOT NULL DEFAULT 0');

  const nowInit = new Date().toISOString();
  db.prepare(
    "INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('serverLabel', 'KR-ONCUE Main Team Server', ?)"
  ).run(nowInit);
  db.prepare(
    "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('teamPinEnabled', 'false', ?)"
  ).run(nowInit);
  db.prepare(
    "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('teamPin', '', ?)"
  ).run(nowInit);
  db.prepare(
    "INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('lastManualSaveAt', '', ?)"
  ).run(nowInit);
  db.prepare(
    "INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES ('lastManualSaveBy', '', ?)"
  ).run(nowInit);

  const bizCount = db.prepare('SELECT COUNT(*) as cnt FROM businesses').get() as { cnt: number };
  if (bizCount.cnt === 0) {
    const insBiz = db.prepare(`
      INSERT INTO businesses (id, code, name, tagline, focus_label, accent_color, is_default, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);
    insBiz.run('kr-oncue', 'ONCUE', 'KR-ONCUE', 'Audio, Lights & LED Wall', 'AV Production & LED Wall', '#d97706', 1, nowInit);
  }

  const omittedSecondary = db
    .prepare("SELECT value FROM app_settings WHERE key = 'omittedSecondaryKrBusinessesV1'")
    .get() as { value: string } | undefined;
  if (!omittedSecondary) {
    const omitTx = db.transaction(() => {
      const legacyIds = ['event-staging', 'photo-video', 'power-logistics'];
      const placeholders = legacyIds.map(() => '?').join(', ');
      db.prepare(`UPDATE inventory SET business_id = 'kr-oncue' WHERE business_id IN (${placeholders})`).run(...legacyIds);
      db.prepare(`UPDATE quotes SET business_id = 'kr-oncue' WHERE business_id IN (${placeholders})`).run(...legacyIds);
      db.prepare(`UPDATE rentals SET business_id = 'kr-oncue' WHERE business_id IN (${placeholders})`).run(...legacyIds);
      db.prepare(`UPDATE payments SET business_id = 'kr-oncue' WHERE business_id IN (${placeholders})`).run(...legacyIds);
      db.prepare(`UPDATE shared_drafts SET business_id = 'kr-oncue' WHERE business_id IN (${placeholders})`).run(...legacyIds);
      db.prepare(`DELETE FROM businesses WHERE id IN (${placeholders})`).run(...legacyIds);
      db.prepare(
        "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('omittedSecondaryKrBusinessesV1', 'true', ?)"
      ).run(nowInit);
    });
    omitTx();
  }

  const cleanedAutoOps = db
    .prepare("SELECT value FROM app_settings WHERE key = 'cleanedAutoOperatorUsersV1'")
    .get() as { value: string } | undefined;
  if (!cleanedAutoOps) {
    db.prepare("DELETE FROM server_users WHERE added_by = 'Shared Web Link' AND access_level != 'OWNER'").run();
    db.prepare(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('cleanedAutoOperatorUsersV1', 'true', ?)"
    ).run(nowInit);
  }

  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM server_users').get() as { cnt: number };
  if (userCount.cnt === 0) {
    db.prepare(`
      INSERT INTO server_users (
        client_id, name, email, role, color, access_level, can_edit, status,
        invite_token, added_by, last_seen_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'host-owner',
      'KR-ONCUE Host',
      '',
      'Server Owner',
      '#d97706',
      'OWNER',
      1,
      'ACTIVE',
      'host-owner-key',
      'System',
      nowInit,
      nowInit
    );
  }

  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM inventory').get() as { cnt: number };
  if (countRow.cnt === 0) {
    const now = new Date().toISOString();
    const insertInv = db.prepare(`
      INSERT INTO inventory (
        code, business_id, category_code, category_name, name, brand, placement, location,
        qty_on_hand, qty_out, qty_reserved, rental_rate, condition, status, remarks, image_url, updated_at
      ) VALUES (
        @code, @businessId, @categoryCode, @categoryName, @name, @brand, @placement, @location,
        @qtyOnHand, 0, 0, @rentalRate, @condition, @status, @remarks, @imageUrl, @updatedAt
      )
    `);
    const seedAll = db.transaction(() => {
      for (const item of SEED_INVENTORY) {
        insertInv.run({
          ...item,
          businessId: item.businessId ?? 'kr-oncue',
          imageUrl: item.imageUrl ?? '',
          updatedAt: now,
        });
      }
    });
    seedAll();
  }

  const omittedOtherCat = db
    .prepare("SELECT value FROM app_settings WHERE key = 'omittedOtherEquipmentCategoryV1'")
    .get() as { value: string } | undefined;
  if (!omittedOtherCat) {
    db.prepare("DELETE FROM inventory WHERE category_code = 'OR'").run();
    db.prepare(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('omittedOtherEquipmentCategoryV1', 'true', ?)"
    ).run(nowInit);
  }

  const omittedSeedClients = db
    .prepare("SELECT value FROM app_settings WHERE key = 'omittedSeedClientsV1'")
    .get() as { value: string } | undefined;
  if (!omittedSeedClients) {
    db.prepare('DELETE FROM clients').run();
    db.prepare(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('omittedSeedClientsV1', 'true', ?)"
    ).run(nowInit);
  }
}

function nextSequence(prefix: string): string {
  const row = db.prepare('SELECT current_val FROM sequences WHERE prefix = ?').get(prefix) as
    | { current_val: number }
    | undefined;
  const nextVal = (row?.current_val ?? 0) + 1;
  db.prepare(
    'INSERT INTO sequences (prefix, current_val) VALUES (?, ?) ON CONFLICT(prefix) DO UPDATE SET current_val = excluded.current_val'
  ).run(prefix, nextVal);
  return `${prefix}-2026-${String(nextVal).padStart(4, '0')}`;
}

function sanitizeImageUrl(raw?: string): string {
  const val = String(raw ?? '').trim();
  if (!val) return '';
  if (val.length > 2_200_000) {
    throw new Error('Equipment image is too large (max 2MB)');
  }
  if (val.startsWith('/src/assets/') || val.startsWith('/assets/')) {
    return val;
  }
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(val)) {
    return val;
  }
  try {
    const parsed = new URL(val);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return val;
    }
  } catch {
    // invalid URL
  }
  throw new Error('Unsupported image format or URL. Upload a PNG/JPG/WebP image or provide an http(s) URL.');
}

function mapBusinessRow(r: Record<string, unknown>): BusinessUnit {
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    tagline: String(r.tagline ?? ''),
    focusLabel: String(r.focus_label ?? ''),
    accentColor: String(r.accent_color ?? '#d97706'),
    isDefault: Boolean(r.is_default),
    active: r.active === undefined ? true : Boolean(r.active),
    createdAt: String(r.created_at),
  };
}

export function getBusinesses(): BusinessUnit[] {
  const rows = db.prepare('SELECT * FROM businesses ORDER BY is_default DESC, created_at ASC').all() as Record<
    string,
    unknown
  >[];
  return rows.map(mapBusinessRow);
}

export function getBusinessById(id: string): BusinessUnit | undefined {
  const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapBusinessRow(row) : undefined;
}

export function createBusiness(input: {
  code: string;
  name: string;
  tagline?: string;
  focusLabel?: string;
  accentColor?: string;
}): BusinessUnit {
  const now = new Date().toISOString();
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12);
  const name = input.name.trim();
  if (!code || !name) {
    throw new Error('Business code and name are required');
  }
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  const id = `${slug || 'biz'}-${Math.random().toString(36).slice(2, 6)}`;
  const existingCode = db.prepare('SELECT id FROM businesses WHERE code = ?').get(code);
  if (existingCode) {
    throw new Error(`Business code ${code} already exists`);
  }
  db.prepare(`
    INSERT INTO businesses (id, code, name, tagline, focus_label, accent_color, is_default, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)
  `).run(
    id,
    code,
    name,
    (input.tagline ?? '').trim(),
    (input.focusLabel ?? '').trim() || 'General Equipment Rental',
    input.accentColor || '#0284c7',
    now
  );
  return getBusinessById(id)!;
}

export function updateBusiness(
  id: string,
  patch: Partial<{
    code: string;
    name: string;
    tagline: string;
    focusLabel: string;
    accentColor: string;
    active: boolean;
  }>
): BusinessUnit {
  const existing = getBusinessById(id);
  if (!existing) throw new Error('Business unit not found');
  const nextCode =
    patch.code !== undefined
      ? patch.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12) || existing.code
      : existing.code;
  if (nextCode !== existing.code) {
    const dup = db.prepare('SELECT id FROM businesses WHERE code = ? AND id != ?').get(nextCode, id);
    if (dup) throw new Error(`Business code ${nextCode} already exists`);
  }
  db.prepare(`
    UPDATE businesses
    SET code = ?, name = ?, tagline = ?, focus_label = ?, accent_color = ?, active = ?
    WHERE id = ?
  `).run(
    nextCode,
    patch.name !== undefined ? patch.name.trim() || existing.name : existing.name,
    patch.tagline !== undefined ? patch.tagline.trim() : existing.tagline,
    patch.focusLabel !== undefined ? patch.focusLabel.trim() : existing.focusLabel,
    patch.accentColor ?? existing.accentColor,
    existing.isDefault ? 1 : patch.active !== undefined ? (patch.active ? 1 : 0) : existing.active ? 1 : 0,
    id
  );
  return getBusinessById(id)!;
}

export function deleteBusiness(id: string): void {
  const existing = getBusinessById(id);
  if (!existing) throw new Error('Business unit not found');
  if (existing.isDefault || id === 'kr-oncue') {
    throw new Error('Cannot delete the primary KR-ONCUE business unit');
  }
  const invCnt = (db.prepare('SELECT COUNT(*) as cnt FROM inventory WHERE business_id = ?').get(id) as { cnt: number }).cnt;
  const rentCnt = (db.prepare('SELECT COUNT(*) as cnt FROM rentals WHERE business_id = ?').get(id) as { cnt: number }).cnt;
  if (invCnt > 0 || rentCnt > 0) {
    throw new Error('Cannot delete a business with linked inventory or rentals. Archive/deactivate it instead.');
  }
  db.prepare('DELETE FROM businesses WHERE id = ?').run(id);
}

function mapInventoryRow(r: Record<string, unknown>): InventoryItem {
  const qtyOnHand = Number(r.qty_on_hand);
  const qtyOut = Number(r.qty_out);
  const qtyReserved = Number(r.qty_reserved);
  const status = String(r.status) as InventoryStatus;
  const qtyAvailable = status === 'MAINTENANCE' ? 0 : Math.max(0, qtyOnHand - qtyOut - qtyReserved);
  return {
    code: String(r.code),
    businessId: String(r.business_id ?? 'kr-oncue'),
    categoryCode: String(r.category_code) as EquipmentCategoryCode,
    categoryName: String(r.category_name),
    name: String(r.name),
    brand: String(r.brand ?? ''),
    placement: String(r.placement ?? ''),
    location: String(r.location ?? ''),
    qtyOnHand,
    qtyOut,
    qtyReserved,
    qtyAvailable,
    rentalRate: Number(r.rental_rate),
    condition: String(r.condition ?? 'Good'),
    status,
    remarks: String(r.remarks ?? ''),
    imageUrl: String(r.image_url ?? ''),
    updatedAt: String(r.updated_at),
  };
}

function recomputeItemStatus(code: string): void {
  const row = db
    .prepare('SELECT qty_on_hand, qty_out, qty_reserved, status FROM inventory WHERE code = ?')
    .get(code) as
    | { qty_on_hand: number; qty_out: number; qty_reserved: number; status: string }
    | undefined;
  if (!row || row.status === 'MAINTENANCE') return;

  const avail = row.qty_on_hand - row.qty_out - row.qty_reserved;
  let newStatus: InventoryStatus = 'AVAILABLE';
  if (avail <= 0) {
    newStatus = row.qty_out > 0 ? 'RENTED' : 'RESERVED';
  }
  db.prepare('UPDATE inventory SET status = ?, updated_at = ? WHERE code = ?').run(
    newStatus,
    new Date().toISOString(),
    code
  );
}

export function getInventory(filters?: {
  category?: string;
  status?: string;
  businessId?: string;
  q?: string;
}): InventoryItem[] {
  let sql = 'SELECT * FROM inventory WHERE 1=1';
  const params: string[] = [];
  if (filters?.businessId && filters.businessId !== 'ALL') {
    sql += ' AND business_id = ?';
    params.push(filters.businessId);
  }
  if (filters?.category && filters.category !== 'ALL') {
    sql += ' AND category_code = ?';
    params.push(filters.category);
  }
  if (filters?.status && filters.status !== 'ALL') {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters?.q) {
    sql += ' AND (code LIKE ? OR name LIKE ? OR brand LIKE ? OR placement LIKE ? OR location LIKE ?)';
    const like = `%${filters.q}%`;
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY category_code, code';
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapInventoryRow);
}

export function createInventoryItem(input: {
  code: string;
  businessId?: string;
  categoryCode: EquipmentCategoryCode;
  categoryName: string;
  name: string;
  brand?: string;
  placement?: string;
  location?: string;
  qtyOnHand: number;
  rentalRate: number;
  condition?: string;
  remarks?: string;
  imageUrl?: string;
}): InventoryItem {
  const now = new Date().toISOString();
  const code = input.code.trim().toUpperCase();
  const existing = db.prepare('SELECT code FROM inventory WHERE code = ?').get(code);
  if (existing) {
    throw new Error(`Inventory code ${code} already exists`);
  }
  const businessId = (input.businessId ?? 'kr-oncue').trim() || 'kr-oncue';
  const imageUrl = sanitizeImageUrl(input.imageUrl);
  db.prepare(`
    INSERT INTO inventory (
      code, business_id, category_code, category_name, name, brand, placement, location,
      qty_on_hand, qty_out, qty_reserved, rental_rate, condition, status, remarks, image_url, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'AVAILABLE', ?, ?, ?)
  `).run(
    code,
    businessId,
    input.categoryCode,
    input.categoryName,
    input.name.trim(),
    (input.brand ?? '').trim(),
    (input.placement ?? '').trim(),
    (input.location ?? '').trim(),
    Math.max(1, Number(input.qtyOnHand) || 1),
    Math.max(0, Number(input.rentalRate) || 0),
    input.condition ?? 'Good',
    input.remarks ?? '',
    imageUrl,
    now
  );
  const created = db.prepare('SELECT * FROM inventory WHERE code = ?').get(code) as Record<string, unknown>;
  return mapInventoryRow(created);
}

export function updateInventoryItem(
  code: string,
  patch: Partial<{
    businessId: string;
    categoryCode: EquipmentCategoryCode;
    categoryName: string;
    name: string;
    brand: string;
    placement: string;
    location: string;
    qtyOnHand: number;
    rentalRate: number;
    condition: string;
    status: InventoryStatus;
    remarks: string;
    imageUrl: string;
  }>
): InventoryItem {
  const row = db.prepare('SELECT * FROM inventory WHERE code = ?').get(code) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    throw new Error(`Inventory item ${code} not found`);
  }
  const now = new Date().toISOString();
  const qtyOnHand = patch.qtyOnHand !== undefined ? Math.max(0, Number(patch.qtyOnHand)) : Number(row.qty_on_hand);
  const rentalRate = patch.rentalRate !== undefined ? Math.max(0, Number(patch.rentalRate)) : Number(row.rental_rate);
  const status = patch.status ?? (String(row.status) as InventoryStatus);
  const imageUrl = patch.imageUrl !== undefined ? sanitizeImageUrl(patch.imageUrl) : String(row.image_url ?? '');

  db.prepare(`
    UPDATE inventory
    SET business_id = ?, category_code = ?, category_name = ?, name = ?, brand = ?, placement = ?, location = ?, qty_on_hand = ?,
        rental_rate = ?, condition = ?, status = ?, remarks = ?, image_url = ?, updated_at = ?
    WHERE code = ?
  `).run(
    patch.businessId ?? String(row.business_id ?? 'kr-oncue'),
    patch.categoryCode ?? String(row.category_code),
    patch.categoryName ?? String(row.category_name),
    patch.name ?? String(row.name),
    patch.brand ?? String(row.brand),
    patch.placement ?? String(row.placement),
    patch.location ?? String(row.location),
    qtyOnHand,
    rentalRate,
    patch.condition ?? String(row.condition),
    status,
    patch.remarks ?? String(row.remarks),
    imageUrl,
    now,
    code
  );
  if (patch.status !== 'MAINTENANCE') {
    recomputeItemStatus(code);
  }
  const updated = db.prepare('SELECT * FROM inventory WHERE code = ?').get(code) as Record<string, unknown>;
  return mapInventoryRow(updated);
}

export function deleteInventoryItem(code: string): void {
  const row = db.prepare('SELECT * FROM inventory WHERE code = ?').get(code) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Inventory item ${code} not found`);
  if (Number(row.qty_out) > 0 || Number(row.qty_reserved) > 0) {
    throw new Error(`Cannot delete ${code} while units are currently rented out or reserved`);
  }
  db.prepare('DELETE FROM inventory WHERE code = ?').run(code);
}

export function getClients(): Client[] {
  const rows = db
    .prepare(`
      SELECT c.*,
        COALESCE((SELECT SUM(p.amount_paid) FROM payments p WHERE p.client_id = c.id), 0) as total_spent,
        COALESCE((SELECT COUNT(*) FROM rentals r WHERE r.client_id = c.id AND r.status IN ('RESERVED', 'DISPATCHED', 'PARTIAL_RETURN')), 0) as active_rentals,
        COALESCE((SELECT COUNT(*) FROM quotes q WHERE q.client_id = c.id), 0) as quote_count
      FROM clients c
      ORDER BY c.id DESC
    `)
    .all() as Record<string, unknown>[];

  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    organization: String(r.organization ?? ''),
    contactNo: String(r.contact_no ?? ''),
    email: String(r.email ?? ''),
    address: String(r.address ?? ''),
    notes: String(r.notes ?? ''),
    createdAt: String(r.created_at),
    totalSpent: Number(r.total_spent ?? 0),
    activeRentals: Number(r.active_rentals ?? 0),
    quoteCount: Number(r.quote_count ?? 0),
  }));
}

export function createClient(input: {
  name: string;
  organization?: string;
  contactNo?: string;
  email?: string;
  address?: string;
  notes?: string;
}): Client {
  const now = new Date().toISOString();
  const res = db
    .prepare(
      'INSERT INTO clients (name, organization, contact_no, email, address, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      input.name.trim(),
      (input.organization ?? '').trim(),
      (input.contactNo ?? '').trim(),
      (input.email ?? '').trim(),
      (input.address ?? '').trim(),
      (input.notes ?? '').trim(),
      now
    );
  const created = db.prepare('SELECT * FROM clients WHERE id = ?').get(res.lastInsertRowid) as Record<string, unknown>;
  return {
    id: Number(created.id),
    name: String(created.name),
    organization: String(created.organization ?? ''),
    contactNo: String(created.contact_no ?? ''),
    email: String(created.email ?? ''),
    address: String(created.address ?? ''),
    notes: String(created.notes ?? ''),
    createdAt: String(created.created_at),
    totalSpent: 0,
    activeRentals: 0,
    quoteCount: 0,
  };
}

export function updateClient(
  id: number,
  patch: Partial<{ name: string; organization: string; contactNo: string; email: string; address: string; notes: string }>
): Client {
  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Client not found');
  db.prepare(
    'UPDATE clients SET name = ?, organization = ?, contact_no = ?, email = ?, address = ?, notes = ? WHERE id = ?'
  ).run(
    patch.name ?? String(row.name),
    patch.organization ?? String(row.organization),
    patch.contactNo ?? String(row.contact_no),
    patch.email ?? String(row.email),
    patch.address ?? String(row.address),
    patch.notes ?? String(row.notes),
    id
  );
  return getClients().find((c) => c.id === id)!;
}

export function deleteClient(id: number): void {
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
}

function resolveOrCreateClientId(input: {
  clientId?: number | null;
  name?: string;
  organization?: string;
  contactNo?: string;
  address?: string;
  notes?: string;
}): number | null {
  const cleanOrg = (input.organization ?? '').trim();
  const cleanContact = (input.contactNo ?? '').trim();
  const cleanAddress = (input.address ?? '').trim();
  const cleanName = (input.name ?? '').trim();

  const backfillClient = (id: number, row: Record<string, unknown>) => {
    const nextOrg = String(row.organization ?? '').trim() || cleanOrg;
    const nextContact = String(row.contact_no ?? '').trim() || cleanContact;
    const nextAddress = String(row.address ?? '').trim() || cleanAddress;
    if (
      nextOrg !== String(row.organization ?? '') ||
      nextContact !== String(row.contact_no ?? '') ||
      nextAddress !== String(row.address ?? '')
    ) {
      db.prepare('UPDATE clients SET organization = ?, contact_no = ?, address = ? WHERE id = ?').run(
        nextOrg,
        nextContact,
        nextAddress,
        id
      );
    }
  };

  if (input.clientId) {
    const existingById = db.prepare('SELECT * FROM clients WHERE id = ?').get(input.clientId) as
      | Record<string, unknown>
      | undefined;
    if (existingById) {
      backfillClient(Number(existingById.id), existingById);
      return Number(existingById.id);
    }
  }

  if (!cleanName) return null;

  const nameMatches = db
    .prepare('SELECT * FROM clients WHERE LOWER(TRIM(name)) = LOWER(?) ORDER BY id ASC')
    .all(cleanName) as Record<string, unknown>[];

  if (nameMatches.length > 0) {
    const exactContactMatch = cleanContact
      ? nameMatches.find((m) => String(m.contact_no ?? '').trim() === cleanContact)
      : undefined;
    const compatibleMatch =
      exactContactMatch ??
      nameMatches.find((m) => !cleanContact || !String(m.contact_no ?? '').trim());
    if (compatibleMatch) {
      const id = Number(compatibleMatch.id);
      backfillClient(id, compatibleMatch);
      return id;
    }
  }

  const now = new Date().toISOString();
  const res = db
    .prepare(
      'INSERT INTO clients (name, organization, contact_no, email, address, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      cleanName,
      cleanOrg,
      cleanContact,
      '',
      cleanAddress,
      (input.notes ?? 'Auto-logged from POS walk-in').trim(),
      now
    );
  return Number(res.lastInsertRowid);
}

function mapQuoteRow(r: Record<string, unknown>): Quote {
  const itemRows = db.prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(r.id) as Record<string, unknown>[];
  return {
    id: Number(r.id),
    quoteNo: String(r.quote_no),
    businessId: String(r.business_id ?? 'kr-oncue'),
    clientId: r.client_id ? Number(r.client_id) : null,
    clientName: String(r.client_name),
    organization: String(r.organization ?? ''),
    contactNo: String(r.contact_no ?? ''),
    eventName: String(r.event_name ?? ''),
    venue: String(r.venue ?? ''),
    eventDate: String(r.event_date ?? ''),
    expectedReturnDate: String(r.expected_return_date ?? ''),
    days: Number(r.days),
    deliveryCharge: Number(r.delivery_charge),
    discountPercent: Number(r.discount_percent),
    subtotal: Number(r.subtotal),
    totalAmount: Number(r.total_amount),
    notes: String(r.notes ?? ''),
    status: String(r.status) as QuoteStatus,
    convertedSlipNo: r.converted_slip_no ? String(r.converted_slip_no) : null,
    createdAt: String(r.created_at),
    items: itemRows.map((it) => ({
      id: Number(it.id),
      inventoryCode: String(it.inventory_code),
      equipmentName: String(it.equipment_name),
      quantity: Number(it.quantity),
      rentalRate: Number(it.rental_rate),
      days: Number(it.days),
      amount: Number(it.amount),
      remarks: String(it.remarks ?? ''),
    })),
  };
}

export function getQuotes(): Quote[] {
  const rows = db.prepare('SELECT * FROM quotes ORDER BY id DESC').all() as Record<string, unknown>[];
  return rows.map(mapQuoteRow);
}

export function createQuote(input: {
  businessId?: string;
  clientId?: number | null;
  clientName: string;
  organization?: string;
  contactNo?: string;
  eventName?: string;
  venue?: string;
  eventDate?: string;
  expectedReturnDate?: string;
  days: number;
  deliveryCharge?: number;
  discountPercent?: number;
  notes?: string;
  status?: QuoteStatus;
  items: Array<{ inventoryCode: string; equipmentName: string; quantity: number; rentalRate: number; days?: number; remarks?: string }>;
}): Quote {
  const now = new Date().toISOString();
  const quoteNo = nextSequence('QT');
  const businessId = (input.businessId ?? 'kr-oncue').trim() || 'kr-oncue';
  const days = Math.max(1, Number(input.days) || 1);
  const deliveryCharge = Math.max(0, Number(input.deliveryCharge) || 0);
  const discountPercent = Math.min(100, Math.max(0, Number(input.discountPercent) || 0));

  let subtotal = 0;
  const computedItems = input.items.map((item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const rate = Math.max(0, Number(item.rentalRate) || 0);
    const itemDays = Math.max(1, Number(item.days) || days);
    const amount = qty * rate * itemDays;
    subtotal += amount;
    return {
      ...item,
      quantity: qty,
      rentalRate: rate,
      days: itemDays,
      amount,
      remarks: item.remarks ?? '',
    };
  });

  const discountAmt = (subtotal * discountPercent) / 100;
  const totalAmount = Math.max(0, subtotal - discountAmt + deliveryCharge);

  const tx = db.transaction(() => {
    const resolvedClientId = resolveOrCreateClientId({
      clientId: input.clientId,
      name: input.clientName,
      organization: input.organization,
      contactNo: input.contactNo,
      address: input.venue,
      notes: 'Auto-logged from POS Quotation',
    });

    const res = db
      .prepare(`
        INSERT INTO quotes (
          quote_no, business_id, client_id, client_name, organization, contact_no, event_name, venue,
          event_date, expected_return_date, days, delivery_charge, discount_percent,
          subtotal, total_amount, notes, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        quoteNo,
        businessId,
        resolvedClientId,
        input.clientName.trim(),
        (input.organization ?? '').trim(),
        (input.contactNo ?? '').trim(),
        (input.eventName ?? '').trim(),
        (input.venue ?? '').trim(),
        input.eventDate ?? now.slice(0, 10),
        input.expectedReturnDate ?? now.slice(0, 10),
        days,
        deliveryCharge,
        discountPercent,
        subtotal,
        totalAmount,
        input.notes ?? '',
        input.status ?? 'DRAFT',
        now
      );

    const quoteId = Number(res.lastInsertRowid);
    const insItem = db.prepare(`
      INSERT INTO quote_items (quote_id, inventory_code, equipment_name, quantity, rental_rate, days, amount, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const it of computedItems) {
      insItem.run(quoteId, it.inventoryCode, it.equipmentName, it.quantity, it.rentalRate, it.days, it.amount, it.remarks);
    }
    return quoteId;
  });

  const quoteId = tx();
  const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as Record<string, unknown>;
  return mapQuoteRow(row);
}

export function updateQuoteStatus(id: number, status: QuoteStatus): Quote {
  db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run(status, id);
  const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Quote not found');
  return mapQuoteRow(row);
}

export function updateQuote(
  id: number,
  input: {
    clientId?: number | null;
    clientName: string;
    organization?: string;
    contactNo?: string;
    eventName?: string;
    venue?: string;
    eventDate?: string;
    expectedReturnDate?: string;
    days: number;
    deliveryCharge?: number;
    discountPercent?: number;
    notes?: string;
    status?: QuoteStatus;
    items: Array<{ inventoryCode: string; equipmentName: string; quantity: number; rentalRate: number; days?: number; remarks?: string }>;
  }
): Quote {
  const existing = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) throw new Error('Quote not found');
  if (String(existing.status) === 'CONVERTED') {
    throw new Error('Converted quotes cannot be modified');
  }
  if (!input.items || input.items.length === 0) {
    throw new Error('At least one equipment item is required');
  }

  const days = Math.max(1, Number(input.days) || 1);
  const deliveryCharge = Math.max(0, Number(input.deliveryCharge) || 0);
  const discountPercent = Math.min(100, Math.max(0, Number(input.discountPercent) || 0));

  let subtotal = 0;
  const computedItems = input.items.map((item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const rate = Math.max(0, Number(item.rentalRate) || 0);
    const itemDays = Math.max(1, Number(item.days) || days);
    const amount = qty * rate * itemDays;
    subtotal += amount;
    return {
      ...item,
      quantity: qty,
      rentalRate: rate,
      days: itemDays,
      amount,
      remarks: item.remarks ?? '',
    };
  });

  const discountAmt = (subtotal * discountPercent) / 100;
  const totalAmount = Math.max(0, subtotal - discountAmt + deliveryCharge);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE quotes
      SET client_id = ?, client_name = ?, organization = ?, contact_no = ?, event_name = ?, venue = ?,
          event_date = ?, expected_return_date = ?, days = ?, delivery_charge = ?, discount_percent = ?,
          subtotal = ?, total_amount = ?, notes = ?, status = ?
      WHERE id = ?
    `).run(
      input.clientId ?? (existing.client_id ? Number(existing.client_id) : null),
      input.clientName.trim(),
      (input.organization ?? '').trim(),
      (input.contactNo ?? '').trim(),
      (input.eventName ?? '').trim(),
      (input.venue ?? '').trim(),
      input.eventDate ?? String(existing.event_date),
      input.expectedReturnDate ?? String(existing.expected_return_date),
      days,
      deliveryCharge,
      discountPercent,
      subtotal,
      totalAmount,
      input.notes ?? '',
      input.status ?? (String(existing.status) as QuoteStatus),
      id
    );

    db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(id);
    const insItem = db.prepare(`
      INSERT INTO quote_items (quote_id, inventory_code, equipment_name, quantity, rental_rate, days, amount, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const it of computedItems) {
      insItem.run(id, it.inventoryCode, it.equipmentName, it.quantity, it.rentalRate, it.days, it.amount, it.remarks);
    }
  });

  tx();
  const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as Record<string, unknown>;
  return mapQuoteRow(row);
}

export function deleteQuote(id: number): void {
  const existing = db.prepare('SELECT status FROM quotes WHERE id = ?').get(id) as { status: string } | undefined;
  if (!existing) throw new Error('Quote not found');
  if (existing.status === 'CONVERTED') {
    throw new Error('Cannot delete a quote already converted to a Borrowers Slip');
  }
  db.prepare('DELETE FROM quotes WHERE id = ?').run(id);
}

function mapRentalRow(r: Record<string, unknown>): Rental {
  const itemRows = db.prepare('SELECT * FROM rental_items WHERE rental_id = ?').all(r.id) as Record<string, unknown>[];
  return {
    id: Number(r.id),
    slipNo: String(r.slip_no),
    drNo: String(r.dr_no),
    returnNo: r.return_no ? String(r.return_no) : null,
    businessId: String(r.business_id ?? 'kr-oncue'),
    quoteId: r.quote_id ? Number(r.quote_id) : null,
    clientId: r.client_id ? Number(r.client_id) : null,
    borrowerName: String(r.borrower_name),
    organization: String(r.organization ?? ''),
    contactNo: String(r.contact_no ?? ''),
    eventPurpose: String(r.event_purpose ?? ''),
    venue: String(r.venue ?? ''),
    dateIssued: String(r.date_issued),
    dateOut: String(r.date_out),
    expectedReturn: String(r.expected_return),
    returnDate: r.return_date ? String(r.return_date) : null,
    daysOverall: Number(r.days_overall),
    subtotal: Number(r.subtotal),
    deliveryCharge: Number(r.delivery_charge),
    discountPercent: Number(r.discount_percent),
    additionalCharges: Number(r.additional_charges),
    totalRentalAmount: Number(r.total_rental_amount),
    depositAdvance: Number(r.deposit_advance),
    amountPaid: Number(r.amount_paid),
    balanceDue: Number(r.balance_due),
    conditionUponRelease: String(r.condition_upon_release ?? 'Good'),
    conditionUponReturn: String(r.condition_upon_return ?? ''),
    inspectionResult: String(r.inspection_result ?? ''),
    releasedBy: String(r.released_by ?? ''),
    deliveryPersonnel: String(r.delivery_personnel ?? ''),
    vehicleDriver: String(r.vehicle_driver ?? ''),
    inspectedBy: String(r.inspected_by ?? ''),
    status: String(r.status) as RentalStatus,
    isInternal: Boolean(r.is_internal),
    createdAt: String(r.created_at),
    items: itemRows.map((it) => ({
      id: Number(it.id),
      inventoryCode: String(it.inventory_code),
      equipmentName: String(it.equipment_name),
      quantity: Number(it.quantity),
      rentalRate: Number(it.rental_rate),
      days: Number(it.days),
      amount: Number(it.amount),
      remarks: String(it.remarks ?? ''),
      conditionOut: String(it.condition_out ?? 'Good'),
      accessories: String(it.accessories ?? ''),
      qtyReturned: Number(it.qty_returned ?? 0),
      missingQty: Number(it.missing_qty ?? 0),
      damages: String(it.damages ?? ''),
      addCharges: Number(it.add_charges ?? 0),
    })),
  };
}

export function getRentals(): Rental[] {
  const rows = db.prepare('SELECT * FROM rentals ORDER BY id DESC').all() as Record<string, unknown>[];
  return rows.map(mapRentalRow);
}

export function createRental(input: {
  businessId?: string;
  quoteId?: number | null;
  clientId?: number | null;
  borrowerName: string;
  organization?: string;
  contactNo?: string;
  eventPurpose?: string;
  venue?: string;
  dateOut?: string;
  expectedReturn?: string;
  daysOverall: number;
  deliveryCharge?: number;
  discountPercent?: number;
  depositAdvance?: number;
  conditionUponRelease?: string;
  releasedBy?: string;
  deliveryPersonnel?: string;
  vehicleDriver?: string;
  paymentMethod?: string;
  mode?: 'RESERVED' | 'DISPATCHED';
  isInternal?: boolean;
  items: Array<{
    inventoryCode: string;
    equipmentName: string;
    quantity: number;
    rentalRate: number;
    days?: number;
    remarks?: string;
    accessories?: string;
  }>;
}): Rental {
  const now = new Date().toISOString();
  const mode = input.mode ?? 'DISPATCHED';
  const isInternal = Boolean(input.isInternal);
  let businessId = (input.businessId ?? '').trim();
  if (!businessId && input.quoteId) {
    const qRow = db.prepare('SELECT business_id FROM quotes WHERE id = ?').get(input.quoteId) as
      | { business_id?: string }
      | undefined;
    businessId = qRow?.business_id ?? '';
  }
  if (!businessId) businessId = 'kr-oncue';

  const daysOverall = Math.max(1, Number(input.daysOverall) || 1);
  const deliveryCharge = isInternal ? 0 : Math.max(0, Number(input.deliveryCharge) || 0);
  const discountPercent = isInternal ? 0 : Math.min(100, Math.max(0, Number(input.discountPercent) || 0));
  const depositAdvance = isInternal ? 0 : Math.max(0, Number(input.depositAdvance) || 0);

  if (!input.items || input.items.length === 0) {
    throw new Error('At least one equipment item is required');
  }

  const tx = db.transaction(() => {
    let subtotal = 0;
    const processedItems: Array<LineItem> = [];

    // Aggregate quantities per inventoryCode to validate against available stock
    const requestedByCode = new Map<string, number>();
    for (const item of input.items) {
      const qty = Math.max(1, Number(item.quantity) || 1);
      requestedByCode.set(item.inventoryCode, (requestedByCode.get(item.inventoryCode) ?? 0) + qty);
    }

    for (const [code, reqQty] of requestedByCode.entries()) {
      const invRow = db.prepare('SELECT * FROM inventory WHERE code = ?').get(code) as
        | Record<string, unknown>
        | undefined;
      if (!invRow) {
        throw new Error(`Equipment ${code} not found in Master Inventory`);
      }
      if (String(invRow.status) === 'MAINTENANCE') {
        throw new Error(`Equipment ${code} (${invRow.name}) is currently in MAINTENANCE and cannot be dispatched`);
      }
      const avail = Number(invRow.qty_on_hand) - Number(invRow.qty_out) - Number(invRow.qty_reserved);
      if (avail < reqQty) {
        throw new Error(
          `Insufficient stock for ${code} (${invRow.name}): requested ${reqQty}, available ${Math.max(0, avail)}`
        );
      }
    }

    for (const item of input.items) {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const rate = isInternal ? 0 : Math.max(0, Number(item.rentalRate) || 0);
      const itemDays = Math.max(1, Number(item.days) || daysOverall);
      const amount = isInternal ? 0 : qty * rate * itemDays;
      subtotal += amount;
      processedItems.push({
        inventoryCode: item.inventoryCode,
        equipmentName: item.equipmentName,
        quantity: qty,
        rentalRate: rate,
        days: itemDays,
        amount,
        remarks: item.remarks ?? '',
        conditionOut: input.conditionUponRelease ?? 'Good',
        accessories: item.accessories ?? '',
      });
    }

    const discountAmt = (subtotal * discountPercent) / 100;
    const totalRentalAmount = isInternal ? 0 : Math.max(0, subtotal - discountAmt + deliveryCharge);
    const balanceDue = isInternal ? 0 : Math.max(0, totalRentalAmount - depositAdvance);

    let resolvedClientId: number | null = null;
    if (!isInternal) {
      let initialClientId = input.clientId ?? null;
      if (!initialClientId && input.quoteId) {
        const qRow = db.prepare('SELECT client_id FROM quotes WHERE id = ?').get(input.quoteId) as
          | { client_id?: number | null }
          | undefined;
        initialClientId = qRow?.client_id ? Number(qRow.client_id) : null;
      }
      resolvedClientId = resolveOrCreateClientId({
        clientId: initialClientId,
        name: input.borrowerName,
        organization: input.organization,
        contactNo: input.contactNo,
        address: input.venue,
        notes: 'Auto-logged from POS Walk-in Rental',
      });
    }

    const slipNo = nextSequence(isInternal ? 'ADM' : 'BS');
    const drNo = nextSequence(isInternal ? 'ADR' : 'DR');

    const res = db
      .prepare(`
        INSERT INTO rentals (
          slip_no, dr_no, business_id, quote_id, client_id, borrower_name, organization, contact_no,
          event_purpose, venue, date_issued, date_out, expected_return, days_overall,
          subtotal, delivery_charge, discount_percent, additional_charges,
          total_rental_amount, deposit_advance, amount_paid, balance_due,
          condition_upon_release, released_by, delivery_personnel, vehicle_driver,
          status, is_internal, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        slipNo,
        drNo,
        businessId,
        input.quoteId ?? null,
        resolvedClientId,
        input.borrowerName.trim(),
        (input.organization ?? '').trim(),
        (input.contactNo ?? '').trim(),
        (input.eventPurpose ?? '').trim(),
        (input.venue ?? '').trim(),
        now.slice(0, 10),
        input.dateOut ?? now.slice(0, 10),
        input.expectedReturn ?? now.slice(0, 10),
        daysOverall,
        subtotal,
        deliveryCharge,
        discountPercent,
        totalRentalAmount,
        depositAdvance,
        depositAdvance,
        balanceDue,
        input.conditionUponRelease ?? 'Good',
        input.releasedBy ?? 'KR-ONCUE Staff',
        input.deliveryPersonnel ?? '',
        input.vehicleDriver ?? '',
        mode,
        isInternal ? 1 : 0,
        now
      );

    const rentalId = Number(res.lastInsertRowid);
    const insItem = db.prepare(`
      INSERT INTO rental_items (
        rental_id, inventory_code, equipment_name, quantity, rental_rate, days, amount,
        remarks, condition_out, accessories
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const it of processedItems) {
      insItem.run(
        rentalId,
        it.inventoryCode,
        it.equipmentName,
        it.quantity,
        it.rentalRate,
        it.days,
        it.amount,
        it.remarks,
        it.conditionOut ?? 'Good',
        it.accessories ?? ''
      );
      if (mode === 'DISPATCHED') {
        db.prepare('UPDATE inventory SET qty_out = qty_out + ? WHERE code = ?').run(it.quantity, it.inventoryCode);
      } else {
        db.prepare('UPDATE inventory SET qty_reserved = qty_reserved + ? WHERE code = ?').run(
          it.quantity,
          it.inventoryCode
        );
      }
      recomputeItemStatus(it.inventoryCode);
    }

    if (input.quoteId) {
      db.prepare('UPDATE quotes SET status = ?, converted_slip_no = ? WHERE id = ?').run(
        'CONVERTED',
        slipNo,
        input.quoteId
      );
    }

    if (depositAdvance > 0) {
      const receiptNo = nextSequence('PAY');
      const payStatus: PaymentStatus = balanceDue <= 0 ? 'Paid in Full' : 'Partial Payment';
      db.prepare(`
        INSERT INTO payments (
          receipt_no, business_id, rental_id, slip_no, client_id, received_from, organization, contact_no,
          event_purpose, payment_date, payment_method, payment_status,
          rental_charges, delivery_charges, additional_charges, discount_percent,
          total_amount_due, amount_paid, outstanding_balance,
          received_by, authorized_by, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        receiptNo,
        businessId,
        rentalId,
        slipNo,
        resolvedClientId,
        input.borrowerName.trim(),
        (input.organization ?? '').trim(),
        (input.contactNo ?? '').trim(),
        (input.eventPurpose ?? '').trim(),
        now.slice(0, 10),
        input.paymentMethod ?? 'Cash',
        payStatus,
        subtotal,
        deliveryCharge,
        discountPercent,
        totalRentalAmount,
        depositAdvance,
        balanceDue,
        input.releasedBy ?? 'KR-ONCUE Cashier',
        'KR-ONCUE Management',
        `Initial deposit/payment upon ${mode === 'DISPATCHED' ? 'dispatch' : 'reservation'}`,
        now
      );
    }

    return rentalId;
  });

  const rentalId = tx();
  const row = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId) as Record<string, unknown>;
  return mapRentalRow(row);
}

export function dispatchReservedRental(rentalId: number, deliveryPersonnel?: string, vehicleDriver?: string): Rental {
  const tx = db.transaction(() => {
    const rental = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId) as Record<string, unknown> | undefined;
    if (!rental) throw new Error('Rental slip not found');
    if (String(rental.status) !== 'RESERVED') {
      throw new Error('Only RESERVED slips can be dispatched');
    }
    const items = db.prepare('SELECT * FROM rental_items WHERE rental_id = ?').all(rentalId) as Record<
      string,
      unknown
    >[];
    for (const it of items) {
      const code = String(it.inventory_code);
      const qty = Number(it.quantity);
      db.prepare(
        'UPDATE inventory SET qty_reserved = MAX(0, qty_reserved - ?), qty_out = qty_out + ? WHERE code = ?'
      ).run(qty, qty, code);
      recomputeItemStatus(code);
    }
    db.prepare(`
      UPDATE rentals
      SET status = 'DISPATCHED',
          delivery_personnel = COALESCE(NULLIF(?, ''), delivery_personnel),
          vehicle_driver = COALESCE(NULLIF(?, ''), vehicle_driver)
      WHERE id = ?
    `).run(deliveryPersonnel ?? '', vehicleDriver ?? '', rentalId);
  });
  tx();
  const row = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId) as Record<string, unknown>;
  return mapRentalRow(row);
}

export function updateRental(
  rentalId: number,
  patch: Partial<{
    borrowerName: string;
    organization: string;
    contactNo: string;
    eventPurpose: string;
    venue: string;
    dateOut: string;
    expectedReturn: string;
    deliveryPersonnel: string;
    vehicleDriver: string;
    releasedBy: string;
    conditionUponRelease: string;
    conditionUponReturn: string;
  }>
): Rental {
  const row = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Rental slip not found');

  db.prepare(`
    UPDATE rentals
    SET borrower_name = ?, organization = ?, contact_no = ?, event_purpose = ?, venue = ?,
        date_out = ?, expected_return = ?, delivery_personnel = ?, vehicle_driver = ?,
        released_by = ?, condition_upon_release = ?, condition_upon_return = ?
    WHERE id = ?
  `).run(
    patch.borrowerName !== undefined ? patch.borrowerName.trim() : String(row.borrower_name),
    patch.organization !== undefined ? patch.organization.trim() : String(row.organization ?? ''),
    patch.contactNo !== undefined ? patch.contactNo.trim() : String(row.contact_no ?? ''),
    patch.eventPurpose !== undefined ? patch.eventPurpose.trim() : String(row.event_purpose ?? ''),
    patch.venue !== undefined ? patch.venue.trim() : String(row.venue ?? ''),
    patch.dateOut ?? String(row.date_out),
    patch.expectedReturn ?? String(row.expected_return),
    patch.deliveryPersonnel ?? String(row.delivery_personnel ?? ''),
    patch.vehicleDriver ?? String(row.vehicle_driver ?? ''),
    patch.releasedBy ?? String(row.released_by ?? ''),
    patch.conditionUponRelease ?? String(row.condition_upon_release ?? 'Good'),
    patch.conditionUponReturn ?? String(row.condition_upon_return ?? ''),
    rentalId
  );
  const updated = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId) as Record<string, unknown>;
  return mapRentalRow(updated);
}

export function cancelReservedRental(rentalId: number): Rental {
  const tx = db.transaction(() => {
    const rental = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId) as Record<string, unknown> | undefined;
    if (!rental) throw new Error('Rental slip not found');
    if (String(rental.status) !== 'RESERVED') {
      throw new Error('Only RESERVED slips can be cancelled');
    }
    const items = db.prepare('SELECT * FROM rental_items WHERE rental_id = ?').all(rentalId) as Record<
      string,
      unknown
    >[];
    for (const it of items) {
      const code = String(it.inventory_code);
      const qty = Number(it.quantity);
      db.prepare('UPDATE inventory SET qty_reserved = MAX(0, qty_reserved - ?) WHERE code = ?').run(qty, code);
      recomputeItemStatus(code);
    }
    db.prepare("UPDATE rentals SET status = 'CANCELLED', balance_due = 0 WHERE id = ?").run(rentalId);
  });
  tx();
  const row = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId) as Record<string, unknown>;
  return mapRentalRow(row);
}

export function processReturnInspection(
  rentalId: number,
  input: {
    inspectedBy: string;
    inspectionResult: 'Complete' | 'Incomplete' | 'Damaged' | 'Needs testing / repair';
    conditionUponReturn: string;
    items: Array<{
      itemId: number;
      qtyReturned: number;
      missingQty: number;
      damages: string;
      addCharges: number;
      needsMaintenance?: boolean;
    }>;
  }
): Rental {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const rental = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId) as Record<string, unknown> | undefined;
    if (!rental) throw new Error('Rental slip not found');
    const currentStatus = String(rental.status);
    if (currentStatus === 'RETURNED' || currentStatus === 'CANCELLED') {
      throw new Error('Rental is already closed');
    }

    const dbItems = db.prepare('SELECT * FROM rental_items WHERE rental_id = ?').all(rentalId) as Record<
      string,
      unknown
    >[];
    let totalAddCharges = 0;

    for (const dbItem of dbItems) {
      const itemId = Number(dbItem.id);
      const code = String(dbItem.inventory_code);
      const qtyReleased = Number(dbItem.quantity);
      const submitted = input.items.find((x) => x.itemId === itemId);

      const qtyReturned = submitted ? Math.min(qtyReleased, Math.max(0, Number(submitted.qtyReturned))) : qtyReleased;
      const missingQty = submitted ? Math.max(0, Number(submitted.missingQty)) : 0;
      const addCharges = submitted ? Math.max(0, Number(submitted.addCharges) || 0) : 0;
      const damages = submitted ? submitted.damages : '';
      totalAddCharges += addCharges;

      db.prepare(`
        UPDATE rental_items
        SET qty_returned = ?, missing_qty = ?, damages = ?, add_charges = ?
        WHERE id = ?
      `).run(qtyReturned, missingQty, damages, addCharges, itemId);

      if (currentStatus === 'RESERVED') {
        db.prepare('UPDATE inventory SET qty_reserved = MAX(0, qty_reserved - ?) WHERE code = ?').run(
          qtyReleased,
          code
        );
      } else {
        db.prepare('UPDATE inventory SET qty_out = MAX(0, qty_out - ?) WHERE code = ?').run(qtyReleased, code);
      }

      if (missingQty > 0) {
        db.prepare('UPDATE inventory SET qty_on_hand = MAX(0, qty_on_hand - ?) WHERE code = ?').run(missingQty, code);
      }

      if (submitted?.needsMaintenance) {
        db.prepare("UPDATE inventory SET status = 'MAINTENANCE', condition = 'Needs Repair', updated_at = ? WHERE code = ?").run(
          now,
          code
        );
        const inv = db.prepare('SELECT * FROM inventory WHERE code = ?').get(code) as Record<string, unknown>;
        const maintSlipNo = nextSequence('MR');
        db.prepare(`
          INSERT INTO maintenance_slips (
            slip_no, inventory_code, equipment_name, brand_model, location_storage,
            date_requested, requested_by, department, repair_type, priority_level,
            reported_problem, safety_out_of_service, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Operations', 'Corrective', 'Urgent', ?, 1, 'OPEN', ?)
        `).run(
          maintSlipNo,
          code,
          String(inv?.name ?? dbItem.equipment_name),
          String(inv?.brand ?? ''),
          String(inv?.location ?? ''),
          now.slice(0, 10),
          input.inspectedBy || 'Return Inspector',
          damages || `Damaged on return from ${rental.slip_no}`,
          now
        );
      } else {
        recomputeItemStatus(code);
      }
    }

    const isInternal = Boolean(rental.is_internal);
    const returnNo = nextSequence('RT');
    const effectiveAddCharges = isInternal ? 0 : totalAddCharges;
    const newTotal = isInternal ? 0 : Number(rental.total_rental_amount) + effectiveAddCharges;
    const newBalance = isInternal ? 0 : Math.max(0, newTotal - Number(rental.amount_paid));
    const nextRentalStatus: RentalStatus = input.inspectionResult === 'Incomplete' ? 'PARTIAL_RETURN' : 'RETURNED';

    db.prepare(`
      UPDATE rentals
      SET return_no = ?,
          return_date = ?,
          additional_charges = additional_charges + ?,
          total_rental_amount = ?,
          balance_due = ?,
          condition_upon_return = ?,
          inspection_result = ?,
          inspected_by = ?,
          status = ?
      WHERE id = ?
    `).run(
      returnNo,
      now.slice(0, 10),
      effectiveAddCharges,
      newTotal,
      newBalance,
      input.conditionUponReturn,
      input.inspectionResult,
      input.inspectedBy,
      nextRentalStatus,
      rentalId
    );
  });

  tx();
  const row = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId) as Record<string, unknown>;
  return mapRentalRow(row);
}

export function getPayments(): Payment[] {
  const rows = db.prepare('SELECT * FROM payments ORDER BY id DESC').all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    receiptNo: String(r.receipt_no),
    businessId: String(r.business_id ?? 'kr-oncue'),
    rentalId: r.rental_id ? Number(r.rental_id) : null,
    slipNo: String(r.slip_no ?? ''),
    clientId: r.client_id ? Number(r.client_id) : null,
    receivedFrom: String(r.received_from),
    organization: String(r.organization ?? ''),
    contactNo: String(r.contact_no ?? ''),
    eventPurpose: String(r.event_purpose ?? ''),
    paymentDate: String(r.payment_date),
    paymentMethod: String(r.payment_method),
    paymentStatus: String(r.payment_status) as PaymentStatus,
    rentalCharges: Number(r.rental_charges),
    deliveryCharges: Number(r.delivery_charges),
    additionalCharges: Number(r.additional_charges),
    discountPercent: Number(r.discount_percent),
    totalAmountDue: Number(r.total_amount_due),
    amountPaid: Number(r.amount_paid),
    outstandingBalance: Number(r.outstanding_balance),
    amountInWords: String(r.amount_in_words ?? ''),
    referenceNo: String(r.reference_no ?? ''),
    receivedBy: String(r.received_by ?? ''),
    authorizedBy: String(r.authorized_by ?? ''),
    notes: String(r.notes ?? ''),
    createdAt: String(r.created_at),
  }));
}

export function createPayment(input: {
  businessId?: string;
  rentalId?: number | null;
  slipNo?: string;
  clientId?: number | null;
  receivedFrom: string;
  organization?: string;
  contactNo?: string;
  eventPurpose?: string;
  paymentMethod: string;
  rentalCharges?: number;
  deliveryCharges?: number;
  additionalCharges?: number;
  discountPercent?: number;
  totalAmountDue: number;
  amountPaid: number;
  amountInWords?: string;
  referenceNo?: string;
  receivedBy?: string;
  authorizedBy?: string;
  notes?: string;
}): Payment {
  const now = new Date().toISOString();
  const receiptNo = nextSequence('PAY');
  const amountPaid = Math.max(0, Number(input.amountPaid) || 0);
  const totalDue = Math.max(0, Number(input.totalAmountDue) || 0);
  const outstandingBalance = Math.max(0, totalDue - amountPaid);
  const paymentStatus: PaymentStatus =
    amountPaid <= 0 ? 'Pending' : outstandingBalance <= 0 ? 'Paid in Full' : 'Partial Payment';

  const tx = db.transaction(() => {
    let slipNo = input.slipNo ?? '';
    let clientId = input.clientId ?? null;
    let businessId = (input.businessId ?? '').trim();
    if (input.rentalId) {
      const rental = db.prepare('SELECT * FROM rentals WHERE id = ?').get(input.rentalId) as
        | Record<string, unknown>
        | undefined;
      if (rental) {
        slipNo = String(rental.slip_no);
        clientId = rental.client_id ? Number(rental.client_id) : clientId;
        if (!businessId) businessId = String(rental.business_id ?? 'kr-oncue');
        const newPaid = Number(rental.amount_paid) + amountPaid;
        const newBal = Math.max(0, Number(rental.total_rental_amount) - newPaid);
        db.prepare('UPDATE rentals SET amount_paid = ?, balance_due = ? WHERE id = ?').run(
          newPaid,
          newBal,
          input.rentalId
        );
      }
    }
    if (!businessId) businessId = 'kr-oncue';

    const resolvedClientId = resolveOrCreateClientId({
      clientId,
      name: input.receivedFrom,
      organization: input.organization,
      contactNo: input.contactNo,
      notes: 'Auto-logged from Payment Receipt',
    });

    const res = db
      .prepare(`
        INSERT INTO payments (
          receipt_no, business_id, rental_id, slip_no, client_id, received_from, organization, contact_no,
          event_purpose, payment_date, payment_method, payment_status,
          rental_charges, delivery_charges, additional_charges, discount_percent,
          total_amount_due, amount_paid, outstanding_balance, amount_in_words,
          reference_no, received_by, authorized_by, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        receiptNo,
        businessId,
        input.rentalId ?? null,
        slipNo,
        resolvedClientId,
        input.receivedFrom.trim(),
        (input.organization ?? '').trim(),
        (input.contactNo ?? '').trim(),
        (input.eventPurpose ?? '').trim(),
        now.slice(0, 10),
        input.paymentMethod,
        paymentStatus,
        input.rentalCharges ?? 0,
        input.deliveryCharges ?? 0,
        input.additionalCharges ?? 0,
        input.discountPercent ?? 0,
        totalDue,
        amountPaid,
        outstandingBalance,
        input.amountInWords ?? '',
        input.referenceNo ?? '',
        input.receivedBy ?? 'KR-ONCUE Cashier',
        input.authorizedBy ?? 'KR-ONCUE Management',
        input.notes ?? '',
        now
      );

    return Number(res.lastInsertRowid);
  });

  const id = tx();
  return getPayments().find((p) => p.id === id)!;
}

export function updatePayment(
  id: number,
  patch: Partial<{
    paymentMethod: string;
    referenceNo: string;
    receivedBy: string;
    authorizedBy: string;
    notes: string;
  }>
): Payment {
  const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Payment receipt not found');
  db.prepare(`
    UPDATE payments
    SET payment_method = ?, reference_no = ?, received_by = ?, authorized_by = ?, notes = ?
    WHERE id = ?
  `).run(
    patch.paymentMethod ?? String(row.payment_method),
    patch.referenceNo ?? String(row.reference_no ?? ''),
    patch.receivedBy ?? String(row.received_by ?? ''),
    patch.authorizedBy ?? String(row.authorized_by ?? ''),
    patch.notes ?? String(row.notes ?? ''),
    id
  );
  return getPayments().find((p) => p.id === id)!;
}

export function getMaintenanceSlips(): MaintenanceSlip[] {
  const rows = db.prepare('SELECT * FROM maintenance_slips ORDER BY id DESC').all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    slipNo: String(r.slip_no),
    inventoryCode: String(r.inventory_code),
    equipmentName: String(r.equipment_name),
    brandModel: String(r.brand_model ?? ''),
    locationStorage: String(r.location_storage ?? ''),
    dateRequested: String(r.date_requested),
    requiredBy: String(r.required_by ?? ''),
    requestedBy: String(r.requested_by ?? ''),
    department: String(r.department ?? ''),
    contactNo: String(r.contact_no ?? ''),
    repairType: String(r.repair_type ?? 'Corrective'),
    priorityLevel: String(r.priority_level ?? 'Normal') as MaintenanceSlip['priorityLevel'],
    reportedProblem: String(r.reported_problem),
    proposedRepair: String(r.proposed_repair ?? ''),
    safetyOutOfService: Boolean(r.safety_out_of_service),
    estimatedPartsCost: Number(r.estimated_parts_cost ?? 0),
    laborCost: Number(r.labor_cost ?? 0),
    otherCost: Number(r.other_cost ?? 0),
    actualTotalCost: Number(r.actual_total_cost ?? 0),
    technician: String(r.technician ?? ''),
    workPerformed: String(r.work_performed ?? ''),
    status: String(r.status) as MaintenanceSlip['status'],
    createdAt: String(r.created_at),
  }));
}

export function createMaintenanceSlip(input: {
  inventoryCode: string;
  requestedBy: string;
  department?: string;
  contactNo?: string;
  requiredBy?: string;
  repairType?: string;
  priorityLevel?: MaintenanceSlip['priorityLevel'];
  reportedProblem: string;
  proposedRepair?: string;
  safetyOutOfService?: boolean;
  estimatedPartsCost?: number;
}): MaintenanceSlip {
  const now = new Date().toISOString();
  const inv = db.prepare('SELECT * FROM inventory WHERE code = ?').get(input.inventoryCode) as
    | Record<string, unknown>
    | undefined;
  if (!inv) throw new Error(`Equipment ${input.inventoryCode} not found`);

  const slipNo = nextSequence('MR');
  const outOfService = input.safetyOutOfService !== false;

  const tx = db.transaction(() => {
    const res = db
      .prepare(`
        INSERT INTO maintenance_slips (
          slip_no, inventory_code, equipment_name, brand_model, location_storage,
          date_requested, required_by, requested_by, department, contact_no,
          repair_type, priority_level, reported_problem, proposed_repair,
          safety_out_of_service, estimated_parts_cost, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
      `)
      .run(
        slipNo,
        input.inventoryCode,
        String(inv.name),
        String(inv.brand ?? ''),
        String(inv.location ?? ''),
        now.slice(0, 10),
        input.requiredBy ?? '',
        input.requestedBy,
        input.department ?? 'Technical Crew',
        input.contactNo ?? '',
        input.repairType ?? 'Corrective',
        input.priorityLevel ?? 'Normal',
        input.reportedProblem,
        input.proposedRepair ?? '',
        outOfService ? 1 : 0,
        Number(input.estimatedPartsCost ?? 0),
        now
      );
    if (outOfService) {
      db.prepare("UPDATE inventory SET status = 'MAINTENANCE', condition = 'Under Repair', updated_at = ? WHERE code = ?").run(
        now,
        input.inventoryCode
      );
    }
    return Number(res.lastInsertRowid);
  });

  const id = tx();
  return getMaintenanceSlips().find((m) => m.id === id)!;
}

export function updateMaintenanceSlip(
  id: number,
  patch: {
    status?: MaintenanceSlip['status'];
    priorityLevel?: MaintenanceSlip['priorityLevel'];
    reportedProblem?: string;
    proposedRepair?: string;
    estimatedPartsCost?: number;
    technician?: string;
    workPerformed?: string;
    laborCost?: number;
    otherCost?: number;
  }
): MaintenanceSlip {
  const now = new Date().toISOString();
  const row = db.prepare('SELECT * FROM maintenance_slips WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error('Maintenance slip not found');

  const status = patch.status ?? (String(row.status) as MaintenanceSlip['status']);
  const labor = patch.laborCost ?? Number(row.labor_cost ?? 0);
  const other = patch.otherCost ?? Number(row.other_cost ?? 0);
  const estParts = patch.estimatedPartsCost ?? Number(row.estimated_parts_cost ?? 0);
  const actualTotal = estParts + labor + other;

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE maintenance_slips
      SET status = ?, priority_level = ?, reported_problem = ?, proposed_repair = ?,
          estimated_parts_cost = ?, technician = ?, work_performed = ?, labor_cost = ?,
          other_cost = ?, actual_total_cost = ?
      WHERE id = ?
    `).run(
      status,
      patch.priorityLevel ?? String(row.priority_level ?? 'Normal'),
      patch.reportedProblem ?? String(row.reported_problem),
      patch.proposedRepair ?? String(row.proposed_repair ?? ''),
      estParts,
      patch.technician ?? String(row.technician ?? ''),
      patch.workPerformed ?? String(row.work_performed ?? ''),
      labor,
      other,
      actualTotal,
      id
    );

    const code = String(row.inventory_code);
    if (status === 'COMPLETED') {
      db.prepare("UPDATE inventory SET status = 'AVAILABLE', condition = 'Good', updated_at = ? WHERE code = ?").run(
        now,
        code
      );
      recomputeItemStatus(code);
    }
  });
  tx();
  return getMaintenanceSlips().find((m) => m.id === id)!;
}

export function getBudgetRequests(): BudgetRequest[] {
  const rows = db.prepare('SELECT * FROM budget_requests ORDER BY id DESC').all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    budgetNo: String(r.budget_no),
    dateRequested: String(r.date_requested),
    requiredDate: String(r.required_date ?? ''),
    requestedBy: String(r.requested_by),
    department: String(r.department ?? ''),
    contactNo: String(r.contact_no ?? ''),
    expenseCategory: String(r.expense_category ?? ''),
    priority: String(r.priority ?? 'Normal'),
    purpose: String(r.purpose),
    eventName: String(r.event_name ?? ''),
    venue: String(r.venue ?? ''),
    paymentMethod: String(r.payment_method ?? 'Cash'),
    payeeSupplier: String(r.payee_supplier ?? ''),
    requestedBudget: Number(r.requested_budget ?? 0),
    availableBudget: Number(r.available_budget ?? 0),
    actualSpent: Number(r.actual_spent ?? 0),
    status: String(r.status ?? 'PENDING') as BudgetRequest['status'],
    items: JSON.parse(String(r.items_json ?? '[]')) as BudgetItem[],
    createdAt: String(r.created_at),
  }));
}

export function createBudgetRequest(input: {
  requestedBy: string;
  department?: string;
  contactNo?: string;
  requiredDate?: string;
  expenseCategory?: string;
  priority?: string;
  purpose: string;
  eventName?: string;
  venue?: string;
  paymentMethod?: string;
  payeeSupplier?: string;
  availableBudget?: number;
  items: BudgetItem[];
}): BudgetRequest {
  const now = new Date().toISOString();
  const budgetNo = nextSequence('BR');
  const requestedBudget = input.items.reduce((acc, it) => acc + Number(it.qty || 0) * Number(it.estUnitCost || 0), 0);
  const itemsWithAmounts = input.items.map((it) => ({
    ...it,
    estAmount: Number(it.qty || 0) * Number(it.estUnitCost || 0),
  }));

  const res = db
    .prepare(`
      INSERT INTO budget_requests (
        budget_no, date_requested, required_date, requested_by, department, contact_no,
        expense_category, priority, purpose, event_name, venue, payment_method,
        payee_supplier, requested_budget, available_budget, status, items_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `)
    .run(
      budgetNo,
      now.slice(0, 10),
      input.requiredDate ?? '',
      input.requestedBy,
      input.department ?? 'Production',
      input.contactNo ?? '',
      input.expenseCategory ?? 'Event Operations',
      input.priority ?? 'Normal',
      input.purpose,
      input.eventName ?? '',
      input.venue ?? '',
      input.paymentMethod ?? 'Cash',
      input.payeeSupplier ?? '',
      requestedBudget,
      Number(input.availableBudget ?? requestedBudget),
      JSON.stringify(itemsWithAmounts),
      now
    );
  return getBudgetRequests().find((b) => b.id === Number(res.lastInsertRowid))!;
}

export function updateBudgetStatus(
  id: number,
  status: BudgetRequest['status'],
  actualSpent?: number
): BudgetRequest {
  db.prepare('UPDATE budget_requests SET status = ?, actual_spent = COALESCE(?, actual_spent) WHERE id = ?').run(
    status,
    actualSpent ?? null,
    id
  );
  const item = getBudgetRequests().find((b) => b.id === id);
  if (!item) throw new Error('Budget request not found');
  return item;
}

export function updateBudgetRequest(
  id: number,
  patch: Partial<{
    requestedBy: string;
    department: string;
    purpose: string;
    eventName: string;
    venue: string;
    payeeSupplier: string;
    status: BudgetRequest['status'];
    actualSpent: number;
    items: BudgetItem[];
  }>
): BudgetRequest {
  const existing = getBudgetRequests().find((b) => b.id === id);
  if (!existing) throw new Error('Budget request not found');

  const items = patch.items ?? existing.items;
  const itemsWithAmounts = items.map((it) => ({
    ...it,
    estAmount: Number(it.qty || 0) * Number(it.estUnitCost || 0),
  }));
  const requestedBudget = itemsWithAmounts.reduce((acc, it) => acc + it.estAmount, 0);

  db.prepare(`
    UPDATE budget_requests
    SET requested_by = ?, department = ?, purpose = ?, event_name = ?, venue = ?,
        payee_supplier = ?, status = ?, actual_spent = ?, requested_budget = ?, items_json = ?
    WHERE id = ?
  `).run(
    patch.requestedBy ?? existing.requestedBy,
    patch.department ?? existing.department,
    patch.purpose ?? existing.purpose,
    patch.eventName ?? existing.eventName,
    patch.venue ?? existing.venue,
    patch.payeeSupplier ?? existing.payeeSupplier,
    patch.status ?? existing.status,
    patch.actualSpent ?? existing.actualSpent,
    requestedBudget,
    JSON.stringify(itemsWithAmounts),
    id
  );
  return getBudgetRequests().find((b) => b.id === id)!;
}

export function deleteBudgetRequest(id: number): void {
  const existing = db.prepare('SELECT id FROM budget_requests WHERE id = ?').get(id);
  if (!existing) throw new Error('Budget request not found');
  db.prepare('DELETE FROM budget_requests WHERE id = ?').run(id);
}

export function getDashboardSummary(): DashboardSummary {
  const items = getInventory();
  const rentals = getRentals();
  const quotes = getQuotes();
  const payments = getPayments();
  const businesses = getBusinesses();

  const catMap = new Map<
    EquipmentCategoryCode,
    {
      categoryCode: EquipmentCategoryCode;
      categoryName: string;
      skuCount: number;
      unitsOnHand: number;
      unitsAvailable: number;
      unitsOut: number;
      unitsMaintenance: number;
    }
  >();

  const names: Record<EquipmentCategoryCode, string> = {
    LW: 'LED Wall System',
    AS: 'Audio System',
    LS: 'Lighting System',
    SS: 'Support System',
    PS: 'Power System',
  };

  (['LW', 'AS', 'LS', 'SS', 'PS'] as EquipmentCategoryCode[]).forEach((code) => {
    catMap.set(code, {
      categoryCode: code,
      categoryName: names[code],
      skuCount: 0,
      unitsOnHand: 0,
      unitsAvailable: 0,
      unitsOut: 0,
      unitsMaintenance: 0,
    });
  });

  const bizMap = new Map<string, BusinessStat>();
  for (const b of businesses) {
    bizMap.set(b.id, {
      businessId: b.id,
      code: b.code,
      name: b.name,
      tagline: b.tagline,
      focusLabel: b.focusLabel,
      accentColor: b.accentColor,
      active: b.active,
      skuCount: 0,
      unitsOnHand: 0,
      unitsAvailable: 0,
      unitsOut: 0,
      unitsMaintenance: 0,
      activeRentalsCount: 0,
      pendingQuotesCount: 0,
      totalRevenueCollected: 0,
      outstandingReceivables: 0,
      totalRentalsCount: 0,
    });
  }

  let totalUnitsOnHand = 0;
  let totalUnitsAvailable = 0;
  let totalUnitsOut = 0;
  let maintenanceCount = 0;

  for (const item of items) {
    totalUnitsOnHand += item.qtyOnHand;
    totalUnitsAvailable += item.qtyAvailable;
    totalUnitsOut += item.qtyOut + item.qtyReserved;
    if (item.status === 'MAINTENANCE') {
      maintenanceCount += item.qtyOnHand;
    }
    const stat = catMap.get(item.categoryCode);
    if (stat) {
      stat.skuCount += 1;
      stat.unitsOnHand += item.qtyOnHand;
      stat.unitsAvailable += item.qtyAvailable;
      stat.unitsOut += item.qtyOut + item.qtyReserved;
      if (item.status === 'MAINTENANCE') {
        stat.unitsMaintenance += item.qtyOnHand;
      }
    }
    const bStat = bizMap.get(item.businessId);
    if (bStat) {
      bStat.skuCount += 1;
      bStat.unitsOnHand += item.qtyOnHand;
      bStat.unitsAvailable += item.qtyAvailable;
      bStat.unitsOut += item.qtyOut + item.qtyReserved;
      if (item.status === 'MAINTENANCE') {
        bStat.unitsMaintenance += item.qtyOnHand;
      }
    }
  }

  for (const r of rentals) {
    const bStat = bizMap.get(r.businessId);
    if (bStat) {
      if (r.status !== 'CANCELLED') {
        bStat.totalRentalsCount += 1;
        bStat.outstandingReceivables += r.balanceDue;
      }
      if (['RESERVED', 'DISPATCHED', 'PARTIAL_RETURN'].includes(r.status)) {
        bStat.activeRentalsCount += 1;
      }
    }
  }

  for (const q of quotes) {
    const bStat = bizMap.get(q.businessId);
    if (bStat && ['DRAFT', 'SENT', 'APPROVED'].includes(q.status)) {
      bStat.pendingQuotesCount += 1;
    }
  }

  for (const p of payments) {
    const bStat = bizMap.get(p.businessId);
    if (bStat) {
      bStat.totalRevenueCollected += p.amountPaid;
    }
  }

  const activeRentalsCount = rentals.filter((r) =>
    ['RESERVED', 'DISPATCHED', 'PARTIAL_RETURN'].includes(r.status)
  ).length;
  const pendingQuotesCount = quotes.filter((q) => ['DRAFT', 'SENT', 'APPROVED'].includes(q.status)).length;
  const totalRevenueCollected = payments.reduce((acc, p) => acc + p.amountPaid, 0);
  const outstandingReceivables = rentals
    .filter((r) => r.status !== 'CANCELLED')
    .reduce((acc, r) => acc + r.balanceDue, 0);

  return {
    totalUnitsOnHand,
    totalUnitsAvailable,
    totalUnitsOut,
    maintenanceCount,
    activeRentalsCount,
    pendingQuotesCount,
    totalRevenueCollected,
    outstandingReceivables,
    categoryStats: Array.from(catMap.values()),
    businessStats: Array.from(bizMap.values()),
  };
}

// --- SHARED TEAM DRAFTS ---

function mapDraftRow(r: Record<string, unknown>): SharedDraft {
  return {
    id: Number(r.id),
    businessId: String(r.business_id ?? 'kr-oncue'),
    title: String(r.title),
    createdBy: String(r.created_by),
    updatedBy: String(r.updated_by),
    clientId: r.client_id ? Number(r.client_id) : null,
    clientName: String(r.client_name ?? ''),
    organization: String(r.organization ?? ''),
    contactNo: String(r.contact_no ?? ''),
    eventName: String(r.event_name ?? ''),
    venue: String(r.venue ?? ''),
    dateOut: String(r.date_out ?? ''),
    expectedReturn: String(r.expected_return ?? ''),
    days: Number(r.days || 1),
    deliveryCharge: Number(r.delivery_charge || 0),
    discountPercent: Number(r.discount_percent || 0),
    depositAdvance: Number(r.deposit_advance || 0),
    paymentMethod: String(r.payment_method ?? 'Cash'),
    notes: String(r.notes ?? ''),
    items: JSON.parse(String(r.items_json ?? '[]')),
    updatedAt: String(r.updated_at),
    createdAt: String(r.created_at),
  };
}

export function getSharedDrafts(): SharedDraft[] {
  const rows = db.prepare('SELECT * FROM shared_drafts ORDER BY updated_at DESC').all() as Record<string, unknown>[];
  return rows.map(mapDraftRow);
}

export function createSharedDraft(input: {
  businessId?: string;
  title: string;
  actorName: string;
  clientId?: number | null;
  clientName?: string;
  organization?: string;
  contactNo?: string;
  eventName?: string;
  venue?: string;
  dateOut?: string;
  expectedReturn?: string;
  days?: number;
  deliveryCharge?: number;
  discountPercent?: number;
  depositAdvance?: number;
  paymentMethod?: string;
  notes?: string;
  items: SharedDraft['items'];
}): SharedDraft {
  const now = new Date().toISOString();
  const res = db
    .prepare(`
      INSERT INTO shared_drafts (
        business_id, title, created_by, updated_by, client_id, client_name, organization, contact_no,
        event_name, venue, date_out, expected_return, days, delivery_charge, discount_percent,
        deposit_advance, payment_method, notes, items_json, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      (input.businessId ?? 'kr-oncue').trim() || 'kr-oncue',
      input.title.trim() || 'Untitled Team Draft',
      input.actorName,
      input.actorName,
      input.clientId ?? null,
      (input.clientName ?? '').trim(),
      (input.organization ?? '').trim(),
      (input.contactNo ?? '').trim(),
      (input.eventName ?? '').trim(),
      (input.venue ?? '').trim(),
      input.dateOut ?? now.slice(0, 10),
      input.expectedReturn ?? now.slice(0, 10),
      Math.max(1, Number(input.days) || 1),
      Math.max(0, Number(input.deliveryCharge) || 0),
      Math.min(100, Math.max(0, Number(input.discountPercent) || 0)),
      Math.max(0, Number(input.depositAdvance) || 0),
      input.paymentMethod ?? 'Cash',
      input.notes ?? '',
      JSON.stringify(input.items ?? []),
      now,
      now
    );
  const row = db.prepare('SELECT * FROM shared_drafts WHERE id = ?').get(res.lastInsertRowid) as Record<
    string,
    unknown
  >;
  return mapDraftRow(row);
}

export function updateSharedDraft(
  id: number,
  input: Partial<Omit<SharedDraft, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>> & { actorName: string }
): SharedDraft {
  const existing = db.prepare('SELECT * FROM shared_drafts WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) throw new Error('Shared draft not found');
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE shared_drafts
    SET business_id = ?, title = ?, updated_by = ?, client_id = ?, client_name = ?, organization = ?, contact_no = ?,
        event_name = ?, venue = ?, date_out = ?, expected_return = ?, days = ?, delivery_charge = ?,
        discount_percent = ?, deposit_advance = ?, payment_method = ?, notes = ?, items_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.businessId ?? String(existing.business_id ?? 'kr-oncue'),
    input.title !== undefined ? input.title.trim() : String(existing.title),
    input.actorName,
    input.clientId !== undefined ? input.clientId : existing.client_id ? Number(existing.client_id) : null,
    input.clientName !== undefined ? input.clientName.trim() : String(existing.client_name ?? ''),
    input.organization !== undefined ? input.organization.trim() : String(existing.organization ?? ''),
    input.contactNo !== undefined ? input.contactNo.trim() : String(existing.contact_no ?? ''),
    input.eventName !== undefined ? input.eventName.trim() : String(existing.event_name ?? ''),
    input.venue !== undefined ? input.venue.trim() : String(existing.venue ?? ''),
    input.dateOut ?? String(existing.date_out ?? ''),
    input.expectedReturn ?? String(existing.expected_return ?? ''),
    input.days !== undefined ? Math.max(1, Number(input.days) || 1) : Number(existing.days || 1),
    input.deliveryCharge !== undefined ? Math.max(0, Number(input.deliveryCharge) || 0) : Number(existing.delivery_charge || 0),
    input.discountPercent !== undefined ? Math.min(100, Math.max(0, Number(input.discountPercent) || 0)) : Number(existing.discount_percent || 0),
    input.depositAdvance !== undefined ? Math.max(0, Number(input.depositAdvance) || 0) : Number(existing.deposit_advance || 0),
    input.paymentMethod ?? String(existing.payment_method ?? 'Cash'),
    input.notes !== undefined ? input.notes : String(existing.notes ?? ''),
    input.items !== undefined ? JSON.stringify(input.items) : String(existing.items_json ?? '[]'),
    now,
    id
  );
  const row = db.prepare('SELECT * FROM shared_drafts WHERE id = ?').get(id) as Record<string, unknown>;
  return mapDraftRow(row);
}

export function deleteSharedDraft(id: number): void {
  db.prepare('DELETE FROM shared_drafts WHERE id = ?').run(id);
}

// --- ACTIVITY LOG ---

export function logActivity(
  actorName: string,
  action: string,
  entityType: string,
  entityId: string,
  summary: string
): ActivityLogEntry {
  const now = new Date().toISOString();
  const res = db
    .prepare(
      'INSERT INTO activity_log (actor_name, action, entity_type, entity_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(actorName || 'Team Member', action, entityType, entityId, summary, now);
  return {
    id: Number(res.lastInsertRowid),
    actorName: actorName || 'Team Member',
    action,
    entityType,
    entityId,
    summary,
    createdAt: now,
  };
}

export function getActivityLog(limit = 100): ActivityLogEntry[] {
  const rows = db
    .prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?')
    .all(limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    actorName: String(r.actor_name),
    action: String(r.action),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    summary: String(r.summary),
    createdAt: String(r.created_at),
  }));
}

// --- SERVER SETTINGS, STATS & BACKUP ---

export function getServerSettings(): {
  serverLabel: string;
  teamPinEnabled: boolean;
  teamPin: string;
  lastManualSaveAt: string;
  lastManualSaveBy: string;
} {
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    serverLabel: map.get('serverLabel') ?? 'KR-ONCUE Main Team Server',
    teamPinEnabled: map.get('teamPinEnabled') === 'true',
    teamPin: map.get('teamPin') ?? '',
    lastManualSaveAt: map.get('lastManualSaveAt') ?? '',
    lastManualSaveBy: map.get('lastManualSaveBy') ?? '',
  };
}

export function updateServerSettings(patch: {
  serverLabel?: string;
  teamPinEnabled?: boolean;
  teamPin?: string;
}): { serverLabel: string; teamPinEnabled: boolean } {
  const now = new Date().toISOString();
  const upsert = db.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  );
  if (patch.serverLabel !== undefined) {
    upsert.run('serverLabel', patch.serverLabel.trim() || 'KR-ONCUE Team Server', now);
  }
  if (patch.teamPinEnabled !== undefined) {
    upsert.run('teamPinEnabled', patch.teamPinEnabled ? 'true' : 'false', now);
  }
  if (patch.teamPin !== undefined) {
    upsert.run('teamPin', patch.teamPin.trim(), now);
  }
  const next = getServerSettings();
  return { serverLabel: next.serverLabel, teamPinEnabled: next.teamPinEnabled };
}

let lastAutoSaveTimestamp = '';

export function writeAutoSaveSnapshotFile(): string {
  const now = new Date().toISOString();
  lastAutoSaveTimestamp = now;
  if (db.isServerless) {
    return now;
  }
  try {
    const targetDir = path.dirname(db.getDbPath());
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const autoSaveFile = path.join(targetDir, 'kr_oncue_autosave.json');
    const tmpFile = `${autoSaveFile}.tmp`;
    const payload = exportFullBackup();
    fs.writeFileSync(tmpFile, JSON.stringify(payload), 'utf8');
    fs.renameSync(tmpFile, autoSaveFile);
  } catch {
    // ignore non-critical local auto-save file errors in read-only environments
  }
  return now;
}

export function getDatabaseStats() {
  const dbPath = db.getDbPath();
  const dbSizeBytes = db.getSizeBytes();
  let lastSavedAt = new Date().toISOString();
  let autoSavePath = db.isServerless
    ? 'Netlify Blobs (Auto-Persisted)'
    : path.join(path.dirname(dbPath), 'kr_oncue_autosave.json');
  let lastAutoSaveAt = lastAutoSaveTimestamp || lastSavedAt;

  if (!db.isServerless) {
    try {
      const st = fs.statSync(dbPath);
      lastSavedAt = st.mtime.toISOString();
    } catch {
      // ignore stat errors
    }
    try {
      const autoSt = fs.statSync(autoSavePath);
      lastAutoSaveAt = autoSt.mtime.toISOString();
    } catch {
      // ignore if autosave json hasn't been written yet
    }
  }

  const countOf = (table: string) =>
    Number((db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number }).cnt);

  return {
    dbPath,
    dbSizeBytes,
    lastSavedAt,
    lastAutoSaveAt,
    autoSavePath,
    counts: {
      inventory: countOf('inventory'),
      clients: countOf('clients'),
      quotes: countOf('quotes'),
      rentals: countOf('rentals'),
      payments: countOf('payments'),
      maintenance: countOf('maintenance_slips'),
      budgets: countOf('budget_requests'),
      drafts: countOf('shared_drafts'),
      activities: countOf('activity_log'),
      serverUsers: countOf('server_users'),
      businesses: countOf('businesses'),
    },
  };
}

export async function createSqliteBackupCopy(destPath: string): Promise<void> {
  await db.backup(destPath);
}

export function exportFullBackup() {
  return {
    exportedAt: new Date().toISOString(),
    app: 'kr-oncue-pos',
    version: 2,
    tables: {
      sequences: db.prepare('SELECT * FROM sequences').all(),
      businesses: db.prepare('SELECT * FROM businesses').all(),
      inventory: db.prepare('SELECT * FROM inventory').all(),
      clients: db.prepare('SELECT * FROM clients').all(),
      quotes: db.prepare('SELECT * FROM quotes').all(),
      quote_items: db.prepare('SELECT * FROM quote_items').all(),
      rentals: db.prepare('SELECT * FROM rentals').all(),
      rental_items: db.prepare('SELECT * FROM rental_items').all(),
      payments: db.prepare('SELECT * FROM payments').all(),
      maintenance_slips: db.prepare('SELECT * FROM maintenance_slips').all(),
      budget_requests: db.prepare('SELECT * FROM budget_requests').all(),
      shared_drafts: db.prepare('SELECT * FROM shared_drafts').all(),
      activity_log: db.prepare('SELECT * FROM activity_log').all(),
    },
  };
}

export function saveServerCheckpoint(actorName: string, label?: string): ServerSavepoint {
  const now = new Date().toISOString();
  const payload = exportFullBackup();
  const payloadJson = JSON.stringify(payload);
  const sizeBytes = Buffer.byteLength(payloadJson, 'utf8');
  const stats = getDatabaseStats();
  const counts = {
    inventory: stats.counts.inventory,
    clients: stats.counts.clients,
    quotes: stats.counts.quotes,
    rentals: stats.counts.rentals,
    payments: stats.counts.payments,
    maintenance: stats.counts.maintenance,
    budgets: stats.counts.budgets,
    drafts: stats.counts.drafts,
  };
  const finalLabel =
    label && label.trim()
      ? label.trim().slice(0, 80)
      : `Manual Save (${now.slice(0, 10)} ${now.slice(11, 16)})`;

  const res = db
    .prepare(
      'INSERT INTO server_saves (label, saved_by, size_bytes, counts_json, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(finalLabel, actorName || 'Team Member', sizeBytes, JSON.stringify(counts), payloadJson, now);

  const upsert = db.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  );
  upsert.run('lastManualSaveAt', now, now);
  upsert.run('lastManualSaveBy', actorName || 'Team Member', now);

  // Flush WAL into main SQLite DB file and write latest snapshot file on host disk
  db.pragma('wal_checkpoint(TRUNCATE)');
  const targetDir = db.isServerless ? os.tmpdir() : path.dirname(db.getDbPath());
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const latestFile = path.join(targetDir, 'kr_oncue_latest_save.json');
    fs.writeFileSync(latestFile, payloadJson, 'utf8');
  } catch {
    // ignore non-critical local checkpoint file write failures in read-only environments
  }

  return {
    id: Number(res.lastInsertRowid),
    label: finalLabel,
    savedBy: actorName || 'Team Member',
    sizeBytes,
    counts,
    createdAt: now,
  };
}

export function getServerSavepoints(limit = 30): ServerSavepoint[] {
  const rows = db
    .prepare('SELECT id, label, saved_by, size_bytes, counts_json, created_at FROM server_saves ORDER BY id DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: Number(r.id),
    label: String(r.label),
    savedBy: String(r.saved_by),
    sizeBytes: Number(r.size_bytes ?? 0),
    counts: JSON.parse(String(r.counts_json ?? '{}')),
    createdAt: String(r.created_at),
  }));
}

export function getServerSavepointPayload(id: number): { label: string; payloadJson: string } {
  const row = db
    .prepare('SELECT label, payload_json FROM server_saves WHERE id = ?')
    .get(id) as { label: string; payload_json: string } | undefined;
  if (!row) throw new Error('Server savepoint not found');
  return { label: row.label, payloadJson: row.payload_json };
}

export function restoreServerSavepoint(id: number): ServerSavepoint {
  const row = db
    .prepare('SELECT id, label, saved_by, size_bytes, counts_json, payload_json, created_at FROM server_saves WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error('Server savepoint not found');
  const parsed = JSON.parse(String(row.payload_json));
  restoreFullBackup(parsed);
  db.pragma('wal_checkpoint(TRUNCATE)');
  return {
    id: Number(row.id),
    label: String(row.label),
    savedBy: String(row.saved_by),
    sizeBytes: Number(row.size_bytes ?? 0),
    counts: JSON.parse(String(row.counts_json ?? '{}')),
    createdAt: String(row.created_at),
  };
}

export function deleteServerSavepoint(id: number): void {
  db.prepare('DELETE FROM server_saves WHERE id = ?').run(id);
}

export function restoreFullBackup(payload: {
  app?: string;
  tables?: Record<string, Array<Record<string, unknown>>>;
}): void {
  if (!payload || !payload.tables || !Array.isArray(payload.tables.inventory)) {
    throw new Error('Invalid backup file format');
  }
  const t = payload.tables;

  const insertRows = (table: string, rows: Array<Record<string, unknown>> | undefined) => {
    if (!rows || rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`);
    for (const row of rows) {
      stmt.run(...cols.map((c) => row[c] ?? null));
    }
  };

  const tx = db.transaction(() => {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DELETE FROM quote_items;
      DELETE FROM rental_items;
      DELETE FROM payments;
      DELETE FROM rentals;
      DELETE FROM quotes;
      DELETE FROM maintenance_slips;
      DELETE FROM budget_requests;
      DELETE FROM shared_drafts;
      DELETE FROM activity_log;
      DELETE FROM clients;
      DELETE FROM inventory;
      DELETE FROM sequences;
    `);
    if (Array.isArray(t.businesses) && t.businesses.length > 0) {
      db.exec('DELETE FROM businesses;');
      insertRows('businesses', t.businesses);
    }
    insertRows('sequences', t.sequences);
    insertRows('inventory', t.inventory);
    insertRows('clients', t.clients);
    insertRows('quotes', t.quotes);
    insertRows('quote_items', t.quote_items);
    insertRows('rentals', t.rentals);
    insertRows('rental_items', t.rental_items);
    insertRows('payments', t.payments);
    insertRows('maintenance_slips', t.maintenance_slips);
    insertRows('budget_requests', t.budget_requests);
    insertRows('shared_drafts', t.shared_drafts);
    insertRows('activity_log', t.activity_log);
    db.pragma('foreign_keys = ON');
  });

  tx();
}

// --- SERVER USERS & SHARED LIVE ACCESS ---

function mapServerUserRow(r: Record<string, unknown>): ServerUser {
  return {
    id: Number(r.id),
    clientId: String(r.client_id),
    name: String(r.name),
    email: String(r.email ?? ''),
    role: String(r.role ?? 'Team Member'),
    color: String(r.color ?? '#d97706'),
    accessLevel: String(r.access_level ?? 'EDITOR') as ServerUserAccess,
    canEdit: Boolean(r.can_edit),
    status: String(r.status ?? 'ACTIVE') as 'ACTIVE' | 'REVOKED',
    inviteToken: String(r.invite_token),
    addedBy: String(r.added_by ?? 'Host'),
    lastSeenAt: String(r.last_seen_at),
    createdAt: String(r.created_at),
    isOnline: Boolean(r.online_active),
    activeView: r.active_view ? String(r.active_view) : undefined,
    editingKey: r.editing_key ? String(r.editing_key) : null,
    deviceId: String(r.device_id ?? ''),
    deviceName: String(r.device_name ?? ''),
    deviceIp: String(r.device_ip ?? ''),
  };
}

function makeToken(): string {
  return `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getServerUsers(): ServerUser[] {
  const rows = db
    .prepare('SELECT * FROM server_users ORDER BY CASE access_level WHEN \'OWNER\' THEN 0 WHEN \'EDITOR\' THEN 1 ELSE 2 END, last_seen_at DESC')
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapServerUserRow);
}

export function getServerUserById(id: number): ServerUser | undefined {
  const row = db.prepare('SELECT * FROM server_users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapServerUserRow(row) : undefined;
}

export function getServerUserByClientId(clientId: string): ServerUser | undefined {
  const row = db.prepare('SELECT * FROM server_users WHERE client_id = ?').get(clientId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapServerUserRow(row) : undefined;
}

export function getServerUserByToken(token: string): ServerUser | undefined {
  const row = db.prepare('SELECT * FROM server_users WHERE invite_token = ?').get(token) as
    | Record<string, unknown>
    | undefined;
  return row ? mapServerUserRow(row) : undefined;
}

export function getServerUserByName(name: string): ServerUser | undefined {
  const clean = name.trim().toLowerCase();
  if (!clean) return undefined;
  const row = db
    .prepare("SELECT * FROM server_users WHERE LOWER(TRIM(name)) = ? AND status = 'ACTIVE' LIMIT 1")
    .get(clean) as Record<string, unknown> | undefined;
  return row ? mapServerUserRow(row) : undefined;
}

export function createServerUser(input: {
  clientId?: string;
  name: string;
  email?: string;
  role?: string;
  color?: string;
  accessLevel?: ServerUserAccess;
  canEdit?: boolean;
  addedBy?: string;
  deviceId?: string;
  deviceName?: string;
  deviceIp?: string;
  onlineActive?: boolean;
}): ServerUser {
  const now = new Date().toISOString();
  const accessLevel: ServerUserAccess = input.accessLevel ?? 'EDITOR';
  const canEdit = input.canEdit !== undefined ? input.canEdit : accessLevel !== 'VIEWER';
  let clientId = (input.clientId ?? '').trim();
  if (!clientId || getServerUserByClientId(clientId)) {
    clientId = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const inviteToken = makeToken();
  const deviceId = (input.deviceId ?? '').trim();
  const deviceName = (input.deviceName ?? '').trim();
  const deviceIp = (input.deviceIp ?? '').trim();
  const onlineActive = input.onlineActive ? 1 : 0;

  if (onlineActive && deviceId) {
    db.prepare('UPDATE server_users SET online_active = 0 WHERE device_id = ?').run(deviceId);
  }

  const res = db
    .prepare(`
      INSERT INTO server_users (
        client_id, name, email, role, color, access_level, can_edit, status,
        invite_token, added_by, last_seen_at, created_at,
        device_id, device_name, device_ip, online_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      clientId,
      input.name.trim(),
      (input.email ?? '').trim(),
      (input.role ?? (accessLevel === 'VIEWER' ? 'Viewer' : 'Team Member')).trim(),
      input.color ?? '#0284c7',
      accessLevel,
      canEdit ? 1 : 0,
      inviteToken,
      input.addedBy ?? 'Host',
      now,
      now,
      deviceId,
      deviceName,
      deviceIp,
      onlineActive
    );
  return getServerUserById(Number(res.lastInsertRowid))!;
}

export function updateServerUser(
  id: number,
  patch: Partial<{
    name: string;
    email: string;
    role: string;
    color: string;
    accessLevel: ServerUserAccess;
    canEdit: boolean;
    status: 'ACTIVE' | 'REVOKED';
  }>
): ServerUser {
  const existing = getServerUserById(id);
  if (!existing) throw new Error('Server user not found');

  const nextLevel = patch.accessLevel ?? existing.accessLevel;
  const nextCanEdit =
    nextLevel === 'OWNER'
      ? true
      : patch.canEdit !== undefined
        ? patch.canEdit
        : patch.accessLevel !== undefined
          ? nextLevel !== 'VIEWER'
          : existing.canEdit;
  const nextStatus = existing.accessLevel === 'OWNER' ? 'ACTIVE' : (patch.status ?? existing.status);

  db.prepare(`
    UPDATE server_users
    SET name = ?, email = ?, role = ?, color = ?, access_level = ?, can_edit = ?, status = ?
    WHERE id = ?
  `).run(
    patch.name !== undefined ? patch.name.trim() || existing.name : existing.name,
    patch.email !== undefined ? patch.email.trim() : existing.email,
    patch.role !== undefined ? patch.role.trim() || existing.role : existing.role,
    patch.color ?? existing.color,
    nextLevel,
    nextCanEdit ? 1 : 0,
    nextStatus,
    id
  );
  return getServerUserById(id)!;
}

export function deleteServerUser(id: number): void {
  const existing = getServerUserById(id);
  if (!existing) throw new Error('Server user not found');
  if (existing.accessLevel === 'OWNER') {
    const ownerCount = (
      db.prepare("SELECT COUNT(*) as cnt FROM server_users WHERE access_level = 'OWNER'").get() as { cnt: number }
    ).cnt;
    if (ownerCount <= 1) {
      throw new Error('Cannot remove the primary Server Owner');
    }
  }
  db.prepare('DELETE FROM server_users WHERE id = ?').run(id);
}

export function touchServerUserPresence(input: {
  clientId: string;
  serverUserId?: number | null;
  name: string;
  role: string;
  color: string;
  syncProfile?: boolean;
  activeView?: string;
  editingKey?: string | null;
  deviceId?: string;
  deviceName?: string;
  deviceIp?: string;
}): ServerUser | undefined {
  const now = new Date().toISOString();
  let user = input.serverUserId ? getServerUserById(input.serverUserId) : undefined;
  if (!user && input.clientId) {
    user = getServerUserByClientId(input.clientId);
  }
  if (!user) {
    return undefined;
  }
  if (user.status === 'REVOKED') {
    db.prepare('UPDATE server_users SET online_active = 0 WHERE id = ?').run(user.id);
    return getServerUserById(user.id);
  }

  const activeView = input.activeView ?? user.activeView ?? 'pos';
  const editingKey = input.editingKey !== undefined ? input.editingKey : (user.editingKey ?? null);
  const deviceId = (input.deviceId ?? '').trim() || user.deviceId || '';
  const deviceName = (input.deviceName ?? '').trim() || user.deviceName || '';
  const deviceIp = (input.deviceIp ?? '').trim() || user.deviceIp || '';

  if (deviceId) {
    db.prepare('UPDATE server_users SET online_active = 0 WHERE device_id = ? AND id != ?').run(deviceId, user.id);
  }

  if (input.syncProfile && input.name.trim()) {
    db.prepare(
      `UPDATE server_users
       SET last_seen_at = ?, online_active = 1, name = ?, role = ?, color = ?,
           active_view = ?, editing_key = ?, device_id = ?, device_name = ?, device_ip = ?
       WHERE id = ?`
    ).run(
      now,
      input.name.trim() || user.name,
      input.role.trim() || user.role,
      input.color || user.color,
      activeView,
      editingKey,
      deviceId,
      deviceName,
      deviceIp,
      user.id
    );
  } else {
    db.prepare(
      `UPDATE server_users
       SET last_seen_at = ?, online_active = 1, active_view = ?, editing_key = ?,
           device_id = ?, device_name = ?, device_ip = ?
       WHERE id = ?`
    ).run(now, activeView, editingKey, deviceId, deviceName, deviceIp, user.id);
  }
  return getServerUserById(user.id);
}

export function leaveServerUserPresence(input: {
  serverUserId?: number | null;
  deviceId?: string;
}): void {
  const deviceId = (input.deviceId ?? '').trim();
  if (input.serverUserId) {
    if (deviceId) {
      db.prepare("UPDATE server_users SET online_active = 0 WHERE id = ? AND (device_id = ? OR device_id = '')").run(
        input.serverUserId,
        deviceId
      );
    } else {
      db.prepare('UPDATE server_users SET online_active = 0 WHERE id = ?').run(input.serverUserId);
    }
    return;
  }
  if (deviceId) {
    db.prepare('UPDATE server_users SET online_active = 0 WHERE device_id = ?').run(deviceId);
  }
}

export function getActivePresenceMembersFromDb(maxAgeMs = 120_000) {
  const nowMs = Date.now();
  const rows = db
    .prepare("SELECT * FROM server_users WHERE status = 'ACTIVE' AND online_active = 1 ORDER BY last_seen_at DESC")
    .all() as Array<Record<string, unknown>>;
  return rows
    .map(mapServerUserRow)
    .filter((u) => {
      const seenMs = Date.parse(u.lastSeenAt);
      return Number.isFinite(seenMs) && nowMs - seenMs <= maxAgeMs;
    })
    .map((u) => ({
      clientId: u.clientId,
      serverUserId: u.id,
      name: u.name,
      role: u.role,
      color: u.color,
      accessLevel: u.accessLevel,
      canEdit: u.status === 'ACTIVE' && u.canEdit,
      activeView: u.activeView ?? 'pos',
      editingKey: u.editingKey ?? null,
      deviceId: u.deviceId || undefined,
      deviceName: u.deviceName || undefined,
      deviceIp: u.deviceIp || undefined,
      connectedAt: u.lastSeenAt,
      lastSeenAt: u.lastSeenAt,
    }));
}

