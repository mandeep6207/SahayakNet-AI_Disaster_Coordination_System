'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import RequestCard from '@/components/RequestCard';
import { explainPriority, mergeMessage, priorityLabel } from '@/lib/aiLogic';
import MissionTimeline from '@/components/MissionTimeline';
import RequestDetailModal from '@/components/RequestDetailModal';

const MapView = dynamic(() => import('../../../components/MapView'), { ssr: false });

function normalizePhone(value: string | null | undefined) {
  return (value || '').replace(/\D/g, '');
}

function getVolunteerHintPhone() {
  if (typeof window === 'undefined') return '';

  const savedPhone = localStorage.getItem('volunteer_phone') || localStorage.getItem('volunteer_last_phone') || '';
  if (savedPhone) return savedPhone;

  const latestRaw = localStorage.getItem('volunteer_application_latest');
  if (!latestRaw) return '';

  try {
    const latest = JSON.parse(latestRaw) as { phone?: string };
    return latest.phone || '';
  } catch {
    return '';
  }
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dx = (a.lat - b.lat) * 111;
  const dy = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

function statusBadge(status: string) {
  if (status === 'completed') return 'bg-green-100 text-green-700';
  if (status === 'on_the_way') return 'bg-blue-100 text-blue-700';
  if (status === 'assigned') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function missionStatusLine(status: string) {
  if (status === 'completed') return 'Completed';
  if (status === 'on_the_way') return 'On the way';
  if (status === 'assigned') return 'Assigned';
  return 'Pending';
}

export default function VolunteerDashboardPage() {
  const router = useRouter();
  const {
    state,
    assignRequest,
    startMissionById,
    completeRequestById,
    setVolunteerAvailability,
    logout,
    isMutating,
  } = useApp();

  const [expandedRequestId, setExpandedRequestId] = useState<string>('');
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const me = useMemo(
    () => {
      const volunteerList = state.dashboard.volunteers;
      if (volunteerList.length === 0) return undefined;

      const phoneCandidates = [state.user.phone, getVolunteerHintPhone()]
        .map((phone) => normalizePhone(phone))
        .filter(Boolean);

      const byPhone = volunteerList.find((vol) => phoneCandidates.includes(normalizePhone(vol.phone)));
      if (byPhone) return byPhone;

      const byName = volunteerList.find((vol) => vol.name.trim().toLowerCase() === state.user.name.trim().toLowerCase());
      if (byName) return byName;

      const withActiveAssignedMission = volunteerList.find((vol) =>
        state.dashboard.requests.some((req) => req.assignedVolunteerId === vol.id && req.status !== 'completed'),
      );

      return withActiveAssignedMission ?? volunteerList[0];
    },
    [state.dashboard.volunteers, state.dashboard.requests, state.user.phone, state.user.name],
  );

  const mePosition = useMemo(() => ({
    lat: me?.lat ?? 23.3441,
    lng: me?.lng ?? 85.3096,
  }), [me?.lat, me?.lng]);

  const assignedMissions = useMemo(
    () => state.dashboard.requests
      .filter((req) => req.assignedVolunteerId === me?.id && req.status !== 'completed')
      .slice()
      .sort((a, b) => b.priority - a.priority),
    [state.dashboard.requests, me],
  );

  const nearbyRequests = useMemo(
    () => state.dashboard.requests
      .filter((req) => req.status === 'pending' && !req.assignedVolunteerId)
      .slice()
      .sort((a, b) => distanceKm(mePosition, a) - distanceKm(mePosition, b))
      .slice(0, 12),
    [state.dashboard.requests, mePosition],
  );

  const suggested = useMemo(() => {
    if (nearbyRequests.length === 0) return null;
    return nearbyRequests
      .slice()
      .sort((a, b) => {
        const scoreA = a.priority - distanceKm(mePosition, a) * 3;
        const scoreB = b.priority - distanceKm(mePosition, b) * 3;
        return scoreB - scoreA;
      })[0];
  }, [nearbyRequests, mePosition]);

  const mapRequests = useMemo(
    () => [...assignedMissions, ...nearbyRequests.slice(0, 8)],
    [assignedMissions, nearbyRequests],
  );

  const detailRequest = useMemo(
    () => (detailRequestId ? state.dashboard.requests.find((req) => req.id === detailRequestId) ?? null : null),
    [detailRequestId, state.dashboard.requests],
  );

  if (!me) return <div className="max-w-6xl mx-auto px-4 py-10">Loading dashboard...</div>;

  const handleStartMission = async (requestId: string) => {
    await startMissionById(requestId, me.id);
    setFeedback(`Mission started for ${requestId}`);
    window.setTimeout(() => setFeedback(''), 2200);
  };

  const handleCompleteMission = async (requestId: string) => {
    await completeRequestById(requestId);
    setFeedback(`Mission completed for ${requestId}`);
    window.setTimeout(() => setFeedback(''), 2200);
  };

  const handleLogout = () => {
    logout();
    localStorage.clear();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-[#0b3c5d]">Volunteer Operations Dashboard</h1>
              <p className="text-sm text-slate-600 mt-1">Field execution console connected with Citizen and NGO systems.</p>
              <p className="text-sm font-semibold text-slate-700 mt-1">Volunteer: {me.name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full font-semibold ${state.loading || isMutating ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {state.loading ? 'Syncing...' : isMutating ? 'Updating...' : 'Live'}
              </span>
              <select
                value={me.availability}
                onChange={(e) => setVolunteerAvailability(me.id, e.target.value as 'available' | 'busy' | 'inactive')}
                className="px-3 py-2 rounded-md border border-slate-300 text-sm"
              >
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="inactive">Inactive</option>
              </select>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Logout
              </button>
            </div>
          </div>
          {feedback && (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 status-flash">
              {feedback}
            </div>
          )}
        </section>

        <section className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-black text-[#0b3c5d]">Assigned Missions</h2>
              <span className="text-xs text-slate-500">Pending → Assigned → On the way → Completed</span>
            </div>

            <div className="space-y-3 max-h-120 overflow-y-auto pr-1">
              {assignedMissions.length === 0 && <p className="text-sm text-slate-500">No assigned missions currently.</p>}
              {assignedMissions.map((req) => {
                const missionState = req.executionStatus || 'assigned';
                const resourceText = req.resourceSummary || 'Resource details not available';
                return (
                  <div
                    key={req.id}
                    className="rounded-lg border border-slate-200 p-3 space-y-2 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 cursor-pointer"
                    onClick={() => setDetailRequestId(req.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">{req.id} - {req.name}</p>
                        <p className="text-xs text-slate-500 capitalize">{req.category} | {req.location}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusBadge(missionState)}`}>
                        {missionStatusLine(missionState)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">Priority: {priorityLabel(req.priority)}</span>
                      <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700">ETA: {req.eta || 'Calculating...'}</span>
                      <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700">Need: {req.category.toUpperCase()}</span>
                    </div>

                    <div className="text-xs text-slate-600">{resourceText}</div>

                    <MissionTimeline
                      requestId={req.id}
                      createdAt={req.createdAt}
                      status={req.status}
                      executionStatus={req.executionStatus}
                      compact
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleStartMission(req.id);
                        }}
                        disabled={isMutating || missionState === 'on_the_way' || missionState === 'completed'}
                        className="px-3 py-1.5 rounded-md bg-[#0b3c5d] text-white text-xs transition-all duration-150 active:scale-[0.98] disabled:opacity-60"
                      >
                        Start Mission
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleCompleteMission(req.id);
                        }}
                        disabled={isMutating || missionState === 'completed'}
                        className="px-3 py-1.5 rounded-md border border-[#0b3c5d] text-[#0b3c5d] text-xs transition-all duration-150 active:scale-[0.98] disabled:opacity-60"
                      >
                        Complete Mission
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-black text-[#0b3c5d]">AI Assist Panel</h2>
            {suggested ? (
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p><strong>Suggested best task:</strong> {priorityLabel(suggested.priority)} {suggested.category} case {distanceKm(me, suggested).toFixed(1)} km away</p>
                <p><strong>Reason:</strong> {suggested.priorityReason || explainPriority(suggested)}</p>
                <p><strong>Recommended action:</strong> Accept immediately</p>
                <button
                  onClick={() => assignRequest(suggested.id, me.id)}
                  className="mt-2 px-3 py-2 rounded-md bg-[#0b3c5d] text-white text-xs transition-all duration-150 active:scale-[0.98]"
                >
                  Accept Suggested Mission
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No pending requests available for recommendation.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-black text-[#0b3c5d]">Nearby Requests</h2>
            <span className="text-xs text-slate-500">Unassigned and distance-sorted</span>
          </div>

          <div className="grid lg:grid-cols-2 gap-3 max-h-125 overflow-y-auto pr-1">
            {nearbyRequests.map((req) => {
              const km = distanceKm(me, req).toFixed(1);
              const isExpanded = expandedRequestId === req.id;
              return (
                <div
                  key={req.id}
                  className="border border-slate-200 rounded-lg p-3 space-y-2 transition-all duration-200 hover:shadow-sm hover:-translate-y-0.5 cursor-pointer"
                  onClick={() => setDetailRequestId(req.id)}
                >
                  <RequestCard request={req} compact={false} />
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">Distance: {km} km</span>
                    <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700">Source: {req.source ? req.source.replace('_', ' ').toUpperCase() : 'WEB'}</span>
                    <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700">Priority: {priorityLabel(req.priority)}</span>
                    {mergeMessage(req) && <span className="px-2 py-1 rounded-full bg-green-50 text-green-700">{mergeMessage(req)}</span>}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void assignRequest(req.id, me.id);
                      }}
                      className="px-3 py-1.5 rounded-md bg-[#0b3c5d] text-white text-xs transition-all duration-150 active:scale-[0.98]"
                    >
                      Accept Mission
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedRequestId(isExpanded ? '' : req.id);
                      }}
                      className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 text-xs"
                    >
                      View Details
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="text-xs text-slate-600 rounded-md bg-slate-50 p-2">
                      {req.priorityReason || explainPriority(req)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-black text-[#0b3c5d]">Live Mission Map</h2>
            {assignedMissions[0] && (
              <span className="text-xs text-slate-500">
                Distance: {distanceKm(mePosition, assignedMissions[0]).toFixed(1)} km | ETA: {assignedMissions[0].eta || 'Calculating...'}
              </span>
            )}
          </div>
          <MapView requests={mapRequests} volunteers={me ? [me] : []} height="430px" showHeatmap showClusters />
        </section>
      </div>
      <RequestDetailModal
        request={detailRequest}
        isOpen={Boolean(detailRequest)}
        onClose={() => setDetailRequestId(null)}
      />
    </div>
  );
}
