const landmarker = import('./hand-tracking.js').then(({ createHandLandmarker }) => createHandLandmarker());

function reportError(error) {
  self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
}

landmarker.then(() => self.postMessage({ type: 'ready' }), reportError);

self.addEventListener('message', async ({ data: { bitmap, time } }) => {
  try {
    const tracker = await landmarker;
    const result = tracker.detectForVideo(bitmap, time);
    self.postMessage({
      type: 'result',
      result: {
        landmarks: result.landmarks,
        worldLandmarks: result.worldLandmarks,
        handednesses: result.handednesses ?? result.handedness,
      },
    });
  } catch (error) {
    reportError(error);
  } finally {
    bitmap.close();
  }
});
