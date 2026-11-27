const CACHE_NAME = 'gesture-vision-v1';

const ASSET_SIZES = {
  'vision_wasm_internal.js': 322044,
  'vision_wasm_internal.wasm': 11153617,
  'vision_wasm_nosimd_internal.js': 321847,
  'vision_wasm_nosimd_internal.wasm': 10481398,
  'hand_landmarker.task': 7819105,
  'face_landmarker.task': 3758596,
};

let visionBundlePromise;
let cachePromise;
const memoryBuffers = new Map();
const inFlight = new Map();
const blobUrls = new Map();

function filenameOf(url) {
  try {
    return new URL(url, import.meta.url).pathname.split('/').pop() || '';
  } catch {
    return String(url).split('/').pop() || '';
  }
}

function expectedBytesFor(url, fallback = 1) {
  return ASSET_SIZES[filenameOf(url)] ?? fallback;
}

function openVisionCache() {
  if (typeof caches === 'undefined') return Promise.resolve(null);
  cachePromise ??= caches.open(CACHE_NAME).catch(() => null);
  return cachePromise;
}

export function loadVisionBundle() {
  visionBundlePromise ??= import('./vendor/vision_bundle.mjs').catch(error => {
    visionBundlePromise = undefined;
    throw error;
  });
  return visionBundlePromise;
}

function notifyEntry(entry) {
  for (const listener of entry.listeners) {
    try {
      listener(entry.loaded, entry.total);
    } catch {}
  }
}

