import { createWinterScene } from './scene.js';
import { createGestures } from './gestures.js';
import { createHandLandmarker, createHandWorker } from './hand-tracking.js';
import { createChristmasMusic } from './music.js';

const experience = document.querySelector('#experience');
const stage = document.querySelector('#stage');
const video = document.querySelector('#feed');
const musicButton = document.querySelector('#music');
const cameraButton = document.querySelector('#camera');
const cameraLabel = document.querySelector('#camera-label');
const styleButton = document.querySelector('#style-toggle');
const styleGlyph = document.querySelector('#style-glyph');
const styleLabel = document.querySelector('#style-label');
const trackerHud = document.querySelector('#tracker-hud');
const viewfinder = document.querySelector('#viewfinder');
const handOverlay = document.querySelector('#hand-overlay');
const handContext = handOverlay.getContext('2d');
const gestureBadge = document.querySelector('#gesture-badge');
const gestureBadgeText = document.querySelector('#gesture-badge-text');
const gestureToast = document.querySelector('#gesture-toast');
const toastCaption = document.querySelector('#toast-caption');
const scatterButton = document.querySelector('#scatter');
const resetButton = document.querySelector('#reset');
const status = document.querySelector('#status');
const greeting = document.querySelector('#greeting');
const greetingText = greeting.querySelector('span');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const music = createChristmasMusic();

let scene;
let asciiMode = false;
let phase = 'unlit';
let lightStartedAt = Infinity;
let stream;
let cameraState = 'closed';
let session = 0;
let frameHandle;
let trackerPromise;
let pointer;
let greetingAnimations = [];
let badgeHoldUntil = -Infinity;
let badgeHoldState = 'none';
let badgeHoldDirection = 0;
let pendingEntryFade = true;

// First-time camera onboarding toast state
let firstCameraGuideDone = false;
let inFirstCameraSession = false;
let shownCircleToast = false;
let shownFireworksToast = false;
let toastAutoHideTimer = null;
let toastHideFinishTimer = null;
let fireworkToastDelayTimer = null;

function message(text) {
  if (status.textContent !== text) status.textContent = text;
}

function refreshMusicButton() {
  const playing = music.isPlaying();
  musicButton.setAttribute('aria-pressed', String(playing));
  const label = playing ? '关闭圣诞音乐' : '开启圣诞音乐';
  musicButton.setAttribute('aria-label', label);
  musicButton.title = label;
}

function unlockMusic() {
  if (music.isPlaying()) return;
  const fadeIn = pendingEntryFade;
  music.enable({ fadeIn }).then(started => {
    if (started) pendingEntryFade = false;
    refreshMusicButton();
  });
}

function clearToastTimers() {
  if (toastAutoHideTimer) { clearTimeout(toastAutoHideTimer); toastAutoHideTimer = null; }
  if (toastHideFinishTimer) { clearTimeout(toastHideFinishTimer); toastHideFinishTimer = null; }
  if (fireworkToastDelayTimer) { clearTimeout(fireworkToastDelayTimer); fireworkToastDelayTimer = null; }
}

function hideToast(immediate = false) {
  if (toastAutoHideTimer) { clearTimeout(toastAutoHideTimer); toastAutoHideTimer = null; }
  if (toastHideFinishTimer) { clearTimeout(toastHideFinishTimer); toastHideFinishTimer = null; }
  gestureToast.dataset.visible = 'false';
  if (immediate) {
    gestureToast.hidden = true;
    return;
  }
  toastHideFinishTimer = setTimeout(() => {
    toastHideFinishTimer = null;
    if (gestureToast.dataset.visible !== 'true') gestureToast.hidden = true;
  }, 400);
}

function showOnboardingToast(kind, durationMs = 5600) {
  if (!inFirstCameraSession || cameraState !== 'live') return;
  if (toastAutoHideTimer) { clearTimeout(toastAutoHideTimer); toastAutoHideTimer = null; }
  if (toastHideFinishTimer) { clearTimeout(toastHideFinishTimer); toastHideFinishTimer = null; }

  gestureToast.dataset.kind = kind;
  toastCaption.textContent = kind === 'circle' ? '转动指尖试试' : '握拳再张开放烟花';
  gestureToast.hidden = false;
  requestAnimationFrame(() => {
    if (!gestureToast.hidden) gestureToast.dataset.visible = 'true';
  });
  toastAutoHideTimer = setTimeout(() => {
    toastAutoHideTimer = null;
    hideToast();
  }, durationMs);
}

