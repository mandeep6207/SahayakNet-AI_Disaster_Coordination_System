'use client';

import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import { AuthRole, login as authLogin } from '@/lib/auth';

const ACCESS_CARDS: Array<{
  id: AuthRole;
  icon: string;
  title: string;
  description: string;
  buttonLabel: string;
  redirectPath: string;
  name: string;
}> = [
  {
    id: 'citizen',
    icon: '👨‍👩‍👧',
    title: 'Citizen Portal',
    description: 'Request help and track emergency status',
    buttonLabel: 'Enter Portal',
    redirectPath: '/citizen',
    name: 'Citizen User',
  },
  {
    id: 'volunteer',
    icon: '🦺',
    title: 'Volunteer Portal',
    description: 'Accept and complete disaster response tasks',
    buttonLabel: 'Enter Portal',
    redirectPath: '/volunteer/dashboard',
    name: 'Volunteer User',
  },
  {
    id: 'government',
    icon: '🏛️',
    title: 'Government Control Room',
    description: 'Monitor and manage disaster response operations',
    buttonLabel: 'Enter Dashboard',
    redirectPath: '/government',
    name: 'Government Officer',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useApp();

  const enterRolePortal = (role: AuthRole, name: string, path: string) => {
    localStorage.setItem('role', role);
    authLogin(role, name);
    login({ role, name, phone: '', location: 'Jharkhand' });
    router.push(path);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 py-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <section className="bg-white rounded-xl shadow-md border border-slate-200 p-8 text-center">
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-slate-500">Government of India | Ministry of Home Affairs | NDMA</p>
          <h1 className="text-3xl font-black text-[#0b3c5d] mt-2">SahayakNet Access Portal</h1>
          <div className="mt-4 h-px w-28 mx-auto bg-slate-300" />
        </section>

        <section className="grid md:grid-cols-3 gap-5">
          {ACCESS_CARDS.map((card) => (
            <div key={card.id} className="bg-white rounded-xl shadow-md border border-slate-200 p-6 transition-transform duration-200 hover:scale-[1.02] hover:shadow-lg">
              <div className="text-4xl">{card.icon}</div>
              <h2 className="mt-4 text-xl font-bold text-[#0b3c5d]">{card.title}</h2>
              <p className="text-sm text-slate-600 mt-2 min-h-10">{card.description}</p>
              <button
                onClick={() => enterRolePortal(card.id, card.name, card.redirectPath)}
                className="mt-6 w-full rounded-lg bg-[#0b3c5d] text-white py-2.5 font-semibold hover:bg-[#07263d]"
              >
                {card.buttonLabel}
              </button>
            </div>
          ))}
        </section>

        <section className="bg-white rounded-xl shadow-md border border-slate-200 p-4 text-center text-sm text-slate-600">
          <p className="font-semibold text-[#0b3c5d]">Secure Government Access</p>
          <p className="mt-1">No login required for demo</p>
        </section>
      </div>
    </div>
  );
}
