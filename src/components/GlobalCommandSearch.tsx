import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanelId, AdminState } from '../types';

export interface CommandNavItem {
  id: AdminPanelId;
  label: string;
  icon: string;
  keywords: string;
}

const NAV_ITEMS: CommandNavItem[] = [
  { id: 'dashboard', label: 'Overview Radar (Dashboard)', icon: 'fa-chart-pie', keywords: 'home summary stats' },
  { id: 'product-approvals', label: 'Product Approvals Queue', icon: 'fa-circle-check', keywords: 'items catalog review' },
  { id: 'cms', label: 'Customer App Customizer (CMS)', icon: 'fa-palette', keywords: 'banners categories theme hero' },
  { id: 'controls', label: 'Limits & Panel Controls', icon: 'fa-sliders', keywords: 'fees commission cod upi coupons maintenance' },
  { id: 'service-areas', label: 'Service Area Controller', icon: 'fa-map-location-dot', keywords: 'geofence map zone radius delivery pin' },
  { id: 'orders', label: 'All Orders & Dispatch Engine', icon: 'fa-receipt', keywords: 'orders dispatch cancel print notes' },
  { id: 'upi', label: 'UPI Verifications & Screenshots', icon: 'fa-qrcode', keywords: 'utr payment verify' },
  { id: 'wallet-requests', label: 'Customer Wallets', icon: 'fa-wallet', keywords: 'deposit withdraw balance' },
  { id: 'rider-payouts', label: 'Rider Payouts', icon: 'fa-money-bill-transfer', keywords: 'earnings salary disbursal' },
  { id: 'settlements', label: 'Rider COD Cash & Smart Auto-Settle', icon: 'fa-hand-holding-dollar', keywords: 'cod cash limit settle radar risk' },
  { id: 'store-payouts', label: 'Store Payouts', icon: 'fa-building-columns', keywords: 'merchant settlement pay' },
  { id: 'stores', label: 'Stores & Catalogs', icon: 'fa-store', keywords: 'restaurants shops grocery' },
  { id: 'delivery', label: 'Fleet GPS Radar & Riders', icon: 'fa-motorcycle', keywords: 'delivery partners gps ratings' },
  { id: 'customers', label: 'Customers & Spam Guard', icon: 'fa-user-shield', keywords: 'users ban referral' },
  { id: 'security', label: 'Security Center & Audit Log', icon: 'fa-shield-halved', keywords: 'scam utr pin threats logs' },
  { id: 'feedbacks', label: 'Helpline & Feedback Tickets', icon: 'fa-comments', keywords: 'support complaints' },
  { id: 'reports', label: 'Financials & Profit Reports', icon: 'fa-chart-line', keywords: 'revenue profit commission' },
];

type SearchScope = 'ALL' | 'PANELS' | 'ORDERS' | 'STORES' | 'RIDERS' | 'CUSTOMERS';

type SearchResultItem =
  | {
      kind: 'panel';
      key: string;
      title: string;
      subtitle: string;
      badge: string;
      badgeClass: string;
      icon: string;
      panelId: AdminPanelId;
    }
  | {
      kind: 'order';
      key: string;
      title: string;
      subtitle: string;
      badge: string;
      badgeClass: string;
      icon: string;
      orderId: string;
    }
  | {
      kind: 'store';
      key: string;
      title: string;
      subtitle: string;
      badge: string;
      badgeClass: string;
      icon: string;
      storeUid: string;
    }
  | {
      kind: 'rider';
      key: string;
      title: string;
      subtitle: string;
      badge: string;
      badgeClass: string;
      icon: string;
      riderUid: string;
    }
  | {
      kind: 'customer';
      key: string;
      title: string;
      subtitle: string;
      badge: string;
      badgeClass: string;
      icon: string;
      customerUid: string;
    };

interface GlobalCommandSearchProps {
  open: boolean;
  state: AdminState;
  onClose: () => void;
  onNavigatePanel: (panel: AdminPanelId) => void;
  onOpenOrderDetail: (orderId: string) => void;
  onOpenManageStore: (uid: string) => void;
  onOpenManageRider: (uid: string) => void;
  onOpenManageCustomer: (uid: string) => void;
}

