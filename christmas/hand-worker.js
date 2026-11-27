const trackingModule = import('./hand-tracking.js');
let trackerPromise = trackingModule.then(({ createHandLandmarker }) => createHandLandmarker({ preferGpu: true }));

function reportError(error) {
  self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
}

trackerPromise.then(() => self.postMessage({ type: 'ready' }), reportError);

self.addEventListener('message', async ({ data: { bitmap, time } }) => {
  try {
    let tracker = await trackerPromise;
    let result;
    try {
      result = tracker.detectForVideo(bitmap, time);
    } catch (error) {
      if (tracker.delegate === 'GPU') {
        tracker.close?.();
        trackerPromise = trackingModule.then(({ createHandLandmarker }) => createHandLandmarker({ preferGpu: false }));
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
