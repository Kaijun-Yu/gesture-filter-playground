const joints = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const planar = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function handPose(landmarks, aspect) {
  const hand = landmarks.map(({ x, y, z }) => [(1 - x) * aspect, y, (z || 0) * aspect]);
  const scale = Math.max(0.025, 0.5 * (distance(hand[0], hand[9]) + distance(hand[5], hand[17])));
  const extended = joints.map(([a, b, c, d]) => {
    const length = distance(hand[a], hand[b]) + distance(hand[b], hand[c]) + distance(hand[c], hand[d]);
    return distance(hand[a], hand[d]) > length * 0.78 && distance(hand[0], hand[d]) - distance(hand[0], hand[a]) > scale * 0.22;
  });
  const spread = extended.filter(Boolean).length;
  const pinch = distance(hand[4], hand[8]) / scale;
  const gathered = [8, 12, 16, 20].filter(i => distance(hand[i], hand[4]) < scale * 0.60).length;
  const palm = spread >= 3
    ? [(hand[0][0] + hand[5][0] + hand[9][0] + hand[17][0]) * 0.25,
      (hand[0][1] + hand[5][1] + hand[9][1] + hand[17][1]) * 0.25]
    : null;
  return {
    palm,
    scale,
    tip: [hand[8][0], hand[8][1]],
    pointing: extended[0] && pinch > 0.42,
    closed: gathered >= 3 || spread === 0 ? 'bundle' : pinch < 0.31 ? 'pinch' : null,
    opened: pinch > 0.60 && spread >= 3,
    pinchOpened: pinch > 0.70 && extended[0],
  };
}

function angle(previous, current, next) {
  const ax = current[0] - previous[0];
  const ay = current[1] - previous[1];
  const bx = next[0] - current[0];
  const by = next[1] - current[1];
  return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
}

export function createGestures({ turn, swipe, scatter }) {
  let lastAt = -Infinity;
  let trace = [];
  let closedSince = Infinity;
  let closedAt = -Infinity;
  let scatterAt = -Infinity;
  let armed = null;
  let steering = false;
  let palmTrack;

  function reset() {
    lastAt = -Infinity;
    trace = [];
    closedSince = Infinity;
    closedAt = -Infinity;
    scatterAt = -Infinity;
    armed = null;
    steering = false;
    palmTrack = undefined;
  }

  function trackPalm({ palm, scale }, aspect, now) {
    if (!palmTrack || now - palmTrack.time > 150 || planar(palmTrack.raw, palm) > Math.max(0.16, scale * 1.25)) {
      palmTrack = { raw: palm, position: palm, anchor: palm, time: now, movedAt: -Infinity };
      return;
    }

    const stepX = Math.abs(palm[0] - palmTrack.raw[0]);
    const stepY = Math.abs(palm[1] - palmTrack.raw[1]);
    const smoothing = 1 - Math.exp(-(now - palmTrack.time) / 33);
    const position = palm.map((coordinate, axis) => palmTrack.position[axis] + (coordinate - palmTrack.position[axis]) * smoothing);
    palmTrack.time = now;
    palmTrack.raw = palm;
    palmTrack.position = position;

    const dx = position[0] - palmTrack.anchor[0];
    const dy = position[1] - palmTrack.anchor[1];
    const moving = now - palmTrack.movedAt < 160;
    const deadZone = moving ? Math.max(0.006, scale * 0.065) : Math.max(0.024, Math.min(0.049, scale * 0.21));
    const horizontal = Math.abs(dx) > Math.abs(dy) * 1.45;
    if (stepY > Math.max(0.005, stepX * 1.15) || (!horizontal && Math.abs(dy) > deadZone)) {
      palmTrack.anchor = position;
      palmTrack.movedAt = -Infinity;
      return;
    }
    if (!horizontal || Math.abs(dx) < deadZone + 0.0025) return;

    const movement = dx - Math.sign(dx) * deadZone;
    palmTrack.anchor = [palmTrack.anchor[0] + movement, position[1]];
    palmTrack.movedAt = now;
    swipe(-movement * 3.8 / aspect);
  }

  function update(landmarks, aspect, now) {
    if (now - lastAt > 270) reset();
    if (!landmarks) return;
    lastAt = now;
    const pose = handPose(landmarks, aspect);
    closedSince = pose.closed ? Math.min(closedSince, now) : Infinity;
    if (pose.closed) closedAt = now;
    if (now - closedSince >= 64) armed = pose.closed;
    if (now - closedAt > 800) armed = null;
    if (armed && (pose.opened || (armed === 'pinch' && pose.pinchOpened)) && now - scatterAt >= 700) {
      armed = null;
      scatterAt = now;
      trace = [];
      steering = false;
      palmTrack = undefined;
      scatter(pose.tip[0] / aspect);
      return;
    }

    if (pose.palm && !pose.closed && !armed) {
      trace = [];
      steering = false;
      if (now - scatterAt >= 150) trackPalm(pose, aspect, now);
      return;
    }
    palmTrack = undefined;

    if (!pose.pointing || pose.closed || armed) {
      trace = [];
      steering = false;
      return;
    }
    trace = trace.filter(sample => now - sample.time < 1250);
    if (trace.length < 3) steering = false;
    const last = trace.at(-1);
    if (last && planar(pose.tip, last.point) < 0.009) return;
    if (last && planar(pose.tip, last.point) > 0.19) trace = [];
    const previous = trace.at(-2);
    const bend = previous && last ? angle(previous.point, last.point, pose.tip) : 0;
    trace.push({ point: pose.tip, time: now, bend: Math.abs(bend) < 1.95 ? bend : 0 });
    if (trace.length < 6) return;

    let signed = 0;
    let total = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { point: [x, y], bend: step } of trace) {
      signed += step;
      total += Math.abs(step);
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    const arc = Math.abs(signed) > 0.91 && Math.abs(signed) > total * 0.66 && maxX - minX > 0.049 && maxY - minY > 0.045;
    if (arc) {
      const amount = steering ? Math.max(-0.23, Math.min(0.23, bend * 0.66)) : Math.sign(signed) * 0.23;
      if (!steering || Math.sign(bend) === Math.sign(signed)) turn(amount);
    }
    steering = arc;
  }

  return { update, reset };
}
