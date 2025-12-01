
// Configuración del Bot de Telegram
const TELEGRAM_BOT_TOKEN = "8084232974:AAH6cwmtA69yER_oIyTh0vyMBuSmmO6RdhQ";
const TELEGRAM_CHAT_ID = "8360789801";

/**
 * Envía una notificación a Telegram con los detalles del pedido.
 */
export const sendTelegramNotification = async (orderData: any) => {
    try {
        const message = `
🔔 *NUEVO PEDIDO RECIBIDO* 🔔

👤 *Cliente:* ${orderData.customerName || 'Cliente'}
💰 *Total:* $${orderData.total || 0}
📞 *Teléfono:* ${orderData.phone || 'No especificado'}
📍 *Dirección:* ${orderData.address || 'Retiro en local'}

📝 *Detalle:*
${orderData.items?.map((item: any) => `- ${item.quantity}x ${item.name} ${item.selectedVariant ? `(${item.selectedVariant})` : ''}`).join('\n')}

🔗 _Revisa el panel para más detalles._
    `;

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown',
            }),
        });

        if (!response.ok) {
            console.error('Error enviando a Telegram:', await response.text());
        } else {
            console.log('Notificación enviada a Telegram correctamente.');
        }
    } catch (error) {
        console.error('Error de red al enviar a Telegram:', error);
    }
};
