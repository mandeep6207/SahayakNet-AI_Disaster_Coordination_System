'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import GovernmentPortalNav from '@/components/GovernmentPortalNav';
import { useApp } from '@/lib/store';
import { getAlertsHistory, getRiskAnalysis, getWeather, sendBroadcast } from '@/lib/api';
import { BroadcastHistoryItem, BroadcastMessageType, RiskAnalysis, WeatherData } from '@/lib/mockData';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

const ZONES = ['Dhanbad', 'Ranchi', 'Jamshedpur'] as const;
const MESSAGE_TYPES: BroadcastMessageType[] = ['emergency', 'warning', 'info'];

function riskStyles(level: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (level === 'HIGH') {
    return {
      banner: 'border-red-300 bg-red-50 text-red-800',
      badge: 'bg-red-600 text-white',
      glow: 'shadow-[0_0_0_2px_rgba(220,38,38,0.16)]',
    };
  }
  if (level === 'MEDIUM') {
    return {
      banner: 'border-amber-300 bg-amber-50 text-amber-900',
      badge: 'bg-amber-500 text-white',
      glow: 'shadow-[0_0_0_2px_rgba(217,119,6,0.16)]',
    };
  }
  return {
    banner: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    badge: 'bg-emerald-600 text-white',
    glow: 'shadow-[0_0_0_2px_rgba(5,150,105,0.16)]',
  };
}

