'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n-client';
import { Modal } from '@/components/Modal';

interface ConfirmOptions {
  /** Label for the confirming button; defaults to "Delete". */
  confirmLabel?: string;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * In-app replacement for window.confirm(). The native dialog blocks the page's
 * main thread while it is open, which browsers report as a slow interaction (INP).
 */
export function ConfirmProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { t } = useI18n();
  const [request, setRequest] = useState<{ message: string; confirmLabel?: string } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((message, options) => {
    resolver.current?.(false);
    setRequest({ message, confirmLabel: options?.confirmLabel });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={request !== null} title={t('common.confirmTitle')} onClose={() => close(false)}>
        <p className="text-sm text-slate-700">{request?.message}</p>
        <div className="flex justify-end gap-2 pt-5">
          <button className="btn-ghost" onClick={() => close(false)}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-primary bg-red-600 hover:bg-red-700"
            autoFocus
            onClick={() => close(true)}
          >
            {request?.confirmLabel ?? t('common.delete')}
          </button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
