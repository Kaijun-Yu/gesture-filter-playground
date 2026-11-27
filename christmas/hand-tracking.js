let visionPromise;

const LANDMARKER_OPTIONS = {
  runningMode: 'VIDEO',
  numHands: 1,
  minHandDetectionConfidence: 0.4,
  minHandPresenceConfidence: 0.35,
  minTrackingConfidence: 0.35,
};

export function prepareVision() {
  visionPromise ??= (async () => {
    const vision = await import('../vendor/vision_bundle.mjs');
    const wasm = new URL('../vendor/wasm', import.meta.url).href;
    return { vision, files: await vision.FilesetResolver.forVisionTasks(wasm) };
  })().catch(error => {
    visionPromise = undefined;
    throw error;
  });
  return visionPromise;
}

export async function createHandLandmarker({ preferGpu = true } = {}) {
  const { vision, files } = await prepareVision();
  const modelAssetPath = new URL('../vendor/hand_landmarker.task', import.meta.url).href;
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

export function createHandWorker() {
  return new Promise((resolve, reject) => {
    // The bundled WebAssembly loader uses importScripts, so the worker is classic.
    const worker = new Worker(new URL('./hand-worker.js', import.meta.url));
    let pending;
    let sending = false;
    let failure;
    let timeout = setTimeout(() => fail(new Error('Hand tracking worker did not start')), 12000);

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
          timeout = setTimeout(() => fail(new Error('Hand tracking worker stalled')), 3000);
          try {
            worker.postMessage({ bitmap, time }, [bitmap]);
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
      if (data.type === 'ready') resolve({ offThread: true, detectForVideo, close: () => fail(new Error('Worker closed')) });
      else if (data.type === 'result' && pending) {
        pending.resolve(data.result);
        pending = undefined;
      } else if (data.type === 'error') fail(new Error(data.message));
    });
  });
}
