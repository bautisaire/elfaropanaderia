const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const { MercadoPagoConfig, Preference } = require("mercadopago");

admin.initializeApp();
const db = admin.firestore();

require('dotenv').config();

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });

exports.createPreference = onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== 'POST') {
            return res.status(405).send('Method Not Allowed');
        }

        try {
            const { items, orderId } = req.body;

            const body = {
                items: items.map(item => ({
                    title: item.name,
                    quantity: Number(item.quantity),
                    unit_price: Number(item.price),
                    currency_id: "ARS"
                })),
                back_urls: {
                    success: "https://www.elfaropanificacion.com/carrito",
                    failure: "https://www.elfaropanificacion.com/carrito",
                    pending: "https://www.elfaropanificacion.com/carrito"
                },
                auto_return: "approved",
                notification_url: `https://us-central1-el-faro-panaderia.cloudfunctions.net/mercadopagoWebhook?id=${orderId}`,
                // Nota: ID en query param para identificar orden, o usar external_reference
                external_reference: orderId
            };

            const preference = new Preference(client);
            const result = await preference.create({ body });

            res.json({
                id: result.id,
                init_point: result.init_point
            });

        } catch (error) {
            console.error("Error creating preference:", error);
            res.status(500).json({ error: "Error al crear la preferencia de pago" });
        }
    });
});

