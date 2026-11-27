import * as THREE from 'three';

const canvas = document.querySelector('#cyber-canvas');
const recenterBtn = document.querySelector('#recenter-btn');
const coordReadout = document.querySelector('#coord-readout');
const dockLinks = [...document.querySelectorAll('.dock-link')];

// Four equal-sized gesture experiences on a boundless seamless curved canvas,
// with 星雪圣诞树 anchored right at the center (0, 0).
const CARD_W = 0.78;
const CARD_H = 0.585;
const CARD_PAD = 1.28; // Generous transparent padding around each card so neon outer halo never clips!

const CARDS = [
  {
    id: 'christmas',
    tag: '01 · WINTER 3D / ASCII',
    title: '星雪圣诞树',
    href: './christmastree.html',
    image: './assets/card-christmas.jpg',
    accentA: '#5ce6ff',
    accentB: '#ffd480',
    x: 0.0,
    y: 0.04,
    w: CARD_W,
    h: CARD_H,
  },
  {
    id: 'comic',
    tag: '02 · COMIC FRAME',
    title: '漫画窗',
    href: './play.html?mode=comic',
    image: './assets/card-comic.jpg',
    accentA: '#3cf0ff',
    accentB: '#ff3ad6',
    x: -0.92,
    y: 0.18,
    w: CARD_W,
    h: CARD_H,
  },
  {
    id: 'magic',
    tag: '03 · MAGIC GESTURE',
    title: '魔法手势',
    href: './play.html?mode=magic',
    image: './assets/card-magic.jpg',
    accentA: '#ff9642',
    accentB: '#ff3ec4',
    x: 0.92,
    y: 0.18,
    w: CARD_W,
    h: CARD_H,
  },
  {
    id: 'audio',
    tag: '04 · SONIC WARP',
    title: '声波畸变',
    href: './play.html?mode=audio',
    image: null,
    procedural: 'sonic',
    accentA: '#a66bff',
    accentB: '#48f0ff',
    x: 0.0,
    y: -0.68,
    w: CARD_W,
    h: CARD_H,
  },
];

// Edge-to-edge convex curved CRT barrel distortion (no dark cutout rim; preserves chromatic dispersion!)
const CURVATURE = 0.135;
const BARREL_ZOOM = 1 / (1 + CURVATURE * 2.02);

