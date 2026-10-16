import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { RouterProvider } from './lib/router';
import { AppProvider } from './state/AppContext';
import './index.css';

if (!import.meta.env.VITE_NATIVE_APP) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </RouterProvider>
  </React.StrictMode>
);
