import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const container = document.getElementById('plintus-profile-editor-paperjs-root');

if (container) {
    try {
        const root = ReactDOM.createRoot(container);
        root.render(<App />);
    } catch (error) {
        console.error('Error rendering React app:', error);
    }
}






