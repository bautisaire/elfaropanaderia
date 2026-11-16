// Exportación de registros del panel a un .xlsx con una pestaña por tipo de dato.
// exceljs se importa dinámicamente para que (≈1MB) solo se descargue al exportar.
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import { DEFAULT_EXPENSE_CATEGORIES } from '../hooks/useExpenseCategories';
import type { Worksheet } from 'exceljs';

// Los documentos de Firestore llegan sin tipar y con formatos históricos distintos.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDoc = Record<string, any> & { id: string };
type DatedDoc = AnyDoc & { _date: Date | null };

const withDate = (list: AnyDoc[], field: string): DatedDoc[] =>
    list.map(d => Object.assign({}, d, { _date: parseDate(d[field]) }));

export interface ExcelExportOptions {
    /** Filtra los registros con fecha (ventas, caja, gastos, movimientos). null = todo el historial. */
    inRange: ((d: Date) => boolean) | null;
    /** Texto del período, va en el nombre del archivo y en la pestaña "Info". */
    periodLabel: string;
}

type ColType = 'text' | 'money' | 'number' | 'date' | 'datetime' | 'time';

interface Col {
    header: string;
    width: number;
    type?: ColType;
    /** Suma la columna en la fila de totales (respeta los filtros de Excel). */
    total?: boolean;
}

const POS_SOURCES = ['pos', 'pos_public', 'pos_wholesale'];
const AR_OFFSET_MS = 3 * 60 * 60 * 1000; // Argentina: UTC-3 sin horario de verano

// exceljs escribe las fechas en UTC; se corren 3h para que Excel muestre la hora de Argentina.
const toExcelDate = (d: Date) => new Date(d.getTime() - AR_OFFSET_MS);

const parseDate = (v: any): Date | null => {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const normalizeText = (v: unknown) =>
    String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const normalizePhone = (raw: unknown): string => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
};

const isShippingItem = (item: any) =>
    item?.id === 'shipping-cost' || normalizeText(item?.name).includes('envio');

// Misma regla que Dashboard/OrdersManager para separar retiro de envío.
const orderIsPickup = (o: any): boolean => {
    if (o.source === 'pos_public' || o.source === 'pos_wholesale' || o.source === 'pos') return true;
    if (o.source === 'pos_delivery') return false;
    const metodo = o.cliente?.metodoEntrega;
    if (metodo === 'pickup') return true;
    if (metodo === 'delivery') return false;
    return normalizeText(o.cliente?.direccion).includes('retiro') || normalizeText(o.cliente?.indicaciones).includes('retiro');
};

const originLabel = (o: any) => {
    switch (o.source) {
        case 'pos_wholesale': return 'Despensa';
        case 'pos_public':
        case 'pos': return 'Público (local)';
        case 'pos_delivery': return 'Delivery (local)';
        default: return orderIsPickup(o) ? 'Online - Retiro' : 'Online - Envío';
    }
};

const STATUS_LABELS: Record<string, string> = {
    pendiente: 'Pendiente',
    preparando: 'Preparando',
    enviado: 'Enviado',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
    pending_payment: 'Pago pendiente',
};

const paymentsText = (o: any) => {
    if (Array.isArray(o.payments) && o.payments.length > 0) {
        return o.payments.map((p: any) => `${p.method}: $${Math.round(num(p.amount)).toLocaleString('es-AR')}`).join(' + ');
    }
    return o.cliente?.metodoPago || '';
};

/** Resuelve el id del producto base de un ítem de pedido (variantes guardadas como "id-Variante"). */
const getBaseId = (item: any): string => {
    if (item.baseProductId) return String(item.baseProductId);
    if (item.productId) return String(item.productId);
    const id = String(item.id ?? '');
    let variant = item.variant;
    if (!variant) {
        const m = item.name ? String(item.name).match(/\(([^)]+)\)$/) : null;
        if (m) variant = m[1];
    }
    if (variant) {
        const suffix = `-${variant}`;
        if (id.endsWith(suffix)) return id.slice(0, -suffix.length);
    }
    return id;
};

const getVariantName = (item: any): string => {
    if (item.variant) return String(item.variant);
    const m = item.name ? String(item.name).match(/\(([^)]+)\)$/) : null;
    return m ? m[1] : '';
};

const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_');

async function fetchAll(name: string): Promise<AnyDoc[]> {
    try {
        const snap = await getDocs(collection(db, name));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        // Sin permiso o colección inexistente: la pestaña queda vacía en vez de cortar la exportación.
        console.error(`Exportar Excel: no se pudo leer "${name}"`, e);
        return [];
    }
}

