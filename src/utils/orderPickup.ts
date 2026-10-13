// Detección de pedidos "retiro en el local" y textos de estado para ellos.
// El estado guardado sigue siendo el mismo ("enviado"); solo cambia cómo se nombra.

const normalize = (v: unknown) =>
    String(v ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");

const mentionsRetiro = (v: unknown) => normalize(v).includes("retiro");

export function orderIsPickup(order: any): boolean {
    if (!order) return false;
    return (
        order.cliente?.metodoEntrega === "pickup" ||
        order.deliveryMethod === "pickup" ||
        mentionsRetiro(order.cliente?.direccion) ||
        mentionsRetiro(order.cliente?.indicaciones)
    );
}

/** Nombre del estado "enviado" según el tipo de pedido, para el panel de administración. */
export const adminStatusLabel = (status: string, label: string, pickup: boolean) =>
    pickup && status === "enviado" ? "Listo" : label;

/** Nombre del estado para el cliente. */
export const customerStatusLabel = (status: string, label: string, pickup: boolean) =>
    pickup && status === "enviado" ? "Listo para retirar" : label;
