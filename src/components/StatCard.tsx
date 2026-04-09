'use client';

interface Props {
  value: number;
  label: string;
  icon: string;
  subtext?: string;
  color?: string;
  urgent?: boolean;
}

export default function StatCard({ value, label, icon, subtext, color = '#1a3a6b', urgent }: Props) {
  return (
    <div
      className={`rounded-xl p-4 card-hover bg-white border ${urgent ? 'border-red-200' : 'border-gray-100'}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div
            className="text-3xl font-black tabular-nums"
            style={{ color }}
          >
            {value.toLocaleString()}
          </div>
          <div className="text-xs font-semibold text-gray-600 mt-1">{label}</div>
          {subtext && <div className="text-xs text-gray-400 mt-0.5">{subtext}</div>}
        </div>
        <div
          className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg"
          style={{ background: color + '18' }}
        >
          {icon}
        </div>
      </div>
      {urgent && (
        <div className="mt-2 flex items-center gap-1">
          <span className="pulse-dot" style={{ background: '#dc2626' }}></span>
          <span className="text-xs text-red-600 font-semibold">Urgent Action Required</span>
        </div>
      )}
    </div>
  );
}
