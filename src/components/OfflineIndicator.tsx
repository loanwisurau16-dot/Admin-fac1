import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(245, 158, 11, 0.96)',
        color: '#000',
        padding: '0.5rem 0.9rem',
        borderRadius: '12px',
        fontSize: '0.78rem',
        fontWeight: 800,
        boxShadow: '0 10px 25px rgba(0,0,0,0.45)',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: '#000',
          display: 'inline-block',
        }}
      />
      Offline Mode — Cached view active. Reconnecting...
    </div>
  );
};
