'use client';

import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Clock3,
  Home,
  MapPin,
  Package,
  Pill,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  X,
} from 'lucide-react';
import GovernmentPortalNav from '@/components/GovernmentPortalNav';
import { requiredResources } from '@/lib/aiLogic';
import { useApp } from '@/lib/store';

type ResourceKind = 'Food Packets' | 'Medical Kits' | 'Shelter Units' | 'Baby Care Kits' | 'Women Care Kits' | 'Water Supply' | 'Emergency Essentials';

type ResourceNeed = {
  food: number;
  medicine: number;
  shelter: number;
  babyCare: number;
  womenCare: number;
  water: number;
  emergency: number;
};

type BreakdownItem = {
  label: string;
  availableWeight: number;
  usageWeight: number;
};

type ResourceBlueprint = {
  kind: ResourceKind;
  category: keyof ResourceNeed;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  color: string;
  accent: string;
  image: string;
  fallbackDailyConsumption: number;
  breakdown: BreakdownItem[];
};

type ResourceRow = {
  blueprint: ResourceBlueprint;
  available: number;
  total: number;
  required: number;
  dailyConsumption: number;
  stockPercent: number;
  coveragePercent: number;
  shortage: number;
  daysRemaining: number | null;
  shortageDays: number | null;
  status: 'healthy' | 'warning' | 'critical';
  todayUsage: number;
  yesterdayUsage: number;
  averageUsage: number;
  changePercent: number;
  trendLabel: string;
  detailItems: Array<{
    label: string;
    available: number;
    usage: number;
  }>;
};

type ZoneRow = {
  zone: string;
  requests: number;
  foodNeeded: number;
  medicineNeeded: number;
  shelterNeeded: number;
  babyCareNeeded: number;
  womenCareNeeded: number;
  waterNeeded: number;
  emergencyNeeded: number;
  foodAvailable: number;
  medicineAvailable: number;
  shelterAvailable: number;
  babyCareAvailable: number;
  womenCareAvailable: number;
  waterAvailable: number;
  emergencyAvailable: number;
  foodShortage: number;
  medicineShortage: number;
  shelterShortage: number;
  babyCareShortage: number;
  womenCareShortage: number;
  waterShortage: number;
  emergencyShortage: number;
};

