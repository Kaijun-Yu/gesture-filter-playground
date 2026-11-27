const trackingModule = import('./hand-tracking.js');
let trackerPromise;

function reportError(error) {
  self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
}

self.addEventListener('message', async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { createHandLandmarkerFromBuffers } = await trackingModule;
      trackerPromise = createHandLandmarkerFromBuffers({
        wasmLoader: data.wasmLoader,
        wasmBinary: data.wasmBinary,
        handModel: data.handModel,
        preferGpu: true,
      });
      await trackerPromise;
      self.postMessage({ type: 'ready' });
    } catch (error) {
      reportError(error);
    }
    return;
  }

  const { bitmap, time } = data;
  if (!bitmap) return;
  try {
    if (!trackerPromise) throw new Error('Hand tracker not initialized');
    let tracker = await trackerPromise;
    let result;
    try {
      result = tracker.detectForVideo(bitmap, time);
    } catch (error) {
      if (tracker.delegate === 'GPU') {
        tracker.close?.();
        trackerPromise = trackingModule.then(({ createHandLandmarkerFromBuffers }) =>
          createHandLandmarkerFromBuffers({ preferGpu: false }),
        );
        tracker = await trackerPromise;
        result = tracker.detectForVideo(bitmap, time);
      } else {
        throw error;
      }
    }
    self.postMessage({
      type: 'result',
      result: { landmarks: result.landmarks },
    });
  } catch (error) {
    reportError(error);
  } finally {
    bitmap.close();
  }
});
