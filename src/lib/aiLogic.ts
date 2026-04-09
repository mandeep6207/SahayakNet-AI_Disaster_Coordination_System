import { HelpRequest, RequestCategory, Resource, Volunteer } from './mockData';

export const REQUEST_CATEGORY_LABELS: Record<RequestCategory, string> = {
  food: 'Food',
  medical: 'Medical',
  rescue: 'Rescue',
  shelter: 'Shelter',
  baby_care: 'Baby Care',
  women_care: 'Women Care',
  water: 'Water',
  emergency_help: 'Emergency Help',
};

export const REQUEST_CATEGORY_HINTS: Record<RequestCategory, string[]> = {
  food: ['food', 'hunger', 'ration'],
  medical: ['medical', 'doctor', 'medicine', 'injury', 'cpr'],
  rescue: ['rescue', 'trapped', 'stuck', 'evacuate'],
  shelter: ['shelter', 'house', 'camp', 'roof'],
  baby_care: ['baby', 'infant', 'milk', 'diaper'],
  women_care: ['women', 'woman', 'sanitary', 'hygiene', 'pads'],
  water: ['water', 'drink', 'hydration', 'borewell'],
  emergency_help: ['emergency', 'help', 'urgent', 'essential', 'power', 'torch'],
};

type ResourceNeedSummary = {
  food: number;
  medicine: number;
  shelter: number;
  babyCare: number;
  womenCare: number;
  water: number;
  emergency: number;
};

export interface DepletionForecast {
  resourceName: string;
  available: number;
  total: number;
  percent: number;
  isUrgent: boolean;
}

const SEVERITY_MAP: Record<RequestCategory, number> = {
  medical: 60,
  emergency_help: 58,
  rescue: 55,
  baby_care: 52,
  women_care: 50,
  water: 42,
  food: 35,
  shelter: 25,
};

export function computePriority(category: RequestCategory, people: number, createdAt: string): number {
  const severity = SEVERITY_MAP[category];
  const peopleScore = Math.max(1, people) * 2;
  const waitingHours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000));
  const waitingScore = Math.min(waitingHours * 2, 30);
  return severity + peopleScore + waitingScore;
}

export function priorityLevel(priority: number): 'high' | 'medium' | 'low' {
  if (priority >= 60) return 'high';
  if (priority >= 40) return 'medium';
  return 'low';
}

export function priorityLabel(priority: number): 'Critical' | 'Medium' | 'Low' {
  if (priority >= 60) return 'Critical';
  if (priority >= 40) return 'Medium';
  return 'Low';
}

export function explainPriority(request: HelpRequest): string {
  const parts: string[] = [];
  if (request.category === 'medical') parts.push('medical emergency');
  if (request.category === 'rescue') parts.push('rescue need');
  if (request.category === 'shelter') parts.push('shelter shortage');
  if (request.category === 'food') parts.push('food shortage');
  if (request.category === 'baby_care') parts.push('infant support need');
  if (request.category === 'women_care') parts.push('women care shortage');
  if (request.category === 'water') parts.push('water shortage');
  if (request.category === 'emergency_help') parts.push('critical emergency');
  parts.push(`${request.people} member${request.people > 1 ? 's' : ''}`);

  const waitingHours = Math.max(0, Math.floor((Date.now() - new Date(request.createdAt).getTime()) / 3_600_000));
  const waitingText = waitingHours > 0 ? `, waiting ${waitingHours}h` : '';
  return `High priority due to ${parts.join(' + ')}${waitingText}.`;
}

export function mergeMessage(request: HelpRequest): string | null {
  const merged = request.mergedCount ?? 1;
  if (merged <= 1) return null;
  return `Merged ${merged} nearby requests`;
}

export function resourceEstimate(request: HelpRequest): string {
  if (request.resourceSummary) return request.resourceSummary;
  switch (request.category) {
    case 'baby_care':
      return `Baby care kits needed: ${Math.max(1, Math.ceil(request.people / 2))} units`;
    case 'women_care':
      return `Women care kits needed: ${Math.max(1, Math.ceil(request.people / 2))} units`;
    case 'water':
      return `Water supply needed: ${Math.max(2, request.people * 3)} liters`;
    case 'emergency_help':
      return `Emergency essentials needed for ${request.people} people`;
    case 'medical':
      return `Medicine kits needed: ${Math.max(1, Math.ceil(request.people / 2))} units`;
    case 'rescue':
      return `Rescue support needed for ${request.people} people`;
    case 'shelter':
      return `Shelter units needed: ${Math.max(1, Math.ceil(request.people / 4))}`;
    default:
      return `Food needed: ${request.people * 2} units`;
  }
}

export function predictDemand(requests: HelpRequest[], category: RequestCategory, hours = 3): number {
  const now = Date.now();
  const windowMs = 3 * 3_600_000;
  const recent = requests.filter((item) => item.category === category && now - new Date(item.createdAt).getTime() <= windowMs);
  const hourlyRate = recent.length / 3;
  return Math.max(1, Math.round(hourlyRate * hours));
}

