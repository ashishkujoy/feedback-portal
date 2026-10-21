import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The API's default WEB_APP_URL is http://localhost:5173, so the port must not drift.
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
