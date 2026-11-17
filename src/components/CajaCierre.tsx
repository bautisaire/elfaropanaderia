import { useMemo, useState } from 'react';
import { FaTimes, FaListUl, FaCheckCircle, FaMoneyBillWave, FaExchangeAlt, FaClock, FaCashRegister, FaArrowDown, FaArrowUp, FaReceipt } from 'react-icons/fa';
import './CajaCierre.css';

// Cierre de caja: arqueo (esperado vs. contado) de efectivo y online, resumen del cierre y detalles.

export interface SnapMovement {
    type: 'venta' | 'ingreso' | 'egreso';
    amount: number;
    method: string; // 'Efectivo' | 'Débito' | 'Transferencia' | 'QR' | 'Online'
    description?: string;
    orderId?: string;
    itemCount?: number;
    time: number; // ms epoch
}

export interface SessionStatsView {
    enCaja: number;
    ingresos: number;
    egresos: number;
    ventas: number;
    efectivo: number;
    transferencia: number;
    debito: number;
    qr?: number;
    cantidad: number;
    efectivoInicial?: number;
    onlineInicial?: number;
    efectivoEsperado?: number;
    onlineEsperado?: number;
    efectivoContado?: number;
    onlineContado?: number;
    diferenciaEfectivo?: number;
    diferenciaOnline?: number;
    diferencia?: number;
}

export interface SessionView {
    id: string;
    number: number;
    closedAt: Date | null;
    periodStart: Date | null;
    closedByEmail?: string;
    stats: SessionStatsView;
    movements?: SnapMovement[];
}

interface Bucket { inicial: number; ventas: number; ingresos: number; egresos: number; esperado: number }

export interface CajaSummary {
    ventas: number;
    ingresos: number;
    egresos: number;
    cantVentas: number;
    cantIngresos: number;
    cantEgresos: number;
    byMethod: Record<string, number>;
    efectivo: Bucket;
    online: Bucket;
    ticketPromedio: number;
    peakMoney: { hour: number; amount: number } | null;
    peakCount: { hour: number; count: number } | null;
    manual: SnapMovement[];
}

const TZ = 'America/Argentina/Buenos_Aires';

const hourOf = (t: number) => {
    const h = Number(new Date(t).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }));
    return Number.isFinite(h) ? h % 24 : 0;
};

