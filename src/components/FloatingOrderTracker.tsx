import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';
import { FaMotorcycle } from 'react-icons/fa';
import './FloatingOrderTracker.css';

export default function FloatingOrderTracker() {
    const navigate = useNavigate();
    const [activeOrdersCount, setActiveOrdersCount] = useState(0);

    useEffect(() => {
        const unsubscribers: (() => void)[] = [];
        const activeOrderMaps = new Map<string, boolean>();

        const fetchOrders = () => {
            const storedIds = JSON.parse(localStorage.getItem('mis_pedidos') || '[]');
            let validIds = storedIds
                .map((item: any) => String(typeof item === 'object' ? (item.id || item.orderId) : item))
                .filter((id: string) => id && id !== 'undefined' && id !== 'null');

            if (validIds.length === 0) {
                setActiveOrdersCount(0);
                unsubscribers.forEach(unsub => unsub());
                unsubscribers.length = 0;
                activeOrderMaps.clear();
                return;
            }

            // Only track the most recent order to avoid evaluating old history
            const activeIds = [validIds[validIds.length - 1]];

            const subs = activeIds.map(id => {
                const docRef = doc(db, "orders", id);
                return onSnapshot(docRef, (snapshot) => {
                    if (snapshot.exists()) {
                        const status = snapshot.data().status;
                        const isActive = status !== 'entregado' && status !== 'cancelado';
                        activeOrderMaps.set(id, isActive);
                    } else {
                        activeOrderMaps.set(id, false);
                    }

                    let count = 0;
                    activeOrderMaps.forEach(isActive => {
                        if (isActive) count++;
                    });
                    setActiveOrdersCount(count);
                });
            });

            subs.forEach(sub => unsubscribers.push(sub));
        };

        fetchOrders();

        // Listen for standard storage events (cross-tab)
            const handleStorageChange = (e: StorageEvent) => {
                if (e.key === 'mis_pedidos') fetchOrders();
            };

            // Listen for our custom local event 
            const handleLocalChange = () => fetchOrders();

            window.addEventListener('storage', handleStorageChange);
            window.addEventListener('mis_pedidos_updated', handleLocalChange);

            return () => {
                unsubscribers.forEach(unsub => unsub());
                window.removeEventListener('storage', handleStorageChange);
                window.removeEventListener('mis_pedidos_updated', handleLocalChange);
            };
        }, []);

    // Also watch localStorage changes if possible (only works cross-tab natively, but we can poll or rely on context if needed in the future, for now full reload or snapshot covers most cases since we only need UI update on new order creation which usually navigates)

    if (activeOrdersCount === 0) return null;

    return (
        <div className="floating-tracker-container" onClick={() => navigate('/mis-pedidos')} title="Ver mis pedidos activos">
            <div className="floating-tracker-btn">
                <FaMotorcycle size={28} />
                <span className="floating-tracker-badge">{activeOrdersCount}</span>
            </div>
        </div>
    );
}
