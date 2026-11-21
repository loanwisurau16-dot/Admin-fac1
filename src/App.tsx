import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionDialogModal, DialogConfig } from './components/ActionDialogModal';
import { AdminModals, DisbursalTarget } from './components/AdminModals';
import { AuthScreen } from './components/AuthScreen';
import { CmsPanel, ControlsPanel } from './components/CmsAndControlsPanels';
import { GlobalCommandSearch } from './components/GlobalCommandSearch';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PushNotificationModal } from './components/PushNotificationModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import {
  DeliveryFleetMapsProvider,
  RiderMiniMap,
} from './components/RiderMiniMap';
import { RevenueTrendChart } from './components/RevenueTrendChart';
import { ScheduledReportsCard } from './components/ScheduledReportsCard';
import {
  ProductApprovalsPanel,
  ProductFilterTab,
} from './components/ProductApprovalsPanel';
import { SecurityCenterPanel } from './components/SecurityCenterPanel';
import { ServiceAreasPanel } from './components/ServiceAreasPanel';
import { SessionLockModal } from './components/SessionLockModal';
import { SmartAutoSettlePanel } from './components/SmartAutoSettlePanel';
import { SmartInsightsCard } from './components/SmartInsightsCard';
import { SystemHealthCard } from './components/SystemHealthCard';
import { auth, db } from './firebase';
import {
  AdminPanelId,
  AdminState,
  DEFAULT_CATEGORIES,
  OrderItem,
  OrderRecord,
  ReportDispatchLogRecord,
  ScheduledReportConfig,
  SecurityAuditLogRecord,
  SecurityConfig,
  ServiceAreaConfig,
  ServiceAreaZone,
  SettlementRecord,
  SmartAutoSettleConfig,
} from './types';
import {
  buildWhatsAppUrl,
  calculateDistanceKm,
  playOrderChime,
  sanitizeText,
} from './utils/helpers';
import {
  computeNextReportRunAt,
  GeneratedPdfReport,
  generateExecutivePdfReport,
} from './utils/pdfReportGenerator';
import {
  PushPrefs,
  dispatchAdminPushNotification,
  getNotificationPermissionState,
  loadPushPrefs,
  requestPushPermission,
  savePushPrefs,
} from './utils/pushNotifications';
import {
  isValidUtrFormat,
  logSecurityEvent,
  normalizeUtr,
  scanScamThreats,
} from './utils/security';
import { analyzeRiderCodCompliance } from './utils/smartAutoSettle';
import {
  computeSmartOrderInsights,
  scoreRiderForOrder,
} from './utils/smartInsights';

interface ToastItem {
  id: number;
  msg: string;
  type: 'success' | 'danger' | 'info' | 'warning';
}

const INITIAL_STATE: AdminState = {
  orders: {},
  restaurants: {},
  menus: {},
  deliveryPartners: {},
  customers: {},
  settlements: {},
  storePayouts: {},
  riderPayouts: {},
  walletRequests: {},
  feedbacks: {},
  settings: {},
  securityConfig: {},
  securityLogs: {},
  dismissedThreatKeys: {},
  serviceAreas: {},
  serviceAreaConfig: {},
  smartAutoSettleConfig: {},
  scheduledReportConfig: {},
  reportDispatchLogs: {},
};

const PANEL_TITLES: Record<AdminPanelId, string> = {
  dashboard: 'Dashboard Overview Radar',
  'product-approvals': '✅ Product Verification & Approval Queue',
  cms: '🎨 Full Customer App Customizer (CMS)',
  controls: '🎛️ All Limits & Panel Controls',
  'service-areas': '📍 Selected Area Service Controller',
  orders: 'All Orders (2/3 Per Row & Cancel)',
  upi: 'UPI Verifications, Screenshots & Refunds',
  'wallet-requests': '💳 Customer Wallet Deposits & Withdrawals',
  'rider-payouts': 'Rider Earnings Disbursals',
  settlements: 'Rider COD Cash Settlements',
  'store-payouts': 'Store Payout Requests',
  stores: 'Stores Full Details & Catalog Control',
  delivery: 'Fleet GPS Radar, Ratings & Rider Manager',
  customers: 'Customers, Wallets, Referrals & Spam Guard',
  security: '🛡️ Hacker, Scam & Security Center',
  feedbacks: '💬 All-Panel Helpline & Feedbacks',
  reports: 'Financials & Commission Profit',
};

function getStatusBadge(status?: string) {
  const s = status || 'PLACED';
  let badgeClass = 'badge-info';
  if (s === 'DELIVERED') badgeClass = 'badge-success';
  if (s === 'CANCELLED') badgeClass = 'badge-danger';
  if (
    s === 'PENDING_PAYMENT' ||
    s === 'PREPARING' ||
    s === 'PACKING' ||
    s === 'READY_FOR_PICKUP'
  ) {
    badgeClass = 'badge-warning';
  }
  return (
    <span className={`badge ${badgeClass}`}>
      {s === 'PREPARING'
        ? 'PACKING'
        : s === 'PENDING_PAYMENT'
          ? 'PENDING PAYMENT'
          : s}
    </span>
  );
}

