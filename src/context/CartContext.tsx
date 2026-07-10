import React, { createContext, useState, useContext, useMemo, useEffect, useCallback, useRef } from "react";
import { db, auth } from "../firebase/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, collection } from "firebase/firestore";
import ClosedModal from "../components/ClosedModal";
import PickupOnlyModal from "../components/PickupOnlyModal";
import {
  mapFirestoreProduct,
  applyDerivedStockToCatalog,
  getCartItemMaxQuantity,
  getAvailableStock,
  resolveCartItemBaseAndVariant,
} from "../utils/cartStock";

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
  stockReadyTime?: string;
  availableAt?: string;
  selectedVariant?: string;
  baseProductId?: string | number;
  stockDependency?: {
    productId: string;
    unitsToDeduct: number;
  };
  unitType?: 'unit' | 'weight';
  description?: string;
  isCombo?: boolean;
  comboItemsCount?: number;
  comboOptions?: { name: string; image?: string }[];
  selectedComboItems?: { name: string; quantity: number }[];
  createdAt?: string;
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
  allowPickup: boolean;
  allowDelivery: boolean;
  pickupOnlyMessage: string;
  isPickupOnlyDismissed: boolean;
  dismissPickupOnly: () => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (value: boolean) => void;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  adminPermissions: Record<string, boolean>;
  removeCompletelyFromCart: (id: string | number) => void;
  updateCartItemPrice: (id: string | number, newPrice: number) => void;
  user: any;
  catalogProducts: Product[];
  catalogLoading: boolean;
  getCatalogProduct: (baseId: string | number) => Product | undefined;
  getStockForProduct: (baseId: string | number, variantName?: string | null) => number;
  getMaxQuantityForCartItem: (item: Product) => number;
  canAddMore: (item: Product) => boolean;
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
  allowPickup: true,
  allowDelivery: true,
  pickupOnlyMessage: "",
  isPickupOnlyDismissed: false,
  dismissPickupOnly: () => { },
  isSidebarOpen: false,
  setIsSidebarOpen: () => { },
  isAdmin: false,
  isSuperAdmin: false,
  adminPermissions: {},
  removeCompletelyFromCart: () => { },
  updateCartItemPrice: () => { },
  user: null,
  catalogProducts: [],
  catalogLoading: true,
  getCatalogProduct: () => undefined,
  getStockForProduct: () => 0,
  getMaxQuantityForCartItem: () => 0,
  canAddMore: () => false,
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
  const [allowPickup, setAllowPickup] = useState(true);
  const [allowDelivery, setAllowDelivery] = useState(true);
  const [pickupOnlyMessage, setPickupOnlyMessage] = useState("");
  const [isPickupOnlyDismissed, setIsPickupOnlyDismissed] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminPermissions, setAdminPermissions] = useState<Record<string, boolean>>({});
  const [user, setUser] = useState<any>(null);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const productsCatalogRef = useRef<Record<string, Product>>({});

  const dismissStoreClosed = () => setIsStoreClosedDismissed(true);
  const dismissPickupOnly = () => setIsPickupOnlyDismissed(true);

  // Catálogo en tiempo real (stock y visibilidad)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        const catalog: Record<string, Product> = {};
        const visible: Product[] = [];

        snapshot.docs.forEach((d) => {
          catalog[d.id] = mapFirestoreProduct(d.id, d.data() as Record<string, unknown>);
        });

        applyDerivedStockToCatalog(catalog);
        productsCatalogRef.current = catalog;

        Object.values(catalog).forEach((p) => {
          if (p.isVisible !== false) visible.push(p);
        });

        visible.sort((a, b) => {
          const aOut =
            a.variants && a.variants.length > 0
              ? a.variants.every((v) =>
                v.stockQuantity !== undefined ? v.stockQuantity <= 0 : !v.stock
              )
              : a.stockQuantity !== undefined
                ? a.stockQuantity <= 0
                : a.stock === false;
          const bOut =
            b.variants && b.variants.length > 0
              ? b.variants.every((v) =>
                v.stockQuantity !== undefined ? v.stockQuantity <= 0 : !v.stock
              )
              : b.stockQuantity !== undefined
                ? b.stockQuantity <= 0
                : b.stock === false;
          if (aOut === bOut) return 0;
          return aOut ? 1 : -1;
        });

        setCatalogProducts(visible);
        setCatalogLoading(false);

        setCartItems((prev) => {
          let changed = false;
          const next = prev
            .map((item) => {
              const max = getCartItemMaxQuantity(item, catalog);
              const qty = item.quantity || 1;
              if (max <= 0) {
                changed = true;
                return null;
              }
              if (qty > max) {
                changed = true;
                return { ...item, quantity: max };
              }
              return item;
            })
            .filter(Boolean) as Product[];
          return changed ? next : prev;
        });
      },
      (error) => {
        console.error("Error en catálogo en vivo:", error);
        setCatalogLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const getCatalogProduct = useCallback(
    (baseId: string | number) => productsCatalogRef.current[String(baseId)],
    []
  );

  const getStockForProduct = useCallback(
    (baseId: string | number, variantName?: string | null) =>
      getAvailableStock(
        getCatalogProduct(baseId),
        variantName,
        productsCatalogRef.current
      ),
    [getCatalogProduct]
  );

  const getMaxQuantityForCartItem = useCallback(
    (item: Product) => getCartItemMaxQuantity(item, productsCatalogRef.current),
    []
  );

  const canAddMore = useCallback(
    (item: Product) => {
      const max = getMaxQuantityForCartItem(item);
      if (max <= 0) return false;
      
      const itemBaseId = item.baseProductId || item.id;
      const itemVariant = item.selectedVariant || (item as any).variant || "";

      let totalInCart = 0;
      cartItems.forEach(cartItem => {
         const cbId = cartItem.baseProductId || cartItem.id;
         const cVar = cartItem.selectedVariant || (cartItem as any).variant || "";
         if (cbId === itemBaseId && cVar === itemVariant) {
            totalInCart += (cartItem.quantity || 1);
         }
      });
      return totalInCart < max;
    },
    [getMaxQuantityForCartItem, cartItems]
  );

  // helpers para cantidad y total
  const cartQuantity = useMemo(
    () => cartItems.reduce((acc, it) => acc + (it.quantity ?? 1), 0),
    [cartItems]
  );
  const cartTotal = useMemo(
    () => Math.round(cartItems.reduce((acc, it) => acc + (it.quantity ?? 1) * (it.price ?? 0), 0) * 100) / 100,
    [cartItems]
  );

  // Fetch Store Status
  useEffect(() => {
    const docRef = doc(db, "config", "store_settings");
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIsStoreOpen(data.isOpen !== undefined ? data.isOpen : true);
        setClosedMessage(data.closeMessage || "Tienda Cerrada");
        setAllowPickup(data.allowPickup !== undefined ? data.allowPickup : true);
        setAllowDelivery(data.allowDelivery !== undefined ? data.allowDelivery : true);
        setPickupOnlyMessage(data.pickupOnlyMessage || "¡Atención! Actualmente solo estamos tomando pedidos para RETIRO EN EL LOCAL.");
      }
    }, (error) => {
      console.error("Error fetching store status:", error);
    });

    return () => unsub();
  }, []);

  // Check Admin Status and User
  useEffect(() => {
    let roleUnsub: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (roleUnsub) {
        roleUnsub();
        roleUnsub = null;
      }
      if (authUser && authUser.email) {
        // SUPERADMIN Check
        if (authUser.email === 'sairebautista@gmail.com') {
          setIsAdmin(true);
          setIsSuperAdmin(true);
          setAdminPermissions({
            dashboard: true,
            orders: true,
            orders_can_assign_deliveries: true,
            pos_sales: true,
            store_editor: true,
            costs: true,
            stock: true,
            employees: true,
            settings: true,
            raffle: true,
          });
        } else {
          setIsSuperAdmin(false);
          // Check if it's an admin in admin_roles
          roleUnsub = onSnapshot(doc(db, "admin_roles", authUser.email.toLowerCase()), (roleDoc) => {
            if (roleDoc.exists()) {
              setIsAdmin(true);
              setAdminPermissions(roleDoc.data() as Record<string, boolean>);
            } else if (ADMIN_EMAILS.includes(authUser.email)) {
               // Fallback to VITE_ADMIN_EMAIL for legacy if needed, but no specific permissions
               setIsAdmin(true);
               setAdminPermissions({
                  dashboard: true,
                  orders: true,
                  orders_can_assign_deliveries: true,
                  pos_sales: true,
                  store_editor: true,
                  costs: true,
                  stock: true,
                  employees: true,
                  settings: true,
                  raffle: true,
               });
            } else {
              setIsAdmin(false);
              setAdminPermissions({});
            }
          }, (e) => {
            console.error("Error fetching admin roles", e);
            setIsAdmin(false);
            setAdminPermissions({});
          });
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
        setIsSuperAdmin(false);
        setAdminPermissions({});
      }
    });
    return () => {
      unsubscribe();
      if (roleUnsub) roleUnsub();
    };
  }, []);

  const addToCart = (product: any) => {
    if (!isStoreOpen && !isAdmin) {
      setShowClosedModal(true);
      return;
    }

    const catalog = productsCatalogRef.current;
    const catalogIds = Object.keys(catalog);
    const { baseId, variant } = product.baseProductId != null
      ? { baseId: String(product.baseProductId), variant: product.selectedVariant ?? null }
      : resolveCartItemBaseAndVariant(product, catalogIds);
    const maxStock = getAvailableStock(catalog[baseId], variant, catalog);

    if (maxStock <= 0) return;

    let totalInCart = 0;
    cartItems.forEach(cartItem => {
       const cbId = cartItem.baseProductId || cartItem.id;
       const cVar = cartItem.selectedVariant || (cartItem as any).variant || "";
       if (cbId === baseId && cVar === (variant || "")) {
          totalInCart += (cartItem.quantity || 1);
       }
    });

    const exists = cartItems.find((item) => item.id === product.id);

    if (exists) {
      if (totalInCart >= maxStock) return;
      const currentQty = exists.quantity || 1;
      if (currentQty >= maxStock) return;

      setCartItems(
        cartItems.map((item) =>
          item.id === product.id
            ? { ...item, quantity: Math.min(currentQty + 1, maxStock) }
            : item
        )
      );
    } else {
      if (totalInCart >= maxStock) {
        // Option 1: show a toast, but for now we just return.
        // Actually, the UI usually hides the button, but if it doesn't, we block it here.
        return;
      }
      setCartItems([
        ...cartItems,
        {
          ...product,
          baseProductId: baseId,
          selectedVariant: variant || product.selectedVariant,
          quantity: 1,
        },
      ]);
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

  const updateCartItemPrice = (id: string | number, newPrice: number) => {
    setCartItems(
      cartItems.map((item) =>
        item.id === id ? { ...item, price: newPrice } : item
      )
    );
  };

  const clearCart = () => setCartItems([]);

  const total = Math.round(cartItems.reduce(
    (acc, item) => acc + item.price * (item.quantity || 1),
    0
  ) * 100) / 100;

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
        allowPickup,
        allowDelivery,
        pickupOnlyMessage,
        isPickupOnlyDismissed,
        dismissPickupOnly,
        isSidebarOpen,
        setIsSidebarOpen,
        updateCartItemPrice,
        isAdmin,
        isSuperAdmin,
        adminPermissions,
        removeCompletelyFromCart,
        user,
        catalogProducts,
        catalogLoading,
        getCatalogProduct,
        getStockForProduct,
        getMaxQuantityForCartItem,
        canAddMore,
      }}
    >
      {children}

      {/* Global Elements handled by Context */}
      <ClosedModal
        isOpen={showClosedModal}
        onClose={() => setShowClosedModal(false)}
        message={closedMessage}
      />

      <PickupOnlyModal
        isOpen={!isPickupOnlyDismissed && allowPickup && !allowDelivery && isStoreOpen}
        onClose={dismissPickupOnly}
        message={pickupOnlyMessage}
      />

    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);