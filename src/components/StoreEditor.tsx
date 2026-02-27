import { useState } from 'react';
import CategoryManager from './CategoryManager';
import HeroManager from './HeroManager';
import StoreStatusManager from './StoreStatusManager';
import { FaFolder, FaImages, FaStore, FaUsers } from 'react-icons/fa';
import './StoreEditor.css';

import UsersManager from './UsersManager';

export default function StoreEditor() {
    const [activeTab, setActiveTab] = useState<'categories' | 'hero' | 'status' | 'users'>('categories');

    return (
        <div className="store-editor-container">
            <h2 className="store-editor-title">Editor de Tienda</h2>

            <div className="store-editor-tabs">
                <button
                    className={`store-tab-btn ${activeTab === 'categories' ? 'active' : ''}`}
                    onClick={() => setActiveTab('categories')}
                >
                    <FaFolder /> Categorías
                </button>
                <button
                    className={`store-tab-btn ${activeTab === 'hero' ? 'active' : ''}`}
                    onClick={() => setActiveTab('hero')}
                >
                    <FaImages /> Portadas
                </button>
                <button
                    className={`store-tab-btn ${activeTab === 'status' ? 'active' : ''}`}
                    onClick={() => setActiveTab('status')}
                >
                    <FaStore /> Estado y Horarios
                </button>
                <button
                    className={`store-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    <FaUsers /> Usuarios
                </button>
            </div>

            <div className="store-editor-content">
                {activeTab === 'categories' && <CategoryManager />}
                {activeTab === 'hero' && <HeroManager />}
                {activeTab === 'status' && <StoreStatusManager />}
                {activeTab === 'users' && <UsersManager />}
            </div>
        </div>
    );
}
