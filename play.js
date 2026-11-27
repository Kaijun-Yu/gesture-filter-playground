import { createAudioDistortionEngine } from './audio-fx.js';
import { containingCrop, coveringCrop, createComicRenderer } from './comic-gl.js';
import { createEffectsOverlay } from './effects-2d.js';
import {
  buildSyntheticHand,
  clockwise,
  computeHandFaceDistortion,
  detectHeartGestures,
  detectOpenPalms,
  extractComicFramePoints,
  extractFaceAnchors,
  isConvex,
  mapLandmarksToStage,
  mapPointToStage,
} from './gestures.js';

const stage = document.querySelector('#stage');
const canvas = document.querySelector('#view');
const fxCanvas = document.querySelector('#fx-layer');
const feed = document.querySelector('#camera-feed');
const handleLayer = document.querySelector('#handles');
const handles = [...handleLayer.children];
const demoHandBtn = document.querySelector('#demo-hand');
const statusEl = document.querySelector('#status');
const modeTitle = document.querySelector('#mode-title');
const instructions = document.querySelector('#instructions');
const sourceLabel = document.querySelector('#source-label');
const cameraToggle = document.querySelector('#camera-toggle');
const resetBtn = document.querySelector('#reset');
const nodesToggle = document.querySelector('#nodes-toggle');

const modeTabs = [...document.querySelectorAll('.mode-tab')];
const panelMagic = document.querySelector('#panel-magic');
const magicDemoControls = document.querySelector('#magic-demo-controls');
const magicDemoButtons = [...document.querySelectorAll('[data-demo-magic]')];
const magicCameraBadges = document.querySelector('#magic-camera-badges');
const badgeFire = document.querySelector('#badge-fire');
const badgeHeart = document.querySelector('#badge-heart');

const panelAudio = document.querySelector('#panel-audio');
const audioToggle = document.querySelector('#audio-toggle');
const audioSourceButtons = [...document.querySelectorAll('[data-audio-source]')];
const audioFileInput = document.querySelector('#audio-file-input');
const audioSourceNote = document.querySelector('#audio-source-note');
const distortionValue = document.querySelector('#distortion-value');
const distortionBar = document.querySelector('#distortion-bar');

const initialCorners = [[0.23, 0.27], [0.69, 0.19], [0.76, 0.68], [0.29, 0.79]];
const initialDemoHand = [0.77, 0.56];

const modeCopy = {
  comic: {
    title: '漫画滤镜',
    demo: '拖动示例画面的四个角，调整漫画滤镜的位置和形状。',
    camera: '双手的拇指和食指伸出 L 形或比出取景框，双手围住的区域会实时变成带漫画描边的画面。',
  },
  magic: {
    title: '魔法手势',
    demo: '切换下方手势预览，拖动光点移动手部位置；开启摄像头可实时触发掌心大火焰与比心泡泡。',
    camera: '摊开手时掌心中心燃起火焰、双眼变成火苗眼；食指与拇指交叉比心时，指尖上方浮起柔光爱心，头顶持续飘起梦幻爱心泡泡。',
  },
  audio: {
    title: '声波畸变',
    demo: '开启声音并拖动模拟手掌远离或靠近脸部：离脸越远声音失真越强，手掌 21 个节点实时渲染。',
    camera: '开启声音并将手掌放进画面：手离脸越远，声音失真与画面畸变越强，手掌节点与声波连线实时追踪。',
  },
};

const sample = new Image();
let demoCorners = [...initialCorners];
let demoHandPos = [...initialDemoHand];
let demoMagicGesture = 'fire'; // 'fire' | 'heart'

const initialModeParam = new URLSearchParams(window.location.search).get('mode');
let activeMode = initialModeParam && Object.hasOwn(modeCopy, initialModeParam) ? initialModeParam : 'comic'; // 'comic' | 'magic' | 'audio'
let sourceMode = 'demo';  // 'demo' | 'loading' | 'camera'
let showHandNodes = false;

let renderWebGL;
let fxOverlay;
const audio = createAudioDistortionEngine();

let stream;
let requestId = 0;
let trackersPromise;
let animationId = 0;
let demoAnimationId = 0;
let smoothedDistortion = 0;

function showStatus(message, state = '') {
  if (statusEl.textContent !== message) statusEl.textContent = message;
  statusEl.dataset.state = state;
}

