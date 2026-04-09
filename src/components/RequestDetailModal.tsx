'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect, useMemo } from 'react';
import { explainPriority, mergeMessage, priorityLabel, REQUEST_CATEGORY_LABELS, resourceEstimate, suggestNearestVolunteer } from '@/lib/aiLogic';
import { HelpRequest } from '@/lib/mockData';
import { useApp } from '@/lib/store';

const RequestMiniMap = dynamic(() => import('@/components/RequestMiniMap'), { ssr: false });

type Props = {
  request: HelpRequest | null;
  isOpen: boolean;
  onClose: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  on_the_way: 'On the Way',
  completed: 'Completed',
};

function effectiveStatus(request: HelpRequest) {
  if (request.status === 'completed' || request.executionStatus === 'completed') return 'completed';
  if (request.executionStatus === 'on_the_way') return 'on_the_way';
  if (request.status === 'assigned' || request.executionStatus === 'assigned') return 'assigned';
  return 'pending';
}

function statusTone(status: string) {
  if (status === 'completed') return 'bg-green-100 text-green-700 border-green-200';
  if (status === 'on_the_way') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (status === 'assigned') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function riskTone(priority: number) {
  const level = priorityLabel(priority);
  if (level === 'Critical') return 'bg-red-100 text-red-700 border-red-200';
  if (level === 'Medium') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-green-100 text-green-700 border-green-200';
}

function toTimeAgo(createdAt: string) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m ago` : `${hrs}h ago`;
  }
  return `${mins} min ago`;
}

function requirementText(request: HelpRequest) {
  const label = REQUEST_CATEGORY_LABELS[request.category];
  if (request.category === 'medical') return `${label} assistance required for ${request.people} people including immediate medicines and first-response care.`;
  if (request.category === 'rescue') return `${label} operation required for evacuation and immediate field extraction support.`;
  if (request.category === 'shelter') return `${label} support required due to unsafe/affected housing conditions.`;
  if (request.category === 'water') return `${label} support required to restore safe drinking water supply.`;
  if (request.category === 'baby_care') return `${label} support required including infant essentials.`;
  if (request.category === 'women_care') return `${label} support required including women-focused hygiene and safety kits.`;
  if (request.category === 'emergency_help') return `${label} support required with immediate emergency essentials.`;
  return `${label} assistance required for affected household(s).`;
}

function fallbackResourceBlock(request: HelpRequest) {
  return {
    food: request.category === 'food' ? request.people * 2 : 0,
    medical: request.category === 'medical' ? Math.max(1, Math.ceil(request.people / 2)) : 0,
    shelter: request.category === 'shelter' ? Math.max(1, Math.ceil(request.people / 4)) : 0,
    baby: request.category === 'baby_care' ? Math.max(1, Math.ceil(request.people / 2)) : 0,
    women: request.category === 'women_care' ? Math.max(1, Math.ceil(request.people / 2)) : 0,
  };
}

function parseBlock(location: string) {
  const firstSegment = location.split(',')[0]?.trim() || '';
  return firstSegment || 'Unknown block';
}

function suggestedAction(request: HelpRequest, hasVolunteer: boolean) {
  const stage = effectiveStatus(request);
  if (stage === 'pending' && request.priority >= 60) return 'Dispatch nearest available volunteer immediately and reserve rapid-response medical/rescue stock.';
  if (stage === 'pending') return 'Assign volunteer and pre-stage category-specific kits from nearest depot.';
  if (stage === 'assigned' && hasVolunteer) return 'Confirm volunteer departure and maintain ETA monitoring every 5 minutes.';
  if (stage === 'on_the_way') return 'Keep communication line active and prepare completion handoff checklist.';
  return 'Record response closure and keep this request in post-mission audit queue.';
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dx = (a.lat - b.lat) * 111;
  const dy = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

export default function RequestDetailModal({ request, isOpen, onClose }: Props) {
  const { state } = useApp();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const assignedVolunteer = useMemo(() => {
    if (!request?.assignedVolunteerId) return null;
    return state.dashboard.volunteers.find((vol) => vol.id === request.assignedVolunteerId) ?? null;
  }, [request, state.dashboard.volunteers]);

  const smartSuggestedVolunteer = useMemo(() => {
    if (!request) return null;
    return suggestNearestVolunteer(request, state.dashboard.volunteers);
  }, [request, state.dashboard.volunteers]);

  if (!isOpen || !request) return null;

  const stage = effectiveStatus(request);
  const risk = priorityLabel(request.priority);
  const mergeNote = mergeMessage(request);
  const source = request.source ? request.source.replace('_', ' ').toUpperCase() : 'WEB';
  const block = parseBlock(request.location);
  const district = request.zone || 'Dhanbad';
  const locationText = request.location || `Unknown location (approx zone: ${district})`;
  const lat = Number.isFinite(request.lat) ? request.lat : 0;
  const lng = Number.isFinite(request.lng) ? request.lng : 0;
  const resources = request.resourcesNeeded;
  const fallback = fallbackResourceBlock(request);
  const dronePeople = request.droneMeta?.peopleCount ?? request.peopleCount ?? request.people;
  const droneRisk = request.droneMeta?.riskLevel ?? request.riskLevel ?? risk;
  const droneDetectedAt = request.droneMeta?.detectedAt ?? request.detectedAt ?? request.createdAt;
  const droneImagePath = request.droneMeta?.image ?? request.droneImage;
  const droneImageUrl = droneImagePath
    ? (droneImagePath.startsWith('http') ? droneImagePath : `http://localhost:8000${droneImagePath}`)
    : '';

  const volunteerDistance = assignedVolunteer
    ? distanceKm({ lat: assignedVolunteer.lat, lng: assignedVolunteer.lng }, { lat: request.lat, lng: request.lng }).toFixed(1)
    : null;

  return (
    <div className="fixed inset-0 z-1000 flex items-center justify-center bg-slate-900/35 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="w-full max-w-6xl max-h-[95vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Request details modal">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Request Intelligence</div>
            <h2 className="text-xl font-black text-[#0b3c5d]">{request.id}</h2>
          </div>
          <button onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" aria-label="Close request detail modal">
            Close
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#0b3c5d]">Request Info</h3>
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${statusTone(stage)}`}>{STATUS_LABELS[stage]}</span>
              <span className="px-2 py-1 rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700">Source: {source}</span>
              <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${riskTone(request.priority)}`}>Risk: {risk}</span>
            </div>
            <p className="text-sm text-slate-700"><strong>Category:</strong> {REQUEST_CATEGORY_LABELS[request.category]}</p>
            <p className="text-sm text-slate-700"><strong>Detailed requirement:</strong> {requirementText(request)}</p>
            <p className="text-sm text-slate-700"><strong>AI explanation:</strong> {request.priorityReason || explainPriority(request)}</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#0b3c5d]">Citizen Info</h3>
            <p className="text-sm text-slate-700"><strong>Name:</strong> {request.name || 'Unknown user'}</p>
            <p className="text-sm text-slate-700"><strong>Phone:</strong> {request.phone || 'Not available'}</p>
            <p className="text-sm text-slate-700"><strong>Family size:</strong> {request.people}</p>
            <p className="text-sm text-slate-700"><strong>Risk level:</strong> {risk}</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#0b3c5d]">Location Info</h3>
            <p className="text-sm text-slate-700"><strong>Location:</strong> {locationText}</p>
            <p className="text-sm text-slate-700"><strong>Block/Sector:</strong> {block}</p>
            <p className="text-sm text-slate-700"><strong>District/Zone:</strong> {district}</p>
            <p className="text-sm text-slate-700"><strong>Coordinates:</strong> {lat.toFixed(6)}, {lng.toFixed(6)}</p>
            <RequestMiniMap request={request} volunteer={assignedVolunteer} />
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#0b3c5d]">Timing & Resource Info</h3>
            <p className="text-sm text-slate-700"><strong>Created at:</strong> {new Date(request.createdAt).toLocaleString()}</p>
            <p className="text-sm text-slate-700"><strong>Time ago:</strong> {toTimeAgo(request.createdAt)}</p>
            <p className="text-sm text-slate-700"><strong>ETA:</strong> {request.eta || 'Awaiting assignment'}</p>
            <p className="text-sm text-slate-700"><strong>Resource summary:</strong> {request.resourceSummary || resourceEstimate(request)}</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">Food units: {resources?.food_packets ?? fallback.food}</div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">Medical kits: {resources?.medicine_kits ?? fallback.medical}</div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">Shelter units: {resources?.shelter_units ?? fallback.shelter}</div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">Baby kits: {resources?.baby_care_kits ?? fallback.baby}</div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">Women kits: {resources?.women_care_kits ?? fallback.women}</div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">Water: {(resources?.water_supply ?? 0) + (resources?.water_liters ?? 0)}</div>
            </div>
          </section>

          {request.source === 'drone' && (
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <h3 className="text-sm font-black uppercase tracking-wide text-[#0b3c5d]">Drone Survey Detail</h3>
              <p className="text-sm text-slate-700"><strong>People detected:</strong> {dronePeople}</p>
              <p className="text-sm text-slate-700"><strong>Risk:</strong> {droneRisk}</p>
              <p className="text-sm text-slate-700"><strong>Status:</strong> {request.droneMeta?.statusText || 'Person Detected'}</p>
              <p className="text-sm text-slate-700"><strong>Timestamp:</strong> {new Date(droneDetectedAt).toLocaleString()}</p>
              <p className="text-sm text-slate-700"><strong>Location:</strong> {locationText}</p>
              {droneImageUrl && (
                <Image
                  src={droneImageUrl}
                  alt="Drone captured frame"
                  width={1200}
                  height={560}
                  unoptimized
                  className="w-full h-56 object-cover rounded-lg border border-slate-200"
                />
              )}
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#0b3c5d]">AI Insights</h3>
            <p className="text-sm text-slate-700"><strong>Priority reason:</strong> {request.priorityReason || explainPriority(request)}</p>
            <p className="text-sm text-slate-700"><strong>Merge detection:</strong> {mergeNote || 'No merge detected'}</p>
            <p className="text-sm text-slate-700"><strong>Suggested action:</strong> {suggestedAction(request, Boolean(assignedVolunteer))}</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <h3 className="text-sm font-black uppercase tracking-wide text-[#0b3c5d]">Volunteer Info</h3>
            {assignedVolunteer ? (
              <>
                <p className="text-sm text-slate-700"><strong>Name:</strong> {assignedVolunteer.name}</p>
                <p className="text-sm text-slate-700"><strong>Status:</strong> {STATUS_LABELS[stage]}</p>
                <p className="text-sm text-slate-700"><strong>Distance:</strong> {volunteerDistance} km</p>
                <p className="text-sm text-slate-700"><strong>Contact:</strong> {assignedVolunteer.phone}</p>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-700"><strong>Status:</strong> Not assigned</p>
                <p className="text-sm text-slate-700"><strong>Suggested nearest:</strong> {smartSuggestedVolunteer ? `${smartSuggestedVolunteer.name} (${smartSuggestedVolunteer.phone})` : 'No available volunteer found'}</p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
