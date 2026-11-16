/**
 * Experimental hand tracking with MediaPipe's hand landmarker, loaded on demand from the app's own
 * files (`vendor/mediapipe/`, nothing from a CDN). It runs on the camera video a few times a second
 * on the main thread and keeps the newest landmarks in a ref for the overlay. If the library or its
 * files cannot load (the artifact build ships without them), the status says so and the rest of the
 * screen carries on.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Landmark } from '../model/hands';

/** Where hand tracking is. */
export type HandStatus = 'off' | 'loading' | 'on' | 'unavailable';

/** The newest hands seen, with the time they were seen. */
export interface HandFrame {
  hands: Landmark[][];
  at: number;
}

/** Minimal shape of the landmarker used here (the library's own type is loaded lazily). */
interface Landmarker {
  detectForVideo(video: HTMLVideoElement, timestamp: number): { landmarks: Array<Array<{ x: number; y: number }>> };
  close(): void;
}

/** Hand detections per second (each costs the main thread several milliseconds). */
const RATE_HZ = 8;

/** Load the landmarker from the bundled files. */
async function loadLandmarker(): Promise<Landmarker> {
  const vision = await import('@mediapipe/tasks-vision');
  const base = new URL('vendor/mediapipe/', document.baseURI);
  const fileset = { wasmLoaderPath: new URL('wasm/vision_wasm_internal.js', base).href, wasmBinaryPath: new URL('wasm/vision_wasm_internal.wasm', base).href };
  const make = (delegate: 'GPU' | 'CPU') =>
    vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: new URL('hand_landmarker.task', base).href, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  try {
    return (await make('GPU')) as unknown as Landmarker;
  } catch {
    return (await make('CPU')) as unknown as Landmarker;
  }
}

/** Hand tracking while `enabled` and the video plays. */
export function useHands(enabled: boolean, videoRef: RefObject<HTMLVideoElement | null>): { status: HandStatus; frame: RefObject<HandFrame | null> } {
  const [status, setStatus] = useState<HandStatus>('off');
  const frame = useRef<HandFrame | null>(null);
  const landmarker = useRef<Landmarker | null>(null);
  const failed = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStatus(failed.current ? 'unavailable' : 'off');
      frame.current = null;
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastVideoTime = -1;
    const loop = () => {
      timer = setTimeout(loop, 1000 / RATE_HZ);
      const video = videoRef.current;
      const lm = landmarker.current;
      if (!video || !lm || video.paused || video.readyState < 2 || video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;
      try {
        const res = lm.detectForVideo(video, performance.now());
        frame.current = { hands: res.landmarks.map((h) => h.map((p) => ({ x: p.x, y: p.y }))), at: performance.now() };
      } catch {
        frame.current = null;
      }
    };
    const begin = () => {
      if (cancelled) return;
      setStatus('on');
      loop();
    };
    if (landmarker.current) begin();
    else {
      setStatus('loading');
      loadLandmarker().then(
        (lm) => {
          if (cancelled) {
            lm.close();
            return;
          }
          landmarker.current = lm;
          begin();
        },
        () => {
          failed.current = true;
          if (!cancelled) setStatus('unavailable');
        },
      );
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      frame.current = null;
    };
  }, [enabled, videoRef]);

  // The landmarker holds WASM memory and a GL context: free it with the screen.
  useEffect(
    () => () => {
      landmarker.current?.close();
      landmarker.current = null;
    },
    [],
  );

  return { status, frame };
}
