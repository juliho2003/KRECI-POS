import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Boxes,
  Building2,
  Pencil,
  Plus,
  Printer,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import type {
  BusinessStat,
  BusinessUnit,
  DashboardSummary,
  EquipmentCategoryCode,
  Payment,
  Quote,
  Rental,
} from '../types';
import { apiFetch } from '../utils/api';
import { formatDate, formatPeso, statusColorClass } from '../utils/format';
import type { PrintablePayload } from './PrintableFormModal';

interface DashboardViewProps {
  dashboard: DashboardSummary | null;
  businesses: BusinessUnit[];
  quotes: Quote[];
  rentals: Rental[];
  payments: Payment[];
  onOpenBusinessPos: (businessId: string) => void;
  onOpenBusinessInventory: (businessId: string, category?: 'ALL' | EquipmentCategoryCode) => void;
  onOpenPrint: (payload: PrintablePayload) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}

const ACCENT_COLORS = ['#d97706', '#0284c7', '#7c3aed', '#059669', '#dc2626', '#0d9488', '#334155'];

interface UnifiedPosFeedRow {
  key: string;
  kind: 'RENTAL' | 'QUOTE' | 'PAYMENT';
  businessId: string;
  docNo: string;
  party: string;
  detail: string;
  date: string;
  createdAt: string;
  amount: number;
  status: string;
  printPayload: PrintablePayload;
}

