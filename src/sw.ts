/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

interface PushPayload {
  title?: string;
  body?: string;
  panel?: string;
  orderId?: string;
  tag?: string;
  requireInteraction?: boolean;
  notification?: {
    title?: string;
    body?: string;
  };
  data?: {
    panel?: string;
    orderId?: string;
    url?: string;
  };
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {};
  if (event.data) {
    try {
      payload = event.data.json() as PushPayload;
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.notification?.title || payload.title || 'Gossaigaon Bazar Admin';
  const body = payload.notification?.body || payload.body || 'New admin alert received.';
  const panel = payload.data?.panel || payload.panel || 'dashboard';
  const orderId = payload.data?.orderId || payload.orderId || '';

  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag || `gb-admin-${panel}-${orderId || Date.now()}`,
    renotify: true,
    requireInteraction: payload.requireInteraction === true,
    vibrate: [200, 100, 200],
    data: {
      url: payload.data?.url || '/',
      panel,
      orderId,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const data = (event.notification.data || {}) as { url?: string; panel?: string; orderId?: string };
  const targetPanel = data.panel || 'dashboard';
  const targetOrderId = data.orderId || '';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NAVIGATE_PANEL',
            panel: targetPanel,
            orderId: targetOrderId,
          });
          return;
        }
      }
      if (self.clients.openWindow) {
        const targetUrl = `/?panel=${encodeURIComponent(targetPanel)}${targetOrderId ? `&orderId=${encodeURIComponent(targetOrderId)}` : ''}`;
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
