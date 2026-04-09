'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/store';
import OfflineBanner from '@/components/OfflineBanner';

const CATEGORIES = [
  { id: 'food', label: '🍞 Food', tone: 'bg-green-50 border-green-200 text-green-700' },
  { id: 'medical', label: '💊 Medical', tone: 'bg-red-50 border-red-200 text-red-700' },
  { id: 'rescue', label: '🚑 Rescue', tone: 'bg-amber-50 border-amber-200 text-amber-700' },
  { id: 'shelter', label: '🏠 Shelter', tone: 'bg-blue-50 border-blue-200 text-blue-700' },
  { id: 'baby_care', label: '🍼 Baby Care', tone: 'bg-pink-50 border-pink-200 text-pink-700' },
  { id: 'women_care', label: '🩷 Women Care', tone: 'bg-rose-50 border-rose-200 text-rose-700' },
  { id: 'water', label: '💧 Water', tone: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
  { id: 'emergency_help', label: '⚠️ Emergency', tone: 'bg-slate-50 border-slate-200 text-slate-700' },
] as const;

function sourceLabel(source?: 'web' | 'ivr' | 'whatsapp' | 'missed_call' | 'drone') {
  return (source || 'web').replace('_', ' ').toUpperCase();
}

function RequestHelpContent() {
  const params = useSearchParams();
  const initialCategory = (params?.get('category') as 'food' | 'medical' | 'rescue' | 'shelter' | 'baby_care' | 'women_care' | 'water' | 'emergency_help' | null) ?? 'food';
  const router = useRouter();
  const { state, createRequest, toggleOnline } = useApp();

  const [name, setName] = useState(state.user.name || 'Citizen User');
  const [phone, setPhone] = useState(state.user.phone || localStorage.getItem('citizen_last_phone') || '');
  const [location, setLocation] = useState(state.user.location || 'Ranchi, Jharkhand');
  const [people, setPeople] = useState(3);
  const [category, setCategory] = useState(initialCategory);
  const [requestId, setRequestId] = useState('');
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);

  const pickPeople = [1, 2, 3, 5, 8, 12];

  const submit = async () => {
    if (!phone.trim() || !location.trim()) {
      setError('Phone and location are required.');
      return;
    }

    const result = await createRequest({
      name: name.trim() || 'Citizen User',
      phone: phone.trim(),
      category,
      people,
      location: location.trim(),
      zone: location.includes('Dhanbad') ? 'Dhanbad' : location.includes('Jamshedpur') ? 'Jamshedpur' : 'Ranchi',
    });

    localStorage.setItem('citizen_last_phone', phone.trim());

    if (result) {
      setRequestId(result.id);
      setError('');
    } else {
      setError('Will send when network returns. Saved safely offline.');
    }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setError('Location access not available in this browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation(`Lat ${latitude.toFixed(4)}, Lng ${longitude.toFixed(4)}, Jharkhand`);
        setLocating(false);
      },
      () => {
        setError('Unable to detect location, please type manually.');
        setLocating(false);
      },
      { timeout: 10000 },
    );
  };

  if (requestId) {
    return (
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="rounded-2xl border border-slate-200 shadow-sm bg-white p-6 text-center space-y-3">
          <h1 className="text-2xl font-black text-[#0b3c5d]">Request Submitted</h1>
          <p className="text-slate-600">Request ID</p>
          <p className="text-2xl font-black text-[#0b3c5d]">{requestId}</p>
          <p className="text-sm text-slate-600">Source: {sourceLabel('web')}</p>
          <button onClick={() => router.push(`/request-status?id=${requestId}`)} className="w-full px-4 py-3 rounded-xl bg-[#0b3c5d] text-white font-semibold">Track Status</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
      <div className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5">
        <h1 className="text-3xl font-black text-[#0b3c5d]">Emergency Help Request</h1>
          <p className="text-slate-600 mt-1">Simple emergency request flow for every household need.</p>

        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-slate-500">Online Sync</span>
          <button onClick={() => toggleOnline(!state.isOnline)} className={`w-12 h-6 rounded-full ${state.isOnline ? 'bg-green-500' : 'bg-slate-400'}`} aria-label="Toggle online mode">
            <div className={`h-5 w-5 rounded-full bg-white transition-transform ${state.isOnline ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
          <span className={`text-xs font-semibold ${state.isOnline ? 'text-green-700' : 'text-amber-700'}`}>
            {state.isOnline ? 'Connected' : 'Offline queue active'}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5 space-y-4">
        <div>
          <div className="text-lg font-black text-[#0b3c5d]">Step 1: Select Help Type</div>
          <div className="grid grid-cols-2 gap-3 mt-3 md:grid-cols-4">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-4 py-5 rounded-xl border text-lg font-bold ${category === c.id ? 'bg-[#0b3c5d] text-white border-[#0b3c5d]' : c.tone}`}
            >
              {c.label}
            </button>
          ))}
          </div>
        </div>

        <div>
          <div className="text-lg font-black text-[#0b3c5d]">Step 2: Basic Details</div>
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <input className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="mt-3 grid md:grid-cols-[1fr_auto] gap-2">
            <input className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
            <button
              onClick={detectLocation}
              className="px-4 py-3 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50"
            >
              {locating ? 'Detecting...' : 'Auto Detect'}
            </button>
          </div>

          <div className="mt-4">
            <div className="text-sm font-semibold text-slate-700">Family Members</div>
            <div className="grid grid-cols-6 gap-2 mt-2">
              {pickPeople.map((count) => (
                <button
                  key={count}
                  onClick={() => setPeople(count)}
                  className={`py-2 rounded-lg font-semibold border ${people === count ? 'bg-[#0b3c5d] text-white border-[#0b3c5d]' : 'bg-white border-slate-300 text-slate-700'}`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="text-lg font-black text-[#0b3c5d]">Step 3: Preview</div>
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-700">
            You requested <strong>{category.replaceAll('_', ' ').toUpperCase()}</strong> for <strong>{people}</strong> people.
          </div>
        </div>

        <div>
          <div className="text-lg font-black text-[#0b3c5d]">Step 4: Submit</div>
          {error && <p className="text-sm text-amber-700 mt-1">{error}</p>}
          <button onClick={submit} className="mt-3 w-full px-4 py-4 rounded-xl bg-[#c62828] hover:bg-[#a71f1f] text-white text-lg font-black">
            🚨 SUBMIT EMERGENCY REQUEST
          </button>
        </div>
      </div>

      <OfflineBanner />
    </div>
  );
}

export default function RequestHelpPage() {
  return (
    <Suspense fallback={<div className="max-w-xl mx-auto px-4 py-8 text-slate-600">Loading request form...</div>}>
      <RequestHelpContent />
    </Suspense>
  );
}
