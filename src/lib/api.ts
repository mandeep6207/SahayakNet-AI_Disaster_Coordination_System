import { BroadcastHistoryItem, BroadcastMessageType, DashboardData, DroneDetectionResult, HelpRequest, RiskAnalysis, Volunteer, WeatherData } from './mockData';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000').replace(/\/$/, '');

async function call<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(init?.headers || {}),
		},
		cache: 'no-store',
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `API error ${res.status}`);
	}
	return res.json();
}

export function getRequests(): Promise<HelpRequest[]> {
	return call<HelpRequest[]>('/requests');
}

export function getRequestById(requestId: string): Promise<HelpRequest> {
	return call<HelpRequest>(`/request/${requestId}`);
}

export function getVolunteers(): Promise<Volunteer[]> {
	return call<Volunteer[]>('/volunteers');
}

export function getDashboard(): Promise<DashboardData> {
	return call<DashboardData>('/dashboard?compact=1');
}

export function createRequest(payload: {
	name: string;
	phone: string;
	category: 'food' | 'medical' | 'rescue' | 'shelter' | 'baby_care' | 'women_care' | 'water' | 'emergency_help';
	people: number;
	location: string;
	zone: string;
	source?: 'web' | 'ivr' | 'whatsapp' | 'sms' | 'missed_call' | 'drone';
}) {
	return call<HelpRequest>('/request', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function createVolunteer(payload: {
	name: string;
	phone: string;
	skills: string[];
	vehicle: boolean;
	zone: string;
	availability?: 'available' | 'busy';
	lat?: number;
	lng?: number;
	image?: string;
	idCard?: string;
}) {
	return call('/volunteer', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function setVolunteerStatus(payload: {
	volunteer_id: string;
	availability: 'available' | 'busy' | 'inactive';
}) {
	return call('/volunteer/status', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function assignVolunteer(payload: { request_id: string; volunteer_id: string }) {
	return call<{ success: boolean; request: HelpRequest }>('/assign', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function completeRequest(payload: { request_id: string }) {
	return call<{ success: boolean; request: HelpRequest }>('/complete', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function startMission(payload: { request_id: string; volunteer_id: string }) {
	return call<{ success: boolean; request: HelpRequest }>('/mission/start', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function updatePriority(payload: { request_id: string; priority: number }) {
	return call<{ success: boolean; request: HelpRequest }>('/priority', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function createIvrRequest(payload: { phone: string; digit: string; location?: string; zone?: string }) {
	return call<HelpRequest>('/ivr', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function createWhatsAppRequest(payload: { phone: string; message: string; location?: string; zone?: string }) {
	return call<HelpRequest>('/whatsapp', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function createMissedCallRequest(payload: { phone?: string; location?: string; zone?: string }) {
	return call<HelpRequest>('/missed-call', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function createDroneRequest(payload: {
	id?: string;
	lat?: number;
	lng?: number;
	persons?: number;
	people_count?: number;
	flag?: 'red' | 'yellow' | 'green';
	area?: string;
	zone?: string;
	image?: string;
	image_path?: string;
	detected_at?: string;
	status_text?: string;
	priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}) {
	return call<HelpRequest>('/drone', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function detectDroneFrame(payload: { image: string; confidence?: number }) {
	return call<DroneDetectionResult>('/drone/detect', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export async function predictDroneFrame(payload: { frame: Blob; confidence?: number }) {
	const formData = new FormData();
	formData.append('frame', payload.frame, 'frame.jpg');
	if (typeof payload.confidence === 'number') {
		formData.append('confidence', String(payload.confidence));
	}

	const res = await fetch(`${API_BASE}/predict`, {
		method: 'POST',
		body: formData,
		cache: 'no-store',
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `API error ${res.status}`);
	}

	return res.json() as Promise<DroneDetectionResult & { risk_score: number; priority: 'LOW' | 'MEDIUM' | 'HIGH' }>;
}

export function sendDroneRequest(payload: {
	zone: string;
	lat: number;
	lng: number;
	people_count: number;
	priority: 'LOW' | 'MEDIUM' | 'HIGH';
	location?: string;
}) {
	const area = payload.location || `Drone Survey Feed - ${payload.zone}`;
	return call<HelpRequest>('/request', {
		method: 'POST',
		body: JSON.stringify({
			name: 'Drone Survey Auto',
			phone: '0000000000',
			category: payload.priority === 'HIGH' ? 'rescue' : 'medical',
			people: Math.max(1, payload.people_count),
			location: area,
			zone: payload.zone,
			lat: payload.lat,
			lng: payload.lng,
			source: 'drone',
			people_count: payload.people_count,
			priority: payload.priority,
		}),
	});
}

export function mergeDuplicateRequest(payload: {
	name: string;
	phone: string;
	category: 'food' | 'medical' | 'rescue' | 'shelter' | 'baby_care' | 'women_care' | 'water' | 'emergency_help';
	people: number;
	location: string;
	zone: string;
	source?: 'web' | 'ivr' | 'whatsapp' | 'sms' | 'missed_call' | 'drone';
}) {
	return createRequest(payload);
}

export function createBroadcastAlert(payload: {
	message: string;
	channels?: Array<'sms' | 'ivr' | 'whatsapp'>;
}) {
	return call<{ success: boolean; message: string; meta: { sentTo: number; channels: string[]; delivery: string }; feed: string }>('/alerts', {
		method: 'POST',
		body: JSON.stringify(payload),
	});
}

export function getWeather(zone: string) {
	return call<WeatherData>(`/weather?zone=${encodeURIComponent(zone)}`);
}

export function getRiskAnalysis(zone: string) {
	return call<RiskAnalysis>(`/risk-analysis?zone=${encodeURIComponent(zone)}`);
}

export function getAlertsHistory(limit = 30) {
	return call<{ items: BroadcastHistoryItem[]; count: number }>(`/alerts/history?limit=${limit}`);
}

export function sendBroadcast(payload: {
	zone: string;
	type: BroadcastMessageType;
	message: string;
	channels: Array<'sms' | 'whatsapp' | 'app'>;
	role?: 'government' | 'ngo';
	actorId?: string;
}) {
	const role = payload.role ?? 'government';
	return call<{
		success: boolean;
		alert: BroadcastHistoryItem;
		delivery: { zone: string; channels: string[]; counts: Record<string, number> };
	}>('/broadcast', {
		method: 'POST',
		headers: {
			'x-user-role': role,
			'x-user-id': payload.actorId ?? 'ngo-console',
		},
		body: JSON.stringify({
			zone: payload.zone,
			type: payload.type,
			message: payload.message,
			channels: payload.channels,
		}),
	});
}
