import { db } from '../firebase';
import {
  AdminState,
  SecurityAuditLogRecord,
  SecurityEventSeverity,
  SecurityEventType,
} from '../types';

const LOGIN_GUARD_STORAGE_KEY = 'gb_admin_login_guard_v1';
const DEFAULT_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000;

export interface LoginGuardState {
  attempts: number;
  lockedUntil: number;
  isLocked: boolean;
  remainingSeconds: number;
  maxAttempts: number;
}

export function getLoginGuardState(
  maxAttempts = DEFAULT_MAX_ATTEMPTS
): LoginGuardState {
  try {
    const raw = localStorage.getItem(LOGIN_GUARD_STORAGE_KEY);
    if (!raw) {
      return {
        attempts: 0,
        lockedUntil: 0,
        isLocked: false,
        remainingSeconds: 0,
        maxAttempts,
      };
    }
    const parsed = JSON.parse(raw) as { attempts?: number; lockedUntil?: number };
    const now = Date.now();
    const lockedUntil = Number(parsed.lockedUntil || 0);
    if (lockedUntil > 0 && now >= lockedUntil) {
      localStorage.removeItem(LOGIN_GUARD_STORAGE_KEY);
      return {
        attempts: 0,
        lockedUntil: 0,
        isLocked: false,
        remainingSeconds: 0,
        maxAttempts,
      };
    }
    const isLocked = lockedUntil > now;
    const remainingSeconds = isLocked
      ? Math.ceil((lockedUntil - now) / 1000)
      : 0;
    return {
      attempts: Number(parsed.attempts || 0),
      lockedUntil,
      isLocked,
      remainingSeconds,
      maxAttempts,
    };
  } catch {
    return {
      attempts: 0,
      lockedUntil: 0,
      isLocked: false,
      remainingSeconds: 0,
      maxAttempts,
    };
  }
}

export function recordFailedLoginAttempt(
  maxAttempts = DEFAULT_MAX_ATTEMPTS
): LoginGuardState {
  const current = getLoginGuardState(maxAttempts);
  if (current.isLocked) return current;

  const nextAttempts = current.attempts + 1;
  const shouldLock = nextAttempts >= maxAttempts;
  const lockedUntil = shouldLock ? Date.now() + LOCKOUT_DURATION_MS : 0;

  try {
    localStorage.setItem(
      LOGIN_GUARD_STORAGE_KEY,
      JSON.stringify({ attempts: nextAttempts, lockedUntil })
    );
  } catch {
    // ignore storage errors
  }

  return getLoginGuardState(maxAttempts);
}

