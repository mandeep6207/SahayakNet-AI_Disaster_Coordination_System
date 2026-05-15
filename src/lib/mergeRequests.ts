import demoRequests from '../../backend/tmp_requests.json';
import { DashboardData, FALLBACK_DASHBOARD, HelpRequest } from './mockData';

export const DEMO_REQUESTS = demoRequests as HelpRequest[];

function getRequestId(r: any) {
  return r.request_id || r.id || r.requestId || r.requestId || r.req_id || r.uuid;
}

function getCreatedAt(r: any) {
  return r.created_at || r.createdAt || r.timestamp || r.detectedAt || r.detected_at || r.createdAt;
}

export default function mergeRequests(mockRequests: HelpRequest[], liveRequests: any[]): HelpRequest[] {
  const map = new Map<string, any>();

  for (const req of mockRequests) {
    const id = getRequestId(req) || req.id;
    map.set(id, { ...req, id });
  }

  for (const req of liveRequests) {
    const id = getRequestId(req) || req.id || `live-${Math.random().toString(36).slice(2, 9)}`;
    const existing = map.get(id) || {};
    // Merge shallowly, prefer live values
    const merged = { ...existing, ...req };
    // normalize id and createdAt fields
    merged.id = id;
    merged.createdAt = getCreatedAt(req) || existing.createdAt || merged.createdAt;
    map.set(id, merged);
  }

  return Array.from(map.values()).sort((a: any, b: any) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
}

export function computeSummary(requests: HelpRequest[]) {
  const totalRequests = requests.length;
  const activeRequests = requests.filter((request) => request.status !== 'completed').length;
  const completedRequests = requests.filter((request) => request.status === 'completed').length;
  const criticalRequests = requests.filter((request) => request.priority >= 60 || request.status === 'pending' && request.priority >= 50).length;

  return {
    totalRequests,
    activeRequests,
    criticalRequests,
    completedRequests,
    volunteersAvailable: FALLBACK_DASHBOARD.summary.volunteersAvailable,
  };
}

export function buildDemoDashboard(): DashboardData {
  const requests = mergeRequests(DEMO_REQUESTS, []);
  return {
    ...FALLBACK_DASHBOARD,
    requests,
    summary: computeSummary(requests),
  };
}
