import React, { useEffect, useState, useRef } from "react";
import ProductSearch from './ProductSearch';
import { db, storage } from "../firebase/firebaseConfig";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { syncChildProducts } from "../utils/stockUtils";
import ProductImageEditor from "./ProductImageEditor";
import StockAdjustmentModal from "./StockAdjustmentModal";
import { FaEdit, FaTrash, FaSync, FaTimes, FaCamera, FaPlus, FaSave, FaEyeSlash, FaCheckCircle, FaFileSignature } from 'react-icons/fa';
import "./ProductManager.css";

// Interface matching Firestore data structure
export interface FirestoreProduct {
    id?: string;
    nombre: string;
    shortId?: string; // Código rápido para POS (ej: "001")
    precio: number;
    wholesalePrice?: number;
    categoria: string;
    descripcion: string;
    img: string;
    images?: string[];
    stock: boolean;
    stockQuantity?: number;
    discount?: number;
    requiresRecipe?: boolean;
    recipe?: {
        costPerUnit: number;
        [key: string]: any;
    };
    variants?: {
        name: string;
        shortId?: string; // Código Rápido de variante
        stock: boolean;
        stockQuantity?: number;
        image?: string;
    }[];
    isVisible?: boolean;
    isHiddenInPOS?: boolean;
    unitType?: 'unit' | 'weight'; // 'unit' (default) or 'weight' (kilos)
    unitsPerProduct?: number; // Equivalencia de unidades
    trackInDashboard?: boolean;
    excludeFromStats?: boolean;
    stockDependency?: {
        productId: string;
        unitsToDeduct: number;
    };
    stockReadyTime?: string; // ISO string
    availableAt?: string;
    createdAt?: any;
    updatedAt?: any;
    isCombo?: boolean;
    comboItemsCount?: number;
    comboOptions?: { name: string; image?: string; disabled?: boolean }[];
}

const INITIAL_STATE: FirestoreProduct = {
    nombre: "",
    shortId: "",
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
    isHiddenInPOS: false,
    unitType: 'unit',
    unitsPerProduct: 1,
    trackInDashboard: false,
    excludeFromStats: false,
    requiresRecipe: true,
    stockReadyTime: "",
    availableAt: "",
    isCombo: false,
    comboItemsCount: 6,
    comboOptions: []
};

type ImageEditorTarget =
    | { type: "product" }
    | { type: "variant"; idx: number }
    | { type: "comboOption"; idx: number };

