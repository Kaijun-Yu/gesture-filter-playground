// Procedural Web Audio Christmas Music-Box, Celesta & Velvet Winter Pad Engine
// Plays a seamless holiday suite (Silent Night, We Wish You a Merry Christmas, Jingle Bells)
// with stereo hall reverb and interactive chimes for tree lighting and fireworks.

const NOTE_OFFSET = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midiToFreq(note) {
  if (typeof note === 'number') return 440 * Math.pow(2, (note - 69) / 12);
  const match = /^([A-G])([#b]?)(\d)$/.exec(note);
  if (!match) return 440;
  const [, letter, accidental, octave] = match;
  const semitone = NOTE_OFFSET[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  const midi = (Number(octave) + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createHallImpulse(ctx, seconds = 2.7, decay = 2.6) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const channel = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decay) * (1 - Math.exp(-i / (rate * 0.015)));
      const white = Math.random() * 2 - 1;
      // Warm low-pass damping on the reverb tail so it feels silky and snowy
      lp += (white - lp) * (0.28 - 0.16 * t);
      channel[i] = lp * env * 0.65;
    }
  }
  return impulse;
}

// Each section: { beatSec, bars: [ { chord: [...], bass, notes: [[beatOffset, pitch, durBeats, vel], ...] }, ... ] }
const SUITE = [
  // --- Silent Night (F major, 3/4 dreamy winter waltz) ---
  {
    beatSec: 0.62,
    beatsPerBar: 3,
    bars: [
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'C5', 1.5, 0.72], [1.5, 'D5', 0.5, 0.62], [2, 'C5', 1, 0.66]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A4', 2.8, 0.7]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'C5', 1.5, 0.72], [1.5, 'D5', 0.5, 0.62], [2, 'C5', 1, 0.66]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A4', 2.8, 0.68]] },
      { chord: ['G3', 'Bb3', 'C4', 'E4'], bass: 'C3', notes: [[0, 'G5', 2, 0.78], [2, 'G5', 1, 0.7]] },
      { chord: ['G3', 'Bb3', 'C4', 'E4'], bass: 'C3', notes: [[0, 'E5', 2.8, 0.74]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'F5', 2, 0.76], [2, 'F5', 1, 0.68]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'C5', 2.8, 0.7]] },
      { chord: ['Bb3', 'D4', 'F4', 'A4'], bass: 'Bb2', notes: [[0, 'D5', 2, 0.74], [2, 'D5', 1, 0.68]] },
      { chord: ['Bb3', 'D4', 'F4', 'A4'], bass: 'Bb2', notes: [[0, 'F5', 1.5, 0.78], [1.5, 'E5', 0.5, 0.66], [2, 'D5', 1, 0.68]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'C5', 1.5, 0.74], [1.5, 'D5', 0.5, 0.64], [2, 'C5', 1, 0.66]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A4', 2.8, 0.68]] },
      { chord: ['Bb3', 'D4', 'F4', 'A4'], bass: 'Bb2', notes: [[0, 'D5', 2, 0.74], [2, 'D5', 1, 0.68]] },
      { chord: ['Bb3', 'D4', 'F4', 'A4'], bass: 'Bb2', notes: [[0, 'F5', 1.5, 0.78], [1.5, 'E5', 0.5, 0.66], [2, 'D5', 1, 0.68]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'C5', 1.5, 0.74], [1.5, 'D5', 0.5, 0.64], [2, 'C5', 1, 0.66]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A4', 2.8, 0.68]] },
      { chord: ['G3', 'Bb3', 'C4', 'E4'], bass: 'C3', notes: [[0, 'G5', 2, 0.8], [2, 'G5', 1, 0.72]] },
      { chord: ['G3', 'Bb3', 'C4', 'E4'], bass: 'C3', notes: [[0, 'Bb5', 1.5, 0.82], [1.5, 'G5', 0.5, 0.7], [2, 'E5', 1, 0.7]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'F5', 2.8, 0.76]] },
      { chord: ['D3', 'A3', 'D4', 'F4'], bass: 'D2', notes: [[0, 'A5', 2.8, 0.8]] },
      { chord: ['F3', 'A3', 'C4'], bass: 'C3', notes: [[0, 'F5', 1, 0.74], [1, 'C5', 1, 0.66], [2, 'A4', 1, 0.64]] },
      { chord: ['G3', 'Bb3', 'C4', 'E4'], bass: 'C3', notes: [[0, 'C5', 1.5, 0.72], [1.5, 'Bb4', 0.5, 0.62], [2, 'G4', 1, 0.62]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'F4', 2.9, 0.68], [0, 'A4', 2.9, 0.48], [1.5, 'C5', 1.5, 0.45]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'F5', 2.6, 0.52]] },
    ],
  },
  // --- We Wish You a Merry Christmas (F major, 3/4 warm music-box waltz) ---
  {
    beatSec: 0.50,
    beatsPerBar: 3,
    bars: [
      { chord: ['F3', 'A3', 'C4'], bass: 'F2', notes: [[2, 'C5', 1, 0.68]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'F5', 1, 0.76], [1, 'F5', 0.5, 0.68], [1.5, 'G5', 0.5, 0.66], [2, 'F5', 0.5, 0.68], [2.5, 'E5', 0.5, 0.64]] },
      { chord: ['Bb3', 'D4', 'F4'], bass: 'Bb2', notes: [[0, 'D5', 1, 0.74], [1, 'D5', 1, 0.68], [2, 'D5', 1, 0.68]] },
      { chord: ['G3', 'B3', 'D4', 'F4'], bass: 'G2', notes: [[0, 'G5', 1, 0.78], [1, 'G5', 0.5, 0.7], [1.5, 'A5', 0.5, 0.72], [2, 'G5', 0.5, 0.7], [2.5, 'F5', 0.5, 0.66]] },
      { chord: ['G3', 'Bb3', 'C4', 'E4'], bass: 'C3', notes: [[0, 'E5', 1, 0.74], [1, 'C5', 1, 0.68], [2, 'C5', 1, 0.68]] },
      { chord: ['A3', 'C#4', 'E4', 'G4'], bass: 'A2', notes: [[0, 'A5', 1, 0.8], [1, 'A5', 0.5, 0.72], [1.5, 'Bb5', 0.5, 0.74], [2, 'A5', 0.5, 0.72], [2.5, 'G5', 0.5, 0.68]] },
      { chord: ['D3', 'A3', 'D4', 'F4'], bass: 'D2', notes: [[0, 'F5', 1, 0.74], [1, 'D5', 1, 0.68], [2, 'C5', 0.5, 0.62], [2.5, 'C5', 0.5, 0.62]] },
      { chord: ['Bb3', 'D4', 'F4', 'G4'], bass: 'G2', notes: [[0, 'D5', 1, 0.72], [1, 'G5', 1, 0.76], [2, 'E5', 1, 0.72]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'F5', 2.4, 0.78], [2, 'C5', 1, 0.64]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'F5', 1, 0.76], [1, 'F5', 1, 0.72], [2, 'F5', 1, 0.72]] },
      { chord: ['G3', 'Bb3', 'C4', 'E4'], bass: 'C3', notes: [[0, 'E5', 2, 0.74], [2, 'E5', 1, 0.68]] },
      { chord: ['D3', 'A3', 'D4', 'F4'], bass: 'D2', notes: [[0, 'F5', 1, 0.74], [1, 'E5', 1, 0.7], [2, 'D5', 1, 0.68]] },
      { chord: ['G3', 'Bb3', 'C4', 'E4'], bass: 'C3', notes: [[0, 'C5', 2, 0.72], [2, 'G5', 1, 0.74]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A5', 1, 0.8], [1, 'G5', 1, 0.74], [2, 'F5', 1, 0.72]] },
      { chord: ['Bb3', 'D4', 'F4'], bass: 'Bb2', notes: [[0, 'C6', 1, 0.82], [1, 'C5', 1, 0.68], [2, 'C5', 0.5, 0.64], [2.5, 'C5', 0.5, 0.64]] },
      { chord: ['G3', 'Bb3', 'C4', 'E4'], bass: 'C3', notes: [[0, 'D5', 1, 0.72], [1, 'G5', 1, 0.76], [2, 'E5', 1, 0.72]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'F5', 2.8, 0.76], [0, 'A4', 2.8, 0.45]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'C5', 1.5, 0.45], [1.5, 'F5', 1.5, 0.5]] },
    ],
  },
  // --- Jingle Bells Chorus (F major, 4/4 gentle sparkling chimes) ---
  {
    beatSec: 0.48,
    beatsPerBar: 4,
    bars: [
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A5', 1, 0.74], [1, 'A5', 1, 0.72], [2, 'A5', 2, 0.78]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A5', 1, 0.74], [1, 'A5', 1, 0.72], [2, 'A5', 2, 0.78]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A5', 1, 0.76], [1, 'C6', 1, 0.82], [2, 'F5', 1.5, 0.74], [3.5, 'G5', 0.5, 0.66]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A5', 3.6, 0.78]] },
      { chord: ['Bb3', 'D4', 'F4', 'A4'], bass: 'Bb2', notes: [[0, 'Bb5', 1, 0.78], [1, 'Bb5', 1, 0.74], [2, 'Bb5', 1.5, 0.76], [3.5, 'Bb5', 0.5, 0.68]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'Bb5', 1, 0.74], [1, 'A5', 1, 0.74], [2, 'A5', 1, 0.72], [3, 'A5', 0.5, 0.66], [3.5, 'A5', 0.5, 0.66]] },
      { chord: ['G3', 'B3', 'D4', 'F4'], bass: 'G2', notes: [[0, 'A5', 1, 0.76], [1, 'G5', 1, 0.72], [2, 'G5', 1, 0.7], [3, 'A5', 1, 0.74]] },
      { chord: ['G3', 'Bb3', 'C4', 'E4'], bass: 'C3', notes: [[0, 'G5', 2, 0.74], [2, 'C6', 2, 0.8]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A5', 1, 0.74], [1, 'A5', 1, 0.72], [2, 'A5', 2, 0.78]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A5', 1, 0.74], [1, 'A5', 1, 0.72], [2, 'A5', 2, 0.78]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A5', 1, 0.76], [1, 'C6', 1, 0.82], [2, 'F5', 1.5, 0.74], [3.5, 'G5', 0.5, 0.66]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'A5', 3.6, 0.78]] },
      { chord: ['Bb3', 'D4', 'F4', 'A4'], bass: 'Bb2', notes: [[0, 'Bb5', 1, 0.78], [1, 'Bb5', 1, 0.74], [2, 'Bb5', 1.5, 0.76], [3.5, 'Bb5', 0.5, 0.68]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'Bb5', 1, 0.74], [1, 'A5', 1, 0.74], [2, 'A5', 1, 0.72], [3, 'A5', 0.5, 0.66], [3.5, 'A5', 0.5, 0.66]] },
      { chord: ['G3', 'Bb3', 'C4', 'E4'], bass: 'C3', notes: [[0, 'C6', 1, 0.82], [1, 'C6', 1, 0.78], [2, 'Bb5', 1, 0.74], [3, 'G5', 1, 0.72]] },
      { chord: ['F3', 'A3', 'C4', 'E4'], bass: 'F2', notes: [[0, 'F5', 3.8, 0.76], [0, 'C5', 3.8, 0.45]] },
    ],
  },
];

