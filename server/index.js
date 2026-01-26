
import express from "express";
import cors from "cors";
import { MercadoPagoConfig, Preference } from "mercadopago";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Mercado Pago Configuration
const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

app.get("/", (req, res) => {
    res.send("Backend de El Faro Panadería funcionando 🚀");
});


app.post("/create_preference", async (req, res) => {
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
                success: "https://elfaropanaderia.web.app/success", // Pending: Replace with real URL
                failure: "https://elfaropanaderia.web.app/failure",
                pending: "https://elfaropanaderia.web.app/pending"
            },
            auto_return: "approved",
            notification_url: "https://your-webhook-url.com/webhook", // Pending: Update after deploy
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

// Webhook to receive payment updates
app.post("/webhook", async (req, res) => {
    const paymentId = req.query.id;

    try {
        if (req.query.topic === 'payment') {
            console.log("Payment received:", paymentId);
            // Here we will update Firebase
            // Implementation pending until deployment URL is confirmed
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Webhook error:", error);
        res.sendStatus(500);
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
