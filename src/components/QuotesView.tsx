import { useMemo, useState } from 'react';
import { ArrowRightCircle, Minus, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import type { BusinessUnit, InventoryItem, PresenceMember, Quote, QuoteStatus, Rental } from '../types';
import { apiFetch } from '../utils/api';
import { formatDate, formatPeso, statusColorClass } from '../utils/format';
import type { PrintablePayload } from './PrintableFormModal';

interface QuotesViewProps {
  quotes: Quote[];
  businesses: BusinessUnit[];
  inventory: InventoryItem[];
  onlineMembers: PresenceMember[];
  currentClientId: string;
  onEditingChange: (key: string | null) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenPrint: (payload: PrintablePayload) => void;
  onGoToPOS: () => void;
  onRefresh: () => void;
}

interface EditQuoteLine {
  inventoryCode: string;
  equipmentName: string;
  quantity: number;
  rentalRate: number;
  remarks: string;
}

export function QuotesView({
  quotes,
  businesses,
  inventory,
  onlineMembers,
  currentClientId,
  onEditingChange,
  onNotify,
  onOpenPrint,
  onGoToPOS,
  onRefresh,
}: QuotesViewProps) {
  const [search, setSearch] = useState('');
  const [businessFilter, setBusinessFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | QuoteStatus>('ALL');
  const [convertingQuote, setConvertingQuote] = useState<Quote | null>(null);
  const [convertMode, setConvertMode] = useState<'RESERVED' | 'DISPATCHED'>('RESERVED');
  const [deposit, setDeposit] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [submitting, setSubmitting] = useState(false);

  // Full Edit Quote modal state
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editOrg, setEditOrg] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editEvent, setEditEvent] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editEventDate, setEditEventDate] = useState('');
  const [editReturnDate, setEditReturnDate] = useState('');
  const [editDays, setEditDays] = useState(1);
  const [editDelivery, setEditDelivery] = useState(0);
  const [editDiscount, setEditDiscount] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState<EditQuoteLine[]>([]);
  const [addItemCode, setAddItemCode] = useState('');

  const businessMap = useMemo(() => {
    const map = new Map<string, BusinessUnit>();
    for (const b of businesses) map.set(b.id, b);
    return map;
  }, [businesses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter((qt) => {
      if (businessFilter !== 'ALL' && qt.businessId !== businessFilter) return false;
      if (statusFilter !== 'ALL' && qt.status !== statusFilter) return false;
      if (!q) return true;
      return (
        qt.quoteNo.toLowerCase().includes(q) ||
        qt.clientName.toLowerCase().includes(q) ||
        qt.organization.toLowerCase().includes(q) ||
        qt.eventName.toLowerCase().includes(q) ||
        qt.venue.toLowerCase().includes(q)
      );
    });
  }, [quotes, search, businessFilter, statusFilter]);

  const openEditQuote = (qt: Quote) => {
    setEditingQuote(qt);
    setEditClientName(qt.clientName);
    setEditOrg(qt.organization);
    setEditContact(qt.contactNo);
    setEditEvent(qt.eventName);
    setEditVenue(qt.venue);
    setEditEventDate(qt.eventDate);
    setEditReturnDate(qt.expectedReturnDate);
    setEditDays(qt.days);
    setEditDelivery(qt.deliveryCharge);
    setEditDiscount(qt.discountPercent);
    setEditNotes(qt.notes);
    setEditItems(
      qt.items.map((it) => ({
        inventoryCode: it.inventoryCode,
        equipmentName: it.equipmentName,
        quantity: it.quantity,
        rentalRate: it.rentalRate,
        remarks: it.remarks,
      }))
    );
    setAddItemCode(inventory[0]?.code ?? '');
    onEditingChange(`quote:${qt.quoteNo}`);
  };

  const closeEditQuote = () => {
    setEditingQuote(null);
    onEditingChange(null);
  };

  const handleSaveEditQuote = async () => {
    if (!editingQuote) return;
    if (!editClientName.trim() || editItems.length === 0) {
      onNotify('Client name and at least one item are required.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/quotes/${editingQuote.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          clientId: editingQuote.clientId,
          clientName: editClientName.trim(),
          organization: editOrg,
          contactNo: editContact,
          eventName: editEvent,
          venue: editVenue,
          eventDate: editEventDate,
          expectedReturnDate: editReturnDate,
          days: editDays,
          deliveryCharge: editDelivery,
          discountPercent: editDiscount,
          notes: editNotes,
          status: editingQuote.status,
          items: editItems.map((it) => ({
            inventoryCode: it.inventoryCode,
            equipmentName: it.equipmentName,
            quantity: it.quantity,
            rentalRate: it.rentalRate,
            days: editDays,
            remarks: it.remarks,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update quote');
      onNotify(`Saved edits to ${editingQuote.quoteNo}.`);
      closeEditQuote();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteQuote = async (qt: Quote) => {
    try {
      const res = await apiFetch(`/api/quotes/${qt.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete quote');
      onNotify(`Deleted quotation ${qt.quoteNo}.`);
      if (editingQuote?.id === qt.id) closeEditQuote();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    }
  };

  const handleStatusChange = async (id: number, status: QuoteStatus) => {
    try {
      const res = await apiFetch(`/api/quotes/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update quote status');
      onNotify(`Quote status updated to ${status}.`);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    }
  };

  const handleConvert = async () => {
    if (!convertingQuote) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/rentals', {
        method: 'POST',
        body: JSON.stringify({
          businessId: convertingQuote.businessId,
          quoteId: convertingQuote.id,
          clientId: convertingQuote.clientId,
          borrowerName: convertingQuote.clientName,
          organization: convertingQuote.organization,
          contactNo: convertingQuote.contactNo,
          eventPurpose: convertingQuote.eventName,
          venue: convertingQuote.venue,
          dateOut: convertingQuote.eventDate,
          expectedReturn: convertingQuote.expectedReturnDate,
          daysOverall: convertingQuote.days,
          deliveryCharge: convertingQuote.deliveryCharge,
          discountPercent: convertingQuote.discountPercent,
          depositAdvance: deposit,
          paymentMethod,
          mode: convertMode,
          items: convertingQuote.items.map((it) => ({
            inventoryCode: it.inventoryCode,
            equipmentName: it.equipmentName,
            quantity: it.quantity,
            rentalRate: it.rentalRate,
            days: it.days,
            remarks: it.remarks,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to convert quote');
      const rental = data as Rental;
      onNotify(`Converted ${convertingQuote.quoteNo} to Borrowers Slip ${rental.slipNo}.`);
      setConvertingQuote(null);
      onOpenPrint({ kind: 'borrowers', data: rental });
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const editSubtotal = editItems.reduce((s, it) => s + it.quantity * it.rentalRate * editDays, 0);
  const editTotal = Math.max(0, editSubtotal - (editSubtotal * editDiscount) / 100 + editDelivery);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search quotes by number, client, event, or venue..."
                className="w-full border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs focus:border-amber-600 focus:outline-none"
              />
            </div>

            <select
              value={businessFilter}
              onChange={(e) => setBusinessFilter(e.target.value)}
              className="border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-amber-600 focus:outline-none"
            >
              <option value="ALL">All Businesses</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-1 bg-slate-100 p-1">
              {(['ALL', 'DRAFT', 'SENT', 'APPROVED', 'CONVERTED', 'CANCELLED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onGoToPOS}
            className="bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            New Quote in POS
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Quote No.</th>
                <th className="px-4 py-2.5">Client / Organization</th>
                <th className="px-4 py-2.5">Event & Venue</th>
                <th className="px-4 py-2.5">Event Date</th>
                <th className="px-4 py-2.5 text-right">Items</th>
                <th className="px-4 py-2.5 text-right">Total (₱)</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((qt) => {
                const activeEditors = onlineMembers.filter(
                  (m) => m.clientId !== currentClientId && m.editingKey === `quote:${qt.quoteNo}`
                );
                const biz = businessMap.get(qt.businessId);
                return (
                  <tr key={qt.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      <div>{qt.quoteNo}</div>
                      {biz && (
                        <div className="font-sans text-[11px] font-medium text-slate-500">
                          {biz.name}
                        </div>
                      )}
                      {activeEditors.length > 0 && (
                        <div className="mt-0.5 inline-block bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-sans font-semibold">
                          Editing: {activeEditors.map((e) => e.name).join(', ')}
                        </div>
                      )}
                      {qt.convertedSlipNo && (
                        <div className="text-[11px] font-normal text-sky-700">→ {qt.convertedSlipNo}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{qt.clientName}</div>
                      <div className="text-slate-500">{qt.organization || qt.contactNo || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{qt.eventName || 'Untitled Event'}</div>
                      <div className="text-slate-500">{qt.venue || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                      {formatDate(qt.eventDate)} · {qt.days}d
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {qt.items.reduce((s, i) => s + i.quantity, 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatPeso(qt.totalAmount)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <select
                        value={qt.status}
                        disabled={qt.status === 'CONVERTED'}
                        onChange={(e) => handleStatusChange(qt.id, e.target.value as QuoteStatus)}
                        className={`border border-slate-200 bg-white px-2 py-1 text-xs font-semibold ${statusColorClass(qt.status)}`}
                      >
                        <option value="DRAFT">DRAFT</option>
                        <option value="SENT">SENT</option>
                        <option value="APPROVED">APPROVED</option>
                        {qt.status === 'CONVERTED' && <option value="CONVERTED">CONVERTED</option>}
                        <option value="CANCELLED">CANCELLED</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenPrint({ kind: 'quote', data: qt })}
                          className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Print
                        </button>
                        {qt.status !== 'CONVERTED' && (
                          <button
                            type="button"
                            onClick={() => openEditQuote(qt)}
                            className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                            title="Edit quotation items, dates, and pricing"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        )}
                        {qt.status !== 'CONVERTED' && qt.status !== 'CANCELLED' && (
                          <button
                            type="button"
                            onClick={() => {
                              setConvertingQuote(qt);
                              setDeposit(Math.round(qt.totalAmount * 0.5));
                            }}
                            className="inline-flex items-center gap-1 bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
                          >
                            <ArrowRightCircle className="h-3.5 w-3.5" />
                            Convert
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm text-slate-600">No quotations generated yet.</p>
              <button
                type="button"
                onClick={onGoToPOS}
                className="bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Create First Quote in POS Terminal
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Full Edit Quote Modal */}
      {editingQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white border border-slate-200 shadow-xl my-6">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Edit Quotation — {editingQuote.quoteNo}
                </h3>
                <p className="text-xs text-slate-500">All updates sync immediately across the team</p>
              </div>
              <button
                type="button"
                onClick={closeEditQuote}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Client Name *</label>
                  <input
                    type="text"
                    value={editClientName}
                    onChange={(e) => setEditClientName(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Organization</label>
                  <input
                    type="text"
                    value={editOrg}
                    onChange={(e) => setEditOrg(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Contact No.</label>
                  <input
                    type="text"
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Event Name</label>
                  <input
                    type="text"
                    value={editEvent}
                    onChange={(e) => setEditEvent(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Venue</label>
                  <input
                    type="text"
                    value={editVenue}
                    onChange={(e) => setEditVenue(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Event Date</label>
                  <input
                    type="date"
                    value={editEventDate}
                    onChange={(e) => setEditEventDate(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Expected Return</label>
                  <input
                    type="date"
                    value={editReturnDate}
                    onChange={(e) => setEditReturnDate(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Days</label>
                  <input
                    type="number"
                    min={1}
                    value={editDays}
                    onChange={(e) => setEditDays(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Quote Line Items Editor */}
              <div className="border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border-b border-slate-200 px-3 py-2">
                  <span className="font-semibold text-slate-800">Quoted Equipment ({editItems.length})</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={addItemCode}
                      onChange={(e) => setAddItemCode(e.target.value)}
                      className="border border-slate-300 bg-white px-2 py-1 text-xs max-w-xs"
                    >
                      {inventory.map((it) => (
                        <option key={it.code} value={it.code}>
                          {it.code} — {it.name} ({formatPeso(it.rentalRate)})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const found = inventory.find((x) => x.code === addItemCode);
                        if (!found) return;
                        setEditItems((prev) => {
                          const idx = prev.findIndex((p) => p.inventoryCode === found.code);
                          if (idx >= 0) {
                            return prev.map((p, i) => (i === idx ? { ...p, quantity: p.quantity + 1 } : p));
                          }
                          return [
                            ...prev,
                            {
                              inventoryCode: found.code,
                              equipmentName: found.name,
                              quantity: 1,
                              rentalRate: found.rentalRate,
                              remarks: '',
                            },
                          ];
                        });
                      }}
                      className="inline-flex items-center gap-1 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      Add Gear
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {editItems.map((line, idx) => (
                    <div key={line.inventoryCode} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono font-semibold text-slate-900">{line.inventoryCode}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="text-slate-800">{line.equipmentName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center border border-slate-300">
                          <button
                            type="button"
                            onClick={() =>
                              setEditItems((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, quantity: Math.max(1, p.quantity - 1) } : p))
                              )
                            }
                            className="px-1.5 py-1 hover:bg-slate-100 cursor-pointer"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) =>
                              setEditItems((prev) =>
                                prev.map((p, i) =>
                                  i === idx ? { ...p, quantity: Math.max(1, Number(e.target.value) || 1) } : p
                                )
                              )
                            }
                            className="w-12 text-center font-mono py-0.5"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEditItems((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, quantity: p.quantity + 1 } : p))
                              )
                            }
                            className="px-1.5 py-1 hover:bg-slate-100 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={line.rentalRate}
                          onChange={(e) =>
                            setEditItems((prev) =>
                              prev.map((p, i) =>
                                i === idx ? { ...p, rentalRate: Math.max(0, Number(e.target.value) || 0) } : p
                              )
                            )
                          }
                          className="w-20 border border-slate-300 px-1.5 py-1 text-right font-mono"
                        />
                        <div className="w-24 text-right font-mono font-semibold">
                          {formatPeso(line.quantity * line.rentalRate * editDays)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Delivery Charge (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={editDelivery}
                    onChange={(e) => setEditDelivery(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Discount (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div className="bg-slate-50 border border-slate-200 px-3 py-2 flex flex-col justify-center">
                  <span className="text-[11px] text-slate-500">Updated Grand Total</span>
                  <span className="font-mono text-sm font-bold text-slate-900">{formatPeso(editTotal)}</span>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => handleDeleteQuote(editingQuote)}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Quote
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEditQuote}
                  className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSaveEditQuote}
                  className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  Save Quotation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Convert Quote to Borrowers Slip Modal */}
      {convertingQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Convert {convertingQuote.quoteNo} to Borrowers Slip
                </h3>
                <p className="text-xs text-slate-500">
                  {convertingQuote.clientName} · {formatPeso(convertingQuote.totalAmount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConvertingQuote(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Booking Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConvertMode('RESERVED')}
                    className={`border px-3 py-2 font-semibold cursor-pointer ${
                      convertMode === 'RESERVED'
                        ? 'border-amber-600 bg-amber-50 text-amber-800'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    Reserve Gear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConvertMode('DISPATCHED')}
                    className={`border px-3 py-2 font-semibold cursor-pointer ${
                      convertMode === 'DISPATCHED'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    Dispatch Now
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Downpayment / Paid (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={deposit}
                    onChange={(e) => setDeposit(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="GCash">GCash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 p-2.5">
                Server will verify real-time inventory availability across all {convertingQuote.items.length} line items before issuing FORM 0004 & FORM 0005.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setConvertingQuote(null)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConvert}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Confirm & Issue Slip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

