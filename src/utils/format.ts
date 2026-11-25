export function formatPeso(amount: number): string {
  return `₱${Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function statusColorClass(status: string): string {
  switch (status) {
    case 'AVAILABLE':
    case 'APPROVED':
    case 'COMPLETED':
    case 'RETURNED':
    case 'Paid in Full':
    case 'LIQUIDATED':
      return 'text-emerald-700';
    case 'RESERVED':
    case 'SENT':
    case 'IN_PROGRESS':
    case 'PARTIAL_RETURN':
    case 'Partial Payment':
    case 'PENDING':
      return 'text-amber-700';
    case 'RENTED':
    case 'DISPATCHED':
    case 'CONVERTED':
    case 'RELEASED':
      return 'text-sky-700';
    case 'MAINTENANCE':
    case 'CANCELLED':
    case 'OPEN':
    case 'Pending':
      return 'text-red-700';
    default:
      return 'text-slate-600';
  }
}

export function numberToWordsPeso(amount: number): string {
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  if (whole === 0) return `Zero Pesos${cents > 0 ? ` and ${cents}/100` : ' Only'}`;

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = [
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertHundreds = (n: number): string => {
    let str = '';
    if (n >= 100) {
      str += `${ones[Math.floor(n / 100)]} Hundred `;
      n %= 100;
    }
    if (n >= 20) {
      str += `${tens[Math.floor(n / 10)]} `;
      n %= 10;
    } else if (n >= 10) {
      str += `${teens[n - 10]} `;
      return str.trim();
    }
    if (n > 0) {
      str += `${ones[n]} `;
    }
    return str.trim();
  };

  const scales = ['', 'Thousand', 'Million', 'Billion'];
  let n = whole;
  let scaleIdx = 0;
  const parts: string[] = [];
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) {
      const words = convertHundreds(chunk);
      parts.unshift(scales[scaleIdx] ? `${words} ${scales[scaleIdx]}` : words);
    }
    n = Math.floor(n / 1000);
    scaleIdx++;
  }
  const base = `${parts.join(' ')} Pesos`;
  return cents > 0 ? `${base} and ${String(cents).padStart(2, '0')}/100` : `${base} Only`;
}
