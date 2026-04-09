'use client';

import dynamic from 'next/dynamic';
import { HelpRequest, Volunteer } from '@/lib/mockData';

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then((mod) => mod.Polyline), { ssr: false });

const ZONE_CENTER: Record<string, [number, number]> = {
  Dhanbad: [23.7957, 86.4304],
  Ranchi: [23.3441, 85.3096],
  Jamshedpur: [22.8046, 86.2029],
};

type Props = {
  request: HelpRequest;
  volunteer?: Volunteer | null;
};

export default function RequestMiniMap({ request, volunteer = null }: Props) {
  const zoneCenter = ZONE_CENTER[request.zone] ?? ZONE_CENTER.Dhanbad;
  const requestPoint: [number, number] = [
    Number.isFinite(request.lat) ? request.lat : zoneCenter[0],
    Number.isFinite(request.lng) ? request.lng : zoneCenter[1],
  ];

  const volunteerPoint: [number, number] | null = volunteer ? [volunteer.lat, volunteer.lng] : null;

  return (
    <div className="h-52 w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
      <MapContainer center={requestPoint} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={requestPoint} />
        {volunteerPoint && <Marker position={volunteerPoint} />}
        {volunteerPoint && <Polyline positions={[volunteerPoint, requestPoint]} pathOptions={{ color: '#1d4ed8', weight: 4, opacity: 0.9 }} />}
      </MapContainer>
    </div>
  );
}
