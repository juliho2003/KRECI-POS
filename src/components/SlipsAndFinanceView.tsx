import { useMemo, useState } from 'react';
import { CheckCircle2, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import type {
  BudgetItem,
  BudgetRequest,
  BusinessUnit,
  InventoryItem,
  MaintenanceSlip,
  Payment,
  PresenceMember,
} from '../types';
import { apiFetch } from '../utils/api';
import { formatDate, formatPeso, statusColorClass } from '../utils/format';
import type { PrintablePayload } from './PrintableFormModal';

interface SlipsAndFinanceViewProps {
  payments: Payment[];
  businesses: BusinessUnit[];
  maintenance: MaintenanceSlip[];
  budgets: BudgetRequest[];
  inventory: InventoryItem[];
  onlineMembers: PresenceMember[];
  currentClientId: string;
  onEditingChange: (key: string | null) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenPrint: (payload: PrintablePayload) => void;
  onRefresh: () => void;
}

export function SlipsAndFinanceView({
  payments,
  businesses,
  maintenance,
  budgets,
  inventory,
  onlineMembers,
  currentClientId,
  onEditingChange,
  onNotify,
  onOpenPrint,
  onRefresh,
}: SlipsAndFinanceViewProps) {
  const [tab, setTab] = useState<'payments' | 'maintenance' | 'budgets'>('payments');
  const [businessFilter, setBusinessFilter] = useState<string>('ALL');

  const businessMap = useMemo(() => {
    const map = new Map<string, BusinessUnit>();
    for (const b of businesses) map.set(b.id, b);
    return map;
  }, [businesses]);

  const filteredPayments = useMemo(
    () =>
      payments.filter((p) => (businessFilter === 'ALL' ? true : (p.businessId || 'kr-oncue') === businessFilter)),
    [payments, businessFilter]
  );

  // Edit Payment Receipt modal (FORM 0007)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [payMethodEdit, setPayMethodEdit] = useState('Cash');
  const [payRefEdit, setPayRefEdit] = useState('');
  const [payRecvByEdit, setPayRecvByEdit] = useState('');
  const [payAuthByEdit, setPayAuthByEdit] = useState('');
  const [payNotesEdit, setPayNotesEdit] = useState('');

  // Maintenance creation modal
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [maintCode, setMaintCode] = useState(inventory[0]?.code ?? '');
  const [maintReqBy, setMaintReqBy] = useState('');
  const [maintPriority, setMaintPriority] = useState<'Low' | 'Normal' | 'Urgent' | 'Critical'>('Normal');
  const [maintProblem, setMaintProblem] = useState('');
  const [maintPartsCost, setMaintPartsCost] = useState(0);

  // Edit Maintenance Slip modal
  const [editingMaint, setEditingMaint] = useState<MaintenanceSlip | null>(null);
  const [editMaintStatus, setEditMaintStatus] = useState<MaintenanceSlip['status']>('OPEN');
  const [editMaintPriority, setEditMaintPriority] = useState<MaintenanceSlip['priorityLevel']>('Normal');
  const [editMaintProblem, setEditMaintProblem] = useState('');
  const [editMaintProposed, setEditMaintProposed] = useState('');
  const [editMaintPartsCost, setEditMaintPartsCost] = useState(0);
  const [editMaintTech, setEditMaintTech] = useState('');
  const [editMaintWork, setEditMaintWork] = useState('');
  const [editMaintLabor, setEditMaintLabor] = useState(0);
  const [editMaintOther, setEditMaintOther] = useState(0);

  // Maintenance completion modal
  const [completingSlip, setCompletingSlip] = useState<MaintenanceSlip | null>(null);
  const [techName, setTechName] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [laborCost, setLaborCost] = useState(0);

  // Budget request create modal
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budReqBy, setBudReqBy] = useState('');
  const [budEvent, setBudEvent] = useState('');
  const [budVenue, setBudVenue] = useState('');
  const [budPurpose, setBudPurpose] = useState('');
  const [budDesc, setBudDesc] = useState('Crew Meal & Transport Allowance');
  const [budQty, setBudQty] = useState(1);
  const [budUnitCost, setBudUnitCost] = useState(1500);

  // Edit Budget Request modal
  const [editingBudget, setEditingBudget] = useState<BudgetRequest | null>(null);
  const [editBudReqBy, setEditBudReqBy] = useState('');
  const [editBudDept, setEditBudDept] = useState('');
  const [editBudEvent, setEditBudEvent] = useState('');
  const [editBudVenue, setEditBudVenue] = useState('');
  const [editBudPurpose, setEditBudPurpose] = useState('');
  const [editBudPayee, setEditBudPayee] = useState('');
  const [editBudStatus, setEditBudStatus] = useState<BudgetRequest['status']>('PENDING');
  const [editBudActual, setEditBudActual] = useState(0);
  const [editBudItems, setEditBudItems] = useState<BudgetItem[]>([]);

  const [submitting, setSubmitting] = useState(false);

  const openEditPayment = (p: Payment) => {
    setEditingPayment(p);
    setPayMethodEdit(p.paymentMethod);
    setPayRefEdit(p.referenceNo);
    setPayRecvByEdit(p.receivedBy);
    setPayAuthByEdit(p.authorizedBy);
    setPayNotesEdit(p.notes);
    onEditingChange(`payment:${p.receiptNo}`);
  };

  const closeEditPayment = () => {
    setEditingPayment(null);
    onEditingChange(null);
  };

  const handleSavePayment = async () => {
    if (!editingPayment) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/payments/${editingPayment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          paymentMethod: payMethodEdit,
          referenceNo: payRefEdit,
          receivedBy: payRecvByEdit,
          authorizedBy: payAuthByEdit,
          notes: payNotesEdit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update payment receipt');
      onNotify(`Updated receipt ${editingPayment.receiptNo}.`);
      closeEditPayment();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateMaint = async () => {
    if (!maintCode || !maintProblem.trim()) {
      onNotify('Select equipment and describe the repair needed.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          inventoryCode: maintCode,
          requestedBy: maintReqBy.trim() || 'Technical Crew',
          priorityLevel: maintPriority,
          reportedProblem: maintProblem.trim(),
          estimatedPartsCost: maintPartsCost,
          safetyOutOfService: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create maintenance slip');
      onNotify(`Created ${data.slipNo}. Equipment set to MAINTENANCE.`);
      setShowMaintModal(false);
      setMaintProblem('');
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditMaint = (m: MaintenanceSlip) => {
    setEditingMaint(m);
    setEditMaintStatus(m.status);
    setEditMaintPriority(m.priorityLevel);
    setEditMaintProblem(m.reportedProblem);
    setEditMaintProposed(m.proposedRepair);
    setEditMaintPartsCost(m.estimatedPartsCost);
    setEditMaintTech(m.technician);
    setEditMaintWork(m.workPerformed);
    setEditMaintLabor(m.laborCost);
    setEditMaintOther(m.otherCost);
    onEditingChange(`maint:${m.slipNo}`);
  };

  const closeEditMaint = () => {
    setEditingMaint(null);
    onEditingChange(null);
  };

  const handleSaveEditMaint = async () => {
    if (!editingMaint || !editMaintProblem.trim()) {
      onNotify('Reported problem is required.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/maintenance/${editingMaint.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: editMaintStatus,
          priorityLevel: editMaintPriority,
          reportedProblem: editMaintProblem.trim(),
          proposedRepair: editMaintProposed,
          estimatedPartsCost: editMaintPartsCost,
          technician: editMaintTech,
          workPerformed: editMaintWork,
          laborCost: editMaintLabor,
          otherCost: editMaintOther,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update maintenance slip');
      onNotify(`Saved maintenance slip ${editingMaint.slipNo}.`);
      closeEditMaint();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteMaint = async () => {
    if (!completingSlip) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/maintenance/${completingSlip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'COMPLETED',
          technician: techName.trim() || 'In-House Tech',
          workPerformed: workPerformed.trim() || 'Tested and restored to working order.',
          laborCost,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete maintenance');
      onNotify(`${completingSlip.slipNo} completed. ${completingSlip.inventoryCode} is AVAILABLE again.`);
      setCompletingSlip(null);
      onEditingChange(null);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateBudget = async () => {
    if (!budReqBy.trim() || !budPurpose.trim()) {
      onNotify('Requester name and purpose are required.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const items: BudgetItem[] = [
        {
          code: 'EXP-01',
          description: budDesc,
          qty: budQty,
          unit: 'lot',
          estUnitCost: budUnitCost,
          estAmount: budQty * budUnitCost,
          supplier: 'Operations',
        },
      ];
      const res = await apiFetch('/api/budgets', {
        method: 'POST',
        body: JSON.stringify({
          requestedBy: budReqBy.trim(),
          eventName: budEvent.trim(),
          venue: budVenue.trim(),
          purpose: budPurpose.trim(),
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create budget request');
      onNotify(`Budget Request ${data.budgetNo} created.`);
      setShowBudgetModal(false);
      setBudPurpose('');
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBudgetStatus = async (id: number, status: BudgetRequest['status']) => {
    try {
      const res = await apiFetch(`/api/budgets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update budget status');
      onNotify(`Budget request marked ${status}.`);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    }
  };

  const openEditBudget = (b: BudgetRequest) => {
    setEditingBudget(b);
    setEditBudReqBy(b.requestedBy);
    setEditBudDept(b.department);
    setEditBudEvent(b.eventName);
    setEditBudVenue(b.venue);
    setEditBudPurpose(b.purpose);
    setEditBudPayee(b.payeeSupplier);
    setEditBudStatus(b.status);
    setEditBudActual(b.actualSpent);
    setEditBudItems(b.items.map((it) => ({ ...it })));
    onEditingChange(`budget:${b.budgetNo}`);
  };

  const closeEditBudget = () => {
    setEditingBudget(null);
    onEditingChange(null);
  };

  const handleSaveEditBudget = async () => {
    if (!editingBudget || !editBudReqBy.trim() || !editBudPurpose.trim()) {
      onNotify('Requester and purpose are required.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/budgets/${editingBudget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          requestedBy: editBudReqBy.trim(),
          department: editBudDept,
          eventName: editBudEvent,
          venue: editBudVenue,
          purpose: editBudPurpose.trim(),
          payeeSupplier: editBudPayee,
          status: editBudStatus,
          actualSpent: editBudActual,
          items: editBudItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update budget request');
      onNotify(`Saved budget request ${editingBudget.budgetNo}.`);
      closeEditBudget();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBudget = async (b: BudgetRequest) => {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/budgets/${b.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete budget request');
      onNotify(`Deleted budget request ${b.budgetNo}.`);
      closeEditBudget();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-slate-200/70 p-1">
          <button
            type="button"
            onClick={() => setTab('payments')}
            className={`px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'payments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Payment Receipts (FORM 0007)
          </button>
          <button
            type="button"
            onClick={() => setTab('maintenance')}
            className={`px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'maintenance' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Maintenance Slips (FORM 0002)
          </button>
          <button
            type="button"
            onClick={() => setTab('budgets')}
            className={`px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'budgets' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Budget Requests (FORM 0003)
          </button>
        </div>

        {tab === 'payments' && (
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
        )}

        {tab === 'maintenance' && (
          <button
            type="button"
            onClick={() => {
              setMaintCode(inventory[0]?.code ?? '');
              setShowMaintModal(true);
            }}
            className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            New Maintenance Slip
          </button>
        )}

        {tab === 'budgets' && (
          <button
            type="button"
            onClick={() => setShowBudgetModal(true)}
            className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            New Budget Request
          </button>
        )}
      </div>

      {/* FORM 0007 Payments Ledger */}
      {tab === 'payments' && (
        <div className="bg-white border border-slate-200 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Receipt No.</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Received From</th>
                <th className="px-4 py-2.5">Slip No.</th>
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5 text-right">Amount Paid (₱)</th>
                <th className="px-4 py-2.5 text-right">Balance (₱)</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.map((p) => {
                const editor = onlineMembers.find(
                  (m) => m.clientId !== currentClientId && m.editingKey === `payment:${p.receiptNo}`
                );
                const biz = businessMap.get(p.businessId || 'kr-oncue');
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="font-mono font-semibold text-slate-900">{p.receiptNo}</div>
                      {biz && <div className="text-[11px] text-slate-500">{biz.name}</div>}
                      {editor && (
                        <div className="mt-0.5 inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                          Editing: {editor.name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono">{formatDate(p.paymentDate)}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{p.receivedFrom}</div>
                      <div className="text-slate-500">{p.organization || p.eventPurpose || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{p.slipNo || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {p.paymentMethod}
                      {p.referenceNo ? ` (${p.referenceNo})` : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {formatPeso(p.amountPaid)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                      {formatPeso(p.outstandingBalance)}
                    </td>
                    <td className={`px-4 py-2.5 font-semibold ${statusColorClass(p.paymentStatus)}`}>
                      {p.paymentStatus}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditPayment(p)}
                          className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenPrint({ kind: 'payment', data: p })}
                          className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          <Printer className="h-3 w-3" />
                          Print 0007
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredPayments.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No payment acknowledgments recorded yet. Deposits and balance collections appear here automatically.
            </div>
          )}
        </div>
      )}

      {/* FORM 0002 Maintenance Slips */}
      {tab === 'maintenance' && (
        <div className="bg-white border border-slate-200 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Slip No.</th>
                <th className="px-4 py-2.5">Equipment</th>
                <th className="px-4 py-2.5">Reported Problem</th>
                <th className="px-4 py-2.5">Priority</th>
                <th className="px-4 py-2.5 text-right">Total Cost (₱)</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {maintenance.map((m) => {
                const editor = onlineMembers.find(
                  (mem) => mem.clientId !== currentClientId && mem.editingKey === `maint:${m.slipNo}`
                );
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="font-mono font-semibold text-slate-900">{m.slipNo}</div>
                      {editor && (
                        <div className="mt-0.5 inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                          Editing: {editor.name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-mono font-semibold text-slate-900">{m.inventoryCode}</div>
                      <div className="text-slate-500">{m.equipmentName}</div>
                    </td>
                    <td className="px-4 py-2.5 max-w-xs">{m.reportedProblem}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{m.priorityLevel}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatPeso(m.actualTotalCost || m.estimatedPartsCost)}
                    </td>
                    <td className={`px-4 py-2.5 font-semibold ${statusColorClass(m.status)}`}>{m.status}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditMaint(m)}
                          className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenPrint({ kind: 'maintenance', data: m })}
                          className="border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          Print 0002
                        </button>
                        {m.status !== 'COMPLETED' && (
                          <button
                            type="button"
                            onClick={() => {
                              setCompletingSlip(m);
                              setTechName('');
                              setWorkPerformed('');
                              setLaborCost(0);
                              onEditingChange(`maint:${m.slipNo}`);
                            }}
                            className="inline-flex items-center gap-1 bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 cursor-pointer"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Complete Repair
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {maintenance.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No repair or maintenance slips logged. All equipment units are operational.
            </div>
          )}
        </div>
      )}

      {/* FORM 0003 Budget Requests */}
      {tab === 'budgets' && (
        <div className="bg-white border border-slate-200 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Budget No.</th>
                <th className="px-4 py-2.5">Requested By</th>
                <th className="px-4 py-2.5">Event / Purpose</th>
                <th className="px-4 py-2.5 text-right">Requested (₱)</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {budgets.map((b) => {
                const editor = onlineMembers.find(
                  (mem) => mem.clientId !== currentClientId && mem.editingKey === `budget:${b.budgetNo}`
                );
                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="font-mono font-semibold text-slate-900">{b.budgetNo}</div>
                      {editor && (
                        <div className="mt-0.5 inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                          Editing: {editor.name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{b.requestedBy}</div>
                      <div className="text-slate-500">{formatDate(b.dateRequested)}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{b.eventName || 'Operations'}</div>
                      <div className="text-slate-500">{b.purpose}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                      {formatPeso(b.requestedBudget)}
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={b.status}
                        onChange={(e) => handleBudgetStatus(b.id, e.target.value as BudgetRequest['status'])}
                        className={`border border-slate-200 bg-white px-2 py-1 text-xs font-semibold ${statusColorClass(b.status)}`}
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="APPROVED">APPROVED</option>
                        <option value="RELEASED">RELEASED</option>
                        <option value="LIQUIDATED">LIQUIDATED</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditBudget(b)}
                          className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenPrint({ kind: 'budget', data: b })}
                          className="border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          Print 0003
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {budgets.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No event or operational budget requests filed yet.
            </div>
          )}
        </div>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Edit Receipt {editingPayment.receiptNo} (FORM 0007)
              </h3>
              <button
                type="button"
                onClick={closeEditPayment}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={payMethodEdit}
                    onChange={(e) => setPayMethodEdit(e.target.value)}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="GCash">GCash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Reference No.</label>
                  <input
                    type="text"
                    value={payRefEdit}
                    onChange={(e) => setPayRefEdit(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Received By</label>
                  <input
                    type="text"
                    value={payRecvByEdit}
                    onChange={(e) => setPayRecvByEdit(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Authorized By</label>
                  <input
                    type="text"
                    value={payAuthByEdit}
                    onChange={(e) => setPayAuthByEdit(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={payNotesEdit}
                  onChange={(e) => setPayNotesEdit(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={closeEditPayment}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSavePayment}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Save Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Maintenance Slip Modal */}
      {showMaintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">New Maintenance Slip (FORM 0002)</h3>
              <button
                type="button"
                onClick={() => setShowMaintModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Equipment Item</label>
                <select
                  value={maintCode}
                  onChange={(e) => setMaintCode(e.target.value)}
                  className="w-full border border-slate-300 bg-white px-2.5 py-2 font-mono focus:border-amber-600 focus:outline-none"
                >
                  {inventory.map((i) => (
                    <option key={i.code} value={i.code}>
                      {i.code} — {i.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Requested By</label>
                  <input
                    type="text"
                    value={maintReqBy}
                    onChange={(e) => setMaintReqBy(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={maintPriority}
                    onChange={(e) => setMaintPriority(e.target.value as 'Low' | 'Normal' | 'Urgent' | 'Critical')}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Est. Parts (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={maintPartsCost}
                    onChange={(e) => setMaintPartsCost(Number(e.target.value) || 0)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Reported Problem *</label>
                <textarea
                  rows={3}
                  value={maintProblem}
                  onChange={(e) => setMaintProblem(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowMaintModal(false)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleCreateMaint}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Submit Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Maintenance Slip Modal */}
      {editingMaint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 shadow-lg my-6">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Edit Maintenance Slip {editingMaint.slipNo} ({editingMaint.inventoryCode})
              </h3>
              <button
                type="button"
                onClick={closeEditMaint}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={editMaintStatus}
                    onChange={(e) => setEditMaintStatus(e.target.value as MaintenanceSlip['status'])}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={editMaintPriority}
                    onChange={(e) => setEditMaintPriority(e.target.value as MaintenanceSlip['priorityLevel'])}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Reported Problem *</label>
                <textarea
                  rows={2}
                  value={editMaintProblem}
                  onChange={(e) => setEditMaintProblem(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Proposed Repair</label>
                <input
                  type="text"
                  value={editMaintProposed}
                  onChange={(e) => setEditMaintProposed(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Parts Cost (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={editMaintPartsCost}
                    onChange={(e) => setEditMaintPartsCost(Number(e.target.value) || 0)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Labor Cost (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={editMaintLabor}
                    onChange={(e) => setEditMaintLabor(Number(e.target.value) || 0)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Other Cost (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={editMaintOther}
                    onChange={(e) => setEditMaintOther(Number(e.target.value) || 0)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Assigned Technician</label>
                  <input
                    type="text"
                    value={editMaintTech}
                    onChange={(e) => setEditMaintTech(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Work Performed</label>
                  <input
                    type="text"
                    value={editMaintWork}
                    onChange={(e) => setEditMaintWork(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={closeEditMaint}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveEditMaint}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Save Maintenance Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Repair Modal */}
      {completingSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Complete Repair — {completingSlip.slipNo} ({completingSlip.inventoryCode})
              </h3>
              <button
                type="button"
                onClick={() => {
                  setCompletingSlip(null);
                  onEditingChange(null);
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Technician</label>
                  <input
                    type="text"
                    value={techName}
                    onChange={(e) => setTechName(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Labor / Service Cost (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={laborCost}
                    onChange={(e) => setLaborCost(Number(e.target.value) || 0)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Work Performed & Testing Result</label>
                <textarea
                  rows={3}
                  value={workPerformed}
                  onChange={(e) => setWorkPerformed(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  setCompletingSlip(null);
                  onEditingChange(null);
                }}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleCompleteMaint}
                className="bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer"
              >
                Mark Repaired & Return to Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Budget Request Modal */}
      {showBudgetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">New Budget Request (FORM 0003)</h3>
              <button
                type="button"
                onClick={() => setShowBudgetModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Requested By *</label>
                  <input
                    type="text"
                    value={budReqBy}
                    onChange={(e) => setBudReqBy(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Event / Project Name</label>
                  <input
                    type="text"
                    value={budEvent}
                    onChange={(e) => setBudEvent(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Venue / Location</label>
                <input
                  type="text"
                  value={budVenue}
                  onChange={(e) => setBudVenue(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Purpose / Justification *</label>
                <input
                  type="text"
                  value={budPurpose}
                  onChange={(e) => setBudPurpose(e.target.value)}
                  placeholder="Ingress logistics, crew allowance, fuel, cables..."
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-1">
                  <label className="block font-medium text-slate-700 mb-1">Qty</label>
                  <input
                    type="number"
                    min={1}
                    value={budQty}
                    onChange={(e) => setBudQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Unit Cost (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={budUnitCost}
                    onChange={(e) => setBudUnitCost(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Line Item Description</label>
                <input
                  type="text"
                  value={budDesc}
                  onChange={(e) => setBudDesc(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowBudgetModal(false)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleCreateBudget}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Submit Budget Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Budget Request Modal */}
      {editingBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white border border-slate-200 shadow-xl my-6">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Edit Budget Request {editingBudget.budgetNo} (FORM 0003)
              </h3>
              <button
                type="button"
                onClick={closeEditBudget}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Requested By *</label>
                  <input
                    type="text"
                    value={editBudReqBy}
                    onChange={(e) => setEditBudReqBy(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={editBudDept}
                    onChange={(e) => setEditBudDept(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={editBudStatus}
                    onChange={(e) => setEditBudStatus(e.target.value as BudgetRequest['status'])}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="RELEASED">RELEASED</option>
                    <option value="LIQUIDATED">LIQUIDATED</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Event / Project</label>
                  <input
                    type="text"
                    value={editBudEvent}
                    onChange={(e) => setEditBudEvent(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Venue</label>
                  <input
                    type="text"
                    value={editBudVenue}
                    onChange={(e) => setEditBudVenue(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Actual Spent (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={editBudActual}
                    onChange={(e) => setEditBudActual(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Purpose / Justification *</label>
                  <input
                    type="text"
                    value={editBudPurpose}
                    onChange={(e) => setEditBudPurpose(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Payee / Supplier</label>
                  <input
                    type="text"
                    value={editBudPayee}
                    onChange={(e) => setEditBudPayee(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-slate-800">Line Items</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditBudItems((prev) => [
                        ...prev,
                        {
                          code: `EXP-0${prev.length + 1}`,
                          description: '',
                          qty: 1,
                          unit: 'lot',
                          estUnitCost: 0,
                          estAmount: 0,
                          supplier: 'Operations',
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    Add Line
                  </button>
                </div>
                <div className="border border-slate-200 divide-y divide-slate-100">
                  {editBudItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 p-2 items-center">
                      <input
                        type="text"
                        value={it.description}
                        placeholder="Item description"
                        onChange={(e) =>
                          setEditBudItems((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row))
                          )
                        }
                        className="col-span-6 border border-slate-300 px-2 py-1"
                      />
                      <input
                        type="number"
                        min={1}
                        value={it.qty}
                        onChange={(e) =>
                          setEditBudItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, qty: Math.max(1, Number(e.target.value) || 1) } : row
                            )
                          )
                        }
                        className="col-span-2 border border-slate-300 px-2 py-1 text-right font-mono tabular-nums"
                      />
                      <input
                        type="number"
                        min={0}
                        value={it.estUnitCost}
                        onChange={(e) =>
                          setEditBudItems((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, estUnitCost: Math.max(0, Number(e.target.value) || 0) } : row
                            )
                          )
                        }
                        className="col-span-3 border border-slate-300 px-2 py-1 text-right font-mono tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => setEditBudItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="col-span-1 text-slate-400 hover:text-red-600 flex justify-center cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDeleteBudget(editingBudget)}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Request
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEditBudget}
                  className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSaveEditBudget}
                  className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  Save Budget Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
