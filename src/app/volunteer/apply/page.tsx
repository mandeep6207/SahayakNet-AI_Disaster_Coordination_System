'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createVolunteer } from '@/lib/api';

const SKILL_OPTIONS = [
  'Medical Assistance',
  'Rescue Operations',
  'Food Distribution',
  'Driving / Transport',
  'Logistics',
  'Other',
] as const;

const ZONES = ['Ranchi', 'Dhanbad', 'Jamshedpur'] as const;

type Zone = (typeof ZONES)[number];

function makeApplicationId() {
  return `VOL-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function VolunteerApplyPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('Dhanbad');
  const [stateName, setStateName] = useState('Jharkhand');
  const [skills, setSkills] = useState<string[]>([]);
  const [vehicle, setVehicle] = useState<'yes' | 'no'>('no');
  const [zone, setZone] = useState<Zone>('Dhanbad');
  const [profilePreview, setProfilePreview] = useState('');
  const [idProofPreview, setIdProofPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(
    () => Boolean(fullName.trim() && age.trim() && phone.trim() && address.trim() && district.trim() && stateName.trim()),
    [fullName, age, phone, address, district, stateName],
  );

  const toggleSkill = (skill: string) => {
    setSkills((prev) => (prev.includes(skill) ? prev.filter((item) => item !== skill) : [...prev, skill]));
  };

  const readPreview = (file: File, setter: (v: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!canSubmit) {
      setError('Please complete all required fields.');
      return;
    }

    const applicationId = makeApplicationId();
    setSaving(true);
    setError('');

    const payload = {
      applicationId,
      fullName: fullName.trim(),
      age: Number(age),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      district: district.trim(),
      state: stateName.trim(),
      skills,
      vehicle,
      zone,
      profilePreview,
      idProofPreview,
      submittedAt: new Date().toISOString(),
    };

    localStorage.setItem('volunteer_application_latest', JSON.stringify(payload));

    try {
      await createVolunteer({
        name: payload.fullName,
        phone: payload.phone,
        skills: payload.skills,
        vehicle: payload.vehicle === 'yes',
        zone: payload.zone,
        image: payload.profilePreview || undefined,
        idCard: payload.idProofPreview ? applicationId : undefined,
      });
    } catch {
      // Keep local confirmation flow even when backend is unavailable.
    } finally {
      setSaving(false);
      router.push(`/volunteer/apply/submitted?id=${applicationId}`);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-[#0b3c5d] px-5 py-4 text-white">
            <h1 className="text-2xl font-black">Volunteer Registration - Disaster Response</h1>
            <p className="text-sm text-blue-100 mt-1">Join as a volunteer to support emergency relief operations</p>
          </div>
          <div className="p-5">
            <div className="grid md:grid-cols-2 gap-3">
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Full Name *" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2" type="number" min={18} max={70} placeholder="Age *" value={age} onChange={(e) => setAge(e.target.value)} />
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Phone Number *" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="mt-4 grid md:grid-cols-3 gap-3">
              <input className="md:col-span-3 w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Full Address *" value={address} onChange={(e) => setAddress(e.target.value)} />
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="District / City *" value={district} onChange={(e) => setDistrict(e.target.value)} />
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="State *" value={stateName} onChange={(e) => setStateName(e.target.value)} />
              <select className="w-full border border-slate-300 rounded-lg px-3 py-2" value={zone} onChange={(e) => setZone(e.target.value as Zone)}>
                {ZONES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <div className="text-sm font-semibold text-slate-700 mb-2">Skills</div>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                {SKILL_OPTIONS.map((skill) => (
                  <label key={skill} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                    <input type="checkbox" checked={skills.includes(skill)} onChange={() => toggleSkill(skill)} />
                    <span>{skill}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-700">Do you have a vehicle?</div>
                <div className="flex items-center gap-3 mt-2 text-sm">
                  <label className="flex items-center gap-1"><input type="radio" checked={vehicle === 'yes'} onChange={() => setVehicle('yes')} /> Yes</label>
                  <label className="flex items-center gap-1"><input type="radio" checked={vehicle === 'no'} onChange={() => setVehicle('no')} /> No</label>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-700">Available Area</div>
                <div className="text-sm text-slate-600 mt-1">Selected Zone: {zone}</div>
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="text-sm font-semibold text-slate-700">Upload Profile Image</div>
                <input type="file" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) readPreview(file, setProfilePreview);
                }} />
                {profilePreview && <Image src={profilePreview} alt="Profile preview" width={80} height={80} className="w-20 h-20 rounded-md object-cover border border-slate-200" />}
              </div>

              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="text-sm font-semibold text-slate-700">Upload ID Proof (optional)</div>
                <input type="file" accept="image/*,.pdf" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.type.startsWith('image/')) {
                    readPreview(file, setIdProofPreview);
                  } else if (file) {
                    setIdProofPreview('uploaded-document');
                  }
                }} />
                {idProofPreview && idProofPreview !== 'uploaded-document' && <Image src={idProofPreview} alt="ID proof preview" width={80} height={80} className="w-20 h-20 rounded-md object-cover border border-slate-200" />}
                {idProofPreview === 'uploaded-document' && <div className="text-xs text-slate-500">Document selected</div>}
              </div>
            </div>

            {error && <div className="mt-3 text-sm text-red-700">{error}</div>}

            <button
              onClick={() => { void submit(); }}
              disabled={saving}
              className="mt-5 w-full py-3 rounded-xl bg-[#0b3c5d] hover:bg-[#07263d] text-white font-semibold disabled:opacity-60"
            >
              {saving ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
