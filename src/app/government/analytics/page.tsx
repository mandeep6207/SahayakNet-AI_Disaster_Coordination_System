'use client';

import { useMemo } from 'react';
import GovernmentPortalNav from '@/components/GovernmentPortalNav';
import { useApp } from '@/lib/store';
import { averageResponseMinutes, demandTrendPoints } from '@/lib/aiLogic';

const MALE_NAMES = [
  'Rajesh Kumar',
  'Amit Singh',
  'Vikram Yadav',
  'Suresh Patel',
  'Manoj Verma',
  'Rohit Tiwari',
  'Arjun Thakur',
  'Sunil Jha',
  'Karan Mishra',
  'Deepak Sharma',
  'Ravi Prasad',
  'Anil Dubey',
  'Nitin Choudhary',
  'Harish Pandey',
  'Mohit Gupta',
  'Ajay Mehta',
  'Pankaj Sinha',
  'Sanjay Das',
  'Rahul Kulkarni',
  'Dinesh Reddy',
];

const FEMALE_NAMES = ['Priya Sharma', 'Neha Verma', 'Ananya Singh', 'Pooja Kumari', 'Kavya Iyer'];

function trendMeta(delta: number, inverseGood = false) {
  const up = delta > 0;
  const down = delta < 0;
  if (!up && !down) {
    return { arrow: '→', color: 'text-slate-500', label: 'stable' };
  }
  const good = inverseGood ? down : up;
  return {
    arrow: good ? '↑' : '↓',
    color: good ? 'text-green-700' : 'text-red-700',
    label: good ? 'improving' : 'worsening',
  };
}

function severityForPercent(percent: number) {
  if (percent > 90) return { level: 'critical', badge: '🚨 Immediate restock required', color: 'text-red-700' };
  if (percent > 70) return { level: 'warning', badge: '⚠️ Resources running low', color: 'text-amber-700' };
  return { level: 'safe', badge: 'Stock healthy', color: 'text-green-700' };
}

