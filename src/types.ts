export type EquipmentCategoryCode = 'LW' | 'AS' | 'LS' | 'SS' | 'PS';

export type InventoryStatus = 'AVAILABLE' | 'RENTED' | 'RESERVED' | 'MAINTENANCE';

export interface BusinessUnit {
  id: string;
  code: string;
  name: string;
  tagline: string;
  focusLabel: string;
  accentColor: string;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
}

export interface InventoryItem {
  code: string;
  businessId: string;
  categoryCode: EquipmentCategoryCode;
  categoryName: string;
  name: string;
  brand: string;
  placement: string;
  location: string;
  qtyOnHand: number;
  qtyOut: number;
  qtyReserved: number;
  qtyAvailable: number;
  rentalRate: number;
  condition: string;
  status: InventoryStatus;
  remarks: string;
  imageUrl: string;
  updatedAt: string;
}

export interface Client {
  id: number;
  name: string;
  organization: string;
  contactNo: string;
  email: string;
  address: string;
  notes: string;
  createdAt: string;
  totalSpent?: number;
  activeRentals?: number;
  quoteCount?: number;
}

export interface LineItem {
  id?: number;
  inventoryCode: string;
  equipmentName: string;
  categoryCode?: string;
  quantity: number;
  rentalRate: number;
  days: number;
  amount: number;
  remarks: string;
  conditionOut?: string;
  accessories?: string;
  qtyReturned?: number;
  missingQty?: number;
  damages?: string;
  addCharges?: number;
}

export type QuoteStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'CONVERTED' | 'CANCELLED';

export interface Quote {
  id: number;
  quoteNo: string;
  businessId: string;
  clientId: number | null;
  clientName: string;
  organization: string;
  contactNo: string;
  eventName: string;
  venue: string;
  eventDate: string;
  expectedReturnDate: string;
  days: number;
  deliveryCharge: number;
  discountPercent: number;
  subtotal: number;
  totalAmount: number;
  notes: string;
  status: QuoteStatus;
  convertedSlipNo: string | null;
  createdAt: string;
  items: LineItem[];
}

export type RentalStatus = 'RESERVED' | 'DISPATCHED' | 'PARTIAL_RETURN' | 'RETURNED' | 'CANCELLED';

export interface Rental {
  id: number;
  slipNo: string;
  drNo: string;
  returnNo: string | null;
  businessId: string;
  quoteId: number | null;
  clientId: number | null;
  borrowerName: string;
  organization: string;
  contactNo: string;
  eventPurpose: string;
  venue: string;
  dateIssued: string;
  dateOut: string;
  expectedReturn: string;
  returnDate: string | null;
  daysOverall: number;
  subtotal: number;
  deliveryCharge: number;
  discountPercent: number;
  additionalCharges: number;
  totalRentalAmount: number;
  depositAdvance: number;
  amountPaid: number;
  balanceDue: number;
  conditionUponRelease: string;
  conditionUponReturn: string;
  inspectionResult: string;
  releasedBy: string;
  deliveryPersonnel: string;
  vehicleDriver: string;
  inspectedBy: string;
  status: RentalStatus;
  isInternal?: boolean;
  createdAt: string;
  items: LineItem[];
}

export type PaymentStatus = 'Paid in Full' | 'Partial Payment' | 'Pending';

export interface Payment {
  id: number;
  receiptNo: string;
  businessId: string;
  rentalId: number | null;
  slipNo: string;
  clientId: number | null;
  receivedFrom: string;
  organization: string;
  contactNo: string;
  eventPurpose: string;
  paymentDate: string;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  rentalCharges: number;
  deliveryCharges: number;
  additionalCharges: number;
  discountPercent: number;
  totalAmountDue: number;
  amountPaid: number;
  outstandingBalance: number;
  amountInWords: string;
  referenceNo: string;
  receivedBy: string;
  authorizedBy: string;
  notes: string;
  createdAt: string;
}

export interface MaintenanceSlip {
  id: number;
  slipNo: string;
  inventoryCode: string;
  equipmentName: string;
  brandModel: string;
  locationStorage: string;
  dateRequested: string;
  requiredBy: string;
  requestedBy: string;
  department: string;
  contactNo: string;
  repairType: string;
  priorityLevel: 'Low' | 'Normal' | 'Urgent' | 'Critical';
  reportedProblem: string;
  proposedRepair: string;
  safetyOutOfService: boolean;
  estimatedPartsCost: number;
  laborCost: number;
  otherCost: number;
  actualTotalCost: number;
  technician: string;
  workPerformed: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: string;
}

export interface BudgetItem {
  code: string;
  description: string;
  qty: number;
  unit: string;
  estUnitCost: number;
  estAmount: number;
  supplier: string;
}

