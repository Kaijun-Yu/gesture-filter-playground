import { coveringCrop, createComicRenderer } from './comic-gl.js';
import { createEffectsOverlay } from './effects-2d.js';
import { prepareFaceModel, prepareVisionAssets, scheduleVisionPreload } from './vision-loader.js';
import {
  buildSyntheticHand,
  clockwise,
  detectHeartGestures,
  detectOpenPalms,
  extractComicFramePoints,
  extractFaceAnchors,
  isConvex,
  mapLandmarksToStage,
} from './gestures.js';

// Redirect legacy ?mode=audio links smoothly to the dedicated standalone Sonic Warp page.
const initialModeParam = new URLSearchParams(window.location.search).get('mode');
if (initialModeParam === 'audio') {
  window.location.replace('./sonic.html');
}

const experience = document.querySelector('#experience');
const stage = document.querySelector('#stage');
const canvas = document.querySelector('#view');
const fxCanvas = document.querySelector('#fx-layer');
const feed = document.querySelector('#camera-feed');
const handleLayer = document.querySelector('#handles');
const handles = [...handleLayer.children];
const demoHandBtn = document.querySelector('#demo-hand');
const statusPill = document.querySelector('#status-pill');
const statusEl = document.querySelector('#status');
const retroCoord = document.querySelector('#retro-coord');
const guideBtn = document.querySelector('#guide-btn');

const modeTabs = [...document.querySelectorAll('.mode-tab')];
const subrowComic = document.querySelector('#subrow-comic');
const subrowMagicDemo = document.querySelector('#subrow-magic-demo');
const subrowMagicLive = document.querySelector('#subrow-magic-live');
const magicDemoButtons = [...document.querySelectorAll('[data-demo-magic]')];
const badgeFire = document.querySelector('#badge-fire');
const badgeHeart = document.querySelector('#badge-heart');

const cameraToggle = document.querySelector('#camera-toggle');
const cameraLabel = document.querySelector('#camera-label');
const resetBtn = document.querySelector('#reset');

const gestureToast = document.querySelector('#gesture-toast');
const toastCaption = document.querySelector('#toast-caption');

// Framed right over the sculptural retro-futurist centerpiece in assets/bg-comic.jpg
const initialCorners = [[0.23, 0.27], [0.74, 0.24], [0.76, 0.72], [0.25, 0.75]];
const initialDemoHand = [0.50, 0.62];

// Dedicated minimalist retro-futurist studio backdrops for each mode (no awkward close-up faces)
const comicBackdrop = new Image();
const magicBackdrop = new Image();

let demoCorners = [...initialCorners];
let demoHandPos = [...initialDemoHand];
let demoMagicGesture = 'fire'; // 'fire' | 'heart'

let activeMode = initialModeParam === 'magic' ? 'magic' : 'comic'; // 'comic' | 'magic'
let sourceMode = 'demo'; // 'demo' | 'loading' | 'camera'

let renderWebGL;
let fxOverlay;
let stream;
let requestId = 0;
let handTrackerPromise;
let faceTrackerPromise;
let faceLandmarkerInstance = null;
const handProgressListeners = new Set();
let lastHandProgress = null;
let animationId = 0;
let demoAnimationId = 0;

const shownModeToast = { comic: false, magic: false };
let toastAutoHideTimer = null;
let toastHideFinishTimer = null;

function showStatus(message, state = '') {
  const visible = Boolean(message) && (state === 'loading' || state === 'error');
  statusPill.hidden = !visible;
  if (visible && statusEl.textContent !== message) statusEl.textContent = message;
  statusPill.dataset.state = state;
}

function clearToastTimers() {
  if (toastAutoHideTimer) { clearTimeout(toastAutoHideTimer); toastAutoHideTimer = null; }
  if (toastHideFinishTimer) { clearTimeout(toastHideFinishTimer); toastHideFinishTimer = null; }
}

function hideToast(immediate = false) {
  clearToastTimers();
  gestureToast.dataset.visible = 'false';
  if (immediate) {
    gestureToast.hidden = true;
    return;
  }
  toastHideFinishTimer = setTimeout(() => {
    toastHideFinishTimer = null;
    if (gestureToast.dataset.visible !== 'true') gestureToast.hidden = true;
  }, 380);
}

