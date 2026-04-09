'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import Image from 'next/image';
import GovernmentPortalNav from '@/components/GovernmentPortalNav';
import { useApp } from '@/lib/store';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

type VehicleType = 'boat' | 'ambulance' | 'truck' | 'car' | 'helicopter';

interface VehicleUnit {
  id: string;
  type: VehicleType;
  label: string;
  icon: string;
  available: boolean;
  driverAssigned: string | null;
}

interface ResourceDraft {
  food: number;
  medical: number;
  rescueTools: number;
  babyCare: number;
  womenCare: number;
  waterSupply: number;
  emergencyEssentials: number;
}

interface DeliveryLog {
  id: string;
  volunteerName: string;
  resource: 'Food Kits' | 'Medical Kits' | 'Rescue Tools' | 'Baby Care Kits' | 'Women Care Kits' | 'Water Supply' | 'Emergency Essentials';
  quantity: number;
  at: string;
  requestId: string;
}

const CATEGORY_SKILL_HINTS: Record<string, string[]> = {
  food: ['logistics', 'cooking', 'coordination'],
  medical: ['medical', 'doctor', 'first aid', 'emergency', 'cpr'],
  rescue: ['rescue', 'swimming', 'boat', 'navigation', 'rope'],
  shelter: ['coordination', 'driving', 'communication', 'logistics'],
  baby_care: ['infant', 'baby', 'milk', 'care'],
  women_care: ['hygiene', 'support', 'care', 'coordination'],
  water: ['water', 'purification', 'distribution', 'logistics'],
  emergency_help: ['incident', 'response', 'emergency', 'coordination'],
};

const INITIAL_VEHICLES: VehicleUnit[] = [
  { id: 'VEH-001', type: 'ambulance', label: 'Ambulance', icon: '🚑', available: true, driverAssigned: null },
  { id: 'VEH-002', type: 'boat', label: 'Boat', icon: '🚤', available: true, driverAssigned: null },
  { id: 'VEH-003', type: 'truck', label: 'Truck', icon: '🚚', available: true, driverAssigned: null },
  { id: 'VEH-004', type: 'car', label: 'Car', icon: '🚗', available: true, driverAssigned: null },
  { id: 'VEH-005', type: 'helicopter', label: 'Helicopter', icon: '🚁', available: false, driverAssigned: 'Pilot Team Alpha' },
];

const MOCK_HISTORY: DeliveryLog[] = [
  { id: 'H-1', volunteerName: 'Volunteer 5', resource: 'Food Kits', quantity: 5, at: 'Today', requestId: 'REQ-MOCK' },
  { id: 'H-2', volunteerName: 'Volunteer 8', resource: 'Medical Kits', quantity: 2, at: 'Yesterday', requestId: 'REQ-MOCK' },
];

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dx = (a.lat - b.lat) * 111;
  const dy = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

function skillMatchPercent(skills: string[], category: string) {
  const expected = CATEGORY_SKILL_HINTS[category] ?? [];
  if (!expected.length) return 50;
  const normalized = skills.map((s) => s.toLowerCase());
  const matches = expected.filter((hint) => normalized.some((s) => s.includes(hint))).length;
  return Math.round((matches / expected.length) * 100);
}

