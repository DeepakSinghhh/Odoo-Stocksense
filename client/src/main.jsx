import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { LiveProvider } from './live.jsx';
import { ToastProvider } from './ui/toast.jsx';
import { applyTheme, savedTheme } from './ui/Layout.jsx';
import '@fontsource-variable/archivo/wdth';
import '@fontsource/big-shoulders-stencil-display/700';
import '@fontsource/big-shoulders-stencil-display/900';
import '@fontsource/caveat/500';
import '@fontsource/caveat/700';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';

applyTheme(savedTheme());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LiveProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </LiveProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