function showOnboardingToast(kind, { durationMs = 5200, force = false } = {}) {
  if (!force && shownModeToast[kind]) return;
  shownModeToast[kind] = true;
  clearToastTimers();

  gestureToast.dataset.kind = kind;
  if (kind === 'comic') {
    toastCaption.textContent = sourceMode === 'camera'
      ? '双手拇指与食指比出 L 形取景框'
      : '拖动四角试玩 · 开摄像头双手比框';
  } else {
    toastCaption.textContent = sourceMode === 'camera'
      ? '摊开手燃火焰 · 交叉比心飘泡泡'
      : '拖动光点试玩 · 开摄像头触发魔法';
  }

  gestureToast.hidden = false;
  requestAnimationFrame(() => {
    if (!gestureToast.hidden) gestureToast.dataset.visible = 'true';
  });
  toastAutoHideTimer = setTimeout(() => {
    toastAutoHideTimer = null;
    hideToast();
  }, durationMs);
}

function syncSize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const scale = Math.min(dpr, 1440 / width, 1080 / height);
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  if (canvas.width !== outputWidth) canvas.width = outputWidth;
  if (canvas.height !== outputHeight) canvas.height = outputHeight;
  if (fxCanvas.width !== outputWidth) fxCanvas.width = outputWidth;
  if (fxCanvas.height !== outputHeight) fxCanvas.height = outputHeight;
}

function syncUIForMode() {
  experience.dataset.mode = activeMode;
  if (retroCoord) {
    retroCoord.textContent = activeMode === 'comic' ? '[ MODE // COMIC ]' : '[ MODE // MAGIC ]';
  }

  modeTabs.forEach(tab => {
    tab.setAttribute('aria-selected', String(tab.dataset.mode === activeMode));
  });

  subrowComic.hidden = !(sourceMode === 'demo' && activeMode === 'comic');
  subrowMagicDemo.hidden = !(sourceMode === 'demo' && activeMode === 'magic');
  subrowMagicLive.hidden = !(sourceMode === 'camera' && activeMode === 'magic');

  magicDemoButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.demoMagic === demoMagicGesture);
  });

  handleLayer.hidden = !(sourceMode === 'demo' && activeMode === 'comic');
  demoHandBtn.hidden = !(sourceMode === 'demo' && activeMode === 'magic');
}

function syncDemoHandlePositions() {
  handles.forEach((handle, index) => {
    handle.style.left = `${demoCorners[index][0] * 100}%`;
    handle.style.top = `${demoCorners[index][1] * 100}%`;
  });
  demoHandBtn.style.left = `${demoHandPos[0] * 100}%`;
  demoHandBtn.style.top = `${demoHandPos[1] * 100}%`;
}

function getDemoBackdrop() {
  return activeMode === 'magic' ? magicBackdrop : comicBackdrop;
}

function renderDemoStep(now = performance.now()) {
  const bg = getDemoBackdrop();
  if (!renderWebGL || !fxOverlay || !bg.complete || !bg.naturalWidth || sourceMode !== 'demo') return;
  syncSize();
  syncDemoHandlePositions();

  const crop = coveringCrop(canvas.width, canvas.height, bg.naturalWidth, bg.naturalHeight);
  const aspect = canvas.width / Math.max(1, canvas.height);

  let openPalms = [];
  let heartGestures = [];
  let demoFaceAnchors = null;

  if (activeMode === 'magic') {
    const syntheticHand = buildSyntheticHand(demoHandPos, 0.175, aspect);
    if (demoMagicGesture === 'fire') {
      // Showcase pure roaring volumetric palm fire cleanly in the dark minimalist alcove (no disembodied eyes)
      openPalms = detectOpenPalms([syntheticHand], aspect);
      showStatus('示例 · 掌心火焰', 'tracking');
    } else {
      heartGestures = [{
        type: 'finger-heart',
        anchor: [demoHandPos[0], demoHandPos[1] - 0.08],
        scale: 0.155,
      }];
      // Let dreamy translucent bubbles rise organically above the floating heart
      demoFaceAnchors = {
        headTop: [demoHandPos[0], Math.max(0.22, demoHandPos[1] - 0.16)],
        width: 0.24,
        height: 0.34,
      };
      showStatus('示例 · 比心泡泡', 'tracking');
    }
  } else {
    showStatus('示例 · 拖动四角', '');
  }

  const comicOpacity = activeMode === 'comic' ? 1 : 0;
  renderWebGL(bg, crop, demoCorners, comicOpacity, false, 0, now * 0.001, 0);

  fxOverlay.renderFrame({
    now,
    mode: activeMode,
    stageHands: [],
    faceAnchors: demoFaceAnchors,
    openPalms,
    heartGestures,
    showHandNodes: false,
    asciiMode: false,
    comicCorners: activeMode === 'comic' ? demoCorners : null,
  });
}

