'use client';

import L from 'leaflet';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useMapEvents } from 'react-leaflet';
import { priorityLevel } from '@/lib/aiLogic';
import { HelpRequest, JHARKHAND_CENTER, Volunteer } from '@/lib/mockData';

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then((mod) => mod.Circle), { ssr: false });
const CircleMarker = dynamic(() => import('react-leaflet').then((mod) => mod.CircleMarker), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false });
const Polygon = dynamic(() => import('react-leaflet').then((mod) => mod.Polygon), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then((mod) => mod.Polyline), { ssr: false });
const Tooltip = dynamic(() => import('react-leaflet').then((mod) => mod.Tooltip), { ssr: false });

interface Props {
  requests: HelpRequest[];
  volunteers?: Volunteer[];
  height?: string;
  showHeatmap?: boolean;
  showClusters?: boolean;
}

type GeoPoint = [number, number];

type LayerState = {
  requests: boolean;
  volunteers: boolean;
  routes: boolean;
  heatmap: boolean;
  hexZones: boolean;
};

type RouteView = {
  request: HelpRequest;
  volunteer: Volunteer;
  route: RoutePath;
  split: ReturnType<typeof createRouteProgress>;
  distanceKm: number;
  etaMinutes: number;
  heading: number;
};

type RoutePath = {
  points: GeoPoint[];
  distanceKm: number;
};

type HexCell = {
  id: string;
  center: GeoPoint;
  points: GeoPoint[];
  requests: HelpRequest[];
  volunteers: Volunteer[];
  severity: 'low' | 'medium' | 'high' | 'critical';
};

const INITIAL_LAYERS: LayerState = {
  requests: true,
  volunteers: true,
  routes: false,
  heatmap: false,
  hexZones: false,
};

const requestColors: Record<'low' | 'medium' | 'high' | 'critical', string> = {
  low: '#22c55e',
  medium: '#facc15',
  high: '#f97316',
  critical: '#dc2626',
};

const volunteerIconStyles = {
  bike: '#2563eb',
  person: '#0f766e',
};

const JHARKHAND_BOUNDS = {
  minLat: 22.5,
  maxLat: 24.5,
  minLng: 85.0,
  maxLng: 87.0,
};