export default function ProductManager({ onGoToRecipe, editModeProductId, onCloseEditMode }: { onGoToRecipe?: (id: string) => void, editModeProductId?: string, onCloseEditMode?: () => void }) {
    const [products, setProducts] = useState<FirestoreProduct[]>([]);
    const [rawMaterials, setRawMaterials] = useState<any[]>([]);
    const [globalCifUnitCost, setGlobalCifUnitCost] = useState(0);
    const [categories, setCategories] = useState<string[]>([]);
    const [formData, setFormData] = useState<FirestoreProduct>(INITIAL_STATE);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortBy, setSortBy] = useState<'a-z' | 'price_desc' | 'price_asc' | 'newest'>('a-z');

    const [isFormVisible, setIsFormVisible] = useState(false);
    const formRef = useRef<HTMLDivElement>(null);
    
    // Stock Adjustment Modal
    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [stockModalProduct, setStockModalProduct] = useState<FirestoreProduct | null>(null);

    const [imageEditorFile, setImageEditorFile] = useState<File | null>(null);
    const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);
    const [imageEditorTarget, setImageEditorTarget] = useState<ImageEditorTarget | null>(null);

    const calculateIngredientCost = (ing: any, recipeMerma: number = 0): number => {
        const mat = rawMaterials.find((m: any) => m.id === ing.rawMaterialId);
        if (!mat || !ing.quantity || !mat.baseQuantity || !mat.price) return 0;

        let matPriceToUse = mat.price;
        if (recipeMerma > 0 && mat.category && ["Prima", "Prima Mermable"].includes(mat.category)) {
            matPriceToUse = mat.price * (1 + (recipeMerma / 100));
        }

        return (ing.quantity / mat.baseQuantity) * matPriceToUse;
    };

    const getRecipeYieldType = (recipe: any, yieldType?: 'units' | 'kg'): 'units' | 'kg' =>
        yieldType || recipe?.yieldType || 'units';

    const getRecipeTotalGrams = (recipe: any, yieldType?: 'units' | 'kg'): number => {
        if (!recipe || !recipe.yield || recipe.yield <= 0) return 0;

        const type = getRecipeYieldType(recipe, yieldType);
        if (type === 'kg') {
            return recipe.yield * 1000;
        }

        if (!recipe.weightPerUnitGrams) return 0;
        return recipe.yield * recipe.weightPerUnitGrams;
    };

    const getRecipeCifUnits = (recipe: any, yieldType?: 'units' | 'kg'): number =>
        getRecipeTotalGrams(recipe, yieldType) / 100;

    const calculateRecipeTotalCost = (recipe: any, yieldType?: 'units' | 'kg'): number => {
        if (!recipe) return 0;
        let baseCost = (recipe.ingredients || []).reduce((total: number, ing: any) => total + calculateIngredientCost(ing, recipe.merma || 0), 0);

        const cifUnits = getRecipeCifUnits(recipe, yieldType);
        if (cifUnits > 0) {
            baseCost += cifUnits * globalCifUnitCost;
        }

        return baseCost;
    };

    const calculateRecipeUnitCost = (recipe: any, yieldType?: 'units' | 'kg'): number => {
        if (!recipe || !recipe.yield || isNaN(recipe.yield) || recipe.yield <= 0) return 0;
        const type = getRecipeYieldType(recipe, yieldType);
        const cost = calculateRecipeTotalCost(recipe, type) / recipe.yield;
        return isNaN(cost) ? 0 : cost;
    };

    const calculateRealProductCost = (product: FirestoreProduct, visitedIds: Set<string> = new Set()): number => {
        if (!product) return 0;
        if (visitedIds.has(product.id!)) return 0;

        visitedIds.add(product.id!);
        let totalCost = 0;

        if (product.stockDependency && product.stockDependency.productId) {
            const parent = products.find(p => p.id === product.stockDependency?.productId);
            if (parent) {
                const parentUnitCost = calculateRealProductCost(parent, visitedIds);
                totalCost += parentUnitCost * (Number(product.stockDependency.unitsToDeduct) || 0);
            }
        }

        if (product.recipe) {
            totalCost += calculateRecipeUnitCost(product.recipe, product.recipe.yieldType || 'units');
        }

        return isNaN(totalCost) ? 0 : totalCost;
    };

    useEffect(() => {
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

    useEffect(() => {
        // Fetch raw materials and config
        const unsubRM = onSnapshot(collection(db, "raw_materials"), (snap) => {
            setRawMaterials(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const unsubConfig = onSnapshot(doc(db, "config", "cif_settings"), (docSnap) => {
            if (docSnap.exists() && docSnap.data().cifUnitCost !== undefined) {
                setGlobalCifUnitCost(docSnap.data().cifUnitCost);
            }
        });

        return () => {
            unsubRM();
            unsubConfig();
        };
    }, []);

    useEffect(() => {
        let unsubscribe: () => void;
        setLoading(true);

        const setupListener = () => {
            unsubscribe = onSnapshot(collection(db, "products"), (snapshot) => {
                const prods: FirestoreProduct[] = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        discount: data.discount || 0,
                        isVisible: data.isVisible !== false,
                        unitType: data.unitType || 'unit',
                        unitsPerProduct: data.unitsPerProduct !== undefined ? data.unitsPerProduct : 1,
                        trackInDashboard: !!data.trackInDashboard,
                        shortId: data.shortId || "",
                        images: data.images || (data.img ? [data.img] : []),
                        stockReadyTime: data.stockReadyTime || "",
                        availableAt: data.availableAt || "",
                    } as FirestoreProduct;
                });
                setProducts(prods);
                setLoading(false);
            }, (error) => {
                console.error("Error listening to products:", error);
                setMessage("Error al cargar productos");
                setLoading(false);
            });
        };

        setupListener();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const reloadProducts = async () => {
        // Handled by onSnapshot now
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
            // Round to 2 decimals on blur
            num = Math.round(num * 100) / 100;
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
            finalValue = Math.round(finalValue * 100) / 100;
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

    const openImageEditor = (files: FileList | File[], target: ImageEditorTarget) => {
        const fileArray = Array.from(files);
        if (!fileArray.length) return;
        setImageEditorTarget(target);
        setImageEditorFile(fileArray[0]);
        setPendingImageFiles(target.type === "product" ? fileArray.slice(1) : []);
    };

    const closeImageEditor = () => {
        setImageEditorFile(null);
        setPendingImageFiles([]);
        setImageEditorTarget(null);
    };

    const uploadProductImageBlob = async (blob: Blob, fileName: string) => {
        const prodId = formData.id || "temp_" + Date.now();
        const storageRef = ref(storage, `products/${prodId}/${Date.now()}_${fileName}.webp`);
        await uploadBytes(storageRef, blob);
        return getDownloadURL(storageRef);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        openImageEditor(files, { type: "product" });
        e.target.value = "";
    };

    const handleImageEditorConfirm = async (blob: Blob) => {
        if (!imageEditorTarget || !imageEditorFile) return;

        setUploading(true);
        try {
            const baseName = imageEditorFile.name.split(".")[0] || "image";
            const downloadURL = await uploadProductImageBlob(blob, baseName);

            if (imageEditorTarget.type === "product") {
                setFormData(prev => {
                    const updatedImages = [...(prev.images || []), downloadURL];
                    return {
                        ...prev,
                        images: updatedImages,
                        img: updatedImages[0] || prev.img
                    };
                });
                setMessage("Imagen subida correctamente");
            } else if (imageEditorTarget.type === "variant") {
                const variantIdx = imageEditorTarget.idx;
                setFormData(prev => {
                    const newVariants = [...(prev.variants || [])];
                    newVariants[variantIdx] = {
                        ...newVariants[variantIdx],
                        image: downloadURL
                    };
                    return { ...prev, variants: newVariants };
                });
                setMessage("Imagen de variante subida");
            } else if (imageEditorTarget.type === "comboOption") {
                const comboIdx = imageEditorTarget.idx;
                setFormData(prev => {
                    const newOptions = [...(prev.comboOptions || [])];
                    newOptions[comboIdx] = {
                        ...newOptions[comboIdx],
                        image: downloadURL
                    };
                    return { ...prev, comboOptions: newOptions };
                });
                setMessage("Imagen de opción subida");
            }

            if (pendingImageFiles.length > 0 && imageEditorTarget.type === "product") {
                setImageEditorFile(pendingImageFiles[0]);
                setPendingImageFiles(prev => prev.slice(1));
            } else {
                closeImageEditor();
            }
        } catch (error) {
            console.error("Error uploading image:", error);
            setMessage("Error al subir imagen");
        } finally {
            setUploading(false);
        }
    };

    // Variant Image Upload
    const handleVariantImageUpload = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        openImageEditor(files, { type: "variant", idx });
        e.target.value = "";
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

    const handleVariantChange = (idx: number, field: 'name' | 'stockQuantity' | 'image' | 'shortId', value: string | number) => {
        setFormData(prev => {
            const newVariants = [...(prev.variants || [])];
            // @ts-ignore
            newVariants[idx][field] = value;
            // @ts-ignore
            if (field === 'stockQuantity') newVariants[idx].stock = Number(value) > 0;
            return { ...prev, variants: newVariants };
        });
    };

    const addComboOption = () => {
        setFormData(prev => ({
            ...prev,
            comboOptions: [...(prev.comboOptions || []), { name: "", image: "" }]
        }));
    };

    const removeComboOption = (idx: number) => {
        setFormData(prev => ({
            ...prev,
            comboOptions: prev.comboOptions?.filter((_, i) => i !== idx)
        }));
    };

    const toggleComboOptionDisabled = (idx: number) => {
        setFormData(prev => {
            const newOptions = [...(prev.comboOptions || [])];
            newOptions[idx] = { ...newOptions[idx], disabled: !newOptions[idx].disabled };
            return { ...prev, comboOptions: newOptions };
        });
    };

    const handleComboOptionChange = (idx: number, value: string) => {
        setFormData(prev => {
            const newOptions = [...(prev.comboOptions || [])];
            newOptions[idx].name = value;
            return { ...prev, comboOptions: newOptions };
        });
    };

    const handleComboOptionImageUpload = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        openImageEditor(files, { type: "comboOption", idx });
        e.target.value = "";
    };

    const removeComboOptionImage = (idx: number) => {
        setFormData(prev => {
            const newOptions = [...(prev.comboOptions || [])];
            const updatedOption = { ...newOptions[idx] };
            delete updatedOption.image;
            newOptions[idx] = updatedOption;
            return { ...prev, comboOptions: newOptions };
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
                await updateDoc(doc(db, "products", id), {
                    ...dataToUpdate,
                    updatedAt: serverTimestamp()
                });

                // Sync children if stock changed
                await syncChildProducts(id, dataToUpdate.stockQuantity || 0);

                setMessage("Producto actualizado correctamente");
            } else {
                await addDoc(collection(db, "products"), {
                    ...formData,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
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
        if (onCloseEditMode) onCloseEditMode();
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

    useEffect(() => {
        if (editModeProductId && products.length > 0 && !isEditing && !isFormVisible) {
            const prodToEdit = products.find(p => p.id === editModeProductId);
            if (prodToEdit) {
                handleEditClick(prodToEdit);
            }
        }
    }, [editModeProductId, products]);

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
    ).sort((a, b) => {
        if (sortBy === 'a-z') {
            const codeA = a.shortId || "";
            const codeB = b.shortId || "";

            if (codeA && codeB) {
                const numA = parseInt(codeA);
                const numB = parseInt(codeB);
                if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
                    return numA - numB;
                }
                return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
            }
            if (codeA) return -1;
            if (codeB) return 1;

            return a.nombre.localeCompare(b.nombre);
        } else if (sortBy === 'price_desc') {
            return b.precio - a.precio;
        } else if (sortBy === 'price_asc') {
            return a.precio - b.precio;
        } else if (sortBy === 'newest') {
            // Newest first based on updatedAt or createdAt
            const timeA = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
            const timeB = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
            return timeB - timeA;
        }
        return 0;
    });

    return (
        <div className={`product-manager-container ${editModeProductId ? 'modal-mode-only' : ''}`}>
            {/* Header del Admin */}
            {!editModeProductId && (
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
            )}

            {/* Modal Formulario */}
            {isFormVisible && (
                <div className="pm-modal-overlay" style={editModeProductId ? { zIndex: 9999 } : {}}>
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

                                    {(!formData.variants || formData.variants.length === 0) && (
                                        <div className="form-group">
                                            <label>Código Rápido (POS)</label>
                                            <input
                                                name="shortId"
                                                value={formData.shortId || ""}
                                                onChange={handleInputChange}
                                                placeholder="Ej. 001"
                                                className="input-lg"
                                                style={{ fontFamily: 'monospace', letterSpacing: '1px', borderColor: '#8b5cf6' }}
                                            />
                                        </div>
                                    )}

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
                                        

                                    </div>

                                    <div className="form-row">
                                        <div className="form-group half">
                                            <label>Tipo de Unidad</label>
                                            <select name="unitType" value={formData.unitType || 'unit'} onChange={handleInputChange}>
                                                <option value="unit">Unidad (u)</option>
                                                <option value="weight">Peso (kg)</option>
                                            </select>
                                        </div>
                                        <div className="form-group quarter">
                                            <label>Unidades (Estadística)</label>
                                            <input type="number" name="unitsPerProduct" value={formData.unitsPerProduct !== undefined ? formData.unitsPerProduct : 1} onChange={handleInputChange} onBlur={handleInputBlur} onWheel={handleWheel} min="0" step="0.1" title="Cuántas unidades representa para el resumen (ej. Facturas x12 = 12)" />
                                        </div>
                                        <div className="form-group quarter">
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

                                    <div className="form-group quarter checkbox-group-styled">
                                        <label>
                                            <input
                                                type="checkbox"
                                                name="isHiddenInPOS"
                                                checked={!!formData.isHiddenInPOS}
                                                onChange={handleInputChange}
                                            />
                                            <strong style={{ color: '#d97706' }}>Ocultar en POS</strong>
                                        </label>
                                    </div>

                                    <div className="form-group quarter checkbox-group-styled">
                                        <label>
                                            <input
                                                type="checkbox"
                                                name="requiresRecipe"
                                                checked={formData.requiresRecipe !== false}
                                                onChange={handleInputChange}
                                            />
                                            Requiere Receta
                                        </label>
                                    </div>

                                    <div className="form-group quarter checkbox-group-styled">
                                        <label>
                                            <input
                                                type="checkbox"
                                                name="trackInDashboard"
                                                checked={!!formData.trackInDashboard}
                                                onChange={handleInputChange}
                                            />
                                            <strong style={{ color: '#8b5cf6' }}>Seguimiento en Dashboard</strong>
                                        </label>
                                    </div>

                                    <div className="form-group quarter checkbox-group-styled">
                                        <label>
                                            <input
                                                type="checkbox"
                                                name="excludeFromStats"
                                                checked={!!formData.excludeFromStats}
                                                onChange={handleInputChange}
                                            />
                                            <strong style={{ color: '#ef4444' }}>Excluir de Estadísticas</strong>
                                        </label>
                                    </div>

                                    {/* Combo Settings */}
                                    <div className="pm-dependency-section" style={{ background: '#e0f2fe', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #bae6fd' }}>
                                        <div className="checkbox-group-styled">
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    name="isCombo"
                                                    checked={!!formData.isCombo}
                                                    onChange={handleInputChange}
                                                />
                                                <strong style={{ color: '#0369a1' }}>Es Combo / Requiere Selección Múltiple</strong>
                                            </label>
                                        </div>

                                        {formData.isCombo && (
                                            <div style={{ marginTop: '15px' }}>
                                                <div className="form-group half" style={{ marginBottom: '15px' }}>
                                                    <label style={{ color: '#0369a1' }}>Cantidad Exacta Requerida (Ej. 6 para media docena)</label>
                                                    <input
                                                        type="number"
                                                        name="comboItemsCount"
                                                        value={formData.comboItemsCount || 0}
                                                        onChange={handleInputChange}
                                                        onBlur={handleInputBlur}
                                                        onWheel={handleWheel}
                                                        min="1"
                                                    />
                                                </div>
                                                
                                                <div className="variants-header" style={{ borderBottom: '1px solid #bae6fd', paddingBottom: '10px', marginBottom: '10px' }}>
                                                    <label style={{ color: '#0369a1' }}>Opciones del Combo</label>
                                                    <button type="button" className="btn-secondary btn-sm" onClick={addComboOption}><FaPlus /> Agregar Opción</button>
                                                </div>
                                                
                                                <div className="variants-list">
                                                    {formData.comboOptions?.map((opt, idx) => (
                                                        <div key={idx} className="variant-row" style={{ alignItems: 'center', gap: '10px', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '5px' }}>
                                                            <div style={{ flex: 1 }}>
                                                                <input
                                                                    placeholder="Ej. Medialuna de Manteca"
                                                                    value={opt.name}
                                                                    onChange={(e) => handleComboOptionChange(idx, e.target.value)}
                                                                />
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                {opt.image ? (
                                                                    <div className="variant-img-preview" style={{ position: 'relative', width: '40px', height: '40px' }}>
                                                                        <img src={opt.image} alt="opt" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => removeComboOptionImage(idx)}
                                                                            style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'red', color: 'white', border: 'none', borderRadius: '50%', width: '15px', height: '15px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                                                        >
                                                                            ×
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <label className="btn-icon-secondary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '5px', border: '1px solid #ddd', borderRadius: '4px' }} title="Subir foto opción">
                                                                        <FaCamera size={14} />
                                                                        <input type="file" hidden accept="image/*" onChange={(e) => handleComboOptionImageUpload(e, idx)} />
                                                                    </label>
                                                                )}

                                                                <button 
                                                                    type="button" 
                                                                    className="btn-icon-secondary" 
                                                                    onClick={() => toggleComboOptionDisabled(idx)}
                                                                    title={opt.disabled ? "Habilitar opción" : "Deshabilitar opción (Sin stock)"}
                                                                    style={{ color: opt.disabled ? '#ef4444' : '#10b981', border: '1px solid #ddd', padding: '5px', borderRadius: '4px', cursor: 'pointer' }}
                                                                >
                                                                    {opt.disabled ? <span style={{ textDecoration: 'line-through', fontWeight: 'bold' }}>S/Stock</span> : <span style={{ fontWeight: 'bold' }}>Stock</span>}
                                                                </button>

                                                                <button type="button" className="btn-icon-danger" onClick={() => removeComboOption(idx)} title="Eliminar opción">
                                                                    <FaTrash />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {(!formData.comboOptions || formData.comboOptions.length === 0) && (
                                                        <p className="text-muted text-sm">No hay opciones configuradas.</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                                           {/* Availability Time Section */}
                                    <div className="form-group" style={{ background: '#fffbeb', padding: '10px', borderRadius: '8px', marginTop: '10px', border: '1px solid #fcd34d' }}>
                                        <label style={{ color: '#b45309' }}><strong>Aviso de Preparación (Hora de disponibilidad)</strong></label>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <input
                                                type="time"
                                                value={formData.availableAt ? new Date(formData.availableAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : ""}
                                                onChange={(e) => {
                                                    const timeVal = e.target.value;
                                                    if (!timeVal) {
                                                        setFormData(prev => ({ ...prev, availableAt: "" }));
                                                        return;
                                                    }
                                                    const [hours, minutes] = timeVal.split(':').map(Number);
                                                    const now = new Date();
                                                    let availableDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
                                                    if (availableDate < now) {
                                                        availableDate.setDate(availableDate.getDate() + 1);
                                                    }
                                                    setFormData(prev => ({ ...prev, availableAt: availableDate.toISOString() }));
                                                }}
                                                style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                                            />
                                            <button type="button" className="btn-icon-danger" title="Limpiar hora" onClick={() => setFormData(prev => ({ ...prev, availableAt: "" }))}>
                                                <FaTrash />
                                            </button>
                                        </div>
                                        {formData.availableAt && (
                                            <div style={{ marginTop: '5px', fontSize: '0.85rem', color: '#b45309' }}>
                                                Estará listo: {new Date(formData.availableAt).toLocaleString('es-AR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}
                                                {new Date(formData.availableAt) < new Date() ? " (Ya disponible)" : ""}
                                            </div>
                                        )}
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
                                                <input type="file" hidden accept="image/*" multiple onChange={handleImageUpload} disabled={uploading || !!imageEditorFile} />
                                            </label>
                                            <small className="image-upload-hint">Se abrirá el editor para recortar en formato 4:3.</small>

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
                                                            placeholder="Cód. Rápido"
                                                            value={v.shortId || ""}
                                                            onChange={(e) => handleVariantChange(idx, 'shortId', e.target.value)}
                                                            className="input-stock"
                                                            style={{ width: '80px', fontFamily: 'monospace' }}
                                                            title="Código Rápido (POS)"
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

            {!editModeProductId && (
                <>
            <div className="inventory-toolbar">
                <div className="search-bar" style={{ display: 'flex', gap: '15px', alignItems: 'center', maxWidth: '600px', flexWrap: 'wrap' }}>
                    <ProductSearch
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Buscar por nombre o categoría..."
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Ordenar:</label>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                color: '#334155',
                                fontSize: '0.9rem',
                                outline: 'none',
                                cursor: 'pointer',
                                minWidth: '150px'
                            }}
                        >
                            <option value="a-z">A-Z / Código</option>
                            <option value="price_desc">Mayor Precio</option>
                            <option value="price_asc">Menor Precio</option>
                            <option value="newest">Última Actual. / Agregado</option>
                        </select>
                    </div>
                </div>
                <div className="inventory-stats">
                    <span className="stat-pill">Total: <strong>{products.length}</strong></span>
                    <button className="btn-secondary btn-sm" onClick={reloadProducts}>
                        <FaSync /> Actualizar
                    </button>
                </div>
            </div>

            {/* Lista de Productos (Compacta) */}
            {
                loading ? (
                    <div className="loading-state">
                        <FaSync className="spin" size={30} />
                        <p>Cargando inventario...</p>
                    </div>
                ) : (
                    <div className="pm-inventory-list">
                        {filteredProducts.map(product => {
                            const totalStock = (product.variants && product.variants.length > 0)
                                ? product.variants.reduce((acc, v) => acc + (v.stockQuantity || 0), 0)
                                : (product.stockQuantity || 0);

                            return (
                                <div key={product.id} className="inventory-list-item">
                                    <div className="list-item-image">
                                        <img src={product.img || product.images?.[0]} alt={product.nombre} className={product.isVisible === false ? "opacity-50" : ""} />
                                        {product.discount ? <span className="badge-discount">-{product.discount}%</span> : null}
                                        <div style={{ position: 'absolute', top: '2px', left: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            {product.isVisible === false && <span className="badge-hidden"><FaEyeSlash /></span>}
                                            {product.isHiddenInPOS && <span className="badge-hidden" style={{ background: '#d97706' }}><FaEyeSlash /></span>}
                                        </div>
                                    </div>

                                    <div className="list-item-content">
                                        <div className="list-item-main-info">
                                            <div className="list-item-title-row">
                                                <h4>{product.nombre}</h4>
                                                {product.shortId && <span className="list-item-code">#{product.shortId}</span>}
                                            </div>
                                            <span className="list-item-category">{product.categoria}</span>
                                        </div>

                                        <div className="list-item-prices">
                                            {(() => {
                                                const realCost = calculateRealProductCost(product);
                                                const hasCost = realCost > 0;
                                                return (
                                                    <>
                                                        <div className="price-block">
                                                            <small>Costo</small>
                                                            <span className="price-cost" style={{ fontSize: '0.95rem', color: '#6b7280', fontWeight: '600' }}>
                                                                {hasCost ? `$${(Math.round(realCost * 100) / 100).toFixed(2)}` : '-'}
                                                            </span>
                                                        </div>
                                                        <div className="price-block">
                                                            <small>Directo</small>
                                                            <span className="price">${(Math.round(product.precio * 100) / 100).toFixed(2)}</span>
                                                        </div>
                                                        <div className="price-block">
                                                            <small>Ganancia</small>
                                                            <span className="price-profit" style={{ fontSize: '0.95rem', color: '#10b981', fontWeight: 'bold' }}>
                                                                {hasCost ? `$${(Math.round((product.precio - realCost) * 100) / 100).toFixed(2)}` : '-'}
                                                            </span>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                            <div className="price-block">
                                                <small>Mayorista</small>
                                                <span className="price-wholesale">${product.wholesalePrice ? (Math.round(product.wholesalePrice * 100) / 100).toFixed(2) : '-'}</span>
                                            </div>
                                        </div>

                                        <div className="list-item-footer">
                                            <div className="list-item-stock">
                                                <span className={`stock-status ${totalStock > 0 ? 'active' : 'inactive'}`}>
                                                    {Math.round(totalStock * 100) / 100} unid.
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setStockModalProduct(product);
                                                        setIsStockModalOpen(true);
                                                    }}
                                                    title="Ajuste Rápido de Stock"
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#3b82f6',
                                                        cursor: 'pointer',
                                                        padding: '4px',
                                                        marginLeft: '8px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                >
                                                    <FaEdit size={14} />
                                                </button>
                                            </div>

                                            <div className="list-item-actions">
                                                {product.requiresRecipe !== false && (
                                                    <div className="list-item-recipe-group">
                                                        {product.recipe && product.recipe.ingredients?.length > 0 ? (
                                                            <FaCheckCircle title="Receta Configurada" className="recipe-check-icon" />
                                                        ) : null}
                                                        <button
                                                            className="btn-action btn-recipe"
                                                            onClick={() => onGoToRecipe && product.id ? onGoToRecipe(product.id) : null}
                                                            title="Ir a la Receta"
                                                        >
                                                            <FaFileSignature /> Receta
                                                        </button>
                                                    </div>
                                                )}
                                                <button className="btn-action edit" onClick={() => handleEditClick(product)} title="Editar">
                                                    <FaEdit />
                                                </button>
                                                <button className="btn-action delete" onClick={() => product.id && handleDelete(product.id)} title="Eliminar">
                                                    <FaTrash />
                                                </button>
                                            </div>
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
                </>
            )}

            {imageEditorFile && imageEditorTarget && (
                <ProductImageEditor
                    imageFile={imageEditorFile}
                    productName={formData.nombre}
                    productPrice={formData.precio}
                    productDiscount={formData.discount}
                    stockQuantity={formData.stockQuantity}
                    onConfirm={handleImageEditorConfirm}
                    onCancel={closeImageEditor}
                    isSaving={uploading}
                    queueLabel={
                        pendingImageFiles.length > 0
                            ? `Quedan ${pendingImageFiles.length} imágenes por editar`
                            : undefined
                    }
                />
            )}

            <StockAdjustmentModal
                isOpen={isStockModalOpen}
                onClose={() => {
                    setIsStockModalOpen(false);
                    setStockModalProduct(null);
                }}
                product={stockModalProduct as any}
            />
        </div >
    );
}
