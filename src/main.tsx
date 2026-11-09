import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ASEngine } from './engine';
import './styles.css';

declare global {
  interface Window {
    ASEngine: typeof ASEngine;
    ASApp: Record<string, unknown>;
  }
}

// Engine functions on window for testing in the browser console,
// e.g. ASEngine.runRandomWalkTest() or runRandomWalkTest().
window.ASEngine = ASEngine;
Object.assign(window, ASEngine);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
