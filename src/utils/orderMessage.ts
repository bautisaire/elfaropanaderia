export const generateOrderMessage = (order: any): string => {
    let message = `¡Hola ${order.cliente?.nombre || ''}! Recibimos tu pedido en El Faro Panadería.\n`;
    
    // Dirección o Retiro
    if (order.tipoEnvio === 'delivery' || order.cliente?.direccion) {
        message += ` Dirección: ${order.cliente?.direccion || 'No especificada'} \n`;
        if (order.cliente?.indicaciones) {
            message += ` Indicaciones: ${order.cliente.indicaciones} \n`;
        }
    } else {
        message += ` Retira en local \n`;
    }
    
    // Productos
    message += `\n🛒 Productos:\n`;
    order.items?.forEach((item: any) => {
        const itemTotal = item.price * (item.quantity || 1);
        message += `- ${item.quantity}x ${item.name}`;
        if (item.variant) message += ` (${item.variant})`;
        message += ` ($${itemTotal})\n`;
    });
    
    // Totales
    message += `\n\n💵 Total: $${order.total}\n\n`;
    message += ` ¡Ya lo estamos preparando! \n\n`;

    if (order.cliente?.metodoPago?.toLowerCase() === 'transferencia' || order.cliente?.metodoPago?.toLowerCase() === 'transferencia bancaria' || order.cliente?.metodoPago?.toLowerCase() === 'transferencia/mp') {
        message += ` Datos de Transferencia:\n`;
        message += `ALIAS: elfaro80.mp\n`;
        message += `CVU: 0000003100006832823516\n`;
        message += `A NOMBRE DE: MARIA ELISABETH CORONEL\n`;
        message += `Enviar comprobante\n\n`;
    }
    
    message += `    elfaropanificacion.com \n`;
    
    return message;
};

export const generateOrderMessageShort = (order: any): string => {
    let message = `¡Hola ${order.cliente?.nombre || ''}! Recibimos tu pedido en El Faro Panadería.\n\n`;

    if (order.cliente?.metodoPago?.toLowerCase() === 'transferencia' || order.cliente?.metodoPago?.toLowerCase() === 'transferencia bancaria' || order.cliente?.metodoPago?.toLowerCase() === 'transferencia/mp') {
        message += ` Datos de Transferencia:\n`;
        message += `ALIAS: elfaro80.mp\n`;
        message += `CVU: 0000003100006832823516\n`;
        message += `A NOMBRE DE: MARIA ELISABETH CORONEL\n`;
        message += `Enviar comprobante\n\n`;
    }

    message += ` ¡Ya lo estamos preparando! \n\n`;
    message += `    elfaropanificacion.com \n`;
    
    return message;
};
