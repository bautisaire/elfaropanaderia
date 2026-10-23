import React, { createContext, useState, useContext, useMemo, useEffect, useCallback, useRef } from "react";
import { db, auth } from "../firebase/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, collection } from "firebase/firestore";
import { onFreshSnapshot } from "../utils/onFreshSnapshot";
import ClosedModal from "../components/ClosedModal";
import PickupOnlyModal from "../components/PickupOnlyModal";
import TicketOnlyModal from "../components/TicketOnlyModal";
import {
  mapFirestoreProduct,
  applyDerivedStockToCatalog,
  applyComboLinksToCatalog,
  getCartItemMaxQuantity,
  getAvailableStock,
  resolveCartItemBaseAndVariant,
} from "../utils/cartStock";

const CATALOG_STALL_TIMEOUT_MS = 10000;
const STALL_RELOAD_COOLDOWN_MS = 2 * 60 * 1000;
const STALL_RELOAD_KEY = "firestore_stall_reload_at";

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
    priceOverride?: number;
  }[];
  quantity?: number;
  stock?: boolean;
  stockQuantity?: number;
  discount?: number;
  categoria?: string;
  isVisible?: boolean;
  stockReadyTime?: string;
  availableAt?: string;
  customBadgeEnabled?: boolean;
  customBadgeText?: string;
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
  comboAllowMultiple?: boolean;
  comboOptions?: { name: string; image?: string; disabled?: boolean; linkedProductId?: string; linkedVariant?: string }[];
  selectedComboItems?: { name: string; quantity: number }[];
  createdAt?: string;
  isRaffleTicket?: boolean;
  raffleId?: string;
}

interface CartContextType {
  cart: Product[];
  addToCart: (product: Product, quantity?: number) => void;
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
  /** Perfiles del mismo email (ej. María / Sole). hasSecondaryProfile=false => comportamiento normal. */
  hasSecondaryProfile: boolean;
  activeProfile: 'primary' | 'secondary';
  profileNames: { primary: string; secondary: string };
  /** Cambia de perfil. Para volver al principal se exige el código. Devuelve false si el código es incorrecto. */
  switchProfile: (target: 'primary' | 'secondary', code?: string) => boolean;
  removeCompletelyFromCart: (id: string | number) => void;
  updateCartItemPrice: (id: string | number, newPrice: number) => void;
  user: any;
  catalogProducts: Product[];
  catalogLoading: boolean;
  getCatalogProduct: (baseId: string | number) => Product | undefined;
  getStockForProduct: (baseId: string | number, variantName?: string | null) => number;
  getMaxQuantityForCartItem: (item: Product) => number;
  canAddMore: (item: Product) => boolean;
  favorites: string[];
  isFavorite: (productId: string | number) => boolean;
  toggleFavorite: (productId: string | number) => void;
  cartHasOnlyRaffleTickets: boolean;
  requireProductWithTicket: () => void;
}

