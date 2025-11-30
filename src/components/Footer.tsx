import React from 'react';
import './Footer.css';
import { FaFacebook, FaInstagram } from 'react-icons/fa';

const Footer: React.FC = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="social-links">
                    {/* Replace '#' with actual profile URLs */}
                    <a href="#" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                        <FaFacebook size={24} />
                    </a>
                    <a href="#" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                        <FaInstagram size={24} />
                    </a>
                </div>
                <div className="footer-text">
                    <p>
                        ¿Tienes un negocio y quieres una página web?{' '}
                        <a href="mailto:tuemail@ejemplo.com" className="contact-link">Contáctame</a>
                    </p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
