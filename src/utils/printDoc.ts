import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { PrintablePayload } from '../components/PrintableFormModal';

export type PaperFormat = 'standard' | 'thermal80';

export function getPrintableTitle(payload: PrintablePayload): string {
  switch (payload.kind) {
    case 'quote':
      return `KREC_Quotation_${payload.data.quoteNo}`;
    case 'borrowers':
      return `KREC_FORM-0004_Borrowers-Slip_${payload.data.slipNo}`;
    case 'adminRelease':
      return `KREC_ADMIN_Own-Gear-Release_${payload.data.slipNo}`;
    case 'delivery':
      return `KREC_FORM-0005_Delivery-Receipt_${payload.data.drNo}`;
    case 'return':
      return `KREC_FORM-0006_Return-Inspection_${payload.data.returnNo || payload.data.slipNo}`;
    case 'payment':
      return `KREC_FORM-0007_Payment_${payload.data.receiptNo}`;
    case 'maintenance':
      return `KREC_FORM-0002_Maintenance_${payload.data.slipNo}`;
    case 'budget':
      return `KREC_FORM-0003_Budget_${payload.data.budgetNo}`;
    case 'inventory':
      return `KREC_FORM-0001_Master-Inventory_${new Date().toISOString().slice(0, 10)}`;
    case 'clientLedger':
      return `KREC_Client-Statement_${payload.data.client.name.replace(/\s+/g, '-')}`;
  }
}

function collectStylesHtml(): string {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules || []);
      parts.push(`<style>${rules.map((r) => r.cssText).join('\n')}</style>`);
    } catch {
      if (sheet.href) {
        parts.push(`<link rel="stylesheet" href="${sheet.href}" />`);
      }
    }
  }
  return parts.join('\n');
}

function buildStandaloneHtml(
  contentHtml: string,
  title: string,
  paperFormat: PaperFormat,
  includeToolbar = false
): string {
  const styles = collectStylesHtml();
  const pageCss =
    paperFormat === 'thermal80'
      ? `@page { size: 80mm auto; margin: 3mm; } body { width: 74mm; margin: 0 auto; }`
      : `@page { size: A4 portrait; margin: 10mm; } body { margin: 0; }`;

  const toolbarHtml = includeToolbar
    ? `<div class="no-print" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#f1f5f9;border-bottom:1px solid #cbd5e1;font-family:sans-serif;font-size:12px;">
        <strong>${title}</strong>
        <button onclick="window.print()" style="background:#0f172a;color:#fff;border:none;padding:8px 14px;font-weight:600;cursor:pointer;">Print / Save PDF</button>
      </div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <base href="${window.location.origin}/" />
  <title>${title}</title>
  ${styles}
  <style>
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      background: #ffffff !important;
      color: #0f172a;
    }
    ${pageCss}
    tr, .avoid-break {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    @media print {
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  ${toolbarHtml}
  <div style="padding:${paperFormat === 'thermal80' ? '4px' : '16px'};">
    ${contentHtml}
  </div>
</body>
</html>`;
}

async function waitForElementAssets(element: HTMLElement): Promise<void> {
  if (document.fonts?.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 1200)),
      ]);
    } catch {
      // ignore font loading timeout
    }
  }
  const images = Array.from(element.querySelectorAll('img'));
  const pending = images.filter((img) => !img.complete);
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          })
      )
    ),
    new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
  ]);
}