function syncSize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const scale = Math.min(window.devicePixelRatio || 1, 1280 / width, 960 / height);
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  if (canvas.width !== outputWidth) canvas.width = outputWidth;
  if (canvas.height !== outputHeight) canvas.height = outputHeight;
  if (fxCanvas.width !== outputWidth) fxCanvas.width = outputWidth;
  if (fxCanvas.height !== outputHeight) fxCanvas.height = outputHeight;
}

// Pre-calibrated face & eye anchors for assets/sample-original.jpg (1200x900) so demo mode is instant.
function getDemoFaceAnchors(crop, aspect) {
  const map = (x, y) => mapPointToStage({ x, y }, crop, false);
  const leftOuter = map(0.420, 0.304);
  const leftInner = map(0.483, 0.308);
  const rightInner = map(0.528, 0.304);
  const rightOuter = map(0.589, 0.292);
  const leftCenter = map(0.453, 0.304);
  const rightCenter = map(0.558, 0.296);
  const faceLeft = map(0.400, 0.355);
  const faceRight = map(0.614, 0.345);
  const forehead = map(0.498, 0.168);
  const chin = map(0.510, 0.512);
  const center = map(0.506, 0.345);
  const headTop = map(0.498, 0.155);

  const eyeWidthL = Math.hypot((leftInner[0] - leftOuter[0]) * aspect, leftInner[1] - leftOuter[1]);
  const eyeWidthR = Math.hypot((rightOuter[0] - rightInner[0]) * aspect, rightOuter[1] - rightInner[1]);
  const faceWidth = Math.hypot((faceRight[0] - faceLeft[0]) * aspect, faceRight[1] - faceLeft[1]);
  const faceHeight = Math.hypot((forehead[0] - chin[0]) * aspect, forehead[1] - chin[1]);

  return {
    leftEye: { center: leftCenter, width: eyeWidthL, height: eyeWidthL * 0.42, angle: 0.04 },
    rightEye: { center: rightCenter, width: eyeWidthR, height: eyeWidthR * 0.42, angle: -0.06 },
    center,
    forehead,
    chin,
    headTop,
    width: faceWidth,
    height: faceHeight,
  };
}

function updateDistortionMeter(amount) {
  const pct = Math.round(Math.max(0, Math.min(1, amount)) * 100);
  distortionValue.textContent = `${pct}%`;
  distortionBar.style.width = `${pct}%`;
}

function updateAudioUI() {
  const running = audio.isRunning();
  audioToggle.textContent = running ? '暂停声音' : '开启声音体验';
  audioToggle.classList.toggle('is-active', running);

  const src = audio.getSourceType();
  audioSourceButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.audioSource === src);
  });

  if (src === 'mic') {
    audioSourceNote.textContent = running ? '麦克风实时失真中（建议戴耳机）' : '实时麦克风变声（建议戴耳机防啸叫）';
  } else if (src === 'file') {
    const name = audio.getFileName();
    audioSourceNote.textContent = name ? `正在播放：${name}` : '点击「本地音频」选择音乐文件';
  } else {
    audioSourceNote.textContent = '手离脸越远，声音失真越强';
  }
}

function syncUIForMode() {
  const copy = modeCopy[activeMode];
  modeTitle.textContent = copy.title;
  instructions.textContent = sourceMode === 'demo' ? copy.demo : copy.camera;

  modeTabs.forEach(tab => {
    tab.setAttribute('aria-selected', String(tab.dataset.mode === activeMode));
  });

  panelMagic.hidden = activeMode !== 'magic';
  panelAudio.hidden = activeMode !== 'audio';

  magicDemoControls.hidden = sourceMode !== 'demo';
  magicCameraBadges.hidden = sourceMode === 'demo';
  magicDemoButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.demoMagic === demoMagicGesture);
  });

  // In audio mode, real-time hand nodes are always enabled by default.
  if (activeMode === 'audio') {
    showHandNodes = true;
    nodesToggle.checked = true;
  }

  handleLayer.hidden = !(sourceMode === 'demo' && activeMode === 'comic');
  demoHandBtn.hidden = !(sourceMode === 'demo' && (activeMode === 'magic' || activeMode === 'audio'));
  resetBtn.hidden = !(sourceMode === 'demo' && activeMode === 'comic');

  if (activeMode !== 'audio' && audio.isRunning()) {
    audio.stop();
    updateAudioUI();
  }
  if (activeMode !== 'audio') {
    smoothedDistortion = 0;
    updateDistortionMeter(0);
  }
}