function addSheet(
    wb: import('exceljs').Workbook,
    name: string,
    cols: Col[],
    rows: unknown[][],
    color: string,
): Worksheet {
    const ws = wb.addWorksheet(name, {
        views: [{ state: 'frozen', ySplit: 1 }],
        properties: { tabColor: { argb: `FF${color}` } },
    });
    ws.columns = cols.map(c => ({ header: c.header, width: c.width }));

    const header = ws.getRow(1);
    header.height = 22;
    header.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    rows.forEach(r => ws.addRow(r));

    cols.forEach((c, i) => {
        const col = ws.getColumn(i + 1);
        if (c.type === 'money') col.numFmt = '"$"#,##0.00';
        else if (c.type === 'number') col.numFmt = '#,##0.###';
        else if (c.type === 'date') col.numFmt = 'dd/mm/yyyy';
        else if (c.type === 'datetime') col.numFmt = 'dd/mm/yyyy hh:mm';
        else if (c.type === 'time') col.numFmt = 'hh:mm';
    });

    if (rows.length > 0) {
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
        if (cols.some(c => c.total)) {
            const lastData = rows.length + 1;
            const totalRow = ws.addRow([]);
            totalRow.getCell(1).value = 'TOTAL';
            cols.forEach((c, i) => {
                if (!c.total) return;
                const letter = ws.getColumn(i + 1).letter;
                // SUBTOTAL(109) suma solo las filas visibles: los totales siguen a los filtros.
                totalRow.getCell(i + 1).value = { formula: `SUBTOTAL(109,${letter}2:${letter}${lastData})` };
            });
            totalRow.font = { bold: true };
            totalRow.eachCell({ includeEmpty: true }, cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
                cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } };
            });
        }
    } else {
        ws.addRow(['Sin registros']).font = { italic: true, color: { argb: 'FF64748B' } };
    }
    return ws;
}

