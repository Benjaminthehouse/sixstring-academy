import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/global.css';
import App from '@/app/App';
import { registerServiceWorker } from '@/core/platform/service-worker';
import { toast } from '@/ui';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable and offline in the standalone production app; nothing at all in the dev server or a
// Claude artifact. A new version waits for the learner: this toast, or the next launch.
void registerServiceWorker({
  onUpdateReady: (apply) =>
    toast({
      id: 'app-update',
      icon: 'RefreshCw',
      title: 'A new version is ready',
      description: 'Reload to use it now, or it starts next time you open the app.',
      action: { label: 'Reload', onClick: apply },
      duration: 0,
      news: true,
    }),
});