export async function downloadDocumentPdf(
  element: HTMLElement | null,
  title: string,
  paperFormat: PaperFormat
): Promise<void> {
  if (!element) {
    throw new Error('Document preview is not ready to export');
  }

  await waitForElementAssets(element);

  const width = Math.max(element.scrollWidth, element.offsetWidth);
  const height = Math.max(element.scrollHeight, element.offsetHeight);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await toCanvas(element, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      width,
      height,
      cacheBust: false,
      style: {
        margin: '0',
      },
    });
  } catch {
    // Retry skipping external font embedding in case offline/CORS blocks a stylesheet
    canvas = await toCanvas(element, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      width,
      height,
      skipFonts: true,
      cacheBust: false,
      style: {
        margin: '0',
      },
    });
  }

  if (paperFormat === 'thermal80') {
    const contentWidthMm = 74;
    const marginX = 3;
    const marginY = 4;
    const scaledHeightMm = (canvas.height / canvas.width) * contentWidthMm;
    const pageHeightMm = Math.max(100, Math.ceil(scaledHeightMm + marginY * 2));

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, pageHeightMm],
      compress: true,
    });
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', marginX, marginY, contentWidthMm, scaledHeightMm, undefined, 'FAST');
    pdf.save(`${title}.pdf`);
    return;
  }

  // Standard A4 Portrait with clean multi-page slicing
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const marginMm = 10;
  const contentWidthMm = pageWidthMm - marginMm * 2; // 190mm
  const contentHeightMm = pageHeightMm - marginMm * 2; // 277mm

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const totalScaledHeightMm = (canvas.height / canvas.width) * contentWidthMm;

  if (totalScaledHeightMm <= contentHeightMm + 0.5) {
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(
      imgData,
      'PNG',
      marginMm,
      marginMm,
      contentWidthMm,
      Math.min(contentHeightMm, totalScaledHeightMm),
      undefined,
      'FAST'
    );
    pdf.save(`${title}.pdf`);
    return;
  }

  const pxPerPage = Math.max(100, Math.floor((contentHeightMm / contentWidthMm) * canvas.width));
  let offsetPx = 0;
  let pageIndex = 0;

  while (offsetPx < canvas.height) {
    const sliceHeightPx = Math.min(pxPerPage, canvas.height - offsetPx);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeightPx;
    const ctx = sliceCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        offsetPx,
        canvas.width,
        sliceHeightPx,
        0,
        0,
        canvas.width,
        sliceHeightPx
      );
    }

    if (pageIndex > 0) {
      pdf.addPage();
    }
    const sliceHeightMm = (sliceHeightPx / canvas.width) * contentWidthMm;
    const sliceData = sliceCanvas.toDataURL('image/png');
    pdf.addImage(sliceData, 'PNG', marginMm, marginMm, contentWidthMm, sliceHeightMm, undefined, 'FAST');

    offsetPx += sliceHeightPx;
    pageIndex += 1;
  }

  pdf.save(`${title}.pdf`);
}

export function printDocumentElement(
  element: HTMLElement | null,
  title: string,
  paperFormat: PaperFormat
): void {
  if (!element) {
    window.print();
    return;
  }

  const prevTitle = document.title;
  document.title = title;

  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      document.body.removeChild(iframe);
      window.print();
      document.title = prevTitle;
      return;
    }

    doc.open();
    doc.write(buildStandaloneHtml(element.innerHTML, title, paperFormat, false));
    doc.close();

    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.print();
      } finally {
        window.setTimeout(() => {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          document.title = prevTitle;
        }, 1500);
      }
    };

    // Wait for all document images (including official company logo) to finish loading before invoking print
    const images = Array.from(doc.images || []);
    const pending = images.filter((img) => !img.complete);
    if (pending.length === 0) {
      window.setTimeout(triggerPrint, 250);
    } else {
      let remaining = pending.length;
      const onDone = () => {
        remaining -= 1;
        if (remaining <= 0) {
          window.setTimeout(triggerPrint, 120);
        }
      };
      pending.forEach((img) => {
        img.addEventListener('load', onDone, { once: true });
        img.addEventListener('error', onDone, { once: true });
      });
      // Safety cap so slow network never hangs print dialog
      window.setTimeout(triggerPrint, 1500);
    }
  } catch {
    window.print();
    document.title = prevTitle;
  }
}

export function downloadPrintableHtml(
  element: HTMLElement | null,
  title: string,
  paperFormat: PaperFormat
): void {
  if (!element) return;
  const html = buildStandaloneHtml(element.innerHTML, title, paperFormat, true);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
