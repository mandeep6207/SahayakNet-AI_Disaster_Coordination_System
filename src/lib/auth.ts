'use client';

export type AuthRole = 'citizen' | 'volunteer' | 'government';

const ROLE_KEY = 'role';
const NAME_KEY = 'name';

export function login(role: AuthRole, name: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ROLE_KEY, role);
  localStorage.setItem(NAME_KEY, name);
}

export function logout() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(NAME_KEY);
}

export function getUser(): { role: AuthRole | null; name: string } {
  if (typeof window === 'undefined') return { role: null, name: '' };
  const role = localStorage.getItem(ROLE_KEY) as AuthRole | null;
  const name = localStorage.getItem(NAME_KEY) ?? '';
  return { role, name };
}
