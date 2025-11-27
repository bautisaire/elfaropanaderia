import React, { createContext, useState, useContext, useMemo } from "react";

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
  showBottomModal: boolean;
  setShowBottomModal: (value: boolean) => void;
  cartQuantity: number;
  cartTotal: number;
}

export const CartContext = createContext<CartContextType>({
  cart: [],
  addToCart: () => {},
  removeFromCart: () => {},
  clearCart: () => {},
  total: 0,
  showLoginModal: false,
  setShowLoginModal: () => {},
  showBottomModal: false,
  setShowBottomModal: () => {},
  cartQuantity: 0,
  cartTotal: 0,
});

interface Props {
  children: React.ReactNode;
}

export const CartProvider = ({ children }: Props) => {
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showBottomModal, setShowBottomModal] = useState(false);

  const { user } = useAuth(); // 👈 Para saber si está logueado

  // helpers para cantidad y total
  const cartQuantity = useMemo(
    () => cartItems.reduce((acc, it) => acc + (it.quantity ?? 1), 0),
    [cartItems]
  );
  const cartTotal = useMemo(
    () => cartItems.reduce((acc, it) => acc + (it.quantity ?? 1) * (it.price ?? 0), 0),
    [cartItems]
  );

  const addToCart = (product: any) => {
    // 🔐 Si NO está logueado → mostrar modal
    // if (!user) {
    //   setShowLoginModal(true);
    //   return;
    // }

    // ✔ Logueado → agregar al carrito normal
    const exists = cartItems.find((item) => item.id === product.id);

    if (exists) {
      setCartItems(
        cartItems.map((item) =>
          item.id === product.id
            ? { ...item, quantity: (item.quantity || 1) + 1 }
            : item
        )
      );
    } else {
      setCartItems([...cartItems, { ...product, quantity: 1 }]);
    }
    setShowBottomModal(true);
    // auto-ocultar después de X ms
    // window.setTimeout(() => setShowBottomModal(false), 3500);
  };

  const removeFromCart = (id: number) => {
    setCartItems(
      cartItems
        .map((item) =>
          item.id === id
            ? { ...item, quantity: (item.quantity || 1) - 1 }
            : item
        )
        .filter((item) => item.quantity > 0) // Eliminar si la cantidad es 0
    );
  };

  const clearCart = () => setCartItems([]);

  const total = cartItems.reduce(
    (acc, item) => acc + item.price * (item.quantity || 1),
    0
  );

  return (
    <CartContext.Provider
      value={{
        cart: cartItems,
        addToCart,
        removeFromCart,
        clearCart,
        total,
        showLoginModal,
        setShowLoginModal,
        showBottomModal,
        setShowBottomModal,
        cartQuantity,
        cartTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);