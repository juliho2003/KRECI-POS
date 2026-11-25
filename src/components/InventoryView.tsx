import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Image as ImageIcon, Pencil, Plus, Printer, Search, Trash2, Upload, Wrench, X } from 'lucide-react';
import type {
  BusinessUnit,
  DashboardSummary,
  EquipmentCategoryCode,
  InventoryItem,
  InventoryStatus,
  PresenceMember,
} from '../types';
import { apiFetch } from '../utils/api';
import { formatPeso, statusColorClass } from '../utils/format';
import type { PrintablePayload } from './PrintableFormModal';

interface InventoryViewProps {
  inventory: InventoryItem[];
  businesses: BusinessUnit[];
  dashboard: DashboardSummary | null;
  onlineMembers: PresenceMember[];
  currentClientId: string;
  businessFilter: string;
  categoryFilter: 'ALL' | EquipmentCategoryCode;
  openAddOtherSignal: number;
  onBusinessFilterChange: (businessId: string) => void;
  onCategoryFilterChange: (category: 'ALL' | EquipmentCategoryCode) => void;
  onEditingChange: (key: string | null) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
  onOpenPrint: (payload: PrintablePayload) => void;
  onRefresh: () => void;
}

const CATEGORY_NAMES: Record<EquipmentCategoryCode, string> = {
  LW: 'LED WALL SYSTEM',
  AS: 'AUDIO SYSTEM',
  LS: 'LIGHTING SYSTEM',
  SS: 'SUPPORT SYSTEM',
  PS: 'POWER SYSTEM',
};

