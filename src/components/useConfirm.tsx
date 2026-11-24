import { useCallback, useState, type ReactNode } from 'react';
import './PagosManager.css';

// Confirmación dentro de la página, en lugar de window.confirm: algunos navegadores
// (vistas embebidas, el panel del escritorio) no muestran el diálogo nativo y devuelven
// "Cancelar" solo, así que lo que se pedía confirmar nunca pasaba.

interface ConfirmOptions { confirmLabel?: string; danger?: boolean }
interface Pending extends Required<ConfirmOptions> { message: string; resolve: (ok: boolean) => void }

export function useConfirm(): { confirm: (message: string, opts?: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
    const [pending, setPending] = useState<Pending | null>(null);

    const confirm = useCallback((message: string, opts?: ConfirmOptions) => new Promise<boolean>(resolve => {
        setPending({ message, resolve, confirmLabel: opts?.confirmLabel || 'Aceptar', danger: opts?.danger ?? true });
    }), []);

    const close = (ok: boolean) => {
        pending?.resolve(ok);
        setPending(null);
    };

    const dialog = pending ? (
        <div className="pg-overlay cf-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(false); }}>
            <div className="pg-modal cf-modal" role="alertdialog" aria-modal="true">
                <p className="cf-message">{pending.message}</p>
                <div className="cf-actions">
                    <button type="button" className="cf-cancel" onClick={() => close(false)}>Cancelar</button>
                    <button type="button" className={pending.danger ? 'cf-ok danger' : 'cf-ok'} autoFocus onClick={() => close(true)}>{pending.confirmLabel}</button>
                </div>
            </div>
        </div>
    ) : null;

    return { confirm, dialog };
}
