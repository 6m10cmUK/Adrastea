import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { theme } from '../../styles/theme';

export type Toast = {
  id: string;
  message: string;
  type: 'success' | 'error';
  exiting?: boolean;
};

export function useToast(): {
  toasts: Toast[];
  showToast: (message: string, type: 'success' | 'error') => void;
} {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now().toString();
    const newToast: Toast = { id, message, type };

    setToasts((prev) => [...prev, newToast]);

    // 2.5秒後に退出アニメーション開始、3秒後に削除
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    }, 2500);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return { toasts, showToast };
}

export function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 10002,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: toast.type === 'error' ? theme.danger : theme.bgSurface,
            color: toast.type === 'error' ? '#fff' : theme.success,
            border: toast.type === 'error' ? 'none' : `1px solid ${theme.borderSubtle}`,
            padding: '12px 20px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: 600,
            boxShadow: theme.shadowMd,
            marginBottom: '8px',
            pointerEvents: 'auto',
            animation: toast.exiting
              ? 'toast-exit 0.5s ease-in forwards'
              : toast.type === 'error'
                ? 'toast-shake 0.4s ease-in-out, toast-enter 0.3s ease-out'
                : 'toast-enter 0.3s ease-out',
          }}
        >
          {toast.message}
        </div>
      ))}
      <style>{`
        @keyframes toast-enter {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes toast-exit {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes toast-shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(6px); }
          45% { transform: translateX(-4px); }
          60% { transform: translateX(2px); }
          75% { transform: translateX(-1px); }
        }
      `}</style>
    </div>,
    document.body
  );
}