function warpBarrel(nx, ny) {
  const r2 = nx * nx + ny * ny;
  const f = (1.0 + CURVATURE * r2) * BARREL_ZOOM;
  return [nx * f, ny * f];
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSonicArtwork(ctx, w, h) {
  // Deep obsidian cyber studio backdrop
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.44, 30, w * 0.5, h * 0.5, w * 0.72);
  bg.addColorStop(0, '#1a0e3d');
  bg.addColorStop(0.42, '#0c0822');
  bg.addColorStop(1, '#04030c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Misty ultraviolet & cyan neon nebula clouds
  for (const [cx, cy, r, c0, c1] of [
    [w * 0.30, h * 0.52, w * 0.42, 'rgba(154, 72, 255, 0.36)', 'rgba(154, 72, 255, 0)'],
    [w * 0.70, h * 0.46, w * 0.40, 'rgba(54, 232, 255, 0.32)', 'rgba(54, 232, 255, 0)'],
    [w * 0.52, h * 0.66, w * 0.44, 'rgba(255, 48, 200, 0.24)', 'rgba(255, 48, 200, 0)'],
  ]) {
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Concentric warped 3D neon soundwave rings with chromatic aberration split
  const centerX = w * 0.52;
  const centerY = h * 0.43;
  for (let ring = 0; ring < 9; ring++) {
    const baseR = 62 + ring * 34;
    const layers = [
      { dx: -4, color: 'rgba(255, 48, 208, 0.55)', width: 2.2 },
      { dx: 4, color: 'rgba(56, 242, 255, 0.65)', width: 2.2 },
      { dx: 0, color: ring % 2 === 0 ? 'rgba(196, 152, 255, 0.85)' : 'rgba(145, 248, 255, 0.85)', width: 1.6 },
    ];
    for (const layer of layers) {
      ctx.beginPath();
      const steps = 140;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const warp = Math.sin(a * 5 + ring * 0.8) * (7 + ring * 1.4)
          + Math.cos(a * 9 - ring * 1.3) * (3.5 + ring * 0.6);
        const rx = (baseR + warp) * 1.32;
        const ry = (baseR + warp) * 0.72;
        const x = centerX + layer.dx + Math.cos(a) * rx;
        const y = centerY + Math.sin(a) * ry;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width;
      ctx.shadowColor = layer.color;
      ctx.shadowBlur = 18;
      ctx.stroke();
    }
  }

  // Flowing horizontal luminous audio equalizer ribbons across the center
  const ribbonPalette = [
    ['rgba(72, 240, 255, 0.92)', 3.2, 0.0, 48],
    ['rgba(176, 108, 255, 0.85)', 2.6, 1.3, 38],
    ['rgba(255, 58, 214, 0.78)', 2.2, 2.5, 32],
    ['rgba(230, 248, 255, 0.95)', 1.5, 0.6, 26],
  ];
  for (const [color, width, phase, amp] of ribbonPalette) {
    ctx.beginPath();
    for (let x = 20; x <= w - 20; x += 4) {
      const t = (x - 20) / (w - 40);
      const env = Math.sin(t * Math.PI);
      const y = centerY
        + (Math.sin(t * 16 + phase) * amp
          + Math.sin(t * 37 - phase * 1.8) * amp * 0.42
          + Math.cos(t * 63 + phase) * amp * 0.18) * env * env;
      if (x === 20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    ctx.stroke();
  }

  // Holographic 21-node cyber hand silhouette reaching into the sonic field
  const handPts = [
    [0.50, 0.80],
    [0.44, 0.72], [0.39, 0.62], [0.35, 0.53], [0.32, 0.45],
    [0.45, 0.56], [0.43, 0.42], [0.42, 0.31], [0.41, 0.22],
    [0.50, 0.54], [0.50, 0.38], [0.50, 0.26], [0.50, 0.16],
    [0.55, 0.56], [0.57, 0.41], [0.58, 0.30], [0.59, 0.21],
    [0.60, 0.61], [0.64, 0.49], [0.67, 0.40], [0.69, 0.32],
  ].map(([nx, ny]) => [nx * w, ny * h]);
  const bones = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
  ];
  ctx.strokeStyle = 'rgba(130, 245, 255, 0.86)';
  ctx.lineWidth = 3.0;
  ctx.shadowColor = '#5ce6ff';
  ctx.shadowBlur = 22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, b] of bones) {
    ctx.moveTo(handPts[a][0], handPts[a][1]);
    ctx.lineTo(handPts[b][0], handPts[b][1]);
  }
  ctx.stroke();

  for (let i = 0; i < handPts.length; i++) {
    const [px, py] = handPts[i];
    const tip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
    ctx.beginPath();
    ctx.arc(px, py, tip ? 7.5 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = tip ? '#fff4fa' : '#9ceeff';
    ctx.shadowColor = tip ? '#ff4ae0' : '#5ce6ff';
    ctx.shadowBlur = tip ? 24 : 14;
    ctx.fill();
  }

  // Drifting glowing bokeh sparks
  for (let i = 0; i < 48; i++) {
    const sx = ((Math.sin(i * 91.7) * 0.5 + 0.5) * 0.88 + 0.06) * w;
    const sy = ((Math.cos(i * 53.3) * 0.5 + 0.5) * 0.72 + 0.08) * h;
    const sr = 1.4 + (i % 4) * 0.9;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = i % 3 === 0 ? '#7df4ff' : i % 3 === 1 ? '#ff70e4' : '#d2b4ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
    ctx.fill();
  }

  ctx.restore();
}

function createCardTexture(card, img) {
  const w = 960;
  const h = 720;
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');

  // Full-bleed artwork (GPU SDF handles crisp rounded corners & halo cleanly without seams)
  ctx.fillStyle = '#070612';
  ctx.fillRect(0, 0, w, h);

  ctx.save();

  if (img) {
    const imgAspect = img.naturalWidth / Math.max(1, img.naturalHeight);
    const boxAspect = w / h;
    let dw = w;
    let dh = h;
    let dx = 0;
    let dy = 0;
    if (imgAspect > boxAspect) {
      dw = h * imgAspect;
      dx = (w - dw) * 0.5;
    } else {
      dh = w / imgAspect;
      dy = (h - dh) * 0.5;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  } else if (card.procedural === 'sonic') {
    drawSonicArtwork(ctx, w, h);
  } else {
    // Rich cyber fallback gradient while artwork streams in
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.38, 30, w * 0.5, h * 0.5, w * 0.65);
    grad.addColorStop(0, `${card.accentA}55`);
    grad.addColorStop(0.5, `${card.accentB}26`);
    grad.addColorStop(1, '#080614');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Atmospheric bottom veil so large glowing title gleams cleanly
  const shade = ctx.createLinearGradient(0, h * 0.44, 0, h);
  shade.addColorStop(0, 'rgba(6, 5, 16, 0.0)');
  shade.addColorStop(0.55, 'rgba(6, 5, 16, 0.36)');
  shade.addColorStop(0.84, 'rgba(5, 4, 14, 0.78)');
  shade.addColorStop(1, 'rgba(5, 4, 14, 0.92)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  // Subtle top vignette for tag legibility
  const topShade = ctx.createLinearGradient(0, 0, 0, 128);
  topShade.addColorStop(0, 'rgba(5, 4, 14, 0.58)');
  topShade.addColorStop(1, 'rgba(5, 4, 14, 0.0)');
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, w, 128);

  // Top-left glowing index tag pill
  ctx.save();
  ctx.font = '600 22px "SF Mono", Menlo, Consolas, monospace';
  const tagWidth = ctx.measureText(card.tag).width + 38;
  drawRoundedRect(ctx, 36, 32, tagWidth, 42, 21);
  ctx.fillStyle = 'rgba(10, 8, 24, 0.56)';
  ctx.fill();
  ctx.strokeStyle = `${card.accentA}88`;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = card.accentA;
  ctx.shadowColor = card.accentA;
  ctx.shadowBlur = 12;
  ctx.textBaseline = 'middle';
  ctx.fillText(card.tag, 55, 53);
  ctx.restore();

  // Large, crisp warm-white halation Chinese title (no subtitle, no arrow)
  ctx.save();
  ctx.font = '700 88px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(5, 4, 14, 0.95)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#fff9f0';
  ctx.fillText(card.title, 44, h - 52);
  ctx.shadowColor = `${card.accentA}88`;
  ctx.shadowBlur = 12;
  ctx.fillText(card.title, 44, h - 52);
  ctx.restore();

  ctx.restore();

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createCyberHome() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x05040b, 1);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const worldScene = new THREE.Scene();
  const worldCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  worldCamera.position.z = 5;

  // Render targets for world -> bloom -> curved CRT composite
  const rtType = renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: rtType });
  sceneRT.samples = Math.min(2, renderer.capabilities.maxSamples);
  const makeSmallRT = () => new THREE.WebGLRenderTarget(1, 1, { type: rtType, depthBuffer: false });
  const bloomExtractRT = makeSmallRT();
  const bloomHRT = makeSmallRT();
  const bloomVRT = makeSmallRT();

  // 1. Boundless Seamless Cyberpunk Backdrop (volumetric neon mist + infinite cyber grid + glowing nodes)
  const bgUniforms = {
    uTime: { value: 0 },
    uPan: { value: new THREE.Vector2(0, 0) },
    uHalfSize: { value: new THREE.Vector2(1.5, 1.0) },
    uPointer: { value: new THREE.Vector2(0, 0) },
  };
  const bgMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: bgUniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.99, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2 uPan, uHalfSize, uPointer;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p = rot * p * 2.04 + vec2(1.7, 2.3);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          // Seamless world coordinate across the boundless canvas
          vec2 world = (vUv * 2.0 - 1.0) * uHalfSize + uPan;

          // Quiet, refined dark obsidian cyber backdrop so the 4 neon cards take center stage
          vec3 col = vec3(0.015, 0.013, 0.028);

          // Restrained misty violet / cyan / magenta atmospheric clouds
          vec2 fogCoord = world * 0.85;
          float mistA = fbm(fogCoord + vec2(uTime * 0.048, -uTime * 0.025));
          float mistB = fbm(fogCoord * 1.3 - vec2(uTime * 0.035, uTime * 0.045) + mistA * 0.85);
          float mist = smoothstep(0.32, 0.90, mistA * 0.55 + mistB * 0.62);

          float centerGlow = exp(-dot(world, world) * 0.72);
          float leftGlow = exp(-dot(world - vec2(-0.92, 0.18), world - vec2(-0.92, 0.18)) * 1.15);
          float rightGlow = exp(-dot(world - vec2(0.92, 0.18), world - vec2(0.92, 0.18)) * 1.15);
          float bottomGlow = exp(-dot(world - vec2(0.0, -0.68), world - vec2(0.0, -0.68)) * 1.15);
          float cursorGlow = exp(-dot(world - (uPointer + uPan), world - (uPointer + uPan)) * 3.4);

          col += vec3(0.055, 0.115, 0.185) * mist * (0.20 + 0.45 * centerGlow);
          col += vec3(0.145, 0.055, 0.215) * mist * (0.24 + 0.38 * leftGlow + 0.38 * bottomGlow);
          col += vec3(0.165, 0.055, 0.125) * mist * (0.14 + 0.38 * rightGlow);
          col += vec3(0.10, 0.20, 0.30) * cursorGlow * (0.10 + 0.16 * mist);

          // Delicate seamless infinite cyber-grid & subtle glowing nodes
          float cell = 0.28;
          vec2 g = abs(fract(world / cell - 0.5) - 0.5) * cell;
          float lineX = 1.0 - smoothstep(0.0, 0.0020, g.x);
          float lineY = 1.0 - smoothstep(0.0, 0.0020, g.y);
          float grid = max(lineX, lineY);
          float crossNode = lineX * lineY;

          float gridFade = 0.24 + 0.42 * exp(-dot(world - uPan, world - uPan) * 0.28);
          col += vec3(0.24, 0.42, 0.78) * grid * 0.075 * gridFade;
          col += vec3(0.46, 0.86, 1.0) * crossNode * 0.30 * gridFade;

          // Subtle drifting neon dust motes across the infinite canvas
          vec2 starCell = floor(world * 2.8);
          vec2 starLocal = fract(world * 2.8) - 0.5;
          float seed = hash(starCell);
          if (seed > 0.78) {
            vec2 offset = vec2(sin(uTime * 0.38 + seed * 31.0), cos(uTime * 0.32 + seed * 19.0)) * 0.24;
            float d = length(starLocal - offset);
            float pulse = 0.55 + 0.45 * sin(uTime * 2.0 + seed * 60.0);
            vec3 tint = seed > 0.90 ? vec3(0.38, 0.88, 1.0) : seed > 0.84 ? vec3(0.95, 0.36, 0.82) : vec3(0.68, 0.54, 1.0);
            col += tint * exp(-d * d * 320.0) * 0.46 * pulse;
          }

          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  bgMesh.frustumCulled = false;
  bgMesh.renderOrder = -10;
  worldScene.add(bgMesh);

  // Subtle glowing neon fiber connectors linking center 星雪圣诞树 to its 3 satellite experiences
  const linkPoints = [];
  const centerCard = CARDS[0];
  for (let i = 1; i < CARDS.length; i++) {
    linkPoints.push(centerCard.x, centerCard.y, -0.2, CARDS[i].x, CARDS[i].y, -0.2);
  }
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.Float32BufferAttribute(linkPoints, 3));
  const linkMat = new THREE.LineBasicMaterial({ color: '#58b8ff', transparent: true, opacity: 0.22 });
  worldScene.add(new THREE.LineSegments(linkGeo, linkMat));

  // 2. Build the 4 Interactive Glowing Neon Portal Cards
  const cardMeshes = CARDS.map(card => {
    const tex = createCardTexture(card, null);
    tex.anisotropy = maxAniso;
    const uniforms = {
      uMap: { value: tex },
      uTime: { value: 0 },
      uHover: { value: 0 },
      uAccentA: { value: new THREE.Color(card.accentA) },
      uAccentB: { value: new THREE.Color(card.accentB) },
      uAspect: { value: card.w / card.h },
      uFill: { value: 1 / CARD_PAD },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uMap;
        uniform float uTime, uHover, uAspect, uFill;
        uniform vec3 uAccentA, uAccentB;

        float roundedBoxSDF(vec2 p, vec2 b, float r) {
          vec2 q = abs(p) - b + vec2(r);
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
        }

        void main() {
          // Map padded quad UV to inner card UV so outer neon halo has ample room and never clips at quad edges
          vec2 cardUv = (vUv - 0.5) / uFill + 0.5;
          vec2 p = (cardUv - 0.5) * vec2(uAspect, 1.0);
          vec2 halfBox = vec2(uAspect * 0.5, 0.5);
          float dist = roundedBoxSDF(p, halfBox, 0.064);

          float inside = 1.0 - smoothstep(-0.005, 0.005, dist);
          // Smooth quad-boundary fade ensures halo reaches exact 0.000 well before the quad edge (zero square corners!)
          float quadMargin = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
          float quadFade = smoothstep(0.0, 0.11, quadMargin);
          float outerGlow = exp(-max(0.0, dist) * 20.0) * (1.0 - inside) * quadFade * (0.36 + 0.52 * uHover);

          // Animated dual-tone cyberpunk neon rim sweep
          float angle = atan(p.y, p.x);
          float sweep = 0.5 + 0.5 * sin(angle * 2.0 - uTime * 1.45);
          vec3 rimColor = mix(uAccentA, uAccentB, sweep);
          float rimLine = exp(-abs(dist) * 140.0) * (0.82 + 0.85 * uHover);

          // Subtle internal zoom & sheen on hover
          vec2 imgUv = (cardUv - 0.5) / (1.0 + uHover * 0.035) + 0.5;
          vec3 art = texture2D(uMap, clamp(imgUv, 0.002, 0.998)).rgb;

          float sheen = exp(-pow((cardUv.x * 0.85 + cardUv.y * 0.5 - 0.65 - sin(uTime * 0.9) * 0.12) * 5.2, 2.0));
          art += rimColor * sheen * (0.02 + 0.08 * uHover);
          art *= (1.0 + uHover * 0.12);

          // Non-darkening outer glow: outside the card we output pure luminous rimColor blended by outerGlow alpha
          vec3 baseCol = mix(rimColor * 1.25, art, inside);
          vec3 col = baseCol + rimColor * rimLine * 0.95;
          float alpha = clamp(inside + outerGlow + rimLine * 0.85, 0.0, 1.0);
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(col, alpha);
        }`,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(card.w * CARD_PAD, card.h * CARD_PAD), mat);
    mesh.position.set(card.x, card.y, card.id === 'christmas' ? 0.08 : 0.0);
    worldScene.add(mesh);

    // Load actual generated cyberpunk artwork asynchronously (when image path is provided)
    if (card.image) {
      const img = new Image();
      img.decoding = 'async';
      img.addEventListener('load', () => {
        const loadedTex = createCardTexture(card, img);
        loadedTex.anisotropy = maxAniso;
        uniforms.uMap.value.dispose();
        uniforms.uMap.value = loadedTex;
      });
      img.src = card.image;
    }

    return { card, mesh, uniforms, hover: 0, baseZ: mesh.position.z };
  });

  // 3. Post-processing Pipeline: Bloom Extract -> Separable Blur -> Curved CRT Glass + Halation + Chromatic Aberration + Film Grain
  const postScene = new THREE.Scene();
  const postCamera = new THREE.Camera();

  const makePostMat = (uniforms, fragmentShader) => new THREE.ShaderMaterial({
    uniforms,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
  });

  const bloomExtractMat = makePostMat({
    uImage: { value: sceneRT.texture },
  }, `
    varying vec2 vUv;
    uniform sampler2D uImage;
    void main() {
      vec3 c = texture2D(uImage, vUv).rgb;
      float peak = max(c.r, max(c.g, c.b));
      float keep = smoothstep(0.62, 1.04, peak);
      gl_FragColor = vec4(c * keep, 1.0);
    }`);

  const bloomBlurMat = makePostMat({
    uImage: { value: null },
    uStep: { value: new THREE.Vector2() },
  }, `
    varying vec2 vUv;
    uniform sampler2D uImage;
    uniform vec2 uStep;
    void main() {
      vec3 sum = texture2D(uImage, vUv).rgb * 0.19;
      sum += (texture2D(uImage, vUv + uStep * 1.4).rgb + texture2D(uImage, vUv - uStep * 1.4).rgb) * 0.25;
      sum += (texture2D(uImage, vUv + uStep * 3.2).rgb + texture2D(uImage, vUv - uStep * 3.2).rgb) * 0.125;
      sum += (texture2D(uImage, vUv + uStep * 5.2).rgb + texture2D(uImage, vUv - uStep * 5.2).rgb) * 0.03;
      gl_FragColor = vec4(sum, 1.0);
    }`);

  const crtFinalMat = makePostMat({
    uScene: { value: sceneRT.texture },
    uBloom: { value: bloomVRT.texture },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCurvature: { value: CURVATURE },
    uZoom: { value: BARREL_ZOOM },
  }, `
    varying vec2 vUv;
    uniform sampler2D uScene, uBloom;
    uniform float uTime, uCurvature, uZoom;
    uniform vec2 uResolution;

    vec2 barrelUv(vec2 uv, float extra) {
      vec2 p = uv * 2.0 - 1.0;
      float r2 = dot(p, p);
      vec2 warped = p * (1.0 + (uCurvature + extra) * r2) * uZoom;
      return warped * 0.5 + 0.5;
    }

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r2 = dot(p, p);

      // Edge-to-edge convex CRT barrel curvature + crisp chromatic dispersion toward the outer edges
      vec2 uvR = barrelUv(vUv,  0.010);
      vec2 uvG = barrelUv(vUv,  0.0);
      vec2 uvB = barrelUv(vUv, -0.010);

      vec3 sharp = vec3(
        texture2D(uScene, clamp(uvR, 0.0, 1.0)).r,
        texture2D(uScene, clamp(uvG, 0.0, 1.0)).g,
        texture2D(uScene, clamp(uvB, 0.0, 1.0)).b
      );
      vec3 glow = vec3(
        texture2D(uBloom, clamp(uvR, 0.0, 1.0)).r,
        texture2D(uBloom, clamp(uvG, 0.0, 1.0)).g,
        texture2D(uBloom, clamp(uvB, 0.0, 1.0)).b
      );

      // Image 1 halation bloom — no artificial dark edge vignette or bezel cutout
      vec3 col = sharp + glow * 0.44;

      // Subtle CRT glass reflection streak
      float glassBand = exp(-pow((p.x * 0.72 + p.y * 0.55 + 0.22) * 3.4, 2.0)) * smoothstep(-0.2, 0.9, p.y);
      col += vec3(0.36, 0.50, 0.78) * glassBand * 0.032;

      // Subtle CRT micro-scanlines & fine analog film grain
      float scan = 0.98 + 0.02 * sin(uvG.y * uResolution.y * 1.45);
      col *= scan;
      float grain = (rand(vUv * uResolution + fract(uTime * 17.3)) - 0.5) * 0.028;
      col += grain;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`);

  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bloomExtractMat);
  postQuad.frustumCulled = false;
  postScene.add(postQuad);

  function renderPostPass(mat, target) {
    postQuad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(postScene, postCamera);
  }

  // Camera & seamless pan state
  let halfW = 1.5;
  let halfH = 1.05;
  let panX = 0;
  let panY = 0;
  let targetPanX = 0;
  let targetPanY = 0;
  let velX = 0;
  let velY = 0;
  let pointerWorldX = 0;
  let pointerWorldY = 0;
  let hoveredItem = null;
  let dragging = null;

  function updateProjection() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);

    const pw = Math.max(1, Math.floor(w * dpr));
    const ph = Math.max(1, Math.floor(h * dpr));
    sceneRT.setSize(pw, ph);
    const bw = Math.max(1, Math.round(pw * 0.30));
    const bh = Math.max(1, Math.round(ph * 0.30));
    bloomExtractRT.setSize(bw, bh);
    bloomHRT.setSize(bw, bh);
    bloomVRT.setSize(bw, bh);
    crtFinalMat.uniforms.uResolution.value.set(pw, ph);

    const aspect = w / h;
    // Generous, bold card framing across both widescreen and square screens, accounting for edge-to-edge barrel zoom
    halfH = Math.max(1.16, 1.56 / Math.min(aspect, 1.36));
    halfW = halfH * aspect;
    bgUniforms.uHalfSize.value.set(halfW, halfH);

    worldCamera.left = -halfW;
    worldCamera.right = halfW;
    worldCamera.top = halfH;
    worldCamera.bottom = -halfH;
    worldCamera.updateProjectionMatrix();
  }

  new ResizeObserver(updateProjection).observe(canvas);
  updateProjection();

  // Exact un-warped barrel hit test: maps screen pointer -> virtual CRT point -> seamless world coord
  function clientToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    const [wx, wy] = warpBarrel(nx, ny);
    return [wx * halfW + panX, wy * halfH + panY, wx * halfW, wy * halfH];
  }

  function findCardAt(wx, wy) {
    // Check center card first since it sits slightly forward
    for (const item of cardMeshes) {
      const { x, y, w, h } = item.card;
      if (Math.abs(wx - x) <= w * 0.5 && Math.abs(wy - y) <= h * 0.5) return item;
    }
    return null;
  }

  function setHovered(item) {
    hoveredItem = item;
    canvas.classList.toggle('is-hovering', Boolean(item) && !dragging);
    dockLinks.forEach(link => {
      link.classList.toggle('is-active', Boolean(item) && link.dataset.card === item.card.id);
    });
  }

  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    dragging = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: 0,
      lastTime: performance.now(),
    };
    velX = 0;
    velY = 0;
    canvas.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', event => {
    const [wx, wy, localX, localY] = clientToWorld(event.clientX, event.clientY);
    pointerWorldX = localX;
    pointerWorldY = localY;

    if (dragging && dragging.id === event.pointerId) {
      const dxPx = event.clientX - dragging.lastX;
      const dyPx = event.clientY - dragging.lastY;
      dragging.lastX = event.clientX;
      dragging.lastY = event.clientY;
      dragging.moved += Math.hypot(dxPx, dyPx);

      const rect = canvas.getBoundingClientRect();
      const worldDx = -(dxPx / Math.max(1, rect.width)) * (halfW * 2);
      const worldDy = (dyPx / Math.max(1, rect.height)) * (halfH * 2);
      targetPanX += worldDx;
      targetPanY += worldDy;

      const now = performance.now();
      const dt = Math.max(0.008, (now - dragging.lastTime) / 1000);
      dragging.lastTime = now;
      velX = velX * 0.5 + (worldDx / dt) * 0.5;
      velY = velY * 0.5 + (worldDy / dt) * 0.5;
      return;
    }

    setHovered(findCardAt(wx, wy));
  });

  function endDrag(event) {
    if (!dragging || dragging.id !== event.pointerId) return;
    const wasClick = dragging.moved < 7;
    dragging = null;
    canvas.classList.remove('is-dragging');
    if (wasClick) {
      const [wx, wy] = clientToWorld(event.clientX, event.clientY);
      const hit = findCardAt(wx, wy);
      if (hit) {
        window.location.href = hit.card.href;
        return;
      }
    }
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => {
    if (!dragging) setHovered(null);
  });

  canvas.addEventListener('dblclick', () => {
    targetPanX = 0;
    targetPanY = 0;
    velX = 0;
    velY = 0;
  });

  // Trackpad two-finger scroll / mouse wheel smoothly pans the boundless canvas
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const scale = 0.0018 * halfH;
    targetPanX += event.deltaX * scale;
    targetPanY -= event.deltaY * scale;
  }, { passive: false });

  recenterBtn.addEventListener('click', () => {
    targetPanX = 0;
    targetPanY = 0;
    velX = 0;
    velY = 0;
  });

  // Hovering a quick-dock link softly pans toward & highlights that card
  dockLinks.forEach(link => {
    const match = cardMeshes.find(item => item.card.id === link.dataset.card);
    if (!match) return;
    link.addEventListener('pointerenter', () => setHovered(match));
    link.addEventListener('pointerleave', () => setHovered(null));
  });

  let prevTime = performance.now() / 1000;
  function frame(nowMs) {
    const time = nowMs / 1000;
    const dt = Math.min(0.05, Math.max(0.001, time - prevTime));
    prevTime = time;

    // Silky inertial coasting + gentle soft tether so user can explore seamlessly without getting lost
    if (!dragging) {
      targetPanX += velX * dt;
      targetPanY += velY * dt;
      const drag = Math.exp(-dt * 4.5);
      velX *= drag;
      velY *= drag;
      if (Math.hypot(velX, velY) < 0.003) velX = velY = 0;

      const maxX = 1.45;
      const maxY = 1.15;
      if (targetPanX > maxX) targetPanX += (maxX - targetPanX) * (1 - Math.exp(-dt * 6));
      if (targetPanX < -maxX) targetPanX += (-maxX - targetPanX) * (1 - Math.exp(-dt * 6));
      if (targetPanY > maxY) targetPanY += (maxY - targetPanY) * (1 - Math.exp(-dt * 6));
      if (targetPanY < -maxY) targetPanY += (-maxY - targetPanY) * (1 - Math.exp(-dt * 6));
    }

    const follow = 1 - Math.exp(-dt * 11);
    panX += (targetPanX - panX) * follow;
    panY += (targetPanY - panY) * follow;

    worldCamera.position.x = panX;
    worldCamera.position.y = panY;
    bgUniforms.uTime.value = time;
    bgUniforms.uPan.value.set(panX, panY);
    bgUniforms.uPointer.value.set(pointerWorldX, pointerWorldY);

    // Animate each card's hover neon bloom & gentle magnetic levitation
    const hoverLerp = 1 - Math.exp(-dt * 10);
    for (const item of cardMeshes) {
      const targetHover = item === hoveredItem ? 1 : 0;
      item.hover += (targetHover - item.hover) * hoverLerp;
      item.uniforms.uTime.value = time;
      item.uniforms.uHover.value = item.hover;
      const s = 1 + item.hover * 0.042;
      item.mesh.scale.set(s, s, 1);
      item.mesh.position.z = item.baseZ + item.hover * 0.14;
    }

    // Update subtle HUD coordinate & recenter chip
    const distFromCenter = Math.hypot(panX, panY);
    recenterBtn.hidden = distFromCenter < 0.28;
    const fmt = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
    coordReadout.textContent = `X ${fmt(panX)}  Y ${fmt(panY)}`;

    // 1. Render seamless cyber world
    renderer.setRenderTarget(sceneRT);
    renderer.render(worldScene, worldCamera);

    // 2. Gaussian halation bloom pass
    renderPostPass(bloomExtractMat, bloomExtractRT);
    bloomBlurMat.uniforms.uImage.value = bloomExtractRT.texture;
    bloomBlurMat.uniforms.uStep.value.set(1 / bloomExtractRT.width, 0);
    renderPostPass(bloomBlurMat, bloomHRT);
    bloomBlurMat.uniforms.uImage.value = bloomHRT.texture;
    bloomBlurMat.uniforms.uStep.value.set(0, 1 / bloomHRT.height);
    renderPostPass(bloomBlurMat, bloomVRT);

    // 3. Final curved CRT glass + chromatic aberration + analog film grain composite
    crtFinalMat.uniforms.uTime.value = time;
    renderPostPass(crtFinalMat, null);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

try {
  createCyberHome();
} catch (error) {
  console.error('Failed to initialize cyberpunk home canvas', error);
}
