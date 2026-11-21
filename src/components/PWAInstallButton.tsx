import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button type="button" onClick={install} className="btn btn-primary btn-sm">
        <i className="fa-solid fa-download"></i> Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="btn btn-outline btn-sm"
          style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
        >
          <i className="fa-solid fa-mobile-screen-button"></i> Install App
        </button>

        {showIOSGuide && (
          <div className="modal-backdrop open" onClick={() => setShowIOSGuide(false)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <h3 style={{ fontWeight: 900 }}>
                  <i className="fa-solid fa-mobile-screen-button" style={{ color: 'var(--primary)' }}></i> Install on iPhone / iPad
                </h3>
                <i className="fa-solid fa-xmark" onClick={() => setShowIOSGuide(false)} style={{ fontSize: '1.25rem', cursor: 'pointer' }}></i>
              </div>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
                1. Tap the <strong style={{ color: '#0f172a' }}>Share</strong> button in Safari toolbar.<br />
                2. Scroll down and tap <strong style={{ color: '#0f172a' }}>Add to Home Screen</strong>.<br />
                3. Launch <strong style={{ color: 'var(--primary)' }}>GB Admin</strong> from your home screen for native full-screen mode & push notifications.
              </p>
              <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowIOSGuide(false)}>
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
