'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useApp } from '@/lib/store';
import StatCard from '@/components/StatCard';

const MapView = dynamic(() => import('../components/MapView'), { ssr: false });

export default function HomePage() {
  const { state } = useApp();

  const summaryCards = [
    { label: 'Active Requests', value: state.dashboard.summary.activeRequests, icon: '📋', color: '#0b3c5d' },
    { label: 'Volunteers Active', value: state.dashboard.summary.volunteersAvailable, icon: '🧑', color: '#2e7d32' },
    { label: 'Critical Cases', value: state.dashboard.summary.criticalRequests, icon: '⚠️', color: '#c62828', urgent: state.dashboard.summary.criticalRequests > 0 },
    { label: 'Completed', value: state.dashboard.summary.completedRequests, icon: '✅', color: '#0b3c5d' },
  ] as const;

  return (
    <div className="bg-white">
      <section className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-full border-2 border-[#0b3c5d] bg-white shadow-sm flex items-center justify-center text-[#0b3c5d] font-bold text-xs">GOI</div>
            <div>
              <div className="text-[11px] tracking-[0.08em] uppercase text-slate-500 font-semibold">Government of India | Ministry of Home Affairs</div>
              <div className="text-2xl text-[#0b3c5d] font-extrabold leading-tight">NDMA Disaster Coordination System</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/drone"
              className="px-4 py-2 rounded-full text-xs font-extrabold bg-linear-to-r from-[#0b4ea2] to-[#d32f2f] text-white no-underline border border-[#0b4ea2] shadow-[0_6px_14px_rgba(11,78,162,0.35)] hover:opacity-95"
            >
              Start Drone Survey
            </Link>
            <Link
              href="/volunteer/apply"
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#0b3c5d] text-white no-underline border border-[#0b3c5d] hover:bg-[#07263d]"
            >
              Apply as Volunteer
            </Link>
            <div className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-[#2e7d32] border border-green-200">
              System Active
            </div>
          </div>
        </div>
      </section>

      <section className="relative h-[75vh] overflow-hidden">
        <div className="absolute inset-0 filter brightness-[0.62] contrast-[1.25] blur-[1px] saturate-[0.8]">
          <MapView
            requests={state.dashboard.requests.slice(0, 20)}
            volunteers={state.dashboard.volunteers.slice(0, 8)}
            height="100%"
            showHeatmap
            showClusters
          />
        </div>

        <div className="absolute inset-0 bg-linear-to-b from-[rgba(0,0,0,0.75)] to-[rgba(11,60,93,0.85)]" />

        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />

        <span className="gov-glow-point" style={{ top: '26%', left: '28%' }} />
        <span className="gov-glow-point" style={{ top: '42%', left: '63%' }} />
        <span className="gov-glow-point" style={{ top: '58%', left: '49%' }} />

        <div className="relative z-10 max-w-4xl ml-6 md:ml-16 pl-0 pr-4 py-14 md:py-16 h-[75vh] flex flex-col items-start justify-center text-left text-white gov-fade-in">
          <div className="px-4 py-1.5 border border-[#f9a825] rounded-full text-[#f9a825] text-xs md:text-sm font-semibold tracking-widest uppercase">
            Smart Disaster Response System
          </div>

          <h1 className="mt-9 text-5xl md:text-6xl lg:text-7xl font-black leading-[1.1] max-w-3xl hero-title-glow">
            Integrated Disaster Response & Coordination Platform
          </h1>

          <p className="mt-7 text-base md:text-xl text-slate-300 max-w-xl">
            Real-time coordination between citizens, volunteers, NGOs, and government authorities during emergencies.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 items-start">
            <Link
              href="/drone"
              className="px-8 py-4 rounded-xl bg-[#0b4ea2] hover:bg-[#083a7a] text-white text-base font-bold no-underline shadow-[0_8px_20px_rgba(11,78,162,0.4)]"
            >
              Start Drone Survey
            </Link>
            <Link
              href="/request-help"
              className="px-10 py-5 rounded-xl bg-[#d32f2f] hover:bg-[#b71c1c] text-white text-lg font-bold no-underline shadow-[0_10px_24px_rgba(211,47,47,0.45)] ring-1 ring-[rgba(211,47,47,0.45)]"
            >
              🚨 REQUEST HELP
            </Link>
            <Link
              href="/login"
              className="px-10 py-5 rounded-xl bg-white text-[#0b3c5d] text-lg font-bold no-underline shadow-[0_8px_18px_rgba(0,0,0,0.28)] border border-slate-200"
            >
              🔐 LOGIN TO PORTAL
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[#0f172a] border-y border-slate-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-2 md:grid-cols-4">
          {summaryCards.map((item, idx) => (
            <div key={item.label} className={`px-4 py-1 text-center ${idx !== 3 ? 'md:border-r md:border-slate-600' : ''}`}>
              <div className="text-xs text-slate-300 uppercase tracking-wide mb-1">{item.icon} {item.label}</div>
              <div className="text-3xl font-extrabold leading-none">{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-linear-to-r from-[#2b0d0d] via-[#3a1212] to-[#2b0d0d] border-b border-slate-800 text-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#d32f2f] animate-pulse" />
          <span className="text-xs font-bold tracking-wide text-red-200 uppercase">Live Alert</span>
          <div className="ticker-wrap">
            <div className="ticker-text whitespace-nowrap text-sm text-slate-100">
              ALERT: Flood warning in Ranchi, Dhanbad districts. Rescue teams deployed. Medical units on standby.
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <section>
          <h2 className="gov-title text-2xl mb-4">How SahayakNet Works</h2>
          <div className="grid md:grid-cols-4 gap-4">
            {summaryCards.map((card) => (
              <StatCard
                key={card.label}
                value={card.value}
                label={card.label}
                icon={card.icon}
                color={card.color}
                urgent={"urgent" in card ? card.urgent : false}
              />
            ))}
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            {[
              { title: 'Affected People', body: 'Citizens raise emergency help requests quickly via simple guided forms.' },
              { title: 'Volunteers', body: 'Field volunteers receive and complete assigned tasks from the nearest zones.' },
              { title: 'Government Control Room', body: 'District officials monitor requests, resources, and response progress in one view.' },
            ].map((item) => (
              <div key={item.title} className="gov-card p-5">
                <h3 className="gov-title text-lg">{item.title}</h3>
                <p className="text-sm text-slate-600 mt-2">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="gov-section p-6">
          <h2 className="gov-title text-2xl">Key Features</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
            {[
              'Multi-channel input (IVR, WhatsApp, Web)',
              'Real-time coordination',
              'AI-based priority system',
              'Offline support',
              'Geo-based tracking',
            ].map((feature) => (
              <div key={feature} className="gov-card p-4 text-sm text-slate-700">{feature}</div>
            ))}
          </div>
        </section>

        <section className="gov-card overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="gov-title text-lg">Jharkhand Map Overview</h2>
            <span className="text-xs text-slate-500">Live sample markers</span>
          </div>
          <MapView requests={state.dashboard.requests.slice(0, 8)} volunteers={state.dashboard.volunteers.slice(0, 4)} height="420px" showHeatmap showClusters />
        </section>

        <footer className="bg-[#f5f7fa] border border-slate-200 rounded-xl p-6 text-sm text-slate-700">
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <div className="font-bold text-[#0b3c5d]">Government of India</div>
              <div>Ministry of Home Affairs</div>
              <div>NDMA</div>
            </div>
            <div>
              <div className="font-bold text-[#0b3c5d] mb-1">Quick Links</div>
              <div className="flex flex-col gap-1">
                <span>Home</span>
                <span>NDMA</span>
                <span>Disaster Guidelines</span>
                <span>Contact</span>
              </div>
            </div>
            <div>
              <div className="font-bold text-[#0b3c5d] mb-1">Emergency Contact</div>
              <div>Email: ndma-control@gov.in</div>
              <div>Helpline: 1078</div>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-300 text-xs text-slate-600">
            Disclaimer: This portal is for coordinated emergency response simulation and operational readiness.
          </div>
        </footer>
      </div>

      <style jsx global>{`
        .ticker-wrap {
          overflow: hidden;
          width: 100%;
        }
        .ticker-text {
          display: inline-block;
          padding-left: 100%;
          animation: ticker 18s linear infinite;
        }
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        .gov-fade-in {
          animation: govFadeIn 0.65s ease-out both;
        }
        @keyframes govFadeIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .hero-title-glow {
          text-shadow: 0 8px 28px rgba(11, 60, 93, 0.45);
        }
        .gov-glow-point {
          position: absolute;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: #f9a825;
          box-shadow: 0 0 20px rgba(249, 168, 37, 0.8);
          z-index: 3;
        }
      `}</style>
    </div>
  );
}
