import React, { useEffect, useState } from 'react';
import { verifySecurityPin } from '../utils/security';

interface SessionLockModalProps {
  open: boolean;
  adminEmail: string;
  lockReason: 'idle' | 'manual';
  pinHash?: string;
  pinSalt?: string;
  onUnlockSuccess: () => void;
  onFailedAttempt: (attempts: number) => void;
  onEmergencySignOut: () => void;
}

export const SessionLockModal: React.FC<SessionLockModalProps> = ({
  open,
  adminEmail,
  lockReason,
  pinHash,
  pinSalt,
  onUnlockSuccess,
  onFailedAttempt,
  onEmergencySignOut,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [failedCount, setFailedCount] = useState(0);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!open) {
      setPinInput('');
      setError('');
      setFailedCount(0);
      setCooldownSec(0);
    }
  }, [open]);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = window.setInterval(() => {
      setCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldownSec]);

  if (!open) return null;

  const hasConfiguredPin = Boolean(pinHash && pinSalt);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSec > 0) return;
    if (!hasConfiguredPin) {
      onUnlockSuccess();
      return;
    }

    const cleanPin = pinInput.trim();
    if (cleanPin.length < 4) {
      setError('Enter your 4–6 digit Admin Security PIN.');
      return;
    }

    setVerifying(true);
    setError('');
    try {
      const ok = await verifySecurityPin(cleanPin, pinSalt!, pinHash!);
      if (ok) {
        setPinInput('');
        setFailedCount(0);
        onUnlockSuccess();
      } else {
        const nextFailed = failedCount + 1;
        setFailedCount(nextFailed);
        setPinInput('');
        onFailedAttempt(nextFailed);
        if (nextFailed >= 5) {
          setCooldownSec(30);
          setFailedCount(0);
          setError('Too many wrong PIN attempts. Wait 30s or Sign Out.');
        } else {
          setError(
            `Incorrect Security PIN (${5 - nextFailed} attempt${5 - nextFailed === 1 ? '' : 's'} remaining).`
          );
        }
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className="session-lock-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-lock-title"
    >
      <div className="session-lock-card">
        <div className="session-lock-icon">
          <i className="fa-solid fa-user-lock"></i>
        </div>
        <h2 id="session-lock-title" className="session-lock-title">
          Terminal Locked
        </h2>
        <p className="session-lock-subtitle">
          {lockReason === 'idle'
            ? 'Locked automatically after inactivity to protect admin and payment records.'
            : 'Manually locked by administrator.'}
        </p>
        <div className="session-lock-account">
          <span>{adminEmail}</span>
        </div>

        <form onSubmit={handleUnlock}>
          {hasConfiguredPin ? (
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label htmlFor="unlock-pin-input">Admin Security PIN</label>
              <input
                id="unlock-pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="form-input session-pin-input"
                placeholder="Enter 4–6 digit PIN"
                value={pinInput}
                onChange={(e) =>
                  setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                disabled={cooldownSec > 0}
                autoFocus
                required
              />
            </div>
          ) : (
            <p
              style={{
                fontSize: '0.78rem',
                color: '#b45309',
                marginBottom: '1rem',
              }}
            >
              No Security PIN configured yet. Configure a PIN in Security Center after unlocking.
            </p>
          )}

          {error && (
            <div
              style={{
                color: '#dc2626',
                fontSize: '0.78rem',
                fontWeight: 700,
                marginBottom: '0.85rem',
                fontVariantNumeric: 'tabular-nums',
              }}
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: '0.65rem' }}
            disabled={verifying || cooldownSec > 0}
          >
            <i className="fa-solid fa-unlock-keyhole"></i>{' '}
            {cooldownSec > 0
              ? `Retry in ${cooldownSec}s`
              : verifying
                ? 'Verifying PIN...'
                : 'Unlock Command Center'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ width: '100%' }}
          onClick={onEmergencySignOut}
        >
          <i className="fa-solid fa-arrow-right-from-bracket"></i> Sign Out Instead
        </button>
      </div>
    </div>
  );
};
