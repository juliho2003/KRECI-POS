import { useRef, useState } from 'react';
import { Download, Printer, ReceiptText, FileText, X } from 'lucide-react';
import type {
  BudgetRequest,
  BusinessUnit,
  Client,
  InventoryItem,
  MaintenanceSlip,
  Payment,
  Quote,
  Rental,
} from '../types';
import { formatDate, formatPeso, numberToWordsPeso } from '../utils/format';
import {
  downloadDocumentPdf,
  getPrintableTitle,
  printDocumentElement,
  type PaperFormat,
} from '../utils/printDoc';

export type PrintablePayload =
  | { kind: 'quote'; data: Quote }
  | { kind: 'borrowers'; data: Rental }
  | { kind: 'adminRelease'; data: Rental }
  | { kind: 'delivery'; data: Rental }
  | { kind: 'return'; data: Rental }
  | { kind: 'payment'; data: Payment }
  | { kind: 'maintenance'; data: MaintenanceSlip }
  | { kind: 'budget'; data: BudgetRequest }
  | { kind: 'inventory'; data: { items: InventoryItem[]; categoryLabel: string; businessId?: string } }
  | { kind: 'clientLedger'; data: { client: Client; quotes: Quote[]; rentals: Rental[] } };

interface PrintableFormModalProps {
  payload: PrintablePayload | null;
  businesses?: BusinessUnit[];
  onClose: () => void;
}

interface BrandHeader {
  name: string;
  tagline: string;
}

const COMPANY_NAME = 'KULTURE REVIVAL EVENTS CORE, INC.';
const COMPANY_LOGO = '/assets/aistudio/image_022d529a.png';

function OncueFormHeader({
  formCode,
  subtitle,
  brand,
}: {
  formCode: string;
  subtitle: string;
  brand?: BrandHeader;
}) {
  return (
    <div className="mb-5 border border-slate-300 avoid-break">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1e3a5f] px-3 py-1 text-[11px] font-mono font-semibold text-white">
        <span>{formCode}</span>
        <span className="text-[10px] font-sans tracking-wide text-slate-200 uppercase">
          {COMPANY_NAME} · POS SYSTEM
        </span>
      </div>
      <div className="bg-white border-b border-slate-300 px-4 py-2.5 flex items-center justify-center gap-3.5">
        <img
          src={COMPANY_LOGO}
          alt={`${COMPANY_NAME} Official Logo`}
          className="h-14 w-14 shrink-0 object-contain"
        />
        <div className="text-left">
          <div className="text-lg sm:text-xl font-extrabold tracking-tight text-[#0f172a] leading-tight">
            {COMPANY_NAME}
          </div>
          <div className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase mt-0.5">
            Official Company Form · POS System
          </div>
        </div>
      </div>
      <div className="bg-[#9eb6d4] py-1 text-center">
        <div className="text-sm font-extrabold tracking-tight text-[#0f172a]">
          {brand?.name || 'KR-ONCUE'}
        </div>
      </div>
      <div className="bg-[#162b49] py-1 text-center text-[11px] font-semibold tracking-wider text-white uppercase">
        {brand?.tagline || 'AUDIO, LIGHTS and LED WALL'}
      </div>
      <div className="bg-[#dce6cf] py-1 text-center text-xs font-bold tracking-wide text-slate-900">
        {subtitle}
      </div>
    </div>
  );
}