function fmtHour(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDay(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString([], { weekday: 'short' });
}

export default function CommandCenterPage() {
  const { state } = useApp();
  const [selectedZone, setSelectedZone] = useState<(typeof ZONES)[number]>('Dhanbad');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [risk, setRisk] = useState<RiskAnalysis | null>(null);
  const [history, setHistory] = useState<BroadcastHistoryItem[]>([]);

  const [messageType, setMessageType] = useState<BroadcastMessageType>('warning');
  const [message, setMessage] = useState('');
  const [channels, setChannels] = useState<Array<'sms' | 'whatsapp' | 'app'>>(['sms', 'whatsapp', 'app']);

  const [loadingWeather, setLoadingWeather] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [deliveryToast, setDeliveryToast] = useState('');

  const role = state.user.role;
  const isNgo = role === 'government';

  const zoneRequests = useMemo(
    () => state.dashboard.requests.filter((item) => item.zone === selectedZone),
    [state.dashboard.requests, selectedZone],
  );

  const zoneVolunteers = useMemo(
    () => state.dashboard.volunteers.filter((item) => item.zone === selectedZone),
    [state.dashboard.volunteers, selectedZone],
  );

  const loadWeatherAndRisk = useCallback(async () => {
    setLoadingWeather(true);
    try {
      const [weatherRes, riskRes] = await Promise.all([
        getWeather(selectedZone),
        getRiskAnalysis(selectedZone),
      ]);
      setWeather(weatherRes);
      setRisk(riskRes);
      setError('');
    } catch (err) {
      setError((err as Error).message || 'Failed to load weather intelligence');
    } finally {
      setLoadingWeather(false);
    }
  }, [selectedZone]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await getAlertsHistory(20);
      setHistory(response.items);
    } catch {
      // Keep prior history in UI if polling fails temporarily.
    }
  }, []);

  useEffect(() => {
    void loadWeatherAndRisk();
    void loadHistory();
  }, [loadWeatherAndRisk, loadHistory]);

  useEffect(() => {
    const weatherTimer = window.setInterval(() => {
      void loadWeatherAndRisk();
    }, 60000);

    const historyTimer = window.setInterval(() => {
      void loadHistory();
    }, 5000);

    return () => {
      window.clearInterval(weatherTimer);
      window.clearInterval(historyTimer);
    };
  }, [loadHistory, loadWeatherAndRisk]);

  useEffect(() => {
    if (!risk) return;
    if (!message.trim()) {
      setMessage(risk.auto_message);
    }
  }, [risk, message]);

  const onChannelToggle = (channel: 'sms' | 'whatsapp' | 'app') => {
    setChannels((prev) => {
      if (prev.includes(channel)) {
        const next = prev.filter((item) => item !== channel);
        return next.length > 0 ? next : prev;
      }
      return [...prev, channel];
    });
  };

  const onAutoGenerate = () => {
    if (risk) {
      setMessage(risk.auto_message);
      return;
    }
    setMessage('Weather advisory active. Stay alert and follow official SahayakNet updates.');
  };

  const onSendBroadcast = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    if (!isNgo) {
      setError('Only NGO/Government users can send broadcast messages.');
      return;
    }

    setIsSending(true);
    try {
      const response = await sendBroadcast({
        zone: selectedZone,
        type: messageType,
        message: trimmed,
        channels,
        role: 'government',
        actorId: state.user.name || 'ngo-dashboard',
      });

      const counts = response.delivery.counts;
      const parts = Object.entries(counts).map(([k, v]) => `${k.toUpperCase()}: ${v}`);
      setDeliveryToast(`Broadcast sent in ${selectedZone} | ${parts.join(' | ')}`);
      setMessage('');
      setError('');
      await loadHistory();
      await loadWeatherAndRisk();
    } catch (err) {
      setError((err as Error).message || 'Unable to send broadcast');
    } finally {
      setIsSending(false);
    }
  };

  const riskLevel = risk?.risk_level ?? 'LOW';
  const riskUi = riskStyles(riskLevel);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(11,60,93,0.08),transparent_40%),radial-gradient(circle_at_85%_15%,rgba(37,99,235,0.12),transparent_35%),#f8fafc] pb-10 text-slate-800">
      <div className="mx-auto max-w-7xl space-y-4 px-4 pt-6">
        <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#0b3c5d]">Disaster Command Center</h1>
              <p className="mt-1 text-sm text-slate-600">
                Live weather intelligence, AI risk detection, and zone-aware emergency broadcast orchestration.
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
              Auto-refresh: Weather 60s | Alerts 5s
            </div>
          </div>
        </section>

        <GovernmentPortalNav />

        <section className="grid gap-4 lg:grid-cols-12">
          <article className="gov-card lg:col-span-8 overflow-hidden border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 bg-linear-to-r from-[#0b3c5d] to-[#2563eb] px-5 py-3 text-white">
              <h2 className="text-lg font-bold">Weather Watch | {selectedZone}</h2>
              <select
                value={selectedZone}
                onChange={(event) => setSelectedZone(event.target.value as (typeof ZONES)[number])}
                className="rounded-md border border-white/30 bg-white/15 px-2 py-1 text-sm text-white outline-none"
              >
                {ZONES.map((zone) => (
                  <option key={zone} value={zone} className="text-slate-900">
                    {zone}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-5 p-5">
              {loadingWeather && <p className="text-sm text-slate-500">Loading weather intelligence...</p>}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {weather && (
                <>
                  <div className="grid gap-3 sm:grid-cols-5">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Temperature</p>
                      <p className="mt-1 text-2xl font-extrabold text-[#0b3c5d]">{weather.current.temperature} deg C</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Humidity</p>
                      <p className="mt-1 text-2xl font-extrabold text-[#0b3c5d]">{weather.current.humidity}%</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Wind</p>
                      <p className="mt-1 text-2xl font-extrabold text-[#0b3c5d]">{weather.current.windSpeed} km/h</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Rain Probability</p>
                      <p className="mt-1 text-2xl font-extrabold text-[#0b3c5d]">{weather.current.rainProbability}%</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Condition</p>
                      <p className="mt-1 text-2xl font-extrabold text-[#0b3c5d]">{weather.current.condition}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-bold text-slate-700">Next 24 Hours Forecast</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {weather.hourly.slice(0, 24).map((item) => (
                        <div key={item.timestamp} className="rounded-lg border border-slate-200 bg-white p-2 text-xs">
                          <p className="font-semibold text-slate-700">{fmtHour(item.timestamp)}</p>
                          <p className="mt-1 text-[#0b3c5d]">{item.temp} deg C</p>
                          <p className="text-slate-600">Rain {item.rainProbability}%</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-bold text-slate-700">Next 7 Days Forecast</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                      {weather.daily.slice(0, 7).map((item) => (
                        <div key={item.timestamp} className="rounded-lg border border-slate-200 bg-white p-2 text-xs">
                          <p className="font-semibold text-slate-700">{fmtDay(item.timestamp)}</p>
                          <p className="mt-1 text-[#0b3c5d]">{item.minTemp} deg / {item.maxTemp} deg</p>
                          <p className="text-slate-600">Wind {item.windSpeed} km/h</p>
                          <p className="text-slate-600">Rain {item.rainProbability}%</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </article>

          <aside className={`gov-card lg:col-span-4 border ${riskUi.banner} ${riskUi.glow} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">AI Risk Detection</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskUi.badge}`}>Risk {riskLevel}</span>
            </div>
            <p className="mt-3 text-sm leading-6">
              {risk?.recommended_action || 'Risk analysis is syncing with weather telemetry.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(risk?.triggers ?? []).length === 0 && (
                <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  No active severe trigger
                </span>
              )}
              {(risk?.triggers ?? []).map((trigger) => (
                <span key={trigger} className="rounded-full border border-current/20 bg-white/70 px-3 py-1 text-xs font-semibold">
                  {trigger}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs opacity-80">Updated {risk ? new Date(risk.updatedAt).toLocaleTimeString() : 'just now'}</p>
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-12">
          <article className="gov-card lg:col-span-7 border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-lg font-bold text-[#0b3c5d]">Zone Operations Map</h2>
              <p className="text-xs text-slate-500">Requests and volunteers filtered by selected zone.</p>
            </div>
            <div className="px-5 py-4">
              <MapView requests={zoneRequests} volunteers={zoneVolunteers} height="460px" showHeatmap showClusters />
            </div>
          </article>

          <article className="gov-card lg:col-span-5 border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-[#0b3c5d]">Broadcast Panel</h2>
            <p className="mt-1 text-xs text-slate-500">Send zone-targeted emergency alerts via WhatsApp, SMS, and app notifications.</p>

            {!isNgo && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                You are in read-only mode. Only NGO/Government role can send broadcast alerts.
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Zone</span>
                <select
                  value={selectedZone}
                  onChange={(event) => setSelectedZone(event.target.value as (typeof ZONES)[number])}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  {ZONES.map((zone) => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Message Type</span>
                <select
                  value={messageType}
                  onChange={(event) => setMessageType(event.target.value as BroadcastMessageType)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  {MESSAGE_TYPES.map((type) => (
                    <option key={type} value={type}>{type.toUpperCase()}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery Channels</p>
              <div className="flex flex-wrap gap-2">
                {(['whatsapp', 'sms', 'app'] as const).map((channel) => {
                  const active = channels.includes(channel);
                  return (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => onChannelToggle(channel)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        active
                          ? 'border-[#0b3c5d] bg-[#0b3c5d] text-white'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      {channel.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="mt-3 block text-sm text-slate-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Message</span>
              <textarea
                rows={5}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Type your zone-targeted broadcast message here"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSendBroadcast}
                disabled={isSending || !isNgo}
                className="rounded-md bg-[#0b3c5d] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSending ? 'Sending...' : 'Send Broadcast'}
              </button>
              <button
                type="button"
                onClick={onAutoGenerate}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Auto Generate (AI)
              </button>
            </div>

            {deliveryToast && (
              <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                {deliveryToast}
              </p>
            )}
          </article>
        </section>

        <section className="gov-card border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0b3c5d]">Recent Alerts History</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">Live feed</span>
          </div>

          {history.length === 0 ? (
            <p className="text-sm text-slate-500">No broadcast alerts sent yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[#0b3c5d] px-2 py-1 text-[11px] font-semibold text-white">{item.type.toUpperCase()}</span>
                      <span className="text-xs font-semibold text-slate-600">{item.zone}</span>
                    </div>
                    <p className="text-xs text-slate-500">{new Date(item.timestamp).toLocaleString()}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-800">{item.message}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Channels: {item.channels.map((channel) => channel.toUpperCase()).join(', ')}
                    {' '}|{' '}
                    Delivery: {Object.entries(item.recipients)
                      .map(([name, value]) => `${name.toUpperCase()} ${value ?? 0}`)
                      .join(' | ')}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
