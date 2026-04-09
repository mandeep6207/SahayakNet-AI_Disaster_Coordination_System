'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface ApplicationData {
  applicationId: string;
  fullName: string;
  age: number;
  phone: string;
  email?: string;
  address: string;
  district: string;
  state: string;
  skills: string[];
  vehicle: 'yes' | 'no';
  zone: string;
  submittedAt: string;
}

function VolunteerApplicationSubmittedContent() {
  const searchParams = useSearchParams();
  const [data] = useState<ApplicationData | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('volunteer_application_latest');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ApplicationData;
    } catch {
      return null;
    }
  });

  const applicationId = searchParams?.get('id') || data?.applicationId || 'VOL-0000';

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <section className="rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
          <div className="bg-[#0b3c5d] px-5 py-4 text-white">
            <h1 className="text-2xl font-black">Application Submitted Successfully</h1>
          </div>

          <div className="p-5 space-y-4 text-slate-700">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm text-slate-500">Application ID</div>
              <div className="text-2xl font-black text-[#0b3c5d]">{applicationId}</div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-2 text-sm">
              <div><strong>Name:</strong> {data?.fullName || '-'}</div>
              <div><strong>Age:</strong> {data?.age || '-'}</div>
              <div><strong>Skills:</strong> {data?.skills?.join(', ') || '-'}</div>
              <div><strong>Area:</strong> {data?.zone || '-'}</div>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Your application is under review. You will be notified once approved.
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Link href="/" className="text-center py-2.5 rounded-lg border border-slate-300 text-slate-700 no-underline hover:bg-slate-50">
                Go to Home
              </Link>
              <Link href="/volunteer/apply" className="text-center py-2.5 rounded-lg bg-[#0b3c5d] text-white no-underline hover:bg-[#07263d]">
                Apply Another
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function VolunteerApplicationSubmittedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Loading application...</div>}>
      <VolunteerApplicationSubmittedContent />
    </Suspense>
  );
}
