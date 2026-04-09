'use client';

import { useMemo } from 'react';

type StageKey = 'pending' | 'assigned' | 'on_the_way' | 'completed';

type StageStampMap = Partial<Record<StageKey, string>>;

type StoreShape = Record<string, StageStampMap>;

interface MissionTimelineProps {
  requestId: string;
  createdAt: string;
  status: string;
  executionStatus?: string;
  compact?: boolean;
}

const STORAGE_KEY = 'sahayaknet_mission_timeline_stamps';

const STAGES: Array<{ key: StageKey; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'on_the_way', label: 'On the way' },
  { key: 'completed', label: 'Completed' },
];

function currentStageIndex(status: string, executionStatus?: string) {
  if (status === 'completed' || executionStatus === 'completed') return 3;
  if (executionStatus === 'on_the_way') return 2;
  if (status === 'assigned' || executionStatus === 'assigned') return 1;
  return 0;
}

function formatStamp(stamp?: string) {
  if (!stamp) return 'Awaiting';
  const time = new Date(stamp);
  if (Number.isNaN(time.getTime())) return 'Awaiting';
  return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function readStore(): StoreShape {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoreShape;
  } catch {
    return {};
  }
}

function writeStore(next: StoreShape) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export default function MissionTimeline({ requestId, createdAt, status, executionStatus, compact = false }: MissionTimelineProps) {
  const activeIndex = useMemo(() => currentStageIndex(status, executionStatus), [status, executionStatus]);

  const stamps = useMemo(() => {
    const nowIso = new Date().toISOString();
    const store = readStore();
    const existing = store[requestId] ?? {};

    const next: StageStampMap = {
      ...existing,
      pending: existing.pending ?? createdAt,
    };

    for (let idx = 0; idx <= activeIndex; idx += 1) {
      const stage = STAGES[idx].key;
      if (!next[stage]) {
        next[stage] = stage === 'pending' ? createdAt : nowIso;
      }
    }

    store[requestId] = next;
    writeStore(store);
    return next;
  }, [requestId, createdAt, activeIndex]);

  return (
    <div className="space-y-2">
      <div className="flex items-center">
        {STAGES.map((stage, idx) => {
          const reached = idx <= activeIndex;
          const active = idx === activeIndex;
          const done = idx < activeIndex;

          return (
            <div key={stage.key} className={`flex items-center ${idx === STAGES.length - 1 ? '' : 'flex-1'}`}>
              <div className="flex flex-col items-center min-w-14">
                <span
                  className={[
                    'h-6 w-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all duration-300',
                    done ? 'bg-[#0b3c5d] border-[#0b3c5d] text-white' : '',
                    active ? 'bg-white border-[#0b3c5d] text-[#0b3c5d] shadow-[0_0_0_4px_rgba(11,60,93,0.12)] animate-pulse' : '',
                    !reached ? 'bg-slate-100 border-slate-300 text-slate-400' : '',
                  ].join(' ')}
                >
                  {idx + 1}
                </span>
                {!compact && (
                  <>
                    <span className="mt-1 text-[11px] font-semibold text-slate-700 whitespace-nowrap">{stage.label}</span>
                    <span className={`text-[10px] whitespace-nowrap ${reached ? 'text-slate-500' : 'text-slate-400'}`}>
                      {reached ? formatStamp(stamps[stage.key]) : 'Awaiting'}
                    </span>
                  </>
                )}
              </div>
              {idx < STAGES.length - 1 && (
                <div className="flex-1 h-0.75 mx-1 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${idx < activeIndex ? 'w-full bg-[#0b3c5d]' : 'w-0 bg-[#0b3c5d]'}`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {compact && (
        <div className="text-[11px] text-slate-500">
          {STAGES.map((stage, idx) => `${idx + 1}. ${stage.label}`).join('  |  ')}
        </div>
      )}
    </div>
  );
}