function updateDemoLoop() {
  cancelAnimationFrame(demoAnimationId);
  demoAnimationId = 0;
  if (sourceMode !== 'demo') return;

  const tick = now => {
    if (sourceMode !== 'demo') return;
    renderDemoStep(now);
    demoAnimationId = requestAnimationFrame(tick);
  };
  demoAnimationId = requestAnimationFrame(tick);
}

function moveCorner(index, x, y) {
  const clampVal = value => Math.min(0.95, Math.max(0.05, value));
  const moved = [...demoCorners];
  moved[index] = [clampVal(x), clampVal(y)];
  if (!isConvex(moved)) return;
  demoCorners = moved;
}

function moveDemoHand(x, y) {
  demoHandPos = [
    Math.min(0.90, Math.max(0.10, x)),
    Math.min(0.84, Math.max(0.20, y)),
  ];
  syncDemoHandlePositions();
}

function initHandles() {
  const offsets = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

  handles.forEach((handle, index) => {
    let drag;
    handle.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      hideToast();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, corner: demoCorners[index] };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId) return;
      moveCorner(
        index,
        drag.corner[0] + (event.clientX - drag.x) / canvas.clientWidth,
        drag.corner[1] + (event.clientY - drag.y) / canvas.clientHeight,
      );
    });
    handle.addEventListener('lostpointercapture', event => {
      if (drag?.id === event.pointerId) drag = undefined;
    });
    handle.addEventListener('keydown', event => {
      if (!Object.hasOwn(offsets, event.key)) return;
      event.preventDefault();
      const [dx, dy] = offsets[event.key];
      const step = event.shiftKey ? 0.035 : 0.012;
      moveCorner(index, demoCorners[index][0] + dx * step, demoCorners[index][1] + dy * step);
    });
  });

  let handDrag;
  demoHandBtn.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || handDrag) return;
    hideToast();
    handDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: [...demoHandPos] };
    demoHandBtn.setPointerCapture(event.pointerId);
  });
  demoHandBtn.addEventListener('pointermove', event => {
    if (handDrag?.id !== event.pointerId) return;
    moveDemoHand(
      handDrag.start[0] + (event.clientX - handDrag.x) / canvas.clientWidth,
      handDrag.start[1] + (event.clientY - handDrag.y) / canvas.clientHeight,
    );
  });
  demoHandBtn.addEventListener('lostpointercapture', event => {
    if (handDrag?.id === event.pointerId) handDrag = undefined;
  });
  demoHandBtn.addEventListener('keydown', event => {
    if (!Object.hasOwn(offsets, event.key)) return;
    event.preventDefault();
    const [dx, dy] = offsets[event.key];
    const step = event.shiftKey ? 0.04 : 0.016;
    moveDemoHand(demoHandPos[0] + dx * step, demoHandPos[1] + dy * step);
  });
}

function notifyHandProgress(info) {
  lastHandProgress = info;
  for (const listener of handProgressListeners) {
    try { listener(info); } catch {}
  }
}

