import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { loadReference } from './db/reference.ts';
import { startPushSync } from './lib/push.ts';
import { AdminRoute, ErrorScreen, Layout } from './layout.tsx';
import { AddPage } from './pages/add.tsx';
import { CabinetPage } from './pages/cabinet.tsx';
import { ItemPage } from './pages/item.tsx';
import { ProductPage } from './pages/product.tsx';
import { SettingsPage } from './pages/settings.tsx';
import { SymptomPage, SymptomsPage } from './pages/symptoms.tsx';
import './styles.css';

// Start downloading the SÚKL data right away; screens that need it suspend until it's ready.
loadReference().catch(() => {});

// Keep the push server's reminder schedule in step with the cabinet.
startPushSync();

// Ask the browser not to evict the cabinet under storage pressure (granted automatically for installed apps on most browsers).
navigator.storage?.persist?.().catch(() => {});

const router = createBrowserRouter([
  {
    path: '/admin',
    errorElement: <ErrorScreen />,
    element: <AdminRoute />,
  },
  {
    element: <Layout />,
    errorElement: <ErrorScreen />,
    children: [
      { path: '/', element: <CabinetPage /> },
      { path: '/add', element: <AddPage /> },
      { path: '/item/:id', element: <ItemPage /> },
      { path: '/product/:sukl', element: <ProductPage /> },
      { path: '/symptoms', element: <SymptomsPage /> },
      { path: '/symptoms/:id', element: <SymptomPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]);

// The Matomo snippet in index.html tracks the initial page view; report client-side navigations here.
let trackedPath = location.pathname;
router.subscribe((state) => {
  if (state.location.pathname === trackedPath) return;
  trackedPath = state.location.pathname;
  const paq = (window._paq ??= []);
  paq.push(['setCustomUrl', trackedPath]);
  paq.push(['setDocumentTitle', document.title]);
  paq.push(['trackPageView']);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
