import React from 'react';
import ReactDOM from 'react-dom/client';
import { SidePanel } from './presentation/SidePanel';

if (import.meta.env.DEV) console.log('[sidepanel] React app mounting');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
