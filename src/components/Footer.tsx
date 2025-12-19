import React from 'react';
import './Footer.css';
import { FaFacebook, FaInstagram, FaWhatsapp } from 'react-icons/fa';

const Footer: React.FC = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="social-links">
                    {/* Replace '#' with actual profile URLs */}
                    <a href="https://www.facebook.com/faro.panificacion" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                        <FaFacebook size={24} />
                    </a>
                    <a href="https://www.instagram.com/faro.panificacion" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                        <FaInstagram size={24} />
                    </a>
                    <a href="https://wa.me/5492995206811" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                        <FaWhatsapp size={24} />
                    </a>
                </div>
                <div className="footer-section map-section">
                    <h3 className="footer-title">Nuestra ubicación:</h3>
                    <div className="map-container">
                        <iframe
                            src="https://maps.google.com/maps?q=David+Spinetto+271,+Senillosa,+Neuquen&t=&z=15&ie=UTF8&iwloc=&output=embed"
                            width="100%"
                            height="250"
                            style={{ border: 0 }}
                            allowFullScreen={true}
                            loading="lazy"
                            title="Google Maps"
                        ></iframe>
                    </div>
                </div>
                <div className="footer-text">
                    <p>
                        ¿Tienes un negocio y quieres una página web?{' '}
                        <a href="sairebautista@gmail.com" className="contact-link">Contáctame</a>
                    </p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
