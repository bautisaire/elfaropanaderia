import "./ProductSkeleton.css";

export default function ProductSkeleton() {
    return (
        <div className="product-skeleton">
            <div className="skeleton-image"></div>
            <div className="skeleton-body">
                <div className="skeleton-title"></div>
                <div className="skeleton-price"></div>
                <div className="skeleton-button"></div>
            </div>
        </div>
    );
}
