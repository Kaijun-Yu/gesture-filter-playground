import { loadVisionBundle, prepareVisionAssets, scheduleVisionPreload } from '../vision-loader.js';

const LANDMARKER_OPTIONS = {
  runningMode: 'VIDEO',
  numHands: 1,
  minHandDetectionConfidence: 0.4,
  minHandPresenceConfidence: 0.35,
  minTrackingConfidence: 0.35,
};

let workerBlobUrls;

export function preloadHandTracking(delayMs = 800) {
  scheduleVisionPreload({ includeHand: true, includeFace: false, delayMs });
}

async function instantiateHandLandmarker(vision, files, modelAssetPath, { preferGpu = true } = {}) {
  const delegates = preferGpu ? ['GPU', 'CPU'] : ['CPU'];
  let lastError;
  for (const delegate of delegates) {
    try {
      const tracker = await vision.HandLandmarker.createFromOptions(files, {
        ...LANDMARKER_OPTIONS,
        baseOptions: { modelAssetPath, delegate },
      });
      tracker.delegate = delegate;
      return tracker;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function createHandLandmarker({ preferGpu = true, onProgress, preloaded } = {}) {
  const assets = preloaded ?? await prepareVisionAssets({ includeHand: true, onProgress });
  onProgress?.({ percent: 100, stage: 'init' });
  return instantiateHandLandmarker(assets.vision, assets.files, assets.handModelPath, { preferGpu });
}

// Used inside christmas/hand-worker.js with buffers transferred from main thread (zero worker network fetches).
export async function createHandLandmarkerFromBuffers({ wasmLoader, wasmBinary, handModel, preferGpu = true } = {}) {
  const vision = await loadVisionBundle();
  if (!workerBlobUrls) {
    if (!wasmLoader || !wasmBinary || !handModel) {
      throw new Error('Missing preloaded vision buffers');
    }
    workerBlobUrls = {
      files: {
        wasmLoaderPath: URL.createObjectURL(new Blob([wasmLoader], { type: 'text/javascript' })),
        wasmBinaryPath: URL.createObjectURL(new Blob([wasmBinary], { type: 'application/wasm' })),
      },
      modelAssetPath: URL.createObjectURL(new Blob([handModel], { type: 'application/octet-stream' })),
    };
  }
  return instantiateHandLandmarker(vision, workerBlobUrls.files, workerBlobUrls.modelAssetPath, { preferGpu });
}

async function captureFrame(video, maxWidth = 384) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width > maxWidth && height > 0) {
    const resizeWidth = maxWidth;
    const resizeHeight = Math.max(1, Math.round(height * (maxWidth / width)));
    try {
      return await createImageBitmap(video, { resizeWidth, resizeHeight, resizeQuality: 'low' });
    } catch {
      // Fall back to full-size bitmap if resize options are unsupported.
    }
  }
  return createImageBitmap(video);
}

export async function createHandWorker({ onProgress, preloaded } = {}) {
  // 1. Download/read from Cache Storage on the main thread with live progress and NO premature timeout kill.
  const assets = preloaded ?? await prepareVisionAssets({ includeHand: true, onProgress });
  onProgress?.({ percent: 100, stage: 'init' });

  // 2. Copy cached buffers for zero-network worker initialization (originals remain in main-thread cache for fallback).
  const wasmLoader = assets.rawBytes.wasmLoader.slice().buffer;
  const wasmBinary = assets.rawBytes.wasmBinary.slice().buffer;
  const handModel = assets.rawBytes.handModel.slice().buffer;

  return new Promise((resolve, reject) => {
    // The bundled WebAssembly loader uses importScripts, so the worker is classic.
    const worker = new Worker(new URL('./hand-worker.js', import.meta.url));
    let pending;
    let sending = false;
    let failure;
    let firstFrame = true;
    // Generous local-only init safety timeout (no network download happens inside the worker).
    let timeout = setTimeout(() => fail(new Error('Hand tracking worker init timed out')), 25000);

    function fail(error) {
      if (failure) return;
      failure = error;
      clearTimeout(timeout);
      worker.terminate();
      if (pending) pending.reject(error);
      reject(error);
    }

    async function detectForVideo(video, time) {
      if (failure) throw failure;
      if (sending) return null;
      sending = true;
      let bitmap;
      try {
        bitmap = await captureFrame(video);
        if (failure) throw failure;
        return await new Promise((resolveFrame, rejectFrame) => {
          pending = { resolve: resolveFrame, reject: rejectFrame };
          const frameTimeoutMs = firstFrame ? 6500 : 3500;
          timeout = setTimeout(() => fail(new Error('Hand tracking worker stalled')), frameTimeoutMs);
          try {
            worker.postMessage({ type: 'frame', bitmap, time }, [bitmap]);
            bitmap = undefined;
          } catch (error) {
            fail(error);
          }
        });
      } finally {
        bitmap?.close();
        sending = false;
      }
    }

    worker.addEventListener('error', event => fail(new Error(event.message || 'Hand tracking worker failed')));
    worker.addEventListener('messageerror', () => fail(new Error('Could not read the hand tracking result')));
    worker.addEventListener('message', ({ data }) => {
      clearTimeout(timeout);
      if (data.type === 'ready') {
        resolve({ offThread: true, detectForVideo, close: () => fail(new Error('Worker closed')) });
      } else if (data.type === 'result' && pending) {
        firstFrame = false;
        pending.resolve(data.result);
        pending = undefined;
      } else if (data.type === 'error') {
        fail(new Error(data.message));
      }
    });

    worker.postMessage(
      { type: 'init', wasmLoader, wasmBinary, handModel },
      [wasmLoader, wasmBinary, handModel],
    );
  });
}
