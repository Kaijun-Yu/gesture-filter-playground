import * as THREE from 'three';

const TAU = Math.PI * 2;
const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

function setFloats(geometry, attributes) {
  for (const [name, [values, size]] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
  }
}

export function addFrostLights(tree, crystals, random, arcAtHeight, uniforms) {
  const geometry = new THREE.BufferGeometry();
  const points = [];
  const facets = [];
  const traits = [];
  const colors = [];
  const white = new THREE.Color('#ecf8ff');
  const blue = new THREE.Color('#95c5ff');
  const gold = new THREE.Color('#ffdaa6');
  const tint = new THREE.Color();

  for (const [x, y, z] of crystals) {
    const angle = Math.atan2(z, x) + (random() - .5) * 3.1;
    const height = (random() - .23) * .9;
    const seed = random();
    const size = random();
    points.push(x, y, z);
    facets.push(Math.cos(angle), height, Math.sin(angle));
    traits.push(Math.max(0, arcAtHeight(y) + (random() - .5) * .069), seed, size, random());
    tint.copy(white).lerp(random() > .09 ? blue : gold, random() * .61);
    colors.push(tint.r, tint.g, tint.b);
  }

  setFloats(geometry, {
    position: [points, 3], facet: [facets, 3], traits: [traits, 4], tint: [colors, 3],
  });
  const material = new THREE.ShaderMaterial({
    ...additive, uniforms,
    vertexShader: `
      attribute vec3 facet, tint;
      attribute vec4 traits;
      uniform float clock, light, screenHeight;
      varying vec3 color;
      varying vec4 profile;

      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        float seed = traits.y;
        float cycle = fract(clock * (0.36 + traits.w * 0.49) + seed);
        float flicker = smoothstep(0.015, 0.115, cycle) * (1.0 - smoothstep(0.13, 0.43, cycle));
        float localWash = 0.5 + 0.5 * sin(position.y * 4.8 + position.x * 2.3 - clock * 2.15);
        vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 eye = normalize(cameraPosition - world);
        vec3 halfVector = normalize(eye + normalize(vec3(-0.6, 0.9, 0.7)));
        float sheen = pow(max(0.0, dot(normalize(facet), halfVector)), 7.0);
        float lit = smoothstep(-0.012, 0.036, light - traits.x) * smoothstep(0.0, 0.026, light);
        float wake = lit * exp(-13.0 * max(0.0, light - traits.x));
        float strength = 0.22 + 0.22 * localWash + 1.30 * pow(flicker, 2.4) + 1.75 * sheen + 1.15 * wake;
        float flash = smoothstep(0.75, 0.98, traits.z) * max(pow(flicker, 4.0), sheen);
        float size = 0.049 + 0.153 * pow(traits.z, 4.0) + flash * 0.21 + wake * 0.059;
        gl_PointSize = clamp(size * screenHeight * 2.0 / -view.z, 1.55, 56.0);
        color = tint;
        profile = vec4(lit, strength, flash, seed);
      }`,
    fragmentShader: `
      varying vec3 color;
      varying vec4 profile;

      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = length(p);
        float angle = (profile.w - 0.5) * 1.52;
        vec2 axes = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * p;
        float core = exp(-42.0 * r * r);
        float halo = exp(-7.7 * r * r) * 0.25;
        float rays = (exp(-abs(axes.x) * 69.0) + exp(-abs(axes.y) * 59.0)) * exp(-r * 4.0);
        float opacity = (core + halo + rays * profile.z * 0.61) * (1.0 - smoothstep(0.67, 1.0, r));
        gl_FragColor = vec4(color * profile.y, opacity * profile.x);
        #include <colorspace_fragment>
      }`,
  });
  tree.add(new THREE.Points(geometry, material));
}

