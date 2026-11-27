import { useMemo, useState } from 'react';
import { doc, setDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { FaSearch, FaWhatsapp, FaTimes, FaMapMarkerAlt, FaGlobe, FaCashRegister, FaStar, FaExclamationTriangle } from 'react-icons/fa';
import { db } from '../firebase/firebaseConfig';
import { normalizePhone, isValidPhone, addressKey, useCustomerDocs, type CustomerDoc } from '../utils/customers';
import { orderIsPickup } from '../utils/orderPickup';
import './CustomersManager.css';

// Sección Clientes: todo se arma a partir de los pedidos (el teléfono es el ID).
// Lo único que se guarda aparte (colección customers) son las notas y las
// ubicaciones fijadas por dirección, que después usa el mapa de pedidos.

const pinIcon = L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41] });
const SENILLOSA = { lat: -39.0135, lng: -68.4300 };

export interface CustomerOrder {
    id?: string;
    status?: string;
    isTestOrder?: boolean;
    source?: string;
    total?: number | string;
    dateTyped?: Date;
    paymentMethod?: string;
    items?: { id?: string; name?: string; nombre?: string; quantity?: number; cantidad?: number }[];
    cliente?: {
        nombre?: string; telefono?: string; direccion?: string; indicaciones?: string;
        metodoPago?: string; metodoEntrega?: string; mapsLink?: string;
        location?: { lat: number; lng: number };
    };
}

type Origin = 'web' | 'pos';
const originOf = (o: CustomerOrder): Origin => (String(o.source || '').startsWith('pos') ? 'pos' : 'web');

interface AddressInfo {
    key: string;
    text: string;
    count: number;
    lastDate: Date;
    orderLocation?: { lat: number; lng: number };
}

interface Customer {
    phone: string;
    name: string;
    otherNames: string[];
    orders: CustomerOrder[]; // sin cancelados, más nuevo primero
    cancelled: number;
    web: number;
    pos: number;
    total: number;
    firstDate: Date;
    lastDate: Date;
    addresses: AddressInfo[];
    products: { name: string; qty: number }[];
    payments: { method: string; count: number }[];
    pickups: number;
    indicaciones: string[];
}

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;
const fmtDate = (d: Date) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);
const agoText = (d: Date) => {
    const n = daysSince(d);
    if (n <= 0) return 'hoy';
    if (n === 1) return 'ayer';
    if (n < 30) return `hace ${n} días`;
    const m = Math.round(n / 30);
    return m === 1 ? 'hace 1 mes' : `hace ${m} meses`;
};
const waLink = (phone: string) => `https://wa.me/549${phone}`;

const isExtraItem = (it: { id?: string; name?: string; nombre?: string }) => {
    const n = String(it.name || it.nombre || '').toLowerCase();
    return it.id === 'shipping-cost' || it.id === 'pickup-discount' || n.includes('envío') || n.includes('envio') || n.includes('descuento');
};

const coordsFromLink = (url?: string) => {
    if (!url) return undefined;
    let u = url;
    try { u = decodeURIComponent(url); } catch { /* link mal formado */ }
    const m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || u.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : undefined;
};

const PAYMENT_LABELS: Record<string, string> = {
    efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'Mercado Pago', tarjeta: 'Tarjeta', debito: 'Débito', credito: 'Crédito',
};
const paymentLabel = (m: string) => PAYMENT_LABELS[m.toLowerCase()] || m;

