import * as THREE from 'three';

export function addAurora(scene, camera) {
  const uniforms = {
    clock: { value: 0 },
    parallax: { value: 0 },
  };
  const aurora = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 sky;
      void main() {
        sky = uv;
        gl_Position = vec4(position.xy, 0.99999, 1.0);
      }`,
    fragmentShader: `
      varying vec2 sky;
      uniform float clock, parallax;

      float hash(float x) {
        return fract(sin(x * 113.7) * 43758.54);
      }

      float noise(float x) {
        float f = fract(x);
        return mix(hash(floor(x)), hash(floor(x) + 1.0), f * f * (3.0 - 2.0 * f));
      }

      vec3 curtain(float x, float y, float time, float phase, vec3 foot, vec3 middle, vec3 tip) {
        float flow = x + 0.045 * sin(x * 7.1 + time * 0.72 + phase);
        float arc = 0.106 * sin(flow * 7.6 - time * 0.63 + phase)
                  + 0.051 * sin(x * 16.4 + time * 0.89 + phase * 1.4)
                  + 0.023 * sin(x * 28.1 - time * 0.74 + phase);
        float distance = y - arc - (0.67 + 0.17 * (x - 0.5));
        float folds = noise(x * 18.3 - time * 1.32 + phase * 4.2);
        float threads = noise(flow * 135.0 + folds * 7.0 + time * 2.6 + phase);
        float pulse = 0.5 + 0.5 * sin(flow * 14.2 - time * 1.85 + 1.7 * folds + phase);
        float surge = pulse * pulse;
        float height = 0.071 + 0.137 * folds + 0.064 * surge;
        float veil = smoothstep(-0.040, 0.015, distance) * (1.0 - smoothstep(0.018, height, distance));
        float toe = distance * (31.0 + 8.0 * folds);
        float rim = exp(-toe * toe) * (0.26 + 0.47 * surge);
        float filament = 0.24 + 0.34 * folds + 0.24 * threads + 0.27 * surge;
        float blend = smoothstep(-0.016, height * 0.65, distance);
        vec3 tint = mix(foot, middle, blend);
        tint = mix(tint, tip, smoothstep(height * 0.35, height, distance) * (0.68 + surge * 0.32));
        return tint * (rim + veil) * filament;
      }

      void main() {
        float x = sky.x + parallax;
        float y = sky.y;
        float envelope = smoothstep(0.30, 0.48, y) * (1.0 - smoothstep(0.92, 1.0, y));
        if (envelope < 0.001) discard;

        vec3 teal = curtain(x, y, clock, 0.68,
          vec3(0.047, 0.67, 0.44), vec3(0.068, 0.52, 0.79), vec3(0.29, 0.18, 0.71));
        vec3 blue = curtain(1.0 - x + 0.07, y + 0.062, clock * -0.71, 2.57,
          vec3(0.11, 0.36, 0.79), vec3(0.27, 0.23, 0.71), vec3(0.47, 0.16, 0.62));
        float blueWeight = 0.44 + 0.23 * sin(x * 3.7 + clock * 0.55 + 1.7);
        float tealWeight = 0.61 + 0.21 * sin(x * 5.0 - clock * 0.48);
        float hazeCenter = y - 0.69 + 0.067 * sin(x * 6.0 - clock * 0.37);
        vec3 haze = vec3(0.059, 0.24, 0.47) * exp(-hazeCenter * hazeCenter * 24.0);
        vec3 light = (teal * tealWeight + blue * blueWeight + haze * 0.24) * envelope;
        float opacity = max(light.r, max(light.g, light.b));
        gl_FragColor = vec4(light / max(0.001, opacity), opacity * 0.59);
        #include <colorspace_fragment>
      }`,
  }));
  aurora.frustumCulled = false;
  aurora.renderOrder = -12;
  // The floor's reflection camera uses the default layer.
  aurora.layers.set(1);
  camera.layers.enable(1);
  scene.add(aurora);

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  return (time, yaw) => {
    uniforms.clock.value = motion.matches ? 0 : time;
    uniforms.parallax.value = motion.matches ? 0 : Math.sin(yaw) * .036;
  };
}
