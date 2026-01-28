import { useState, useEffect } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, addDoc, doc, Timestamp, query, orderBy, onSnapshot, runTransaction } from "firebase/firestore";
import { FaSave, FaPlus, FaTrash } from "react-icons/fa";
import "./ProductManager.css";

export default function ExpenseTicketForm() {
    const [type, setType] = useState('materia_prima'); // 'materia_prima', 'servicio', 'otro'
    const [description, setDescription] = useState("");
    const [ticketTotal, setTicketTotal] = useState(0);
    const [materials, setMaterials] = useState<any[]>([]);

    // Lista de items del ticket (solo para Materia Prima)
    const [ticketItems, setTicketItems] = useState<any[]>([]);

    // Estado temporal para agregar un item
    const [selectedMaterialId, setSelectedMaterialId] = useState("");
    const [quantity, setQuantity] = useState(0);
    const [unitPrice, setUnitPrice] = useState(0);

    // Fetch Materials para el select
    useEffect(() => {
        const q = query(collection(db, "raw_materials"), orderBy("name"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    // Update unitPrice when material is selected (auto-fill current price)
    useEffect(() => {
        if (selectedMaterialId) {
            const mat = materials.find(m => m.id === selectedMaterialId);
            if (mat) {
                setUnitPrice(mat.currentPrice || 0);
            }
        }
    }, [selectedMaterialId, materials]);

    const addItem = () => {
        if (!selectedMaterialId || quantity <= 0 || unitPrice <= 0) {
            alert("Completa los datos del ítem");
            return;
        }
        const mat = materials.find(m => m.id === selectedMaterialId);

        const newItem = {
            materialId: selectedMaterialId,
            name: mat.name,
            quantity: Number(quantity),
            unitPrice: Number(unitPrice),
            subtotal: Number(quantity) * Number(unitPrice)
        };

        setTicketItems([...ticketItems, newItem]);
        setTicketTotal(prev => prev + newItem.subtotal);

        // Reset inputs
        setQuantity(0);
        setUnitPrice(0);
        setSelectedMaterialId("");
    };

    const removeItem = (index: number) => {
        const item = ticketItems[index];
        setTicketTotal(prev => prev - item.subtotal);
        setTicketItems(ticketItems.filter((_, i) => i !== index));
    };

    const handeSubmit = async () => {
        if (type === 'materia_prima' && ticketItems.length === 0) {
            alert("Agrega al menos un ítem al ticket");
            return;
        }
        if ((type === 'servicio' || type === 'otro') && !description) {
            alert("Agrega una descripción");
            return;
        }

        try {
            if (type === 'materia_prima') {
                // Transacción para guardar ticket Y actualizar stock/precio
                await runTransaction(db, async (transaction) => {
                    // 1. Crear el Ticket
                    const ticketRef = doc(collection(db, "expenses"));
                    transaction.set(ticketRef, {
                        date: Timestamp.now(),
                        type,
                        description: "Compra Materia Prima",
                        totalAmount: ticketTotal,
                        items: ticketItems
                    });

                    // 2. Actualizar cada Materia Prima
                    for (const item of ticketItems) {
                        const matRef = doc(db, "raw_materials", item.materialId);
                        const matDoc = await transaction.get(matRef);
                        if (!matDoc.exists()) throw "Material doesn't exist!";

                        const matData = matDoc.data();
                        const oldPrice = matData.currentPrice;
                        const newPrice = item.unitPrice;

                        let history = matData.priceHistory || [];

                        // Si el precio cambió, guardar historial
                        if (oldPrice !== newPrice) {
                            history.push({
                                date: Timestamp.now(),
                                price: Number(oldPrice)
                            });
                        }

                        const newStock = (Number(matData.stockQuantity) || 0) + Number(item.quantity);

                        transaction.update(matRef, {
                            currentPrice: newPrice,
                            stockQuantity: newStock,
                            priceHistory: history
                        });
                    }
                });

            } else {
                // Gasto simple (Servicio/Otro)
                await addDoc(collection(db, "expenses"), {
                    date: Timestamp.now(),
                    type,
                    description,
                    totalAmount: Number(ticketTotal), // User manually enters logic for total below
                    items: []
                });
            }

            alert("Ticket registrado correctamente!");
            // Reset Form
            setTicketItems([]);
            setTicketTotal(0);
            setDescription("");
            setQuantity(0);
        } catch (error) {
            console.error("Error creating ticket:", error);
            alert("Error al registrar gasto");
        }
    };

    return (
        <div className="product-manager-container">
            <h3>Registrar Gasto / Ticket de Compra</h3>

            <div className="form-group">
                <label>Tipo de Gasto:</label>
                <select value={type} onChange={e => setType(e.target.value)}>
                    <option value="materia_prima">Compra Materia Prima</option>
                    <option value="servicio">Servicio (Luz, Gas, Alquiler)</option>
                    <option value="otro">Otro</option>
                </select>
            </div>

            {type === 'materia_prima' ? (
                <div style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h4>Items del Ticket</h4>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '15px' }}>
                        <div style={{ flex: 2 }}>
                            <label>Materia Prima:</label>
                            <select value={selectedMaterialId} onChange={e => setSelectedMaterialId(e.target.value)} style={{ width: '100%' }}>
                                <option value="">Seleccionar...</option>
                                {materials.map(m => (
                                    <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ flex: 1 }}>
                            <label>Cantidad:</label>
                            <input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} placeholder="0" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label>Precio Unitario ($):</label>
                            <input type="number" value={unitPrice} onChange={e => setUnitPrice(Number(e.target.value))} placeholder="$" />
                        </div>
                        <button className="add-btn" onClick={addItem} style={{ marginBottom: '2px' }}><FaPlus /></button>
                    </div>

                    <table className="pm-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Cant.</th>
                                <th>Precio Unit.</th>
                                <th>Subtotal</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {ticketItems.map((item, idx) => (
                                <tr key={idx}>
                                    <td>{item.name}</td>
                                    <td>{item.quantity}</td>
                                    <td>${item.unitPrice}</td>
                                    <td>${item.subtotal}</td>
                                    <td><button className="action-btn delete" onClick={() => removeItem(idx)}><FaTrash /></button></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>Total Ticket:</td>
                                <td style={{ fontWeight: 'bold', fontSize: '1.1em' }}>${ticketTotal}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ) : (
                <>
                    <div className="form-group">
                        <label>Descripción:</label>
                        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Factura de Luz Enero" />
                    </div>
                    <div className="form-group">
                        <label>Monto Total ($):</label>
                        <input type="number" value={ticketTotal} onChange={e => setTicketTotal(Number(e.target.value))} />
                    </div>
                </>
            )}

            <button className="save-btn" onClick={handeSubmit} style={{ width: '100%', marginTop: '10px', padding: '15px', fontSize: '1.1em' }}>
                <FaSave /> Registrar Ticket ({type === 'materia_prima' ? `Total $${ticketTotal}` : `$${ticketTotal}`})
            </button>

        </div>
    );
}
