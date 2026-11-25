import { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Image as ImageIcon,
  Minus,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
} from 'lucide-react';
import type {
  BusinessUnit,
  EquipmentCategoryCode,
  InventoryItem,
  Rental,
  RentalStatus,
} from '../types';
import { apiFetch } from '../utils/api';
import { formatDate, getTodayISO, statusColorClass } from '../utils/format';
import type { PrintablePayload } from './PrintableFormModal';

interface AdminViewProps {
  inventory: InventoryItem[];
  rentals: Rental[];
  businesses: BusinessUnit[];
  operatorName: string;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenPrint: (payload: PrintablePayload) => void;
  onRefresh: () => void;
}

interface InternalCartLine {
  item: InventoryItem;
  quantity: number;
  remarks: string;
}

const CATEGORIES: Array<{ code: 'ALL' | EquipmentCategoryCode; label: string }> = [
  { code: 'ALL', label: 'All Gear' },
  { code: 'LW', label: 'LED Wall (LW)' },
  { code: 'AS', label: 'Audio (AS)' },
  { code: 'LS', label: 'Lighting (LS)' },
  { code: 'SS', label: 'Support (SS)' },
  { code: 'PS', label: 'Power (PS)' },
];

export function AdminView({
  inventory,
  rentals,
  businesses,
  operatorName,
  onNotify,
  onOpenPrint,
  onRefresh,
}: AdminViewProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | EquipmentCategoryCode>('ALL');
  const [availableOnly, setAvailableOnly] = useState(true);
  const [logStatusFilter, setLogStatusFilter] = useState<'ALL' | RentalStatus>('ALL');

  // Admin Release Form State (₱0 Own-Gear Checkout)
  const [cart, setCart] = useState<InternalCartLine[]>([]);
  const [custodianName, setCustodianName] = useState(operatorName || 'Admin Operations');
  const [department, setDepartment] = useState('KREC Internal Operations');
  const [contactNo, setContactNo] = useState('');
  const [purpose, setPurpose] = useState('');
  const [venue, setVenue] = useState('');
  const [dateOut, setDateOut] = useState(getTodayISO());
  const [expectedReturn, setExpectedReturn] = useState(getTodayISO());
  const [crew, setCrew] = useState('');
  const [vehicleDriver, setVehicleDriver] = useState('');
  const [conditionOut, setConditionOut] = useState('Good');
  const [submitting, setSubmitting] = useState(false);

  const primaryBusinessId = businesses[0]?.id || 'kr-oncue';

  const internalSlips = useMemo(
    () => rentals.filter((r) => Boolean(r.isInternal)),
    [rentals]
  );

  const filteredLog = useMemo(() => {
    return internalSlips.filter((r) => {
      if (logStatusFilter !== 'ALL' && r.status !== logStatusFilter) return false;
      return true;
    });
  }, [internalSlips, logStatusFilter]);

  const activeInternalSlips = useMemo(
    () => internalSlips.filter((r) => ['RESERVED', 'DISPATCHED', 'PARTIAL_RETURN'].includes(r.status)),
    [internalSlips]
  );

  const activeUnitsOut = useMemo(
    () =>
      activeInternalSlips.reduce(
        (sum, r) => sum + r.items.reduce((s, it) => s + Math.max(0, it.quantity - (it.qtyReturned ?? 0)), 0),
        0
      ),
    [activeInternalSlips]
  );

  const returnedInternalCount = useMemo(
    () => internalSlips.filter((r) => r.status === 'RETURNED').length,
    [internalSlips]
  );

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory.filter((item) => {
      if (categoryFilter !== 'ALL' && item.categoryCode !== categoryFilter) return false;
      if (availableOnly && item.qtyAvailable <= 0) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q)
      );
    });
  }, [inventory, search, categoryFilter, availableOnly]);

  const addToCart = (item: InventoryItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.item.code === item.code);
      if (idx >= 0) {
        const next = [...prev];
        if (next[idx].quantity < item.qtyAvailable) {
          next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        }
        return next;
      }
      return [...prev, { item, quantity: 1, remarks: '' }];
    });
  };

  const updateCartQty = (code: string, nextQty: number) => {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((l) => l.item.code !== code));
      return;
    }
    setCart((prev) => prev.map((l) => (l.item.code === code ? { ...l, quantity: nextQty } : l)));
  };

  const resetForm = () => {
    setCart([]);
    setPurpose('');
    setVenue('');
    setCrew('');
    setVehicleDriver('');
    setConditionOut('Good');
  };

  const handleCreateAdminRelease = async (mode: 'DISPATCHED' | 'RESERVED') => {
    if (cart.length === 0) {
      onNotify('Select at least one company equipment item first.', 'error');
      return;
    }
    if (!custodianName.trim()) {
      onNotify('Enter the Admin or Crew Custodian name.', 'error');
      return;
    }
    for (const line of cart) {
      if (line.item.status === 'MAINTENANCE') {
        onNotify(`${line.item.code} is under MAINTENANCE and cannot be dispatched.`, 'error');
        return;
      }
      if (line.quantity > line.item.qtyAvailable) {
        onNotify(
          `Insufficient stock for ${line.item.code}: requested ${line.quantity}, available ${line.item.qtyAvailable}.`,
          'error'
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/rentals', {
        method: 'POST',
        body: JSON.stringify({
          businessId: primaryBusinessId,
          isInternal: true,
          borrowerName: custodianName.trim(),
          organization: department.trim() || 'KREC Internal Operations',
          contactNo: contactNo.trim(),
          eventPurpose: purpose.trim() || 'Internal Company / Admin Use',
          venue: venue.trim(),
          dateOut,
          expectedReturn,
          daysOverall: 1,
          deliveryCharge: 0,
          discountPercent: 0,
          depositAdvance: 0,
          conditionUponRelease: conditionOut.trim() || 'Good',
          releasedBy: operatorName || custodianName.trim(),
          deliveryPersonnel: crew.trim(),
          vehicleDriver: vehicleDriver.trim(),
          mode,
          items: cart.map((l) => ({
            inventoryCode: l.item.code,
            equipmentName: l.item.name,
            quantity: l.quantity,
            rentalRate: 0,
            days: 1,
            remarks: l.remarks || 'Admin / Own Equipment Use',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record admin equipment release');
      const slip = data as Rental;
      onNotify(
        mode === 'DISPATCHED'
          ? `Admin Own-Gear Release ${slip.slipNo} dispatched (₱0.00). Stock updated.`
          : `Admin Own-Gear Reservation ${slip.slipNo} scheduled (₱0.00).`
      );
      onOpenPrint({ kind: 'adminRelease', data: slip });
      resetForm();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispatchReserved = async (r: Rental) => {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/rentals/${r.id}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({
          deliveryPersonnel: r.deliveryPersonnel,
          vehicleDriver: r.vehicleDriver,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch reserved equipment');
      onNotify(`Dispatched ${r.slipNo}. Stock moved to OUT.`);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelReserved = async (r: Rental) => {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/rentals/${r.id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel reservation');
      onNotify(`Cancelled ${r.slipNo}. Reserved stock returned to AVAILABLE.`);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickReturn = async (r: Rental) => {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/rentals/${r.id}/return`, {
        method: 'POST',
        body: JSON.stringify({
          inspectedBy: operatorName || 'Admin Warehouse Check-In',
          inspectionResult: 'Complete',
          conditionUponReturn: 'Good — internal company equipment returned',
          items: r.items.map((it) => ({
            itemId: it.id!,
            qtyReturned: it.quantity,
            missingQty: 0,
            damages: '',
            addCharges: 0,
            needsMaintenance: false,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Return check-in failed');
      onNotify(`Checked in ${r.slipNo} (${data.returnNo}). All own-gear restocked to AVAILABLE.`);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner & KPIs */}
      <div className="bg-white border border-slate-200 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 bg-slate-900 text-amber-400 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">
              Admin &amp; Own Equipment Dispatch (Non-Billable)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Use company-owned equipment for internal events, demos, or operations at{' '}
              <strong className="text-emerald-700">₱0.00</strong> — no rental charges and no client billing created.
              Inventory availability still updates live to prevent double-booking.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center font-mono tabular-nums">
          <div className="border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="font-sans text-[10px] uppercase text-slate-500">Active Slips</div>
            <div className="text-base font-bold text-slate-900">{activeInternalSlips.length}</div>
          </div>
          <div className="border border-slate-200 bg-amber-50 px-3 py-2">
            <div className="font-sans text-[10px] uppercase text-amber-800">Own Units Out</div>
            <div className="text-base font-bold text-amber-900">{activeUnitsOut}</div>
          </div>
          <div className="border border-slate-200 bg-emerald-50 px-3 py-2">
            <div className="font-sans text-[10px] uppercase text-emerald-800">Returned</div>
            <div className="text-base font-bold text-emerald-900">{returnedInternalCount}</div>
          </div>
        </div>
      </div>

      {/* 7-Col Own Equipment Catalog + 5-Col Admin Dispatch Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Company Equipment Stock</h2>
                <p className="text-xs text-slate-500">
                  Select own equipment to deploy internally without rental fees
                </p>
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(e) => setAvailableOnly(e.target.checked)}
                  className="accent-amber-600"
                />
                Available only
              </label>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, equipment name, brand, or location..."
                className="w-full border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.code}
                  type="button"
                  onClick={() => setCategoryFilter(cat.code)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    categoryFilter === cat.code
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[540px] overflow-y-auto divide-y divide-slate-100">
            {filteredInventory.map((item) => {
              const inCart = cart.find((c) => c.item.code === item.code)?.quantity ?? 0;
              const disabled = item.status === 'MAINTENANCE' || item.qtyAvailable <= 0;
              return (
                <div
                  key={item.code}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="h-10 w-12 shrink-0 border border-slate-200 object-cover bg-slate-100"
                      />
                    ) : (
                      <div className="h-10 w-12 shrink-0 border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-slate-900">{item.code}</span>
                        <span
                          className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold ${statusColorClass(item.status)}`}
                        >
                          {item.status}
                        </span>
                        {inCart > 0 && (
                          <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 text-[10px] font-mono font-semibold">
                            Selected: {inCart}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-medium text-slate-800 truncate">{item.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {item.brand || item.categoryName} · {item.location || item.placement || 'Warehouse'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-[11px] font-bold text-emerald-700">OWN GEAR · ₱0</div>
                      <div className="text-[11px] text-slate-500">
                        {item.qtyAvailable}/{item.qtyOnHand} avail
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={disabled || inCart >= item.qtyAvailable}
                      onClick={() => addToCart(item)}
                      className="inline-flex items-center gap-1 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredInventory.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-500">
                No matching available equipment found.
              </div>
            )}
          </div>
        </div>

        {/* Right 5 Cols: Admin Release Ticket */}
        <div className="lg:col-span-5 bg-white border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Internal Release Form (₱0.00)</h2>
              <p className="text-xs text-slate-500">{cart.length} item(s) · No rental fee or billing</p>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Admin / Custodian *</label>
                <input
                  type="text"
                  value={custodianName}
                  onChange={(e) => setCustodianName(e.target.value)}
                  placeholder="Admin or crew lead"
                  className="w-full border border-slate-300 px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Department / Team</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="KREC Production / Admin"
                  className="w-full border border-slate-300 px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Internal Event / Purpose</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Company event, setup test, demo"
                  className="w-full border border-slate-300 px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Contact No.</label>
                <input
                  type="text"
                  value={contactNo}
                  onChange={(e) => setContactNo(e.target.value)}
                  placeholder="Crew mobile (optional)"
                  className="w-full border border-slate-300 px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-600 mb-1">Venue / Deployment Location</label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="Venue, warehouse bay, or studio"
                className="w-full border border-slate-300 px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Date Out</label>
                <input
                  type="date"
                  value={dateOut}
                  onChange={(e) => setDateOut(e.target.value)}
                  className="w-full border border-slate-300 px-2 py-1.5 font-mono focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Expected Return</label>
                <input
                  type="date"
                  value={expectedReturn}
                  onChange={(e) => setExpectedReturn(e.target.value)}
                  className="w-full border border-slate-300 px-2 py-1.5 font-mono focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Crew / Personnel</label>
                <input
                  type="text"
                  value={crew}
                  onChange={(e) => setCrew(e.target.value)}
                  placeholder="Optional"
                  className="w-full border border-slate-300 px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Vehicle / Driver</label>
                <input
                  type="text"
                  value={vehicleDriver}
                  onChange={(e) => setVehicleDriver(e.target.value)}
                  placeholder="Optional"
                  className="w-full border border-slate-300 px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-600 mb-1">Release Condition</label>
              <input
                type="text"
                value={conditionOut}
                onChange={(e) => setConditionOut(e.target.value)}
                className="w-full border border-slate-300 px-2.5 py-1.5 focus:border-amber-600 focus:outline-none"
              />
            </div>

            {/* Selected Cart */}
            <div className="border-t border-slate-200 pt-3">
              <div className="font-semibold text-slate-700 mb-2">Selected Company Equipment</div>
              {cart.length === 0 ? (
                <div className="border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-slate-500">
                  Add equipment from the catalog on the left for ₱0.00 internal company use.
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-200">
                  {cart.map((line) => (
                    <div key={line.item.code} className="p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] font-semibold text-slate-800">
                            {line.item.code}
                          </div>
                          <div className="text-slate-900 font-medium truncate">{line.item.name}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.item.code, 0)}
                          className="text-slate-400 hover:text-red-600 cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center border border-slate-300">
                          <button
                            type="button"
                            onClick={() => updateCartQty(line.item.code, line.quantity - 1)}
                            className="px-2 py-1 text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="px-2.5 font-mono tabular-nums font-semibold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateCartQty(
                                line.item.code,
                                Math.min(line.item.qtyAvailable, line.quantity + 1)
                              )
                            }
                            className="px-2 py-1 text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="font-mono text-[11px] font-semibold text-emerald-700">
                          ₱0.00 (Own Gear)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center justify-between">
              <span className="font-semibold text-emerald-900">Internal Billing Total</span>
              <span className="font-mono font-bold text-emerald-800">₱0.00 (Non-Billable)</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={submitting || cart.length === 0}
                onClick={() => handleCreateAdminRelease('RESERVED')}
                className="border border-slate-300 bg-white px-3 py-2.5 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Reserve Own Gear
              </button>
              <button
                type="button"
                disabled={submitting || cart.length === 0}
                onClick={() => handleCreateAdminRelease('DISPATCHED')}
                className="bg-slate-900 px-3 py-2.5 font-semibold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Processing...' : 'Dispatch Own Gear (₱0)'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Admin / Internal Equipment Dispatches Log */}
      <div className="bg-white border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Admin Own-Gear Dispatch Log ({filteredLog.length})
            </h2>
            <p className="text-xs text-slate-500">
              Non-billable company equipment releases, return check-ins, and printable PDF gate passes
            </p>
          </div>
          <select
            value={logStatusFilter}
            onChange={(e) => setLogStatusFilter(e.target.value as 'ALL' | RentalStatus)}
            className="border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-amber-600 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="DISPATCHED">DISPATCHED</option>
            <option value="RESERVED">RESERVED</option>
            <option value="RETURNED">RETURNED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Slip / Gate Pass</th>
                <th className="px-4 py-2.5">Custodian / Dept</th>
                <th className="px-4 py-2.5">Internal Purpose / Venue</th>
                <th className="px-4 py-2.5">Schedule</th>
                <th className="px-4 py-2.5 text-right">Units</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLog.map((r) => {
                const totalUnits = r.items.reduce((s, it) => s + it.quantity, 0);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono">
                      <div className="font-semibold text-slate-900">{r.slipNo}</div>
                      <div className="text-[11px] text-slate-500">{r.drNo}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-900">{r.borrowerName}</div>
                      <div className="text-slate-500">{r.organization || 'KREC Internal'}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-slate-900">{r.eventPurpose || 'Internal Use'}</div>
                      <div className="text-slate-500">{r.venue || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-700">
                      <div>Out: {formatDate(r.dateOut)}</div>
                      <div>Ret: {formatDate(r.expectedReturn)}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                      {totalUnits}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 text-[11px] font-semibold ${statusColorClass(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenPrint({ kind: 'adminRelease', data: r })}
                          className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="Open printable form & Download PDF"
                        >
                          <Printer className="h-3 w-3" />
                          PDF / Print
                        </button>
                        {r.status === 'RESERVED' && (
                          <>
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleDispatchReserved(r)}
                              className="inline-flex items-center gap-1 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
                            >
                              <Truck className="h-3 w-3" />
                              Dispatch
                            </button>
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleCancelReserved(r)}
                              className="inline-flex items-center gap-1 border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
                            >
                              <Ban className="h-3 w-3" />
                              Cancel
                            </button>
                          </>
                        )}
                        {(r.status === 'DISPATCHED' || r.status === 'PARTIAL_RETURN') && (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => handleQuickReturn(r)}
                            className="inline-flex items-center gap-1 bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 cursor-pointer"
                          >
                            <ClipboardCheck className="h-3 w-3" />
                            Check In Gear
                          </button>
                        )}
                        {r.status === 'RETURNED' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 px-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Restocked
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredLog.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-500">
              No internal admin equipment dispatches recorded yet. Select equipment above to check out own gear at ₱0.00.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
