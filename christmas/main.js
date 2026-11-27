import { createWinterScene } from './scene.js';
import { createGestures } from './gestures.js';
import { createHandLandmarker, createHandWorker } from './hand-tracking.js';

const stage = document.querySelector('#stage');
const video = document.querySelector('#feed');
const cameraButton = document.querySelector('#camera');
const cameraLabel = document.querySelector('#camera-label');
const viewfinder = document.querySelector('#viewfinder');
const handPoint = document.querySelector('#hand-point');
const scatterButton = document.querySelector('#scatter');
const resetButton = document.querySelector('#reset');
const instruction = document.querySelector('#gesture-instruction');
const inputHint = document.querySelector('#input-hint');
const status = document.querySelector('#status');
const greeting = document.querySelector('#greeting');
const greetingText = greeting.querySelector('span');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let scene;
let phase = 'unlit';
let lightStartedAt = Infinity;
let stream;
let cameraState = 'closed';
let session = 0;
let frameHandle;
let trackerPromise;
let pointer;
let greetingAnimations = [];

function message(text) {
  if (status.textContent !== text) status.textContent = text;
}

function refreshInstructions() {
  const unlit = phase === 'unlit';
  instruction.textContent = unlit ? '食指画圈点亮圣诞树' : '手指合拢再张开，撒出烟花和雪';
  inputHint.textContent = cameraState === 'live'
    ? '张开手掌左右划动，可转动树景'
    : unlit ? '也可拖动树景' : '拖动转动镜头，也可点「撒花」';
  scatterButton.disabled = unlit;
}

function turn(amount) {
  scene.turn(amount);
  if (phase !== 'unlit') return;
  phase = 'lit';
  lightStartedAt = performance.now() / 1000;
  refreshInstructions();
  message('圣诞树开始亮灯');
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
  scene.celebrate(performance.now() / 1000, x);
  showGreeting();
  message('烟花绽放，下雪了');
}

const gestures = createGestures({ turn, swipe: amount => scene.turn(amount), scatter });

async function loadTracker(mainThread = false) {
  if (!mainThread && typeof OffscreenCanvas === 'function' && typeof Worker === 'function' && typeof createImageBitmap === 'function') {
    try { return await createHandWorker(); }
    catch (error) { console.warn('Worker hand tracking is unavailable', error); }
  }
  return createHandLandmarker();
}

function chooseHand(hands, previous) {
  if (!previous || hands.length < 2) return hands[0];
  const distance = ({ x, y }) => Math.hypot(x - previous.x, y - previous.y);
  return distance(hands[0][0]) < distance(hands[1][0]) ? hands[0] : hands[1];
}

function trackCamera(initialTracker, current) {
  let tracker = initialTracker;
  let previousWrist;
  let lastHand = -Infinity;
  let started = -Infinity;
  let lastFrame = -1;
  let pending = false;
  const videoFrames = typeof video.requestVideoFrameCallback === 'function';

  function schedule() {
    frameHandle = videoFrames ? video.requestVideoFrameCallback(frame) : requestAnimationFrame(frame);
  }

  async function frame(now) {
    if (session !== current || cameraState !== 'live') return;
    schedule();
    if (pending || video.readyState < 2 || now - started < 34 || video.currentTime === lastFrame) return;
    lastFrame = video.currentTime;
    started = now;
    pending = true;
    try {
      const result = await tracker.detectForVideo(video, now);
      if (current !== session || !result) return;
      if (now - lastHand > 260) previousWrist = null;
      const hand = chooseHand(result.landmarks, previousWrist);
      handPoint.hidden = !hand;
      if (hand) {
        previousWrist = hand[0];
        lastHand = now;
        handPoint.style.left = `${(1 - hand[8].x) * 100}%`;
        handPoint.style.top = `${hand[8].y * 100}%`;
      }
      gestures.update(hand, video.videoWidth / video.videoHeight, now);
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
  viewfinder.hidden = true;
  handPoint.hidden = true;
  cameraState = 'closed';
  cameraLabel.textContent = '开启摄像头';
  gestures.reset();
  refreshInstructions();
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
      video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
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
    viewfinder.hidden = false;
    await video.play();
    if (session !== current) return;
    message('正在加载手势识别');
    trackerPromise ??= loadTracker().catch(error => { trackerPromise = undefined; throw error; });
    const tracker = await trackerPromise;
    if (session !== current) return;
    cameraState = 'live';
    cameraLabel.textContent = '关闭摄像头';
    message('');
    refreshInstructions();
    trackCamera(tracker, current);
  } catch (error) {
    if (session !== current) return;
    const denied = error.name === 'NotAllowedError';
    console.warn('Gesture camera unavailable', error);
    stopCamera(denied ? '摄像头权限未开启，可拖动树景试玩。' : '摄像头暂不可用，可拖动树景试玩。');
  }
}

try {
  scene = createWinterScene(stage);
  refreshInstructions();
  cameraButton.addEventListener('click', () => { if (cameraState === 'closed') startCamera(); else stopCamera(); });
  scatterButton.addEventListener('click', () => scatter(Math.random()));
  resetButton.addEventListener('click', () => {
    phase = 'unlit';
    lightStartedAt = Infinity;
    scene.reset();
    gestures.reset();
    hideGreeting();
    refreshInstructions();
    message('');
  });
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
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
      turn(event.key === 'ArrowLeft' ? -.19 : .19);
    }
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      scatter(.5);
    }
  });
  window.addEventListener('pagehide', () => { if (cameraState !== 'closed') stopCamera(); });
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
