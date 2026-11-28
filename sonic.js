import { createAudioDistortionEngine } from './audio-fx.js';
import { coveringCrop, createComicRenderer } from './comic-gl.js';
import { createEffectsOverlay } from './effects-2d.js';
import { prepareFaceModel, prepareVisionAssets, scheduleVisionPreload } from './vision-loader.js';
import {
  buildSyntheticHand,
  computeHandFaceDistortion,
  extractFaceAnchors,
  mapLandmarksToStage,
  mapPointToStage,
} from './gestures.js';

const stage = document.querySelector('#stage');
const canvas = document.querySelector('#view');
const fxCanvas = document.querySelector('#fx-layer');
const feed = document.querySelector('#camera-feed');
const demoHandBtn = document.querySelector('#demo-hand');
const statusPill = document.querySelector('#status-pill');
const statusEl = document.querySelector('#status');
const guideBtn = document.querySelector('#guide-btn');

const sonicAsciiBar = document.querySelector('#sonic-ascii-bar');
const distortionValue = document.querySelector('#distortion-value');
const audioToggle = document.querySelector('#audio-toggle');
const audioLabel = document.querySelector('#audio-label');
const audioSourceButtons = [...document.querySelectorAll('[data-audio-source]')];
const audioFileInput = document.querySelector('#audio-file-input');
const audioSourceNote = document.querySelector('#audio-source-note');

const cameraToggle = document.querySelector('#camera-toggle');
const cameraLabel = document.querySelector('#camera-label');

const gestureToast = document.querySelector('#gesture-toast');
const toastCaption = document.querySelector('#toast-caption');

const dummyCorners = [[0, 0], [1, 0], [1, 1], [0, 1]];
const backdrop = new Image();
let demoHandPos = [0.80, 0.54];
let sourceMode = 'demo'; // 'demo' | 'loading' | 'camera'

let renderWebGL;
let fxOverlay;
const audio = createAudioDistortionEngine();

let stream;
let requestId = 0;
let handTrackerPromise;
let faceTrackerPromise;
let faceLandmarkerInstance = null;
const handProgressListeners = new Set();
let lastHandProgress = null;
let animationId = 0;
let demoAnimationId = 0;
let smoothedDistortion = 0;

let shownToastOnce = false;
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

function showOnboardingToast({ durationMs = 5200, force = false } = {}) {
  if (!force && shownToastOnce) return;
  shownToastOnce = true;
  clearToastTimers();
  toastCaption.textContent = sourceMode === 'camera'
    ? '开启声音 · 手掌远离脸部增强畸变'
    : '开启声音 · 拖动光点体验声波畸变';
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

// Anchored right on the sculptural titanium concentric acoustic disc in assets/bg-sonic.jpg
function getDemoAcousticCore(crop, aspect) {
  const center = mapPointToStage({ x: 0.50, y: 0.50 }, crop, false);
  const left = mapPointToStage({ x: 0.41, y: 0.50 }, crop, false);
  const right = mapPointToStage({ x: 0.59, y: 0.50 }, crop, false);
  const width = Math.hypot((right[0] - left[0]) * aspect, right[1] - left[1]);
  return { center, width, height: width };
}

function updateDistortionMeter(amount) {
  const clamped = Math.max(0, Math.min(1, amount));
  const pct = Math.round(clamped * 100);
  const filled = Math.round(clamped * 12);
  const bar = `[${'|'.repeat(filled)}${'·'.repeat(12 - filled)}]`;
  if (sonicAsciiBar.textContent !== bar) sonicAsciiBar.textContent = bar;
  sonicAsciiBar.dataset.level = clamped > 0.66 ? 'high' : clamped > 0.32 ? 'mid' : 'low';
  distortionValue.textContent = `${String(pct).padStart(2, '0')}%`;
}

function updateAudioUI() {
  const running = audio.isRunning();
  audioToggle.dataset.running = String(running);
  audioLabel.textContent = running ? '暂停声音' : '开启声音';

  const src = audio.getSourceType();
  audioSourceButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.audioSource === src);
  });

  if (src === 'mic') {
    audioSourceNote.textContent = running ? '麦克风实时畸变中（建议佩戴耳机）' : '麦克风实时变声（建议佩戴耳机防啸叫）';
  } else if (src === 'file') {
    const name = audio.getFileName();
    audioSourceNote.textContent = name ? `正在播放：${name}` : '点击「本地音频」选择 MP3 / WAV 文件';
  } else {
    audioSourceNote.textContent = sourceMode === 'camera'
      ? '手离脸越远，声波与画面畸变越强'
      : '拖动光点远离中心声源，声波畸变越强';
  }
}