export interface BudgetRequest {
  id: number;
  budgetNo: string;
  dateRequested: string;
  requiredDate: string;
  requestedBy: string;
  department: string;
  contactNo: string;
  expenseCategory: string;
  priority: string;
  purpose: string;
  eventName: string;
  venue: string;
  paymentMethod: string;
  payeeSupplier: string;
  requestedBudget: number;
  availableBudget: number;
  actualSpent: number;
  status: 'PENDING' | 'APPROVED' | 'RELEASED' | 'LIQUIDATED';
  items: BudgetItem[];
  createdAt: string;
}

export interface BusinessStat {
  businessId: string;
  code: string;
  name: string;
  tagline: string;
  focusLabel: string;
  accentColor: string;
  active: boolean;
  skuCount: number;
  unitsOnHand: number;
  unitsAvailable: number;
  unitsOut: number;
  unitsMaintenance: number;
  activeRentalsCount: number;
  pendingQuotesCount: number;
  totalRevenueCollected: number;
  outstandingReceivables: number;
  totalRentalsCount: number;
}

export interface DashboardSummary {
  totalUnitsOnHand: number;
  totalUnitsAvailable: number;
  totalUnitsOut: number;
  maintenanceCount: number;
  activeRentalsCount: number;
  pendingQuotesCount: number;
  totalRevenueCollected: number;
  outstandingReceivables: number;
  categoryStats: Array<{
    categoryCode: EquipmentCategoryCode;
    categoryName: string;
    skuCount: number;
    unitsOnHand: number;
    unitsAvailable: number;
    unitsOut: number;
    unitsMaintenance: number;
  }>;
  businessStats: BusinessStat[];
}

export type RealtimeEventType =
  | 'inventory:updated'
  | 'quote:updated'
  | 'rental:updated'
  | 'client:updated'
  | 'payment:updated'
  | 'maintenance:updated'
  | 'budget:updated'
  | 'draft:updated'
  | 'activity:updated'
  | 'settings:updated'
  | 'server:saved'
  | 'users:updated'
  | 'business:updated'
  | 'presence:updated';

export type ServerUserAccess = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface ServerUser {
  id: number;
  clientId: string;
  name: string;
  email: string;
  role: string;
  color: string;
  accessLevel: ServerUserAccess;
  canEdit: boolean;
  status: 'ACTIVE' | 'REVOKED';
  inviteToken: string;
  addedBy: string;
  lastSeenAt: string;
  createdAt: string;
  isOnline?: boolean;
  activeView?: string;
  editingKey?: string | null;
}

export interface PresenceMember {
  clientId: string;
  serverUserId?: number | null;
  name: string;
  role: string;
  color: string;
  accessLevel?: ServerUserAccess;
  canEdit?: boolean;
  activeView: string;
  editingKey?: string | null;
  connectedAt: string;
  lastSeenAt: string;
}

export interface RealtimeMessage {
  type: RealtimeEventType;
  timestamp: string;
  detail?: string;
  members?: PresenceMember[];
}

export interface SharedDraft {
  id: number;
  businessId: string;
  title: string;
  createdBy: string;
  updatedBy: string;
  clientId: number | null;
  clientName: string;
  organization: string;
  contactNo: string;
  eventName: string;
  venue: string;
  dateOut: string;
  expectedReturn: string;
  days: number;
  deliveryCharge: number;
  discountPercent: number;
  depositAdvance: number;
  paymentMethod: string;
  notes: string;
  items: Array<{
    inventoryCode: string;
    equipmentName: string;
    quantity: number;
    rentalRate: number;
    remarks: string;
  }>;
  updatedAt: string;
  createdAt: string;
}

export interface ActivityLogEntry {
  id: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
}

export interface ServerSavepoint {
  id: number;
  label: string;
  savedBy: string;
  sizeBytes: number;
  counts: {
    inventory: number;
    clients: number;
    quotes: number;
    rentals: number;
    payments: number;
    maintenance: number;
    budgets: number;
    drafts: number;
  };
  createdAt: string;
}

export interface ServerInfo {
  serverLabel: string;
  hostname: string;
  port: number;
  platform: string;
  uptimeSeconds: number;
  lanUrls: string[];
  publicAppUrl: string;
  dbPath: string;
  dbSizeBytes: number;
  lastSavedAt: string;
  lastManualSaveAt: string;
  lastManualSaveBy: string;
  teamPinEnabled: boolean;
  counts: {
    inventory: number;
    clients: number;
    quotes: number;
    rentals: number;
    payments: number;
    maintenance: number;
    budgets: number;
    drafts: number;
    activities: number;
    serverUsers?: number;
    businesses?: number;
  };
  onlineMembers: PresenceMember[];
}

