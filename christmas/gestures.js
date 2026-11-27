const JOINTS = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const planar = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function createOneEuro(minCutoff = 2.2, beta = 6.0, dCutoff = 1.0) {
  let prevValue = null;
  let prevDeriv = 0;
  let prevTime = null;

  function alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  return {
    reset() {
      prevValue = null;
      prevDeriv = 0;
      prevTime = null;
    },
    filter(value, timeMs) {
      if (prevValue === null || prevTime === null) {
        prevValue = value;
        prevDeriv = 0;
        prevTime = timeMs;
        return value;
      }
      const dt = clamp((timeMs - prevTime) / 1000, 0.004, 0.25);
      prevTime = timeMs;
      const deriv = (value - prevValue) / dt;
      const smoothDeriv = prevDeriv + alpha(dCutoff, dt) * (deriv - prevDeriv);
      prevDeriv = smoothDeriv;
      const cutoff = minCutoff + beta * Math.abs(smoothDeriv);
      const filtered = prevValue + alpha(cutoff, dt) * (value - prevValue);
      prevValue = filtered;
      return filtered;
    },
  };
}

function createPointFilter(minCutoff, beta) {
  const fx = createOneEuro(minCutoff, beta);
  const fy = createOneEuro(minCutoff, beta);
  return {
    reset() {
      fx.reset();
      fy.reset();
    },
    filter(point, timeMs) {
      return [fx.filter(point[0], timeMs), fy.filter(point[1], timeMs)];
    },
  };
}

function deltaAngle(a, b, center) {
  const ax = a[0] - center[0];
  const ay = a[1] - center[1];
  const bx = b[0] - center[0];
  const by = b[1] - center[1];
  if (Math.hypot(ax, ay) < 0.004 || Math.hypot(bx, by) < 0.004) return 0;
  return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
}

function handPose(landmarks, aspect) {
  const hand = landmarks.map(({ x, y, z }) => [(1 - x) * aspect, y, (z || 0) * aspect]);
  const scale = Math.max(0.025, 0.5 * (distance(hand[0], hand[9]) + distance(hand[5], hand[17])));
  const palmCenter = [
    (hand[0][0] + hand[5][0] + hand[9][0] + hand[13][0] + hand[17][0]) * 0.2,
    (hand[0][1] + hand[5][1] + hand[9][1] + hand[13][1] + hand[17][1]) * 0.2,
    (hand[0][2] + hand[5][2] + hand[9][2] + hand[13][2] + hand[17][2]) * 0.2,
  ];

  const metrics = JOINTS.map(([a, b, c, d]) => {
    const length = Math.max(1e-5, distance(hand[a], hand[b]) + distance(hand[b], hand[c]) + distance(hand[c], hand[d]));
    const straight = distance(hand[a], hand[d]) / length;
    const reach = (distance(hand[0], hand[d]) - distance(hand[0], hand[a])) / scale;
    const tipDist = distance(hand[0], hand[d]) / scale;
    const tipToPalm = distance(hand[d], palmCenter) / scale;
    const extended = straight > 0.71 && reach > 0.16;
    const curled = !extended && (reach < 0.14 || tipToPalm < 0.88);
    return { straight, reach, tipDist, tipToPalm, extended, curled };
  });

  const extended = metrics.map(m => m.extended);
  const spread = extended.filter(Boolean).length;
  const othersExtended = extended.slice(1).filter(Boolean).length;
  const othersCurled = metrics.slice(1).filter(m => m.curled).length;
  const allCurled = metrics.every(m => m.curled);
  const pinchRatio = distance(hand[4], hand[8]) / scale;

  // Closed fist ("握拳"): all 4 non-thumb fingers curled tightly into the palm.
  // Clearly distinct from thumb+index pinch ("捏合"), where middle/ring/pinky are relaxed or open.
  const fist = spread === 0 && allCurled && othersCurled === 3;

  // Open palm ("张开手掌") for firing fireworks after a fist
  const openedPalm = spread >= 3 && pinchRatio > 0.50;

  // Index-finger pointing ("食指指尖画圈"): strictly excludes pinch & fist
  const otherAvgTipDist = (metrics[1].tipDist + metrics[2].tipDist + metrics[3].tipDist) / 3;
  const indexExtended = metrics[0].straight > 0.66 && metrics[0].reach > 0.13;
  const indexDominant = metrics[0].tipDist - otherAvgTipDist > 0.22 && metrics[0].reach > 0.05;
  const pointing = !fist && (indexExtended || indexDominant) && pinchRatio > 0.42 && othersExtended <= 1;

  const pinchPoint = [
    (hand[4][0] + hand[8][0]) * 0.5,
    (hand[4][1] + hand[8][1]) * 0.5,
  ];

  return {
    scale,
    wrist: [hand[0][0], hand[0][1]],
    tip: [hand[8][0], hand[8][1]],
    palmCenter: [palmCenter[0], palmCenter[1]],
    pinchPoint,
    pinchRatio,
    spread,
    othersExtended,
    fist,
    openedPalm,
    pointing,
  };
}