function createResourceArtwork(kind: string, color: string, accent: string) {
  const initials = kind
    .split(' ')
    .map((part) => part[0])
    .join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100" fill="none">
      <rect width="160" height="100" rx="20" fill="${accent}" />
      <circle cx="32" cy="28" r="18" fill="${color}" fill-opacity="0.14" />
      <circle cx="128" cy="74" r="22" fill="${color}" fill-opacity="0.1" />
      <rect x="18" y="56" width="124" height="22" rx="11" fill="white" fill-opacity="0.7" />
      <text x="24" y="44" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="${color}">${initials}</text>
      <text x="24" y="72" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#0f172a">${kind}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const RESOURCE_BLUEPRINTS: ResourceBlueprint[] = [
  {
    kind: 'Food Packets',
    category: 'food',
    icon: Package,
    color: '#2e7d32',
    accent: '#e8f5e9',
    image: createResourceArtwork('Food Packets', '#2e7d32', '#e8f5e9'),
    fallbackDailyConsumption: 30,
    breakdown: [
      { label: 'Rice (kg)', availableWeight: 0.35, usageWeight: 0.38 },
      { label: 'Wheat (kg)', availableWeight: 0.2, usageWeight: 0.18 },
      { label: 'Ready Meals', availableWeight: 0.16, usageWeight: 0.18 },
      { label: 'Water bottles', availableWeight: 0.14, usageWeight: 0.12 },
      { label: 'Dry ration kits', availableWeight: 0.15, usageWeight: 0.14 },
    ],
  },
  {
    kind: 'Medical Kits',
    category: 'medicine',
    icon: Pill,
    color: '#c62828',
    accent: '#ffebee',
    image: createResourceArtwork('Medical Kits', '#c62828', '#ffebee'),
    fallbackDailyConsumption: 16,
    breakdown: [
      { label: 'First aid kits', availableWeight: 0.22, usageWeight: 0.2 },
      { label: 'Painkillers', availableWeight: 0.16, usageWeight: 0.14 },
      { label: 'Antibiotics', availableWeight: 0.17, usageWeight: 0.15 },
      { label: 'ORS packets', availableWeight: 0.15, usageWeight: 0.16 },
      { label: 'Bandages', availableWeight: 0.15, usageWeight: 0.15 },
      { label: 'Emergency injections', availableWeight: 0.15, usageWeight: 0.2 },
    ],
  },
  {
    kind: 'Shelter Units',
    category: 'shelter',
    icon: Home,
    color: '#0b3c5d',
    accent: '#eaf3fb',
    image: createResourceArtwork('Shelter Units', '#0b3c5d', '#eaf3fb'),
    fallbackDailyConsumption: 10,
    breakdown: [
      { label: 'Tents', availableWeight: 0.4, usageWeight: 0.42 },
      { label: 'Blankets', availableWeight: 0.25, usageWeight: 0.22 },
      { label: 'Beds', availableWeight: 0.18, usageWeight: 0.18 },
      { label: 'Temporary housing units', availableWeight: 0.17, usageWeight: 0.18 },
    ],
  },
  {
    kind: 'Baby Care Kits',
    category: 'babyCare',
    icon: Package,
    color: '#d81b60',
    accent: '#fce4ec',
    image: createResourceArtwork('Baby Care Kits', '#d81b60', '#fce4ec'),
    fallbackDailyConsumption: 14,
    breakdown: [
      { label: 'Infant milk', availableWeight: 0.3, usageWeight: 0.34 },
      { label: 'Diapers', availableWeight: 0.25, usageWeight: 0.28 },
      { label: 'Baby wipes', availableWeight: 0.18, usageWeight: 0.16 },
      { label: 'Nursing supplies', availableWeight: 0.15, usageWeight: 0.12 },
      { label: 'Feeding bottles', availableWeight: 0.12, usageWeight: 0.1 },
    ],
  },
  {
    kind: 'Women Care Kits',
    category: 'womenCare',
    icon: Pill,
    color: '#8e24aa',
    accent: '#f3e5f5',
    image: createResourceArtwork('Women Care Kits', '#8e24aa', '#f3e5f5'),
    fallbackDailyConsumption: 12,
    breakdown: [
      { label: 'Sanitary pads', availableWeight: 0.28, usageWeight: 0.3 },
      { label: 'Hygiene kits', availableWeight: 0.24, usageWeight: 0.22 },
      { label: 'Pain relief', availableWeight: 0.18, usageWeight: 0.16 },
      { label: 'Cleaning supplies', availableWeight: 0.16, usageWeight: 0.18 },
      { label: 'Privacy kits', availableWeight: 0.14, usageWeight: 0.14 },
    ],
  },
  {
    kind: 'Water Supply',
    category: 'water',
    icon: RefreshCw,
    color: '#0288d1',
    accent: '#e1f5fe',
    image: createResourceArtwork('Water Supply', '#0288d1', '#e1f5fe'),
    fallbackDailyConsumption: 42,
    breakdown: [
      { label: 'Drinking water', availableWeight: 0.46, usageWeight: 0.48 },
      { label: 'Purification tablets', availableWeight: 0.14, usageWeight: 0.12 },
      { label: 'Storage tanks', availableWeight: 0.18, usageWeight: 0.16 },
      { label: 'Distribution cans', availableWeight: 0.22, usageWeight: 0.24 },
    ],
  },
  {
    kind: 'Emergency Essentials',
    category: 'emergency',
    icon: ShieldAlert,
    color: '#374151',
    accent: '#eceff1',
    image: createResourceArtwork('Emergency Essentials', '#374151', '#eceff1'),
    fallbackDailyConsumption: 24,
    breakdown: [
      { label: 'Torch lights', availableWeight: 0.22, usageWeight: 0.26 },
      { label: 'Blankets', availableWeight: 0.2, usageWeight: 0.18 },
      { label: 'Flares', availableWeight: 0.14, usageWeight: 0.12 },
      { label: 'Power banks', availableWeight: 0.16, usageWeight: 0.16 },
      { label: 'First response tools', availableWeight: 0.28, usageWeight: 0.28 },
    ],
  },
];

function getNeedForRequest(request: {
  category: 'food' | 'medical' | 'rescue' | 'shelter' | 'baby_care' | 'women_care' | 'water' | 'emergency_help';
  people: number;
  resourcesNeeded?: {
    food_packets?: number;
    medicine_kits?: number;
    shelter_units?: number;
    baby_care_kits?: number;
    women_care_kits?: number;
    water_supply?: number;
    water_liters?: number;
    emergency_essentials?: number;
    rescue_boats?: number;
  };
}): ResourceNeed {
  if (request.resourcesNeeded) {
    return {
      food: request.resourcesNeeded.food_packets ?? 0,
      medicine: request.resourcesNeeded.medicine_kits ?? 0,
      shelter: request.resourcesNeeded.shelter_units ?? 0,
      babyCare: request.resourcesNeeded.baby_care_kits ?? 0,
      womenCare: request.resourcesNeeded.women_care_kits ?? 0,
      water: (request.resourcesNeeded.water_supply ?? 0) + (request.resourcesNeeded.water_liters ?? 0),
      emergency: (request.resourcesNeeded.emergency_essentials ?? 0) + (request.resourcesNeeded.rescue_boats ?? 0),
    };
  }

  return {
    food: request.category === 'food' ? request.people * 2 : 0,
    medicine: request.category === 'medical' ? Math.max(1, Math.ceil(request.people / 2)) : 0,
    shelter: request.category === 'shelter' ? Math.max(1, Math.ceil(request.people / 4)) : 0,
    babyCare: request.category === 'baby_care' ? Math.max(1, Math.ceil(request.people / 2)) : 0,
    womenCare: request.category === 'women_care' ? Math.max(1, Math.ceil(request.people / 2)) : 0,
    water: request.category === 'water' ? Math.max(4, request.people * 4) : request.category === 'food' ? Math.max(2, request.people) : 0,
    emergency: request.category === 'emergency_help' || request.category === 'rescue' ? Math.max(1, Math.ceil(request.people / 2)) : 0,
  };
}

