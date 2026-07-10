export const generateOrderMessage = (order: any): string => {
    let message = `*NUEVO PEDIDO #${order.id}*\n\n`;
    
    // Datos del cliente
    message += `👤 *Cliente:* ${order.cliente?.nombre || 'No especificado'}\n`;
    if (order.cliente?.telefono) message += `📞 *Tel:* ${order.cliente.telefono}\n`;
    
    // Dirección o Retiro
    if (order.tipoEnvio === 'delivery' || order.cliente?.direccion) {
        message += `📍 *Dirección:* ${order.cliente?.direccion || 'No especificada'}\n`;
    } else {
        message += `🏬 *Retira en local*\n`;
    }
    
    // Productos
    message += `\n🛒 *Productos:*\n`;
    order.items?.forEach((item: any) => {
        message += `- ${item.quantity}x ${item.name} ($${item.price})\n`;
        if (item.variant) message += `   Var: ${item.variant}\n`;
    });
    
    // Totales
    message += `\n💰 *Total:* $${order.total}\n`;
    if (order.cliente?.metodoPago) {
        message += `💳 *Método de pago:* ${order.cliente.metodoPago}\n`;
    }
    
    if (order.cliente?.aclaraciones) {
        message += `\n📝 *Aclaraciones:* ${order.cliente.aclaraciones}\n`;
    }
    
    return message;
};

export const generateOrderMessageShort = (order: any): string => {
    let message = `Pedido #${order.id}\n`;
    if (order.tipoEnvio === 'delivery' || order.cliente?.direccion) {
        message += `Dir: ${order.cliente?.direccion || 'No especificada'}\n`;
    } else {
        message += `Retira en local\n`;
    }
    message += `Total: $${order.total}`;
    return message;
};
