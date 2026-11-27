import * as THREE from 'three';

const palette = [
  ['#5bcff6', '#a4b3ff'],
  ['#ffca79', '#ffab9f'],
  ['#c08cf9', '#ffa7e4'],
  ['#5cf1c6', '#9be9ff'],
  ['#ffd485', '#fff1c8'],
];

// Delay, horizontal placement, height, size, palette, ring shape, and gravity.
const volley = [
  [0, .59, 5.25, 1.48, 0, .09, .34],
  [.19, -.60, 5.02, 1.38, 1, .13, .37],
  [.54, .28, 6.45, .91, 2, .91, .19],
  [.82, -.86, 4.25, .92, 3, .32, .29],
  [1.07, .86, 4.34, .97, 2, .26, .33],
  [1.49, -.31, 6.48, .87, 0, .92, .22],
  [1.85, .65, 5.34, 1.50, 4, .05, .56],
  [2.13, -.67, 5.72, 1.31, 2, .10, .43],
  [2.53, .33, 6.18, .83, 3, .63, .24],
];

const additive = {
  transparent: true, depthWrite: false, blending: THREE.CustomBlending,
  blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
};
const dynamics = `
  uniform float age, size, ring, gravity, lifetime;
  attribute vec4 particle;

  vec3 location(float time) {
    vec3 direction = normalize(position);
    vec2 plane = direction.xy / max(0.35, length(direction.xy));
    vec3 ray = mix(direction, vec3(plane, direction.z * 0.15), ring);
    float distance = (1.0 - exp(-time * 2.45)) + 0.23 * time;
    vec3 point = ray * distance * size * (0.68 + particle.x * 0.58);
    point.y -= gravity * time * time;
    return point;
  }
`;

function geometries(random) {
  const directions = [];
  const particles = [];
  const rays = 144;
  for (let i = 0; i < rays; i++) {
    const angle = i * 2.399963 + random() * .36;
    const height = 1 - (2 * i + 1) / rays;
    const span = Math.sqrt(1 - height * height);
    directions.push([Math.cos(angle) * span, height, Math.sin(angle) * span]);
    particles.push([random(), random(), random(), random()]);
  }
  const body = [];
  const traits = [];
  const forks = [];
  const trailBody = [];
  const trailTraits = [];
  const segments = [];
  const indices = [];
  const steps = 9;

  directions.forEach((direction, i) => {
    body.push(...direction);
    traits.push(...particles[i]);
    forks.push(0, 0, 0, 0);
    for (let step = 0; step <= steps; step++) {
      const first = trailBody.length / 3;
      trailBody.push(...direction, ...direction);
      trailTraits.push(...particles[i], ...particles[i]);
      segments.push(step / steps, -1, step / steps, 1);
      if (step < steps) indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
    }
  });

  for (let bloom = 0; bloom < 12; bloom++) {
    const parent = Math.floor((bloom + .25) * rays / 12);
    const delay = .34 + random() * .69;
    for (let i = 0; i < 9; i++) {
      const angle = 2 * Math.PI * i / 9 + delay * 14;
      const energy = .20 + random() * .31;
      body.push(...directions[parent]);
      traits.push(...particles[parent].slice(0, 2), random(), random());
      forks.push(Math.cos(angle) * energy, Math.sin(angle) * energy, (random() - .5) * .61, delay);
    }
  }

  const points = new THREE.BufferGeometry();
  points.setAttribute('position', new THREE.Float32BufferAttribute(body, 3));
  points.setAttribute('particle', new THREE.Float32BufferAttribute(traits, 4));
  points.setAttribute('fork', new THREE.Float32BufferAttribute(forks, 4));
  const trails = new THREE.BufferGeometry();
  trails.setAttribute('position', new THREE.Float32BufferAttribute(trailBody, 3));
  trails.setAttribute('particle', new THREE.Float32BufferAttribute(trailTraits, 4));
  trails.setAttribute('segment', new THREE.Float32BufferAttribute(segments, 2));
  trails.setIndex(indices);
  return { points, trails };
}

function pointMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    ...additive, uniforms,
    vertexShader: `
      ${dynamics}
      uniform float screenHeight;
      attribute vec4 fork;
      varying vec4 sparkle;

      void main() {
        float split = step(0.01, fork.w);
        float sinceSplit = max(0.0, age - fork.w);
        vec3 mainPoint = location(age);
        vec3 childPoint = location(fork.w) * 0.35 + mainPoint * 0.65;
        childPoint += fork.xyz * (1.0 - exp(-sinceSplit * 3.7)) * size;
        childPoint.y -= 0.42 * sinceSplit * sinceSplit;
        vec4 view = modelViewMatrix * vec4(mix(mainPoint, childPoint, split), 1.0);
        gl_Position = projectionMatrix * view;
        float flash = pow(0.5 + 0.5 * sin(age * (13.0 + particle.z * 18.0) + particle.y * 47.0), 4.0);
        float mainFade = (0.64 + flash * 0.36) * (1.0 - smoothstep(0.23 + 0.40 * particle.w, lifetime, age));
        float crackle = (0.26 + 0.74 * flash) * smoothstep(0.0, 0.052, sinceSplit) * exp(-sinceSplit * 2.5);
        float spread = (0.078 + particle.w * 0.11 + flash * 0.047) * mix(1.0, 0.72, split);
        gl_PointSize = clamp(spread * screenHeight * 1.90 / -view.z, 1.9, 36.0);
        sparkle = vec4(mix(mainFade, crackle, split), particle.z, flash, split);
      }`,
    fragmentShader: `
      uniform vec3 bodyColor, tipColor;
      varying vec4 sparkle;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = dot(p, p);
        float core = exp(-r * 37.0);
        float halo = exp(-r * 5.6) * 0.36;
        float glint = (exp(-abs(p.x) * 58.0) + exp(-abs(p.y) * 57.0)) * exp(-sqrt(r) * 4.3) * sparkle.z;
        vec3 hue = mix(bodyColor, tipColor, sparkle.y);
        hue = mix(hue, vec3(1.0, 0.94, 0.80), max(core * 0.65, sparkle.w * 0.47));
        gl_FragColor = vec4(hue * (1.35 + sparkle.z * 1.18),
          (core + halo + glint * 0.4) * sparkle.x * (1.0 - smoothstep(0.59, 1.0, r)));
        #include <colorspace_fragment>
      }`,
  });
}

function trailMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    ...additive, uniforms, side: THREE.DoubleSide,
    vertexShader: `
      ${dynamics}
      attribute vec2 segment;
      varying vec4 trace;

      void main() {
        float delay = mix(0.26, 0.65, gravity) * (0.78 + 0.67 * particle.w);
        float localAge = max(0.0, age - segment.x * delay);
        vec4 view = modelViewMatrix * vec4(location(localAge), 1.0);
        vec4 center = projectionMatrix * view;
        vec4 ahead = projectionMatrix * modelViewMatrix * vec4(location(localAge + 0.025), 1.0);
        float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
        vec2 tangent = normalize((ahead.xy / ahead.w - center.xy / center.w) * vec2(aspect, 1.0) + vec2(0.00001));
        float width = (0.018 + particle.w * 0.023) * (1.0 - segment.x * 0.78);
        center.xy += vec2(-tangent.y / aspect, tangent.x) * segment.y * width * projectionMatrix[1][1];
        gl_Position = center;
        float fresh = smoothstep(0.0, 0.10, localAge) * (1.0 - smoothstep(0.39, lifetime, age));
        trace = vec4(segment, fresh * (0.61 + .39 * particle.y), particle.z);
      }`,
    fragmentShader: `
      uniform vec3 bodyColor, tipColor;
      varying vec4 trace;
      void main() {
        float along = clamp(trace.x, 0.0, 1.0);
        float across = exp(-trace.y * trace.y * 5.3) * (1.0 - smoothstep(0.67, 1.0, abs(trace.y)));
        float tail = pow(1.0 - along, 1.48);
        vec3 tint = mix(bodyColor, tipColor, trace.w * 0.57 + along * 0.38);
        tint = mix(tint, vec3(1.0, 0.91, 0.78), tail * 0.32);
        gl_FragColor = vec4(tint * (1.40 + tail * 1.10), across * tail * max(0.0, trace.z));
        #include <colorspace_fragment>
      }`,
  });
}

export function addFireworks(scene, random, glow, screenHeight) {
  const shapes = geometries(random);
  const bursts = Array.from({ length: volley.length * 2 }, () => {
    const uniforms = {
      age: { value: 0 }, size: { value: 1 }, ring: { value: 0 }, gravity: { value: 0 },
      lifetime: { value: 2.4 }, screenHeight,
      bodyColor: { value: new THREE.Color() }, tipColor: { value: new THREE.Color() },
    };
    const points = new THREE.Points(shapes.points, pointMaterial(uniforms));
    const trails = new THREE.Mesh(shapes.trails, trailMaterial(uniforms));
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ ...additive, map: glow }));
    const group = new THREE.Group();
    points.frustumCulled = trails.frustumCulled = false;
    group.add(trails, points, flash);
    group.visible = false;
    scene.add(group);
    return { group, flash, uniforms, start: -Infinity };
  });

  let slot = 0;
  function spawn(time, yaw, handX, aspect) {
    const sign = handX < .5 ? -1 : 1;
    const width = Math.min(5.7, .31 * (Math.max(14.1, 7.38 / aspect) + 2.1) * aspect);
    const scale = .72 + .28 * THREE.MathUtils.smoothstep(aspect, .43, 1.21);
    volley.forEach(([delay, side, height, size, color, ring, gravity], i) => {
      const burst = bursts[slot++ % bursts.length];
      const lateral = (side + (random() - .5) * .09) * width * sign;
      const depth = -1.9 - random() * 1.7;
      burst.group.position.set(Math.cos(yaw) * lateral + Math.sin(yaw) * depth,
        height + (random() - .5) * .24, -Math.sin(yaw) * lateral + Math.cos(yaw) * depth);
      burst.group.rotation.y = yaw + (random() - .5) * .65;
      burst.group.rotation.z = (random() - .5) * .6;
      burst.start = time + delay;
      burst.group.visible = false;
      const { uniforms, flash } = burst;
      uniforms.size.value = size * scale * (1 + random() * .13);
      uniforms.ring.value = ring;
      uniforms.gravity.value = gravity;
      uniforms.lifetime.value = 2.06 + gravity * .91 + i * .014;
      uniforms.bodyColor.value.set(palette[color][0]);
      uniforms.tipColor.value.set(palette[color][1]);
      flash.material.color.copy(uniforms.tipColor.value).multiplyScalar(2.8);
      flash.scale.setScalar(1.25 + size * .76);
    });
  }

  function update(time) {
    for (const { group, flash, uniforms, start } of bursts) {
      const age = time - start;
      group.visible = age >= 0 && age < uniforms.lifetime.value;
      if (!group.visible) continue;
      uniforms.age.value = age;
      flash.material.opacity = .81 * Math.exp(-age * 9.5);
    }
  }

  return {
    spawn,
    update,
    reset() { for (const burst of bursts) { burst.start = -Infinity; burst.group.visible = false; } },
  };
}
