import React, { useEffect, useState, useRef } from "react";
import ProductSearch from './ProductSearch';
import { db, storage } from "../firebase/firebaseConfig";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressImage } from "../utils/imageUtils";
import { syncChildProducts } from "../utils/stockUtils";
import { FaEdit, FaTrash, FaSync, FaTimes, FaCamera, FaPlus, FaSave, FaEyeSlash } from 'react-icons/fa';
import "./ProductManager.css";

// Interface matching Firestore data structure
export interface FirestoreProduct {
    id?: string;
    nombre: string;
    precio: number;
    wholesalePrice?: number;
    categoria: string;
    descripcion: string;
    img: string;
    images?: string[];
    stock: boolean;
    stockQuantity?: number;
    discount?: number;
    variants?: {
        name: string;
        stock: boolean;
        stockQuantity?: number;
        image?: string;
    }[];
    isVisible?: boolean;
    unitType?: 'unit' | 'weight'; // 'unit' (default) or 'weight' (kilos)
    stockDependency?: {
        productId: string;
        unitsToDeduct: number;
    };
}

const INITIAL_STATE: FirestoreProduct = {
    nombre: "",
    precio: 0,
    wholesalePrice: 0,
    categoria: "General",
    descripcion: "",
    img: "https://via.placeholder.com/150",
    images: [],
    stock: true,
    stockQuantity: 0,
    discount: 0,
    variants: [],
    isVisible: true,
    unitType: 'unit'
};