function syncDemoHandlePositions() {
  handles.forEach((handle, index) => {
    handle.style.left = `${demoCorners[index][0] * 100}%`;
    handle.style.top = `${demoCorners[index][1] * 100}%`;
  });
  demoHandBtn.style.left = `${demoHandPos[0] * 100}%`;
  demoHandBtn.style.top = `${demoHandPos[1] * 100}%`;
}

function renderDemoStep(now = performance.now()) {
  if (!renderWebGL || !fxOverlay || !sample.complete || !sample.naturalWidth || sourceMode !== 'demo') return;
  syncSize();
  syncDemoHandlePositions();

  const crop = coveringCrop(canvas.width, canvas.height, sample.naturalWidth, sample.naturalHeight);
  const aspect = canvas.width / Math.max(1, canvas.height);
  const faceAnchors = getDemoFaceAnchors(crop, aspect);

  // Synthetic 21-point hand for demo mode in magic & audio modes (or when hand nodes toggled on).
  const syntheticHand = buildSyntheticHand(demoHandPos, 0.165, aspect);
  const stageHands = activeMode === 'comic'
    ? (showHandNodes ? [buildSyntheticHand([0.24, 0.44], 0.145, aspect), buildSyntheticHand([0.76, 0.44], 0.145, aspect)] : [])
    : [syntheticHand];

  let openPalms = [];
  let heartGestures = [];
  let audioDistance = null;
  let glitch = 0;

  if (activeMode === 'magic') {
    if (demoMagicGesture === 'fire') {
      openPalms = detectOpenPalms([syntheticHand], aspect);
      showStatus('预览：掌心火焰 + 火苗眼', 'tracking');
    } else {
      heartGestures = [{
        type: 'finger-heart',
        anchor: [demoHandPos[0], demoHandPos[1] - 0.11],
        scale: 0.145,
      }];
      showStatus('预览：比心浮空爱心 + 头顶爱心泡泡', 'tracking');
    }
  } else if (activeMode === 'audio') {
    audioDistance = computeHandFaceDistortion([syntheticHand], faceAnchors, aspect);
    smoothedDistortion += (audioDistance.distortion - smoothedDistortion) * 0.25;
    audioDistance = { ...audioDistance, distortion: smoothedDistortion };
    audio.setDistortion(smoothedDistortion);
    updateDistortionMeter(smoothedDistortion);
    glitch = smoothedDistortion * (audio.isRunning() ? (0.45 + audio.getEnergy() * 0.9) : 0.45);
    showStatus(`模拟手掌距脸 ${audioDistance.ratio.toFixed(2)}x · 失真 ${Math.round(smoothedDistortion * 100)}%`, 'tracking');
  } else if (statusEl.dataset.state === 'tracking') {
    showStatus('');
  }

  const comicOpacity = activeMode === 'comic' ? 1 : 0;
  renderWebGL(sample, crop, demoCorners, comicOpacity, false, glitch, now * 0.001);

  fxOverlay.renderFrame({
    now,
    mode: activeMode,
    stageHands,
    faceAnchors,
    openPalms,
    heartGestures,
    audioDistance,
    waveform: audio.getWaveform(),
    audioEnergy: audio.getEnergy(),
    audioRunning: audio.isRunning(),
    showHandNodes,
  });
}

function updateDemoLoop() {
  cancelAnimationFrame(demoAnimationId);
  demoAnimationId = 0;
  if (sourceMode !== 'demo') return;

  const needsAnimation = activeMode === 'magic' || activeMode === 'audio' || showHandNodes;
  if (!needsAnimation) {
    renderDemoStep(performance.now());
    return;
  }

  const tick = now => {
    if (sourceMode !== 'demo') return;
    renderDemoStep(now);
    demoAnimationId = requestAnimationFrame(tick);
  };
  demoAnimationId = requestAnimationFrame(tick);
}

function moveCorner(index, x, y) {
  const clampVal = value => Math.min(0.965, Math.max(0.035, value));
  const moved = [...demoCorners];
  moved[index] = [clampVal(x), clampVal(y)];
  if (!isConvex(moved)) return;
  demoCorners = moved;
  if (!demoAnimationId) renderDemoStep();
}

function moveDemoHand(x, y) {
  demoHandPos = [
    Math.min(0.94, Math.max(0.06, x)),
    Math.min(0.90, Math.max(0.12, y)),
  ];
  syncDemoHandlePositions();
}

