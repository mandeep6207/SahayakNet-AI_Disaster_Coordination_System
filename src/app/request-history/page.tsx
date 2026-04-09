'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useApp } from '@/lib/store';
import RequestDetailModal from '@/components/RequestDetailModal';

function statusTone(status: string) {
  if (status === 'completed') return 'bg-green-100 text-green-700';
  if (status === 'assigned') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function resultLabel(status: string) {
  if (status === 'completed') return 'Resolved';
  if (status === 'assigned') return 'In Progress';
  return 'Awaiting Assignment';
}

export default function RequestHistoryPage() {
  const { state } = useApp();
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);

  const requests = useMemo(() => {
    const savedPhone = typeof window !== 'undefined' ? localStorage.getItem('citizen_last_phone') ?? '' : '';
    const lookupPhone = state.user.phone || savedPhone;
    const matched = lookupPhone ? state.dashboard.requests.filter((item) => item.phone === lookupPhone) : [];
    return (matched.length > 0 ? matched : state.dashboard.requests).slice(0, 20);
  }, [state.dashboard.requests, state.user.phone]);

  const detailRequest = useMemo(
    () => (detailRequestId ? state.dashboard.requests.find((req) => req.id === detailRequestId) ?? null : null),
    [detailRequestId, state.dashboard.requests],
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <section className="rounded-2xl border border-slate-200 shadow-sm bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black text-[#0b3c5d]">Request History</h1>
              <p className="text-sm text-slate-600 mt-1">Past and current requests with result details.</p>
            </div>
            <Link href="/citizen" className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 no-underline hover:bg-slate-50">
              Back to Dashboard
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 shadow-sm bg-white p-4 overflow-x-auto">
          <table className="w-full min-w-170 text-sm">
            <thead>
              <tr className="text-left border-b border-slate-200 text-slate-600">
                <th className="py-2 px-2">Request ID</th>
                <th className="py-2 px-2">Type</th>
                <th className="py-2 px-2">Date</th>
                <th className="py-2 px-2">Source</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2">Result</th>
                <th className="py-2 px-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                  onClick={() => setDetailRequestId(item.id)}
                >
                  <td className="py-2 px-2 font-semibold text-slate-700">{item.id}</td>
                  <td className="py-2 px-2 uppercase">{item.category}</td>
                  <td className="py-2 px-2 text-slate-600">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="py-2 px-2">{item.source ? item.source.replace('_', ' ').toUpperCase() : 'WEB'}</td>
                  <td className="py-2 px-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusTone(item.status)}`}>
                      {item.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-slate-600">{resultLabel(item.status)}</td>
                  <td className="py-2 px-2">
                    <Link
                      href={`/request-status?id=${item.id}`}
                      className="text-[#0b3c5d] font-semibold no-underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
