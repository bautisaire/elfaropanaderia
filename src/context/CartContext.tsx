import React, { createContext, useState, useContext, useMemo, useEffect } from "react";
import { db, auth } from "../firebase/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
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
  selectedVariant?: string;
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
  isSidebarOpen: boolean;
  setIsSidebarOpen: (value: boolean) => void;
  isAdmin: boolean;
  removeCompletelyFromCart: (id: string | number) => void;
  user: any;
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
  isSidebarOpen: false,
  setIsSidebarOpen: () => { },
  isAdmin: false,
  removeCompletelyFromCart: () => { },
  user: null,
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);

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

  // Check Admin Status and User
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      if (authUser && authUser.email) {
        if (ADMIN_EMAILS.includes(authUser.email)) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
        const saveUser = async () => {
          try {
            const userRef = doc(db, 'users', authUser.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
              const todayDateString = new Intl.DateTimeFormat('en-CA', { timeZone: "America/Argentina/Buenos_Aires", year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
              await setDoc(userRef, {
                email: authUser.email,
                createdAt: new Date(),
                createdDateString: todayDateString
              });
            } else {
              await setDoc(userRef, { email: authUser.email }, { merge: true });
            }
          } catch (e) {
            console.error("Error setting user doc", e);
          }
        };
        saveUser();
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
        .filter((item) => (item.quantity ?? 1) > 0)
    );
  };

  const removeCompletelyFromCart = (id: string | number) => {
    setCartItems(cartItems.filter((item) => item.id !== id));
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
        isSidebarOpen,
        setIsSidebarOpen,
        isAdmin,
        removeCompletelyFromCart,
        user
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