function initHandles() {
  const offsets = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

  handles.forEach((handle, index) => {
    let drag;
    handle.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, corner: demoCorners[index] };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId) return;
      moveCorner(index,
        drag.corner[0] + (event.clientX - drag.x) / canvas.clientWidth,
        drag.corner[1] + (event.clientY - drag.y) / canvas.clientHeight);
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

  // Draggable synthetic hand for demo mode (magic + audio distortion).
  let handDrag;
  demoHandBtn.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || handDrag) return;
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

function prepareTrackers() {
  trackersPromise ??= (async () => {
    const { FilesetResolver, HandLandmarker, FaceLandmarker } = await import('./vendor/vision_bundle.mjs');
    const wasm = new URL('./vendor/wasm', import.meta.url).href;
    const files = await FilesetResolver.forVisionTasks(wasm);
    const [handLandmarker, faceLandmarker] = await Promise.all([
      HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./vendor/hand_landmarker.task', import.meta.url).href },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
      FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./vendor/face_landmarker.task', import.meta.url).href },
        runningMode: 'VIDEO',
        numFaces: 1,
      }),
    ]);
    return { handLandmarker, faceLandmarker };
  })().catch(error => {
    trackersPromise = undefined;
    throw error;
  });
  return trackersPromise;
}

function stopCamera(message = '') {
  requestId++;
  sourceMode = 'demo';
  cancelAnimationFrame(animationId);
  animationId = 0;
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  feed.pause();
  feed.srcObject = null;
  cameraToggle.textContent = '开启摄像头';
  sourceLabel.textContent = '示例画面';
  fxOverlay?.reset();
  syncUIForMode();
  showStatus(message);
  updateDemoLoop();
}