function buildCustomers(orders: CustomerOrder[]): Customer[] {
    const byPhone = new Map<string, CustomerOrder[]>();
    orders.forEach(o => {
        if (o.isTestOrder) return;
        const phone = normalizePhone(o.cliente?.telefono);
        if (!isValidPhone(phone)) return;
        byPhone.set(phone, [...(byPhone.get(phone) || []), o]);
    });

    const out: Customer[] = [];
    byPhone.forEach((all, phone) => {
        const sorted = [...all].sort((a, b) => (b.dateTyped?.getTime() || 0) - (a.dateTyped?.getTime() || 0));
        const valid = sorted.filter(o => o.status !== 'cancelado');
        if (valid.length === 0 && sorted.length === 0) return;
        const base = valid.length ? valid : sorted;

        const names = Array.from(new Set(base.map(o => String(o.cliente?.nombre || '').trim()).filter(n => n && n !== 'Cliente')));
        const addresses = new Map<string, AddressInfo>();
        const products = new Map<string, number>();
        const payments = new Map<string, number>();
        const indicaciones: string[] = [];
        let total = 0, web = 0, pos = 0, pickups = 0;

        valid.forEach(o => {
            total += Number(o.total) || 0;
            if (originOf(o) === 'pos') pos++; else web++;
            const pickup = orderIsPickup(o);
            if (pickup) pickups++;
            const date = o.dateTyped || new Date(0);
            if (!pickup && o.cliente?.direccion) {
                const key = addressKey(o.cliente.direccion);
                if (key) {
                    const prev = addresses.get(key);
                    const loc = o.cliente.location || coordsFromLink(o.cliente.mapsLink);
                    if (!prev) addresses.set(key, { key, text: o.cliente.direccion.trim(), count: 1, lastDate: date, orderLocation: loc });
                    else {
                        prev.count++;
                        if (!prev.orderLocation && loc) prev.orderLocation = loc;
                    }
                }
            }
            (o.items || []).forEach(it => {
                if (isExtraItem(it)) return;
                const n = String(it.name || it.nombre || '').trim();
                if (!n) return;
                products.set(n, (products.get(n) || 0) + (Number(it.quantity ?? it.cantidad) || 1));
            });
            const pm = String(o.cliente?.metodoPago || o.paymentMethod || '').trim();
            if (pm) payments.set(pm, (payments.get(pm) || 0) + 1);
            const ind = String(o.cliente?.indicaciones || '').trim();
            if (ind && !indicaciones.includes(ind) && indicaciones.length < 4) indicaciones.push(ind);
        });

        out.push({
            phone,
            name: names[0] || 'Sin nombre',
            otherNames: names.slice(1, 4),
            orders: valid,
            cancelled: sorted.length - valid.length,
            web, pos, total,
            firstDate: base[base.length - 1].dateTyped || new Date(0),
            lastDate: base[0].dateTyped || new Date(0),
            addresses: Array.from(addresses.values()).sort((a, b) => b.count - a.count),
            products: Array.from(products.entries()).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty),
            payments: Array.from(payments.entries()).map(([method, count]) => ({ method, count })).sort((a, b) => b.count - a.count),
            pickups,
            indicaciones,
        });
    });
    return out;
}

/** Detalles a tener en cuenta, armados solos a partir del historial. */
function insightsOf(c: Customer): { text: string; tone: 'info' | 'warn' | 'good' }[] {
    const list: { text: string; tone: 'info' | 'warn' | 'good' }[] = [];
    const n = c.orders.length;
    if (c.cancelled > 0) list.push({ text: `Canceló ${c.cancelled} ${c.cancelled === 1 ? 'pedido' : 'pedidos'}`, tone: 'warn' });
    if (n >= 3) {
        const spanDays = Math.max(1, (c.lastDate.getTime() - c.firstDate.getTime()) / 86_400_000);
        const every = Math.round(spanDays / (n - 1));
        if (every <= 10) list.push({ text: `Cliente frecuente: pide cada ~${every} ${every === 1 ? 'día' : 'días'}`, tone: 'good' });
        const since = daysSince(c.lastDate);
        if (since > Math.max(30, every * 3)) list.push({ text: `Hace ${since} días que no pide (antes pedía cada ~${every} días)`, tone: 'warn' });
    }
    if (n === 1) list.push({ text: 'Hizo un solo pedido', tone: 'info' });
    if (n >= 2 && c.pickups === n) list.push({ text: 'Siempre retira en el local', tone: 'info' });
    else if (n >= 2 && c.pickups === 0) list.push({ text: 'Siempre pide con envío', tone: 'info' });
    if (c.payments[0] && n >= 2 && c.payments[0].count === n) list.push({ text: `Siempre paga con ${paymentLabel(c.payments[0].method)}`, tone: 'info' });
    if (c.addresses.length > 1) list.push({ text: `Usó ${c.addresses.length} direcciones distintas`, tone: 'info' });
    if (c.otherNames.length) list.push({ text: `También figura como: ${c.otherNames.join(', ')}`, tone: 'info' });
    return list;
}

// ---------- Selector de ubicación ----------
function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
    useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) });
    return null;
}

