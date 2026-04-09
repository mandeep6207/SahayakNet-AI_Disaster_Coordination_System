'use client';

import { useState } from 'react';
import { useApp } from '@/lib/store';
import { Phone, MessageSquare, Zap, Cpu, CheckCircle } from 'lucide-react';
import { REQUEST_CATEGORY_LABELS, ivrCodeToCategory, parseWhatsAppMessage } from '@/lib/aiLogic';
import {
  createDroneRequest,
  createIvrRequest,
  createMissedCallRequest,
  createWhatsAppRequest,
} from '@/lib/api';

const TABS = [
  { id: 'ivr', label: 'IVR System', icon: Phone },
  { id: 'missed', label: 'Missed Call', icon: Zap },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { id: 'drone', label: 'Drone AI', icon: Cpu },
];

const MOCK_DRONE_DETECTIONS: Array<{
  id: string;
  lat: number;
  lng: number;
  persons: number;
  flag: 'red' | 'yellow' | 'green';
  area: string;
}> = [
  { id: 'D001', lat: 13.085, lng: 80.272, persons: 6, flag: 'red', area: 'Zone A - North' },
  { id: 'D002', lat: 13.092, lng: 80.261, persons: 3, flag: 'yellow', area: 'Zone B - East' },
  { id: 'D003', lat: 13.075, lng: 80.283, persons: 11, flag: 'red', area: 'Zone C - South' },
  { id: 'D004', lat: 13.101, lng: 80.255, persons: 2, flag: 'green', area: 'Zone D - West' },
  { id: 'D005', lat: 13.065, lng: 80.290, persons: 8, flag: 'red', area: 'Zone E - Central' },
];

