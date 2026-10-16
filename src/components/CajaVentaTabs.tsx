import { useEffect, useState } from 'react';
import { FaArrowLeft, FaPlus, FaTimes } from 'react-icons/fa';
import CajaVenta from './CajaVenta';
import './CajaVentaTabs.css';

type SaleCompleteData = { amount: number; payments: { method: string; amount: number }[]; orderId: string; itemCount: number };

interface Props {
    active?: boolean;
    onPendingSalesChange?: (count: number) => void;
    onBack: () => void;
    onSaleComplete: (data: SaleCompleteData) => void;
}

export default function CajaVentaTabs({ onBack, onSaleComplete, active = true, onPendingSalesChange }: Props) {
    const [tabs, setTabs] = useState<number[]>([1]);
    const [activeId, setActiveId] = useState(1);
    const [nextId, setNextId] = useState(2);
    const [closeTarget, setCloseTarget] = useState<number | null>(null);

    const [cartCounts, setCartCounts] = useState<Record<number, number>>({});

    const handleCartCount = (id: number, count: number) =>
        setCartCounts(prev => (prev[id] === count ? prev : { ...prev, [id]: count }));

    useEffect(() => {
        const pending = tabs.filter(id => (cartCounts[id] || 0) > 0).length;
        onPendingSalesChange?.(pending);
    }, [tabs, cartCounts, onPendingSalesChange]);

    useEffect(() => () => onPendingSalesChange?.(0), [onPendingSalesChange]);

    const addTab = () => {
        setTabs(prev => [...prev, nextId]);
        setActiveId(nextId);
        setNextId(n => n + 1);
    };

    const confirmClose = () => {
        if (closeTarget === null) return;
        const idx = tabs.indexOf(closeTarget);
        const remaining = tabs.filter(t => t !== closeTarget);
        if (remaining.length === 0) {
            setCloseTarget(null);
            onBack();
            return;
        }
        setTabs(remaining);
        if (activeId === closeTarget) setActiveId(remaining[Math.max(0, idx - 1)]);
        setCloseTarget(null);
    };

    return (
        <div className="caja-tabs-root">
            <div className="caja-venta-header">
                <button className="caja-venta-back-btn" onClick={onBack}>
                    <FaArrowLeft /> Volver
                </button>
                <h2>Caja - Registrar Venta</h2>
            </div>
            <div className="caja-tabs-bar">
                {tabs.map((id, i) => (
                    <div
                        key={id}
                        className={`caja-tab ${id === activeId ? 'active' : ''}`}
                        onClick={() => setActiveId(id)}
                    >
                        <span>Venta {i + 1}</span>
                        <button
                            className="caja-tab-close"
                            title="Cerrar pestaña"
                            onClick={e => { e.stopPropagation(); setCloseTarget(id); }}
                        >
                            <FaTimes />
                        </button>
                    </div>
                ))}
                <button className="caja-tab-add" title="Nueva venta" onClick={addTab}><FaPlus /></button>
            </div>

            {tabs.map(id => (
                <div key={id} className="caja-tab-pane" style={{ display: id === activeId ? 'block' : 'none' }}>
                    <CajaVenta onCartCountChange={n => handleCartCount(id, n)} active={active && id === activeId} onSaleComplete={onSaleComplete} />
                </div>
            ))}

            {closeTarget !== null && (
                <div className="caja-tab-confirm-overlay" onClick={() => setCloseTarget(null)}>
                    <div className="caja-tab-confirm" onClick={e => e.stopPropagation()}>
                        <h3>¿Cerrar esta venta?</h3>
                        <p>Se van a perder los productos cargados en "Venta {tabs.indexOf(closeTarget) + 1}" que no hayas cobrado.</p>
                        <div className="caja-tab-confirm-actions">
                            <button onClick={() => setCloseTarget(null)}>Cancelar</button>
                            <button className="danger" onClick={confirmClose}>Cerrar venta</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
