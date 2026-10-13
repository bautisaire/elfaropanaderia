import { useState } from 'react';
import HeroManager from './HeroManager';
import HeroCardsManager from './HeroCardsManager';
import StoreStatusManager from './StoreStatusManager';
import RaffleManager from './RaffleManager';
import { FaImages, FaClone, FaStore, FaUsers, FaGift } from 'react-icons/fa';
import './StoreEditor.css';

import UsersManager from './UsersManager';
import { useCart } from '../context/CartContext';

export default function StoreEditor() {
    const { adminPermissions } = useCart();
    const [activeTab, setActiveTab] = useState<'hero' | 'cards' | 'status' | 'users' | 'raffle'>('hero');

    return (
        <div className="store-editor-container">
            <h2 className="store-editor-title">Tienda Online</h2>

            <div className="store-editor-tabs">
                <button
                    className={`store-tab-btn ${activeTab === 'hero' ? 'active' : ''}`}
                    onClick={() => setActiveTab('hero')}
                >
                    <FaImages /> Portadas
                </button>
                <button
                    className={`store-tab-btn ${activeTab === 'cards' ? 'active' : ''}`}
                    onClick={() => setActiveTab('cards')}
                >
                    <FaClone /> Cartas
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
                {adminPermissions?.raffle !== false && (
                    <button
                        className={`store-tab-btn ${activeTab === 'raffle' ? 'active' : ''}`}
                        onClick={() => setActiveTab('raffle')}
                    >
                        <FaGift /> Sorteos
                    </button>
                )}
            </div>

            <div className="store-editor-content">
                {activeTab === 'hero' && <HeroManager />}
                {activeTab === 'cards' && <HeroCardsManager />}
                {activeTab === 'status' && <StoreStatusManager />}
                {activeTab === 'users' && <UsersManager />}
                {activeTab === 'raffle' && adminPermissions?.raffle !== false && <RaffleManager />}
            </div>
        </div>
    );
}