function maybeShowFireworksToast(delayMs = 3500) {
  if (!inFirstCameraSession || shownFireworksToast || phase !== 'lit') return;
  if (fireworkToastDelayTimer) clearTimeout(fireworkToastDelayTimer);
  fireworkToastDelayTimer = setTimeout(() => {
    fireworkToastDelayTimer = null;
    if (!inFirstCameraSession || cameraState !== 'live' || shownFireworksToast || phase !== 'lit') return;
    shownFireworksToast = true;
    showOnboardingToast('fireworks', 5800);
  }, delayMs);
}

function refreshControls() {
  scatterButton.disabled = phase === 'unlit';
}

function setAsciiMode(enabled) {
  asciiMode = enabled;
  experience.dataset.style = enabled ? 'ascii' : '3d';
  scene?.setAscii(enabled);
  styleButton.setAttribute('aria-pressed', String(enabled));
  styleGlyph.textContent = enabled ? '✧' : '#';
  styleLabel.textContent = enabled ? '3D' : 'ASCII';
  const label = enabled ? '切换回 3D 写实风格' : '切换 ASCII 风格';
  styleButton.setAttribute('aria-label', label);
  styleButton.title = label;
}

function turn(amount, velocity = 0) {
  scene.turn(amount, velocity);
  if (phase !== 'unlit') return;
  phase = 'lit';
  lightStartedAt = performance.now() / 1000;
  music.setPhase(phase);
  music.playLightUp();
  refreshControls();
  if (gestureToast.dataset.kind === 'circle' && !gestureToast.hidden) hideToast();
  maybeShowFireworksToast(3500);
}

function hideGreeting() {
  for (const animation of greetingAnimations) animation.cancel();
  greetingAnimations = [];
  greeting.hidden = true;
}

function showGreeting() {
  hideGreeting();
  greeting.hidden = false;
  const duration = 5400;
  const animation = greeting.animate([
    { opacity: 0, translate: reducedMotion.matches ? 'none' : '0 5px', offset: 0, easing: 'ease-out' },
    { opacity: 1, translate: 'none', offset: .18 },
    { opacity: 1, translate: 'none', offset: .45, easing: 'ease-in-out' },
    { opacity: 0, translate: 'none', offset: 1 },
  ], { duration, fill: 'both' });
  greetingAnimations.push(animation);
  if (!reducedMotion.matches) {
    greetingAnimations.push(greetingText.animate([
      { backgroundPosition: '0% 50%' },
      { backgroundPosition: '100% 50%' },
    ], { duration, easing: 'ease-in-out', fill: 'both' }));
  }
  animation.onfinish = () => {
    if (greetingAnimations[0] === animation) hideGreeting();
  };
}

function scatter(x) {
  if (phase === 'unlit') return;
  phase = 'snowing';
  music.setPhase(phase);
  music.playCelebrate();
  scene.celebrate(performance.now() / 1000, x);
  showGreeting();
  if (fireworkToastDelayTimer) { clearTimeout(fireworkToastDelayTimer); fireworkToastDelayTimer = null; }
  if (!gestureToast.hidden) hideToast();
  if (inFirstCameraSession) {
    shownFireworksToast = true;
    firstCameraGuideDone = true;
    inFirstCameraSession = false;
  }
}

const gestures = createGestures({
  turn,
  swipe: (amount, velocity = 0) => scene.turn(amount, velocity),
  scatter,
});

function syncOverlaySize() {
  const rect = viewfinder.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (handOverlay.width !== w || handOverlay.height !== h) {
    handOverlay.width = w;
    handOverlay.height = h;
  }
}

function clearOverlay() {
  if (!handContext) return;
  handContext.clearRect(0, 0, handOverlay.width, handOverlay.height);
}

