import { useState } from "react";
import { FaChevronDown, FaChevronUp, FaPen } from "react-icons/fa";
import { DndContext, closestCenter, DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ProductCard from "./ProductCard";
import { Product } from "../context/CartContext";
import "../pages/Home.css"; // Reuse existing styles

interface CategorySliderProps {
    category: string;
    products: Product[];
    onOpenDetails?: (product: Product) => void;
    // Edición del orden (solo admin)
    canEdit?: boolean;
    editMode?: boolean;
    editLocked?: boolean;
    onToggleEdit?: () => void;
    onReorder?: (category: string, orderedIds: string[]) => void;
}

// Tarjeta arrastrable: el contenido queda inerte para que el toque no abra el producto ni agregue al carrito
function SortableProduct({ product }: { product: Product }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(product.id) });
    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: isDragging ? 5 : 1,
                opacity: isDragging ? 0.6 : 1,
                filter: 'grayscale(1)',
                userSelect: 'none',
            }}
        >
            <div style={{ pointerEvents: 'none' }}>
                <ProductCard product={product} />
            </div>
        </div>
    );
}

export default function CategorySlider({ category, products, onOpenDetails, canEdit, editMode, editLocked, onToggleEdit, onReorder }: CategorySliderProps) {
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const ids = products.map(p => String(p.id));
        const from = ids.indexOf(String(active.id));
        const to = ids.indexOf(String(over.id));
        if (from < 0 || to < 0) return;
        onReorder?.(category, arrayMove(ids, from, to));
    };

    // Función auxiliar para determinar si un producto no tiene stock
    const isOutOfStock = (p: Product) => {
        if (p.variants && p.variants.length > 0) {
            return p.variants.every((v) =>
                v.stockQuantity !== undefined ? v.stockQuantity <= 0 : !v.stock
            );
        }
        return p.stockQuantity !== undefined ? p.stockQuantity <= 0 : p.stock === false;
    };

    // Particionar productos
    const outOfStockProducts = products.filter(isOutOfStock);
    const inStockProducts = products.filter(p => !isOutOfStock(p));

    // Verificamos si todos los productos están sin stock en esta categoría
    const allOutOfStock = products.length > 0 && inStockProducts.length === 0;

    const [isExpanded, setIsExpanded] = useState(!allOutOfStock);
    const [showOutOfStock, setShowOutOfStock] = useState(false);

    return (
        <div
            className="category-section"
            id={category.replace(/\s+/g, '-')}
            style={editMode ? { background: '#e2e8f0', borderRadius: '12px', padding: '8px 0', marginBottom: '12px' } : undefined}
        >
            <h2
                className="category-title"
                onClick={() => allOutOfStock && setIsExpanded(!isExpanded)}
                style={{
                    cursor: allOutOfStock ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    opacity: allOutOfStock ? 0.7 : 1,
                    transition: 'opacity 0.2s',
                    paddingRight: '16px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {category}
                    {canEdit && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleEdit?.(); }}
                            disabled={editMode && editLocked}
                            title={editMode && editLocked ? 'Guardá o descartá los cambios para salir' : undefined}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                padding: '4px 10px',
                                borderRadius: '999px',
                                border: '1px solid #94a3b8',
                                background: editMode ? '#475569' : '#fff',
                                color: editMode ? '#fff' : '#475569',
                                cursor: editMode && editLocked ? 'not-allowed' : 'pointer',
                                opacity: editMode && editLocked ? 0.6 : 1,
                                textTransform: 'none'
                            }}
                        >
                            <FaPen size={10} /> {editMode ? 'Salir' : 'Editar'}
                        </button>
                    )}
                </div>
                {allOutOfStock && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888' }}>
                        <span style={{ fontSize: '1rem', fontWeight: '500' }}>(Sin Stock)</span>
                        <span style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center' }}>
                            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                        </span>
                    </div>
                )}
            </h2>

            {editMode ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={products.map(p => String(p.id))} strategy={rectSortingStrategy}>
                        <div className="products-slider">
                            {products.map((p) => (
                                <SortableProduct key={p.id} product={p} />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            ) : isExpanded && (
                <>
                    {/* Productos CON stock */}
                    {inStockProducts.length > 0 && (
                        <div className="products-slider">
                            {inStockProducts.map((p) => (
                                <ProductCard key={p.id} product={p} onOpenDetails={onOpenDetails} />
                            ))}
                        </div>
                    )}

                    {/* Botón y contenedor para productos SIN stock (cuando hay productos con stock) */}
                    {!allOutOfStock && outOfStockProducts.length > 0 && (
                        <div className="out-of-stock-section">
                            <button
                                onClick={() => setShowOutOfStock(!showOutOfStock)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: 'none',
                                    border: 'none',
                                    color: '#888',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    width: '100%',
                                    justifyContent: 'center',
                                    marginBottom: showOutOfStock ? '0' : '10px'
                                }}
                            >
                                {showOutOfStock ? 'Ocultar productos agotados' : `Ver productos agotados (${outOfStockProducts.length})`}
                                {showOutOfStock ? <FaChevronUp /> : <FaChevronDown />}
                            </button>

                            {showOutOfStock && (
                                <div className="products-slider" style={{ opacity: 0.75 }}>
                                    {outOfStockProducts.map((p) => (
                                        <ProductCard key={p.id} product={p} onOpenDetails={onOpenDetails} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Si TODA la categoría está sin stock, los mostramos directamente (ya que el título sirve de toggle) */}
                    {allOutOfStock && (
                        <div className="products-slider" style={{ opacity: 0.75 }}>
                            {outOfStockProducts.map((p) => (
                                <ProductCard key={p.id} product={p} onOpenDetails={onOpenDetails} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
