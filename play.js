import { containingCrop, coveringCrop, createComicRenderer } from './comic-gl.js';

const stage = document.querySelector('#stage');
const canvas = document.querySelector('#view');
const feed = document.querySelector('#camera-feed');
const handleLayer = document.querySelector('#handles');
const handles = [...handleLayer.children];
const status = document.querySelector('#status');
const instructions = document.querySelector('#instructions');
const sourceLabel = document.querySelector('#source-label');
const cameraToggle = document.querySelector('#camera-toggle');
const reset = document.querySelector('#reset');

const initialCorners = [[0.23, 0.27], [0.69, 0.19], [0.76, 0.68], [0.29, 0.79]];
const demoInstruction = '拖动示例画面的四个角，调整漫画滤镜的位置和形状。';
const cameraInstruction = '双手的拇指和食指各伸出一个 L 形。拉开双手，四个指尖之间就会出现漫画滤镜。';
const sample = new Image();
let demoCorners = [...initialCorners];
let render;
let stream;
let mode = 'demo';
let requestId = 0;
let trackerPromise;
let animationId = 0;

function showStatus(message, state = '') {
  if (status.textContent !== message) status.textContent = message;
  status.dataset.state = state;
}

function syncSize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const scale = Math.min(window.devicePixelRatio || 1, 1280 / width, 960 / height);
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  if (canvas.width !== outputWidth) canvas.width = outputWidth;
  if (canvas.height !== outputHeight) canvas.height = outputHeight;
}

function drawDemo() {
  if (!render || !sample.naturalWidth || mode !== 'demo') return;
  syncSize();
  const crop = coveringCrop(canvas.width, canvas.height, sample.naturalWidth, sample.naturalHeight);
  render(sample, crop, demoCorners, 1);
  handles.forEach((handle, index) => {
    handle.style.left = `${demoCorners[index][0] * 100}%`;
    handle.style.top = `${demoCorners[index][1] * 100}%`;
  });
  handleLayer.hidden = false;
}

function isConvex(corners) {
  return corners.every(([x, y], index) => {
    const [nextX, nextY] = corners[(index + 1) % 4];
    const [lastX, lastY] = corners[(index + 2) % 4];
    return (nextX - x) * (lastY - nextY) - (nextY - y) * (lastX - nextX) > 0.00025;
  });
}

function clockwise(corners) {
  const centerX = corners.reduce((sum, point) => sum + point[0], 0) / 4;
  const centerY = corners.reduce((sum, point) => sum + point[1], 0) / 4;
  return [...corners].sort((a, b) =>
    Math.atan2(a[1] - centerY, a[0] - centerX) - Math.atan2(b[1] - centerY, b[0] - centerX));
}

function moveCorner(index, x, y) {
  const clamp = value => Math.min(0.965, Math.max(0.035, value));
  const moved = [...demoCorners];
  moved[index] = [clamp(x), clamp(y)];
  if (!isConvex(moved)) return;
  demoCorners = moved;
  drawDemo();
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
}

function prepareTracker() {
  trackerPromise ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import('./vendor/vision_bundle.mjs');
    const wasm = new URL('./vendor/wasm', import.meta.url).href;
    const files = await FilesetResolver.forVisionTasks(wasm);
    return HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: new URL('./vendor/hand_landmarker.task', import.meta.url).href },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  })().catch(error => {
    trackerPromise = undefined;
    throw error;
  });
  return trackerPromise;
}

function stopCamera(message = '') {
  requestId++;
  mode = 'demo';
  cancelAnimationFrame(animationId);
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  feed.pause();
  feed.srcObject = null;
  cameraToggle.textContent = '开启摄像头';
  instructions.textContent = demoInstruction;
  sourceLabel.textContent = '示例画面';
  reset.hidden = false;
  showStatus(message);
  drawDemo();
}

