import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { CartProvider } from "./context/CartContext";
import { AuthProvider } from "./context/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { applyLowPowerClass } from "./utils/deviceCapability";

applyLowPowerClass();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <ErrorBoundary>
        <CartProvider>
          <App />
        </CartProvider>
      </ErrorBoundary>
    </AuthProvider>

  </React.StrictMode>
);