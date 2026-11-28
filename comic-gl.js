const ASCII_GLYPHS = '  .,:;-~=+*x#%$@';

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_position = vec2(a_position.x + 1.0, 1.0 - a_position.y) * 0.5;
}`;

const fragmentSource = `
precision highp float;
varying vec2 v_position;
uniform sampler2D u_frame;
uniform sampler2D u_atlas;
uniform vec2 u_corners[4];
uniform vec2 u_size;
uniform vec2 u_pixel;
uniform vec2 u_crop;
uniform vec2 u_cell;
uniform float u_mirror;
uniform float u_opacity;
uniform float u_glitch;
uniform float u_time;
uniform float u_ascii;
uniform float u_glyphCount;

float lightness(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

vec3 edgeMetrics(vec2 pointPx, vec2 fromPx, vec2 toPx, float seed) {
  vec2 edge = toPx - fromPx;
  float len = max(length(edge), 0.01);
  vec2 dir = edge / len;
  vec2 offset = pointPx - fromPx;
  float halfPlane = dir.x * offset.y - dir.y * offset.x;
  float along = dot(offset, dir);
  float clamped = clamp(along, 0.0, len);
  float segDist = length(offset - dir * clamped);

  // Subtle hand-inked pen tremor along each edge, tapering cleanly to zero at corners.
  float t = clamped / len;
  float taper = sin(t * 3.14159265);
  float wave = sin(along * 0.055 + seed) * 0.55
             + sin(along * 0.145 - seed * 1.9) * 0.30
             + sin(along * 0.31 + seed * 3.1) * 0.15;
  return vec3(halfPlane, segDist, wave * taper);
}

float quadDistance(vec2 pointPx, vec2 c0, vec2 c1, vec2 c2, vec2 c3) {
  vec3 e0 = edgeMetrics(pointPx, c0, c1, 0.7);
  vec3 e1 = edgeMetrics(pointPx, c1, c2, 2.3);
  vec3 e2 = edgeMetrics(pointPx, c2, c3, 4.1);
  vec3 e3 = edgeMetrics(pointPx, c3, c0, 5.7);
  float halfPlane = min(min(e0.x, e1.x), min(e2.x, e3.x));
  if (halfPlane >= 0.0) return halfPlane;
  float segDist = min(min(e0.y, e1.y), min(e2.y, e3.y));
  return min(halfPlane, -segDist / 1.75);
}

vec3 comic(vec2 uv, vec2 pos, vec3 original) {
  vec2 delta = u_pixel * 1.65;
  vec3 above = texture2D(u_frame, uv - vec2(0.0, delta.y)).rgb;
  vec3 below = texture2D(u_frame, uv + vec2(0.0, delta.y)).rgb;
  vec3 left = texture2D(u_frame, uv - vec2(delta.x, 0.0)).rgb;
  vec3 right = texture2D(u_frame, uv + vec2(delta.x, 0.0)).rgb;
  vec3 softened = (4.0 * original + above + below + left + right) * 0.125;
  float tone = lightness(softened);
  float contour = length(vec2(lightness(right - left), lightness(below - above)));

  vec3 ink = vec3(0.075, 0.055, 0.16);
  vec3 violet = vec3(0.29, 0.22, 0.61);
  vec3 pink = vec3(0.81, 0.27, 0.49);
  vec3 amber = vec3(1.0, 0.61, 0.30);
  vec3 paper = vec3(1.0, 0.91, 0.67);
  vec3 color = mix(ink, violet, smoothstep(0.12, 0.16, tone));
  color = mix(color, pink, smoothstep(0.34, 0.38, tone));
  color = mix(color, amber, smoothstep(0.55, 0.60, tone));
  color = mix(color, paper, smoothstep(0.77, 0.81, tone));

  // The dot pattern is fixed to the frame, so it moves smoothly through the mask.
  vec2 p = pos * u_size;
  vec2 rotated = vec2(p.x + p.y, p.y - p.x) * 0.7071;
  vec2 cell = fract(rotated / max(5.0, u_size.x * 0.007)) - 0.5;
  float dotRadius = mix(0.38, 0.09, tone);
  float printDot = 1.0 - smoothstep(dotRadius - 0.07, dotRadius + 0.045, length(cell));
  color = mix(color, ink, printDot * 0.65);
  return mix(color, ink, smoothstep(0.07, 0.25, contour) * 0.94);
}

vec4 evaluateStage(vec2 pos) {
  vec2 uv = (pos - 0.5) * u_crop + 0.5;
  uv.x = mix(uv.x, 1.0 - uv.x, u_mirror);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4(0.04, 0.05, 0.09, 0.0);
  }
  vec3 original = texture2D(u_frame, uv).rgb;
  if (u_glitch > 0.005) {
    float band = floor(pos.y * 26.0);
    float bandNoise = fract(sin(band * 127.1 + floor(u_time * 15.0) * 311.7) * 43758.5453);
    float sliceShift = step(0.87 - u_glitch * 0.14, bandNoise) * (bandNoise - 0.5) * 0.055 * u_glitch;
    float rgbSplit = (0.0015 + u_glitch * 0.013);
    vec2 uvR = clamp(uv + vec2(sliceShift + rgbSplit, 0.0), 0.0, 1.0);
    vec2 uvG = clamp(uv + vec2(sliceShift, 0.0), 0.0, 1.0);
    vec2 uvB = clamp(uv + vec2(sliceShift - rgbSplit, 0.0), 0.0, 1.0);
    original = vec3(
      texture2D(u_frame, uvR).r,
      texture2D(u_frame, uvG).g,
      texture2D(u_frame, uvB).b
    );
    float scanline = 1.0 - 0.10 * u_glitch * step(0.5, fract(pos.y * u_size.y * 0.25));
    original *= scanline;
  }
  if (u_opacity <= 0.0) {
    return vec4(original, 0.0);
  }

  vec2 p = pos * u_size;
  vec2 c0 = u_corners[0] * u_size;
  vec2 c1 = u_corners[1] * u_size;
  vec2 c2 = u_corners[2] * u_size;
  vec2 c3 = u_corners[3] * u_size;

  vec2 center = (c0 + c1 + c2 + c3) * 0.25;
  float inradius = max(0.0, quadDistance(center, c0, c1, c2, c3));
  float unit = max(min(u_size.x, u_size.y) / 720.0, 0.65) * clamp(inradius / 70.0, 0.28, 1.0);

  vec3 e0 = edgeMetrics(p, c0, c1, 0.7);
  vec3 e1 = edgeMetrics(p, c1, c2, 2.3);
  vec3 e2 = edgeMetrics(p, c2, c3, 4.1);
  vec3 e3 = edgeMetrics(p, c3, c0, 5.7);

  float minSeg = min(min(e0.y, e1.y), min(e2.y, e3.y));
  float outerWobble = 0.85 * unit;
  float innerWobble = 0.35 * unit;

  float outerHalf = min(
    min(e0.x + e0.z * outerWobble, e1.x + e1.z * outerWobble),
    min(e2.x + e2.z * outerWobble, e3.x + e3.z * outerWobble)
  );
  float outerDist = outerHalf >= 0.0 ? outerHalf : min(outerHalf, -minSeg / 1.75);

  float innerDist = min(
    min(e0.x - e0.z * innerWobble, e1.x - e1.z * innerWobble),
    min(e2.x - e2.z * innerWobble, e3.x - e3.z * innerWobble)
  );

  float outerExtent = 3.8 * unit;
  float paperStart = 1.5 * unit;
  float innerInkStart = 5.0 * unit;
  float comicStart = 7.0 * unit;
  float aa = 0.9;

  vec2 shadowOffset = vec2(7.0, 8.0) * unit;
  float shadowDist = quadDistance(p - shadowOffset, c0, c1, c2, c3);

  if (outerDist < -(outerExtent + aa) && shadowDist < -(outerExtent + aa)) {
    return vec4(original, 0.0);
  }

  vec3 frameInk = vec3(0.055, 0.04, 0.125);
  vec3 framePaper = vec3(1.0, 0.96, 0.84);

  float outerMask = smoothstep(-outerExtent - aa, -outerExtent + aa, outerDist);
  float shadowMask = smoothstep(-outerExtent - aa, -outerExtent + aa, shadowDist) * (1.0 - outerMask);

  vec3 color = original;
  float inPanel = 0.0;
  if (shadowMask > 0.0) {
    vec2 rotShadow = vec2(p.x + p.y, p.y - p.x) * 0.7071;
    vec2 shadowCell = fract(rotShadow / max(4.5, u_size.x * 0.0058)) - 0.5;
    float shadowDot = 1.0 - smoothstep(0.24, 0.34, length(shadowCell));
    float shadowAlpha = mix(0.76, 0.92, shadowDot) * shadowMask * u_opacity;
    color = mix(color, frameInk, shadowAlpha);
  }

  if (outerMask > 0.0) {
    float paperMask = smoothstep(paperStart - aa, paperStart + aa, innerDist);
    float innerInkMask = smoothstep(innerInkStart - aa, innerInkStart + aa, innerDist);
    float comicMask = smoothstep(comicStart - aa, comicStart + aa, innerDist);

    vec3 panelColor = frameInk;
    panelColor = mix(panelColor, framePaper, paperMask);
    panelColor = mix(panelColor, frameInk, innerInkMask);
    if (comicMask > 0.0) {
      panelColor = mix(panelColor, comic(uv, pos, original), comicMask);
    }
    color = mix(color, panelColor, outerMask * u_opacity);
    inPanel = outerMask * u_opacity;
  }

  return vec4(color, inPanel);
}

