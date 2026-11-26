import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Image as ImageIcon, Minus, Plus, Save, Search, Trash2 } from 'lucide-react';
import type {
  BusinessUnit,
  Client,
  EquipmentCategoryCode,
  InventoryItem,
  Quote,
  Rental,
  SharedDraft,
} from '../types';
import { apiFetch } from '../utils/api';
import { formatPeso, getTodayISO, statusColorClass } from '../utils/format';
import type { PrintablePayload } from './PrintableFormModal';

interface CartLine {
  item: InventoryItem;
  quantity: number;
  rentalRate: number;
  remarks: string;
}

interface PosTerminalViewProps {
  inventory: InventoryItem[];
  businesses: BusinessUnit[];
  clients: Client[];
  drafts: SharedDraft[];
  activeBusinessId: string;
  onChangeBusiness: (businessId: string) => void;
  onOpenInventoryAddOther: () => void;
  onEditingChange?: (key: string | null) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenPrint: (payload: PrintablePayload) => void;
  onTransactionDone: () => void;
}

const CATEGORIES: Array<{ code: 'ALL' | EquipmentCategoryCode; label: string }> = [
  { code: 'ALL', label: 'All Gear' },
  { code: 'LW', label: 'LED Wall (LW)' },
  { code: 'AS', label: 'Audio (AS)' },
  { code: 'LS', label: 'Lighting (LS)' },
  { code: 'SS', label: 'Support (SS)' },
  { code: 'PS', label: 'Power (PS)' },
];

