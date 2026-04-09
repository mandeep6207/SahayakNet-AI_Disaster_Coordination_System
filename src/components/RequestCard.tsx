'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { HelpRequest } from '@/lib/mockData';
import { Clock, MapPin, Route, User } from 'lucide-react';
import { explainPriority, mergeMessage, priorityLabel, resourceEstimate } from '@/lib/aiLogic';
import MissionTimeline from './MissionTimeline';

const CAT_COLORS: Record<string, string> = {
  medical: '#c62828',
  rescue: '#f9a825',
  food: '#2e7d32',
  shelter: '#0b3c5d',
  baby_care: '#d81b60',
  women_care: '#ad1457',
  water: '#0288d1',
  emergency_help: '#374151',
};

const CAT_LABELS: Record<string, string> = {
  medical: 'Medical',
  rescue: 'Rescue',
  food: 'Food',
  shelter: 'Shelter',
  baby_care: 'Baby Care',
  women_care: 'Women Care',
  water: 'Water',
  emergency_help: 'Emergency Help',
};

interface Props {
  request: HelpRequest;
  onAssign?: () => void;
  assigning?: boolean;
  compact?: boolean;
}

export default function RequestCard({ request, onAssign, assigning = false, compact }: Props) {
  const color = CAT_COLORS[request.category] || '#0b3c5d';
  const [now, setNow] = useState(() => Date.now());
  const urgency = priorityLabel(request.priority);
  const mergeNote = mergeMessage(request);
  const source = request.source ? request.source.replace('_', ' ').toUpperCase() : 'WEB';
  const dronePeople = request.droneMeta?.peopleCount ?? request.peopleCount ?? request.people;
  const droneRisk = request.droneMeta?.riskLevel ?? request.riskLevel;
  const droneImage = request.droneMeta?.image ?? request.droneImage;
  const droneImageUrl = droneImage
    ? (droneImage.startsWith('http') ? droneImage : `http://localhost:8000${droneImage}`)
    : '';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const timeAgo = (iso: string) => {
    const diff = now - new Date(iso).getTime();
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h > 0) return `${h}h ${m}m ago`;
    return `${m}m ago`;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-bold text-gray-800 text-sm">{request.id}</div>
            <div className="text-xs text-gray-500">{request.name}</div>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize">{request.status}</span>
        </div>

        {!compact && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div className="flex items-center gap-1">
                <User size={12} />
                <span>{request.people} people</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock size={12} />
                <span>{timeAgo(request.createdAt)}</span>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500 truncate flex items-center gap-1"><MapPin size={12} />{request.location}</div>
            {request.source === 'drone' && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-700 font-semibold">
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">People: {dronePeople}</span>
                  {droneRisk && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">Risk: {droneRisk}</span>}
                </div>
                {droneImageUrl && (
                  <Image
                    src={droneImageUrl}
                    alt="Drone capture"
                    width={640}
                    height={160}
                    unoptimized
                    className="mt-2 h-20 w-full object-cover rounded-md border border-slate-200"
                  />
                )}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{CAT_LABELS[request.category] || request.category}</span>
              <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">Zone: {request.zone}</span>
              <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Source: {source}</span>
              <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Priority: {urgency}</span>
              {request.assignedVolunteerName && <span className="text-[11px] text-blue-700 font-medium px-2 py-0.5 rounded-full bg-blue-50">{request.assignedVolunteerName}</span>}
            </div>
            <div className="mt-3 space-y-1 text-xs text-slate-600">
              <div className="flex items-start gap-1.5"><Route size={12} className="mt-0.5" /><span>{request.priorityReason || explainPriority(request)}</span></div>
              <div className="text-slate-500">{request.resourceSummary || resourceEstimate(request)}</div>
              {mergeNote && <div className="text-green-700 font-medium">{mergeNote}</div>}
            </div>
            <div className="mt-3 border-t border-slate-100 pt-2">
              <MissionTimeline
                requestId={request.id}
                createdAt={request.createdAt}
                status={request.status}
                executionStatus={request.executionStatus}
                compact
              />
            </div>
          </>
        )}

        {onAssign && request.status === 'pending' && (
          <button
            onClick={onAssign}
            disabled={assigning}
            className="mt-3 w-full py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: '#0b3c5d' }}
          >
            {assigning ? 'Assigning...' : 'Assign Volunteer'}
          </button>
        )}
      </div>
    </div>
  );
}
