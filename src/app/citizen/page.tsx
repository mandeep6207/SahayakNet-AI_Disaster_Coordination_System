'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useApp } from '@/lib/store';
import MissionTimeline from '@/components/MissionTimeline';
import RequestDetailModal from '@/components/RequestDetailModal';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

const CATEGORY_BUTTONS = [
  { id: 'food', label: '🍞 Food', tone: 'bg-green-50 text-green-700 border-green-200' },
  { id: 'medical', label: '💊 Medical', tone: 'bg-red-50 text-red-700 border-red-200' },
  { id: 'rescue', label: '🚑 Rescue', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'shelter', label: '🏠 Shelter', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'baby_care', label: '🍼 Baby Care', tone: 'bg-pink-50 text-pink-700 border-pink-200' },
  { id: 'women_care', label: '🩷 Women Care', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'water', label: '💧 Water', tone: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { id: 'emergency_help', label: '⚠️ Emergency', tone: 'bg-slate-50 text-slate-700 border-slate-200' },
] as const;

const FALLBACK_HISTORY = [
  { id: 'MOCK-1', category: 'food', status: 'assigned', text: '20 mins ago' },
  { id: 'MOCK-2', category: 'medical', status: 'completed', text: '2 hours ago' },
  { id: 'MOCK-3', category: 'rescue', status: 'pending', text: 'Yesterday' },
  { id: 'MOCK-4', category: 'shelter', status: 'completed', text: '2 days ago' },
  { id: 'MOCK-5', category: 'baby_care', status: 'pending', text: '2 days ago' },
] as const;

function statusTone(status: string) {
  if (status === 'completed') return 'bg-green-100 text-green-700';
  if (status === 'assigned') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function requestExecutionLine(status: string, executionStatus?: string) {
  if (status === 'completed' || executionStatus === 'completed') return 'Completed';
  if (executionStatus === 'on_the_way') return 'Volunteer is on the way';
  if (status === 'assigned' || executionStatus === 'assigned') return 'Assigned';
  return 'Pending assignment';
}

function executionProgress(status: string, executionStatus?: string) {
  if (status === 'completed' || executionStatus === 'completed') return 100;
  if (executionStatus === 'on_the_way') return 72;
  if (status === 'assigned' || executionStatus === 'assigned') return 42;
  return 16;
}

export default function CitizenPortalPage() {
  const router = useRouter();
  const { state, createRequest, logout } = useApp();

  const [location, setLocation] = useState('Dhanbad, Jharkhand');
  const [zone, setZone] = useState<'Dhanbad' | 'Ranchi' | 'Jamshedpur'>('Dhanbad');
  const [familySize, setFamilySize] = useState(3);
  const [sendingCategory, setSendingCategory] = useState<string>('');
  const [notice, setNotice] = useState('');
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [savedPhone] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('citizen_last_phone') || '' : ''));
  const [now, setNow] = useState(() => Date.now());

  const profileName = state.user.name || 'Citizen User';
  const profilePhone = state.user.phone || savedPhone || '9000000000';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude } = coords;
        const points = [
          { zone: 'Dhanbad' as const, lat: 23.7957, lng: 86.4304 },
          { zone: 'Ranchi' as const, lat: 23.3441, lng: 85.3096 },
          { zone: 'Jamshedpur' as const, lat: 22.8046, lng: 86.2029 },
        ];
        const nearest = points
          .slice()
          .sort((a, b) => ((a.lat - latitude) ** 2 + (a.lng - longitude) ** 2) - ((b.lat - latitude) ** 2 + (b.lng - longitude) ** 2))[0];
        setZone(nearest.zone);
        setLocation(`${nearest.zone}, Jharkhand`);
      },
      () => {
        setLocation('Dhanbad, Jharkhand');
        setZone('Dhanbad');
      },
      { timeout: 8000 },
    );
  }, []);

  const myRequests = useMemo(() => {
    const matched = state.dashboard.requests.filter((item) => item.phone === profilePhone);
    return (matched.length > 0 ? matched : state.dashboard.requests).slice(0, 8);
  }, [state.dashboard.requests, profilePhone]);

  const historyRows = useMemo(() => {
    if (myRequests.length === 0) return FALLBACK_HISTORY;
    return myRequests.slice(0, 6).map((item) => ({
      id: item.id,
      category: item.category,
      status: item.status,
      text: `${Math.max(1, Math.floor((now - new Date(item.createdAt).getTime()) / 60000))} mins ago`,
    }));
  }, [myRequests, now]);

  const latest = myRequests[0] || null;
  const detailRequest = useMemo(
    () => (detailRequestId ? state.dashboard.requests.find((request) => request.id === detailRequestId) ?? null : null),
    [detailRequestId, state.dashboard.requests],
  );
  const historyRequestMap = useMemo(() => new Map(myRequests.map((request) => [request.id, request])), [myRequests]);

  const assignedVolunteer = latest?.assignedVolunteerId
    ? state.dashboard.volunteers.find((v) => v.id === latest.assignedVolunteerId) || null
    : null;

  const sendRequest = async (category: 'food' | 'medical' | 'rescue' | 'shelter' | 'baby_care' | 'women_care' | 'water' | 'emergency_help') => {
    setSendingCategory(category);
    setNotice('');

    const payload = {
      name: profileName,
      phone: profilePhone,
      category,
      people: familySize,
      location,
      zone,
    };

    const result = await createRequest(payload);
    localStorage.setItem('citizen_last_phone', profilePhone);

    if (result) {
      setNotice(`Request Sent Successfully. ID: ${result.id}`);
    } else {
      setNotice('Request will be sent when network is available.');
    }

    setSendingCategory('');
  };

  const handleLogout = () => {
    logout();
    localStorage.clear();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold">Government of India | Ministry of Home Affairs | NDMA</div>
              <h1 className="text-3xl font-black text-[#0b3c5d] mt-1">Citizen Emergency Dashboard</h1>
              <div className="mt-2 text-base text-slate-700 font-semibold">👤 {profileName} | 📍 {location}</div>
            </div>
            <button onClick={handleLogout} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
              Logout
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="font-bold text-base">Flood warning in your area</div>
          <div className="text-sm mt-1">Keep phone active for updates</div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 text-center">
          <div className="mb-3 flex items-center justify-center gap-3 text-xs">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ${state.loading ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${state.loading ? 'bg-blue-600 animate-ping' : 'bg-emerald-600'}`} />
              {state.loading ? 'Syncing...' : 'Live sync active'}
            </span>
            {sendingCategory && <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">Updating...</span>}
          </div>
          <div className="text-lg font-bold text-[#0b3c5d] mb-3">One Tap Emergency Help</div>
          <button
            onClick={() => sendRequest('rescue')}
            disabled={sendingCategory !== ''}
            className="w-full py-6 rounded-2xl bg-[#c62828] hover:bg-[#a31f1f] active:scale-[0.99] transition-all duration-150 text-white text-3xl font-black disabled:opacity-60"
          >
            🚨 NEED HELP
          </button>

          <div className="grid sm:grid-cols-4 gap-2 mt-3">
            {CATEGORY_BUTTONS.map((item) => (
              <button
                key={item.id}
                onClick={() => sendRequest(item.id)}
                disabled={sendingCategory !== ''}
                className={`py-3 rounded-xl border font-bold text-lg ${item.tone} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.99] disabled:opacity-60`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <div className="text-sm text-slate-600 font-semibold mb-2">Family Members</div>
            <div className="flex flex-wrap justify-center gap-2">
              {[1, 2, 3, 4, 5].map((count) => (
                <button
                  key={count}
                  onClick={() => setFamilySize(count)}
                  className={`w-11 h-11 rounded-full border text-base font-bold ${familySize === count ? 'bg-[#0b3c5d] border-[#0b3c5d] text-white' : 'bg-white border-slate-300 text-slate-700'}`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {notice && (
            <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${notice.includes('Successfully') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {notice}
            </div>
          )}

          {!state.isOnline && (
            <div className="mt-3 text-sm font-semibold text-amber-700">Request will be sent when network is available</div>
          )}
        </section>

        <section className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-2">
            <h2 className="text-xl font-black text-[#0b3c5d]">Last Request Summary</h2>
            {latest ? (
              <>
                <div className="text-sm text-slate-700"><strong>ID:</strong> {latest.id}</div>
                <div className="text-sm text-slate-700"><strong>Type:</strong> {latest.category.replaceAll('_', ' ').toUpperCase()}</div>
                <div className="text-sm text-slate-700"><strong>Status:</strong> <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusTone(latest.status)}`}>{latest.status.toUpperCase()}</span></div>
                <div className="text-sm text-slate-700"><strong>ETA:</strong> {latest.eta || 'Awaiting assignment'}</div>
                <div className="text-sm text-slate-700"><strong>Volunteer:</strong> {latest.assignedVolunteerName || 'Not assigned yet'}</div>
                <div className="text-sm font-semibold text-[#0b3c5d] status-flash">{requestExecutionLine(latest.status, latest.executionStatus)}</div>

                <div className="pt-1">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>Mission progress</span>
                    <span>{executionProgress(latest.status, latest.executionStatus)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-[#0b3c5d] transition-all duration-700 ease-out"
                      style={{ width: `${executionProgress(latest.status, latest.executionStatus)}%` }}
                    />
                  </div>
                </div>

                <MissionTimeline
                  requestId={latest.id}
                  createdAt={latest.createdAt}
                  status={latest.status}
                  executionStatus={latest.executionStatus}
                />
                <button
                  onClick={() => setDetailRequestId(latest.id)}
                  className="mt-2 rounded-lg border border-[#0b3c5d] px-3 py-1.5 text-xs font-semibold text-[#0b3c5d] hover:bg-[#f2f7fd]"
                >
                  Open Full Details
                </button>
              </>
            ) : (
              <div className="text-sm text-slate-500">No live request yet. Press NEED HELP to start emergency workflow.</div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-2">
            <h2 className="text-xl font-black text-[#0b3c5d]">Citizen Profile</h2>
            <div className="text-sm text-slate-700"><strong>Name:</strong> {profileName}</div>
            <div className="text-sm text-slate-700"><strong>Phone:</strong> {profilePhone}</div>
            <div className="text-sm text-slate-700"><strong>Location:</strong> {location}</div>
            <div className="text-sm text-slate-700"><strong>Family:</strong> {familySize}</div>
          </div>
        </section>

        {latest && assignedVolunteer && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-xl font-black text-[#0b3c5d]">Volunteer Tracking</h2>
              <p className="text-sm text-slate-600">{requestExecutionLine(latest.status, latest.executionStatus)}</p>
            </div>
            <div className="grid lg:grid-cols-3 gap-3 p-4">
              <div className="space-y-2 text-sm text-slate-700">
                <div className="flex items-center gap-3">
                  <Image src={assignedVolunteer.image} alt={assignedVolunteer.name} width={56} height={56} className="w-14 h-14 rounded-full border border-slate-200 object-cover" />
                  <div>
                    <div className="font-semibold">{assignedVolunteer.name}</div>
                    <div className="text-xs text-slate-500">{assignedVolunteer.phone}</div>
                  </div>
                </div>
                <div><strong>ETA:</strong> {latest.eta || 'Arriving soon'}</div>
                <div><strong>Status:</strong> {requestExecutionLine(latest.status, latest.executionStatus)}</div>
              </div>
              <div className="lg:col-span-2 rounded-xl border border-slate-200 overflow-hidden">
                <MapView requests={[latest]} volunteers={[assignedVolunteer]} height="240px" showHeatmap showClusters />
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
          <h2 className="text-xl font-black text-[#0b3c5d]">Request History</h2>
          <div className="mt-3 space-y-2">
            {historyRows.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                onClick={() => {
                  if (historyRequestMap.has(item.id)) {
                    setDetailRequestId(item.id);
                  }
                }}
              >
                <div className="font-semibold text-slate-700">{item.category.toUpperCase()} - <span className="font-normal">{item.text}</span></div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusTone(item.status)}`}>{item.status.toUpperCase()}</span>
              </div>
            ))}
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