function addTrace(tree, samples, uniforms) {
  const geometry = new THREE.BufferGeometry();
  const points = [];
  const tangents = [];
  const edges = [];
  const indices = [];
  const last = samples.length - 1;
  const tangent = new THREE.Vector3();
  samples.forEach((point, index) => {
    tangent.subVectors(samples[Math.min(last, index + 1)], samples[Math.max(0, index - 1)]).normalize();
    for (const side of [-1, 1]) {
      points.push(point.x, point.y, point.z);
      tangents.push(tangent.x, tangent.y, tangent.z);
      edges.push(index / last, side);
    }
    if (index < last) {
      const first = 2 * index;
      indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3);
    }
  });
  setFloats(geometry, { position: [points, 3], tangent: [tangents, 3], edge: [edges, 2] });
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    ...additive, uniforms, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 tangent;
      attribute vec2 edge;
      varying vec2 path;

      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vec4 center = projectionMatrix * view;
        vec4 next = projectionMatrix * (view + modelViewMatrix * vec4(tangent, 0.0));
        float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
        vec2 direction = normalize((next.xy / next.w - center.xy / center.w) * vec2(aspect, 1.0) + vec2(0.00001));
        vec2 normal = vec2(-direction.y / aspect, direction.x);
        center.xy += normal * edge.y * 0.145 * projectionMatrix[1][1];
        gl_Position = center;
        path = edge;
      }`,
    fragmentShader: `
      varying vec2 path;
      uniform float light, clock;

      void main() {
        float head = light * 1.015;
        float distance = head - path.x;
        float reveal = smoothstep(-0.012, 0.016, distance) * smoothstep(0.0, 0.025, light);
        float arrival = exp(-max(0.0, distance) * 29.0) * (1.0 - smoothstep(0.94, 1.0, light));
        float flow = 0.5 + 0.5 * sin(path.x * 45.0 - clock * 2.55);
        float ripple = 0.5 + 0.5 * sin(path.x * 183.0 - clock * 4.7 + 1.25 * sin(path.x * 46.0));
        float energy = 0.30 + 2.55 * pow(flow, 4.0) + 0.50 * pow(ripple, 3.0) + 3.75 * arrival;
        float cross = path.y;
        float core = exp(-cross * cross * 163.0);
        float haze = exp(-cross * cross * 10.0) * (0.13 + 0.18 * arrival);
        float offset = 0.27 + 0.084 * sin(path.x * 39.0 - clock * 1.1);
        float secondary = (cross - offset) * 18.0;
        float thread = exp(-secondary * secondary) * (0.08 + 0.28 * pow(1.0 - flow, 3.0));
        vec3 color = mix(vec3(0.43, 0.69, 0.99), vec3(0.86, 0.94, 1.0), max(core, flow));
        gl_FragColor = vec4(color * energy + vec3(0.62, 0.44, 0.25) * thread, (core + haze + thread) * reveal);
        #include <colorspace_fragment>
      }`,
  });
  tree.add(new THREE.Mesh(geometry, material));
}

function addTraceSparks(tree, samples, random, uniforms) {
  const geometry = new THREE.BufferGeometry();
  const points = [];
  const traits = [];
  for (let i = 0; i < 1580; i++) {
    const arc = random();
    const point = samples[Math.round(arc * (samples.length - 1))];
    const angle = Math.atan2(point.z, point.x) + (random() - .5) * .63;
    const spread = (random() - .25) * .8 * (1 - arc * .52);
    points.push(point.x + Math.cos(angle) * spread, point.y + (random() - .6) * .37, point.z + Math.sin(angle) * spread);
    traits.push(arc, random(), random(), (random() - .50) * .95);
  }
  setFloats(geometry, { position: [points, 3], traits: [traits, 4] });
  tree.add(new THREE.Points(geometry, new THREE.ShaderMaterial({
    ...additive, uniforms,
    vertexShader: `
      attribute vec4 traits;
      uniform float clock, light, screenHeight;
      varying vec2 spark;

      void main() {
        float distance = light - traits.x;
        float tail = smoothstep(-0.006, 0.017, distance) * exp(-max(0.0, distance) * (13.0 + traits.y * 15.0));
        float cycle = fract(clock * (0.29 + traits.y * 0.4) + traits.z);
        float glitter = smoothstep(0.02, 0.14, cycle) * (1.0 - smoothstep(0.14, 0.38, cycle));
        float alongTrace = pow(0.5 + 0.5 * sin(traits.x * 45.0 - clock * 2.55), 6.0);
        float lit = smoothstep(0.0, 0.038, distance);
        vec3 offset = vec3(position.x * 0.069 * cycle, cycle * traits.w, position.z * 0.069 * cycle);
        vec4 view = modelViewMatrix * vec4(position + offset, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp((0.048 + pow(traits.z, 5.0) * 0.13) * screenHeight * 2.1 / -view.z, 1.7, 30.0);
        spark = vec2(1.32 * tail + glitter * alongTrace * lit * 0.54, traits.y);
      }`,
    fragmentShader: `
      varying vec2 spark;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = dot(p,p);
        vec3 tint = mix(vec3(0.43, 0.72, 1.0), vec3(1.0, 0.84, 0.61), pow(spark.y, 9.0));
        float falloff = (exp(-23.0 * r) + 0.30 * exp(-6.0 * r)) * (1.0 - smoothstep(0.52, 1.0, r));
        gl_FragColor = vec4(tint * (0.92 + spark.x * 1.45), falloff * clamp(spark.x, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
  })));
}

