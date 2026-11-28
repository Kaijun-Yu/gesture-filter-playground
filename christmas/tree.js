import * as THREE from 'three';
import { addFrostLights, addSpiral, addStarBeams, addStarFlare } from './lights.js';
import { buildFoliage } from './foliage.js';

const TAU = Math.PI * 2;

export function seededRandom(seed = 9731) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function glowTexture() {
  const canvas = Object.assign(document.createElement('canvas'), { width: 96, height: 96 });
  const context = canvas.getContext('2d');
  const glow = context.createRadialGradient(48, 48, 0, 48, 48, 48);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(.12, 'rgba(255,255,255,.83)');
  glow.addColorStop(.37, 'rgba(255,255,255,.21)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 96, 96);
  return new THREE.CanvasTexture(canvas);
}

export function contactShadowTexture() {
  const size = 128;
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  // Soft rounded-box contact ambient occlusion matching rectangular gift footprints
  for (let y = 0; y < size; y++) {
    const ny = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const nx = (x / (size - 1)) * 2 - 1;
      const qx = Math.max(0, Math.abs(nx) - 0.56);
      const qy = Math.max(0, Math.abs(ny) - 0.56);
      const dist = Math.hypot(qx, qy);
      const alpha = Math.max(0, Math.min(1, Math.exp(-dist * dist * 16.5) * (1 - Math.max(0, (dist - 0.34) / 0.14))));
      const idx = (y * size + x) * 4;
      data[idx] = 4;
      data[idx + 1] = 10;
      data[idx + 2] = 22;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function addOrnaments(group, ornaments, random) {
  const globe = new THREE.SphereGeometry(1, 22, 15);
  const drop = new THREE.LatheGeometry([[0, -1.40], [.25, -1.08], [.66, -.61], [.81, -.17], [.78, .29], [.59, .65], [.25, 1.00], [0, 1.07]]
    .map(([x, y]) => new THREE.Vector2(x, y)), 13);
  const band = new THREE.TorusGeometry(1, .028, 5, 24);
  const cap = new THREE.CylinderGeometry(.205, .25, .25, 10);
  const hardware = new THREE.MeshStandardMaterial({ color: '#cfb88c', metalness: .72, roughness: .28, envMapIntensity: 1.4 });
  const finishes = [
    ['#325a8d', .65, .22], ['#c7dde9', .50, .24], ['#c0a071', .74, .31], ['#6a92ab', .44, .27], ['#736b9d', .48, .28],
  ].map(([color, metalness, roughness]) => new THREE.MeshPhysicalMaterial({
    color, metalness, roughness, clearcoat: .56, clearcoatRoughness: .23, envMapIntensity: 1.45,
  }));
  const threads = [];
  ornaments.forEach(([x, y, z, level], index) => {
    const finial = index % 5 === 0;
    const size = (.088 + random() * .071 + (index % 8 === 4 ? .022 : 0)) * (1 - level * .29);
    const ornament = new THREE.Mesh(finial ? drop : globe, finishes[index % finishes.length]);
    ornament.position.set(x * 1.045, y - size - .059 - random() * .077, z * 1.045);
    ornament.scale.setScalar(size);
    ornament.rotation.y = random() * TAU;
    ornament.castShadow = true;
    ornament.receiveShadow = true;
    const collar = new THREE.Mesh(cap, hardware);
    collar.scale.setScalar(size);
    collar.position.copy(ornament.position);
    collar.position.y += size * (finial ? 1.03 : .98);
    threads.push(x, y, z, collar.position.x, collar.position.y + size * .12, collar.position.z);
    group.add(ornament, collar);
    if (!finial && index % 3 === 1) {
      const trim = new THREE.Mesh(band, hardware);
      trim.position.copy(ornament.position);
      trim.rotation.set(Math.PI / 2 + (random() - .5) * .38, .12, .13);
      trim.scale.setScalar(size);
      group.add(trim);
    }
  });
  const cords = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(threads, 3));
  group.add(new THREE.LineSegments(cords, new THREE.LineBasicMaterial({ color: '#998663' })));
}

function addGifts(group, glow) {
  const boxes = [
    [-1.53, 1.11, .68, .56, .57, '#25456f', '#bcd4ea', .19],
    [-1.96, .54, .46, .35, .43, '#294f78', '#dfc498', -.16],
    [.92, 1.44, .79, .38, .63, '#718698', '#ead4ab', -.21],
    [1.52, .91, .51, .65, .48, '#264167', '#bccfdc', .31],
    [1.79, .39, .45, .26, .39, '#2c4f75', '#ddc498', -.25],
  ];
  const contactMap = contactShadowTexture();
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  const contactMaterial = new THREE.MeshBasicMaterial({ map: contactMap, opacity: .62, transparent: true, depthWrite: false });
  // Subtle ambient occlusion pool directly under the dense spruce base
  const treeAo = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({ map: glow, color: '#020814', opacity: .44, transparent: true, depthWrite: false }));
  treeAo.position.set(0.18, -.011, -0.22);
  treeAo.rotation.x = -Math.PI / 2;
  treeAo.scale.set(5.4, 5.4, 1);
  treeAo.renderOrder = -4;
  group.add(treeAo);

  for (const [x, z, w, h, d, paper, ribbon, angle] of boxes) {
    // Tight rectangular contact occlusion right beneath the box edges
    const contact = new THREE.Mesh(shadowGeometry, contactMaterial);
    contact.position.set(x + .035, -.004, z - .042);
    contact.rotation.set(-Math.PI / 2, 0, angle);
    contact.scale.set(w * 1.48, d * 1.48, 1);
    contact.renderOrder = -2;
    group.add(contact);

    const gift = new THREE.Group();
    gift.position.set(x, h * .5, z);
    gift.rotation.y = angle;
    const wrap = new THREE.MeshStandardMaterial({ color: paper, roughness: .55, metalness: .08 });
    const trim = new THREE.MeshStandardMaterial({ color: ribbon, roughness: .40, metalness: .42 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wrap);
    body.castShadow = true;
    body.receiveShadow = true;
    gift.add(body);
    for (const dimensions of [[w + .006, h + .008, .067], [.068, h + .014, d + .006]]) {
      const bandMesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), trim);
      bandMesh.castShadow = true;
      bandMesh.receiveShadow = true;
      gift.add(bandMesh);
    }
    const loop = new THREE.TorusGeometry(.073, .012, 5, 16);
    for (const side of [-1, 1]) {
      const bow = new THREE.Mesh(loop, trim);
      bow.scale.set(1, .45, 1);
      bow.position.set(side * .063, h * .5 + .039, 0);
      bow.rotation.set(Math.PI * .21, side * .28, side * .39);
      bow.castShadow = true;
      bow.receiveShadow = true;
      gift.add(bow);
    }
    group.add(gift);
  }
}

