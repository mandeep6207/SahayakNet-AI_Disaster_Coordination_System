'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { predictDroneFrame, sendDroneRequest } from '@/lib/api';

const FRAME_INTERVAL_MS = 500;
const REQUEST_COOLDOWN_MS = 20_000;
const ALERT_BEEP_COOLDOWN_MS = 3_000;

export default function DroneSurveyPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectInFlightRef = useRef(false);
  const surveyOnRef = useRef(false);
  const lastRequestAtRef = useRef(0);
  const lastAlertBeepAtRef = useRef(0);
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);

  const [surveyOn, setSurveyOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [statusText, setStatusText] = useState('Survey idle');
  const [peopleCount, setPeopleCount] = useState(0);
  const [riskLevel, setRiskLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('LOW');
  const [errorText, setErrorText] = useState('');
  const [boxes, setBoxes] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; confidence: number }>>([]);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number }>({ width: 1280, height: 720 });

  const stopSurvey = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    detectInFlightRef.current = false;
    surveyOnRef.current = false;
    setSurveyOn(false);
    setCameraReady(false);
    setPeopleCount(0);
    setBoxes([]);
    setStatusText('Survey stopped');
  }, []);

  const playAlertBeep = useCallback(() => {
    const now = Date.now();
    if (now - lastAlertBeepAtRef.current < ALERT_BEEP_COOLDOWN_MS) return;
    lastAlertBeepAtRef.current = now;

    try {
      if (!alertAudioRef.current) {
        alertAudioRef.current = new Audio('/alert.mp3');
        alertAudioRef.current.preload = 'auto';
      }
      alertAudioRef.current.currentTime = 0;
      void alertAudioRef.current.play().catch(() => {
        const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        gain.gain.value = 0.02;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
        window.setTimeout(() => void ctx.close(), 420);
      });
    } catch {
      // Best effort audio alert.
    }
  }, []);

  const processFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!surveyOnRef.current || !video || !canvas || detectInFlightRef.current) return;
    if (video.readyState < 2) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    const imageBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.72);
    });
    if (!imageBlob) {
      console.error('[drone] frame blob conversion failed');
      return;
    }

    detectInFlightRef.current = true;
    try {
      console.log('[drone] frame sent');
      const detection = await predictDroneFrame({ frame: imageBlob, confidence: 0.35 });
      console.log('[drone] response received', detection);

      setPeopleCount(detection.people_count);
      setBoxes(detection.boxes || []);
      setFrameSize({ width: detection.width || width, height: detection.height || height });
      setRiskLevel(detection.priority || detection.risk_level || 'LOW');

      if (detection.people_count >= 1) {
        setStatusText('Person Detected');
      } else {
        setStatusText('No Person Detected');
      }
      console.log('[drone] people_count', detection.people_count);

      if (detection.people_count >= 3) {
        console.log('[drone] red alert triggered');
        playAlertBeep();
      }

      const now = Date.now();
      const canSendRequest = detection.people_count >= 1 && now - lastRequestAtRef.current >= REQUEST_COOLDOWN_MS;
      if (canSendRequest) {
        const zone = 'Ranchi';
        const lat = 23.3441;
        const lng = 85.3096;

        await sendDroneRequest({
          zone,
          lat,
          lng,
          people_count: detection.people_count,
          priority: detection.priority || detection.risk_level || 'LOW',
          location: `Drone Survey Feed - ${zone}`,
        });

        console.log('[drone] request sent', {
          source: 'drone',
          people_count: detection.people_count,
          priority: detection.priority || detection.risk_level || 'LOW',
        });

        lastRequestAtRef.current = now;
      }
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Detection error';
      console.error('[drone] pipeline error', message);
      setErrorText(message);
      setStatusText('Detection unavailable');
    } finally {
      detectInFlightRef.current = false;
    }
  }, [playAlertBeep]);

  const startSurvey = useCallback(async () => {
    setErrorText('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      surveyOnRef.current = true;
      setSurveyOn(true);
      setCameraReady(true);
      setStatusText('Drone Surveillance Active');

      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        void processFrame();
      }, FRAME_INTERVAL_MS);

      console.log('[drone] survey started');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to access webcam';
      setErrorText(message);
      setStatusText('Camera access failed');
      stopSurvey();
    }
  }, [processFrame, stopSurvey]);

  useEffect(() => {
    return () => {
      stopSurvey();
    };
  }, [stopSurvey]);

  const hasCrowdAlert = useMemo(() => peopleCount >= 3, [peopleCount]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-xl md:text-2xl font-black tracking-wide">Drone Surveillance Active</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void startSurvey()}
              disabled={surveyOn}
              className="px-4 py-2 rounded-full font-bold text-sm bg-[#0b4ea2] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start Survey
            </button>
            <button
              onClick={stopSurvey}
              disabled={!surveyOn}
              className="px-4 py-2 rounded-full font-bold text-sm bg-[#d32f2f] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Stop Survey
            </button>
          </div>
        </div>

        <div className={`relative mx-auto w-full max-w-5xl aspect-video rounded-xl overflow-hidden border-2 ${hasCrowdAlert ? 'border-red-500' : 'border-slate-700'}`}>
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />

          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-slate-300 text-sm">
              Start Survey to activate webcam
            </div>
          )}

          {boxes.map((box, index) => {
            const left = (box.x1 / frameSize.width) * 100;
            const top = (box.y1 / frameSize.height) * 100;
            const width = ((box.x2 - box.x1) / frameSize.width) * 100;
            const height = ((box.y2 - box.y1) / frameSize.height) * 100;

            return (
              <div
                key={`${index}-${box.x1}-${box.y1}`}
                className={`absolute border-2 ${hasCrowdAlert ? 'border-red-500' : 'border-cyan-300'}`}
                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
              >
                <span className="absolute -top-6 left-0 text-[11px] px-1.5 py-0.5 rounded bg-black/80 text-white">
                  Person {(box.confidence * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}

          <div className="absolute top-2 left-2 flex flex-col gap-1 text-xs">
            <span className="px-2 py-1 rounded bg-black/70 border border-slate-500">People: {peopleCount}</span>
            <span className={`px-2 py-1 rounded border ${hasCrowdAlert ? 'bg-red-700/80 border-red-500' : 'bg-black/70 border-slate-500'}`}>
              {statusText}
            </span>
            <span className="px-2 py-1 rounded bg-black/70 border border-slate-500">Risk: {riskLevel}</span>
          </div>

          {hasCrowdAlert && (
            <div className="absolute top-2 right-2 px-3 py-1 rounded bg-red-600 text-white text-xs font-black tracking-wide animate-pulse">
              HIGH CROWD ALERT
            </div>
          )}
        </div>

        {errorText && (
          <div className="mt-4 rounded-md border border-red-500 bg-red-900/30 px-3 py-2 text-sm text-red-200">
            {errorText}
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