export async function fetchCachedAsset(url, { mimeType = 'application/octet-stream', expectedBytes, onProgress } = {}) {
  const key = new URL(url, import.meta.url).href;
  const fallbackTotal = expectedBytes || expectedBytesFor(key, 1);

  const cachedMem = memoryBuffers.get(key);
  if (cachedMem) {
    onProgress?.(cachedMem.byteLength, cachedMem.byteLength);
    return cachedMem;
  }

  let entry = inFlight.get(key);
  if (entry) {
    if (onProgress) {
      entry.listeners.add(onProgress);
      onProgress(entry.loaded, entry.total);
    }
    try {
      return await entry.promise;
    } finally {
      if (onProgress) entry.listeners.delete(onProgress);
    }
  }

  entry = {
    loaded: 0,
    total: fallbackTotal,
    listeners: new Set(onProgress ? [onProgress] : []),
    promise: null,
  };
  inFlight.set(key, entry);
  notifyEntry(entry);

  entry.promise = (async () => {
    // 1. Try persistent Cache Storage first (near-instant on repeat visits or after homepage preload)
    const cache = await openVisionCache();
    if (cache) {
      try {
        const hit = await cache.match(key);
        if (hit && hit.ok) {
          const buf = await hit.arrayBuffer();
          const minValid = expectedBytes ? Math.floor(expectedBytes * 0.9) : 1;
          if (buf.byteLength >= minValid) {
            const bytes = new Uint8Array(buf);
            memoryBuffers.set(key, bytes);
            entry.loaded = bytes.byteLength;
            entry.total = bytes.byteLength;
            notifyEntry(entry);
            return bytes;
          }
        }
      } catch {}
    }

    // 2. Stream from network with accurate monotonic byte progress
    const response = await fetch(key, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${filenameOf(key)} (${response.status})`);
    }

    const contentEncoding = response.headers.get('content-encoding');
    const contentLength = Number(response.headers.get('content-length') || 0);
    // When CDN applies gzip/br, Content-Length is compressed while reader emits decompressed bytes.
    entry.total = (!contentEncoding && contentLength > 0)
      ? contentLength
      : (expectedBytes || contentLength || fallbackTotal);
    notifyEntry(entry);

    let bytes;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      let lastNotify = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          chunks.push(value);
          received += value.byteLength;
          entry.loaded = Math.min(received, entry.total);
          const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (now - lastNotify >= 45) {
            lastNotify = now;
            notifyEntry(entry);
          }
        }
      }
      bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } else {
      bytes = new Uint8Array(await response.arrayBuffer());
    }

    memoryBuffers.set(key, bytes);
    entry.loaded = bytes.byteLength;
    entry.total = bytes.byteLength;
    notifyEntry(entry);

    // 3. Persist uncompressed bytes into Cache Storage for instant future visits
    if (cache) {
      try {
        await cache.put(key, new Response(bytes, {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Content-Length': String(bytes.byteLength),
          },
        }));
      } catch {}
    }

    return bytes;
  })();

  try {
    return await entry.promise;
  } finally {
    inFlight.delete(key);
    if (onProgress) entry.listeners.delete(onProgress);
  }
}

export function getReusableBlobUrl(key, bytes, mimeType) {
  let url = blobUrls.get(key);
  if (!url) {
    url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    blobUrls.set(key, url);
  }
  return url;
}

export async function prepareVisionAssets({ includeHand = true, includeFace = false, onProgress } = {}) {
  const vision = await loadVisionBundle();
  const wasmDir = new URL('./vendor/wasm', import.meta.url).href;
  const rawFiles = await vision.FilesetResolver.forVisionTasks(wasmDir);

  const tasks = [
    {
      id: 'wasmLoader',
      url: rawFiles.wasmLoaderPath,
      mimeType: 'text/javascript',
      expectedBytes: expectedBytesFor(rawFiles.wasmLoaderPath, 322044),
    },
    {
      id: 'wasmBinary',
      url: rawFiles.wasmBinaryPath,
      mimeType: 'application/wasm',
      expectedBytes: expectedBytesFor(rawFiles.wasmBinaryPath, 11153617),
    },
  ];

  if (includeHand) {
    const handUrl = new URL('./vendor/hand_landmarker.task', import.meta.url).href;
    tasks.push({
      id: 'handModel',
      url: handUrl,
      mimeType: 'application/octet-stream',
      expectedBytes: expectedBytesFor(handUrl, 7819105),
    });
  }

  if (includeFace) {
    const faceUrl = new URL('./vendor/face_landmarker.task', import.meta.url).href;
    tasks.push({
      id: 'faceModel',
      url: faceUrl,
      mimeType: 'application/octet-stream',
      expectedBytes: expectedBytesFor(faceUrl, 3758596),
    });
  }

  const state = tasks.map(task => ({ loaded: 0, total: task.expectedBytes }));
  let lastPercent = -1;

  function emitAggregate() {
    if (!onProgress) return;
    let loaded = 0;
    let total = 0;
    for (const s of state) {
      loaded += s.loaded;
      total += s.total;
    }
    const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    if (percent !== lastPercent) {
      lastPercent = percent;
      onProgress({ loaded, total, percent, stage: percent >= 100 ? 'init' : 'download' });
    }
  }

  emitAggregate();

  const buffers = await Promise.all(tasks.map((task, idx) =>
    fetchCachedAsset(task.url, {
      mimeType: task.mimeType,
      expectedBytes: task.expectedBytes,
      onProgress: (loaded, total) => {
        state[idx].loaded = loaded;
        state[idx].total = Math.max(1, total);
        emitAggregate();
      },
    }),
  ));

  const byId = Object.fromEntries(tasks.map((task, idx) => [task.id, { task, bytes: buffers[idx] }]));
  const files = {
    wasmLoaderPath: getReusableBlobUrl(byId.wasmLoader.task.url, byId.wasmLoader.bytes, 'text/javascript'),
    wasmBinaryPath: getReusableBlobUrl(byId.wasmBinary.task.url, byId.wasmBinary.bytes, 'application/wasm'),
  };

  const handModelPath = byId.handModel
    ? getReusableBlobUrl(byId.handModel.task.url, byId.handModel.bytes, 'application/octet-stream')
    : null;
  const faceModelPath = byId.faceModel
    ? getReusableBlobUrl(byId.faceModel.task.url, byId.faceModel.bytes, 'application/octet-stream')
    : null;

  return {
    vision,
    files,
    handModelPath,
    faceModelPath,
    rawBytes: {
      wasmLoader: byId.wasmLoader.bytes,
      wasmBinary: byId.wasmBinary.bytes,
      handModel: byId.handModel?.bytes ?? null,
      faceModel: byId.faceModel?.bytes ?? null,
    },
  };
}

export async function prepareFaceModel({ onProgress } = {}) {
  const faceUrl = new URL('./vendor/face_landmarker.task', import.meta.url).href;
  const expectedBytes = expectedBytesFor(faceUrl, 3758596);
  const bytes = await fetchCachedAsset(faceUrl, {
    mimeType: 'application/octet-stream',
    expectedBytes,
    onProgress: onProgress
      ? (loaded, total) => onProgress({
        loaded,
        total,
        percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
        stage: loaded >= total ? 'init' : 'download',
      })
      : undefined,
  });
  return {
    faceModelPath: getReusableBlobUrl(faceUrl, bytes, 'application/octet-stream'),
    bytes,
  };
}

let preloadScheduled = false;

export function scheduleVisionPreload({ includeHand = true, includeFace = false, delayMs = 900 } = {}) {
  if (preloadScheduled) return;
  if (typeof navigator !== 'undefined' && navigator.connection?.saveData) return;
  preloadScheduled = true;

  const start = () => {
    // Prioritize WASM + hand model first; optionally warm face model afterwards without competing for bandwidth.
    prepareVisionAssets({ includeHand, includeFace: false })
      .then(() => {
        if (includeFace) return prepareFaceModel();
      })
      .catch(() => {
        // Silent background preload; errors will be surfaced if the user actually starts the camera.
        preloadScheduled = false;
      });
  };

  const scheduleIdle = () => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(start, { timeout: 2500 });
    } else {
      start();
    }
  };

  setTimeout(scheduleIdle, delayMs);
}