export function requiredResources(requests: HelpRequest[]) {
  return requests.reduce(
    (acc, req) => {
      const r = req.resourcesNeeded;
      if (!r) {
        if (req.category === 'food') acc.food += req.people * 2;
        if (req.category === 'medical') acc.medicine += Math.max(1, Math.ceil(req.people / 2));
        if (req.category === 'shelter') acc.shelter += Math.max(1, Math.ceil(req.people / 4));
        if (req.category === 'baby_care') acc.babyCare += Math.max(1, Math.ceil(req.people / 2));
        if (req.category === 'women_care') acc.womenCare += Math.max(1, Math.ceil(req.people / 2));
        if (req.category === 'water') acc.water += Math.max(3, req.people * 3);
        if (req.category === 'emergency_help') acc.emergency += Math.max(1, Math.ceil(req.people / 2));
        return acc;
      }
      acc.food += r.food_packets ?? 0;
      acc.medicine += r.medicine_kits ?? 0;
      acc.shelter += r.shelter_units ?? 0;
      acc.babyCare += r.baby_care_kits ?? 0;
      acc.womenCare += r.women_care_kits ?? 0;
      acc.water += (r.water_supply ?? 0) + (r.water_liters ?? 0);
      acc.emergency += (r.emergency_essentials ?? 0) + (r.rescue_boats ?? 0);
      return acc;
    },
    { food: 0, medicine: 0, shelter: 0, babyCare: 0, womenCare: 0, water: 0, emergency: 0 },
  );
}

export function averageResponseMinutes(requests: HelpRequest[]): number {
  const assigned = requests.filter((item) => item.status !== 'pending');
  if (!assigned.length) return 0;
  const totalMinutes = assigned.reduce((sum, req) => {
    const elapsed = (Date.now() - new Date(req.createdAt).getTime()) / 60_000;
    return sum + Math.max(1, elapsed);
  }, 0);
  return Math.round(totalMinutes / assigned.length);
}

export function demandTrendPoints(requests: HelpRequest[]) {
  const now = Date.now();
  const buckets = Array.from({ length: 8 }, (_, i) => ({
    label: `${7 - i}h`,
    count: 0,
    start: now - (8 - i) * 3_600_000,
    end: now - (7 - i) * 3_600_000,
  }));

  requests.forEach((req) => {
    const ts = new Date(req.createdAt).getTime();
    const bucket = buckets.find((b) => ts >= b.start && ts < b.end);
    if (bucket) bucket.count += 1;
  });

  return buckets.map((b) => ({ label: b.label, count: b.count }));
}

export interface RequestCluster {
  id: string;
  lat: number;
  lng: number;
  count: number;
  high: number;
  medium: number;
  low: number;
}

export function clusterNearbyRequests(requests: HelpRequest[]): RequestCluster[] {
  const clusters: RequestCluster[] = [];
  const threshold = 0.08;
  requests.forEach((req) => {
    const existing = clusters.find(
      (cluster) =>
        Math.abs(cluster.lat - req.lat) < threshold &&
        Math.abs(cluster.lng - req.lng) < threshold,
    );
    const level = priorityLevel(req.priority);
    if (existing) {
      existing.count += 1;
      existing[level] += 1;
    } else {
      clusters.push({
        id: `cluster-${clusters.length + 1}`,
        lat: req.lat,
        lng: req.lng,
        count: 1,
        high: level === 'high' ? 1 : 0,
        medium: level === 'medium' ? 1 : 0,
        low: level === 'low' ? 1 : 0,
      });
    }
  });
  return clusters;
}

export function suggestNearestVolunteer(request: HelpRequest, volunteers: Volunteer[]): Volunteer | null {
  const available = volunteers.filter((vol) => vol.availability === 'available');
  const pool = available.length > 0 ? available : volunteers.filter((vol) => vol.availability !== 'inactive');
  if (!pool.length) return null;
  let best: Volunteer | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  pool.forEach((vol) => {
    const distance = Math.sqrt((vol.lat - request.lat) ** 2 + (vol.lng - request.lng) ** 2);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = vol;
    }
  });
  return best;
}

export function predictDepletion(resources: Resource[]): DepletionForecast[] {
  return resources.map((resource) => {
    const pct = Math.round((resource.available / Math.max(resource.total, 1)) * 100);
    return {
      resourceName: resource.name,
      available: resource.available,
      total: resource.total,
      percent: pct,
      isUrgent: pct < 30,
    };
  });
}

export function parseWhatsAppMessage(text: string): RequestCategory {
  const lower = text.toLowerCase();
  if (lower.includes('baby') || lower.includes('infant') || lower.includes('diaper') || lower.includes('milk')) return 'baby_care';
  if (lower.includes('women') || lower.includes('woman') || lower.includes('sanitary') || lower.includes('pad') || lower.includes('hygiene')) return 'women_care';
  if (lower.includes('water') || lower.includes('drink') || lower.includes('hydration')) return 'water';
  if (lower.includes('medical') || lower.includes('doctor') || lower.includes('medicine')) return 'medical';
  if (lower.includes('rescue') || lower.includes('trapped') || lower.includes('stuck')) return 'rescue';
  if (lower.includes('shelter') || lower.includes('house') || lower.includes('camp')) return 'shelter';
  if (lower.includes('emergency') || lower.includes('urgent') || lower.includes('essential') || lower.includes('torch') || lower.includes('power')) return 'emergency_help';
  return 'food';
}

export function ivrCodeToCategory(code: string): RequestCategory {
  const map: Record<string, RequestCategory> = {
    '1': 'food',
    '2': 'medical',
    '3': 'rescue',
    '4': 'shelter',
    '5': 'baby_care',
    '6': 'women_care',
    '7': 'water',
    '8': 'emergency_help',
  };
  return map[code] ?? 'food';
}
