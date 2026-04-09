'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  assignVolunteer,
  completeRequest,
  createBroadcastAlert,
  createRequest as createRequestApi,
  getDashboard,
  setVolunteerStatus,
  startMission,
  updatePriority,
} from './api';
import { DashboardData, FALLBACK_DASHBOARD, HelpRequest } from './mockData';
import { getUser as getAuthUser, login as authLogin, logout as authLogout } from './auth';

export type UserRole = 'citizen' | 'volunteer' | 'government' | null;

export interface SessionUser {
  role: UserRole;
  name: string;
  phone: string;
  location?: string;
}

interface CreatePayload {
  name: string;
  phone: string;
  category: 'food' | 'medical' | 'rescue' | 'shelter' | 'baby_care' | 'women_care' | 'water' | 'emergency_help';
  people: number;
  location: string;
  zone: string;
}

type PendingAction =
  | { type: 'assign'; requestId: string; volunteerId: string }
  | { type: 'start'; requestId: string; volunteerId: string }
  | { type: 'complete'; requestId: string }
  | { type: 'volunteer_status'; volunteerId: string; availability: 'available' | 'busy' | 'inactive' };

interface AppState {
  dashboard: DashboardData;
  loading: boolean;
  error: string;
  isOnline: boolean;
  pendingQueue: CreatePayload[];
  user: SessionUser;
}

interface AppContextValue {
  state: AppState;
  login: (user: SessionUser) => void;
  logout: () => void;
  refreshDashboard: (options?: { force?: boolean }) => Promise<void>;
  createRequest: (payload: CreatePayload) => Promise<HelpRequest | null>;
  assignRequest: (requestId: string, volunteerId: string) => Promise<void>;
  startMissionById: (requestId: string, volunteerId: string) => Promise<void>;
  completeRequestById: (requestId: string) => Promise<void>;
  changePriority: (requestId: string, priority: number) => Promise<void>;
  broadcastAlert: (message: string) => Promise<void>;
  setVolunteerAvailability: (volunteerId: string, availability: 'available' | 'busy' | 'inactive') => Promise<void>;
  isAssigningRequest: (requestId: string) => boolean;
  isMutating: boolean;
  toggleOnline: (value: boolean) => void;
  syncPending: () => Promise<void>;
}

