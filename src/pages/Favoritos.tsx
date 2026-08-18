import { useEffect, useState } from "react";
import { FaHeart } from "react-icons/fa";
import ProductSkeleton from "../components/ProductSkeleton";
import CategorySlider from "../components/CategorySlider";
import ProductDetailsModal from "../components/ProductDetailsModal";
import AuthForm from "../components/AuthForm";
import { Product, useCart } from "../context/CartContext";
import "./Home.css";
import "./Favoritos.css";

export default function Favoritos() {
    const {
        catalogProducts: products,
        catalogLoading: loading,
        favorites,
        user,
        getCatalogProduct,
    } = useCart();

    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

    // Modal de detalle: mantener producto sincronizado con el catálogo en vivo
    useEffect(() => {
        if (!selectedProduct) return;
        const live = getCatalogProduct(String(selectedProduct.id));
        if (live) setSelectedProduct(live);
    }, [products, selectedProduct?.id, getCatalogProduct]);

    if (!user) {
        return (
            <div className="home-container">
                <div className="favoritos-login-prompt">
                    <FaHeart size={50} color="#fecdd3" />
                    <h2>Iniciá sesión para ver tus favoritos</h2>
                    <p>Guardá tus productos preferidos tocando el corazón en cada producto de la tienda.</p>
                    <div className="favoritos-login-form">
                        <AuthForm />
                    </div>
                </div>
            </div>
        );
    }

    const favoriteProducts = products.filter((p) => favorites.includes(String(p.id)));

    const groupedByCategory = favoriteProducts.reduce((acc, product) => {
        const category = product.categoria || "Otros";
        if (!acc[category]) acc[category] = [];
        acc[category].push(product);
        return acc;
    }, {} as Record<string, Product[]>);

    return (
        <div className="home-container">
            <div className="favoritos-header">
                <h1>Mis Favoritos</h1>
                <p>Los productos que marcaste con el corazón.</p>
            </div>

            <div className="home">
                {loading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                        <ProductSkeleton key={index} />
                    ))
                ) : favoriteProducts.length === 0 ? (
                    <div className="favoritos-empty-state">
                        <FaHeart size={50} color="#fecdd3" />
                        <h3>Todavía no tenés favoritos</h3>
                        <p>Tocá el corazón en cualquier producto de la tienda para guardarlo acá.</p>
                    </div>
                ) : (
                    Object.entries(groupedByCategory).map(([category, categoryProducts]) => (
                        <CategorySlider
                            key={category}
                            category={category}
                            products={categoryProducts}
                            onOpenDetails={setSelectedProduct}
                        />
                    ))
                )}
            </div>

            {selectedProduct && (
                <ProductDetailsModal
                    product={selectedProduct}
                    onClose={() => setSelectedProduct(null)}
                />
            )}
        </div>
    );
}
