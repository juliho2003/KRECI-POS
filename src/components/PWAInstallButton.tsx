import { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 border border-amber-500 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap cursor-pointer"
        title="Install KULTURE REVIVAL POS App"
      >
        <Download className="h-3.5 w-3.5 text-amber-700" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
          title="Install on iPhone / iPad"
        >
          <Smartphone className="h-3.5 w-3.5 text-amber-600" />
          <span className="hidden sm:inline">Install iOS</span>
        </button>

        {showIOSGuide && (
          <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-sm bg-white border border-slate-200 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Install on iPhone / iPad</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4 space-y-2.5 text-xs text-slate-600">
                <p>
                  1. Tap the <strong>Share</strong> icon in your Safari toolbar.
                </p>
                <p>
                  2. Scroll down and tap <strong>Add to Home Screen</strong>.
                </p>
                <p>
                  3. Open <strong>KREC POS</strong> from your Home Screen in full-screen app mode.
                </p>
              </div>
              <div className="border-t border-slate-200 px-4 py-3 bg-slate-50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  Got It
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="no-print fixed bottom-4 left-4 z-50 flex items-center gap-2 border border-amber-700 bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
      Offline Mode — Cached shell active
    </div>
  );
}
