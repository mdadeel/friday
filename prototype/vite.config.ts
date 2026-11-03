import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The prototype has no backend. Dev server binds to 0.0.0.0 so the sandbox
// preview can reach it; allowedHosts is open because preview hosts are dynamic.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
