import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import {
  AdminState,
  SettlementRecord,
  SmartAutoSettleConfig,
} from '../types';
import { sanitizeText } from '../utils/helpers';
import {
  RiderCodComplianceAnalysis,
  SmartAutoSettleReport,
  resolveSmartAutoSettleConfig,
} from '../utils/smartAutoSettle';
import {
  ScamScanResult,
  isValidUtrFormat,
  logSecurityEvent,
  normalizeUtr,
} from '../utils/security';
import { DialogConfig } from './ActionDialogModal';

interface SmartAutoSettlePanelProps {
  state: AdminState;
  report: SmartAutoSettleReport;
  scamScan: ScamScanResult;
  adminEmail: string;
  onApproveSettlement: (
    settlementId: string,
    record: SettlementRecord
  ) => Promise<void>;
  onRunAuditScan: () => Promise<number>;
  onAdminInterventionLiftFreeze?: () => void;
  onToast: (
    msg: string,
    type?: 'success' | 'danger' | 'info' | 'warning'
  ) => void;
  onConfirmDialog: (cfg: DialogConfig) => void;
}

type WatchlistFilter = 'ATTENTION' | 'RESTRICTED' | 'ALL_COD';

export const SmartAutoSettlePanel: React.FC<SmartAutoSettlePanelProps> = ({
  state,
  report,
  scamScan,
  adminEmail,
  onApproveSettlement,
  onRunAuditScan,
  onAdminInterventionLiftFreeze,
  onToast,
  onConfirmDialog,
}) => {
  const initialCfg = resolveSmartAutoSettleConfig(state.smartAutoSettleConfig);
  const [enabled, setEnabled] = useState(initialCfg.enabled);
  const [mode, setMode] = useState<'FLAG_ONLY' | 'RESTRICT_ASSIGNMENTS'>(
    initialCfg.mode
  );
  const [breachThresholdCount, setBreachThresholdCount] = useState(
    initialCfg.breachThresholdCount
  );
  const [triggerAtPercent, setTriggerAtPercent] = useState(
    initialCfg.triggerAtPercent
  );
  const [autoClearOnSettlementVerify, setAutoClearOnSettlementVerify] =
    useState(initialCfg.autoClearOnSettlementVerify);
  const [savingConfig, setSavingConfig] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [filter, setFilter] = useState<WatchlistFilter>('ATTENTION');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick Record & Verify Settlement form state
  const [collectTarget, setCollectTarget] =
    useState<RiderCodComplianceAnalysis | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMode, setCollectMode] = useState<'CASH' | 'UPI'>('CASH');
  const [collectUtr, setCollectUtr] = useState('');
  const [collecting, setCollecting] = useState(false);

  useEffect(() => {
    const resolved = resolveSmartAutoSettleConfig(state.smartAutoSettleConfig);
    setEnabled(resolved.enabled);
    setMode(resolved.mode);
    setBreachThresholdCount(resolved.breachThresholdCount);
    setTriggerAtPercent(resolved.triggerAtPercent);
    setAutoClearOnSettlementVerify(resolved.autoClearOnSettlementVerify);
  }, [state.smartAutoSettleConfig]);

  const filteredRiders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return report.riders.filter((r) => {
      if (filter === 'ATTENTION') {
        const needsView =
          r.governanceStatus !== 'COMPLIANT' ||
          r.isFrequentExceeder ||
          r.pendingSettlements.length > 0;
        if (!needsView) return false;
      } else if (filter === 'RESTRICTED') {
        if (!r.partner.codAssignmentRestricted) return false;
      } else {
        if (r.netCashInHand <= 0 && r.breachCount === 0 && r.totalSettled <= 0) {
          return false;
        }
      }

      if (!q) return true;
      return (
        (r.partner.name || '').toLowerCase().includes(q) ||
        (r.partner.phone || '').toLowerCase().includes(q) ||
        r.uid.toLowerCase().includes(q)
      );
    });
  }, [report.riders, filter, searchQuery]);

  const topCashRiders = useMemo(() => {
    return [...report.riders]
      .filter((r) => r.netCashInHand > 0)
      .sort((a, b) => {
        if (b.netCashInHand !== a.netCashInHand) {
          return b.netCashInHand - a.netCashInHand;
        }
        return b.breachCount - a.breachCount;
      })
      .slice(0, 5);
  }, [report.riders]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const payload: SmartAutoSettleConfig = {
        enabled,
        mode,
        breachThresholdCount: Math.max(1, Math.min(10, Number(breachThresholdCount || 2))),
        triggerAtPercent: Math.max(70, Math.min(120, Number(triggerAtPercent || 100))),
        autoClearOnSettlementVerify,
        updatedAt: Date.now(),
        updatedBy: adminEmail,
      };
      await db.ref('admin/smartAutoSettleConfig').update(payload);
      await logSecurityEvent({
        eventType: 'POLICY_UPDATED',
        actorEmail: adminEmail,
        details: `Smart Auto-Settle updated (${enabled ? 'ON' : 'OFF'}, mode: ${mode}, breach threshold: ${payload.breachThresholdCount}× at ${payload.triggerAtPercent}% of limit).`,
        severity: 'INFO',
      });
      onToast('⚡ Smart Auto-Settle policy saved!', 'success');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleManualScan = async () => {
    setScanning(true);
    try {
      const count = await onRunAuditScan();
      if (count > 0) {
        onToast(
          `🛡️ Smart Audit flagged/restricted ${count} frequent limit-exceeding rider(s).`,
          'warning'
        );
      } else {
        onToast(
          '✅ Smart Audit complete: no unflagged frequent limit exceeders.',
          'success'
        );
      }
    } finally {
      setScanning(false);
    }
  };

  const handleManualFlagOrRestrict = (
    item: RiderCodComplianceAnalysis,
    action: 'FLAG' | 'RESTRICT' | 'CLEAR'
  ) => {
    const riderName = item.partner.name || 'Rider';
    if (action === 'CLEAR') {
      onConfirmDialog({
        mode: 'confirm',
        title: `Clear COD Review & Restore "${riderName}"?`,
        message:
          item.isCurrentlyOverTrigger
            ? `Warning: ${riderName} still holds ₹${item.netCashInHand.toFixed(0)} (Limit: ₹${item.maxLimit}). Only lift the restriction if cash handover has been verified offline.`
            : `Clear COD review flag and restore order assignment eligibility for ${riderName}?`,
        confirmLabel: 'Confirm & Restore Rider',
        confirmVariant: item.isCurrentlyOverTrigger ? 'warning' : 'primary',
        onConfirm: async () => {
          const now = Date.now();
          await db.ref(`deliveryPartners/${item.uid}`).update({
            codReviewFlagged: false,
            codAssignmentRestricted: false,
            codRestrictionReason: '',
            codSettlementVerifiedAt: now,
            codAutoClearedAt: now,
          });
          await logSecurityEvent({
            eventType: 'COD_SETTLEMENT_VERIFIED',
            actorEmail: adminEmail,
            targetId: item.uid,
            details: `Admin cleared COD review/restriction for ${riderName} (Balance ₹${item.netCashInHand.toFixed(0)}).`,
            severity: 'INFO',
          });
          onToast(`✅ Restored order assignments for ${riderName}.`, 'success');
        },
      });
      return;
    }

    const isRestrict = action === 'RESTRICT';
    const reason = isRestrict
      ? `Smart Auto-Settle: ${item.breachCount}× cash limit breaches (Holding ₹${item.netCashInHand.toFixed(0)} / ₹${item.maxLimit} limit). New assignments locked until settlement verification.`
      : `Flagged for COD cash review (${item.breachCount}× breaches, Holding ₹${item.netCashInHand.toFixed(0)}).`;

    void db
      .ref(`deliveryPartners/${item.uid}`)
      .update({
        codReviewFlagged: true,
        codAssignmentRestricted: isRestrict,
        codLimitBreaches: item.breachCount,
        lastCodBreachAt: Date.now(),
        codRestrictionReason: reason,
        codAutoClearedAt: null,
      })
      .then(async () => {
        await logSecurityEvent({
          eventType: isRestrict
            ? 'COD_ASSIGNMENT_RESTRICTED'
            : 'COD_LIMIT_FLAGGED',
          actorEmail: adminEmail,
          targetId: item.uid,
          details: `${riderName}: ${reason}`,
          severity: isRestrict ? 'CRITICAL' : 'WARNING',
        });
        onToast(
          isRestrict
            ? `🚫 New order assignments restricted for ${riderName}.`
            : `🚩 ${riderName} flagged for admin review.`,
          'warning'
        );
      });
  };

  const openCollectModal = (item: RiderCodComplianceAnalysis) => {
    setCollectTarget(item);
    setCollectAmount(String(Math.max(0, Math.round(item.netCashInHand))));
    setCollectMode('CASH');
    setCollectUtr(`ADM-${Date.now().toString().slice(-6)}`);
  };

  const handleRecordAndVerifySettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectTarget) return;
    const amt = Number(collectAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      onToast('Enter a valid settlement amount greater than ₹0.', 'warning');
      return;
    }

    let finalRef = sanitizeText(collectUtr).trim() || 'ADMIN_CASH_COLLECT';
    if (collectMode === 'UPI') {
      const norm = normalizeUtr(finalRef);
      const strict12 = state.securityConfig?.requireStrict12DigitUtr !== false;
      if (!isValidUtrFormat(norm, strict12)) {
        onToast(
          strict12
            ? 'Enter a valid 12-digit numeric UPI UTR reference.'
            : 'Enter a valid alphanumeric UPI UTR reference (min 10 chars).',
          'danger'
        );
        return;
      }
      if (
        state.securityConfig?.blockDuplicateUtr !== false &&
        scamScan.utrCollisionMap[norm]?.length
      ) {
        onToast(
          `🚨 Duplicate UTR blocked! ${norm} is already used in another transaction.`,
          'danger'
        );
        return;
      }
      finalRef = norm;
    }

    setCollecting(true);
    try {
      const now = Date.now();
      const riderName = collectTarget.partner.name || 'Rider';
      const newRecord: SettlementRecord = {
        riderUid: collectTarget.uid,
        riderName,
        amount: amt,
        mode: collectMode,
        utr: finalRef,
        status: 'APPROVED',
        createdAt: now,
        verifiedAt: now,
        verifiedBy: adminEmail,
      };

      const pushed = await db.ref('settlements').push(newRecord);
      const postBalance = Math.max(0, collectTarget.netCashInHand - amt);
      const canClear =
        postBalance < report.triggerThresholdAmount ||
        collectTarget.netCashInHand - amt <= 0;

      if (canClear) {
        await db.ref(`deliveryPartners/${collectTarget.uid}`).update({
          codReviewFlagged: false,
          codAssignmentRestricted: false,
          codRestrictionReason: '',
          codSettlementVerifiedAt: now,
          codAutoClearedAt: now,
        });
      }

      await logSecurityEvent({
        eventType: 'COD_SETTLEMENT_VERIFIED',
        actorEmail: adminEmail,
        targetId: pushed.key || collectTarget.uid,
        details: `Verified ₹${amt.toFixed(0)} ${collectMode} settlement for ${riderName} (${finalRef}). Post-settlement cash held: ₹${postBalance.toFixed(0)}.${canClear ? ' Assignment restriction cleared.' : ' Restriction retained (balance still above limit).'}`,
        severity: 'INFO',
      });

      onToast(
        canClear
          ? `✅ Verified ₹${amt.toFixed(0)} for ${riderName} — order assignments restored!`
          : `✅ Verified ₹${amt.toFixed(0)} for ${riderName}. Remaining balance ₹${postBalance.toFixed(0)} still exceeds limit.`,
        canClear ? 'success' : 'warning'
      );
      setCollectTarget(null);
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* KPI OVERVIEW STRIP */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-info">
            <h4>Assignment Restricted</h4>
            <div
              className="stat-value"
              style={{
                color: report.restrictedCount > 0 ? '#dc2626' : '#059669',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {report.restrictedCount}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#dc2626',
              background: 'rgba(239, 68, 68, 0.12)',
            }}
          >
            <i className="fa-solid fa-ban"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Flagged for Admin Review</h4>
            <div
              className="stat-value"
              style={{
                color: report.flaggedCount > 0 ? '#d97706' : '#059669',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {report.flaggedCount}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#d97706',
              background: 'rgba(245, 158, 11, 0.12)',
            }}
          >
            <i className="fa-solid fa-flag"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Frequent Limit Exceeders</h4>
            <div
              className="stat-value"
              style={{ color: '#0284c7', fontVariantNumeric: 'tabular-nums' }}
            >
              {report.frequentExceederCount}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#0284c7',
              background: 'rgba(2, 132, 199, 0.12)',
            }}
          >
            <i className="fa-solid fa-bolt"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Excess Cash Above Limit</h4>
            <div
              className="stat-value"
              style={{
                color: report.totalExcessCash > 0 ? '#dc2626' : '#059669',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              ₹{report.totalExcessCash.toFixed(0)}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#7e22ce',
              background: 'rgba(168, 85, 247, 0.12)',
            }}
          >
            <i className="fa-solid fa-vault"></i>
          </div>
        </div>
      </div>

      {/* SMART AUTO-SETTLE POLICY & RULE ENGINE */}
      <form className="card" onSubmit={handleSaveConfig}>
        <div className="card-title">
          <span>
            <i
              className="fa-solid fa-shield-halved"
              style={{ color: '#d97706' }}
            ></i>{' '}
            Smart Auto-Settle Utility{' '}
            <small
              style={{
                fontWeight: 600,
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                marginLeft: '6px',
              }}
            >
              (Limit: ₹{report.maxLimit} • Trigger: ₹{report.triggerThresholdAmount})
            </small>
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-info btn-sm"
              onClick={handleManualScan}
              disabled={scanning}
            >
              <i className="fa-solid fa-magnifying-glass-chart"></i>{' '}
              {scanning ? 'Scanning...' : 'Run Smart Audit Scan'}
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={savingConfig}
            >
              <i className="fa-solid fa-floppy-disk"></i>{' '}
              {savingConfig ? 'Saving...' : 'Save Rules'}
            </button>
          </div>
        </div>

        <div className="smart-settle-policy-grid">
          <div className="toggle-row" style={{ marginBottom: 0 }}>
            <label htmlFor="sas-enabled">Auto-Detect Frequent Exceeders</label>
            <input
              id="sas-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="sas-mode">Enforcement Action</label>
            <select
              id="sas-mode"
              className="form-select"
              value={mode}
              onChange={(e) =>
                setMode(
                  e.target.value as 'FLAG_ONLY' | 'RESTRICT_ASSIGNMENTS'
                )
              }
            >
              <option value="RESTRICT_ASSIGNMENTS">
                Restrict New Assignments + Flag Review
              </option>
              <option value="FLAG_ONLY">Flag for Admin Review Only</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="sas-breaches">Frequent Breach Count (min ×)</label>
            <input
              id="sas-breaches"
              type="number"
              min={1}
              max={10}
              className="form-input"
              value={breachThresholdCount}
              onChange={(e) => setBreachThresholdCount(Number(e.target.value))}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="sas-pct">Trigger Threshold (% of ₹{report.maxLimit})</label>
            <input
              id="sas-pct"
              type="number"
              min={70}
              max={120}
              step={5}
              className="form-input"
              value={triggerAtPercent}
              onChange={(e) => setTriggerAtPercent(Number(e.target.value))}
            />
          </div>

          <div className="toggle-row" style={{ marginBottom: 0 }}>
            <label htmlFor="sas-autoclear">
              Auto-Restore on Settlement Verify
            </label>
            <input
              id="sas-autoclear"
              type="checkbox"
              checked={autoClearOnSettlementVerify}
              onChange={(e) => setAutoClearOnSettlementVerify(e.target.checked)}
            />
          </div>
        </div>
      </form>

      {/* FINANCIAL RISK RADAR: TOP 5 COD CASH HOLDERS */}
      <div className="card">
        <div className="card-title">
          <span>
            <i
              className="fa-solid fa-radar"
              style={{ color: '#dc2626' }}
            ></i>{' '}
            Financial Risk Radar — Top 5 COD Cash Holders
          </span>
          <span
            className="badge badge-info"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            Restriction Limit: ₹{report.triggerThresholdAmount}
          </span>
        </div>

        {/* TOTAL FLEET COD CASH EXPOSURE VS CIRCUIT BREAKER THRESHOLD */}
        <div
          className={`risk-radar-item ${report.isPayoutWithdrawalFrozen || report.isFleetCodOverThreshold ? 'critical' : ''}`}
          style={{ marginBottom: '0.9rem' }}
        >
          <div className="risk-radar-row-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.86rem' }}>
                <i className="fa-solid fa-truck-fast" style={{ color: '#0284c7' }}></i>{' '}
                Total Fleet COD Cash-in-Hand
              </strong>
              {report.isPayoutWithdrawalFrozen ? (
                <span className="badge badge-danger">
                  🚨 Payouts &amp; Withdrawals Frozen
                </span>
              ) : report.fleetCodRiskEnabled ? (
                report.isFleetCodOverThreshold ? (
                  <span className="badge badge-danger">Over Threshold</span>
                ) : (
                  <span className="badge badge-success">
                    Auto-Pause Guard ON
                  </span>
                )
              ) : (
                <span className="badge badge-muted">
                  Auto-Pause Guard OFF (Controls)
                </span>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>
                <strong
                  style={{
                    color: report.isFleetCodOverThreshold
                      ? '#dc2626'
                      : '#0284c7',
                  }}
                >
                  ₹{report.totalFleetCodCash.toFixed(0)}
                </strong>{' '}
                <small style={{ color: 'var(--text-muted)' }}>
                  / ₹{report.fleetCodRiskThreshold}
                </small>
              </span>
              {report.isPayoutWithdrawalFrozen && onAdminInterventionLiftFreeze && (
                <button
                  type="button"
                  className="btn btn-warning btn-sm"
                  onClick={onAdminInterventionLiftFreeze}
                >
                  <i className="fa-solid fa-gavel"></i> Admin Intervention
                </button>
              )}
            </div>
          </div>
          <div
            className="risk-radar-bar-track"
            role="progressbar"
            aria-valuenow={Math.min(
              100,
              Math.round(
                (report.totalFleetCodCash /
                  Math.max(1, report.fleetCodRiskThreshold)) *
                  100
              )
            )}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Total fleet COD cash vs circuit breaker threshold"
          >
            <div
              className="risk-radar-bar-fill"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    report.totalFleetCodCash > 0 ? 2 : 0,
                    Math.round(
                      (report.totalFleetCodCash /
                        Math.max(1, report.fleetCodRiskThreshold)) *
                        100
                    )
                  )
                )}%`,
                background: report.isFleetCodOverThreshold
                  ? '#ef4444'
                  : report.totalFleetCodCash >=
                      report.fleetCodRiskThreshold * 0.75
                    ? '#f59e0b'
                    : '#0284c7',
              }}
            />
          </div>
        </div>

        {topCashRiders.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '1.1rem',
              color: 'var(--text-muted)',
              fontSize: '0.84rem',
            }}
          >
            ✅ Zero unsettled COD cash held by riders right now.
          </div>
        ) : (
          <div className="risk-radar-list">
            {topCashRiders.map((item, idx) => {
              const limit = Math.max(1, report.triggerThresholdAmount);
              const pctToLimit = Math.round((item.netCashInHand / limit) * 100);
              const barPct = Math.min(100, Math.max(2, pctToLimit));
              const isOverOrAtLimit = pctToLimit >= 100;
              const isNearLimit = pctToLimit >= 75 && pctToLimit < 100;
              const barColor = isOverOrAtLimit
                ? '#ef4444'
                : isNearLimit
                  ? '#f59e0b'
                  : '#22c55e';
              const remainingBuffer = Math.max(0, limit - item.netCashInHand);
              const overBy = Math.max(0, item.netCashInHand - limit);

              return (
                <div
                  key={item.uid}
                  className={`risk-radar-item ${isOverOrAtLimit || item.partner.codAssignmentRestricted ? 'critical' : ''}`}
                >
                  <div className="risk-radar-row-top">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span className="risk-radar-rank">#{idx + 1}</span>
                      <div>
                        <strong>{item.partner.name || 'Rider'}</strong>{' '}
                        <span
                          style={{
                            fontSize: '0.74rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {item.partner.phone || 'N/A'}
                        </span>
                      </div>
                      {item.partner.codAssignmentRestricted ? (
                        <span className="badge badge-danger">
                          🚫 Restricted
                        </span>
                      ) : item.partner.codReviewFlagged ? (
                        <span className="badge badge-warning">
                          🚩 Flagged Review
                        </span>
                      ) : isOverOrAtLimit ? (
                        <span className="badge badge-danger">
                          ⚠️ At Restriction Limit
                        </span>
                      ) : isNearLimit ? (
                        <span className="badge badge-warning">
                          Approaching Limit
                        </span>
                      ) : (
                        <span className="badge badge-success">Safe Buffer</span>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <div style={{ textAlign: 'right' }}>
                        <strong
                          style={{
                            color: barColor,
                            fontSize: '0.95rem',
                          }}
                        >
                          ₹{item.netCashInHand.toFixed(0)}
                        </strong>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {' '}
                          / ₹{limit} ({pctToLimit}%)
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-info btn-sm"
                        onClick={() => openCollectModal(item)}
                      >
                        <i className="fa-solid fa-hand-holding-dollar"></i>{' '}
                        Settle
                      </button>
                    </div>
                  </div>

                  <div
                    className="risk-radar-bar-track"
                    role="progressbar"
                    aria-valuenow={Math.min(100, pctToLimit)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${item.partner.name || 'Rider'} COD restriction proximity`}
                  >
                    <div
                      className="risk-radar-bar-fill"
                      style={{
                        width: `${barPct}%`,
                        background: barColor,
                      }}
                    />
                  </div>

                  <div className="risk-radar-meta">
                    <span>
                      Breach History: <strong>{item.breachCount}×</strong> •{' '}
                      Peak Held: ₹{item.peakCashHeld.toFixed(0)}
                    </span>
                    <span>
                      {overBy > 0 ? (
                        <strong style={{ color: '#dc2626' }}>
                          Exceeded restriction limit by ₹{overBy.toFixed(0)}
                        </strong>
                      ) : (
                        <>
                          ₹{remainingBuffer.toFixed(0)} remaining before
                          restriction trigger
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FLAGGED & FREQUENT EXCEEDER WATCHLIST */}
      <div className="card">
        <div className="card-title">
          <span>
            <i
              className="fa-solid fa-user-clock"
              style={{ color: '#0284c7' }}
            ></i>{' '}
            COD Cash Compliance &amp; Auto-Flagged Riders ({filteredRiders.length})
          </span>
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: '230px', padding: '0.45rem 0.85rem' }}
            placeholder="Search rider name, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filters-bar">
          {(
            [
              ['ATTENTION', 'Needs Attention / Flagged'],
              ['RESTRICTED', `Restricted (${report.restrictedCount})`],
              ['ALL_COD', 'All Riders with COD Activity'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`filter-chip ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Rider</th>
                <th>Cash Held vs Limit</th>
                <th>Breach Frequency</th>
                <th>Pending Handover</th>
                <th>Governance Status</th>
                <th>Smart Auto-Settle Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRiders.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: 'center',
                      padding: '1.5rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    No riders match this COD compliance filter.
                  </td>
                </tr>
              ) : (
                filteredRiders.map((item) => {
                  const pctBar = Math.min(100, Math.max(0, item.utilizationPct));
                  const barColor =
                    item.utilizationPct >= 100
                      ? '#ef4444'
                      : item.utilizationPct >= 80
                        ? '#f59e0b'
                        : '#22c55e';
                  const latestPending = item.pendingSettlements[0];

                  return (
                    <tr
                      key={item.uid}
                      style={
                        item.partner.codAssignmentRestricted
                          ? { background: 'rgba(239, 68, 68, 0.08)' }
                          : item.partner.codReviewFlagged
                            ? { background: 'rgba(245, 158, 11, 0.06)' }
                            : undefined
                      }
                    >
                      <td>
                        <strong>{item.partner.name || 'Rider'}</strong>
                        <div
                          style={{
                            fontSize: '0.73rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {item.partner.phone || 'N/A'} •{' '}
                          {item.partner.online ? '🟢 Online' : '⚫ Offline'}
                        </div>
                      </td>

                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: '6px',
                          }}
                        >
                          <strong
                            style={{
                              color:
                                item.utilizationPct >= 100
                                  ? '#dc2626'
                                  : item.utilizationPct >= 80
                                    ? '#d97706'
                                    : '#059669',
                            }}
                          >
                            ₹{item.netCashInHand.toFixed(0)}
                          </strong>
                          <small style={{ color: 'var(--text-muted)' }}>
                            / ₹{item.maxLimit} ({item.utilizationPct}%)
                          </small>
                        </div>
                        <div className="cod-util-track">
                          <div
                            className="cod-util-fill"
                            style={{ width: `${pctBar}%`, background: barColor }}
                          />
                        </div>
                        {item.excessAmount > 0 && (
                          <div
                            style={{
                              fontSize: '0.68rem',
                              color: '#dc2626',
                              fontWeight: 700,
                              marginTop: '3px',
                            }}
                          >
                            +₹{item.excessAmount.toFixed(0)} over limit
                          </div>
                        )}
                      </td>

                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <span
                          className={`badge ${
                            item.isFrequentExceeder
                              ? 'badge-danger'
                              : item.breachCount > 0
                                ? 'badge-warning'
                                : 'badge-success'
                          }`}
                        >
                          {item.breachCount}× Exceeded
                        </span>
                        <div
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                            marginTop: '3px',
                          }}
                        >
                          Peak: ₹{item.peakCashHeld.toFixed(0)}
                          {item.rejectedSettlementCount > 0
                            ? ` • ${item.rejectedSettlementCount} rejected`
                            : ''}
                        </div>
                      </td>

                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {latestPending ? (
                          <div>
                            <strong style={{ color: '#0284c7' }}>
                              ₹{item.pendingAmount.toFixed(0)}
                            </strong>{' '}
                            <small style={{ color: 'var(--text-muted)' }}>
                              ({item.pendingSettlements.length} pending)
                            </small>
                            <div
                              style={{
                                fontSize: '0.68rem',
                                color: 'var(--text-muted)',
                              }}
                            >
                              Ref: {latestPending.record.utr || 'HANDOVER'}
                            </div>
                          </div>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.74rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No handover logged
                          </span>
                        )}
                      </td>

                      <td>
                        {item.governanceStatus === 'RESTRICTED' ? (
                          <div>
                            <span className="badge badge-danger">
                              🚫 Restricted
                            </span>
                            {item.partner.codRestrictionReason && (
                              <div
                                style={{
                                  fontSize: '0.68rem',
                                  color: '#dc2626',
                                  marginTop: '3px',
                                  maxWidth: '190px',
                                }}
                              >
                                {item.partner.codRestrictionReason}
                              </div>
                            )}
                          </div>
                        ) : item.governanceStatus === 'FLAGGED' ? (
                          <span className="badge badge-warning">
                            🚩 Flagged Review
                          </span>
                        ) : item.governanceStatus === 'OVER_LIMIT' ? (
                          <span className="badge badge-warning">
                            ⚠️ Over Limit
                          </span>
                        ) : (
                          <span className="badge badge-success">
                            ✓ Compliant
                          </span>
                        )}
                      </td>

                      <td>
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          {latestPending && (
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              onClick={() =>
                                void onApproveSettlement(
                                  latestPending.id,
                                  latestPending.record
                                )
                              }
                            >
                              <i className="fa-solid fa-check-double"></i> Verify ₹
                              {Number(latestPending.record.amount || 0).toFixed(0)}
                            </button>
                          )}

                          {item.netCashInHand > 0 && (
                            <button
                              type="button"
                              className="btn btn-info btn-sm"
                              onClick={() => openCollectModal(item)}
                            >
                              <i className="fa-solid fa-hand-holding-dollar"></i>{' '}
                              Collect &amp; Verify
                            </button>
                          )}

                          {!item.partner.codAssignmentRestricted && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() =>
                                handleManualFlagOrRestrict(item, 'RESTRICT')
                              }
                              title="Restrict new order assignments until settlement verified"
                            >
                              Restrict
                            </button>
                          )}

                          {!item.partner.codReviewFlagged &&
                            !item.partner.codAssignmentRestricted && (
                              <button
                                type="button"
                                className="btn btn-warning btn-sm"
                                onClick={() =>
                                  handleManualFlagOrRestrict(item, 'FLAG')
                                }
                              >
                                Flag
                              </button>
                            )}

                          {(item.partner.codReviewFlagged ||
                            item.partner.codAssignmentRestricted) && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() =>
                                handleManualFlagOrRestrict(item, 'CLEAR')
                              }
                            >
                              Clear / Restore
                            </button>
                          )}
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

      {/* INLINE / MODAL COLLECT & VERIFY SETTLEMENT */}
      {collectTarget && (
        <div
          className="modal-backdrop open"
          onClick={() => setCollectTarget(null)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <h3 style={{ fontWeight: 900 }}>
                <i
                  className="fa-solid fa-circle-check"
                  style={{ color: '#22c55e' }}
                ></i>{' '}
                Collect &amp; Verify Rider Settlement
              </h3>
              <i
                className="fa-solid fa-xmark"
                onClick={() => setCollectTarget(null)}
                style={{ fontSize: '1.2rem', cursor: 'pointer' }}
              ></i>
            </div>

            <p
              style={{
                fontSize: '0.82rem',
                color: 'var(--text-muted)',
                marginBottom: '1rem',
              }}
            >
              Rider: <strong style={{ color: '#0f172a' }}>{collectTarget.partner.name}</strong>{' '}
              • Current COD Cash Held:{' '}
              <strong style={{ color: '#dc2626' }}>
                ₹{collectTarget.netCashInHand.toFixed(0)}
              </strong>{' '}
              (Limit: ₹{collectTarget.maxLimit})
            </p>

            <form onSubmit={handleRecordAndVerifySettlement}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                }}
              >
                <div className="form-group">
                  <label htmlFor="collect-amt">Verified Amount (₹)</label>
                  <input
                    id="collect-amt"
                    type="number"
                    min={1}
                    step="1"
                    className="form-input"
                    value={collectAmount}
                    onChange={(e) => setCollectAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="collect-mode">Handover Mode</label>
                  <select
                    id="collect-mode"
                    className="form-select"
                    value={collectMode}
                    onChange={(e) =>
                      setCollectMode(e.target.value as 'CASH' | 'UPI')
                    }
                  >
                    <option value="CASH">Physical Cash Handover</option>
                    <option value="UPI">UPI Transfer (UTR Verified)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="collect-utr">
                  {collectMode === 'UPI'
                    ? 'UPI 12-Digit UTR Number'
                    : 'Cash Receipt / Handover Ref'}
                </label>
                <input
                  id="collect-utr"
                  type="text"
                  className="form-input"
                  value={collectUtr}
                  onChange={(e) => setCollectUtr(e.target.value)}
                  placeholder={
                    collectMode === 'UPI' ? 'e.g. 412345678901' : 'ADM-HANDOVER'
                  }
                  required
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCollectTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={collecting}
                >
                  <i className="fa-solid fa-check-double"></i>{' '}
                  {collecting ? 'Verifying...' : 'Verify Settlement & Clear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
