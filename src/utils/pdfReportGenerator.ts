import { jsPDF } from 'jspdf';
import {
  AdminState,
  ReportFrequency,
  ReportWeekday,
  ScheduledReportConfig,
} from '../types';
import { buildWhatsAppUrl } from './helpers';

export interface GeneratedPdfReport {
  filename: string;
  periodLabel: string;
  frequency: ReportFrequency;
  blob: Blob;
  base64: string;
  summaryText: string;
  emailSubject: string;
  mailtoHref: string;
  whatsappHref: string | null;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  grossRevenue: number;
  adminCommission: number;
  verifiedUpi: number;
  settledCash: number;
  fleetCodHeld: number;
  download: () => void;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function formatWeekdayLabel(day: ReportWeekday): string {
  return WEEKDAY_NAMES[day] || 'Monday';
}

export function computeNextReportRunAt(
  frequency: ReportFrequency,
  timeOfDay = '09:00',
  weekday: ReportWeekday = 1,
  fromMs: number = Date.now()
): number {
  const [rawH, rawM] = (timeOfDay || '09:00').split(':');
  const hour = Math.min(23, Math.max(0, Number(rawH) || 9));
  const minute = Math.min(59, Math.max(0, Number(rawM) || 0));

  const candidate = new Date(fromMs);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, minute, 0, 0);

  if (frequency === 'DAILY') {
    if (candidate.getTime() <= fromMs) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.getTime();
  }

  // WEEKLY on specific weekday (0 = Sun .. 6 = Sat)
  const currentDay = candidate.getDay();
  let diff = weekday - currentDay;
  if (diff < 0 || (diff === 0 && candidate.getTime() <= fromMs)) {
    diff += 7;
  }
  candidate.setDate(candidate.getDate() + diff);
  return candidate.getTime();
}

function getReportWindow(frequency: ReportFrequency, nowMs: number) {
  const end = new Date(nowMs);
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);

  if (frequency === 'WEEKLY') {
    start.setDate(start.getDate() - 6);
  }

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const periodLabel =
    frequency === 'DAILY'
      ? `Daily Report (${fmt(start)})`
      : `Weekly Report (${fmt(start)} - ${fmt(end)})`;

  return {
    startMs: start.getTime(),
    endMs: nowMs,
    periodLabel,
  };
}

