import * as THREE from 'three';

export function createBloom(renderer) {
  const type = renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const sceneColor = new THREE.WebGLRenderTarget(1, 1, { type });
  sceneColor.samples = Math.min(2, renderer.capabilities.maxSamples);
  const smallTarget = () => new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: false });
  const highlights = smallTarget();
  const horizontal = smallTarget();
  const blurred = smallTarget();
  const screen = new THREE.Scene();
  const camera = new THREE.Camera();

  function material(uniforms, fragmentShader) {
    return new THREE.ShaderMaterial({
      uniforms, fragmentShader, depthTest: false, depthWrite: false,
      vertexShader: `
        varying vec2 coordinates;
        void main() {
          coordinates = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
    });
  }

  const extract = material({
    image: { value: sceneColor.texture },
    stepSize: { value: new THREE.Vector2() },
    threshold: { value: type === THREE.HalfFloatType ? .66 : .51 },
  }, `
    varying vec2 coordinates;
    uniform sampler2D image;
    uniform vec2 stepSize;
    uniform float threshold;

    vec3 highlight(vec2 uv) {
      vec3 color = texture2D(image, uv).rgb;
      float peak = max(color.r, max(color.g, color.b));
      return min(color, 3.0) * smoothstep(threshold, threshold + 0.46, peak);
    }

    void main() {
      vec3 light = highlight(coordinates) * 0.28;
      light += highlight(coordinates + stepSize) * 0.18;
      light += highlight(coordinates - stepSize) * 0.18;
      light += highlight(coordinates + stepSize * vec2(1.0, -1.0)) * 0.18;
      light += highlight(coordinates + stepSize * vec2(-1.0, 1.0)) * 0.18;
      gl_FragColor = vec4(light, 1.0);
    }`);

  const blur = material({
    image: { value: null },
    stepSize: { value: new THREE.Vector2() },
  }, `
    varying vec2 coordinates;
    uniform sampler2D image;
    uniform vec2 stepSize;

    void main() {
      vec3 light = texture2D(image, coordinates).rgb * 0.155;
      light += (texture2D(image, coordinates + stepSize * 1.44).rgb
              + texture2D(image, coordinates - stepSize * 1.44).rgb) * 0.258;
      light += (texture2D(image, coordinates + stepSize * 3.37).rgb
              + texture2D(image, coordinates - stepSize * 3.37).rgb) * 0.134;
      light += (texture2D(image, coordinates + stepSize * 5.25).rgb
              + texture2D(image, coordinates - stepSize * 5.25).rgb) * 0.0305;
      gl_FragColor = vec4(light, 1.0);
    }`);

  const output = material({
    image: { value: sceneColor.texture },
    bloom: { value: blurred.texture },
    amount: { value: 0 },
  }, `
    varying vec2 coordinates;
    uniform sampler2D image, bloom;
    uniform float amount;

    void main() {
      vec4 original = texture2D(image, coordinates);
      vec3 scattered = texture2D(bloom, coordinates).rgb;
      gl_FragColor = vec4(original.rgb + scattered * amount, original.a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      float peak = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b));
      gl_FragColor.a = max(original.a, peak);
    }`);

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), extract);
  quad.frustumCulled = false;
  screen.add(quad);

  function pass(shader, target) {
    quad.material = shader;
    renderer.setRenderTarget(target);
    renderer.render(screen, camera);
  }

  return {
    resize(width, height) {
      sceneColor.setSize(width, height);
      const smallWidth = Math.max(1, Math.round(width * .29));
      const smallHeight = Math.max(1, Math.round(height * .29));
      for (const target of [highlights, horizontal, blurred]) target.setSize(smallWidth, smallHeight);
      extract.uniforms.stepSize.value.set(.30 / smallWidth, .30 / smallHeight);
    },
    render(scene, view, progress) {
      renderer.setRenderTarget(sceneColor);
      renderer.render(scene, view);
      if (progress > 0) {
        pass(extract, highlights);
        blur.uniforms.image.value = highlights.texture;
        blur.uniforms.stepSize.value.set(1 / highlights.width, 0);
        pass(blur, horizontal);
        blur.uniforms.image.value = horizontal.texture;
        blur.uniforms.stepSize.value.set(0, 1 / highlights.height);
        pass(blur, blurred);
      }
      output.uniforms.amount.value = progress > 0 ? .79 * THREE.MathUtils.smoothstep(progress, 0, .08) : 0;
      pass(output, null);
    },
  };
}
