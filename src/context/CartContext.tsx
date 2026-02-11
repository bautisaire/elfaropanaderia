import React, { createContext, useState, useContext, useMemo, useEffect } from "react";
import { db, auth } from "../firebase/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import ClosedModal from "../components/ClosedModal";
export interface Product {
  id: string | number;
  name: string;
  price: number;
  image: string;
  images?: string[];
  variants?: {
    name: string;
    stock: boolean;
    stockQuantity?: number;
    image?: string;
  }[];
  quantity?: number;
  stock?: boolean;
  stockQuantity?: number;
  discount?: number;
  categoria?: string;
  isVisible?: boolean;
  stockReadyTime?: string; // ISO string for when stock will be ready (e.g. baking finished)
  customBadgeText?: string; // "En el horno", "Preparando", etc.
  badgeExpiresAt?: string; // ISO string for when the badge should disappear
}

interface CartContextType {
  cart: Product[];
  addToCart: (product: Product) => void;
  removeFromCart: (id: string | number) => void;
  clearCart: () => void;
  total: number;
  showBottomModal: boolean;
  setShowBottomModal: (value: boolean) => void;
  cartQuantity: number;
  cartTotal: number;
  isStoreOpen: boolean;
  closedMessage: string;
  isStoreClosedDismissed: boolean;
  dismissStoreClosed: () => void;
  isAdmin: boolean;
}

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAIL || "").split(",").map((e: string) => e.trim());

export const CartContext = createContext<CartContextType>({
  cart: [],
  addToCart: () => { },
  removeFromCart: () => { },
  clearCart: () => { },
  total: 0,
  showBottomModal: false,
  setShowBottomModal: () => { },
  cartQuantity: 0,
  cartTotal: 0,
  isStoreOpen: true,
  closedMessage: "",
  isStoreClosedDismissed: false,
  dismissStoreClosed: () => { },
  isAdmin: false,
});

interface Props {
  children: React.ReactNode;
}

export const CartProvider = ({ children }: Props) => {
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [showBottomModal, setShowBottomModal] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState(true);
  const [closedMessage, setClosedMessage] = useState("");
  const [showClosedModal, setShowClosedModal] = useState(false); // Modal control
  const [isStoreClosedDismissed, setIsStoreClosedDismissed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const dismissStoreClosed = () => setIsStoreClosedDismissed(true);

  // helpers para cantidad y total
  const cartQuantity = useMemo(
    () => cartItems.reduce((acc, it) => acc + (it.quantity ?? 1), 0),
    [cartItems]
  );
  const cartTotal = useMemo(
    () => cartItems.reduce((acc, it) => acc + (it.quantity ?? 1) * (it.price ?? 0), 0),
    [cartItems]
  );

  // Fetch Store Status
  useEffect(() => {
    const fetchStoreStatus = async () => {
      try {
        const docRef = doc(db, "config", "store_settings");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIsStoreOpen(data.isOpen !== undefined ? data.isOpen : true);
          setClosedMessage(data.closeMessage || "Tienda Cerrada");
        }
      } catch (error) {
        console.error("Error fetching store status:", error);
      }
    };
    fetchStoreStatus();
  }, []);

  // Check Admin Status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email && ADMIN_EMAILS.includes(user.email)) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const addToCart = (product: any) => {
    if (!isStoreOpen && !isAdmin) { // Admin bypass
      setShowClosedModal(true); // Show custom modal instead of alert
      return;
    }

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
  };

  const removeFromCart = (id: string | number) => {
    setCartItems(
      cartItems
        .map((item) =>
          item.id === id
            ? { ...item, quantity: (item.quantity || 1) - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
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
        showBottomModal,
        setShowBottomModal,
        cartQuantity,
        cartTotal,
        isStoreOpen,
        closedMessage,
        isStoreClosedDismissed,
        dismissStoreClosed,
        isAdmin
      }}
    >
      {children}

      {/* Global Elements handled by Context */}
      <ClosedModal
        isOpen={showClosedModal}
        onClose={() => setShowClosedModal(false)}
        message={closedMessage}
      />

    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);