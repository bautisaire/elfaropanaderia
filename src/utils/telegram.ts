
// Reemplaza con tus credenciales reales o usa variables de entorno
const BOT_TOKEN = "8084232974:AAH6cwmtA69yER_oIyTh0vyMBuSmmO6RdhQ";
const CHAT_ID = "8360789801";

export const sendTelegramNotification = async (orderData: any) => {
    const { cliente, items, total } = orderData;

    const itemsList = items
        .map((item: any) => `- ${item.quantity}x ${item.name} ($${Math.floor(item.price)})`)
        .join("\n");

    const message = `
📦 *NUEVO PEDIDO RECIBIDO* 📦

👤 *Cliente:* ${cliente.nombre}
📍 *Dirección:* ${cliente.direccion}
📞 *Teléfono:* ${cliente.telefono}
💰 *Método de Pago:* ${cliente.metodoPago}
📝 *Indicaciones:* ${cliente.indicaciones || "Ninguna"}

🛒 *Productos:*
${itemsList}

💵 *Total:* $${Math.floor(total)}
  `.trim();

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: "Markdown",
            }),
        });

        if (!response.ok) {
            console.error("Error sending Telegram notification:", await response.text());
        } else {
            console.log("Telegram notification sent successfully.");
        }
    } catch (error) {
        console.error("Network error sending Telegram notification:", error);
    }
};
