import React from 'react';
import {
  PushPrefs,
  dispatchAdminPushNotification,
} from '../utils/pushNotifications';

interface PushNotificationModalProps {
  open: boolean;
  permission: NotificationPermission | 'unsupported';
  prefs: PushPrefs;
  onClose: () => void;
  onRequestPermission: () => Promise<void>;
  onUpdatePrefs: (next: PushPrefs) => void;
  onToast: (msg: string, type?: 'success' | 'danger' | 'info' | 'warning') => void;
}

export const PushNotificationModal: React.FC<PushNotificationModalProps> = ({
  open,
  permission,
  prefs,
  onClose,
  onRequestPermission,
  onUpdatePrefs,
  onToast,
}) => {
  if (!open) return null;

  const handleToggleKey = (key: keyof PushPrefs) => {
    onUpdatePrefs({ ...prefs, [key]: !prefs[key] });
  };

  const handleTestPush = async () => {
    if (permission !== 'granted') {
      await onRequestPermission();
      return;
    }
    const ok = await dispatchAdminPushNotification({
      title: '🔔 Gossaigaon Bazar Admin Test',
      body: 'Push notifications are active! Tap to open Live Orders Radar.',
      panel: 'orders',
      tag: 'gb-admin-test',
    });
    if (ok) {
      onToast('Test push notification sent to your device!', 'success');
    } else {
      onToast('Could not show notification. Check browser site permissions.', 'warning');
    }
  };

  return (
    <div className="modal-backdrop open" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ fontWeight: 900, color: '#0284c7' }}>
            <i className="fa-solid fa-bell"></i> Push Notifications Center
          </h3>
          <i
            className="fa-solid fa-xmark"
            onClick={onClose}
            style={{ fontSize: '1.25rem', cursor: 'pointer' }}
          ></i>
        </div>

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid var(--border)',
            borderRadius: '14px',
            padding: '0.9rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <small
              style={{
                display: 'block',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                fontWeight: 800,
              }}
            >
              Device Notification Status
            </small>
            <strong
              style={{
                fontSize: '0.92rem',
                color:
                  permission === 'granted'
                    ? 'var(--success)'
                    : permission === 'denied'
                      ? 'var(--danger)'
                      : 'var(--warning)',
              }}
            >
              {permission === 'granted'
                ? '✅ Active & Ready (OS + Background)'
                : permission === 'denied'
                  ? '❌ Blocked in Browser Settings'
                  : permission === 'unsupported'
                    ? '⚠️ Not Supported in This Browser'
                    : '⏳ Permission Not Granted Yet'}
            </strong>
          </div>
          {permission !== 'granted' && permission !== 'unsupported' && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onRequestPermission}
            >
              <i className="fa-solid fa-bell"></i> Enable Push
            </button>
          )}
        </div>

        {permission === 'denied' && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '12px',
              padding: '0.75rem',
              marginBottom: '1rem',
              fontSize: '0.78rem',
              color: '#991b1b',
            }}
          >
            Notifications are currently blocked. Open browser Site Settings (lock icon in address bar) and allow Notifications for this app.
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <div className="toggle-row">
            <label htmlFor="push-master">🔔 Master Push Notifications</label>
            <input
              type="checkbox"
              id="push-master"
              checked={prefs.enabled}
              onChange={() => handleToggleKey('enabled')}
            />
          </div>
          <div className="toggle-row">
            <label htmlFor="push-orders">🛒 New Orders &amp; Spam Flags</label>
            <input
              type="checkbox"
              id="push-orders"
              checked={prefs.orders}
              onChange={() => handleToggleKey('orders')}
            />
          </div>
          <div className="toggle-row">
            <label htmlFor="push-upi">📱 Pending UPI Verifications</label>
            <input
              type="checkbox"
              id="push-upi"
              checked={prefs.upi}
              onChange={() => handleToggleKey('upi')}
            />
          </div>
          <div className="toggle-row">
            <label htmlFor="push-products">📦 New Products Pending Approval</label>
            <input
              type="checkbox"
              id="push-products"
              checked={prefs.products}
              onChange={() => handleToggleKey('products')}
            />
          </div>
          <div className="toggle-row">
            <label htmlFor="push-payouts">💳 Wallet, Rider &amp; Store Payout Requests</label>
            <input
              type="checkbox"
              id="push-payouts"
              checked={prefs.payoutsAndWallets}
              onChange={() => handleToggleKey('payoutsAndWallets')}
            />
          </div>
          <div className="toggle-row">
            <label htmlFor="push-sos">🚨 Helpline Tickets &amp; Rider SOS Alerts</label>
            <input
              type="checkbox"
              id="push-sos"
              checked={prefs.helplineAndSos}
              onChange={() => handleToggleKey('helplineAndSos')}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-info"
            style={{ flex: 1 }}
            onClick={handleTestPush}
          >
            <i className="fa-solid fa-paper-plane"></i> Send Test Notification
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
