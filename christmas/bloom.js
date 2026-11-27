import * as THREE from 'three';

// 16 luminance-density fill glyphs (0..15) + 4 silhouette edge glyphs (16..19: | - / \)
const FILL_GLYPHS = '  .,:;-~=+*x#%$@';
const EDGE_GLYPHS = '|-/\\';
const ALL_GLYPHS = FILL_GLYPHS + EDGE_GLYPHS;

function createAsciiAtlas() {
  const cellW = 48;
  const cellH = 64;
  const canvas = Object.assign(document.createElement('canvas'), {
    width: cellW * ALL_GLYPHS.length,
    height: cellH,
  });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 50px "SF Mono", Menlo, Consolas, "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < ALL_GLYPHS.length; i++) {
    ctx.fillText(ALL_GLYPHS[i], i * cellW + cellW * 0.5, cellH * 0.53);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createBloom(renderer) {
  const type = renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const sceneColor = new THREE.WebGLRenderTarget(1, 1, { type });
  sceneColor.samples = Math.min(2, renderer.capabilities.maxSamples);

  // Dedicated non-MSAA render target with real WebGL DepthTexture for true 3D volumetric ASCII depth
  const asciiDepth = new THREE.DepthTexture(1, 1);
  const asciiScene = new THREE.WebGLRenderTarget(1, 1, {
    type,
    depthBuffer: true,
    depthTexture: asciiDepth,
  });

  const smallTarget = () => new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: false });
  const highlights = smallTarget();
  const horizontal = smallTarget();
  const blurred = smallTarget();
  const screen = new THREE.Scene();
  const camera = new THREE.Camera();
  const asciiAtlas = createAsciiAtlas();

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
    depthMap: { value: asciiDepth },
    bloom: { value: blurred.texture },
    amount: { value: 0 },
    ascii: { value: 0 },
    atlas: { value: asciiAtlas },
    totalGlyphs: { value: ALL_GLYPHS.length },
    fillCount: { value: FILL_GLYPHS.length },
    resolution: { value: new THREE.Vector2(1, 1) },
    cellSize: { value: new THREE.Vector2(7.4, 11.4) },
    clock: { value: 0 },
    cameraNear: { value: 0.12 },
    cameraFar: { value: 84.0 },
    cameraDist: { value: 14.1 },
  }, `
    varying vec2 coordinates;
    uniform sampler2D image, depthMap, bloom, atlas;
    uniform float amount, ascii, totalGlyphs, fillCount, clock;
    uniform float cameraNear, cameraFar, cameraDist;
    uniform vec2 resolution, cellSize;

    vec3 acesApprox(vec3 x) {
      x *= 1.16;
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }

    float linearDepth(float raw) {
      float z = raw * 2.0 - 1.0;
      return (2.0 * cameraNear * cameraFar) / max(0.001, (cameraFar + cameraNear - z * (cameraFar - cameraNear)));
    }

    float lumaOf(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    vec4 sampleColor(vec2 uv) {
      vec4 orig = texture2D(image, uv);
      vec3 sc = texture2D(bloom, uv).rgb;
      vec3 linearCol = orig.rgb + sc * amount;
      return vec4(pow(acesApprox(linearCol), vec3(1.0 / 2.2)), orig.a);
    }

    void main() {
      if (ascii < 0.5) {
        vec4 original = texture2D(image, coordinates);
        vec3 scattered = texture2D(bloom, coordinates).rgb;
        gl_FragColor = vec4(original.rgb + scattered * amount, original.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float peak = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b));
        gl_FragColor.a = max(original.a, peak);
        return;
      }

      vec2 cells = max(vec2(22.0), floor(resolution / cellSize));
      vec2 cellIndex = floor(coordinates * cells);
      vec2 cellUv = (cellIndex + 0.5) / cells;
      vec2 localUv = fract(coordinates * cells);
      vec2 stepCell = 1.0 / cells;
      vec2 delta = 0.24 * stepCell;

      // 4-tap supersample for crisp needles, snow, and fireworks
      vec4 s0 = sampleColor(cellUv + vec2(-delta.x, -delta.y));
      vec4 s1 = sampleColor(cellUv + vec2( delta.x, -delta.y));
      vec4 s2 = sampleColor(cellUv + vec2(-delta.x,  delta.y));
      vec4 s3 = sampleColor(cellUv + vec2( delta.x,  delta.y));
      vec3 avgCol = (s0.rgb + s1.rgb + s2.rgb + s3.rgb) * 0.25;
      vec3 peakCol = max(max(s0.rgb, s1.rgb), max(s2.rgb, s3.rgb));
      vec3 col = mix(avgCol, peakCol, 0.36);

      // True 3D depth (take nearest surface inside cell so foreground branches/gifts win cleanly)
      float d0 = texture2D(depthMap, cellUv + vec2(-delta.x, -delta.y)).r;
      float d1 = texture2D(depthMap, cellUv + vec2( delta.x, -delta.y)).r;
      float d2 = texture2D(depthMap, cellUv + vec2(-delta.x,  delta.y)).r;
      float d3 = texture2D(depthMap, cellUv + vec2( delta.x,  delta.y)).r;
      float zCenter = linearDepth(min(min(d0, d1), min(d2, d3)));

      // Neighbor depths for real 3D normal/curvature relief and true silhouette-only contours
      float zL = linearDepth(texture2D(depthMap, cellUv + vec2(-stepCell.x, 0.0)).r);
      float zR = linearDepth(texture2D(depthMap, cellUv + vec2( stepCell.x, 0.0)).r);
      float zU = linearDepth(texture2D(depthMap, cellUv + vec2(0.0,  stepCell.y)).r);
      float zD = linearDepth(texture2D(depthMap, cellUv + vec2(0.0, -stepCell.y)).r);

      // Separate solid 3D foreground geometry (tree, ornaments, gifts, star) from deep space & aurora
      float isSolid3D = 1.0 - smoothstep(cameraDist + 4.8, cameraDist + 12.0, zCenter);
      // True front-to-back 3D proximity across the Christmas tree cone & foreground gift boxes
      // Front tips (~cameraDist - 2.3) -> 1.0, center (~cameraDist) -> 0.5, back (~cameraDist + 2.3) -> 0.0
      float frontFactor = 1.0 - smoothstep(cameraDist - 2.45, cameraDist + 2.45, zCenter);

      // Estimate 3D surface slope/normal from depth gradient for sculptural directional key lighting
      float dzx = clamp(zR - zL, -1.6, 1.6);
      float dzy = clamp(zU - zD, -1.6, 1.6);
      vec3 approxNormal = normalize(vec3(dzx * 1.15, dzy * 1.15, 0.85));
      vec3 keyDir = normalize(vec3(-0.55, 0.62, 0.72));
      float ndotl = clamp(dot(approxNormal, keyDir), 0.0, 1.0);
      float depthRim = pow(1.0 - max(0.0, approxNormal.z), 2.2) * isSolid3D;

      float rawLuma = lumaOf(col);
      // Distinguish bright non-depth emissives (snowflakes, fireworks, star flare, floor light) from dim distant aurora
      float bloomPeak = lumaOf(pow(acesApprox(texture2D(bloom, cellUv).rgb * amount), vec3(1.0 / 2.2)));
      float brightFx = smoothstep(0.40, 0.78, rawLuma) + smoothstep(0.16, 0.45, bloomPeak);
      float fxWeight = clamp(brightFx, 0.0, 1.0);

      // Keep background aurora dreamy and atmospheric — visible without competing with the 3D tree
      float bgAtten = mix(0.42, 0.96, fxWeight);
      float effectiveLuma = rawLuma * mix(bgAtten, 1.0, isSolid3D);

      // Build rich 3D chiaroscuro shading on solid 3D tree & gifts:
      // Front-facing key-lit boughs glow dense & bright; back-curving sides fall into deep cool volume shadow
      float depthCurve = 0.48 + 0.64 * frontFactor;
      float keySculpt = 0.76 + 0.44 * ndotl + 0.22 * depthRim;
      float solidShaded = clamp(rawLuma * depthCurve * keySculpt, 0.0, 1.0);
      // S-curve volumetric contrast
      solidShaded = mix(solidShaded, smoothstep(0.03, 0.92, solidShaded), 0.36);

      float bgClean = max(0.0, (effectiveLuma - 0.048) / 0.952);
      float finalLuma = mix(bgClean, solidShaded, isSolid3D);

      // Subtle twinkle sparkle on illuminated frost & fireworks
      float cellHash = fract(sin(dot(cellIndex, vec2(127.1, 311.7))) * 43758.5453);
      float twinkle = (sin(clock * 3.1 + cellHash * 6.2831) * 0.025) * smoothstep(0.28, 0.85, finalLuma);
      float mapped = clamp(pow(max(0.0, finalLuma + twinkle), 0.86) * 1.05, 0.0, 0.999);
      float idx = floor(mapped * fillCount);

      // Use crisp directional ASCII edge glyphs (| - / \) ONLY on true 3D depth silhouette boundaries
      // (outer tree profile, gift box silhouettes), leaving the interior lushly volume-shaded!
      float depthJumpX = abs(zR - zL);
      float depthJumpY = abs(zU - zD);
      float depthJump = max(depthJumpX, depthJumpY);
      bool onSilhouette = isSolid3D > 0.5 && depthJump > 2.8 && rawLuma < 0.78 && finalLuma > 0.08;
      if (onSilhouette) {
        float gx = zR - zL;
        float gy = zU - zD;
        float angle = mod(atan(gy, gx) + 3.14159265, 3.14159265);
        if (angle < 0.3927 || angle >= 2.7489) idx = fillCount + 0.0;       // |
        else if (angle < 1.1781) idx = fillCount + 3.0;                     // \
        else if (angle < 1.9635) idx = fillCount + 1.0;                     // -
        else idx = fillCount + 2.0;                                         // /
      }

      // True 3D perspective glyph scaling: closer front branches/gifts render bolder (1.10x),
      // farther back/side branches recede smaller (0.76x), creating unmistakable physical 3D roundness!
      float glyphScale = mix(0.84, mix(0.74, 1.10, frontFactor), isSolid3D);
      glyphScale = max(glyphScale, mix(0.84, 1.06, fxWeight));
      vec2 scaledLocal = (localUv - 0.5) / glyphScale + 0.5;
      float inCell = step(0.02, scaledLocal.x) * step(scaledLocal.x, 0.98) * step(0.02, scaledLocal.y) * step(scaledLocal.y, 0.98);
      vec2 atlasUv = vec2((idx + clamp(scaledLocal.x, 0.02, 0.98)) / totalGlyphs, clamp(scaledLocal.y, 0.02, 0.98));
      float glyphMask = texture2D(atlas, atlasUv).r * inCell;

      // Subtle 3D drop-shadow offset behind foreground characters to lift the tree off the background
      vec2 shLocal = (localUv + vec2(-0.11, 0.09) - 0.5) / glyphScale + 0.5;
      float shIn = step(0.02, shLocal.x) * step(shLocal.x, 0.98) * step(0.02, shLocal.y) * step(shLocal.y, 0.98);
      float shadowMask = texture2D(atlas, vec2((idx + clamp(shLocal.x, 0.02, 0.98)) / totalGlyphs, clamp(shLocal.y, 0.02, 0.98))).r * shIn;

      // Color grading: warm-bright front highlights, cool atmospheric blue-indigo depth shadow on receding back!
      vec3 vivid = mix(vec3(rawLuma), col, mix(1.15, 1.38, isSolid3D));
      vec3 depthTint = mix(vec3(0.54, 0.72, 1.02), vec3(1.06, 1.04, 1.0), frontFactor);
      vec3 fgColor = vivid * depthTint * (0.62 + 0.78 * frontFactor + 0.30 * ndotl);
      vec3 bgColor = vivid * mix(0.56, 1.16, fxWeight);
      vec3 glyphColor = mix(bgColor, fgColor, isSolid3D);

      // Velvety midnight-blue radial night sky — atmospheric depth without noisy background clutter
      vec2 skyDelta = (coordinates - vec2(0.52, 0.58)) * vec2(1.0, 1.12);
      vec3 voidBg = mix(vec3(0.012, 0.026, 0.052), vec3(0.040, 0.078, 0.138), exp(-dot(skyDelta, skyDelta) * 2.5));
      vec3 cellGlow = glyphColor * (0.048 * isSolid3D * frontFactor * finalLuma + 0.028 * fxWeight);
      float dropShadow = 1.0 - shadowMask * (1.0 - glyphMask) * 0.72 * isSolid3D;
      float scan = 0.97 + 0.03 * sin(coordinates.y * resolution.y * 1.57);
      vec3 finalCol = ((voidBg + cellGlow) * dropShadow + glyphColor * glyphMask * 1.22) * scan;
      gl_FragColor = vec4(finalCol, 1.0);
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
    resize(width, height, pixelRatio = 1) {
      sceneColor.setSize(width, height);
      asciiScene.setSize(width, height);
      const smallWidth = Math.max(1, Math.round(width * .29));
      const smallHeight = Math.max(1, Math.round(height * .29));
      for (const target of [highlights, horizontal, blurred]) target.setSize(smallWidth, smallHeight);
      extract.uniforms.stepSize.value.set(.30 / smallWidth, .30 / smallHeight);
      output.uniforms.resolution.value.set(width, height);
      output.uniforms.cellSize.value.set(Math.max(6, Math.round(7.4 * pixelRatio)), Math.max(10, Math.round(11.2 * pixelRatio)));
    },
    setAscii(enabled) {
      output.uniforms.ascii.value = enabled ? 1 : 0;
    },
    render(scene, view, progress, time = 0) {
      const isAscii = output.uniforms.ascii.value > 0.5;
      const primaryTarget = isAscii ? asciiScene : sceneColor;
      renderer.setRenderTarget(primaryTarget);
      renderer.render(scene, view);

      extract.uniforms.image.value = primaryTarget.texture;
      output.uniforms.image.value = primaryTarget.texture;

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
      output.uniforms.clock.value = time;
      if (isAscii) {
        output.uniforms.cameraNear.value = view.near;
        output.uniforms.cameraFar.value = view.far;
        output.uniforms.cameraDist.value = view.position.length();
      }
      pass(output, null);
    },
  };
}