function addStar(tree) {
  const starGeometry = new THREE.BufferGeometry();
  const ring = [];
  for (let i = 0; i < 16; i++) {
    const angle = Math.PI / 2 + i * TAU / 16;
    const radius = i % 2 ? .125 : i % 4 === 0 ? .34 : .239;
    ring.push([Math.cos(angle) * radius, Math.sin(angle) * radius, 0]);
  }
  const faces = [];
  for (let i = 0; i < ring.length; i++) {
    const next = (i + 1) % ring.length;
    faces.push(0, 0, .083, ...ring[i], ...ring[next], 0, 0, -.083, ...ring[next], ...ring[i]);
  }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(faces, 3));
  starGeometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: '#dfba7c', metalness: .68, roughness: .31, emissive: '#ffc881', emissiveIntensity: 0 });
  const star = new THREE.Mesh(starGeometry, material);
  star.position.y = 6.02;
  tree.add(star);
  return star;
}

export function createTree(scene, random, glow, screenHeight) {
  const tree = new THREE.Group();
  scene.add(tree);
  const { crystals, ornaments } = buildFoliage(tree, seededRandom(18137));
  addOrnaments(tree, ornaments, random);
  addGifts(tree, glow);
  const star = addStar(tree);
  const light = { value: 0 };
  const clock = { value: 0 };
  const starGlow = { value: 1 };
  const starAngle = { value: 0 };
  const starFacing = { value: 1 };
  const completePulse = { value: 0 };
  const completeWave = { value: 1.2 };
  const uniforms = { light, clock, screenHeight, completePulse, completeWave };
  const lightRandom = seededRandom(71265);
  const curve = addSpiral(tree, lightRandom, uniforms);
  const lengths = curve.getLengths();
  const last = lengths.length - 1;
  const base = curve.points[0].y;
  const span = curve.points.at(-1).y - base;
  const arcAtHeight = (height) => {
    const index = THREE.MathUtils.clamp((height - base) / span, 0, 1) * (last - 1);
    const first = Math.floor(index);
    return THREE.MathUtils.lerp(lengths[first], lengths[first + 1], index - first) / lengths[last];
  };
  addFrostLights(tree, crystals, lightRandom, arcAtHeight, uniforms);
  addStarBeams(star, { light, starGlow });
  addStarFlare(tree, star.position, { light, starGlow, starAngle, starFacing, completePulse });

  const sparkMaterial = new THREE.SpriteMaterial({
    map: glow, color: '#d6eeff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
  });
  sparkMaterial.color.multiplyScalar(3.9);
  const spark = new THREE.Sprite(sparkMaterial);
  spark.scale.set(.83, .83, 1);
  const movingLight = new THREE.PointLight('#b0dbff', 0, 5.4);
  const fill = new THREE.PointLight('#96caff', 0, 6.4);
  fill.position.set(.25, 1.44, 2.58);
  tree.add(spark, movingLight, fill);

  return {
    update(time, progress, yaw, finishPulse = 0, finishWave = 1.2) {
      clock.value = time;
      light.value = progress;
      completePulse.value = finishPulse;
      completeWave.value = finishWave;
      starGlow.value = 1 + .055 * Math.sin(time * TAU / 5.6) + finishPulse * .36;
      const gold = THREE.MathUtils.smoothstep(progress, .85, .995);
      // Let the 3D star rotate naturally in world space while its flare tracks its relative angle to camera
      const spin = time * .34;
      star.rotation.y = spin;
      const relativeAngle = spin - yaw;
      const facing = Math.abs(Math.cos(relativeAngle));
      starAngle.value = relativeAngle;
      starFacing.value = .45 + .55 * facing;
      star.material.emissiveIntensity = gold * 3.15 * starGlow.value * (.84 + .22 * facing) * (1 + finishPulse * .28);
      spark.position.copy(curve.getPointAt(Math.min(1, progress * 1.013)));
      const travel = THREE.MathUtils.smoothstep(progress, 0, .055) * (1 - THREE.MathUtils.smoothstep(progress, .91, 1));
      spark.material.opacity = travel * .86;
      movingLight.position.copy(spark.position);
      movingLight.intensity = travel * 16.5;
      fill.intensity = THREE.MathUtils.smoothstep(progress, .10, .54) * (8.9 + Math.sin(time * 1.68) * 1.31) + finishPulse * 4.4;
    },
  };
}
