import * as THREE from 'three';
import { addFrostLights, addSpiral, addStarFlare } from './lights.js';

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

function addInterior(group) {
  const vertices = [];
  const colors = [];
  const triangles = [];
  const sections = 49;
  const bands = 31;
  const shadow = new THREE.Color('#25394d');
  const moonlit = new THREE.Color('#5d7788');
  const tint = new THREE.Color();
  for (let j = 0; j <= bands; j++) {
    const height = j / bands;
    const taper = .035 + 1.24 * (1 - height) ** .96;
    for (let k = 0; k < sections; k++) {
      const angle = k / sections * TAU;
      const fold = .89 + .12 * Math.sin(j * 2.37 + angle * 4.0) + .073 * Math.sin(angle * 9.0 + j * .64);
      vertices.push(Math.cos(angle) * taper * fold, .51 + height * 5.16 + taper * Math.cos(angle * 7.0 + j * .7) * .077, Math.sin(angle) * taper * fold);
      tint.copy(shadow).lerp(moonlit, .25 + fold * .22 + .15 * Math.sin(angle * 4.0 + height * 23.0));
      colors.push(tint.r, tint.g, tint.b);
      if (j < bands) {
        const first = j * sections + k;
        const next = j * sections + (k + 1) % sections;
        triangles.push(first, first + sections, next, next, first + sections, next + sections);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, color: '#b6c5d6', roughness: 1 })));
}

function buildFoliage(group, random, glow) {
  const stems = [];
  const needles = [];
  const colors = [];
  const snow = [];
  const snowColors = [];
  const crystals = [];
  const ornaments = [];
  const cold = new THREE.Color('#557388');
  const bright = new THREE.Color('#c1d9e6');
  const depth = new THREE.Color('#192e3a');
  const color = new THREE.Color();
  const tierCount = 37;

  for (let tier = 0; tier < tierCount; tier++) {
    const level = tier / tierCount;
    const y = .44 + level * 5.16;
    const envelope = 2.0 * Math.pow(1 - level, .92) + .11;
    const whorl = 1 + .12 * Math.sin(tier * 1.49);
    const branches = Math.ceil(4 + (1 - level) * 5);
    for (let i = 0; i < branches; i++) {
      const azimuth = i * TAU / branches + tier * 2.41 + (random() - .5) * .37;
      const cosine = Math.cos(azimuth);
      const sine = Math.sin(azimuth);
      const reach = envelope * whorl * (.78 + random() * .27);
      const bend = (.22 - level * .10) * (.65 + random() * .68);
      let last = [cosine * .065, y, sine * .065];
      for (let k = 1; k <= 9; k++) {
        const p = k / 9;
        const stem = [cosine * reach * p, y - Math.sin(p * 2.14) * bend + .15 * p ** 4, sine * reach * p];
        stems.push(...last, ...stem);
        last = stem;
      }
      const samples = 91 - Math.round(level * 31);
      for (let k = 0; k < samples; k++) {
        const p = .07 + Math.pow(random(), .67) * .93;
        const width = (.048 + Math.sin(p * Math.PI) * .218) * reach;
        const side = (random() - .5) * 2 * width;
        const radius = Math.max(.06, reach * p - Math.abs(side) * .38);
        const off = (random() - .53) * .24 * (1 - level * .45);
        const x = cosine * radius - sine * side;
        const z = sine * radius + cosine * side;
        const h = y - Math.sin(p * 2.14) * bend + .15 * p ** 4 + off;
        const length = (.024 + random() * .091) * (1 - level * .24);
        const turn = azimuth + (random() - .5) * 2.4;
        const frost = .09 + p * .37 + random() * .43 + Math.max(0, off) * .63;
        color.copy(depth).lerp(cold, Math.min(1, frost * 1.45));
        needles.push(x, h, z, x + Math.cos(turn) * length, h + (random() - .44) * length, z + Math.sin(turn) * length);
        colors.push(color.r, color.g, color.b);
        color.copy(cold).lerp(bright, Math.min(.95, frost * (.65 + random() * .59)));
        colors.push(color.r, color.g, color.b);
        if (k % 3 === 0 && (p > .32 || random() > .33)) {
          const frostX = x + Math.cos(turn) * length * .7;
          const frostY = h + .024 + random() * .023;
          const frostZ = z + Math.sin(turn) * length * .7;
          snow.push(frostX, frostY, frostZ);
          color.copy(cold).lerp(bright, Math.min(.96, frost + random() * .2));
          snowColors.push(color.r, color.g, color.b);
          if (p > .37 || k % 2 === 0) crystals.push([frostX, frostY, frostZ]);
        }
      }
      if (tier % 3 === 1 && i % 2 === tier % 2 && level < .93 && random() > .18) {
        const p = .77 + random() * .22;
        ornaments.push([cosine * reach * p, y - bend * .96 - .075, sine * reach * p, level]);
      }
    }
  }

  function geometry(positions, vertexColors) {
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (vertexColors) geo.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
    return geo;
  }
  addInterior(group);
  group.add(new THREE.LineSegments(geometry(stems), new THREE.LineBasicMaterial({ color: '#3b5362', opacity: .78, transparent: true, depthWrite: false })));
  group.add(new THREE.LineSegments(geometry(needles, colors), new THREE.LineBasicMaterial({ vertexColors: true, opacity: .76, transparent: true, depthWrite: false })));
  group.add(new THREE.Points(geometry(snow, snowColors), new THREE.PointsMaterial({ vertexColors: true, size: .042, map: glow, opacity: .85, transparent: true, depthWrite: false })));
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.062, .125, 1.06, 10), new THREE.MeshStandardMaterial({ color: '#263542', roughness: .94 }));
  trunk.position.y = .53;
  group.add(trunk);
  return { crystals, ornaments };
}

