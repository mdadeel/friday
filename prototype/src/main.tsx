import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createMockServices } from './services/mock';
import { createAutoDetectServices } from './services/daemon';
import { ServicesProvider } from './app/services';
import type { Services } from './services/contracts';
import './styles/tokens.css';
import './styles/app.css';

function Root() {
  const [services, setServices] = useState<Services>(() => createMockServices());

  useEffect(() => {
    createAutoDetectServices().then((detected) => {
      setServices(detected);
    });
  }, []);

  return (
    <StrictMode>
      <ServicesProvider services={services}>
        <App />
      </ServicesProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