function syncDemoHandPosition() {
  demoHandBtn.style.left = `${demoHandPos[0] * 100}%`;
  demoHandBtn.style.top = `${demoHandPos[1] * 100}%`;
}

function renderDemoStep(now = performance.now()) {
  if (!renderWebGL || !fxOverlay || !backdrop.complete || !backdrop.naturalWidth || sourceMode !== 'demo') return;
  syncSize();
  syncDemoHandPosition();

  const crop = coveringCrop(canvas.width, canvas.height, backdrop.naturalWidth, backdrop.naturalHeight);
  const aspect = canvas.width / Math.max(1, canvas.height);
  const coreAnchor = getDemoAcousticCore(crop, aspect);
  const syntheticHand = buildSyntheticHand(demoHandPos, 0.165, aspect);

  let audioDistance = computeHandFaceDistortion([syntheticHand], coreAnchor, aspect);
  smoothedDistortion += (audioDistance.distortion - smoothedDistortion) * 0.22;
  audioDistance = { ...audioDistance, distortion: smoothedDistortion, refLabel: 'CORE REF' };
  audio.setDistortion(smoothedDistortion);
  updateDistortionMeter(smoothedDistortion);

  const glitch = smoothedDistortion * (audio.isRunning() ? (0.48 + audio.getEnergy() * 0.95) : 0.48);
  showStatus(`距源 ${audioDistance.ratio.toFixed(2)}x · 畸变 ${Math.round(smoothedDistortion * 100)}%`, 'tracking');

  renderWebGL(backdrop, crop, dummyCorners, 0, false, glitch, now * 0.001, 0);

  // Sonic Warp defaults to hand skeleton nodes always ON
  fxOverlay.renderFrame({
    now,
    mode: 'audio',
    stageHands: [syntheticHand],
    faceAnchors: coreAnchor,
    audioDistance,
    waveform: audio.getWaveform(),
    audioEnergy: audio.getEnergy(),
    audioRunning: audio.isRunning(),
    showHandNodes: true,
    asciiMode: false,
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

function moveDemoHand(x, y) {
  demoHandPos = [
    Math.min(0.94, Math.max(0.06, x)),
    Math.min(0.84, Math.max(0.14, y)),
  ];
  syncDemoHandPosition();
}

function initDemoHand() {
  const offsets = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
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
  demoHandBtn.hidden = false;
  fxOverlay?.reset();
  updateAudioUI();
  showStatus(message, state);
  updateDemoLoop();
}

function startFrames({ assets, handLandmarker: initialHandLandmarker }) {
  let handLandmarker = initialHandLandmarker;
  let handFallbackPending = false;
  let faceFallbackPending = false;
  let lastInference = -Infinity;
  let lastTime = -1;
  let lastStageHands = [];
  let lastFaceAnchors = null;
  let lastAudioDistance = null;

  ensureFaceTracker();

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
            stopCamera('手势追踪中断，可重新开启');
          });
          return;
        }
        console.error(error);
        stopCamera('手势追踪中断，可重新开启');
        return;
      }

      if (faceLandmarkerInstance && !faceFallbackPending) {
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

      lastAudioDistance = computeHandFaceDistortion(lastStageHands, lastFaceAnchors, aspect);
      if (lastAudioDistance.hasHand) {
        if (!gestureToast.hidden) hideToast();
        showStatus(
          `距脸 ${lastAudioDistance.ratio.toFixed(2)}x · 畸变 ${Math.round(smoothedDistortion * 100)}%`,
          'tracking',
        );
      } else {
        showStatus('把手掌举到画面中控制声波', '');
      }
    }

    const targetDist = lastAudioDistance?.hasHand ? lastAudioDistance.distortion : 0;
    smoothedDistortion += (targetDist - smoothedDistortion) * 0.22;
    audio.setDistortion(smoothedDistortion);
    updateDistortionMeter(smoothedDistortion);

    const renderAudioDist = lastAudioDistance
      ? { ...lastAudioDistance, distortion: smoothedDistortion, refLabel: 'FACE REF' }
      : null;
    const glitch = smoothedDistortion * (audio.isRunning() ? (0.48 + audio.getEnergy() * 0.95) : 0.48);

    renderWebGL(feed, crop, dummyCorners, 0, true, glitch, now * 0.001, 0);

    fxOverlay.renderFrame({
      now,
      mode: 'audio',
      stageHands: lastStageHands,
      faceAnchors: lastFaceAnchors,
      audioDistance: renderAudioDist,
      waveform: audio.getWaveform(),
      audioEnergy: audio.getEnergy(),
      audioRunning: audio.isRunning(),
      showHandNodes: true,
      asciiMode: false,
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
  demoHandBtn.hidden = true;
  fxOverlay?.reset();
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
    renderWebGL(feed, previewCrop, dummyCorners, 0, true, 0, performance.now() * 0.001, 0);

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
    updateAudioUI();
    showStatus('举起手掌控制声波畸变', '');
    showOnboardingToast({ force: true, durationMs: 4600 });
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

async function handleAudioToggle() {
  try {
    hideToast();
    if (audio.isRunning()) {
      audio.stop();
      updateAudioUI();
      return;
    }
    const src = audio.getSourceType();
    if (src === 'file' && !audio.getFileName()) {
      audioFileInput.click();
      return;
    }
    await audio.start(src);
    updateAudioUI();
  } catch (error) {
    console.error(error);
    showStatus(error.message || '音频启动失败');
    updateAudioUI();
  }
}

async function handleAudioSourceSelect(src) {
  if (src === 'file') {
    audioFileInput.click();
    return;
  }
  try {
    await audio.start(src);
    updateAudioUI();
  } catch (error) {
    console.error(error);
    showStatus(error.message || '切换音源失败');
    updateAudioUI();
  }
}

try {
  renderWebGL = createComicRenderer(canvas);
  fxOverlay = createEffectsOverlay(fxCanvas);

  backdrop.addEventListener('load', () => {
    if (sourceMode !== 'demo') return;
    updateDemoLoop();
  });
  backdrop.addEventListener('error', () => {
    if (sourceMode === 'demo') showStatus('背景加载失败，请直接开启摄像头');
  });
  backdrop.src = './assets/bg-sonic.jpg';

  initDemoHand();
  updateAudioUI();

  new ResizeObserver(() => {
    if (sourceMode === 'demo') renderDemoStep();
  }).observe(stage);

  guideBtn.addEventListener('click', () => {
    if (gestureToast.dataset.visible === 'true') hideToast();
    else showOnboardingToast({ force: true, durationMs: 5600 });
  });

  audioToggle.addEventListener('click', handleAudioToggle);
  audioSourceButtons.forEach(btn => {
    btn.addEventListener('click', () => handleAudioSourceSelect(btn.dataset.audioSource));
  });
  audioFileInput.addEventListener('change', async () => {
    const file = audioFileInput.files?.[0];
    if (!file) return;
    try {
      await audio.loadFile(file);
      updateAudioUI();
    } catch (error) {
      console.error(error);
      showStatus('音频文件解析失败，请换一个 MP3/WAV 文件');
      updateAudioUI();
    } finally {
      audioFileInput.value = '';
    }
  });

  cameraToggle.addEventListener('click', () => {
    if (sourceMode === 'demo') startCamera();
    else stopCamera('示例画面');
  });

  setTimeout(() => showOnboardingToast({ durationMs: 5000 }), 450);

  scheduleVisionPreload({ includeHand: true, includeFace: true, delayMs: 800 });

  window.addEventListener('pagehide', () => {
    audio.stop();
    if (sourceMode !== 'demo') stopCamera();
  });

  canvas.addEventListener('webglcontextlost', () => {
    renderWebGL = undefined;
    audio.stop();
    stopCamera('图形预览已中断，请刷新页面');
    cameraToggle.disabled = true;
  });
} catch (error) {
  console.error(error);
  cameraToggle.disabled = true;
  showStatus('浏览器暂不支持 WebGL');
}
