import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { FaArrowLeft, FaEye, FaEyeSlash } from 'react-icons/fa';
import { db } from '../firebase/firebaseConfig';
import CustomersRanking, { type OrderLike } from './CustomersRanking';
import './CustomersRanking.css';

export default function CustomersPage() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<OrderLike[]>([]);
    const [showAmounts, setShowAmounts] = useState(() => {
        try { return localStorage.getItem('showSensitiveData') !== 'false'; } catch { return true; }
    });

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'orders'), s => {
            setOrders(s.docs.map(d => {
                const o = d.data() as OrderLike & { date?: { toDate?: () => Date } | string | number };
                let dateTyped = new Date(0);
                if (o.date && typeof o.date === 'object' && typeof o.date.toDate === 'function') dateTyped = o.date.toDate();
                else if (o.date) dateTyped = new Date(o.date as string | number);
                return { ...o, dateTyped };
            }));
        }, e => console.error(e));
        return () => unsub();
    }, []);

    const toggle = () => {
        const next = !showAmounts;
        setShowAmounts(next);
        try { localStorage.setItem('showSensitiveData', String(next)); } catch { /* sin almacenamiento */ }
    };

    return (
        <div className="cr-page-wrap">
            <div className="cr-top-actions">
                <button className="cr-back" onClick={() => navigate('/editor/')}><FaArrowLeft /> Volver al Dashboard</button>
                <button className="cr-eye" onClick={toggle} title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}>{showAmounts ? <FaEyeSlash /> : <FaEye />}</button>
            </div>
            <CustomersRanking orders={orders} showAmounts={showAmounts} />
        </div>
    );
}