void main() {
  if (u_ascii < 0.5) {
    vec4 stageCol = evaluateStage(v_position);
    gl_FragColor = vec4(stageCol.rgb, 1.0);
    return;
  }

  // Real-time GPU ASCII terminal rendering with rich color fidelity, glitch tear & comic panel contrast
  vec2 cells = max(vec2(28.0), floor(u_size / u_cell));
  vec2 cellIndex = floor(v_position * cells);
  vec2 cellPos = (cellIndex + 0.5) / cells;
  vec2 localUv = fract(v_position * cells);

  vec4 cMain = evaluateStage(cellPos);
  vec2 delta = 0.25 / cells;
  vec3 cA = evaluateStage(clamp(cellPos + vec2(-delta.x, -delta.y), 0.0, 1.0)).rgb;
  vec3 cB = evaluateStage(clamp(cellPos + vec2( delta.x,  delta.y), 0.0, 1.0)).rgb;
  vec3 col = mix((cMain.rgb * 2.0 + cA + cB) * 0.25, max(cMain.rgb, max(cA, cB)), 0.28);

  float luma = lightness(col);
  float hash = fract(sin(dot(cellIndex, vec2(127.1, 311.7))) * 43758.5453);
  float shimmer = sin(u_time * 3.4 + hash * 6.28318) * (0.022 + u_glitch * 0.08);
  float mapped = clamp(pow(max(0.0, luma + shimmer), 0.88) * 1.12, 0.0, 0.999);
  float idx = floor(mapped * u_glyphCount);

  vec2 atlasUv = vec2((idx + clamp(localUv.x, 0.02, 0.98)) / u_glyphCount, clamp(localUv.y, 0.02, 0.98));
  float mask = texture2D(u_atlas, atlasUv).r;

  // Keep comic-panel cells vividly saturated; outside has sleek cyber-obsidian terminal grading
  float satBoost = mix(1.18, 1.38, cMain.a);
  vec3 vivid = mix(vec3(luma), col, satBoost);
  vec3 coolTint = mix(vec3(0.76, 0.92, 1.08), vec3(1.06, 1.0, 0.96), cMain.a);
  vec3 glyphColor = clamp(vivid * coolTint * 1.24, 0.0, 1.35);

  vec2 vig = (v_position - 0.5) * vec2(1.15, 1.05);
  vec3 terminalBg = mix(vec3(0.020, 0.028, 0.056), vec3(0.052, 0.068, 0.118), exp(-dot(vig, vig) * 2.4));
  vec3 cellGlow = glyphColor * (0.085 + 0.07 * cMain.a) * luma;
  float scan = 0.96 + 0.04 * sin(v_position.y * u_size.y * 1.5);
  vec3 outColor = (terminalBg + cellGlow + glyphColor * mask * 1.08) * scan;
  gl_FragColor = vec4(outColor, 1.0);
}`;

function createAsciiAtlas() {
  const cellW = 48;
  const cellH = 64;
  const canvas = Object.assign(document.createElement('canvas'), {
    width: cellW * ASCII_GLYPHS.length,
    height: cellH,
  });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 48px "SF Mono", Menlo, Consolas, "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < ASCII_GLYPHS.length; i++) {
    ctx.fillText(ASCII_GLYPHS[i], i * cellW + cellW * 0.5, cellH * 0.53);
  }
  return canvas;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

export function coveringCrop(frameWidth, frameHeight, sourceWidth, sourceHeight) {
  const ratio = (frameWidth / frameHeight) / (sourceWidth / sourceHeight);
  return [Math.min(1, ratio), Math.min(1, 1 / ratio)];
}

export function containingCrop(frameWidth, frameHeight, sourceWidth, sourceHeight) {
  const ratio = (frameWidth / frameHeight) / (sourceWidth / sourceHeight);
  return [Math.max(1, ratio), Math.max(1, 1 / ratio)];
}

export function createComicRenderer(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, depth: false, antialias: false });
  if (!gl) throw new Error('WebGL is unavailable');

  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  // Texture unit 0: video/demo source frame
  const frameTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, frameTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Texture unit 1: GPU ASCII glyph atlas
  const atlasTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, createAsciiAtlas());

  gl.uniform1i(gl.getUniformLocation(program, 'u_frame'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_atlas'), 1);
  gl.uniform1f(gl.getUniformLocation(program, 'u_glyphCount'), ASCII_GLYPHS.length);

  const cornersLocation = gl.getUniformLocation(program, 'u_corners[0]');
  const sizeLocation = gl.getUniformLocation(program, 'u_size');
  const pixelLocation = gl.getUniformLocation(program, 'u_pixel');
  const cropLocation = gl.getUniformLocation(program, 'u_crop');
  const cellLocation = gl.getUniformLocation(program, 'u_cell');
  const mirrorLocation = gl.getUniformLocation(program, 'u_mirror');
  const opacityLocation = gl.getUniformLocation(program, 'u_opacity');
  const glitchLocation = gl.getUniformLocation(program, 'u_glitch');
  const timeLocation = gl.getUniformLocation(program, 'u_time');
  const asciiLocation = gl.getUniformLocation(program, 'u_ascii');
  const coordinates = new Float32Array(8);
  let uploaded = null;
  let uploadedTime = -1;

  return function render(source, crop, corners, opacity, mirror = false, glitch = 0, timeSec = 0, ascii = 0) {
    const sourceTime = source.currentTime ?? 0;
    if (source !== uploaded || sourceTime !== uploadedTime) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, frameTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      const width = source.videoWidth ?? source.naturalWidth;
      const height = source.videoHeight ?? source.naturalHeight;
      gl.uniform2f(pixelLocation, 1 / width, 1 / height);
      uploaded = source;
      uploadedTime = sourceTime;
    }

    const cellBase = Math.max(7.5, Math.min(13.5, Math.min(canvas.width, canvas.height) / 76));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(sizeLocation, canvas.width, canvas.height);
    gl.uniform2f(cropLocation, crop[0], crop[1]);
    gl.uniform2f(cellLocation, cellBase * 0.74, cellBase * 1.12);
    gl.uniform1f(mirrorLocation, Number(mirror));
    gl.uniform1f(opacityLocation, opacity);
    gl.uniform1f(glitchLocation, glitch);
    gl.uniform1f(timeLocation, timeSec);
    gl.uniform1f(asciiLocation, Number(ascii));
    corners.forEach(([x, y], index) => {
      coordinates[index * 2] = x;
      coordinates[index * 2 + 1] = y;
    });
    gl.uniform2fv(cornersLocation, coordinates);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}
