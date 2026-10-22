import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApp } from './app/create-app.ts';
import { loadTelemetry } from './telemetry/load-telemetry.ts';
import './styles.css';

const root = document.querySelector('#root');
if (!root) throw new Error('index.html has no #root element');

// Before the first request, so `/me` and `/settings` are traced too.
await loadTelemetry(import.meta.env.VITE_OTEL_TRACES_URL);

const { queryClient, router } = createApp();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
