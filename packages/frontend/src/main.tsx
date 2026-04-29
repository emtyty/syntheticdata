import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import './index.css';

// Apply persisted theme before React renders to avoid a flash of dark UI.
const savedTheme = localStorage.getItem('pref_theme');
if (savedTheme === 'light') {
  document.documentElement.classList.add('light');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