export default function GovernmentAnalyticsPage() {
  const { state } = useApp();

  const avgResponse = useMemo(() => averageResponseMinutes(state.dashboard.requests), [state.dashboard.requests]);
  const trend = useMemo(() => demandTrendPoints(state.dashboard.requests), [state.dashboard.requests]);
  const critical = state.dashboard.summary.criticalRequests;
  const completed = state.dashboard.summary.completedRequests;
  const total = state.dashboard.summary.totalRequests;
  const pending = useMemo(
    () => state.dashboard.requests.filter((item) => item.status === 'pending').length,
    [state.dashboard.requests],
  );

  const thisHour = trend[trend.length - 1]?.count ?? 0;
  const prevHour = trend[trend.length - 2]?.count ?? 0;
  const demandDelta = thisHour - prevHour;

  const maxCount = Math.max(...trend.map((point) => point.count), 1);
  const peakPoint = trend.reduce((best, row) => (row.count > best.count ? row : best), trend[0] ?? { label: '0h', count: 0 });

  const linePoints = trend
    .map((point, index) => {
      const x = 70 + index * 105;
      const y = 220 - (point.count / maxCount) * 170;
      return `${x},${y}`;
    })
    .join(' ');

  const resourceUsage = useMemo(
    () => state.dashboard.resources.map((resource) => ({
      ...resource,
      used: Math.max(0, resource.total - resource.available),
      usedPercent: Math.round((Math.max(0, resource.total - resource.available) / Math.max(1, resource.total)) * 100),
    })),
    [state.dashboard.resources],
  );

  const alerts = useMemo(() => {
    const resourceAlerts = resourceUsage
      .filter((item) => item.usedPercent > 70)
      .map((item) => ({
        id: `resource-${item.name}`,
        title: `${item.name} ${item.usedPercent > 90 ? 'critical' : 'running low'} in Dhanbad`,
        severity: item.usedPercent > 90 ? 'critical' : 'warning',
      }));

    const weatherAlerts = [
      { id: 'weather-1', title: 'Heavy rainfall expected in Ranchi', severity: 'warning' as const },
      { id: 'weather-2', title: 'River level rise watch active in Dhanbad', severity: 'critical' as const },
    ];

    const opsAlerts = [
      {
        id: 'ops-1',
        title: `High request surge in ${peakPoint.label}`,
        severity: peakPoint.count >= Math.max(3, prevHour + 1) ? 'critical' as const : 'warning' as const,
      },
      {
        id: 'ops-2',
        title: `Critical requests currently at ${critical}`,
        severity: critical >= 8 ? 'critical' as const : 'warning' as const,
      },
    ];

    return [...resourceAlerts, ...weatherAlerts, ...opsAlerts];
  }, [resourceUsage, peakPoint.label, peakPoint.count, prevHour, critical]);

  const volunteerRows = useMemo(() => {
    const names = [...MALE_NAMES, ...FEMALE_NAMES];
    const target = state.dashboard.volunteers.slice(0, 25);
    return target.map((vol, index) => ({
      ...vol,
      displayName: names[index] ?? vol.name,
      statusLabel: vol.availability === 'available' ? 'Active' : vol.availability === 'busy' ? 'Busy' : 'Inactive',
    }));
  }, [state.dashboard.volunteers]);

  const topActive = useMemo(
    () => volunteerRows.slice().sort((a, b) => b.tasksCompleted - a.tasksCompleted).slice(0, 5),
    [volunteerRows],
  );

  const overloaded = volunteerRows.filter((vol) => vol.tasksCompleted >= 6 || vol.availability === 'busy');

  const mostAffectedZone = useMemo(() => {
    const counter: Record<string, number> = {};
    state.dashboard.requests.forEach((req) => {
      counter[req.zone] = (counter[req.zone] ?? 0) + 1;
    });
    return Object.entries(counter).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Dhanbad';
  }, [state.dashboard.requests]);

  const medicalTrend = state.dashboard.requests.filter((req) => req.category === 'medical' && req.status !== 'completed').length;
  const babyTrend = state.dashboard.requests.filter((req) => req.category === 'baby_care' && req.status !== 'completed').length;
  const womenTrend = state.dashboard.requests.filter((req) => req.category === 'women_care' && req.status !== 'completed').length;
  const waterTrend = state.dashboard.requests.filter((req) => req.category === 'water' && req.status !== 'completed').length;
  const emergencyTrend = state.dashboard.requests.filter((req) => req.category === 'emergency_help' && req.status !== 'completed').length;
  const responseImprovement = Math.max(4, Math.min(18, Math.round((completed / Math.max(1, total)) * 20)));

  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {};
    state.dashboard.requests.forEach((request) => {
      counts[request.category] = (counts[request.category] ?? 0) + 1;
    });
    return counts;
  }, [state.dashboard.requests]);

  const signalStrip = [
    {
      id: 'sig-water',
      text: `${waterTrend >= 6 ? '⚠️' : '✔️'} Water ${waterTrend >= 6 ? 'critical' : 'stable'} (${waterTrend})`,
      tone: waterTrend >= 6 ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    {
      id: 'sig-medical',
      text: `${medicalTrend >= 6 ? '📈' : '✔️'} Medical ${medicalTrend >= 6 ? 'rising' : 'controlled'} (${medicalTrend})`,
      tone: medicalTrend >= 6 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    {
      id: 'sig-food',
      text: `${pending > completed ? '⚠️' : '✔️'} Ops ${pending > completed ? 'pending-heavy' : 'balanced'} (${pending}/${completed})`,
      tone: pending > completed ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    {
      id: 'sig-emergency',
      text: `${emergencyTrend >= 4 ? '⚠️' : '✔️'} Emergency ${emergencyTrend >= 4 ? 'high' : 'stable'} (${emergencyTrend})`,
      tone: emergencyTrend >= 4 ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
  ] as const;

  const kpis = [
    {
      label: 'Total Requests',
      value: total,
      trend: trendMeta(demandDelta),
      tone: 'text-[#0b3c5d]',
    },
    {
      label: 'Completed Requests',
      value: completed,
      trend: trendMeta(completed - pending),
      tone: 'text-green-700',
    },
    {
      label: 'Pending Requests',
      value: pending,
      trend: trendMeta(pending - completed, true),
      tone: pending > 35 ? 'text-red-700' : 'text-amber-700',
    },
    {
      label: 'Critical Requests',
      value: critical,
      trend: trendMeta(critical - (state.dashboard.summary.activeRequests - critical), true),
      tone: critical > 8 ? 'text-red-700' : 'text-amber-700',
    },
    {
      label: 'Avg Response Time',
      value: avgResponse,
      suffix: ' min',
      trend: trendMeta(avgResponse - 90, true),
      tone: avgResponse > 120 ? 'text-red-700' : avgResponse > 80 ? 'text-amber-700' : 'text-green-700',
    },
  ] as const;

  return (
    <div className="min-h-screen bg-white text-slate-700">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4">
          <h1 className="text-2xl font-black text-[#0b3c5d]">Government Command Analytics</h1>
          <p className="text-sm text-slate-600 mt-1">Real-time intelligence for requests, resources, volunteers, and operational alerts.</p>
          <div className="mt-2 text-xs text-slate-500">Simulation benchmark: 65 requests | 40 pending | 9 completed</div>
        </div>

        <GovernmentPortalNav />

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-[#0f172a] text-white px-4 py-2 text-sm font-semibold">Top KPI Dashboard</div>
          <div className="grid md:grid-cols-5 gap-3 p-3 bg-[#f8fafc]">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500">{kpi.label}</div>
                <div className={`text-3xl font-black ${kpi.tone}`}>{kpi.value}{'suffix' in kpi && kpi.suffix ? kpi.suffix : ''}</div>
                <div className={`text-xs mt-1 font-semibold ${kpi.trend.color}`}>{kpi.trend.arrow} {kpi.trend.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">Prediction strip</span>
            {signalStrip.map((signal) => (
              <span key={signal.id} className={`rounded-full border px-3 py-1 text-xs font-semibold ${signal.tone}`}>
                {signal.text}
              </span>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-[#0f172a] text-white px-4 py-2 text-sm font-semibold">Demand Trend (Last 8 Hours)</div>
            <div className="p-4 bg-[#f8fafc]">
              <div className="w-full overflow-x-auto">
                <svg width="920" height="270" viewBox="0 0 920 270" role="img" aria-label="Line chart requests per hour">
                  <line x1="60" y1="220" x2="880" y2="220" stroke="#cbd5e1" strokeWidth="2" />
                  <line x1="60" y1="25" x2="60" y2="220" stroke="#cbd5e1" strokeWidth="2" />
                  <polyline points={linePoints} fill="none" stroke="#0b3c5d" strokeWidth="4" strokeLinecap="round" />
                  {trend.map((point, index) => {
                    const x = 70 + index * 105;
                    const y = 220 - (point.count / maxCount) * 170;
                    const isPeak = point.label === peakPoint.label && point.count === peakPoint.count;
                    return (
                      <g key={point.label}>
                        <circle cx={x} cy={y} r={isPeak ? 7 : 5} fill={isPeak ? '#dc2626' : '#1e3a8a'} />
                        <text x={x} y={238} fontSize="12" textAnchor="middle" fill="#475569">{point.label}</text>
                        <text x={x} y={y - 10} fontSize="11" textAnchor="middle" fill="#0f172a">{point.count}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="mt-2 text-sm font-semibold text-red-700">🚨 Surge detected at {peakPoint.label}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-[#0f172a] text-white px-4 py-2 text-sm font-semibold">Live Alerts Panel</div>
            <div className="p-3 bg-[#f8fafc] max-h-80 overflow-y-auto space-y-2">
              {alerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-md border p-2 text-xs ${alert.severity === 'critical' ? 'border-red-300 bg-red-50 text-red-700' : 'border-amber-300 bg-amber-50 text-amber-700'}`}
                >
                  {alert.title}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-[#0f172a] text-white px-4 py-2 text-sm font-semibold">Resource Intelligence Panel</div>
            <div className="grid md:grid-cols-2 gap-3 p-3 bg-[#f8fafc]">
              {resourceUsage.map((item) => {
                const severity = severityForPercent(item.usedPercent);
                return (
                  <div key={item.name} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                    <div className="text-sm font-semibold text-slate-800">{item.name}</div>
                    <div className="text-xs text-slate-600">Used {item.used} / Total {item.total}</div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full ${item.usedPercent > 90 ? 'bg-red-600' : item.usedPercent > 70 ? 'bg-amber-500' : 'bg-green-600'}`}
                        style={{ width: `${item.usedPercent}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-600">{item.usedPercent}% consumed</div>
                    <div className={`text-xs font-semibold ${severity.color}`}>{severity.badge}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-[#0f172a] text-white px-4 py-2 text-sm font-semibold">AI Insights</div>
            <div className="p-3 bg-[#f8fafc] space-y-2 text-sm">
              <div className="rounded-md border border-slate-200 bg-white p-2">Most affected zone: <span className="font-semibold text-[#0b3c5d]">{mostAffectedZone}</span></div>
              <div className="rounded-md border border-slate-200 bg-white p-2">Medical trend: {medicalTrend >= 6 ? 'Rising rapidly' : 'Controlled'} ({medicalTrend})</div>
              <div className="rounded-md border border-slate-200 bg-white p-2">Care load: Baby {babyTrend} | Women {womenTrend} | Water {waterTrend} | Emergency {emergencyTrend}</div>
              <div className="rounded-md border border-slate-200 bg-white p-2">Response time improving by {responseImprovement}%</div>
              <div className="rounded-md border border-slate-200 bg-white p-2">Volunteer overload detected: {overloaded.length} volunteers</div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-[#0f172a] text-white px-4 py-2 text-sm font-semibold">Volunteer Performance Panel</div>
            <div className="p-3 bg-[#f8fafc] overflow-x-auto">
              <table className="w-full min-w-190 text-xs bg-white border border-slate-200 rounded-md overflow-hidden">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="text-left px-2 py-2">Name</th>
                    <th className="text-left px-2 py-2">Phone</th>
                    <th className="text-left px-2 py-2">Zone</th>
                    <th className="text-left px-2 py-2">Tasks Completed</th>
                    <th className="text-left px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {volunteerRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="px-2 py-2 font-medium text-slate-800">{row.displayName}</td>
                      <td className="px-2 py-2">{row.phone}</td>
                      <td className="px-2 py-2">{row.zone}</td>
                      <td className="px-2 py-2">{row.tasksCompleted}</td>
                      <td className="px-2 py-2">
                        <span className={`px-2 py-0.5 rounded-full ${row.statusLabel === 'Active' ? 'bg-green-100 text-green-700' : row.statusLabel === 'Busy' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {row.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-[#0f172a] text-white px-4 py-2 text-sm font-semibold">Volunteer Load Analysis</div>
            <div className="p-3 bg-[#f8fafc] space-y-2 text-xs">
              <div className="font-semibold text-slate-700">Top Active Volunteers</div>
              {topActive.map((vol) => (
                <div key={vol.id} className="rounded border border-slate-200 bg-white px-2 py-1">
                  {vol.displayName} - {vol.tasksCompleted} tasks
                </div>
              ))}
              <div className="pt-2 font-semibold text-amber-700">⚠️ Volunteer overload detected</div>
              {overloaded.slice(0, 5).map((vol) => (
                <div key={`over-${vol.id}`} className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">
                  {vol.displayName} - {vol.tasksCompleted} tasks ({vol.statusLabel})
                </div>
              ))}
              <div className="pt-2 font-semibold text-slate-700">Category mix</div>
              {Object.entries(categoryStats).slice(0, 6).map(([category, count]) => (
                <div key={category} className="rounded border border-slate-200 bg-white px-2 py-1 capitalize">
                  {category.replaceAll('_', ' ')}: {count}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
