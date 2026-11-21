import React, { useEffect, useState } from 'react';

export interface DialogConfig {
  mode: 'confirm' | 'prompt';
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger' | 'success' | 'warning';
  onConfirm: (inputValue?: string) => void;
}

interface ActionDialogModalProps {
  dialog: DialogConfig | null;
  onClose: () => void;
}

export const ActionDialogModal: React.FC<ActionDialogModalProps> = ({ dialog, onClose }) => {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (dialog) {
      setInputValue(dialog.defaultValue || '');
    }
  }, [dialog]);

  if (!dialog) return null;

  const btnClass =
    dialog.confirmVariant === 'danger'
      ? 'btn-danger'
      : dialog.confirmVariant === 'success'
        ? 'btn-success'
        : dialog.confirmVariant === 'warning'
          ? 'btn-warning'
          : 'btn-primary';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dialog.mode === 'prompt' && !inputValue.trim()) return;
    dialog.onConfirm(dialog.mode === 'prompt' ? inputValue.trim() : undefined);
    onClose();
  };

  return (
    <div className="modal-backdrop open" onClick={onClose} style={{ zIndex: 900 }}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ fontWeight: 900, fontSize: '1.1rem' }}>{dialog.title}</h3>
          <i className="fa-solid fa-xmark" onClick={onClose} style={{ fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}></i>
        </div>
        <p style={{ fontSize: '0.88rem', color: '#334155', marginBottom: '1rem', lineHeight: 1.5 }}>{dialog.message}</p>
        <form onSubmit={handleSubmit}>
          {dialog.mode === 'prompt' && (
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={dialog.placeholder || 'Enter value...'}
                autoFocus
                required
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={`btn ${btnClass}`}>
              {dialog.confirmLabel || 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