export function DashboardView({
  dashboard,
  businesses,
  quotes,
  rentals,
  payments,
  onOpenBusinessPos,
  onOpenBusinessInventory,
  onOpenPrint,
  onNotify,
  onRefresh,
}: DashboardViewProps) {
  const [txBizFilter, setTxBizFilter] = useState<string>('ALL');
  const [txTypeFilter, setTxTypeFilter] = useState<'ALL' | 'RENTAL' | 'QUOTE' | 'PAYMENT'>('ALL');

  // Add / Edit Business Modal State
  const [showBizModal, setShowBizModal] = useState(false);
  const [editingBiz, setEditingBiz] = useState<BusinessUnit | null>(null);
  const [bizCode, setBizCode] = useState('');
  const [bizName, setBizName] = useState('');
  const [bizTagline, setBizTagline] = useState('');
  const [bizFocus, setBizFocus] = useState('');
  const [bizColor, setBizColor] = useState('#0284c7');
  const [bizActive, setBizActive] = useState(true);
  const [savingBiz, setSavingBiz] = useState(false);

  const businessMap = useMemo(() => {
    const map = new Map<string, BusinessUnit>();
    for (const b of businesses) {
      map.set(b.id, b);
    }
    return map;
  }, [businesses]);

  const statsList: BusinessStat[] = useMemo(() => {
    if (dashboard?.businessStats && dashboard.businessStats.length > 0) {
      return dashboard.businessStats;
    }
    return businesses.map((b) => ({
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
    }));
  }, [dashboard, businesses]);

  const unifiedFeed = useMemo<UnifiedPosFeedRow[]>(() => {
    const rows: UnifiedPosFeedRow[] = [];

    for (const r of rentals) {
      rows.push({
        key: `rental-${r.id}`,
        kind: 'RENTAL',
        businessId: r.businessId || 'kr-oncue',
        docNo: r.slipNo,
        party: r.borrowerName,
        detail: r.isInternal
          ? `Own Gear · ${r.eventPurpose || r.venue || r.drNo}`
          : r.eventPurpose || r.venue || r.drNo,
        date: r.dateOut || r.dateIssued,
        createdAt: r.createdAt,
        amount: r.isInternal ? 0 : r.totalRentalAmount,
        status: r.status,
        printPayload: { kind: r.isInternal ? 'adminRelease' : 'borrowers', data: r },
      });
    }

    for (const q of quotes) {
      rows.push({
        key: `quote-${q.id}`,
        kind: 'QUOTE',
        businessId: q.businessId || 'kr-oncue',
        docNo: q.quoteNo,
        party: q.clientName,
        detail: q.eventName || q.venue || `${q.items.length} line item(s)`,
        date: q.eventDate || q.createdAt,
        createdAt: q.createdAt,
        amount: q.totalAmount,
        status: q.status,
        printPayload: { kind: 'quote', data: q },
      });
    }

    for (const p of payments) {
      rows.push({
        key: `payment-${p.id}`,
        kind: 'PAYMENT',
        businessId: p.businessId || 'kr-oncue',
        docNo: p.receiptNo,
        party: p.receivedFrom,
        detail: `${p.paymentMethod}${p.slipNo ? ` · ${p.slipNo}` : ''}`,
        date: p.paymentDate,
        createdAt: p.createdAt,
        amount: p.amountPaid,
        status: p.paymentStatus,
        printPayload: { kind: 'payment', data: p },
      });
    }

    return rows
      .filter((row) => {
        if (txBizFilter !== 'ALL' && row.businessId !== txBizFilter) return false;
        if (txTypeFilter !== 'ALL' && row.kind !== txTypeFilter) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40);
  }, [rentals, quotes, payments, txBizFilter, txTypeFilter]);

  const openAddBusiness = () => {
    setEditingBiz(null);
    setBizCode('');
    setBizName('');
    setBizTagline('');
    setBizFocus('');
    setBizColor('#0284c7');
    setBizActive(true);
    setShowBizModal(true);
  };

  const openEditBusiness = (bizId: string) => {
    const found = businessMap.get(bizId);
    if (!found) return;
    setEditingBiz(found);
    setBizCode(found.code);
    setBizName(found.name);
    setBizTagline(found.tagline);
    setBizFocus(found.focusLabel);
    setBizColor(found.accentColor || '#d97706');
    setBizActive(found.active);
    setShowBizModal(true);
  };

  const handleSaveBusiness = async () => {
    if (!bizCode.trim() || !bizName.trim()) {
      onNotify('Business Code and Business Name are required.', 'error');
      return;
    }
    setSavingBiz(true);
    try {
      const payload = {
        code: bizCode.trim().toUpperCase(),
        name: bizName.trim(),
        tagline: bizTagline.trim(),
        focusLabel: bizFocus.trim() || bizTagline.trim(),
        accentColor: bizColor,
        active: bizActive,
      };
      const res = await apiFetch(
        editingBiz ? `/api/businesses/${encodeURIComponent(editingBiz.id)}` : '/api/businesses',
        {
          method: editingBiz ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save business POS');
      onNotify(
        editingBiz
          ? `Updated business POS "${data.name}".`
          : `Created new business POS "${data.name}" (${data.code}).`
      );
      setShowBizModal(false);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSavingBiz(false);
    }
  };

  const handleDeleteBusiness = async () => {
    if (!editingBiz) return;
    setSavingBiz(true);
    try {
      const res = await apiFetch(`/api/businesses/${encodeURIComponent(editingBiz.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete business');
      onNotify(`Removed business unit "${editingBiz.name}".`);
      setShowBizModal(false);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSavingBiz(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 px-5 py-4">
        <div>
          <h1 className="text-base font-bold text-slate-900">Multi-Business Rental POS Command</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Unified revenue, active slips, quotes, and equipment availability across {statsList.length} business units
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={openAddBusiness}
            className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Business POS
          </button>
        </div>
      </div>

      {/* Business POS Portfolio Grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Business POS Units ({statsList.length})
          </h2>
          <span className="text-xs text-slate-500">
            Select any business to open its POS terminal or manage its inventory
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {statsList.map((biz) => (
            <div
              key={biz.businessId}
              className="bg-white border border-slate-200 flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="h-1 w-full" style={{ backgroundColor: biz.accentColor }} />
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                        <span
                          className="h-2.5 w-2.5 shrink-0"
                          style={{ backgroundColor: biz.accentColor }}
                        />
                        <span className="font-semibold text-slate-800">{biz.code}</span>
                        <span>·</span>
                        <span className={biz.active ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                          {biz.active ? 'ACTIVE' : 'PAUSED'}
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm font-bold text-slate-900 truncate" title={biz.name}>
                        {biz.name}
                      </h3>
                      <p className="text-xs text-slate-500 truncate" title={biz.tagline || biz.focusLabel}>
                        {biz.tagline || biz.focusLabel || 'Equipment Rental POS'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditBusiness(biz.businessId)}
                      className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer shrink-0"
                      title="Edit Business POS details"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Financial Metrics */}
                  <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                    <div>
                      <div className="text-[11px] text-slate-500">Revenue Collected</div>
                      <div className="font-mono font-bold tabular-nums text-emerald-700 mt-0.5">
                        {formatPeso(biz.totalRevenueCollected)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Receivables Due</div>
                      <div className="font-mono font-bold tabular-nums text-amber-700 mt-0.5">
                        {formatPeso(biz.outstandingReceivables)}
                      </div>
                    </div>
                  </div>

                  {/* Operational Metrics */}
                  <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs font-mono tabular-nums">
                    <div>
                      <div className="font-sans text-[11px] text-slate-500">Active Slips</div>
                      <div className="font-bold text-slate-900 mt-0.5">{biz.activeRentalsCount}</div>
                    </div>
                    <div>
                      <div className="font-sans text-[11px] text-slate-500">Open Quotes</div>
                      <div className="font-bold text-slate-900 mt-0.5">{biz.pendingQuotesCount}</div>
                    </div>
                    <div>
                      <div className="font-sans text-[11px] text-slate-500">Stock Avail</div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {biz.unitsAvailable}
                        <span className="text-[11px] font-normal text-slate-400">/{biz.unitsOnHand}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {biz.skuCount} SKUs · {biz.unitsOut} units out · {biz.unitsMaintenance} maint
                  </div>
                </div>
              </div>

              {/* Card Actions */}
              <div className="grid grid-cols-2 border-t border-slate-200 divide-x divide-slate-200 bg-slate-50 text-xs">
                <button
                  type="button"
                  onClick={() => onOpenBusinessPos(biz.businessId)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 font-semibold text-slate-900 hover:bg-amber-50 hover:text-amber-800 transition-colors cursor-pointer"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Open POS
                </button>
                <button
                  type="button"
                  onClick={() => onOpenBusinessInventory(biz.businessId, 'ALL')}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <Boxes className="h-3.5 w-3.5" />
                  Inventory
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Master Equipment Availability Matrix */}
      {dashboard && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Master Equipment Availability by Category
            </h2>
            <button
              type="button"
              onClick={() => onOpenBusinessInventory('ALL', 'ALL')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
            >
              View Master Inventory
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {dashboard.categoryStats.map((cat) => (
              <button
                key={cat.categoryCode}
                type="button"
                onClick={() => onOpenBusinessInventory('ALL', cat.categoryCode)}
                className="text-left bg-white border border-slate-200 hover:border-amber-600 p-3.5 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono font-bold text-slate-900">{cat.categoryCode}</span>
                  <span className="font-mono tabular-nums">{cat.skuCount} SKUs</span>
                </div>
                <div className="mt-1 text-xs font-medium text-slate-700 truncate" title={cat.categoryName}>
                  {cat.categoryName}
                </div>
                <div className="mt-2 flex items-baseline justify-between font-mono tabular-nums">
                  <span className="text-lg font-bold text-slate-900">{cat.unitsAvailable}</span>
                  <span className="text-xs text-slate-500">/ {cat.unitsOnHand}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
                  {cat.unitsOut} out · {cat.unitsMaintenance} maint
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Cross-Business POS Activity & Transaction Feed */}
      <section className="bg-white border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              All Businesses POS Transactions & Quotations
            </h2>
            <p className="text-xs text-slate-500">
              {statsList.length <= 1
                ? 'Live unified ledger for KR-ONCUE POS terminal'
                : 'Live unified ledger across KR-ONCUE and active business POS terminals'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={txBizFilter}
              onChange={(e) => setTxBizFilter(e.target.value)}
              className="border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-amber-600 focus:outline-none"
            >
              <option value="ALL">All Businesses POS</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>

            <div className="flex gap-1 bg-slate-100 p-1">
              {(['ALL', 'RENTAL', 'QUOTE', 'PAYMENT'] as const).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setTxTypeFilter(tp)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    txTypeFilter === tp ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tp === 'ALL' ? 'All Docs' : tp === 'RENTAL' ? 'Slips' : tp === 'QUOTE' ? 'Quotes' : 'Payments'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Business POS</th>
                <th className="px-4 py-2.5">Type · Doc No.</th>
                <th className="px-4 py-2.5">Client / Borrower</th>
                <th className="px-4 py-2.5">Event / Details</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Amount (₱)</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unifiedFeed.map((row) => {
                const biz = businessMap.get(row.businessId);
                return (
                  <tr key={row.key} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0"
                          style={{ backgroundColor: biz?.accentColor || '#d97706' }}
                        />
                        <span className="font-semibold text-slate-900">{biz?.name || row.businessId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                      <span className="text-slate-500">{row.kind}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span className="font-semibold text-slate-900">{row.docNo}</span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{row.party}</td>
                    <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">{row.detail || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                      {formatDate(row.date)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatPeso(row.amount)}
                    </td>
                    <td className={`px-4 py-2.5 font-semibold whitespace-nowrap ${statusColorClass(row.status)}`}>
                      {row.status}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenPrint(row.printPayload)}
                        className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <Printer className="h-3 w-3" />
                        Print
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {unifiedFeed.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No POS transactions recorded for this business filter yet. Click &ldquo;Open POS&rdquo; on any business card above to create a quotation or rental slip.
            </div>
          )}
        </div>
      </section>

      {/* Add / Edit Business POS Modal */}
      {showBizModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  {editingBiz ? `Edit Business POS — ${editingBiz.name}` : 'Add New Business POS Unit'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBizModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Short Code *</label>
                  <input
                    type="text"
                    value={bizCode}
                    onChange={(e) => setBizCode(e.target.value.toUpperCase())}
                    placeholder="TENTS"
                    maxLength={12}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono uppercase focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Business Name *</label>
                  <input
                    type="text"
                    value={bizName}
                    onChange={(e) => setBizName(e.target.value)}
                    placeholder="e.g. KR-CATERING & TABLES"
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">POS Header Subtitle / Tagline</label>
                <input
                  type="text"
                  value={bizTagline}
                  onChange={(e) => setBizTagline(e.target.value)}
                  placeholder="e.g. Banquet Tables, Chairs & Canopy Rentals"
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Business Focus Label</label>
                <input
                  type="text"
                  value={bizFocus}
                  onChange={(e) => setBizFocus(e.target.value)}
                  placeholder="e.g. Event Furniture & Staging"
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1.5">Business Accent Color</label>
                <div className="flex gap-2">
                  {ACCENT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setBizColor(color)}
                      className={`h-7 w-7 cursor-pointer transition-transform ${
                        bizColor === color ? 'ring-2 ring-slate-900 scale-110' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              {editingBiz && !editingBiz.isDefault && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bizActive}
                    onChange={(e) => setBizActive(e.target.checked)}
                    className="h-4 w-4 accent-amber-600"
                  />
                  <span className="font-medium text-slate-700">Active in POS Terminal Switcher</span>
                </label>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <div>
                {editingBiz && !editingBiz.isDefault && (
                  <button
                    type="button"
                    disabled={savingBiz}
                    onClick={handleDeleteBusiness}
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBizModal(false)}
                  className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingBiz}
                  onClick={handleSaveBusiness}
                  className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  {editingBiz ? 'Save Business' : 'Create Business POS'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