function formatDays(days: number | null) {
  if (days === null || Number.isNaN(days)) return 'n/a';
  return `${days.toFixed(1)} days`;
}

function getStatusLabel(status: ResourceRow['status']) {
  if (status === 'critical') return 'Critical';
  if (status === 'warning') return 'Warning';
  return 'Healthy';
}

export default function GovernmentInventoryPage() {
  const { state } = useApp();
  const [selectedResource, setSelectedResource] = useState<ResourceKind>('Food Packets');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [liveTime, setLiveTime] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveTime(new Date());
    }, 4000);

    return () => window.clearInterval(timer);
  }, []);

  const activeRequests = useMemo(
    () => state.dashboard.requests.filter((request) => request.status !== 'completed'),
    [state.dashboard.requests],
  );

  const required = useMemo(() => requiredResources(activeRequests), [activeRequests]);

  const resourceRows = useMemo<ResourceRow[]>(() => {
    const resourceByKind = new Map(state.dashboard.resources.map((resource) => [resource.name, resource]));
    const categoryCounts = activeRequests.reduce(
      (acc, request) => {
        if (request.category === 'food') acc.food += 1;
        if (request.category === 'medical') acc.medicine += 1;
        if (request.category === 'shelter') acc.shelter += 1;
        if (request.category === 'baby_care') acc.babyCare += 1;
        if (request.category === 'women_care') acc.womenCare += 1;
        if (request.category === 'water') acc.water += 1;
        if (request.category === 'emergency_help' || request.category === 'rescue') acc.emergency += 1;
        return acc;
      },
      { food: 0, medicine: 0, shelter: 0, babyCare: 0, womenCare: 0, water: 0, emergency: 0 },
    );

    return RESOURCE_BLUEPRINTS.map((blueprint) => {
      const resource = resourceByKind.get(blueprint.kind);
      const available = resource?.available ?? 0;
      const total = Math.max(resource?.total ?? 0, available, 1);
      const dailyConsumption = Math.max(resource?.dailyConsumption ?? blueprint.fallbackDailyConsumption, 1);
      const requiredValue = required[blueprint.category];
      const shortage = Math.max(0, requiredValue - available);
      const stockPercent = Math.round((available / total) * 100);
      const coveragePercent = requiredValue > 0 ? Math.round((available / requiredValue) * 100) : 100;
      const daysRemaining = available / dailyConsumption;
      const shortageDays = shortage > 0 ? shortage / dailyConsumption : null;
      const status: ResourceRow['status'] = shortage > 0 || stockPercent < 30 ? 'critical' : stockPercent < 55 ? 'warning' : 'healthy';

      const demandFactor = 1 + categoryCounts[blueprint.category] * 0.08 + requiredValue / Math.max(total, 1) * 0.18;
      const todayUsage = Math.max(1, Math.round(dailyConsumption * demandFactor));
      const yesterdayUsage = Math.max(1, Math.round(todayUsage / 1.3));
      const averageUsage = Math.max(1, Math.round((todayUsage + yesterdayUsage + dailyConsumption) / 3));
      const changePercent = yesterdayUsage > 0 ? ((todayUsage - yesterdayUsage) / yesterdayUsage) * 100 : 0;
      const trendLabel = `${blueprint.kind.split(' ')[0]} usage ${changePercent >= 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(changePercent))}% today`;

      const detailItems = blueprint.breakdown.map((item) => ({
        label: item.label,
        available: Math.max(0, Math.round(available * item.availableWeight)),
        usage: Math.max(0, Math.round(dailyConsumption * item.usageWeight)),
      }));

      return {
        blueprint,
        available,
        total,
        required: requiredValue,
        dailyConsumption,
        stockPercent,
        coveragePercent,
        shortage,
        daysRemaining,
        shortageDays,
        status,
        todayUsage,
        yesterdayUsage,
        averageUsage,
        changePercent,
        trendLabel,
        detailItems,
      };
    });
  }, [activeRequests, required, state.dashboard.resources]);

  const zoneRows = useMemo<ZoneRow[]>(() => {
    const zoneMap = new Map<string, ZoneRow>();
    const resourceByName = new Map(state.dashboard.resources.map((resource) => [resource.name, resource]));

    activeRequests.forEach((request) => {
      const need = getNeedForRequest(request);
      const zone = zoneMap.get(request.zone) ?? {
        zone: request.zone,
        requests: 0,
        foodNeeded: 0,
        medicineNeeded: 0,
        shelterNeeded: 0,
        babyCareNeeded: 0,
        womenCareNeeded: 0,
        waterNeeded: 0,
        emergencyNeeded: 0,
        foodAvailable: 0,
        medicineAvailable: 0,
        shelterAvailable: 0,
        babyCareAvailable: 0,
        womenCareAvailable: 0,
        waterAvailable: 0,
        emergencyAvailable: 0,
        foodShortage: 0,
        medicineShortage: 0,
        shelterShortage: 0,
        babyCareShortage: 0,
        womenCareShortage: 0,
        waterShortage: 0,
        emergencyShortage: 0,
      };

      zone.requests += 1;
      zone.foodNeeded += need.food;
      zone.medicineNeeded += need.medicine;
      zone.shelterNeeded += need.shelter;
      zone.babyCareNeeded += need.babyCare;
      zone.womenCareNeeded += need.womenCare;
      zone.waterNeeded += need.water;
      zone.emergencyNeeded += need.emergency;
      zoneMap.set(request.zone, zone);
    });

    const rows = Array.from(zoneMap.values());
    const totalFoodNeeded = rows.reduce((sum, row) => sum + row.foodNeeded, 0);
    const totalMedicineNeeded = rows.reduce((sum, row) => sum + row.medicineNeeded, 0);
    const totalShelterNeeded = rows.reduce((sum, row) => sum + row.shelterNeeded, 0);
    const totalBabyCareNeeded = rows.reduce((sum, row) => sum + row.babyCareNeeded, 0);
    const totalWomenCareNeeded = rows.reduce((sum, row) => sum + row.womenCareNeeded, 0);
    const totalWaterNeeded = rows.reduce((sum, row) => sum + row.waterNeeded, 0);
    const totalEmergencyNeeded = rows.reduce((sum, row) => sum + row.emergencyNeeded, 0);

    const availableStock = (name: string) => resourceByName.get(name)?.available ?? 0;

    return rows
      .map((row) => {
        const foodAvailable = totalFoodNeeded > 0 ? Math.round((availableStock('Food Packets') * row.foodNeeded) / totalFoodNeeded) : 0;
        const medicineAvailable = totalMedicineNeeded > 0 ? Math.round((availableStock('Medical Kits') * row.medicineNeeded) / totalMedicineNeeded) : 0;
        const shelterAvailable = totalShelterNeeded > 0 ? Math.round((availableStock('Shelter Units') * row.shelterNeeded) / totalShelterNeeded) : 0;
        const babyCareAvailable = totalBabyCareNeeded > 0 ? Math.round((availableStock('Baby Care Kits') * row.babyCareNeeded) / totalBabyCareNeeded) : 0;
        const womenCareAvailable = totalWomenCareNeeded > 0 ? Math.round((availableStock('Women Care Kits') * row.womenCareNeeded) / totalWomenCareNeeded) : 0;
        const waterAvailable = totalWaterNeeded > 0 ? Math.round((availableStock('Water Supply') * row.waterNeeded) / totalWaterNeeded) : 0;
        const emergencyAvailable = totalEmergencyNeeded > 0 ? Math.round((availableStock('Emergency Essentials') * row.emergencyNeeded) / totalEmergencyNeeded) : 0;

        return {
          ...row,
          foodAvailable,
          medicineAvailable,
          shelterAvailable,
          babyCareAvailable,
          womenCareAvailable,
          waterAvailable,
          emergencyAvailable,
          foodShortage: Math.max(0, row.foodNeeded - foodAvailable),
          medicineShortage: Math.max(0, row.medicineNeeded - medicineAvailable),
          shelterShortage: Math.max(0, row.shelterNeeded - shelterAvailable),
          babyCareShortage: Math.max(0, row.babyCareNeeded - babyCareAvailable),
          womenCareShortage: Math.max(0, row.womenCareNeeded - womenCareAvailable),
          waterShortage: Math.max(0, row.waterNeeded - waterAvailable),
          emergencyShortage: Math.max(0, row.emergencyNeeded - emergencyAvailable),
        };
      })
      .sort((a, b) => (b.foodShortage + b.medicineShortage + b.shelterShortage + b.babyCareShortage + b.womenCareShortage + b.waterShortage + b.emergencyShortage) - (a.foodShortage + a.medicineShortage + a.shelterShortage + a.babyCareShortage + a.womenCareShortage + a.waterShortage + a.emergencyShortage));
  }, [activeRequests, state.dashboard.resources]);

  const criticalResource = useMemo(
    () => resourceRows.slice().sort((a, b) => {
      const aScore = a.status === 'critical' ? 1000 + a.shortage : a.status === 'warning' ? 500 + a.shortage : a.shortage;
      const bScore = b.status === 'critical' ? 1000 + b.shortage : b.status === 'warning' ? 500 + b.shortage : b.shortage;
      return bScore - aScore;
    })[0],
    [resourceRows],
  );

  const selectedRow = useMemo(
    () => resourceRows.find((row) => row.blueprint.kind === selectedResource) ?? resourceRows[0],
    [resourceRows, selectedResource],
  );

  const topZone = zoneRows[0];
  const foodRow = resourceRows.find((row) => row.blueprint.category === 'food');
  const medicalRow = resourceRows.find((row) => row.blueprint.category === 'medicine');
  const totalActiveRequests = activeRequests.length;

  const insights = useMemo(() => {
    const demandZone = topZone?.zone ?? 'Dhanbad';
    const medicalTrend = medicalRow?.changePercent ?? 0;
    const foodRisk = (foodRow?.shortage ?? 0) > 0 || (foodRow?.daysRemaining ?? Number.POSITIVE_INFINITY) < 0.5;
    const babyRow = resourceRows.find((row) => row.blueprint.category === 'babyCare');
    const womenRow = resourceRows.find((row) => row.blueprint.category === 'womenCare');
    const waterRow = resourceRows.find((row) => row.blueprint.category === 'water');
    const emergencyRow = resourceRows.find((row) => row.blueprint.category === 'emergency');

    return [
      {
        title: `High demand expected in ${demandZone} zone`,
        text: `${topZone?.requests ?? totalActiveRequests} live requests are currently pressuring this zone.`,
        tone: 'neutral' as const,
      },
      {
        title: medicalTrend >= 10 ? 'Medical kits usage rising rapidly' : 'Medical usage under control',
        text: medicalTrend >= 10
          ? `Medical consumption is up by ${Math.round(medicalTrend)}% today versus yesterday.`
          : `Medical demand is stable at ${medicalRow?.todayUsage ?? 0} units per day.`,
        tone: medicalTrend >= 10 ? 'warning' as const : 'neutral' as const,
      },
      {
        title: foodRisk ? 'Food shortage risk in next 12 hours' : 'Food stock is stable',
        text: foodRisk
          ? `Available food stock covers only ${formatDays(foodRow?.daysRemaining ?? null)} of demand.`
          : `Food stock should last ${formatDays(foodRow?.daysRemaining ?? null)} at current usage.`,
        tone: foodRisk ? 'critical' as const : 'neutral' as const,
      },
      {
        title: 'Care kit coverage needs review',
        text: `Baby care: ${babyRow?.status ?? 'n/a'} | Women care: ${womenRow?.status ?? 'n/a'} | Water: ${waterRow?.status ?? 'n/a'} | Emergency essentials: ${emergencyRow?.status ?? 'n/a'}`,
        tone: (babyRow?.status === 'critical' || womenRow?.status === 'critical' || waterRow?.status === 'critical' || emergencyRow?.status === 'critical') ? 'critical' as const : 'neutral' as const,
      },
    ];
  }, [foodRow, medicalRow, resourceRows, topZone, totalActiveRequests]);

  const selectedZoneRecommendations = useMemo(() => {
    const foodTarget = zoneRows.slice().sort((a, b) => b.foodShortage - a.foodShortage)[0];
    const medicalTarget = zoneRows.slice().sort((a, b) => b.medicineShortage - a.medicineShortage)[0];
    const shelterTarget = zoneRows.slice().sort((a, b) => b.shelterShortage - a.shelterShortage)[0];
    const babyTarget = zoneRows.slice().sort((a, b) => b.babyCareShortage - a.babyCareShortage)[0];
    const womenTarget = zoneRows.slice().sort((a, b) => b.womenCareShortage - a.womenCareShortage)[0];
    const waterTarget = zoneRows.slice().sort((a, b) => b.waterShortage - a.waterShortage)[0];
    const emergencyTarget = zoneRows.slice().sort((a, b) => b.emergencyShortage - a.emergencyShortage)[0];

    return {
      food: foodTarget?.zone ?? 'Dhanbad',
      medicine: medicalTarget?.zone ?? 'Ranchi',
      shelter: shelterTarget?.zone ?? 'Dhanbad',
      babyCare: babyTarget?.zone ?? 'Dhanbad',
      womenCare: womenTarget?.zone ?? 'Jamshedpur',
      water: waterTarget?.zone ?? 'Ranchi',
      emergency: emergencyTarget?.zone ?? 'Dhanbad',
    };
  }, [zoneRows]);

  const zoneByCategory: Record<keyof ResourceNeed, string> = {
    food: selectedZoneRecommendations.food,
    medicine: selectedZoneRecommendations.medicine,
    shelter: selectedZoneRecommendations.shelter,
    babyCare: selectedZoneRecommendations.babyCare,
    womenCare: selectedZoneRecommendations.womenCare,
    water: selectedZoneRecommendations.water,
    emergency: selectedZoneRecommendations.emergency,
  };

  const trendRows = useMemo(
    () => resourceRows.map((row) => ({
      kind: row.blueprint.kind,
      today: row.todayUsage,
      up: row.changePercent >= 0,
      change: Math.abs(Math.round(row.changePercent)),
    })),
    [resourceRows],
  );

  const compactInsights = useMemo(
    () => insights.slice(0, 4).map((item) => ({
      title: item.title,
      tone: item.tone,
    })),
    [insights],
  );

  const decisionFeed = useMemo(() => {
    const alerts = state.dashboard.alerts.slice(0, 2);
    const stockSignal = criticalResource
      ? `${criticalResource.blueprint.kind}: ${criticalResource.shortage > 0 ? `shortage ${criticalResource.shortage}` : `stable for ${formatDays(criticalResource.daysRemaining)}`}`
      : null;
    return [...alerts, ...(stockSignal ? [stockSignal] : [])].slice(0, 3);
  }, [state.dashboard.alerts, criticalResource]);

  const openDetail = (kind: ResourceKind) => {
    setSelectedResource(kind);
    setIsDetailOpen(true);
  };

  return (
    <div className="min-h-screen bg-white text-slate-700">
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <RefreshCw className="h-3.5 w-3.5" />
                Live control room sync every few seconds
              </div>
              <h1 className="text-3xl font-black tracking-tight text-[#0b3c5d]">Inventory Management</h1>
              <p className="max-w-3xl text-sm text-slate-600">
                Monitor stock, forecast depletion, and convert request pressure into actionable supply decisions for every zone.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
              <div className="flex items-center justify-end gap-2 text-xs font-semibold text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                Updated {liveTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div className="mt-1 text-sm font-bold text-[#0b3c5d]">{totalActiveRequests} active requests driving inventory demand</div>
              <div className="mt-1 text-xs text-slate-500">Inventory decisions are recalculated from live requests and stock levels.</div>
            </div>
          </div>
        </section>

        <GovernmentPortalNav />

        {criticalResource && criticalResource.status !== 'healthy' && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <div className="font-black">Critical shortage detected: {criticalResource.blueprint.kind.toLowerCase()}</div>
                  <div className="text-sm text-red-700">
                    Suggested action: send additional supply to {zoneByCategory[criticalResource.blueprint.category]} zone.
                  </div>
                </div>
              </div>
              <div className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700">
                {getStatusLabel(criticalResource.status)} inventory pressure
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">Prediction strip</span>
            {compactInsights.map((insight) => (
              <span
                key={insight.title}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${insight.tone === 'critical' ? 'border-red-200 bg-red-50 text-red-700' : insight.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
              >
                {insight.tone === 'critical' ? '⚠️' : insight.tone === 'warning' ? '📈' : '✔️'} {insight.title}
              </span>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {resourceRows.map((row) => {
            const shortageWarning = row.shortage > 0
              ? `⚠️ Shortage expected in ${Math.max(1, Math.ceil(row.shortageDays ?? 1))} day${Math.max(1, Math.ceil(row.shortageDays ?? 1)) === 1 ? '' : 's'}`
              : null;

            return (
              <button
                key={row.blueprint.kind}
                type="button"
                onClick={() => openDetail(row.blueprint.kind)}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-[0_14px_30px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" style={{ boxShadow: `0 8px 24px ${row.blueprint.color}22` }}>
                        <Image src={row.blueprint.image} alt={row.blueprint.kind} width={96} height={64} unoptimized className="h-16 w-24 object-cover" />
                      </div>
                    <div>
                      <h2 className="text-lg font-black text-[#0b3c5d]">{row.blueprint.kind}</h2>
                      <p className="text-xs font-semibold text-slate-500">Click to expand detailed breakdown</p>
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </div>

                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-500">Available stock</div>
                      <div className="mt-1 text-lg font-black text-slate-800">{row.available}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-500">Required stock</div>
                      <div className="mt-1 text-lg font-black text-slate-800">{row.required}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-500">Days remaining</div>
                      <div className="mt-1 text-lg font-black text-slate-800">{formatDays(row.daysRemaining)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-500">Status</div>
                      <div className="mt-1 text-lg font-black text-slate-800">{getStatusLabel(row.status)}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-3 text-sm">
                    {row.shortage > 0 ? (
                      <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-red-700">
                        <ShieldAlert className="h-4 w-4" />
                        {shortageWarning}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs font-semibold text-emerald-700">✔ Stable for {formatDays(row.daysRemaining)}</div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#0b3c5d]">Daily Usage Trend</h2>
                <p className="text-sm text-slate-600">Today usage only with direction signal.</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                Live usage trend
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-130 text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Resource</th>
                    <th className="px-4 py-2 text-left font-semibold">Today</th>
                    <th className="px-4 py-2 text-left font-semibold">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {trendRows.map((row) => (
                    <tr key={row.kind} className="border-t border-slate-200">
                      <td className="px-4 py-2 font-semibold text-slate-800">{row.kind}</td>
                      <td className="px-4 py-2 font-bold text-slate-800">{row.today}</td>
                      <td className={`px-4 py-2 font-semibold ${row.up ? 'text-red-700' : 'text-emerald-700'}`}>
                        {row.up ? '↑' : '↓'} {row.change}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#0b3c5d]">AI Prediction Engine</h2>
                <p className="text-sm text-slate-600">Compact decision signal strip.</p>
              </div>
              <TrendingUp className="h-5 w-5 text-[#0b3c5d]" />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {compactInsights.map((insight) => (
                <span
                  key={`${insight.title}-compact`}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${insight.tone === 'critical' ? 'border-red-200 bg-red-50 text-red-700' : insight.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                >
                  {insight.tone === 'critical' ? '⚠️' : insight.tone === 'warning' ? '📈' : '✔️'} {insight.title}
                </span>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <div className="flex items-center gap-2 font-bold text-[#0b3c5d]">
                <MapPin className="h-4 w-4" />
                Zone recommendation
              </div>
              <div className="mt-2 space-y-1 text-sm">
                <p>Food supply target: <strong>{selectedZoneRecommendations.food}</strong></p>
                <p>Medical supply target: <strong>{selectedZoneRecommendations.medicine}</strong></p>
                <p>Shelter supply target: <strong>{selectedZoneRecommendations.shelter}</strong></p>
                <p>Baby care target: <strong>{selectedZoneRecommendations.babyCare}</strong></p>
                <p>Women care target: <strong>{selectedZoneRecommendations.womenCare}</strong></p>
                <p>Water supply target: <strong>{selectedZoneRecommendations.water}</strong></p>
                <p>Emergency essentials target: <strong>{selectedZoneRecommendations.emergency}</strong></p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0b3c5d]">Zone-wise Inventory</h2>
              <p className="text-sm text-slate-600">Demand and estimated allocation by zone, based on live active requests.</p>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
              {zoneRows.length} monitored zones
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {zoneRows.slice(0, 6).map((zone) => (
              <div key={zone.zone} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-[#0b3c5d]">{zone.zone}</div>
                    <div className="text-xs font-semibold text-slate-500">{zone.requests} active request{zone.requests === 1 ? '' : 's'}</div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Zone pressure</span>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-slate-500">Food shortage</span><span className="font-bold text-slate-800">{zone.foodShortage}</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-500">Medical shortage</span><span className="font-bold text-slate-800">{zone.medicineShortage}</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-500">Shelter shortage</span><span className="font-bold text-slate-800">{zone.shelterShortage}</span></div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                    <div className="rounded-lg bg-slate-50 p-2">
                      <div className="text-slate-500">Baby care shortage</div>
                      <div className="font-bold text-slate-800">{zone.babyCareShortage}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <div className="text-slate-500">Women care shortage</div>
                      <div className="font-bold text-slate-800">{zone.womenCareShortage}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <div className="text-slate-500">Water shortage</div>
                      <div className="font-bold text-slate-800">{zone.waterShortage}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <div className="text-slate-500">Emergency shortage</div>
                      <div className="font-bold text-slate-800">{zone.emergencyShortage}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#0b3c5d]">Decision Feed</h2>
              <p className="text-sm text-slate-600">Live alerts, depletion forecasts, and action prompts.</p>
            </div>
            <ArrowRight className="h-5 w-5 text-[#0b3c5d]" />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {decisionFeed.map((alert, index) => (
              <div key={`${alert}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                {alert}
              </div>
            ))}
          </div>
        </section>
      </div>

      {isDetailOpen && selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6" onClick={() => setIsDetailOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-[#f8fafc] p-5">
              <div>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl p-3" style={{ background: selectedRow.blueprint.accent }}>
                    <selectedRow.blueprint.icon className="h-6 w-6" style={{ color: selectedRow.blueprint.color }} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-[#0b3c5d]">{selectedRow.blueprint.kind} details</h3>
                    <p className="text-sm text-slate-600">Detailed breakdown, live trends, and zone supply guidance.</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 p-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-4">
                    <div className="text-xs font-semibold text-slate-500">Available stock</div>
                    <div className="mt-1 text-2xl font-black text-slate-800">{selectedRow.available}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-4">
                    <div className="text-xs font-semibold text-slate-500">Required stock</div>
                    <div className="mt-1 text-2xl font-black text-slate-800">{selectedRow.required}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-4">
                    <div className="text-xs font-semibold text-slate-500">Days remaining</div>
                    <div className="mt-1 text-2xl font-black text-slate-800">{formatDays(selectedRow.daysRemaining)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-4">
                    <div className="text-xs font-semibold text-slate-500">Status</div>
                    <div className="mt-1 text-2xl font-black text-slate-800">{getStatusLabel(selectedRow.status)}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-black text-[#0b3c5d]">Detailed breakdown</h4>
                    <span className="text-xs font-semibold text-slate-500">Resource composition</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {selectedRow.detailItems.map((item) => (
                      <div key={item.label} className="rounded-xl border border-slate-200 bg-[#f8fafc] p-3">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-semibold text-slate-700">{item.label}</span>
                          <span className="font-bold text-slate-800">{item.available} available</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-[#0b3c5d]" style={{ width: `${Math.min(100, Math.max(10, Math.round((item.available / Math.max(selectedRow.available, 1)) * 100)))}%` }} />
                        </div>
                        <div className="mt-2 text-xs font-semibold text-slate-500">Daily usage: {item.usage}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h4 className="font-black text-[#0b3c5d]">Daily Usage Trend</h4>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl bg-[#f8fafc] p-3">
                      <div className="text-xs font-semibold text-slate-500">Today used</div>
                      <div className="mt-1 text-xl font-black text-slate-800">{selectedRow.todayUsage}</div>
                    </div>
                    <div className="rounded-xl bg-[#f8fafc] p-3">
                      <div className="text-xs font-semibold text-slate-500">Yesterday used</div>
                      <div className="mt-1 text-xl font-black text-slate-800">{selectedRow.yesterdayUsage}</div>
                    </div>
                    <div className="rounded-xl bg-[#f8fafc] p-3">
                      <div className="text-xs font-semibold text-slate-500">Average usage</div>
                      <div className="mt-1 text-xl font-black text-slate-800">{selectedRow.averageUsage}</div>
                    </div>
                  </div>
                  <div className={`mt-3 rounded-xl border px-3 py-2 text-sm font-semibold ${selectedRow.changePercent >= 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    {selectedRow.blueprint.kind.split(' ')[0]} usage {selectedRow.changePercent >= 0 ? 'increased' : 'decreased'} by {Math.abs(Math.round(selectedRow.changePercent))}% today.
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h4 className="font-black text-[#0b3c5d]">Action guidance</h4>
                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                    <p>
                      Stock coverage: <strong>{selectedRow.coveragePercent}%</strong> of current requirement.
                    </p>
                    <p>
                      Suggested supply target: <strong>{zoneByCategory[selectedRow.blueprint.category]}</strong>.
                    </p>
                    <p>
                      {selectedRow.shortage > 0
                        ? `Critical shortage gap: ${selectedRow.shortage} units. Push replenishment now.`
                        : 'Consumption remains stable, but monitor the next update cycle.'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h4 className="font-black text-[#0b3c5d]">Zone impact</h4>
                  <div className="mt-4 space-y-3">
                    {zoneRows.slice(0, 4).map((zone) => {
                      const relevantNeed = selectedRow.blueprint.category === 'food'
                        ? zone.foodNeeded
                        : selectedRow.blueprint.category === 'medicine'
                          ? zone.medicineNeeded
                          : selectedRow.blueprint.category === 'shelter'
                            ? zone.shelterNeeded
                            : selectedRow.blueprint.category === 'babyCare'
                              ? zone.babyCareNeeded
                              : selectedRow.blueprint.category === 'womenCare'
                                ? zone.womenCareNeeded
                                : selectedRow.blueprint.category === 'water'
                                  ? zone.waterNeeded
                                  : zone.emergencyNeeded;
                      const relevantAvailable = selectedRow.blueprint.category === 'food'
                        ? zone.foodAvailable
                        : selectedRow.blueprint.category === 'medicine'
                          ? zone.medicineAvailable
                          : selectedRow.blueprint.category === 'shelter'
                            ? zone.shelterAvailable
                            : selectedRow.blueprint.category === 'babyCare'
                              ? zone.babyCareAvailable
                              : selectedRow.blueprint.category === 'womenCare'
                                ? zone.womenCareAvailable
                                : selectedRow.blueprint.category === 'water'
                                  ? zone.waterAvailable
                                  : zone.emergencyAvailable;
                      const relevantShortage = Math.max(0, relevantNeed - relevantAvailable);
                      return (
                        <div key={`${zone.zone}-${selectedRow.blueprint.kind}`} className="rounded-xl border border-slate-200 bg-[#f8fafc] p-3">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-semibold text-slate-700">{zone.zone}</span>
                            <span className="text-xs font-semibold text-slate-500">{zone.requests} requests</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                            <span>Needed: <strong className="text-slate-800">{relevantNeed}</strong></span>
                            <span>Available: <strong className="text-slate-800">{relevantAvailable}</strong></span>
                          </div>
                          <div className="mt-2 text-xs font-semibold text-red-700">Shortage: {relevantShortage}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-[#0b3c5d] p-4 text-white">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
                    <ShieldAlert className="h-4 w-4" />
                    Decision prompt
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/90">
                    {selectedRow.shortage > 0
                      ? `Critical shortage detected. Re-route the next supply batch to ${zoneByCategory[selectedRow.blueprint.category]}.`
                      : 'Inventory is within safe operating range. Keep monitoring live demand signals and update allocation on the next refresh cycle.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