// Código para volver al perfil principal en mails con dos usuarios (control de comodidad en el cliente, no seguridad real)
const PROFILE_SWITCH_CODE = '1978';
const PROFILE_STORAGE_KEY = 'elfaro_active_profile';

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
  hasSecondaryProfile: false,
  activeProfile: 'primary',
  profileNames: { primary: 'Administrador', secondary: 'Empleado' },
  switchProfile: () => false,
  removeCompletelyFromCart: () => { },
  updateCartItemPrice: () => { },
  user: null,
  catalogProducts: [],
  catalogLoading: true,
  getCatalogProduct: () => undefined,
  getStockForProduct: () => 0,
  getMaxQuantityForCartItem: () => 0,
  canAddMore: () => false,
  favorites: [],
  isFavorite: () => false,
  toggleFavorite: () => { },
  cartHasOnlyRaffleTickets: false,
  requireProductWithTicket: () => { },
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
  // Documento crudo de admin_roles/{email}; permite dos perfiles (principal + secondary_profile) en un mismo mail
  const [roleDoc, setRoleDoc] = useState<Record<string, any> | null>(null);
  const [profileChoice, setProfileChoice] = useState<{ email: string; profile: 'primary' | 'secondary' } | null>(() => {
    try { return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || 'null'); } catch { return null; }
  });
  const [user, setUser] = useState<any>(null);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const productsCatalogRef = useRef<Record<string, Product>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showTicketOnlyModal, setShowTicketOnlyModal] = useState(false);

  const dismissStoreClosed = () => setIsStoreClosedDismissed(true);
  const dismissPickupOnly = () => setIsPickupOnlyDismissed(true);

  // Catálogo en tiempo real (stock y visibilidad)
  useEffect(() => {
    // Watchdog de arranque: si en 10s no llegó ni el caché ni el servidor, el cliente de
    // Firestore quedó trabado (mal arranque). Recargamos una vez sola, que es lo que
    // destraba; si ya se recargó hace poco, mostramos el "Reintentar" de la tienda.
    let catalogReceived = false;
    const onStall = () => {
      if (catalogReceived) return;
      if (document.visibilityState !== "visible") {
        document.addEventListener("visibilitychange", onStall, { once: true });
        return;
      }
      let lastReload = 0;
      try { lastReload = Number(sessionStorage.getItem(STALL_RELOAD_KEY)) || 0; } catch { /* sin storage */ }
      if (Date.now() - lastReload > STALL_RELOAD_COOLDOWN_MS) {
        try { sessionStorage.setItem(STALL_RELOAD_KEY, String(Date.now())); } catch { /* sin storage */ }
        console.warn("Catálogo sin respuesta de Firestore, recargando la página");
        window.location.reload();
        return;
      }
      setCatalogLoading(false);
    };
    const fallbackTimeout = setTimeout(onStall, CATALOG_STALL_TIMEOUT_MS);

    const unsub = onFreshSnapshot(
      collection(db, "products"),
      (snapshot) => {
        catalogReceived = true;
        clearTimeout(fallbackTimeout);
        const catalog: Record<string, Product> = {};
        const visible: Product[] = [];

        snapshot.docs.forEach((d) => {
          catalog[d.id] = mapFirestoreProduct(d.id, d.data() as Record<string, unknown>);
        });

        applyDerivedStockToCatalog(catalog);
        applyComboLinksToCatalog(catalog);
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
        catalogReceived = true;
        clearTimeout(fallbackTimeout);
        setCatalogLoading(false);
      }
    );
    return () => {
      clearTimeout(fallbackTimeout);
      document.removeEventListener("visibilitychange", onStall);
      unsub();
    };
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
  // Los boletos de sorteo no se pueden comprar solos: siempre tienen que ir
  // acompañados de al menos un producto real (el pedido de delivery/retiro).
  const cartHasOnlyRaffleTickets = useMemo(
    () => cartItems.length > 0 && cartItems.every((it) => it.isRaffleTicket),
    [cartItems]
  );

  const requireProductWithTicket = useCallback(() => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(200);
    }
    setShowTicketOnlyModal(true);
  }, []);

  // Fetch Store Status
  useEffect(() => {
    const docRef = doc(db, "config", "store_settings");
    const unsub = onFreshSnapshot(docRef, (docSnap) => {
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
      setRoleDoc(null);
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
            bills: true,
            stock: true,
            employees: true,
            settings: true,
            raffle: true,
            notes: true,
          });
        } else {
          setIsSuperAdmin(false);
          // Check if it's an admin in admin_roles
          roleUnsub = onSnapshot(doc(db, "admin_roles", authUser.email.toLowerCase()), (roleDoc) => {
            setRoleDoc(roleDoc.exists() ? roleDoc.data() : null);
            if (roleDoc.exists()) {
              setIsAdmin(true);
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
                  bills: true,
                  stock: true,
                  employees: true,
                  settings: true,
                  raffle: true,
                  notes: true,
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

  // Perfiles del mismo mail: el documento plano es el perfil principal y `secondary_profile` el restringido
  const secondaryProfile: Record<string, any> | null =
    roleDoc && roleDoc.secondary_profile && typeof roleDoc.secondary_profile === 'object' ? roleDoc.secondary_profile : null;
  const hasSecondaryProfile = !!secondaryProfile;
  const userEmailLower = (user?.email || '').toLowerCase();
  // Con dos perfiles y sin elección guardada se arranca en el restringido
  const activeProfile: 'primary' | 'secondary' =
    hasSecondaryProfile && !(profileChoice && profileChoice.email === userEmailLower && profileChoice.profile === 'primary')
      ? 'secondary'
      : 'primary';
  const profileNames = useMemo(() => ({
    primary: (roleDoc?.primary_name as string) || 'Administrador',
    secondary: (secondaryProfile?.name as string) || 'Empleado',
  }), [roleDoc, secondaryProfile]);

  useEffect(() => {
    if (!roleDoc) return;
    const primaryFlags = { ...roleDoc };
    delete primaryFlags.secondary_profile;
    delete primaryFlags.primary_name;
    if (activeProfile === 'secondary' && secondaryProfile) {
      const secFlags = secondaryProfile;
      // Perfil restringido: cualquier permiso no marcado explícitamente queda en false
      const restricted: Record<string, boolean> = {};
      ['dashboard', 'orders', 'orders_can_cancel', 'orders_can_modify', 'orders_can_change_payment', 'orders_can_assign_deliveries',
        'orders_can_edit_prices', 'pos_sales', 'notes', 'store_editor', 'costs', 'bills', 'stock', 'settings', 'employees', 'raffle',
        'is_rider', 'auto_assign_orders'].forEach(k => { restricted[k] = secFlags[k] === true; });
      setAdminPermissions(restricted);
    } else {
      setAdminPermissions(primaryFlags as Record<string, boolean>);
    }
  }, [roleDoc, activeProfile, secondaryProfile]);

  const switchProfile = useCallback((target: 'primary' | 'secondary', code?: string) => {
    if (!hasSecondaryProfile || !userEmailLower) return false;
    if (target === 'primary' && code !== PROFILE_SWITCH_CODE) return false;
    const choice = { email: userEmailLower, profile: target };
    setProfileChoice(choice);
    try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(choice)); } catch { /* storage no disponible */ }
    return true;
  }, [hasSecondaryProfile, userEmailLower]);

  // Favoritos en vivo (por usuario)
  useEffect(() => {
    if (!user?.uid) {
      setFavorites([]);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setFavorites(snap.exists() ? (snap.data().favorites || []) : []);
    }, (error) => {
      console.error("Error fetching favorites:", error);
    });
    return () => unsub();
  }, [user?.uid]);

  const isFavorite = useCallback(
    (productId: string | number) => favorites.includes(String(productId)),
    [favorites]
  );

  const toggleFavorite = useCallback((productId: string | number) => {
    if (!user?.uid) return;
    const id = String(productId);
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    setFavorites(next);
    setDoc(doc(db, "users", user.uid), { favorites: next }, { merge: true }).catch((e) => {
      console.error("Error updating favorites:", e);
    });
  }, [user?.uid, favorites]);

  const addToCart = (product: any, quantity: number = 1) => {
    if (!isStoreOpen && !isAdmin) {
      setShowClosedModal(true);
      return;
    }

    // Boletos de sorteo pago: no existen en el catálogo de productos, así que
    // se agregan directo sin pasar por las validaciones de stock.
    if (product.isRaffleTicket) {
      const MAX_TICKETS = 20;
      const exists = cartItems.find((item) => item.id === product.id);
      if (exists) {
        const currentQty = exists.quantity || 1;
        if (currentQty >= MAX_TICKETS) return;
        setCartItems(
          cartItems.map((item) =>
            item.id === product.id ? { ...item, quantity: currentQty + 1 } : item
          )
        );
      } else {
        setCartItems([...cartItems, { ...product, quantity: 1 }]);
      }
      setShowBottomModal(true);
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
            ? { ...item, quantity: Math.min(currentQty + quantity, maxStock) }
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
          quantity: Math.min(quantity, maxStock - totalInCart),
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
        hasSecondaryProfile,
        activeProfile,
        profileNames,
        switchProfile,
        removeCompletelyFromCart,
        user,
        catalogProducts,
        catalogLoading,
        getCatalogProduct,
        getStockForProduct,
        getMaxQuantityForCartItem,
        canAddMore,
        favorites,
        isFavorite,
        toggleFavorite,
        cartHasOnlyRaffleTickets,
        requireProductWithTicket,
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

      <TicketOnlyModal
        isOpen={showTicketOnlyModal}
        onClose={() => setShowTicketOnlyModal(false)}
      />

    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);