const ZONES: Array<{ name: string; center: GeoPoint; points: GeoPoint[] }> = [
  {
    name: 'Dhanbad',
    center: [23.7957, 86.4304],
    points: [[23.96, 86.22], [23.98, 86.55], [23.72, 86.56], [23.66, 86.29], [23.79, 86.14]],
  },
  {
    name: 'Ranchi',
    center: [23.3441, 85.3096],
    points: [[23.52, 85.15], [23.54, 85.42], [23.27, 85.50], [23.14, 85.32], [23.26, 85.12]],
  },
  {
    name: 'Jamshedpur',
    center: [22.8046, 86.2029],
    points: [[22.96, 86.05], [22.98, 86.30], [22.72, 86.37], [22.62, 86.18], [22.73, 85.98]],
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function haversineKm(a: GeoPoint, b: GeoPoint) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLat = lat2 - lat1;
  const dLng = toRad(b[1] - a[1]);
  const aa = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function bearingDegrees(a: GeoPoint, b: GeoPoint) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const toDeg = (value: number) => (value * 180) / Math.PI;
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLng = toRad(b[1] - a[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function midpoint(a: GeoPoint, b: GeoPoint): GeoPoint {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function offsetRoute(start: GeoPoint, end: GeoPoint): RoutePath {
  const mid = midpoint(start, end);
  const deltaLat = end[0] - start[0];
  const deltaLng = end[1] - start[1];
  const perpendicular: GeoPoint = [-(deltaLng * 0.25), deltaLat * 0.25];
  const pivot: GeoPoint = [mid[0] + perpendicular[0], mid[1] + perpendicular[1]];
  const points: GeoPoint[] = [start];

  for (let i = 1; i <= 4; i += 1) {
    const t = i / 5;
    points.push([
      start[0] + (pivot[0] - start[0]) * t,
      start[1] + (pivot[1] - start[1]) * t,
    ]);
  }

  for (let i = 1; i <= 5; i += 1) {
    const t = i / 5;
    points.push([
      pivot[0] + (end[0] - pivot[0]) * t,
      pivot[1] + (end[1] - pivot[1]) * t,
    ]);
  }

  const distanceKm = points.slice(0, -1).reduce((sum, point, index) => sum + haversineKm(point, points[index + 1]), 0);
  return { points, distanceKm };
}

function createRouteProgress(points: GeoPoint[], progress: number) {
  if (points.length < 2) {
    const point = points[0] ?? JHARKHAND_CENTER;
    return { traveled: [point], remaining: [point], current: point };
  }

  const distances = points.slice(0, -1).map((point, index) => haversineKm(point, points[index + 1]));
  const total = distances.reduce((sum, value) => sum + value, 0);
  const target = total * clamp(progress, 0, 1);
  let travelled = 0;
  const traveled: GeoPoint[] = [points[0]];
  const remaining: GeoPoint[] = [];
  let current = points[0];

  for (let index = 0; index < distances.length; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segment = distances[index];

    if (travelled + segment < target) {
      traveled.push(end);
      travelled += segment;
      current = end;
      continue;
    }

    const localProgress = segment === 0 ? 1 : (target - travelled) / segment;
    current = [
      start[0] + (end[0] - start[0]) * localProgress,
      start[1] + (end[1] - start[1]) * localProgress,
    ];
    traveled.push(current);
    remaining.push(current, ...points.slice(index + 1));
    break;
  }

  if (remaining.length === 0) {
    remaining.push(points[points.length - 1]);
  }

  return { traveled, remaining, current };
}

function mapBounds(requests: HelpRequest[], volunteers: Volunteer[]) {
  const points = [
    ...requests.map((item) => [item.lat, item.lng] as GeoPoint),
    ...volunteers.map((item) => [item.lat, item.lng] as GeoPoint),
  ];

  if (points.length === 0) return JHARKHAND_BOUNDS;

  return points.reduce(
    (acc, point) => ({
      minLat: Math.min(acc.minLat, point[0]),
      maxLat: Math.max(acc.maxLat, point[0]),
      minLng: Math.min(acc.minLng, point[1]),
      maxLng: Math.max(acc.maxLng, point[1]),
    }),
    { minLat: points[0][0], maxLat: points[0][0], minLng: points[0][1], maxLng: points[0][1] },
  );
}

function hexagon(center: GeoPoint, radiusLat: number, radiusLng: number) {
  return [0, 60, 120, 180, 240, 300].map((angle) => {
    const radians = (Math.PI / 180) * angle;
    return [center[0] + Math.sin(radians) * radiusLat, center[1] + Math.cos(radians) * radiusLng] as GeoPoint;
  });
}

function clusterByGrid<T extends { id: string; lat: number; lng: number }>(items: T[], zoom: number) {
  const step = zoom >= 12 ? 0.02 : zoom >= 10 ? 0.04 : 0.08;
  const clusters = new Map<string, { id: string; center: GeoPoint; items: T[] }>();

  items.forEach((item) => {
    const key = `${Math.floor(item.lat / step)}:${Math.floor(item.lng / step)}`;
    const existing = clusters.get(key);
    if (existing) {
      existing.items.push(item);
      existing.center = [
        (existing.center[0] * (existing.items.length - 1) + item.lat) / existing.items.length,
        (existing.center[1] * (existing.items.length - 1) + item.lng) / existing.items.length,
      ];
      return;
    }

    clusters.set(key, { id: `cluster-${key}`, center: [item.lat, item.lng], items: [item] });
  });

  return [...clusters.values()];
}

function buildHexCells(requests: HelpRequest[], volunteers: Volunteer[], zoom: number) {
  const bounds = mapBounds(requests, volunteers);
  const latStep = zoom >= 12 ? 0.1 : zoom >= 10 ? 0.14 : 0.2;
  const lngStep = latStep * 1.15;
  const cells: HexCell[] = [];
  let row = 0;

  for (let lat = bounds.minLat - latStep; lat <= bounds.maxLat + latStep; lat += latStep, row += 1) {
    const offset = row % 2 === 0 ? 0 : lngStep / 2;
    for (let lng = bounds.minLng - lngStep; lng <= bounds.maxLng + lngStep; lng += lngStep) {
      const center: GeoPoint = [lat, lng + offset];
      const requestsInCell = requests.filter((request) => haversineKm(center, [request.lat, request.lng]) <= 4.5);
      const volunteersInCell = volunteers.filter((volunteer) => haversineKm(center, [volunteer.lat, volunteer.lng]) <= 4.5);
      if (requestsInCell.length + volunteersInCell.length < 2) continue;

      const pressure = requestsInCell.reduce((sum, request) => {
        const severity = priorityLevel(request.priority);
        if (severity === 'high') return sum + 3;
        if (severity === 'medium') return sum + 2;
        return sum + 1;
      }, 0) - volunteersInCell.length * 1.4;

      const severity: HexCell['severity'] = pressure >= 8 ? 'critical' : pressure >= 5 ? 'high' : pressure >= 3 ? 'medium' : 'low';
      cells.push({
        id: `hex-${row}-${Math.round((lng + offset) * 100)}`,
        center,
        points: hexagon(center, latStep * 0.55, lngStep * 0.55),
        requests: requestsInCell,
        volunteers: volunteersInCell,
        severity,
      });
    }
  }

  return cells;
}

function ZoomWatcher({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  useMapEvents({
    zoomend(event) {
      onZoomChange(event.target.getZoom());
    },
    moveend(event) {
      onZoomChange(event.target.getZoom());
    },
  });
  return null;
}

function volunteerLabel(volunteer: Volunteer) {
  return volunteer.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function volunteerIcon(volunteer: Volunteer, moving: boolean) {
  const color = moving ? volunteerIconStyles.bike : volunteerIconStyles.person;
  const emoji = volunteer.vehicle ? '🚴' : '🧍';
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:58px;height:58px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:0;border-radius:9999px;background:${color}1A;border:2px solid ${color}55;animation:mapPulse 1.9s ease-out infinite;"></div>
        <div style="position:absolute;inset:8px;border-radius:9999px;background:${color};border:4px solid white;box-shadow:0 10px 24px rgba(15,23,42,0.25);display:flex;align-items:center;justify-content:center;color:white;font-size:22px;">${emoji}</div>
        <div style="position:absolute;bottom:-16px;background:white;border:1px solid #dbe4f0;border-radius:9999px;padding:2px 8px;font-size:10px;font-weight:800;color:#0f172a;box-shadow:0 4px 14px rgba(15,23,42,0.12);">${volunteerLabel(volunteer)}</div>
      </div>
    `,
    iconSize: [58, 70],
    iconAnchor: [29, 52],
    popupAnchor: [0, -34],
  });
}

function requestIcon(request: HelpRequest, severity: HexCell['severity']) {
  const color = request.source === 'ivr' ? '#7c3aed' : requestColors[severity];
  const pulse = severity === 'critical';
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
        ${pulse ? `<div style="position:absolute;inset:-7px;border-radius:9999px;background:${color}22;border:2px solid ${color}88;animation:mapPulse 1.8s ease-out infinite;"></div>` : ''}
        <div style="position:absolute;inset:0;border-radius:9999px;background:white;border:2px solid ${color};box-shadow:0 10px 24px rgba(15,23,42,0.18);"></div>
        <div style="position:absolute;inset:7px;border-radius:9999px;background:${color};"></div>
        <div style="position:absolute;bottom:-15px;background:white;border:1px solid #dbe4f0;border-radius:9999px;padding:1px 6px;font-size:9px;font-weight:800;color:#0f172a;box-shadow:0 4px 14px rgba(15,23,42,0.12);">${request.id.slice(-3)}</div>
      </div>
    `,
    iconSize: [34, 48],
    iconAnchor: [17, 26],
    popupAnchor: [0, -24],
  });
}

function requestMarkerLabel(request: HelpRequest) {
  const severity = request.priority >= 60 ? 'Critical' : request.priority >= 40 ? 'High' : request.priority >= 25 ? 'Medium' : 'Low';
  return `${request.id} | ${request.category.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())} | ${severity}`;
}

function routePopupLabel(request: HelpRequest, volunteer: Volunteer, etaMinutes: number, distanceKm: number) {
  return `${volunteer.name} → ${request.id} | ETA ${etaMinutes} mins | ${distanceKm.toFixed(1)} km`;
}

export default function MapView({ requests, volunteers = [], height = '600px', showHeatmap, showClusters }: Props) {
  const [zoom, setZoom] = useState(8);
  const [layers, setLayers] = useState<LayerState>(INITIAL_LAYERS);
  const [liveVolunteers, setLiveVolunteers] = useState<Volunteer[]>(volunteers);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const layersMenuRef = useRef<HTMLDivElement | null>(null);

  const activeRequests = useMemo(() => requests.filter((request) => request.status !== 'completed'), [requests]);
  const assignedRequests = useMemo(
    () => activeRequests.filter((request) => request.assignedVolunteerId),
    [activeRequests],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setLiveVolunteers((current) => volunteers.map((volunteer) => {
        const existing = current.find((item) => item.id === volunteer.id);
        return existing
          ? { ...existing, ...volunteer, lat: existing.lat, lng: existing.lng }
          : volunteer;
      }));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [volunteers]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveVolunteers((current) => current.map((volunteer) => {
        const assignedRequest = assignedRequests.find((request) => request.assignedVolunteerId === volunteer.id) ?? null;
        if (!assignedRequest) return volunteer;

        const start = [volunteer.lat, volunteer.lng] as GeoPoint;
        const target = [assignedRequest.lat, assignedRequest.lng] as GeoPoint;
        const speed = volunteer.speed ?? (volunteer.vehicle ? 24 : 16);
        const stepKm = Math.max(0.01, (speed * 2) / 3600);

        const distanceToTarget = haversineKm(start, target);
        if (distanceToTarget <= stepKm) {
          return {
            ...volunteer,
            lat: target[0],
            lng: target[1],
            heading: bearingDegrees(start, target),
            lastSeenAt: new Date().toISOString(),
            assignedRequest: assignedRequest.id,
          };
        }

        const moveProgress = stepKm / Math.max(distanceToTarget, 0.001);
        const nextLat = start[0] + (target[0] - start[0]) * moveProgress;
        const nextLng = start[1] + (target[1] - start[1]) * moveProgress;
        return {
          ...volunteer,
          lat: nextLat,
          lng: nextLng,
          heading: bearingDegrees(start, target),
          lastSeenAt: new Date().toISOString(),
          assignedRequest: assignedRequest.id,
        };
      }));
    }, 2000);

    return () => window.clearInterval(timer);
  }, [assignedRequests]);

  const requestClusters = useMemo(() => clusterByGrid(requests, zoom), [requests, zoom]);
  const volunteerClusters = useMemo(() => clusterByGrid(liveVolunteers, zoom), [liveVolunteers, zoom]);
  const hexCells = useMemo(() => buildHexCells(requests, liveVolunteers, zoom), [requests, liveVolunteers, zoom]);
  const zoneIntensity = useMemo(
    () => ZONES.map((zone) => {
      const requestCount = requests.filter((request) => haversineKm(zone.center, [request.lat, request.lng]) <= 15).length;
      const volunteerCount = liveVolunteers.filter((volunteer) => haversineKm(zone.center, [volunteer.lat, volunteer.lng]) <= 15).length;
      return { ...zone, requestCount, volunteerCount };
    }),
    [requests, liveVolunteers],
  );

  const routeViews = useMemo(() => {
    return assignedRequests.map((request) => {
      const volunteer = liveVolunteers.find((item) => item.id === request.assignedVolunteerId) ?? null;
      if (!volunteer) return null;
      const route = offsetRoute([volunteer.lat, volunteer.lng], [request.lat, request.lng]);
      const distanceKm = haversineKm([volunteer.lat, volunteer.lng], [request.lat, request.lng]);
      const speed = volunteer.speed ?? (volunteer.vehicle ? 24 : 16);
      const etaMinutes = Math.max(1, Math.round((distanceKm / Math.max(speed, 6)) * 60));
      const progress = clamp(1 - distanceKm / Math.max(route.distanceKm, 0.01), 0, 1);
      const split = createRouteProgress(route.points, progress);
      return {
        request,
        volunteer,
        route,
        split,
        distanceKm,
        etaMinutes,
        heading: bearingDegrees([volunteer.lat, volunteer.lng], [request.lat, request.lng]),
      };
    }).filter(Boolean) as Array<{
      request: HelpRequest;
      volunteer: Volunteer;
      route: RoutePath;
      split: ReturnType<typeof createRouteProgress>;
      distanceKm: number;
      etaMinutes: number;
      heading: number;
    }>;
  }, [assignedRequests, liveVolunteers]);

  const selectedRoute = useMemo<RouteView | null>(() => {
    const matched = selectedRouteId ? routeViews.find((routeView) => routeView.request.id === selectedRouteId) ?? null : null;
    return matched ?? routeViews[0] ?? null;
  }, [routeViews, selectedRouteId]);

  useEffect(() => {
    const nextRouteId = selectedRouteId && routeViews.some((routeView) => routeView.request.id === selectedRouteId)
      ? selectedRouteId
      : routeViews[0]?.request.id ?? null;

    if (!nextRouteId || nextRouteId === selectedRouteId) return;

    const frame = window.requestAnimationFrame(() => {
      setSelectedRouteId(nextRouteId);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [routeViews, selectedRouteId]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (layersMenuRef.current && !layersMenuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  const summary = useMemo(() => ({
    requests: requests.length,
    volunteers: liveVolunteers.length,
    routes: routeViews.length,
    criticalRequests: requests.filter((request) => priorityLevel(request.priority) === 'high' || request.priority >= 60).length,
  }), [requests, liveVolunteers, routeViews]);

  const requestSingles = useMemo(
    () => requestClusters.filter((cluster) => cluster.items.length === 1 || zoom >= 11),
    [requestClusters, zoom],
  );
  const requestBubbles = useMemo(
    () => requestClusters.filter((cluster) => cluster.items.length > 1 && zoom < 11),
    [requestClusters, zoom],
  );
  const volunteerSingles = useMemo(
    () => volunteerClusters.filter((cluster) => cluster.items.length === 1 || zoom >= 11),
    [volunteerClusters, zoom],
  );
  const volunteerBubbles = useMemo(
    () => volunteerClusters.filter((cluster) => cluster.items.length > 1 && zoom < 11),
    [volunteerClusters, zoom],
  );

  const heatmapActive = Boolean(layers.heatmap || showHeatmap);
  const clustersActive = Boolean(layers.requests || layers.volunteers || showClusters);

  const toggleLayer = (layer: keyof LayerState) => {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  };

  const baseContainerStyle: CSSProperties = {
    height: '100%',
    minHeight: height,
    width: '100%',
  };

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-slate-200 bg-white" style={baseContainerStyle}>
      <div className="absolute left-4 top-4 z-1000 flex gap-2 pointer-events-auto">
        <div className="rounded-2xl border border-slate-200 bg-white/96 px-3 py-2 shadow-[0_10px_26px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Active Requests</div>
          <div className="text-xl font-black text-slate-900">{summary.requests}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/96 px-3 py-2 shadow-[0_10px_26px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Active Volunteers</div>
          <div className="text-xl font-black text-slate-900">{summary.volunteers}</div>
        </div>
      </div>

      <div ref={layersMenuRef} className="absolute right-4 top-4 z-1000 pointer-events-auto">
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-[0_10px_26px_rgba(15,23,42,0.12)] backdrop-blur hover:bg-slate-50"
        >
          Layers ⚙️
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_42px_rgba(15,23,42,0.16)]">
            <div className="space-y-1">
              {[
                { key: 'requests', label: 'Requests' },
                { key: 'volunteers', label: 'Volunteers' },
                { key: 'routes', label: 'Routes' },
                { key: 'heatmap', label: 'Heatmap' },
                { key: 'hexZones', label: 'Hex Zones' },
              ].map((item) => {
                const active = layers[item.key as keyof LayerState];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleLayer(item.key as keyof LayerState)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <span>{item.label}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${active ? 'border-[#0b3c5d] bg-[#0b3c5d] text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-4 right-4 z-1000 w-72 max-w-[calc(100%-2rem)] rounded-2xl border border-slate-200 bg-white/96 p-3 shadow-[0_14px_34px_rgba(15,23,42,0.14)] backdrop-blur pointer-events-auto">
        {selectedRoute ? (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Selected Route</div>
            <div className="text-base font-black text-slate-900">Volunteer: {selectedRoute.volunteer.name}</div>
            <div className="text-sm text-slate-600">Distance: {selectedRoute.distanceKm.toFixed(1)} km</div>
            <div className="text-sm text-slate-600">ETA: {selectedRoute.etaMinutes} mins</div>
            <div className="text-sm font-semibold text-[#0b3c5d]">{selectedRoute.volunteer.name} is arriving in {selectedRoute.etaMinutes} minutes.</div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Selected Route</div>
            <div className="text-sm text-slate-600">No active route selected.</div>
          </div>
        )}
      </div>

      <MapContainer center={JHARKHAND_CENTER} zoom={8} scrollWheelZoom zoomControl style={{ width: '100%', height: '100%', minHeight: 600 }}>
        <ZoomWatcher onZoomChange={setZoom} />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />

        {ZONES.map((zone) => (
          <Polygon
            key={zone.name}
            positions={zone.points}
            pathOptions={{
              color: '#cbd5e1',
              weight: 1.5,
              fillColor: '#f8fafc',
              fillOpacity: 0.12,
            }}
          >
            <Tooltip permanent direction="center" opacity={0.85}>
              {zone.name}
            </Tooltip>
          </Polygon>
        ))}

        {zoneIntensity.map((zone) => {
          const pressure = zone.requestCount - zone.volunteerCount;
          const color = pressure >= 8 ? '#dc2626' : pressure >= 4 ? '#f97316' : pressure >= 1 ? '#facc15' : '#22c55e';
          return (
            <Circle
              key={`zone-${zone.name}`}
              center={zone.center}
              radius={1800 + zone.requestCount * 180}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.07,
                weight: 2,
              }}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <div className="font-black text-slate-900">{zone.name}</div>
                  <div>Requests: <strong>{zone.requestCount}</strong></div>
                  <div>Volunteers: <strong>{zone.volunteerCount}</strong></div>
                  <div className="text-xs text-slate-500">Pressured zone intelligence</div>
                </div>
              </Popup>
            </Circle>
          );
        })}

        {heatmapActive && requests.map((request) => {
          const severity = request.priority >= 60 ? 'critical' : request.priority >= 40 ? 'high' : request.priority >= 25 ? 'medium' : 'low';
          return (
            <Circle
              key={`heat-${request.id}`}
              center={[request.lat, request.lng]}
              radius={request.priority >= 60 ? 4200 : request.priority >= 40 ? 3500 : 2600}
              pathOptions={{
                color: 'transparent',
                fillColor: requestColors[severity],
                fillOpacity: 0.34,
              }}
            />
          );
        })}

        {layers.hexZones && hexCells.map((cell) => (
          <Polygon
            key={cell.id}
            positions={cell.points}
            pathOptions={{
              color: requestColors[cell.severity],
              fillColor: requestColors[cell.severity],
              fillOpacity: 0.24,
              weight: 2,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <div className="font-black text-slate-900">Hex Zone</div>
                <div>Requests: <strong>{cell.requests.length}</strong></div>
                <div>Volunteers: <strong>{cell.volunteers.length}</strong></div>
                <div className="text-xs text-slate-500">Severity: {cell.severity.toUpperCase()}</div>
              </div>
            </Popup>
            <Tooltip permanent direction="center" opacity={0.88}>
              {cell.requests.length} req · {cell.volunteers.length} vol
            </Tooltip>
          </Polygon>
        ))}

        {clustersActive && requestBubbles.map((cluster) => (
          <Circle
            key={cluster.id}
            center={cluster.center}
            radius={1200 + cluster.items.length * 110}
            pathOptions={{
              color: '#0b3c5d',
              fillColor: '#0b3c5d',
              fillOpacity: 0.2,
              weight: 2,
            }}
          >
            <Popup>
              <div className="space-y-2 text-sm">
                <div className="font-black text-slate-900">{cluster.items.length} Requests</div>
                {cluster.items.map((request) => (
                  <div key={request.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                    <div className="font-semibold text-slate-800">{request.id}</div>
                    <div className="text-xs text-slate-600">{request.category.replace(/_/g, ' ').toUpperCase()} · Priority {request.priority}</div>
                  </div>
                ))}
              </div>
            </Popup>
            <Tooltip permanent direction="center" opacity={0.9}>
              {cluster.items.length} Requests
            </Tooltip>
          </Circle>
        ))}

        {clustersActive && volunteerBubbles.map((cluster) => (
          <Circle
            key={cluster.id}
            center={cluster.center}
            radius={950 + cluster.items.length * 100}
            pathOptions={{
              color: '#1d4ed8',
              fillColor: '#1d4ed8',
              fillOpacity: 0.18,
              weight: 2,
            }}
          >
            <Popup>
              <div className="space-y-2 text-sm">
                <div className="font-black text-slate-900">{cluster.items.length} Volunteers</div>
                {cluster.items.map((volunteer) => (
                  <div key={volunteer.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                    <div className="font-semibold text-slate-800">{volunteer.name}</div>
                    <div className="text-xs text-slate-600">{volunteer.availability} · {volunteer.tasksCompleted} tasks</div>
                  </div>
                ))}
              </div>
            </Popup>
            <Tooltip permanent direction="center" opacity={0.9}>
              {cluster.items.length} Volunteers
            </Tooltip>
          </Circle>
        ))}

        {layers.routes && routeViews.map((routeView) => {
          const { request, volunteer, split, distanceKm, etaMinutes, heading } = routeView;
          const labelPoint = midpoint([volunteer.lat, volunteer.lng], [request.lat, request.lng]);
          return (
            <>
              <Polyline
                key={`route-base-${request.id}`}
                positions={split.traveled}
                pathOptions={{
                  color: '#ffffff',
                  weight: 7,
                  opacity: 0.95,
                }}
              />
              <Polyline
                key={`route-tail-${request.id}`}
                positions={split.remaining}
                pathOptions={{
                  color: '#1d4ed8',
                  weight: 5,
                  opacity: 0.98,
                  dashArray: '10 10',
                }}
                eventHandlers={{ click: () => setSelectedRouteId(request.id) }}
              />
              <CircleMarker key={`route-label-${request.id}`} center={labelPoint} radius={5} pathOptions={{ color: '#1d4ed8', fillColor: '#1d4ed8', fillOpacity: 1, weight: 2 }}>
                <Tooltip permanent direction="top" opacity={0.98}>
                  {distanceKm.toFixed(1)} km | ETA {etaMinutes} mins
                </Tooltip>
              </CircleMarker>
              <Marker
                key={`marker-${request.id}`}
                position={split.current}
                icon={volunteerIcon(volunteer, true)}
                eventHandlers={{ click: () => setSelectedRouteId(request.id) }}
              >
                <Popup>
                  <div className="space-y-1 text-sm">
                    <div className="font-black text-slate-900">{volunteer.name}</div>
                    <div>{routePopupLabel(request, volunteer, etaMinutes, distanceKm)}</div>
                    <div className="text-xs text-slate-500">Heading {heading.toFixed(0)}°</div>
                    <div className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">Volunteer is on the way</div>
                  </div>
                </Popup>
                <Tooltip permanent direction="top" opacity={0.95}>
                  ETA {etaMinutes} mins
                </Tooltip>
              </Marker>
            </>
          );
        })}

        {layers.requests && requestSingles.map((cluster) => cluster.items.map((request) => {
          const severity = request.priority >= 60 ? 'critical' : request.priority >= 40 ? 'high' : request.priority >= 25 ? 'medium' : 'low';
          const assignedVolunteer = liveVolunteers.find((volunteer) => volunteer.id === request.assignedVolunteerId) ?? null;
          return (
            <Marker
              key={request.id}
              position={[request.lat, request.lng]}
              icon={requestIcon(request, severity)}
              eventHandlers={{ click: () => request.assignedVolunteerId && setSelectedRouteId(request.id) }}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <div className="font-black text-slate-900">{request.id}</div>
                  <div>Need type: <strong>{request.category.replace(/_/g, ' ').toUpperCase()}</strong></div>
                  <div>Priority: <strong>{request.priority}</strong></div>
                  <div>Source: <strong>{request.sourceLabel || request.source?.toUpperCase() || 'WEB'}</strong></div>
                  {assignedVolunteer && (
                    <>
                      <div>Volunteer: <strong>{assignedVolunteer.name}</strong></div>
                      <div>ETA: <strong>{request.eta || 'Calculating...'}</strong></div>
                      <div className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">Volunteer is on the way</div>
                    </>
                  )}
                </div>
              </Popup>
              <Tooltip direction="top" opacity={0.96}>
                {requestMarkerLabel(request)}
              </Tooltip>
            </Marker>
          );
        }))}

        {layers.volunteers && volunteerSingles.map((cluster) => cluster.items.map((volunteer) => {
          const movingRoute = routeViews.find((routeView) => routeView.volunteer.id === volunteer.id);
          const position: [number, number] = movingRoute
            ? [movingRoute.split.current[0], movingRoute.split.current[1]]
            : [volunteer.lat, volunteer.lng];
          return (
            <Marker
              key={volunteer.id}
              position={position}
              icon={volunteerIcon(volunteer, Boolean(movingRoute))}
              eventHandlers={{ click: () => volunteer.assignedRequest && setSelectedRouteId(volunteer.assignedRequest) }}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <div className="font-black text-slate-900">{volunteer.name}</div>
                  <div>Status: <strong>{volunteer.availability}</strong></div>
                  <div>Zone: <strong>{volunteer.zone}</strong></div>
                  <div>Tasks: <strong>{volunteer.tasksCompleted}</strong></div>
                  <div>Speed: <strong>{(volunteer.speed ?? 16).toFixed(1)} km/h</strong></div>
                  {volunteer.assignedRequest && <div>Assigned request: <strong>{volunteer.assignedRequest}</strong></div>}
                </div>
              </Popup>
            </Marker>
          );
        }))}
      </MapContainer>

      <style jsx global>{`
        @keyframes mapPulse {
          0% {
            transform: scale(0.85);
            opacity: 0.68;
          }
          70% {
            transform: scale(1.08);
            opacity: 0.14;
          }
          100% {
            transform: scale(1.12);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