export default function ProductManager() {
    const [products, setProducts] = useState<FirestoreProduct[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [formData, setFormData] = useState<FirestoreProduct>(INITIAL_STATE);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    const [isFormVisible, setIsFormVisible] = useState(false);
    const formRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        reloadProducts();
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "categories"));
            const catsData = querySnapshot.docs.map(doc => ({
                name: doc.data().name,
                order: doc.data().order ?? 9999
            }));
            catsData.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
            setCategories(catsData.map(c => c.name));
        } catch (error) {
            console.error("Error loading categories:", error);
        }
    };

    const reloadProducts = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "products"));
            const prods: FirestoreProduct[] = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    discount: data.discount || 0,
                    isVisible: data.isVisible !== false,
                    unitType: data.unitType || 'unit',
                    images: data.images || (data.img ? [data.img] : [])
                } as FirestoreProduct;
            });
            setProducts(prods);
        } catch (error) {
            console.error("Error loading products:", error);
            setMessage("Error al cargar productos");
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        // @ts-ignore
        const checked = e.target.checked;

        let finalValue: any = value;
        if (type === 'checkbox') {
            finalValue = checked;
        }
        // REMOVED aggressive rounding here to allow smooth typing

        setFormData(prev => ({
            ...prev,
            [name]: finalValue
        }));
    };

    const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        if (type === 'number' && value !== "") {
            let num = parseFloat(value);
            // Round to 3 decimals on blur
            num = Math.round(num * 1000) / 1000;
            setFormData(prev => ({
                ...prev,
                [name]: num
            }));
        }
    };

    const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
        // Prevent value change on scroll
        e.currentTarget.blur();
    };

    const handleDependencyChange = (field: 'productId' | 'unitsToDeduct', value: any) => {
        let finalValue = value;
        if (field === 'unitsToDeduct') {
            finalValue = Number(value);
            finalValue = Math.round(finalValue * 1000) / 1000;
        }

        setFormData(prev => {
            const newDependency = {
                productId: prev.stockDependency?.productId || "",
                unitsToDeduct: prev.stockDependency?.unitsToDeduct || 0,
                [field]: finalValue
            };

            // Auto calculate stock if parent is selected
            let calculatedStock = prev.stockQuantity;
            if (newDependency.productId && newDependency.unitsToDeduct > 0) {
                const parent = products.find(p => p.id === newDependency.productId);
                if (parent) {
                    calculatedStock = Math.floor((parent.stockQuantity || 0) / newDependency.unitsToDeduct);
                }
            }

            return {
                ...prev,
                stockDependency: newDependency,
                stockQuantity: calculatedStock,
                stock: (calculatedStock || 0) > 0
            };
        });
    };

    const toggleDependency = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setFormData(prev => ({
                ...prev,
                stockDependency: { productId: "", unitsToDeduct: 1 },
                stockQuantity: 0,
                stock: false
            }));
        } else {
            setFormData(prev => {
                const { stockDependency, ...rest } = prev;
                return rest;
            });
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const newImageUrls: string[] = [];
            const prodId = formData.id || "temp_" + Date.now();

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const compressedBlob = await compressImage(file);
                const storageRef = ref(storage, `products/${prodId}/${Date.now()}_${file.name.split('.')[0]}.webp`);
                await uploadBytes(storageRef, compressedBlob);
                const downloadURL = await getDownloadURL(storageRef);
                newImageUrls.push(downloadURL);
            }

            setFormData(prev => {
                const updatedImages = [...(prev.images || []), ...newImageUrls];
                return {
                    ...prev,
                    images: updatedImages,
                    img: updatedImages[0] || prev.img
                };
            });
            setMessage("Imágenes subidas correctamente");
        } catch (error) {
            console.error("Error uploading image:", error);
            setMessage("Error al subir imagen");
        } finally {
            setUploading(false);
        }
    };

    // Variant Image Upload
    const handleVariantImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const file = files[0]; // Specific for variant, single image usually
            const prodId = formData.id || "temp_" + Date.now();
            const compressedBlob = await compressImage(file);
            const storageRef = ref(storage, `products/${prodId}/variants/${Date.now()}_${file.name.split('.')[0]}.webp`);

            await uploadBytes(storageRef, compressedBlob);
            const downloadURL = await getDownloadURL(storageRef);

            setFormData(prev => {
                const newVariants = [...(prev.variants || [])];
                const updatedVariant = { ...newVariants[idx], image: downloadURL };
                newVariants[idx] = updatedVariant;
                return { ...prev, variants: newVariants };
            });

            setMessage("Imagen de variante subida");
        } catch (error) {
            console.error("Error uploading variant image:", error);
            setMessage("Error al subir imagen de variante");
        } finally {
            setUploading(false);
        }
    };

    const removeVariantImage = (idx: number) => {
        setFormData(prev => {
            const newVariants = [...(prev.variants || [])];
            const updatedVariant = { ...newVariants[idx] };
            delete updatedVariant.image;
            newVariants[idx] = updatedVariant;
            return { ...prev, variants: newVariants };
        });
    };

    const removeImage = (imageUrl: string) => {
        setFormData(prev => {
            const updatedImages = prev.images?.filter(img => img !== imageUrl) || [];
            return {
                ...prev,
                images: updatedImages,
                img: updatedImages.length > 0 ? updatedImages[0] : ""
            };
        });
    };

    const handleVariantChange = (idx: number, field: 'name' | 'stockQuantity' | 'image', value: string | number) => {
        setFormData(prev => {
            const newVariants = [...(prev.variants || [])];
            // @ts-ignore
            newVariants[idx][field] = value;
            // @ts-ignore
            if (field === 'stockQuantity') newVariants[idx].stock = Number(value) > 0;
            return { ...prev, variants: newVariants };
        });
    };

    const addVariant = () => {
        setFormData(prev => ({
            ...prev,
            variants: [...(prev.variants || []), { name: "", stock: true, stockQuantity: 0 }]
        }));
    };

    const removeVariant = (idx: number) => {
        setFormData(prev => ({
            ...prev,
            variants: prev.variants?.filter((_, i) => i !== idx)
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.nombre) return setMessage("El nombre es obligatorio");

        try {
            if (isEditing && formData.id) {
                const { id, ...dataToUpdate } = formData;
                await updateDoc(doc(db, "products", id), dataToUpdate);

                // Sync children if stock changed
                await syncChildProducts(id, dataToUpdate.stockQuantity || 0);

                setMessage("Producto actualizado correctamente");
            } else {
                await addDoc(collection(db, "products"), formData);
                setMessage("Producto creado exitosamente");
            }
            reloadProducts();
            handleReset();
        } catch (error) {
            console.error("Error saving product:", error);
            setMessage("Error al guardar producto");
        }
    };

    const handleReset = () => {
        setFormData(INITIAL_STATE);
        setIsEditing(false);
        setMessage(null);
        setIsFormVisible(false);
    };

    const handleEditClick = (product: FirestoreProduct) => {
        let p = { ...product };

        // Recalcular stock derivado al editar para asegurar consistencia
        if (p.stockDependency && p.stockDependency.productId) {
            const parent = products.find(prod => prod.id === p.stockDependency?.productId);
            if (parent) {
                const calculated = Math.floor((parent.stockQuantity || 0) / (p.stockDependency.unitsToDeduct || 1));
                p.stockQuantity = calculated;
                p.stock = calculated > 0;
            }
        }

        setFormData(p);
        setIsEditing(true);
        setIsFormVisible(true);
        // formRef.current?.scrollIntoView({ behavior: 'smooth' }); // Not needed for modal
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Seguro que deseas eliminar este producto? Esta acción no se puede deshacer.")) return;
        try {
            await deleteDoc(doc(db, "products", id));
            reloadProducts();
            if (formData.id === id) {
                handleReset();
            }
            setMessage("Producto eliminado");
        } catch (error) {
            console.error("Error deleting:", error);
            setMessage("Error al eliminar");
        }
    };

    const filteredProducts = products.filter(p =>
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.categoria.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="product-manager-container">
            {/* Header del Admin */}
            <div className="pm-header">
                <div>
                    <h2>Administrador de Productos</h2>
                    <p>Gestiona el inventario, precios y detalles de tus productos.</p>
                </div>
                <button
                    className="btn-primary"
                    onClick={() => {
                        handleReset(); // Ensure clean state
                        setIsFormVisible(true);
                    }}
                >
                    <FaPlus /> Nuevo Producto
                </button>
            </div>

            {/* Modal Formulario */}
            {isFormVisible && (
                <div className="pm-modal-overlay">
                    <div className="pm-modal-content" ref={formRef}>
                        <div className="pm-card-header">
                            <h3>{isEditing ? `Editar: ${formData.nombre}` : "Agregar Nuevo Producto"}</h3>
                            <button className="btn-icon-secondary" onClick={handleReset}>
                                <FaTimes size={20} />
                            </button>
                        </div>

                        {message && <div className="pm-alert">{message}</div>}

                        <form onSubmit={handleSubmit} className="pm-form">
                            <div className="pm-grid">
                                {/* Columna Izquierda: Detalles Básicos */}
                                <div className="pm-col-main">
                                    <div className="form-group">
                                        <label>Nombre del Producto</label>
                                        <input
                                            name="nombre"
                                            value={formData.nombre}
                                            onChange={handleInputChange}
                                            placeholder="Ej. Tarta de Chocolate"
                                            required
                                            className="input-lg"
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Precio</label>
                                        <div className="price-input-container">
                                            <span className="currency-symbol">$</span>
                                            <input
                                                type="number"
                                                name="precio"
                                                placeholder="0"
                                                value={formData.precio}
                                                onChange={handleInputChange}
                                                onBlur={handleInputBlur}
                                                onWheel={handleWheel}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>Precio Mayorista / Despensa</label>
                                        <div className="price-input-container">
                                            <span className="currency-symbol">$</span>
                                            <input
                                                type="number"
                                                name="wholesalePrice"
                                                placeholder="0"
                                                value={formData.wholesalePrice || ""}
                                                onChange={handleInputChange}
                                                onBlur={handleInputBlur}
                                                onWheel={handleWheel}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group half">
                                            <label>Categoría</label>
                                            <select name="categoria" value={formData.categoria} onChange={handleInputChange}>
                                                <option value="" disabled>Seleccionar...</option>
                                                <option value="General">General</option>
                                                {categories.filter(c => c !== "General").map((cat, index) => (
                                                    <option key={index} value={cat}>{cat}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group quarter">
                                            <label>Precio ($)</label>
                                            <input type="number" name="precio" value={formData.precio} onChange={handleInputChange} onBlur={handleInputBlur} onWheel={handleWheel} min="0" />
                                        </div>

                                    </div>

                                    <div className="form-row">
                                        <div className="form-group half">
                                            <label>Tipo de Unidad</label>
                                            <select name="unitType" value={formData.unitType || 'unit'} onChange={handleInputChange}>
                                                <option value="unit">Unidad (u)</option>
                                                <option value="weight">Peso (kg)</option>
                                            </select>
                                        </div>
                                        <div className="form-group half">
                                            <label>Descuento (%)</label>
                                            <input type="number" name="discount" value={formData.discount || 0} onChange={handleInputChange} onBlur={handleInputBlur} onWheel={handleWheel} min="0" max="100" />
                                        </div>
                                    </div>



                                    {/* Stock Dependency Section */}
                                    <div className="pm-dependency-section" style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #eee' }}>
                                        <div className="checkbox-group-styled">
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={!!formData.stockDependency}
                                                    onChange={toggleDependency}
                                                />
                                                <strong>Dependencia de Stock (Es Pack o Derivado)</strong>
                                            </label>
                                        </div>

                                        {formData.stockDependency && (
                                            <div className="form-row" style={{ marginTop: '10px' }}>
                                                <div className="form-group half">
                                                    <label>Producto Padre (Origen del Stock)</label>
                                                    <select
                                                        value={formData.stockDependency.productId}
                                                        onChange={(e) => handleDependencyChange('productId', e.target.value)}
                                                        className="input-sm"
                                                    >
                                                        <option value="" disabled>Seleccionar Producto...</option>
                                                        {products
                                                            .filter(p => p.id !== formData.id && !p.stockDependency) // Prevent circular and chains for simplicity
                                                            .map(p => (
                                                                <option key={p.id} value={p.id}>{p.nombre} (Stock: {p.stockQuantity})</option>
                                                            ))}
                                                    </select>
                                                </div>
                                                <div className="form-group half">
                                                    <label>Consume (cantidad/peso del padre)</label>
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        value={formData.stockDependency.unitsToDeduct}
                                                        onChange={(e) => handleDependencyChange('unitsToDeduct', e.target.value)}
                                                        placeholder="Ej: 6 para media docena, 0.5 para 500g"
                                                    />
                                                    <small className="text-muted">
                                                        Este producto descontará {formData.stockDependency.unitsToDeduct} uni/kg del padre por cada venta.
                                                    </small>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="form-group quarter checkbox-group-styled">
                                        <label>
                                            <input
                                                type="checkbox"
                                                name="isVisible"
                                                checked={formData.isVisible !== false}
                                                onChange={handleInputChange}
                                            />
                                            Visible en Home
                                        </label>
                                    </div>

                                    <div className="form-group">
                                        <label>Descripción</label>
                                        <textarea
                                            name="descripcion"
                                            value={formData.descripcion}
                                            onChange={handleInputChange}
                                            placeholder="Describe los ingredientes y detalles del producto..."
                                            rows={4}
                                        />
                                    </div>
                                </div>

                                {/* Columna Derecha: Multimedia y Variantes */}
                                <div className="pm-col-sidebar">
                                    <div className="form-group">
                                        <label>Imágenes del Producto</label>
                                        <div className="image-upload-area">
                                            <label className="btn-upload">
                                                {uploading ? <FaSync className="spin" /> : <FaCamera />}
                                                <span>{uploading ? "Subiendo..." : "Agregar Fotos"}</span>
                                                <input type="file" hidden accept="image/*" multiple onChange={handleImageUpload} disabled={uploading} />
                                            </label>

                                            <div className="image-previews">
                                                {formData.images?.map((img, idx) => (
                                                    <div key={idx} className="img-preview-item">
                                                        <img src={img} alt="preview" />
                                                        <button type="button" className="btn-remove-img" onClick={() => removeImage(img)}><FaTimes /></button>
                                                    </div>
                                                ))}
                                                {(!formData.images || formData.images.length === 0) && (
                                                    <div className="no-images">Sin imágenes</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="form-group variants-wrapper">
                                        <div className="variants-header">
                                            <label>Variantes</label>
                                            <button type="button" className="btn-text" onClick={addVariant}><FaPlus /> Agregar</button>
                                        </div>
                                        <div className="variants-list">
                                            {formData.variants?.map((v, idx) => (
                                                <div key={idx} className="variant-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                                    <div style={{ display: 'flex', gap: '5px', flex: 1, minWidth: '200px' }}>
                                                        <input
                                                            placeholder="Ej. Frutilla"
                                                            value={v.name}
                                                            onChange={(e) => handleVariantChange(idx, 'name', e.target.value)}
                                                        />
                                                        <input
                                                            type="number"
                                                            placeholder="Stock"
                                                            value={v.stockQuantity ?? 0}
                                                            onChange={(e) => handleVariantChange(idx, 'stockQuantity', Number(e.target.value))}
                                                            className="input-stock"
                                                        />
                                                    </div>

                                                    {/* Variant Image Control */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        {v.image ? (
                                                            <div className="variant-img-preview" style={{ position: 'relative', width: '40px', height: '40px' }}>
                                                                <img src={v.image} alt="v" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeVariantImage(idx)}
                                                                    style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'red', color: 'white', border: 'none', borderRadius: '50%', width: '15px', height: '15px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <label className="btn-icon-secondary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} title="Subir foto variante">
                                                                <FaCamera size={14} />
                                                                <input type="file" hidden accept="image/*" onChange={(e) => handleVariantImageUpload(e, idx)} />
                                                            </label>
                                                        )}

                                                        <button type="button" className="btn-icon-danger" onClick={() => removeVariant(idx)}>
                                                            <FaTrash />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {(!formData.variants || formData.variants.length === 0) && (
                                                <p className="text-muted text-sm">Este producto no tiene variantes.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                            </div>
                            <div className="pm-card-footer">
                                <button type="button" className="btn-secondary" onClick={handleReset}>Cancelar</button>
                                <button type="submit" className="btn-primary" disabled={loading || uploading}>
                                    {loading ? <FaSync className="spin" /> : <FaSave />}
                                    {isEditing ? "Guardar Cambios" : "Crear Producto"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div >
            )
            }

            <div className="inventory-toolbar">
                <div className="search-bar" style={{ display: 'block', maxWidth: '400px' }}>
                    <ProductSearch
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Buscar por nombre o categoría..."
                    />
                </div>
                <div className="inventory-stats">
                    <span className="stat-pill">Total: <strong>{products.length}</strong></span>
                    <button className="btn-secondary btn-sm" onClick={reloadProducts}>
                        <FaSync /> Actualizar
                    </button>
                </div>
            </div>

            {/* Grid de Productos */}
            {
                loading ? (
                    <div className="loading-state">
                        <FaSync className="spin" size={30} />
                        <p>Cargando inventario...</p>
                    </div>
                ) : (
                    <div className="pm-inventory-grid">
                        {filteredProducts.map(product => {
                            const totalStock = (product.variants && product.variants.length > 0)
                                ? product.variants.reduce((acc, v) => acc + (v.stockQuantity || 0), 0)
                                : (product.stockQuantity || 0);

                            return (
                                <div key={product.id} className="inventory-card">
                                    <div className="card-image">
                                        <img src={product.img || product.images?.[0]} alt={product.nombre} className={product.isVisible === false ? "opacity-50" : ""} />
                                        {product.discount ? <span className="badge-discount">-{product.discount}%</span> : null}
                                        {product.isVisible === false && <span className="badge-hidden"><FaEyeSlash /> Oculto</span>}
                                    </div>
                                    <div className="card-content">
                                        <div className="card-info">
                                            <h4>{product.nombre}</h4>
                                            <span className="card-category">{product.categoria}</span>
                                            <div className="card-price-row">
                                                <span className="price">${product.precio}</span>
                                                <span className={`stock-status ${totalStock > 0 ? 'active' : 'inactive'}`}>
                                                    {totalStock} unid.
                                                </span>
                                            </div>
                                        </div>
                                        <div className="card-actions">
                                            <button className="btn-action edit" onClick={() => handleEditClick(product)}>
                                                <FaEdit />
                                            </button>
                                            <button className="btn-action delete" onClick={() => product.id && handleDelete(product.id)}>
                                                <FaTrash />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {filteredProducts.length === 0 && (
                            <div className="empty-state">
                                <p>No se encontraron productos.</p>
                            </div>
                        )}
                    </div>
                )
            }
        </div >
    );
}