function CatalogThumb({ src, alt }: { src?: string; alt: string }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) {
    return (
      <div className="h-10 w-12 shrink-0 border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400">
        <ImageIcon className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div className="h-10 w-12 shrink-0 border border-slate-200 bg-slate-100 overflow-hidden">
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

export function PosTerminalView({
  inventory,
  businesses,
  clients,
  drafts,
  activeBusinessId,
  onChangeBusiness,
  onOpenInventoryAddOther,
  onEditingChange,
  onNotify,
  onOpenPrint,
  onTransactionDone,
}: PosTerminalViewProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | EquipmentCategoryCode>('ALL');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [includeAllBusinessGear, setIncludeAllBusinessGear] = useState(false);

  // Cart & Order State
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [showDraftsBar, setShowDraftsBar] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientName, setClientName] = useState('');
  const [organization, setOrganization] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [eventName, setEventName] = useState('');
  const [venue, setVenue] = useState('');
  const [dateOut, setDateOut] = useState(getTodayISO());
  const [expectedReturn, setExpectedReturn] = useState(getTodayISO());
  const [days, setDays] = useState(1);
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [depositAdvance, setDepositAdvance] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [draftAutoSaveStatus, setDraftAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [draftLastSavedTime, setDraftLastSavedTime] = useState('');
  const draftSnapshotRef = useRef('');

  const businessMap = useMemo(() => {
    const map = new Map<string, BusinessUnit>();
    for (const b of businesses) map.set(b.id, b);
    return map;
  }, [businesses]);

  const activeBusiness = activeBusinessId !== 'ALL' ? businessMap.get(activeBusinessId) : undefined;

  const effectiveBusinessId = useMemo(() => {
    if (activeBusinessId !== 'ALL') return activeBusinessId;
    return cart[0]?.item.businessId || businesses[0]?.id || 'kr-oncue';
  }, [activeBusinessId, cart, businesses]);

  const effectiveBusiness = businessMap.get(effectiveBusinessId);

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory.filter((item) => {
      if (activeBusinessId !== 'ALL' && !includeAllBusinessGear && item.businessId !== activeBusinessId) {
        return false;
      }
      if (categoryFilter !== 'ALL' && item.categoryCode !== categoryFilter) return false;
      if (availableOnly && item.qtyAvailable <= 0) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q) ||
        item.placement.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q)
      );
    });
  }, [inventory, search, activeBusinessId, includeAllBusinessGear, categoryFilter, availableOnly]);

  const handleSelectClient = (val: string) => {
    setSelectedClientId(val);
    if (!val) return;
    const found = clients.find((c) => String(c.id) === val);
    if (found) {
      setClientName(found.name);
      setOrganization(found.organization);
      setContactNo(found.contactNo);
    }
  };

  const addToCart = (item: InventoryItem, addQty = 1) => {
    setCart((prev) => {
      const idx = prev.findIndex((line) => line.item.code === item.code);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: next[idx].quantity + addQty,
        };
        return next;
      }
      return [...prev, { item, quantity: addQty, rentalRate: item.rentalRate, remarks: '' }];
    });
  };

  const updateCartQty = (code: string, nextQty: number) => {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((l) => l.item.code !== code));
      return;
    }
    setCart((prev) => prev.map((l) => (l.item.code === code ? { ...l, quantity: nextQty } : l)));
  };

  const updateCartRate = (code: string, nextRate: number) => {
    setCart((prev) =>
      prev.map((l) => (l.item.code === code ? { ...l, rentalRate: Math.max(0, nextRate) } : l))
    );
  };

  const subtotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.quantity * l.rentalRate * days, 0),
    [cart, days]
  );
  const discountAmt = (subtotal * Math.min(100, Math.max(0, discountPercent))) / 100;
  const grandTotal = Math.max(0, subtotal - discountAmt + deliveryCharge);
  const balanceDue = Math.max(0, grandTotal - depositAdvance);

  const buildDraftPayload = useCallback(() => {
    const title =
      draftTitle.trim() ||
      eventName.trim() ||
      (clientName.trim() ? `${clientName.trim()} Order` : 'Live Team Draft');
    return {
      businessId: effectiveBusinessId,
      title,
      clientId: selectedClientId ? Number(selectedClientId) : null,
      clientName,
      organization,
      contactNo,
      eventName,
      venue,
      dateOut,
      expectedReturn,
      days,
      deliveryCharge,
      discountPercent,
      depositAdvance,
      paymentMethod,
      notes,
      items: cart.map((l) => ({
        inventoryCode: l.item.code,
        equipmentName: l.item.name,
        quantity: l.quantity,
        rentalRate: l.rentalRate,
        remarks: l.remarks,
      })),
    };
  }, [
    draftTitle,
    eventName,
    clientName,
    effectiveBusinessId,
    selectedClientId,
    organization,
    contactNo,
    venue,
    dateOut,
    expectedReturn,
    days,
    deliveryCharge,
    discountPercent,
    depositAdvance,
    paymentMethod,
    notes,
    cart,
  ]);

  useEffect(() => {
    if (!onEditingChange) return;
    if (activeDraftId) {
      onEditingChange(`pos:draft-${activeDraftId}`);
    } else if (cart.length > 0 || clientName.trim() || eventName.trim()) {
      onEditingChange('pos:new-order');
    } else {
      onEditingChange(null);
    }
    return () => onEditingChange(null);
  }, [activeDraftId, cart.length, clientName, eventName, onEditingChange]);

  const resetCart = () => {
    draftSnapshotRef.current = '';
    setDraftAutoSaveStatus('idle');
    setDraftLastSavedTime('');
    setActiveDraftId(null);
    setDraftTitle('');
    setCart([]);
    setSelectedClientId('');
    setClientName('');
    setOrganization('');
    setContactNo('');
    setEventName('');
    setVenue('');
    setDeliveryCharge(0);
    setDiscountPercent(0);
    setDepositAdvance(0);
    setNotes('');
  };

  const persistDraft = useCallback(
    async (manual: boolean) => {
      if (cart.length === 0 && !clientName.trim() && !eventName.trim()) {
        if (manual) onNotify('Add gear or event info before saving a shared draft.', 'error');
        return;
      }
      const payload = buildDraftPayload();
      const serialized = JSON.stringify(payload);
      if (!manual && serialized === draftSnapshotRef.current) return;

      if (manual) setSubmitting(true);
      setDraftAutoSaveStatus('saving');
      try {
        const url = activeDraftId ? `/api/drafts/${activeDraftId}` : '/api/drafts';
        const method = activeDraftId ? 'PATCH' : 'POST';
        const res = await apiFetch(url, { method, body: serialized });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save shared draft');
        draftSnapshotRef.current = serialized;
        setActiveDraftId(data.id);
        setDraftTitle(data.title);
        setDraftAutoSaveStatus('saved');
        setDraftLastSavedTime(new Date().toLocaleTimeString());
        onTransactionDone();
        if (manual) {
          onNotify(`Saved shared team draft "${data.title}". Teammates can open & edit it now.`);
        }
      } catch (err) {
        setDraftAutoSaveStatus('error');
        if (manual) onNotify((err as Error).message, 'error');
      } finally {
        if (manual) setSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeDraftId, buildDraftPayload, cart.length, clientName, eventName]
  );

  useEffect(() => {
    if (submitting) return;
    if (cart.length === 0 && !clientName.trim() && !eventName.trim()) return;
    const serialized = JSON.stringify(buildDraftPayload());
    if (serialized === draftSnapshotRef.current) return;
    const timer = window.setTimeout(() => {
      void persistDraft(false);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [submitting, cart.length, clientName, eventName, buildDraftPayload, persistDraft]);

  const handleSaveSharedDraft = () => persistDraft(true);

  const handleLoadDraft = (d: SharedDraft) => {
    if (d.businessId && businessMap.has(d.businessId)) {
      onChangeBusiness(d.businessId);
    }
    const loadedCart: CartLine[] = [];
    for (const it of d.items) {
      const inv = inventory.find((x) => x.code === it.inventoryCode);
      if (inv) {
        loadedCart.push({
          item: inv,
          quantity: it.quantity,
          rentalRate: it.rentalRate,
          remarks: it.remarks || '',
        });
      }
    }
    draftSnapshotRef.current = JSON.stringify({
      businessId: d.businessId || effectiveBusinessId,
      title: d.title,
      clientId: d.clientId ?? null,
      clientName: d.clientName,
      organization: d.organization,
      contactNo: d.contactNo,
      eventName: d.eventName,
      venue: d.venue,
      dateOut: d.dateOut || getTodayISO(),
      expectedReturn: d.expectedReturn || getTodayISO(),
      days: d.days || 1,
      deliveryCharge: d.deliveryCharge || 0,
      discountPercent: d.discountPercent || 0,
      depositAdvance: d.depositAdvance || 0,
      paymentMethod: d.paymentMethod || 'Cash',
      notes: d.notes || '',
      items: loadedCart.map((l) => ({
        inventoryCode: l.item.code,
        equipmentName: l.item.name,
        quantity: l.quantity,
        rentalRate: l.rentalRate,
        remarks: l.remarks,
      })),
    });
    setDraftAutoSaveStatus('saved');
    setDraftLastSavedTime(new Date().toLocaleTimeString());
    setActiveDraftId(d.id);
    setDraftTitle(d.title);
    setSelectedClientId(d.clientId ? String(d.clientId) : '');
    setClientName(d.clientName);
    setOrganization(d.organization);
    setContactNo(d.contactNo);
    setEventName(d.eventName);
    setVenue(d.venue);
    setDateOut(d.dateOut || getTodayISO());
    setExpectedReturn(d.expectedReturn || getTodayISO());
    setDays(d.days || 1);
    setDeliveryCharge(d.deliveryCharge || 0);
    setDiscountPercent(d.discountPercent || 0);
    setDepositAdvance(d.depositAdvance || 0);
    setPaymentMethod(d.paymentMethod || 'Cash');
    setNotes(d.notes || '');
    setCart(loadedCart);
    setShowDraftsBar(false);
    onNotify(`Loaded shared draft "${d.title}".`);
  };

  const handleDeleteDraft = async (id: number) => {
    try {
      const res = await apiFetch(`/api/drafts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete draft');
      if (activeDraftId === id) {
        draftSnapshotRef.current = '';
        setDraftAutoSaveStatus('idle');
        setDraftLastSavedTime('');
        setActiveDraftId(null);
        setDraftTitle('');
      }
      onNotify('Removed shared draft.');
      onTransactionDone();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    }
  };

  const handleCreateQuote = async () => {
    if (cart.length === 0) {
      onNotify('Add at least one equipment item to generate a quote.', 'error');
      return;
    }
    if (!clientName.trim()) {
      onNotify('Enter a client or borrower name.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/quotes', {
        method: 'POST',
        body: JSON.stringify({
          businessId: effectiveBusinessId,
          clientId: selectedClientId ? Number(selectedClientId) : null,
          clientName: clientName.trim(),
          organization,
          contactNo,
          eventName,
          venue,
          eventDate: dateOut,
          expectedReturnDate: expectedReturn,
          days,
          deliveryCharge,
          discountPercent,
          notes,
          status: 'SENT',
          items: cart.map((l) => ({
            inventoryCode: l.item.code,
            equipmentName: l.item.name,
            quantity: l.quantity,
            rentalRate: l.rentalRate,
            days,
            remarks: l.remarks,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create quote');
      if (activeDraftId) {
        apiFetch(`/api/drafts/${activeDraftId}`, { method: 'DELETE' }).catch(() => {});
      }
      onNotify(`Quotation ${(data as Quote).quoteNo} generated for ${effectiveBusiness?.name || effectiveBusinessId}.`);
      onOpenPrint({ kind: 'quote', data });
      resetCart();
      onTransactionDone();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRental = async (mode: 'RESERVED' | 'DISPATCHED') => {
    if (cart.length === 0) {
      onNotify('Add at least one equipment item.', 'error');
      return;
    }
    if (!clientName.trim()) {
      onNotify('Enter a borrower or client name.', 'error');
      return;
    }

    for (const line of cart) {
      if (line.item.status === 'MAINTENANCE') {
        onNotify(`${line.item.code} is under MAINTENANCE and cannot be rented.`, 'error');
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
          businessId: effectiveBusinessId,
          clientId: selectedClientId ? Number(selectedClientId) : null,
          borrowerName: clientName.trim(),
          organization,
          contactNo,
          eventPurpose: eventName,
          venue,
          dateOut,
          expectedReturn,
          daysOverall: days,
          deliveryCharge,
          discountPercent,
          depositAdvance,
          paymentMethod,
          mode,
          items: cart.map((l) => ({
            inventoryCode: l.item.code,
            equipmentName: l.item.name,
            quantity: l.quantity,
            rentalRate: l.rentalRate,
            days,
            remarks: l.remarks,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create rental');
      const rental = data as Rental;
      if (activeDraftId) {
        apiFetch(`/api/drafts/${activeDraftId}`, { method: 'DELETE' }).catch(() => {});
      }
      onNotify(
        mode === 'DISPATCHED'
          ? `Dispatched ${rental.slipNo} (${rental.drNo}). Inventory updated.`
          : `Reserved ${rental.slipNo}. Stock locked.`
      );
      onOpenPrint({ kind: 'borrowers', data: rental });
      resetCart();
      onTransactionDone();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Multi-Business POS Terminal Switcher */}
      <div className="bg-white border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {businesses
            .filter((b) => b.active)
            .map((biz) => {
              const selected = activeBusinessId === biz.id;
              return (
                <button
                  key={biz.id}
                  type="button"
                  onClick={() => onChangeBusiness(biz.id)}
                  className={`inline-flex items-center gap-2 border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    selected
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0"
                    style={{ backgroundColor: biz.accentColor }}
                  />
                  <span>{biz.name}</span>
                  <span className={`font-mono text-[10px] ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
                    {biz.code}
                  </span>
                </button>
              );
            })}
          <button
            type="button"
            onClick={() => onChangeBusiness('ALL')}
            className={`border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeBusinessId === 'ALL'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Businesses
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {activeBusiness && (
            <span className="hidden xl:inline text-slate-500">
              Focus: <strong className="text-slate-800">{activeBusiness.tagline || activeBusiness.focusLabel}</strong>
            </span>
          )}
          <button
            type="button"
            onClick={onOpenInventoryAddOther}
            className="inline-flex items-center gap-1 border border-amber-600 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Inventory SKU
          </button>
        </div>
      </div>

      {/* Exact Same 7-Col Catalog / 5-Col Active Transaction POS Format */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left 7 Cols: Live Equipment Catalog */}
        <div className="lg:col-span-7 bg-white border border-slate-200">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {activeBusiness ? `${activeBusiness.name} — Equipment Catalog` : 'All Businesses Equipment Catalog'}
                </h2>
                <p className="text-xs text-slate-500">
                  Showing {filteredInventory.length} of {inventory.length} master SKUs · Click item to add to order
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {activeBusinessId !== 'ALL' && (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeAllBusinessGear}
                      onChange={(e) => setIncludeAllBusinessGear(e.target.checked)}
                      className="h-4 w-4 accent-amber-600"
                    />
                    Include other businesses&apos; gear
                  </label>
                )}
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={availableOnly}
                    onChange={(e) => setAvailableOnly(e.target.checked)}
                    className="h-4 w-4 accent-amber-600"
                  />
                  Available only
                </label>
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by code, name, brand, category, or warehouse location..."
                className="w-full border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1 bg-slate-100 p-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.code}
                  type="button"
                  onClick={() => setCategoryFilter(cat.code)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    categoryFilter === cat.code
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-100">
            {filteredInventory.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 space-y-2">
                <p>No equipment matches your current business or category filter.</p>
                {activeBusinessId !== 'ALL' && !includeAllBusinessGear && (
                  <button
                    type="button"
                    onClick={() => setIncludeAllBusinessGear(true)}
                    className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Show All Businesses&apos; Equipment
                  </button>
                )}
              </div>
            ) : (
              filteredInventory.map((item) => {
                const inCart = cart.find((c) => c.item.code === item.code);
                const isUnavailable = item.status === 'MAINTENANCE' || item.qtyAvailable <= 0;
                const itemBiz = businessMap.get(item.businessId);
                return (
                  <div
                    key={item.code}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <CatalogThumb src={item.imageUrl} alt={item.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-slate-900">{item.code}</span>
                          <span className="text-slate-300">·</span>
                          <span className={`font-semibold ${statusColorClass(item.status)}`}>{item.status}</span>
                          {itemBiz && (activeBusinessId === 'ALL' || includeAllBusinessGear) && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="font-medium text-slate-600 truncate">{itemBiz.code}</span>
                            </>
                          )}
                          {item.placement && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="text-slate-500 truncate">{item.placement}</span>
                            </>
                          )}
                        </div>
                        <div className="text-sm font-medium text-slate-900 truncate">{item.name}</div>
                        <div className="text-xs text-slate-500 truncate">
                          {item.brand ? `${item.brand} · ` : ''}
                          {item.categoryName} · Location: {item.location || 'Warehouse'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                          {formatPeso(item.rentalRate)}
                          <span className="text-xs font-normal text-slate-500">/d</span>
                        </div>
                        <div className="font-mono text-xs tabular-nums text-slate-500">
                          {item.qtyAvailable}/{item.qtyOnHand} avail
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {item.qtyAvailable >= 10 && (
                          <button
                            type="button"
                            onClick={() => addToCart(item, 10)}
                            className="border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                            title="Add full flight case (10 units)"
                          >
                            +10
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => addToCart(item, 1)}
                          disabled={item.status === 'MAINTENANCE'}
                          className={`inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                            isUnavailable
                              ? 'border border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'
                              : inCart
                                ? 'bg-amber-600 text-white hover:bg-amber-700'
                                : 'bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                          title={
                            isUnavailable
                              ? 'Add for Quote planning (0 stock currently available for immediate dispatch)'
                              : 'Add 1 unit to order'
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {inCart ? `In Order (${inCart.quantity})` : 'Add'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 5 Cols: Order / Quote / Checkout Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                {effectiveBusiness && (
                  <span
                    className="h-2.5 w-2.5 shrink-0"
                    style={{ backgroundColor: effectiveBusiness.accentColor }}
                  />
                )}
                <h2 className="text-base font-semibold text-slate-900">
                  {effectiveBusiness ? `${effectiveBusiness.name} POS` : 'Active Transaction'}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>
                  {cart.length} line item(s) · {activeDraftId ? `Draft: ${draftTitle}` : 'Build Quote or Borrowers Slip'}
                </span>
                {draftAutoSaveStatus === 'saving' && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5">
                    Auto-saving...
                  </span>
                )}
                {draftAutoSaveStatus === 'saved' && (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5">
                    Auto-saved draft {draftLastSavedTime}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDraftsBar((v) => !v)}
                className={`inline-flex items-center gap-1 border px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                  showDraftsBar
                    ? 'border-amber-600 bg-amber-50 text-amber-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                title="Open or collaborate on shared team drafts"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Team Drafts ({drafts.length})
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveSharedDraft}
                className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                title="Save this order to the server so teammates can edit it"
              >
                <Save className="h-3.5 w-3.5" />
                {activeDraftId ? 'Update Draft' : 'Share Draft'}
              </button>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={resetCart}
                  className="text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {showDraftsBar && (
            <div className="border-b border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">Shared Team Drafts (Saved on Server)</span>
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Draft name (optional)"
                  className="border border-slate-300 bg-white px-2 py-1 text-xs w-44 focus:border-amber-600 focus:outline-none"
                />
              </div>
              {drafts.length === 0 ? (
                <div className="text-slate-500 py-2">
                  No shared drafts yet. Click &ldquo;Share Draft&rdquo; to save an in-progress order for your team.
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {drafts.map((d) => {
                    const draftBiz = businessMap.get(d.businessId);
                    return (
                      <div
                        key={d.id}
                        className={`flex items-center justify-between gap-2 border bg-white p-2 ${
                          activeDraftId === d.id ? 'border-amber-600' : 'border-slate-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{d.title}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {draftBiz ? `${draftBiz.code} · ` : ''}
                            {d.items.length} items · Updated by {d.updatedBy}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleLoadDraft(d)}
                            className="bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
                          >
                            Load & Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDraft(d.id)}
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            title="Delete draft"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="p-4 space-y-4">
            {/* Client / Event Form */}
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Client / Walk-in Selection
                </label>
                <select
                  value={selectedClientId}
                  onChange={(e) => handleSelectClient(e.target.value)}
                  className="w-full border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                >
                  <option value="">Walk-in / Manual Client Entry (Auto-saves to Clients)</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.organization ? `(${c.organization})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Borrower / Client *</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setClientName(val);
                      if (selectedClientId) {
                        const curr = clients.find((c) => String(c.id) === selectedClientId);
                        if (curr && curr.name.trim().toLowerCase() !== val.trim().toLowerCase()) {
                          setSelectedClientId('');
                        }
                      }
                    }}
                    placeholder="Full name (walk-in auto-saved)"
                    className="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Organization</label>
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Company / Events team"
                    className="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Contact No.</label>
                  <input
                    type="text"
                    value={contactNo}
                    onChange={(e) => setContactNo(e.target.value)}
                    placeholder="09XX-XXX-XXXX"
                    className="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Event / Purpose</label>
                  <input
                    type="text"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="Concert, Wedding, Shoot, Expo"
                    className="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Venue / Delivery Address</label>
                <input
                  type="text"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="Hotel, Arena, Convention Center"
                  className="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date Out</label>
                  <input
                    type="date"
                    value={dateOut}
                    onChange={(e) => setDateOut(e.target.value)}
                    className="w-full border border-slate-300 px-2 py-1.5 text-xs font-mono focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Expected Return</label>
                  <input
                    type="date"
                    value={expectedReturn}
                    onChange={(e) => setExpectedReturn(e.target.value)}
                    className="w-full border border-slate-300 px-2 py-1.5 text-xs font-mono focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Rental Days</label>
                  <input
                    type="number"
                    min={1}
                    value={days}
                    onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Cart Items */}
            <div className="border-t border-slate-200 pt-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">Selected Equipment</div>
              {cart.length === 0 ? (
                <div className="border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                  Select gear from the catalog on the left to build a quotation or dispatch order.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200">
                  {cart.map((line) => (
                    <div key={line.item.code} className="p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] font-semibold text-slate-700">
                            {line.item.code}
                          </div>
                          <div className="text-xs font-medium text-slate-900 truncate">
                            {line.item.name}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.item.code, 0)}
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                          title="Remove line"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center border border-slate-300">
                          <button
                            type="button"
                            onClick={() => updateCartQty(line.item.code, line.quantity - 1)}
                            className="px-2 py-1 text-slate-600 hover:bg-slate-100 cursor-pointer"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) => updateCartQty(line.item.code, Number(e.target.value) || 1)}
                            className="w-12 text-center font-mono tabular-nums py-0.5 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => updateCartQty(line.item.code, line.quantity + 1)}
                            className="px-2 py-1 text-slate-600 hover:bg-slate-100 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">₱</span>
                          <input
                            type="number"
                            min={0}
                            value={line.rentalRate}
                            onChange={(e) => updateCartRate(line.item.code, Number(e.target.value) || 0)}
                            className="w-20 border border-slate-300 px-1.5 py-1 text-right font-mono tabular-nums text-xs focus:border-amber-600 focus:outline-none"
                          />
                        </div>

                        <div className="font-mono font-semibold tabular-nums text-slate-900 text-right w-24">
                          {formatPeso(line.quantity * line.rentalRate * days)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pricing & Payment Controls */}
            <div className="border-t border-slate-200 pt-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Delivery Charge (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={deliveryCharge}
                    onChange={(e) => setDeliveryCharge(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Discount (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-full border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Deposit / Paid Now (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={depositAdvance}
                    onChange={(e) => setDepositAdvance(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full border border-slate-300 px-2.5 py-1.5 text-xs font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-amber-600 focus:outline-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="GCash">GCash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Quote / Dispatch Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ingress time, operator inclusion, power requirements..."
                  className="w-full border border-slate-300 px-2.5 py-1.5 text-xs focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Equipment Subtotal ({days}d)</span>
                  <span className="font-mono tabular-nums">{formatPeso(subtotal)}</span>
                </div>
                {discountPercent > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount ({discountPercent}%)</span>
                    <span className="font-mono tabular-nums">-{formatPeso(discountAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Delivery / Setup</span>
                  <span className="font-mono tabular-nums">{formatPeso(deliveryCharge)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-900">
                  <span>Total Amount</span>
                  <span className="font-mono tabular-nums">{formatPeso(grandTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Balance Due After Deposit</span>
                  <span className="font-mono tabular-nums font-semibold text-amber-700">{formatPeso(balanceDue)}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleCreateQuote}
                  className="border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  Save Quote
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleCreateRental('RESERVED')}
                  className="border border-amber-600 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  Reserve Gear
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleCreateRental('DISPATCHED')}
                  className="bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  Dispatch Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
