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
uniform vec2 u_corners[4];
uniform vec2 u_size;
uniform vec2 u_pixel;
uniform vec2 u_crop;
uniform float u_mirror;
uniform float u_opacity;

float lightness(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float edgeDistance(vec2 point, vec2 from, vec2 to) {
  vec2 edge = (to - from) * u_size;
  vec2 offset = (point - from) * u_size;
  return (edge.x * offset.y - edge.y * offset.x) / max(length(edge), 0.01);
}

vec3 comic(vec2 uv, vec3 original) {
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
  vec2 p = v_position * u_size;
  vec2 rotated = vec2(p.x + p.y, p.y - p.x) * 0.7071;
  vec2 cell = fract(rotated / max(5.0, u_size.x * 0.007)) - 0.5;
  float dotRadius = mix(0.38, 0.09, tone);
  float printDot = 1.0 - smoothstep(dotRadius - 0.07, dotRadius + 0.045, length(cell));
  color = mix(color, ink, printDot * 0.65);
  return mix(color, ink, smoothstep(0.07, 0.25, contour) * 0.94);
}

void main() {
  vec2 uv = (v_position - 0.5) * u_crop + 0.5;
  uv.x = mix(uv.x, 1.0 - uv.x, u_mirror);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.086, 0.082, 0.129, 1.0);
    return;
  }
  vec3 original = texture2D(u_frame, uv).rgb;
  float distanceToEdge = min(
    min(edgeDistance(v_position, u_corners[0], u_corners[1]), edgeDistance(v_position, u_corners[1], u_corners[2])),
    min(edgeDistance(v_position, u_corners[2], u_corners[3]), edgeDistance(v_position, u_corners[3], u_corners[0]))
  );

  if (u_opacity <= 0.0 || distanceToEdge < -1.25) {
    gl_FragColor = vec4(original, 1.0);
    return;
  }
  float mask = smoothstep(-0.8, 1.25, distanceToEdge) * u_opacity;
  vec3 color = mix(original, comic(uv, original), mask);
  gl_FragColor = vec4(color, 1.0);
}`;

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

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const cornersLocation = gl.getUniformLocation(program, 'u_corners[0]');
  const sizeLocation = gl.getUniformLocation(program, 'u_size');
  const pixelLocation = gl.getUniformLocation(program, 'u_pixel');
  const cropLocation = gl.getUniformLocation(program, 'u_crop');
  const mirrorLocation = gl.getUniformLocation(program, 'u_mirror');
  const opacityLocation = gl.getUniformLocation(program, 'u_opacity');
  const coordinates = new Float32Array(8);
  let uploaded = null;
  let uploadedTime = -1;

  return function render(source, crop, corners, opacity, mirror = false) {
    const sourceTime = source.currentTime ?? 0;
    if (source !== uploaded || sourceTime !== uploadedTime) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      const width = source.videoWidth ?? source.naturalWidth;
      const height = source.videoHeight ?? source.naturalHeight;
      gl.uniform2f(pixelLocation, 1 / width, 1 / height);
      uploaded = source;
      uploadedTime = sourceTime;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(sizeLocation, canvas.width, canvas.height);
    gl.uniform2f(cropLocation, crop[0], crop[1]);
    gl.uniform1f(mirrorLocation, Number(mirror));
    gl.uniform1f(opacityLocation, opacity);
    corners.forEach(([x, y], index) => {
      coordinates[index * 2] = x;
      coordinates[index * 2 + 1] = y;
    });
    gl.uniform2fv(cornersLocation, coordinates);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}