export const GlobalCommandSearch: React.FC<GlobalCommandSearchProps> = ({
  open,
  state,
  onClose,
  onNavigatePanel,
  onOpenOrderDetail,
  onOpenManageStore,
  onOpenManageRider,
  onOpenManageCustomer,
}) => {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('ALL');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setScope('ALL');
      setActiveIndex(0);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const results = useMemo<SearchResultItem[]>(() => {
    const rawQ = query.trim().toLowerCase();
    const qNoHash = rawQ.startsWith('#') ? rawQ.slice(1).trim() : rawQ;
    const items: SearchResultItem[] = [];

    const includePanels = scope === 'ALL' || scope === 'PANELS';
    const includeOrders = scope === 'ALL' || scope === 'ORDERS';
    const includeStores = scope === 'ALL' || scope === 'STORES';
    const includeRiders = scope === 'ALL' || scope === 'RIDERS';
    const includeCustomers = scope === 'ALL' || scope === 'CUSTOMERS';

    // 1. Admin Panels
    if (includePanels) {
      const matchedPanels = !rawQ
        ? scope === 'PANELS'
          ? NAV_ITEMS
          : NAV_ITEMS.slice(0, 8)
        : NAV_ITEMS.filter(
            (n) =>
              n.label.toLowerCase().includes(rawQ) ||
              n.keywords.toLowerCase().includes(rawQ) ||
              n.id.toLowerCase().includes(rawQ)
          );

      matchedPanels.forEach((n) => {
        items.push({
          kind: 'panel',
          key: `panel:${n.id}`,
          title: n.label,
          subtitle: 'Jump directly to admin panel',
          badge: 'PANEL',
          badgeClass: 'badge-info',
          icon: n.icon,
          panelId: n.id,
        });
      });
    }

    // 2. Orders (show latest when scoped to ORDERS and query empty, or match when searching)
    if (includeOrders && (rawQ || scope === 'ORDERS')) {
      const orderEntries = Object.entries(state.orders || {}).sort(
        (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)
      );
      const limit = scope === 'ORDERS' ? 15 : 6;
      let orderHits = 0;
      for (const [id, o] of orderEntries) {
        if (orderHits >= limit) break;
        const storeName = state.restaurants[o.restaurantId || '']?.name || 'Store';
        const searchable = [
          id,
          id.slice(-6),
          `#${id.slice(-6)}`,
          o.phone,
          o.deliveryOtp,
          o.transactionId,
          o.address,
          o.orderNotes,
          storeName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const matches =
          !rawQ ||
          searchable.includes(rawQ) ||
          (qNoHash.length > 0 && searchable.includes(qNoHash));

        if (matches) {
          orderHits++;
          items.push({
            kind: 'order',
            key: `order:${id}`,
            title: `Order #${id.slice(-6)} • ₹${Number(o.totalAmount || 0).toFixed(0)} (${o.paymentMode || 'COD'})`,
            subtitle: `${storeName} • ${o.phone || 'N/A'}${o.orderNotes ? ` • Note: ${o.orderNotes}` : ''}`,
            badge: o.status || 'PLACED',
            badgeClass:
              o.status === 'DELIVERED'
                ? 'badge-success'
                : o.status === 'CANCELLED'
                  ? 'badge-danger'
                  : 'badge-warning',
            icon: 'fa-receipt',
            orderId: id,
          });
        }
      }
    }

    // 3. Stores
    if (includeStores && (rawQ || scope === 'STORES')) {
      const limit = scope === 'STORES' ? 15 : 5;
      let storeHits = 0;
      for (const [uid, s] of Object.entries(state.restaurants || {})) {
        if (storeHits >= limit) break;
        const searchable = [uid, s.name, s.phone, s.cuisine, s.address]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!rawQ || searchable.includes(rawQ)) {
          storeHits++;
          items.push({
            kind: 'store',
            key: `store:${uid}`,
            title: s.name || 'Store',
            subtitle: `${s.phone || 'N/A'} • ${s.address || s.cuisine || 'Grocery Store'}`,
            badge: s.suspended
              ? 'SUSPENDED'
              : s.approved
                ? s.isOpen !== false
                  ? 'OPEN'
                  : 'CLOSED'
                : 'PENDING',
            badgeClass: s.suspended
              ? 'badge-danger'
              : s.approved
                ? 'badge-success'
                : 'badge-warning',
            icon: 'fa-store',
            storeUid: uid,
          });
        }
      }
    }

    // 4. Riders
    if (includeRiders && (rawQ || scope === 'RIDERS')) {
      const limit = scope === 'RIDERS' ? 15 : 5;
      let riderHits = 0;
      for (const [uid, r] of Object.entries(state.deliveryPartners || {})) {
        if (riderHits >= limit) break;
        const searchable = [uid, r.name, r.phone, r.vehicle, r.upiId]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!rawQ || searchable.includes(rawQ)) {
          riderHits++;
          items.push({
            kind: 'rider',
            key: `rider:${uid}`,
            title: `${r.name || 'Rider'} (${r.vehicle || 'Bike'})`,
            subtitle: `${r.phone || 'N/A'} • ${r.codAssignmentRestricted ? '🚫 COD Restricted' : r.online ? '🟢 Online' : 'Offline'}`,
            badge: r.codAssignmentRestricted
              ? 'RESTRICTED'
              : r.online
                ? 'ONLINE'
                : 'RIDER',
            badgeClass: r.codAssignmentRestricted
              ? 'badge-danger'
              : r.online
                ? 'badge-success'
                : 'badge-muted',
            icon: 'fa-motorcycle',
            riderUid: uid,
          });
        }
      }
    }

    // 5. Customers
    if (includeCustomers && (rawQ || scope === 'CUSTOMERS')) {
      const limit = scope === 'CUSTOMERS' ? 15 : 5;
      let custHits = 0;
      for (const [uid, c] of Object.entries(state.customers || {})) {
        if (custHits >= limit) break;
        const searchable = [uid, c.name, c.phone, c.email, c.referralCode, c.address]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!rawQ || searchable.includes(rawQ)) {
          custHits++;
          items.push({
            kind: 'customer',
            key: `customer:${uid}`,
            title: c.name || 'Customer',
            subtitle: `${c.phone || 'N/A'} • Wallet: ₹${Number(c.walletBalance || 0).toFixed(0)}`,
            badge: c.blocked ? 'BANNED' : 'CUSTOMER',
            badgeClass: c.blocked ? 'badge-danger' : 'badge-info',
            icon: 'fa-user',
            customerUid: uid,
          });
        }
      }
    }

    return items.slice(0, 20);
  }, [query, scope, state]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, scope]);

  useEffect(() => {
    const container = resultsContainerRef.current;
    if (!container) return;
    const activeEl = container.querySelector<HTMLElement>(
      `[data-result-idx="${activeIndex}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const executeItem = (item: SearchResultItem) => {
    onClose();
    if (item.kind === 'panel') {
      onNavigatePanel(item.panelId);
    } else if (item.kind === 'order') {
      onOpenOrderDetail(item.orderId);
    } else if (item.kind === 'store') {
      onOpenManageStore(item.storeUid);
    } else if (item.kind === 'rider') {
      onOpenManageRider(item.riderUid);
    } else if (item.kind === 'customer') {
      onOpenManageCustomer(item.customerUid);
    }
  };

  if (!open) return null;

  return (
    <div
      className="modal-overlay active"
      style={{ zIndex: 10050, alignItems: 'flex-start', paddingTop: '8vh' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Search"
    >
      <div
        className="modal-content command-palette-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="command-palette-input-wrap">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Search Orders (#ID, phone, PIN, notes), Stores, Riders, Customers, or Panels..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((prev) =>
                  results.length > 0 ? (prev + 1) % results.length : 0
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((prev) =>
                  results.length > 0
                    ? (prev - 1 + results.length) % results.length
                    : 0
                );
              } else if (e.key === 'Enter' && results[activeIndex]) {
                e.preventDefault();
                executeItem(results[activeIndex]);
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              style={{ padding: '4px 8px', fontSize: '0.7rem' }}
              title="Clear search"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onClose}
            style={{ padding: '4px 9px', fontSize: '0.72rem' }}
          >
            ESC
          </button>
        </div>

        <div className="command-palette-scopes" role="tablist" aria-label="Search scope">
          {(
            [
              ['ALL', 'All'],
              ['PANELS', 'Panels'],
              ['ORDERS', 'Orders'],
              ['STORES', 'Stores'],
              ['RIDERS', 'Riders'],
              ['CUSTOMERS', 'Customers'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scope === key}
              className={`command-scope-pill ${scope === key ? 'active' : ''}`}
              onClick={() => {
                setScope(key);
                inputRef.current?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="command-palette-results" ref={resultsContainerRef}>
          {results.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '2rem 1rem',
                color: 'var(--text-muted)',
                fontSize: '0.84rem',
              }}
            >
              No matching panels, orders, stores, riders, or customers
              {query ? ` for "${query}"` : ''}.
            </div>
          ) : (
            results.map((item, idx) => (
              <button
                key={item.key}
                type="button"
                data-result-idx={idx}
                className={`command-result-row ${idx === activeIndex ? 'active' : ''}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => executeItem(item)}
              >
                <div className="command-result-left">
                  <div className="command-result-icon">
                    <i className={`fa-solid ${item.icon}`}></i>
                  </div>
                  <div style={{ textAlign: 'left', minWidth: 0 }}>
                    <div className="command-result-title">{item.title}</div>
                    <div className="command-result-sub">{item.subtitle}</div>
                  </div>
                </div>
                <span className={`badge ${item.badgeClass}`}>{item.badge}</span>
              </button>
            ))
          )}
        </div>

        <div className="command-palette-footer">
          <span>↑↓ Navigate • Enter Open • Esc Close</span>
          <span>Live Firebase RTDB Index</span>
        </div>
      </div>
    </div>
  );
};
