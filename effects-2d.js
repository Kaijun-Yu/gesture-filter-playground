// 60fps 2D Canvas overlay effects:
// 1. Open palm centered volumetric flame + fire eyes
// 2. Romantic hazy heart gesture: soft glowing floating hearts + luminous heart eyes + dreamy head-top heart bubbles & bokeh
// 3. Xiaohongshu / TouchDesigner-style real-time 21-point cyber hand nodes & audio distortion waveform beam

import { FINGERTIP_INDICES, HAND_CONNECTIONS, getPalmCenter } from './gestures.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function drawHeartPath(ctx, cx, cy, size) {
  const s = size;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.72);
  ctx.bezierCurveTo(cx - s * 1.12, cy + s * 0.10, cx - s * 1.08, cy - s * 0.86, cx, cy - s * 0.28);
  ctx.bezierCurveTo(cx + s * 1.08, cy - s * 0.86, cx + s * 1.12, cy + s * 0.10, cx, cy + s * 0.72);
  ctx.closePath();
}

function drawSoftMote(ctx, x, y, r, rgbaCore, rgbaMid, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, rgbaCore);
  grad.addColorStop(0.45, rgbaMid);
  grad.addColorStop(1, 'rgba(255, 160, 200, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Dreamy, hazy, romantic translucent heart (zero hard black outline; rich rose-petal depth + soft film halation).
function drawDreamyHeart(ctx, x, y, size, rotation = 0, alpha = 1, warmth = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;

  // 1. Wide atmospheric rose-peach film halation glow (gentle so it never washes out the heart shape)
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const halo = ctx.createRadialGradient(0, -size * 0.04, size * 0.12, 0, 0, size * 2.25);
  halo.addColorStop(0, warmth > 0.5 ? 'rgba(255, 152, 178, 0.36)' : 'rgba(244, 108, 168, 0.36)');
  halo.addColorStop(0.45, 'rgba(238, 96, 158, 0.16)');
  halo.addColorStop(0.78, 'rgba(198, 102, 194, 0.07)');
  halo.addColorStop(1, 'rgba(235, 90, 150, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, size * 2.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Soft translucent rose-petal heart silhouette (rich blush-crimson depth without cartoon outlines)
  const bodyGrad = ctx.createRadialGradient(
    -size * 0.24, -size * 0.24, size * 0.06,
    0, size * 0.08, size * 1.08,
  );
  if (warmth > 0.5) {
    bodyGrad.addColorStop(0, 'rgba(255, 206, 212, 0.88)');
    bodyGrad.addColorStop(0.32, 'rgba(252, 118, 158, 0.82)');
    bodyGrad.addColorStop(0.72, 'rgba(220, 56, 116, 0.72)');
    bodyGrad.addColorStop(1, 'rgba(168, 34, 92, 0.46)');
  } else {
    bodyGrad.addColorStop(0, 'rgba(255, 198, 224, 0.86)');
    bodyGrad.addColorStop(0.34, 'rgba(246, 104, 164, 0.80)');
    bodyGrad.addColorStop(0.74, 'rgba(212, 48, 118, 0.70)');
    bodyGrad.addColorStop(1, 'rgba(156, 32, 98, 0.44)');
  }

  ctx.save();
  ctx.shadowColor = 'rgba(245, 96, 158, 0.55)';
  ctx.shadowBlur = size * 0.48;
  drawHeartPath(ctx, 0, 0, size);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Subtle luminous champagne-rose rim
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(0.7, size * 0.04);
  ctx.strokeStyle = 'rgba(255, 224, 238, 0.46)';
  ctx.stroke();
  ctx.restore();

  // 3. Delicate off-center silk specular bloom (keeps center rose-pink, not blown-out white)
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const shine = ctx.createRadialGradient(-size * 0.34, -size * 0.28, 0, -size * 0.30, -size * 0.24, size * 0.34);
  shine.addColorStop(0, 'rgba(255, 246, 248, 0.58)');
  shine.addColorStop(0.55, 'rgba(255, 196, 222, 0.18)');
  shine.addColorStop(1, 'rgba(255, 190, 220, 0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(-size * 0.30, -size * 0.24, size * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// Cinematic, rich-color volumetric flame rising strictly from the palm center (avoids white candle blowout).
function drawPalmCoreFlame(ctx, x, y, radius, height, time, phase = 0, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;

  const w1 = Math.sin(time * 9.8 + phase);
  const w2 = Math.cos(time * 15.2 - phase * 1.5);
  const w3 = Math.sin(time * 21.4 + phase * 2.3);

  // 1. Warm bounce glow illuminating the center of the palm
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const baseGlow = ctx.createRadialGradient(0, -height * 0.22, radius * 0.08, 0, -height * 0.16, height * 0.95);
  baseGlow.addColorStop(0, 'rgba(255, 148, 32, 0.58)');
  baseGlow.addColorStop(0.42, 'rgba(240, 64, 14, 0.28)');
  baseGlow.addColorStop(0.78, 'rgba(165, 22, 6, 0.09)');
  baseGlow.addColorStop(1, 'rgba(130, 10, 4, 0)');
  ctx.fillStyle = baseGlow;
  ctx.beginPath();
  ctx.arc(0, -height * 0.16, height * 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Helper to paint an organic S-curling fire lick in rich non-clipped fire colors
  function drawLick(offsetX, rScale, hScale, freqBias, tipSpread, opacity, mode = 'source-over') {
    ctx.save();
    ctx.globalCompositeOperation = mode;
    const r = radius * rScale;
    const h = height * hScale * (0.90 + 0.14 * Math.sin(time * (11.5 + freqBias) + phase + offsetX * 0.1));
    const curlL = Math.sin(time * (13 + freqBias) + phase) * r * 0.58;
    const curlR = Math.cos(time * (14.5 + freqBias) - phase) * r * 0.52;
    const tipX = offsetX * tipSpread + (w1 * 0.52 + w2 * 0.33 + w3 * 0.15) * r * 0.82;
    const tipY = -h;

    const grad = ctx.createLinearGradient(offsetX, r * 0.36, tipX, tipY);
    grad.addColorStop(0, `rgba(255, 186, 46, ${opacity * 0.88})`);
    grad.addColorStop(0.28, `rgba(255, 96, 18, ${opacity * 0.90})`);
    grad.addColorStop(0.66, `rgba(218, 34, 10, ${opacity * 0.68})`);
    grad.addColorStop(0.90, `rgba(148, 14, 6, ${opacity * 0.26})`);
    grad.addColorStop(1, 'rgba(90, 6, 4, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(offsetX, r * 0.38);
    ctx.bezierCurveTo(
      offsetX - r * 1.12, r * 0.22,
      offsetX - r * 0.88 + curlL, -h * 0.44,
      tipX, tipY,
    );
    ctx.bezierCurveTo(
      offsetX + r * 0.88 + curlR, -h * 0.44,
      offsetX + r * 1.12, r * 0.22,
      offsetX, r * 0.38,
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 2. Layered swirling orange-crimson fire silhouette (source-over keeps vivid fire saturation!)
  drawLick(-radius * 0.36, 0.74, 0.72, 2.3, 1.45, 0.82, 'source-over');
  drawLick(radius * 0.36, 0.74, 0.76, -1.9, 1.45, 0.82, 'source-over');
  drawLick(0, 1.02, 1.04, 0, 0.4, 0.92, 'source-over');
  // Flickering dancing upper flame wisps licking off the top
  drawLick(-radius * 0.14, 0.52, 1.18, 3.4, 1.6, 0.52, 'screen');
  drawLick(radius * 0.16, 0.48, 1.14, -2.9, 1.6, 0.50, 'screen');

  // 3. Controlled golden-amber inner flame core (small & warm, never blasting flat white!)
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const coreTipX = (w1 * 0.45 + w2 * 0.35) * radius * 0.34;
  const coreH = height * (0.48 + 0.08 * w2);
  const coreGrad = ctx.createLinearGradient(0, radius * 0.22, coreTipX, -coreH);
  coreGrad.addColorStop(0, 'rgba(255, 248, 200, 0.86)');
  coreGrad.addColorStop(0.45, 'rgba(255, 204, 68, 0.72)');
  coreGrad.addColorStop(1, 'rgba(255, 110, 18, 0)');

  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.moveTo(0, radius * 0.24);
  ctx.bezierCurveTo(-radius * 0.46, radius * 0.10, -radius * 0.30 + w2 * radius * 0.16, -coreH * 0.48, coreTipX, -coreH);
  ctx.bezierCurveTo(radius * 0.30 + w1 * radius * 0.16, -coreH * 0.48, radius * 0.46, radius * 0.10, 0, radius * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function distortionColor(d) {
  if (d < 0.5) {
    const t = d * 2;
    const r = Math.round(lerp(98, 255, t));
    const g = Math.round(lerp(248, 178, t));
    const b = Math.round(lerp(214, 72, t));
    return { main: `rgb(${r}, ${g}, ${b})`, glow: `rgba(${r}, ${g}, ${b}, 0.45)`, r, g, b };
  }
  const t = (d - 0.5) * 2;
  const r = 255;
  const g = Math.round(lerp(178, 46, t));
  const b = Math.round(lerp(72, 128, t));
  return { main: `rgb(${r}, ${g}, ${b})`, glow: `rgba(${r}, ${g}, ${b}, 0.52)`, r, g, b };
}

export function createEffectsOverlay(canvas) {
  const ctx = canvas.getContext('2d');
  const fireParticles = [];
  const sparkParticles = [];
  const heartBubbles = [];
  const romanticDrift = []; // Soft-focus micro hearts & bokeh orbs drifting from fingers & head

  let fireIntensity = 0;
  let heartIntensity = 0;
  let lastTimestamp = 0;
  let bubbleCooldown = 0;
  let driftCooldown = 0;

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function reset() {
    fireParticles.length = 0;
    sparkParticles.length = 0;
    heartBubbles.length = 0;
    romanticDrift.length = 0;
    fireIntensity = 0;
    heartIntensity = 0;
    bubbleCooldown = 0;
    driftCooldown = 0;
    clear();
  }

  function spawnPalmFireParticles(px, py, baseRadius, count, upwardSpeed) {
    for (let i = 0; i < count; i++) {
      if (fireParticles.length >= 320) break;
      const spread = (Math.random() - 0.5) * baseRadius * 0.95;
      fireParticles.push({
        x: px + spread,
        y: py - Math.random() * baseRadius * 0.45,
        originX: px,
        vx: (Math.random() - 0.5) * upwardSpeed * 0.28,
        vy: -upwardSpeed * (0.78 + Math.random() * 0.95),
        radius: baseRadius * (0.44 + Math.random() * 0.58),
        age: 0,
        life: 0.46 + Math.random() * 0.50,
        seed: Math.random() * 100,
      });
    }
    if (Math.random() < 0.85 && sparkParticles.length < 130) {
      sparkParticles.push({
        x: px + (Math.random() - 0.5) * baseRadius * 1.25,
        y: py - Math.random() * baseRadius * 0.85,
        vx: (Math.random() - 0.5) * upwardSpeed * 0.72,
        vy: -upwardSpeed * (1.35 + Math.random() * 1.25),
        size: Math.max(1.5, baseRadius * (0.045 + Math.random() * 0.07)),
        age: 0,
        life: 0.65 + Math.random() * 0.65,
        phase: Math.random() * Math.PI * 2,
        color: Math.random() < 0.45 ? '#fff8d4' : '#ff9d3b',
      });
    }
  }

  function pickVariedScale() {
    // Distinct small / medium / large tiers so floating bubbles & hearts have rich depth contrast.
    const roll = Math.random();
    if (roll < 0.42) return 0.075 + Math.random() * 0.055; // small delicate
    if (roll < 0.80) return 0.145 + Math.random() * 0.085; // medium
    return 0.25 + Math.random() * 0.11;                    // large foreground dreamy
  }

  function spawnHeadBubble(headX, headY, spreadPx, scalePx) {
    if (heartBubbles.length >= 28) return;
    const sizeFactor = pickVariedScale();
    const radius = scalePx * sizeFactor;
    // Smaller bubbles drift slightly faster; large dreamy bubbles float languidly.
    const speedFactor = lerp(0.50, 0.20, clamp((sizeFactor - 0.075) / 0.28, 0, 1));
    heartBubbles.push({
      x: headX + (Math.random() - 0.5) * spreadPx,
      y: headY + (Math.random() - 0.5) * scalePx * 0.26,
      vx: (Math.random() - 0.5) * scalePx * 0.26,
      vy: -scalePx * (speedFactor + Math.random() * 0.14),
      radius,
      age: 0,
      life: 2.3 + Math.random() * 1.5,
      swayAmp: scalePx * (0.10 + Math.random() * 0.18),
      swayFreq: 1.2 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      warmth: Math.random(),
    });
  }

  function spawnHeadHeart(headX, headY, spreadPx, scalePx) {
    if (romanticDrift.length >= 90) return;
    const sizeFactor = pickVariedScale() * 0.86;
    const speedFactor = lerp(0.46, 0.20, clamp((sizeFactor - 0.06) / 0.25, 0, 1));
    romanticDrift.push({
      kind: 'mini-heart',
      x: headX + (Math.random() - 0.5) * spreadPx * 1.15,
      y: headY + (Math.random() - 0.5) * scalePx * 0.26,
      vx: (Math.random() - 0.5) * scalePx * 0.24,
      vy: -scalePx * (speedFactor + Math.random() * 0.14),
      size: scalePx * sizeFactor,
      age: 0,
      life: 2.2 + Math.random() * 1.4,
      swayAmp: scalePx * (0.10 + Math.random() * 0.16),
      swayFreq: 1.3 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      warmth: Math.random(),
    });
  }

  function spawnRomanticDrift(x, y, spreadPx, scalePx, kind = 'bokeh') {
    if (romanticDrift.length >= 90) return;
    const sizeFactor = kind === 'mini-heart' ? pickVariedScale() * 0.65 : (0.06 + Math.random() * 0.14);
    romanticDrift.push({
      kind, // 'bokeh' | 'mini-heart'
      x: x + (Math.random() - 0.5) * spreadPx,
      y: y + (Math.random() - 0.5) * spreadPx * 0.35,
      vx: (Math.random() - 0.5) * scalePx * 0.22,
      vy: -scalePx * (0.24 + Math.random() * 0.32),
      size: scalePx * sizeFactor,
      age: 0,
      life: 1.5 + Math.random() * 1.4,
      swayAmp: scalePx * (0.08 + Math.random() * 0.12),
      swayFreq: 1.4 + Math.random() * 1.7,
      phase: Math.random() * Math.PI * 2,
      warmth: Math.random(),
    });
  }

  function updateParticles(dt, timeSec) {
    for (let i = fireParticles.length - 1; i >= 0; i--) {
      const p = fireParticles[i];
      p.age += dt;
      if (p.age >= p.life) {
        fireParticles.splice(i, 1);
        continue;
      }
      // Buoyant pinch pulls flame slightly inward toward center column as it rises while curling organically
      const pinch = (p.originX - p.x) * 1.5;
      const curl = Math.sin(timeSec * 9.5 + p.seed + p.age * 8.5) * p.radius * 1.3;
      p.x += (p.vx + curl + pinch) * dt;
      p.y += p.vy * dt;
      p.vy *= 0.986;
    }

    for (let i = sparkParticles.length - 1; i >= 0; i--) {
      const s = sparkParticles[i];
      s.age += dt;
      if (s.age >= s.life) {
        sparkParticles.splice(i, 1);
        continue;
      }
      s.x += (s.vx + Math.sin(timeSec * 12 + s.phase) * 28) * dt;
      s.y += s.vy * dt;
      s.vx *= 0.985;
    }

    for (let i = heartBubbles.length - 1; i >= 0; i--) {
      const b = heartBubbles[i];
      b.age += dt;
      if (b.age >= b.life || b.y < -b.radius * 2) {
        // Melt softly into warm misty bokeh motes instead of a harsh cartoon pop
        if (b.y > 0) {
          for (let k = 0; k < 4; k++) {
            spawnRomanticDrift(b.x, b.y, b.radius * 1.4, b.radius * 2.2, k === 0 ? 'mini-heart' : 'bokeh');
          }
        }
        heartBubbles.splice(i, 1);
        continue;
      }
      b.x += (b.vx + Math.cos(timeSec * b.swayFreq + b.phase) * b.swayAmp) * dt;
      b.y += b.vy * dt;
    }

    for (let i = romanticDrift.length - 1; i >= 0; i--) {
      const p = romanticDrift[i];
      p.age += dt;
      if (p.age >= p.life) {
        romanticDrift.splice(i, 1);
        continue;
      }
      p.x += (p.vx + Math.sin(timeSec * p.swayFreq + p.phase) * p.swayAmp) * dt;
      p.y += p.vy * dt;
    }
  }

  function renderFireParticles(timeSec) {
    if (!fireParticles.length && !sparkParticles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const p of fireParticles) {
      const t = p.age / p.life;
      const r = p.radius * (1 - t * 0.68);
      if (r <= 0.5) continue;

      const grad = ctx.createRadialGradient(p.x, p.y, r * 0.06, p.x, p.y, r);
      if (t < 0.24) {
        grad.addColorStop(0, `rgba(255, 224, 118, ${(1 - t) * 0.52})`);
        grad.addColorStop(0.45, `rgba(255, 134, 28, ${(1 - t) * 0.46})`);
        grad.addColorStop(1, 'rgba(235, 58, 10, 0)');
      } else if (t < 0.65) {
        grad.addColorStop(0, `rgba(255, 130, 24, ${(1 - t) * 0.48})`);
        grad.addColorStop(0.5, `rgba(225, 48, 12, ${(1 - t) * 0.36})`);
        grad.addColorStop(1, 'rgba(150, 14, 5, 0)');
      } else {
        grad.addColorStop(0, `rgba(200, 38, 10, ${(1 - t) * 0.38})`);
        grad.addColorStop(1, 'rgba(100, 8, 4, 0)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const s of sparkParticles) {
      const t = s.age / s.life;
      const flicker = 0.65 + 0.35 * Math.sin(timeSec * 24 + s.phase);
      ctx.globalAlpha = (1 - t) * flicker;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function renderFireEyes(faceAnchors, timeSec, intensity) {
    if (!faceAnchors || intensity <= 0.02) return;
    const w = canvas.width;
    const h = canvas.height;

    [faceAnchors.leftEye, faceAnchors.rightEye].forEach((eye, idx) => {
      const ex = eye.center[0] * w;
      const ey = eye.center[1] * h;
      const eyeW = Math.max(18, eye.width * h);
      const radius = eyeW * 0.36;
      const flameH = eyeW * (1.28 + 0.16 * Math.sin(timeSec * 12 + idx * 2.1));

      drawPalmCoreFlame(ctx, ex, ey + radius * 0.12, radius, flameH, timeSec, idx * 2.4, intensity * 0.92);

      // Warm golden-orange ember iris glow (rich color, avoids white-blob saturation)
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = intensity * 0.90;
      const iris = ctx.createRadialGradient(ex, ey, radius * 0.06, ex, ey, radius * 0.65);
      iris.addColorStop(0, '#fff6c4');
      iris.addColorStop(0.35, '#ffbe3b');
      iris.addColorStop(0.72, 'rgba(245, 76, 14, 0.65)');
      iris.addColorStop(1, 'rgba(220, 30, 0, 0)');
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.arc(ex, ey, radius * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // Subtle romantic rose-champagne twilight light wash across the scene when heart gesture is active
  function renderRomanticAtmosphere(faceAnchors, hearts, intensity) {
    if (intensity <= 0.02) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = intensity;

    // Soft hazy rose-gold veil drifting softly from above the head
    const topX = faceAnchors ? faceAnchors.headTop[0] * w : w * 0.5;
    const topY = faceAnchors ? faceAnchors.headTop[1] * h : h * 0.18;
    const veil = ctx.createRadialGradient(topX, topY, 0, topX, topY + h * 0.12, Math.max(w, h) * 0.58);
    veil.addColorStop(0, 'rgba(255, 166, 206, 0.20)');
    veil.addColorStop(0.48, 'rgba(232, 120, 178, 0.09)');
    veil.addColorStop(1, 'rgba(180, 90, 165, 0)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, w, h);

    // Warm intimate blush glow around each heart gesture
    for (const heart of hearts) {
      const hx = heart.anchor[0] * w;
      const hy = heart.anchor[1] * h;
      const r = Math.max(w, h) * 0.24;
      const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
      glow.addColorStop(0, 'rgba(255, 155, 195, 0.24)');
      glow.addColorStop(0.55, 'rgba(255, 118, 168, 0.08)');
      glow.addColorStop(1, 'rgba(255, 100, 160, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function renderFloatingHearts(hearts, timeSec, intensity) {
    if (!hearts.length || intensity <= 0.02) return;
    const w = canvas.width;
    const h = canvas.height;

    hearts.forEach((heart, idx) => {
      const bob = Math.sin(timeSec * 2.4 + idx * 1.6) * h * 0.015;
      const hx = heart.anchor[0] * w;
      const hy = heart.anchor[1] * h + bob;
      const baseSize = clamp(heart.scale * h * 0.42, 26, 66);
      const breath = 1 + 0.06 * Math.sin(timeSec * 3.4 + idx);
      const size = baseSize * breath * (0.65 + 0.35 * intensity);
      const tilt = Math.sin(timeSec * 1.8 + idx) * 0.08;

      // Primary soft luminous heart levitating above fingertips
      drawDreamyHeart(ctx, hx, hy, size, tilt, intensity * 0.94, 0.4);

      // Soft hazy companion heart gently orbiting above
      const miniX = hx + Math.sin(timeSec * 1.9 + idx * 2.1) * size * 0.62;
      const miniY = hy - size * 1.12 + Math.cos(timeSec * 2.2 + idx) * size * 0.18;
      drawDreamyHeart(ctx, miniX, miniY, size * 0.34, -tilt * 1.3, intensity * 0.72, 0.75);

      // Dreamy warm bokeh motes softly circling the floating heart
      for (let k = 0; k < 3; k++) {
        const ang = timeSec * 1.3 + k * ((Math.PI * 2) / 3) + idx;
        const sx = hx + Math.cos(ang) * size * 1.25;
        const sy = hy + Math.sin(ang) * size * 0.85;
        const sr = size * (0.28 + 0.12 * Math.sin(timeSec * 3.6 + k * 2.1));
        drawSoftMote(
          ctx,
          sx,
          sy,
          sr,
          k === 0 ? 'rgba(255, 242, 222, 0.65)' : 'rgba(255, 198, 226, 0.60)',
          'rgba(255, 138, 188, 0.18)',
          intensity * 0.82,
        );
      }
    });
  }

  function renderHeartBubbles(timeSec) {
    if (!heartBubbles.length && !romanticDrift.length) return;

    // 1. Background dreamy bokeh orbs & floating micro-hearts
    for (const p of romanticDrift) {
      const t = p.age / p.life;
      const fadeIn = clamp(t / 0.20, 0, 1);
      const fadeOut = clamp((1 - t) / 0.35, 0, 1);
      const alpha = fadeIn * fadeOut;
      if (alpha <= 0.01) continue;

      if (p.kind === 'mini-heart') {
        const tilt = Math.sin(timeSec * p.swayFreq + p.phase) * 0.20;
        drawDreamyHeart(ctx, p.x, p.y, p.size, tilt, alpha * 0.72, p.warmth);
      } else {
        const core = p.warmth > 0.5 ? 'rgba(255, 232, 214, 0.58)' : 'rgba(255, 192, 224, 0.58)';
        const mid = p.warmth > 0.5 ? 'rgba(255, 152, 180, 0.24)' : 'rgba(225, 135, 212, 0.22)';
        drawSoftMote(ctx, p.x, p.y, p.size * 1.45, core, mid, alpha * 0.85);
      }
    }

    // 2. Delicate iridescent romantic heart bubbles floating lazily upward from head top
    for (const b of heartBubbles) {
      const t = b.age / b.life;
      const fadeIn = clamp(t / 0.18, 0, 1);
      const fadeOut = clamp((1 - t) / 0.26, 0, 1);
      const alpha = fadeIn * fadeOut;
      const r = b.radius * (0.86 + 0.22 * Math.min(1, t * 1.8));

      ctx.save();
      ctx.globalAlpha = alpha;

      // Soft outer dream-blur aura around bubble
      drawSoftMote(
        ctx,
        b.x,
        b.y,
        r * 1.55,
        'rgba(255, 178, 216, 0.22)',
        'rgba(255, 128, 185, 0.08)',
        alpha,
      );

      // Gossamer-thin translucent glass sphere (kept clean & separate from floating hearts)
      const fillGrad = ctx.createRadialGradient(b.x - r * 0.32, b.y - r * 0.34, r * 0.06, b.x, b.y, r);
      fillGrad.addColorStop(0, 'rgba(255, 250, 252, 0.26)');
      fillGrad.addColorStop(0.55, 'rgba(255, 188, 224, 0.08)');
      fillGrad.addColorStop(0.84, b.warmth > 0.5 ? 'rgba(255, 210, 192, 0.22)' : 'rgba(204, 190, 255, 0.24)');
      fillGrad.addColorStop(1, 'rgba(255, 172, 216, 0.44)');

      ctx.fillStyle = fillGrad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = Math.max(0.8, r * 0.045);
      ctx.strokeStyle = 'rgba(255, 234, 246, 0.54)';
      ctx.stroke();

      // Delicate feathered glass shimmer crescent + tiny secondary bottom reflection
      ctx.fillStyle = 'rgba(255, 250, 253, 0.68)';
      ctx.beginPath();
      ctx.ellipse(b.x - r * 0.36, b.y - r * 0.36, r * 0.24, r * 0.095, -0.72, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 220, 240, 0.40)';
      ctx.beginPath();
      ctx.arc(b.x + r * 0.34, b.y + r * 0.34, r * 0.09, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // Xiaohongshu / TouchDesigner cyber hand skeleton & node telemetry renderer
  function renderHandNodes(stageHands, timeSec, distortion = 0, activeIndex = -1, showCoordinates = true) {
    if (!stageHands.length) return;
    const w = canvas.width;
    const h = canvas.height;
    const unit = Math.max(0.75, Math.min(w, h) / 720);
    const palette = distortionColor(distortion);
    const jitterAmp = distortion > 0.3 ? (distortion - 0.3) * 3.5 * unit : 0;

    stageHands.forEach((hand, handIdx) => {
      const isPrimary = activeIndex === -1 || handIdx === activeIndex;
      const alpha = isPrimary ? 1 : 0.65;
      const pts = hand.map(([nx, ny], idx) => [
        nx * w + (jitterAmp ? Math.sin(timeSec * 48 + idx * 7.3) * jitterAmp : 0),
        ny * h + (jitterAmp ? Math.cos(timeSec * 41 + idx * 5.1) * jitterAmp : 0),
      ]);

      ctx.save();
      ctx.globalAlpha = alpha;

      // Translucent cyber palm polygon mesh [0, 5, 9, 13, 17]
      ctx.fillStyle = `rgba(${palette.r}, ${palette.g}, ${palette.b}, ${0.09 + distortion * 0.09})`;
      ctx.beginPath();
      [0, 5, 9, 13, 17].forEach((lm, idx) => {
        if (idx === 0) ctx.moveTo(pts[lm][0], pts[lm][1]);
        else ctx.lineTo(pts[lm][0], pts[lm][1]);
      });
      ctx.closePath();
      ctx.fill();

      // Glowing bone connections
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = palette.main;
      ctx.shadowBlur = (8 + distortion * 12) * unit;
      ctx.strokeStyle = palette.main;
      ctx.lineWidth = (2.1 + distortion * 0.8) * unit;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(pts[a][0], pts[a][1]);
        ctx.lineTo(pts[b][0], pts[b][1]);
      }
      ctx.stroke();

      // Inner bright core hairline along bones
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = 0.9 * unit;
      ctx.stroke();

      // All 21 joint nodes
      const tipSet = new Set(FINGERTIP_INDICES);
      const fontSize = Math.round(10.5 * unit);
      ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;

      pts.forEach(([x, y], idx) => {
        const isTip = tipSet.has(idx);
        const isWrist = idx === 0;
        const r = (isTip ? 4.8 : isWrist ? 5.2 : 3.2) * unit;

        if (isTip || isWrist) {
          const ringR = r + (3.8 + Math.sin(timeSec * 6 + idx) * 1.1) * unit;
          ctx.strokeStyle = palette.main;
          ctx.lineWidth = 1.35 * unit;
          ctx.beginPath();
          ctx.arc(x, y, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = '#161521';
        ctx.beginPath();
        ctx.arc(x, y, r + 1.1 * unit, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isTip ? '#ffffff' : palette.main;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
        ctx.fill();

        if (showCoordinates && isTip) {
          const tag = String(idx).padStart(2, '0');
          ctx.fillStyle = 'rgba(22, 21, 33, 0.76)';
          ctx.fillRect(x + 8 * unit, y - 9 * unit, 21 * unit, 14 * unit);
          ctx.fillStyle = palette.main;
          ctx.fillText(tag, x + 11 * unit, y + 1.5 * unit);
        }
      });

      // Rotating segmented reticle ring at palm center + live coordinate readout
      const palm = getPalmCenter(hand);
      const px = palm[0] * w;
      const py = palm[1] * h;
      const reticleR = 16 * unit;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(timeSec * (1.2 + distortion * 3.5));
      ctx.strokeStyle = palette.main;
      ctx.lineWidth = 1.6 * unit;
      for (let seg = 0; seg < 4; seg++) {
        const start = seg * (Math.PI / 2) + 0.25;
        ctx.beginPath();
        ctx.arc(0, 0, reticleR, start, start + 0.95);
        ctx.stroke();
      }
      ctx.restore();

      if (showCoordinates) {
        const coordText = `PALM ${palm[0].toFixed(2)}, ${palm[1].toFixed(2)}`;
        const tw = ctx.measureText(coordText).width + 12 * unit;
        const bx = clamp(px - tw / 2, 8, w - tw - 8);
        const by = clamp(py + reticleR + 8 * unit, 8, h - 22 * unit);
        ctx.fillStyle = 'rgba(22, 21, 33, 0.82)';
        ctx.strokeStyle = palette.glow;
        ctx.lineWidth = 1;
        ctx.fillRect(bx, by, tw, 18 * unit);
        ctx.strokeRect(bx, by, tw, 18 * unit);
        ctx.fillStyle = '#f7f5f1';
        ctx.fillText(coordText, bx + 6 * unit, by + 12.5 * unit);
      }

      ctx.restore();
    });
  }

  // Face-to-hand distance beam with live audio waveform & cyber telemetry HUD
  function renderAudioLink(distanceInfo, waveform, audioEnergy, audioRunning, timeSec) {
    const w = canvas.width;
    const h = canvas.height;
    const unit = Math.max(0.75, Math.min(w, h) / 720);
    const { hasHand, distortion, ratio, faceCenter, faceWidth, palmCenter } = distanceInfo;
    const palette = distortionColor(distortion);

    const fx = faceCenter[0] * w;
    const fy = faceCenter[1] * h;
    const bracketR = clamp(faceWidth * h * 0.42, 34 * unit, 110 * unit);

    ctx.save();

    const cornerLen = bracketR * 0.32;
    ctx.strokeStyle = hasHand ? palette.main : 'rgba(236, 250, 118, 0.65)';
    ctx.lineWidth = 2 * unit;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = fx + sx * bracketR;
      const cy = fy + sy * bracketR;
      ctx.beginPath();
      ctx.moveTo(cx - sx * cornerLen, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy - sy * cornerLen);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(fx - 6 * unit, fy);
    ctx.lineTo(fx + 6 * unit, fy);
    ctx.moveTo(fx, fy - 6 * unit);
    ctx.lineTo(fx, fy + 6 * unit);
    ctx.stroke();

    const labelFont = `600 ${Math.round(11 * unit)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.font = labelFont;
    ctx.fillStyle = 'rgba(22, 21, 33, 0.8)';
    ctx.fillRect(fx - 34 * unit, fy - bracketR - 22 * unit, 68 * unit, 17 * unit);
    ctx.fillStyle = hasHand ? palette.main : '#ecfa76';
    ctx.fillText('FACE REF', fx - 27 * unit, fy - bracketR - 10 * unit);

    if (hasHand && palmCenter) {
      const px = palmCenter[0] * w;
      const py = palmCenter[1] * h;
      const dx = px - fx;
      const dy = py - fy;
      const segLen = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / segLen;
      const ny = dx / segLen;

      const samples = 64;
      const ampBase = (5 + distortion * 30) * unit * (audioRunning ? (0.45 + audioEnergy * 1.45) : 0.72);

      ctx.shadowColor = palette.main;
      ctx.shadowBlur = (10 + distortion * 14) * unit;
      ctx.strokeStyle = palette.main;
      ctx.lineWidth = (2.2 + distortion * 1.4) * unit;
      ctx.beginPath();
      for (let i = 0; i <= samples; i++) {
        const u = i / samples;
        const env = Math.sin(u * Math.PI);
        let waveSample;
        if (waveform && waveform.length) {
          const wIdx = Math.min(waveform.length - 1, Math.floor(u * waveform.length));
          waveSample = waveform[wIdx] * 2.4;
          if (distortion > 0.25) {
            const quant = 12 - distortion * 8;
            waveSample = Math.round(waveSample * quant) / quant;
          }
        } else {
          waveSample =
            Math.sin(u * (10 + distortion * 26) - timeSec * (6 + distortion * 14)) * 0.65 +
            Math.sin(u * (28 + distortion * 40) + timeSec * 19) * 0.35 * distortion;
        }
        const offset = waveSample * ampBase * env;
        const x = fx + dx * u + nx * offset;
        const y = fy + dy * u + ny * offset;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (distortion > 0.35) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1.1 * unit;
        ctx.stroke();
      }

      const mx = (fx + px) * 0.5;
      const my = (fy + py) * 0.5 - 14 * unit;
      const pct = Math.round(distortion * 100);
      const pillText = `DIST ${ratio.toFixed(2)}x · 失真 ${pct}%`;
      const pillW = ctx.measureText(pillText).width + 18 * unit;
      const pillH = 22 * unit;
      const rx = clamp(mx - pillW / 2, 10, w - pillW - 10);
      const ry = clamp(my - pillH / 2, 10, h - pillH - 10);

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(22, 21, 33, 0.88)';
      ctx.strokeStyle = palette.main;
      ctx.lineWidth = 1.4 * unit;
      ctx.fillRect(rx, ry, pillW, pillH);
      ctx.strokeRect(rx, ry, pillW, pillH);
      ctx.fillStyle = '#f7f5f1';
      ctx.fillText(pillText, rx + 9 * unit, ry + 14.5 * unit);
    }

    const barW = 168 * unit;
    const barH = 8 * unit;
    const padX = 16 * unit;
    const padY = h - 24 * unit;
    const pct = Math.round(distortion * 100);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(22, 21, 33, 0.82)';
    ctx.fillRect(padX - 8 * unit, padY - 24 * unit, barW + 16 * unit, 38 * unit);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padX - 8 * unit, padY - 24 * unit, barW + 16 * unit, 38 * unit);

    ctx.fillStyle = '#bbb7c5';
    ctx.fillText(audioRunning ? `AUDIO FX · ${pct}%` : `FX PREVIEW · ${pct}%`, padX, padY - 9 * unit);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(padX, padY - 2 * unit, barW, barH);
    ctx.fillStyle = palette.main;
    ctx.fillRect(padX, padY - 2 * unit, barW * distortion, barH);

    ctx.restore();
  }

  function renderFrame({
    now,
    mode,
    stageHands = [],
    faceAnchors = null,
    openPalms = [],
    heartGestures = [],
    audioDistance = null,
    waveform = null,
    audioEnergy = 0,
    audioRunning = false,
    showHandNodes = false,
  }) {
    const dt = lastTimestamp ? clamp((now - lastTimestamp) / 1000, 0.004, 0.05) : 0.016;
    lastTimestamp = now;
    const timeSec = now * 0.001;
    const w = canvas.width;
    const h = canvas.height;

    clear();

    const fireActive = mode === 'magic' && openPalms.length > 0;
    const heartActive = mode === 'magic' && heartGestures.length > 0;

    fireIntensity += ((fireActive ? 1 : 0) - fireIntensity) * Math.min(1, dt * 11);
    heartIntensity += ((heartActive ? 1 : 0) - heartIntensity) * Math.min(1, dt * 7.5);

    if (fireActive) {
      for (const palm of openPalms) {
        // Large roaring flame rising strictly from the open palm center (never on fingertips)
        const px = palm.palmCenter[0] * w;
        const py = palm.palmCenter[1] * h;
        const baseR = clamp(palm.palmSize * h * 0.82, 40, 108) * palm.openness;
        const speed = clamp(palm.palmSize * h * 2.55, 165, 360);
        spawnPalmFireParticles(px, py, baseR, 10, speed);
      }
      if (faceAnchors) {
        for (const eye of [faceAnchors.leftEye, faceAnchors.rightEye]) {
          const eyeW = Math.max(16, eye.width * h);
          spawnPalmFireParticles(eye.center[0] * w, eye.center[1] * h - eyeW * 0.08, eyeW * 0.34, 2, eyeW * 3.2);
        }
      }
    }

    if (heartActive) {
      if (faceAnchors) {
        bubbleCooldown -= dt;
        if (bubbleCooldown <= 0) {
          const headX = faceAnchors.headTop[0] * w;
          const headY = faceAnchors.headTop[1] * h;
          const spread = Math.max(100, faceAnchors.width * h * 1.45);
          const scale = clamp(faceAnchors.height * h * 0.52, 62, 138);
          // Emit separate varied-size translucent bubbles and separate dreamy floating hearts
          spawnHeadBubble(headX, headY, spread, scale);
          spawnHeadHeart(headX, headY + scale * 0.08, spread, scale);
          if (Math.random() < 0.65) {
            spawnRomanticDrift(headX, headY + scale * 0.14, spread * 1.35, scale * 0.85, 'bokeh');
          }
          bubbleCooldown = 0.22 + Math.random() * 0.15;
        }
      }

      driftCooldown -= dt;
      if (driftCooldown <= 0) {
        for (const heart of heartGestures) {
          const hx = heart.anchor[0] * w;
          const hy = heart.anchor[1] * h;
          const scale = clamp(heart.scale * h * 0.72, 48, 110);
          spawnRomanticDrift(hx, hy, scale * 0.85, scale, Math.random() < 0.45 ? 'mini-heart' : 'bokeh');
        }
        driftCooldown = 0.16 + Math.random() * 0.12;
      }
    }

    updateParticles(dt, timeSec);

    if (mode === 'magic') {
      // Soft dreamy twilight haze when heart gesture is active
      if (heartIntensity > 0.02) {
        renderRomanticAtmosphere(faceAnchors, heartGestures, heartIntensity);
      }

      // Single large volumetric flame rising from each open palm center (no fingertip candles)
      if (fireIntensity > 0.02) {
        for (const palm of openPalms) {
          const px = palm.palmCenter[0] * w;
          const py = palm.palmCenter[1] * h;
          const r = clamp(palm.palmSize * h * 0.90, 44, 118) * palm.openness;
          drawPalmCoreFlame(ctx, px, py, r, r * 3.55, timeSec, 0.5, fireIntensity);
        }
      }

      renderFireParticles(timeSec);

      // Fire eyes only when palm fire is active; heart gesture leaves eyes natural (no heart eyes).
      if (fireIntensity > 0.02) {
        renderFireEyes(faceAnchors, timeSec, fireIntensity);
      }

      renderFloatingHearts(heartGestures, timeSec, heartIntensity);
      renderHeartBubbles(timeSec);
    }

    if (mode === 'audio' && audioDistance) {
      renderAudioLink(audioDistance, waveform, audioEnergy, audioRunning, timeSec);
    }

    if (showHandNodes || mode === 'audio') {
      const distVal = mode === 'audio' && audioDistance ? audioDistance.distortion : 0;
      const activeIdx = mode === 'audio' && audioDistance ? audioDistance.activeHandIndex : -1;
      renderHandNodes(stageHands, timeSec, distVal, activeIdx, mode === 'audio' || showHandNodes);
    }
  }

  return {
    renderFrame,
    reset,
    clear,
  };
}
