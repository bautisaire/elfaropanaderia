import React from 'react';
import './Footer.css';
import { FaFacebook, FaInstagram, FaWhatsapp } from 'react-icons/fa';

const Footer: React.FC = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-section map-section">
                    <h3 className="footer-title">Nuestra ubicación:</h3>
                    <div className="map-container">
                        <iframe
                            src="https://maps.google.com/maps?q=Las+Lengas+797,+Senillosa,+Neuquen&t=&z=15&ie=UTF8&iwloc=&output=embed"
                            width="100%"
                            height="250"
                            style={{ border: 0 }}
                            allowFullScreen={true}
                            loading="lazy"
                            title="Google Maps"
                        ></iframe>
                    </div>

                </div>
                <div className="footer-section">
                    <h3 className="footer-title">Horarios:</h3>
                    <p>Lunes a Viernes: 08:00 - 13:00 y 17:00 - 20:00</p>
                    <p>Sábados: 08:00 - 13:00</p>
                    <p>Domingos: Cerrado</p>

                </div>

                <div className="social-links">
                    <a href="https://www.facebook.com/faro.panificacion" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                        <FaFacebook size={40} />
                    </a>
                    <a href="https://www.instagram.com/faro.panificacion" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                        <FaInstagram size={40} />
                    </a>
                    <a href="https://wa.me/5492995206821" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                        <FaWhatsapp size={40} />
                    </a>
                </div>
                <div className="footer-text">
                    <p>
                        ¿Tienes un negocio y quieres una página web?{' '}
                        <a href="https://wa.me/5492995206821" className="contact-link">Contáctame</a>
                    </p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