function drawHandFeedback(hands, state) {
  if (!handContext) return;
  syncOverlaySize();
  const width = handOverlay.width;
  const height = handOverlay.height;
  handContext.clearRect(0, 0, width, height);
  if (!hands || hands.length === 0) return;

  const scale = width / 160;
  const mode = state.mode;
  const accent = mode === 'circle' || mode === 'pointing'
    ? '#f8d27c'
    : mode === 'pinch-drag' || mode === 'pinch-ready'
      ? '#84e4ff'
      : mode === 'fist'
        ? '#ffbe63'
        : mode === 'scatter'
          ? '#e8fcff'
          : '#a6c8ee';

  handContext.save();
  handContext.lineCap = 'round';
  handContext.lineJoin = 'round';
  handContext.strokeStyle = mode === 'circle' || mode === 'pinch-drag' || mode === 'fist'
    ? `${accent}8c`
    : 'rgba(176, 208, 240, 0.42)';
  handContext.lineWidth = Math.max(1, 1.3 * scale);

  for (const hand of hands) {
    handContext.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      handContext.moveTo((1 - hand[a].x) * width, hand[a].y * height);
      handContext.lineTo((1 - hand[b].x) * width, hand[b].y * height);
    }
    handContext.stroke();

    if (asciiMode) {
      handContext.fillStyle = accent;
      handContext.font = `700 ${Math.max(8, Math.round(7.5 * scale))}px "SF Mono", Menlo, monospace`;
      handContext.textAlign = 'center';
      handContext.textBaseline = 'middle';
      for (const idx of [0, 4, 8, 12, 16, 20]) {
        handContext.fillText(idx === 8 || idx === 4 ? '*' : '+', (1 - hand[idx].x) * width, hand[idx].y * height);
      }
    }
  }

  if (state.trail && state.trail.length > 1 && (mode === 'circle' || mode === 'pointing' || mode === 'pinch-drag')) {
    for (let i = 1; i < state.trail.length; i++) {
      const t = i / (state.trail.length - 1);
      const [x0, y0] = state.trail[i - 1];
      const [x1, y1] = state.trail[i];
      handContext.strokeStyle = mode === 'pinch-drag'
        ? `rgba(132, 228, 255, ${(0.12 + 0.78 * t).toFixed(2)})`
        : `rgba(248, 210, 124, ${(0.14 + 0.80 * t).toFixed(2)})`;
      handContext.lineWidth = Math.max(1.2, (1.1 + 2.4 * t) * scale);
      handContext.beginPath();
      handContext.moveTo(x0 * width, y0 * height);
      handContext.lineTo(x1 * width, y1 * height);
      handContext.stroke();
    }
  }

  const focus = mode === 'fist'
    ? state.palm
    : mode === 'pinch-drag' || mode === 'pinch-ready'
      ? state.pinch
      : state.tip;

  if (focus) {
    const fx = focus[0] * width;
    const fy = focus[1] * height;
    const radius = (mode === 'fist' ? 10 : mode === 'pinch-drag' || mode === 'pinch-ready' ? 7 : mode === 'circle' ? 5.8 : 4.2) * scale;
    const glow = handContext.createRadialGradient(fx, fy, 0, fx, fy, radius * 2.1);
    glow.addColorStop(0, `${accent}cc`);
    glow.addColorStop(0.45, `${accent}44`);
    glow.addColorStop(1, `${accent}00`);
    handContext.fillStyle = glow;
    handContext.beginPath();
    handContext.arc(fx, fy, radius * 2.1, 0, Math.PI * 2);
    handContext.fill();

    handContext.fillStyle = accent;
    handContext.beginPath();
    handContext.arc(fx, fy, Math.max(2.2, 2.8 * scale), 0, Math.PI * 2);
    handContext.fill();

    if (mode === 'pinch-drag' || mode === 'pinch-ready') {
      handContext.strokeStyle = accent;
      handContext.lineWidth = Math.max(1.2, 1.7 * scale);
      handContext.beginPath();
      handContext.arc(fx, fy, radius * 0.95, 0, Math.PI * 2);
      handContext.stroke();
    } else if (mode === 'fist') {
      handContext.strokeStyle = accent;
      handContext.lineWidth = Math.max(1.4, 1.9 * scale);
      handContext.beginPath();
      handContext.arc(fx, fy, radius * (1.3 - 0.35 * state.armedProgress), 0, Math.PI * 2);
      handContext.stroke();
    }
  }
  handContext.restore();
}