export function PrintableFormModal({ payload, businesses = [], onClose }: PrintableFormModalProps) {
  const [paperFormat, setPaperFormat] = useState<PaperFormat>('standard');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement | null>(null);

  if (!payload) return null;

  const resolveBrand = (): BrandHeader => {
    let bizId: string | undefined;
    if (
      payload.kind === 'quote' ||
      payload.kind === 'borrowers' ||
      payload.kind === 'adminRelease' ||
      payload.kind === 'delivery' ||
      payload.kind === 'return' ||
      payload.kind === 'payment' ||
      payload.kind === 'inventory'
    ) {
      bizId = payload.data.businessId;
    }
    const found = bizId ? businesses.find((b) => b.id === bizId) : undefined;
    return {
      name: found?.name || 'KR-ONCUE',
      tagline: found?.tagline || found?.focusLabel || 'AUDIO, LIGHTS and LED WALL',
    };
  };

  const brand = resolveBrand();

  const supportsThermal =
    payload.kind === 'quote' ||
    payload.kind === 'borrowers' ||
    payload.kind === 'adminRelease' ||
    payload.kind === 'delivery' ||
    payload.kind === 'return' ||
    payload.kind === 'payment';

  const activeFormat: PaperFormat = supportsThermal ? paperFormat : 'standard';
  const title = getPrintableTitle(payload);

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      await downloadDocumentPdf(printRef.current, title, activeFormat);
    } catch (err) {
      setPdfError((err as Error).message || 'Could not generate PDF file.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="print-modal-root fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6">
      <div
        className={`print-sheet w-full bg-white border border-slate-200 shadow-xl ${
          activeFormat === 'thermal80' ? 'max-w-md' : 'max-w-4xl'
        }`}
      >
        {/* Toolbar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-semibold text-slate-800">Official Document Preview</div>
            {supportsThermal && (
              <div className="flex items-center gap-1 bg-slate-200/80 p-1">
                <button
                  type="button"
                  onClick={() => setPaperFormat('standard')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeFormat === 'standard'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  A4 / Letter
                </button>
                <button
                  type="button"
                  onClick={() => setPaperFormat('thermal80')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeFormat === 'thermal80'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ReceiptText className="h-3.5 w-3.5" />
                  80mm POS Receipt
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={downloadingPdf}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 border border-amber-600 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
              title="Generate and download a real PDF file for saving or sharing"
            >
              <Download className="h-3.5 w-3.5" />
              {downloadingPdf ? 'Generating PDF...' : 'Download PDF'}
            </button>
            <button
              type="button"
              onClick={() => printDocumentElement(printRef.current, title, activeFormat)}
              className="inline-flex items-center gap-2 bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
          </div>
        </div>
        {pdfError && (
          <div className="no-print border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            PDF Export Error: {pdfError}
          </div>
        )}

        {/* Printable Document Body */}
        <div
          ref={printRef}
          className={
            activeFormat === 'thermal80'
              ? 'mx-auto w-[302px] p-3 text-[11px] font-mono text-slate-900 bg-white'
              : 'p-5 sm:p-8 text-xs text-slate-900 bg-white'
          }
        >
          {activeFormat === 'thermal80' && supportsThermal ? (
            <ThermalReceiptView payload={payload} brand={brand} />
          ) : (
            <>
              {payload.kind === 'quote' && <QuoteDocument quote={payload.data} brand={brand} />}
              {payload.kind === 'borrowers' && <BorrowersSlipDocument rental={payload.data} brand={brand} />}
              {payload.kind === 'adminRelease' && <AdminReleaseDocument rental={payload.data} brand={brand} />}
              {payload.kind === 'delivery' && <DeliveryReceiptDocument rental={payload.data} brand={brand} />}
              {payload.kind === 'return' && <ReturnInspectionDocument rental={payload.data} brand={brand} />}
              {payload.kind === 'payment' && <PaymentReceiptDocument payment={payload.data} brand={brand} />}
              {payload.kind === 'maintenance' && <MaintenanceDocument slip={payload.data} brand={brand} />}
              {payload.kind === 'budget' && <BudgetDocument budget={payload.data} brand={brand} />}
              {payload.kind === 'inventory' && (
                <InventoryDocument
                  items={payload.data.items}
                  categoryLabel={payload.data.categoryLabel}
                  brand={brand}
                />
              )}
              {payload.kind === 'clientLedger' && (
                <ClientLedgerDocument
                  client={payload.data.client}
                  quotes={payload.data.quotes}
                  rentals={payload.data.rentals}
                  brand={brand}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThermalReceiptView({ payload, brand }: { payload: PrintablePayload; brand: BrandHeader }) {
  return (
    <div className="space-y-2.5 leading-snug">
      <div className="text-center border-b border-dashed border-slate-400 pb-2">
        <img
          src={COMPANY_LOGO}
          alt={`${COMPANY_NAME} Official Logo`}
          className="h-14 w-auto mx-auto mb-1 object-contain"
        />
        <div className="text-xs font-extrabold tracking-tight leading-tight">{COMPANY_NAME}</div>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-600">POS System</div>
        <div className="text-xs font-bold tracking-tight mt-1">{brand.name}</div>
        <div className="text-[10px] uppercase">{brand.tagline}</div>
        <div className="text-[10px] mt-0.5 font-semibold">
          {payload.kind === 'quote' && 'OFFICIAL QUOTATION'}
          {payload.kind === 'borrowers' && 'FORM 0004 · BORROWERS SLIP'}
          {payload.kind === 'adminRelease' && 'ADMIN / INTERNAL OWN-GEAR RELEASE (NON-BILLABLE)'}
          {payload.kind === 'delivery' && 'FORM 0005 · DELIVERY RECEIPT'}
          {payload.kind === 'return' && 'FORM 0006 · RETURN INSPECTION'}
          {payload.kind === 'payment' && 'FORM 0007 · PAYMENT RECEIPT'}
        </div>
      </div>

      {payload.kind === 'quote' && (
        <>
          <div className="space-y-0.5 text-[10px]">
            <div>Quote: {payload.data.quoteNo}</div>
            <div>Date: {formatDate(payload.data.createdAt)}</div>
            <div>Client: {payload.data.clientName}</div>
            {payload.data.eventName && <div>Event: {payload.data.eventName}</div>}
            {payload.data.venue && <div>Venue: {payload.data.venue}</div>}
            <div>Duration: {payload.data.days} day(s)</div>
          </div>
          <div className="border-y border-dashed border-slate-400 py-1.5 space-y-1.5">
            {payload.data.items.map((it, i) => (
              <div key={i}>
                <div className="font-semibold">{it.inventoryCode} {it.equipmentName}</div>
                <div className="flex justify-between">
                  <span>{it.quantity} x {formatPeso(it.rentalRate)} x {it.days}d</span>
                  <span>{formatPeso(it.amount)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatPeso(payload.data.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery:</span>
              <span>{formatPeso(payload.data.deliveryCharge)}</span>
            </div>
            <div className="flex justify-between font-bold text-xs border-t border-slate-400 pt-1">
              <span>TOTAL QUOTE:</span>
              <span>{formatPeso(payload.data.totalAmount)}</span>
            </div>
          </div>
        </>
      )}

      {(payload.kind === 'borrowers' || payload.kind === 'adminRelease' || payload.kind === 'delivery' || payload.kind === 'return') && (
        <>
          <div className="space-y-0.5 text-[10px]">
            <div>Slip: {payload.data.slipNo}</div>
            <div>DR No.: {payload.data.drNo}</div>
            {payload.data.returnNo && <div>Return No.: {payload.data.returnNo}</div>}
            <div>{payload.kind === 'adminRelease' ? 'Custodian:' : 'Borrower:'} {payload.data.borrowerName}</div>
            {payload.data.eventPurpose && <div>Event: {payload.data.eventPurpose}</div>}
            <div>Out: {formatDate(payload.data.dateOut)} · Ret: {formatDate(payload.data.expectedReturn)}</div>
          </div>
          <div className="border-y border-dashed border-slate-400 py-1.5 space-y-1.5">
            {payload.data.items.map((it, i) => (
              <div key={i}>
                <div className="font-semibold">{it.inventoryCode} {it.equipmentName}</div>
                <div className="flex justify-between">
                  <span>Qty: {it.quantity}{payload.kind === 'return' ? ` (Ret ${it.qtyReturned ?? 0})` : ''}</span>
                  <span>{payload.kind === 'adminRelease' || payload.data.isInternal ? 'OWN GEAR (₱0)' : formatPeso(it.amount)}</span>
                </div>
              </div>
            ))}
          </div>
          {payload.kind === 'adminRelease' || payload.data.isInternal ? (
            <div className="space-y-0.5">
              <div className="flex justify-between font-bold">
                <span>BILLING TYPE:</span>
                <span>ADMIN OWN GEAR (₱0.00)</span>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex justify-between font-bold">
                <span>TOTAL RENTAL:</span>
                <span>{formatPeso(payload.data.totalRentalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid / Deposit:</span>
                <span>{formatPeso(payload.data.amountPaid)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>BALANCE DUE:</span>
                <span>{formatPeso(payload.data.balanceDue)}</span>
              </div>
            </div>
          )}
        </>
      )}

      {payload.kind === 'payment' && (
        <>
          <div className="space-y-0.5 text-[10px]">
            <div>Receipt: {payload.data.receiptNo}</div>
            <div>Date: {formatDate(payload.data.paymentDate)}</div>
            <div>From: {payload.data.receivedFrom}</div>
            {payload.data.slipNo && <div>Ref Slip: {payload.data.slipNo}</div>}
            <div>Method: {payload.data.paymentMethod}</div>
            <div>Status: {payload.data.paymentStatus}</div>
          </div>
          <div className="border-y border-dashed border-slate-400 py-1.5 space-y-1">
            <div className="flex justify-between">
              <span>Total Due:</span>
              <span>{formatPeso(payload.data.totalAmountDue)}</span>
            </div>
            <div className="flex justify-between font-bold text-xs">
              <span>AMOUNT PAID:</span>
              <span>{formatPeso(payload.data.amountPaid)}</span>
            </div>
            <div className="flex justify-between">
              <span>Balance:</span>
              <span>{formatPeso(payload.data.outstandingBalance)}</span>
            </div>
          </div>
          <div className="text-[10px]">
            Words: {payload.data.amountInWords || numberToWordsPeso(payload.data.amountPaid)}
          </div>
        </>
      )}

      <div className="pt-5 text-center text-[10px] space-y-5">
        <div>
          <div className="border-b border-slate-800 pb-4" />
          <div className="pt-1">Client / Borrower Signature</div>
        </div>
        <div>
          <div className="border-b border-slate-800 pb-4" />
          <div className="pt-1">{COMPANY_NAME} Authorized Representative</div>
        </div>
        <div className="text-[9px] text-slate-500 pt-1">
          Printed {new Date().toLocaleString('en-PH')}
        </div>
      </div>
    </div>
  );
}

function QuoteDocument({ quote, brand }: { quote: Quote; brand: BrandHeader }) {
  const discountAmt = (quote.subtotal * quote.discountPercent) / 100;
  return (
    <div>
      <OncueFormHeader formCode={`${brand.name} QUOTATION — ${quote.quoteNo}`} subtitle="OFFICIAL RENTAL QUOTATION" brand={brand} />

      <div className="mb-4 grid grid-cols-3 border border-slate-300 divide-x divide-slate-300 avoid-break">
        <div className="p-2.5 space-y-1">
          <div><span className="font-semibold">Quote No.:</span> <span className="font-mono">{quote.quoteNo}</span></div>
          <div><span className="font-semibold">Client:</span> {quote.clientName}</div>
          <div><span className="font-semibold">Venue:</span> {quote.venue || '—'}</div>
        </div>
        <div className="p-2.5 space-y-1">
          <div><span className="font-semibold">Date Issued:</span> {formatDate(quote.createdAt)}</div>
          <div><span className="font-semibold">Organization:</span> {quote.organization || '—'}</div>
          <div><span className="font-semibold">Event Date:</span> {formatDate(quote.eventDate)}</div>
        </div>
        <div className="p-2.5 space-y-1">
          <div><span className="font-semibold">Contact No.:</span> {quote.contactNo || '—'}</div>
          <div><span className="font-semibold">Event:</span> {quote.eventName || '—'}</div>
          <div><span className="font-semibold">Duration:</span> {quote.days} day(s)</div>
        </div>
      </div>

      <table className="mb-4 w-full border-collapse border border-slate-300">
        <thead>
          <tr className="bg-[#162b49] text-white text-left">
            <th className="border border-slate-300 px-2 py-1.5 w-10 text-center">No.</th>
            <th className="border border-slate-300 px-2 py-1.5 w-32">Inventory Code</th>
            <th className="border border-slate-300 px-2 py-1.5">Equipment / Description</th>
            <th className="border border-slate-300 px-2 py-1.5 w-14 text-right">Qty</th>
            <th className="border border-slate-300 px-2 py-1.5 w-24 text-right">Rate/Day</th>
            <th className="border border-slate-300 px-2 py-1.5 w-14 text-right">Days</th>
            <th className="border border-slate-300 px-2 py-1.5 w-28 text-right">Amount (₱)</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item, idx) => (
            <tr key={`${item.inventoryCode}-${idx}`} className="bg-[#fefce8]">
              <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">{idx + 1}</td>
              <td className="border border-slate-300 px-2 py-1.5 font-mono">{item.inventoryCode}</td>
              <td className="border border-slate-300 px-2 py-1.5">{item.equipmentName}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{item.quantity}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(item.rentalRate)}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{item.days}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums font-medium">{formatPeso(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-6 flex justify-end avoid-break">
        <div className="w-72 border border-slate-300 divide-y divide-slate-200">
          <div className="flex justify-between px-3 py-1.5">
            <span>Equipment Subtotal</span>
            <span className="font-mono tabular-nums">{formatPeso(quote.subtotal)}</span>
          </div>
          {quote.discountPercent > 0 && (
            <div className="flex justify-between px-3 py-1.5 text-emerald-700">
              <span>Discount ({quote.discountPercent}%)</span>
              <span className="font-mono tabular-nums">-{formatPeso(discountAmt)}</span>
            </div>
          )}
          <div className="flex justify-between px-3 py-1.5">
            <span>Delivery / Setup Charge</span>
            <span className="font-mono tabular-nums">{formatPeso(quote.deliveryCharge)}</span>
          </div>
          <div className="flex justify-between bg-[#d4a017] px-3 py-2 font-bold text-slate-900">
            <span>TOTAL QUOTED AMOUNT</span>
            <span className="font-mono tabular-nums">{formatPeso(quote.totalAmount)}</span>
          </div>
        </div>
      </div>

      {quote.notes && (
        <div className="mb-6 border border-slate-200 bg-slate-50 p-3 avoid-break">
          <div className="font-semibold mb-1">Terms & Notes:</div>
          <div className="whitespace-pre-line text-slate-700">{quote.notes}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-12 pt-8 avoid-break">
        <div className="text-center">
          <div className="border-b border-slate-800 pb-6" />
          <div className="pt-1.5 font-semibold">Prepared By ({COMPANY_NAME} Representative)</div>
        </div>
        <div className="text-center">
          <div className="border-b border-slate-800 pb-6" />
          <div className="pt-1.5 font-semibold">Client Conforme (Signature over Printed Name)</div>
        </div>
      </div>
    </div>
  );
}

function BorrowersSlipDocument({ rental, brand }: { rental: Rental; brand: BrandHeader }) {
  return (
    <div>
      <OncueFormHeader formCode="FORM Oncue KR - 2026 0004 — EQUIPMENT BORROWERS SLIP" subtitle="BORROWERS SLIP" brand={brand} />

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">1. BORROWER & EVENT INFORMATION</div>
      <div className="mb-4 grid grid-cols-3 border border-slate-300 divide-x divide-slate-300 bg-[#fefce8] avoid-break">
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Slip No.:</span> <span className="font-mono">{rental.slipNo}</span></div>
          <div><span className="font-semibold">Borrower's Name:</span> {rental.borrowerName}</div>
          <div><span className="font-semibold">Venue / Location:</span> {rental.venue || '—'}</div>
        </div>
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Date Issued:</span> {formatDate(rental.dateIssued)}</div>
          <div><span className="font-semibold">Organization / Client:</span> {rental.organization || '—'}</div>
          <div><span className="font-semibold">Date & Time Out:</span> {formatDate(rental.dateOut)}</div>
        </div>
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Contact No.:</span> {rental.contactNo || '—'}</div>
          <div><span className="font-semibold">Event / Purpose:</span> {rental.eventPurpose || '—'}</div>
          <div><span className="font-semibold">Expected Return:</span> {formatDate(rental.expectedReturn)}</div>
        </div>
      </div>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">2. EQUIPMENT LIST</div>
      <table className="mb-0 w-full border-collapse border border-slate-300">
        <thead>
          <tr className="bg-[#162b49] text-white text-left">
            <th className="border border-slate-300 px-2 py-1.5 w-10 text-center">No.</th>
            <th className="border border-slate-300 px-2 py-1.5 w-32">Inventory Code</th>
            <th className="border border-slate-300 px-2 py-1.5">Equipment / Description</th>
            <th className="border border-slate-300 px-2 py-1.5 w-14 text-right">Qty</th>
            <th className="border border-slate-300 px-2 py-1.5 w-24 text-right">Rate /Day (₱)</th>
            <th className="border border-slate-300 px-2 py-1.5 w-14 text-right">Days</th>
            <th className="border border-slate-300 px-2 py-1.5 w-28 text-right">Rental Amount (₱)</th>
            <th className="border border-slate-300 px-2 py-1.5">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rental.items.map((item, idx) => (
            <tr key={`${item.inventoryCode}-${idx}`} className="bg-[#fefce8]">
              <td className="border border-slate-300 px-2 py-1 text-center font-mono">{idx + 1}</td>
              <td className="border border-slate-300 px-2 py-1 font-mono">{item.inventoryCode}</td>
              <td className="border border-slate-300 px-2 py-1">{item.equipmentName}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{item.quantity}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{formatPeso(item.rentalRate)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{item.days}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{formatPeso(item.amount)}</td>
              <td className="border border-slate-300 px-2 py-1">{item.remarks}</td>
            </tr>
          ))}
          <tr className="bg-[#d4a017] font-bold">
            <td colSpan={6} className="border border-slate-300 px-2 py-1.5 text-right">TOTAL RENTAL AMOUNT</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(rental.totalRentalAmount)}</td>
            <td className="border border-slate-300 px-2 py-1.5" />
          </tr>
        </tbody>
      </table>
      <div className="mb-4 grid grid-cols-3 border-x border-b border-slate-300 bg-slate-100 px-3 py-1.5 font-semibold avoid-break">
        <div>Days Overall: <span className="font-mono">{rental.daysOverall}</span></div>
        <div>Paid / Deposit (₱): <span className="font-mono tabular-nums">{formatPeso(rental.amountPaid)}</span></div>
        <div className="text-right">Balance Due (₱): <span className="font-mono tabular-nums">{formatPeso(rental.balanceDue)}</span></div>
      </div>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white avoid-break">3. CONDITION CHECK & ACCOUNTABILITY</div>
      <div className="mb-6 space-y-2 border border-slate-300 p-3 avoid-break">
        <div>
          <span className="font-semibold">Condition upon release:</span>{' '}
          {rental.conditionUponRelease === 'Good' ? '☑ Good   ☐ With existing damage' : `☐ Good   ☑ With existing damage (${rental.conditionUponRelease})`}
        </div>
        <div>
          <span className="font-semibold">Condition upon return:</span>{' '}
          {rental.conditionUponReturn ? rental.conditionUponReturn : '☐ Good   ☐ Damaged / Incomplete (describe): ________________________'}
        </div>
        <p className="italic text-slate-700 pt-1">
          I acknowledge receipt of the equipment listed above and agree to return it on the stated date in the same condition,
          except for normal wear and tear. I accept responsibility for loss, damage, or missing accessories while in my custody.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-8 pt-6 avoid-break">
        <div>
          <div className="font-semibold mb-8">Released By:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{rental.releasedBy || `${COMPANY_NAME} Staff`}</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Borrower's Signature:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{rental.borrowerName}</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Received / Checked By:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{rental.inspectedBy || 'Warehouse Checker'}</div>
        </div>
      </div>
    </div>
  );
}

function DeliveryReceiptDocument({ rental, brand }: { rental: Rental; brand: BrandHeader }) {
  const totalQty = rental.items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <div>
      <OncueFormHeader formCode="FORM Oncue KR - 2026 0005" subtitle="DELIVERY RECEIPT" brand={brand} />

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">1. DELIVERY INFORMATION</div>
      <div className="mb-4 grid grid-cols-3 border border-slate-300 divide-x divide-slate-300 bg-[#fefce8] avoid-break">
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">DR No.:</span> <span className="font-mono">{rental.drNo}</span></div>
          <div><span className="font-semibold">Received By:</span> {rental.borrowerName}</div>
          <div><span className="font-semibold">Delivery Address / Venue:</span> {rental.venue || '—'}</div>
        </div>
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Date Delivered:</span> {formatDate(rental.dateOut)}</div>
          <div><span className="font-semibold">Client / Organization:</span> {rental.organization || '—'}</div>
          <div><span className="font-semibold">Delivery Personnel:</span> {rental.deliveryPersonnel || '—'}</div>
        </div>
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Contact No.:</span> {rental.contactNo || '—'}</div>
          <div><span className="font-semibold">Event:</span> {rental.eventPurpose || '—'}</div>
          <div><span className="font-semibold">Vehicle / Driver:</span> {rental.vehicleDriver || '—'}</div>
        </div>
      </div>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">2. DELIVERED EQUIPMENT</div>
      <table className="mb-4 w-full border-collapse border border-slate-300">
        <thead>
          <tr className="bg-[#162b49] text-white text-left">
            <th className="border border-slate-300 px-2 py-1.5 w-10 text-center">No.</th>
            <th className="border border-slate-300 px-2 py-1.5 w-32">Item Code</th>
            <th className="border border-slate-300 px-2 py-1.5">Equipment / Description</th>
            <th className="border border-slate-300 px-2 py-1.5 w-16 text-right">Quantity</th>
            <th className="border border-slate-300 px-2 py-1.5">Condition / Details</th>
            <th className="border border-slate-300 px-2 py-1.5">Accessories</th>
            <th className="border border-slate-300 px-2 py-1.5">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rental.items.map((item, idx) => (
            <tr key={`${item.inventoryCode}-${idx}`} className="bg-[#fefce8]">
              <td className="border border-slate-300 px-2 py-1 text-center font-mono">{idx + 1}</td>
              <td className="border border-slate-300 px-2 py-1 font-mono">{item.inventoryCode}</td>
              <td className="border border-slate-300 px-2 py-1">{item.equipmentName}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{item.quantity}</td>
              <td className="border border-slate-300 px-2 py-1">{item.conditionOut || 'Good'}</td>
              <td className="border border-slate-300 px-2 py-1">{item.accessories || 'Standard cables/cases'}</td>
              <td className="border border-slate-300 px-2 py-1">{item.remarks}</td>
            </tr>
          ))}
          <tr className="bg-[#d4a017] font-bold">
            <td colSpan={3} className="border border-slate-300 px-2 py-1.5 text-right">TOTAL ITEMS DELIVERED</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{totalQty}</td>
            <td colSpan={3} className="border border-slate-300 px-2 py-1.5" />
          </tr>
        </tbody>
      </table>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white avoid-break">3. DELIVERY CONFIRMATION</div>
      <div className="border border-slate-300 bg-slate-50 p-4 space-y-6 avoid-break">
        <p>I acknowledge receipt of the equipment listed above, subject to the condition and quantity recorded on this receipt.</p>
        <div className="grid grid-cols-3 gap-8 pt-6">
          <div>
            <div className="font-semibold mb-8">Delivered By:</div>
            <div className="border-t border-slate-800 pt-1">Fullname & Signature</div>
          </div>
          <div>
            <div className="font-semibold mb-8">Received By:</div>
            <div className="border-t border-slate-800 pt-1">Fullname & Signature</div>
          </div>
          <div>
            <div className="font-semibold mb-8">Authorized By:</div>
            <div className="border-t border-slate-800 pt-1">{COMPANY_NAME} Management</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReturnInspectionDocument({ rental, brand }: { rental: Rental; brand: BrandHeader }) {
  const totalReleased = rental.items.reduce((s, i) => s + i.quantity, 0);
  const totalReturned = rental.items.reduce((s, i) => s + (i.qtyReturned ?? i.quantity), 0);
  const totalMissing = rental.items.reduce((s, i) => s + (i.missingQty ?? 0), 0);
  const totalCharges = rental.items.reduce((s, i) => s + (i.addCharges ?? 0), 0);

  return (
    <div>
      <OncueFormHeader formCode="FORM Oncue KR - 2026 0006" subtitle="EQUIPMENT RETURN / INSPECTION FORM" brand={brand} />

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">1. RETURN INFORMATION</div>
      <div className="mb-4 grid grid-cols-3 border border-slate-300 divide-x divide-slate-300 bg-[#fefce8] avoid-break">
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Return No.:</span> <span className="font-mono">{rental.returnNo || 'PENDING'}</span></div>
          <div><span className="font-semibold">Borrower / Client:</span> {rental.borrowerName}</div>
          <div><span className="font-semibold">Event / Venue:</span> {rental.eventPurpose} ({rental.venue})</div>
        </div>
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Date Returned:</span> {formatDate(rental.returnDate)}</div>
          <div><span className="font-semibold">Related Borrowers Slip:</span> <span className="font-mono">{rental.slipNo}</span></div>
          <div><span className="font-semibold">Inspected By:</span> {rental.inspectedBy || '—'}</div>
        </div>
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Contact No.:</span> {rental.contactNo || '—'}</div>
          <div><span className="font-semibold">Related DR No.:</span> <span className="font-mono">{rental.drNo}</span></div>
          <div><span className="font-semibold">Inspection Result:</span> {rental.inspectionResult || 'Pending'}</div>
        </div>
      </div>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">2. RETURNED EQUIPMENT & INSPECTION</div>
      <table className="mb-4 w-full border-collapse border border-slate-300">
        <thead>
          <tr className="bg-[#162b49] text-white text-left">
            <th className="border border-slate-300 px-2 py-1.5 w-10 text-center">No.</th>
            <th className="border border-slate-300 px-2 py-1.5 w-28">Item Code</th>
            <th className="border border-slate-300 px-2 py-1.5">Equipment / Description</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Released</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Returned</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Missing</th>
            <th className="border border-slate-300 px-2 py-1.5">Damages / Defects</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Add. Charges (₱)</th>
          </tr>
        </thead>
        <tbody>
          {rental.items.map((item, idx) => (
            <tr key={`${item.inventoryCode}-${idx}`} className="bg-[#fefce8]">
              <td className="border border-slate-300 px-2 py-1 text-center font-mono">{idx + 1}</td>
              <td className="border border-slate-300 px-2 py-1 font-mono">{item.inventoryCode}</td>
              <td className="border border-slate-300 px-2 py-1">{item.equipmentName}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{item.quantity}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{item.qtyReturned ?? 0}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{item.missingQty ?? 0}</td>
              <td className="border border-slate-300 px-2 py-1">{item.damages || 'None'}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{formatPeso(item.addCharges ?? 0)}</td>
            </tr>
          ))}
          <tr className="bg-[#d4a017] font-bold">
            <td colSpan={3} className="border border-slate-300 px-2 py-1.5 text-right">TOTALS</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{totalReleased}</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{totalReturned}</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{totalMissing}</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right">Total Add. Charges:</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(totalCharges)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white avoid-break">3. RETURN INSPECTION</div>
      <div className="border border-slate-300 p-3 space-y-2 mb-6 avoid-break">
        <div><span className="font-semibold">Inspection Result:</span> {rental.inspectionResult}</div>
        <div><span className="font-semibold">Condition / Notes:</span> {rental.conditionUponReturn || 'All items inspected.'}</div>
      </div>

      <div className="grid grid-cols-3 gap-8 pt-6 avoid-break">
        <div>
          <div className="font-semibold mb-8">Inspected / Received By:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{rental.inspectedBy || 'Inspector'}</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Returned By / Client:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{rental.borrowerName}</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Authorized By:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{COMPANY_NAME} Management</div>
        </div>
      </div>
    </div>
  );
}

function PaymentReceiptDocument({ payment, brand }: { payment: Payment; brand: BrandHeader }) {
  return (
    <div>
      <OncueFormHeader formCode="FORM Oncue KR - 2026 0007" subtitle="PAYMENT FORM / OFFICIAL PAYMENT ACKNOWLEDGMENT" brand={brand} />

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">1. PAYMENT INFORMATION</div>
      <div className="mb-4 grid grid-cols-3 border border-slate-300 divide-x divide-slate-300 bg-[#fefce8] avoid-break">
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Receipt No.:</span> <span className="font-mono">{payment.receiptNo}</span></div>
          <div><span className="font-semibold">Received From:</span> {payment.receivedFrom}</div>
          <div><span className="font-semibold">Event / Purpose:</span> {payment.eventPurpose || '—'}</div>
        </div>
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Date of Payment:</span> {formatDate(payment.paymentDate)}</div>
          <div><span className="font-semibold">Client / Org:</span> {payment.organization || '—'}</div>
          <div><span className="font-semibold">Related Slip No.:</span> <span className="font-mono">{payment.slipNo || '—'}</span></div>
        </div>
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Contact No.:</span> {payment.contactNo || '—'}</div>
          <div><span className="font-semibold">Payment Method:</span> {payment.paymentMethod}</div>
          <div><span className="font-semibold">Payment Status:</span> {payment.paymentStatus}</div>
        </div>
      </div>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">2. PAYMENT BREAKDOWN</div>
      <table className="mb-4 w-full border-collapse border border-slate-300">
        <thead>
          <tr className="bg-[#162b49] text-white text-left">
            <th className="border border-slate-300 px-2 py-1.5">Description</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Amount (₱)</th>
            <th className="border border-slate-300 px-2 py-1.5">Description</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Amount (₱)</th>
            <th className="border border-slate-300 px-2 py-1.5">Reference No.</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-[#fefce8]">
            <td className="border border-slate-300 px-2 py-1.5">Rental Charges</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(payment.rentalCharges)}</td>
            <td className="border border-slate-300 px-2 py-1.5">Delivery Charges</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(payment.deliveryCharges)}</td>
            <td className="border border-slate-300 px-2 py-1.5 font-mono">{payment.referenceNo || '—'}</td>
          </tr>
          <tr className="bg-[#fefce8]">
            <td className="border border-slate-300 px-2 py-1.5">Additional Charges</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(payment.additionalCharges)}</td>
            <td className="border border-slate-300 px-2 py-1.5">Discount %</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{payment.discountPercent}%</td>
            <td className="border border-slate-300 px-2 py-1.5">{payment.notes || '—'}</td>
          </tr>
          <tr className="bg-[#d4a017] font-bold">
            <td className="border border-slate-300 px-2 py-1.5">TOTAL DUE (₱)</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(payment.totalAmountDue)}</td>
            <td className="border border-slate-300 px-2 py-1.5">Amount Paid (₱)</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(payment.amountPaid)}</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right">
              Balance: <span className="font-mono tabular-nums">{formatPeso(payment.outstandingBalance)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white avoid-break">3. PAYMENT CONFIRMATION</div>
      <div className="border border-slate-300 p-3 space-y-2 mb-6 avoid-break">
        <div><span className="font-semibold">Amount in words:</span> {payment.amountInWords || numberToWordsPeso(payment.amountPaid)}</div>
        <div><span className="font-semibold">Payment status:</span> {payment.paymentStatus}</div>
      </div>

      <div className="grid grid-cols-3 gap-8 pt-6 avoid-break">
        <div>
          <div className="font-semibold mb-8">Received By / Cashier:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{payment.receivedBy || 'Cashier'}</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Paid By / Client:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{payment.receivedFrom}</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Authorized By:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{payment.authorizedBy || `${COMPANY_NAME} Management`}</div>
        </div>
      </div>
    </div>
  );
}

function MaintenanceDocument({ slip, brand }: { slip: MaintenanceSlip; brand: BrandHeader }) {
  return (
    <div>
      <OncueFormHeader formCode="FORM Oncue KR - 2026 0002" subtitle="REPAIR & MAINTENANCE REQUEST SLIP" brand={brand} />
      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">1. REQUEST DETAILS</div>
      <div className="mb-4 grid grid-cols-3 border border-slate-300 divide-x divide-slate-300 bg-[#fefce8] p-2 avoid-break">
        <div className="space-y-1 pr-2">
          <div><span className="font-semibold">Slip No.:</span> <span className="font-mono">{slip.slipNo}</span></div>
          <div><span className="font-semibold">Requested By:</span> {slip.requestedBy}</div>
          <div><span className="font-semibold">Repair Type:</span> {slip.repairType}</div>
        </div>
        <div className="space-y-1 px-2">
          <div><span className="font-semibold">Date Requested:</span> {formatDate(slip.dateRequested)}</div>
          <div><span className="font-semibold">Department:</span> {slip.department}</div>
          <div><span className="font-semibold">Priority:</span> {slip.priorityLevel}</div>
        </div>
        <div className="space-y-1 pl-2">
          <div><span className="font-semibold">Required By:</span> {formatDate(slip.requiredBy)}</div>
          <div><span className="font-semibold">Contact No.:</span> {slip.contactNo || '—'}</div>
          <div><span className="font-semibold">Status:</span> {slip.status}</div>
        </div>
      </div>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">2. EQUIPMENT INFORMATION</div>
      <div className="mb-4 grid grid-cols-2 border border-slate-300 divide-x divide-slate-300 bg-[#fefce8] p-2 avoid-break">
        <div className="space-y-1 pr-2">
          <div><span className="font-semibold">Inventory Code:</span> <span className="font-mono">{slip.inventoryCode}</span></div>
          <div><span className="font-semibold">Brand / Model:</span> {slip.brandModel || '—'}</div>
        </div>
        <div className="space-y-1 pl-2">
          <div><span className="font-semibold">Equipment Name:</span> {slip.equipmentName}</div>
          <div><span className="font-semibold">Location Storage:</span> {slip.locationStorage || '—'}</div>
        </div>
      </div>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">3. PROBLEM & REPAIR WORK RECORD</div>
      <div className="mb-6 border border-slate-300 p-3 space-y-2 bg-[#fefce8] avoid-break">
        <div><span className="font-semibold">Reported Problem:</span> {slip.reportedProblem}</div>
        <div><span className="font-semibold">Proposed Repair:</span> {slip.proposedRepair || '—'}</div>
        <div><span className="font-semibold">Out of Service:</span> {slip.safetyOutOfService ? 'YES — Locked from POS Rental' : 'NO'}</div>
        <div><span className="font-semibold">Work Performed:</span> {slip.workPerformed || 'Pending technician sign-off'}</div>
        <div className="grid grid-cols-4 pt-2 border-t border-slate-300 font-mono tabular-nums">
          <div>Est. Parts: {formatPeso(slip.estimatedPartsCost)}</div>
          <div>Labor: {formatPeso(slip.laborCost)}</div>
          <div>Other: {formatPeso(slip.otherCost)}</div>
          <div className="font-bold">Total: {formatPeso(slip.actualTotalCost)}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-8 pt-6 avoid-break">
        <div>
          <div className="font-semibold mb-8">Requested By:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{slip.requestedBy}</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Technician:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{slip.technician || 'Assigned Tech'}</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Approved By:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{COMPANY_NAME} Operations</div>
        </div>
      </div>
    </div>
  );
}

function BudgetDocument({ budget, brand }: { budget: BudgetRequest; brand: BrandHeader }) {
  return (
    <div>
      <OncueFormHeader formCode="FORM Oncue KR - 2026 0003" subtitle="BUDGET REQUEST SLIP" brand={brand} />
      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">1. REQUEST & EVENT INFORMATION</div>
      <div className="mb-4 grid grid-cols-3 border border-slate-300 divide-x divide-slate-300 bg-[#fefce8] p-2 avoid-break">
        <div className="space-y-1 pr-2">
          <div><span className="font-semibold">Budget No.:</span> <span className="font-mono">{budget.budgetNo}</span></div>
          <div><span className="font-semibold">Requested By:</span> {budget.requestedBy}</div>
          <div><span className="font-semibold">Event / Project:</span> {budget.eventName || '—'}</div>
        </div>
        <div className="space-y-1 px-2">
          <div><span className="font-semibold">Date Requested:</span> {formatDate(budget.dateRequested)}</div>
          <div><span className="font-semibold">Department:</span> {budget.department}</div>
          <div><span className="font-semibold">Venue:</span> {budget.venue || '—'}</div>
        </div>
        <div className="space-y-1 pl-2">
          <div><span className="font-semibold">Required Date:</span> {formatDate(budget.requiredDate)}</div>
          <div><span className="font-semibold">Category:</span> {budget.expenseCategory}</div>
          <div><span className="font-semibold">Status:</span> {budget.status}</div>
        </div>
      </div>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">2. REQUESTED BUDGET BREAKDOWN</div>
      <table className="mb-4 w-full border-collapse border border-slate-300">
        <thead>
          <tr className="bg-[#162b49] text-white text-left">
            <th className="border border-slate-300 px-2 py-1.5">No.</th>
            <th className="border border-slate-300 px-2 py-1.5">Code</th>
            <th className="border border-slate-300 px-2 py-1.5">Description</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Qty</th>
            <th className="border border-slate-300 px-2 py-1.5">Unit</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Est. Unit Cost</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Est. Amount</th>
          </tr>
        </thead>
        <tbody>
          {budget.items.map((it, idx) => (
            <tr key={idx} className="bg-[#fefce8]">
              <td className="border border-slate-300 px-2 py-1 text-center font-mono">{idx + 1}</td>
              <td className="border border-slate-300 px-2 py-1 font-mono">{it.code}</td>
              <td className="border border-slate-300 px-2 py-1">{it.description}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{it.qty}</td>
              <td className="border border-slate-300 px-2 py-1">{it.unit}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{formatPeso(it.estUnitCost)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{formatPeso(it.estAmount)}</td>
            </tr>
          ))}
          <tr className="bg-[#d4a017] font-bold">
            <td colSpan={6} className="border border-slate-300 px-2 py-1.5 text-right">TOTAL ESTIMATED BUDGET</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(budget.requestedBudget)}</td>
          </tr>
        </tbody>
      </table>

      <div className="grid grid-cols-3 gap-8 pt-6 avoid-break">
        <div>
          <div className="font-semibold mb-8">Requested By:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{budget.requestedBy}</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Checked By (Finance):</div>
          <div className="border-t border-slate-800 pt-1 text-center">{COMPANY_NAME} Finance</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Approved By:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{COMPANY_NAME} Management</div>
        </div>
      </div>
    </div>
  );
}

function InventoryDocument({
  items,
  categoryLabel,
  brand,
}: {
  items: InventoryItem[];
  categoryLabel: string;
  brand: BrandHeader;
}) {
  const totalHand = items.reduce((s, i) => s + i.qtyOnHand, 0);
  const totalAvail = items.reduce((s, i) => s + i.qtyAvailable, 0);

  return (
    <div>
      <OncueFormHeader formCode="FORM Oncue KR - 2026 0001" subtitle={`MASTER INVENTORY — ${categoryLabel}`} brand={brand} />
      <div className="mb-3 flex justify-between text-[11px] bg-[#fde68a] border border-slate-300 px-3 py-1.5 font-semibold">
        <span>Code Format: [CATEGORY]-[CLASSIFICATION]-[####]</span>
        <span>Generated: {formatDate(new Date().toISOString())}</span>
        <span className="font-mono tabular-nums">{items.length} SKUs · {totalAvail}/{totalHand} Avail</span>
      </div>

      <table className="mb-6 w-full border-collapse border border-slate-300 text-[10px]">
        <thead>
          <tr className="bg-[#162b49] text-white text-left">
            <th className="border border-slate-300 px-1.5 py-1.5">Inventory Code</th>
            <th className="border border-slate-300 px-1.5 py-1.5">Category</th>
            <th className="border border-slate-300 px-1.5 py-1.5">Equipment Name / Description</th>
            <th className="border border-slate-300 px-1.5 py-1.5">Brand</th>
            <th className="border border-slate-300 px-1.5 py-1.5">Placement</th>
            <th className="border border-slate-300 px-1.5 py-1.5">Location</th>
            <th className="border border-slate-300 px-1.5 py-1.5 text-right">Avail/Hand</th>
            <th className="border border-slate-300 px-1.5 py-1.5 text-right">Rate/Day (₱)</th>
            <th className="border border-slate-300 px-1.5 py-1.5">Cond.</th>
            <th className="border border-slate-300 px-1.5 py-1.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.code}>
              <td className="border border-slate-300 px-1.5 py-1 font-mono font-semibold">{it.code}</td>
              <td className="border border-slate-300 px-1.5 py-1">{it.categoryName}</td>
              <td className="border border-slate-300 px-1.5 py-1">{it.name}</td>
              <td className="border border-slate-300 px-1.5 py-1">{it.brand}</td>
              <td className="border border-slate-300 px-1.5 py-1">{it.placement}</td>
              <td className="border border-slate-300 px-1.5 py-1">{it.location}</td>
              <td className="border border-slate-300 px-1.5 py-1 text-right font-mono tabular-nums">
                {it.qtyAvailable}/{it.qtyOnHand}
              </td>
              <td className="border border-slate-300 px-1.5 py-1 text-right font-mono tabular-nums">
                {formatPeso(it.rentalRate)}
              </td>
              <td className="border border-slate-300 px-1.5 py-1">{it.condition}</td>
              <td
                className={`border border-slate-300 px-1.5 py-1 font-bold ${
                  it.status === 'AVAILABLE'
                    ? 'bg-[#15803d] text-white'
                    : it.status === 'MAINTENANCE'
                      ? 'bg-[#b91c1c] text-white'
                      : 'bg-[#d97706] text-white'
                }`}
              >
                {it.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid grid-cols-2 gap-12 pt-4 avoid-break">
        <div className="text-center">
          <div className="border-b border-slate-800 pb-6" />
          <div className="pt-1 font-semibold">Inventory Checked By (Warehouse Custodian)</div>
        </div>
        <div className="text-center">
          <div className="border-b border-slate-800 pb-6" />
          <div className="pt-1 font-semibold">Verified By ({COMPANY_NAME} Operations)</div>
        </div>
      </div>
    </div>
  );
}

function ClientLedgerDocument({
  client,
  quotes,
  rentals,
  brand,
}: {
  client: Client;
  quotes: Quote[];
  rentals: Rental[];
  brand: BrandHeader;
}) {
  const totalBilled = rentals.reduce((s, r) => s + r.totalRentalAmount, 0);
  const totalPaid = rentals.reduce((s, r) => s + r.amountPaid, 0);
  const totalBalance = rentals.reduce((s, r) => s + r.balanceDue, 0);

  return (
    <div>
      <OncueFormHeader formCode={`${brand.name} CLIENT STATEMENT`} subtitle="CLIENT ACCOUNT & RENTAL DOCUMENTATION" brand={brand} />

      <div className="mb-4 grid grid-cols-2 border border-slate-300 divide-x divide-slate-300 bg-[#fefce8] p-2.5 avoid-break">
        <div className="space-y-1 pr-3">
          <div><span className="font-semibold">Client Name:</span> {client.name}</div>
          <div><span className="font-semibold">Organization:</span> {client.organization || '—'}</div>
          <div><span className="font-semibold">Address:</span> {client.address || '—'}</div>
        </div>
        <div className="space-y-1 pl-3">
          <div><span className="font-semibold">Contact No.:</span> {client.contactNo || '—'}</div>
          <div><span className="font-semibold">Email:</span> {client.email || '—'}</div>
          <div><span className="font-semibold">Statement Date:</span> {formatDate(new Date().toISOString())}</div>
        </div>
      </div>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">RENTAL SLIPS SUMMARY</div>
      <table className="mb-4 w-full border-collapse border border-slate-300">
        <thead>
          <tr className="bg-[#162b49] text-white text-left">
            <th className="border border-slate-300 px-2 py-1.5">Slip No.</th>
            <th className="border border-slate-300 px-2 py-1.5">Event / Venue</th>
            <th className="border border-slate-300 px-2 py-1.5">Date Out</th>
            <th className="border border-slate-300 px-2 py-1.5">Status</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Total (₱)</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Paid (₱)</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Balance (₱)</th>
          </tr>
        </thead>
        <tbody>
          {rentals.map((r) => (
            <tr key={r.id} className="bg-[#fefce8]">
              <td className="border border-slate-300 px-2 py-1 font-mono">{r.slipNo}</td>
              <td className="border border-slate-300 px-2 py-1">{r.eventPurpose || r.venue || '—'}</td>
              <td className="border border-slate-300 px-2 py-1 font-mono">{formatDate(r.dateOut)}</td>
              <td className="border border-slate-300 px-2 py-1">{r.status}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{formatPeso(r.totalRentalAmount)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{formatPeso(r.amountPaid)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{formatPeso(r.balanceDue)}</td>
            </tr>
          ))}
          {rentals.length === 0 && (
            <tr>
              <td colSpan={7} className="border border-slate-300 px-2 py-3 text-center text-slate-500">
                No rental slips recorded.
              </td>
            </tr>
          )}
          <tr className="bg-[#d4a017] font-bold">
            <td colSpan={4} className="border border-slate-300 px-2 py-1.5 text-right">ACCOUNT TOTALS</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(totalBilled)}</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(totalPaid)}</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatPeso(totalBalance)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">QUOTATIONS HISTORY ({quotes.length})</div>
      <table className="mb-6 w-full border-collapse border border-slate-300">
        <thead>
          <tr className="bg-[#162b49] text-white text-left">
            <th className="border border-slate-300 px-2 py-1.5">Quote No.</th>
            <th className="border border-slate-300 px-2 py-1.5">Event</th>
            <th className="border border-slate-300 px-2 py-1.5">Event Date</th>
            <th className="border border-slate-300 px-2 py-1.5">Status</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Quoted Amount (₱)</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id} className="bg-[#fefce8]">
              <td className="border border-slate-300 px-2 py-1 font-mono">{q.quoteNo}</td>
              <td className="border border-slate-300 px-2 py-1">{q.eventName || '—'}</td>
              <td className="border border-slate-300 px-2 py-1 font-mono">{formatDate(q.eventDate)}</td>
              <td className="border border-slate-300 px-2 py-1">{q.status}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{formatPeso(q.totalAmount)}</td>
            </tr>
          ))}
          {quotes.length === 0 && (
            <tr>
              <td colSpan={5} className="border border-slate-300 px-2 py-3 text-center text-slate-500">
                No quotations issued.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="border-t border-slate-300 pt-3 flex items-center justify-between text-[11px] text-slate-600 avoid-break">
        <span className="font-semibold text-slate-800">{COMPANY_NAME} — Official Client Account Statement</span>
        <span>Generated {formatDate(new Date().toISOString())}</span>
      </div>
    </div>
  );
}

function AdminReleaseDocument({ rental, brand }: { rental: Rental; brand: BrandHeader }) {
  const totalQty = rental.items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <div>
      <OncueFormHeader
        formCode={`ADMIN INTERNAL DISPATCH — ${rental.slipNo}`}
        subtitle="COMPANY-OWNED EQUIPMENT RELEASE SLIP (NON-BILLABLE / ₱0.00)"
        brand={brand}
      />

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">1. ADMIN & INTERNAL PRODUCTION DETAILS</div>
      <div className="mb-4 grid grid-cols-3 border border-slate-300 divide-x divide-slate-300 bg-[#fefce8] avoid-break">
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Admin Slip No.:</span> <span className="font-mono">{rental.slipNo}</span></div>
          <div><span className="font-semibold">Custodian / Admin:</span> {rental.borrowerName}</div>
          <div><span className="font-semibold">Venue / Deployment:</span> {rental.venue || '—'}</div>
        </div>
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Gate Pass / DR No.:</span> <span className="font-mono">{rental.drNo}</span></div>
          <div><span className="font-semibold">Department / Team:</span> {rental.organization || 'Company Operations'}</div>
          <div><span className="font-semibold">Date Released:</span> {formatDate(rental.dateOut)}</div>
        </div>
        <div className="p-2 space-y-1">
          <div><span className="font-semibold">Usage Classification:</span> <span className="font-bold text-emerald-800">OWN EQUIPMENT (₱0.00)</span></div>
          <div><span className="font-semibold">Internal Event / Purpose:</span> {rental.eventPurpose || '—'}</div>
          <div><span className="font-semibold">Expected Return:</span> {formatDate(rental.expectedReturn)}</div>
        </div>
      </div>

      <div className="mb-1 bg-[#1e3a5f] px-2.5 py-1 font-bold text-white">2. COMPANY-OWNED EQUIPMENT CHECKED OUT</div>
      <table className="mb-0 w-full border-collapse border border-slate-300">
        <thead>
          <tr className="bg-[#162b49] text-white text-left">
            <th className="border border-slate-300 px-2 py-1.5 w-10 text-center">No.</th>
            <th className="border border-slate-300 px-2 py-1.5 w-32">Inventory Code</th>
            <th className="border border-slate-300 px-2 py-1.5">Equipment / Description</th>
            <th className="border border-slate-300 px-2 py-1.5 w-14 text-right">Qty</th>
            <th className="border border-slate-300 px-2 py-1.5">Release Condition</th>
            <th className="border border-slate-300 px-2 py-1.5">Notes / Remarks</th>
          </tr>
        </thead>
        <tbody>
          {rental.items.map((item, idx) => (
            <tr key={`${item.inventoryCode}-${idx}`} className="bg-[#fefce8]">
              <td className="border border-slate-300 px-2 py-1 text-center font-mono">{idx + 1}</td>
              <td className="border border-slate-300 px-2 py-1 font-mono">{item.inventoryCode}</td>
              <td className="border border-slate-300 px-2 py-1">{item.equipmentName}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">{item.quantity}</td>
              <td className="border border-slate-300 px-2 py-1">{item.conditionOut || 'Good'}</td>
              <td className="border border-slate-300 px-2 py-1">{item.remarks || 'Internal Company Use'}</td>
            </tr>
          ))}
          <tr className="bg-[#d4a017] font-bold">
            <td colSpan={3} className="border border-slate-300 px-2 py-1.5 text-right">TOTAL COMPANY UNITS RELEASED</td>
            <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{totalQty}</td>
            <td colSpan={2} className="border border-slate-300 px-2 py-1.5 text-right">NON-BILLABLE · ₱0.00</td>
          </tr>
        </tbody>
      </table>
      <div className="mb-5 grid grid-cols-3 border-x border-b border-slate-300 bg-slate-100 px-3 py-1.5 font-semibold avoid-break">
        <div>Crew / Personnel: <span className="font-normal">{rental.deliveryPersonnel || '—'}</span></div>
        <div>Vehicle / Driver: <span className="font-normal">{rental.vehicleDriver || '—'}</span></div>
        <div className="text-right">Status: <span className="font-mono">{rental.status}</span></div>
      </div>

      <div className="grid grid-cols-3 gap-8 pt-6 avoid-break">
        <div>
          <div className="font-semibold mb-8">Released By (Warehouse):</div>
          <div className="border-t border-slate-800 pt-1 text-center">{rental.releasedBy || `${COMPANY_NAME} Staff`}</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Custodian / Crew In-Charge:</div>
          <div className="border-t border-slate-800 pt-1 text-center">{rental.borrowerName}</div>
        </div>
        <div>
          <div className="font-semibold mb-8">Approved By (Admin):</div>
          <div className="border-t border-slate-800 pt-1 text-center">{COMPANY_NAME} Management</div>
        </div>
      </div>
    </div>
  );
}
