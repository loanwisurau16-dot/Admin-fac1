import React, { useMemo, useState } from 'react';
import { db } from '../firebase';
import {
  AdminState,
  SecurityAuditLogRecord,
  SecurityConfig,
} from '../types';
import {
  ScamScanResult,
  ScamThreatItem,
  generatePinSalt,
  hashSecurityPin,
  logSecurityEvent,
} from '../utils/security';
import { DialogConfig } from './ActionDialogModal';

interface SecurityCenterPanelProps {
  activePanel: string;
  state: AdminState;
  scamScan: ScamScanResult;
  adminEmail: string;
  onLockNow: () => void;
  onOpenScreenshot: (src: string, title: string) => void;
  onToast: (msg: string, type?: 'success' | 'danger' | 'info' | 'warning') => void;
  onConfirmDialog: (cfg: DialogConfig) => void;
}

type SecurityTab = 'threats' | 'session';
type ThreatFilter = 'ALL' | 'DUPLICATE_UTR' | 'INVALID_UTR' | 'REPEAT_OFFENDER';
type AuditSeverityFilter = 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO';
type AuditCategory =
  | 'ALL'
  | 'LOGINS'
  | 'FAILED_ATTEMPTS'
  | 'THREATS'
  | 'USER_ACTIVITY';

interface UnifiedAuditRow {
  id: string;
  createdAt: number;
  category: Exclude<AuditCategory, 'ALL'>;
  categoryLabel: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  eventType: string;
  actor: string;
  targetId?: string;
  details: string;
  isLiveThreat?: boolean;
}

function classifyAuditCategory(
  eventType: string
): { category: Exclude<AuditCategory, 'ALL'>; label: string } {
  if (eventType === 'LOGIN_SUCCESS' || eventType === 'SESSION_UNLOCKED') {
    return { category: 'LOGINS', label: 'Successful Login' };
  }
  if (
    eventType === 'LOGIN_FAILED' ||
    eventType === 'LOCKOUT_TRIGGERED' ||
    eventType === 'PIN_FAILED'
  ) {
    return { category: 'FAILED_ATTEMPTS', label: 'Failed Attempt' };
  }
  if (
    eventType === 'UTR_FRAUD_REJECTED' ||
    eventType === 'ACCOUNT_FROZEN' ||
    eventType === 'THREAT_DISMISSED' ||
    eventType === 'COD_LIMIT_FLAGGED' ||
    eventType === 'COD_ASSIGNMENT_RESTRICTED' ||
    eventType === 'FLEET_COD_RISK_FREEZE' ||
    eventType === 'THREAT_DETECTED'
  ) {
    return { category: 'THREATS', label: 'Threat Detection' };
  }
  return { category: 'USER_ACTIVITY', label: 'User Activity' };
}