function updateGestureBadge(state, now) {
  let mode = state.mode;
  let direction = state.direction;
  if (mode === 'scatter') {
    badgeHoldState = 'scatter';
    badgeHoldDirection = 0;
    badgeHoldUntil = now + 900;
  } else if (mode === 'circle' || mode === 'pinch-drag') {
    badgeHoldState = mode;
    if (direction !== 0) badgeHoldDirection = direction;
    badgeHoldUntil = now + 180;
  } else if (mode === 'fist') {
    badgeHoldUntil = -Infinity;
  } else if (now < badgeHoldUntil && mode !== 'hand') {
    mode = badgeHoldState;
    direction = badgeHoldDirection;
  }

  const labels = {
    none: '未检测到手部',
    hand: phase === 'unlit' ? '已识别手部 · 食指画圈点灯' : '已松开 · 捏合滑动 / 握拳张开撒花',
    pointing: phase === 'unlit' ? '食指就绪 · 画圈点亮' : '食指就绪 · 画圈转动',
    circle: '食指画圈 · 转动中',
    'pinch-ready': '已捏合 · 左右滑动旋转',
    'pinch-drag': direction > 0 ? '捏合滑动 · 向左旋转' : direction < 0 ? '捏合滑动 · 向右旋转' : '捏合滑动 · 旋转中',
    fist: phase === 'unlit' ? '先用食指画圈点亮圣诞树' : '已握拳蓄力 · 张开手掌撒花',
    scatter: '烟花绽放 · 降雪中',
  };

  viewfinder.dataset.gesture = mode;
  gestureBadge.dataset.gesture = mode;
  const text = labels[mode] ?? '等待手势';
  if (gestureBadgeText.textContent !== text) gestureBadgeText.textContent = text;
}

async function loadTracker(mainThread = false) {
  if (!mainThread && typeof OffscreenCanvas === 'function' && typeof Worker === 'function' && typeof createImageBitmap === 'function') {
    try { return await createHandWorker(); }
    catch (error) { console.warn('Worker hand tracking is unavailable', error); }
  }
  return createHandLandmarker({ preferGpu: true });
}

function trackCamera(initialTracker, current) {
  let tracker = initialTracker;
  let started = -Infinity;
  let lastFrameKey = -1;
  let lastTimestamp = 0;
  let pending = false;
  const videoFrames = typeof video.requestVideoFrameCallback === 'function';

  function schedule() {
    frameHandle = videoFrames ? video.requestVideoFrameCallback(frame) : requestAnimationFrame(frame);
  }

  async function frame(now, metadata) {
    if (session !== current || cameraState !== 'live') return;
    schedule();
    const frameKey = metadata?.presentedFrames ?? video.currentTime;
    if (pending || video.readyState < 2 || now - started < 12 || frameKey === lastFrameKey) return;
    lastFrameKey = frameKey;
    started = now;
    pending = true;
    const timestamp = Math.max(Math.round(now), lastTimestamp + 1);
    lastTimestamp = timestamp;
    try {
      const result = await tracker.detectForVideo(video, timestamp);
      if (current !== session || !result) return;
      const hands = result.landmarks ?? [];
      const aspect = (video.videoWidth || 4) / (video.videoHeight || 3);
      const state = gestures.update(hands, aspect, now);
      drawHandFeedback(hands, state);
      updateGestureBadge(state, now);
    } catch (error) {
      if (current !== session) return;
      if (tracker.offThread) {
        tracker.close();
        trackerPromise = loadTracker(true);
        try {
          tracker = await trackerPromise;
          return;
        } catch (fallbackError) {
          trackerPromise = undefined;
          console.error(fallbackError);
        }
      } else console.error(error);
      if (current === session) stopCamera('手势识别中断，可重新开启摄像头。');
    } finally {
      pending = false;
    }
  }

  schedule();
}