function startFrames({ handLandmarker, faceLandmarker }) {
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
  let lastAudioDistance = null;

  function frame(now) {
    if (sourceMode !== 'camera') return;
    animationId = requestAnimationFrame(frame);
    if (feed.readyState < 2 || !feed.videoWidth) return;

    syncSize();
    const crop = containingCrop(canvas.width, canvas.height, feed.videoWidth, feed.videoHeight);
    const aspect = canvas.width / Math.max(1, canvas.height);

    if (feed.currentTime !== lastTime && now - lastInference >= 36) {
      lastTime = feed.currentTime;
      lastInference = now;

      let rawHands = [];
      let rawFaces = [];
      try {
        rawHands = handLandmarker.detectForVideo(feed, now).landmarks || [];
        // Run face tracker whenever eyes/head-top/face-center are needed (magic or audio mode).
        if (activeMode === 'magic' || activeMode === 'audio') {
          rawFaces = faceLandmarker.detectForVideo(feed, now).faceLandmarks || [];
        }
      } catch (error) {
        console.error(error);
        stopCamera('手势追踪中断，可以重新开启摄像头');
        return;
      }

      lastStageHands = rawHands.map(h => mapLandmarksToStage(h, crop, true));
      if (rawFaces.length > 0) {
        lastFaceAnchors = extractFaceAnchors(rawFaces[0], crop, true, aspect);
      }

      if (activeMode === 'comic') {
        let message = rawHands.length === 1 ? '识别到一只手，请伸出另一只手' : '把双手放进画面';
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
            message = '双手控制中';
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

        if (heartOn && fireOn) showStatus('双魔法触发：掌心火焰 + 比心泡泡', 'tracking');
        else if (heartOn) showStatus('比心触发：指尖浮空爱心 + 头顶泡泡', 'tracking');
        else if (fireOn) showStatus('摊开手触发：掌心火焰 + 火苗眼', 'tracking');
        else if (rawHands.length > 0) showStatus('摊开手掌燃起火焰，或食指与拇指交叉比心');
        else showStatus('把脸和手放进画面，摊开手或比心试试');
      } else if (activeMode === 'audio') {
        lastAudioDistance = computeHandFaceDistortion(lastStageHands, lastFaceAnchors, aspect);
        if (lastAudioDistance.hasHand) {
          showStatus(
            `手掌距脸 ${lastAudioDistance.ratio.toFixed(2)}x · 失真 ${Math.round(smoothedDistortion * 100)}%`,
            'tracking',
          );
        } else {
          showStatus('把手掌举到画面中，远离脸部增强声音失真');
        }
      }
    }

    // Smooth opacity & audio distortion every 60fps animation frame.
    const comicTarget = activeMode === 'comic' && now - lastValidComic < 140 ? 1 : 0;
    comicOpacity += (comicTarget - comicOpacity) * 0.28;

    let glitch = 0;
    let renderAudioDist = null;
    if (activeMode === 'audio') {
      const targetDist = lastAudioDistance?.hasHand ? lastAudioDistance.distortion : 0;
      smoothedDistortion += (targetDist - smoothedDistortion) * 0.22;
      audio.setDistortion(smoothedDistortion);
      updateDistortionMeter(smoothedDistortion);
      if (lastAudioDistance) {
        renderAudioDist = { ...lastAudioDistance, distortion: smoothedDistortion };
      }
      glitch = smoothedDistortion * (audio.isRunning() ? (0.45 + audio.getEnergy() * 0.95) : 0.45);
    }

    renderWebGL(feed, crop, trackedCorners, comicOpacity > 0.01 ? comicOpacity : 0, true, glitch, now * 0.001);

    fxOverlay.renderFrame({
      now,
      mode: activeMode,
      stageHands: lastStageHands,
      faceAnchors: lastFaceAnchors,
      openPalms: activeMode === 'magic' ? lastOpenPalms : [],
      heartGestures: activeMode === 'magic' ? lastHeartGestures : [],
      audioDistance: renderAudioDist,
      waveform: audio.getWaveform(),
      audioEnergy: audio.getEnergy(),
      audioRunning: audio.isRunning(),
      showHandNodes,
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
  cameraToggle.textContent = '取消开启';
  showStatus('正在等待摄像头权限');
  let cameraOpened = false;

  try {
    const requestedStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
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
    sourceLabel.textContent = '摄像头';
    showStatus('正在加载手势与人脸模型');
    syncSize();
    renderWebGL(feed, containingCrop(canvas.width, canvas.height, feed.videoWidth, feed.videoHeight), initialCorners, 0, true);

    const trackers = await prepareTrackers();
    if (current !== requestId) return;
    sourceMode = 'camera';
    cameraToggle.textContent = '关闭摄像头';
    syncUIForMode();
    showStatus(activeMode === 'comic' ? '把双手放进画面' : '模型就绪，开始比划手势吧');
    startFrames(trackers);
  } catch (error) {
    if (current !== requestId) return;
    console.error(error);
    const messages = {
      NotAllowedError: '摄像头权限已拒绝，可在浏览器中更改权限',
      NotFoundError: '没有找到摄像头，可以先在示例画面中体验',
      NotReadableError: '摄像头无法读取，请检查是否被其他应用占用',
    };
    stopCamera(cameraOpened ? '视觉模型加载失败，可以重新开启摄像头' : (messages[error.name] ?? '摄像头开启失败，可以先试用示例画面'));
  }
}

function setMode(nextMode) {
  if (activeMode === nextMode) return;
  activeMode = nextMode;
  fxOverlay?.reset();
  syncUIForMode();
  if (sourceMode === 'demo') {
    updateDemoLoop();
  }
}

async function handleAudioToggle() {
  try {
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

  sample.addEventListener('load', () => {
    if (sourceMode !== 'demo') return;
    showStatus('');
    updateDemoLoop();
  });
  sample.addEventListener('error', () => {
    if (sourceMode === 'demo') showStatus('示例画面加载失败，可以切换到摄像头');
  });
  sample.src = './assets/sample-original.jpg';

  initHandles();
  syncUIForMode();
  updateAudioUI();

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
      updateDemoLoop();
    });
  });

  nodesToggle.addEventListener('change', () => {
    showHandNodes = nodesToggle.checked;
    if (sourceMode === 'demo') updateDemoLoop();
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

  resetBtn.addEventListener('click', () => {
    demoCorners = [...initialCorners];
    renderDemoStep();
  });

  cameraToggle.addEventListener('click', () => {
    if (sourceMode === 'demo') startCamera();
    else stopCamera();
  });

  window.addEventListener('pagehide', () => {
    audio.stop();
    if (sourceMode !== 'demo') stopCamera();
  });

  canvas.addEventListener('webglcontextlost', () => {
    renderWebGL = undefined;
    audio.stop();
    stopCamera('图形预览已中断，请刷新页面');
    cameraToggle.disabled = true;
    resetBtn.disabled = true;
    handleLayer.hidden = true;
    demoHandBtn.hidden = true;
  });
} catch (error) {
  console.error(error);
  cameraToggle.disabled = true;
  resetBtn.hidden = true;
  showStatus('此浏览器无法使用 WebGL，请换用支持 WebGL 的浏览器');
}