export function createChristmasMusic() {
  let ctx = null;
  let master = null;
  let dryBus = null;
  let wetBus = null;
  let sessionBus = null;
  let noiseBuffer = null;

  let enabled = false;
  let userMuted = false;
  let enablingPromise = null;
  let energy = 0.45; // 0.45 unlit -> 0.85 lit -> 1.0 snowing
  let timer = null;
  let pieceIndex = 0;
  let barIndex = 0;
  let nextBarTime = 0;

  function ensureContext() {
    if (ctx) return true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    ctx = new AudioCtx();

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.015;
    compressor.release.value = 0.25;

    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    dryBus = ctx.createGain();
    dryBus.gain.value = 0.74;
    dryBus.connect(master);

    const convolver = ctx.createConvolver();
    convolver.buffer = createHallImpulse(ctx);
    wetBus = ctx.createGain();
    wetBus.gain.value = 0.52;
    wetBus.connect(convolver);
    convolver.connect(master);

    // Pre-generate tiny noise buffer for soft sleigh-bell / sparkle bursts
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.22), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function createSessionBus() {
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(dryBus);
    const send = ctx.createGain();
    send.gain.value = 0.65;
    bus.connect(send);
    send.connect(wetBus);
    bus._wetSend = send;
    return bus;
  }

  function retireSessionBus() {
    if (!sessionBus || !ctx) return;
    const oldBus = sessionBus;
    sessionBus = null;
    const now = ctx.currentTime;
    oldBus.gain.cancelScheduledValues(now);
    oldBus.gain.setValueAtTime(Math.max(0.0001, oldBus.gain.value), now);
    oldBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    setTimeout(() => {
      try {
        oldBus.disconnect();
        oldBus._wetSend?.disconnect();
      } catch {}
    }, 350);
  }

  function routeVoice(node, panValue = 0) {
    if (!sessionBus) return;
    let output = node;
    if (typeof ctx.createStereoPanner === 'function') {
      const pan = ctx.createStereoPanner();
      pan.pan.value = panValue;
      node.connect(pan);
      output = pan;
    }
    output.connect(sessionBus);
  }

  function playCelesta(freq, start, duration, velocity = 0.7, pan = 0) {
    const end = start + Math.max(0.45, duration + 0.75);
    const env = ctx.createGain();
    const peak = velocity * 0.145;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peak, start + 0.012);
    env.gain.exponentialRampToValueAtTime(peak * 0.34, start + Math.min(0.32, duration * 0.55));
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    // Warm fundamental + gentle celesta 2nd harmonic
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, start);
    osc1.connect(env);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, start);
    const h2 = ctx.createGain();
    h2.gain.setValueAtTime(0.22, start);
    h2.gain.exponentialRampToValueAtTime(0.015, start + 0.45);
    osc2.connect(h2);
    h2.connect(env);

    // Delicate glassy bell tine overtone on strike
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 3.01, start);
    const h3 = ctx.createGain();
    h3.gain.setValueAtTime(0.065 * velocity, start);
    h3.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    osc3.connect(h3);
    h3.connect(env);

    routeVoice(env, pan, 0.72);
    osc1.start(start); osc2.start(start); osc3.start(start);
    osc1.stop(end + 0.03); osc2.stop(end + 0.03); osc3.stop(end + 0.03);
  }

  function playHarp(freq, start, duration, velocity = 0.45, pan = 0) {
    const end = start + Math.max(0.6, duration + 0.9);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(2400, freq * 5.5), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(360, freq * 1.8), start + 0.55);

    const env = ctx.createGain();
    const peak = velocity * 0.085;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peak, start + 0.018);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);
    osc.connect(filter);
    filter.connect(env);

    routeVoice(env, pan, 0.65);
    osc.start(start);
    osc.stop(end + 0.03);
  }

  function playPad(freqs, start, duration) {
    const end = start + duration + 0.9;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620 + energy * 320, start);
    filter.Q.value = 0.7;

    const env = ctx.createGain();
    const peak = 0.024 + energy * 0.016;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peak, start + Math.min(0.65, duration * 0.4));
    env.gain.setValueAtTime(peak * 0.9, start + Math.max(0.2, duration - 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    filter.connect(env);
    routeVoice(env, 0, 0.85);

    for (const freq of freqs) {
      for (const detune of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        osc.detune.setValueAtTime(detune, start);
        osc.connect(filter);
        osc.start(start);
        osc.stop(end + 0.04);
      }
    }
  }

  function playSleighShimmer(start, intensity = 0.35) {
    if (!noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(6400, start);
    bp.Q.value = 4.2;

    const env = ctx.createGain();
    const peak = intensity * 0.026;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peak, start + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

    src.connect(bp);
    bp.connect(env);
    routeVoice(env, (Math.random() - 0.5) * 0.5, 0.85);
    src.start(start);
    src.stop(start + 0.18);
  }

  function scheduleBar(piece, bar, barStart) {
    const barDur = piece.beatsPerBar * piece.beatSec;

    // 1. Warm winter strings pad
    if (bar.chord) {
      playPad(bar.chord.map(midiToFreq), barStart, barDur);
    }

    // 2. Gentle warm bass & rolling harp arpeggio
    if (bar.bass) {
      playHarp(midiToFreq(bar.bass), barStart, barDur * 0.9, 0.58, -0.18);
    }
    if (bar.chord && energy > 0.5) {
      bar.chord.forEach((pitch, idx) => {
        const offset = (idx + 0.5) * (piece.beatSec * 0.55);
        if (offset < barDur - 0.1) {
          playHarp(midiToFreq(pitch), barStart + offset, piece.beatSec * 1.4, 0.32 * energy, -0.25 + idx * 0.16);
        }
      });
    }

    // 3. Lead celesta / music-box melody
    for (const [beatOffset, pitch, durBeats, vel] of bar.notes) {
      const noteTime = barStart + beatOffset * piece.beatSec;
      const pan = Math.sin(noteTime * 0.7) * 0.24;
      playCelesta(midiToFreq(pitch), noteTime, durBeats * piece.beatSec, vel, pan);
    }

    // 4. Delicate sleigh-bell sparkle on downbeat once the tree is lit
    if (energy >= 0.8) {
      playSleighShimmer(barStart, energy === 1 ? 0.55 : 0.32);
    }
  }

  function pump() {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const lookAhead = 0.65;
    while (nextBarTime < ctx.currentTime + lookAhead) {
      const piece = SUITE[pieceIndex];
      const bar = piece.bars[barIndex];
      scheduleBar(piece, bar, nextBarTime);
      nextBarTime += piece.beatsPerBar * piece.beatSec;
      barIndex++;
      if (barIndex >= piece.bars.length) {
        barIndex = 0;
        pieceIndex = (pieceIndex + 1) % SUITE.length;
        nextBarTime += 0.45; // Gentle breath between carols
      }
    }
  }

  function startScheduler() {
    if (timer) return;
    if (nextBarTime < ctx.currentTime + 0.04) {
      nextBarTime = ctx.currentTime + 0.08;
    }
    pump();
    timer = setInterval(pump, 220);
  }

  function stopScheduler() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  async function enable({ explicit = false, fadeIn = false } = {}) {
    if (!explicit && userMuted) return false;
    if (explicit) userMuted = false;
    // Strictly idempotent: never reset scheduling or stack bars if already playing
    if (enabled && ctx && ctx.state === 'running') {
      startScheduler();
      return true;
    }
    if (enablingPromise) return enablingPromise;

    enablingPromise = (async () => {
      if (!ensureContext()) return false;
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); }
        catch { return false; }
      }
      if (!explicit && userMuted) return false;
      enabled = true;
      if (!sessionBus) sessionBus = createSessionBus();
      const now = ctx.currentTime;
      const startGain = Math.max(0.001, master.gain.value);
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(startGain, now);
      if (fadeIn) {
        // Smooth perceptual (exponential) 8.2s swell ONLY on initial page entry
        master.gain.exponentialRampToValueAtTime(Math.max(startGain, 0.05), now + 2.5);
        master.gain.exponentialRampToValueAtTime(Math.max(startGain, 0.24), now + 5.2);
        master.gain.exponentialRampToValueAtTime(0.56, now + 8.2);
      } else {
        // Immediate clean resume when user manually toggles music back on (tiny 80ms de-click)
        master.gain.linearRampToValueAtTime(0.56, now + 0.08);
      }
      startScheduler();
      return true;
    })();

    try {
      return await enablingPromise;
    } finally {
      enablingPromise = null;
    }
  }

  function disable({ explicit = false } = {}) {
    if (explicit) userMuted = true;
    enabled = false;
    stopScheduler();
    nextBarTime = 0;
    retireSessionBus();
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  }

  function toggle() {
    if (enabled) {
      disable({ explicit: true });
      return Promise.resolve(false);
    }
    return enable({ explicit: true, fadeIn: false });
  }

  function setPhase(phase) {
    energy = phase === 'snowing' ? 1.0 : phase === 'lit' ? 0.82 : 0.48;
  }

  function playLightUp() {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime + 0.02;
    const arp = ['F5', 'A5', 'C6', 'E6', 'F6', 'A6', 'C7'];
    arp.forEach((note, i) => {
      playCelesta(midiToFreq(note), now + i * 0.095, 1.3, 0.56 + i * 0.03, -0.35 + i * 0.11);
    });
  }

  function playCelebrate() {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime + 0.02;
    const cascade = ['C6', 'E6', 'G6', 'A6', 'C7', 'E7', 'F7'];
    cascade.forEach((note, i) => {
      playCelesta(midiToFreq(note), now + i * 0.065, 1.5, 0.58, (i % 2 ? 1 : -1) * 0.32);
    });
    playSleighShimmer(now, 0.85);
    playSleighShimmer(now + 0.24, 0.65);
    playSleighShimmer(now + 0.52, 0.5);
  }

  return {
    enable,
    disable,
    toggle,
    setPhase,
    playLightUp,
    playCelebrate,
    isPlaying: () => enabled,
  };
}