exports.mercadopagoWebhook = onRequest(async (req, res) => {
    const paymentId = req.query.id || req.body.data?.id;
    const topic = req.query.topic || req.body.type;
    // Mercado Pago envía datos en body.data.id y type: 'payment'

    try {
        if (topic === 'payment') {
            // Aquí se consultaría a la API de MP para verificar el estado real del pago usando el paymentId
            // Por simplicidad, asumimos éxito si llegó el webhook, pero LO CORRECTO es consultar.
            // TODO: Implementar consulta de pago a MP.

            console.log("Payment notification received for:", paymentId);

            const { Payment } = require("mercadopago");
            const payment = await new Payment(client).get({ id: paymentId });

            if (payment && payment.status === 'approved') {
                const orderId = payment.external_reference;
                if (orderId) {
                    await db.collection("orders").doc(orderId).update({
                        status: 'pendiente', // Now visible in dashboard
                        paymentStatus: 'approved',
                        paymentId: paymentId.toString(),
                        paymentDate: new Date()
                    });
                    console.log(`Order ${orderId} confirmed via webhook.`);
                }
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Webhook error:", error);
        res.sendStatus(500);
    }
});

exports.processOrder = onCall(async (request) => {
    try {
        const { cart, formData, shippingCost, finalTotal, userId } = request.data;

        if (!cart || !Array.isArray(cart) || cart.length === 0) {
            throw new HttpsError("invalid-argument", "El carrito está vacío o es inválido.");
        }

        // Helper function
        const getBaseId = (item) => {
            if (item.productId) return String(item.productId);
            const match = item.name ? item.name.match(/\(([^)]+)\)$/) : null;
            const variantName = match ? match[1] : null;

            if (variantName) {
                const suffix = `-${variantName}`;
                if (String(item.id).endsWith(suffix)) {
                    return String(item.id).substring(0, String(item.id).length - suffix.length);
                }
            }
            return String(item.id);
        };

        const result = await db.runTransaction(async (transaction) => {
            // 1. Gather product docs
            const productIdsToRead = new Set();
            cart.forEach(item => {
                productIdsToRead.add(getBaseId(item));
            });

            const uniqueIds = Array.from(productIdsToRead);
            const refs = uniqueIds.map(id => db.collection("products").doc(id));
            const docsSnap = await Promise.all(refs.map(ref => transaction.get(ref)));
            
            const productDocsMap = {};
            docsSnap.forEach((snap, i) => { if (snap.exists) productDocsMap[uniqueIds[i]] = snap.data(); });

            // Check Pack dependencies
            const parentIdsToFetch = new Set();
            cart.forEach(item => {
                const baseId = getBaseId(item);
                const pData = productDocsMap[baseId];
                if (pData?.stockDependency?.productId) parentIdsToFetch.add(pData.stockDependency.productId);
            });

            if (parentIdsToFetch.size > 0) {
                const parentRefs = Array.from(parentIdsToFetch).map(id => db.collection("products").doc(id));
                const parentSnaps = await Promise.all(parentRefs.map(ref => transaction.get(ref)));
                parentSnaps.forEach((snap, i) => { if (snap.exists) productDocsMap[Array.from(parentIdsToFetch)[i]] = snap.data(); });
            }

            // Read Counter
            const counterRef = db.collection("config").doc("order_counter");
            const counterSnap = await transaction.get(counterRef);
            let currentOrderId = 1000;
            if (counterSnap.exists) {
                currentOrderId = (counterSnap.data().current || 999) + 1;
            }

            const productsToUpdate = new Set();
            const stockMovementsToLog = [];
            const stockAlertsToLog = [];

            // 2. Validate & Deduct Stock
            for (const item of cart) {
                const baseId = getBaseId(item);
                const productData = productDocsMap[baseId];
                if (!productData) throw new HttpsError("failed-precondition", `Producto no encontrado: ${item.name}`);

                const qty = Number(item.quantity) || 1;

                // Pack/Derived
                if (productData.stockDependency && productData.stockDependency.productId) {
                    const parentId = productData.stockDependency.productId;
                    const parentData = productDocsMap[parentId];
                    if (!parentData) throw new HttpsError("failed-precondition", `Producto padre no encontrado para: ${item.name}`);

                    const unitsToDeduct = Number(productData.stockDependency.unitsToDeduct) || 1;
                    const totalDeduct = qty * unitsToDeduct;
                    const currentStock = Number(parentData.stockQuantity) || 0;

                    if (currentStock < totalDeduct) throw new HttpsError("failed-precondition", `Stock insuficiente: ${item.name} (Pack)`);

                    parentData.stockQuantity = currentStock - totalDeduct;
                    parentData.stock = parentData.stockQuantity > 0;
                    productsToUpdate.add(parentId);

                    stockMovementsToLog.push({
                        productId: parentId, productName: parentData.nombre, quantity: totalDeduct,
                        observation: `Venta Derivado: ${item.name}`
                    });
                    
                    if(parentData.stockQuantity <= (parentData.minStock || 0)) {
                        stockAlertsToLog.push({
                            productId: parentId,
                            productName: parentData.nombre,
                            message: `Stock bajo para ${parentData.nombre}. Nivel actual: ${parentData.stockQuantity}`,
                            createdAt: new Date(),
                            status: 'unread'
                        });
                    }

                } else {
                    // Standard/Variant
                    let variantName = "";
                    const match = item.name.match(/\(([^)]+)\)$/);
                    if (match) variantName = match[1];

                    if (variantName && productData.variants) {
                        const vIdx = productData.variants.findIndex(v => v.name === variantName);
                        if (vIdx < 0) throw new HttpsError("failed-precondition", `Variante no encontrada: ${variantName}`);

                        const variant = productData.variants[vIdx];
                        const currentStock = Number(variant.stockQuantity) || 0;

                        if (currentStock < qty) throw new HttpsError("failed-precondition", `Stock insuficiente: ${item.name} (${variantName})`);

                        variant.stockQuantity = currentStock - qty;
                        variant.stock = variant.stockQuantity > 0;
                        productsToUpdate.add(baseId);
                    } else {
                        const currentStock = Number(productData.stockQuantity) || 0;
                        if (currentStock < qty) throw new HttpsError("failed-precondition", `Stock insuficiente: ${item.name}`);

                        productData.stockQuantity = currentStock - qty;
                        productData.stock = productData.stockQuantity > 0;
                        productsToUpdate.add(baseId);
                    }

                    stockMovementsToLog.push({
                        productId: baseId, productName: item.name, quantity: qty,
                        observation: `Pedido Web${variantName ? ` (Var: ${variantName})` : ''}`
                    });
                    
                    if(productData.stockQuantity <= (productData.minStock || 0)) {
                         stockAlertsToLog.push({
                            productId: baseId,
                            productName: productData.nombre,
                            message: `Stock bajo para ${productData.nombre}. Nivel actual: ${productData.stockQuantity}`,
                            createdAt: new Date(),
                            status: 'unread'
                        });
                    }
                }
            }

            // 3. Write updates
            productsToUpdate.forEach(pid => {
                const d = productDocsMap[pid];
                transaction.update(db.collection("products").doc(pid), {
                    stockQuantity: d.stockQuantity, stock: d.stock, variants: d.variants || []
                });
            });

            // Update counter
            transaction.set(counterRef, { current: currentOrderId }, { merge: true });

            // Write Order
            const orderIdString = currentOrderId.toString();
            const orderRef = db.collection("orders").doc(orderIdString);

            const finalItems = [...cart];
            if (shippingCost > 0) {
                finalItems.push({
                    id: 'shipping-cost',
                    name: 'Envío',
                    price: shippingCost,
                    quantity: 1,
                    image: '',
                    stock: true
                });
            }

            const newOrderData = {
                id: orderIdString,
                items: finalItems,
                total: Number(finalTotal) || 0,
                cliente: {
                    ...formData,
                    deviceId: userId || 'unknown'
                },
                date: new Date(),
                status: formData.metodoPago === 'mercadopago' ? "pending_payment" : "pending",
                paymentMethod: formData.metodoPago,
                userId: userId || null
            };
            transaction.set(orderRef, newOrderData);

            // Log Movements
            stockMovementsToLog.forEach(mov => {
                const mRef = db.collection("stock_movements").doc();
                transaction.set(mRef, {
                    ...mov,
                    type: 'OUT',
                    reason: formData.metodoPago === 'mercadopago' ? 'Venta Online (MP)' : 'Venta Online',
                    date: new Date()
                });
            });

            // Log Alerts
            stockAlertsToLog.forEach(alert => {
                 const aRef = db.collection("stock_alerts").doc();
                 transaction.set(aRef, alert);
            });

            return { orderId: orderIdString, productsToUpdate: Array.from(productsToUpdate).map(id => ({ id, newStock: productDocsMap[id].stockQuantity })) };
        });

        // 4. Handle MP Preference creation (outside transaction)
        let init_point = null;
        if (formData.metodoPago === 'mercadopago') {
            try {
                const preferenceItems = [...cart, ...(shippingCost > 0 ? [{ id: 'shipping-cost', name: 'Envío', price: shippingCost, quantity: 1, stock: true }] : [])];
                
                const body = {
                    items: preferenceItems.map(item => ({
                        title: item.name,
                        quantity: Number(item.quantity),
                        unit_price: Number(item.price),
                        currency_id: "ARS"
                    })),
                    back_urls: {
                        success: "https://www.elfaropanificacion.com/carrito?status=approved&external_reference=" + result.orderId,
                        failure: "https://www.elfaropanificacion.com/carrito",
                        pending: "https://www.elfaropanificacion.com/carrito"
                    },
                    auto_return: "approved",
                    notification_url: `https://us-central1-el-faro-panaderia.cloudfunctions.net/mercadopagoWebhook?id=${result.orderId}`,
                    external_reference: result.orderId
                };

                const preference = new Preference(client);
                const mpResult = await preference.create({ body });
                init_point = mpResult.init_point;
            } catch (mpError) {
                console.error("Error generating MP preference after order saved:", mpError);
                // Order created but MP payment failed to start
                return { success: true, orderId: result.orderId, error_mp: true };
            }
        }

        return { 
            success: true, 
            orderId: result.orderId, 
            init_point: init_point,
            productsToUpdate: result.productsToUpdate // Send this back in case frontend logic needs syncing
        };

    } catch (error) {
        console.error("Error processOrder:", error);
        throw new HttpsError("internal", error.message || "Error interno al procesar el pedido.");
    }
});
