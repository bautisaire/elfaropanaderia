import { useParams, useNavigate } from 'react-router-dom';
import { FaBoxOpen, FaFolder } from 'react-icons/fa';
import ProductManager from './ProductManager';
import CategoryManager from './CategoryManager';
import { useCart } from '../context/CartContext';
import './CostManager.css';

// Sección "Productos" del panel: el catálogo y sus categorías.
export default function ProductsSection() {
    const { "*": tab } = useParams();
    const navigate = useNavigate();
    const { adminPermissions } = useCart();
    // Rol "solo stock": ve el catálogo pero no puede crear, editar ni borrar productos.
    const stockOnly = adminPermissions?.costs === false && adminPermissions?.products_stock_only === true;
    const activeTab = tab === 'categories' && !stockOnly ? 'categories' : 'list';

    return (
        <div className="cost-manager-container">
            <header className="cm-header">
                <h2>Productos</h2>
                <div className="cm-tabs">
                    <button
                        className={`cm-tab ${activeTab === 'list' ? 'active' : ''}`}
                        onClick={() => navigate('/editor/products')}
                    >
                        <FaBoxOpen /> Productos
                    </button>
                    {!stockOnly && <button
                        className={`cm-tab ${activeTab === 'categories' ? 'active' : ''}`}
                        onClick={() => navigate('/editor/products/categories')}
                    >
                        <FaFolder /> Categorías
                    </button>}
                </div>
            </header>

            <main className="cm-content">
                {activeTab === 'list' && (
                    <ProductManager stockOnly={stockOnly} onGoToRecipe={(id) => navigate('/editor/costs/recipes', { state: { productId: id } })} />
                )}
                {activeTab === 'categories' && <CategoryManager />}
            </main>
        </div>
    );
}