const OFFLINE_KEY = 'sahayaknet_offline_queue';
const ACTION_QUEUE_KEY = 'sahayaknet_offline_actions';
const USER_KEY = 'sahayaknet_user';

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [dashboard, setDashboard] = useState<DashboardData>(FALLBACK_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [pendingQueue, setPendingQueue] = useState<CreatePayload[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [user, setUser] = useState<SessionUser>({ role: null, name: '', phone: '' });
  const [assigningRequestIds, setAssigningRequestIds] = useState<string[]>([]);
  const [isMutating, setIsMutating] = useState(false);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef(0);

  const refreshDashboard = useCallback(async (options?: { force?: boolean }) => {
    const force = Boolean(options?.force);
    const now = Date.now();
    const minInterval = 1200;

    if (!force) {
      if (refreshPromiseRef.current) return refreshPromiseRef.current;
      if (now - lastRefreshAtRef.current < minInterval) return;
    }

    const refreshPromise = (async () => {
      try {
        setLoading(true);
        const data = await getDashboard();
        setDashboard(data);
        setError('');
        lastRefreshAtRef.current = Date.now();
      } catch (err) {
        setError((err as Error).message || 'Unable to connect backend');
      } finally {
        setLoading(false);
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = refreshPromise;
    await refreshPromise;
  }, []);

  useEffect(() => {
    const queued = localStorage.getItem(OFFLINE_KEY);
    if (queued) {
      setPendingQueue(JSON.parse(queued));
    }
    const actionQueue = localStorage.getItem(ACTION_QUEUE_KEY);
    if (actionQueue) {
      setPendingActions(JSON.parse(actionQueue));
    }
    const savedUser = localStorage.getItem(USER_KEY);
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    } else {
      const authUser = getAuthUser();
      if (authUser.role) {
        setUser({ role: authUser.role, name: authUser.name, phone: '' });
      }
    }
    refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    let timer: number | undefined;

    const getInterval = () => {
      if (document.hidden) return 10000;
      const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
      const effectiveType = connection?.effectiveType;
      if (effectiveType === 'slow-2g' || effectiveType === '2g') return 9000;
      if (effectiveType === '3g') return 5000;
      return 3000;
    };

    const schedule = () => {
      timer = window.setTimeout(async () => {
        await refreshDashboard();
        schedule();
      }, getInterval());
    };

    schedule();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [refreshDashboard]);

  useEffect(() => {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(pendingQueue));
  }, [pendingQueue]);

  useEffect(() => {
    localStorage.setItem(ACTION_QUEUE_KEY, JSON.stringify(pendingActions));
  }, [pendingActions]);

  useEffect(() => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }, [user]);

  const createRequest = useCallback(
    async (payload: CreatePayload) => {
      if (!isOnline) {
        setPendingQueue((prev) => [payload, ...prev]);
        return null;
      }
      setIsMutating(true);
      try {
        const req = await createRequestApi(payload);
        await refreshDashboard({ force: true });
        return req;
      } finally {
        setIsMutating(false);
      }
    },
    [isOnline, refreshDashboard],
  );

  const assignRequest = useCallback(
    async (requestId: string, volunteerId: string) => {
      if (!isOnline) {
        setPendingActions((prev) => [...prev, { type: 'assign', requestId, volunteerId }]);
        setDashboard((prev) => ({
          ...prev,
          requests: prev.requests.map((item) => item.id === requestId
            ? {
              ...item,
              status: 'assigned',
              executionStatus: 'assigned',
              assignedVolunteerId: volunteerId,
              assignedVolunteerName: prev.volunteers.find((vol) => vol.id === volunteerId)?.name || item.assignedVolunteerName,
            }
            : item),
        }));
        return;
      }

      setAssigningRequestIds((prev) => (prev.includes(requestId) ? prev : [...prev, requestId]));
      setIsMutating(true);
      try {
        await assignVolunteer({ request_id: requestId, volunteer_id: volunteerId });
        await refreshDashboard({ force: true });
      } finally {
        setAssigningRequestIds((prev) => prev.filter((id) => id !== requestId));
        setIsMutating(false);
      }
    },
    [isOnline, refreshDashboard],
  );

  const startMissionById = useCallback(
    async (requestId: string, volunteerId: string) => {
      if (!isOnline) {
        setPendingActions((prev) => [...prev, { type: 'start', requestId, volunteerId }]);
        setDashboard((prev) => ({
          ...prev,
          requests: prev.requests.map((item) => item.id === requestId
            ? { ...item, status: 'assigned', executionStatus: 'on_the_way' }
            : item),
        }));
        return;
      }

      setIsMutating(true);
      try {
        await startMission({ request_id: requestId, volunteer_id: volunteerId });
        await refreshDashboard({ force: true });
      } finally {
        setIsMutating(false);
      }
    },
    [isOnline, refreshDashboard],
  );

  const completeRequestById = useCallback(
    async (requestId: string) => {
      if (!isOnline) {
        setPendingActions((prev) => [...prev, { type: 'complete', requestId }]);
        setDashboard((prev) => ({
          ...prev,
          requests: prev.requests.map((item) => item.id === requestId
            ? { ...item, status: 'completed', executionStatus: 'completed' }
            : item),
        }));
        return;
      }

      setIsMutating(true);
      try {
        await completeRequest({ request_id: requestId });
        await refreshDashboard({ force: true });
      } finally {
        setIsMutating(false);
      }
    },
    [isOnline, refreshDashboard],
  );

  const changePriority = useCallback(
    async (requestId: string, priority: number) => {
      setIsMutating(true);
      try {
        await updatePriority({ request_id: requestId, priority });
        await refreshDashboard({ force: true });
      } finally {
        setIsMutating(false);
      }
    },
    [refreshDashboard],
  );

  const setVolunteerAvailability = useCallback(
    async (volunteerId: string, availability: 'available' | 'busy' | 'inactive') => {
      if (!isOnline) {
        setPendingActions((prev) => [...prev, { type: 'volunteer_status', volunteerId, availability }]);
        setDashboard((prev) => ({
          ...prev,
          volunteers: prev.volunteers.map((item) => item.id === volunteerId ? { ...item, availability } : item),
        }));
        return;
      }

      setIsMutating(true);
      try {
        await setVolunteerStatus({ volunteer_id: volunteerId, availability });
        await refreshDashboard({ force: true });
      } finally {
        setIsMutating(false);
      }
    },
    [isOnline, refreshDashboard],
  );

  const syncPending = useCallback(async () => {
    if (!isOnline) return;

    if (pendingQueue.length > 0) {
      for (const item of pendingQueue) {
        await createRequestApi(item);
      }
      setPendingQueue([]);
    }

    if (pendingActions.length > 0) {
      for (const action of pendingActions) {
        if (action.type === 'assign') {
          await assignVolunteer({ request_id: action.requestId, volunteer_id: action.volunteerId });
        } else if (action.type === 'start') {
          await startMission({ request_id: action.requestId, volunteer_id: action.volunteerId });
        } else if (action.type === 'complete') {
          await completeRequest({ request_id: action.requestId });
        } else if (action.type === 'volunteer_status') {
          await setVolunteerStatus({ volunteer_id: action.volunteerId, availability: action.availability });
        }
      }
      setPendingActions([]);
    }

    await refreshDashboard({ force: true });
  }, [isOnline, pendingQueue, pendingActions, refreshDashboard]);

  useEffect(() => {
    if (isOnline && (pendingQueue.length > 0 || pendingActions.length > 0)) {
      void syncPending();
    }
  }, [isOnline, pendingQueue.length, pendingActions.length, syncPending]);

  const broadcastAlert = useCallback(async (message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    setIsMutating(true);
    try {
      const response = await createBroadcastAlert({ message: normalized, channels: ['sms', 'ivr', 'whatsapp'] });
      setDashboard((prev) => ({
        ...prev,
        alerts: [response.feed, ...prev.alerts].slice(0, 20),
      }));
      await refreshDashboard({ force: true });
    } catch {
      setDashboard((prev) => ({
        ...prev,
        alerts: [`${normalized} | Message queued locally`, ...prev.alerts].slice(0, 20),
      }));
    } finally {
      setIsMutating(false);
    }
  }, [refreshDashboard]);

  const isAssigningRequest = useCallback(
    (requestId: string) => assigningRequestIds.includes(requestId),
    [assigningRequestIds],
  );

  const login = useCallback((nextUser: SessionUser) => {
    if (nextUser.role) {
      authLogin(nextUser.role, nextUser.name);
    }
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    authLogout();
    setUser({ role: null, name: '', phone: '' });
    localStorage.removeItem(USER_KEY);
  }, []);

  const state = useMemo(
    () => ({
      dashboard,
      loading,
      error,
      isOnline,
      pendingQueue,
      user,
    }),
    [dashboard, loading, error, isOnline, pendingQueue, user],
  );

  return (
    <AppContext.Provider
      value={{
        state,
        login,
        logout,
        refreshDashboard,
        createRequest,
        assignRequest,
        startMissionById,
        completeRequestById,
        changePriority,
        broadcastAlert,
        setVolunteerAvailability,
        isAssigningRequest,
        isMutating,
        toggleOnline: setIsOnline,
        syncPending,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
