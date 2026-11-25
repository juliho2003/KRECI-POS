import { useMemo, useState } from 'react';
import { Ban, CheckCircle2, ClipboardCheck, CreditCard, FileText, Pencil, Search, Truck, X } from 'lucide-react';
import type { BusinessUnit, PresenceMember, Rental, RentalStatus } from '../types';
import { apiFetch } from '../utils/api';
import { formatDate, formatPeso, numberToWordsPeso, statusColorClass } from '../utils/format';
import type { PrintablePayload } from './PrintableFormModal';

interface RentalsViewProps {
  rentals: Rental[];
  businesses: BusinessUnit[];
  onlineMembers: PresenceMember[];
  currentClientId: string;
  onEditingChange: (key: string | null) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenPrint: (payload: PrintablePayload) => void;
  onGoToPOS: () => void;
  onRefresh: () => void;
}

interface ReturnLineState {
  itemId: number;
  inventoryCode: string;
  equipmentName: string;
  qtyReleased: number;
  qtyReturned: number;
  missingQty: number;
  damages: string;
  addCharges: number;
  needsMaintenance: boolean;
}

export function RentalsView({
  rentals,
  businesses,
  onlineMembers,
  currentClientId,
  onEditingChange,
  onNotify,
  onOpenPrint,
  onGoToPOS,
  onRefresh,
}: RentalsViewProps) {
  const [search, setSearch] = useState('');
  const [businessFilter, setBusinessFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RentalStatus>('ALL');

  // Edit Rental modal
  const [editingRental, setEditingRental] = useState<Rental | null>(null);
  const [editBorrower, setEditBorrower] = useState('');
  const [editOrg, setEditOrg] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editEvent, setEditEvent] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editDateOut, setEditDateOut] = useState('');
  const [editExpectedReturn, setEditExpectedReturn] = useState('');
  const [editCrew, setEditCrew] = useState('');
  const [editDriver, setEditDriver] = useState('');
  const [editConditionOut, setEditConditionOut] = useState('');

  // Dispatch modal
  const [dispatching, setDispatching] = useState<Rental | null>(null);
  const [deliveryPersonnel, setDeliveryPersonnel] = useState('');
  const [vehicleDriver, setVehicleDriver] = useState('');

  // Return inspection modal (FORM 0006)
  const [returningRental, setReturningRental] = useState<Rental | null>(null);
  const [inspectedBy, setInspectedBy] = useState('');
  const [inspectionResult, setInspectionResult] = useState<
    'Complete' | 'Incomplete' | 'Damaged' | 'Needs testing / repair'
  >('Complete');
  const [conditionUponReturn, setConditionUponReturn] = useState('Good');
  const [returnLines, setReturnLines] = useState<ReturnLineState[]>([]);

  // Collect Payment modal (FORM 0007)
  const [payingRental, setPayingRental] = useState<Rental | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('Cash');
  const [payRef, setPayRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const businessMap = useMemo(() => {
    const map = new Map<string, BusinessUnit>();
    for (const b of businesses) map.set(b.id, b);
    return map;
  }, [businesses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rentals.filter((r) => {
      if (businessFilter !== 'ALL' && r.businessId !== businessFilter) return false;
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.slipNo.toLowerCase().includes(q) ||
        r.drNo.toLowerCase().includes(q) ||
        r.borrowerName.toLowerCase().includes(q) ||
        r.organization.toLowerCase().includes(q) ||
        r.eventPurpose.toLowerCase().includes(q) ||
        r.venue.toLowerCase().includes(q)
      );
    });
  }, [rentals, search, businessFilter, statusFilter]);

  const openEditRental = (r: Rental) => {
    setEditingRental(r);
    setEditBorrower(r.borrowerName);
    setEditOrg(r.organization);
    setEditContact(r.contactNo);
    setEditEvent(r.eventPurpose);
    setEditVenue(r.venue);
    setEditDateOut(r.dateOut);
    setEditExpectedReturn(r.expectedReturn);
    setEditCrew(r.deliveryPersonnel);
    setEditDriver(r.vehicleDriver);
    setEditConditionOut(r.conditionUponRelease);
    onEditingChange(`rental:${r.slipNo}`);
  };

  const closeEditRental = () => {
    setEditingRental(null);
    onEditingChange(null);
  };

  const handleSaveEditRental = async () => {
    if (!editingRental || !editBorrower.trim()) {
      onNotify('Borrower name is required.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/rentals/${editingRental.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          borrowerName: editBorrower.trim(),
          organization: editOrg,
          contactNo: editContact,
          eventPurpose: editEvent,
          venue: editVenue,
          dateOut: editDateOut,
          expectedReturn: editExpectedReturn,
          deliveryPersonnel: editCrew,
          vehicleDriver: editDriver,
          conditionUponRelease: editConditionOut,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update rental');
      onNotify(`Saved updates for ${editingRental.slipNo}.`);
      closeEditRental();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelReservation = async (r: Rental) => {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/rentals/${r.id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel reservation');
      onNotify(`Cancelled reservation ${r.slipNo}. Reserved stock returned to available.`);
      closeEditRental();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openReturnModal = (r: Rental) => {
    setReturningRental(r);
    setInspectedBy('KR-ONCUE Warehouse Inspector');
    setInspectionResult('Complete');
    setConditionUponReturn('Good — all equipment accounted for');
    setReturnLines(
      r.items.map((it) => ({
        itemId: it.id!,
        inventoryCode: it.inventoryCode,
        equipmentName: it.equipmentName,
        qtyReleased: it.quantity,
        qtyReturned: it.quantity,
        missingQty: 0,
        damages: '',
        addCharges: 0,
        needsMaintenance: false,
      }))
    );
    onEditingChange(`return:${r.slipNo}`);
  };

  const handleDispatch = async () => {
    if (!dispatching) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/rentals/${dispatching.id}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({ deliveryPersonnel, vehicleDriver }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Dispatch failed');
      onNotify(`Dispatched ${dispatching.slipNo} (${dispatching.drNo}).`);
      setDispatching(null);
      onOpenPrint({ kind: dispatching.isInternal ? 'adminRelease' : 'delivery', data });
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (!returningRental) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/rentals/${returningRental.id}/return`, {
        method: 'POST',
        body: JSON.stringify({
          inspectedBy,
          inspectionResult,
          conditionUponReturn,
          items: returnLines.map((l) => ({
            itemId: l.itemId,
            qtyReturned: l.qtyReturned,
            missingQty: l.missingQty,
            damages: l.damages,
            addCharges: l.addCharges,
            needsMaintenance: l.needsMaintenance,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Return processing failed');
      onNotify(`Return Inspection ${data.returnNo} recorded. Inventory restocked.`);
      setReturningRental(null);
      onEditingChange(null);
      onOpenPrint({ kind: 'return', data });
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCollectPayment = async () => {
    if (!payingRental || payAmount <= 0) {
      onNotify('Enter a valid payment amount.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          businessId: payingRental.businessId,
          rentalId: payingRental.id,
          slipNo: payingRental.slipNo,
          clientId: payingRental.clientId,
          receivedFrom: payingRental.borrowerName,
          organization: payingRental.organization,
          contactNo: payingRental.contactNo,
          eventPurpose: payingRental.eventPurpose,
          paymentMethod: payMethod,
          rentalCharges: payingRental.subtotal,
          deliveryCharges: payingRental.deliveryCharge,
          additionalCharges: payingRental.additionalCharges,
          discountPercent: payingRental.discountPercent,
          totalAmountDue: payingRental.balanceDue,
          amountPaid: payAmount,
          amountInWords: numberToWordsPeso(payAmount),
          referenceNo: payRef,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');
      onNotify(`Payment Receipt ${data.receiptNo} issued.`);
      setPayingRental(null);
      onOpenPrint({ kind: 'payment', data });
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
                placeholder="Search Borrowers Slip, DR No., client, event, or venue..."
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
              {(['ALL', 'RESERVED', 'DISPATCHED', 'PARTIAL_RETURN', 'RETURNED'] as const).map((st) => (
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
            New Rental in POS
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Slip / DR No.</th>
                <th className="px-4 py-2.5">Borrower / Event</th>
                <th className="px-4 py-2.5">Schedule</th>
                <th className="px-4 py-2.5 text-right">Units</th>
                <th className="px-4 py-2.5 text-right">Total (₱)</th>
                <th className="px-4 py-2.5 text-right">Balance (₱)</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Forms & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const activeEditors = onlineMembers.filter(
                  (m) =>
                    m.clientId !== currentClientId &&
                    (m.editingKey === `rental:${r.slipNo}` || m.editingKey === `return:${r.slipNo}`)
                );
                const biz = businessMap.get(r.businessId);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                        <span>{r.slipNo}</span>
                        {r.isInternal && (
                          <span className="bg-slate-900 text-amber-300 px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide">
                            ADMIN · OWN GEAR
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">{r.drNo}</div>
                      {biz && (
                        <div className="font-sans text-[11px] font-medium text-slate-600">{biz.name}</div>
                      )}
                      {r.returnNo && <div className="text-[11px] text-emerald-700">{r.returnNo}</div>}
                      {activeEditors.length > 0 && (
                        <div className="mt-0.5 inline-block bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-sans font-semibold">
                          Editing: {activeEditors.map((e) => e.name).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">
                        {r.borrowerName} {r.organization ? `· ${r.organization}` : ''}
                      </div>
                      <div className="text-slate-500">
                        {r.eventPurpose || 'Event'} {r.venue ? `— ${r.venue}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono whitespace-nowrap text-slate-700">
                      <div>Out: {formatDate(r.dateOut)}</div>
                      <div className="text-[11px] text-slate-500">Ret: {formatDate(r.expectedReturn)}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {r.items.reduce((s, i) => s + i.quantity, 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium text-slate-900">
                      {r.isInternal ? '₱0.00' : formatPeso(r.totalRentalAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {r.isInternal ? (
                        <span className="text-slate-500 font-sans text-[11px] font-semibold">Own Gear (₱0)</span>
                      ) : (
                        <span className={r.balanceDue > 0 ? 'font-bold text-amber-700' : 'text-emerald-700 font-semibold'}>
                          {formatPeso(r.balanceDue)}
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 font-semibold whitespace-nowrap ${statusColorClass(r.status)}`}>
                      {r.status}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditRental(r)}
                          className="border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="Edit borrower, venue, schedule, or delivery crew"
                        >
                          <Pencil className="inline h-3 w-3 mr-1" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenPrint({ kind: r.isInternal ? 'adminRelease' : 'borrowers', data: r })}
                          className="border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title={r.isInternal ? 'Print Admin Own-Gear Release Slip' : 'Print FORM 0004 Borrowers Slip'}
                        >
                          <FileText className="inline h-3 w-3 mr-1" />
                          {r.isInternal ? 'Release' : '0004'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenPrint({ kind: 'delivery', data: r })}
                          className="border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="Print FORM 0005 Delivery Receipt"
                        >
                          <Truck className="inline h-3 w-3 mr-1" />
                          0005
                        </button>
                        {r.returnNo && (
                          <button
                            type="button"
                            onClick={() => onOpenPrint({ kind: 'return', data: r })}
                            className="border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                            title="Print FORM 0006 Return Inspection"
                          >
                            0006
                          </button>
                        )}
                        {r.status === 'RESERVED' && (
                          <button
                            type="button"
                            onClick={() => {
                              setDispatching(r);
                              setDeliveryPersonnel(r.deliveryPersonnel);
                              setVehicleDriver(r.vehicleDriver);
                            }}
                            className="bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
                          >
                            Dispatch
                          </button>
                        )}
                        {(r.status === 'DISPATCHED' || r.status === 'PARTIAL_RETURN') && (
                          <button
                            type="button"
                            onClick={() => openReturnModal(r)}
                            className="bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 cursor-pointer"
                          >
                            <ClipboardCheck className="inline h-3 w-3 mr-1" />
                            Inspect Return
                          </button>
                        )}
                        {!r.isInternal && r.balanceDue > 0 && r.status !== 'CANCELLED' && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayingRental(r);
                              setPayAmount(r.balanceDue);
                              setPayRef('');
                            }}
                            className="bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 cursor-pointer"
                          >
                            <CreditCard className="inline h-3 w-3 mr-1" />
                            Pay
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
              <p className="text-sm text-slate-600">No Borrowers Slips or active dispatches yet.</p>
              <button
                type="button"
                onClick={onGoToPOS}
                className="bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Dispatch Equipment in POS Terminal
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Rental Modal */}
      {editingRental && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 shadow-lg my-6">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Edit Rental Details — {editingRental.slipNo}
                </h3>
                <p className="text-xs text-slate-500">{editingRental.drNo} · Status: {editingRental.status}</p>
              </div>
              <button
                type="button"
                onClick={closeEditRental}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Borrower Name *</label>
                  <input
                    type="text"
                    value={editBorrower}
                    onChange={(e) => setEditBorrower(e.target.value)}
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
                  <label className="block font-medium text-slate-700 mb-1">Event / Purpose</label>
                  <input
                    type="text"
                    value={editEvent}
                    onChange={(e) => setEditEvent(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Venue / Delivery Location</label>
                <input
                  type="text"
                  value={editVenue}
                  onChange={(e) => setEditVenue(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Date Out</label>
                  <input
                    type="date"
                    value={editDateOut}
                    onChange={(e) => setEditDateOut(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Expected Return</label>
                  <input
                    type="date"
                    value={editExpectedReturn}
                    onChange={(e) => setEditExpectedReturn(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Delivery Personnel / Crew</label>
                  <input
                    type="text"
                    value={editCrew}
                    onChange={(e) => setEditCrew(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Vehicle / Driver</label>
                  <input
                    type="text"
                    value={editDriver}
                    onChange={(e) => setEditDriver(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Condition Upon Release</label>
                <input
                  type="text"
                  value={editConditionOut}
                  onChange={(e) => setEditConditionOut(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <div>
                {editingRental.status === 'RESERVED' && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleCancelReservation(editingRental)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Cancel Reservation
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEditRental}
                  className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSaveEditRental}
                  className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  Save Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Reserved Slip Modal */}
      {dispatching && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Dispatch Gear — {dispatching.slipNo} ({dispatching.drNo})
              </h3>
              <button
                type="button"
                onClick={() => setDispatching(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Delivery Personnel / Crew</label>
                <input
                  type="text"
                  value={deliveryPersonnel}
                  onChange={(e) => setDeliveryPersonnel(e.target.value)}
                  placeholder="Lead tech & crew names"
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Vehicle / Driver</label>
                <input
                  type="text"
                  value={vehicleDriver}
                  onChange={(e) => setVehicleDriver(e.target.value)}
                  placeholder="Truck plate / Driver name"
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setDispatching(null)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDispatch}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Confirm Dispatch & Print DR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Inspection Modal (FORM 0006) */}
      {returningRental && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white border border-slate-200 shadow-xl my-6">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Equipment Return & Inspection (FORM 0006) — {returningRental.slipNo}
                </h3>
                <p className="text-xs text-slate-500">
                  {returningRental.borrowerName} · {returningRental.eventPurpose}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReturningRental(null);
                  onEditingChange(null);
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Inspected By</label>
                  <input
                    type="text"
                    value={inspectedBy}
                    onChange={(e) => setInspectedBy(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Inspection Result</label>
                  <select
                    value={inspectionResult}
                    onChange={(e) =>
                      setInspectionResult(
                        e.target.value as 'Complete' | 'Incomplete' | 'Damaged' | 'Needs testing / repair'
                      )
                    }
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="Complete">Complete</option>
                    <option value="Incomplete">Incomplete</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Needs testing / repair">Needs testing / repair</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Condition Notes</label>
                  <input
                    type="text"
                    value={conditionUponReturn}
                    onChange={(e) => setConditionUponReturn(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                      <th className="px-2.5 py-2">Code</th>
                      <th className="px-2.5 py-2">Equipment</th>
                      <th className="px-2.5 py-2 text-right">Out</th>
                      <th className="px-2.5 py-2 text-right">Returned</th>
                      <th className="px-2.5 py-2 text-right">Missing</th>
                      <th className="px-2.5 py-2">Damages / Notes</th>
                      <th className="px-2.5 py-2 text-right">Add. Fee (₱)</th>
                      <th className="px-2.5 py-2 text-center">Maint?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {returnLines.map((line, idx) => (
                      <tr key={line.itemId}>
                        <td className="px-2.5 py-2 font-mono font-semibold">{line.inventoryCode}</td>
                        <td className="px-2.5 py-2 max-w-[180px] truncate">{line.equipmentName}</td>
                        <td className="px-2.5 py-2 text-right font-mono tabular-nums">{line.qtyReleased}</td>
                        <td className="px-2.5 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={line.qtyReleased}
                            value={line.qtyReturned}
                            onChange={(e) => {
                              const val = Math.min(line.qtyReleased, Math.max(0, Number(e.target.value) || 0));
                              setReturnLines((prev) =>
                                prev.map((p, i) =>
                                  i === idx
                                    ? { ...p, qtyReturned: val, missingQty: Math.max(0, line.qtyReleased - val) }
                                    : p
                                )
                              );
                            }}
                            className="w-16 border border-slate-300 px-1.5 py-1 text-right font-mono tabular-nums"
                          />
                        </td>
                        <td className="px-2.5 py-2 text-right font-mono tabular-nums text-red-700 font-semibold">
                          {line.missingQty}
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            type="text"
                            value={line.damages}
                            onChange={(e) =>
                              setReturnLines((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, damages: e.target.value } : p))
                              )
                            }
                            placeholder="None"
                            className="w-full border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-2.5 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            value={line.addCharges}
                            onChange={(e) =>
                              setReturnLines((prev) =>
                                prev.map((p, i) =>
                                  i === idx ? { ...p, addCharges: Math.max(0, Number(e.target.value) || 0) } : p
                                )
                              )
                            }
                            className="w-20 border border-slate-300 px-1.5 py-1 text-right font-mono tabular-nums"
                          />
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={line.needsMaintenance}
                            onChange={(e) =>
                              setReturnLines((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, needsMaintenance: e.target.checked } : p))
                              )
                            }
                            className="h-4 w-4 accent-amber-600"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  setReturningRental(null);
                  onEditingChange(null);
                }}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmReturn}
                className="inline-flex items-center gap-1.5 bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Complete Return & Restock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Payment Modal (FORM 0007) */}
      {payingRental && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Official Payment (FORM 0007) — {payingRental.slipNo}
                </h3>
                <p className="text-xs text-slate-500">
                  Balance Due: <span className="font-mono font-semibold">{formatPeso(payingRental.balanceDue)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayingRental(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Amount Paid (₱)</label>
                  <input
                    type="number"
                    min={1}
                    value={payAmount}
                    onChange={(e) => setPayAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="GCash">GCash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Reference No. (Optional)</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="GCash / Bank transfer reference"
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setPayingRental(null)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleCollectPayment}
                className="bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
              >
                Record & Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
