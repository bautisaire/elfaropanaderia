import { createContext, useContext, useState, ReactNode } from "react";

import { useAuth } from "../context/AuthContext"; // 👈 IMPORTANTE

export interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  quantity?: number;
}

interface CartContextType {
  cart: Product[];
  addToCart: (product: Product) => void;
  removeFromCart: (id: number) => void;
  clearCart: () => void;
  total: number;
  showLoginModal: boolean;
  setShowLoginModal: (value: boolean) => void;
}

export const CartContext = createContext<CartContextType>({
  cart: [],
  addToCart: () => {},
  removeFromCart: () => {},
  clearCart: () => {},
  total: 0,
  showLoginModal: false,
  setShowLoginModal: () => {},
});

interface Props {
  children: ReactNode;
}

export const CartProvider = ({ children }: Props) => {
  const [cart, setCart] = useState<Product[]>([]);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const { user } = useAuth(); // 👈 Para saber si está logueado

  const addToCart = (product: Product) => {
    // 🔐 Si NO está logueado → mostrar modal
    if (!user) {
      setShowLoginModal(true);
      return;
    }

    // ✔ Logueado → agregar al carrito normal
    const exists = cart.find((item) => item.id === product.id);

    if (exists) {
      setCart(
        cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: (item.quantity || 1) + 1 }
            : item
        )
      );
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const removeFromCart = (id: number) =>
    setCart(cart.filter((item) => item.id !== id));

  const clearCart = () => setCart([]);

  const total = cart.reduce(
    (acc, item) => acc + item.price * (item.quantity || 1),
    0
  );

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        clearCart,
        total,
        showLoginModal,
        setShowLoginModal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);