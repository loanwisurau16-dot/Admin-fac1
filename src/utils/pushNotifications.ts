import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AdminPanelId } from '../types';

export interface PushPrefs {
  enabled: boolean;
  orders: boolean;
  upi: boolean;
  products: boolean;
  payoutsAndWallets: boolean;
  helplineAndSos: boolean;
}

const PREFS_KEY = 'gb_admin_push_prefs_v1';
const NATIVE_PERM_CACHE_KEY = 'gb_admin_native_perm_v1';
const ANDROID_CHANNEL_ID = 'gb-admin-alerts';
let nativeInitialized = false;

export const DEFAULT_PUSH_PREFS: PushPrefs = {
  enabled: true,
  orders: true,
  upi: true,
  products: true,
  payoutsAndWallets: true,
  helplineAndSos: true,
};

export function loadPushPrefs(): PushPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PUSH_PREFS;
    return { ...DEFAULT_PUSH_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PUSH_PREFS;
  }
}

export function savePushPrefs(prefs: PushPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage quota errors
  }
}

function mapCapacitorPermission(display: string): NotificationPermission {
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  return 'default';
}

function setCachedNativePermission(perm: NotificationPermission): void {
  try {
    localStorage.setItem(NATIVE_PERM_CACHE_KEY, perm);
  } catch {
    // ignore storage errors
  }
}

function getCachedNativePermission(): NotificationPermission {
  try {
    const v = localStorage.getItem(NATIVE_PERM_CACHE_KEY);
    if (v === 'granted' || v === 'denied' || v === 'default') return v;
  } catch {
    // ignore
  }
  return 'default';
}

export function getNotificationPermissionState():
  | NotificationPermission
  | 'unsupported' {
  if (typeof window === 'undefined') return 'unsupported';
  if (Capacitor.isNativePlatform()) {
    return getCachedNativePermission();
  }
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function refreshNotificationPermissionState(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined') return 'unsupported';
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      const mapped = mapCapacitorPermission(status.display);
      setCachedNativePermission(mapped);
      return mapped;
    } catch {
      return getCachedNativePermission();
    }
  }
  return getNotificationPermissionState();
}

export async function initNativeNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform() || nativeInitialized) return;
  nativeInitialized = true;

  try {
    await LocalNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'GB Admin Alerts',
      description: 'Live alerts for new orders, UPI proofs, payouts & SOS',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#16a34a',
    });
  } catch {
    // channel may already exist or unsupported on older Android
  }

  try {
    await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action) => {
        const extra = (action.notification.extra || {}) as {
          panel?: AdminPanelId;
          orderId?: string;
        };
        window.dispatchEvent(
          new CustomEvent('gb-push-navigate', {
            detail: {
              panel: extra.panel || 'dashboard',
              orderId: extra.orderId || '',
            },
          })
        );
      }
    );
  } catch {
    // ignore listener error
  }
}

export async function requestPushPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined') return 'unsupported';

  if (Capacitor.isNativePlatform()) {
    try {
      await initNativeNotifications();
      const status = await LocalNotifications.requestPermissions();
      const mapped = mapCapacitorPermission(status.display);
      setCachedNativePermission(mapped);
      return mapped;
    } catch {
      setCachedNativePermission('denied');
      return 'denied';
    }
  }

  if (!('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export interface SendPushOptions {
  title: string;
  body: string;
  panel: AdminPanelId;
  orderId?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export async function dispatchAdminPushNotification(
  opts: SendPushOptions
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (Capacitor.isNativePlatform()) {
    try {
      await initNativeNotifications();
      const perm = await LocalNotifications.checkPermissions();
      const mapped = mapCapacitorPermission(perm.display);
      setCachedNativePermission(mapped);
      if (mapped !== 'granted') return false;

      const safeIntId = Math.floor(Math.random() * 2_000_000_000) + 1;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: safeIntId,
            title: opts.title,
            body: opts.body,
            channelId: ANDROID_CHANNEL_ID,
            smallIcon: 'ic_stat_gb_admin',
            largeIcon: 'ic_notif_large',
            iconColor: '#16a34a',
            extra: {
              panel: opts.panel,
              orderId: opts.orderId || '',
            },
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }

  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const notifOptions: NotificationOptions & {
    vibrate?: number[];
    renotify?: boolean;
  } = {
    body: opts.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: opts.tag || `gb-${opts.panel}-${opts.orderId || Date.now()}`,
    renotify: true,
    requireInteraction: Boolean(opts.requireInteraction),
    vibrate: [200, 100, 200],
    data: {
      url: '/',
      panel: opts.panel,
      orderId: opts.orderId || '',
    },
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(opts.title, notifOptions);
        return true;
      }
    }
    const n = new Notification(opts.title, notifOptions);
    n.onclick = () => {
      window.focus();
      window.dispatchEvent(
        new CustomEvent('gb-push-navigate', {
          detail: { panel: opts.panel, orderId: opts.orderId || '' },
        })
      );
      n.close();
    };
    return true;
  } catch {
    try {
      const n = new Notification(opts.title, notifOptions);
      n.onclick = () => {
        window.focus();
        n.close();
      };
      return true;
    } catch {
      return false;
    }
  }
}
