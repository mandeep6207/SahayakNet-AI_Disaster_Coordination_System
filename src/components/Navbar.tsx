'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

  if (pathname === '/') {
    return null;
  }

  return (
    <header className="site-header sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <div className="h-10 w-10 rounded-md flex items-center justify-center border border-slate-300 bg-white text-sm font-bold text-[#0b3c5d]">IN</div>
            <div>
              <div className="font-bold text-base leading-tight text-[#0b3c5d]">SahayakNet</div>
              <div className="text-xs text-slate-500 leading-tight">Disaster Coordination Platform</div>
            </div>
          </Link>

          <div className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-[#2e7d32] border border-green-200">
            System Active
          </div>
        </div>
      </nav>
    </header>
  );
}
