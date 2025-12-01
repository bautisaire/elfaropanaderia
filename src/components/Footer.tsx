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