export function resetLoginGuard(): void {
  try {
    localStorage.removeItem(LOGIN_GUARD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function generatePinSalt(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

export async function hashSecurityPin(pin: string, salt: string): Promise<string> {
  const payload = `${salt}:${pin}:gossaigaon-admin-shield`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(payload);
    const buf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic digest only when SubtleCrypto is unavailable
  let h1 = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h1 ^= payload.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return `fb_${(h1 >>> 0).toString(16)}`;
}

export async function verifySecurityPin(
  pin: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  if (!pin || !salt || !expectedHash) return false;
  const actual = await hashSecurityPin(pin, salt);
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

export function sanitizeInputStrict(str: unknown): string {
  return String(str || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/[<>"'`]/g, '');
}

export function sanitizeUrlSafe(url: unknown): string {
  const s = String(url || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('data:image/')
  ) {
    return s;
  }
  return '';
}

export async function logSecurityEvent(params: {
  eventType: SecurityEventType;
  actorEmail?: string;
  targetId?: string;
  details: string;
  severity: SecurityEventSeverity;
}): Promise<void> {
  try {
    const entry: SecurityAuditLogRecord = {
      eventType: params.eventType,
      actorEmail: params.actorEmail || 'System',
      targetId: params.targetId || '',
      details: sanitizeInputStrict(params.details),
      severity: params.severity,
      createdAt: Date.now(),
    };
    await db.ref('admin/securityLogs').push(entry);
  } catch {
    // Ignore logging errors if Firebase rules temporarily block writes
  }
}

export function normalizeUtr(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
}

const OBVIOUS_FAKE_UTRS = new Set([
  '000000000000',
  '111111111111',
  '222222222222',
  '333333333333',
  '444444444444',
  '555555555555',
  '666666666666',
  '777777777777',
  '888888888888',
  '999999999999',
  '123456789012',
  '987654321098',
  'TEST',
  'TEST1234',
  'FAKE',
  'NA',
  'NONE',
  'NULL',
]);

export function isValidUtrFormat(
  normalizedUtr: string,
  requireStrict12Digit = true
): boolean {
  if (!normalizedUtr || normalizedUtr.length < 8) return false;
  if (OBVIOUS_FAKE_UTRS.has(normalizedUtr)) return false;
  if (/^(\d)\1{7,}$/.test(normalizedUtr)) return false;
  if (requireStrict12Digit) {
    return /^\d{12}$/.test(normalizedUtr);
  }
  return /^[A-Z0-9]{10,24}$/.test(normalizedUtr);
}

export interface UtrOccurrence {
  kind: 'ORDER' | 'WALLET' | 'SETTLEMENT';
  id: string;
  utr: string;
  amount: number;
  status: string;
  paymentStatus?: string;
  customerUid?: string;
  phone?: string;
  name?: string;
  screenshot?: string;
  createdAt: number;
}

export type ScamThreatType = 'DUPLICATE_UTR' | 'INVALID_UTR' | 'REPEAT_OFFENDER';

export interface ScamThreatItem {
  threatKey: string;
  type: ScamThreatType;
  severity: 'CRITICAL' | 'WARNING';
  title: string;
  summary: string;
  utr?: string;
  occurrences: UtrOccurrence[];
  affectedCustomerUids: string[];
  affectedPhone?: string;
  totalExposureAmount: number;
  hasPendingItems: boolean;
  latestAt: number;
}

export interface ScamScanResult {
  threats: ScamThreatItem[];
  duplicateUtrCount: number;
  invalidUtrCount: number;
  repeatOffenderCount: number;
  utrCollisionMap: Record<string, UtrOccurrence[]>;
  invalidOrderUtrIds: Record<string, string>;
  invalidWalletUtrIds: Record<string, string>;
}

export function scanScamThreats(state: AdminState): ScamScanResult {
  const requireStrict12 = state.securityConfig?.requireStrict12DigitUtr !== false;
  const dismissed = state.dismissedThreatKeys || {};
  const utrMap: Record<string, UtrOccurrence[]> = {};
  const invalidOrderUtrIds: Record<string, string> = {};
  const invalidWalletUtrIds: Record<string, string> = {};

  const pushOccurrence = (occ: UtrOccurrence) => {
    if (!occ.utr) return;
    if (!utrMap[occ.utr]) utrMap[occ.utr] = [];
    utrMap[occ.utr].push(occ);
  };

  // 1. Scan Orders (UPI)
  Object.entries(state.orders).forEach(([orderId, o]) => {
    if (o.paymentMode !== 'UPI') return;
    const normUtr = normalizeUtr(o.transactionId);
    const customer = o.customerUid ? state.customers[o.customerUid] : undefined;
    const isRejectedOrCancelled =
      o.paymentStatus === 'REJECTED' || o.status === 'CANCELLED';

    if (normUtr) {
      pushOccurrence({
        kind: 'ORDER',
        id: orderId,
        utr: normUtr,
        amount: Number(o.totalAmount || 0),
        status: o.status || 'PLACED',
        paymentStatus: o.paymentStatus || 'PENDING_VERIFICATION',
        customerUid: o.customerUid,
        phone: o.phone || customer?.phone,
        name: customer?.name || 'Customer',
        screenshot: o.paymentScreenshot,
        createdAt: o.createdAt || o.updatedAt || 0,
      });
    }

    if (
      !isRejectedOrCancelled &&
      o.paymentStatus !== 'VERIFIED' &&
      o.paymentStatus !== 'REFUNDED' &&
      !isValidUtrFormat(normUtr, requireStrict12)
    ) {
      invalidOrderUtrIds[orderId] = normUtr
        ? `Invalid UTR format (${normUtr})`
        : 'Missing UPI UTR reference';
    }
  });

  // 2. Scan Wallet Deposit Requests
  Object.entries(state.walletRequests).forEach(([reqId, r]) => {
    if (r.type !== 'DEPOSIT') return;
    const normUtr = normalizeUtr(r.utr);
    if (normUtr) {
      pushOccurrence({
        kind: 'WALLET',
        id: reqId,
        utr: normUtr,
        amount: Number(r.amount || 0),
        status: r.status || 'PENDING',
        paymentStatus: r.status || 'PENDING',
        customerUid: r.customerUid,
        phone: r.customerPhone,
        name: r.customerName || 'Customer',
        screenshot: r.screenshot,
        createdAt: r.createdAt || r.updatedAt || 0,
      });
    }

    if (
      r.status === 'PENDING' &&
      !isValidUtrFormat(normUtr, requireStrict12)
    ) {
      invalidWalletUtrIds[reqId] = normUtr
        ? `Invalid Wallet UTR (${normUtr})`
        : 'Missing Wallet Deposit UTR';
    }
  });

  // 3. Scan Rider COD Settlements (with non-CASH UTR)
  Object.entries(state.settlements).forEach(([sid, s]) => {
    const normUtr = normalizeUtr(s.utr);
    if (!normUtr || normUtr === 'HANDOVER' || normUtr === 'CASH') return;
    pushOccurrence({
      kind: 'SETTLEMENT',
      id: sid,
      utr: normUtr,
      amount: Number(s.amount || 0),
      status: s.status || 'PENDING',
      paymentStatus: s.status || 'PENDING',
      name: s.riderName || 'Rider',
      createdAt: s.createdAt || 0,
    });
  });

  const threats: ScamThreatItem[] = [];
  const utrCollisionMap: Record<string, UtrOccurrence[]> = {};

  // Duplicate UTR Threats
  Object.entries(utrMap).forEach(([utr, occurrences]) => {
    if (occurrences.length < 2) return;
    utrCollisionMap[utr] = occurrences;
    const threatKey = `DUP_UTR_${utr}`;
    if (dismissed[threatKey]) return;

    const hasPendingItems = occurrences.some(
      (occ) =>
        (occ.kind === 'ORDER' &&
          occ.paymentStatus === 'PENDING_VERIFICATION' &&
          occ.status !== 'CANCELLED') ||
        (occ.kind === 'WALLET' && occ.status === 'PENDING') ||
        (occ.kind === 'SETTLEMENT' && occ.status === 'PENDING')
    );

    const customerUids = Array.from(
      new Set(
        occurrences.map((x) => x.customerUid).filter((v): v is string => Boolean(v))
      )
    );
    const totalExposure = occurrences.reduce((acc, x) => acc + x.amount, 0);
    const latestAt = Math.max(...occurrences.map((x) => x.createdAt || 0), 0);

    const channels = Array.from(new Set(occurrences.map((x) => x.kind))).join(
      ' + '
    );

    threats.push({
      threatKey,
      type: 'DUPLICATE_UTR',
      severity: 'CRITICAL',
      title: `Duplicate UTR ${utr} (${occurrences.length}× reuse)`,
      summary: `Same UTR submitted across ${occurrences.length} transactions (${channels}) totaling ₹${totalExposure.toFixed(0)}.`,
      utr,
      occurrences: [...occurrences].sort((a, b) => b.createdAt - a.createdAt),
      affectedCustomerUids: customerUids,
      affectedPhone: occurrences.find((x) => x.phone)?.phone,
      totalExposureAmount: totalExposure,
      hasPendingItems,
      latestAt,
    });
  });

  // Invalid / Suspicious UTR Threats (pending verification)
  Object.entries(invalidOrderUtrIds).forEach(([orderId, reason]) => {
    const o = state.orders[orderId];
    if (!o) return;
    const threatKey = `INV_ORD_${orderId}`;
    if (dismissed[threatKey]) return;
    const normUtr = normalizeUtr(o.transactionId);
    const customer = o.customerUid ? state.customers[o.customerUid] : undefined;
    threats.push({
      threatKey,
      type: 'INVALID_UTR',
      severity: 'WARNING',
      title: `Suspicious Order UTR #${orderId.slice(-6)}`,
      summary: `${reason} • Order ₹${Number(o.totalAmount || 0).toFixed(0)} (${o.phone || 'N/A'})`,
      utr: normUtr || 'MISSING',
      occurrences: [
        {
          kind: 'ORDER',
          id: orderId,
          utr: normUtr || 'MISSING',
          amount: Number(o.totalAmount || 0),
          status: o.status || 'PLACED',
          paymentStatus: o.paymentStatus || 'PENDING_VERIFICATION',
          customerUid: o.customerUid,
          phone: o.phone || customer?.phone,
          name: customer?.name || 'Customer',
          screenshot: o.paymentScreenshot,
          createdAt: o.createdAt || 0,
        },
      ],
      affectedCustomerUids: o.customerUid ? [o.customerUid] : [],
      affectedPhone: o.phone || customer?.phone,
      totalExposureAmount: Number(o.totalAmount || 0),
      hasPendingItems: true,
      latestAt: o.createdAt || o.updatedAt || 0,
    });
  });

  Object.entries(invalidWalletUtrIds).forEach(([reqId, reason]) => {
    const r = state.walletRequests[reqId];
    if (!r) return;
    const threatKey = `INV_WAL_${reqId}`;
    if (dismissed[threatKey]) return;
    const normUtr = normalizeUtr(r.utr);
    threats.push({
      threatKey,
      type: 'INVALID_UTR',
      severity: 'WARNING',
      title: `Suspicious Wallet UTR #${reqId.slice(-6)}`,
      summary: `${reason} • Deposit ₹${Number(r.amount || 0).toFixed(0)} (${r.customerPhone || 'N/A'})`,
      utr: normUtr || 'MISSING',
      occurrences: [
        {
          kind: 'WALLET',
          id: reqId,
          utr: normUtr || 'MISSING',
          amount: Number(r.amount || 0),
          status: r.status || 'PENDING',
          paymentStatus: r.status || 'PENDING',
          customerUid: r.customerUid,
          phone: r.customerPhone,
          name: r.customerName || 'Customer',
          screenshot: r.screenshot,
          createdAt: r.createdAt || 0,
        },
      ],
      affectedCustomerUids: r.customerUid ? [r.customerUid] : [],
      affectedPhone: r.customerPhone,
      totalExposureAmount: Number(r.amount || 0),
      hasPendingItems: true,
      latestAt: r.createdAt || r.updatedAt || 0,
    });
  });

  // Repeat Scam / Spam Offenders
  const offenderStats: Record<
    string,
    {
      rejectedUpi: number;
      spamCount: number;
      cancelCount: number;
      latestAt: number;
      phone?: string;
      name?: string;
      exposure: number;
    }
  > = {};

  Object.values(state.orders).forEach((o) => {
    if (!o.customerUid) return;
    const uid = o.customerUid;
    if (!offenderStats[uid]) {
      const cust = state.customers[uid];
      offenderStats[uid] = {
        rejectedUpi: 0,
        spamCount: 0,
        cancelCount: 0,
        latestAt: 0,
        phone: o.phone || cust?.phone,
        name: cust?.name || 'Customer',
        exposure: 0,
      };
    }
    const entry = offenderStats[uid];
    if (o.paymentStatus === 'REJECTED') {
      entry.rejectedUpi += 1;
      entry.exposure += Number(o.totalAmount || 0);
    }
    if (o.isSpamSuspect) {
      entry.spamCount += 1;
    }
    if (o.status === 'CANCELLED') {
      entry.cancelCount += 1;
    }
    entry.latestAt = Math.max(entry.latestAt, o.updatedAt || o.createdAt || 0);
  });

  Object.entries(offenderStats).forEach(([uid, info]) => {
    const customer = state.customers[uid];
    if (customer?.blocked) return; // Already frozen
    if (info.rejectedUpi < 2 && info.spamCount < 2 && info.cancelCount < 4) {
      return;
    }
    const threatKey = `OFFENDER_${uid}`;
    if (dismissed[threatKey]) return;

    threats.push({
      threatKey,
      type: 'REPEAT_OFFENDER',
      severity: info.rejectedUpi >= 2 || info.spamCount >= 2 ? 'CRITICAL' : 'WARNING',
      title: `Repeat Risk Account: ${info.name || 'Customer'}`,
      summary: `${info.rejectedUpi} rejected UPI • ${info.spamCount} spam flags • ${info.cancelCount} cancellations`,
      occurrences: [],
      affectedCustomerUids: [uid],
      affectedPhone: info.phone,
      totalExposureAmount: info.exposure,
      hasPendingItems: false,
      latestAt: info.latestAt,
    });
  });

  threats.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'CRITICAL' ? -1 : 1;
    }
    if (a.hasPendingItems !== b.hasPendingItems) {
      return a.hasPendingItems ? -1 : 1;
    }
    return b.latestAt - a.latestAt;
  });

  return {
    threats,
    duplicateUtrCount: threats.filter((t) => t.type === 'DUPLICATE_UTR').length,
    invalidUtrCount: threats.filter((t) => t.type === 'INVALID_UTR').length,
    repeatOffenderCount: threats.filter((t) => t.type === 'REPEAT_OFFENDER').length,
    utrCollisionMap,
    invalidOrderUtrIds,
    invalidWalletUtrIds,
  };
}