async function createLandmarkerWithFallback(LandmarkerClass, files, options, preferGpu = true) {
  const delegates = preferGpu ? ['GPU', 'CPU'] : ['CPU'];
  let lastError;
  for (const delegate of delegates) {
    try {
      const instance = await LandmarkerClass.createFromOptions(files, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate },
      });
      instance.delegate = delegate;
      return instance;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function prepareHandTracker(onProgress) {
  if (onProgress) {
    handProgressListeners.add(onProgress);
    if (lastHandProgress) onProgress(lastHandProgress);
  }
  handTrackerPromise ??= (async () => {
    const assets = await prepareVisionAssets({
      includeHand: true,
      includeFace: false,
      onProgress: notifyHandProgress,
    });
    notifyHandProgress({ percent: 100, stage: 'init' });
    const handLandmarker = await createLandmarkerWithFallback(
      assets.vision.HandLandmarker,
      assets.files,
      {
        baseOptions: { modelAssetPath: assets.handModelPath },
        runningMode: 'VIDEO',
        numHands: 2,
      },
      true,
    );
    return { assets, handLandmarker };
  })().catch(error => {
    handTrackerPromise = undefined;
    lastHandProgress = null;
    throw error;
  });

  if (!onProgress) return handTrackerPromise;
  return handTrackerPromise.finally(() => {
    handProgressListeners.delete(onProgress);
  });
}

function ensureFaceTracker() {
  if (faceLandmarkerInstance) return Promise.resolve(faceLandmarkerInstance);
  faceTrackerPromise ??= (async () => {
    const { assets } = await prepareHandTracker();
    const { faceModelPath } = await prepareFaceModel();
    const faceLandmarker = await createLandmarkerWithFallback(
      assets.vision.FaceLandmarker,
      assets.files,
      {
        baseOptions: { modelAssetPath: faceModelPath },
        runningMode: 'VIDEO',
        numFaces: 1,
      },
      true,
    );
    faceLandmarkerInstance = faceLandmarker;
    return faceLandmarker;
  })().catch(error => {
    console.warn('Face tracker lazy init unavailable', error);
    faceTrackerPromise = undefined;
    return null;
  });
  return faceTrackerPromise;
}

function stopCamera(message = '', state = '') {
  requestId++;
  sourceMode = 'demo';
  cancelAnimationFrame(animationId);
  animationId = 0;
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  feed.pause();
  feed.srcObject = null;
  cameraToggle.dataset.live = 'false';
  cameraLabel.textContent = '开启摄像头';
  fxOverlay?.reset();
  syncUIForMode();
  showStatus(message, state);
  updateDemoLoop();
}

function startFrames({ assets, handLandmarker: initialHandLandmarker }) {
  let handLandmarker = initialHandLandmarker;
  let handFallbackPending = false;
  let faceFallbackPending = false;
  let lastInference = -Infinity;
  let lastTime = -1;
  let lastValidComic = -Infinity;
  let comicPoints;
  let trackedCorners = initialCorners;
  let comicOpacity = 0;

  let lastStageHands = [];
  let lastFaceAnchors = null;
  let lastOpenPalms = [];
  let lastHeartGestures = [];
  let heartStreak = 0;
  let lastFireDetected = -Infinity;
  let lastHeartDetected = -Infinity;

  if (activeMode === 'magic') ensureFaceTracker();

  function frame(now) {
    if (sourceMode !== 'camera') return;
    animationId = requestAnimationFrame(frame);
    if (feed.readyState < 2 || !feed.videoWidth) return;

    syncSize();
    const crop = coveringCrop(canvas.width, canvas.height, feed.videoWidth, feed.videoHeight);
    const aspect = canvas.width / Math.max(1, canvas.height);

    if (feed.currentTime !== lastTime && now - lastInference >= 36 && !handFallbackPending) {
      lastTime = feed.currentTime;
      lastInference = now;

      let rawHands = [];
      let rawFaces = [];
      try {
        rawHands = handLandmarker.detectForVideo(feed, now).landmarks || [];
      } catch (error) {
        if (handLandmarker.delegate === 'GPU') {
          handFallbackPending = true;
          handLandmarker.close?.();
          createLandmarkerWithFallback(
            assets.vision.HandLandmarker,
            assets.files,
            { baseOptions: { modelAssetPath: assets.handModelPath }, runningMode: 'VIDEO', numHands: 2 },
            false,
          ).then(cpuTracker => {
            handLandmarker = cpuTracker;
            handTrackerPromise = Promise.resolve({ assets, handLandmarker: cpuTracker });
            handFallbackPending = false;
          }).catch(fallbackError => {
            console.error(fallbackError);
            handFallbackPending = false;
            stopCamera('手势追踪中断，可重新开启摄像头');
          });
          return;
        }
        console.error(error);
        stopCamera('手势追踪中断，可重新开启摄像头');
        return;
      }

      if (activeMode === 'magic' && faceLandmarkerInstance && !faceFallbackPending) {
        try {
          rawFaces = faceLandmarkerInstance.detectForVideo(feed, now).faceLandmarks || [];
        } catch (faceError) {
          if (faceLandmarkerInstance.delegate === 'GPU') {
            faceFallbackPending = true;
            const prev = faceLandmarkerInstance;
            faceLandmarkerInstance = null;
            prev.close?.();
            prepareFaceModel().then(({ faceModelPath }) =>
              createLandmarkerWithFallback(
                assets.vision.FaceLandmarker,
                assets.files,
                { baseOptions: { modelAssetPath: faceModelPath }, runningMode: 'VIDEO', numFaces: 1 },
                false,
              ),
            ).then(cpuFace => {
              faceLandmarkerInstance = cpuFace;
              faceFallbackPending = false;
            }).catch(() => {
              faceFallbackPending = false;
            });
          } else {
            console.warn('Face tracking frame error', faceError);
          }
        }
      }

      lastStageHands = rawHands.map(h => mapLandmarksToStage(h, crop, true));
      if (rawFaces.length > 0) {
        lastFaceAnchors = extractFaceAnchors(rawFaces[0], crop, true, aspect);
      }

      if (activeMode === 'comic') {
        let message = rawHands.length === 1 ? '识别到一只手，请伸出另一只手' : '请将双手放入画面比框';
        if (rawHands.length === 2) {
          const raw = extractComicFramePoints(rawHands);
          comicPoints = comicPoints && now - lastValidComic < 190
            ? raw.map(([x, y], index) => [
              comicPoints[index][0] * 0.35 + x * 0.65,
              comicPoints[index][1] * 0.35 + y * 0.65,
            ])
            : raw;
          const corners = clockwise(comicPoints.map(([x, y]) => [0.5 + (x - 0.5) / crop[0], 0.5 + (y - 0.5) / crop[1]]));
          if (isConvex(corners)) {
            trackedCorners = corners;
            lastValidComic = now;
            message = '双手漫画框追踪中';
            if (!gestureToast.hidden) hideToast();
          } else {
            message = '把拇指和食指拉开一点';
          }
        }
        showStatus(message, lastValidComic === now ? 'tracking' : '');
      } else if (activeMode === 'magic') {
        const palms = detectOpenPalms(lastStageHands, aspect);
        const hearts = detectHeartGestures(lastStageHands, aspect);

        if (palms.length > 0) {
          lastOpenPalms = palms;
          lastFireDetected = now;
        } else if (now - lastFireDetected > 180) {
          lastOpenPalms = [];
        }

        if (hearts.length > 0) {
          heartStreak++;
          if (heartStreak >= 2 || now - lastHeartDetected < 320) {
            lastHeartGestures = hearts;
            lastHeartDetected = now;
          }
        } else {
          heartStreak = 0;
          if (now - lastHeartDetected > 280) {
            lastHeartGestures = [];
          }
        }

        const fireOn = lastOpenPalms.length > 0;
        const heartOn = lastHeartGestures.length > 0;
        badgeFire.classList.toggle('active', fireOn);
        badgeHeart.classList.toggle('active', heartOn);
        if ((fireOn || heartOn) && !gestureToast.hidden) hideToast();

        if (heartOn && fireOn) showStatus('掌心火焰 + 比心泡泡', 'tracking');
        else if (heartOn) showStatus('比心触发 · 爱心泡泡', 'tracking');
        else if (fireOn) showStatus('摊开手触发 · 掌心火焰', 'tracking');
        else if (rawHands.length > 0) showStatus('摊开手掌或比心试试', '');
        else showStatus('请把脸和手放进画面', '');
      }
    }

    const comicTarget = activeMode === 'comic' && now - lastValidComic < 140 ? 1 : 0;
    comicOpacity += (comicTarget - comicOpacity) * 0.28;

    renderWebGL(feed, crop, trackedCorners, comicOpacity > 0.01 ? comicOpacity : 0, true, 0, now * 0.001, 0);

    // Comic & Magic pages default to NO hand skeleton nodes
    fxOverlay.renderFrame({
      now,
      mode: activeMode,
      stageHands: lastStageHands,
      faceAnchors: lastFaceAnchors,
      openPalms: activeMode === 'magic' ? lastOpenPalms : [],
      heartGestures: activeMode === 'magic' ? lastHeartGestures : [],
      showHandNodes: false,
      asciiMode: false,
      comicCorners: activeMode === 'comic' && comicOpacity > 0.15 ? trackedCorners : null,
    });
  }

  animationId = requestAnimationFrame(frame);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showStatus('摄像头需要通过 localhost 或 HTTPS 打开');
    return;
  }
  const current = ++requestId;
  sourceMode = 'loading';
  cancelAnimationFrame(demoAnimationId);
  demoAnimationId = 0;
  fxOverlay?.reset();
  syncUIForMode();
  cameraLabel.textContent = '取消开启';
  showStatus('正在请求摄像头权限…', 'loading');
  let cameraOpened = false;

  try {
    const requestedStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    if (current !== requestId) {
      requestedStream.getTracks().forEach(track => track.stop());
      return;
    }
    stream = requestedStream;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (current === requestId) stopCamera('摄像头已断开');
    }, { once: true });
    feed.srcObject = stream;
    await feed.play();
    if (current !== requestId) return;
    cameraOpened = true;
    showStatus('准备手势识别模型…', 'loading');
    syncSize();
    const previewCrop = coveringCrop(canvas.width, canvas.height, feed.videoWidth, feed.videoHeight);
    renderWebGL(feed, previewCrop, initialCorners, 0, true, 0, performance.now() * 0.001, 0);

    const trackerBundle = await prepareHandTracker(({ percent, stage }) => {
      if (current !== requestId || sourceMode !== 'loading') return;
      showStatus(
        stage === 'init' || percent >= 100
          ? '正在初始化手势引擎…'
          : `加载手势模型 ${percent}%`,
        'loading',
      );
    });
    if (current !== requestId) return;
    sourceMode = 'camera';
    cameraToggle.dataset.live = 'true';
    cameraLabel.textContent = '关闭摄像头';
    syncUIForMode();
    showStatus(activeMode === 'comic' ? '双手比出取景框' : '摊开手或比心试试', '');
    showOnboardingToast(activeMode, { force: true, durationMs: 4600 });
    startFrames(trackerBundle);
  } catch (error) {
    if (current !== requestId) return;
    console.error(error);
    const messages = {
      NotAllowedError: '摄像头权限未开启',
      NotFoundError: '未检测到摄像头',
      NotReadableError: '摄像头被其他应用占用',
    };
    stopCamera(cameraOpened ? '手势模型加载失败，可重试' : (messages[error.name] ?? '摄像头开启失败'), 'error');
  }
}