function pickSingleHand(input) {
  if (!input) return null;
  if (Array.isArray(input) && input.length === 0) return null;
  if (Array.isArray(input[0])) return input.find(h => Array.isArray(h) && h.length >= 21) ?? null;
  if (input.length >= 21 && typeof input[0]?.x === 'number') return input;
  return null;
}

export function createGestures({ turn, swipe, scatter }) {
  const tipFilter = createPointFilter(2.4, 7.5);
  const pinchFilter = createPointFilter(2.2, 9.5);

  let lastSeenAt = -Infinity;
  let scatterAt = -Infinity;

  // Fist -> Open Palm ("握拳再张开手掌放烟花") state
  let fistSince = Infinity;
  let fistLastAt = -Infinity;
  let fistArmed = false;

  // Pinch-to-drag ("手指捏合左右滑动，松开即停") state
  let pinching = false;
  let pinchLastPos = null;
  let pinchLastRaw = null;
  let pinchLastTime = -Infinity;
  let pinchLastValidAt = -Infinity;
  let pinchVx = 0;
  let pinchVy = 0;
  let pinchMovedAt = -Infinity;
  let pinchTrail = [];

  // Index-finger circle ("食指画圈点亮/转动") state
  let trace = [];
  let circling = false;
  let circleDir = 0;
  let circleCenter = null;
  let lastPointingAt = -Infinity;
  let lastCircleMoveAt = -Infinity;

  function clearFist() {
    fistSince = Infinity;
    fistLastAt = -Infinity;
    fistArmed = false;
  }

  function clearPinch() {
    pinching = false;
    pinchLastPos = null;
    pinchLastRaw = null;
    pinchLastTime = -Infinity;
    pinchLastValidAt = -Infinity;
    pinchVx = 0;
    pinchVy = 0;
    pinchMovedAt = -Infinity;
    pinchTrail = [];
    pinchFilter.reset();
  }

  function clearCircle() {
    trace = [];
    circling = false;
    circleDir = 0;
    circleCenter = null;
    lastPointingAt = -Infinity;
    lastCircleMoveAt = -Infinity;
    tipFilter.reset();
  }

  function reset() {
    lastSeenAt = -Infinity;
    scatterAt = -Infinity;
    clearFist();
    clearPinch();
    clearCircle();
  }

  function toNormalized(point, aspect) {
    return point ? [point[0] / aspect, point[1]] : null;
  }

  function trackPinchDrag(pose, aspect, now, isConfirmedPinch) {
    const raw = pose.pinchPoint;
    const expired = !pinchLastRaw || now - pinchLastTime > 240;
    const teleported = pinchLastRaw && planar(pinchLastRaw, raw) > Math.max(0.42, pose.scale * 2.8);

    if (expired || teleported) {
      pinchFilter.reset();
      const filtered = pinchFilter.filter(raw, now);
      pinching = true;
      pinchLastRaw = raw;
      pinchLastPos = filtered;
      pinchLastTime = now;
      if (isConfirmedPinch) pinchLastValidAt = now;
      pinchVx = 0;
      pinchVy = 0;
      pinchTrail = [{ point: filtered, time: now }];
      return { active: false, direction: 0, strength: 0 };
    }

    const dt = clamp((now - pinchLastTime) / 1000, 0.008, 0.12);
    const filtered = pinchFilter.filter(raw, now);
    const dx = filtered[0] - pinchLastPos[0];
    const dy = filtered[1] - pinchLastPos[1];

    pinchLastRaw = raw;
    pinchLastPos = filtered;
    pinchLastTime = now;
    if (isConfirmedPinch) pinchLastValidAt = now;

    pinchTrail.push({ point: filtered, time: now });
    pinchTrail = pinchTrail.filter(sample => now - sample.time < 260);

    const instVx = (dx / aspect) / dt;
    const instVy = dy / dt;
    const velAlpha = 1 - Math.exp(-dt * 18);
    pinchVx += (instVx - pinchVx) * velAlpha;
    pinchVy += (instVy - pinchVy) * velAlpha;

    const absDx = Math.abs(dx / aspect);
    const absDy = Math.abs(dy);
    const speedX = Math.abs(pinchVx);
    const speedY = Math.abs(pinchVy);

    const purelyVertical = absDy > absDx * 2.2 && speedY > speedX * 2.0 && speedX < 0.22;
    const recentlyMoving = now - pinchMovedAt < 200;
    const stepThreshold = recentlyMoving ? 0.0018 : 0.0038;
    const speedThreshold = recentlyMoving ? 0.05 : 0.11;

    if (purelyVertical || (absDx < stepThreshold && speedX < speedThreshold)) {
      return {
        active: recentlyMoving,
        direction: recentlyMoving ? Math.sign(-pinchVx) : 0,
        strength: clamp(speedX / 1.6, 0, 1),
      };
    }

    pinchMovedAt = now;
    const directTurn = -(dx / aspect) * 4.6;
    const flickVelocity = speedX > 0.48 ? clamp(-pinchVx * 2.4, -7.2, 7.2) : 0;
    swipe(directTurn, flickVelocity);
    return {
      active: true,
      direction: Math.sign(directTurn),
      strength: clamp(speedX / 1.5, 0.24, 1),
    };
  }

  function trackCircle(pose, aspect, now) {
    lastPointingAt = now;
    const filtered = tipFilter.filter(pose.tip, now);
    const last = trace.at(-1);

    if (last && planar(filtered, last.point) > Math.max(0.36, pose.scale * 2.6)) {
      trace = [];
      circling = false;
      circleCenter = null;
    }

    const minStep = circling ? 0.003 : 0.004;
    if (!last || planar(filtered, last.point) >= minStep) {
      trace.push({ point: filtered, time: now });
    }
    trace = trace.filter(sample => now - sample.time < 1050);
    if (trace.length > 44) trace = trace.slice(-44);

    if (trace.length < 5) {
      return { active: false, direction: 0, strength: 0 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let pathLen = 0;
    for (let i = 0; i < trace.length; i++) {
      const [x, y] = trace[i].point;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (i > 0) pathLen += planar(trace[i - 1].point, trace[i].point);
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const rawCenter = [(minX + maxX) * 0.5, (minY + maxY) * 0.5];
    if (!circleCenter) {
      circleCenter = rawCenter;
    } else {
      const centerAlpha = circling ? 0.22 : 0.45;
      circleCenter = [
        circleCenter[0] + (rawCenter[0] - circleCenter[0]) * centerAlpha,
        circleCenter[1] + (rawCenter[1] - circleCenter[1]) * centerAlpha,
      ];
    }

    let signedAngle = 0;
    let totalAngle = 0;
    let recentSigned = 0;
    let recentTotal = 0;
    const recentStart = Math.max(1, trace.length - 6);
    for (let i = 1; i < trace.length; i++) {
      const step = deltaAngle(trace[i - 1].point, trace[i].point, circleCenter);
      signedAngle += step;
      totalAngle += Math.abs(step);
      if (i >= recentStart) {
        recentSigned += step;
        recentTotal += Math.abs(step);
      }
    }

    if (
      circling &&
      circleDir !== 0 &&
      Math.sign(recentSigned) === -circleDir &&
      Math.abs(recentSigned) > 0.35 &&
      recentTotal > 1e-4 &&
      Math.abs(recentSigned) / recentTotal > 0.72
    ) {
      trace = trace.slice(-7);
      circleDir = Math.sign(recentSigned);
      signedAngle = recentSigned;
      totalAngle = recentTotal;
    }

    const coherence = totalAngle > 1e-4 ? Math.abs(signedAngle) / totalAngle : 0;
    const minSpan = Math.min(spanX, spanY);
    const maxSpan = Math.max(spanX, spanY, 1e-4);
    const roundness = minSpan / maxSpan;
    const hasArc = circling
      ? Math.abs(signedAngle) > 0.48 && coherence > 0.48 && minSpan > 0.022 && roundness > 0.18
      : Math.abs(signedAngle) > 0.72 && coherence > 0.60 && spanX > 0.028 && spanY > 0.026 && pathLen > 0.068 && roundness > 0.22;

    if (!hasArc) {
      if (circling && now - lastCircleMoveAt > 260) {
        circling = false;
        circleDir = 0;
      }
      return { active: circling, direction: circleDir, strength: circling ? 0.35 : 0 };
    }

    const dominantDir = Math.abs(recentSigned) > 0.22 ? Math.sign(recentSigned) : Math.sign(signedAngle);
    const prevSample = trace.at(-2);
    const currSample = trace.at(-1);
    const stepDt = clamp((currSample.time - prevSample.time) / 1000, 0.012, 0.12);
    const stepAngle = deltaAngle(prevSample.point, currSample.point, circleCenter);

    if (!circling) {
      circling = true;
      circleDir = dominantDir;
      lastCircleMoveAt = now;
      const initialTurn = dominantDir * 0.16;
      const initialVel = clamp((stepAngle / stepDt) * 0.28, -3.2, 3.2);
      turn(initialTurn, Math.sign(initialVel) === dominantDir ? initialVel : dominantDir * 0.8);
      return { active: true, direction: circleDir, strength: 0.6 };
    }

    circleDir = dominantDir;
    const sameWay = Math.sign(stepAngle) === circleDir;
    if (sameWay && Math.abs(stepAngle) > 0.005) {
      lastCircleMoveAt = now;
      const amount = clamp(stepAngle * 0.76, -0.34, 0.34);
      const angularSpeed = clamp((stepAngle / stepDt) * 0.30, -3.6, 3.6);
      turn(amount, angularSpeed);
      return {
        active: true,
        direction: circleDir,
        strength: clamp(Math.abs(stepAngle / stepDt) / 7, 0.35, 1),
      };
    }

    return { active: true, direction: circleDir, strength: 0.35 };
  }

  function update(rawInput, aspect, now) {
    const hand = pickSingleHand(rawInput);
    if (now - lastSeenAt > 400) reset();

    if (!hand) {
      if (now - lastPointingAt > 220) clearCircle();
      if (now - pinchLastValidAt > 140) clearPinch();
      if (now - fistLastAt > 900) clearFist();
      return {
        mode: 'none',
        direction: 0,
        strength: 0,
        tip: null,
        pinch: null,
        palm: null,
        trail: [],
        armedProgress: 0,
      };
    }

    lastSeenAt = now;
    const pose = handPose(hand, aspect);
    const draggingPinch = pinching && now - pinchMovedAt < 180 && Math.abs(pinchVx) > 0.25;

    // =========================================================================
    // 1. Closed Fist -> Open Palm ("握拳再张开手掌") triggers fireworks & snow
    //    Strictly requires all 4 fingers curled into a fist — thumb+index pinch
    //    can NEVER arm or trigger fireworks.
    // =========================================================================
    const canArmFist = pose.fist && !draggingPinch;
    if (canArmFist) {
      fistSince = Math.min(fistSince, now);
      fistLastAt = now;
      const hold = now - fistSince;
      if (hold >= 90) fistArmed = true;
      clearPinch();
      clearCircle();
      return {
        mode: 'fist',
        direction: 0,
        strength: clamp(hold / 90, 0.35, 1),
        tip: toNormalized(pose.tip, aspect),
        pinch: null,
        palm: toNormalized(pose.palmCenter, aspect),
        trail: [],
        armedProgress: fistArmed ? 1 : clamp(hold / 90, 0, 1),
      };
    } else {
      fistSince = Infinity;
    }

    if (fistArmed) {
      if (pose.openedPalm && now - scatterAt >= 700) {
        clearFist();
        clearPinch();
        clearCircle();
        scatterAt = now;
        scatter(clamp(pose.palmCenter[0] / aspect, 0.1, 0.9));
        return {
          mode: 'scatter',
          direction: 0,
          strength: 1,
          tip: toNormalized(pose.tip, aspect),
          pinch: null,
          palm: toNormalized(pose.palmCenter, aspect),
          trail: [],
          armedProgress: 0,
        };
      }
      if (now - fistLastAt < 950) {
        // Hold armed state briefly while fingers are opening so transitional frames don't pinch-drag
        return {
          mode: 'fist',
          direction: 0,
          strength: 1,
          tip: toNormalized(pose.tip, aspect),
          pinch: null,
          palm: toNormalized(pose.palmCenter, aspect),
          trail: [],
          armedProgress: 1,
        };
      }
      clearFist();
    }

    // =========================================================================
    // 2. Thumb + Index Pinch-to-Drag ("手指捏合左右滑动，松开即停")
    //    Only active while pinched (not a closed fist). Releasing stops sliding
    //    immediately and NEVER triggers fireworks.
    // =========================================================================
    const pinchThreshold = pinching ? 0.52 : 0.37;
    const isPinched = !pose.fist && pose.pinchRatio < pinchThreshold && (pinching || pose.othersExtended >= 1 || pose.spread >= 1);

    if (isPinched) {
      clearCircle();
      if (now - scatterAt >= 260) {
        const result = trackPinchDrag(pose, aspect, now, true);
        return {
          mode: result.active ? 'pinch-drag' : 'pinch-ready',
          direction: result.direction,
          strength: result.strength,
          tip: toNormalized(pose.tip, aspect),
          pinch: toNormalized(pinchLastPos ?? pose.pinchPoint, aspect),
          palm: toNormalized(pose.palmCenter, aspect),
          trail: pinchTrail.map(sample => toNormalized(sample.point, aspect)),
          armedProgress: 0,
        };
      }
      return {
        mode: 'pinch-ready',
        direction: 0,
        strength: 0,
        tip: toNormalized(pose.tip, aspect),
        pinch: toNormalized(pose.pinchPoint, aspect),
        palm: toNormalized(pose.palmCenter, aspect),
        trail: [],
        armedProgress: 0,
      };
    }

    if (pinching && !pose.fist && pose.pinchRatio < 0.58 && now - pinchLastValidAt < 95) {
      const result = trackPinchDrag(pose, aspect, now, false);
      return {
        mode: result.active ? 'pinch-drag' : 'pinch-ready',
        direction: result.direction,
        strength: result.strength,
        tip: toNormalized(pose.tip, aspect),
        pinch: toNormalized(pinchLastPos ?? pose.pinchPoint, aspect),
        palm: toNormalized(pose.palmCenter, aspect),
        trail: pinchTrail.map(sample => toNormalized(sample.point, aspect)),
        armedProgress: 0,
      };
    }
    if (pinching) clearPinch();

    // =========================================================================
    // 3. Index-Finger Circling ("食指画圈点亮并转动圣诞树")
    // =========================================================================
    if (pose.pointing) {
      const result = trackCircle(pose, aspect, now);
      return {
        mode: result.active ? 'circle' : 'pointing',
        direction: result.direction,
        strength: result.strength,
        tip: toNormalized(trace.at(-1)?.point ?? pose.tip, aspect),
        pinch: null,
        palm: toNormalized(pose.palmCenter, aspect),
        trail: trace.slice(-24).map(sample => toNormalized(sample.point, aspect)),
        armedProgress: 0,
      };
    }

    if (circling && now - lastPointingAt < 180) {
      return {
        mode: 'circle',
        direction: circleDir,
        strength: 0.3,
        tip: toNormalized(trace.at(-1)?.point ?? pose.tip, aspect),
        pinch: null,
        palm: toNormalized(pose.palmCenter, aspect),
        trail: trace.slice(-24).map(sample => toNormalized(sample.point, aspect)),
        armedProgress: 0,
      };
    }
    if (now - lastPointingAt >= 180) clearCircle();

    return {
      mode: 'hand',
      direction: 0,
      strength: 0,
      tip: toNormalized(pose.tip, aspect),
      pinch: null,
      palm: toNormalized(pose.palmCenter, aspect),
      trail: [],
      armedProgress: 0,
    };
  }

  return { update, reset };
}