export default function App() {
  const [authUser, setAuthUser] = useState<{ email: string; uid: string } | null>(
    null
  );
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState('');

  const [state, setState] = useState<AdminState>(INITIAL_STATE);
  const [activePanel, setActivePanel] = useState<AdminPanelId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sound & Push Notification State
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  soundEnabledRef.current = soundEnabled;

  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getNotificationPermissionState());
  const [pushPrefs, setPushPrefs] = useState<PushPrefs>(() => loadPushPrefs());
  const pushPrefsRef = useRef(pushPrefs);
  pushPrefsRef.current = pushPrefs;
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [showPushPromptBanner, setShowPushPromptBanner] = useState(true);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback(
    (
      msg: string,
      type: 'success' | 'danger' | 'info' | 'warning' = 'success'
    ) => {
      const id = ++toastIdRef.current;
      setToasts((prev) => [...prev, { id, msg, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  // Filters & Search
  const [prodApprovalFilter, setProdApprovalFilter] =
    useState<ProductFilterTab>('PENDING');
  const [orderLayout, setOrderLayout] = useState<'grid3' | 'grid2' | 'table'>(
    'grid3'
  );
  const [orderSortBy, setOrderSortBy] = useState<
    'NEWEST' | 'OLDEST' | 'HIGHEST_VALUE' | 'URGENT_SOS'
  >('NEWEST');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [orderSearch, setOrderSearch] = useState('');
  const [storeSearch, setStoreSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState<
    'ALL' | 'APPROVED' | 'PENDING' | 'OPEN' | 'SUSPENDED' | 'NO_GPS'
  >('ALL');
  const [riderSearch, setRiderSearch] = useState('');
  const [riderFilter, setRiderFilter] = useState<
    'ALL' | 'ONLINE' | 'RESTRICTED' | 'FLAGGED' | 'PENDING' | 'SUSPENDED'
  >('ALL');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState<
    'ALL' | 'ACTIVE' | 'BANNED' | 'WALLET' | 'SPAM'
  >('ALL');
  const [feedbackFilter, setFeedbackFilter] = useState('ALL');
  const [commandSearchOpen, setCommandSearchOpen] = useState(false);

  // Modals State
  const [screenshotModal, setScreenshotModal] = useState<{
    src: string;
    title: string;
  } | null>(null);
  const [disbursalTarget, setDisbursalTarget] = useState<DisbursalTarget | null>(
    null
  );
  const [assignOrderId, setAssignOrderId] = useState<string | null>(null);
  const [bulkAssignOrderIds, setBulkAssignOrderIds] = useState<string[] | null>(
    null
  );
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [manageCustomerUid, setManageCustomerUid] = useState<string | null>(
    null
  );
  const [manageRiderUid, setManageRiderUid] = useState<string | null>(null);
  const [manageStoreUid, setManageStoreUid] = useState<string | null>(null);
  const [dialogConfig, setDialogConfig] = useState<DialogConfig | null>(null);
  const [printOrder, setPrintOrder] = useState<{
    id: string;
    order: OrderRecord;
  } | null>(null);
  const [printedOrderMap, setPrintedOrderMap] = useState<
    Record<string, number>
  >({});
  const [orderNoteDrafts, setOrderNoteDrafts] = useState<
    Record<string, string>
  >({});
  const [savingNoteOrderId, setSavingNoteOrderId] = useState<string | null>(
    null
  );
  const [updatingOrderStatusId, setUpdatingOrderStatusId] = useState<
    string | null
  >(null);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Hacker Protection: Session Auto-Lock & Manual Terminal Lock
  const [isTerminalLocked, setIsTerminalLocked] = useState(false);
  const [lockReason, setLockReason] = useState<'idle' | 'manual'>('idle');
  const lastActivityRef = useRef<number>(Date.now());

  const lockTerminalNow = useCallback(
    (reason: 'idle' | 'manual' = 'manual') => {
      setLockReason(reason);
      setIsTerminalLocked(true);
      if (authUser) {
        void logSecurityEvent({
          eventType: 'SESSION_LOCKED',
          actorEmail: authUser.email,
          details:
            reason === 'idle'
              ? 'Terminal auto-locked after idle timeout.'
              : 'Terminal manually locked by administrator.',
          severity: 'INFO',
        });
      }
    },
    [authUser]
  );

  useEffect(() => {
    if (
      !authUser ||
      isTerminalLocked ||
      !state.securityConfig?.autoLockEnabled ||
      !state.securityConfig?.pinHash
    ) {
      return;
    }

    const timeoutMs =
      Math.max(1, Number(state.securityConfig.autoLockMinutes || 5)) * 60_000;
    lastActivityRef.current = Date.now();

    const bumpActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'scroll',
      'touchstart',
    ];
    events.forEach((ev) =>
      window.addEventListener(ev, bumpActivity, { passive: true })
    );

    const intervalId = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        lockTerminalNow('idle');
      }
    }, 15_000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bumpActivity));
      window.clearInterval(intervalId);
    };
  }, [
    authUser,
    isTerminalLocked,
    state.securityConfig?.autoLockEnabled,
    state.securityConfig?.autoLockMinutes,
    state.securityConfig?.pinHash,
    lockTerminalNow,
  ]);

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () =>
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    if (!authUser || isTerminalLocked) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [authUser, isTerminalLocked]);

  // Known ID sets for accurate real-time push notifications after initial hydration
  const knownOrdersRef = useRef<Set<string> | null>(null);
  const knownSosOrdersRef = useRef<Set<string> | null>(null);
  const knownPendingUpiRef = useRef<Set<string> | null>(null);
  const knownPendingProductsRef = useRef<Set<string> | null>(null);
  const knownWalletReqRef = useRef<Set<string> | null>(null);
  const knownRiderPayoutsRef = useRef<Set<string> | null>(null);
  const knownStorePayoutsRef = useRef<Set<string> | null>(null);
  const knownSettlementsRef = useRef<Set<string> | null>(null);
  const knownFeedbacksRef = useRef<Set<string> | null>(null);
  const reportTriggerLockRef = useRef<number>(0);
  const [latestGeneratedReport, setLatestGeneratedReport] =
    useState<GeneratedPdfReport | null>(null);

  const switchPanel = useCallback(
    (panelName: AdminPanelId, pushHistory = true) => {
      setActivePanel(panelName);
      if (window.innerWidth <= 900) setSidebarOpen(false);
      if (pushHistory) {
        window.history.pushState({ screen: panelName }, '');
      }
    },
    []
  );

  // Handle initial URL query ?panel=... and Service Worker notification clicks
  useEffect(() => {
    window.history.replaceState({ screen: 'dashboard' }, '');
    const params = new URLSearchParams(window.location.search);
    const initialPanel = params.get('panel') as AdminPanelId | null;
    const initialOrderId = params.get('orderId');
    if (initialPanel && PANEL_TITLES[initialPanel]) {
      setActivePanel(initialPanel);
    }
    if (initialOrderId) {
      setDetailOrderId(initialOrderId);
    }

    const handleCustomNavigate = (e: Event) => {
      const detail = (e as CustomEvent<{ panel?: AdminPanelId; orderId?: string }>)
        .detail;
      if (detail?.panel && PANEL_TITLES[detail.panel]) {
        switchPanel(detail.panel);
      }
      if (detail?.orderId) {
        setDetailOrderId(detail.orderId);
      }
    };

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE_PANEL') {
        const panel = event.data.panel as AdminPanelId | undefined;
        const orderId = event.data.orderId as string | undefined;
        if (panel && PANEL_TITLES[panel]) {
          switchPanel(panel);
        }
        if (orderId) {
          setDetailOrderId(orderId);
        }
      }
    };

    window.addEventListener('gb-push-navigate', handleCustomNavigate);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      window.removeEventListener('gb-push-navigate', handleCustomNavigate);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [switchPanel]);

  // Browser back button / Android gesture handling for modals & panels
  useEffect(() => {
    const handlePopState = () => {
      if (commandSearchOpen) {
        setCommandSearchOpen(false);
        return;
      }
      if (screenshotModal) {
        setScreenshotModal(null);
        return;
      }
      if (dialogConfig) {
        setDialogConfig(null);
        return;
      }
      if (pushModalOpen) {
        setPushModalOpen(false);
        return;
      }
      if (disbursalTarget) {
        setDisbursalTarget(null);
        return;
      }
      if (assignOrderId) {
        setAssignOrderId(null);
        return;
      }
      if (bulkAssignOrderIds) {
        setBulkAssignOrderIds(null);
        return;
      }
      if (detailOrderId) {
        setDetailOrderId(null);
        return;
      }
      if (manageCustomerUid) {
        setManageCustomerUid(null);
        return;
      }
      if (manageRiderUid) {
        setManageRiderUid(null);
        return;
      }
      if (manageStoreUid) {
        setManageStoreUid(null);
        return;
      }
      if (activePanel !== 'dashboard') {
        switchPanel('dashboard', false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    commandSearchOpen,
    screenshotModal,
    dialogConfig,
    pushModalOpen,
    disbursalTarget,
    assignOrderId,
    bulkAssignOrderIds,
    detailOrderId,
    manageCustomerUid,
    manageRiderUid,
    manageStoreUid,
    activePanel,
    switchPanel,
  ]);

  // Auth listener with security isolation check
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const [custSnap, restSnap, delSnap] = await Promise.all([
            db.ref(`customers/${user.uid}`).once('value'),
            db.ref(`restaurants/${user.uid}`).once('value'),
            db.ref(`deliveryPartners/${user.uid}`).once('value'),
          ]);
          if (custSnap.exists() || restSnap.exists() || delSnap.exists()) {
            void logSecurityEvent({
              eventType: 'LOGIN_FAILED',
              actorEmail: user.email || user.uid,
              targetId: user.uid,
              details: 'Blocked non-admin role account login attempt.',
              severity: 'CRITICAL',
            });
            await auth.signOut();
            setAuthUser(null);
            setAuthError(
              '🚨 SECURITY BLOCK: Only isolated Admin accounts can access this console!'
            );
            setAuthChecked(true);
            return;
          }
        } catch {
          // continue if permission rules restrict checking other nodes
        }
        const email = user.email || 'Admin';
        setAuthUser({ email, uid: user.uid });
        setAuthChecked(true);
        lastActivityRef.current = Date.now();
        showToast(`Command Center Online: ${email}`, 'success');
        void logSecurityEvent({
          eventType: 'LOGIN_SUCCESS',
          actorEmail: email,
          targetId: user.uid,
          details: 'Admin authenticated successfully.',
          severity: 'INFO',
        });
      } else {
        setAuthUser(null);
        setAuthChecked(true);
        setIsTerminalLocked(false);
        setState(INITIAL_STATE);
        knownOrdersRef.current = null;
        knownSosOrdersRef.current = null;
        knownPendingUpiRef.current = null;
        knownPendingProductsRef.current = null;
        knownWalletReqRef.current = null;
        knownRiderPayoutsRef.current = null;
        knownStorePayoutsRef.current = null;
        knownSettlementsRef.current = null;
        knownFeedbacksRef.current = null;
      }
    });

    return () => unsubscribe();
  }, [showToast]);

  // Helper to send OS push notification if enabled
  const maybePushNotify = useCallback(
    (
      category: keyof Omit<PushPrefs, 'enabled'>,
      title: string,
      body: string,
      panel: AdminPanelId,
      orderId?: string,
      requireInteraction = false
    ) => {
      const p = pushPrefsRef.current;
      if (!p.enabled || !p[category]) return;
      void dispatchAdminPushNotification({
        title,
        body,
        panel,
        orderId,
        requireInteraction,
      });
    },
    []
  );

  // Realtime Firebase DB listeners (attached only when verified Admin is logged in)
  useEffect(() => {
    if (!authUser) return;

    const ordersRef = db.ref('orders');
    const restaurantsRef = db.ref('restaurants');
    const menusRef = db.ref('menus');
    const deliveryRef = db.ref('deliveryPartners');
    const customersRef = db.ref('customers');
    const settlementsRef = db.ref('settlements');
    const storePayoutsRef = db.ref('storePayouts');
    const riderPayoutsRef = db.ref('riderPayouts');
    const walletRequestsRef = db.ref('walletRequests');
    const feedbacksRef = db.ref('feedbacks');
    const settingsRef = db.ref('admin/settings');
    const securityConfigRef = db.ref('admin/securityConfig');
    const securityLogsRef = db.ref('admin/securityLogs');
    const dismissedThreatsRef = db.ref('admin/dismissedThreats');
    const serviceAreasRef = db.ref('admin/serviceAreas');
    const serviceAreaConfigRef = db.ref('admin/serviceAreaConfig');
    const smartAutoSettleConfigRef = db.ref('admin/smartAutoSettleConfig');
    const scheduledReportConfigRef = db.ref('admin/scheduledReportConfig');
    const reportDispatchLogsRef = db.ref('admin/reportDispatchLogs');

    const onOrders = (snap: { val: () => Record<string, OrderRecord> | null }) => {
      const nextOrders = snap.val() || {};
      const orderIds = Object.keys(nextOrders);

      if (knownOrdersRef.current !== null) {
        const newIds = orderIds.filter((id) => !knownOrdersRef.current!.has(id));
        if (newIds.length > 0) {
          playOrderChime(soundEnabledRef.current);
          showToast('🔔 New Grocery Order Received!', 'success');
          const firstId = newIds[0];
          const firstOrder = nextOrders[firstId];
          maybePushNotify(
            'orders',
            `🛒 New Order #${firstId.slice(-6)} (₹${Number(firstOrder?.totalAmount || 0).toFixed(0)})`,
            `${firstOrder?.phone || 'Customer'} • ${firstOrder?.paymentMode || 'COD'}${firstOrder?.isSpamSuspect ? ' • 🚨 SPAM FLAGGED' : ''}`,
            'orders',
            firstId,
            Boolean(firstOrder?.isSpamSuspect)
          );
        }

        // Urgent UPI verification check
        orderIds.forEach((id) => {
          const o = nextOrders[id];
          const isPendingUpi =
            o.paymentMode === 'UPI' &&
            o.paymentStatus === 'PENDING_VERIFICATION' &&
            o.status !== 'CANCELLED';
          if (isPendingUpi && knownPendingUpiRef.current && !knownPendingUpiRef.current.has(id)) {
            maybePushNotify(
              'upi',
              `📱 UPI Proof Received #${id.slice(-6)}`,
              `Verify ₹${Number(o.totalAmount || 0).toFixed(0)} (UTR: ${o.transactionId || 'N/A'}) to unlock dispatch.`,
              'upi',
              id,
              true
            );
          }

          if (o.emergencyAlert && knownSosOrdersRef.current && !knownSosOrdersRef.current.has(id)) {
            playOrderChime(soundEnabledRef.current);
            showToast(`🚨 Rider SOS Alert on Order #${id.slice(-6)}!`, 'danger');
            maybePushNotify(
              'helplineAndSos',
              `🚨 RIDER SOS ALERT #${id.slice(-6)}`,
              `Emergency reported by rider for ${o.phone || 'customer'}! Tap to inspect.`,
              'orders',
              id,
              true
            );
          }
        });
      }

      knownOrdersRef.current = new Set(orderIds);
      knownPendingUpiRef.current = new Set(
        orderIds.filter((id) => {
          const o = nextOrders[id];
          return (
            o.paymentMode === 'UPI' &&
            o.paymentStatus === 'PENDING_VERIFICATION' &&
            o.status !== 'CANCELLED'
          );
        })
      );
      knownSosOrdersRef.current = new Set(
        orderIds.filter((id) => nextOrders[id]?.emergencyAlert === true)
      );

      setState((prev) => ({ ...prev, orders: nextOrders }));
    };

    const onRestaurants = (snap: { val: () => AdminState['restaurants'] | null }) => {
      const val = snap.val() || {};
      setState((prev) => ({ ...prev, restaurants: val }));
    };

    const onMenus = (snap: { val: () => AdminState['menus'] | null }) => {
      const val = snap.val() || {};
      const pendingKeys = new Set<string>();
      Object.entries(val).forEach(([storeId, items]) => {
        Object.entries(items || {}).forEach(([itemId, item]) => {
          if (item.adminApproved !== true && item.approvalStatus !== 'REJECTED') {
            pendingKeys.add(`${storeId}/${itemId}`);
          }
        });
      });

      if (knownPendingProductsRef.current !== null) {
        const added = Array.from(pendingKeys).filter(
          (k) => !knownPendingProductsRef.current!.has(k)
        );
        if (added.length > 0) {
          maybePushNotify(
            'products',
            '📦 New Product Pending Approval',
            `${added.length} new store item(s) waiting for Admin verification.`,
            'product-approvals'
          );
        }
      }
      knownPendingProductsRef.current = pendingKeys;
      setState((prev) => ({ ...prev, menus: val }));
    };

    const onDelivery = (snap: { val: () => AdminState['deliveryPartners'] | null }) => {
      setState((prev) => ({ ...prev, deliveryPartners: snap.val() || {} }));
    };

    const onCustomers = (snap: { val: () => AdminState['customers'] | null }) => {
      setState((prev) => ({ ...prev, customers: snap.val() || {} }));
    };

    const onSettlements = (snap: { val: () => AdminState['settlements'] | null }) => {
      const val = snap.val() || {};
      const pending = new Set(
        Object.entries(val)
          .filter(([, s]) => s.status === 'PENDING')
          .map(([id]) => id)
      );
      if (knownSettlementsRef.current !== null) {
        const added = Array.from(pending).filter(
          (id) => !knownSettlementsRef.current!.has(id)
        );
        if (added.length > 0) {
          const s = val[added[0]];
          maybePushNotify(
            'payoutsAndWallets',
            '💵 Rider COD Cash Deposit Request',
            `${s?.riderName || 'Rider'} submitted ₹${Number(s?.amount || 0).toFixed(0)} COD handover.`,
            'settlements'
          );
        }
      }
      knownSettlementsRef.current = pending;
      setState((prev) => ({ ...prev, settlements: val }));
    };

    const onStorePayouts = (snap: { val: () => AdminState['storePayouts'] | null }) => {
      const val = snap.val() || {};
      const pending = new Set(
        Object.entries(val)
          .filter(([, p]) => p.status === 'PENDING')
          .map(([id]) => id)
      );
      if (knownStorePayoutsRef.current !== null) {
        const added = Array.from(pending).filter(
          (id) => !knownStorePayoutsRef.current!.has(id)
        );
        if (added.length > 0) {
          const p = val[added[0]];
          maybePushNotify(
            'payoutsAndWallets',
            '🏪 Store Payout Request',
            `${p?.storeName || 'Store'} requested ₹${Number(p?.amount || 0).toFixed(0)}.`,
            'store-payouts'
          );
        }
      }
      knownStorePayoutsRef.current = pending;
      setState((prev) => ({ ...prev, storePayouts: val }));
    };

    const onRiderPayouts = (snap: { val: () => AdminState['riderPayouts'] | null }) => {
      const val = snap.val() || {};
      const pending = new Set(
        Object.entries(val)
          .filter(([, p]) => p.status === 'PENDING')
          .map(([id]) => id)
      );
      if (knownRiderPayoutsRef.current !== null) {
        const added = Array.from(pending).filter(
          (id) => !knownRiderPayoutsRef.current!.has(id)
        );
        if (added.length > 0) {
          const p = val[added[0]];
          maybePushNotify(
            'payoutsAndWallets',
            '🛵 Rider Payout Withdrawal',
            `${p?.riderName || 'Rider'} requested ₹${Number(p?.amount || 0).toFixed(0)}.`,
            'rider-payouts'
          );
        }
      }
      knownRiderPayoutsRef.current = pending;
      setState((prev) => ({ ...prev, riderPayouts: val }));
    };

    const onWalletRequests = (snap: { val: () => AdminState['walletRequests'] | null }) => {
      const val = snap.val() || {};
      const pending = new Set(
        Object.entries(val)
          .filter(([, r]) => r.status === 'PENDING')
          .map(([id]) => id)
      );
      if (knownWalletReqRef.current !== null) {
        const added = Array.from(pending).filter(
          (id) => !knownWalletReqRef.current!.has(id)
        );
        if (added.length > 0) {
          const r = val[added[0]];
          maybePushNotify(
            'payoutsAndWallets',
            `💳 Wallet ${r?.type || 'Request'}`,
            `${r?.customerName || 'Customer'} • ₹${Number(r?.amount || 0).toFixed(0)}`,
            'wallet-requests'
          );
        }
      }
      knownWalletReqRef.current = pending;
      setState((prev) => ({ ...prev, walletRequests: val }));
    };

    const onFeedbacks = (snap: { val: () => AdminState['feedbacks'] | null }) => {
      const val = snap.val() || {};
      const openIds = new Set(
        Object.entries(val)
          .filter(([, f]) => f.status !== 'RESOLVED')
          .map(([id]) => id)
      );
      if (knownFeedbacksRef.current !== null) {
        const added = Array.from(openIds).filter(
          (id) => !knownFeedbacksRef.current!.has(id)
        );
        if (added.length > 0) {
          const f = val[added[0]];
          maybePushNotify(
            'helplineAndSos',
            `💬 New Helpline Ticket (${f?.role || 'USER'})`,
            `${f?.name || 'User'}: ${f?.subject || 'Feedback received'}`,
            'feedbacks'
          );
        }
      }
      knownFeedbacksRef.current = openIds;
      setState((prev) => ({ ...prev, feedbacks: val }));
    };

    const onSettings = (snap: { val: () => AdminState['settings'] | null }) => {
      setState((prev) => ({ ...prev, settings: snap.val() || {} }));
    };

    const onSecurityConfig = (snap: { val: () => SecurityConfig | null }) => {
      setState((prev) => ({ ...prev, securityConfig: snap.val() || {} }));
    };

    const onSecurityLogs = (snap: {
      val: () => Record<string, SecurityAuditLogRecord> | null;
    }) => {
      setState((prev) => ({ ...prev, securityLogs: snap.val() || {} }));
    };

    const onDismissedThreats = (snap: {
      val: () => Record<string, boolean> | null;
    }) => {
      setState((prev) => ({ ...prev, dismissedThreatKeys: snap.val() || {} }));
    };

    const onServiceAreas = (snap: {
      val: () => Record<string, ServiceAreaZone> | null;
    }) => {
      setState((prev) => ({ ...prev, serviceAreas: snap.val() || {} }));
    };

    const onServiceAreaConfig = (snap: {
      val: () => ServiceAreaConfig | null;
    }) => {
      setState((prev) => ({ ...prev, serviceAreaConfig: snap.val() || {} }));
    };

    const onSmartAutoSettleConfig = (snap: {
      val: () => SmartAutoSettleConfig | null;
    }) => {
      setState((prev) => ({
        ...prev,
        smartAutoSettleConfig: snap.val() || {},
      }));
    };

    const onScheduledReportConfig = (snap: {
      val: () => ScheduledReportConfig | null;
    }) => {
      setState((prev) => ({
        ...prev,
        scheduledReportConfig: snap.val() || {},
      }));
    };

    const onReportDispatchLogs = (snap: {
      val: () => Record<string, ReportDispatchLogRecord> | null;
    }) => {
      setState((prev) => ({
        ...prev,
        reportDispatchLogs: snap.val() || {},
      }));
    };

    ordersRef.on('value', onOrders);
    restaurantsRef.on('value', onRestaurants);
    menusRef.on('value', onMenus);
    deliveryRef.on('value', onDelivery);
    customersRef.on('value', onCustomers);
    settlementsRef.on('value', onSettlements);
    storePayoutsRef.on('value', onStorePayouts);
    riderPayoutsRef.on('value', onRiderPayouts);
    walletRequestsRef.on('value', onWalletRequests);
    feedbacksRef.on('value', onFeedbacks);
    settingsRef.on('value', onSettings);
    securityConfigRef.on('value', onSecurityConfig);
    securityLogsRef.on('value', onSecurityLogs);
    dismissedThreatsRef.on('value', onDismissedThreats);
    serviceAreasRef.on('value', onServiceAreas);
    serviceAreaConfigRef.on('value', onServiceAreaConfig);
    smartAutoSettleConfigRef.on('value', onSmartAutoSettleConfig);
    scheduledReportConfigRef.on('value', onScheduledReportConfig);
    reportDispatchLogsRef.on('value', onReportDispatchLogs);

    return () => {
      ordersRef.off('value', onOrders);
      restaurantsRef.off('value', onRestaurants);
      menusRef.off('value', onMenus);
      deliveryRef.off('value', onDelivery);
      customersRef.off('value', onCustomers);
      settlementsRef.off('value', onSettlements);
      storePayoutsRef.off('value', onStorePayouts);
      riderPayoutsRef.off('value', onRiderPayouts);
      walletRequestsRef.off('value', onWalletRequests);
      feedbacksRef.off('value', onFeedbacks);
      settingsRef.off('value', onSettings);
      securityConfigRef.off('value', onSecurityConfig);
      securityLogsRef.off('value', onSecurityLogs);
      dismissedThreatsRef.off('value', onDismissedThreats);
      serviceAreasRef.off('value', onServiceAreas);
      serviceAreaConfigRef.off('value', onServiceAreaConfig);
      smartAutoSettleConfigRef.off('value', onSmartAutoSettleConfig);
      scheduledReportConfigRef.off('value', onScheduledReportConfig);
      reportDispatchLogsRef.off('value', onReportDispatchLogs);
    };
  }, [authUser, maybePushNotify, showToast]);

  const commissionPercent =
    state.settings.commissionPercent !== undefined
      ? Number(state.settings.commissionPercent)
      : 5;

  const getRiderCashMetrics = useCallback(
    (riderUid: string) => {
      let totalCodCollected = 0;
      Object.values(state.orders).forEach((o) => {
        if (
          o.deliveryUid === riderUid &&
          o.status === 'DELIVERED' &&
          o.paymentMode !== 'UPI' &&
          o.paymentMode !== 'WALLET'
        ) {
          totalCodCollected += Number(o.totalAmount || 0);
        }
      });
      let totalSettled = 0;
      Object.values(state.settlements).forEach((s) => {
        if (s.riderUid === riderUid && s.status === 'APPROVED') {
          totalSettled += Number(s.amount || 0);
        }
      });
      return {
        netCashInHand: Math.max(0, totalCodCollected - totalSettled),
        totalSettled,
        totalCodCollected,
      };
    },
    [state.orders, state.settlements]
  );

  const getStorePayoutMetrics = useCallback(
    (storeUid: string) => {
      let itemsSubtotalSales = 0;
      let orderCount = 0;
      Object.values(state.orders).forEach((o) => {
        if (o.restaurantId === storeUid && o.status === 'DELIVERED') {
          orderCount++;
          itemsSubtotalSales +=
            o.subtotalAmount !== undefined
              ? Number(o.subtotalAmount)
              : Number(o.totalAmount || 0);
        }
      });
      const adminCut = itemsSubtotalSales * (commissionPercent / 100);
      const netStoreShare = itemsSubtotalSales - adminCut;
      let totalPaidToStore = 0;
      Object.values(state.storePayouts).forEach((p) => {
        if (p.storeId === storeUid && p.status === 'PAID') {
          totalPaidToStore += Number(p.amount || 0);
        }
      });
      return {
        grossSales: itemsSubtotalSales,
        adminCut,
        netStoreShare,
        totalPaidToStore,
        orderCount,
        unpaidBalance: Math.max(0, netStoreShare - totalPaidToStore),
      };
    },
    [state.orders, state.storePayouts, commissionPercent]
  );

  // Derived counters and lists
  const stats = useMemo(() => {
    const orderKeys = Object.keys(state.orders);
    let totalRevenue = 0;
    let totalItemsSubtotal = 0;
    let pendingUpiCount = 0;
    let unassignedCount = 0;

    orderKeys.forEach((id) => {
      const o = state.orders[id];
      if (o.status === 'DELIVERED') {
        totalRevenue += Number(o.totalAmount || 0);
        totalItemsSubtotal +=
          o.subtotalAmount !== undefined
            ? Number(o.subtotalAmount)
            : Number(o.totalAmount || 0);
      }
      if (
        o.paymentMode === 'UPI' &&
        o.paymentStatus === 'PENDING_VERIFICATION' &&
        o.status !== 'CANCELLED'
      ) {
        pendingUpiCount++;
      }
      if (!o.deliveryUid && o.status !== 'DELIVERED' && o.status !== 'CANCELLED') {
        unassignedCount++;
      }
    });

    let totalRidersCash = 0;
    Object.keys(state.deliveryPartners).forEach(
      (uid) => (totalRidersCash += getRiderCashMetrics(uid).netCashInHand)
    );
    let totalStoresUnpaid = 0;
    Object.keys(state.restaurants).forEach(
      (uid) => (totalStoresUnpaid += getStorePayoutMetrics(uid).unpaidBalance)
    );

    let pendingProductsCount = 0;
    Object.values(state.menus).forEach((items) => {
      Object.values(items || {}).forEach((item) => {
        if (item.adminApproved !== true && item.approvalStatus !== 'REJECTED') {
          pendingProductsCount++;
        }
      });
    });

    const pendingWalletCount = Object.values(state.walletRequests).filter(
      (r) => r.status === 'PENDING'
    ).length;
    const pendingRiderPayoutCount = Object.values(state.riderPayouts).filter(
      (p) => p.status === 'PENDING'
    ).length;
    const pendingSettlementCount = Object.values(state.settlements).filter(
      (s) => s.status === 'PENDING'
    ).length;
    const pendingStorePayoutCount = Object.values(state.storePayouts).filter(
      (p) => p.status === 'PENDING'
    ).length;
    const openFeedbackCount = Object.values(state.feedbacks).filter(
      (f) => f.status !== 'RESOLVED'
    ).length;

    return {
      totalOrders: orderKeys.length,
      totalRevenue,
      adminProfit: totalItemsSubtotal * (commissionPercent / 100),
      pendingUpiCount,
      unassignedCount,
      totalRidersCash,
      totalStoresUnpaid,
      pendingProductsCount,
      pendingWalletCount,
      pendingRiderPayoutCount,
      pendingSettlementCount,
      pendingStorePayoutCount,
      openFeedbackCount,
    };
  }, [
    state,
    commissionPercent,
    getRiderCashMetrics,
    getStorePayoutMetrics,
  ]);

  const scamScan = useMemo(() => scanScamThreats(state), [state]);
  const smartSettleReport = useMemo(
    () => analyzeRiderCodCompliance(state),
    [state]
  );
  const autoCodEnforcedRef = useRef<Set<string>>(new Set());
  const smartInsights = useMemo(
    () => computeSmartOrderInsights(state, nowTs),
    [state, nowTs]
  );

  const runSmartCodAuditScan = useCallback(async (): Promise<number> => {
    const candidates = smartSettleReport.autoActionCandidates;
    if (candidates.length === 0) return 0;
    const isRestrict = smartSettleReport.config.mode === 'RESTRICT_ASSIGNMENTS';
    const now = Date.now();
    const updates: Record<string, unknown> = {};

    candidates.forEach((c) => {
      const reason = isRestrict
        ? `Smart Auto-Settle: Exceeded ₹${c.maxLimit} cash limit ${c.breachCount}× (Holding ₹${c.netCashInHand.toFixed(0)}). Assignments restricted until settlement verified.`
        : `Smart Auto-Settle: Flagged for review (${c.breachCount}× limit breaches, Holding ₹${c.netCashInHand.toFixed(0)}).`;
      updates[`deliveryPartners/${c.uid}/codReviewFlagged`] = true;
      updates[`deliveryPartners/${c.uid}/codAssignmentRestricted`] = isRestrict;
      updates[`deliveryPartners/${c.uid}/codLimitBreaches`] = c.breachCount;
      updates[`deliveryPartners/${c.uid}/lastCodBreachAt`] = now;
      updates[`deliveryPartners/${c.uid}/codRestrictionReason`] = reason;
      updates[`deliveryPartners/${c.uid}/codAutoClearedAt`] = null;
    });

    await db.ref().update(updates);

    await Promise.all(
      candidates.map((c) =>
        logSecurityEvent({
          eventType: isRestrict
            ? 'COD_ASSIGNMENT_RESTRICTED'
            : 'COD_LIMIT_FLAGGED',
          actorEmail: authUser?.email || 'SmartAutoSettle',
          targetId: c.uid,
          details: `${c.partner.name || 'Rider'} (${c.breachCount}× breaches, Holding ₹${c.netCashInHand.toFixed(0)} / ₹${c.maxLimit}). Action: ${isRestrict ? 'Assignment Restricted' : 'Flagged for Review'}.`,
          severity: isRestrict ? 'CRITICAL' : 'WARNING',
        })
      )
    );

    return candidates.length;
  }, [smartSettleReport, authUser]);

  // Automatic background enforcement when a rider frequently exceeds their COD cash limit
  useEffect(() => {
    if (!authUser || !smartSettleReport.config.enabled) return;
    const pending = smartSettleReport.autoActionCandidates.filter((c) => {
      const key = `${c.uid}:${c.breachCount}:${smartSettleReport.config.mode}:${Math.round(c.netCashInHand)}`;
      if (autoCodEnforcedRef.current.has(key)) return false;
      autoCodEnforcedRef.current.add(key);
      return true;
    });
    if (pending.length === 0) return;

    void runSmartCodAuditScan().then((count) => {
      if (count > 0) {
        const modeText =
          smartSettleReport.config.mode === 'RESTRICT_ASSIGNMENTS'
            ? 'restricted from new assignments'
            : 'flagged for review';
        showToast(
          `⚡ Smart Auto-Settle: ${count} frequent COD limit-exceeding rider(s) ${modeText}.`,
          'warning'
        );
      }
    });
  }, [authUser, smartSettleReport, runSmartCodAuditScan, showToast]);

  const fleetFreezeTrippedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authUser || !smartSettleReport.shouldTripFleetFreezeNow) return;
    const key = `${smartSettleReport.latestCodOrderAt}:${smartSettleReport.fleetCodRiskThreshold}`;
    if (fleetFreezeTrippedRef.current === key) return;
    fleetFreezeTrippedRef.current = key;

    const now = Date.now();
    void db
      .ref('admin/settings')
      .update({
        fleetCodPayoutFreezeActive: true,
        fleetCodFreezeTriggeredAt: now,
        fleetCodFreezeTriggeredAmount: smartSettleReport.totalFleetCodCash,
      })
      .then(async () => {
        await logSecurityEvent({
          eventType: 'FLEET_COD_RISK_FREEZE',
          actorEmail: 'FinancialRiskRadar',
          details: `Circuit Breaker tripped: Total Fleet COD Cash ₹${smartSettleReport.totalFleetCodCash.toFixed(0)} exceeded threshold ₹${smartSettleReport.fleetCodRiskThreshold}. All Payout & Withdrawal approvals disabled until admin intervention.`,
          severity: 'CRITICAL',
        });
        showToast(
          `🚨 Financial Risk Circuit Breaker: Fleet COD Cash ₹${smartSettleReport.totalFleetCodCash.toFixed(0)} > ₹${smartSettleReport.fleetCodRiskThreshold}! All Payout & Withdrawal approvals frozen.`,
          'danger'
        );
      });
  }, [authUser, smartSettleReport, showToast]);

  const triggerReportDispatch = useCallback(
    async (
      source: 'MANUAL' | 'SCHEDULED',
      overrideConfig?: ScheduledReportConfig
    ): Promise<GeneratedPdfReport | null> => {
      if (!authUser) return null;
      const cfg: ScheduledReportConfig = {
        ...state.scheduledReportConfig,
        ...(overrideConfig || {}),
      };
      const frequency = cfg.frequency || 'DAILY';
      const report = generateExecutivePdfReport({
        state,
        config: cfg,
        adminEmail: authUser.email,
        frequencyOverride: frequency,
      });

      setLatestGeneratedReport(report);

      if (source === 'MANUAL' || cfg.autoDownloadPdf !== false) {
        report.download();
      }

      const channels: string[] = [];
      const recipients: string[] = [];
      if (cfg.sendViaEmail !== false) {
        channels.push('EMAIL');
        if (cfg.emailRecipients || authUser.email) {
          recipients.push(cfg.emailRecipients || authUser.email);
        }
      }
      if (cfg.sendViaWhatsapp !== false) {
        channels.push('WHATSAPP');
        if (cfg.whatsappNumber) {
          recipients.push(cfg.whatsappNumber);
        }
      }

      let status: ReportDispatchLogRecord['status'] =
        channels.length > 0 ? 'READY_TO_SEND' : 'DOWNLOADED';
      let note = '';

      if (cfg.webhookUrl && cfg.webhookUrl.trim()) {
        try {
          const resp = await fetch(cfg.webhookUrl.trim(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'AUTOMATED_PDF_REPORT',
              triggerSource: source,
              frequency: report.frequency,
              periodLabel: report.periodLabel,
              filename: report.filename,
              pdfBase64: report.base64,
              summaryText: report.summaryText,
              emailRecipients: cfg.sendViaEmail !== false ? cfg.emailRecipients || authUser.email : '',
              whatsappNumber: cfg.sendViaWhatsapp !== false ? cfg.whatsappNumber || '' : '',
              metrics: {
                totalOrders: report.totalOrders,
                deliveredOrders: report.deliveredOrders,
                cancelledOrders: report.cancelledOrders,
                grossRevenue: report.grossRevenue,
                adminCommission: report.adminCommission,
                verifiedUpi: report.verifiedUpi,
                settledCash: report.settledCash,
                fleetCodHeld: report.fleetCodHeld,
              },
            }),
          });
          if (resp.ok) {
            status = 'WEBHOOK_SENT';
          } else {
            status = 'WEBHOOK_FAILED';
            note = `Webhook HTTP ${resp.status}`;
          }
        } catch (err) {
          status = 'WEBHOOK_FAILED';
          note = (err as Error).message || 'Webhook network error';
        }
      }

      const now = Date.now();
      const logRecord: ReportDispatchLogRecord = {
        frequency: report.frequency,
        periodLabel: report.periodLabel,
        filename: report.filename,
        channels,
        recipientsSummary: recipients.join(' | ') || authUser.email,
        totalOrders: report.totalOrders,
        deliveredOrders: report.deliveredOrders,
        grossRevenue: report.grossRevenue,
        adminCommission: report.adminCommission,
        status,
        triggerSource: source,
        createdAt: now,
        createdBy: authUser.email,
        ...(note ? { note } : {}),
      };

      await db.ref('admin/reportDispatchLogs').push(logRecord);

      if (source === 'SCHEDULED' || state.scheduledReportConfig?.enabled) {
        const nextRunAt = computeNextReportRunAt(
          frequency,
          cfg.timeOfDay || '09:00',
          cfg.weekday !== undefined ? cfg.weekday : 1,
          now + 60_000
        );
        await db.ref('admin/scheduledReportConfig').update({
          lastRunAt: now,
          lastRunStatus: status,
          nextRunAt,
        });
      }

      if (status === 'WEBHOOK_SENT') {
        showToast(
          `📊 ${report.periodLabel} PDF sent automatically via webhook (${report.filename}).`,
          'success'
        );
      } else if (status === 'WEBHOOK_FAILED') {
        showToast(
          `⚠️ PDF downloaded, but webhook failed (${note}). Use Email/WhatsApp buttons in Reports.`,
          'warning'
        );
      } else {
        showToast(
          `📄 ${report.periodLabel} PDF generated! Ready to send via Email or WhatsApp in Reports.`,
          source === 'SCHEDULED' ? 'info' : 'success'
        );
      }

      return report;
    },
    [authUser, state, showToast]
  );

  useEffect(() => {
    const cfg = state.scheduledReportConfig;
    if (!authUser || !cfg?.enabled || !cfg.nextRunAt) return;
    if (nowTs < cfg.nextRunAt) return;
    if (reportTriggerLockRef.current === cfg.nextRunAt) return;

    reportTriggerLockRef.current = cfg.nextRunAt;
    void triggerReportDispatch('SCHEDULED', cfg);
  }, [authUser, nowTs, state.scheduledReportConfig, triggerReportDispatch]);

  const handleAdminInterventionLiftFreeze = useCallback(() => {
    setDialogConfig({
      mode: 'confirm',
      title: '⚖️ Admin Intervention: Lift Payout & Withdrawal Freeze?',
      message: `Current total fleet COD cash-in-hand is ₹${smartSettleReport.totalFleetCodCash.toFixed(0)} (Threshold: ₹${smartSettleReport.fleetCodRiskThreshold}). Confirm admin intervention to re-enable Payout & Withdrawal approvals now?`,
      confirmLabel: 'Confirm Intervention & Lift Freeze',
      confirmVariant: 'warning',
      onConfirm: () => {
        const now = Date.now();
        void db
          .ref('admin/settings')
          .update({
            fleetCodPayoutFreezeActive: false,
            fleetCodFreezeIntervenedAt: now,
            fleetCodFreezeResolvedBy: authUser?.email || 'Admin',
          })
          .then(async () => {
            await logSecurityEvent({
              eventType: 'FLEET_COD_FREEZE_LIFTED',
              actorEmail: authUser?.email || 'Admin',
              details: `Admin intervention lifted Payout & Withdrawal freeze while Fleet COD Cash was ₹${smartSettleReport.totalFleetCodCash.toFixed(0)} (Threshold ₹${smartSettleReport.fleetCodRiskThreshold}).`,
              severity: 'WARNING',
            });
            showToast(
              '✅ Admin Intervention recorded: Payout & Withdrawal approvals re-enabled.',
              'success'
            );
          });
      },
    });
  }, [
    authUser,
    smartSettleReport.totalFleetCodCash,
    smartSettleReport.fleetCodRiskThreshold,
    showToast,
  ]);

  const approveSettlementWithSmartVerify = useCallback(
    async (settlementId: string, record: SettlementRecord): Promise<void> => {
      const isUpi = String(record.mode || '').toUpperCase() === 'UPI';
      const normUtr = normalizeUtr(record.utr);
      const strict12 = state.securityConfig?.requireStrict12DigitUtr !== false;

      const executeApprove = async () => {
        const now = Date.now();
        await db.ref(`settlements/${settlementId}`).update({
          status: 'APPROVED',
          verifiedAt: now,
          verifiedBy: authUser?.email || 'Admin',
        });

        const riderUid = record.riderUid || '';
        const rider = riderUid ? state.deliveryPartners[riderUid] : undefined;
        const settledAmt = Number(record.amount || 0);
        const currentHeld = riderUid
          ? getRiderCashMetrics(riderUid).netCashInHand
          : 0;
        const postBalance = Math.max(0, currentHeld - settledAmt);
        const threshold = smartSettleReport.triggerThresholdAmount;

        if (
          riderUid &&
          rider &&
          (rider.codAssignmentRestricted || rider.codReviewFlagged) &&
          smartSettleReport.config.autoClearOnSettlementVerify &&
          postBalance < threshold
        ) {
          await db.ref(`deliveryPartners/${riderUid}`).update({
            codReviewFlagged: false,
            codAssignmentRestricted: false,
            codRestrictionReason: '',
            codSettlementVerifiedAt: now,
            codAutoClearedAt: now,
          });
          await logSecurityEvent({
            eventType: 'COD_SETTLEMENT_VERIFIED',
            actorEmail: authUser?.email || 'Admin',
            targetId: riderUid,
            details: `Settlement ₹${settledAmt.toFixed(0)} verified for ${rider.name || 'Rider'}. Post-settlement balance ₹${postBalance.toFixed(0)} < ₹${threshold}; order assignments restored.`,
            severity: 'INFO',
          });
          showToast(
            `✅ Settlement verified (₹${settledAmt.toFixed(0)}) & assignments restored for ${rider.name || 'Rider'}!`,
            'success'
          );
        } else if (
          riderUid &&
          rider?.codAssignmentRestricted &&
          postBalance >= threshold
        ) {
          showToast(
            `✅ ₹${settledAmt.toFixed(0)} approved, but ${rider.name || 'Rider'} still holds ₹${postBalance.toFixed(0)} (above ₹${threshold} trigger) — restriction retained.`,
            'warning'
          );
        } else {
          showToast(
            `✅ COD Settlement ₹${settledAmt.toFixed(0)} verified & approved!`,
            'success'
          );
        }
      };

      const collisions = normUtr ? scamScan.utrCollisionMap[normUtr] : undefined;
      const isDuplicateUtr = Boolean(isUpi && collisions && collisions.length > 1);
      const isInvalidUtr = Boolean(
        isUpi && !isValidUtrFormat(normUtr, strict12)
      );

      if (
        state.securityConfig?.blockDuplicateUtr !== false &&
        (isDuplicateUtr || isInvalidUtr)
      ) {
        setDialogConfig({
          mode: 'confirm',
          title: isDuplicateUtr
            ? '🚨 Duplicate UTR in COD Settlement'
            : '⚠️ Invalid Settlement UTR Format',
          message: isDuplicateUtr
            ? `UTR "${normUtr}" appears ${collisions!.length}× across orders/wallets/settlements. Verify bank statement before approving or lifting rider restrictions.`
            : `UPI Settlement UTR "${normUtr || 'EMPTY'}" failed validation. Approve only if verified directly in your bank account.`,
          confirmLabel: 'Approve Anyway',
          confirmVariant: 'danger',
          onConfirm: () => {
            void executeApprove();
          },
        });
        return;
      }

      await executeApprove();
    },
    [
      authUser,
      state.securityConfig,
      state.deliveryPartners,
      scamScan.utrCollisionMap,
      smartSettleReport,
      getRiderCashMetrics,
      showToast,
    ]
  );

  // Actions
  const saveOrderNote = useCallback(
    async (orderId: string, rawNote: string) => {
      const cleanNote = sanitizeText(rawNote).trim();
      setSavingNoteOrderId(orderId);
      try {
        await db.ref(`orders/${orderId}`).update({
          orderNotes: cleanNote,
          orderNotesUpdatedAt: Date.now(),
          orderNotesUpdatedBy: authUser?.email || 'Admin',
          updatedAt: Date.now(),
        });
        setOrderNoteDrafts((prev) => {
          const next = { ...prev };
          delete next[orderId];
          return next;
        });
        showToast(
          cleanNote
            ? `📝 Order note saved for #${orderId.slice(-6)}!`
            : `Order note cleared for #${orderId.slice(-6)}.`,
          cleanNote ? 'success' : 'info'
        );
      } finally {
        setSavingNoteOrderId(null);
      }
    },
    [authUser, showToast]
  );

  const quickUpdateOrderStatus = useCallback(
    async (
      orderId: string,
      nextStatus: 'PREPARING' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY'
    ) => {
      setUpdatingOrderStatusId(orderId);
      try {
        await db.ref(`orders/${orderId}`).update({
          status: nextStatus,
          updatedAt: Date.now(),
        });
        const label =
          nextStatus === 'PREPARING'
            ? 'PACKING'
            : nextStatus === 'READY_FOR_PICKUP'
              ? 'READY FOR PICKUP'
              : 'OUT FOR DELIVERY';
        showToast(`Order #${orderId.slice(-6)} → ${label}`, 'info');
      } finally {
        setUpdatingOrderStatusId(null);
      }
    },
    [showToast]
  );

  const handleEnablePushFromBanner = async () => {
    const res = await requestPushPermission();
    setPushPermission(res);
    if (res === 'granted') {
      const next = { ...pushPrefs, enabled: true };
      setPushPrefs(next);
      savePushPrefs(next);
      setShowPushPromptBanner(false);
      showToast('🔔 Push Notifications Enabled!', 'success');
      void dispatchAdminPushNotification({
        title: '🛡️ Gossaigaon Bazar Admin Ready',
        body: 'Live Push Notifications are now active for Orders, UPI, Approvals & Payouts.',
        panel: 'dashboard',
        tag: 'gb-admin-welcome',
      });
    } else if (res === 'denied') {
      showToast('Notifications blocked in browser settings.', 'warning');
    }
  };

  const handleToggleMute = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      showToast(next ? 'Alert chime enabled.' : 'Alert chime muted.', 'info');
      return next;
    });
  };

  const setUpiStatus = (orderId: string, newStatus: 'VERIFIED' | 'REJECTED') => {
    const order = state.orders[orderId];
    const normUtr = normalizeUtr(order?.transactionId);
    const collisions = normUtr ? scamScan.utrCollisionMap[normUtr] : undefined;
    const isDuplicate = Boolean(collisions && collisions.length > 1);
    const invalidReason = scamScan.invalidOrderUtrIds[orderId];

    const executeUpdate = () => {
      const updates: Record<string, unknown> = {
        paymentStatus: newStatus,
        updatedAt: Date.now(),
      };
      if (newStatus === 'REJECTED') {
        updates.status = 'CANCELLED';
        updates.cancelledBy = 'ADMIN_FRAUD_CHECK';
        updates.cancelReason = isDuplicate
          ? `Duplicate UPI UTR (${normUtr}) Rejected`
          : 'Fake or Invalid UPI UTR Rejected';
      }
      db.ref(`orders/${orderId}`)
        .update(updates)
        .then(() => {
          if (newStatus === 'REJECTED') {
            void logSecurityEvent({
              eventType: 'UTR_FRAUD_REJECTED',
              actorEmail: authUser?.email,
              targetId: orderId,
              details: `Rejected UPI order #${orderId.slice(-6)} (UTR: ${normUtr || 'N/A'})${isDuplicate ? ' — Duplicate UTR' : ''}.`,
              severity: 'WARNING',
            });
          }
          showToast(
            newStatus === 'VERIFIED'
              ? '✅ UPI Verified! Dispatch unlocked.'
              : '❌ Fake UPI Rejected!',
            newStatus === 'VERIFIED' ? 'success' : 'danger'
          );
        });
    };

    if (
      newStatus === 'VERIFIED' &&
      state.securityConfig?.blockDuplicateUtr !== false &&
      (isDuplicate || invalidReason)
    ) {
      setDialogConfig({
        mode: 'confirm',
        title: isDuplicate
          ? '🚨 Duplicate UTR Fraud Warning'
          : '⚠️ Suspicious UPI UTR Warning',
        message: isDuplicate
          ? `UTR ${normUtr} appears on ${collisions!.length} transactions across orders/wallets. Verify Order #${orderId.slice(-6)} (₹${Number(order?.totalAmount || 0).toFixed(0)}) only if confirmed in bank statement.`
          : `${invalidReason} on Order #${orderId.slice(-6)}. Verify anyway?`,
        confirmLabel: 'Verify Anyway',
        confirmVariant: 'warning',
        onConfirm: executeUpdate,
      });
      return;
    }

    executeUpdate();
  };

  const adminCancelOrder = (orderId: string) => {
    const o = state.orders[orderId];
    if (!o) return;
    setDialogConfig({
      mode: 'prompt',
      title: `Cancel Order #${orderId.slice(-6)}`,
      message: 'Enter cancellation reason for this order:',
      defaultValue: 'Cancelled by Admin',
      placeholder: 'Cancellation reason...',
      confirmLabel: 'Proceed',
      confirmVariant: 'danger',
      onConfirm: (reason) => {
        if (!reason) return;
        const applyCancel = (shouldRefund: boolean) => {
          const updates: Record<string, unknown> = {
            status: 'CANCELLED',
            cancelledBy: 'ADMIN',
            cancelReason: sanitizeText(reason),
            updatedAt: Date.now(),
          };
          if (shouldRefund && o.customerUid) {
            updates.paymentStatus = 'REFUNDED';
            db.ref(`customers/${o.customerUid}/walletBalance`).transaction(
              (bal: number | null) =>
                Number(bal || 0) + Number(o.totalAmount || 0)
            );
            db.ref(`walletTransactions/${o.customerUid}`).push({
              type: 'CREDIT',
              amount: Number(o.totalAmount || 0),
              note: `Refund for cancelled Order #${orderId.slice(-6)}`,
              createdAt: Date.now(),
            });
          }
          db.ref(`orders/${orderId}`)
            .update(updates)
            .then(() =>
              showToast(`Order #${orderId.slice(-6)} Cancelled!`, 'danger')
            );
        };

        const isPaidOnline =
          o.paymentMode === 'WALLET' ||
          (o.paymentMode === 'UPI' && o.paymentStatus === 'VERIFIED');
        if (isPaidOnline && o.customerUid) {
          setTimeout(() => {
            setDialogConfig({
              mode: 'confirm',
              title: 'Auto-Refund to Customer Wallet?',
              message: `Order #${orderId.slice(-6)} was paid online (₹${Number(o.totalAmount || 0).toFixed(0)}). Auto-refund to Customer Wallet now?`,
              confirmLabel: 'Cancel & Refund',
              confirmVariant: 'warning',
              onConfirm: () => applyCancel(true),
            });
          }, 50);
        } else {
          applyCancel(false);
        }
      },
    });
  };

  const validSelectedOrderIds = useMemo(
    () => selectedOrderIds.filter((id) => Boolean(state.orders[id])),
    [selectedOrderIds, state.orders]
  );

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleBulkCancelOrders = () => {
    const eligibleIds = validSelectedOrderIds.filter((id) => {
      const o = state.orders[id];
      return o && o.status !== 'CANCELLED' && o.status !== 'DELIVERED';
    });

    if (eligibleIds.length === 0) {
      showToast(
        'Selected orders are already Delivered or Cancelled.',
        'warning'
      );
      return;
    }

    const skippedCount = validSelectedOrderIds.length - eligibleIds.length;
    setDialogConfig({
      mode: 'prompt',
      title: `Bulk Cancel ${eligibleIds.length} Order(s)`,
      message: `Enter cancellation reason for ${eligibleIds.length} eligible order(s)${skippedCount > 0 ? ` (${skippedCount} completed/cancelled will be skipped)` : ''}:`,
      defaultValue: 'Cancelled by Admin (Bulk Action)',
      placeholder: 'Cancellation reason...',
      confirmLabel: 'Proceed',
      confirmVariant: 'danger',
      onConfirm: (reason) => {
        if (!reason) return;
        const paidOnlineIds = eligibleIds.filter((id) => {
          const o = state.orders[id];
          return (
            o &&
            o.customerUid &&
            (o.paymentMode === 'WALLET' ||
              (o.paymentMode === 'UPI' && o.paymentStatus === 'VERIFIED'))
          );
        });

        const executeBulkCancel = (shouldRefund: boolean) => {
          const now = Date.now();
          const cleanReason = sanitizeText(reason);
          const updates: Record<string, unknown> = {};

          eligibleIds.forEach((orderId) => {
            updates[`orders/${orderId}/status`] = 'CANCELLED';
            updates[`orders/${orderId}/cancelledBy`] = 'ADMIN';
            updates[`orders/${orderId}/cancelReason`] = cleanReason;
            updates[`orders/${orderId}/updatedAt`] = now;
            if (shouldRefund && paidOnlineIds.includes(orderId)) {
              updates[`orders/${orderId}/paymentStatus`] = 'REFUNDED';
            }
          });

          db.ref()
            .update(updates)
            .then(() => {
              if (shouldRefund) {
                paidOnlineIds.forEach((orderId) => {
                  const o = state.orders[orderId];
                  if (!o || !o.customerUid) return;
                  db.ref(`customers/${o.customerUid}/walletBalance`).transaction(
                    (bal: number | null) =>
                      Number(bal || 0) + Number(o.totalAmount || 0)
                  );
                  db.ref(`walletTransactions/${o.customerUid}`).push({
                    type: 'CREDIT',
                    amount: Number(o.totalAmount || 0),
                    note: `Refund for cancelled Order #${orderId.slice(-6)}`,
                    createdAt: now,
                  });
                });
              }
              setSelectedOrderIds([]);
              showToast(
                `🚫 ${eligibleIds.length} order(s) cancelled!${shouldRefund && paidOnlineIds.length > 0 ? ` (${paidOnlineIds.length} online payment(s) refunded)` : ''}`,
                'danger'
              );
            });
        };

        if (paidOnlineIds.length > 0) {
          setTimeout(() => {
            setDialogConfig({
              mode: 'confirm',
              title: 'Auto-Refund Paid Online Orders?',
              message: `${paidOnlineIds.length} of the selected orders were paid online (Wallet / Verified UPI). Auto-refund them to Customer Wallets now?`,
              confirmLabel: 'Cancel & Refund All',
              confirmVariant: 'warning',
              onConfirm: () => executeBulkCancel(true),
            });
          }, 50);
        } else {
          executeBulkCancel(false);
        }
      },
    });
  };

  const verifyStoreProduct = (
    storeId: string,
    itemId: string,
    approve: boolean
  ) => {
    const now = Date.now();
    if (approve) {
      db.ref(`menus/${storeId}/${itemId}`)
        .update({
          adminApproved: true,
          approvalStatus: 'APPROVED',
          rejectionReason: '',
          approvedAt: now,
          approvedBy: authUser?.email || 'Admin',
          updatedAt: now,
        })
        .then(() =>
          showToast('✅ Product approved & live for customer sale!', 'success')
        );
    } else {
      setDialogConfig({
        mode: 'prompt',
        title: 'Reject Store Product',
        message: 'Reason for rejecting this product:',
        defaultValue: 'Invalid price / image or prohibited item',
        confirmLabel: 'Reject Product',
        confirmVariant: 'danger',
        onConfirm: (reason) => {
          db.ref(`menus/${storeId}/${itemId}`)
            .update({
              adminApproved: false,
              approvalStatus: 'REJECTED',
              rejectionReason: sanitizeText(reason || ''),
              rejectedAt: now,
              rejectedBy: authUser?.email || 'Admin',
              updatedAt: now,
            })
            .then(() => showToast('❌ Product rejected.', 'danger'));
        },
      });
    }
  };

  const autoAssignAllPendingOrders = () => {
    const pendingOrders = Object.entries(state.orders).filter(
      ([, o]) =>
        !o.deliveryUid && o.status !== 'DELIVERED' && o.status !== 'CANCELLED'
    );
    if (pendingOrders.length === 0) {
      showToast('No unassigned orders found!', 'info');
      return;
    }
    const allOnlineApproved = Object.entries(state.deliveryPartners).filter(
      ([, r]) => r.approved === true && r.online === true && r.suspended !== true
    );
    const restrictedOnlineCount = allOnlineApproved.filter(
      ([, r]) => r.codAssignmentRestricted === true
    ).length;
    const onlineRiders = allOnlineApproved.filter(
      ([, r]) => r.codAssignmentRestricted !== true
    );
    if (onlineRiders.length === 0) {
      showToast(
        restrictedOnlineCount > 0
          ? `🚫 ${restrictedOnlineCount} online rider(s) are COD-restricted! Verify their settlements in Rider COD Cash first.`
          : 'No online approved riders available!',
        'danger'
      );
      return;
    }

    // Track active load per rider so batch auto-dispatch balances across nearby riders
    const riderActiveLoadMap: Record<string, number> = {};
    Object.values(state.orders).forEach((ord) => {
      if (
        ord.deliveryUid &&
        ord.status !== 'DELIVERED' &&
        ord.status !== 'CANCELLED'
      ) {
        riderActiveLoadMap[ord.deliveryUid] =
          (riderActiveLoadMap[ord.deliveryUid] || 0) + 1;
      }
    });

    const maxCodLimit = Number(state.settings?.maxRiderCashLimit || 3000);
    let assignedCount = 0;
    let skippedCount = 0;
    pendingOrders.forEach(([orderId, o]) => {
      const store = state.restaurants[o.restaurantId || ''] || {};
      const storeLat = Number(store.lat) || 26.4524;
      const storeLng = Number(store.lng) || 89.9723;
      const eligibleRiders = onlineRiders.filter(
        ([uid]) => !(o.rejectedByRiders && o.rejectedByRiders[uid])
      );
      if (eligibleRiders.length === 0) {
        skippedCount++;
        return;
      }

      let bestRiderUid: string | null = null;
      let bestScore = Infinity;
      eligibleRiders.forEach(([uid, rider]) => {
        const cashHeld = getRiderCashMetrics(uid).netCashInHand;
        const score = scoreRiderForOrder({
          storeLat,
          storeLng,
          riderLat: rider.lat,
          riderLng: rider.lng,
          activeLoadCount: riderActiveLoadMap[uid] || 0,
          ratingAvg: Number(rider.ratingAvg || 5),
          codHeadroomRatio: maxCodLimit > 0 ? cashHeld / maxCodLimit : 0,
        });
        if (score < bestScore) {
          bestScore = score;
          bestRiderUid = uid;
        }
      });
      if (!bestRiderUid) return;
      riderActiveLoadMap[bestRiderUid] =
        (riderActiveLoadMap[bestRiderUid] || 0) + 1;
      const bestRider = state.deliveryPartners[bestRiderUid] || null;

      db.ref(`orders/${orderId}`).update({
        deliveryUid: bestRiderUid,
        riderLat: bestRider?.lat || null,
        riderLng: bestRider?.lng || null,
        assignedAt: Date.now(),
        riderAccepted: null,
        updatedAt: Date.now(),
      });
      assignedCount++;
    });

    if (assignedCount > 0) {
      showToast(
        `⚡ Smart Load-Balanced Dispatch assigned ${assignedCount} order(s) to optimal riders!`,
        'success'
      );
    }
    if (skippedCount > 0) {
      showToast(
        `⚠️ ${skippedCount} order(s) skipped (passed by riders).`,
        'warning'
      );
    }
  };

  const processWalletRequest = (reqId: string, approve: boolean) => {
    const r = state.walletRequests[reqId];
    if (!r || r.status !== 'PENDING') return;
    if (
      approve &&
      r.type === 'WITHDRAW' &&
      smartSettleReport.isPayoutWithdrawalFrozen
    ) {
      showToast(
        '🚨 Withdrawal approvals are frozen because Fleet COD Cash exceeded the Financial Risk threshold. Perform Admin Intervention first.',
        'danger'
      );
      return;
    }
    const normUtr = normalizeUtr(r.utr);
    const collisions = normUtr ? scamScan.utrCollisionMap[normUtr] : undefined;
    const isDuplicate = Boolean(
      r.type === 'DEPOSIT' && collisions && collisions.length > 1
    );
    const invalidReason = scamScan.invalidWalletUtrIds[reqId];

    if (!approve) {
      if (r.type === 'WITHDRAW' && r.customerUid) {
        db.ref(`customers/${r.customerUid}/walletBalance`).transaction(
          (bal: number | null) => Number(bal || 0) + Number(r.amount || 0)
        );
        db.ref(`walletTransactions/${r.customerUid}`).push({
          type: 'CREDIT',
          amount: Number(r.amount || 0),
          note: 'Withdrawal rejected - refunded to wallet',
          createdAt: Date.now(),
        });
      }
      db.ref(`walletRequests/${reqId}`)
        .update({ status: 'REJECTED', updatedAt: Date.now() })
        .then(() => {
          if (r.type === 'DEPOSIT' && (isDuplicate || invalidReason)) {
            void logSecurityEvent({
              eventType: 'UTR_FRAUD_REJECTED',
              actorEmail: authUser?.email,
              targetId: reqId,
              details: `Rejected wallet deposit #${reqId.slice(-6)} (UTR: ${normUtr || 'N/A'}).`,
              severity: 'WARNING',
            });
          }
          showToast('Wallet request rejected.', 'danger');
        });
      return;
    }

    const executeApprove = () => {
      if (r.type === 'DEPOSIT' && r.customerUid) {
        db.ref(`customers/${r.customerUid}/walletBalance`).transaction(
          (bal: number | null) => Number(bal || 0) + Number(r.amount || 0)
        );
        db.ref(`walletTransactions/${r.customerUid}`).push({
          type: 'CREDIT',
          amount: Number(r.amount || 0),
          note: `Wallet Deposit Approved (UTR: ${r.utr || ''})`,
          createdAt: Date.now(),
        });
      }
      db.ref(`walletRequests/${reqId}`)
        .update({ status: 'APPROVED', updatedAt: Date.now() })
        .then(() =>
          showToast(`✅ Wallet ${r.type} of ₹${r.amount} approved!`, 'success')
        );
    };

    if (
      r.type === 'DEPOSIT' &&
      state.securityConfig?.blockDuplicateUtr !== false &&
      (isDuplicate || invalidReason)
    ) {
      setDialogConfig({
        mode: 'confirm',
        title: isDuplicate
          ? '🚨 Duplicate Wallet UTR Warning'
          : '⚠️ Suspicious Wallet UTR Warning',
        message: isDuplicate
          ? `UTR ${normUtr} was submitted ${collisions!.length}× across orders/wallets. Approve ₹${Number(r.amount || 0).toFixed(0)} credit for ${r.customerName || 'Customer'} only if verified in bank statement.`
          : `${invalidReason} for ${r.customerName || 'Customer'}. Approve anyway?`,
        confirmLabel: 'Approve Anyway',
        confirmVariant: 'warning',
        onConfirm: executeApprove,
      });
      return;
    }

    executeApprove();
  };

  const replyAndResolveFeedback = (id: string) => {
    const f = state.feedbacks[id] || {};
    setDialogConfig({
      mode: 'prompt',
      title: 'Reply & Resolve Ticket',
      message: 'Enter Admin Reply / Resolution Note:',
      defaultValue:
        f.adminReply || 'Thank you for your feedback! Issue resolved.',
      confirmLabel: 'Resolve Ticket',
      confirmVariant: 'primary',
      onConfirm: (reply) => {
        db.ref(`feedbacks/${id}`)
          .update({
            adminReply: sanitizeText(reply || ''),
            status: 'RESOLVED',
            resolvedAt: Date.now(),
          })
          .then(() => showToast('Feedback marked Resolved!', 'success'));
      },
    });
  };

  const openDisbursalByRef = (
    type: 'RIDER' | 'STORE' | 'DIRECT_STORE',
    targetId: string
  ) => {
    if (smartSettleReport.isPayoutWithdrawalFrozen) {
      showToast(
        '🚨 Payout approvals are frozen because Fleet COD Cash exceeded the Financial Risk threshold. Perform Admin Intervention first.',
        'danger'
      );
      return;
    }
    if (type === 'RIDER') {
      const p = state.riderPayouts[targetId];
      if (!p) return;
      setDisbursalTarget({
        type,
        targetId,
        name: p.riderName || 'Rider',
        phone: p.riderPhone || '',
        upiId: p.riderUpiId || '',
        amount: Number(p.amount || 0),
      });
    } else if (type === 'STORE') {
      const p = state.storePayouts[targetId];
      if (!p) return;
      setDisbursalTarget({
        type,
        targetId,
        name: p.storeName || 'Store',
        phone: p.storePhone || '',
        upiId: p.storeUpiId || '',
        amount: Number(p.amount || 0),
      });
    } else if (type === 'DIRECT_STORE') {
      const s = state.restaurants[targetId];
      if (!s) return;
      const m = getStorePayoutMetrics(targetId);
      setDisbursalTarget({
        type,
        targetId,
        name: s.name || 'Store',
        phone: s.phone || '',
        upiId: s.upiId || '',
        amount: m.unpaidBalance,
      });
    }
    window.history.pushState({ modal: 'disbursal' }, '');
  };

  const exportOrdersCSV = () => {
    const orders = Object.entries(state.orders).sort(
      (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)
    );
    if (orders.length === 0) {
      showToast('No orders to export.', 'info');
      return;
    }
    const escapeCsv = (val: unknown): string => {
      const str = String(val ?? '');
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const headers = [
      'Order ID',
      'Created At',
      'Store',
      'Customer Phone',
      'Delivery Address',
      'Items Summary',
      'Total Amount',
      'Delivery PIN',
      'Payment Mode',
      'Payment Status',
      'UTR / Ref',
      'Order Status',
      'Assigned Rider',
      'Bill Printed',
      'Spam Flag',
      'Order Notes',
    ];
    const rows = orders.map(([id, o]) => {
      const storeName =
        state.restaurants[o.restaurantId || '']?.name || 'Store';
      const riderName =
        o.deliveryUid && state.deliveryPartners[o.deliveryUid]
          ? state.deliveryPartners[o.deliveryUid].name || 'Rider'
          : 'Unassigned';
      const rawItems: OrderItem[] = Array.isArray(o.items)
        ? o.items
        : Object.values(o.items || {});
      const itemsText = rawItems.map((i) => `${i.qty}x ${i.name}`).join('; ');
      const createdIso = o.createdAt
        ? new Date(o.createdAt).toLocaleString()
        : '';
      return [
        `#${id.slice(-6)}`,
        createdIso,
        storeName,
        o.phone || '',
        o.address || '',
        itemsText,
        Number(o.totalAmount || 0).toFixed(0),
        o.deliveryOtp || '',
        o.paymentMode || 'COD',
        o.paymentStatus || '',
        o.transactionId || '',
        o.status || 'PLACED',
        riderName,
        o.billPrinted || printedOrderMap[id] ? 'YES' : 'NO',
        o.isSpamSuspect ? 'YES' : 'NO',
        o.orderNotes || '',
      ]
        .map(escapeCsv)
        .join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `GossaigaonBazar_Orders_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`📊 Exported ${orders.length} order(s) to CSV!`, 'success');
  };

  const printBillSlip = (orderId: string) => {
    const o = state.orders[orderId];
    if (!o) return;
    const printedAt = Date.now();
    setPrintedOrderMap((prev) => ({ ...prev, [orderId]: printedAt }));
    setState((prev) => {
      const existing = prev.orders[orderId];
      if (!existing) return prev;
      return {
        ...prev,
        orders: {
          ...prev.orders,
          [orderId]: {
            ...existing,
            billPrinted: true,
            billPrintedAt: printedAt,
          },
        },
      };
    });
    db.ref(`orders/${orderId}`)
      .update({
        billPrinted: true,
        billPrintedAt: printedAt,
      })
      .catch(() => {
        // Optimistic local state preserves printed indicator if offline
      });
    setPrintOrder({ id: orderId, order: o });
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintOrder(null), 500);
    }, 80);
  };

  const refreshRiderLocation = useCallback(async (uid: string) => {
    try {
      const snap = await db.ref(`deliveryPartners/${uid}`).once('value');
      const freshRider = snap.val();
      if (freshRider) {
        setState((prev) => ({
          ...prev,
          deliveryPartners: {
            ...prev.deliveryPartners,
            [uid]: freshRider,
          },
        }));
      }
    } catch {
      // Keep live listener state if manual sync hits transient error
    }
  }, []);

  const seedSampleData = () => {
    setDialogConfig({
      mode: 'confirm',
      title: '1-Click Demo Setup',
      message:
        'Seed demo supermarket and grocery catalog with exact Gossaigaon GPS?',
      confirmLabel: 'Seed Demo Data',
      confirmVariant: 'primary',
      onConfirm: () => {
        const demoStoreId = 'demo_store_gossaigaon_1';
        const updates: Record<string, unknown> = {};
        updates[`/restaurants/${demoStoreId}`] = {
          name: 'Gossaigaon Fresh Supermarket',
          cuisine: 'Vegetables, Dairy & Staples',
          address: 'Station Road, Ward No. 2, Gossaigaon',
          phone: '9876500000',
          upiId: 'freshstore@okicici',
          approved: true,
          isOpen: true,
          lat: 26.4524,
          lng: 89.9723,
        };
        updates[`/menus/${demoStoreId}`] = {
          item_1: {
            name: 'Local Potatoes (1 kg)',
            price: 35,
            mrp: 45,
            discountPercent: 22,
            isOnSale: true,
            searchKeywords: 'aloo, potato, sabzi, veg',
            description: 'Fresh Assam Farm Potatoes 1 kg',
            available: true,
            adminApproved: true,
            approvalStatus: 'APPROVED',
            category: 'VEG',
          },
          item_2: {
            name: 'Shudh Chakki Atta (5 kg)',
            price: 240,
            mrp: 280,
            discountPercent: 14,
            isOnSale: false,
            searchKeywords: 'atta, wheat, flour, aashirvaad',
            description: '100% Whole Wheat Chakki Atta',
            available: true,
            adminApproved: true,
            approvalStatus: 'APPROVED',
            category: 'STAPLES',
          },
        };
        updates['/admin/settings/deliveryCharge'] = 25;
        updates['/admin/settings/freeDeliveryAbove'] = 299;
        updates['/admin/settings/upiId'] = 'gossaigaonbazar@apl';
        updates['/admin/settings/customCategories'] = DEFAULT_CATEGORIES;
        db.ref()
          .update(updates)
          .then(() => showToast('Demo data seeded!', 'success'));
      },
    });
  };

  // Filtered lists
  const pendingUpiOrders = useMemo(
    () =>
      Object.entries(state.orders)
        .filter(
          ([, o]) =>
            o.paymentMode === 'UPI' &&
            o.paymentStatus === 'PENDING_VERIFICATION' &&
            o.status !== 'CANCELLED'
        )
        .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)),
    [state.orders]
  );

  const recentOrders = useMemo(
    () =>
      Object.entries(state.orders)
        .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0))
        .slice(0, 6),
    [state.orders]
  );

  const filteredOrders = useMemo(() => {
    const getUrgencyScore = (o: OrderRecord): number => {
      const isClosed = o.status === 'DELIVERED' || o.status === 'CANCELLED';
      if (o.emergencyAlert) return 100;
      if (o.isSpamSuspect && !isClosed) return 80;
      if (
        o.paymentMode === 'UPI' &&
        o.paymentStatus === 'PENDING_VERIFICATION' &&
        o.status !== 'CANCELLED'
      ) {
        return 60;
      }
      if (!o.deliveryUid && !isClosed) return 40;
      if (!isClosed) return 20;
      return 0;
    };

    let entries = Object.entries(state.orders);
    if (orderStatusFilter === 'UNASSIGNED') {
      entries = entries.filter(
        ([, o]) =>
          !o.deliveryUid && o.status !== 'DELIVERED' && o.status !== 'CANCELLED'
      );
    } else if (orderStatusFilter === 'SPAM') {
      entries = entries.filter(([, o]) => o.isSpamSuspect === true);
    } else if (orderStatusFilter === 'PENDING_PAYMENT') {
      entries = entries.filter(
        ([, o]) =>
          o.status === 'PENDING_PAYMENT' ||
          (o.paymentStatus === 'PENDING_PAYMENT' &&
            o.status !== 'CANCELLED' &&
            o.status !== 'DELIVERED')
      );
    } else if (orderStatusFilter !== 'ALL') {
      entries = entries.filter(
        ([, o]) => (o.status || 'PLACED') === orderStatusFilter
      );
    }
    const q = orderSearch.toLowerCase().trim();
    if (q) {
      entries = entries.filter(([id, o]) => {
        const storeName = (
          state.restaurants[o.restaurantId || '']?.name || ''
        ).toLowerCase();
        return (
          id.toLowerCase().includes(q) ||
          (o.phone || '').toLowerCase().includes(q) ||
          (o.deliveryOtp || '').toLowerCase().includes(q) ||
          (o.orderNotes || '').toLowerCase().includes(q) ||
          (o.address || '').toLowerCase().includes(q) ||
          (o.transactionId || '').toLowerCase().includes(q) ||
          storeName.includes(q)
        );
      });
    }

    entries.sort((a, b) => {
      if (orderSortBy === 'OLDEST') {
        return (a[1].createdAt || 0) - (b[1].createdAt || 0);
      }
      if (orderSortBy === 'HIGHEST_VALUE') {
        const diff =
          Number(b[1].totalAmount || 0) - Number(a[1].totalAmount || 0);
        return diff !== 0
          ? diff
          : (b[1].createdAt || 0) - (a[1].createdAt || 0);
      }
      if (orderSortBy === 'URGENT_SOS') {
        const diff = getUrgencyScore(b[1]) - getUrgencyScore(a[1]);
        return diff !== 0
          ? diff
          : (b[1].createdAt || 0) - (a[1].createdAt || 0);
      }
      return (b[1].createdAt || 0) - (a[1].createdAt || 0);
    });

    return entries;
  }, [state.orders, state.restaurants, orderStatusFilter, orderSearch, orderSortBy]);

  const visibleOrderIds = useMemo(
    () => filteredOrders.map(([id]) => id),
    [filteredOrders]
  );

  const selectedVisibleCount = useMemo(
    () => visibleOrderIds.filter((id) => validSelectedOrderIds.includes(id)).length,
    [visibleOrderIds, validSelectedOrderIds]
  );

  const allVisibleSelected =
    visibleOrderIds.length > 0 &&
    selectedVisibleCount === visibleOrderIds.length;

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate =
        selectedVisibleCount > 0 && !allVisibleSelected;
    }
  }, [selectedVisibleCount, allVisibleSelected]);

  const toggleSelectAllVisibleOrders = () => {
    if (allVisibleSelected) {
      setSelectedOrderIds((prev) =>
        prev.filter((id) => !visibleOrderIds.includes(id))
      );
    } else {
      setSelectedOrderIds((prev) =>
        Array.from(new Set([...prev, ...visibleOrderIds]))
      );
    }
  };

  const upiOrders = useMemo(
    () =>
      Object.entries(state.orders)
        .filter(([, o]) => o.paymentMode === 'UPI')
        .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)),
    [state.orders]
  );

  const walletRequestsList = useMemo(
    () =>
      Object.entries(state.walletRequests).sort(
        (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)
      ),
    [state.walletRequests]
  );

  const riderPayoutsList = useMemo(
    () =>
      Object.entries(state.riderPayouts).sort(
        (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)
      ),
    [state.riderPayouts]
  );

  const settlementsList = useMemo(
    () =>
      Object.entries(state.settlements).sort(
        (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)
      ),
    [state.settlements]
  );

  const storePayoutsList = useMemo(
    () =>
      Object.entries(state.storePayouts).sort(
        (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)
      ),
    [state.storePayouts]
  );

  const filteredStores = useMemo(() => {
    const q = storeSearch.toLowerCase().trim();
    let entries = Object.entries(state.restaurants);
    if (storeFilter === 'APPROVED') {
      entries = entries.filter(([, s]) => s.approved === true && !s.suspended);
    } else if (storeFilter === 'PENDING') {
      entries = entries.filter(([, s]) => s.approved !== true && !s.suspended);
    } else if (storeFilter === 'OPEN') {
      entries = entries.filter(
        ([, s]) => s.approved === true && !s.suspended && s.isOpen !== false
      );
    } else if (storeFilter === 'SUSPENDED') {
      entries = entries.filter(([, s]) => s.suspended === true);
    } else if (storeFilter === 'NO_GPS') {
      entries = entries.filter(([, s]) => {
        const lat = Number(s.lat);
        const lng = Number(s.lng);
        return !Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0;
      });
    }
    if (!q) return entries;
    return entries.filter(
      ([, s]) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.phone || '').includes(q) ||
        (s.cuisine || '').toLowerCase().includes(q)
    );
  }, [state.restaurants, storeSearch, storeFilter]);

  const filteredRiders = useMemo(() => {
    const q = riderSearch.toLowerCase().trim();
    let entries = Object.entries(state.deliveryPartners);
    if (riderFilter === 'ONLINE') {
      entries = entries.filter(([, d]) => d.online === true && !d.suspended);
    } else if (riderFilter === 'RESTRICTED') {
      entries = entries.filter(([, d]) => d.codAssignmentRestricted === true);
    } else if (riderFilter === 'FLAGGED') {
      entries = entries.filter(([, d]) => d.codReviewFlagged === true);
    } else if (riderFilter === 'PENDING') {
      entries = entries.filter(([, d]) => d.approved !== true && !d.suspended);
    } else if (riderFilter === 'SUSPENDED') {
      entries = entries.filter(([, d]) => d.suspended === true);
    }
    if (!q) return entries;
    return entries.filter(
      ([, d]) =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.phone || '').includes(q) ||
        (d.vehicle || '').toLowerCase().includes(q)
    );
  }, [state.deliveryPartners, riderSearch, riderFilter]);

  const spamCustomerUids = useMemo(() => {
    const set = new Set<string>();
    Object.values(state.orders).forEach((o) => {
      if (o.isSpamSuspect && o.customerUid) {
        set.add(o.customerUid);
      }
    });
    return set;
  }, [state.orders]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase().trim();
    let entries = Object.entries(state.customers);
    if (customerFilter === 'ACTIVE') {
      entries = entries.filter(([, c]) => c.blocked !== true);
    } else if (customerFilter === 'BANNED') {
      entries = entries.filter(([, c]) => c.blocked === true);
    } else if (customerFilter === 'WALLET') {
      entries = entries.filter(([, c]) => Number(c.walletBalance || 0) > 0);
    } else if (customerFilter === 'SPAM') {
      entries = entries.filter(([uid]) => spamCustomerUids.has(uid));
    }
    if (!q) return entries;
    return entries.filter(
      ([uid, c]) =>
        uid.toLowerCase().includes(q) ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.referralCode || '').toLowerCase().includes(q)
    );
  }, [state.customers, customerSearch, customerFilter, spamCustomerUids]);

  const filteredFeedbacks = useMemo(() => {
    const entries = Object.entries(state.feedbacks).sort(
      (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)
    );
    if (feedbackFilter === 'OPEN') {
      return entries.filter(([, f]) => f.status !== 'RESOLVED');
    }
    if (feedbackFilter !== 'ALL') {
      return entries.filter(([, f]) => f.role === feedbackFilter);
    }
    return entries;
  }, [state.feedbacks, feedbackFilter]);

  const reportMetrics = useMemo(() => {
    let verifiedUPI = 0;
    let totalSettledCash = 0;
    let totalPaidStores = 0;
    let totalPaidRiders = 0;
    let current30DayRevenue = 0;
    let prev30DayRevenue = 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const currentWindowStart = new Date(todayStart);
    currentWindowStart.setDate(todayStart.getDate() - 29);
    const prevWindowStart = new Date(todayStart);
    prevWindowStart.setDate(todayStart.getDate() - 59);
    const currentStartMs = currentWindowStart.getTime();
    const prevStartMs = prevWindowStart.getTime();

    Object.values(state.orders).forEach((o) => {
      if (o.paymentMode === 'UPI' && o.paymentStatus === 'VERIFIED') {
        verifiedUPI += Number(o.totalAmount || 0);
      }
      if (o.status === 'DELIVERED') {
        const ts = o.createdAt || o.updatedAt;
        if (ts) {
          const amt = Number(o.totalAmount || 0);
          if (ts >= currentStartMs) {
            current30DayRevenue += amt;
          } else if (ts >= prevStartMs && ts < currentStartMs) {
            prev30DayRevenue += amt;
          }
        }
      }
    });
    Object.values(state.settlements).forEach((s) => {
      if (s.status === 'APPROVED') totalSettledCash += Number(s.amount || 0);
    });
    Object.values(state.storePayouts).forEach((p) => {
      if (p.status === 'PAID') totalPaidStores += Number(p.amount || 0);
    });
    Object.values(state.riderPayouts).forEach((p) => {
      if (p.status === 'PAID') totalPaidRiders += Number(p.amount || 0);
    });

    let momGrowthPercent = 0;
    let momTrend: 'up' | 'down' | 'flat' = 'flat';
    let momGrowthLabel = '0.0%';

    if (prev30DayRevenue > 0) {
      momGrowthPercent =
        ((current30DayRevenue - prev30DayRevenue) / prev30DayRevenue) * 100;
      if (momGrowthPercent > 0.05) {
        momTrend = 'up';
        momGrowthLabel = `+${momGrowthPercent.toFixed(1)}%`;
      } else if (momGrowthPercent < -0.05) {
        momTrend = 'down';
        momGrowthLabel = `${momGrowthPercent.toFixed(1)}%`;
      } else {
        momTrend = 'flat';
        momGrowthLabel = '0.0%';
      }
    } else if (current30DayRevenue > 0) {
      momGrowthPercent = 100;
      momTrend = 'up';
      momGrowthLabel = '+100.0%';
    }

    const topStores = Object.entries(state.restaurants)
      .map(([uid, s]) => {
        const m = getStorePayoutMetrics(uid);
        return {
          uid,
          name: s.name || 'Store',
          orders: m.orderCount,
          sales: m.grossSales,
          comm: m.adminCut,
        };
      })
      .sort((a, b) => b.sales - a.sales);

    return {
      verifiedUPI,
      totalSettledCash,
      totalPaidStores,
      totalPaidRiders,
      current30DayRevenue,
      prev30DayRevenue,
      momGrowthPercent,
      momTrend,
      momGrowthLabel,
      topStores,
    };
  }, [state, getStorePayoutMetrics]);

  return (
    <>
      {/* TOAST CONTAINER */}
      <div id="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <i className="fa-solid fa-shield-halved"></i>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      {/* GOOGLE MAPS DEMO QUOTA NOTICE */}
      {mapsQuotaExceeded && (
        <div
          className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm"
          role="alert"
        >
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* OFFLINE CONNECTIVITY INDICATOR */}
      <OfflineIndicator />

      {!authChecked ? (
        <div id="auth-screen">
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <div className="auth-brand">
              <i className="fa-solid fa-basket-shopping"></i>
              <h1>Gossaigaon Bazar</h1>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Initializing Master Admin Terminal...
            </p>
          </div>
        </div>
      ) : !authUser ? (
        <AuthScreen
          externalError={authError}
          onClearExternalError={() => setAuthError('')}
        />
      ) : (
        <div id="app-container">
          {/* Mobile sidebar backdrop */}
          <div
            className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
            onClick={() => setSidebarOpen(false)}
          />

          {/* SIDEBAR */}
          <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} id="sidebar">
            <div className="sidebar-header">
              <i className="fa-solid fa-basket-shopping"></i>
              <div>
                <h3>Gossaigaon</h3>
                <small>
                  <i className="fa-solid fa-satellite-dish"></i> Master OS &amp;
                  CMS
                </small>
              </div>
            </div>

            <ul className="nav-links">
              <li
                className={`nav-item ${activePanel === 'dashboard' ? 'active' : ''}`}
                onClick={() => switchPanel('dashboard')}
              >
                <div className="nav-item-content">
                  <i className="fa-solid fa-chart-pie"></i>{' '}
                  <span>Overview Radar</span>
                </div>
              </li>

              <li
                className={`nav-item ${activePanel === 'product-approvals' ? 'active' : ''}`}
                onClick={() => switchPanel('product-approvals')}
              >
                <div className="nav-item-content">
                  <i
                    className="fa-solid fa-circle-check"
                    style={{ color: '#22c55e' }}
                  ></i>{' '}
                  <span>Product Approvals</span>
                </div>
                <span
                  className="nav-badge-pill"
                  style={{ background: '#f59e0b', color: '#000' }}
                >
                  {stats.pendingProductsCount}
                </span>
              </li>

              <li
                className={`nav-item ${activePanel === 'cms' ? 'active' : ''}`}
                onClick={() => switchPanel('cms')}
              >
                <div className="nav-item-content">
                  <i
                    className="fa-solid fa-palette"
                    style={{ color: '#ec4899' }}
                  ></i>{' '}
                  <span>🎨 Customer Customizer</span>
                </div>
                <span
                  className="nav-badge-pill"
                  style={{ background: '#ec4899', color: '#fff' }}
                >
                  LIVE
                </span>
              </li>

              <li
                className={`nav-item ${activePanel === 'controls' ? 'active' : ''}`}
                onClick={() => switchPanel('controls')}
              >
                <div className="nav-item-content">
                  <i
                    className="fa-solid fa-sliders"
                    style={{ color: '#a855f7' }}
                  ></i>{' '}
                  <span>🎛️ Limits &amp; Panel Ctrl</span>
                </div>
                <span
                  className="nav-badge-pill"
                  style={{ background: '#a855f7', color: '#fff' }}
                >
                  PRO
                </span>
              </li>

              <li
                className={`nav-item ${activePanel === 'service-areas' ? 'active' : ''}`}
                onClick={() => switchPanel('service-areas')}
              >
                <div className="nav-item-content">
                  <i
                    className="fa-solid fa-map-location-dot"
                    style={{ color: '#22c55e' }}
                  ></i>{' '}
                  <span>Service Area Control</span>
                </div>
                <span
                  className="nav-badge-pill"
                  style={{
                    background:
                      Object.values(state.serviceAreas || {}).filter(
                        (z) => z.enabled
                      ).length > 0
                        ? '#16a34a'
                        : '#64748b',
                    color: '#fff',
                  }}
                >
                  {
                    Object.values(state.serviceAreas || {}).filter(
                      (z) => z.enabled
                    ).length
                  }
                </span>
              </li>

              <li
                className={`nav-item ${activePanel === 'orders' ? 'active' : ''}`}
                onClick={() => switchPanel('orders')}
              >
                <div className="nav-item-content">
                  <i className="fa-solid fa-receipt"></i>{' '}
                  <span>All Orders (2/3 Row)</span>
                </div>
                {stats.unassignedCount > 0 && (
                  <span
                    className="nav-badge-pill"
                    style={{ background: '#f59e0b', color: '#000' }}
                  >
                    {stats.unassignedCount}
                  </span>
                )}
              </li>

              <li
                className={`nav-item ${activePanel === 'upi' ? 'active' : ''}`}
                onClick={() => switchPanel('upi')}
              >
                <div className="nav-item-content">
                  <i
                    className="fa-solid fa-qrcode"
                    style={{ color: '#0284c7' }}
                  ></i>{' '}
                  <span>UPI &amp; Screenshots</span>
                </div>
                <span className="nav-badge-pill">{stats.pendingUpiCount}</span>
              </li>

              <li
                className={`nav-item ${activePanel === 'wallet-requests' ? 'active' : ''}`}
                onClick={() => switchPanel('wallet-requests')}
              >
                <div className="nav-item-content">
                  <i
                    className="fa-solid fa-wallet"
                    style={{ color: '#d97706' }}
                  ></i>{' '}
                  <span>Customer Wallets</span>
                </div>
                <span
                  className="nav-badge-pill"
                  style={{ background: '#f59e0b', color: '#000' }}
                >
                  {stats.pendingWalletCount}
                </span>
              </li>

              <li
                className={`nav-item ${activePanel === 'rider-payouts' ? 'active' : ''}`}
                onClick={() => switchPanel('rider-payouts')}
              >
                <div className="nav-item-content">
                  <i
                    className="fa-solid fa-money-bill-transfer"
                    style={{ color: '#0284c7' }}
                  ></i>{' '}
                  <span>Rider Payouts</span>
                </div>
                <span
                  className="nav-badge-pill"
                  style={{ background: '#0284c7', color: '#fff' }}
                >
                  {stats.pendingRiderPayoutCount}
                </span>
              </li>

              <li
                className={`nav-item ${activePanel === 'settlements' ? 'active' : ''}`}
                onClick={() => switchPanel('settlements')}
              >
                <div className="nav-item-content">
                  <i
                    className="fa-solid fa-hand-holding-dollar"
                    style={{ color: '#16a34a' }}
                  ></i>{' '}
                  <span>Rider COD Cash</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {smartSettleReport.restrictedCount > 0 && (
                    <span
                      className="nav-badge-pill"
                      style={{ background: '#ef4444', color: '#fff' }}
                    >
                      🚫{smartSettleReport.restrictedCount}
                    </span>
                  )}
                  <span
                    className="nav-badge-pill"
                    style={{ background: '#16a34a', color: '#fff' }}
                  >
                    {stats.pendingSettlementCount}
                  </span>
                </div>
              </li>

              <li
                className={`nav-item ${activePanel === 'store-payouts' ? 'active' : ''}`}
                onClick={() => switchPanel('store-payouts')}
              >
                <div className="nav-item-content">
                  <i
                    className="fa-solid fa-building-columns"
                    style={{ color: '#9333ea' }}
                  ></i>{' '}
                  <span>Store Payouts</span>
                </div>
                <span
                  className="nav-badge-pill"
                  style={{ background: '#9333ea', color: '#fff' }}
                >
                  {stats.pendingStorePayoutCount}
                </span>
              </li>

              <li
                className={`nav-item ${activePanel === 'stores' ? 'active' : ''}`}
                onClick={() => switchPanel('stores')}
              >
                <div className="nav-item-content">
                  <i className="fa-solid fa-store"></i>{' '}
                  <span>Stores &amp; Catalogs</span>
                </div>
              </li>

              <li
                className={`nav-item ${activePanel === 'delivery' ? 'active' : ''}`}
                onClick={() => switchPanel('delivery')}
              >
                <div className="nav-item-content">
                  <i className="fa-solid fa-motorcycle"></i>{' '}
                  <span>Riders, Ratings &amp; GPS</span>
                </div>
              </li>

              <li
                className={`nav-item ${activePanel === 'customers' ? 'active' : ''}`}
                onClick={() => switchPanel('customers')}
              >
                <div className="nav-item-content">
                  <i className="fa-solid fa-user-shield"></i>{' '}
                  <span>Customers &amp; Spam</span>
                </div>
              </li>

              <li
                className={`nav-item ${activePanel === 'security' ? 'active' : ''}`}
                onClick={() => switchPanel('security')}
              >
                <div className="nav-item-content">
                  <i
                    className="fa-solid fa-shield-halved"
                    style={{
                      color:
                        scamScan.threats.length > 0 ? '#dc2626' : '#0284c7',
                    }}
                  ></i>{' '}
                  <span>Security Center</span>
                </div>
                {scamScan.threats.length > 0 ? (
                  <span
                    className="nav-badge-pill"
                    style={{ background: '#ef4444', color: '#fff' }}
                  >
                    {scamScan.threats.length}
                  </span>
                ) : (
                  <span
                    className="nav-badge-pill"
                    style={{ background: '#16a34a', color: '#fff' }}
                  >
                    SAFE
                  </span>
                )}
              </li>

              <li
                className={`nav-item ${activePanel === 'feedbacks' ? 'active' : ''}`}
                onClick={() => switchPanel('feedbacks')}
              >
                <div className="nav-item-content">
                  <i
                    className="fa-solid fa-comments"
                    style={{ color: '#059669' }}
                  ></i>{' '}
                  <span>Helpline &amp; Feedback</span>
                </div>
                <span
                  className="nav-badge-pill"
                  style={{ background: '#10b981', color: '#fff' }}
                >
                  {stats.openFeedbackCount}
                </span>
              </li>

              <li
                className={`nav-item ${activePanel === 'reports' ? 'active' : ''}`}
                onClick={() => switchPanel('reports')}
              >
                <div className="nav-item-content">
                  <i className="fa-solid fa-chart-line"></i>{' '}
                  <span>Financials &amp; Profit</span>
                </div>
              </li>
            </ul>

            <div style={{ padding: '0 1.25rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{
                  width: '100%',
                  borderColor: 'rgba(22,163,74,0.4)',
                  color: 'var(--primary)',
                }}
                onClick={seedSampleData}
              >
                <i className="fa-solid fa-wand-magic-sparkles"></i> 1-Click Demo
                Setup
              </button>
              <a
                href="/gossaigaon-bazar-admin.zip"
                download="gossaigaon-bazar-admin.zip"
                className="btn btn-outline btn-sm"
                style={{
                  width: '100%',
                  borderColor: '#7dd3fc',
                  color: '#0369a1',
                  textDecoration: 'none',
                }}
                title="Download complete app source code ZIP"
              >
                <i className="fa-solid fa-file-zipper"></i> Download App ZIP
              </a>
            </div>

            <div className="sidebar-footer">
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: '100%' }}
                onClick={() => auth.signOut()}
              >
                <i className="fa-solid fa-arrow-right-from-bracket"></i> Sign Out
              </button>
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <DeliveryFleetMapsProvider>
          <main className="content-area">
            <div className="topbar">
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
              >
                <button
                  type="button"
                  className="mobile-menu-btn"
                  onClick={() => setSidebarOpen((o) => !o)}
                >
                  <i className="fa-solid fa-bars"></i>
                </button>
                <h2 id="section-title">{PANEL_TITLES[activePanel]}</h2>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{
                    borderColor: '#7dd3fc',
                    color: '#0f172a',
                    background: '#ffffff',
                  }}
                  onClick={() => setCommandSearchOpen(true)}
                  title="Global Command Search (Ctrl+K)"
                >
                  <i className="fa-solid fa-magnifying-glass" style={{ color: '#0284c7' }}></i> Search{' '}
                  <span style={{ opacity: 0.7, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    (Ctrl+K)
                  </span>
                </button>
                <PWAInstallButton />

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={
                    pushPermission === 'granted' && pushPrefs.enabled
                      ? {
                          borderColor: 'rgba(2, 132, 199, 0.45)',
                          color: '#0284c7',
                        }
                      : {
                          borderColor: 'rgba(217, 119, 6, 0.45)',
                          color: 'var(--warning)',
                        }
                  }
                  onClick={() => {
                    setPushPermission(getNotificationPermissionState());
                    setPushModalOpen(true);
                  }}
                >
                  <i
                    className={`fa-solid ${pushPermission === 'granted' && pushPrefs.enabled ? 'fa-bell' : 'fa-bell-slash'}`}
                  ></i>{' '}
                  {pushPermission === 'granted' && pushPrefs.enabled
                    ? 'Push: ON'
                    : 'Push Alerts'}
                </button>

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleToggleMute}
                  id="sound-btn"
                >
                  <i
                    className={`fa-solid ${soundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}
                  ></i>{' '}
                  {soundEnabled ? 'Alert: ON' : 'Alert: OFF'}
                </button>

                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{
                    borderColor: 'rgba(2, 132, 199, 0.45)',
                    color: '#0284c7',
                  }}
                  onClick={() => lockTerminalNow('manual')}
                  title="Lock Admin Terminal"
                >
                  <i className="fa-solid fa-lock"></i> Lock
                </button>

                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--primary)',
                    background: 'var(--primary-glow)',
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: '1px solid var(--primary)',
                    fontWeight: 800,
                  }}
                  id="admin-user-badge"
                >
                  🛡️ {authUser.email}
                </div>
              </div>
            </div>

            {/* NON-INTRUSIVE PUSH PERMISSION PROMPT WHEN DEFAULT */}
            {pushPermission === 'default' && showPushPromptBanner && (
              <div
                style={{
                  background:
                    'linear-gradient(135deg, rgba(2, 132, 199, 0.08), rgba(22, 163, 74, 0.08))',
                  border: '1px solid rgba(2, 132, 199, 0.35)',
                  borderRadius: '14px',
                  padding: '0.85rem 1.15rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <i
                    className="fa-solid fa-bell"
                    style={{ color: '#0284c7', fontSize: '1.15rem' }}
                  ></i>
                  <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>
                    Enable Native Push Notifications for instant alerts on New
                    Orders, UPI Verifications, SOS &amp; Payout Requests.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleEnablePushFromBanner}
                  >
                    <i className="fa-solid fa-bell"></i> Enable Push
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setShowPushPromptBanner(false)}
                  >
                    Later
                  </button>
                </div>
              </div>
            )}

            {/* SECTION 1: DASHBOARD OVERVIEW */}
            <section
              id="panel-dashboard"
              className={`panel-section ${activePanel === 'dashboard' ? 'active' : ''}`}
            >
              {scamScan.threats.length > 0 && (
                <div className="security-alert-banner" role="alert">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <i
                      className="fa-solid fa-shield-virus"
                      style={{ color: '#dc2626', fontSize: '1.25rem' }}
                    ></i>
                    <div>
                      <strong style={{ color: '#991b1b', fontSize: '0.88rem' }}>
                        Scam &amp; UTR Protection Alert:{' '}
                        {scamScan.threats.length} Active Threat(s)
                      </strong>
                      <div style={{ fontSize: '0.76rem', color: '#475569' }}>
                        {scamScan.duplicateUtrCount} duplicate UTR collision(s) •{' '}
                        {scamScan.invalidUtrCount} suspicious UTR(s) •{' '}
                        {scamScan.repeatOffenderCount} repeat risk account(s)
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => switchPanel('security')}
                  >
                    <i className="fa-solid fa-shield-halved"></i> Inspect
                    Security Center
                  </button>
                </div>
              )}

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-info">
                    <h4>Total Orders</h4>
                    <div className="stat-value">{stats.totalOrders}</div>
                  </div>
                  <div className="stat-icon">
                    <i className="fa-solid fa-receipt"></i>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <h4>Gross Sales</h4>
                    <div
                      className="stat-value"
                      style={{ color: 'var(--primary)' }}
                    >
                      ₹{stats.totalRevenue.toFixed(0)}
                    </div>
                  </div>
                  <div className="stat-icon">
                    <i className="fa-solid fa-sack-dollar"></i>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <h4>Admin Profit</h4>
                    <div className="stat-value" style={{ color: '#0284c7' }}>
                      ₹{stats.adminProfit.toFixed(0)}
                    </div>
                  </div>
                  <div className="stat-icon">
                    <i className="fa-solid fa-coins"></i>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <h4>Pending Products</h4>
                    <div
                      className="stat-value"
                      style={{ color: 'var(--warning)' }}
                    >
                      {stats.pendingProductsCount}
                    </div>
                  </div>
                  <div className="stat-icon">
                    <i className="fa-solid fa-box-open"></i>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <h4>Rider COD Held</h4>
                    <div
                      className="stat-value"
                      style={{ color: 'var(--warning)' }}
                    >
                      ₹{stats.totalRidersCash.toFixed(0)}
                    </div>
                  </div>
                  <div className="stat-icon">
                    <i className="fa-solid fa-wallet"></i>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-info">
                    <h4>Store Dues</h4>
                    <div className="stat-value" style={{ color: '#7e22ce' }}>
                      ₹{stats.totalStoresUnpaid.toFixed(0)}
                    </div>
                  </div>
                  <div className="stat-icon">
                    <i className="fa-solid fa-building-columns"></i>
                  </div>
                </div>
              </div>

              <SystemHealthCard
                state={state}
                scamScan={scamScan}
                stats={stats}
                restrictedRiderCount={smartSettleReport.restrictedCount}
                flaggedRiderCount={smartSettleReport.flaggedCount}
                onNavigatePanel={(panel) => switchPanel(panel)}
                onAutoDispatchPending={autoAssignAllPendingOrders}
              />

              <SmartInsightsCard
                insights={smartInsights}
                onInspectOrder={(orderId) => {
                  setDetailOrderId(orderId);
                  window.history.pushState({ modal: 'orderDetail' }, '');
                }}
                onAssignOrder={(orderId) => {
                  setAssignOrderId(orderId);
                  window.history.pushState({ modal: 'assign' }, '');
                }}
                onAutoDispatchAll={autoAssignAllPendingOrders}
                onBatchAssignStore={(orderIds) => {
                  setBulkAssignOrderIds(orderIds);
                  window.history.pushState({ modal: 'bulkAssign' }, '');
                }}
                onNavigatePanel={(panel) => switchPanel(panel)}
              />

              <div className="action-radar-grid">
                <div className="radar-card urgent-upi">
                  <div className="radar-card-header">
                    <div>
                      <strong style={{ color: '#0284c7', fontSize: '1.05rem' }}>
                        <i className="fa-solid fa-bolt"></i> Urgent UPI
                        Verifications
                      </strong>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--text-muted)',
                          marginTop: '2px',
                        }}
                      >
                        Check screenshot &amp; 12-digit UTR to unlock Store
                        Dispatch!
                      </div>
                    </div>
                    <span className="badge badge-warning">
                      {pendingUpiOrders.length} Pending
                    </span>
                  </div>
                  <div className="table-responsive" style={{ maxHeight: '280px' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Amount</th>
                          <th>UTR / Screenshot</th>
                          <th>1-Click Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingUpiOrders.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              style={{
                                textAlign: 'center',
                                color: 'var(--text-muted)',
                                padding: '1.5rem',
                              }}
                            >
                              🎉 No pending UPI verifications!
                            </td>
                          </tr>
                        ) : (
                          pendingUpiOrders.slice(0, 6).map(([orderId, o]) => {
                            const utr = String(
                              o.transactionId || 'Not Given'
                            ).trim();
                            const normUtr = normalizeUtr(o.transactionId);
                            const dupCount = normUtr
                              ? scamScan.utrCollisionMap[normUtr]?.length || 0
                              : 0;
                            const isInvalidUtr = Boolean(
                              scamScan.invalidOrderUtrIds[orderId]
                            );
                            return (
                              <tr key={orderId}>
                                <td>
                                  <strong>#{orderId.slice(-6)}</strong>
                                  <div
                                    style={{
                                      fontSize: '0.72rem',
                                      color: 'var(--text-muted)',
                                    }}
                                  >
                                    {o.phone || 'N/A'}
                                  </div>
                                </td>
                                <td>
                                  <strong
                                    style={{
                                      color: 'var(--primary)',
                                      fontSize: '0.95rem',
                                    }}
                                  >
                                    ₹{Number(o.totalAmount || 0).toFixed(0)}
                                  </strong>
                                </td>
                                <td>
                                  <code
                                    style={{
                                      color: '#0284c7',
                                      fontWeight: 800,
                                      fontSize: '0.85rem',
                                    }}
                                  >
                                    {utr}
                                  </code>
                                  {dupCount > 1 && (
                                    <div style={{ marginTop: '3px' }}>
                                      <span
                                        className="badge badge-danger"
                                        style={{ fontSize: '0.62rem' }}
                                      >
                                        🚨 DUPLICATE UTR ({dupCount}×)
                                      </span>
                                    </div>
                                  )}
                                  {dupCount <= 1 && isInvalidUtr && (
                                    <div style={{ marginTop: '3px' }}>
                                      <span
                                        className="badge badge-warning"
                                        style={{ fontSize: '0.62rem' }}
                                      >
                                        ⚠️ SUSPICIOUS UTR
                                      </span>
                                    </div>
                                  )}
                                  {o.paymentScreenshot && (
                                    <div>
                                      <button
                                        type="button"
                                        className="btn btn-info btn-sm"
                                        style={{
                                          marginTop: '4px',
                                          padding: '2px 6px',
                                        }}
                                        onClick={() =>
                                          setScreenshotModal({
                                            src: o.paymentScreenshot!,
                                            title: `Order #${orderId.slice(-6)} • UTR: ${o.transactionId || 'N/A'} • ₹${Number(o.totalAmount || 0).toFixed(0)}`,
                                          })
                                        }
                                      >
                                        <i className="fa-solid fa-image"></i>{' '}
                                        Proof
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-success btn-sm"
                                      onClick={() =>
                                        setUpiStatus(orderId, 'VERIFIED')
                                      }
                                    >
                                      <i className="fa-solid fa-check"></i>{' '}
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      onClick={() =>
                                        setUpiStatus(orderId, 'REJECTED')
                                      }
                                    >
                                      <i className="fa-solid fa-xmark"></i>
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

                <div className="radar-card live-orders">
                  <div className="radar-card-header">
                    <div>
                      <strong
                        style={{ color: 'var(--primary)', fontSize: '1.05rem' }}
                      >
                        <i className="fa-solid fa-satellite-dish"></i> Live
                        Orders Radar
                      </strong>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--text-muted)',
                          marginTop: '2px',
                        }}
                      >
                        Latest orders, spam flags, PINs &amp; quick cancel
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => switchPanel('orders')}
                    >
                      View All
                    </button>
                  </div>
                  <div className="table-responsive" style={{ maxHeight: '280px' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Phone / PIN</th>
                          <th>Total</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentOrders.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              style={{
                                textAlign: 'center',
                                color: 'var(--text-muted)',
                                padding: '1.5rem',
                              }}
                            >
                              No recent orders.
                            </td>
                          </tr>
                        ) : (
                          recentOrders.map(([orderId, o]) => (
                            <tr key={orderId}>
                              <td>
                                <strong>#{orderId.slice(-6)}</strong>{' '}
                                {o.isSpamSuspect && (
                                  <span
                                    className="badge badge-danger"
                                    style={{ fontSize: '0.6rem' }}
                                  >
                                    🚨 SPAM
                                  </span>
                                )}
                              </td>
                              <td>
                                {o.phone || 'N/A'}
                                <div>
                                  <span className="pin-chip">
                                    {o.deliveryOtp || '----'}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <strong>
                                  ₹{Number(o.totalAmount || 0).toFixed(0)}
                                </strong>
                              </td>
                              <td>{getStatusBadge(o.status)}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => {
                                      setDetailOrderId(orderId);
                                      window.history.pushState(
                                        { modal: 'orderDetail' },
                                        ''
                                      );
                                    }}
                                    title="Details"
                                  >
                                    <i className="fa-solid fa-eye"></i>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => {
                                      setAssignOrderId(orderId);
                                      window.history.pushState(
                                        { modal: 'assign' },
                                        ''
                                      );
                                    }}
                                    title="Assign Rider"
                                  >
                                    <i className="fa-solid fa-motorcycle"></i>
                                  </button>
                                  {o.status !== 'CANCELLED' &&
                                    o.status !== 'DELIVERED' && (
                                      <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        onClick={() =>
                                          adminCancelOrder(orderId)
                                        }
                                        title="Cancel Order"
                                      >
                                        <i className="fa-solid fa-ban"></i>
                                      </button>
                                    )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 1B: PRODUCT APPROVAL QUEUE */}
            <ProductApprovalsPanel
              activePanel={activePanel}
              state={state}
              adminEmail={authUser.email}
              filter={prodApprovalFilter}
              onChangeFilter={setProdApprovalFilter}
              onVerifyProduct={verifyStoreProduct}
              onOpenStoreModal={(storeUid) => {
                setManageStoreUid(storeUid);
                window.history.pushState({ modal: 'manageStore' }, '');
              }}
              onOpenScreenshot={(src, title) =>
                setScreenshotModal({ src, title })
              }
              onToast={showToast}
              onConfirmDialog={setDialogConfig}
            />

            {/* SECTION 2: CUSTOMER APP CUSTOMIZER (CMS) */}
            <CmsPanel
              activePanel={activePanel}
              settings={state.settings}
              onToast={showToast}
              onConfirmDialog={setDialogConfig}
            />

            {/* SECTION 2B: LIMITS & PANEL CONTROLS */}
            <ControlsPanel
              activePanel={activePanel}
              settings={state.settings}
              totalFleetCodCash={smartSettleReport.totalFleetCodCash}
              isPayoutWithdrawalFrozen={smartSettleReport.isPayoutWithdrawalFrozen}
              onAdminInterventionLiftFreeze={handleAdminInterventionLiftFreeze}
              onToast={showToast}
            />

            {/* SECTION 3: ALL ORDERS (2/3 PER ROW + CANCEL) */}
            <section
              id="panel-orders"
              className={`panel-section ${activePanel === 'orders' ? 'active' : ''}`}
            >
              <div className="card">
                <div className="card-title">
                  <span>Customer Grocery Orders &amp; Dispatch Engine</span>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        gap: '4px',
                        background: '#f8fafc',
                        padding: '4px',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <button
                        type="button"
                        className={`btn btn-sm ${orderLayout === 'grid3' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setOrderLayout('grid3')}
                      >
                        3/Row
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${orderLayout === 'grid2' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setOrderLayout('grid2')}
                      >
                        2/Row
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${orderLayout === 'table' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setOrderLayout('table')}
                      >
                        Table
                      </button>
                    </div>
                    <div
                      role="group"
                      aria-label="Sort orders"
                      style={{
                        display: 'flex',
                        gap: '4px',
                        background: '#f8fafc',
                        padding: '4px',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                        flexWrap: 'wrap',
                      }}
                    >
                      {(
                        [
                          ['NEWEST', 'Newest', 'fa-clock'],
                          ['OLDEST', 'Oldest', 'fa-clock-rotate-left'],
                          ['HIGHEST_VALUE', 'Highest Value', 'fa-indian-rupee-sign'],
                          ['URGENT_SOS', 'Urgent/SOS', 'fa-triangle-exclamation'],
                        ] as const
                      ).map(([sortKey, label, icon]) => (
                        <button
                          key={sortKey}
                          type="button"
                          className={`btn btn-sm ${
                            orderSortBy === sortKey
                              ? sortKey === 'URGENT_SOS'
                                ? 'btn-danger'
                                : 'btn-primary'
                              : 'btn-outline'
                          }`}
                          onClick={() => setOrderSortBy(sortKey)}
                        >
                          <i className={`fa-solid ${icon}`}></i> {label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={autoAssignAllPendingOrders}
                    >
                      <i className="fa-solid fa-location-arrow"></i> Smart
                      Auto-Dispatch
                    </button>
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      onClick={exportOrdersCSV}
                    >
                      <i className="fa-solid fa-file-excel"></i> Export CSV
                    </button>
                  </div>
                </div>

                <div className="filters-bar">
                  <input
                    type="text"
                    className="form-input"
                    style={{ maxWidth: '260px', padding: '0.45rem 0.85rem' }}
                    placeholder="Search ID / Phone / PIN / Note / Store..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                  />
                  {(
                    [
                      ['ALL', 'All'],
                      ['UNASSIGNED', '⚠️ Unassigned'],
                      ['SPAM', '🚨 Spam Flagged'],
                      ['PENDING_PAYMENT', '⏳ Pending Payment'],
                      ['PLACED', 'Placed'],
                      ['ACCEPTED', 'Accepted'],
                      ['PREPARING', 'Packing'],
                      ['READY_FOR_PICKUP', 'Ready'],
                      ['OUT_FOR_DELIVERY', 'Out for Delivery'],
                      ['DELIVERED', 'Delivered'],
                      ['CANCELLED', 'Cancelled'],
                    ] as const
                  ).map(([statusKey, label]) => (
                    <div
                      key={statusKey}
                      className={`filter-chip ${orderStatusFilter === statusKey ? 'active' : ''}`}
                      onClick={() => setOrderStatusFilter(statusKey)}
                    >
                      {label}
                    </div>
                  ))}
                </div>

                {orderLayout !== 'table' ? (
                  <div
                    className={`orders-grid-multi ${orderLayout === 'grid2' ? 'cols-2' : 'cols-3'}`}
                  >
                    {filteredOrders.length === 0 ? (
                      <div
                        style={{
                          gridColumn: '1 / -1',
                          textAlign: 'center',
                          color: 'var(--text-muted)',
                          padding: '2rem',
                        }}
                      >
                        No matching orders found.
                      </div>
                    ) : (
                      filteredOrders.map(([orderId, o]) => {
                        const storeName =
                          state.restaurants[o.restaurantId || '']?.name ||
                          'Store';
                        const riderName =
                          o.deliveryUid && state.deliveryPartners[o.deliveryUid]
                            ? state.deliveryPartners[o.deliveryUid].name ||
                              'Rider'
                            : 'Unassigned';
                        const rawItems: OrderItem[] = Array.isArray(o.items)
                          ? o.items
                          : Object.values(o.items || {});
                        const itemsSummary =
                          rawItems
                            .slice(0, 3)
                            .map((i) => `${i.qty}× ${i.name}`)
                            .join(', ') +
                          (rawItems.length > 3
                            ? ` +${rawItems.length - 3} more`
                            : '');

                        const isBillPrinted = Boolean(
                          o.billPrinted || printedOrderMap[orderId]
                        );
                        const billPrintedAt =
                          o.billPrintedAt || printedOrderMap[orderId];
                        const isActiveOrder =
                          o.status !== 'DELIVERED' && o.status !== 'CANCELLED';
                        const orderAgeMin = Math.max(
                          0,
                          Math.floor(
                            (nowTs - Number(o.createdAt || nowTs)) / 60_000
                          )
                        );
                        const slaSeverity =
                          orderAgeMin >= 25
                            ? 'crit'
                            : orderAgeMin >= 12
                              ? 'warn'
                              : 'ok';
                        const customerProfile = o.customerUid
                          ? smartInsights.customerProfiles[o.customerUid]
                          : undefined;
                        const custWaUrl = buildWhatsAppUrl(
                          o.phone,
                          `Hello, updating you regarding your Gossaigaon Bazar order #${orderId.slice(-6)}.`
                        );

                        return (
                          <div
                            key={orderId}
                            className={`order-grid-card ${o.isSpamSuspect ? 'spam-flagged' : ''}`}
                          >
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  borderBottom: '1px dashed var(--border)',
                                  paddingBottom: '6px',
                                  marginBottom: '6px',
                                }}
                              >
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <strong style={{ fontSize: '0.98rem' }}>
                                      #{orderId.slice(-6)}
                                    </strong>
                                    {isActiveOrder && (
                                      <span
                                        className={`sla-age-pill severity-${slaSeverity}`}
                                        title="Time elapsed since order placed"
                                      >
                                        ⏱ {orderAgeMin}m
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '0.7rem',
                                      color: 'var(--text-muted)',
                                    }}
                                  >
                                    {new Date(
                                      o.createdAt || Date.now()
                                    ).toLocaleTimeString()}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    textAlign: 'right',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-end',
                                    gap: '3px',
                                  }}
                                >
                                  {getStatusBadge(o.status)}
                                  <span
                                    className={`badge ${isBillPrinted ? 'badge-success' : 'badge-muted'}`}
                                    style={{ fontSize: '0.6rem' }}
                                    title={
                                      isBillPrinted && billPrintedAt
                                        ? `Bill slip printed at ${new Date(billPrintedAt).toLocaleTimeString()}`
                                        : 'Bill slip not printed yet'
                                    }
                                  >
                                    <i className="fa-solid fa-print"></i>{' '}
                                    {isBillPrinted
                                      ? 'Slip Printed'
                                      : 'Not Printed'}
                                  </span>
                                  {o.isSpamSuspect && (
                                    <div>
                                      <span
                                        className="badge badge-danger"
                                        style={{ fontSize: '0.6rem' }}
                                      >
                                        🚨 SPAM
                                      </span>
                                    </div>
                                  )}
                                  {customerProfile?.isVip && (
                                    <span
                                      className="badge badge-success"
                                      style={{ fontSize: '0.58rem' }}
                                      title={`${customerProfile.deliveredCount} delivered orders`}
                                    >
                                      ⭐ VIP ({customerProfile.deliveredCount})
                                    </span>
                                  )}
                                  {customerProfile?.isHighCancelRisk && (
                                    <span
                                      className="badge badge-warning"
                                      style={{ fontSize: '0.58rem' }}
                                      title={`${customerProfile.cancelCount}/${customerProfile.totalOrders} cancelled`}
                                    >
                                      ⚠️ Cancel Risk
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div
                                style={{
                                  fontSize: '0.78rem',
                                  marginBottom: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span>
                                  <strong>🏪 {storeName}</strong> • 📱{' '}
                                  {o.phone || 'N/A'}
                                </span>
                                {custWaUrl && (
                                  <a
                                    href={custWaUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="whatsapp-icon-link"
                                    style={{ width: '21px', height: '21px', fontSize: '0.75rem' }}
                                    title={`Message customer on WhatsApp (${o.phone})`}
                                  >
                                    <i className="fa-brands fa-whatsapp"></i>
                                  </a>
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--text-muted)',
                                  marginBottom: '6px',
                                }}
                              >
                                📍 {(o.address || '').slice(0, 42)}
                              </div>
                              <div
                                style={{
                                  background: '#f8fafc',
                                  border: '1px solid var(--border)',
                                  padding: '6px 8px',
                                  borderRadius: '8px',
                                  fontSize: '0.74rem',
                                  color: '#334155',
                                  marginBottom: '6px',
                                }}
                              >
                                {itemsSummary || 'Items'}
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '0.82rem',
                                }}
                              >
                                <span>
                                  <strong
                                    style={{
                                      color: 'var(--primary)',
                                      fontSize: '0.96rem',
                                    }}
                                  >
                                    ₹{Number(o.totalAmount || 0).toFixed(0)}
                                  </strong>{' '}
                                  ({o.paymentMode || 'COD'})
                                </span>
                                <span className="pin-chip">
                                  {o.deliveryOtp || '----'}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: '0.73rem',
                                  color: '#0284c7',
                                  fontWeight: 700,
                                  marginTop: '4px',
                                }}
                              >
                                🛵 {riderName}
                              </div>

                              {/* ORDER NOTES FIELD ON CARD */}
                              <div className="order-note-box">
                                <div className="order-note-label">
                                  <span>
                                    <i className="fa-solid fa-note-sticky"></i>{' '}
                                    Order Notes
                                  </span>
                                  {o.orderNotes &&
                                    orderNoteDrafts[orderId] === undefined && (
                                      <span
                                        style={{
                                          color: '#059669',
                                          fontSize: '0.62rem',
                                        }}
                                      >
                                        Saved
                                      </span>
                                    )}
                                </div>
                                <div className="order-note-inline-row">
                                  <input
                                    type="text"
                                    className="order-note-input"
                                    placeholder="e.g. customer called, fragile item..."
                                    aria-label={`Order notes for #${orderId.slice(-6)}`}
                                    value={
                                      orderNoteDrafts[orderId] !== undefined
                                        ? orderNoteDrafts[orderId]
                                        : o.orderNotes || ''
                                    }
                                    onChange={(e) =>
                                      setOrderNoteDrafts((prev) => ({
                                        ...prev,
                                        [orderId]: e.target.value,
                                      }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const val =
                                          orderNoteDrafts[orderId] !== undefined
                                            ? orderNoteDrafts[orderId]
                                            : o.orderNotes || '';
                                        void saveOrderNote(orderId, val);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="btn btn-warning btn-sm"
                                    style={{
                                      padding: '0.28rem 0.55rem',
                                      fontSize: '0.7rem',
                                    }}
                                    disabled={savingNoteOrderId === orderId}
                                    onClick={() => {
                                      const val =
                                        orderNoteDrafts[orderId] !== undefined
                                          ? orderNoteDrafts[orderId]
                                          : o.orderNotes || '';
                                      void saveOrderNote(orderId, val);
                                    }}
                                    title="Save Order Note"
                                  >
                                    {savingNoteOrderId === orderId
                                      ? '...'
                                      : 'Save'}
                                  </button>
                                </div>
                              </div>

                              {o.status !== 'DELIVERED' &&
                                o.status !== 'CANCELLED' && (
                                  <div
                                    className="order-quick-status-bar"
                                    role="group"
                                    aria-label={`Quick status for #${orderId.slice(-6)}`}
                                  >
                                    {(
                                      [
                                        ['PREPARING', 'PACKING'],
                                        ['READY_FOR_PICKUP', 'READY'],
                                        ['OUT_FOR_DELIVERY', 'OUT'],
                                      ] as const
                                    ).map(([statusVal, label]) => {
                                      const isCurrent =
                                        (o.status || 'PLACED') === statusVal ||
                                        (statusVal === 'PREPARING' &&
                                          o.status === 'PACKING');
                                      return (
                                        <button
                                          key={statusVal}
                                          type="button"
                                          className={`order-quick-status-btn ${isCurrent ? 'active' : ''}`}
                                          disabled={
                                            updatingOrderStatusId === orderId ||
                                            isCurrent
                                          }
                                          onClick={() =>
                                            void quickUpdateOrderStatus(
                                              orderId,
                                              statusVal
                                            )
                                          }
                                          title={`Set status to ${label}`}
                                        >
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                gap: '6px',
                                flexWrap: 'wrap',
                                borderTop: '1px solid var(--border)',
                                paddingTop: '8px',
                              }}
                            >
                              <button
                                type="button"
                                className="btn btn-info btn-sm"
                                style={{ flex: 1 }}
                                onClick={() => {
                                  setDetailOrderId(orderId);
                                  window.history.pushState(
                                    { modal: 'orderDetail' },
                                    ''
                                  );
                                }}
                              >
                                <i className="fa-solid fa-eye"></i> View
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => {
                                  setAssignOrderId(orderId);
                                  window.history.pushState(
                                    { modal: 'assign' },
                                    ''
                                  );
                                }}
                              >
                                <i className="fa-solid fa-motorcycle"></i>
                              </button>
                              <button
                                type="button"
                                className={`btn btn-sm ${isBillPrinted ? 'btn-success' : 'btn-outline'}`}
                                title={
                                  isBillPrinted
                                    ? 'Reprint Bill Slip'
                                    : 'Print Bill Slip'
                                }
                                aria-label={
                                  isBillPrinted
                                    ? `Reprint bill slip for order #${orderId.slice(-6)}`
                                    : `Print bill slip for order #${orderId.slice(-6)}`
                                }
                                onClick={() => printBillSlip(orderId)}
                              >
                                <i className="fa-solid fa-print"></i>
                              </button>
                              {o.status !== 'CANCELLED' &&
                                o.status !== 'DELIVERED' && (
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    onClick={() => adminCancelOrder(orderId)}
                                  >
                                    <i className="fa-solid fa-ban"></i> Cancel
                                  </button>
                                )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>
                            <input
                              ref={selectAllCheckboxRef}
                              type="checkbox"
                              className="order-checkbox"
                              aria-label="Select all visible orders"
                              checked={allVisibleSelected}
                              onChange={toggleSelectAllVisibleOrders}
                            />
                          </th>
                          <th>Order ID</th>
                          <th>Customer / GPS</th>
                          <th>Total</th>
                          <th>PIN</th>
                          <th>Payment</th>
                          <th>Rider</th>
                          <th>Bill Slip</th>
                          <th>Status &amp; Flags</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.length === 0 ? (
                          <tr>
                            <td
                              colSpan={10}
                              style={{
                                textAlign: 'center',
                                color: 'var(--text-muted)',
                                padding: '2rem',
                              }}
                            >
                              No matching orders found.
                            </td>
                          </tr>
                        ) : (
                          filteredOrders.map(([orderId, o]) => {
                            const isSelected =
                              validSelectedOrderIds.includes(orderId);
                            const isBillPrinted = Boolean(
                              o.billPrinted || printedOrderMap[orderId]
                            );
                            const billPrintedAt =
                              o.billPrintedAt || printedOrderMap[orderId];
                            const assignedBoy =
                              o.deliveryUid &&
                              state.deliveryPartners[o.deliveryUid] ? (
                                state.deliveryPartners[o.deliveryUid].name ||
                                'Rider'
                              ) : (
                                <em>Unassigned</em>
                              );

                            return (
                              <tr
                                key={orderId}
                                className={isSelected ? 'row-selected' : ''}
                              >
                                <td style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    className="order-checkbox"
                                    aria-label={`Select order #${orderId.slice(-6)}`}
                                    checked={isSelected}
                                    onChange={() =>
                                      toggleOrderSelection(orderId)
                                    }
                                  />
                                </td>
                                <td>
                                  <strong>#{orderId.slice(-6)}</strong>
                                  <br />
                                  <small style={{ color: 'var(--text-muted)' }}>
                                    {new Date(
                                      o.createdAt || Date.now()
                                    ).toLocaleTimeString()}
                                  </small>
                                </td>
                                <td>
                                  <strong>{o.phone || 'N/A'}</strong>
                                  <br />
                                  <small style={{ color: 'var(--text-muted)' }}>
                                    {(o.address || '').slice(0, 22)}...
                                  </small>
                                  {o.orderNotes && (
                                    <div>
                                      <span
                                        className="order-note-badge"
                                        title={o.orderNotes}
                                      >
                                        📝 {o.orderNotes}
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <strong>
                                    ₹{Number(o.totalAmount || 0).toFixed(0)}
                                  </strong>
                                </td>
                                <td>
                                  <span className="pin-chip">
                                    {o.deliveryOtp || '----'}
                                  </span>
                                </td>
                                <td>
                                  {o.paymentMode === 'UPI' ? (
                                    o.paymentStatus === 'VERIFIED' ? (
                                      <span className="badge badge-success">
                                        UPI Verified
                                      </span>
                                    ) : o.paymentStatus === 'REFUNDED' ? (
                                      <span className="badge badge-info">
                                        Refunded
                                      </span>
                                    ) : o.paymentStatus === 'REJECTED' ? (
                                      <span className="badge badge-danger">
                                        Rejected
                                      </span>
                                    ) : (
                                      <span
                                        className="badge badge-danger"
                                        onClick={() =>
                                          setUpiStatus(orderId, 'VERIFIED')
                                        }
                                        style={{ cursor: 'pointer' }}
                                      >
                                        Verify Now
                                      </span>
                                    )
                                  ) : (
                                    <span
                                      style={{
                                        fontWeight: 700,
                                        color: 'var(--text-muted)',
                                      }}
                                    >
                                      {o.paymentMode || 'COD'}
                                    </span>
                                  )}
                                </td>
                                <td>{assignedBoy}</td>
                                <td>
                                  <span
                                    className={`badge ${isBillPrinted ? 'badge-success' : 'badge-muted'}`}
                                    title={
                                      isBillPrinted && billPrintedAt
                                        ? `Printed at ${new Date(billPrintedAt).toLocaleTimeString()}`
                                        : 'Bill slip not printed yet'
                                    }
                                  >
                                    <i className="fa-solid fa-print"></i>{' '}
                                    {isBillPrinted ? 'Printed' : 'Not Printed'}
                                  </span>
                                  {isBillPrinted && billPrintedAt && (
                                    <div>
                                      <small
                                        style={{
                                          color: 'var(--text-muted)',
                                          fontSize: '0.68rem',
                                        }}
                                      >
                                        {new Date(
                                          billPrintedAt
                                        ).toLocaleTimeString()}
                                      </small>
                                    </div>
                                  )}
                                </td>
                                <td>
                                  {getStatusBadge(o.status)}
                                  {o.isSpamSuspect && (
                                    <div>
                                      <span className="badge badge-danger">
                                        🚨 SPAM
                                      </span>
                                    </div>
                                  )}
                                  {o.emergencyAlert && (
                                    <div>
                                      <span className="badge badge-danger">
                                        ⚠️ SOS
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <div
                                    style={{
                                      display: 'flex',
                                      gap: '5px',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="btn btn-info btn-sm"
                                      onClick={() => {
                                        setDetailOrderId(orderId);
                                        window.history.pushState(
                                          { modal: 'orderDetail' },
                                          ''
                                        );
                                      }}
                                    >
                                      <i className="fa-solid fa-eye"></i>
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-outline btn-sm"
                                      onClick={() => {
                                        setAssignOrderId(orderId);
                                        window.history.pushState(
                                          { modal: 'assign' },
                                          ''
                                        );
                                      }}
                                    >
                                      <i className="fa-solid fa-user-plus"></i>
                                    </button>
                                    <button
                                      type="button"
                                      className={`btn btn-sm ${isBillPrinted ? 'btn-success' : 'btn-outline'}`}
                                      title={
                                        isBillPrinted
                                          ? 'Reprint Bill Slip'
                                          : 'Print Bill Slip'
                                      }
                                      aria-label={
                                        isBillPrinted
                                          ? `Reprint bill slip for order #${orderId.slice(-6)}`
                                          : `Print bill slip for order #${orderId.slice(-6)}`
                                      }
                                      onClick={() => printBillSlip(orderId)}
                                    >
                                      <i className="fa-solid fa-print"></i>
                                    </button>
                                    {o.status !== 'CANCELLED' &&
                                      o.status !== 'DELIVERED' && (
                                        <button
                                          type="button"
                                          className="btn btn-danger btn-sm"
                                          onClick={() =>
                                            adminCancelOrder(orderId)
                                          }
                                        >
                                          <i className="fa-solid fa-ban"></i>
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
                )}
              </div>
            </section>

            {/* SECTION 4: UPI VERIFICATIONS & SCREENSHOTS */}
            <section
              id="panel-upi"
              className={`panel-section ${activePanel === 'upi' ? 'active' : ''}`}
            >
              <div className="card">
                <div className="card-title">
                  <span>Customer UPI Verifications, Screenshots &amp; Refunds</span>
                  <span className="badge badge-warning">
                    {stats.pendingUpiCount} Pending
                  </span>
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Order ID &amp; Status</th>
                        <th>Customer Phone</th>
                        <th>Amount</th>
                        <th>UTR &amp; Screenshot</th>
                        <th>Payment Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upiOrders.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            style={{
                              textAlign: 'center',
                              padding: '1.5rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No UPI transactions yet.
                          </td>
                        </tr>
                      ) : (
                        upiOrders.map(([orderId, o]) => {
                          const payStatus =
                            o.paymentStatus || 'PENDING_VERIFICATION';
                          const normUtr = normalizeUtr(o.transactionId);
                          const dupCount = normUtr
                            ? scamScan.utrCollisionMap[normUtr]?.length || 0
                            : 0;
                          const isInvalidUtr = Boolean(
                            scamScan.invalidOrderUtrIds[orderId]
                          );
                          return (
                            <tr key={orderId}>
                              <td>
                                <strong>#{orderId.slice(-6)}</strong>
                                <div>{getStatusBadge(o.status)}</div>
                              </td>
                              <td>{o.phone || 'N/A'}</td>
                              <td>
                                <strong style={{ color: 'var(--primary)' }}>
                                  ₹{Number(o.totalAmount || 0).toFixed(2)}
                                </strong>
                              </td>
                              <td>
                                <code
                                  style={{ color: '#0284c7', fontWeight: 800 }}
                                >
                                  {o.transactionId || 'N/A'}
                                </code>
                                {dupCount > 1 && (
                                  <div style={{ marginTop: '3px' }}>
                                    <span
                                      className="badge badge-danger"
                                      style={{ fontSize: '0.64rem' }}
                                    >
                                      🚨 DUPLICATE UTR ({dupCount}×)
                                    </span>
                                  </div>
                                )}
                                {dupCount <= 1 && isInvalidUtr && (
                                  <div style={{ marginTop: '3px' }}>
                                    <span
                                      className="badge badge-warning"
                                      style={{ fontSize: '0.64rem' }}
                                    >
                                      ⚠️ SUSPICIOUS UTR
                                    </span>
                                  </div>
                                )}
                                <div>
                                  {o.paymentScreenshot ? (
                                    <button
                                      type="button"
                                      className="btn btn-info btn-sm"
                                      style={{
                                        marginTop: '4px',
                                        padding: '2px 8px',
                                      }}
                                      onClick={() =>
                                        setScreenshotModal({
                                          src: o.paymentScreenshot!,
                                          title: `Order #${orderId.slice(-6)} • UTR: ${o.transactionId || 'N/A'} • ₹${Number(o.totalAmount || 0).toFixed(0)}`,
                                        })
                                      }
                                    >
                                      <i className="fa-solid fa-image"></i> View
                                      Screenshot
                                    </button>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: '0.7rem',
                                        color: 'var(--text-muted)',
                                      }}
                                    >
                                      No screenshot
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                {payStatus === 'VERIFIED' ? (
                                  <span className="badge badge-success">
                                    Verified
                                  </span>
                                ) : payStatus === 'REJECTED' ? (
                                  <span className="badge badge-danger">
                                    Rejected
                                  </span>
                                ) : payStatus === 'REFUNDED' ? (
                                  <span className="badge badge-info">
                                    Refunded
                                  </span>
                                ) : (
                                  <span className="badge badge-warning">
                                    Pending Verification
                                  </span>
                                )}
                              </td>
                              <td>
                                {payStatus === 'PENDING_VERIFICATION' &&
                                o.status !== 'CANCELLED' ? (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-success btn-sm"
                                      onClick={() =>
                                        setUpiStatus(orderId, 'VERIFIED')
                                      }
                                    >
                                      Verify
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      onClick={() =>
                                        setUpiStatus(orderId, 'REJECTED')
                                      }
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : o.status === 'CANCELLED' &&
                                  payStatus === 'VERIFIED' ? (
                                  <button
                                    type="button"
                                    className="btn btn-info btn-sm"
                                    onClick={() =>
                                      db
                                        .ref(`orders/${orderId}`)
                                        .update({
                                          paymentStatus: 'REFUNDED',
                                          updatedAt: Date.now(),
                                        })
                                        .then(() =>
                                          showToast(
                                            'Marked as UPI Refunded!',
                                            'info'
                                          )
                                        )
                                    }
                                  >
                                    Mark Refunded
                                  </button>
                                ) : (
                                  <small style={{ color: 'var(--text-muted)' }}>
                                    No action needed
                                  </small>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* SECTION 4B: CUSTOMER WALLET REQUESTS */}
            <section
              id="panel-wallet-requests"
              className={`panel-section ${activePanel === 'wallet-requests' ? 'active' : ''}`}
            >
              <div className="card" style={{ border: '1.5px solid #d97706' }}>
                <div className="card-title">
                  <span style={{ color: '#b45309' }}>
                    <i className="fa-solid fa-wallet"></i> Customer Wallet Deposit
                    &amp; Withdraw Requests
                  </span>
                  <span className="badge badge-warning">
                    {stats.pendingWalletCount} Pending
                  </span>
                </div>
                {smartSettleReport.isPayoutWithdrawalFrozen && (
                  <div className="security-alert-banner" role="alert" style={{ marginBottom: '1rem' }}>
                    <div>
                      <strong style={{ color: '#991b1b', fontSize: '0.85rem' }}>
                        🚨 Withdrawal Approvals Frozen by Financial Risk Radar Guard
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                        Fleet COD cash (₹{smartSettleReport.totalFleetCodCash.toFixed(0)}) exceeded threshold ₹{smartSettleReport.fleetCodRiskThreshold}. Wallet withdrawals remain locked until admin intervention.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-warning btn-sm"
                      onClick={handleAdminInterventionLiftFreeze}
                    >
                      <i className="fa-solid fa-gavel"></i> Admin Intervention
                    </button>
                  </div>
                )}
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>UTR / Customer UPI / Screenshot</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletRequestsList.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            style={{
                              textAlign: 'center',
                              padding: '1.5rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No wallet requests yet.
                          </td>
                        </tr>
                      ) : (
                        walletRequestsList.map(([reqId, r]) => {
                          const isDep = r.type === 'DEPOSIT';
                          const normUtr = isDep ? normalizeUtr(r.utr) : '';
                          const dupCount = normUtr
                            ? scamScan.utrCollisionMap[normUtr]?.length || 0
                            : 0;
                          const isInvalidUtr = Boolean(
                            isDep && scamScan.invalidWalletUtrIds[reqId]
                          );
                          return (
                            <tr key={reqId}>
                              <td>
                                <strong>{r.customerName || 'Customer'}</strong>
                                <div
                                  style={{
                                    fontSize: '0.74rem',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  {r.customerPhone || ''}
                                </div>
                              </td>
                              <td>
                                <span
                                  className={`badge ${isDep ? 'badge-success' : 'badge-info'}`}
                                >
                                  {isDep ? 'DEPOSIT' : 'WITHDRAW'}
                                </span>
                              </td>
                              <td>
                                <strong
                                  style={{ color: '#b45309', fontSize: '1rem' }}
                                >
                                  ₹{Number(r.amount || 0).toFixed(0)}
                                </strong>
                              </td>
                              <td>
                                <code>{r.utr || r.upiId || '-'}</code>
                                {dupCount > 1 && (
                                  <div style={{ marginTop: '3px' }}>
                                    <span
                                      className="badge badge-danger"
                                      style={{ fontSize: '0.64rem' }}
                                    >
                                      🚨 DUPLICATE UTR ({dupCount}×)
                                    </span>
                                  </div>
                                )}
                                {dupCount <= 1 && isInvalidUtr && (
                                  <div style={{ marginTop: '3px' }}>
                                    <span
                                      className="badge badge-warning"
                                      style={{ fontSize: '0.64rem' }}
                                    >
                                      ⚠️ SUSPICIOUS UTR
                                    </span>
                                  </div>
                                )}
                                {r.screenshot && (
                                  <div>
                                    <button
                                      type="button"
                                      className="btn btn-info btn-sm"
                                      style={{
                                        marginTop: '4px',
                                        padding: '2px 8px',
                                      }}
                                      onClick={() =>
                                        setScreenshotModal({
                                          src: r.screenshot!,
                                          title: `Wallet ${r.type} • ${r.customerName || ''} • ₹${r.amount}`,
                                        })
                                      }
                                    >
                                      <i className="fa-solid fa-image"></i> Proof
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td>
                                {r.status === 'APPROVED' ? (
                                  <span className="badge badge-success">
                                    Approved
                                  </span>
                                ) : r.status === 'REJECTED' ? (
                                  <span className="badge badge-danger">
                                    Rejected
                                  </span>
                                ) : (
                                  <span className="badge badge-warning">
                                    Pending
                                  </span>
                                )}
                              </td>
                              <td>
                                {r.status === 'PENDING' ? (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-success btn-sm"
                                      disabled={
                                        !isDep &&
                                        smartSettleReport.isPayoutWithdrawalFrozen
                                      }
                                      title={
                                        !isDep &&
                                        smartSettleReport.isPayoutWithdrawalFrozen
                                          ? 'Frozen by Financial Risk Radar Guard'
                                          : 'Approve request'
                                      }
                                      onClick={() =>
                                        processWalletRequest(reqId, true)
                                      }
                                    >
                                      {!isDep &&
                                      smartSettleReport.isPayoutWithdrawalFrozen
                                        ? '🔒 Frozen'
                                        : 'Approve'}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      onClick={() =>
                                        processWalletRequest(reqId, false)
                                      }
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <small style={{ color: 'var(--text-muted)' }}>
                                    Processed
                                  </small>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* SECTION 5: RIDER EARNINGS PAYOUTS */}
            <section
              id="panel-rider-payouts"
              className={`panel-section ${activePanel === 'rider-payouts' ? 'active' : ''}`}
            >
              <div className="card">
                <div className="card-title">
                  <span>Rider Earnings Withdrawal Requests</span>
                  <span className="badge badge-info">
                    {stats.pendingRiderPayoutCount} Pending
                  </span>
                </div>
                {smartSettleReport.isPayoutWithdrawalFrozen && (
                  <div className="security-alert-banner" role="alert" style={{ marginBottom: '1rem' }}>
                    <div>
                      <strong style={{ color: '#991b1b', fontSize: '0.85rem' }}>
                        🚨 Rider Payout Approvals Frozen by Financial Risk Radar Guard
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                        Fleet COD cash (₹{smartSettleReport.totalFleetCodCash.toFixed(0)}) exceeded threshold ₹{smartSettleReport.fleetCodRiskThreshold}. Disbursals disabled until admin intervention.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-warning btn-sm"
                      onClick={handleAdminInterventionLiftFreeze}
                    >
                      <i className="fa-solid fa-gavel"></i> Admin Intervention
                    </button>
                  </div>
                )}
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Rider Name &amp; Phone</th>
                        <th>Withdrawal Amount</th>
                        <th>Rider Receiving UPI</th>
                        <th>Request Time</th>
                        <th>Admin Transfer UTR</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riderPayoutsList.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              textAlign: 'center',
                              padding: '1.5rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No rider payout requests.
                          </td>
                        </tr>
                      ) : (
                        riderPayoutsList.map(([id, p]) => {
                          const isPaid = p.status === 'PAID';
                          return (
                            <tr key={id}>
                              <td>
                                <strong>{p.riderName || 'Rider'}</strong>
                                <div
                                  style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  {p.riderPhone || ''}
                                </div>
                              </td>
                              <td>
                                <strong
                                  style={{ color: '#0284c7', fontSize: '1rem' }}
                                >
                                  ₹{Number(p.amount || 0).toFixed(2)}
                                </strong>
                              </td>
                              <td>
                                <code
                                  style={{ color: '#0284c7', fontWeight: 800 }}
                                >
                                  {p.riderUpiId || 'Not Set'}
                                </code>
                              </td>
                              <td>
                                <small>
                                  {new Date(
                                    p.createdAt || Date.now()
                                  ).toLocaleDateString()}
                                </small>
                              </td>
                              <td>
                                <code>{p.adminRef || '-'}</code>
                              </td>
                              <td>
                                {isPaid ? (
                                  <span className="badge badge-success">
                                    ✅ Paid
                                  </span>
                                ) : p.status === 'REJECTED' ? (
                                  <span className="badge badge-danger">
                                    Rejected
                                  </span>
                                ) : (
                                  <span className="badge badge-warning">
                                    Pending
                                  </span>
                                )}
                              </td>
                              <td>
                                {!isPaid && p.status !== 'REJECTED' && (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      disabled={
                                        smartSettleReport.isPayoutWithdrawalFrozen
                                      }
                                      title={
                                        smartSettleReport.isPayoutWithdrawalFrozen
                                          ? 'Frozen by Financial Risk Radar Guard'
                                          : 'Pay Rider'
                                      }
                                      onClick={() =>
                                        openDisbursalByRef('RIDER', id)
                                      }
                                    >
                                      <i className="fa-solid fa-qrcode"></i>{' '}
                                      {smartSettleReport.isPayoutWithdrawalFrozen
                                        ? '🔒 Frozen'
                                        : 'Pay'}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      onClick={() =>
                                        db
                                          .ref(`riderPayouts/${id}`)
                                          .update({ status: 'REJECTED' })
                                      }
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* SECTION 6: RIDER COD CASH SETTLEMENTS */}
            <section
              id="panel-settlements"
              className={`panel-section ${activePanel === 'settlements' ? 'active' : ''}`}
            >
              <SmartAutoSettlePanel
                state={state}
                report={smartSettleReport}
                scamScan={scamScan}
                adminEmail={authUser.email}
                onApproveSettlement={approveSettlementWithSmartVerify}
                onRunAuditScan={runSmartCodAuditScan}
                onAdminInterventionLiftFreeze={handleAdminInterventionLiftFreeze}
                onToast={showToast}
                onConfirmDialog={setDialogConfig}
              />

              <div className="card">
                <div className="card-title">
                  <span>Rider COD Cash Deposit &amp; Handover Log</span>
                  <span className="badge badge-success">
                    {stats.pendingSettlementCount} Pending
                  </span>
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Rider Name &amp; Phone</th>
                        <th>Amount to Settle</th>
                        <th>Deposit Mode</th>
                        <th>UTR / Handover Ref</th>
                        <th>Date &amp; Time</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlementsList.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              textAlign: 'center',
                              padding: '1.5rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No COD cash handovers yet.
                          </td>
                        </tr>
                      ) : (
                        settlementsList.map(([id, s]) => {
                          const rider =
                            state.deliveryPartners[s.riderUid || ''] || {};
                          const riderPhone = rider.phone || '';
                          return (
                            <tr key={id}>
                              <td>
                                <strong>{s.riderName || 'Rider'}</strong>
                                <div
                                  style={{
                                    fontSize: '0.74rem',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  {riderPhone}
                                </div>
                                {rider.codAssignmentRestricted && (
                                  <span className="badge badge-danger">
                                    🚫 Restricted
                                  </span>
                                )}
                              </td>
                              <td>
                                <strong
                                  style={{
                                    color: 'var(--primary)',
                                    fontSize: '1rem',
                                  }}
                                >
                                  ₹{Number(s.amount || 0).toFixed(0)}
                                </strong>
                              </td>
                              <td>
                                <span className="badge badge-info">
                                  {s.mode || 'CASH'}
                                </span>
                              </td>
                              <td>
                                <code>{s.utr || 'HANDOVER'}</code>
                              </td>
                              <td>
                                <small>
                                  {new Date(
                                    s.createdAt || Date.now()
                                  ).toLocaleDateString()}
                                </small>
                              </td>
                              <td>
                                {s.status === 'APPROVED' ? (
                                  <span className="badge badge-success">
                                    Approved
                                  </span>
                                ) : s.status === 'REJECTED' ? (
                                  <span className="badge badge-danger">
                                    Rejected
                                  </span>
                                ) : (
                                  <span className="badge badge-warning">
                                    Pending
                                  </span>
                                )}
                              </td>
                              <td>
                                {s.status === 'PENDING' && (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-success btn-sm"
                                      onClick={() =>
                                        void approveSettlementWithSmartVerify(
                                          id,
                                          s
                                        )
                                      }
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      onClick={() =>
                                        db
                                          .ref(`settlements/${id}`)
                                          .update({ status: 'REJECTED' })
                                      }
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* SECTION 7: STORE PAYOUTS */}
            <section
              id="panel-store-payouts"
              className={`panel-section ${activePanel === 'store-payouts' ? 'active' : ''}`}
            >
              <div className="card">
                <div className="card-title">
                  <span>Store Payout Requests (Pay Kirana Merchants)</span>
                  <span className="badge badge-info">
                    {stats.pendingStorePayoutCount} Pending
                  </span>
                </div>
                {smartSettleReport.isPayoutWithdrawalFrozen && (
                  <div className="security-alert-banner" role="alert" style={{ marginBottom: '1rem' }}>
                    <div>
                      <strong style={{ color: '#991b1b', fontSize: '0.85rem' }}>
                        🚨 Store Payout Approvals Frozen by Financial Risk Radar Guard
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                        Fleet COD cash (₹{smartSettleReport.totalFleetCodCash.toFixed(0)}) exceeded threshold ₹{smartSettleReport.fleetCodRiskThreshold}. Store payouts disabled until admin intervention.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-warning btn-sm"
                      onClick={handleAdminInterventionLiftFreeze}
                    >
                      <i className="fa-solid fa-gavel"></i> Admin Intervention
                    </button>
                  </div>
                )}
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Store Name &amp; Phone</th>
                        <th>Payout Amount</th>
                        <th>Store Receiving UPI</th>
                        <th>Request Date</th>
                        <th>Admin Ref</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {storePayoutsList.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              textAlign: 'center',
                              padding: '1.5rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No store payout requests.
                          </td>
                        </tr>
                      ) : (
                        storePayoutsList.map(([id, p]) => {
                          const isPaid = p.status === 'PAID';
                          return (
                            <tr key={id}>
                              <td>
                                <strong>{p.storeName || 'Store'}</strong>
                                <div
                                  style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  {p.storePhone || ''}
                                </div>
                              </td>
                              <td>
                                <strong
                                  style={{ color: '#7e22ce', fontSize: '1rem' }}
                                >
                                  ₹{Number(p.amount || 0).toFixed(2)}
                                </strong>
                              </td>
                              <td>
                                <code>{p.storeUpiId || 'Not Set'}</code>
                              </td>
                              <td>
                                <small>
                                  {new Date(
                                    p.createdAt || Date.now()
                                  ).toLocaleDateString()}
                                </small>
                              </td>
                              <td>
                                <code>{p.adminRef || '-'}</code>
                              </td>
                              <td>
                                {isPaid ? (
                                  <span className="badge badge-success">
                                    ✅ Paid
                                  </span>
                                ) : p.status === 'REJECTED' ? (
                                  <span className="badge badge-danger">
                                    Rejected
                                  </span>
                                ) : (
                                  <span className="badge badge-warning">
                                    Pending
                                  </span>
                                )}
                              </td>
                              <td>
                                {!isPaid && p.status !== 'REJECTED' && (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      style={{ background: '#a855f7' }}
                                      disabled={
                                        smartSettleReport.isPayoutWithdrawalFrozen
                                      }
                                      title={
                                        smartSettleReport.isPayoutWithdrawalFrozen
                                          ? 'Frozen by Financial Risk Radar Guard'
                                          : 'Pay Store'
                                      }
                                      onClick={() =>
                                        openDisbursalByRef('STORE', id)
                                      }
                                    >
                                      <i className="fa-solid fa-qrcode"></i>{' '}
                                      {smartSettleReport.isPayoutWithdrawalFrozen
                                        ? '🔒 Frozen'
                                        : 'Pay'}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      onClick={() =>
                                        db
                                          .ref(`storePayouts/${id}`)
                                          .update({ status: 'REJECTED' })
                                      }
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* SECTION 8: STORES DIRECTORY & CATALOGS */}
            <section
              id="panel-stores"
              className={`panel-section ${activePanel === 'stores' ? 'active' : ''}`}
            >
              <div className="card">
                <div className="card-title">
                  <span>
                    Registered Grocery Stores, Full Details &amp; Catalog Control{' '}
                    <small style={{ color: 'var(--text-muted)' }}>
                      ({filteredStores.length})
                    </small>
                  </span>
                  <input
                    type="text"
                    className="form-input"
                    style={{ maxWidth: '240px', padding: '0.45rem 0.85rem' }}
                    placeholder="Search store name/phone..."
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                  />
                </div>
                <div className="filters-bar" style={{ marginBottom: '0.85rem' }}>
                  {(
                    [
                      ['ALL', 'All Stores'],
                      ['APPROVED', '✅ Approved'],
                      ['PENDING', '⏳ Pending Approval'],
                      ['OPEN', '🟢 Open Now'],
                      ['SUSPENDED', '🚫 Suspended'],
                      ['NO_GPS', '📍 Missing GPS'],
                    ] as const
                  ).map(([key, label]) => (
                    <div
                      key={key}
                      className={`filter-chip ${storeFilter === key ? 'active' : ''}`}
                      onClick={() => setStoreFilter(key)}
                    >
                      {label}
                    </div>
                  ))}
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Store Name &amp; GPS</th>
                        <th>Contact &amp; UPI</th>
                        <th>Duty / Items</th>
                        <th>Items Sales</th>
                        <th>Net Unpaid</th>
                        <th>Status</th>
                        <th>Full Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStores.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              textAlign: 'center',
                              padding: '1.5rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No stores found.
                          </td>
                        </tr>
                      ) : (
                        filteredStores.map(([uid, store]) => {
                          const metrics = getStorePayoutMetrics(uid);
                          const itemCount = Object.keys(
                            state.menus[uid] || {}
                          ).length;
                          return (
                            <tr key={uid}>
                              <td>
                                <strong>{store.name || 'Store'}</strong>
                                <div
                                  style={{
                                    fontSize: '0.74rem',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  {store.cuisine || ''}
                                </div>
                                {store.lat && store.lng ? (
                                  <a
                                    href={`https://www.google.com/maps?q=${store.lat},${store.lng}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      color: '#0284c7',
                                      fontSize: '0.74rem',
                                      textDecoration: 'none',
                                    }}
                                  >
                                    <i className="fa-solid fa-location-dot"></i>{' '}
                                    Map
                                  </a>
                                ) : (
                                  <small style={{ color: 'var(--text-muted)' }}>
                                    No GPS
                                  </small>
                                )}
                              </td>
                              <td>
                                {store.phone || 'N/A'}
                                <div
                                  style={{ fontSize: '0.74rem', color: '#0284c7' }}
                                >
                                  UPI: {store.upiId || 'Not Set'}
                                </div>
                              </td>
                              <td>
                                {store.isOpen !== false ? (
                                  <span className="badge badge-success">
                                    Open
                                  </span>
                                ) : (
                                  <span className="badge badge-danger">
                                    Closed
                                  </span>
                                )}
                                <div
                                  style={{
                                    fontSize: '0.74rem',
                                    color: 'var(--text-muted)',
                                    marginTop: '3px',
                                  }}
                                >
                                  {itemCount} Products
                                </div>
                              </td>
                              <td>₹{metrics.grossSales.toFixed(0)}</td>
                              <td>
                                <strong
                                  style={{ color: '#7e22ce', fontSize: '1rem' }}
                                >
                                  ₹{metrics.unpaidBalance.toFixed(2)}
                                </strong>
                              </td>
                              <td>
                                {store.suspended ? (
                                  <span className="badge badge-danger">
                                    Suspended
                                  </span>
                                ) : store.approved ? (
                                  <span className="badge badge-success">
                                    Approved
                                  </span>
                                ) : (
                                  <span className="badge badge-warning">
                                    Pending
                                  </span>
                                )}
                              </td>
                              <td>
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="btn btn-info btn-sm"
                                    onClick={() => {
                                      setManageStoreUid(uid);
                                      window.history.pushState(
                                        { modal: 'storeManage' },
                                        ''
                                      );
                                    }}
                                  >
                                    <i className="fa-solid fa-sliders"></i> Manage
                                    &amp; Catalog
                                  </button>
                                  {metrics.unpaidBalance > 0 && (
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      style={{ background: '#a855f7' }}
                                      disabled={
                                        smartSettleReport.isPayoutWithdrawalFrozen
                                      }
                                      title={
                                        smartSettleReport.isPayoutWithdrawalFrozen
                                          ? 'Frozen by Financial Risk Radar Guard'
                                          : 'Pay Store'
                                      }
                                      onClick={() =>
                                        openDisbursalByRef('DIRECT_STORE', uid)
                                      }
                                    >
                                      <i className="fa-solid fa-qrcode"></i>{' '}
                                      {smartSettleReport.isPayoutWithdrawalFrozen
                                        ? '🔒 Frozen'
                                        : 'Pay Store'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className={`btn btn-sm ${store.approved ? 'btn-danger' : 'btn-success'}`}
                                    onClick={() =>
                                      db
                                        .ref(`restaurants/${uid}`)
                                        .update({ approved: !store.approved })
                                    }
                                  >
                                    {store.approved ? 'Revoke' : 'Approve'}
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
            </section>

            {/* SECTION 9: DELIVERY FLEET GPS RADAR & RATINGS */}
            <section
              id="panel-delivery"
              className={`panel-section ${activePanel === 'delivery' ? 'active' : ''}`}
            >
              <div className="card">
                <div className="card-title">
                  <span>
                    Delivery Fleet GPS Radar (5s Live Sync), Ratings &amp; Rider
                    Control{' '}
                    <small style={{ color: 'var(--text-muted)' }}>
                      ({filteredRiders.length})
                    </small>
                  </span>
                  <input
                    type="text"
                    className="form-input"
                    style={{ maxWidth: '240px', padding: '0.45rem 0.85rem' }}
                    placeholder="Search rider name/phone..."
                    value={riderSearch}
                    onChange={(e) => setRiderSearch(e.target.value)}
                  />
                </div>
                <div className="filters-bar" style={{ marginBottom: '0.85rem' }}>
                  {(
                    [
                      ['ALL', 'All Riders'],
                      ['ONLINE', '🟢 Online'],
                      ['RESTRICTED', '🚫 COD Restricted'],
                      ['FLAGGED', '🚩 COD Review'],
                      ['PENDING', '⏳ Pending Approval'],
                      ['SUSPENDED', '⛔ Suspended'],
                    ] as const
                  ).map(([key, label]) => (
                    <div
                      key={key}
                      className={`filter-chip ${riderFilter === key ? 'active' : ''}`}
                      onClick={() => setRiderFilter(key)}
                    >
                      {label}
                    </div>
                  ))}
                </div>
                <div className="table-responsive">
                    <table>
                    <thead>
                      <tr>
                        <th>Rider Name &amp; Rating</th>
                        <th>Contact &amp; UPI</th>
                        <th>Vehicle</th>
                        <th>Duty</th>
                        <th>Unsettled COD</th>
                        <th>Trips / Passed</th>
                        <th>Live 5s Radar &amp; Trail</th>
                        <th>Full Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRiders.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            style={{
                              textAlign: 'center',
                              padding: '1.5rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No riders found.
                          </td>
                        </tr>
                      ) : (
                        filteredRiders.map(([uid, d]) => {
                          const metrics = getRiderCashMetrics(uid);
                          const maxLimit = Number(
                            state.settings?.maxRiderCashLimit || 3000
                          );
                          let passedCount = 0;
                          let deliveredCount = 0;
                          Object.values(state.orders).forEach((o) => {
                            if (o.rejectedByRiders && o.rejectedByRiders[uid]) {
                              passedCount++;
                            }
                            if (
                              o.deliveryUid === uid &&
                              o.status === 'DELIVERED'
                            ) {
                              deliveredCount++;
                            }
                          });

                          const pts = Array.isArray(d.recentRoute)
                            ? d.recentRoute
                            : [];
                          let routeUrl = '';
                          if (pts.length >= 2) {
                            const origin = `${pts[0].lat},${pts[0].lng}`;
                            const dest = `${pts[pts.length - 1].lat},${pts[pts.length - 1].lng}`;
                            const mid = pts
                              .slice(1, -1)
                              .slice(-8)
                              .map((p) => `${p.lat},${p.lng}`)
                              .join('|');
                            routeUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}${mid ? `&waypoints=${encodeURIComponent(mid)}` : ''}`;
                          }

                          const riderLatNum = Number(d.lat);
                          const riderLngNum = Number(d.lng);
                          const hasValidGps =
                            Number.isFinite(riderLatNum) &&
                            Number.isFinite(riderLngNum) &&
                            riderLatNum !== 0 &&
                            riderLngNum !== 0;

                          // Resolve target store relative to this rider:
                          // 1) Store of the rider's most recent active order
                          // 2) Nearest approved store with coordinates (or central Gossaigaon hub)
                          let refStoreName = 'Gossaigaon Hub';
                          let refStoreLat = 26.4524;
                          let refStoreLng = 89.9723;
                          let isActiveOrderStore = false;

                          const activeRiderOrders = Object.values(state.orders)
                            .filter(
                              (o) =>
                                o.deliveryUid === uid &&
                                o.status !== 'DELIVERED' &&
                                o.status !== 'CANCELLED'
                            )
                            .sort(
                              (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
                            );

                          for (const ao of activeRiderOrders) {
                            const s = state.restaurants[ao.restaurantId || ''];
                            const sLat = Number(s?.lat);
                            const sLng = Number(s?.lng);
                            if (
                              s &&
                              Number.isFinite(sLat) &&
                              Number.isFinite(sLng) &&
                              sLat !== 0 &&
                              sLng !== 0
                            ) {
                              refStoreName = s.name || 'Order Store';
                              refStoreLat = sLat;
                              refStoreLng = sLng;
                              isActiveOrderStore = true;
                              break;
                            }
                          }

                          if (!isActiveOrderStore) {
                            const storeCandidates = Object.values(
                              state.restaurants
                            ).filter((s) => {
                              const sLat = Number(s.lat);
                              const sLng = Number(s.lng);
                              return (
                                Number.isFinite(sLat) &&
                                Number.isFinite(sLng) &&
                                sLat !== 0 &&
                                sLng !== 0
                              );
                            });
                            if (storeCandidates.length > 0 && hasValidGps) {
                              let bestDist = Infinity;
                              storeCandidates.forEach((s) => {
                                const sLat = Number(s.lat);
                                const sLng = Number(s.lng);
                                const dist = calculateDistanceKm(
                                  riderLatNum,
                                  riderLngNum,
                                  sLat,
                                  sLng
                                );
                                if (dist < bestDist) {
                                  bestDist = dist;
                                  refStoreName = s.name || 'Store';
                                  refStoreLat = sLat;
                                  refStoreLng = sLng;
                                }
                              });
                            } else if (storeCandidates.length > 0) {
                              const firstStore = storeCandidates[0];
                              refStoreName = firstStore.name || 'Store';
                              refStoreLat = Number(firstStore.lat);
                              refStoreLng = Number(firstStore.lng);
                            }
                          }

                          const riderStoreDistanceKm = hasValidGps
                            ? calculateDistanceKm(
                                riderLatNum,
                                riderLngNum,
                                refStoreLat,
                                refStoreLng
                              )
                            : Infinity;

                          return (
                            <tr key={uid}>
                              <td>
                                <strong>{d.name || 'Rider'}</strong>
                                {d.ratingCount ? (
                                  <div
                                    style={{
                                      color: '#b45309',
                                      fontSize: '0.78rem',
                                      fontWeight: 800,
                                    }}
                                  >
                                    ⭐ {Number(d.ratingAvg || 5).toFixed(1)} (
                                    {d.ratingCount})
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      color: 'var(--text-muted)',
                                      fontSize: '0.72rem',
                                    }}
                                  >
                                    No ratings
                                  </div>
                                )}
                                {d.suspended && (
                                  <div>
                                    <span className="badge badge-danger">
                                      Suspended
                                    </span>
                                  </div>
                                )}
                                {d.codAssignmentRestricted ? (
                                  <div style={{ marginTop: '3px' }}>
                                    <span className="badge badge-danger">
                                      🚫 COD Restricted
                                    </span>
                                  </div>
                                ) : d.codReviewFlagged ? (
                                  <div style={{ marginTop: '3px' }}>
                                    <span className="badge badge-warning">
                                      🚩 COD Review
                                    </span>
                                  </div>
                                ) : null}
                              </td>
                              <td>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '7px',
                                  }}
                                >
                                  <span>{d.phone || 'N/A'}</span>
                                  {(() => {
                                    const waUrl = buildWhatsAppUrl(
                                      d.phone,
                                      `Hello ${d.name || 'Rider'}, this is Gossaigaon Bazar Admin.`
                                    );
                                    if (!waUrl) return null;
                                    return (
                                      <a
                                        href={waUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="whatsapp-icon-link"
                                        title={`Message ${d.name || 'Rider'} on WhatsApp (${d.phone})`}
                                        aria-label={`Message ${d.name || 'Rider'} on WhatsApp`}
                                      >
                                        <i className="fa-brands fa-whatsapp"></i>
                                      </a>
                                    );
                                  })()}
                                </div>
                                <div
                                  style={{ fontSize: '0.75rem', color: '#0284c7' }}
                                >
                                  UPI: {d.upiId || 'Not Set'}
                                </div>
                              </td>
                              <td>{d.vehicle || 'Bike'}</td>
                              <td>
                                {d.online ? (
                                  <span className="badge badge-success">
                                    Online
                                  </span>
                                ) : (
                                  <span className="badge badge-danger">
                                    Offline
                                  </span>
                                )}
                              </td>
                              <td>
                                <strong
                                  style={{
                                    color:
                                      metrics.netCashInHand >= maxLimit
                                        ? 'var(--danger)'
                                        : 'var(--warning)',
                                  }}
                                >
                                  ₹{metrics.netCashInHand.toFixed(0)}
                                </strong>
                              </td>
                              <td>
                                <strong>
                                  {deliveredCount} Done / {passedCount} Passed
                                </strong>
                              </td>
                              <td>
                                {d.online && hasValidGps ? (
                                  <>
                                    {activePanel === 'delivery' && (
                                      <RiderMiniMap
                                        riderUid={uid}
                                        riderName={d.name || 'Rider'}
                                        riderLat={riderLatNum}
                                        riderLng={riderLngNum}
                                        storeName={refStoreName}
                                        storeLat={refStoreLat}
                                        storeLng={refStoreLng}
                                        distanceKm={riderStoreDistanceKm}
                                        isActiveOrderStore={isActiveOrderStore}
                                        lastUpdated={
                                          d.lastLocationUpdate || d.lastSeen
                                        }
                                        onManualRefresh={() =>
                                          refreshRiderLocation(uid)
                                        }
                                      />
                                    )}
                                    <a
                                      href={`https://www.google.com/maps?q=${d.lat},${d.lng}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        color: '#0284c7',
                                        textDecoration: 'none',
                                        fontWeight: 800,
                                        fontSize: '0.76rem',
                                      }}
                                    >
                                      <i className="fa-solid fa-satellite"></i>{' '}
                                      Open Live Map
                                    </a>
                                    {(d.lastLocationUpdate || d.lastSeen) && (
                                      <div
                                        style={{
                                          fontSize: '0.68rem',
                                          color: '#059669',
                                          marginTop: '2px',
                                        }}
                                      >
                                        🔄{' '}
                                        {new Date(
                                          (d.lastLocationUpdate || d.lastSeen)!
                                        ).toLocaleTimeString()}
                                      </div>
                                    )}
                                    {routeUrl && (
                                      <div>
                                        <a
                                          href={routeUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          style={{
                                            color: '#d97706',
                                            fontSize: '0.72rem',
                                            fontWeight: 800,
                                            textDecoration: 'none',
                                          }}
                                        >
                                          <i className="fa-solid fa-route"></i>{' '}
                                          Route ({pts.length} pts)
                                        </a>
                                      </div>
                                    )}
                                  </>
                                ) : d.online ? (
                                  <span className="badge badge-warning">
                                    Online • Awaiting GPS
                                  </span>
                                ) : hasValidGps ? (
                                  <>
                                    <span className="badge badge-muted">
                                      Offline
                                    </span>
                                    <div style={{ marginTop: '4px' }}>
                                      <a
                                        href={`https://www.google.com/maps?q=${d.lat},${d.lng}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                          color: 'var(--text-muted)',
                                          textDecoration: 'none',
                                          fontWeight: 700,
                                          fontSize: '0.72rem',
                                        }}
                                      >
                                        <i className="fa-solid fa-location-dot"></i>{' '}
                                        Last Known GPS
                                      </a>
                                    </div>
                                  </>
                                ) : (
                                  <span className="badge badge-muted">
                                    Offline
                                  </span>
                                )}
                              </td>
                              <td>
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="btn btn-info btn-sm"
                                    onClick={() => {
                                      setManageRiderUid(uid);
                                      window.history.pushState(
                                        { modal: 'riderManage' },
                                        ''
                                      );
                                    }}
                                  >
                                    <i className="fa-solid fa-sliders"></i> Manage
                                  </button>
                                  <button
                                    type="button"
                                    className={`btn btn-sm ${d.approved ? 'btn-danger' : 'btn-success'}`}
                                    onClick={() =>
                                      db
                                        .ref(`deliveryPartners/${uid}`)
                                        .update({ approved: !d.approved })
                                    }
                                  >
                                    {d.approved ? 'Revoke' : 'Approve'}
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
            </section>

            {/* SECTION 10: CUSTOMERS DIRECTORY, WALLETS & SPAM */}
            <section
              id="panel-customers"
              className={`panel-section ${activePanel === 'customers' ? 'active' : ''}`}
            >
              <div className="card">
                <div className="card-title">
                  <span>
                    Registered Customers, Wallets, Referrals &amp; Spam Guard{' '}
                    <small style={{ color: 'var(--text-muted)' }}>
                      ({filteredCustomers.length})
                    </small>
                  </span>
                  <input
                    type="text"
                    className="form-input"
                    style={{ maxWidth: '240px', padding: '0.45rem 0.85rem' }}
                    placeholder="Search name / phone / email..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                </div>
                <div className="filters-bar" style={{ marginBottom: '0.85rem' }}>
                  {(
                    [
                      ['ALL', 'All Customers'],
                      ['ACTIVE', '✅ Active'],
                      ['BANNED', '🚫 Banned'],
                      ['WALLET', '💰 Wallet > ₹0'],
                      ['SPAM', '🚨 Spam Suspects'],
                    ] as const
                  ).map(([key, label]) => (
                    <div
                      key={key}
                      className={`filter-chip ${customerFilter === key ? 'active' : ''}`}
                      onClick={() => setCustomerFilter(key)}
                    >
                      {label}
                    </div>
                  ))}
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Name &amp; Referral</th>
                        <th>Phone &amp; Email</th>
                        <th>Wallet</th>
                        <th>Orders / Cancels / Spam</th>
                        <th>GPS</th>
                        <th>Status</th>
                        <th>Full Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              textAlign: 'center',
                              padding: '1.5rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No customers found.
                          </td>
                        </tr>
                      ) : (
                        filteredCustomers.map(([uid, c]) => {
                          const isBanned = c.blocked === true;
                          let totalOrders = 0;
                          let totalSpent = 0;
                          let cancels = 0;
                          let spamFlags = 0;
                          Object.values(state.orders).forEach((o) => {
                            if (o.customerUid === uid) {
                              totalOrders++;
                              if (o.status === 'DELIVERED') {
                                totalSpent += Number(o.totalAmount || 0);
                              }
                              if (o.status === 'CANCELLED') cancels++;
                              if (o.isSpamSuspect) spamFlags++;
                            }
                          });

                          const profile = smartInsights.customerProfiles[uid];
                          return (
                            <tr key={uid}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <strong>{c.name || 'Customer'}</strong>
                                  {profile?.isVip && (
                                    <span className="badge badge-success" style={{ fontSize: '0.6rem' }}>
                                      ⭐ VIP
                                    </span>
                                  )}
                                  {profile?.isHighCancelRisk && (
                                    <span className="badge badge-warning" style={{ fontSize: '0.6rem' }}>
                                      ⚠️ Cancel Risk
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{ fontSize: '0.72rem', color: '#0284c7' }}
                                >
                                  Ref:{' '}
                                  {c.referralCode ||
                                    `GB${uid.slice(0, 6).toUpperCase()}`}
                                </div>
                              </td>
                              <td>
                                {c.phone || 'N/A'}
                                <div
                                  style={{
                                    fontSize: '0.72rem',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  {c.email || ''}
                                </div>
                              </td>
                              <td>
                                <strong style={{ color: '#b45309' }}>
                                  ₹{Number(c.walletBalance || 0).toFixed(0)}
                                </strong>
                              </td>
                              <td>
                                <strong>{totalOrders} Orders</strong> (₹
                                {totalSpent.toFixed(0)})
                                <div
                                  style={{
                                    fontSize: '0.72rem',
                                    color:
                                      spamFlags > 0
                                        ? 'var(--danger)'
                                        : 'var(--text-muted)',
                                  }}
                                >
                                  {cancels} Cancel • {spamFlags} Spam Flag
                                </div>
                              </td>
                              <td>
                                {c.lat && c.lng ? (
                                  <a
                                    href={`https://www.google.com/maps?q=${c.lat},${c.lng}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      color: '#0284c7',
                                      textDecoration: 'none',
                                    }}
                                  >
                                    <i className="fa-solid fa-location-dot"></i>{' '}
                                    Map
                                  </a>
                                ) : (
                                  <small style={{ color: 'var(--text-muted)' }}>
                                    No GPS
                                  </small>
                                )}
                              </td>
                              <td>
                                {isBanned ? (
                                  <span className="badge badge-danger">
                                    Banned
                                  </span>
                                ) : (
                                  <span className="badge badge-success">
                                    Active
                                  </span>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    type="button"
                                    className="btn btn-info btn-sm"
                                    onClick={() => {
                                      setManageCustomerUid(uid);
                                      window.history.pushState(
                                        { modal: 'custManage' },
                                        ''
                                      );
                                    }}
                                  >
                                    <i className="fa-solid fa-user-pen"></i>{' '}
                                    Details
                                  </button>
                                  <button
                                    type="button"
                                    className={`btn btn-sm ${isBanned ? 'btn-success' : 'btn-danger'}`}
                                    onClick={() =>
                                      db
                                        .ref(`customers/${uid}`)
                                        .update({ blocked: !isBanned })
                                    }
                                  >
                                    {isBanned ? 'Unban' : 'Ban'}
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
            </section>

            {/* SECTION 10B: HELPLINE & FEEDBACKS */}
            <section
              id="panel-feedbacks"
              className={`panel-section ${activePanel === 'feedbacks' ? 'active' : ''}`}
            >
              <div className="card" style={{ border: '1.5px solid #10b981' }}>
                <div className="card-title">
                  <span style={{ color: '#059669' }}>
                    <i className="fa-solid fa-comments"></i> All-Panel Helpline
                    Tickets &amp; Feedbacks
                  </span>
                </div>
                <div className="filters-bar">
                  {(
                    [
                      ['ALL', 'All'],
                      ['OPEN', '⏳ Open'],
                      ['CUSTOMER', '🛒 Customers'],
                      ['RIDER', '🛵 Riders'],
                      ['STORE', '🏪 Stores'],
                    ] as const
                  ).map(([key, label]) => (
                    <div
                      key={key}
                      className={`filter-chip ${feedbackFilter === key ? 'active' : ''}`}
                      onClick={() => setFeedbackFilter(key)}
                    >
                      {label}
                    </div>
                  ))}
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Role &amp; Sender</th>
                        <th>Subject &amp; Rating</th>
                        <th>Message</th>
                        <th>Admin Reply</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFeedbacks.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            style={{
                              textAlign: 'center',
                              padding: '1.5rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No feedback tickets found.
                          </td>
                        </tr>
                      ) : (
                        filteredFeedbacks.map(([id, f]) => {
                          const isResolved = f.status === 'RESOLVED';
                          const roleBadge =
                            f.role === 'RIDER'
                              ? 'badge-info'
                              : f.role === 'STORE'
                                ? 'badge-warning'
                                : 'badge-success';
                          return (
                            <tr key={id}>
                              <td>
                                <span className={`badge ${roleBadge}`}>
                                  {f.role || 'USER'}
                                </span>
                                <div style={{ marginTop: '3px' }}>
                                  <strong>{f.name || 'User'}</strong>
                                </div>
                                <small style={{ color: 'var(--text-muted)' }}>
                                  {f.phone || ''}
                                </small>
                              </td>
                              <td>
                                <strong>{f.subject || 'General'}</strong>
                                {f.rating ? (
                                  <div
                                    style={{
                                      color: '#d97706',
                                      fontSize: '0.78rem',
                                    }}
                                  >
                                    {'★'.repeat(Number(f.rating))}
                                  </div>
                                ) : null}
                              </td>
                              <td>
                                <div
                                  style={{
                                    maxWidth: '250px',
                                    fontSize: '0.8rem',
                                    color: '#334155',
                                  }}
                                >
                                  {f.message || ''}
                                </div>
                              </td>
                              <td>
                                <small style={{ color: '#0284c7' }}>
                                  {f.adminReply || '-'}
                                </small>
                              </td>
                              <td>
                                {isResolved ? (
                                  <span className="badge badge-success">
                                    Resolved
                                  </span>
                                ) : (
                                  <span className="badge badge-warning">
                                    Open
                                  </span>
                                )}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => replyAndResolveFeedback(id)}
                                >
                                  {isResolved
                                    ? 'Update Reply'
                                    : 'Reply & Resolve'}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* SECTION 11: FINANCIALS & COMMISSION PROFIT */}
            <section
              id="panel-reports"
              className={`panel-section ${activePanel === 'reports' ? 'active' : ''}`}
            >
              <div className="card">
                <div className="card-title">
                  <span>Complete Financial Ledger &amp; Profit Breakdown</span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={exportOrdersCSV}
                  >
                    <i className="fa-solid fa-download"></i> Download CSV Ledger
                  </button>
                </div>
                <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                  <div className="stat-card">
                    <div className="stat-info">
                      <h4>Verified UPI Received</h4>
                      <div className="stat-value" style={{ color: '#0284c7' }}>
                        ₹{reportMetrics.verifiedUPI.toFixed(0)}
                      </div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-info">
                      <h4>Settled COD Cash</h4>
                      <div
                        className="stat-value"
                        style={{ color: 'var(--primary)' }}
                      >
                        ₹{reportMetrics.totalSettledCash.toFixed(0)}
                      </div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-info">
                      <h4>Paid to Stores</h4>
                      <div className="stat-value" style={{ color: '#7e22ce' }}>
                        ₹{reportMetrics.totalPaidStores.toFixed(0)}
                      </div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-info">
                      <h4>Paid to Riders</h4>
                      <div className="stat-value" style={{ color: '#0284c7' }}>
                        ₹{reportMetrics.totalPaidRiders.toFixed(0)}
                      </div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-info">
                      <h4>Month-over-Month Revenue Growth</h4>
                      <div
                        className="stat-value"
                        style={{
                          color:
                            reportMetrics.momTrend === 'up'
                              ? '#059669'
                              : reportMetrics.momTrend === 'down'
                                ? '#dc2626'
                                : 'var(--text-muted)',
                        }}
                      >
                        {reportMetrics.momGrowthLabel}
                      </div>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                          fontWeight: 700,
                          marginTop: '4px',
                        }}
                      >
                        ₹{reportMetrics.current30DayRevenue.toFixed(0)} vs ₹
                        {reportMetrics.prev30DayRevenue.toFixed(0)} prev 30d
                      </div>
                    </div>
                    <div
                      className="stat-icon"
                      style={{
                        color:
                          reportMetrics.momTrend === 'up'
                            ? '#059669'
                            : reportMetrics.momTrend === 'down'
                              ? '#dc2626'
                              : '#64748b',
                        background:
                          reportMetrics.momTrend === 'up'
                            ? 'rgba(16, 185, 129, 0.14)'
                            : reportMetrics.momTrend === 'down'
                              ? 'rgba(239, 68, 68, 0.14)'
                              : 'rgba(148, 163, 184, 0.12)',
                      }}
                    >
                      <i
                        className={`fa-solid ${
                          reportMetrics.momTrend === 'up'
                            ? 'fa-arrow-trend-up'
                            : reportMetrics.momTrend === 'down'
                              ? 'fa-arrow-trend-down'
                              : 'fa-minus'
                        }`}
                      ></i>
                    </div>
                  </div>
                </div>
              </div>

              {activePanel === 'reports' && (
                <RevenueTrendChart
                  orders={state.orders}
                  commissionPercent={commissionPercent}
                />
              )}

              <ScheduledReportsCard
                state={state}
                adminEmail={authUser.email}
                latestGeneratedReport={latestGeneratedReport}
                onTriggerReportDispatch={triggerReportDispatch}
                onToast={showToast}
              />

              <div className="card">
                <div className="card-title">
                  Top Performing Stores by Sales Volume
                </div>
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Store Name</th>
                        <th>Total Orders</th>
                        <th>Items Sales</th>
                        <th>Admin Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportMetrics.topStores.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            style={{
                              textAlign: 'center',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No store sales data yet.
                          </td>
                        </tr>
                      ) : (
                        reportMetrics.topStores.map((r) => (
                          <tr key={r.uid}>
                            <td>
                              <strong>{r.name}</strong>
                            </td>
                            <td>{r.orders}</td>
                            <td>₹{r.sales.toFixed(2)}</td>
                            <td style={{ color: '#0284c7', fontWeight: 800 }}>
                              ₹{r.comm.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* SECTION 12: HACKER, SCAM & SECURITY PROTECTION CENTER */}
            <SecurityCenterPanel
              activePanel={activePanel}
              state={state}
              scamScan={scamScan}
              adminEmail={authUser.email}
              onLockNow={() => lockTerminalNow('manual')}
              onOpenScreenshot={(src, title) =>
                setScreenshotModal({ src, title })
              }
              onToast={showToast}
              onConfirmDialog={setDialogConfig}
            />

            {/* SECTION 13: SELECTED AREA SERVICE CONTROLLER */}
            <ServiceAreasPanel
              activePanel={activePanel}
              state={state}
              adminEmail={authUser.email}
              onToast={showToast}
              onConfirmDialog={setDialogConfig}
            />
          </main>
          </DeliveryFleetMapsProvider>
        </div>
      )}

      {/* FLOATING BULK ACTION TOOLBAR FOR ALL ORDERS */}
      {authUser &&
        activePanel === 'orders' &&
        validSelectedOrderIds.length > 0 && (
          <div className="bulk-floating-toolbar" role="region" aria-label="Bulk order actions">
            <span className="bulk-count-pill">
              <i className="fa-solid fa-check-double"></i>{' '}
              {validSelectedOrderIds.length} Selected
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setBulkAssignOrderIds(validSelectedOrderIds);
                window.history.pushState({ modal: 'bulkAssign' }, '');
              }}
            >
              <i className="fa-solid fa-motorcycle"></i> Assign to Rider
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleBulkCancelOrders}
            >
              <i className="fa-solid fa-ban"></i> Cancel
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setSelectedOrderIds([])}
            >
              <i className="fa-solid fa-xmark"></i> Clear
            </button>
          </div>
        )}

      {/* ALL MODALS */}
      <AdminModals
        state={state}
        screenshotModal={screenshotModal}
        onCloseScreenshot={() => setScreenshotModal(null)}
        disbursalTarget={disbursalTarget}
        onCloseDisbursal={() => setDisbursalTarget(null)}
        assignOrderId={assignOrderId}
        onCloseAssign={() => setAssignOrderId(null)}
        bulkAssignOrderIds={bulkAssignOrderIds}
        onCloseBulkAssign={() => setBulkAssignOrderIds(null)}
        onBulkAssigned={() => setSelectedOrderIds([])}
        detailOrderId={detailOrderId}
        onCloseDetailOrder={() => setDetailOrderId(null)}
        onOpenScreenshot={(src, title) => setScreenshotModal({ src, title })}
        onCancelOrder={adminCancelOrder}
        manageCustomerUid={manageCustomerUid}
        onCloseManageCustomer={() => setManageCustomerUid(null)}
        manageRiderUid={manageRiderUid}
        onCloseManageRider={() => setManageRiderUid(null)}
        manageStoreUid={manageStoreUid}
        onCloseManageStore={() => setManageStoreUid(null)}
        onVerifyProduct={verifyStoreProduct}
        getRiderCashMetrics={getRiderCashMetrics}
        getStorePayoutMetrics={getStorePayoutMetrics}
        onToast={showToast}
        onConfirmDialog={setDialogConfig}
        adminEmail={authUser?.email}
        isPayoutWithdrawalFrozen={smartSettleReport.isPayoutWithdrawalFrozen}
      />

      <PushNotificationModal
        open={pushModalOpen}
        permission={pushPermission}
        prefs={pushPrefs}
        onClose={() => setPushModalOpen(false)}
        onRequestPermission={async () => {
          const res = await requestPushPermission();
          setPushPermission(res);
          if (res === 'granted') {
            const next = { ...pushPrefs, enabled: true };
            setPushPrefs(next);
            savePushPrefs(next);
            showToast('🔔 Push Notifications Enabled!', 'success');
          } else if (res === 'denied') {
            showToast('Notifications blocked in browser settings.', 'warning');
          }
        }}
        onUpdatePrefs={(next) => {
          setPushPrefs(next);
          savePushPrefs(next);
        }}
        onToast={showToast}
      />

      <ActionDialogModal
        dialog={dialogConfig}
        onClose={() => setDialogConfig(null)}
      />

      {authUser && (
        <GlobalCommandSearch
          open={commandSearchOpen}
          state={state}
          onClose={() => setCommandSearchOpen(false)}
          onNavigatePanel={(panel) => switchPanel(panel)}
          onOpenOrderDetail={(orderId) => {
            setDetailOrderId(orderId);
            window.history.pushState({ modal: 'orderDetail' }, '');
          }}
          onOpenManageStore={(uid) => {
            setManageStoreUid(uid);
            window.history.pushState({ modal: 'storeManage' }, '');
          }}
          onOpenManageRider={(uid) => {
            setManageRiderUid(uid);
            window.history.pushState({ modal: 'riderManage' }, '');
          }}
          onOpenManageCustomer={(uid) => {
            setManageCustomerUid(uid);
            window.history.pushState({ modal: 'custManage' }, '');
          }}
        />
      )}

      {authUser && (
        <SessionLockModal
          open={isTerminalLocked}
          adminEmail={authUser.email}
          lockReason={lockReason}
          pinHash={state.securityConfig?.pinHash}
          pinSalt={state.securityConfig?.pinSalt}
          onUnlockSuccess={() => {
            lastActivityRef.current = Date.now();
            setIsTerminalLocked(false);
            showToast('🔓 Terminal unlocked.', 'success');
            void logSecurityEvent({
              eventType: 'SESSION_UNLOCKED',
              actorEmail: authUser.email,
              details: 'Admin terminal unlocked after PIN verification.',
              severity: 'INFO',
            });
          }}
          onFailedAttempt={(attempts) => {
            void logSecurityEvent({
              eventType: 'PIN_FAILED',
              actorEmail: authUser.email,
              details: `Failed Security PIN unlock attempt #${attempts}.`,
              severity: attempts >= 5 ? 'CRITICAL' : 'WARNING',
            });
          }}
          onEmergencySignOut={() => {
            setIsTerminalLocked(false);
            void auth.signOut();
          }}
        />
      )}

      {/* PRINTABLE RECEIPT */}
      {printOrder && (
        <div id="printable-receipt">
          <div
            style={{
              maxWidth: '280px',
              margin: '0 auto',
              fontFamily: 'monospace',
              fontSize: '12px',
            }}
          >
            <h2 style={{ textAlign: 'center' }}>GOSSAIGAON BAZAR</h2>
            <hr />
            <p>Order: #{printOrder.id.slice(-6)}</p>
            <p>PIN: {printOrder.order.deliveryOtp || 'N/A'}</p>
            <p>Phone: {printOrder.order.phone || 'N/A'}</p>
            <p>Address: {printOrder.order.address || 'Gossaigaon'}</p>
            <p>Payment: {printOrder.order.paymentMode || 'COD'}</p>
            <hr />
            <h3>
              TOTAL: ₹{Number(printOrder.order.totalAmount || 0).toFixed(0)}
            </h3>
          </div>
        </div>
      )}
    </>
  );
}
