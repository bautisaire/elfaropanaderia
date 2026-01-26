const { onRequest } = require("firebase-functions/v2/https");
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
