import { useState, useEffect } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { FaPlus, FaTrash, FaSave, FaChartPie, FaEdit, FaTimes, FaExchangeAlt } from 'react-icons/fa';
import './CostManager.css'; // Reusing styles
import './CifManager.css';

// 'produccion': existe porque se elabora (gas, horno, panaderos) → se reparte en el costo de los productos.
// 'estructura': se paga aunque no se produzca (contador, internet, atención) → se cubre con el margen.
type CifItemType = 'produccion' | 'estructura';

interface CifItem {
    id?: string;
    name: string;
    price: number;
    lifeYears: number | null;
    isSalary?: boolean;
    type?: CifItemType; // Sin tipo = 'produccion' (ítems cargados antes de separar los gastos)
}

// Estado del formulario (alta y edición). `isMachine` decide si se piden años de vida.
interface CifItemForm {
    name: string;
    price: number;
    isMachine: boolean;
    lifeYears: number | null;
    isSalary: boolean;
    type: CifItemType;
}

const GROUPS: Record<CifItemType, { label: string; desc: string; css: string }> = {
    produccion: {
        label: 'Producción',
        desc: 'Existe porque se elabora (gas, luz del horno, máquinas, panaderos). Se suma al costo de los productos.',
        css: 'prod'
    },
    estructura: {
        label: 'Estructura',
        desc: 'Se paga aunque no se produzca (contador, internet, atención, publicidad). Se cubre con la ganancia.',
        css: 'est'
    }
};

const getItemType = (item: Partial<CifItem>): CifItemType => item.type || 'produccion';

// Máquinas: (Precio / Años) / 12 meses. Sin años de vida: pago mensual directo.
const getMonthlyCost = (item: CifItem): number =>
    item.lifeYears && item.lifeYears > 0 ? (item.price / item.lifeYears) / 12 : item.price;

const formatMoney = (value: number): string => `$${Math.round(value).toLocaleString('es-AR')}`;

const EMPTY_FORM: CifItemForm = { name: '', price: 0, isMachine: false, lifeYears: null, isSalary: false, type: 'produccion' };

const toForm = (item: CifItem): CifItemForm => ({
    name: item.name,
    price: item.price,
    isMachine: !!item.lifeYears && item.lifeYears > 0,
    lifeYears: item.lifeYears,
    isSalary: !!item.isSalary,
    type: getItemType(item)
});

const validateForm = (form: CifItemForm): string | null => {
    if (!form.name.trim() || form.price <= 0) return "El nombre y el monto son requeridos.";
    if (form.isMachine && !(form.lifeYears && form.lifeYears > 0)) return "Ingresá los años de vida útil de la máquina.";
    return null;
};

const toFirestore = (form: CifItemForm) => ({
    name: form.name.trim(),
    price: form.price,
    lifeYears: form.isMachine && form.lifeYears && form.lifeYears > 0 ? form.lifeYears : null,
    isSalary: form.isSalary,
    type: form.type
});