function setMode(nextMode) {
  if (activeMode === nextMode || (nextMode !== 'comic' && nextMode !== 'magic')) return;
  activeMode = nextMode;
  fxOverlay?.reset();
  syncUIForMode();
  if (sourceMode === 'camera' && nextMode === 'magic') {
    ensureFaceTracker();
  }
  const url = new URL(window.location.href);
  url.searchParams.set('mode', activeMode);
  window.history.replaceState(null, '', url);
  showOnboardingToast(activeMode, { durationMs: 4800 });
}

try {
  renderWebGL = createComicRenderer(canvas);
  fxOverlay = createEffectsOverlay(fxCanvas);

  const onBackdropReady = () => {
    if (sourceMode === 'demo' && !demoAnimationId) updateDemoLoop();
  };
  comicBackdrop.addEventListener('load', onBackdropReady);
  magicBackdrop.addEventListener('load', onBackdropReady);
  comicBackdrop.src = './assets/bg-comic.jpg';
  magicBackdrop.src = './assets/bg-magic.jpg';

  initHandles();
  syncUIForMode();

  new ResizeObserver(() => {
    if (sourceMode === 'demo') renderDemoStep();
  }).observe(stage);

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  });

  magicDemoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      demoMagicGesture = btn.dataset.demoMagic;
      fxOverlay.reset();
      syncUIForMode();
    });
  });

  guideBtn.addEventListener('click', () => {
    if (gestureToast.dataset.visible === 'true') hideToast();
    else showOnboardingToast(activeMode, { force: true, durationMs: 5600 });
  });

  resetBtn.addEventListener('click', () => {
    demoCorners = [...initialCorners];
  });

  cameraToggle.addEventListener('click', () => {
    if (sourceMode === 'demo') startCamera();
    else stopCamera('示例画面');
  });

  setTimeout(() => showOnboardingToast(activeMode, { durationMs: 5000 }), 450);

  scheduleVisionPreload({ includeHand: true, includeFace: activeMode === 'magic', delayMs: 800 });

  window.addEventListener('pagehide', () => {
    if (sourceMode !== 'demo') stopCamera();
  });

  canvas.addEventListener('webglcontextlost', () => {
    renderWebGL = undefined;
    stopCamera('图形预览已中断，请刷新页面');
    cameraToggle.disabled = true;
  });
} catch (error) {
  console.error(error);
  cameraToggle.disabled = true;
  showStatus('浏览器暂不支持 WebGL');
}
