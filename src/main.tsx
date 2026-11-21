import '@fortawesome/fontawesome-free/css/all.min.css';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import {
  initNativeNotifications,
  refreshNotificationPermissionState,
} from './utils/pushNotifications';

(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  origConsoleError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

void initNativeNotifications().then(() => refreshNotificationPermissionState());

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onOfflineReady() {
    // App shell precached for instant offline startup
  },
});

createRoot(document.getElementById('root')!).render(<App />);
