import React, { useEffect, useState } from 'react';
import { auth } from '../firebase';
import {
  getLoginGuardState,
  logSecurityEvent,
  recordFailedLoginAttempt,
  resetLoginGuard,
} from '../utils/security';

interface AuthScreenProps {
  externalError: string;
  onClearExternalError: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  externalError,
  onClearExternalError,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [guard, setGuard] = useState(() => getLoginGuardState());

  useEffect(() => {
    if (!guard.isLocked) return;
    const interval = window.setInterval(() => {
      const next = getLoginGuardState();
      setGuard(next);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [guard.isLocked]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentGuard = getLoginGuardState();
    setGuard(currentGuard);
    if (currentGuard.isLocked) {
      setError(
        `Login temporarily locked due to failed attempts. Retry in ${currentGuard.remainingSeconds}s.`
      );
      return;
    }

    setError('');
    onClearExternalError();
    setSubmitting(true);
    try {
      await auth.signInWithEmailAndPassword(email.trim(), password);
      resetLoginGuard();
      setGuard(getLoginGuardState());
    } catch (err: unknown) {
      const updatedGuard = recordFailedLoginAttempt();
      setGuard(updatedGuard);
      const message =
        err instanceof Error ? err.message : 'Invalid Admin credentials.';
      if (updatedGuard.isLocked) {
        setError(
          `Security lockout triggered (${updatedGuard.maxAttempts} failed attempts). Wait ${updatedGuard.remainingSeconds}s.`
        );
        void logSecurityEvent({
          eventType: 'LOCKOUT_TRIGGERED',
          actorEmail: email.trim() || 'Unknown',
          details: `Login locked for 60s after ${updatedGuard.attempts} failed attempts.`,
          severity: 'CRITICAL',
        });
      } else {
        const remaining = updatedGuard.maxAttempts - updatedGuard.attempts;
        setError(`${message} (${remaining} attempt${remaining === 1 ? '' : 's'} remaining)`);
        void logSecurityEvent({
          eventType: 'LOGIN_FAILED',
          actorEmail: email.trim() || 'Unknown',
          details: `Failed login attempt (${updatedGuard.attempts}/${updatedGuard.maxAttempts}).`,
          severity: 'WARNING',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = externalError || error;

  return (
    <div id="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <i className="fa-solid fa-basket-shopping"></i>
          <h1>Gossaigaon Bazar</h1>
        </div>
        <h3 style={{ marginBottom: '0.35rem', textAlign: 'center' }}>
          🛡️ Master Admin Terminal
        </h3>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.82rem',
            textAlign: 'center',
            marginBottom: '1.4rem',
          }}
        >
          Isolated Command Center, Brute-Force Guard &amp; App CMS
        </p>

        {guard.isLocked && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '10px',
              padding: '0.7rem 0.9rem',
              marginBottom: '1rem',
              fontSize: '0.8rem',
              color: '#991b1b',
              textAlign: 'center',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
            role="alert"
          >
            <i className="fa-solid fa-lock"></i> Brute-force shield active — retry in{' '}
            {guard.remainingSeconds}s
          </div>
        )}

        <form id="admin-login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Admin Email</label>
            <input
              type="email"
              id="login-email"
              className="form-input"
              placeholder="admin@gossaigaonbazar.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={guard.isLocked}
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              id="login-password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={guard.isLocked}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={submitting || guard.isLocked}
          >
            <i className="fa-solid fa-shield-halved"></i>{' '}
            {guard.isLocked
              ? `Locked (${guard.remainingSeconds}s)`
              : submitting
                ? 'Verifying...'
                : 'Verify & Launch Admin'}
          </button>
          {displayError && (
            <div
              className="error-msg"
              id="login-error"
              style={{
                color: 'var(--danger)',
                fontSize: '0.8rem',
                textAlign: 'center',
                marginTop: '8px',
              }}
            >
              {displayError}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
