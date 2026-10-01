import { useParams, useNavigate } from 'react-router-dom';
import { FaBoxOpen, FaFolder } from 'react-icons/fa';
import ProductManager from './ProductManager';
import CategoryManager from './CategoryManager';
import './CostManager.css';

// Sección "Productos" del panel: el catálogo y sus categorías.
export default function ProductsSection() {
    const { "*": tab } = useParams();
    const navigate = useNavigate();
    const activeTab = tab === 'categories' ? 'categories' : 'list';

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
                    <button
                        className={`cm-tab ${activeTab === 'categories' ? 'active' : ''}`}
                        onClick={() => navigate('/editor/products/categories')}
                    >
                        <FaFolder /> Categorías
                    </button>
                </div>
            </header>

            <main className="cm-content">
                {activeTab === 'list' && (
                    <ProductManager onGoToRecipe={(id) => navigate('/editor/costs/recipes', { state: { productId: id } })} />
                )}
                {activeTab === 'categories' && <CategoryManager />}
            </main>
        </div>
    );
}
