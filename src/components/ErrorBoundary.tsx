import { Component, ErrorInfo, ReactNode } from "react";
import "../index.css"; // Ensure styles are available

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: "20px",
                    textAlign: "center",
                    fontFamily: "sans-serif",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "100vh",
                    backgroundColor: "#fff"
                }}>
                    <h2 style={{ color: "#d9534f" }}>Algo salió mal 😔</h2>
                    <p style={{ maxWidth: "500px", lineHeight: "1.5", color: "#555" }}>
                        Ocurrió un error inesperado. Por favor, intenta recargar la página.
                    </p>

                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: "20px",
                            padding: "10px 20px",
                            backgroundColor: "#b35600",
                            color: "white",
                            border: "none",
                            borderRadius: "5px",
                            fontSize: "16px",
                            cursor: "pointer"
                        }}
                    >
                        Recargar Página
                    </button>

                    {this.state.error && (
                        <details style={{ marginTop: "30px", textAlign: "left", maxWidth: "80%", overflow: "auto", border: "1px solid #eee", padding: "10px", borderRadius: "5px", backgroundColor: "#f9f9f9" }}>
                            <summary style={{ cursor: "pointer", color: "#888", marginBottom: "10px" }}>Ver detalles técnicos (para soporte)</summary>
                            <pre style={{ fontSize: "12px", color: "#333", whiteSpace: "pre-wrap" }}>
                                {this.state.error.toString()}
                                <br />
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