export default function CifManager() {
    const [cifItems, setCifItems] = useState<CifItem[]>([]);
    const [monthlyUnits, setMonthlyUnits] = useState<number>(0);
    const [cifUnitCost, setCifUnitCost] = useState<number>(0);

    const [newItem, setNewItem] = useState<CifItemForm>(EMPTY_FORM);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editItemData, setEditItemData] = useState<CifItemForm>(EMPTY_FORM);

    useEffect(() => {
        const unsubItems = onSnapshot(collection(db, 'cif_items'), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CifItem));
            setCifItems(data);
        });

        const unsubConfig = onSnapshot(doc(db, 'config', 'cif_settings'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setMonthlyUnits(data.monthlyUnits || 0);
                setCifUnitCost(data.cifUnitCost || 0);
            }
        });

        return () => {
            unsubItems();
            unsubConfig();
        };
    }, []);

    // Calculate aggregated metrics
    const itemsByGroup = (type: CifItemType) => cifItems
        .filter(item => getItemType(item) === type)
        .sort((a, b) => getMonthlyCost(b) - getMonthlyCost(a));
    const sumMonthly = (items: CifItem[]) => items.reduce((acc, item) => acc + getMonthlyCost(item), 0);

    const productionItems = itemsByGroup('produccion');
    const structureItems = itemsByGroup('estructura');
    const productionMonthlyCost = sumMonthly(productionItems);
    const structureMonthlyCost = sumMonthly(structureItems);
    const totalMonthlyCost = productionMonthlyCost + structureMonthlyCost;

    // Sólo los gastos de producción se reparten en el costo de los productos.
    const currentCalculatedCifUnitCost = monthlyUnits > 0 ? (productionMonthlyCost / monthlyUnits) : 0;

    // Actualiza y guarda en Firestore si detecta cambios entre el total calculado y el guardado.
    useEffect(() => {
        const saveUpdatedCif = async () => {
            if (Math.abs(currentCalculatedCifUnitCost - cifUnitCost) > 0.01) {
                try {
                    await setDoc(doc(db, 'config', 'cif_settings'), {
                        monthlyUnits,
                        cifUnitCost: currentCalculatedCifUnitCost
                    }, { merge: true });
                } catch (err) {
                    console.error("Error saving CIF settings auto", err);
                }
            }
        };

        const timeout = setTimeout(saveUpdatedCif, 1000); // debounce of 1s
        return () => clearTimeout(timeout);
    }, [productionMonthlyCost, monthlyUnits, cifUnitCost, currentCalculatedCifUnitCost]);

    const handleSaveConfig = async () => {
        setIsSavingConfig(true);
        try {
            await setDoc(doc(db, 'config', 'cif_settings'), {
                monthlyUnits,
                cifUnitCost: currentCalculatedCifUnitCost
            }, { merge: true });
            alert("Configuración de unidades guardada exitosamente.");
        } catch (error) {
            console.error("Error al guardar cif_settings:", error);
            alert("Error al guardar configuración.");
        } finally {
            setIsSavingConfig(false);
        }
    };

    const handleAddItem = async () => {
        const error = validateForm(newItem);
        if (error) return alert(error);
        try {
            await addDoc(collection(db, 'cif_items'), toFirestore(newItem));
            // Mantiene el grupo elegido para cargar varios gastos seguidos del mismo tipo.
            setNewItem({ ...EMPTY_FORM, type: newItem.type });
        } catch (error) {
            console.error(error);
            alert("Error al añadir el gasto.");
        }
    };

    const handleUpdateItem = async () => {
        if (!editingItemId) return;
        const error = validateForm(editItemData);
        if (error) return alert(error);
        try {
            await updateDoc(doc(db, 'cif_items', editingItemId), toFirestore(editItemData));
            setEditingItemId(null);
        } catch (error) {
            console.error(error);
            alert("Error al actualizar el gasto.");
        }
    };

    const handleMoveItem = async (item: CifItem) => {
        const target: CifItemType = getItemType(item) === 'produccion' ? 'estructura' : 'produccion';
        try {
            await updateDoc(doc(db, 'cif_items', item.id!), { type: target });
        } catch (error) {
            console.error(error);
            alert("Error al mover el gasto.");
        }
    };

    const handleDeleteItem = async (id: string) => {
        if (confirm("¿Estás seguro de eliminar este gasto? Si es de producción, alterará el costo de los productos.")) {
            await deleteDoc(doc(db, 'cif_items', id));
        }
    };

    const renderForm = (
        form: CifItemForm,
        setForm: (form: CifItemForm) => void,
        options: { editing: boolean; onSubmit: () => void; onCancel?: () => void }
    ) => (
        <div className={`gf-form ${options.editing ? 'editing' : ''}`}>
            {!options.editing && <div className="gf-form-title">Agregar gasto</div>}
            <div className="gf-form-grid">
                <label className="gf-field">
                    <span>Concepto</span>
                    <input
                        type="text"
                        placeholder="Ej. Sobadora / Gas / Contador"
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                    />
                </label>
                <label className="gf-field">
                    <span>{form.isMachine ? 'Precio de compra' : 'Monto mensual'}</span>
                    <div className="gf-money">
                        <span>$</span>
                        <input
                            type="number"
                            min={0}
                            value={form.price || ''}
                            onChange={e => setForm({ ...form, price: Number(e.target.value) })}
                        />
                    </div>
                </label>
                <div className="gf-field">
                    <span>Grupo</span>
                    <div className="gf-segmented">
                        {(Object.keys(GROUPS) as CifItemType[]).map(type => (
                            <button
                                key={type}
                                type="button"
                                className={`${GROUPS[type].css} ${form.type === type ? 'active' : ''}`}
                                onClick={() => setForm({ ...form, type })}
                            >
                                {GROUPS[type].label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="gf-field">
                    <span>¿Cómo se paga?</span>
                    <div className="gf-segmented">
                        <button type="button" className={!form.isMachine ? 'active' : ''} onClick={() => setForm({ ...form, isMachine: false })}>
                            Mensual
                        </button>
                        <button type="button" className={form.isMachine ? 'active' : ''} onClick={() => setForm({ ...form, isMachine: true })}>
                            Máquina / equipo
                        </button>
                    </div>
                </div>
            </div>
            <div className="gf-form-row2">
                {form.isMachine && (
                    <label className="gf-field gf-years">
                        <span>Años de vida útil</span>
                        <input
                            type="number"
                            min={1}
                            value={form.lifeYears || ''}
                            onChange={e => setForm({ ...form, lifeYears: Number(e.target.value) || null })}
                        />
                    </label>
                )}
                {form.isMachine && form.price > 0 && form.lifeYears ? (
                    <div className="gf-check" style={{ cursor: 'default' }}>
                        = {formatMoney(form.price / form.lifeYears / 12)} / mes
                    </div>
                ) : null}
                <label className="gf-check" title="Los sueldos no se cuentan en el fondo de reserva de Empleados">
                    <input
                        type="checkbox"
                        checked={form.isSalary}
                        onChange={e => setForm({ ...form, isSalary: e.target.checked })}
                    />
                    Es sueldo
                </label>
                <div className="gf-form-actions">
                    {options.onCancel && (
                        <button type="button" className="gf-btn-secondary" onClick={options.onCancel}>
                            <FaTimes /> Cancelar
                        </button>
                    )}
                    <button type="button" className="cm-btn-primary" onClick={options.onSubmit}>
                        {options.editing ? <><FaSave /> Guardar</> : <><FaPlus /> Añadir</>}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderGroup = (type: CifItemType, items: CifItem[], groupTotal: number) => {
        const group = GROUPS[type];
        const otherGroup = GROUPS[type === 'produccion' ? 'estructura' : 'produccion'];

        return (
            <section className={`gf-section ${group.css}`}>
                <div className="gf-section-header">
                    <div>
                        <div className="gf-section-title">{group.label} · {items.length} {items.length === 1 ? 'gasto' : 'gastos'}</div>
                        <div className="gf-section-desc">{group.desc}</div>
                    </div>
                    <div className="gf-section-total">
                        {formatMoney(groupTotal)} / mes
                        <small>{formatMoney(groupTotal / 30)} por día</small>
                    </div>
                </div>

                {items.length === 0 ? (
                    <div className="gf-empty">No hay gastos de {group.label.toLowerCase()} cargados.</div>
                ) : (
                    <>
                        <div className="gf-list-head">
                            <div>Concepto</div>
                            <div>Mensual</div>
                            <div>Diario</div>
                            <div>% del grupo</div>
                            <div />
                        </div>
                        {items.map(item => {
                            if (editingItemId === item.id) {
                                return (
                                    <div key={item.id} className="gf-edit-wrap">
                                        {renderForm(editItemData, setEditItemData, {
                                            editing: true,
                                            onSubmit: handleUpdateItem,
                                            onCancel: () => setEditingItemId(null)
                                        })}
                                    </div>
                                );
                            }

                            const monthly = getMonthlyCost(item);
                            const share = groupTotal > 0 ? (monthly / groupTotal) * 100 : 0;

                            return (
                                <div key={item.id} className="gf-row">
                                    <div className="gf-cell-name">
                                        <div className="gf-name">{item.name}</div>
                                        {(item.lifeYears || item.isSalary) && (
                                            <div className="gf-tags">
                                                {item.lifeYears ? (
                                                    <span className="gf-tag">Máquina · {formatMoney(item.price)} · {item.lifeYears} años</span>
                                                ) : null}
                                                {item.isSalary && <span className="gf-tag salary">Sueldo</span>}
                                            </div>
                                        )}
                                    </div>
                                    <div className="gf-amount">{formatMoney(monthly)}</div>
                                    <div className="gf-daily">{formatMoney(monthly / 30)}</div>
                                    <div className="gf-share">
                                        <div className="gf-share-bar"><div style={{ width: `${share}%` }} /></div>
                                        <span>{share.toFixed(0)}%</span>
                                    </div>
                                    <div className="gf-actions">
                                        <button className="cm-icon-btn move" title={`Mover a ${otherGroup.label}`} onClick={() => handleMoveItem(item)}><FaExchangeAlt /></button>
                                        <button className="cm-icon-btn edit" title="Editar" onClick={() => { setEditingItemId(item.id!); setEditItemData(toForm(item)); }}><FaEdit /></button>
                                        <button className="cm-icon-btn delete" title="Eliminar" onClick={() => handleDeleteItem(item.id!)}><FaTrash /></button>
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </section>
        );
    };

    return (
        <div className="cm-tab-content gf-container">
            <div>
                <h3>Gastos Fijos</h3>
                <p className="gf-intro">
                    Los gastos de <strong>Producción</strong> se reparten en el costo de cada producto; los de <strong>Estructura</strong> los tiene que cubrir la ganancia de las ventas.
                </p>
            </div>

            <div className="gf-summary">
                <div className="gf-stat prod">
                    <div className="gf-stat-label">Producción</div>
                    <div className="gf-stat-value">{formatMoney(productionMonthlyCost)}</div>
                    <div className="gf-stat-sub">por mes · va al costo</div>
                </div>
                <div className="gf-stat est">
                    <div className="gf-stat-label">Estructura</div>
                    <div className="gf-stat-value">{formatMoney(structureMonthlyCost)}</div>
                    <div className="gf-stat-sub">por mes · {formatMoney(structureMonthlyCost / 30)} por día</div>
                </div>
                <div className="gf-stat">
                    <div className="gf-stat-label">Total gastos fijos</div>
                    <div className="gf-stat-value">{formatMoney(totalMonthlyCost)}</div>
                    <div className="gf-stat-sub">por mes · {cifItems.length} gastos</div>
                </div>
                <div className="gf-stat cif">
                    <div className="gf-stat-label">Costo CIF cada 100 g</div>
                    <div className="gf-stat-value">${currentCalculatedCifUnitCost.toFixed(2)}</div>
                    <div className="gf-stat-sub">se suma en Recetas</div>
                </div>
            </div>

            {renderForm(newItem, setNewItem, { editing: false, onSubmit: handleAddItem })}

            {renderGroup('produccion', productionItems, productionMonthlyCost)}
            {renderGroup('estructura', structureItems, structureMonthlyCost)}

            {/* PANEL DE CÁLCULO DE UNIDADES CIF (sólo gastos de producción) */}
            <div className="gf-cif-panel">
                <div>
                    <h4><FaChartPie /> Reparto de Producción en los productos (CIF)</h4>
                    <p>
                        Indicá cuántas unidades de 100 g producís o vendés por mes. Los gastos de Producción se dividen
                        por esa cantidad y el resultado se suma como costo fijo en cada receta.
                    </p>
                    <div className="gf-cif-input">
                        <label className="gf-field">
                            <span>Productos mensuales (unidades de 100 g)</span>
                            <input
                                type="number"
                                value={monthlyUnits}
                                onChange={e => setMonthlyUnits(Number(e.target.value))}
                            />
                        </label>
                        <button className="cm-btn-primary" onClick={handleSaveConfig} disabled={isSavingConfig}>
                            <FaSave /> {isSavingConfig ? 'Guardando...' : 'Fijar Unidades'}
                        </button>
                    </div>
                </div>
                <div className="gf-cif-result">
                    <span>Costo de producción cada 100 g</span>
                    <strong>${currentCalculatedCifUnitCost.toFixed(2)}</strong>
                    <small>{formatMoney(productionMonthlyCost)} ÷ {monthlyUnits.toLocaleString('es-AR')} unidades</small>
                </div>
            </div>
        </div>
    );
}