function startFrames(tracker) {
  let lastInference = -Infinity;
  let lastTime = -1;
  let lastValid = -Infinity;
  let points;
  let tracked = initialCorners;
  let opacity = 0;

  function frame(now) {
    if (mode !== 'camera') return;
    animationId = requestAnimationFrame(frame);
    if (feed.readyState < 2 || !feed.videoWidth) return;

    syncSize();
    const crop = containingCrop(canvas.width, canvas.height, feed.videoWidth, feed.videoHeight);
    if (feed.currentTime !== lastTime && now - lastInference >= 44) {
      lastTime = feed.currentTime;
      lastInference = now;
      let hands;
      try {
        hands = tracker.detectForVideo(feed, now).landmarks;
      } catch (error) {
        console.error(error);
        stopCamera('手势追踪中断，可以重新开启摄像头');
        return;
      }

      let message = hands.length === 1 ? '识别到一只手，请伸出另一只手' : '把双手放进画面';
      if (hands.length === 2) {
        const raw = [...hands].sort((a, b) => b[0].x - a[0].x).flatMap(hand => [4, 8].map(index => [1 - hand[index].x, hand[index].y]));
        points = points && now - lastValid < 190 ? raw.map(([x, y], index) => [
          points[index][0] * 0.35 + x * 0.65,
          points[index][1] * 0.35 + y * 0.65,
        ]) : raw;
        const corners = clockwise(points.map(([x, y]) => [0.5 + (x - 0.5) / crop[0], 0.5 + (y - 0.5) / crop[1]]));
        if (isConvex(corners)) {
          tracked = corners;
          lastValid = now;
          message = '双手控制中';
        } else {
          message = '把拇指和食指拉开一点';
        }
      }
      showStatus(message, lastValid === now ? 'tracking' : '');
    }

    const target = now - lastValid < 140 ? 1 : 0;
    opacity += (target - opacity) * 0.28;
    render(feed, crop, tracked, opacity > 0.01 ? opacity : 0, true);
  }

  animationId = requestAnimationFrame(frame);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showStatus('摄像头需要通过 localhost 或 HTTPS 打开');
    return;
  }
  const current = ++requestId;
  mode = 'loading';
  handleLayer.hidden = true;
  reset.hidden = true;
  instructions.textContent = cameraInstruction;
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
    showStatus('正在加载手势模型');
    syncSize();
    render(feed, containingCrop(canvas.width, canvas.height, feed.videoWidth, feed.videoHeight), initialCorners, 0, true);

    const tracker = await prepareTracker();
    if (current !== requestId) return;
    mode = 'camera';
    cameraToggle.textContent = '关闭摄像头';
    showStatus('把双手放进画面');
    startFrames(tracker);
  } catch (error) {
    if (current !== requestId) return;
    console.error(error);
    const messages = {
      NotAllowedError: '摄像头权限已拒绝，可在浏览器中更改权限',
      NotFoundError: '没有找到摄像头，可以先拖动四角试玩',
      NotReadableError: '摄像头无法读取，请检查是否被其他应用占用',
    };
    stopCamera(cameraOpened ? '手势模型加载失败，可以重新开启摄像头' : (messages[error.name] ?? '摄像头开启失败，可以先试用示例画面'));
  }
}

try {
  render = createComicRenderer(canvas);
  sample.addEventListener('load', () => {
    if (mode !== 'demo') return;
    drawDemo();
    showStatus('');
  });
  sample.addEventListener('error', () => {
    if (mode === 'demo') showStatus('示例画面加载失败，可以切换到摄像头');
  });
  sample.src = './assets/sample-original.jpg';
  initHandles();
  new ResizeObserver(drawDemo).observe(stage);
  reset.addEventListener('click', () => {
    demoCorners = [...initialCorners];
    drawDemo();
  });
  cameraToggle.addEventListener('click', () => {
    if (mode === 'demo') startCamera();
    else stopCamera();
  });
  window.addEventListener('pagehide', () => {
    if (mode !== 'demo') stopCamera();
  });
  canvas.addEventListener('webglcontextlost', () => {
    render = undefined;
    stopCamera('图形预览已中断，请刷新页面');
    cameraToggle.disabled = true;
    reset.disabled = true;
    handleLayer.hidden = true;
  });
} catch (error) {
  console.error(error);
  cameraToggle.disabled = true;
  reset.hidden = true;
  showStatus('此浏览器无法使用 WebGL，请换用支持 WebGL 的浏览器');
}
