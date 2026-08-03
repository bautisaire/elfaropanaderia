# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

"El Faro Panadería" — a bakery e-commerce storefront + admin panel. React 19 + TypeScript + Vite frontend, backed by Firebase (Firestore, Auth, Storage, Cloud Functions, Hosting). Payments via Mercado Pago. This repo root is the frontend; it also contains two secondary Node services (`functions/`, `server/`).

## Commands

Run from the repo root (`frontend/`) unless noted.

```bash
npm run dev       # start Vite dev server (port 5173)
npm run build     # tsc -b (project references) then vite build
npm run lint      # eslint . (flat config, ts/tsx only)
npm run preview   # preview the production build
```

There is no test runner configured in this repo (no `test` script, no test files).

Firebase Cloud Functions (`functions/`, separate npm project):
```bash
cd functions
npm run serve     # firebase emulators:start --only functions
npm run shell     # firebase functions:shell
npm run deploy    # firebase deploy --only functions
npm run lint      # eslint . (Google config)
```

Firebase deploy (from repo root, requires firebase-tools):
```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only functions
```

The `server/` directory is a standalone Express app (Mercado Pago preference/webhook endpoints) — legacy/alternate to the Cloud Functions in `functions/index.js`, which now implement the same `createPreference`/`mercadopagoWebhook` logic. Check which one is actually deployed/wired before editing payment flow — don't assume `server/` is live.

## Environment

Vite env vars live in `.env` at repo root (`VITE_*` — Firebase config, admin email list, Mercado Pago public key). Cloud Functions have their own `functions/.env` (`MP_ACCESS_TOKEN`). Never commit real values; `.env` is gitignored.

## Architecture

### Global providers (`src/main.tsx`)
Mount order: `AuthProvider` → `ErrorBoundary` → `CartProvider` → `App`. `AuthProvider` (`src/context/AuthContext.tsx`) only wraps Firebase Auth (Google/Facebook popup sign-in). `CartProvider` (`src/context/CartContext.tsx`) is the real hub of app state — it owns the cart, the live product catalog, store open/closed status, and admin/role resolution, all driven by Firestore `onSnapshot` listeners. Most components read from `useCart()` / `CartContext` rather than talking to Firestore directly.

### Admin/role model
- Superadmin is hardcoded to a single email (`sairebautista@gmail.com`) in `CartContext.tsx` and gets all permissions.
- Other admins are resolved via a live listener on `admin_roles/{email}` in Firestore; the doc's fields are boolean permission flags (`dashboard`, `orders`, `orders_can_assign_deliveries`, `pos_sales`, `store_editor`, `costs`, `stock`, `employees`, `settings`, `raffle`, `notes`, plus a `is_rider` flag used to suppress admin-only UI for delivery riders).
- `VITE_ADMIN_EMAIL` is a legacy fallback list granting full permissions if no `admin_roles` doc exists.
- Gate admin UI on `adminPermissions.<key>`, not just `isAdmin`.

### Catalog & stock model (`src/utils/cartStock.ts`, `stockUtils.ts`, `stockValidation.ts`)
Products live in Firestore `products` collection, streamed live into `CartContext`. Stock has two independent complications:
1. **Variants** — a product can have `variants[]`, each with its own `stock`/`stockQuantity`.
2. **Derived/dependent stock** — a "child" product (e.g. a single slice) can declare `stockDependency: { productId, unitsToDeduct }` pointing at a "parent" product (e.g. a whole cake); the child's sellable stock is *computed* from the parent's remaining stock (`applyDerivedStockToCatalog`), with unit normalization for weight-based (`unitType: 'weight'`) products (grams vs. kg).

Always resolve available stock/max-quantity through the helpers in `cartStock.ts` (`getAvailableStock`, `getCartItemMaxQuantity`, `resolveCartItemBaseAndVariant`) rather than reading `product.stockQuantity` directly — direct reads miss variant and derived-stock logic. `CartContext` exposes these as `getStockForProduct`, `getMaxQuantityForCartItem`, `canAddMore`.

### Store status
`config/store_settings` in Firestore drives `isStoreOpen`, `allowPickup`/`allowDelivery`, and custom closed/pickup-only messages. `CartContext` surfaces these plus dismissible modal state (`ClosedModal`, `PickupOnlyModal`, rendered globally by `CartProvider` itself, not by page components).

### Routing (`src/App.tsx`)
`react-router-dom` v7. Customer-facing routes (`Home`, `Checkout`, `Proximamente`) are eagerly imported; admin/rare routes (`Editor`, `MyAccount`, `MisPedidos`, `RuletaPage`) are `React.lazy`-loaded since regular customers never hit them. `Editor` and `RuletaPage` render outside the normal `Header`/`Footer`/`CartSidebar` chrome (checked via `location.pathname`).

### Firebase access (`src/firebase/firebaseConfig.ts`)
Single shared module exporting initialized `app`, `db` (Firestore, with persistent multi-tab local cache), `auth`, `storage`, `functions`, `messaging` (FCM, feature-detected via `isSupported()`), and the Google/Facebook auth providers. Import from here rather than re-initializing Firebase elsewhere.

### Cloud Functions (`functions/index.js`)
Exports `createPreference` and `mercadopagoWebhook` (HTTP, `onRequest`) and `processOrder` (callable, `onCall`) — Mercado Pago checkout + order processing live server-side here, not in the client.

### Build chunking (`vite.config.ts`)
Manual Rollup chunks split `react`, `firebase`, chart libs (`recharts`/`date-fns`/`react-datepicker`), and map libs (`leaflet`/`react-leaflet`) into separate vendor chunks so they cache independently across deploys. If adding a large new dependency, consider whether it belongs in an existing vendor bucket or the catch-all `vendor` chunk — CommonJS interop helpers must stay bundled with `react-vendor` (see comment in the config) or startup chunk ordering breaks.

### Components (`src/components/`)
Flat directory (no subfolders) of ~55 components mixing customer-facing UI (`ProductCard`, `Cart`, `CartSidebar`, `Hero`, `ReviewsSection`) and admin/back-office UI (`Dashboard`, `OrdersManager`, `POSManager`, `StockManager`, `EmployeesManager`, `RaffleManager`, etc.). There's no naming prefix distinguishing the two — check usage/imports to tell whether a component is admin-only before editing.

### Language
UI copy, comments, and Firestore field/collection names mix Spanish and English freely (this is an Argentina-based bakery). Match the existing language per-file rather than normalizing.