function PinPicker({ address, initial, onSave, onClose }: {
    address: string;
    initial?: { lat: number; lng: number };
    onSave: (lat: number, lng: number) => Promise<void>;
    onClose: () => void;
}) {
    const [pos, setPos] = useState(initial || null);
    const [saving, setSaving] = useState(false);
    const center = initial || SENILLOSA;
    return (
        <div className="cm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="cm-pin-modal">
                <div className="cm-modal-head">
                    <div>
                        <h3><FaMapMarkerAlt /> Fijar ubicación</h3>
                        <small>{address}</small>
                    </div>
                    <button className="cm-close" onClick={onClose} aria-label="Cerrar"><FaTimes /></button>
                </div>
                <p className="cm-hint">Tocá el mapa en la casa del cliente. Los próximos pedidos con esta misma dirección van a aparecer ahí.</p>
                <div className="cm-pin-map">
                    <MapContainer center={[center.lat, center.lng]} zoom={initial ? 17 : 15} style={{ height: '100%', width: '100%' }}>
                        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <ClickToPlace onPick={(lat, lng) => setPos({ lat, lng })} />
                        {pos && <Marker position={[pos.lat, pos.lng]} icon={pinIcon} />}
                    </MapContainer>
                </div>
                <div className="cm-modal-foot">
                    <button onClick={onClose}>Cancelar</button>
                    <button className="primary" disabled={!pos || saving}
                        onClick={async () => { if (!pos) return; setSaving(true); try { await onSave(pos.lat, pos.lng); onClose(); } finally { setSaving(false); } }}>
                        {saving ? 'Guardando…' : 'Guardar ubicación'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ---------- Sección ----------
export default function CustomersManager({ orders, showAmounts }: { orders: CustomerOrder[]; showAmounts: boolean }) {
    const docs = useCustomerDocs();
    const [search, setSearch] = useState('');
    const [originFilter, setOriginFilter] = useState<'todos' | Origin>('todos');
    const [sortBy, setSortBy] = useState<'recent' | 'orders' | 'total'>('recent');
    const [selected, setSelected] = useState<string | null>(null);
    const [pinFor, setPinFor] = useState<AddressInfo | null>(null);
    const [notesDraft, setNotesDraft] = useState<string | null>(null);
    const [savingNotes, setSavingNotes] = useState(false);
    const [limit, setLimit] = useState(60);

    const money = (n: number) => (showAmounts ? fmtMoney(n) : '***');
    const customers = useMemo(() => buildCustomers(orders), [orders]);

    const list = useMemo(() => {
        const q = search.trim().toLowerCase();
        const qDigits = q.replace(/\D/g, '');
        return customers
            .filter(c => originFilter === 'todos' || (originFilter === 'web' ? c.web > 0 : c.pos > 0))
            .filter(c => !q
                || c.name.toLowerCase().includes(q)
                || (qDigits.length >= 3 && c.phone.includes(qDigits))
                || c.addresses.some(a => a.text.toLowerCase().includes(q)))
            .sort((a, b) => sortBy === 'orders' ? b.orders.length - a.orders.length
                : sortBy === 'total' ? b.total - a.total
                : b.lastDate.getTime() - a.lastDate.getTime());
    }, [customers, search, originFilter, sortBy]);

    const current = selected ? customers.find(c => c.phone === selected) || null : null;
    const currentDoc: CustomerDoc = (current && docs[current.phone]) || {};

    const savePin = async (phone: string, a: AddressInfo, lat: number, lng: number) => {
        await setDoc(doc(db, 'customers', phone), {
            pins: { [a.key]: { address: a.text, lat, lng } },
            updatedAt: serverTimestamp(),
        }, { merge: true });
    };
    const removePin = async (phone: string, key: string) => {
        await setDoc(doc(db, 'customers', phone), { pins: { [key]: deleteField() }, updatedAt: serverTimestamp() }, { merge: true });
    };
    const saveNotes = async () => {
        if (!current || notesDraft === null) return;
        setSavingNotes(true);
        try {
            await setDoc(doc(db, 'customers', current.phone), { notes: notesDraft.trim(), updatedAt: serverTimestamp() }, { merge: true });
            setNotesDraft(null);
        } catch (e) {
            console.error(e);
            alert('No se pudieron guardar las notas.');
        } finally {
            setSavingNotes(false);
        }
    };

    const totals = {
        clientes: customers.length,
        web: customers.filter(c => c.web > 0).length,
        pos: customers.filter(c => c.pos > 0).length,
        recurrentes: customers.filter(c => c.orders.length >= 2).length,
    };

    return (
        <section className="cm-section">
            <div className="cm-kpis">
                <div className="cm-kpi"><span>Clientes</span><strong>{totals.clientes}</strong></div>
                <div className="cm-kpi"><span>Volvieron a pedir</span><strong>{totals.recurrentes}</strong></div>
                <div className="cm-kpi"><span><FaGlobe /> Por la página</span><strong>{totals.web}</strong></div>
                <div className="cm-kpi"><span><FaCashRegister /> Cargados en POS</span><strong>{totals.pos}</strong></div>
            </div>

            <div className="cm-toolbar">
                <div className="cm-search">
                    <FaSearch />
                    <input value={search} onChange={e => { setSearch(e.target.value); setLimit(60); }} placeholder="Buscar por nombre, teléfono o dirección" />
                </div>
                <div className="cm-chips">
                    {([['todos', 'Todos'], ['web', '🌐 Página'], ['pos', '🧾 POS']] as const).map(([k, l]) => (
                        <button key={k} className={originFilter === k ? 'active' : ''} onClick={() => setOriginFilter(k)}>{l}</button>
                    ))}
                </div>
                <select className="cm-sort" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
                    <option value="recent">Último pedido</option>
                    <option value="orders">Más pedidos</option>
                    <option value="total">Más gastó</option>
                </select>
            </div>

            {list.length === 0 && <div className="cm-empty">No hay clientes que coincidan.</div>}

            <div className="cm-list">
                {list.slice(0, limit).map(c => {
                    const pinned = Object.keys(docs[c.phone]?.pins || {}).length;
                    return (
                        <button key={c.phone} className="cm-row" onClick={() => { setSelected(c.phone); setNotesDraft(null); }}>
                            <div className="cm-avatar">{c.name.charAt(0).toUpperCase()}</div>
                            <div className="cm-row-main">
                                <strong>{c.name}</strong>
                                <span className="cm-phone">{c.phone}</span>
                                <span className="cm-row-meta">
                                    {c.products[0] && <><FaStar /> {c.products[0].name}</>}
                                </span>
                            </div>
                            <div className="cm-row-side">
                                <span className="cm-count">{c.orders.length} {c.orders.length === 1 ? 'pedido' : 'pedidos'}</span>
                                <span className="cm-ago">{agoText(c.lastDate)}</span>
                                <span className="cm-badges">
                                    {c.web > 0 && <span className="cm-badge web">🌐 {c.web}</span>}
                                    {c.pos > 0 && <span className="cm-badge pos">🧾 {c.pos}</span>}
                                    {pinned > 0 && <span className="cm-badge pin">📍</span>}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
            {list.length > limit && (
                <button className="cm-more" onClick={() => setLimit(limit + 60)}>Ver más ({list.length - limit})</button>
            )}

            {current && (
                <div className="cm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}>
                    <div className="cm-detail">
                        {/* Cabecera */}
                        <div className="cm-hero">
                            <div className="cm-hero-avatar">{current.name.charAt(0).toUpperCase()}</div>
                            <div className="cm-hero-info">
                                <h3>{current.name}</h3>
                                <div className="cm-hero-meta">
                                    <a className="cm-wa" href={waLink(current.phone)} target="_blank" rel="noreferrer"><FaWhatsapp /> {current.phone}</a>
                                    <span>Cliente desde {fmtDate(current.firstDate)}</span>
                                </div>
                                <div className="cm-hero-tags">
                                    {current.web > 0 && <span className="cm-badge web">🌐 {current.web} por la página</span>}
                                    {current.pos > 0 && <span className="cm-badge pos">🧾 {current.pos} cargados en POS</span>}
                                    {current.orders.length >= 3 && <span className="cm-badge good">⭐ Recurrente</span>}
                                </div>
                            </div>
                            <button className="cm-close" onClick={() => setSelected(null)} aria-label="Cerrar"><FaTimes /></button>
                        </div>

                        {/* Números */}
                        <div className="cm-stats">
                            <div><span>Pedidos</span><strong>{current.orders.length}</strong></div>
                            <div><span>Último pedido</span><strong>{fmtDate(current.lastDate)}</strong><small>{agoText(current.lastDate)}</small></div>
                            <div><span>Gastó en total</span><strong>{money(current.total)}</strong></div>
                            <div><span>Ticket promedio</span><strong>{money(current.orders.length ? current.total / current.orders.length : 0)}</strong></div>
                        </div>

                        <div className="cm-detail-grid">
                            {/* Columna izquierda: lo que hay que saber del cliente */}
                            <div className="cm-col">
                                {insightsOf(current).length > 0 && (
                                    <div className="cm-card">
                                        <h4><FaExclamationTriangle /> Para tener en cuenta</h4>
                                        <ul className="cm-insights">
                                            {insightsOf(current).map((i, k) => <li key={k} className={i.tone}>{i.text}</li>)}
                                        </ul>
                                    </div>
                                )}

                                <div className="cm-card">
                                    <h4>📝 Notas</h4>
                                    <textarea
                                        rows={3}
                                        placeholder="Ej: no tocar timbre, alérgico a la nuez, paga siempre justo…"
                                        value={notesDraft ?? currentDoc.notes ?? ''}
                                        onChange={e => setNotesDraft(e.target.value)}
                                    />
                                    {notesDraft !== null && notesDraft !== (currentDoc.notes ?? '') && (
                                        <button className="cm-save" onClick={saveNotes} disabled={savingNotes}>{savingNotes ? 'Guardando…' : 'Guardar notas'}</button>
                                    )}
                                </div>

                                {current.products.length > 0 && (
                                    <div className="cm-card">
                                        <h4><FaStar /> Productos favoritos</h4>
                                        <div className="cm-products">
                                            {current.products.slice(0, 5).map((p, i) => {
                                                const max = current.products[0].qty || 1;
                                                return (
                                                    <div key={p.name} className="cm-product">
                                                        <span className="cm-product-rank">{i + 1}</span>
                                                        <div className="cm-product-body">
                                                            <div className="cm-product-top"><span>{p.name}</span><b>{p.qty} u.</b></div>
                                                            <div className="cm-product-bar"><i style={{ width: `${Math.max(8, (p.qty / max) * 100)}%` }} /></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {current.payments.length > 0 && (
                                    <div className="cm-card">
                                        <h4>💳 Cómo paga</h4>
                                        <div className="cm-pay-chips">
                                            {current.payments.map(p => (
                                                <span key={p.method} className="cm-pay-chip">{paymentLabel(p.method)} <b>{p.count}</b></span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Columna derecha: direcciones e historial */}
                            <div className="cm-col">
                                <div className="cm-card">
                                    <h4><FaMapMarkerAlt /> Direcciones</h4>
                                    {current.addresses.length === 0 && <p className="cm-muted">Solo retiró en el local.</p>}
                                    {current.addresses.map(a => {
                                        const pin = currentDoc.pins?.[a.key];
                                        return (
                                            <div key={a.key} className={`cm-address${pin ? ' is-pinned' : ''}`}>
                                                <div className="cm-address-text">
                                                    <strong>{a.text}</strong>
                                                    <small>
                                                        {a.count} {a.count === 1 ? 'pedido' : 'pedidos'} ·{' '}
                                                        {pin ? <span className="ok">📍 Ubicación fijada</span>
                                                            : a.orderLocation ? <span>Hay una ubicación de un pedido</span>
                                                            : <span className="warn">Sin ubicación</span>}
                                                    </small>
                                                </div>
                                                <div className="cm-address-actions">
                                                    {!pin && a.orderLocation && (
                                                        <button onClick={() => savePin(current.phone, a, a.orderLocation!.lat, a.orderLocation!.lng)}>Usar la del pedido</button>
                                                    )}
                                                    <button className="primary" onClick={() => setPinFor(a)}>{pin ? 'Mover' : 'Fijar en el mapa'}</button>
                                                    {pin && <button className="danger" onClick={() => removePin(current.phone, a.key)}>Quitar</button>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {current.addresses.length > 0 && (
                                        <p className="cm-muted">Un pedido nuevo con la misma dirección se ubica solo en el mapa. Si viene con otra dirección, no.</p>
                                    )}
                                </div>

                                <div className="cm-card">
                                    <h4>🧾 Últimos pedidos</h4>
                                    <div className="cm-orders">
                                        {current.orders.slice(0, 8).map((o, i) => (
                                            <div key={o.id || i} className="cm-order">
                                                <div className="cm-order-head">
                                                    <strong>{o.dateTyped ? fmtDate(o.dateTyped) : '—'}</strong>
                                                    <span className={`cm-badge ${originOf(o)}`}>{originOf(o) === 'pos' ? '🧾 POS' : '🌐 Página'}</span>
                                                    <b>{money(Number(o.total) || 0)}</b>
                                                </div>
                                                <small>{(o.items || []).filter(it => !isExtraItem(it)).map(it => `${Number(it.quantity ?? it.cantidad) || 1}× ${it.name || it.nombre}`).join(', ') || 'Sin detalle'}</small>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {current.indicaciones.length > 0 && (
                                    <div className="cm-card">
                                        <h4>📌 Indicaciones que dejó</h4>
                                        <ul className="cm-plain">{current.indicaciones.map(i => <li key={i}>{i}</li>)}</ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {current && pinFor && (
                <PinPicker
                    address={pinFor.text}
                    initial={currentDoc.pins?.[pinFor.key] || pinFor.orderLocation}
                    onSave={(lat, lng) => savePin(current.phone, pinFor, lat, lng)}
                    onClose={() => setPinFor(null)}
                />
            )}
        </section>
    );
}