export async function exportRecordsToExcel({ inRange, periodLabel }: ExcelExportOptions): Promise<void> {
    const [ExcelJSModule, orders, products, expenses, expenseCats, cajaMoves, cajaSessions, stockMoves, rawMaterials] = await Promise.all([
        import('exceljs'),
        fetchAll('orders'),
        fetchAll('products'),
        fetchAll('expenses'),
        fetchAll('expense_categories'),
        fetchAll('caja_movements'),
        fetchAll('caja_sessions'),
        fetchAll('stock_movements'),
        fetchAll('raw_materials'),
    ]);
    const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;

    const within = (d: Date | null) => !!d && (!inRange || inRange(d));
    const byDateDesc = (a: DatedDoc, b: DatedDoc) => (b._date?.getTime() ?? 0) - (a._date?.getTime() ?? 0);

    const productsById = new Map(products.map(p => [p.id, p]));
    const productName = (id: string) => productsById.get(id)?.nombre;

    // ---------- Ventas ----------
    const sales = withDate(orders, 'date')
        .filter(o => o.status !== 'cancelado' && o.isTestOrder !== true && within(o._date))
        .sort(byDateDesc);

    const salesRows = sales.map(o => {
        const items: any[] = Array.isArray(o.items) ? o.items : [];
        const shipping = items.filter(isShippingItem).reduce((s, it) => s + num(it.price) * (num(it.quantity) || 1), 0);
        const productItems = items.filter(it => !isShippingItem(it));
        const d = toExcelDate(o._date as Date);
        return [
            d,
            d,
            o.id,
            originLabel(o),
            STATUS_LABELS[o.status] || o.status || 'Pendiente',
            o.cliente?.nombre || '',
            o.cliente?.telefono || '',
            o.cliente?.direccion || '',
            paymentsText(o),
            o.subtotal !== undefined ? num(o.subtotal) : null,
            num(o.discountAmount) || null,
            shipping || null,
            num(o.total),
            productItems.reduce((s, it) => s + num(it.quantity), 0),
            productItems.map(it => `${num(it.quantity)} x ${it.name}`).join(', '),
        ];
    });

    // ---------- Ventas por producto ----------
    const productSales = new Map<string, { name: string; variant: string; category: string; qty: number; total: number; orders: Set<string> }>();
    sales.forEach(o => {
        (Array.isArray(o.items) ? o.items : []).forEach((it: any) => {
            if (isShippingItem(it)) return;
            const baseId = getBaseId(it);
            const prod = productsById.get(baseId);
            const variant = getVariantName(it);
            const key = `${baseId}||${variant}`;
            const name = prod?.nombre || String(it.name || '').replace(/\s*\([^)]*\)$/, '') || 'Sin nombre';
            const entry = productSales.get(key) ?? { name, variant, category: prod?.categoria || '', qty: 0, total: 0, orders: new Set<string>() };
            entry.qty += num(it.quantity);
            entry.total += num(it.quantity) * num(it.price);
            entry.orders.add(o.id);
            productSales.set(key, entry);
        });
    });
    const productSalesRows = [...productSales.values()]
        .sort((a, b) => b.total - a.total)
        .map(p => [p.name, p.variant, p.category, p.qty, p.total, p.qty > 0 ? p.total / p.qty : 0, p.orders.size]);

    // ---------- Caja ----------
    const CAJA_TYPES: Record<string, string> = { venta: 'Venta', ingreso: 'Ingreso', egreso: 'Egreso' };
    const cajaRows = withDate(cajaMoves, 'date')
        .filter(m => within(m._date))
        .sort(byDateDesc)
        .map(m => {
            const d = toExcelDate(m._date as Date);
            const amount = num(m.amount);
            return [
                d,
                d,
                CAJA_TYPES[m.type] || m.type || '',
                m.paymentMethod || '',
                m.type === 'egreso' ? -amount : amount,
                m.description || '',
                m.orderId || '',
                m.createdByEmail || '',
            ];
        });

    const cierresRows = withDate(cajaSessions, 'closedAt')
        .filter(s => within(s._date))
        .sort(byDateDesc)
        .map(s => {
            const st = s.stats || {};
            const start = parseDate(s.periodStart);
            return [
                toExcelDate(s._date as Date),
                start ? toExcelDate(start) : null,
                num(st.ventas),
                num(st.ingresos),
                num(st.egresos),
                num(st.efectivo),
                num(st.transferencia),
                num(st.debito),
                num(st.qr),
                num(st.enCaja),
                num(st.cantidad),
                s.closedByEmail || '',
            ];
        });

    // ---------- Gastos ----------
    const catLabels = new Map<string, string>(DEFAULT_EXPENSE_CATEGORIES.map(c => [c.key, c.label]));
    expenseCats.forEach(c => { if (c.label) catLabels.set(c.id, c.label); });
    const expenseRows = withDate(expenses, 'date')
        .filter(e => within(e._date))
        .sort(byDateDesc)
        .map(e => {
            const items: any[] = Array.isArray(e.items) ? e.items : [];
            return [
                toExcelDate(e._date as Date),
                catLabels.get(e.type) || e.type || '',
                e.description || '',
                items.map(it => `${num(it.quantity)} ${it.unit || ''} ${it.name || ''}`.replace(/\s+/g, ' ').trim()).join(', '),
                num(e.totalAmount),
                e.createdByEmail || '',
            ];
        });

    // ---------- Stock (actual, no depende del período) ----------
    const sortedProducts = [...products].sort((a, b) =>
        String(a.categoria || '').localeCompare(String(b.categoria || ''), 'es') || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
    const stockRows: unknown[][] = [];
    sortedProducts.forEach(p => {
        const unit = p.unitType === 'weight' ? 'kg' : 'u';
        const dep = p.stockDependency?.productId
            ? `${productName(p.stockDependency.productId) || p.stockDependency.productId} (x${num(p.stockDependency.unitsToDeduct) || 1})`
            : '';
        if (Array.isArray(p.variants) && p.variants.length > 0) {
            p.variants.forEach((v: any) => {
                stockRows.push([p.nombre || '', v.name || '', p.categoria || '', num(v.stockQuantity), unit, v.stock === false ? 'No' : 'Sí', dep]);
            });
        } else {
            stockRows.push([p.nombre || '', '', p.categoria || '', num(p.stockQuantity), unit, p.stock === false ? 'No' : 'Sí', dep]);
        }
    });

    const stockMoveRows = withDate(stockMoves, 'date')
        .filter(m => within(m._date))
        .sort(byDateDesc)
        .map(m => {
            const d = toExcelDate(m._date as Date);
            const qty = num(m.quantity);
            return [
                d,
                d,
                m.productName || productName(m.productId) || m.productId || '',
                m.type === 'OUT' ? 'Salida' : 'Entrada',
                m.type === 'OUT' ? -qty : qty,
                m.reason || '',
                m.observation || '',
                m.stockAfter !== undefined ? num(m.stockAfter) : null,
            ];
        });

    const rawRows = [...rawMaterials]
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'))
        .map(r => [
            r.name || '',
            r.category || '',
            r.stockQuantity !== undefined ? num(r.stockQuantity) : null,
            r.unit || '',
            num(r.baseQuantity) || null,
            r.netPrice !== undefined ? num(r.netPrice) : null,
            num(r.price),
        ]);

    // ---------- Clientes (pedidos online del período, agrupados por teléfono) ----------
    const customers = new Map<string, { name: string; phone: string; address: string; orders: number; total: number; first: Date; last: Date }>();
    sales.forEach(o => {
        if (o.source && POS_SOURCES.includes(o.source)) return;
        const phone = normalizePhone(o.cliente?.telefono);
        if (phone.length < 6) return;
        const d = o._date as Date;
        const name = String(o.cliente?.nombre || '').trim();
        const address = orderIsPickup(o) ? '' : String(o.cliente?.direccion || '').trim();
        const c = customers.get(phone);
        if (!c) {
            customers.set(phone, { name: name || 'Sin nombre', phone, address, orders: 1, total: num(o.total), first: d, last: d });
        } else {
            c.orders += 1;
            c.total += num(o.total);
            if (d < c.first) c.first = d;
            if (d >= c.last) {
                c.last = d;
                if (name) c.name = name;
                if (address) c.address = address;
            }
        }
    });
    const customerRows = [...customers.values()]
        .sort((a, b) => b.total - a.total)
        .map(c => [c.name, c.phone, c.address, c.orders, c.total, c.orders ? c.total / c.orders : 0, toExcelDate(c.first), toExcelDate(c.last)]);

    // ---------- Productos ----------
    const productRows = sortedProducts.map(p => {
        const variants = Array.isArray(p.variants) ? p.variants : [];
        const stock = variants.length > 0 ? variants.reduce((s: number, v: any) => s + num(v.stockQuantity), 0) : num(p.stockQuantity);
        return [
            p.shortId || '',
            p.nombre || '',
            p.categoria || '',
            num(p.precio),
            p.wholesalePrice !== undefined ? num(p.wholesalePrice) : null,
            num(p.discount) || null,
            p.unitType === 'weight' ? 'Por peso (kg)' : 'Por unidad',
            variants.map((v: any) => v.name).join(', '),
            stock,
            p.isVisible === false ? 'No' : 'Sí',
            p.id,
        ];
    });

    // ---------- Armado del libro ----------
    const wb = new ExcelJS.Workbook();
    wb.creator = 'El Faro Panadería';
    wb.created = new Date();

    addSheet(wb, 'Ventas', [
        { header: 'Fecha', width: 12, type: 'date' },
        { header: 'Hora', width: 8, type: 'time' },
        { header: 'Pedido', width: 22 },
        { header: 'Origen', width: 17 },
        { header: 'Estado', width: 13 },
        { header: 'Cliente', width: 22 },
        { header: 'Teléfono', width: 15 },
        { header: 'Dirección', width: 28 },
        { header: 'Pago', width: 26 },
        { header: 'Subtotal', width: 13, type: 'money', total: true },
        { header: 'Descuento', width: 12, type: 'money', total: true },
        { header: 'Envío', width: 11, type: 'money', total: true },
        { header: 'Total', width: 14, type: 'money', total: true },
        { header: 'Unidades', width: 10, type: 'number', total: true },
        { header: 'Productos', width: 60 },
    ], salesRows, '10B981');

    addSheet(wb, 'Ventas por producto', [
        { header: 'Producto', width: 32 },
        { header: 'Variante', width: 18 },
        { header: 'Categoría', width: 18 },
        { header: 'Cantidad vendida', width: 16, type: 'number', total: true },
        { header: 'Total vendido', width: 15, type: 'money', total: true },
        { header: 'Precio promedio', width: 15, type: 'money' },
        { header: 'Pedidos', width: 10, type: 'number' },
    ], productSalesRows, '3B82F6');

    addSheet(wb, 'Caja', [
        { header: 'Fecha', width: 12, type: 'date' },
        { header: 'Hora', width: 8, type: 'time' },
        { header: 'Tipo', width: 10 },
        { header: 'Medio de pago', width: 16 },
        { header: 'Monto', width: 14, type: 'money', total: true },
        { header: 'Descripción', width: 32 },
        { header: 'Pedido', width: 22 },
        { header: 'Usuario', width: 28 },
    ], cajaRows, '8B5CF6');

    addSheet(wb, 'Cierres de caja', [
        { header: 'Cierre', width: 17, type: 'datetime' },
        { header: 'Desde', width: 17, type: 'datetime' },
        { header: 'Ventas', width: 14, type: 'money', total: true },
        { header: 'Ingresos', width: 13, type: 'money', total: true },
        { header: 'Egresos', width: 13, type: 'money', total: true },
        { header: 'Efectivo', width: 13, type: 'money', total: true },
        { header: 'Transferencia', width: 14, type: 'money', total: true },
        { header: 'Débito', width: 13, type: 'money', total: true },
        { header: 'QR', width: 12, type: 'money', total: true },
        { header: 'En caja', width: 13, type: 'money' },
        { header: 'Operaciones', width: 12, type: 'number', total: true },
        { header: 'Cerrado por', width: 28 },
    ], cierresRows, 'A78BFA');

    addSheet(wb, 'Gastos', [
        { header: 'Fecha', width: 17, type: 'datetime' },
        { header: 'Categoría', width: 16 },
        { header: 'Descripción', width: 30 },
        { header: 'Detalle', width: 60 },
        { header: 'Monto', width: 14, type: 'money', total: true },
        { header: 'Registrado por', width: 28 },
    ], expenseRows, 'DC2626');

    addSheet(wb, 'Stock', [
        { header: 'Producto', width: 32 },
        { header: 'Variante', width: 18 },
        { header: 'Categoría', width: 18 },
        { header: 'Stock actual', width: 13, type: 'number' },
        { header: 'Unidad', width: 8 },
        { header: 'Disponible', width: 11 },
        { header: 'Stock derivado de', width: 28 },
    ], stockRows, 'EAB308');

    addSheet(wb, 'Movimientos de stock', [
        { header: 'Fecha', width: 12, type: 'date' },
        { header: 'Hora', width: 8, type: 'time' },
        { header: 'Producto', width: 32 },
        { header: 'Tipo', width: 10 },
        { header: 'Cantidad', width: 11, type: 'number' },
        { header: 'Motivo', width: 22 },
        { header: 'Observación', width: 34 },
        { header: 'Stock resultante', width: 15, type: 'number' },
    ], stockMoveRows, 'CA8A04');

    addSheet(wb, 'Materias primas', [
        { header: 'Materia prima', width: 30 },
        { header: 'Categoría', width: 16 },
        { header: 'Stock', width: 11, type: 'number' },
        { header: 'Unidad', width: 8 },
        { header: 'Presentación', width: 13, type: 'number' },
        { header: 'Precio neto', width: 13, type: 'money' },
        { header: 'Costo final', width: 13, type: 'money' },
    ], rawRows, 'F59E0B');

    addSheet(wb, 'Clientes', [
        { header: 'Nombre', width: 26 },
        { header: 'Teléfono', width: 14 },
        { header: 'Última dirección', width: 32 },
        { header: 'Pedidos', width: 10, type: 'number', total: true },
        { header: 'Total gastado', width: 15, type: 'money', total: true },
        { header: 'Ticket promedio', width: 15, type: 'money' },
        { header: 'Primer pedido', width: 14, type: 'date' },
        { header: 'Último pedido', width: 14, type: 'date' },
    ], customerRows, 'EC4899');

    addSheet(wb, 'Productos', [
        { header: 'Código', width: 10 },
        { header: 'Producto', width: 32 },
        { header: 'Categoría', width: 18 },
        { header: 'Precio', width: 13, type: 'money' },
        { header: 'Precio mayorista', width: 15, type: 'money' },
        { header: 'Descuento %', width: 12, type: 'number' },
        { header: 'Tipo', width: 14 },
        { header: 'Variantes', width: 30 },
        { header: 'Stock', width: 10, type: 'number' },
        { header: 'Visible', width: 9 },
        { header: 'ID', width: 24 },
    ], productRows, 'F97316');

    const info = wb.addWorksheet('Info', { properties: { tabColor: { argb: 'FF64748B' } } });
    info.columns = [{ width: 26 }, { width: 60 }];
    [
        ['El Faro Panadería — Exportación'],
        [],
        ['Período', periodLabel],
        ['Generado', toExcelDate(new Date())],
        [],
        ['Ventas', 'Pedidos del período sin cancelados ni pedidos de prueba.'],
        ['Ventas por producto', 'Unidades y montos por producto/variante (sin envíos).'],
        ['Clientes', 'Pedidos online del período agrupados por teléfono.'],
        ['Stock / Productos / Materias primas', 'Valores actuales al momento de exportar.'],
        ['Totales', 'La fila TOTAL suma solo las filas visibles al filtrar.'],
    ].forEach(r => info.addRow(r));
    info.getCell('A1').font = { bold: true, size: 14 };
    info.getCell('B4').numFmt = 'dd/mm/yyyy hh:mm';
    info.getColumn(1).font = { bold: true };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date(Date.now() - AR_OFFSET_MS).toISOString().slice(0, 10);
    a.href = url;
    a.download = `ElFaro_registros_${fileSafe(periodLabel)}_${today}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
