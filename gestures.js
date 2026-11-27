// Hand & face landmark mapping and gesture classifiers for the playground.

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const FINGERTIP_INDICES = [4, 8, 12, 16, 20];

export function mapPointToStage(point, crop, mirror = false) {
  const x = mirror ? 1 - point.x : point.x;
  return [
    0.5 + (x - 0.5) / crop[0],
    0.5 + (point.y - 0.5) / crop[1],
  ];
}

export function mapLandmarksToStage(landmarks, crop, mirror = false) {
  return landmarks.map(point => mapPointToStage(point, crop, mirror));
}

export function distAspect(a, b, aspect = 1) {
  return Math.hypot((a[0] - b[0]) * aspect, a[1] - b[1]);
}

function avgPoints(points) {
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p[0];
    sy += p[1];
  }
  return [sx / points.length, sy / points.length];
}

function unitVector(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return length > 1e-5 ? [dx / length, dy / length] : [0, 0];
}

function mixPoint(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function lineIntersection(p1, p2, p3, p4, fallback, maxDistance) {
  const den = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  if (Math.abs(den) < 1e-5) return fallback;
  const c1 = p1[0] * p2[1] - p1[1] * p2[0];
  const c2 = p3[0] * p4[1] - p3[1] * p4[0];
  const x = (c1 * (p3[0] - p4[0]) - (p1[0] - p2[0]) * c2) / den;
  const y = (c1 * (p3[1] - p4[1]) - (p1[1] - p2[1]) * c2) / den;
  const dist = Math.hypot(x - fallback[0], y - fallback[1]);
  if (dist <= maxDistance) return [x, y];
  const scale = maxDistance / dist;
  return [fallback[0] + (x - fallback[0]) * scale, fallback[1] + (y - fallback[1]) * scale];
}

export function isConvex(corners) {
  return corners.every(([x, y], index) => {
    const [nextX, nextY] = corners[(index + 1) % 4];
    const [lastX, lastY] = corners[(index + 2) % 4];
    return (nextX - x) * (lastY - nextY) - (nextY - y) * (lastX - nextX) > 0.00025;
  });
}

export function clockwise(corners) {
  const centerX = corners.reduce((sum, point) => sum + point[0], 0) / 4;
  const centerY = corners.reduce((sum, point) => sum + point[1], 0) / 4;
  return [...corners].sort((a, b) =>
    Math.atan2(a[1] - centerY, a[0] - centerX) - Math.atan2(b[1] - centerY, b[0] - centerX));
}

// Extracts 4 comic-window corners from 2 raw MediaPipe hands (in mirrored normalized video space).
export function extractComicFramePoints(rawHands) {
  const [leftHand, rightHand] = [...rawHands]
    .sort((a, b) => b[0].x - a[0].x)
    .map(hand => hand.map(point => [1 - point.x, point.y]));

  const orderedOpen = clockwise([leftHand[4], leftHand[8], rightHand[4], rightHand[8]]);
  let topLeftIndex = 0;
  for (let i = 1; i < 4; i++) {
    if (orderedOpen[i][0] + orderedOpen[i][1] < orderedOpen[topLeftIndex][0] + orderedOpen[topLeftIndex][1]) {
      topLeftIndex = i;
    }
  }
  const openQuad = Array.from({ length: 4 }, (_, i) => orderedOpen[(topLeftIndex + i) % 4]);

  // Also detect classic photographer's viewfinder pose (inverted L + upright L).
  const li = unitVector(leftHand[5], leftHand[8]);
  const lt = unitVector(leftHand[2], leftHand[4]);
  const ri = unitVector(rightHand[5], rightHand[8]);
  const rt = unitVector(rightHand[2], rightHand[4]);
  const vfScoreA = Math.min(li[0], lt[1], -ri[0], -rt[1]);
  const vfScoreB = Math.min(li[0], -lt[1], -ri[0], rt[1]);
  const vfScore = Math.max(vfScoreA, vfScoreB);
  const t = Math.max(0, Math.min(1, (vfScore - 0.25) / 0.3));
  const blend = t * t * (3 - 2 * t);
  if (blend <= 0) return openQuad;

  let viewfinderQuad;
  if (vfScoreA >= vfScoreB) {
    const tl = mixPoint(leftHand[5], leftHand[2], 0.14);
    const trFallback = [rightHand[4][0], leftHand[8][1]];
    const trRay = lineIntersection(leftHand[5], leftHand[8], rightHand[3], rightHand[4], trFallback, 0.045);
    const tr = mixPoint(trRay, trFallback, 0.45);
    const br = mixPoint(rightHand[2], rightHand[5], 0.32);
    const bl = mixPoint(leftHand[4], rightHand[8], 0.5);
    viewfinderQuad = [tl, tr, br, bl];
  } else {
    const bl = mixPoint(leftHand[5], leftHand[2], 0.14);
    const tlFallback = [leftHand[4][0], rightHand[8][1]];
    const tlRay = lineIntersection(rightHand[5], rightHand[8], leftHand[3], leftHand[4], tlFallback, 0.045);
    const tl = mixPoint(tlRay, tlFallback, 0.45);
    const tr = mixPoint(rightHand[2], rightHand[5], 0.32);
    const br = mixPoint(rightHand[4], leftHand[8], 0.5);
    viewfinderQuad = [tl, tr, br, bl];
  }
  return openQuad.map((point, index) => mixPoint(point, viewfinderQuad[index], blend));
}

export function getPalmCenter(stageHand) {
  return avgPoints([stageHand[0], stageHand[5], stageHand[9], stageHand[13], stageHand[17]]);
}

function fingerExtended(hand, mcpIdx, pipIdx, tipIdx, palmSize, aspect) {
  const wrist = hand[0];
  const tipToWrist = distAspect(hand[tipIdx], wrist, aspect);
  const pipToWrist = distAspect(hand[pipIdx], wrist, aspect);
  const tipToMcp = distAspect(hand[tipIdx], hand[mcpIdx], aspect);
  return tipToWrist > pipToWrist * 1.13 && tipToMcp > palmSize * 0.44;
}

function fingerCurled(hand, mcpIdx, pipIdx, tipIdx, palmCenter, palmSize, aspect) {
  const wrist = hand[0];
  const tipToWrist = distAspect(hand[tipIdx], wrist, aspect);
  const pipToWrist = distAspect(hand[pipIdx], wrist, aspect);
  const tipToMcp = distAspect(hand[tipIdx], hand[mcpIdx], aspect);
  const tipToPalm = distAspect(hand[tipIdx], palmCenter, aspect);
  // Tolerant to front-facing foreshortening while rejecting genuinely extended fingers.
  return tipToWrist < pipToWrist * 1.18 || (tipToMcp < palmSize * 0.56 && tipToPalm < palmSize * 0.92);
}

function segmentsIntersect(a, b, c, d) {
  const ccw = (p1, p2, p3) => (p3[1] - p1[1]) * (p2[0] - p1[0]) > (p2[1] - p1[1]) * (p3[0] - p1[0]);
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

function pointToSegmentDist(p, a, b, aspect) {
  const px = p[0] * aspect;
  const py = p[1];
  const ax = a[0] * aspect;
  const ay = a[1];
  const bx = b[0] * aspect;
  const by = b[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Detects open palm (摊开手) -> returns flame emitter descriptors for each open hand.
export function detectOpenPalms(stageHands, aspect) {
  const openHands = [];
  for (const hand of stageHands) {
    const palmSize = distAspect(hand[0], hand[9], aspect);
    if (palmSize < 0.03) continue;

    const idxExt = fingerExtended(hand, 5, 6, 8, palmSize, aspect);
    const midExt = fingerExtended(hand, 9, 10, 12, palmSize, aspect);
    const ringExt = fingerExtended(hand, 13, 14, 16, palmSize, aspect);
    const pinkyExt = fingerExtended(hand, 17, 18, 20, palmSize, aspect);
    const thumbSpread = distAspect(hand[4], hand[5], aspect) > palmSize * 0.32;
    const pinchDist = distAspect(hand[4], hand[8], aspect);

    // Require all 4 main fingers open and thumb not pinched to index.
    if (idxExt && midExt && ringExt && pinkyExt && thumbSpread && pinchDist > palmSize * 0.45) {
      const palmCenter = getPalmCenter(hand);
      const spreadRatio = Math.min(1, Math.max(0.45, distAspect(hand[8], hand[20], aspect) / (palmSize * 1.15)));
      openHands.push({
        palmCenter,
        palmSize,
        wrist: hand[0],
        tips: FINGERTIP_INDICES.map(idx => hand[idx]),
        openness: spreadRatio,
      });
    }
  }
  return openHands;
}

// Detects Korean finger-heart (食指和拇指交叉比心), calibrated to be responsive across hand tilts
// while reliably rejecting open palms, fists, OK signs, and casual nearby hands.
export function detectHeartGestures(stageHands, aspect) {
  const hearts = [];

  for (const hand of stageHands) {
    const palmSize = distAspect(hand[0], hand[9], aspect);
    if (palmSize < 0.03) continue;

    const palmCenter = getPalmCenter(hand);
    const wrist = hand[0];
    const indexTip = hand[8];
    const thumbTip = hand[4];

    // 1. Non-heart fingers: reject OK sign / open hand; allow natural slight pinky/middle looseness.
    const midExt = fingerExtended(hand, 9, 10, 12, palmSize, aspect);
    const ringExt = fingerExtended(hand, 13, 14, 16, palmSize, aspect);
    const pinkyExt = fingerExtended(hand, 17, 18, 20, palmSize, aspect);
    if (midExt && ringExt) continue; // Rejects OK sign & open palm cleanly
    const curledCount =
      Number(fingerCurled(hand, 9, 10, 12, palmCenter, palmSize, aspect)) +
      Number(fingerCurled(hand, 13, 14, 16, palmCenter, palmSize, aspect)) +
      Number(fingerCurled(hand, 17, 18, 20, palmCenter, palmSize, aspect));
    if (curledCount < 2 || (midExt && pinkyExt)) continue;

    // 2. Rotation-invariant protrusion check: crossed thumb & index extend farther from wrist than curled fingers.
    const pinch = [(thumbTip[0] + indexTip[0]) * 0.5, (thumbTip[1] + indexTip[1]) * 0.5];
    const pinchToWrist = distAspect(pinch, wrist, aspect);
    const indexToWrist = distAspect(indexTip, wrist, aspect);
    const thumbToWrist = distAspect(thumbTip, wrist, aspect);
    if (indexToWrist < palmSize * 0.90 || thumbToWrist < palmSize * 0.84) continue;

    const avgCurledToWrist = (
      distAspect(hand[12], wrist, aspect) +
      distAspect(hand[16], wrist, aspect) +
      distAspect(hand[20], wrist, aspect)
    ) / 3;
    // In a real finger heart, the crossed thumb/index protrude cleanly beyond the curled fist body.
    if (pinchToWrist < avgCurledToWrist * 1.08) continue;

    // 3. Thumb and index actually cross or overlap closely at their distal tips/pads.
    const crossedDistal =
      segmentsIntersect(hand[2], hand[4], hand[5], hand[8]) ||
      segmentsIntersect(hand[3], hand[4], hand[6], hand[8]) ||
      segmentsIntersect(hand[2], hand[4], hand[6], hand[8]);

    const tipDist = distAspect(thumbTip, indexTip, aspect);
    const thumbToIndexSeg = pointToSegmentDist(thumbTip, hand[6], hand[8], aspect);
    const indexToThumbSeg = pointToSegmentDist(indexTip, hand[2], hand[4], aspect);
    const minSegDist = Math.min(thumbToIndexSeg, indexToThumbSeg);

    const validCross = crossedDistal && tipDist < palmSize * 0.54;
    const validPadOverlap = tipDist < palmSize * 0.36 && minSegDist < palmSize * 0.28;

    if (!validCross && !validPadOverlap) continue;

    const anchor = [
      pinch[0],
      Math.min(thumbTip[1], indexTip[1]) - palmSize * 0.28,
    ];
    hearts.push({
      type: 'finger-heart',
      anchor,
      scale: palmSize,
    });
  }

  return hearts;
}

// Extracts eye anchors, face center, face dimensions, and head-top bubble anchor from FaceLandmarker.
export function extractFaceAnchors(rawFaceLandmarks, crop, mirror, aspect) {
  if (!rawFaceLandmarks || rawFaceLandmarks.length < 468) return null;
  const f = mapLandmarksToStage(rawFaceLandmarks, crop, mirror);

  function buildEye(outerIdx, innerIdx, topIdx, botIdx, irisIdx) {
    const outer = f[outerIdx];
    const inner = f[innerIdx];
    const top = f[topIdx];
    const bot = f[botIdx];
    const socketCenter = avgPoints([outer, inner, top, bot]);
    const center = f[irisIdx] ? mixPoint(socketCenter, f[irisIdx], 0.55) : socketCenter;
    const width = distAspect(outer, inner, aspect);
    const height = distAspect(top, bot, aspect);
    const dx = (inner[0] - outer[0]) * aspect;
    const dy = inner[1] - outer[1];
    const angle = Math.atan2(dy, dx);
    return { center, width, height, angle };
  }

  const eyeA = buildEye(33, 133, 159, 145, 468);
  const eyeB = buildEye(263, 362, 386, 374, 473);
  const [leftEye, rightEye] = eyeA.center[0] <= eyeB.center[0] ? [eyeA, eyeB] : [eyeB, eyeA];

  const forehead = f[10];
  const chin = f[152];
  const faceWidth = distAspect(f[234], f[454], aspect);
  const faceHeight = distAspect(forehead, chin, aspect);
  const center = mixPoint(f[1], f[168], 0.4);

  // Extrapolate smoothly above the forehead while keeping headroom so bubbles remain clearly visible.
  const headTop = [
    forehead[0] + (forehead[0] - chin[0]) * 0.18,
    Math.max(0.16, forehead[1] + (forehead[1] - chin[1]) * 0.18),
  ];

  return {
    leftEye,
    rightEye,
    center,
    forehead,
    chin,
    headTop,
    width: faceWidth,
    height: faceHeight,
  };
}

// Computes normalized distortion [0..1] based on farthest hand's distance from the face.
export function computeHandFaceDistortion(stageHands, faceAnchors, aspect) {
  const faceCenter = faceAnchors?.center ?? [0.5, 0.44];
  const faceWidth = Math.max(faceAnchors?.width ?? 0.22, 0.12);

  if (!stageHands.length) {
    return {
      hasHand: false,
      distortion: 0,
      ratio: 0,
      faceCenter,
      faceWidth,
      palmCenter: null,
      activeHandIndex: -1,
    };
  }

  let bestIndex = 0;
  let bestDist = -1;
  let bestPalm = null;

  stageHands.forEach((hand, index) => {
    const palm = getPalmCenter(hand);
    const d = distAspect(palm, faceCenter, aspect);
    if (d > bestDist) {
      bestDist = d;
      bestIndex = index;
      bestPalm = palm;
    }
  });

  const ratio = bestDist / faceWidth;
  // Close to face (~0.65 face widths) => 0% distortion; stretched far away (~2.55 face widths) => 100%.
  const linear = Math.max(0, Math.min(1, (ratio - 0.65) / 1.9));
  const distortion = Math.pow(linear, 1.1);

  return {
    hasHand: true,
    distortion,
    ratio,
    faceCenter,
    faceWidth,
    palmCenter: bestPalm,
    activeHandIndex: bestIndex,
  };
}

// Generates a realistic synthetic 21-point open hand skeleton around a draggable center for demo mode.
export function buildSyntheticHand(center, scale = 0.14, aspect = 1.6) {
  const [cx, cy] = center;
  const s = scale;
  const invA = 1 / aspect;
  // Relative offsets (dx in aspect-normalized units, dy in stage height units) centered near palm midpoint.
  const rel = [
    [0.0, 0.56],                                            // 0: wrist
    [-0.30, 0.42], [-0.46, 0.22], [-0.58, 0.04], [-0.68, -0.10], // 1..4: thumb
    [-0.24, -0.02], [-0.30, -0.34], [-0.34, -0.56], [-0.37, -0.76], // 5..8: index
    [-0.04, -0.08], [-0.05, -0.44], [-0.05, -0.68], [-0.05, -0.88], // 9..12: middle
    [0.16, -0.02], [0.20, -0.36], [0.23, -0.58], [0.25, -0.76],     // 13..16: ring
    [0.34, 0.10], [0.42, -0.16], [0.48, -0.34], [0.52, -0.50],      // 17..20: pinky
  ];
  return rel.map(([dx, dy]) => [cx + dx * s * invA, cy + dy * s]);
}
