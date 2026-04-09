'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';

const LINKS = [
  { href: '/government', label: 'Command Dashboard' },
  { href: '/command-center', label: 'Disaster Command Center' },
  { href: '/government/requests', label: 'Request Management' },
  { href: '/government/inventory', label: 'Inventory Management' },
  { href: '/government/volunteers', label: 'Volunteer Management' },
  { href: '/government/analytics', label: 'Analytics' },
];

export default function GovernmentPortalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useApp();

  const handleLogout = () => {
    logout();
    localStorage.clear();
    router.push('/login');
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {LINKS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold no-underline transition-colors ${
                  active
                    ? 'bg-[#0b3c5d] text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