async function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new window.Image();
      img.onerror = () => reject(new Error('Unsupported or corrupted image file'));
      img.onload = () => {
        const maxW = 800;
        const maxH = 600;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (width > maxW || height > maxH) {
          const ratio = Math.min(maxW / width, maxH / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function EquipmentThumb({
  src,
  alt,
  onClick,
}: {
  src?: string;
  alt: string;
  onClick?: () => void;
}) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) {
    return (
      <div className="h-9 w-12 shrink-0 border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400">
        <ImageIcon className="h-4 w-4" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 w-12 shrink-0 border border-slate-200 bg-slate-100 overflow-hidden cursor-pointer hover:border-amber-600 transition-colors"
      title="Click to enlarge photo"
    >
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-full w-full object-cover"
      />
    </button>
  );
}

export function InventoryView({
  inventory,
  businesses,
  dashboard,
  onlineMembers,
  currentClientId,
  businessFilter,
  categoryFilter,
  openAddOtherSignal,
  onBusinessFilterChange,
  onCategoryFilterChange,
  onEditingChange,
  onNotify,
  onOpenPrint,
  onRefresh,
}: InventoryViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | InventoryStatus>('ALL');
  const [previewItem, setPreviewItem] = useState<InventoryItem | null>(null);

  // Edit Item Modal State
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editBusinessId, setEditBusinessId] = useState('kr-oncue');
  const [editCategory, setEditCategory] = useState<EquipmentCategoryCode>('AS');
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editRate, setEditRate] = useState(0);
  const [editQty, setEditQty] = useState(1);
  const [editCondition, setEditCondition] = useState('Good');
  const [editStatus, setEditStatus] = useState<InventoryStatus>('AVAILABLE');
  const [editPlacement, setEditPlacement] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Add Item Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBusinessId, setNewBusinessId] = useState('kr-oncue');
  const [newCode, setNewCode] = useState('');
  const [newCategory, setNewCategory] = useState<EquipmentCategoryCode>('AS');
  const [newCategoryName, setNewCategoryName] = useState(CATEGORY_NAMES.AS);
  const [newName, setNewName] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newPlacement, setNewPlacement] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newRate, setNewRate] = useState(500);
  const [newCondition, setNewCondition] = useState('Good');
  const [newRemarks, setNewRemarks] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');

  // Maintenance Quick Slip Modal State
  const [maintItem, setMaintItem] = useState<InventoryItem | null>(null);
  const [maintProblem, setMaintProblem] = useState('');
  const [maintPriority, setMaintPriority] = useState<'Low' | 'Normal' | 'Urgent' | 'Critical'>('Urgent');
  const [maintRequester, setMaintRequester] = useState('');
  const [saving, setSaving] = useState(false);

  const businessMap = useMemo(() => {
    const map = new Map<string, BusinessUnit>();
    for (const b of businesses) map.set(b.id, b);
    return map;
  }, [businesses]);

  const openAddModalFor = (presetCategory: EquipmentCategoryCode) => {
    const targetBiz = businessFilter !== 'ALL' ? businessFilter : 'kr-oncue';
    setNewBusinessId(targetBiz);
    setNewCategory(presetCategory);
    setNewCategoryName(CATEGORY_NAMES[presetCategory]);
    setNewCode('');
    setNewName('');
    setNewBrand('');
    setNewPlacement('');
    setNewLocation('');
    setNewQty(1);
    setNewRate(500);
    setNewCondition('Good');
    setNewRemarks('');
    setNewImageUrl('');
    setShowAddModal(true);
  };

  useEffect(() => {
    if (openAddOtherSignal > 0) {
      openAddModalFor('AS');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAddOtherSignal]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory.filter((it) => {
      if (businessFilter !== 'ALL' && it.businessId !== businessFilter) return false;
      if (categoryFilter !== 'ALL' && it.categoryCode !== categoryFilter) return false;
      if (statusFilter !== 'ALL' && it.status !== statusFilter) return false;
      if (!q) return true;
      return (
        it.code.toLowerCase().includes(q) ||
        it.name.toLowerCase().includes(q) ||
        it.brand.toLowerCase().includes(q) ||
        it.categoryName.toLowerCase().includes(q) ||
        it.placement.toLowerCase().includes(q) ||
        it.location.toLowerCase().includes(q)
      );
    });
  }, [inventory, search, businessFilter, categoryFilter, statusFilter]);

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setEditBusinessId(item.businessId || 'kr-oncue');
    setEditCategory(item.categoryCode);
    setEditCategoryName(item.categoryName || CATEGORY_NAMES[item.categoryCode]);
    setEditName(item.name);
    setEditBrand(item.brand);
    setEditRate(item.rentalRate);
    setEditQty(item.qtyOnHand);
    setEditCondition(item.condition);
    setEditStatus(item.status);
    setEditPlacement(item.placement);
    setEditLocation(item.location);
    setEditRemarks(item.remarks);
    setEditImageUrl(item.imageUrl || '');
    setConfirmDelete(false);
    onEditingChange(`inventory:${item.code}`);
  };

  const closeEdit = () => {
    setEditingItem(null);
    setConfirmDelete(false);
    onEditingChange(null);
  };

  const handleImageFileSelect = async (
    e: ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      setter(compressed);
      onNotify('Equipment picture attached.');
    } catch (err) {
      onNotify((err as Error).message, 'error');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    if (!editName.trim()) {
      onNotify('Equipment name is required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/inventory/${encodeURIComponent(editingItem.code)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          businessId: editBusinessId,
          categoryCode: editCategory,
          categoryName: editCategoryName.trim() || CATEGORY_NAMES[editCategory],
          name: editName.trim(),
          brand: editBrand.trim(),
          rentalRate: editRate,
          qtyOnHand: editQty,
          condition: editCondition,
          status: editStatus,
          placement: editPlacement,
          location: editLocation,
          remarks: editRemarks,
          imageUrl: editImageUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      onNotify(`Saved changes to ${editingItem.code}.`);
      closeEdit();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/inventory/${encodeURIComponent(editingItem.code)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      onNotify(`Deleted ${editingItem.code} from Master Inventory.`);
      closeEdit();
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateItem = async () => {
    if (!newCode.trim() || !newName.trim()) {
      onNotify('Inventory Code and Equipment Name are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/inventory', {
        method: 'POST',
        body: JSON.stringify({
          businessId: newBusinessId,
          code: newCode.trim().toUpperCase(),
          categoryCode: newCategory,
          categoryName: newCategoryName.trim() || CATEGORY_NAMES[newCategory],
          name: newName.trim(),
          brand: newBrand.trim(),
          placement: newPlacement.trim(),
          location: newLocation.trim(),
          qtyOnHand: newQty,
          rentalRate: newRate,
          condition: newCondition.trim() || 'Good',
          remarks: newRemarks.trim(),
          imageUrl: newImageUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add equipment');
      onNotify(`Added ${data.code} to Master Inventory.`);
      setShowAddModal(false);
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateMaintenance = async () => {
    if (!maintItem || !maintProblem.trim()) {
      onNotify('Describe the problem or repair needed.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          inventoryCode: maintItem.code,
          requestedBy: maintRequester.trim() || 'Warehouse Staff',
          priorityLevel: maintPriority,
          reportedProblem: maintProblem.trim(),
          safetyOutOfService: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log maintenance');
      onNotify(`Maintenance Slip ${data.slipNo} created. ${maintItem.code} marked MAINTENANCE.`);
      setMaintItem(null);
      setMaintProblem('');
      onRefresh();
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const printLabel = useMemo(() => {
    const bizPart =
      businessFilter === 'ALL'
        ? ''
        : `${businessMap.get(businessFilter)?.name || businessFilter} — `;
    const catPart =
      categoryFilter === 'ALL' ? 'ALL EQUIPMENT SYSTEMS' : CATEGORY_NAMES[categoryFilter];
    return `${bizPart}${catPart}`;
  }, [businessFilter, categoryFilter, businessMap]);

  return (
    <div className="space-y-5">
      {/* Category Stock Breakdown Strip */}
      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {dashboard.categoryStats.map((cat) => (
            <button
              key={cat.categoryCode}
              type="button"
              onClick={() =>
                onCategoryFilterChange(categoryFilter === cat.categoryCode ? 'ALL' : cat.categoryCode)
              }
              className={`text-left bg-white border p-3.5 transition-colors cursor-pointer ${
                categoryFilter === cat.categoryCode
                  ? 'border-amber-600 bg-amber-50/40'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-mono font-semibold text-slate-900">{cat.categoryCode}</span>
                <span className="font-mono tabular-nums">{cat.skuCount} SKUs</span>
              </div>
              <div className="mt-1 text-xs font-medium text-slate-700 truncate" title={cat.categoryName}>
                {cat.categoryName}
              </div>
              <div className="mt-2 flex items-baseline justify-between font-mono tabular-nums">
                <span className="text-lg font-bold text-slate-900">{cat.unitsAvailable}</span>
                <span className="text-xs text-slate-500">/ {cat.unitsOnHand} avail</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
                {cat.unitsOut} out · {cat.unitsMaintenance} maint
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Main Inventory Table */}
      <div className="bg-white border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by code, equipment name, brand, or location..."
                className="w-full border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <select
              value={businessFilter}
              onChange={(e) => onBusinessFilterChange(e.target.value)}
              className="border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-amber-600 focus:outline-none"
            >
              <option value="ALL">All Business Units</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => onCategoryFilterChange(e.target.value as 'ALL' | EquipmentCategoryCode)}
              className="border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-amber-600 focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              <option value="LW">LW — LED Wall System</option>
              <option value="AS">AS — Audio System</option>
              <option value="LS">LS — Lighting System</option>
              <option value="SS">SS — Support System</option>
              <option value="PS">PS — Power System</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | InventoryStatus)}
              className="border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-amber-600 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="RESERVED">RESERVED</option>
              <option value="RENTED">RENTED</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                onOpenPrint({
                  kind: 'inventory',
                  data: {
                    items: filtered,
                    categoryLabel: printLabel,
                    businessId: businessFilter !== 'ALL' ? businessFilter : undefined,
                  },
                })
              }
              className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              Print FORM 0001
            </button>
            <button
              type="button"
              onClick={() => openAddModalFor('AS')}
              className="inline-flex items-center gap-1.5 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Equipment SKU
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="px-3 py-2.5 w-16">Photo</th>
                <th className="px-3 py-2.5">Code</th>
                <th className="px-3 py-2.5">Business · Category</th>
                <th className="px-3 py-2.5">Equipment / Description</th>
                <th className="px-3 py-2.5">Brand</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5 text-right">Avail / Hand</th>
                <th className="px-3 py-2.5 text-right">Rate / Day</th>
                <th className="px-3 py-2.5">Condition</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const activeEditors = onlineMembers.filter(
                  (m) => m.clientId !== currentClientId && m.editingKey === `inventory:${item.code}`
                );
                const biz = businessMap.get(item.businessId);
                return (
                  <tr key={item.code} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2">
                      <EquipmentThumb
                        src={item.imageUrl}
                        alt={item.name}
                        onClick={() => setPreviewItem(item)}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {item.code}
                      {activeEditors.length > 0 && (
                        <span className="ml-1.5 inline-block bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-sans font-semibold">
                          Editing: {activeEditors.map((e) => e.name).join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                        <span
                          className="h-2 w-2 shrink-0"
                          style={{ backgroundColor: biz?.accentColor || '#d97706' }}
                        />
                        <span>{biz?.name || item.businessId}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {item.categoryCode} · {item.categoryName}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900 max-w-xs truncate" title={item.name}>
                      <div>{item.name}</div>
                      {item.placement && (
                        <div className="text-[11px] font-normal text-slate-500 truncate">{item.placement}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{item.brand || '—'}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{item.location || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className={item.qtyAvailable === 0 ? 'font-bold text-red-700' : 'font-semibold text-slate-900'}>
                        {item.qtyAvailable}
                      </span>
                      <span className="text-slate-400"> / {item.qtyOnHand}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {formatPeso(item.rentalRate)}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{item.condition}</td>
                    <td className={`px-3 py-2 font-semibold whitespace-nowrap ${statusColorClass(item.status)}`}>
                      {item.status}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                          title="Edit equipment details, picture, rate, stock, or status"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMaintItem(item);
                            setMaintProblem('');
                          }}
                          className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 cursor-pointer"
                          title="Report Maintenance (FORM 0002)"
                        >
                          <Wrench className="h-3.5 w-3.5" />
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
              No equipment records found matching your filters.
            </div>
          )}
        </div>
      </div>

      {/* Photo Preview Lightbox */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="w-full max-w-lg bg-white border border-slate-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="font-mono text-xs font-bold text-slate-900">{previewItem.code}</div>
                <div className="text-xs text-slate-600 truncate">{previewItem.name}</div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-slate-100 p-4 flex items-center justify-center">
              <img
                src={previewItem.imageUrl}
                alt={previewItem.name}
                referrerPolicy="no-referrer"
                className="max-h-[420px] w-auto object-contain border border-slate-200 bg-white"
              />
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs bg-slate-50">
              <span className="font-mono font-semibold text-slate-900">
                {formatPeso(previewItem.rentalRate)} / day · {previewItem.qtyAvailable}/{previewItem.qtyOnHand} avail
              </span>
              <button
                type="button"
                onClick={() => {
                  const target = previewItem;
                  setPreviewItem(null);
                  openEdit(target);
                }}
                className="bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Edit Item & Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-white border border-slate-200 shadow-lg my-4">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Edit Equipment — {editingItem.code}</h3>
                <p className="text-xs text-slate-500 truncate">Changes & equipment photo save to the team server</p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
              {/* Equipment Picture Upload & Preview */}
              <div className="border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-center gap-3">
                <div className="h-20 w-28 shrink-0 border border-slate-300 bg-white flex items-center justify-center overflow-hidden">
                  {editImageUrl ? (
                    <img
                      src={editImageUrl}
                      alt={editName || editingItem.code}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-slate-400 p-2">
                      <ImageIcon className="h-5 w-5 mx-auto mb-1" />
                      <span className="text-[10px]">No Photo</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-[200px] space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer">
                      <Upload className="h-3.5 w-3.5" />
                      Upload Picture
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageFileSelect(e, setEditImageUrl)}
                        className="hidden"
                      />
                    </label>
                    {editImageUrl && (
                      <button
                        type="button"
                        onClick={() => setEditImageUrl('')}
                        className="border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={editImageUrl.startsWith('data:') ? '' : editImageUrl}
                    onChange={(e) => setEditImageUrl(e.target.value)}
                    placeholder={
                      editImageUrl.startsWith('data:')
                        ? 'Uploaded photo attached (or paste image URL to replace)'
                        : 'Or paste image URL (https://... or /src/assets/...)'
                    }
                    className="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Equipment Name / Description *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Business Unit POS</label>
                  <select
                    value={editBusinessId}
                    onChange={(e) => setEditBusinessId(e.target.value)}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => {
                      const next = e.target.value as EquipmentCategoryCode;
                      setEditCategory(next);
                      setEditCategoryName(CATEGORY_NAMES[next]);
                    }}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="LW">LW — LED Wall System</option>
                    <option value="AS">AS — Audio System</option>
                    <option value="LS">LS — Lighting System</option>
                    <option value="SS">SS — Support System</option>
                    <option value="PS">PS — Power System</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category / Equipment Group Label</label>
                  <input
                    type="text"
                    value={editCategoryName}
                    onChange={(e) => setEditCategoryName(e.target.value)}
                    placeholder="e.g. AUDIO SYSTEM or LED WALL SYSTEM"
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={editBrand}
                    onChange={(e) => setEditBrand(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Rental Rate / Day (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={editRate}
                    onChange={(e) => setEditRate(Number(e.target.value) || 0)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Qty On Hand</label>
                  <input
                    type="number"
                    min={0}
                    value={editQty}
                    onChange={(e) => setEditQty(Number(e.target.value) || 0)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Condition</label>
                  <input
                    type="text"
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as InventoryStatus)}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="AVAILABLE">AVAILABLE</option>
                    <option value="RESERVED">RESERVED</option>
                    <option value="RENTED">RENTED</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Case / Placement</label>
                  <input
                    type="text"
                    value={editPlacement}
                    onChange={(e) => setEditPlacement(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Storage Location</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <div>
                {confirmDelete ? (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleDeleteItem}
                      className="bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="text-xs text-slate-600 hover:text-slate-900 px-1.5 cursor-pointer"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete SKU
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveEdit}
                  className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add SKU Modal (with Picture Upload) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-white border border-slate-200 shadow-lg my-4">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Add Master Inventory Item
                </h3>
                <p className="text-xs text-slate-500">
                  Assign to any business POS unit and upload an equipment photo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
              {/* Equipment Picture Upload & Preview */}
              <div className="border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-center gap-3">
                <div className="h-20 w-28 shrink-0 border border-slate-300 bg-white flex items-center justify-center overflow-hidden">
                  {newImageUrl ? (
                    <img
                      src={newImageUrl}
                      alt={newName || 'New equipment'}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-slate-400 p-2">
                      <ImageIcon className="h-5 w-5 mx-auto mb-1" />
                      <span className="text-[10px]">No Photo</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-[200px] space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer">
                      <Upload className="h-3.5 w-3.5" />
                      Upload Equipment Picture
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageFileSelect(e, setNewImageUrl)}
                        className="hidden"
                      />
                    </label>
                    {newImageUrl && (
                      <button
                        type="button"
                        onClick={() => setNewImageUrl('')}
                        className="border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={newImageUrl.startsWith('data:') ? '' : newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder={
                      newImageUrl.startsWith('data:')
                        ? 'Uploaded photo attached (or paste image URL to replace)'
                        : 'Or paste image URL (https://... or /src/assets/...)'
                    }
                    className="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Business Unit POS *</label>
                  <select
                    value={newBusinessId}
                    onChange={(e) => setNewBusinessId(e.target.value)}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category *</label>
                  <select
                    value={newCategory}
                    onChange={(e) => {
                      const next = e.target.value as EquipmentCategoryCode;
                      setNewCategory(next);
                      setNewCategoryName(CATEGORY_NAMES[next]);
                    }}
                    className="w-full border border-slate-300 bg-white px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  >
                    <option value="LW">LW — LED Wall System</option>
                    <option value="AS">AS — Audio System</option>
                    <option value="LS">LS — Lighting System</option>
                    <option value="SS">SS — Support System</option>
                    <option value="PS">PS — Power System</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Inventory Code *</label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="AS-SPK-0001"
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono uppercase focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category / Group Label</label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. TENTS & FURNITURE"
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Equipment Name / Description *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Heavy-Duty 10x20ft Event Canopy Tent"
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Qty On Hand</label>
                  <input
                    type="number"
                    min={1}
                    value={newQty}
                    onChange={(e) => setNewQty(Number(e.target.value) || 1)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Rate/Day (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={newRate}
                    onChange={(e) => setNewRate(Number(e.target.value) || 0)}
                    className="w-full border border-slate-300 px-2.5 py-2 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Case / Placement</label>
                  <input
                    type="text"
                    value={newPlacement}
                    onChange={(e) => setNewPlacement(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Storage Location</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Condition</label>
                  <input
                    type="text"
                    value={newCondition}
                    onChange={(e) => setNewCondition(e.target.value)}
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Remarks</label>
                <input
                  type="text"
                  value={newRemarks}
                  onChange={(e) => setNewRemarks(e.target.value)}
                  placeholder="Optional accessories, weight, power specs..."
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleCreateItem}
                className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Maintenance Slip Modal */}
      {maintItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Report Repair / Maintenance (FORM 0002)</h3>
                <p className="text-xs text-slate-500">{maintItem.code} · {maintItem.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setMaintItem(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Requested By</label>
                  <input
                    type="text"
                    value={maintRequester}
                    onChange={(e) => setMaintRequester(e.target.value)}
                    placeholder="Technician / Crew name"
                    className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Priority Level</label>
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
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Reported Problem / Work Needed *</label>
                <textarea
                  rows={3}
                  value={maintProblem}
                  onChange={(e) => setMaintProblem(e.target.value)}
                  placeholder="Describe defect, power issue, dead pixels, or calibration needed..."
                  className="w-full border border-slate-300 px-2.5 py-2 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 p-2">
                Submitting places this unit into MAINTENANCE status and locks it from POS rental dispatch until repaired.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setMaintItem(null)}
                className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleCreateMaintenance}
                className="bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
              >
                Create Maintenance Slip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
