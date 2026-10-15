import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { loadReference } from './db/reference.ts';
import { ErrorScreen, Layout } from './layout.tsx';
import { AddPage } from './pages/add.tsx';
import { CabinetPage } from './pages/cabinet.tsx';
import { ItemPage } from './pages/item.tsx';
import { ProductPage } from './pages/product.tsx';
import { SettingsPage } from './pages/settings.tsx';
import { SymptomPage, SymptomsPage } from './pages/symptoms.tsx';
import './styles.css';

// Start downloading the SÚKL data right away; screens that need it suspend until it's ready.
loadReference().catch(() => {});

// Ask the browser not to evict the cabinet under storage pressure (granted automatically for installed apps on most browsers).
navigator.storage?.persist?.().catch(() => {});

const router = createBrowserRouter([
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
