import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createMockServices } from './services/mock';
import { ServicesProvider } from './app/services';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/screens.css';

// Every service is simulated. To connect a real daemon, supply a different Services object here.
const services = createMockServices();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>
  </StrictMode>,
);
