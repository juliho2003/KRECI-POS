import { useMemo, useState } from 'react';
import { Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import type { Client, PresenceMember, Quote, Rental } from '../types';
import { apiFetch } from '../utils/api';
import { formatDate, formatPeso } from '../utils/format';
import type { PrintablePayload } from './PrintableFormModal';

interface ClientsViewProps {
  clients: Client[];
  quotes: Quote[];
  rentals: Rental[];
  onlineMembers: PresenceMember[];
  currentClientId: string;
  onEditingChange: (key: string | null) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenPrint: (payload: PrintablePayload) => void;
  onRefresh: () => void;
}

export function ClientsView({
  clients,
  quotes,
  rentals,
  onlineMembers,
  currentClientId,
  onEditingChange,
  onNotify,
  onOpenPrint,
  onRefresh,
}: ClientsViewProps) {
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.organization.toLowerCase().includes(q) ||
        c.contactNo.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    });
  }, [clients, search]);

  const closeModal = () => {
    setShowModal(false);
    onEditingChange(null);
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setOrganization('');
    setContactNo('');
    setEmail('');
    setAddress('');
    setNotes('');
    setShowModal(true);
    onEditingChange('client:new');
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setName(c.name);
    setOrganization(c.organization);
    setContactNo(c.contactNo);
    setEmail(c.email);
    setAddress(c.address);
    setNotes(c.notes);
    setShowModal(true);
    onEditingChange(`client:${c.id}`);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      onNotify('Client name is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/clients/${editing.id}` : '/api/clients';
      const method = editing ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({ name, organization, contactNo, email, address, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save client');
      onNotify(editing ? `Updated client ${data.name}.` : `Added client ${data.name}.`);
      closeModal();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Client) => {
    try {
      const res = await apiFetch(`/api/clients/${c.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete client');
      if (selectedClientId === c.id) setSelectedClientId(null);
      onNotify(`Removed client ${c.name}.`);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    }
  };

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  const clientQuotes = useMemo(() => {
    if (!selectedClient) return [];
    return quotes.filter(
      (q) =>
        q.clientId === selectedClient.id ||
        q.clientName.toLowerCase() === selectedClient.name.toLowerCase()
    );
  }, [selectedClient, quotes]);

  const clientRentals = useMemo(() => {
    if (!selectedClient) return [];
    return rentals.filter(
      (r) =>
        r.clientId === selectedClient.id ||
        r.borrowerName.toLowerCase() === selectedClient.name.toLowerCase()
    );
  }, [selectedClient, rentals]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <div className="lg:col-span-8 bg-white border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients by name, organization, phone, or email..."
              className="w-full border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs focus:border-amber-600 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Client
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">Client / Organization</th>
                <th className="px-4 py-2.5">Contact</th>
                <th className="px-4 py-2.5 text-right">Quotes</th>
                <th className="px-4 py-2.5 text-right">Active Slips</th>
                <th className="px-4 py-2.5 text-right">Total Paid (₱)</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => {
                const editor = onlineMembers.find(
                  (m) => m.clientId !== currentClientId && m.editingKey === `client:${c.id}`
                );
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedClientId(c.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedClient?.id === c.id ? 'bg-amber-50/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">{c.name}</span>
                        {editor && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                            Editing: {editor.name}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500">{c.organization || 'Individual / Direct'}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-slate-800">{c.contactNo || '—'}</div>
                      <div className="text-slate-500">{c.email || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.quoteCount ?? 0}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.activeRentals ?? 0}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatPeso(c.totalSpent ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                          title="Edit client"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          title="Delete client"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              No clients recorded yet. Walk-in clients entered in the POS Terminal will appear here automatically with their logged quotes, rentals, and payments.
            </div>
          )}
        </div>
      </div>

      {/* Right 4 Cols: Selected Client Profile & Activity */}
      <div className="lg:col-span-4 bg-white border border-slate-200 p-4">
        {selectedClient ? (
          <div className="space-y-4 text-xs">
            <div className="border-b border-slate-200 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-bold text-slate-900">{selectedClient.name}</div>
                  <div className="text-slate-600">{selectedClient.organization || 'Individual Client'}</div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onOpenPrint({
                      kind: 'clientLedger',
                      data: {
                        client: selectedClient,
                        quotes: clientQuotes,
                        rentals: clientRentals,
                      },
                    })
                  }
                  className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Printer className="h-3 w-3" />
                  Print Statement
                </button>
              </div>
              <div className="mt-2 space-y-1 text-slate-600">
                <div>Phone: <span className="font-mono text-slate-900">{selectedClient.contactNo || '—'}</span></div>
                <div>Email: <span className="text-slate-900">{selectedClient.email || '—'}</span></div>
                <div>Address: <span className="text-slate-900">{selectedClient.address || '—'}</span></div>
                {selectedClient.notes && (
                  <div className="pt-1 text-slate-500 italic">{selectedClient.notes}</div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2.5 text-center font-mono tabular-nums">
                <div className="bg-slate-50 p-1.5 border border-slate-200">
                  <div className="font-sans text-[10px] text-slate-500">Quotes</div>
                  <div className="font-bold text-slate-900">{selectedClient.quoteCount ?? clientQuotes.length}</div>
                </div>
                <div className="bg-slate-50 p-1.5 border border-slate-200">
                  <div className="font-sans text-[10px] text-slate-500">Active</div>
                  <div className="font-bold text-slate-900">{selectedClient.activeRentals ?? 0}</div>
                </div>
                <div className="bg-slate-50 p-1.5 border border-slate-200">
                  <div className="font-sans text-[10px] text-slate-500">Paid</div>
                  <div className="font-bold text-emerald-700">{formatPeso(selectedClient.totalSpent ?? 0)}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="font-semibold text-slate-800 mb-2">
                Recent Rentals ({clientRentals.length})
              </div>
              {clientRentals.length === 0 ? (
                <div className="text-slate-500">No rentals recorded for this client yet.</div>
              ) : (
                <div className="space-y-2">
                  {clientRentals.slice(0, 5).map((r) => (
                    <div key={r.id} className="border border-slate-200 p-2.5">
                      <div className="flex justify-between font-mono">
                        <span className="font-semibold text-slate-900">{r.slipNo}</span>
                        <span>{r.status}</span>
                      </div>
                      <div className="text-slate-600 mt-0.5">{r.eventPurpose || r.venue || 'Rental'}</div>
                      <div className="flex justify-between mt-1 font-mono tabular-nums text-slate-700">
                        <span>{formatDate(r.dateOut)}</span>
                        <span className="font-semibold">{formatPeso(r.totalRentalAmount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="font-semibold text-slate-800 mb-2">
                Quotations ({clientQuotes.length})
              </div>
              {clientQuotes.length === 0 ? (
                <div className="text-slate-500">No quotes issued to this client yet.</div>
              ) : (
                <div className="space-y-2">
                  {clientQuotes.slice(0, 5).map((q) => (
                    <div key={q.id} className="border border-slate-200 p-2.5">
                      <div className="flex justify-between font-mono">
                        <span className="font-semibold text-slate-900">{q.quoteNo}</span>
                        <span>{q.status}</span>
                      </div>
                      <div className="flex justify-between mt-1 font-mono tabular-nums text-slate-700">
                        <span>{q.eventName || 'Quote'}</span>
                        <span className="font-semibold">{formatPeso(q.totalAmount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-slate-500">
            Select a client from the directory to view contact details, quotations, and rental history.
          </div>
        )}
      </div>

      {/* Add / Edit Client Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {editing ? 'Edit Client Record' : 'New Client Record'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Organization / Company</label>
                <input
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Contact No.</label>
                  <input
                    type="text"
                    value={contactNo}
                    onChange={(e) => setContactNo(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Address / Billing Location</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={closeModal}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                {editing ? 'Save Changes' : 'Save Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
