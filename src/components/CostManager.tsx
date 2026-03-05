import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { FaPlus, FaEdit, FaTrash, FaCalculator, FaList, FaChartLine, FaSave, FaTimes, FaBoxOpen } from 'react-icons/fa';
import './CostManager.css';
import ProductManager from './ProductManager';

export interface RawMaterial {
    id: string;
    name: string;
    baseQuantity: number;
    unit: string;
    price: number;
    lastUpdated?: any;
}

export interface RecipeIngredient {
    rawMaterialId: string;
    quantity: number;
}

export interface ProductRecipe {
    ingredients: RecipeIngredient[];
    yield: number; // Rendimiento
    costPerUnit?: number;
}

export interface Product {
    id: string;
    nombre: string;
    precio: number;
    wholesalePrice?: number;
    recipe?: ProductRecipe;
    stockQuantity?: number;
    requiresRecipe?: boolean;
    stockDependency?: {
        productId: string;
        unitsToDeduct: number;
    };
}


export default function CostManager() {
    const [activeTab, setActiveTab] = useState<'products' | 'raw_materials' | 'recipes' | 'simulator'>('products');

    // --- SYSTEM CONFIG (MARGINS) ---
    // En una DB real deberíamos guardar o leer los porcentajes, aquí usamos un estado local.
    const [margins, setMargins] = useState({ retail: 100, wholesale: 40 });

    // --- RAW MATERIALS STATE ---
    const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
    const [loadingMaterials, setLoadingMaterials] = useState(true);
    const [isEditingMaterial, setIsEditingMaterial] = useState<string | null>(null);
    const [editMaterialForm, setEditMaterialForm] = useState<Partial<RawMaterial>>({});

    // --- RECIPES (PRODUCTS) STATE ---
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedProductId, setSelectedProductId] = useState<string>('');
    const [editingRecipe, setEditingRecipe] = useState<ProductRecipe | null>(null);
    const [newIngredient, setNewIngredient] = useState<RecipeIngredient>({ rawMaterialId: '', quantity: 0 });

    // Quick Add Form
    const [newMaterial, setNewMaterial] = useState({ name: '', baseQuantity: 1000, unit: 'g', price: 0 });

    // Sort & Search State
    const [matSortBy, setMatSortBy] = useState<'name_asc' | 'date_desc' | 'price_asc' | 'price_desc' | 'qty_asc' | 'qty_desc'>('name_asc');
    const [ingredientSearch, setIngredientSearch] = useState('');
    const [showIngredientDropdown, setShowIngredientDropdown] = useState(false);
    const ingredientInputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Click outside handler for dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
                ingredientInputRef.current && !ingredientInputRef.current.contains(event.target as Node)) {
                setShowIngredientDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        // Fetch Materials
        const qMat = query(collection(db, "raw_materials"), orderBy("name"));
        const unsubMat = onSnapshot(qMat, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as RawMaterial));
            setRawMaterials(data);
            setLoadingMaterials(false);
        });

        // Fetch Products
        const qProd = query(collection(db, "products"), orderBy("nombre"));
        const unsubProd = onSnapshot(qProd, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
            setProducts(data);
        });

        return () => {
            unsubMat();
            unsubProd();
        };
    }, []);

    // --- RAW MATERIALS CRUD ---
    const handleAddMaterial = async () => {
        if (!newMaterial.name || newMaterial.price <= 0) return alert("Nombre y Precio requerido.");
        try {
            await addDoc(collection(db, "raw_materials"), {
                ...newMaterial,
                lastUpdated: Timestamp.now()
            });
            setNewMaterial({ name: '', baseQuantity: 1000, unit: 'g', price: 0 });
        } catch (error) {
            console.error(error);
            alert("Error al guardar.");
        }
    };

    const handleUpdateMaterial = async (id: string) => {
        try {
            await updateDoc(doc(db, "raw_materials", id), {
                ...editMaterialForm,
                lastUpdated: Timestamp.now()
            });
            setIsEditingMaterial(null);
            setEditMaterialForm({});
        } catch (error) {
            console.error(error);
            alert("Error al actualizar.");
        }
    };

    const handleDeleteMaterial = async (id: string) => {
        if (!window.confirm("¿Seguro que deseas eliminar esta materia prima? Se romperán las recetas que la usen.")) return;
        try {
            await deleteDoc(doc(db, "raw_materials", id));
        } catch (error) {
            console.error(error);
            alert("Error al eliminar.");
        }
    };

    // --- RECIPES CRUD & LOGIC ---
    useEffect(() => {
        // Al seleccionar un producto, cargamos su receta actual a la memoria de edición
        if (selectedProductId) {
            const prod = products.find(p => p.id === selectedProductId);
            if (prod) {
                if (prod.recipe) {
                    setEditingRecipe(JSON.parse(JSON.stringify(prod.recipe))); // Deep clone
                } else {
                    setEditingRecipe({ ingredients: [], yield: 1 });
                }
            }
        } else {
            setEditingRecipe(null);
            setNewIngredient({ rawMaterialId: '', quantity: 0 });
        }
    }, [selectedProductId, products]);

    const handleAddIngredient = () => {
        if (!editingRecipe) return;
        if (!newIngredient.rawMaterialId || newIngredient.quantity <= 0) return alert("Selecciona material y cantidad válida.");

        // Comprobar si ya existe
        const exists = editingRecipe.ingredients.find(i => i.rawMaterialId === newIngredient.rawMaterialId);
        if (exists) {
            alert("Este ingrediente ya está en la receta.");
            return;
        }

        setEditingRecipe({
            ...editingRecipe,
            ingredients: [...editingRecipe.ingredients, newIngredient]
        });
        setNewIngredient({ rawMaterialId: '', quantity: 0 });
        setIngredientSearch(""); // Limpiar buscador
    };

    const handleRemoveIngredient = (matId: string) => {
        if (!editingRecipe) return;
        setEditingRecipe({
            ...editingRecipe,
            ingredients: editingRecipe.ingredients.filter(i => i.rawMaterialId !== matId)
        });
    };

    const handleSaveRecipe = async () => {
        if (!selectedProductId || !editingRecipe) return;

        // Guardar costo unitario también (para el cache en el simulador)
        const unitCost = calculateRecipeUnitCost(editingRecipe);

        try {
            await updateDoc(doc(db, "products", selectedProductId), {
                recipe: {
                    ...editingRecipe,
                    costPerUnit: unitCost
                }
            });
            alert("Receta guardada exitosamente.");
        } catch (error) {
            console.error(error);
            alert("Error al guardar la receta.");
        }
    };

    // --- MATH HELPERS ---
    const calculateIngredientCost = (ing: RecipeIngredient): number => {
        const mat = rawMaterials.find(m => m.id === ing.rawMaterialId);
        if (!mat || mat.baseQuantity === 0) return 0;
        // Regla de 3: (Precio / Base) * CantidadUsada
        return (mat.price / mat.baseQuantity) * ing.quantity;
    };

    const calculateRecipeTotalCost = (recipe: ProductRecipe | null): number => {
        if (!recipe) return 0;
        return recipe.ingredients.reduce((total, ing) => total + calculateIngredientCost(ing), 0);
    };

    const calculateRecipeUnitCost = (recipe: ProductRecipe | null): number => {
        if (!recipe || recipe.yield <= 0) return 0;
        return calculateRecipeTotalCost(recipe) / recipe.yield;
    };

    const calculateRealProductCost = (product: Product, visitedIds: Set<string> = new Set()): number => {
        if (!product) return 0;
        if (visitedIds.has(product.id)) return 0; // Evitar lazos infinitos

        visitedIds.add(product.id);
        let totalCost = 0;

        // 1. Costo heredado del Padre (si tiene dependencia)
        if (product.stockDependency && product.stockDependency.productId) {
            const parent = products.find(p => p.id === product.stockDependency?.productId);
            if (parent) {
                const parentUnitCost = calculateRealProductCost(parent, visitedIds);
                totalCost += parentUnitCost * product.stockDependency.unitsToDeduct;
            }
        }

        // 2. Costo propio de la receta (ej. empaques o insumos extras)
        if (product.recipe) {
            totalCost += calculateRecipeUnitCost(product.recipe);
        }

        return totalCost;
    };

    // --- SIMULATOR HELPERS ---
    const calculateSuggestedPrice = (cost: number, marginPercent: number) => {
        // Asumiendo sistema de Mark-Up: Costo + (Costo * % / 100)
        return cost * (1 + (marginPercent / 100));
    };

    const handleApplySuggestedPrices = async (prod: Product, suggestedWholesale: number, suggestedRetail: number) => {
        if (!window.confirm(`¿Actualizar los precios de ${prod.nombre} en la tienda a $${suggestedWholesale.toFixed(2)} Mayorista y $${suggestedRetail.toFixed(2)} Directo?`)) return;

        try {
            await updateDoc(doc(db, "products", prod.id), {
                precio: Number(suggestedRetail.toFixed(2)),
                wholesalePrice: Number(suggestedWholesale.toFixed(2))
            });
            alert("Precios actualizados en la tienda.");
        } catch (error) {
            console.error(error);
            alert("Error al actualizar precios.");
        }
    };

    // --- FORMATTERS ---
    const formatQuantity = (qty: number, unit: string) => {
        if (unit === 'g' && qty >= 1000) return `${(qty / 1000).toFixed(1).replace(/\.0$/, '')} kg`;
        if (unit === 'ml' && qty >= 1000) return `${(qty / 1000).toFixed(1).replace(/\.0$/, '')} L`;
        if (unit === 'min' && qty >= 60) return `${(qty / 60).toFixed(1).replace(/\.0$/, '')} h`;
        return `${qty} ${unit}`;
    };

    const sortedMaterials = [...rawMaterials].sort((a, b) => {
        if (matSortBy === 'name_asc') return a.name.localeCompare(b.name);
        if (matSortBy === 'date_desc') return (b.lastUpdated?.seconds || 0) - (a.lastUpdated?.seconds || 0);
        if (matSortBy === 'price_asc') return a.price - b.price;
        if (matSortBy === 'price_desc') return b.price - a.price;
        if (matSortBy === 'qty_asc') return a.baseQuantity - b.baseQuantity;
        if (matSortBy === 'qty_desc') return b.baseQuantity - a.baseQuantity;
        return 0;
    });

    // --- RENDER ---

    return (
        <div className="cost-manager-container">
            <header className="cm-header">
                <h2>Productos, Costos y Recetas</h2>
                <div className="cm-tabs">
                    <button
                        className={`cm-tab ${activeTab === 'products' ? 'active' : ''}`}
                        onClick={() => setActiveTab('products')}
                    >
                        <FaBoxOpen /> 1. Productos
                    </button>
                    <button
                        className={`cm-tab ${activeTab === 'raw_materials' ? 'active' : ''}`}
                        onClick={() => setActiveTab('raw_materials')}
                    >
                        <FaList /> 2. Materias Primas
                    </button>
                    <button
                        className={`cm-tab ${activeTab === 'recipes' ? 'active' : ''}`}
                        onClick={() => setActiveTab('recipes')}
                    >
                        <FaCalculator /> 3. Fichas de Recetas
                    </button>
                    <button
                        className={`cm-tab ${activeTab === 'simulator' ? 'active' : ''}`}
                        onClick={() => setActiveTab('simulator')}
                    >
                        <FaChartLine /> 4. Precios y Ganancias
                    </button>
                </div>
            </header>

            <main className="cm-content">
                {activeTab === 'products' && (
                    <ProductManager onGoToRecipe={(id) => { setSelectedProductId(id); setActiveTab('recipes'); }} />
                )}
                {activeTab === 'raw_materials' && (
                    <div className="cm-tab-content">
                        <h3>Gestión de Materias Primas e Insumos</h3>
                        <p style={{ color: '#64748b', marginBottom: '20px' }}>Registra el costo base de tus ingredientes, envases y tiempo de mano de obra.</p>

                        <div className="cm-add-bar">
                            <input
                                type="text"
                                placeholder="Nombre (ej. Harina)"
                                value={newMaterial.name}
                                onChange={e => setNewMaterial({ ...newMaterial, name: e.target.value })}
                            />
                            <div className="cm-input-group">
                                <input
                                    type="number"
                                    placeholder="Cant."
                                    style={{ width: '80px' }}
                                    value={newMaterial.baseQuantity || ''}
                                    onChange={e => setNewMaterial({ ...newMaterial, baseQuantity: Number(e.target.value) })}
                                />
                                <select
                                    value={newMaterial.unit}
                                    onChange={e => setNewMaterial({ ...newMaterial, unit: e.target.value })}
                                >
                                    <option value="g">g</option>
                                    <option value="ml">ml</option>
                                    <option value="min">min (Tiempo)</option>
                                    <option value="un">un (Unidades)</option>
                                </select>
                            </div>
                            <div className="cm-input-group">
                                <span className="currency-symbol">$</span>
                                <input
                                    type="number"
                                    placeholder="Precio total"
                                    value={newMaterial.price || ''}
                                    onChange={e => setNewMaterial({ ...newMaterial, price: Number(e.target.value) })}
                                />
                            </div>
                            <button className="cm-btn-primary" onClick={handleAddMaterial}><FaPlus /> Añadir</button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px', alignItems: 'center', gap: '10px' }}>
                            <label style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 'bold' }}>Ordenar por:</label>
                            <select value={matSortBy} onChange={e => setMatSortBy(e.target.value as any)} style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                <option value="name_asc">A-Z</option>
                                <option value="date_desc">Más Recientes</option>
                                <option value="price_desc">Mayor Precio</option>
                                <option value="price_asc">Menor Precio</option>
                                <option value="qty_desc">Mayor Cantidad</option>
                                <option value="qty_asc">Menor Cantidad</option>
                            </select>
                        </div>

                        <div className="cm-table-container">
                            <table className="cm-table">
                                <thead>
                                    <tr>
                                        <th>Materia Prima / Concepto</th>
                                        <th>Cantidad Base</th>
                                        <th>Precio</th>
                                        <th>Última Act.</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingMaterials ? (
                                        <tr><td colSpan={5} style={{ textAlign: 'center' }}>Cargando...</td></tr>
                                    ) : sortedMaterials.length === 0 ? (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8' }}>No hay materias primas registradas.</td></tr>
                                    ) : sortedMaterials.map(mat => (
                                        <tr key={mat.id}>
                                            <td>
                                                {isEditingMaterial === mat.id ? (
                                                    <input
                                                        type="text"
                                                        value={editMaterialForm.name || ''}
                                                        onChange={e => setEditMaterialForm({ ...editMaterialForm, name: e.target.value })}
                                                    />
                                                ) : <strong>{mat.name}</strong>}
                                            </td>
                                            <td>
                                                {isEditingMaterial === mat.id ? (
                                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                        <input
                                                            type="number"
                                                            style={{ width: '60px' }}
                                                            value={editMaterialForm.baseQuantity || ''}
                                                            onChange={e => setEditMaterialForm({ ...editMaterialForm, baseQuantity: Number(e.target.value) })}
                                                        />
                                                        <select
                                                            value={editMaterialForm.unit || ''}
                                                            onChange={e => setEditMaterialForm({ ...editMaterialForm, unit: e.target.value })}
                                                        >
                                                            <option value="g">g</option>
                                                            <option value="ml">ml</option>
                                                            <option value="min">min</option>
                                                            <option value="un">un</option>
                                                        </select>
                                                    </div>
                                                ) : formatQuantity(mat.baseQuantity, mat.unit)}
                                            </td>
                                            <td>
                                                {isEditingMaterial === mat.id ? (
                                                    <input
                                                        type="number"
                                                        style={{ width: '100px' }}
                                                        value={editMaterialForm.price || ''}
                                                        onChange={e => setEditMaterialForm({ ...editMaterialForm, price: Number(e.target.value) })}
                                                    />
                                                ) : <span style={{ color: '#059669', fontWeight: 'bold' }}>${mat.price}</span>}
                                            </td>
                                            <td>
                                                <small style={{ color: '#94a3b8' }}>
                                                    {mat.lastUpdated?.seconds ? new Date(mat.lastUpdated.seconds * 1000).toLocaleDateString() : 'N/A'}
                                                </small>
                                            </td>
                                            <td className="cm-actions">
                                                {isEditingMaterial === mat.id ? (
                                                    <>
                                                        <button className="cm-icon-btn save" onClick={() => handleUpdateMaterial(mat.id)}><FaSave /></button>
                                                        <button className="cm-icon-btn cancel" onClick={() => setIsEditingMaterial(null)}><FaTimes /></button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button className="cm-icon-btn edit" onClick={() => {
                                                            setIsEditingMaterial(mat.id);
                                                            setEditMaterialForm(mat);
                                                        }}><FaEdit /></button>
                                                        <button className="cm-icon-btn delete" onClick={() => handleDeleteMaterial(mat.id)}><FaTrash /></button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                {activeTab === 'recipes' && (
                    <div className="cm-tab-content">
                        <h3>Costeo por Producto (Recetas)</h3>
                        <p style={{ color: '#64748b', marginBottom: '20px' }}>Selecciona un producto para armar su receta e imputarle las materias primas utilizadas.</p>

                        <div className="cm-recipe-selector">
                            <select
                                value={selectedProductId}
                                onChange={e => setSelectedProductId(e.target.value)}
                                className="cm-select-large"
                            >
                                <option value="">-- Elige un Producto --</option>
                                {products
                                    .filter(p => p.requiresRecipe !== false)
                                    .map(p => {
                                        const hasOwnRecipe = p.recipe && p.recipe.ingredients.length > 0;
                                        const isDerived = !!p.stockDependency?.productId;
                                        const status = [];
                                        if (hasOwnRecipe) status.push('✔️ Receta');
                                        if (isDerived) status.push('🔗 Derivado');
                                        return (
                                            <option key={p.id} value={p.id}>
                                                {p.nombre} {status.length > 0 ? `(${status.join(', ')})` : ''}
                                            </option>
                                        );
                                    })}
                            </select>
                        </div>

                        {selectedProductId && editingRecipe && (() => {
                            const selectedProduct = products.find(p => p.id === selectedProductId);
                            const parentProduct = selectedProduct?.stockDependency?.productId ? products.find(p => p.id === selectedProduct.stockDependency?.productId) : null;

                            return (
                                <div className="cm-recipe-builder">
                                    {parentProduct && (
                                        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                                            <h4 style={{ color: '#0369a1', marginTop: 0 }}>🔗 Producto Derivado</h4>
                                            <p style={{ margin: 0, color: '#0c4a6e' }}>
                                                Este producto hereda su costo base de <strong>{parentProduct.nombre}</strong> (x{selectedProduct?.stockDependency?.unitsToDeduct}).<br />
                                                Costo heredado actual: <strong>${(calculateRealProductCost(parentProduct) * (selectedProduct?.stockDependency?.unitsToDeduct || 1)).toFixed(2)}</strong>.<br />
                                                <small>Usa la tabla de abajo solo para añadir extras como cajas o bolsas.</small>
                                            </p>
                                        </div>
                                    )}

                                    <div className="cm-add-bar" style={{ background: '#eff6ff', borderColor: '#bfdbfe', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', flex: 1, gap: '5px', minWidth: '200px', position: 'relative' }}>
                                            <input
                                                type="text"
                                                placeholder="🔍 Buscar materia prima..."
                                                value={ingredientSearch}
                                                ref={ingredientInputRef}
                                                onChange={e => {
                                                    setIngredientSearch(e.target.value);
                                                    setShowIngredientDropdown(true);
                                                    if (!e.target.value) {
                                                        setNewIngredient({ ...newIngredient, rawMaterialId: '' });
                                                    }
                                                }}
                                                onFocus={() => setShowIngredientDropdown(true)}
                                                style={{ width: '100%', flex: '1', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                            />
                                            {showIngredientDropdown && (
                                                <div
                                                    ref={dropdownRef}
                                                    style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        left: 0,
                                                        right: 0,
                                                        background: 'white',
                                                        border: '1px solid #cbd5e1',
                                                        borderRadius: '4px',
                                                        maxHeight: '200px',
                                                        overflowY: 'auto',
                                                        zIndex: 100,
                                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
                                                    }}
                                                >
                                                    {rawMaterials
                                                        .filter(m => m.name.toLowerCase().includes(ingredientSearch.toLowerCase()))
                                                        .map(m => (
                                                            <div
                                                                key={m.id}
                                                                style={{
                                                                    padding: '8px 12px',
                                                                    cursor: 'pointer',
                                                                    borderBottom: '1px solid #f1f5f9',
                                                                    background: newIngredient.rawMaterialId === m.id ? '#e0f2fe' : 'transparent',
                                                                    color: '#334155'
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = newIngredient.rawMaterialId === m.id ? '#e0f2fe' : 'transparent'}
                                                                onClick={() => {
                                                                    setNewIngredient({ ...newIngredient, rawMaterialId: m.id });
                                                                    setIngredientSearch(m.name);
                                                                    setShowIngredientDropdown(false);
                                                                }}
                                                            >
                                                                <strong>{m.name}</strong> <span style={{ color: '#64748b', fontSize: '0.85em' }}>(${m.price} / {formatQuantity(m.baseQuantity, m.unit)})</span>
                                                            </div>
                                                        ))}
                                                    {rawMaterials.filter(m => m.name.toLowerCase().includes(ingredientSearch.toLowerCase())).length === 0 && (
                                                        <div style={{ padding: '8px 12px', color: '#94a3b8', fontStyle: 'italic' }}>No hay resultados</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="cm-input-group">
                                            <input
                                                type="number"
                                                placeholder="Usado en receta"
                                                value={newIngredient.quantity || ''}
                                                onChange={e => setNewIngredient({ ...newIngredient, quantity: Number(e.target.value) })}
                                            />
                                            <span className="currency-symbol">
                                                {rawMaterials.find(m => m.id === newIngredient.rawMaterialId)?.unit || 'u'}
                                            </span>
                                        </div>
                                        <button className="cm-btn-primary" onClick={handleAddIngredient}><FaPlus /> Añadir a Fórmula</button>
                                    </div>

                                    {/* Tabla de Ficha de Costos */}
                                    <div className="cm-table-container">
                                        <table className="cm-table recipe-table">
                                            <thead>
                                                <tr>
                                                    <th>Materia Prima / Insumo</th>
                                                    <th>Unidad</th>
                                                    <th>Cantidad Usada</th>
                                                    <th>Costo Subtotal</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {editingRecipe.ingredients.length === 0 ? (
                                                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8' }}>Fórmula vacía. Añade ingredientes arriba.</td></tr>
                                                ) : editingRecipe.ingredients.map(ing => {
                                                    const mat = rawMaterials.find(m => m.id === ing.rawMaterialId);
                                                    if (!mat) return null;
                                                    return (
                                                        <tr key={mat.id}>
                                                            <td><strong>{mat.name}</strong></td>
                                                            <td>{mat.unit}</td>
                                                            <td>
                                                                <input
                                                                    type="number"
                                                                    value={ing.quantity || ''}
                                                                    style={{ width: '100px' }}
                                                                    onChange={e => {
                                                                        const newQ = Number(e.target.value);
                                                                        const newIngs = editingRecipe.ingredients.map(i => i.rawMaterialId === mat.id ? { ...i, quantity: newQ } : i);
                                                                        setEditingRecipe({ ...editingRecipe, ingredients: newIngs });
                                                                    }}
                                                                />
                                                            </td>
                                                            <td style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                                                                ${calculateIngredientCost(ing).toFixed(2)}
                                                            </td>
                                                            <td className="cm-actions">
                                                                <button className="cm-icon-btn delete" onClick={() => handleRemoveIngredient(mat.id)}><FaTrash /></button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="recipe-footer-row totals">
                                                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold', color: '#b91c1c' }}>COSTO Y PRODUCCIÓN TOTAL:</td>
                                                    <td colSpan={2} style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: '1.2rem' }}>${calculateRecipeTotalCost(editingRecipe).toFixed(2)}</td>
                                                </tr>
                                                <tr className="recipe-footer-row yield">
                                                    <td colSpan={3} style={{ textAlign: 'right', padding: '15px' }}>
                                                        <strong>¿Cuántas unidades rinde esta receta entera?</strong><br />
                                                    </td>
                                                    <td colSpan={2}>
                                                        <div className="cm-input-group yield-group">
                                                            <input
                                                                type="number"
                                                                value={editingRecipe.yield || 1}
                                                                onChange={e => setEditingRecipe({ ...editingRecipe, yield: Number(e.target.value) })}
                                                                style={{ fontSize: '1.2rem', textAlign: 'center', width: '80px', padding: '10px' }}
                                                            />
                                                            <span className="currency-symbol">uds.</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {selectedProduct && selectedProduct.stockDependency?.productId && parentProduct && (
                                                    <tr className="recipe-footer-row" style={{ background: '#f0f9ff' }}>
                                                        <td colSpan={3} style={{ textAlign: 'right', color: '#0369a1' }}>+ COSTO HEREDADO ({parentProduct.nombre} x{selectedProduct.stockDependency.unitsToDeduct}):</td>
                                                        <td colSpan={2} style={{ color: '#0369a1', fontWeight: 'bold' }}>
                                                            ${(calculateRealProductCost(parentProduct) * selectedProduct.stockDependency.unitsToDeduct).toFixed(2)}
                                                        </td>
                                                    </tr>
                                                )}
                                                <tr className="recipe-footer-row unit-cost" style={{ background: '#fef2f2' }}>
                                                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold', color: '#b91c1c', fontSize: '1.2rem' }}>COSTO TOTAL POR UNIDAD:</td>
                                                    <td colSpan={2} style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: '1.5rem' }}>${calculateRealProductCost({ ...selectedProduct!, recipe: editingRecipe }).toFixed(2)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                                        <button className="cm-btn-primary" style={{ padding: '12px 30px', fontSize: '1.1rem' }} onClick={handleSaveRecipe}>
                                            <FaSave /> ¡Guardar Ficha de Costo!
                                        </button>
                                    </div>

                                </div>
                            );
                        })()}
                    </div>
                )}
                {activeTab === 'simulator' && (
                    <div className="cm-tab-content">
                        <h3>Simulador de Ganancias y Precios Sugeridos</h3>
                        <p style={{ color: '#64748b', marginBottom: '20px' }}>Analiza la rentabilidad de tus productos según su costo de fabricación y actualiza los precios de la tienda con un solo clic.</p>

                        <div className="cm-margins-config">
                            <label>
                                <strong>% Ganancia Despensa/Mayorista:</strong>
                                <input
                                    type="number"
                                    value={margins.wholesale}
                                    onChange={e => setMargins({ ...margins, wholesale: Number(e.target.value) })}
                                />
                                %
                            </label>
                            <label>
                                <strong>% Ganancia Venta Directa:</strong>
                                <input
                                    type="number"
                                    value={margins.retail}
                                    onChange={e => setMargins({ ...margins, retail: Number(e.target.value) })}
                                />
                                %
                            </label>
                        </div>

                        <div className="cm-table-container">
                            <table className="cm-table simulator-table">
                                <thead>
                                    <tr>
                                        <th>Producto</th>
                                        <th>Costo Unit.</th>
                                        <th>Sugerido Despensa</th>
                                        <th>Sugerido Directa</th>
                                        <th>Precio Tienda Desp.</th>
                                        <th>Precio Tienda Dir.</th>
                                        <th>Ganancia Estimada Dir.</th>
                                        <th>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.filter(p => p.requiresRecipe !== false && ((p.recipe && p.recipe.ingredients.length > 0) || p.stockDependency?.productId)).length === 0 ? (
                                        <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8' }}>No hay productos con recetas o dependencias configuradas. Ve a la pestaña de "Fichas de Recetas".</td></tr>
                                    ) : products.filter(p => p.requiresRecipe !== false && ((p.recipe && p.recipe.ingredients.length > 0) || p.stockDependency?.productId)).map(p => {
                                        const cost = calculateRealProductCost(p);
                                        const sugWholesale = calculateSuggestedPrice(cost, margins.wholesale);
                                        const sugRetail = calculateSuggestedPrice(cost, margins.retail);
                                        const currentWholesale = p.wholesalePrice || 0;
                                        const currentRetail = p.precio || 0;
                                        const profit = currentRetail - cost;

                                        return (
                                            <tr key={p.id}>
                                                <td><strong>{p.nombre}</strong></td>
                                                <td style={{ color: '#b91c1c' }}>${cost.toFixed(2)}</td>
                                                <td style={{ color: '#0891b2' }}>${sugWholesale.toFixed(2)}</td>
                                                <td style={{ color: '#0891b2' }}>${sugRetail.toFixed(2)}</td>

                                                <td className={currentWholesale < sugWholesale ? 'price-warning' : 'price-ok'}>
                                                    ${currentWholesale.toFixed(2)}
                                                </td>
                                                <td className={currentRetail < sugRetail ? 'price-warning' : 'price-ok'}>
                                                    ${currentRetail.toFixed(2)}
                                                </td>

                                                <td style={{ color: '#059669', fontWeight: 'bold' }}>${profit.toFixed(2)}</td>

                                                <td>
                                                    <button
                                                        className="cm-btn-primary"
                                                        style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                                                        onClick={() => handleApplySuggestedPrices(p, sugWholesale, sugRetail)}
                                                    >
                                                        Aplicar Sugeridos
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
