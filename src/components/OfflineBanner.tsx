'use client';

import { useApp } from '@/lib/store';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflineBanner() {
  const { state, toggleOnline, syncPending } = useApp();

  if (state.isOnline && state.pendingQueue.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 rounded-xl p-4 shadow-xl"
      style={{ background: '#0b3c5d', border: '1px solid #0b3c5d' }}
    >
      <div className="flex items-start gap-3">
        <WifiOff size={20} className="text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="text-white font-bold text-sm">
            {state.isOnline ? 'Pending Requests' : 'Offline Mode Active'}
          </div>
          <div className="text-gray-400 text-xs mt-1">
            {state.pendingQueue.length} request(s) queued for sync.
            {!state.isOnline && ' System is operating in offline mode.'}
          </div>
          <div className="mt-2 text-xs text-blue-300">
            Fallback: Use IVR (1800-XXX-XXXX) or send SMS to 567
          </div>
          {state.pendingQueue.length > 0 && state.isOnline && (
            <button
              onClick={() => { void syncPending(); }}
              className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: '#1d4ed8' }}
            >
              <RefreshCw size={12} />
              Sync Now ({state.pendingQueue.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