export const SecurityCenterPanel: React.FC<SecurityCenterPanelProps> = ({
  activePanel,
  state,
  scamScan,
  adminEmail,
  onLockNow,
  onOpenScreenshot,
  onToast,
  onConfirmDialog,
}) => {
  const [activeTab, setActiveTab] = useState<SecurityTab>('threats');
  const [threatFilter, setThreatFilter] = useState<ThreatFilter>('ALL');
  const [threatSearch, setThreatSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState<AuditSeverityFilter>('ALL');
  const [auditCategoryFilter, setAuditCategoryFilter] =
    useState<AuditCategory>('ALL');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);

  const secCfg: SecurityConfig = state.securityConfig || {};
  const [autoLockEnabled, setAutoLockEnabled] = useState(
    secCfg.autoLockEnabled === true
  );
  const [autoLockMinutes, setAutoLockMinutes] = useState(
    Number(secCfg.autoLockMinutes || 5)
  );
  const [blockDuplicateUtr, setBlockDuplicateUtr] = useState(
    secCfg.blockDuplicateUtr !== false
  );
  const [requireStrict12DigitUtr, setRequireStrict12DigitUtr] = useState(
    secCfg.requireStrict12DigitUtr !== false
  );
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPolicy, setSavingPolicy] = useState(false);

  React.useEffect(() => {
    setAutoLockEnabled(secCfg.autoLockEnabled === true);
    setAutoLockMinutes(Number(secCfg.autoLockMinutes || 5));
    setBlockDuplicateUtr(secCfg.blockDuplicateUtr !== false);
    setRequireStrict12DigitUtr(secCfg.requireStrict12DigitUtr !== false);
  }, [
    secCfg.autoLockEnabled,
    secCfg.autoLockMinutes,
    secCfg.blockDuplicateUtr,
    secCfg.requireStrict12DigitUtr,
  ]);

  const filteredThreats = useMemo(() => {
    const q = threatSearch.trim().toLowerCase();
    return scamScan.threats.filter((t) => {
      if (threatFilter !== 'ALL' && t.type !== threatFilter) return false;
      if (!q) return true;
      const inTitle = t.title.toLowerCase().includes(q);
      const inSummary = t.summary.toLowerCase().includes(q);
      const inUtr = (t.utr || '').toLowerCase().includes(q);
      const inPhone = (t.affectedPhone || '').toLowerCase().includes(q);
      const inIds = t.occurrences.some((o) => o.id.toLowerCase().includes(q));
      return inTitle || inSummary || inUtr || inPhone || inIds;
    });
  }, [scamScan.threats, threatFilter, threatSearch]);

  const allAuditEvents = useMemo<UnifiedAuditRow[]>(() => {
    const persistedRows: UnifiedAuditRow[] = Object.entries(
      state.securityLogs || {}
    ).map(([logId, log]: [string, SecurityAuditLogRecord]) => {
      const cls = classifyAuditCategory(log.eventType);
      return {
        id: logId,
        createdAt: log.createdAt || 0,
        category: cls.category,
        categoryLabel: cls.label,
        severity: log.severity || 'INFO',
        eventType: log.eventType,
        actor: log.actorEmail || 'System',
        targetId: log.targetId,
        details: log.details,
      };
    });

    // Include live threat detections from Scam Scanner so threat events appear even before manual intervention
    const threatRows: UnifiedAuditRow[] = scamScan.threats.map((t) => ({
      id: `live-${t.threatKey}`,
      createdAt: t.latestAt || Date.now(),
      category: 'THREATS',
      categoryLabel: 'Threat Detection',
      severity: t.severity,
      eventType: `THREAT_DETECTED_${t.type}`,
      actor: 'ScamGuard Scanner',
      targetId: t.utr || t.affectedPhone || t.threatKey,
      details: `${t.title} — ${t.summary}`,
      isLiveThreat: true,
    }));

    return [...persistedRows, ...threatRows].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
  }, [state.securityLogs, scamScan.threats]);

  const auditCategoryCounts = useMemo(() => {
    const counts = {
      ALL: allAuditEvents.length,
      LOGINS: 0,
      FAILED_ATTEMPTS: 0,
      THREATS: 0,
      USER_ACTIVITY: 0,
    };
    allAuditEvents.forEach((ev) => {
      counts[ev.category]++;
    });
    return counts;
  }, [allAuditEvents]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return allAuditEvents.filter((row) => {
      if (
        auditCategoryFilter !== 'ALL' &&
        row.category !== auditCategoryFilter
      ) {
        return false;
      }
      if (auditFilter !== 'ALL' && row.severity !== auditFilter) return false;
      if (!q) return true;
      return (
        row.eventType.toLowerCase().includes(q) ||
        row.categoryLabel.toLowerCase().includes(q) ||
        row.details.toLowerCase().includes(q) ||
        row.actor.toLowerCase().includes(q) ||
        (row.targetId || '').toLowerCase().includes(q)
      );
    });
  }, [allAuditEvents, auditCategoryFilter, auditFilter, auditSearch]);

  const totalAuditPages = Math.max(
    1,
    Math.ceil(filteredAuditLogs.length / auditPageSize)
  );
  const safeAuditPage = Math.min(auditPage, totalAuditPages);
  const paginatedAuditLogs = useMemo(() => {
    const start = (safeAuditPage - 1) * auditPageSize;
    return filteredAuditLogs.slice(start, start + auditPageSize);
  }, [filteredAuditLogs, safeAuditPage, auditPageSize]);

  React.useEffect(() => {
    setAuditPage(1);
  }, [auditCategoryFilter, auditFilter, auditSearch, auditPageSize]);

  const handleRejectScamEntries = (threat: ScamThreatItem) => {
    const pendingOrders = threat.occurrences.filter(
      (o) =>
        o.kind === 'ORDER' &&
        o.paymentStatus === 'PENDING_VERIFICATION' &&
        o.status !== 'CANCELLED'
    );
    const pendingWallets = threat.occurrences.filter(
      (o) => o.kind === 'WALLET' && o.status === 'PENDING'
    );
    const totalPending = pendingOrders.length + pendingWallets.length;
    if (totalPending === 0) {
      onToast('No pending orders or wallet deposits on this threat.', 'info');
      return;
    }

    onConfirmDialog({
      mode: 'confirm',
      title: 'Reject Fraudulent UTR Entries?',
      message: `Reject ${pendingOrders.length} pending order(s) and ${pendingWallets.length} pending wallet deposit(s) linked to UTR ${threat.utr || 'N/A'}?`,
      confirmLabel: 'Reject All Pending',
      confirmVariant: 'danger',
      onConfirm: async () => {
        const updates: Record<string, unknown> = {};
        const now = Date.now();
        pendingOrders.forEach((o) => {
          updates[`orders/${o.id}/paymentStatus`] = 'REJECTED';
          updates[`orders/${o.id}/status`] = 'CANCELLED';
          updates[`orders/${o.id}/cancelledBy`] = 'ADMIN_FRAUD_CHECK';
          updates[`orders/${o.id}/cancelReason`] =
            `Fraud Guard: ${threat.type === 'DUPLICATE_UTR' ? 'Duplicate' : 'Invalid'} UTR (${threat.utr || 'N/A'})`;
          updates[`orders/${o.id}/updatedAt`] = now;
        });
        pendingWallets.forEach((w) => {
          updates[`walletRequests/${w.id}/status`] = 'REJECTED';
          updates[`walletRequests/${w.id}/updatedAt`] = now;
        });

        await db.ref().update(updates);
        await logSecurityEvent({
          eventType: 'UTR_FRAUD_REJECTED',
          actorEmail: adminEmail,
          targetId: threat.utr || threat.threatKey,
          details: `Rejected ${pendingOrders.length} order(s) & ${pendingWallets.length} wallet request(s) (${threat.title}).`,
          severity: 'CRITICAL',
        });
        onToast(
          `Blocked & rejected ${totalPending} fraudulent transaction(s).`,
          'danger'
        );
      },
    });
  };

  const handleFreezeAccounts = (threat: ScamThreatItem) => {
    const uids = threat.affectedCustomerUids;
    if (uids.length === 0) {
      onToast('No linked customer account UID found for this alert.', 'warning');
      return;
    }
    onConfirmDialog({
      mode: 'confirm',
      title: 'Freeze Linked Account(s)?',
      message: `Ban ${uids.length} customer account(s) linked to "${threat.title}" to block further orders and wallet requests?`,
      confirmLabel: 'Freeze Account',
      confirmVariant: 'danger',
      onConfirm: async () => {
        const updates: Record<string, unknown> = {};
        uids.forEach((uid) => {
          updates[`customers/${uid}/blocked`] = true;
          updates[`customers/${uid}/updatedAt`] = Date.now();
        });
        await db.ref().update(updates);
        await logSecurityEvent({
          eventType: 'ACCOUNT_FROZEN',
          actorEmail: adminEmail,
          targetId: uids.join(','),
          details: `Froze ${uids.length} customer account(s) due to ${threat.title}.`,
          severity: 'CRITICAL',
        });
        onToast(
          `Froze ${uids.length} account(s) & logged security action.`,
          'success'
        );
      },
    });
  };

  const handleDismissThreat = async (threat: ScamThreatItem) => {
    await db.ref(`admin/dismissedThreats/${threat.threatKey}`).set(true);
    await logSecurityEvent({
      eventType: 'THREAT_DISMISSED',
      actorEmail: adminEmail,
      targetId: threat.threatKey,
      details: `Reviewed and dismissed threat: ${threat.title}`,
      severity: 'INFO',
    });
    onToast('Threat marked as reviewed.', 'info');
  };

  const handleSaveSecurityPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPin = newPin.trim();
    const trimmedConfirm = confirmPin.trim();

    if (trimmedPin || trimmedConfirm) {
      if (!/^\d{4,6}$/.test(trimmedPin)) {
        onToast('Security PIN must be 4 to 6 numeric digits.', 'warning');
        return;
      }
      if (trimmedPin !== trimmedConfirm) {
        onToast('Security PIN confirmation does not match.', 'danger');
        return;
      }
    }

    if (autoLockEnabled && !secCfg.pinHash && !trimmedPin) {
      onToast(
        'Please set a 4–6 digit Admin Security PIN before enabling Auto-Lock.',
        'warning'
      );
      return;
    }

    setSavingPolicy(true);
    try {
      const payload: SecurityConfig = {
        ...secCfg,
        autoLockEnabled,
        autoLockMinutes,
        blockDuplicateUtr,
        requireStrict12DigitUtr,
        updatedAt: Date.now(),
        updatedBy: adminEmail,
      };

      if (trimmedPin) {
        const salt = generatePinSalt();
        const hash = await hashSecurityPin(trimmedPin, salt);
        payload.pinSalt = salt;
        payload.pinHash = hash;
      }

      await db.ref('admin/securityConfig').update(payload);
      await logSecurityEvent({
        eventType: trimmedPin ? 'PIN_UPDATED' : 'POLICY_UPDATED',
        actorEmail: adminEmail,
        details: `Auto-lock: ${autoLockEnabled ? `${autoLockMinutes}m` : 'OFF'}, Duplicate UTR Guard: ${blockDuplicateUtr ? 'ON' : 'OFF'}, Strict 12-Digit UTR: ${requireStrict12DigitUtr ? 'ON' : 'OFF'}${trimmedPin ? ', PIN rotated' : ''}.`,
        severity: 'INFO',
      });

      setNewPin('');
      setConfirmPin('');
      onToast('Security policies & protection rules updated live.', 'success');
    } finally {
      setSavingPolicy(false);
    }
  };

  const hasPinSet = Boolean(secCfg.pinHash && secCfg.pinSalt);

  return (
    <section
      id="panel-security"
      className={`panel-section ${activePanel === 'security' ? 'active' : ''}`}
    >
      {/* KPI OVERVIEW STRIP */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-info">
            <h4>Active Scam Threats</h4>
            <div
              className="stat-value"
              style={{
                color:
                  scamScan.threats.length > 0 ? '#dc2626' : '#059669',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {scamScan.threats.length}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: scamScan.threats.length > 0 ? '#dc2626' : '#059669',
              background:
                scamScan.threats.length > 0
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'rgba(16, 185, 129, 0.12)',
            }}
          >
            <i className="fa-solid fa-shield-virus"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Duplicate UTR Collisions</h4>
            <div
              className="stat-value"
              style={{
                color:
                  scamScan.duplicateUtrCount > 0 ? '#d97706' : '#059669',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {scamScan.duplicateUtrCount}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: scamScan.duplicateUtrCount > 0 ? '#d97706' : '#059669',
              background:
                scamScan.duplicateUtrCount > 0
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(16, 185, 129, 0.12)',
            }}
          >
            <i className="fa-solid fa-copy"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Idle Session Auto-Lock</h4>
            <div
              className="stat-value"
              style={{
                fontSize: '1.15rem',
                color: secCfg.autoLockEnabled && hasPinSet ? '#059669' : '#d97706',
              }}
            >
              {secCfg.autoLockEnabled && hasPinSet
                ? `Active (${secCfg.autoLockMinutes || 5}m)`
                : hasPinSet
                  ? 'Standby (Manual)'
                  : 'PIN Not Set'}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#0284c7',
              background: 'rgba(2, 132, 199, 0.12)',
            }}
          >
            <i className="fa-solid fa-user-lock"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Security Audit Events</h4>
            <div
              className="stat-value"
              style={{
                color: '#0284c7',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {allAuditEvents.length}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#0284c7',
              background: 'rgba(2, 132, 199, 0.12)',
            }}
          >
            <i className="fa-solid fa-clipboard-list"></i>
          </div>
        </div>
      </div>

      {/* MAIN SECURITY COMMAND CARD */}
      <div className="card">
        <div className="card-title">
          <span>
            <i className="fa-solid fa-shield-halved" style={{ color: '#0284c7' }}></i>{' '}
            Hacker, Scam &amp; Security Protection Center
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'threats' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('threats')}
            >
              Scam &amp; UTR Scanner ({scamScan.threats.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'session' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('session')}
            >
              Session Lock &amp; PIN
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() =>
                document
                  .getElementById('security-audit-log-card')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <i className="fa-solid fa-clipboard-list"></i> Security Audit Log (
              {allAuditEvents.length})
            </button>
            <button
              type="button"
              className="btn btn-warning btn-sm"
              onClick={onLockNow}
            >
              <i className="fa-solid fa-lock"></i> Lock Terminal
            </button>
          </div>
        </div>

        {/* TAB 1: SCAM & DUPLICATE UTR FRAUD SCANNER */}
        {activeTab === 'threats' && (
          <div>
            <div className="filters-bar">
              <input
                type="text"
                className="form-input"
                style={{ maxWidth: '250px', padding: '0.45rem 0.85rem' }}
                placeholder="Search UTR / Phone / Order ID..."
                value={threatSearch}
                onChange={(e) => setThreatSearch(e.target.value)}
              />
              {(
                [
                  ['ALL', `All Threats (${scamScan.threats.length})`],
                  ['DUPLICATE_UTR', `Duplicate UTR (${scamScan.duplicateUtrCount})`],
                  ['INVALID_UTR', `Invalid UTR (${scamScan.invalidUtrCount})`],
                  ['REPEAT_OFFENDER', `Repeat Risk (${scamScan.repeatOffenderCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`filter-chip ${threatFilter === key ? 'active' : ''}`}
                  onClick={() => setThreatFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Severity &amp; Threat</th>
                    <th>UTR Reference</th>
                    <th>Linked Transactions</th>
                    <th>Exposure</th>
                    <th>Containment Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredThreats.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                          style={{
                          textAlign: 'center',
                          padding: '2rem',
                          color: '#059669',
                          fontWeight: 700,
                        }}
                      >
                        <i className="fa-solid fa-circle-check"></i> No unresolved duplicate UTRs or fraud threats detected.
                      </td>
                    </tr>
                  ) : (
                    filteredThreats.map((threat) => {
                      const hasPending = threat.occurrences.some(
                        (o) =>
                          (o.kind === 'ORDER' &&
                            o.paymentStatus === 'PENDING_VERIFICATION' &&
                            o.status !== 'CANCELLED') ||
                          (o.kind === 'WALLET' && o.status === 'PENDING')
                      );
                      return (
                        <tr key={threat.threatKey}>
                          <td>
                            <span
                              className={`badge ${threat.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}`}
                            >
                              {threat.type.replace('_', ' ')}
                            </span>
                            <div style={{ marginTop: '4px', fontWeight: 800 }}>
                              {threat.title}
                            </div>
                            <div
                              style={{
                                fontSize: '0.74rem',
                                color: 'var(--text-muted)',
                                marginTop: '2px',
                              }}
                            >
                              {threat.summary}
                            </div>
                          </td>
                          <td>
                            <code
                              style={{
                                color: '#0284c7',
                                fontWeight: 800,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {threat.utr || 'N/A'}
                            </code>
                            {threat.affectedPhone && (
                              <div
                                style={{
                                  fontSize: '0.72rem',
                                  color: 'var(--text-muted)',
                                  marginTop: '3px',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {threat.affectedPhone}
                              </div>
                            )}
                          </td>
                          <td>
                            {threat.occurrences.length === 0 ? (
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                Behavioral pattern
                              </span>
                            ) : (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px',
                                }}
                              >
                                {threat.occurrences.slice(0, 4).map((occ) => (
                                  <div
                                    key={`${occ.kind}-${occ.id}`}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontSize: '0.74rem',
                                      fontVariantNumeric: 'tabular-nums',
                                    }}
                                  >
                                    <strong>
                                      {occ.kind} #{occ.id.slice(-6)}
                                    </strong>
                                    <span>· ₹{occ.amount.toFixed(0)}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>
                                      · {occ.paymentStatus || occ.status}
                                    </span>
                                    {occ.screenshot && (
                                      <button
                                        type="button"
                                        className="btn btn-info btn-sm"
                                        style={{ padding: '1px 6px', fontSize: '0.66rem' }}
                                        onClick={() =>
                                          onOpenScreenshot(
                                            occ.screenshot!,
                                            `${occ.kind} #${occ.id.slice(-6)} • UTR: ${occ.utr}`
                                          )
                                        }
                                      >
                                        Proof
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                            <strong style={{ color: '#dc2626' }}>
                              ₹{threat.totalExposureAmount.toFixed(0)}
                            </strong>
                          </td>
                          <td>
                            <div
                              style={{
                                display: 'flex',
                                gap: '6px',
                                flexWrap: 'wrap',
                              }}
                            >
                              {hasPending && (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleRejectScamEntries(threat)}
                                >
                                  <i className="fa-solid fa-ban"></i> Reject Pending
                                </button>
                              )}
                              {threat.affectedCustomerUids.length > 0 && (
                                <button
                                  type="button"
                                  className="btn btn-warning btn-sm"
                                  onClick={() => handleFreezeAccounts(threat)}
                                >
                                  <i className="fa-solid fa-user-slash"></i> Freeze Account
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => void handleDismissThreat(threat)}
                              >
                                Dismiss
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: HACKER PROTECTION & IDLE SESSION LOCK */}
        {activeTab === 'session' && (
          <form onSubmit={handleSaveSecurityPolicy}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '12px',
                marginBottom: '1.25rem',
              }}
            >
              <div className="toggle-row">
                <label htmlFor="sec-autolock-toggle">
                  Enable Idle Session Auto-Lock
                </label>
                <input
                  id="sec-autolock-toggle"
                  type="checkbox"
                  checked={autoLockEnabled}
                  onChange={(e) => setAutoLockEnabled(e.target.checked)}
                />
              </div>

              <div className="toggle-row">
                <label htmlFor="sec-dup-utr-guard">
                  Duplicate UTR Approval Guard
                </label>
                <input
                  id="sec-dup-utr-guard"
                  type="checkbox"
                  checked={blockDuplicateUtr}
                  onChange={(e) => setBlockDuplicateUtr(e.target.checked)}
                />
              </div>

              <div className="toggle-row">
                <label htmlFor="sec-strict-utr-format">
                  Strict 12-Digit UPI UTR Check
                </label>
                <input
                  id="sec-strict-utr-format"
                  type="checkbox"
                  checked={requireStrict12DigitUtr}
                  onChange={(e) => setRequireStrict12DigitUtr(e.target.checked)}
                />
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
                marginBottom: '1.25rem',
              }}
            >
              <div className="form-group">
                <label htmlFor="sec-timeout-select">
                  Idle Inactivity Timeout
                </label>
                <select
                  id="sec-timeout-select"
                  className="form-select"
                  value={autoLockMinutes}
                  onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
                >
                  <option value={2}>2 Minutes</option>
                  <option value={5}>5 Minutes (Recommended)</option>
                  <option value={10}>10 Minutes</option>
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="sec-new-pin">
                  {hasPinSet
                    ? 'Rotate Security PIN (4–6 digits, optional)'
                    : 'Set Admin Security PIN (4–6 digits)'}
                </label>
                <input
                  id="sec-new-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  className="form-input"
                  placeholder={hasPinSet ? 'Leave blank to keep current PIN' : 'e.g. 4829'}
                  value={newPin}
                  onChange={(e) =>
                    setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="sec-confirm-pin">Confirm Security PIN</label>
                <input
                  id="sec-confirm-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  className="form-input"
                  placeholder="Re-enter PIN"
                  value={confirmPin}
                  onChange={(e) =>
                    setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: '0.76rem',
                  color: 'var(--text-muted)',
                }}
              >
                {hasPinSet
                  ? 'Security PIN is stored as a salted SHA-256 hash. Login brute-force shield locks after 5 failed attempts.'
                  : 'Set a numeric PIN to activate automatic screen lock when idle.'}
              </span>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingPolicy}
              >
                <i className="fa-solid fa-shield-halved"></i>{' '}
                {savingPolicy ? 'Saving Policies...' : 'Save Security Policies'}
              </button>
            </div>
          </form>
        )}

      </div>

      {/* PAGINATED SECURITY AUDIT LOG TABLE */}
      <div
        id="security-audit-log-card"
        className="card"
        style={{ marginTop: '1.5rem' }}
      >
        <div className="card-title">
          <span>
            <i
              className="fa-solid fa-clipboard-list"
              style={{ color: '#0284c7' }}
            ></i>{' '}
            Security Audit Log ({filteredAuditLogs.length})
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <label
              htmlFor="audit-page-size"
              style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}
            >
              Rows / page:
            </label>
            <select
              id="audit-page-size"
              className="form-select"
              style={{
                width: 'auto',
                padding: '0.35rem 0.65rem',
                fontSize: '0.78rem',
              }}
              value={auditPageSize}
              onChange={(e) => setAuditPageSize(Number(e.target.value))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* CATEGORY FILTER CHIPS */}
        <div className="filters-bar" style={{ marginBottom: '0.65rem' }}>
          {(
            [
              ['ALL', `All Events (${auditCategoryCounts.ALL})`],
              ['USER_ACTIVITY', `User Activity (${auditCategoryCounts.USER_ACTIVITY})`],
              ['LOGINS', `Successful Logins (${auditCategoryCounts.LOGINS})`],
              ['FAILED_ATTEMPTS', `Failed Attempts (${auditCategoryCounts.FAILED_ATTEMPTS})`],
              ['THREATS', `Threat Detections (${auditCategoryCounts.THREATS})`],
            ] as const
          ).map(([catKey, label]) => (
            <button
              key={catKey}
              type="button"
              className={`filter-chip ${auditCategoryFilter === catKey ? 'active' : ''}`}
              onClick={() => setAuditCategoryFilter(catKey)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* SEVERITY + SEARCH BAR */}
        <div className="filters-bar">
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: '260px', padding: '0.45rem 0.85rem' }}
            placeholder="Search event, actor, target, details..."
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
          />
          {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              className={`filter-chip ${auditFilter === sev ? 'active' : ''}`}
              onClick={() => setAuditFilter(sev)}
            >
              {sev === 'ALL' ? 'All Severities' : sev}
            </button>
          ))}
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Category</th>
                <th>Severity</th>
                <th>Event</th>
                <th>Actor / Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAuditLogs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: 'center',
                      padding: '1.75rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    No security audit events match the active filters.
                  </td>
                </tr>
              ) : (
                paginatedAuditLogs.map((row) => {
                  const categoryBadge =
                    row.category === 'FAILED_ATTEMPTS'
                      ? 'badge-danger'
                      : row.category === 'THREATS'
                        ? 'badge-warning'
                        : row.category === 'LOGINS'
                          ? 'badge-success'
                          : 'badge-info';

                  return (
                    <tr key={row.id}>
                      <td
                        style={{
                          fontFamily: 'monospace',
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: '0.76rem',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {new Date(row.createdAt || Date.now()).toLocaleString()}
                      </td>
                      <td>
                        <span className={`badge ${categoryBadge}`}>
                          {row.categoryLabel}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            row.severity === 'CRITICAL'
                              ? 'badge-danger'
                              : row.severity === 'WARNING'
                                ? 'badge-warning'
                                : 'badge-info'
                          }`}
                        >
                          {row.severity}
                        </span>
                      </td>
                      <td style={{ fontWeight: 800, fontSize: '0.76rem' }}>
                        {row.eventType}
                        {row.isLiveThreat && (
                          <div
                            style={{
                              fontSize: '0.64rem',
                              color: '#dc2626',
                              fontWeight: 700,
                            }}
                          >
                            LIVE ALERT
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.78rem' }}>
                        <div>{row.actor}</div>
                        {row.targetId && (
                          <code
                            style={{
                              fontSize: '0.68rem',
                              color: '#0284c7',
                            }}
                          >
                            {row.targetId}
                          </code>
                        )}
                      </td>
                      <td
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {row.details}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS */}
        <div className="audit-pagination-bar">
          <div>
            {filteredAuditLogs.length === 0
              ? 'Showing 0 events'
              : `Showing ${(safeAuditPage - 1) * auditPageSize + 1}–${Math.min(
                  safeAuditPage * auditPageSize,
                  filteredAuditLogs.length
                )} of ${filteredAuditLogs.length} events (Page ${safeAuditPage} of ${totalAuditPages})`}
          </div>

          <div className="audit-page-controls">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={safeAuditPage <= 1}
              onClick={() => setAuditPage(1)}
            >
              First
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={safeAuditPage <= 1}
              onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            {Array.from({ length: totalAuditPages }, (_, i) => i + 1)
              .filter(
                (p) =>
                  p === 1 ||
                  p === totalAuditPages ||
                  Math.abs(p - safeAuditPage) <= 1
              )
              .map((pageNum, idx, arr) => {
                const prev = arr[idx - 1];
                return (
                  <React.Fragment key={pageNum}>
                    {prev && pageNum - prev > 1 && (
                      <span style={{ padding: '0 4px' }}>…</span>
                    )}
                    <button
                      type="button"
                      className={`btn btn-sm ${
                        pageNum === safeAuditPage ? 'btn-primary' : 'btn-outline'
                      }`}
                      onClick={() => setAuditPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  </React.Fragment>
                );
              })}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={safeAuditPage >= totalAuditPages}
              onClick={() =>
                setAuditPage((p) => Math.min(totalAuditPages, p + 1))
              }
            >
              Next
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={safeAuditPage >= totalAuditPages}
              onClick={() => setAuditPage(totalAuditPages)}
            >
              Last
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