function addOrnaments(group, ornaments, random) {
  const globe = new THREE.SphereGeometry(1, 15, 11);
  const faceted = new THREE.IcosahedronGeometry(1, 0);
  const cap = new THREE.CylinderGeometry(.027, .032, .033, 8);
  const hardware = new THREE.MeshStandardMaterial({ color: '#ad905d', metalness: .74, roughness: .29, envMapIntensity: 1.2 });
  const materials = ['#305f91', '#c2d9e8', '#bb9762', '#6b89ae'].map(color =>
    new THREE.MeshStandardMaterial({ color, metalness: .72, roughness: .23, envMapIntensity: 1.30 }));
  ornaments.forEach(([x, y, z, level], index) => {
    const detail = index % 5 === 0;
    const size = (.058 + random() * .066) * (1 - level * .17);
    const ornament = new THREE.Mesh(detail ? faceted : globe, materials[index % materials.length]);
    ornament.position.set(x * 1.06, y - size * .8, z * 1.06);
    ornament.scale.set(size * (detail ? .73 : 1), size * (detail ? 1.48 : 1), size * (detail ? .73 : 1));
    ornament.rotation.y = random() * TAU;
    const collar = new THREE.Mesh(cap, hardware);
    collar.position.set(ornament.position.x, ornament.position.y + size * (detail ? 1.36 : .96), ornament.position.z);
    group.add(ornament, collar);
  });
}

function addGifts(group, glow) {
  const boxes = [
    [-1.53, 1.11, .68, .56, .57, '#25456f', '#bcd4ea', .19],
    [-1.96, .54, .46, .35, .43, '#294f78', '#dfc498', -.16],
    [.92, 1.44, .79, .38, .63, '#718698', '#ead4ab', -.21],
    [1.52, .91, .51, .65, .48, '#264167', '#bccfdc', .31],
    [1.79, .39, .45, .26, .39, '#2c4f75', '#ddc498', -.25],
  ];
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: glow, color: '#010408', opacity: .66, transparent: true, depthWrite: false });
  for (const [x, z, w, h, d, paper, ribbon, angle] of boxes) {
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.position.set(x, -.017, z);
    shadow.rotation.set(-Math.PI / 2, 0, angle);
    shadow.scale.set(w * 2.4, d * 2.4, 1);
    shadow.renderOrder = -4;
    group.add(shadow);
    const gift = new THREE.Group();
    gift.position.set(x, h * .5, z);
    gift.rotation.y = angle;
    const wrap = new THREE.MeshStandardMaterial({ color: paper, roughness: .53, metalness: .10 });
    const trim = new THREE.MeshStandardMaterial({ color: ribbon, roughness: .40, metalness: .43 });
    gift.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wrap));
    for (const dimensions of [[w + .006, h + .008, .067], [.068, h + .014, d + .006]]) {
      gift.add(new THREE.Mesh(new THREE.BoxGeometry(...dimensions), trim));
    }
    const loop = new THREE.TorusGeometry(.073, .012, 5, 16);
    for (const side of [-1, 1]) {
      const bow = new THREE.Mesh(loop, trim);
      bow.scale.set(1, .45, 1);
      bow.position.set(side * .063, h * .5 + .039, 0);
      bow.rotation.set(Math.PI * .21, side * .28, side * .39);
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
  const { crystals, ornaments } = buildFoliage(tree, random, glow);
  addOrnaments(tree, ornaments, random);
  addGifts(tree, glow);
  const star = addStar(tree);
  const light = { value: 0 };
  const clock = { value: 0 };
  const starGlow = { value: 1 };
  const uniforms = { light, clock, screenHeight };
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
  addStarFlare(tree, star.position, { light, starGlow });

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
    update(time, progress, yaw) {
      clock.value = time;
      light.value = progress;
      starGlow.value = 1 + .055 * Math.sin(time * TAU / 5.6);
      const gold = THREE.MathUtils.smoothstep(progress, .85, .995);
      star.rotation.y = yaw + time * .13;
      star.material.emissiveIntensity = gold * 3.05 * starGlow.value;
      spark.position.copy(curve.getPointAt(Math.min(1, progress * 1.013)));
      const travel = THREE.MathUtils.smoothstep(progress, 0, .055) * (1 - THREE.MathUtils.smoothstep(progress, .91, 1));
      spark.material.opacity = travel * .86;
      movingLight.position.copy(spark.position);
      movingLight.intensity = travel * 16.5;
      fill.intensity = THREE.MathUtils.smoothstep(progress, .10, .54) * (8.9 + Math.sin(time * 1.68) * 1.31);
    },
  };
}
