import * as THREE from 'three';
import { Reflector } from '../vendor/three/Reflector.js';
import { createTree, glowTexture, seededRandom } from './tree.js';
import { createBloom } from './bloom.js';
import { addAurora } from './aurora.js';
import { addFireworks } from './fireworks.js';

const TAU = Math.PI * 2;

function studioEnvironment() {
  const canvas = Object.assign(document.createElement('canvas'), { width: 512, height: 256 });
  const context = canvas.getContext('2d');
  context.fillStyle = '#142132';
  context.fillRect(0, 0, 512, 256);
  for (const [x, y, width, height, color] of [
    [104, 73, 114, 57, '#e6f0ff'], [332, 90, 68, 89, '#8fcfff'],
    [430, 62, 48, 31, '#ffe6bb'], [226, 156, 133, 37, '#5479a4'],
  ]) {
    context.shadowColor = color;
    context.shadowBlur = 25;
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function addFloor(scene) {
  const floor = new Reflector(new THREE.PlaneGeometry(52, 52), {
    textureWidth: 576, textureHeight: 576, clipBias: .002, multisample: 0,
    shader: {
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, lit: { value: 0 } },
      vertexShader: `
        uniform mat4 textureMatrix; varying vec4 mirrorUv; varying vec2 ground;
        void main(){ mirrorUv=textureMatrix*vec4(position,1.0); ground=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;uniform float lit;varying vec4 mirrorUv;varying vec2 ground;
        void main(){
          vec2 uv=mirrorUv.xy/mirrorUv.w;
          vec2 tap=vec2(0.0038,0.0053);
          vec3 reflection=texture2D(tDiffuse,uv).rgb*0.43;
          reflection+=(texture2D(tDiffuse,uv+tap).rgb+texture2D(tDiffuse,uv-tap).rgb)*0.15;
          reflection+=(texture2D(tDiffuse,uv+tap*vec2(1.0,-1.0)).rgb+texture2D(tDiffuse,uv+tap*vec2(-1.0,1.0)).rgb)*0.135;
          float pool=exp(-dot(ground*vec2(0.40,0.28),ground*vec2(0.40,0.28)));
          float dust=fract(sin(dot(ground*187.0,vec2(13.91,71.32)))*4636.3)*0.006;
          vec3 cold=vec3(0.006,0.013,0.027)+pool*vec3(0.026,0.051,0.085)*(0.62+lit*0.38)+dust*pool;
          vec3 wash=reflection*(0.11+0.28*lit)*pool;
          gl_FragColor=vec4(cold+wash, (1.0-smoothstep(4.8,18.3,length(ground)))*0.96);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    },
  });
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.025;
  floor.material.transparent = true;
  floor.material.depthWrite = false;
  floor.renderOrder = -5;
  scene.add(floor);
  return floor;
}

function addNight(scene, random, glow) {
  const backdrop = new THREE.Group();
  for (const [size, count, opacity] of [[.043, 630, .54], [.105, 110, .47], [.30, 20, .20]]) {
    const locations = [];
    const colors = [];
    for (let i = 0; i < count; i++) {
      const angle = random() * TAU;
      const radius = 6.5 + random() * 19;
      const height = .45 + Math.pow(random(), .83) * 12.5;
      const blue = random();
      locations.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      const color = new THREE.Color('#709cce').lerp(new THREE.Color('#e4effc'), blue);
      colors.push(color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(locations, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    backdrop.add(new THREE.Points(geometry, new THREE.PointsMaterial({ size, vertexColors: true, map: glow, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  }
  scene.add(backdrop);
  return backdrop;
}

function addSnow(scene, random, glow) {
  const groups = [];
  for (const [count, size, opacity] of [[510, .078, .96], [52, .275, .66]]) {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - .5) * 17;
      positions[i * 3 + 1] = random() * 10 + .1;
      positions[i * 3 + 2] = (random() - .5) * 15;
      speeds[i] = .39 + random() * .75;
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.PointsMaterial({ size, map: glow, color: '#e8f3ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
    groups.push({ points, positions, speeds, opacity });
  }
  return (dt, time, amount) => {
    for (const { points, positions, speeds, opacity } of groups) {
      points.visible = amount > .001;
      if (!points.visible) continue;
      points.material.opacity = opacity * amount;
      for (let i = 0; i < speeds.length; i++) {
        const k = i * 3;
        positions[k] += (Math.sin(i * .81 + time * .95) * .26 + .14) * dt;
        positions[k + 1] -= speeds[i] * dt;
        if (positions[k + 1] < .02) positions[k + 1] = 9.5 + random();
        if (positions[k] > 8.8) positions[k] = -8.6;
      }
      points.geometry.attributes.position.needsUpdate = true;
    }
  };
}

export function createWinterScene(canvas, { onLightComplete } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const bloom = createBloom(renderer);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#15263e', .031);
  scene.environment = studioEnvironment();
  scene.add(new THREE.HemisphereLight('#bdd8fc', '#152230', 1.24));
  const key = new THREE.DirectionalLight('#ddeaff', 2.35);
  key.position.set(-4.6, 8.2, 5.4);
  key.target.position.set(0, 2.1, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1.5;
  key.shadow.camera.far = 23;
  key.shadow.camera.left = -5.6;
  key.shadow.camera.right = 5.6;
  key.shadow.camera.top = 6.4;
  key.shadow.camera.bottom = -5.2;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.028;
  key.shadow.radius = 2.6;
  scene.add(key, key.target);
  const edge = new THREE.DirectionalLight('#91b6ed', 1.38);
  edge.position.set(4, 5, -5);
  scene.add(edge);

  const random = seededRandom();
  const glow = glowTexture();
  const camera = new THREE.PerspectiveCamera(34, 1, .12, 84);
  const aurora = addAurora(scene, camera);
  const screenHeight = { value: 1 };
  const floor = addFloor(scene);
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.ShadowMaterial({ color: '#010510', opacity: .60, transparent: true, depthWrite: false }),
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = -.006;
  shadowCatcher.receiveShadow = true;
  shadowCatcher.renderOrder = -3;
  scene.add(shadowCatcher);
  const night = addNight(scene, random, glow);
  const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#79b4ee', opacity: 0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  mist.scale.set(8.7, 12.6, 1);
  scene.add(mist);
  const tree = createTree(scene, random, glow, screenHeight);
  const snow = addSnow(scene, random, glow);
  const fireworks = addFireworks(scene, seededRandom(9815), glow, screenHeight);
  let yaw = .29;
  let desiredYaw = yaw;
  let angularVelocity = 0;
  let snowAmount = 0;
  let celebrated = false;
  let litCompleteAt = Infinity;
  let previous = 0;
  let shadowFrames = 2;

  function size() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 1.6, Math.sqrt(1770000 / Math.max(1, width * height)));
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    bloom.resize(Math.floor(width * ratio), Math.floor(height * ratio), ratio);
    screenHeight.value = height * ratio;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(size);
  observer.observe(canvas);
  size();

  return {
    turn(radians, velocity = 0) {
      desiredYaw += radians;
      if (velocity !== 0) {
        if (angularVelocity !== 0 && Math.sign(velocity) !== Math.sign(angularVelocity)) {
          angularVelocity *= 0.15;
        }
        angularVelocity += (velocity - angularVelocity) * 0.5;
      }
    },
    setAscii(enabled) { bloom.setAscii(enabled); },
    celebrate(time, x = .5) { celebrated = true; fireworks.spawn(time, yaw, x, camera.aspect); },
    reset() { desiredYaw = .29; angularVelocity = 0; celebrated = false; snowAmount = 0; litCompleteAt = Infinity; fireworks.reset(); },
    frame(time, progress) {
      const dt = Math.min(.06, Math.max(.001, time - previous));
      previous = time;
      if (progress < .999) {
        litCompleteAt = Infinity;
      } else if (litCompleteAt === Infinity) {
        litCompleteAt = time;
        onLightComplete?.();
      }
      let finishPulse = 0;
      let finishWave = 1.25;
      if (litCompleteAt !== Infinity) {
        const elapsed = time - litCompleteAt;
        if (elapsed >= 0 && elapsed < 1.55) {
          const rise = THREE.MathUtils.smoothstep(elapsed, 0, .14);
          const decay = Math.exp(-Math.max(0, elapsed - .09) * 2.95);
          finishPulse = rise * decay;
          finishWave = 1.08 - (elapsed / 0.92) * 1.28;
        }
      }
      if (Math.abs(angularVelocity) > 0.002) {
        desiredYaw += angularVelocity * dt;
        angularVelocity *= Math.exp(-dt * 3.3);
      } else {
        angularVelocity = 0;
      }
      yaw += (desiredYaw - yaw) * (1 - Math.exp(-dt * 11.5));
      const radius = Math.max(14.1, 7.38 / camera.aspect) - progress * .38;
      camera.position.set(Math.sin(yaw) * radius, 3.29 + Math.sin(yaw * .63) * .29, Math.cos(yaw) * radius);
      camera.lookAt(0, 3.04, 0);
      aurora(time, yaw);
      snowAmount += (Number(celebrated) - snowAmount) * (1 - Math.exp(-dt * 1.65));
      floor.material.uniforms.lit.value = progress + finishPulse * .28;
      shadowCatcher.material.opacity = .60 - progress * .14;
      if (shadowFrames > 0) {
        renderer.shadowMap.needsUpdate = true;
        shadowFrames--;
      }
      night.rotation.y = time * .008;
      mist.position.set(-Math.sin(yaw) * 2.6, 3.2, -Math.cos(yaw) * 2.6);
      mist.material.opacity = .09 + progress * .11 + finishPulse * .065;
      tree.update(time, progress, yaw, finishPulse, finishWave);
      snow(dt, time, snowAmount);
      fireworks.update(time);
      bloom.render(scene, camera, progress, time, finishPulse);
    },
  };
}