export default function GovernmentVolunteersPage() {
  const { state, assignRequest, setVolunteerAvailability, isAssigningRequest, isMutating } = useApp();

  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [sameZoneOnly, setSameZoneOnly] = useState(true);
  const [activeByVolunteer, setActiveByVolunteer] = useState<Record<string, boolean>>({});
  const [vehicles, setVehicles] = useState<VehicleUnit[]>(INITIAL_VEHICLES);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [resourceDraft, setResourceDraft] = useState<ResourceDraft>({ food: 0, medical: 0, rescueTools: 0, babyCare: 0, womenCare: 0, waterSupply: 0, emergencyEssentials: 0 });
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([]);
  const [showResourceHistory, setShowResourceHistory] = useState(false);
  const [notice, setNotice] = useState('');

  const openRequests = useMemo(
    () => state.dashboard.requests.filter((req) => req.status !== 'completed').slice(0, 30),
    [state.dashboard.requests],
  );

  const selectedRequest = useMemo(
    () => state.dashboard.requests.find((req) => req.id === selectedRequestId) ?? null,
    [selectedRequestId, state.dashboard.requests],
  );

  const selectedVolunteer = useMemo(
    () => state.dashboard.volunteers.find((vol) => vol.id === selectedVolunteerId) ?? null,
    [selectedVolunteerId, state.dashboard.volunteers],
  );

  const requestNeed = useMemo(() => {
    if (!selectedRequest) return { food: 0, medical: 0, rescueTools: 0, babyCare: 0, womenCare: 0, waterSupply: 0, emergencyEssentials: 0 };
    const needed = selectedRequest.resourcesNeeded;
    return {
      food: needed?.food_packets ?? (selectedRequest.category === 'food' ? selectedRequest.people * 2 : 0),
      medical: needed?.medicine_kits ?? (selectedRequest.category === 'medical' ? Math.max(1, Math.ceil(selectedRequest.people / 2)) : 0),
      rescueTools: selectedRequest.category === 'rescue' ? Math.max(1, needed?.rescue_boats ?? 1) : 0,
      babyCare: needed?.baby_care_kits ?? (selectedRequest.category === 'baby_care' ? Math.max(1, Math.ceil(selectedRequest.people / 2)) : 0),
      womenCare: needed?.women_care_kits ?? (selectedRequest.category === 'women_care' ? Math.max(1, Math.ceil(selectedRequest.people / 2)) : 0),
      waterSupply: (needed?.water_supply ?? needed?.water_liters ?? 0) || (selectedRequest.category === 'water' ? Math.max(4, selectedRequest.people * 4) : 0),
      emergencyEssentials: needed?.emergency_essentials ?? (selectedRequest.category === 'emergency_help' ? Math.max(1, Math.ceil(selectedRequest.people / 2)) : 0),
    };
  }, [selectedRequest]);

  const scoredVolunteers = useMemo(() => {
    return state.dashboard.volunteers
      .map((vol) => {
        const active = activeByVolunteer[vol.id] ?? vol.availability !== 'inactive';
        const sameZone = selectedRequest ? vol.zone === selectedRequest.zone : false;
        const availabilityScore = vol.availability === 'available' ? 30 : vol.availability === 'busy' ? 10 : 0;
        const zoneScore = sameZone ? 30 : 5;
        const activeScore = active ? 20 : 0;
        const matchPct = selectedRequest ? skillMatchPercent(vol.skills, selectedRequest.category) : 50;
        const skillScore = Math.round(matchPct * 0.15);
        const workloadScore = Math.max(0, 5 - Math.min(5, vol.tasksCompleted));
        const score = zoneScore + availabilityScore + activeScore + skillScore + workloadScore;
        const km = selectedRequest ? distanceKm(selectedRequest, vol) : 0;
        return { ...vol, active, sameZone, matchPct, score, km };
      })
      .sort((a, b) => b.score - a.score || a.km - b.km);
  }, [state.dashboard.volunteers, selectedRequest, activeByVolunteer]);

  const filteredVolunteers = useMemo(() => {
    return scoredVolunteers.filter((vol) => {
      if (availableOnly && vol.availability !== 'available') return false;
      if (sameZoneOnly && selectedRequest && !vol.sameZone) return false;
      return true;
    });
  }, [scoredVolunteers, availableOnly, sameZoneOnly, selectedRequest]);

  const bestMatch = filteredVolunteers[0] ?? null;

  const currentAssignedTask = useMemo(() => {
    if (!selectedVolunteer) return null;
    return state.dashboard.requests.find((req) => req.assignedVolunteerId === selectedVolunteer.id && req.status !== 'completed') ?? null;
  }, [selectedVolunteer, state.dashboard.requests]);

  const assignedResources = useMemo(() => {
    if (!selectedRequest) return { food: 0, medical: 0, rescueTools: 0, babyCare: 0, womenCare: 0, waterSupply: 0, emergencyEssentials: 0 };
    return deliveryLogs
      .filter((log) => log.requestId === selectedRequest.id)
      .reduce(
        (acc, log) => {
          if (log.resource === 'Food Kits') acc.food += log.quantity;
          if (log.resource === 'Medical Kits') acc.medical += log.quantity;
          if (log.resource === 'Rescue Tools') acc.rescueTools += log.quantity;
          if (log.resource === 'Baby Care Kits') acc.babyCare += log.quantity;
          if (log.resource === 'Women Care Kits') acc.womenCare += log.quantity;
          if (log.resource === 'Water Supply') acc.waterSupply += log.quantity;
          if (log.resource === 'Emergency Essentials') acc.emergencyEssentials += log.quantity;
          return acc;
        },
        { food: 0, medical: 0, rescueTools: 0, babyCare: 0, womenCare: 0, waterSupply: 0, emergencyEssentials: 0 },
      );
  }, [deliveryLogs, selectedRequest]);

  const remainingResources = {
    food: Math.max(0, requestNeed.food - assignedResources.food),
    medical: Math.max(0, requestNeed.medical - assignedResources.medical),
    rescueTools: Math.max(0, requestNeed.rescueTools - assignedResources.rescueTools),
    babyCare: Math.max(0, requestNeed.babyCare - assignedResources.babyCare),
    womenCare: Math.max(0, requestNeed.womenCare - assignedResources.womenCare),
    waterSupply: Math.max(0, requestNeed.waterSupply - assignedResources.waterSupply),
    emergencyEssentials: Math.max(0, requestNeed.emergencyEssentials - assignedResources.emergencyEssentials),
  };

  const totalDelivered = deliveryLogs.reduce((sum, row) => sum + row.quantity, 0);
  const visibleVolunteers = filteredVolunteers.slice(0, 20);
  const historyRows = deliveryLogs.length ? deliveryLogs : MOCK_HISTORY;
  const activeRequestLabel = selectedRequest?.category ? selectedRequest.category.replaceAll('_', ' ').toUpperCase() : 'NONE';

  const toggleActive = (volunteerId: string) => {
    setActiveByVolunteer((prev) => ({ ...prev, [volunteerId]: !(prev[volunteerId] ?? true) }));
  };

  const updateStatus = async (volunteerId: string, availability: 'available' | 'busy' | 'inactive') => {
    await setVolunteerAvailability(volunteerId, availability);
  };

  const addResourceLogs = (requestId: string, volunteerName: string) => {
    const now = new Date().toLocaleString();
    const logs: DeliveryLog[] = [];
    if (resourceDraft.food > 0) logs.push({ id: `LOG-${Date.now()}-F`, volunteerName, resource: 'Food Kits', quantity: resourceDraft.food, at: now, requestId });
    if (resourceDraft.medical > 0) logs.push({ id: `LOG-${Date.now()}-M`, volunteerName, resource: 'Medical Kits', quantity: resourceDraft.medical, at: now, requestId });
    if (resourceDraft.rescueTools > 0) logs.push({ id: `LOG-${Date.now()}-R`, volunteerName, resource: 'Rescue Tools', quantity: resourceDraft.rescueTools, at: now, requestId });
    if (resourceDraft.babyCare > 0) logs.push({ id: `LOG-${Date.now()}-B`, volunteerName, resource: 'Baby Care Kits', quantity: resourceDraft.babyCare, at: now, requestId });
    if (resourceDraft.womenCare > 0) logs.push({ id: `LOG-${Date.now()}-W`, volunteerName, resource: 'Women Care Kits', quantity: resourceDraft.womenCare, at: now, requestId });
    if (resourceDraft.waterSupply > 0) logs.push({ id: `LOG-${Date.now()}-H`, volunteerName, resource: 'Water Supply', quantity: resourceDraft.waterSupply, at: now, requestId });
    if (resourceDraft.emergencyEssentials > 0) logs.push({ id: `LOG-${Date.now()}-E`, volunteerName, resource: 'Emergency Essentials', quantity: resourceDraft.emergencyEssentials, at: now, requestId });
    if (logs.length > 0) setDeliveryLogs((prev) => [...logs, ...prev]);
  };

  const assignToRequest = async (volunteerId: string) => {
    if (!selectedRequestId || !selectedRequest) return;
    const volunteer = state.dashboard.volunteers.find((item) => item.id === volunteerId);
    if (!volunteer) return;

    if (selectedVehicleId) {
      setVehicles((prev) =>
        prev.map((vehicle) =>
          vehicle.id === selectedVehicleId
            ? { ...vehicle, available: false, driverAssigned: volunteer.name }
            : vehicle,
        ),
      );
    }

    addResourceLogs(selectedRequest.id, volunteer.name);
    await assignRequest(selectedRequestId, volunteerId);

    setNotice('🚨 Assignment successful. Resources will arrive in 3 hours.');
    setResourceDraft({ food: 0, medical: 0, rescueTools: 0, babyCare: 0, womenCare: 0, waterSupply: 0, emergencyEssentials: 0 });
  };

  const resourceRows = [
    { key: 'food', label: 'Food Kits', required: requestNeed.food, assigned: assignedResources.food, remaining: remainingResources.food },
    { key: 'medical', label: 'Medical Kits', required: requestNeed.medical, assigned: assignedResources.medical, remaining: remainingResources.medical },
    { key: 'rescue', label: 'Rescue Tools', required: requestNeed.rescueTools, assigned: assignedResources.rescueTools, remaining: remainingResources.rescueTools },
    { key: 'babyCare', label: 'Baby Care Kits', required: requestNeed.babyCare, assigned: assignedResources.babyCare, remaining: remainingResources.babyCare },
    { key: 'womenCare', label: 'Women Care Kits', required: requestNeed.womenCare, assigned: assignedResources.womenCare, remaining: remainingResources.womenCare },
    { key: 'waterSupply', label: 'Water Supply', required: requestNeed.waterSupply, assigned: assignedResources.waterSupply, remaining: remainingResources.waterSupply },
    { key: 'emergencyEssentials', label: 'Emergency Essentials', required: requestNeed.emergencyEssentials, assigned: assignedResources.emergencyEssentials, remaining: remainingResources.emergencyEssentials },
  ] as const;

  return (
    <div className="min-h-screen bg-white text-slate-700">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4">
          <h1 className="text-2xl font-black text-[#0b3c5d]">Volunteer Management Control Module</h1>
          <p className="text-sm text-slate-600 mt-1">Smart assignment, vehicle allocation, and resource tracking for operational control.</p>
        </div>

        <GovernmentPortalNav />

        <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4 space-y-3">
          {notice && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{notice}</div>}

          <label className="text-sm font-medium text-slate-700">Request for assignment/reassignment</label>
          <select value={selectedRequestId} onChange={(e) => setSelectedRequestId(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
            <option value="">Select open request</option>
            {openRequests.map((req) => (
              <option key={req.id} value={req.id}>{req.id} - {req.location} ({req.status})</option>
            ))}
          </select>

          <div className="grid md:grid-cols-3 gap-3 text-xs">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />AVAILABLE FILTER</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={sameZoneOnly} onChange={(e) => setSameZoneOnly(e.target.checked)} />ACTIVE FILTER (same zone)</label>
            <div className="text-slate-500">{selectedRequest ? `Selected zone: ${selectedRequest.zone}` : 'Select a request for zone-aware matching'}</div>
          </div>

          {selectedRequest && bestMatch && (
            <div className="rounded-lg border border-[#0b3c5d] bg-[#eef4fb] p-3 text-sm">
              <div className="font-semibold text-[#0b3c5d]">Best Match Volunteer</div>
              <div>{bestMatch.name} | Distance {bestMatch.km.toFixed(1)} km | Matching skills {bestMatch.matchPct}%</div>
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[70vh] overflow-y-auto pr-1">
            {visibleVolunteers.map((vol) => {
              const availabilityBadge = vol.availability === 'available' ? 'bg-green-100 text-green-700' : vol.availability === 'busy' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
              const local = Boolean(selectedRequest && vol.zone === selectedRequest.zone);
              return (
                <div key={vol.id} onClick={() => setSelectedVolunteerId(vol.id)} className={`rounded-lg border p-3 bg-white cursor-pointer transition-shadow hover:shadow-md ${bestMatch?.id === vol.id ? 'border-[#0b3c5d] bg-[#eef4fb]' : 'border-slate-200'}`}>
                  <div className="flex gap-3 items-start">
                    <Image src={vol.image} alt={vol.name} width={56} height={56} className="h-14 w-14 rounded-md object-cover border border-slate-200" />
                    <div className="text-xs flex-1">
                      <p className="font-semibold text-slate-800">{vol.name}</p>
                      <p>Age: {vol.age ?? 28}</p>
                      <p>Zone: {vol.zone}</p>
                      <p>Completed tasks: {vol.tasksCompleted}</p>
                      <p className="capitalize">Availability: <span className={`px-1.5 py-0.5 rounded-full ${availabilityBadge}`}>{vol.availability}</span></p>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-slate-600">Skills: {vol.skills.join(', ')}</div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100">{vol.km.toFixed(1)} km</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Match {vol.matchPct}%</span>
                    {local && <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">🔥 Best Local Match</span>}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={(e) => { e.stopPropagation(); void assignToRequest(vol.id); }} disabled={!selectedRequestId || isAssigningRequest(selectedRequestId)} className="px-2 py-1 rounded border border-[#0b3c5d] text-[#0b3c5d] text-xs disabled:opacity-50">{isAssigningRequest(selectedRequestId) ? 'Assigning...' : 'Assign'}</button>
                    <button onClick={(e) => { e.stopPropagation(); void updateStatus(vol.id, 'busy'); }} disabled={isMutating} className="px-2 py-1 rounded border border-amber-600 text-amber-700 text-xs disabled:opacity-50">Mark Busy</button>
                    <button onClick={(e) => { e.stopPropagation(); void updateStatus(vol.id, 'available'); }} disabled={isMutating} className="px-2 py-1 rounded border border-green-600 text-green-700 text-xs disabled:opacity-50">Mark Available</button>
                    <button onClick={(e) => { e.stopPropagation(); toggleActive(vol.id); }} className="px-2 py-1 rounded border border-slate-400 text-slate-700 text-xs">{vol.active ? 'Set Inactive' : 'Set Active'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selectedVolunteer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 modal-fade" onClick={() => setSelectedVolunteerId(null)}>
            <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl p-4 md:p-5 modal-scale" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-[#0b3c5d]">{selectedVolunteer.name}</h2>
                <button onClick={() => setSelectedVolunteerId(null)} className="h-8 w-8 rounded-full border border-slate-300 text-slate-600">X</button>
              </div>

              <div className="mt-3 grid lg:grid-cols-2 gap-4 max-h-[78vh] overflow-y-auto pr-1">
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-[#f8fafc] p-3">
                    <div className="flex gap-3 items-start">
                      <Image src={selectedVolunteer.image} alt={selectedVolunteer.name} width={72} height={72} className="h-18 w-18 rounded-lg object-cover border border-slate-200" />
                      <div className="text-xs text-slate-600 space-y-1">
                        <p className="font-semibold text-slate-800">Name: {selectedVolunteer.name}</p>
                        <p>Age: {selectedVolunteer.age ?? 28}</p>
                        <p>Zone: {selectedVolunteer.zone}</p>
                        <p>Current task: {currentAssignedTask ? `${currentAssignedTask.id} (${currentAssignedTask.category.replaceAll('_', ' ').toUpperCase()})` : 'No active task'}</p>
                        {selectedRequest && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{activeRequestLabel}</span>
                            {(selectedRequest.category === 'baby_care' || selectedRequest.category === 'women_care') && <span className="rounded-full bg-pink-50 px-2 py-0.5 font-semibold text-pink-700">Care priority</span>}
                            {selectedRequest.category === 'water' && <span className="rounded-full bg-cyan-50 px-2 py-0.5 font-semibold text-cyan-700">Water run</span>}
                            {selectedRequest.category === 'emergency_help' && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">Emergency response</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-[#f8fafc] p-3 text-sm">
                    <div className="font-semibold text-[#0b3c5d] mb-2">Status Controls</div>
                    <div className="text-xs mb-2">Active: {(activeByVolunteer[selectedVolunteer.id] ?? selectedVolunteer.availability !== 'inactive') ? 'Yes' : 'No'}</div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => { void updateStatus(selectedVolunteer.id, 'available'); }} disabled={isMutating} className="px-2 py-1 rounded border border-green-600 text-green-700 text-xs disabled:opacity-50">Mark Available</button>
                      <button onClick={() => { void updateStatus(selectedVolunteer.id, 'busy'); }} disabled={isMutating} className="px-2 py-1 rounded border border-amber-600 text-amber-700 text-xs disabled:opacity-50">Mark Busy</button>
                      <button onClick={() => toggleActive(selectedVolunteer.id)} className="px-2 py-1 rounded border border-slate-400 text-slate-700 text-xs">Toggle Active/Inactive</button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-[#f8fafc] p-3 text-sm">
                    <div className="font-semibold text-[#0b3c5d] mb-2">Vehicle Assignment</div>
                    <div className="grid grid-cols-2 gap-2">
                      {vehicles.map((vehicle) => (
                        <button
                          key={vehicle.id}
                          onClick={() => vehicle.available && setSelectedVehicleId(vehicle.id)}
                          disabled={!vehicle.available}
                          className={`text-left rounded-lg border p-2 text-xs ${selectedVehicleId === vehicle.id ? 'border-[#0b3c5d] bg-[#eef4fb]' : 'border-slate-200 bg-white'} disabled:opacity-50`}
                        >
                          <div className="font-semibold">{vehicle.icon} {vehicle.label}</div>
                          <div className={vehicle.available ? 'text-green-700' : 'text-amber-700'}>{vehicle.available ? 'Available' : 'Busy'}</div>
                          <div className="text-slate-500">Driver: {vehicle.driverAssigned ?? 'Not assigned'}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-[#f8fafc] p-3 text-sm">
                    <div className="font-semibold text-[#0b3c5d] mb-2">Resource Allocation</div>
                    {selectedRequest ? (
                      <>
                        <div className="text-xs text-slate-600 mb-2">Request: {selectedRequest.id} | Zone: {selectedRequest.zone}</div>
                        <div className="space-y-2">
                          {resourceRows.map((row) => {
                            const percent = row.required > 0 ? Math.min(100, Math.round((row.assigned / row.required) * 100)) : 0;
                            return (
                              <div key={row.key} className="rounded border border-slate-200 bg-white p-2 text-xs">
                                <div className="font-semibold">{row.label}</div>
                                <div>Required: {row.required} | Assigned: {row.assigned} | Remaining: {row.remaining}</div>
                                <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                  <div className="h-full bg-[#0b3c5d]" style={{ width: `${percent}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                          <input type="number" min={0} value={resourceDraft.food} onChange={(e) => setResourceDraft((prev) => ({ ...prev, food: Number(e.target.value) || 0 }))} className="border border-slate-300 rounded px-2 py-1 text-xs" placeholder="Food" />
                          <input type="number" min={0} value={resourceDraft.medical} onChange={(e) => setResourceDraft((prev) => ({ ...prev, medical: Number(e.target.value) || 0 }))} className="border border-slate-300 rounded px-2 py-1 text-xs" placeholder="Medical" />
                          <input type="number" min={0} value={resourceDraft.rescueTools} onChange={(e) => setResourceDraft((prev) => ({ ...prev, rescueTools: Number(e.target.value) || 0 }))} className="border border-slate-300 rounded px-2 py-1 text-xs" placeholder="Rescue" />
                          <input type="number" min={0} value={resourceDraft.babyCare} onChange={(e) => setResourceDraft((prev) => ({ ...prev, babyCare: Number(e.target.value) || 0 }))} className="border border-slate-300 rounded px-2 py-1 text-xs" placeholder="Baby" />
                          <input type="number" min={0} value={resourceDraft.womenCare} onChange={(e) => setResourceDraft((prev) => ({ ...prev, womenCare: Number(e.target.value) || 0 }))} className="border border-slate-300 rounded px-2 py-1 text-xs" placeholder="Women" />
                          <input type="number" min={0} value={resourceDraft.waterSupply} onChange={(e) => setResourceDraft((prev) => ({ ...prev, waterSupply: Number(e.target.value) || 0 }))} className="border border-slate-300 rounded px-2 py-1 text-xs" placeholder="Water" />
                          <input type="number" min={0} value={resourceDraft.emergencyEssentials} onChange={(e) => setResourceDraft((prev) => ({ ...prev, emergencyEssentials: Number(e.target.value) || 0 }))} className="border border-slate-300 rounded px-2 py-1 text-xs" placeholder="Emergency" />
                        </div>

                        <button onClick={() => setShowResourceHistory(true)} className="mt-2 w-full px-2 py-1.5 rounded border border-[#0b3c5d] text-[#0b3c5d] text-xs">View Resource History</button>
                        <button onClick={() => { void assignToRequest(selectedVolunteer.id); }} disabled={isAssigningRequest(selectedRequest.id)} className="mt-2 w-full px-3 py-2 rounded-md bg-[#0b3c5d] text-white text-sm disabled:opacity-50">{isAssigningRequest(selectedRequest.id) ? 'Assigning...' : 'Confirm Assignment'}</button>
                      </>
                    ) : (
                      <div className="text-xs text-slate-500">Select a request to allocate resources.</div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-[#f8fafc] p-3">
                    <div className="font-semibold text-[#0b3c5d] text-sm mb-2">Location Mini View</div>
                    {selectedRequest ? <MapView requests={[selectedRequest]} volunteers={[selectedVolunteer]} height="220px" showHeatmap={false} showClusters={false} /> : <div className="text-xs text-slate-500">Select a request to view location context.</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showResourceHistory && (
          <div className="fixed inset-0 z-60 bg-black/50 modal-fade" onClick={() => setShowResourceHistory(false)}>
            <div className="ml-auto h-full w-full max-w-xl bg-white shadow-2xl p-4 md:p-5 modal-slide" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-[#0b3c5d]">Resource History</h3>
                <button onClick={() => setShowResourceHistory(false)} className="text-xs px-2 py-1 rounded border border-slate-300">Close</button>
              </div>
              <div className="text-xs text-slate-600 mb-3">Total delivered: {totalDelivered} | Remaining need: {remainingResources.food + remainingResources.medical + remainingResources.rescueTools + remainingResources.babyCare + remainingResources.womenCare + remainingResources.waterSupply + remainingResources.emergencyEssentials}</div>
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full text-xs bg-white">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="text-left px-2 py-2">Volunteer Name</th>
                      <th className="text-left px-2 py-2">Resource Delivered</th>
                      <th className="text-left px-2 py-2">Quantity</th>
                      <th className="text-left px-2 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-200">
                        <td className="px-2 py-2">{row.volunteerName}</td>
                        <td className="px-2 py-2">{row.resource}</td>
                        <td className="px-2 py-2">{row.quantity}</td>
                        <td className="px-2 py-2">{row.at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <style jsx global>{`
          .modal-fade {
            animation: modalFade 0.2s ease-out;
          }
          .modal-scale {
            animation: modalScale 0.22s ease-out;
          }
          .modal-slide {
            animation: modalSlide 0.24s ease-out;
          }
          @keyframes modalFade {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes modalScale {
            from { opacity: 0; transform: translateY(8px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes modalSlide {
            from { transform: translateX(18px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}
