import React, { useEffect, useState, useRef } from "react";
import { db, storage } from "../firebase/firebaseConfig";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { compressImage } from "../utils/imageUtils";
import { FaEdit, FaTrash, FaSync, FaTimes, FaCamera, FaPlus, FaSave, FaSearch, FaEyeSlash } from 'react-icons/fa';
import "./ProductManager.css";

// Interface matching Firestore data structure
export interface FirestoreProduct {
    id?: string;
    nombre: string;
    precio: number;
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
    }[];
    isVisible?: boolean;
    unitType?: 'unit' | 'weight'; // 'unit' (default) or 'weight' (kilos)
}

const INITIAL_STATE: FirestoreProduct = {
    nombre: "",
    precio: 0,
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
        // @ts-ignore - checked property only exists on input
        const checked = e.target.checked;

        setFormData(prev => ({
            ...prev,
            ...prev,
            [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
        }));
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

    const handleVariantChange = (idx: number, field: 'name' | 'stockQuantity', value: string | number) => {
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
    };

    const handleEditClick = (product: FirestoreProduct) => {
        setFormData(product);
        setIsEditing(true);
        formRef.current?.scrollIntoView({ behavior: 'smooth' });
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
            </div>

            {/* Formulario Principal */}
            <div className="pm-card form-section" ref={formRef}>
                <div className="pm-card-header">
                    <h3>{isEditing ? `Editar: ${formData.nombre}` : "Agregar Nuevo Producto"}</h3>
                    {isEditing && <button className="btn-secondary btn-sm" onClick={handleReset}><FaPlus /> Nuevo</button>}
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
                                    <input type="number" name="precio" value={formData.precio} onChange={handleInputChange} min="0" />
                                </div>
                                <div className="form-group quarter">
                                    <label>Tipo de Unidad</label>
                                    <select name="unitType" value={formData.unitType || 'unit'} onChange={handleInputChange}>
                                        <option value="unit">Unidad (u)</option>
                                        <option value="weight">Peso (kg)</option>
                                    </select>
                                </div>
                                <div className="form-group quarter">
                                    <label>Descuento (%)</label>
                                    <input type="number" name="discount" value={formData.discount || 0} onChange={handleInputChange} min="0" max="100" />
                                </div>
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
                                        <div key={idx} className="variant-row">
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
                                            <button type="button" className="btn-icon-danger" onClick={() => removeVariant(idx)}>
                                                <FaTimes />
                                            </button>
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

            {/* Barra de Herramientas de Inventario */}
            <div className="inventory-toolbar">
                <div className="search-bar">
                    <FaSearch className="search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o categoría..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
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
            {loading ? (
                <div className="loading-state">
                    <FaSync className="spin" size={30} />
                    <p>Cargando inventario...</p>
                </div>
            ) : (
                <div className="pm-inventory-grid">
                    {filteredProducts.map(product => (
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
                                        <span className={`stock-status ${product.stock ? 'active' : 'inactive'}`}>
                                            {product.stockQuantity || 0} unid.
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
                    ))}
                    {filteredProducts.length === 0 && (
                        <div className="empty-state">
                            <p>No se encontraron productos.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
