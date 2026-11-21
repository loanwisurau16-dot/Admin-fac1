import React from 'react';
import { AdminPanelId } from '../types';
import { SmartOrderInsights } from '../utils/smartInsights';
import { buildWhatsAppUrl } from '../utils/helpers';

interface SmartInsightsCardProps {
  insights: SmartOrderInsights;
  onInspectOrder: (orderId: string) => void;
  onAssignOrder: (orderId: string) => void;
  onAutoDispatchAll: () => void;
  onBatchAssignStore: (orderIds: string[]) => void;
  onNavigatePanel: (panel: AdminPanelId) => void;
}

export const SmartInsightsCard: React.FC<SmartInsightsCardProps> = ({
  insights,
  onInspectOrder,
  onAssignOrder,
  onAutoDispatchAll,
  onBatchAssignStore,
  onNavigatePanel,
}) => {
  const {
    bottlenecks,
    storeBatches,
    avgBasketValue,
    fulfillmentRate,
    codSharePercent,
    onlineSharePercent,
    peakWindowLabel,
    peakWindowCount,
    topItemName,
    topItemQty,
    deliveredTodayCount,
    revenueToday,
  } = insights;

  const unassignedDelayedCount = bottlenecks.filter(
    (b) => b.reason === 'UNASSIGNED_DELAY'
  ).length;

  return (
    <div className="card smart-insights-card">
      <div className="card-title" style={{ marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#0284c7' }}></i>
          <span>Smart Command Insights &amp; SLA Watch</span>
          {bottlenecks.length > 0 ? (
            <span className="badge badge-danger">
              {bottlenecks.length} Attention Needed
            </span>
          ) : (
            <span className="badge badge-success">SLA Healthy</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {unassignedDelayedCount > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onAutoDispatchAll}
            >
              <i className="fa-solid fa-bolt"></i> Dispatch {unassignedDelayedCount} Delayed
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onNavigatePanel('reports')}
          >
            <i className="fa-solid fa-chart-line"></i> Financials
          </button>
        </div>
      </div>

      {/* LIVE DEMAND & CONVERSION STRIP */}
      <div className="smart-kpi-strip">
        <div className="smart-kpi-box">
          <small>Today&apos;s Delivered</small>
          <strong style={{ color: 'var(--primary)' }}>
            {deliveredTodayCount} orders • ₹{revenueToday.toFixed(0)}
          </strong>
        </div>
        <div className="smart-kpi-box">
          <small>Avg Basket Value</small>
          <strong style={{ color: '#0284c7' }}>
            ₹{avgBasketValue.toFixed(0)}
          </strong>
        </div>
        <div className="smart-kpi-box">
          <small>Fulfillment Rate</small>
          <strong style={{ color: fulfillmentRate >= 85 ? '#059669' : '#d97706' }}>
            {fulfillmentRate}%
          </strong>
        </div>
        <div className="smart-kpi-box">
          <small>Peak Order Window</small>
          <strong style={{ color: '#7e22ce' }}>
            {peakWindowLabel}{' '}
            {peakWindowCount > 0 ? `(${peakWindowCount})` : ''}
          </strong>
        </div>
        <div className="smart-kpi-box">
          <small>Payment Mix (COD / UPI)</small>
          <strong>
            <span style={{ color: '#b45309' }}>{codSharePercent}% COD</span> /{' '}
            <span style={{ color: '#0284c7' }}>{onlineSharePercent}% Online</span>
          </strong>
        </div>
        <div className="smart-kpi-box">
          <small>Top Ordered Item</small>
          <strong title={topItemName} style={{ color: '#0f172a' }}>
            {topItemName} {topItemQty > 0 ? `(${topItemQty}×)` : ''}
          </strong>
        </div>
      </div>

      {/* SMART STORE BATCH SUGGESTIONS */}
      {storeBatches.length > 0 && (
        <div className="smart-batch-banner">
          <div className="smart-batch-title">
            <i className="fa-solid fa-layer-group" style={{ color: '#7e22ce' }}></i>
            <span>
              <strong>Smart Batch Dispatch Ready:</strong> Multiple unassigned orders at the same store can be assigned together
            </span>
          </div>
          <div className="smart-batch-chips">
            {storeBatches.slice(0, 4).map((b) => (
              <div key={b.storeId} className="smart-batch-chip">
                <div>
                  <strong>{b.storeName}</strong>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {b.orderIds.length} orders • ₹{b.totalValue.toFixed(0)} • Wait {b.oldestAgeMinutes}m
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onBatchAssignStore(b.orderIds)}
                >
                  <i className="fa-solid fa-motorcycle"></i> Batch Assign
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LIVE SLA BOTTLENECK WATCHLIST */}
      {bottlenecks.length > 0 && (
        <div className="smart-sla-section">
          <div className="smart-sla-header">
            <span>
              <i className="fa-solid fa-stopwatch" style={{ color: '#dc2626' }}></i>{' '}
              Live SLA Bottleneck Watch ({bottlenecks.length})
            </span>
            <small style={{ color: 'var(--text-muted)' }}>
              Sorted by urgency &amp; wait time
            </small>
          </div>
          <div className="smart-sla-list">
            {bottlenecks.slice(0, 5).map((item) => {
              const waTargetPhone =
                item.reason === 'TRANSIT_DELAY' || item.reason === 'SOS'
                  ? item.riderPhone || item.storePhone
                  : item.storePhone || item.riderPhone;
              const waMsg =
                item.reason === 'PREP_DELAY'
                  ? `Hello ${item.storeName}, Order #${item.orderId.slice(-6)} has been waiting ${item.ageMinutes} mins in prep. Please prioritize packing!`
                  : item.reason === 'TRANSIT_DELAY'
                    ? `Hello ${item.riderName || 'Rider'}, Order #${item.orderId.slice(-6)} has been out for delivery ${item.ageMinutes} mins. Please share status update.`
                    : `Hello, urgent check on Gossaigaon Bazar Order #${item.orderId.slice(-6)} (${item.ageMinutes} mins elapsed).`;
              const waUrl = buildWhatsAppUrl(waTargetPhone, waMsg);

              return (
                <div
                  key={item.orderId}
                  className={`smart-sla-row severity-${item.severity}`}
                >
                  <div className="smart-sla-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong>#{item.orderId.slice(-6)}</strong>
                      <span
                        className={`badge ${item.severity === 'critical' ? 'badge-danger' : 'badge-warning'}`}
                        style={{ fontSize: '0.64rem' }}
                      >
                        {item.reasonLabel}
                      </span>
                      <span className="sla-age-pill severity-crit">
                        ⏱ {item.ageMinutes}m elapsed
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      🏪 {item.storeName} • ₹{Number(item.order.totalAmount || 0).toFixed(0)}
                      {item.riderName ? ` • 🛵 ${item.riderName}` : ' • Unassigned'}
                    </div>
                  </div>
                  <div className="smart-sla-actions">
                    {!item.order.deliveryUid && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => onAssignOrder(item.orderId)}
                        title="Assign Rider"
                      >
                        <i className="fa-solid fa-motorcycle"></i> Assign
                      </button>
                    )}
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline btn-sm"
                        style={{ color: '#059669', borderColor: '#86efac' }}
                        title="Send WhatsApp SLA Nudge"
                      >
                        <i className="fa-brands fa-whatsapp"></i> Nudge
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => onInspectOrder(item.orderId)}
                    >
                      <i className="fa-solid fa-eye"></i> Inspect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
