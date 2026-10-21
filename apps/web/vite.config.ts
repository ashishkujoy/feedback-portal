import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';

/**
 * The browser only talks to this origin; the API stays at its root (nginx does the same in
 * production). The Origin header is kept, so the API's CSRF check sees the web app.
 */
const apiProxy: Record<string, ProxyOptions> = {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: false,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The API's default WEB_APP_URL is http://localhost:5173, so the port must not drift.
  server: { port: 5173, strictPort: true, proxy: apiProxy },
  preview: { port: 5173, strictPort: true, proxy: apiProxy },
});