function formatInr(value: number): string {
  return `INR ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function generateExecutivePdfReport(params: {
  state: AdminState;
  config: ScheduledReportConfig;
  adminEmail: string;
  frequencyOverride?: ReportFrequency;
}): GeneratedPdfReport {
  const { state, config, adminEmail, frequencyOverride } = params;
  const nowMs = Date.now();
  const frequency: ReportFrequency =
    frequencyOverride || config.frequency || 'DAILY';
  const commissionPercent = Number(state.settings?.commissionPercent ?? 10);
  const brandName =
    (state.settings?.appBrandName || 'Gossaigaon Bazar').trim() ||
    'Gossaigaon Bazar';

  const { startMs, endMs, periodLabel } = getReportWindow(frequency, nowMs);

  let totalOrders = 0;
  let deliveredOrders = 0;
  let cancelledOrders = 0;
  let grossRevenue = 0;
  let itemsSubtotal = 0;
  let verifiedUpi = 0;
  let codRevenue = 0;

  const storeStats: Record<
    string,
    { name: string; orders: number; sales: number; commission: number }
  > = {};

  const riderTripStats: Record<string, number> = {};

  Object.values(state.orders || {}).forEach((o) => {
    const ts = Number(o.updatedAt || o.createdAt || 0);
    if (!ts || ts < startMs || ts > endMs) return;

    totalOrders += 1;
    const status = String(o.status || '').toUpperCase();
    if (status === 'CANCELLED') {
      cancelledOrders += 1;
      return;
    }

    if (o.paymentMode === 'UPI' && o.paymentStatus === 'VERIFIED') {
      verifiedUpi += Number(o.totalAmount || 0);
    }

    if (status === 'DELIVERED') {
      deliveredOrders += 1;
      const totalAmt = Number(o.totalAmount || 0);
      const subAmt =
        o.subtotalAmount !== undefined ? Number(o.subtotalAmount) : totalAmt;
      grossRevenue += totalAmt;
      itemsSubtotal += subAmt;

      if (o.paymentMode === 'COD') {
        codRevenue += totalAmt;
      }

      if (o.restaurantId) {
        const storeName =
          state.restaurants[o.restaurantId]?.name || o.restaurantId;
        if (!storeStats[o.restaurantId]) {
          storeStats[o.restaurantId] = {
            name: storeName,
            orders: 0,
            sales: 0,
            commission: 0,
          };
        }
        const comm = subAmt * (commissionPercent / 100);
        storeStats[o.restaurantId].orders += 1;
        storeStats[o.restaurantId].sales += subAmt;
        storeStats[o.restaurantId].commission += comm;
      }

      if (o.deliveryUid) {
        riderTripStats[o.deliveryUid] =
          (riderTripStats[o.deliveryUid] || 0) + 1;
      }
    }
  });

  const adminCommission = Number(
    (itemsSubtotal * (commissionPercent / 100)).toFixed(2)
  );

  let settledCash = 0;
  Object.values(state.settlements || {}).forEach((s) => {
    const ts = Number(s.verifiedAt || s.createdAt || 0);
    if (s.status === 'APPROVED' && ts >= startMs && ts <= endMs) {
      settledCash += Number(s.amount || 0);
    }
  });

  let storePayoutsPaid = 0;
  Object.values(state.storePayouts || {}).forEach((p) => {
    const ts = Number(p.updatedAt || p.createdAt || 0);
    if (p.status === 'PAID' && ts >= startMs && ts <= endMs) {
      storePayoutsPaid += Number(p.amount || 0);
    }
  });

  let riderPayoutsPaid = 0;
  Object.values(state.riderPayouts || {}).forEach((p) => {
    const ts = Number(p.updatedAt || p.createdAt || 0);
    if (p.status === 'PAID' && ts >= startMs && ts <= endMs) {
      riderPayoutsPaid += Number(p.amount || 0);
    }
  });

  // Current live fleet COD cash held across all riders
  const riderCodCollectedAll: Record<string, number> = {};
  Object.values(state.orders || {}).forEach((o) => {
    if (
      o.deliveryUid &&
      o.status === 'DELIVERED' &&
      o.paymentMode === 'COD'
    ) {
      riderCodCollectedAll[o.deliveryUid] =
        (riderCodCollectedAll[o.deliveryUid] || 0) + Number(o.totalAmount || 0);
    }
  });
  const riderSettledAll: Record<string, number> = {};
  Object.values(state.settlements || {}).forEach((s) => {
    if (s.riderUid && s.status === 'APPROVED') {
      riderSettledAll[s.riderUid] =
        (riderSettledAll[s.riderUid] || 0) + Number(s.amount || 0);
    }
  });

  let fleetCodHeld = 0;
  const riderRows = Object.entries(state.deliveryPartners || {})
    .map(([uid, d]) => {
      const held = Math.max(
        0,
        (riderCodCollectedAll[uid] || 0) - (riderSettledAll[uid] || 0)
      );
      fleetCodHeld += held;
      return {
        uid,
        name: d.name || 'Rider',
        phone: d.phone || '',
        trips: riderTripStats[uid] || 0,
        codHeld: held,
        online: Boolean(d.online),
      };
    })
    .sort((a, b) => b.trips - a.trips || b.codHeld - a.codHeld);

  const topStores = Object.values(storeStats).sort(
    (a, b) => b.sales - a.sales
  );

  // Build PDF using jsPDF (A4 Portrait, mm units)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 14;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageH - 16) {
      doc.addPage();
      y = 16;
    }
  };

  // Top Header Band
  doc.setFillColor(22, 163, 74); // #16a34a
  doc.rect(0, 0, pageW, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${brandName} - Automated Operations & Finance Report`, margin, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(periodLabel, margin, 20);
  doc.text(
    `Generated: ${new Date(nowMs).toLocaleString('en-IN')} | Admin: ${adminEmail}`,
    margin,
    25.5
  );

  y = 38;

  // Section 1: KPI Summary Grid
  if (config.includeFinancials !== false) {
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text('1. Executive Summary & Financial Ledger', margin, y);
    y += 5;

    const kpiItems: Array<[string, string]> = [
      ['Total Orders', String(totalOrders)],
      ['Delivered / Cancelled', `${deliveredOrders} / ${cancelledOrders}`],
      ['Gross Revenue (Delivered)', formatInr(grossRevenue)],
      [`Admin Commission (${commissionPercent}%)`, formatInr(adminCommission)],
      ['Verified UPI Received', formatInr(verifiedUpi)],
      ['Period COD Delivered', formatInr(codRevenue)],
      ['COD Settled (Period)', formatInr(settledCash)],
      ['Live Fleet COD Cash Held', formatInr(fleetCodHeld)],
      ['Store Payouts Paid', formatInr(storePayoutsPaid)],
      ['Rider Payouts Paid', formatInr(riderPayoutsPaid)],
    ];

    const colW = (pageW - margin * 2 - 6) / 2;
    const rowH = 12;
    kpiItems.forEach(([label, value], idx) => {
      const col = idx % 2;
      if (col === 0) ensureSpace(rowH + 3);
      const x = margin + col * (colW + 6);
      const boxY = y + Math.floor(idx / 2) * (rowH + 3);

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, boxY, colW, rowH, 2, 2, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), x + 3, boxY + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(value, x + 3, boxY + 9.5);
    });

    y += Math.ceil(kpiItems.length / 2) * (rowH + 3) + 6;
  }

  // Section 2: Top Performing Stores
  if (config.includeTopStores !== false) {
    ensureSpace(24);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text('2. Top Performing Stores (Selected Period)', margin, y);
    y += 5;

    if (topStores.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('No delivered store orders recorded in this report window.', margin, y + 3);
      y += 10;
    } else {
      // Table header
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, pageW - margin * 2, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text('Store Name', margin + 2, y + 5);
      doc.text('Orders', margin + 96, y + 5);
      doc.text('Sales Volume', margin + 120, y + 5);
      doc.text('Commission', margin + 154, y + 5);
      y += 8.5;

      topStores.slice(0, 12).forEach((s, idx) => {
        ensureSpace(8);
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y - 4, pageW - margin * 2, 6.5, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(s.name.slice(0, 38), margin + 2, y);
        doc.text(String(s.orders), margin + 96, y);
        doc.text(formatInr(s.sales), margin + 120, y);
        doc.text(formatInr(s.commission), margin + 154, y);
        y += 6.5;
      });
      y += 4;
    }
  }

  // Section 3: Rider Delivery & Live COD Risk Snapshot
  if (config.includeRiderCash !== false) {
    ensureSpace(24);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text('3. Delivery Fleet Activity & COD Cash Held', margin, y);
    y += 5;

    if (riderRows.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('No delivery partners registered.', margin, y + 3);
      y += 10;
    } else {
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y, pageW - margin * 2, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text('Rider Name', margin + 2, y + 5);
      doc.text('Phone', margin + 72, y + 5);
      doc.text('Period Trips', margin + 112, y + 5);
      doc.text('COD Cash Held', margin + 146, y + 5);
      y += 8.5;

      riderRows.slice(0, 12).forEach((r, idx) => {
        ensureSpace(8);
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y - 4, pageW - margin * 2, 6.5, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`${r.name.slice(0, 26)}${r.online ? ' (Online)' : ''}`, margin + 2, y);
        doc.text(r.phone || '-', margin + 72, y);
        doc.text(String(r.trips), margin + 112, y);
        doc.text(formatInr(r.codHeld), margin + 146, y);
        y += 6.5;
      });
      y += 4;
    }
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${brandName} Admin Console • Confidential Automated Report`,
      margin,
      pageH - 7
    );
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin - 20, pageH - 7);
  }

  const dateTag = new Date(nowMs).toISOString().slice(0, 10);
  const slugBrand = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filename = `${slugBrand}-${frequency.toLowerCase()}-report-${dateTag}.pdf`;

  const blob = doc.output('blob');
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : '';

  const topStoresText =
    topStores.length > 0
      ? topStores
          .slice(0, 5)
          .map(
            (s, i) =>
              `${i + 1}. ${s.name}: ${s.orders} orders (₹${s.sales.toFixed(0)})`
          )
          .join('\n')
      : 'No store sales recorded in this period.';

  const summaryText = [
    `*${brandName} — ${periodLabel}*`,
    `Generated: ${new Date(nowMs).toLocaleString('en-IN')}`,
    `PDF File: ${filename}`,
    '',
    `• Orders: ${totalOrders} total (${deliveredOrders} delivered, ${cancelledOrders} cancelled)`,
    `• Gross Revenue: ₹${grossRevenue.toFixed(0)}`,
    `• Admin Commission (${commissionPercent}%): ₹${adminCommission.toFixed(2)}`,
    `• Verified UPI: ₹${verifiedUpi.toFixed(0)}`,
    `• Settled COD (Period): ₹${settledCash.toFixed(0)}`,
    `• Live Fleet COD Held: ₹${fleetCodHeld.toFixed(0)}`,
    '',
    '*Top Stores:*',
    topStoresText,
    '',
    `(Attach downloaded PDF "${filename}" if sending full ledger document.)`,
  ].join('\n');

  const emailSubject = `[${brandName}] ${periodLabel}`;
  const encodedEmails = (config.emailRecipients || adminEmail || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => encodeURIComponent(e))
    .join(',');
  const mailtoHref = `mailto:${encodedEmails}?subject=${encodeURIComponent(
    emailSubject
  )}&body=${encodeURIComponent(summaryText.replace(/\*/g, ''))}`;

  const whatsappHref = buildWhatsAppUrl(
    config.whatsappNumber || state.settings?.supportWhatsapp || state.settings?.supportPhone,
    summaryText
  );

  return {
    filename,
    periodLabel,
    frequency,
    blob,
    base64,
    summaryText,
    emailSubject,
    mailtoHref,
    whatsappHref,
    totalOrders,
    deliveredOrders,
    cancelledOrders,
    grossRevenue,
    adminCommission,
    verifiedUpi,
    settledCash,
    fleetCodHeld,
    download: () => doc.save(filename),
  };
}
