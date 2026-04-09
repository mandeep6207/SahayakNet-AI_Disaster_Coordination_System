'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';

export default function GovernmentLoginPage() {
  const router = useRouter();
  const { login } = useApp();
  const [name, setName] = useState('District Control Officer');
  const [phone, setPhone] = useState('9000000000');

  const submit = () => {
    if (!name.trim() || !phone.trim()) return;
    login({ role: 'government', name: name.trim(), phone: phone.trim() });
    router.push('/government');
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="gov-card p-6 space-y-4">
        <h1 className="gov-title text-xl">Government Login</h1>
        <input className="w-full border border-slate-300 rounded-md px-3 py-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-full border border-slate-300 rounded-md px-3 py-2" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button onClick={submit} className="w-full px-4 py-2 rounded-md bg-[#0b3c5d] text-white">Continue</button>
      </div>
    </div>
  );
}
