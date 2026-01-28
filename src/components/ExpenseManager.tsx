import { useState } from "react";
import RawMaterialList from "./RawMaterialList";
import ExpenseTicketForm from "./ExpenseTicketForm";
import "./ProductManager.css";

export default function ExpenseManager() {
    const [activeTab, setActiveTab] = useState<'materials' | 'ticket'>('ticket');

    return (
        <div className="admin-container">
            <div className="admin-tabs">
                <button
                    className={`tab-btn ${activeTab === 'ticket' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ticket')}
                >
                    Registrar Gastos / Compras
                </button>
                <button
                    className={`tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
                    onClick={() => setActiveTab('materials')}
                >
                    Gestionar Materia Prima
                </button>
            </div>

            <div className="admin-content">
                {activeTab === 'ticket' ? <ExpenseTicketForm /> : <RawMaterialList />}
            </div>
        </div>
    );
}