export default function MultiChannelPanel() {
  const { refreshDashboard } = useApp();
  const [activeTab, setActiveTab] = useState('ivr');
  const [ivrPhone, setIvrPhone] = useState('');
  const [ivrLog, setIvrLog] = useState<string[]>([]);
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');
  const [waLog, setWaLog] = useState<string[]>([]);
  const [droneConverted, setDroneConverted] = useState<string[]>([]);
  const [missedLog, setMissedLog] = useState<string[]>([]);

  // IVR: Simulate digit press
  const handleIVR = async (digit: string) => {
    if (!ivrPhone) return;
    const category = ivrCodeToCategory(digit);
    const req = await createIvrRequest({ phone: ivrPhone, digit, location: 'Ranchi - IVR Input', zone: 'Ranchi' });
    void refreshDashboard();
    setIvrLog(l => [`✅ ${req?.id ?? 'QUEUED'} | Category: ${category} | Ph: ${ivrPhone}`, ...l.slice(0, 9)]);
  };

  // Missed Call simulation
  const handleMissedCall = async () => {
    const phone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const req = await createMissedCallRequest({ phone, location: 'Dhanbad - Missed Call Signal', zone: 'Dhanbad' });
    void refreshDashboard();
    setMissedLog(l => [`📲 ${req?.id ?? 'QUEUED'} | Missed Call from ${phone} – Auto-tagged Rescue`, ...l.slice(0, 9)]);
  };

  // WhatsApp parse + create
  const handleWA = async () => {
    if (!waMessage || !waPhone) return;
    const category = parseWhatsAppMessage(waMessage) ?? 'food';
    const numMatch = waMessage.match(/\d+/);
    const familySize = numMatch ? Math.min(parseInt(numMatch[0]), 20) : 1;
    const req = await createWhatsAppRequest({ phone: waPhone, message: waMessage, location: 'Jamshedpur - WhatsApp Input', zone: 'Jamshedpur' });
    void refreshDashboard();
    setWaLog(l => [`✅ ${req?.id ?? 'QUEUED'} | "${waMessage}" → ${category} for ${familySize}`, ...l.slice(0, 9)]);
    setWaMessage('');
  };

  // Drone: convert detection to request
  const convertDroneDetection = (d: typeof MOCK_DRONE_DETECTIONS[0]) => {
    if (droneConverted.includes(d.id)) return;
    void createDroneRequest({
      id: d.id,
      lat: d.lat,
      lng: d.lng,
      persons: d.persons,
      flag: d.flag,
      area: d.area,
      zone: d.area.includes('North') ? 'Ranchi' : d.area.includes('East') ? 'Dhanbad' : 'Jamshedpur',
    });
    void refreshDashboard();
    setDroneConverted(prev => [...prev, d.id]);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 pt-4 pb-0">
        <div className="text-sm font-bold text-gray-800 mb-3">Multi-Channel Input Module</div>
        <div className="flex gap-1 overflow-x-auto pb-0">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === t.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Icon size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 border-t border-gray-100">
        {/* ── IVR ── */}
        {activeTab === 'ivr' && (
          <div>
            <div className="text-xs text-gray-500 mb-3">Simulate phone call input. Enter caller number then press category.</div>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3"
              placeholder="Caller phone number"
              value={ivrPhone}
              onChange={e => setIvrPhone(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2 mb-3 md:grid-cols-4">
              {[
                ['1','food'],['2','medical'],['3','rescue'],['4','shelter'],
                ['5','baby_care'],['6','women_care'],['7','water'],['8','emergency_help'],
              ].map(([d, category]) => (
                <button
                  key={d}
                  onClick={() => handleIVR(d)}
                  className="py-2 px-3 rounded-lg text-xs font-bold border-2 border-blue-100 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
                >
                  Press {d} – {REQUEST_CATEGORY_LABELS[category as keyof typeof REQUEST_CATEGORY_LABELS]}
                </button>
              ))}
            </div>
            <div className="text-xs font-semibold text-gray-500 mb-1">IVR Log</div>
            <div className="bg-gray-950 rounded-lg p-2 max-h-28 overflow-y-auto space-y-1">
              {ivrLog.length === 0 && <div className="text-gray-500 text-xs">No calls yet...</div>}
              {ivrLog.map((l, i) => <div key={i} className="text-green-400 text-xs font-mono">{l}</div>)}
            </div>
          </div>
        )}

        {/* ── MISSED CALL ── */}
        {activeTab === 'missed' && (
          <div>
            <div className="text-xs text-gray-500 mb-3">Simulate missed call detection. Each missed call auto-creates a rescue request.</div>
            <button
              onClick={handleMissedCall}
              className="w-full py-3 rounded-xl text-sm font-bold text-white mb-4 transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(90deg,#dc2626,#b91c1c)' }}
            >
              📲 Simulate Incoming Missed Call
            </button>
            <div className="text-xs font-semibold text-gray-500 mb-1">Missed Call Log</div>
            <div className="bg-gray-950 rounded-lg p-2 max-h-36 overflow-y-auto space-y-1">
              {missedLog.length === 0 && <div className="text-gray-500 text-xs">No missed calls yet...</div>}
              {missedLog.map((l, i) => <div key={i} className="text-red-400 text-xs font-mono">{l}</div>)}
            </div>
          </div>
        )}

        {/* ── WHATSAPP ── */}
        {activeTab === 'whatsapp' && (
          <div>
            <div className="text-xs text-gray-500 mb-3">Simulate WhatsApp message. Keywords are parsed to create requests.</div>
            <div className="text-xs text-blue-600 mb-2 font-medium">Example: "Need food for 5 people", "Baby care needed", or "Urgent water shortage"</div>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2"
              placeholder="Sender phone number"
              value={waPhone}
              onChange={e => setWaPhone(e.target.value)}
            />
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 resize-none"
              rows={2}
              placeholder="WhatsApp message text..."
              value={waMessage}
              onChange={e => setWaMessage(e.target.value)}
            />
            <button
              onClick={handleWA}
              className="w-full py-2 rounded-lg text-sm font-bold text-white mb-3"
              style={{ background: '#16a34a' }}
            >
              💬 Parse & Create Request
            </button>
            <div className="bg-gray-950 rounded-lg p-2 max-h-28 overflow-y-auto space-y-1">
              {waLog.length === 0 && <div className="text-gray-500 text-xs">No messages yet...</div>}
              {waLog.map((l, i) => <div key={i} className="text-green-400 text-xs font-mono">{l}</div>)}
            </div>
          </div>
        )}

        {/* ── DRONE ── */}
        {activeTab === 'drone' && (
          <div>
            <div className="text-xs text-gray-500 mb-3">Drone AI detection feed. Click to convert detections into rescue requests.</div>
            <div className="space-y-2">
              {MOCK_DRONE_DETECTIONS.map((d) => {
                const converted = droneConverted.includes(d.id);
                const flagColor = d.flag === 'red' ? '#dc2626' : d.flag === 'yellow' ? '#d97706' : '#16a34a';
                return (
                  <div key={d.id} className="flex items-center justify-between p-2 rounded-lg border" style={{ borderColor: flagColor + '44', background: flagColor + '11' }}>
                    <div>
                      <div className="text-xs font-bold" style={{ color: flagColor }}>
                        🚁 {d.id} – {d.persons} persons detected
                      </div>
                      <div className="text-xs text-gray-500">{d.area}</div>
                    </div>
                    <button
                      onClick={() => convertDroneDetection(d)}
                      disabled={converted}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        converted
                          ? 'bg-gray-100 text-gray-400'
                          : 'text-white hover:opacity-90'
                      }`}
                      style={{ background: converted ? undefined : flagColor }}
                    >
                      {converted ? <><CheckCircle size={12} className="inline mr-1" />Done</> : 'Convert →'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
