export type RequestCategory = 'food' | 'medical' | 'rescue' | 'shelter' | 'baby_care' | 'women_care' | 'water' | 'emergency_help';
export type RequestStatus = 'pending' | 'assigned' | 'accepted' | 'on_the_way' | 'completed';

export interface HelpRequest {
  id: string;
  name: string;
  phone: string;
  category: RequestCategory;
  status: RequestStatus;
  executionStatus?: 'pending' | 'assigned' | 'accepted' | 'on_the_way' | 'completed';
  people: number;
  location: string;
  zone: string;
  lat: number;
  lng: number;
  priority: number;
  createdAt: string;
  assignedVolunteerId?: string | null;
  assignedVolunteerName?: string | null;
  source?: 'web' | 'ivr' | 'whatsapp' | 'sms' | 'missed_call' | 'drone';
  sourceLabel?: string;
  assignedAt?: string | null;
  mergedCount?: number;
  duplicateOf?: string | null;
  priorityReason?: string;
  resourceSummary?: string;
  eta?: string | null;
  resourcesNeeded?: {
    food_packets?: number;
    water_liters?: number;
    water_supply?: number;
    medicine_kits?: number;
    shelter_units?: number;
    baby_care_kits?: number;
    women_care_kits?: number;
    rescue_boats?: number;
    emergency_essentials?: number;
  };
  peopleCount?: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  detectedAt?: string;
  droneImage?: string;
  droneImagePath?: string;
  droneMeta?: {
    peopleCount: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    statusText: string;
    detectedAt: string;
    image?: string;
    imagePath?: string;
    flag?: 'red' | 'yellow' | 'green';
  };
}

export interface DroneDetectionResult {
  people_count: number;
  boxes: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    confidence: number;
  }>;
  width: number;
  height: number;
  status: string;
  crowd_alert: boolean;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  flag: 'red' | 'yellow' | 'green';
  detected_at: string;
}

export interface Volunteer {
  id: string;
  name: string;
  age?: number;
  phone: string;
  skills: string[];
  vehicle: boolean;
  availability: 'available' | 'busy' | 'inactive';
  zone: string;
  image: string;
  idCard: string;
  lat: number;
  lng: number;
  tasksCompleted: number;
  speed?: number;
  heading?: number;
  lastSeenAt?: string;
  assignedRequest?: string | null;
}

export interface Resource {
  name: string;
  total: number;
  available: number;
  unit?: string;
  dailyConsumption?: number;
}

export interface DashboardSummary {
  totalRequests: number;
  activeRequests: number;
  criticalRequests: number;
  completedRequests: number;
  volunteersAvailable: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  resources: Resource[];
  alerts: string[];
  volunteers: Volunteer[];
  requests: HelpRequest[];
  missions?: Array<{
    id: string;
    requestId: string;
    volunteerId: string;
    status: 'assigned' | 'completed';
    createdAt: string;
    completedAt?: string | null;
  }>;
  camps?: Array<{
    id: string;
    name: string;
    zone: string;
    capacity: number;
    occupied: number;
  }>;
}

export type BroadcastMessageType = 'emergency' | 'warning' | 'info';

export interface WeatherCurrent {
  temperature: number;
  humidity: number;
  windSpeed: number;
  rainProbability: number;
  condition: string;
  timestamp: number;
}

export interface WeatherHourlyPoint {
  timestamp: number;
  temp: number;
  humidity: number;
  windSpeed: number;
  rainProbability: number;
  condition: string;
}

export interface WeatherDailyPoint {
  timestamp: number;
  minTemp: number;
  maxTemp: number;
  humidity: number;
  windSpeed: number;
  rainProbability: number;
  condition: string;
}

export interface WeatherData {
  zone: string;
  provider: string;
  current: WeatherCurrent;
  hourly: WeatherHourlyPoint[];
  daily: WeatherDailyPoint[];
  updatedAt: string;
}

export interface RiskAnalysis {
  zone: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  triggers: string[];
  recommended_action: string;
  weather_snapshot: {
    temperature: number;
    windSpeed: number;
    rainProbability: number;
    condition: string;
  };
  auto_message: string;
  updatedAt: string;
}

export interface BroadcastHistoryItem {
  id: string;
  message: string;
  zone: string;
  type: BroadcastMessageType;
  channels: Array<'sms' | 'whatsapp' | 'app'>;
  timestamp: string;
  recipients: Partial<Record<'sms' | 'whatsapp' | 'app', number>>;
  createdBy: string;
}

export const JHARKHAND_CENTER: [number, number] = [23.61, 85.28];

export const FALLBACK_DASHBOARD: DashboardData = {
  summary: {
    totalRequests: 0,
    activeRequests: 0,
    criticalRequests: 0,
    completedRequests: 0,
    volunteersAvailable: 0,
  },
  resources: [],
  alerts: [],
  volunteers: [],
  requests: [],
  missions: [],
  camps: [],
};
