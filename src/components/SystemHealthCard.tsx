import React, { useMemo, useState } from 'react';
import { AdminPanelId, AdminState } from '../types';
import { ScamScanResult } from '../utils/security';

interface SystemHealthCardProps {
  state: AdminState;
  scamScan: ScamScanResult;
  stats: {
    pendingProductsCount: number;
    pendingUpiCount: number;
    unassignedCount: number;
    pendingWalletCount: number;
    pendingSettlementCount: number;
    openFeedbackCount: number;
  };
  restrictedRiderCount: number;
  flaggedRiderCount: number;
  onNavigatePanel: (panel: AdminPanelId) => void;
  onAutoDispatchPending: () => void;
}

export const SystemHealthCard: React.FC<SystemHealthCardProps> = ({
  state,
  scamScan,
  stats,
  restrictedRiderCount,
  flaggedRiderCount,
  onNavigatePanel,
  onAutoDispatchPending,
}) => {
  const [lastScannedAt, setLastScannedAt] = useState<number>(() => Date.now());

  const diagnostics = useMemo(() => {
    const now = Date.now();
    const riders = Object.values(state.deliveryPartners || {});
    const approvedRiders = riders.filter((r) => r.approved === true && !r.suspended);
    const eligibleOnlineRiders = approvedRiders.filter(
      (r) => r.online === true && r.codAssignmentRestricted !== true
    );

    const stores = Object.values(state.restaurants || {});
    const openApprovedStores = stores.filter(
      (s) => s.approved === true && !s.suspended && s.isOpen !== false
    );
    const pendingStoreApprovals = stores.filter(
      (s) => s.approved !== true && !s.suspended
    );
    const storesMissingGps = stores.filter((s) => {
      const lat = Number(s.lat);
      const lng = Number(s.lng);
      return !Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0;
    });

    const staleUnassignedOrders = Object.values(state.orders || {}).filter((o) => {
      if (o.deliveryUid || o.status === 'DELIVERED' || o.status === 'CANCELLED') {
        return false;
      }
      const created = Number(o.createdAt || 0);
      return created > 0 && now - created > 20 * 60_000;
    });

    const enabledZones = Object.values(state.serviceAreas || {}).filter(
      (z) => z.enabled
    );
    const enforceServiceAreas =
      state.serviceAreaConfig?.restrictOrdersToSelectedAreas === true;

    const pinConfigured = Boolean(state.securityConfig?.pinHash);
    const dupBlockerActive = state.securityConfig?.blockDuplicateUtr !== false;

    return {
      approvedRidersCount: approvedRiders.length,
      eligibleOnlineRidersCount: eligibleOnlineRiders.length,
      openApprovedStoresCount: openApprovedStores.length,
      pendingStoreApprovalsCount: pendingStoreApprovals.length,
      storesMissingGpsCount: storesMissingGps.length,
      staleUnassignedCount: staleUnassignedOrders.length,
      enabledZonesCount: enabledZones.length,
      enforceServiceAreas,
      pinConfigured,
      dupBlockerActive,
    };
  }, [state]);

  const queueItems: Array<{
    key: string;
    label: string;
    count: number;
    panel: AdminPanelId;
    tone: 'warning' | 'danger' | 'info' | 'success';
    icon: string;
  }> = [
    {
      key: 'unassigned',
      label: 'Unassigned Orders',
      count: stats.unassignedCount,
      panel: 'orders',
      tone: stats.unassignedCount > 0 ? 'warning' : 'success',
      icon: 'fa-motorcycle',
    },
    {
      key: 'upi',
      label: 'Pending UPI',
      count: stats.pendingUpiCount,
      panel: 'upi',
      tone: stats.pendingUpiCount > 0 ? 'info' : 'success',
      icon: 'fa-qrcode',
    },
    {
      key: 'products',
      label: 'Product Queue',
      count: stats.pendingProductsCount,
      panel: 'product-approvals',
      tone: stats.pendingProductsCount > 0 ? 'warning' : 'success',
      icon: 'fa-box-open',
    },
    {
      key: 'cod',
      label: 'COD Restricted',
      count: restrictedRiderCount,
      panel: 'settlements',
      tone: restrictedRiderCount > 0 ? 'danger' : 'success',
      icon: 'fa-ban',
    },
    {
      key: 'wallet',
      label: 'Wallet Requests',
      count: stats.pendingWalletCount,
      panel: 'wallet-requests',
      tone: stats.pendingWalletCount > 0 ? 'warning' : 'success',
      icon: 'fa-wallet',
    },
    {
      key: 'tickets',
      label: 'Open Tickets',
      count: stats.openFeedbackCount,
      panel: 'feedbacks',
      tone: stats.openFeedbackCount > 0 ? 'info' : 'success',
      icon: 'fa-comments',
    },
  ];

  const healthChecks: Array<{
    title: string;
    detail: string;
    status: 'ok' | 'warn' | 'crit';
    actionLabel?: string;
    onAction?: () => void;
  }> = [
    {
      title: 'Dispatch Fleet Readiness',
      detail: `${diagnostics.eligibleOnlineRidersCount} eligible online rider(s) out of ${diagnostics.approvedRidersCount} approved${restrictedRiderCount > 0 ? ` • ${restrictedRiderCount} COD-restricted` : ''}`,
      status:
        diagnostics.eligibleOnlineRidersCount > 0
          ? restrictedRiderCount > 0
            ? 'warn'
            : 'ok'
          : 'crit',
      actionLabel:
        restrictedRiderCount > 0 || flaggedRiderCount > 0
          ? 'Review COD'
          : 'Open Fleet',
      onAction: () =>
        onNavigatePanel(
          restrictedRiderCount > 0 ? 'settlements' : 'delivery'
        ),
    },
    {
      title: 'SLA Dispatch Watch (>20m)',
      detail:
        diagnostics.staleUnassignedCount > 0
          ? `${diagnostics.staleUnassignedCount} unassigned order(s) waiting >20 minutes`
          : 'No delayed unassigned orders waiting over 20m',
      status: diagnostics.staleUnassignedCount > 0 ? 'crit' : 'ok',
      actionLabel:
        stats.unassignedCount > 0 ? 'Auto-Dispatch' : 'View Orders',
      onAction:
        stats.unassignedCount > 0
          ? onAutoDispatchPending
          : () => onNavigatePanel('orders'),
    },
    {
      title: 'Service Area & Store Coverage',
      detail: `${diagnostics.enabledZonesCount} active zone(s) (${diagnostics.enforceServiceAreas ? 'Strict Enforce' : 'Advisory'}) • ${diagnostics.openApprovedStoresCount} open store(s)${diagnostics.storesMissingGpsCount > 0 ? ` • ${diagnostics.storesMissingGpsCount} missing GPS` : ''}`,
      status:
        diagnostics.enabledZonesCount === 0 ||
        diagnostics.storesMissingGpsCount > 0 ||
        diagnostics.pendingStoreApprovalsCount > 0
          ? 'warn'
          : 'ok',
      actionLabel:
        diagnostics.storesMissingGpsCount > 0 ||
        diagnostics.pendingStoreApprovalsCount > 0
          ? 'Fix Stores'
          : 'Manage Areas',
      onAction: () =>
        onNavigatePanel(
          diagnostics.storesMissingGpsCount > 0 ||
            diagnostics.pendingStoreApprovalsCount > 0
            ? 'stores'
            : 'service-areas'
        ),
    },
    {
      title: 'Security & Fraud Hardening',
      detail: `${scamScan.threats.length} active threat(s) • Terminal PIN: ${diagnostics.pinConfigured ? 'Set' : 'Not Set'} • Duplicate UTR Guard: ${diagnostics.dupBlockerActive ? 'ON' : 'OFF'}`,
      status:
        scamScan.threats.length > 0
          ? 'crit'
          : !diagnostics.pinConfigured || !diagnostics.dupBlockerActive
            ? 'warn'
            : 'ok',
      actionLabel: 'Security Center',
      onAction: () => onNavigatePanel('security'),
    },
  ];

  return (
    <div className="card system-health-card">
      <div className="card-title" style={{ marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i
            className="fa-solid fa-heart-pulse"
            style={{ color: '#0284c7' }}
          ></i>
          <span>Operations Queue &amp; Live System Diagnostics</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Audited {new Date(lastScannedAt).toLocaleTimeString()}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setLastScannedAt(Date.now())}
          >
            <i className="fa-solid fa-rotate"></i> Re-check
          </button>
        </div>
      </div>

      {/* 1-CLICK TRIAGE QUEUE */}
      <div className="triage-queue-strip">
        {queueItems.map((q) => (
          <button
            key={q.key}
            type="button"
            className={`triage-pill tone-${q.tone}`}
            onClick={() => onNavigatePanel(q.panel)}
          >
            <i className={`fa-solid ${q.icon}`}></i>
            <span>{q.label}</span>
            <strong className="triage-pill-count">{q.count}</strong>
          </button>
        ))}
      </div>

      {/* DIAGNOSTICS GRID */}
      <div className="health-diagnostics-grid">
        {healthChecks.map((chk) => (
          <div key={chk.title} className={`health-diag-item status-${chk.status}`}>
            <div className="health-diag-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span className={`health-dot status-${chk.status}`} />
                <strong style={{ fontSize: '0.82rem' }}>{chk.title}</strong>
              </div>
              {chk.actionLabel && chk.onAction && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ padding: '2px 8px', fontSize: '0.68rem' }}
                  onClick={chk.onAction}
                >
                  {chk.actionLabel}
                </button>
              )}
            </div>
            <div className="health-diag-detail">{chk.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
