import { useMemo, useState } from 'react';
import { FaUsers, FaTrophy, FaSearch, FaWhatsapp } from 'react-icons/fa';
import './CustomersRanking.css';

interface OrderLike {
    status?: string;
    isTestOrder?: boolean;
    source?: string;
    total?: number | string;
    dateTyped?: Date;
    cliente?: { nombre?: string; telefono?: string };
}

interface Props {
    orders: OrderLike[];
    showAmounts: boolean;
}

interface Customer {
    phone: string;
    name: string;
    orders: number;
    total: number;
    lastDate: Date;
}

const POS_SOURCES = ['pos', 'pos_public', 'pos_wholesale'];

// El teléfono es el ID del cliente: se normaliza a los últimos 10 dígitos
// para que "+54 9 299 520-6821", "0299 15 5206821" y "2995206821" no se separen.
const normalizePhone = (raw: unknown): string => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
};

const waLink = (phone: string) => `https://wa.me/549${phone}`;

const medals = ['🥇', '🥈', '🥉'];

export default function CustomersRanking({ orders, showAmounts }: Props) {
    const [sortBy, setSortBy] = useState<'total' | 'orders'>('total');
    const [search, setSearch] = useState('');
    const [showAll, setShowAll] = useState(false);

    const money = (n: number) => (showAmounts ? `$${Math.round(n).toLocaleString('es-AR')}` : '***');
    const fmtDate = (d: Date) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

    const customers = useMemo(() => {
        const map = new Map<string, Customer>();
        orders.forEach(o => {
            if (o.status === 'cancelado' || o.isTestOrder) return;
            if (o.source && POS_SOURCES.includes(o.source)) return;
            const phone = normalizePhone(o.cliente?.telefono);
            if (phone.length < 6) return;
            const date = o.dateTyped instanceof Date ? o.dateTyped : new Date(0);
            const total = Number(o.total) || 0;
            const name = String(o.cliente?.nombre || '').trim();
            const c = map.get(phone);
            if (!c) {
                map.set(phone, { phone, name: name || 'Sin nombre', orders: 1, total, lastDate: date });
            } else {
                c.orders += 1;
                c.total += total;
                if (date > c.lastDate) { c.lastDate = date; if (name) c.name = name; }
            }
        });
        return [...map.values()];
    }, [orders]);

    const ranked = useMemo(() => {
        const sorted = [...customers].sort((a, b) =>
            sortBy === 'total' ? b.total - a.total || b.orders - a.orders : b.orders - a.orders || b.total - a.total);
        return sorted.map((c, i) => ({ ...c, rank: i + 1 }));
    }, [customers, sortBy]);

    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    const filtered = q
        ? ranked.filter(c => c.name.toLowerCase().includes(q) || (qDigits !== '' && c.phone.includes(qDigits)))
        : ranked;
    const visible = showAll || q ? filtered : filtered.slice(0, 10);

    const totalOrders = customers.reduce((s, c) => s + c.orders, 0);
    const totalAmount = customers.reduce((s, c) => s + c.total, 0);
    const recurring = customers.filter(c => c.orders > 1).length;
    const maxValue = ranked.length ? (sortBy === 'total' ? ranked[0].total : ranked[0].orders) : 1;

    return (
        <section className="cr-section">
            <div className="cr-header">
                <h2><FaUsers /> Clientes</h2>
                <p>Cada cliente se identifica por su número de teléfono. Se cuentan los pedidos de la página y de delivery, sin cancelados ni de prueba.</p>
            </div>

            <div className="cr-kpis">
                <div className="cr-kpi"><span>Clientes</span><strong>{customers.length}</strong></div>
                <div className="cr-kpi"><span>Pedidos</span><strong>{totalOrders}</strong></div>
                <div className="cr-kpi"><span>Total facturado</span><strong>{money(totalAmount)}</strong></div>
                <div className="cr-kpi"><span>Ticket promedio</span><strong>{money(totalOrders ? totalAmount / totalOrders : 0)}</strong></div>
                <div className="cr-kpi">
                    <span>Clientes recurrentes</span><strong>{recurring}</strong>
                    <small>{customers.length ? Math.round((recurring / customers.length) * 100) : 0}% volvió a pedir</small>
                </div>
            </div>

            {ranked.length > 0 && (
                <div className="cr-podium">
                    {ranked.slice(0, 3).map((c, i) => (
                        <div key={c.phone} className={`cr-podium-card place-${i + 1}`}>
                            <div className="cr-medal">{medals[i]}</div>
                            <strong className="cr-podium-name">{c.name}</strong>
                            <a className="cr-podium-phone cr-wa" href={waLink(c.phone)} target="_blank" rel="noreferrer" title="Abrir WhatsApp"><FaWhatsapp size={12} /> {c.phone}</a>
                            <div className="cr-podium-total">{money(c.total)}</div>
                            <small>{c.orders} pedido{c.orders !== 1 ? 's' : ''}</small>
                        </div>
                    ))}
                </div>
            )}

            <div className="cr-toolbar">
                <div className="cr-search">
                    <FaSearch size={13} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o teléfono" />
                </div>
                <div className="cr-sort">
                    <button className={sortBy === 'total' ? 'active' : ''} onClick={() => setSortBy('total')}><FaTrophy size={12} /> Por monto</button>
                    <button className={sortBy === 'orders' ? 'active' : ''} onClick={() => setSortBy('orders')}>Por pedidos</button>
                </div>
            </div>

            <div className="cr-table-wrap">
                <table className="cr-table">
                    <thead>
                        <tr><th>#</th><th>Cliente</th><th>Teléfono (ID)</th><th className="r">Pedidos</th><th className="r">Total pagado</th><th className="r">Ticket prom.</th><th>Último pedido</th></tr>
                    </thead>
                    <tbody>
                        {visible.map(c => {
                            const value = sortBy === 'total' ? c.total : c.orders;
                            return (
                                <tr key={c.phone}>
                                    <td className="cr-rank">{c.rank <= 3 ? medals[c.rank - 1] : c.rank}</td>
                                    <td>
                                        <div className="cr-name">{c.name}</div>
                                        <div className="cr-bar"><div style={{ width: `${maxValue ? Math.max(4, (value / maxValue) * 100) : 0}%` }} /></div>
                                    </td>
                                    <td className="cr-phone">
                                        <a className="cr-wa" href={waLink(c.phone)} target="_blank" rel="noreferrer" title="Abrir WhatsApp"><FaWhatsapp size={14} /> {c.phone}</a>
                                    </td>
                                    <td className="r">{c.orders}</td>
                                    <td className="r cr-money">{money(c.total)}</td>
                                    <td className="r">{money(c.total / c.orders)}</td>
                                    <td>{fmtDate(c.lastDate)}</td>
                                </tr>
                            );
                        })}
                        {visible.length === 0 && <tr><td colSpan={7} className="cr-empty">No hay clientes para mostrar.</td></tr>}
                    </tbody>
                </table>
            </div>

            {!q && filtered.length > 10 && (
                <button className="cr-more" onClick={() => setShowAll(v => !v)}>
                    {showAll ? 'Ver solo el top 10' : `Ver los ${filtered.length} clientes`}
                </button>
            )}
        </section>
    );
}
