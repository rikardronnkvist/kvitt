import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
import { registerServiceWorker } from './lib/pushNotifications.js';
import { initTheme } from './lib/theme.js';

if (import.meta.env.DEV) {
  console.log('Kvitt frontend running in dev mode');
}

initTheme();
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
