import { useState, useEffect } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, addDoc, onSnapshot, query, doc, deleteDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { FaStar, FaUserCircle, FaTrash } from "react-icons/fa";
import LoginRequiredModal from "./LoginRequiredModal";

interface Review {
    id: string;
    userId: string;
    userName: string;
    userPhoto: string;
    rating: number;
    comment: string;
    createdAt: any;
}

interface ReviewsSectionProps {
    productId: string | number;
}

export default function ReviewsSection({ productId }: ReviewsSectionProps) {
    const { user } = useAuth();
    const { isAdmin } = useCart();
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Pagination
    const [visibleCount, setVisibleCount] = useState(10);
    
    // Form state
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [userHasReviewed, setUserHasReviewed] = useState(false);
    const [showForm, setShowForm] = useState(false);
    
    // Modal state
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [reviewToDelete, setReviewToDelete] = useState<string | null>(null);

    useEffect(() => {
        const q = query(
            collection(db, `products/${productId}/reviews`)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const revs: Review[] = [];
            let hasReviewed = false;
            
            snapshot.forEach((d) => {
                const data = d.data();
                revs.push({
                    id: d.id,
                    userId: data.userId,
                    userName: data.userName,
                    userPhoto: data.userPhoto,
                    rating: data.rating,
                    comment: data.comment,
                    createdAt: data.createdAt?.toDate() || new Date(),
                });

                if (user && data.userId === user.uid) {
                    hasReviewed = true;
                }
            });

            // Sort locally to avoid Firestore missing index or internal cache assertions
            revs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            setReviews(revs);
            setUserHasReviewed(hasReviewed);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [productId, user]);

    const handleStarClick = (star: number) => {
        if (!user) {
            setShowLoginModal(true);
            return;
        }
        setRating(star);
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!user) {
            setShowLoginModal(true);
            return;
        }

        if (userHasReviewed) {
            alert("Ya has dejado una reseña para este producto.");
            return;
        }

        if (rating === 0) {
            alert("Por favor selecciona al menos una estrella.");
            return;
        }

        setSubmitting(true);
        try {
            await addDoc(collection(db, `products/${productId}/reviews`), {
                userId: user.uid,
                userName: user.displayName || user.email || "Usuario anónimo",
                userPhoto: user.photoURL || "",
                rating,
                comment: comment.trim(),
                createdAt: new Date()
            });
            
            setComment("");
            setRating(0);
            setShowForm(false);
        } catch (error) {
            console.error("Error adding review: ", error);
            alert("Hubo un error al enviar tu reseña. Intenta de nuevo.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmDelete = async (reviewId: string) => {
        try {
            await deleteDoc(doc(db, `products/${productId}/reviews/${reviewId}`));
        } catch (error) {
            console.error("Error deleting review", error);
            alert("No se pudo eliminar la reseña.");
        }
    };

    const averageRating = reviews.length > 0 
        ? reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length 
        : 0;
        
    const displayedReviews = reviews.slice(0, visibleCount);

    return (
        <div className="reviews-section" style={{ marginTop: "32px", borderTop: "1px solid #eee", paddingTop: "24px" }}>
            {/* Review Input Section */}
            {!userHasReviewed ? (
                <div style={{ backgroundColor: "#f9f9f9", padding: "16px", borderRadius: "12px", marginBottom: "24px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "1rem", color: "#444" }}>
                        Calificar
                    </h4>
                    
                    <div style={{ display: "flex", gap: "8px", fontSize: showForm ? "1.8rem" : "2.5rem", justifyContent: "center", marginBottom: showForm ? "16px" : "0", transition: "font-size 0.3s ease" }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                type="button"
                                onClick={() => handleStarClick(star)}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    padding: 0,
                                    cursor: "pointer",
                                    fontSize: "inherit",
                                    color: star <= (hoverRating || rating) ? "#fbbf24" : "rgba(0,0,0,0.1)",
                                    transition: "color 0.2s, transform 0.1s",
                                    transform: star <= (hoverRating || rating) ? "scale(1.1)" : "scale(1)"
                                }}
                            >
                                <FaStar />
                            </button>
                        ))}
                    </div>

                    {showForm && (
                        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px", animation: "fadeIn 0.3s" }}>
                            <textarea
                                placeholder="Escribe tu reseña aquí (Opcional)"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                rows={3}
                                maxLength={500}
                                style={{
                                    width: "100%",
                                    padding: "12px",
                                    borderRadius: "8px",
                                    border: "1px solid #ddd",
                                    resize: "none",
                                    fontFamily: "inherit",
                                    boxSizing: "border-box",
                                    fontSize: "0.95rem"
                                }}
                            />
                            <div style={{ fontSize: "0.8rem", color: "#888", textAlign: "right", marginTop: "-8px" }}>
                                {comment.length}/500
                            </div>
                            <button
                                type="submit"
                                disabled={submitting}
                                style={{
                                    alignSelf: "flex-end",
                                    padding: "10px 24px",
                                    backgroundColor: "#1f2937",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "8px",
                                    fontWeight: "500",
                                    cursor: submitting ? "not-allowed" : "pointer",
                                    opacity: submitting ? 0.7 : 1,
                                    transition: "background 0.2s"
                                }}
                            >
                                {submitting ? "Enviando..." : "Enviar reseña"}
                            </button>
                        </form>
                    )}
                </div>
            ) : (
                <div style={{ padding: "16px", backgroundColor: "#ecfdf5", color: "#065f46", borderRadius: "12px", marginBottom: "24px", fontSize: "0.95rem", textAlign: "center" }}>
                    ¡Gracias por tu reseña! Ya has calificado este producto.
                </div>
            )}

            <h3 style={{ fontSize: "1.25rem", marginBottom: "16px", color: "#333", display: "flex", alignItems: "center", gap: "8px" }}>
                Opiniones de este producto
                {reviews.length > 0 && (
                    <span style={{ fontSize: "1rem", fontWeight: "normal", color: "#666", display: "flex", alignItems: "center", gap: "4px" }}>
                        <FaStar color="#fbbf24" /> {averageRating.toFixed(1)} ({reviews.length})
                    </span>
                )}
            </h3>

            {/* Reviews List */}
            {loading ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>Cargando reseñas...</div>
            ) : reviews.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 20px", backgroundColor: "#f9f9f9", borderRadius: "12px", color: "#666" }}>
                    Este producto no tiene reseñas. ¡Sé el primero en opinar!
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {displayedReviews.map((rev) => (
                        <div key={rev.id} style={{ padding: "16px", border: "1px solid #eaeaea", borderRadius: "12px", position: "relative" }}>
                            {(isAdmin || (user && user.uid === rev.userId)) && (
                                <button
                                    onClick={() => setReviewToDelete(rev.id)}
                                    style={{
                                        position: "absolute",
                                        top: "16px",
                                        right: "16px",
                                        background: "none",
                                        border: "none",
                                        color: "#ef4444",
                                        cursor: "pointer",
                                        padding: "4px",
                                        opacity: 0.7,
                                        transition: "opacity 0.2s"
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
                                    onMouseLeave={(e) => e.currentTarget.style.opacity = "0.7"}
                                    title="Eliminar reseña"
                                >
                                    <FaTrash />
                                </button>
                            )}
                            
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                                {rev.userPhoto ? (
                                    <img src={rev.userPhoto} alt={rev.userName} style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }} />
                                ) : (
                                    <FaUserCircle size={32} color="#ccc" />
                                )}
                                <div>
                                    <div style={{ fontWeight: "600", fontSize: "0.95rem", color: "#333" }}>{rev.userName}</div>
                                    <div style={{ fontSize: "0.8rem", color: "#888" }}>
                                        {rev.createdAt instanceof Date ? rev.createdAt.toLocaleDateString() : ""}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: "2px", marginBottom: "8px", color: "#fbbf24", fontSize: "0.9rem" }}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <FaStar key={star} color={star <= rev.rating ? "#fbbf24" : "#e5e7eb"} />
                                ))}
                            </div>
                            {rev.comment && (
                                <p style={{ margin: 0, color: "#444", fontSize: "0.95rem", lineHeight: "1.5", wordBreak: "break-word" }}>
                                    {rev.comment}
                                </p>
                            )}
                        </div>
                    ))}
                    
                    {reviews.length > visibleCount && (
                        <div style={{ textAlign: "center", marginTop: "8px" }}>
                            <button
                                onClick={() => setVisibleCount(prev => prev + 10)}
                                style={{
                                    padding: "10px 24px",
                                    backgroundColor: "white",
                                    border: "1px solid #ddd",
                                    borderRadius: "8px",
                                    fontWeight: "500",
                                    cursor: "pointer",
                                    color: "#333",
                                    transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f9f9f9"}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "white"}
                            >
                                Cargar más reseñas
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Custom Delete Modal */}
            {reviewToDelete && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        zIndex: 3000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "20px",
                        backdropFilter: "blur(3px)",
                    }}
                    onClick={() => setReviewToDelete(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: "#fff",
                            borderRadius: "16px",
                            padding: "24px",
                            maxWidth: "350px",
                            width: "100%",
                            textAlign: "center",
                            boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                            animation: "fadeIn 0.2s ease-out"
                        }}
                    >
                        <h3 style={{ marginTop: 0, color: "#333" }}>¿Eliminar reseña?</h3>
                        <p style={{ color: "#666", marginBottom: "24px", fontSize: "0.95rem" }}>Esta acción no se puede deshacer.</p>
                        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                            <button
                                onClick={() => setReviewToDelete(null)}
                                style={{ padding: "8px 24px", borderRadius: "8px", border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: "500", color: "#333" }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    handleConfirmDelete(reviewToDelete);
                                    setReviewToDelete(null);
                                }}
                                style={{ padding: "8px 24px", borderRadius: "8px", border: "none", background: "#ef4444", color: "white", cursor: "pointer", fontWeight: "500" }}
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            <LoginRequiredModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
        </div>
    );
}
