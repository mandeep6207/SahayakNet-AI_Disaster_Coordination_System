'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getRequestById, getRequests } from '@/lib/api';
import { HelpRequest } from '@/lib/mockData';
import RequestCard from '@/components/RequestCard';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { REQUEST_CATEGORY_LABELS, explainPriority, mergeMessage, priorityLabel, resourceEstimate } from '@/lib/aiLogic';
import { useApp } from '@/lib/store';
import MissionTimeline from '@/components/MissionTimeline';
import RequestDetailModal from '@/components/RequestDetailModal';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function RequestStatusContent() {
  const { state } = useApp();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams?.get('id') ?? '');
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<HelpRequest | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const statusTone = (status: string) => {
    if (status === 'completed') return 'bg-green-100 text-green-700';
    if (status === 'assigned') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  const executionLabel = (status: string, executionStatus?: string) => {
    if (status === 'completed' || executionStatus === 'completed') return 'Completed';
    if (executionStatus === 'on_the_way') return 'On the way';
    if (status === 'assigned' || executionStatus === 'assigned') return 'Assigned';
    return 'Pending';
  };

  useEffect(() => {
    const run = async () => {
      const term = query.trim();
      if (!searched || !term) {
        setResult(null);
        return;
      }

      setLoading(true);
      try {
        const live = state.dashboard.requests.find(
          (req) => req.id.toUpperCase() === term.toUpperCase() || req.phone === term,
        );
        if (live) {
          setResult(live);
        } else {
          const response = await getRequestById(term.toUpperCase());
          setResult(response);
        }
      } catch {
        const allRequests = await getRequests();
        const fallback = allRequests.find(
          (req) => req.id.toUpperCase() === term.toUpperCase() || req.phone === term,
        );
        setResult(fallback ?? null);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [query, searched, state.dashboard.requests]);

  useEffect(() => {
    const id = searchParams?.get('id');
    if (id) {
      setQuery(id);
      setSearched(true);
    }
  }, [searchParams]);

  const assignedVolunteer = result
    ? state.dashboard.volunteers.find((vol) => vol.id === result.assignedVolunteerId) ?? null
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
      <div className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5">
        <h1 className="text-3xl font-black text-[#0b3c5d]">Track Emergency Request</h1>
        <p className="text-sm text-slate-600 mt-1">Search by Request ID or phone number. Data refreshes every few seconds.</p>
        <div className="flex gap-2 mt-3">
          <input className="flex-1 border border-slate-300 rounded-xl px-4 py-3" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="REQ-0001 or phone" />
          <button onClick={() => setSearched(true)} className="px-6 py-3 rounded-xl bg-[#0b3c5d] text-white font-semibold">Search</button>
        </div>
      </div>

      {searched && !result && (
        <div className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5 text-sm text-slate-600">No request found.</div>
      )}

      {searched && loading && (
        <div className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5 text-sm text-slate-600">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
            Looking up the request...
          </span>
        </div>
      )}

      {searched && result && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="cursor-pointer" onClick={() => setShowDetailModal(true)}>
              <RequestCard request={result} compact={false} />
            </div>
            <button
              onClick={() => setShowDetailModal(true)}
              className="rounded-xl border border-[#0b3c5d] px-4 py-2 text-sm font-semibold text-[#0b3c5d] hover:bg-[#f2f7fd]"
            >
              Open Full Request Intelligence
            </button>

            <div className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5 space-y-3 text-sm text-slate-700">
              <h2 className="text-xl font-black text-[#0b3c5d]">Live Status</h2>
              <div className="flex flex-wrap gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusTone(result.status)}`}>{result.status.toUpperCase()}</span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">Execution: {executionLabel(result.status, result.executionStatus)}</span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">Source: {result.source ? result.source.replace('_', ' ').toUpperCase() : 'WEB'}</span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">Category: {REQUEST_CATEGORY_LABELS[result.category]}</span>
              </div>
              <MissionTimeline
                requestId={result.id}
                createdAt={result.createdAt}
                status={result.status}
                executionStatus={result.executionStatus}
              />
              <p><strong>ETA:</strong> {result.eta ? `Help will arrive in ${result.eta}` : 'Help team assignment in progress'}</p>
              <p><strong>On The Way:</strong> {executionLabel(result.status, result.executionStatus) === 'On the way' ? 'Yes, volunteer is moving to your location' : 'Awaiting dispatch'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 font-black text-[#0b3c5d]">Live Map View</div>
              <MapView
                requests={[result]}
                volunteers={assignedVolunteer ? [assignedVolunteer] : []}
                height="380px"
                showHeatmap
                showClusters
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5 space-y-2 text-sm text-slate-700">
              <h2 className="text-xl font-black text-[#0b3c5d]">Volunteer Connection</h2>
              {assignedVolunteer ? (
                <>
                  <div className="flex items-center gap-3">
                    <Image src={assignedVolunteer.image} alt={assignedVolunteer.name} width={48} height={48} className="w-12 h-12 rounded-full border border-slate-200 object-cover" />
                    <div>
                      <p className="font-semibold">{assignedVolunteer.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{assignedVolunteer.availability}</p>
                    </div>
                  </div>
                  <p><strong>Phone:</strong> {assignedVolunteer.phone}</p>
                  <p><strong>Skills:</strong> {assignedVolunteer.skills.join(', ')}</p>
                </>
              ) : (
                <p className="text-slate-500">Volunteer not assigned yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5 space-y-2 text-sm text-slate-700">
              <h2 className="text-xl font-black text-[#0b3c5d]">AI Visibility</h2>
              <p><strong>Priority:</strong> {priorityLabel(result.priority)}</p>
              <p><strong>Reason:</strong> {result.priorityReason || explainPriority(result)}</p>
              <p><strong>Resource calculation:</strong> {result.resourceSummary || resourceEstimate(result)}</p>
              <p><strong>Merge info:</strong> {mergeMessage(result) || 'No nearby merge yet'}</p>
              <p><strong>Humanitarian stream:</strong> {result.category.replaceAll('_', ' ').toUpperCase()}</p>
            </div>
          </div>
        </div>
      )}
      <RequestDetailModal
        request={result}
        isOpen={showDetailModal && Boolean(result)}
        onClose={() => setShowDetailModal(false)}
      />
    </div>
  );
}
