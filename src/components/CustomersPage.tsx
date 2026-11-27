import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { FaArrowLeft, FaEye, FaEyeSlash, FaUsers, FaTrophy } from 'react-icons/fa';
import { db } from '../firebase/firebaseConfig';
import CustomersRanking, { type OrderLike } from './CustomersRanking';
import CustomersManager, { type CustomerOrder } from './CustomersManager';
import './CustomersRanking.css';
import './CustomersManager.css';

export default function CustomersPage() {
    const navigate = useNavigate();
    const [tab, setTab] = useState<'clientes' | 'ranking'>('clientes');
    const [orders, setOrders] = useState<(OrderLike & CustomerOrder)[]>([]);
    const [showAmounts, setShowAmounts] = useState(() => {
        try { return localStorage.getItem('showSensitiveData') !== 'false'; } catch { return true; }
    });

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'orders'), s => {
            setOrders(s.docs.map(d => {
                const o = d.data() as OrderLike & CustomerOrder & { date?: { toDate?: () => Date } | string | number };
                let dateTyped = new Date(0);
                if (o.date && typeof o.date === 'object' && typeof o.date.toDate === 'function') dateTyped = o.date.toDate();
                else if (o.date) dateTyped = new Date(o.date as string | number);
                return { ...o, id: d.id, dateTyped };
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
                <button className="cr-back" onClick={() => navigate('/editor/')}><FaArrowLeft /> Volver al Resumen</button>
                <button className="cr-eye" onClick={toggle} title={showAmounts ? 'Ocultar montos' : 'Mostrar montos'}>{showAmounts ? <FaEyeSlash /> : <FaEye />}</button>
            </div>
            <div className="cm-page-tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'clientes'} className={tab === 'clientes' ? 'active' : ''} onClick={() => setTab('clientes')}><FaUsers /> Clientes</button>
                <button role="tab" aria-selected={tab === 'ranking'} className={tab === 'ranking' ? 'active' : ''} onClick={() => setTab('ranking')}><FaTrophy /> Ranking</button>
            </div>
            {tab === 'clientes'
                ? <CustomersManager orders={orders} showAmounts={showAmounts} />
                : <CustomersRanking orders={orders} showAmounts={showAmounts} />}
        </div>
    );
}
