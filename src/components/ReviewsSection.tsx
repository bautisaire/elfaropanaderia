import { useState, useEffect } from "react";
import { db } from "../firebase/firebaseConfig";
import { collection, addDoc, onSnapshot, query, doc, deleteDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { FaStar, FaUserCircle, FaTrash } from "react-icons/fa";
import LoginRequiredModal from "./LoginRequiredModal";
import "./ReviewsSection.css";

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
        <div className="reviews-section rv">
            <div className="rv-head">
                <h3 className="rv-title">Opiniones</h3>
                {reviews.length > 0 && (
                    <span className="rv-avg">
                        <FaStar color="#fbbf24" /> <b>{averageRating.toFixed(1)}</b> ({reviews.length})
                    </span>
                )}
            </div>

            {/* Calificar */}
            {!userHasReviewed ? (
                <div className={`rv-rate ${showForm ? "open" : ""}`}>
                    <div className="rv-rate-row">
                        <span className="rv-rate-label">{showForm ? "Tu calificación" : "¿Lo probaste? Calificalo"}</span>
                        <div className="rv-stars" onMouseLeave={() => setHoverRating(0)}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    className={star <= (hoverRating || rating) ? "on" : ""}
                                    onClick={() => handleStarClick(star)}
                                    onMouseEnter={() => setHoverRating(star)}
                                    aria-label={`${star} estrella${star > 1 ? "s" : ""}`}
                                >
                                    <FaStar />
                                </button>
                            ))}
                        </div>
                    </div>

                    {showForm && (
                        <form onSubmit={handleSubmit} className="rv-form">
                            <textarea
                                placeholder="Contanos qué te pareció (opcional)"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                rows={3}
                                maxLength={500}
                            />
                            <div className="rv-form-foot">
                                <span>{comment.length}/500</span>
                                <button type="submit" disabled={submitting}>
                                    {submitting ? "Enviando..." : "Enviar reseña"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            ) : (
                <div className="rv-thanks">¡Gracias por tu reseña!</div>
            )}

            {/* Lista */}
            {loading ? (
                <div className="rv-empty">Cargando reseñas...</div>
            ) : reviews.length === 0 ? (
                <div className="rv-empty">Todavía no hay opiniones. ¡Sé el primero!</div>
            ) : (
                <div className="rv-list">
                    {displayedReviews.map((rev) => (
                        <div key={rev.id} className="rv-item">
                            <div className="rv-item-head">
                                {rev.userPhoto ? (
                                    <img src={rev.userPhoto} alt="" className="rv-avatar" />
                                ) : (
                                    <FaUserCircle size={32} color="#d6d3d1" />
                                )}
                                <div className="rv-who">
                                    <b>{rev.userName}</b>
                                    <span>
                                        <span className="rv-item-stars">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <FaStar key={star} color={star <= rev.rating ? "#fbbf24" : "#e7e5e4"} />
                                            ))}
                                        </span>
                                        {rev.createdAt instanceof Date ? rev.createdAt.toLocaleDateString("es-AR") : ""}
                                    </span>
                                </div>
                                {(isAdmin || (user && user.uid === rev.userId)) && (
                                    <button className="rv-delete" onClick={() => setReviewToDelete(rev.id)} title="Eliminar reseña" aria-label="Eliminar reseña">
                                        <FaTrash />
                                    </button>
                                )}
                            </div>
                            {rev.comment && <p className="rv-comment">{rev.comment}</p>}
                        </div>
                    ))}

                    {reviews.length > visibleCount && (
                        <button className="rv-more" onClick={() => setVisibleCount(prev => prev + 10)}>
                            Ver más opiniones
                        </button>
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
                        zIndex: 10050,
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


            <LoginRequiredModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
        </div>
    );
}
