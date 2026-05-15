import { NextRequest, NextResponse } from 'next/server';

// Proxy the Next.js simulated API to the real backend when NEXT_PUBLIC_API_BASE is configured.
const BACKEND = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND}/ivr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.text();
    return new NextResponse(json, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/ivr`, { method: 'GET' });
    const json = await res.text();
    return new NextResponse(json, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  } catch (err) {
    return NextResponse.json({ service: 'SahayakNet IVR Webhook', status: 'proxy-unavailable', error: (err as Error).message });
  }
}
