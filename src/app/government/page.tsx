'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/lib/store';
import {
  explainPriority,
  mergeMessage,
  predictDepletion,
  predictDemand,
  priorityLabel,
  requiredResources,
  resourceEstimate,
  suggestNearestVolunteer,
} from '@/lib/aiLogic';
import StatCard from '@/components/StatCard';
import ResourceGauge from '@/components/ResourceGauge';
import RequestCard from '@/components/RequestCard';
import GovernmentPortalNav from '@/components/GovernmentPortalNav';
import RequestDetailModal from '@/components/RequestDetailModal';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function GovernmentPage() {
  const { state, assignRequest, changePriority, broadcastAlert, isAssigningRequest } = useApp();
  const [alertText, setAlertText] = useState('');
  const [focusedRequestId, setFocusedRequestId] = useState<string | null>(null);
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [lastDelivery, setLastDelivery] = useState<string>('');
  const [ivrToast, setIvrToast] = useState('');
  const seenIvrRequestIdsRef = useRef<Set<string>>(new Set());

  const activeRequests = useMemo(
    () => state.dashboard.requests
      .filter((req) => req.status !== 'completed')
      .slice()
      .sort((a, b) => b.priority - a.priority),
    [state.dashboard.requests],
  );

  useEffect(() => {
    const ivrRequests = state.dashboard.requests.filter((req) => req.source === 'ivr');
    const seen = seenIvrRequestIdsRef.current;

    const fresh = ivrRequests.filter((req) => !seen.has(req.id));
    ivrRequests.forEach((req) => seen.add(req.id));

    if (fresh.length > 0) {
      setIvrToast('📞 New IVR request received');
      const timer = window.setTimeout(() => setIvrToast(''), 2600);
      return () => window.clearTimeout(timer);
    }
  }, [state.dashboard.requests]);

  const forecasts = useMemo(() => predictDepletion(state.dashboard.resources), [state.dashboard.resources]);
  const required = useMemo(
    () => requiredResources(state.dashboard.requests.filter((item) => item.status !== 'completed')),
    [state.dashboard.requests],
  );

  const focusedRequest = useMemo(() => {
    if (focusedRequestId) {
      const found = activeRequests.find((req) => req.id === focusedRequestId);
      if (found) return found;
    }
    return activeRequests[0] ?? null;
  }, [activeRequests, focusedRequestId]);

  const detailRequest = useMemo(
    () => (detailRequestId ? state.dashboard.requests.find((req) => req.id === detailRequestId) ?? null : null),
    [detailRequestId, state.dashboard.requests],
  );

  const foodDemandPrediction = useMemo(
    () => predictDemand(state.dashboard.requests, 'food', 3),
    [state.dashboard.requests],
  );

  const summaryCards = [
    { label: 'Active Requests', value: state.dashboard.summary.activeRequests, icon: '📋', color: '#0b3c5d' },
    { label: 'Critical', value: state.dashboard.summary.criticalRequests, icon: '⚠️', color: '#c62828', urgent: state.dashboard.summary.criticalRequests > 0 },
    { label: 'Completed', value: state.dashboard.summary.completedRequests, icon: '✅', color: '#2e7d32' },
    { label: 'Volunteers Available', value: state.dashboard.summary.volunteersAvailable, icon: '🧑', color: '#0b3c5d' },
  ] as const;

  const assignNearest = async (requestId: string) => {
    const req = state.dashboard.requests.find((item) => item.id === requestId);
    if (!req) return;
    const nearest = suggestNearestVolunteer(req, state.dashboard.volunteers);
    if (!nearest) return;
    await assignRequest(requestId, nearest.id);
  };

  return (
    <div className="min-h-screen bg-white text-slate-700">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <section className="space-y-3">
          {ivrToast && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">
              {ivrToast}
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black text-[#0b3c5d]">NGO/Government AI Disaster Command Center</h1>
                <p className="text-sm text-slate-600 mt-1">Flood Response: Dhanbad. Live map, AI prioritization, resource command, and volunteer orchestration.</p>
              </div>
              <div className="text-xs font-semibold px-3 py-1.5 rounded-full bg-green-100 text-[#2e7d32] border border-green-200">
                Live auto-refresh every 3 seconds
              </div>
            </div>
          </div>

          <GovernmentPortalNav />

          <div className="grid md:grid-cols-4 gap-3">
            {summaryCards.map((card) => (
              <StatCard
                key={card.label}
                value={card.value}
                label={card.label}
                icon={card.icon}
                color={card.color}
                urgent={"urgent" in card ? card.urgent : false}
                subtext={card.label === 'Critical' ? 'Needs immediate action' : undefined}
              />
            ))}
          </div>
        </section>

        <section className="grid lg:grid-cols-10 gap-4 items-start">
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-[#f8fafc] overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#0b3c5d]">Live Operations Map</h2>
              <div className="text-xs text-slate-500">Red=Critical | Yellow=Medium | Green=Completed | Heat=Demand</div>
            </div>
            <MapView requests={state.dashboard.requests} volunteers={state.dashboard.volunteers} height="760px" showHeatmap showClusters />
          </div>

          <div className="lg:col-span-3 max-h-190 overflow-y-auto pr-1 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4 text-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#0b3c5d]">Live Request Stream</h3>
                <span className="text-xs text-slate-500">latest incoming</span>
              </div>
              <div className="space-y-3 mt-3">
                {activeRequests.slice(0, 6).map((req) => (
                  <div
                    key={req.id}
                    className={`space-y-2 p-2 rounded-lg border cursor-pointer ${focusedRequest?.id === req.id ? 'border-[#0b3c5d] bg-[#eef4fb]' : 'border-transparent'}`}
                    onMouseEnter={() => setFocusedRequestId(req.id)}
                    onClick={() => {
                      setFocusedRequestId(req.id);
                      setDetailRequestId(req.id);
                    }}
                  >
                    <RequestCard request={req} />
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={`px-2 py-1 rounded-full ${priorityLabel(req.priority) === 'Critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{priorityLabel(req.priority)}</span>
                      {mergeMessage(req) && <span className="px-2 py-1 rounded-full bg-green-50 text-green-700">{mergeMessage(req)}</span>}
                      <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700">Click to lock selection</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void assignNearest(req.id);
                        }}
                        disabled={isAssigningRequest(req.id)}
                        className="flex-1 px-2 py-1.5 rounded-md bg-[#0b3c5d] text-white text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isAssigningRequest(req.id) ? 'Assigning...' : 'Assign Volunteer'}
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void changePriority(req.id, req.priority + 5);
                        }}
                        className="flex-1 px-2 py-1.5 rounded-md border border-amber-600 text-amber-700 text-xs"
                      >
                        Increase Priority
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4 text-slate-700">
              <h3 className="font-bold text-[#0b3c5d]">AI Crisis Brain</h3>
              {focusedRequest ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p><strong>Selected:</strong> {focusedRequest.id} ({focusedRequest.category.replaceAll('_', ' ').toUpperCase()})</p>
                  <p><strong>Priority:</strong> {priorityLabel(focusedRequest.priority)}</p>
                  <p><strong>Reason:</strong> {focusedRequest.priorityReason || explainPriority(focusedRequest)}</p>
                  <p><strong>Resource calc:</strong> {focusedRequest.resourceSummary || resourceEstimate(focusedRequest)}</p>
                  <p><strong>Demand prediction:</strong> Expected {foodDemandPrediction + 10} requests in next 3 hours</p>
                  <p><strong>Recommendation:</strong> Send targeted supplies to {focusedRequest.zone} based on the selected request stream</p>
                  <p><strong>Recommendation:</strong> Deploy 3 volunteers to {focusedRequest.zone}</p>
                  <p><strong>Recommendation:</strong> Need 2 vehicles urgently</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No active request selected.</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4 text-slate-700">
              <h3 className="font-bold text-[#0b3c5d]">Inventory Status</h3>
              <div className="mt-3 space-y-2 text-sm">
                {state.dashboard.resources.map((resource) => {
                  const requiredValue = resource.name === 'Food Packets'
                    ? required.food
                    : resource.name === 'Medical Kits'
                      ? required.medicine
                      : resource.name === 'Shelter Units'
                        ? required.shelter
                        : resource.name === 'Baby Care Kits'
                          ? required.babyCare
                          : resource.name === 'Women Care Kits'
                            ? required.womenCare
                            : resource.name === 'Water Supply'
                              ? required.water
                              : required.emergency;
                  const shortage = Math.max(0, requiredValue - resource.available);
                  return (
                    <div key={resource.name} className="flex items-center justify-between gap-2">
                      <span>{resource.name}</span>
                      <span className={requiredValue > resource.available ? 'text-red-700 font-bold' : 'text-slate-700'}>
                        {resource.available} available / {requiredValue} required
                        {shortage > 0 ? ` | shortage ${shortage}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4 text-slate-700">
              <h3 className="font-bold text-[#0b3c5d]">Resource Prediction</h3>
              <ResourceGauge resources={state.dashboard.resources} forecasts={forecasts} />
              <div className="mt-3 text-xs text-slate-600 space-y-1">
                {state.dashboard.resources.map((resource) => {
                  const daysLeft = resource.dailyConsumption ? (resource.available / resource.dailyConsumption).toFixed(1) : 'n/a';
                  return <p key={resource.name}>{resource.name}: {daysLeft === 'n/a' ? 'No prediction' : `will run out in ${daysLeft} days`}</p>;
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4 text-slate-700 space-y-3">
              <h3 className="font-bold text-[#0b3c5d]">Alert System</h3>
              <textarea className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" rows={3} value={alertText} onChange={(e) => setAlertText(e.target.value)} placeholder="Send disaster broadcast alert" />
              <button onClick={async () => {
                const msg = alertText.trim();
                if (!msg) return;
                await broadcastAlert(msg);
                setLastDelivery('Message sent to 1200 users | Delivered via SMS / IVR / WhatsApp');
                setAlertText('');
              }} className="w-full px-3 py-2 rounded-md bg-[#0b3c5d] text-white">Send Alert</button>
              {lastDelivery && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md p-2">{lastDelivery}</div>}
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {state.dashboard.alerts.slice(0, 8).map((item, index) => (
                  <div key={`${item}-${index}`} className="text-xs p-2 rounded bg-slate-50 border border-slate-200">{item}</div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4 text-slate-700">
              <h3 className="font-bold text-[#0b3c5d]">System Recommendations</h3>
              <ul className="mt-2 space-y-1 text-sm list-disc pl-5">
                <li>Zone B needs {Math.max(120, required.food)} food kits</li>
                <li>Zone C requires 2 ambulances</li>
                <li>High priority rescue deployment needed in Dhanbad flood pockets</li>
                <li>Need {Math.max(2, Math.ceil(state.dashboard.summary.criticalRequests / 4))} vehicles urgently</li>
              </ul>
            </div>
          </div>
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