function stopCamera(text = '') {
  session++;
  if (frameHandle !== undefined) {
    if (typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(frameHandle);
    else cancelAnimationFrame(frameHandle);
  }
  frameHandle = undefined;
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  video.pause();
  video.srcObject = null;
  trackerHud.hidden = true;
  clearOverlay();
  clearToastTimers();
  hideToast(true);
  if (inFirstCameraSession) {
    firstCameraGuideDone = true;
    inFirstCameraSession = false;
  }
  badgeHoldUntil = -Infinity;
  viewfinder.dataset.gesture = 'none';
  gestureBadge.dataset.gesture = 'none';
  gestureBadgeText.textContent = '未检测到手部';
  cameraState = 'closed';
  cameraButton.dataset.live = 'false';
  cameraLabel.textContent = '开启摄像头';
  gestures.reset();
  refreshControls();
  message(text);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    message('摄像头需要通过 localhost 或 HTTPS 打开。');
    return;
  }
  const current = ++session;
  cameraState = 'loading';
  cameraLabel.textContent = '取消开启';
  message('等待摄像头权限');

  try {
    const feed = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 60 } },
      audio: false,
    });
    if (session !== current) {
      feed.getTracks().forEach(track => track.stop());
      return;
    }
    stream = feed;
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => { if (current === session) stopCamera('摄像头已断开。'); }, { once: true });
    const settings = track.getSettings?.();
    if (settings?.width && settings?.height) viewfinder.style.aspectRatio = `${settings.width} / ${settings.height}`;
    video.srcObject = feed;
    trackerHud.hidden = false;
    await video.play();
    if (session !== current) return;
    message('正在加载手势识别');
    trackerPromise ??= loadTracker().catch(error => { trackerPromise = undefined; throw error; });
    const tracker = await trackerPromise;
    if (session !== current) return;
    cameraState = 'live';
    cameraButton.dataset.live = 'true';
    cameraLabel.textContent = '关闭摄像头';
    message('');
    refreshControls();
    trackCamera(tracker, current);

    // Show hand-drawn onboarding toast ONLY during the user's first camera activation
    if (!firstCameraGuideDone) {
      inFirstCameraSession = true;
      if (phase === 'unlit' && !shownCircleToast) {
        shownCircleToast = true;
        showOnboardingToast('circle', 5800);
      } else if (phase === 'lit' && !shownFireworksToast) {
        maybeShowFireworksToast(280);
      }
    }
  } catch (error) {
    if (session !== current) return;
    const denied = error.name === 'NotAllowedError';
    console.warn('Gesture camera unavailable', error);
    stopCamera(denied ? '摄像头权限未开启，可拖动树景试玩。' : '摄像头暂不可用，可拖动树景试玩。');
  }
}

try {
  scene = createWinterScene(stage);
  refreshControls();
  // Default music ON with gentle fade-in on initial entry; manual pause/resume plays immediately
  music.enable({ fadeIn: true }).then(started => {
    if (started) pendingEntryFade = false;
    refreshMusicButton();
    if (!started) {
      const resumeOnGesture = () => {
        unlockMusic();
        window.removeEventListener('pointerdown', resumeOnGesture, true);
        window.removeEventListener('keydown', resumeOnGesture, true);
      };
      window.addEventListener('pointerdown', resumeOnGesture, { capture: true, once: true });
      window.addEventListener('keydown', resumeOnGesture, { capture: true, once: true });
    }
  });
  musicButton.addEventListener('click', () => {
    pendingEntryFade = false;
    music.toggle().then(() => refreshMusicButton());
  });
  styleButton.addEventListener('click', () => {
    unlockMusic();
    setAsciiMode(!asciiMode);
  });
  cameraButton.addEventListener('click', () => {
    unlockMusic();
    if (cameraState === 'closed') startCamera();
    else stopCamera();
  });
  scatterButton.addEventListener('click', () => {
    unlockMusic();
    scatter(Math.random());
  });
  resetButton.addEventListener('click', () => {
    unlockMusic();
    phase = 'unlit';
    lightStartedAt = Infinity;
    music.setPhase(phase);
    scene.reset();
    gestures.reset();
    clearToastTimers();
    hideToast();
    hideGreeting();
    refreshControls();
    message('');
  });
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    unlockMusic();
    pointer = { id: event.pointerId, x: event.clientX, distance: 0 };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    pointer.x = event.clientX;
    pointer.distance += Math.abs(dx);
    if (pointer.distance > 5) turn(-dx * .008);
  });
  stage.addEventListener('lostpointercapture', () => { pointer = undefined; });
  stage.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      unlockMusic();
      turn(event.key === 'ArrowLeft' ? -.19 : .19);
    }
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      unlockMusic();
      scatter(.5);
    }
  });
  window.addEventListener('pagehide', () => {
    if (cameraState !== 'closed') stopCamera();
    music.disable();
  });
  function render(now) {
    const time = now / 1000;
    const progress = Math.max(0, Math.min(1, (time - lightStartedAt) / 3.35));
    scene.frame(time, progress * progress * (3 - 2 * progress));
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
} catch (error) {
  console.error(error);
  cameraButton.disabled = resetButton.disabled = true;
  message('当前浏览器无法显示 3D 场景。');
}