export function addSpiral(tree, random, uniforms) {
  const track = [];
  for (let i = 0; i <= 390; i++) {
    const t = i / 390;
    const radius = .17 + 2.12 * (1 - t) ** .90 + .075 * Math.sin(t * 33);
    const angle = t * TAU * 5.25 + .52;
    track.push(new THREE.Vector3(Math.cos(angle) * radius, .38 + 5.34 * t, Math.sin(angle) * radius));
  }

  const curve = new THREE.CatmullRomCurve3(track);
  const samples = curve.getSpacedPoints(540);
  addTrace(tree, samples, uniforms);
  addTraceSparks(tree, samples, random, uniforms);
  return curve;
}

export function addStarFlare(tree, position, uniforms) {
  const material = new THREE.ShaderMaterial({
    ...additive, uniforms,
    vertexShader: `
      varying vec2 coordinates;
      void main() {
        coordinates = (uv - 0.5) * vec2(2.0, 2.0);
        vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        gl_Position = projectionMatrix * (center + vec4(position.xy, 0.0, 0.0));
      }`,
    fragmentShader: `
      varying vec2 coordinates;
      uniform float light, starGlow;

      void main() {
        vec2 p = coordinates * vec2(2.0, 1.0);
        float r = length(p);
        float lit = smoothstep(0.88, 0.998, light);
        float strike = lit * (1.0 - smoothstep(0.975, 1.0, light));
        float core = exp(-r * r * 425.0) * 1.45;
        float halo = (exp(-r * r * 29.0) * 0.32 + exp(-r * r * 7.1) * 0.13) * 0.91;
        float axis = exp(-abs(p.y) * 141.0) * exp(-abs(p.x) * 1.87) * 0.29;
        vec2 diagonal = mat2(0.91, 0.41, -0.41, 0.91) * p;
        float rays = (exp(-abs(diagonal.x) * 74.0) + exp(-abs(diagonal.y) * 86.0))
                    * exp(-r * 5.9) * 0.61;
        vec3 rimDistance = (vec3(r) - vec3(0.415, 0.431, 0.453) - strike * 0.054) * 37.0;
        vec3 rim = exp(-rimDistance * rimDistance) * 0.042;
        float exposure = (1.14 * starGlow + strike * 2.65) * lit;
        float edge = (1.0 - smoothstep(0.70, 1.0, abs(coordinates.x))) * (1.0 - smoothstep(0.68, 1.0, abs(p.y)));
        vec3 gold = vec3(1.0, 0.73, 0.39);
        vec3 lightColor = vec3(1.0, 0.93, 0.78) * core + gold * (halo + rays);
        lightColor += vec3(0.67, 0.80, 1.0) * axis + rim;
        lightColor *= exposure;
        float opacity = min(1.0, max(lightColor.r, max(lightColor.g, lightColor.b)));
        gl_FragColor = vec4(lightColor / max(opacity, 0.001), opacity * edge);
        #include <colorspace_fragment>
      }`,
  });
  const flare = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), material);
  flare.position.copy(position);
  flare.frustumCulled = false;
  flare.renderOrder = 2;
  tree.add(flare);
}