const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`;
const fmtTime = (t: number) => new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtDateTime = (d: Date | null) => d
    ? d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })
    : '—';

export function summarizeMovements(movs: SnapMovement[], opening: { efectivo: number; online: number } = { efectivo: 0, online: 0 }): CajaSummary {
    const emptyBucket = (inicial: number): Bucket => ({ inicial, ventas: 0, ingresos: 0, egresos: 0, esperado: 0 });
    const s: CajaSummary = {
        ventas: 0, ingresos: 0, egresos: 0, cantVentas: 0, cantIngresos: 0, cantEgresos: 0,
        byMethod: {}, efectivo: emptyBucket(opening.efectivo), online: emptyBucket(opening.online),
        ticketPromedio: 0, peakMoney: null, peakCount: null, manual: [],
    };
    const hourMoney: Record<number, number> = {};
    const hourCount: Record<number, number> = {};

    movs.forEach(m => {
        const bucket = m.method === 'Efectivo' ? s.efectivo : s.online;
        if (m.type === 'venta') {
            s.ventas += m.amount; s.cantVentas += 1; bucket.ventas += m.amount;
            s.byMethod[m.method] = (s.byMethod[m.method] || 0) + m.amount;
            const h = hourOf(m.time);
            hourMoney[h] = (hourMoney[h] || 0) + m.amount;
            hourCount[h] = (hourCount[h] || 0) + 1;
        } else if (m.type === 'ingreso') {
            s.ingresos += m.amount; s.cantIngresos += 1; bucket.ingresos += m.amount;
            s.manual.push(m);
        } else {
            s.egresos += m.amount; s.cantEgresos += 1; bucket.egresos += m.amount;
            s.manual.push(m);
        }
    });

    s.efectivo.esperado = s.efectivo.inicial + s.efectivo.ventas + s.efectivo.ingresos - s.efectivo.egresos;
    s.online.esperado = s.online.inicial + s.online.ventas + s.online.ingresos - s.online.egresos;
    s.ticketPromedio = s.cantVentas > 0 ? s.ventas / s.cantVentas : 0;
    s.manual.sort((a, b) => a.time - b.time);

    Object.entries(hourMoney).forEach(([h, amount]) => {
        if (!s.peakMoney || amount > s.peakMoney.amount) s.peakMoney = { hour: Number(h), amount };
    });
    Object.entries(hourCount).forEach(([h, count]) => {
        if (!s.peakCount || count > s.peakCount.count) s.peakCount = { hour: Number(h), count };
    });
    return s;
}

type Fmt = (n: number) => string;
const signed = (fmt: Fmt, n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `-${fmt(Math.abs(n))}` : fmt(0));
const diffClass = (n: number) => (n === 0 ? 'ok' : n < 0 ? 'neg' : 'pos');
const diffLabel = (n: number) => (n === 0 ? 'Cuadra' : n < 0 ? 'Faltante' : 'Sobrante');

/* ------------------------------------------------------------------ */
/* Modal: Cerrar caja (conteo real)                                    */
/* ------------------------------------------------------------------ */

export function CerrarCajaModal({ summary, cantidad, fmt, saving, onCancel, onConfirm }: {
    summary: CajaSummary;
    cantidad: number;
    fmt: Fmt;
    saving: boolean;
    onCancel: () => void;
    onConfirm: (countedEfectivo: number, countedOnline: number) => void;
}) {
    const [efectivoInput, setEfectivoInput] = useState('');
    const [onlineInput, setOnlineInput] = useState('');

    const expEfectivo = summary.efectivo.esperado;
    const expOnline = summary.online.esperado;

    // Si no hay nada esperado en un medio, se puede dejar en blanco (cuenta como 0).
    const efectivoFilled = efectivoInput.trim() !== '' || expEfectivo === 0;
    const onlineFilled = onlineInput.trim() !== '' || expOnline === 0;
    const countedEfectivo = Number(efectivoInput) || 0;
    const countedOnline = Number(onlineInput) || 0;
    const valid = efectivoFilled && onlineFilled && countedEfectivo >= 0 && countedOnline >= 0;

    const diffEfectivo = countedEfectivo - expEfectivo;
    const diffOnline = countedOnline - expOnline;
    const expTotal = expEfectivo + expOnline;
    const countedTotal = countedEfectivo + countedOnline;
    const diffTotal = countedTotal - expTotal;
    const anyTyped = efectivoInput.trim() !== '' || onlineInput.trim() !== '';

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!valid || saving) return;
        onConfirm(countedEfectivo, countedOnline);
    };

    return (
        <div className="cc-overlay" onClick={() => !saving && onCancel()}>
            <form className="cc-modal cc-modal-close" onClick={e => e.stopPropagation()} onSubmit={submit}>
                <div className="cc-banner">
                    <FaCashRegister /> <h3>Cerrar caja</h3>
                    <button type="button" className="cc-x" onClick={onCancel} disabled={saving}><FaTimes /></button>
                </div>
                <div className="cc-body">
                    <div className="cc-meta">{cantidad} {cantidad === 1 ? 'movimiento' : 'movimientos'} en esta caja</div>

                    <div className="cc-count-grid">
                    <div className="cc-count-block">
                        <div className="cc-count-title"><FaMoneyBillWave /> Efectivo</div>
                        <div className="cc-line"><span>Monto inicial</span><b>{fmt(summary.efectivo.inicial)}</b></div>
                        <div className="cc-line"><span>Ventas en efectivo</span><b>{fmt(summary.efectivo.ventas)}</b></div>
                        <div className="cc-line"><span>Ingresos</span><b>{fmt(summary.efectivo.ingresos)}</b></div>
                        <div className="cc-line"><span>Egresos</span><b>{fmt(summary.efectivo.egresos)}</b></div>
                        <div className="cc-line cc-strong"><span>Esperado en caja</span><b className="cc-green">{fmt(expEfectivo)}</b></div>
                        <label className="cc-label">Efectivo contado</label>
                        <input
                            className="cc-input"
                            type="number" min="0" step="any" inputMode="decimal" autoFocus
                            value={efectivoInput}
                            onChange={e => setEfectivoInput(e.target.value)}
                            placeholder="¿Cuánto efectivo hay realmente?"
                        />
                        {efectivoFilled && (efectivoInput.trim() !== '') && (
                            <div className={`cc-diff ${diffClass(diffEfectivo)}`}>{diffLabel(diffEfectivo)}: {signed(fmt, diffEfectivo)}</div>
                        )}
                    </div>

                    <div className="cc-count-block">
                        <div className="cc-count-title"><FaExchangeAlt /> Online (transferencia, débito, QR)</div>
                        <div className="cc-line"><span>Monto inicial</span><b>{fmt(summary.online.inicial)}</b></div>
                        <div className="cc-line"><span>Ventas online</span><b>{fmt(summary.online.ventas)}</b></div>
                        <div className="cc-line"><span>Ingresos</span><b>{fmt(summary.online.ingresos)}</b></div>
                        <div className="cc-line"><span>Egresos</span><b>{fmt(summary.online.egresos)}</b></div>
                        <div className="cc-line cc-strong"><span>Esperado online</span><b className="cc-green">{fmt(expOnline)}</b></div>
                        <label className="cc-label">Online contado (según Mercado Pago / banco)</label>
                        <input
                            className="cc-input"
                            type="number" min="0" step="any" inputMode="decimal"
                            value={onlineInput}
                            onChange={e => setOnlineInput(e.target.value)}
                            placeholder={expOnline === 0 ? '0' : '¿Cuánto entró realmente?'}
                        />
                        {onlineFilled && (onlineInput.trim() !== '') && (
                            <div className={`cc-diff ${diffClass(diffOnline)}`}>{diffLabel(diffOnline)}: {signed(fmt, diffOnline)}</div>
                        )}
                    </div>

                    </div>

                    <div className="cc-total-block">
                        <div className="cc-count-title">Total (efectivo + online)</div>
                        <div className="cc-total-grid">
                            <div><span>Esperado total</span><b className="cc-green">{fmt(expTotal)}</b></div>
                            <div><span>Contado total</span><b>{anyTyped ? fmt(countedTotal) : '—'}</b></div>
                            <div className={anyTyped ? `cc-total-diff ${diffClass(diffTotal)}` : 'cc-total-diff'}>
                                <span>{anyTyped ? diffLabel(diffTotal) : 'Diferencia'}</span><b>{anyTyped ? signed(fmt, diffTotal) : '—'}</b>
                            </div>
                        </div>
                    </div>

                    <button type="submit" className="cc-confirm" disabled={!valid || saving}>
                        <FaCheckCircle /> {saving ? 'Cerrando...' : 'Cerrar caja'}
                    </button>
                    <p className="cc-hint">Los contadores vuelven a cero y la caja queda guardada en el historial con lo que contaste.</p>
                    <div className="cc-footer">
                        <button type="button" className="cc-cancel" onClick={onCancel} disabled={saving}><FaTimes /> Cancelar</button>
                    </div>
                </div>
            </form>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Modal: Resumen de una caja cerrada                                  */
/* ------------------------------------------------------------------ */

export function SessionSummaryModal({ session, fmt, onClose, onDetails }: {
    session: SessionView;
    fmt: Fmt;
    onClose: () => void;
    onDetails: () => void;
}) {
    const hasSnapshot = Array.isArray(session.movements);
    const summary = useMemo(() => (hasSnapshot ? summarizeMovements(session.movements!, { efectivo: session.stats.efectivoInicial || 0, online: session.stats.onlineInicial || 0 }) : null), [session, hasSnapshot]);
    const st = session.stats;

    const expEfectivo = st.efectivoEsperado ?? st.efectivo ?? 0;
    const expOnline = st.onlineEsperado ?? ((st.transferencia || 0) + (st.debito || 0) + (st.qr || 0));
    const hasCount = st.efectivoContado !== undefined && st.onlineContado !== undefined;
    const diffEfectivo = st.diferenciaEfectivo ?? 0;
    const diffOnline = st.diferenciaOnline ?? 0;

    return (
        <div className="cc-overlay" onClick={onClose}>
            <div className="cc-modal cc-modal-summary" onClick={e => e.stopPropagation()}>
                <div className="cc-banner">
                    <FaReceipt /> <h3>Cierre de caja N° {session.number}</h3>
                    <button type="button" className="cc-x" onClick={onClose}><FaTimes /></button>
                </div>
                <div className="cc-body">
                    <div className="cc-receipt-head">
                        <div>
                            <div className="cc-business">El Faro Panadería</div>
                            {session.closedByEmail && <div className="cc-meta">Cerrado por {session.closedByEmail}</div>}
                        </div>
                        <div className="cc-period">
                            <div><span>Desde</span> {session.periodStart ? fmtDateTime(session.periodStart) : 'Inicio del día'}</div>
                            <div><span>Hasta</span> {fmtDateTime(session.closedAt)}</div>
                        </div>
                    </div>

                    {summary && (
                        <>
                            <h4 className="cc-section">Ventas por medio de pago</h4>
                            {Object.keys(summary.byMethod).length === 0 ? (
                                <div className="cc-empty">Sin ventas en esta caja.</div>
                            ) : (
                                Object.entries(summary.byMethod).map(([method, amount]) => (
                                    <div key={method} className="cc-line"><span>{method}</span><b>{fmt(amount)}</b></div>
                                ))
                            )}
                        </>
                    )}

                    <h4 className="cc-section">Arqueo de efectivo</h4>
                    {summary && (
                        <>
                            <div className="cc-line"><span>Monto inicial</span><b>{fmt(summary.efectivo.inicial)}</b></div>
                            <div className="cc-line"><span>Ventas en efectivo</span><b>{fmt(summary.efectivo.ventas)}</b></div>
                            <div className="cc-line"><span>Ingresos</span><b>{fmt(summary.efectivo.ingresos)}</b></div>
                            <div className="cc-line"><span>Egresos</span><b>{fmt(summary.efectivo.egresos)}</b></div>
                        </>
                    )}
                    <div className="cc-line cc-strong"><span>Esperado en caja</span><b>{fmt(expEfectivo)}</b></div>
                    {hasCount ? (
                        <>
                            <div className="cc-line"><span>Efectivo contado</span><b>{fmt(st.efectivoContado!)}</b></div>
                            <div className={`cc-line cc-diff-line ${diffClass(diffEfectivo)}`}><span>Diferencia</span><b>{signed(fmt, diffEfectivo)}</b></div>
                        </>
                    ) : (
                        <div className="cc-empty">Esta caja se cerró sin arqueo.</div>
                    )}

                    <h4 className="cc-section">Arqueo online</h4>
                    {summary && (
                        <>
                            <div className="cc-line"><span>Monto inicial</span><b>{fmt(summary.online.inicial)}</b></div>
                            <div className="cc-line"><span>Ventas online</span><b>{fmt(summary.online.ventas)}</b></div>
                            <div className="cc-line"><span>Ingresos</span><b>{fmt(summary.online.ingresos)}</b></div>
                            <div className="cc-line"><span>Egresos</span><b>{fmt(summary.online.egresos)}</b></div>
                        </>
                    )}
                    <div className="cc-line cc-strong"><span>Esperado online</span><b>{fmt(expOnline)}</b></div>
                    {hasCount && (
                        <>
                            <div className="cc-line"><span>Online contado</span><b>{fmt(st.onlineContado!)}</b></div>
                            <div className={`cc-line cc-diff-line ${diffClass(diffOnline)}`}><span>Diferencia</span><b>{signed(fmt, diffOnline)}</b></div>
                        </>
                    )}

                    {hasCount && (
                        <>
                            <h4 className="cc-section">Total (efectivo + online)</h4>
                            <div className="cc-line"><span>Esperado total</span><b>{fmt(expEfectivo + expOnline)}</b></div>
                            <div className="cc-line"><span>Contado total</span><b>{fmt(st.efectivoContado! + st.onlineContado!)}</b></div>
                            <div className={`cc-line cc-diff-line ${diffClass(diffEfectivo + diffOnline)}`}><span>Diferencia total</span><b>{signed(fmt, diffEfectivo + diffOnline)}</b></div>
                        </>
                    )}

                    {summary && summary.manual.length > 0 && (
                        <>
                            <h4 className="cc-section">Movimientos manuales</h4>
                            {summary.manual.map((m, i) => (
                                <div key={i} className="cc-manual">
                                    <span className="cc-time">{fmtTime(m.time)}</span>
                                    <span className={`cc-tag ${m.type}`}>{m.type === 'ingreso' ? 'INGRESO' : 'EGRESO'}</span>
                                    <span className="cc-desc">{m.description || '—'} <em>({m.method === 'Efectivo' ? 'Efectivo' : 'Online'})</em></span>
                                    <b>{m.type === 'egreso' ? '-' : ''}{fmt(m.amount)}</b>
                                </div>
                            ))}
                        </>
                    )}

                    <div className="cc-footer cc-footer-split">
                        <button type="button" className="cc-details-btn" onClick={onDetails} disabled={!hasSnapshot} title={hasSnapshot ? '' : 'Esta caja es anterior y no guardó el detalle de movimientos'}>
                            <FaListUl /> Detalles
                        </button>
                        <button type="button" className="cc-cancel" onClick={onClose}>Salir</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Modal: Detalles de una caja cerrada                                 */
/* ------------------------------------------------------------------ */

type GroupBy = 'metodo' | 'hora';

export function SessionDetailsModal({ session, fmt, onClose }: {
    session: SessionView;
    fmt: Fmt;
    onClose: () => void;
}) {
    const [groupBy, setGroupBy] = useState<GroupBy>('metodo');
    const movs = useMemo(() => session.movements || [], [session.movements]);
    const summary = useMemo(() => summarizeMovements(movs), [movs]);

    const groupList = (type: SnapMovement['type']) => {
        const map = new Map<string, { name: string; amount: number; count: number; order: number }>();
        movs.filter(m => m.type === type).forEach(m => {
            const key = groupBy === 'metodo' ? m.method : fmtHour(hourOf(m.time));
            const cur = map.get(key) || { name: groupBy === 'hora' ? `${key} hs` : key, amount: 0, count: 0, order: groupBy === 'hora' ? hourOf(m.time) : 0 };
            cur.amount += m.amount;
            cur.count += 1;
            map.set(key, cur);
        });
        const list = Array.from(map.values());
        return groupBy === 'hora' ? list.sort((a, b) => a.order - b.order) : list.sort((a, b) => b.amount - a.amount);
    };

    const ventas = groupList('venta');
    const ingresos = groupList('ingreso');
    const egresos = groupList('egreso');

    const tiles: { icon: React.ReactNode; value: string; label: string; tone: string }[] = [
        { icon: <FaCashRegister />, value: fmt(summary.ventas), label: 'Ventas', tone: 'green' },
        { icon: <FaArrowDown />, value: fmt(summary.ingresos), label: 'Ingresos', tone: 'green' },
        { icon: <FaReceipt />, value: fmt(summary.ticketPromedio), label: 'Ticket promedio', tone: 'green' },
        { icon: <FaArrowUp />, value: fmt(summary.egresos), label: 'Egresos', tone: 'red' },
        { icon: <FaCashRegister />, value: String(summary.cantVentas), label: 'Cantidad ventas', tone: 'blue' },
        { icon: <FaArrowDown />, value: String(summary.cantIngresos), label: 'Cant. ingresos', tone: 'blue' },
        { icon: <FaClock />, value: summary.peakMoney ? `${fmtHour(summary.peakMoney.hour)} (${fmt(summary.peakMoney.amount)})` : '—', label: 'Hora pico dinero', tone: 'blue' },
        { icon: <FaClock />, value: summary.peakCount ? `${fmtHour(summary.peakCount.hour)} (${summary.peakCount.count} ventas)` : '—', label: 'Hora pico ventas', tone: 'blue' },
        { icon: <FaArrowUp />, value: String(summary.cantEgresos), label: 'Cant. egresos', tone: 'blue' },
    ];

    const renderColumn = (title: string, list: { name: string; amount: number; count: number }[], unit: string) => (
        <div className="cc-col">
            <div className="cc-col-title">{title}</div>
            <div className="cc-col-body">
                {list.length === 0 ? <div className="cc-empty">Sin datos</div> : list.map(g => (
                    <div key={g.name} className="cc-group">
                        <div className="cc-group-name">{g.name}</div>
                        <div className="cc-group-sub">{g.count} {unit} · {fmt(g.amount)}</div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="cc-overlay cc-overlay-top" onClick={onClose}>
            <div className="cc-modal cc-modal-details" onClick={e => e.stopPropagation()}>
                <div className="cc-banner">
                    <FaListUl /> <h3>Detalles · Caja N° {session.number} <small>({fmtDateTime(session.closedAt)})</small></h3>
                    <label className="cc-groupby">
                        Ver detalle por:
                        <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)}>
                            <option value="metodo">Método de pago</option>
                            <option value="hora">Hora</option>
                        </select>
                    </label>
                    <button type="button" className="cc-x" onClick={onClose}><FaTimes /></button>
                </div>
                <div className="cc-body">
                    <div className="cc-tiles">
                        {tiles.map(t => (
                            <div key={t.label} className={`cc-tile ${t.tone}`}>
                                <div className="cc-tile-top"><span className="cc-tile-icon">{t.icon}</span><span className="cc-tile-value">{t.value}</span></div>
                                <div className="cc-tile-label">{t.label}</div>
                            </div>
                        ))}
                    </div>
                    <div className="cc-cols">
                        {renderColumn('Detalles VENTAS', ventas, 'ventas')}
                        {renderColumn('Detalles INGRESOS', ingresos, 'ingresos')}
                        {renderColumn('Detalles EGRESOS', egresos, 'egresos')}
                    </div>
                    <div className="cc-footer cc-footer-end">
                        <button type="button" className="cc-cancel" onClick={onClose}>Salir</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
