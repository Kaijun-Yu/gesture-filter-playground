// Real-time Web Audio API distortion engine controlled by hand-to-face distance.
// Supports built-in cyber synth beat loop, uploaded local audio files, and live microphone input.

const bitcrusherWorkletCode = `
class BitcrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'amount', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    this.phase = 0;
    this.lastL = 0;
    this.lastR = 0;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length) return true;

    const amount = parameters.amount[0];
    const inL = input[0];
    const inR = input[1] || inL;
    const outL = output[0];
    const outR = output[1];

    if (amount <= 0.01) {
      outL.set(inL);
      if (outR) outR.set(inR);
      return true;
    }

    // Smoothly drop bit depth (16 -> 3.2 bits) and hold samples (1 -> 18) as amount rises.
    const bits = 16 - amount * 12.8;
    const step = Math.pow(0.5, bits);
    const freqReduction = 1 / (1 + amount * amount * 17);

    for (let i = 0; i < inL.length; i++) {
      this.phase += freqReduction;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.lastL = step * Math.floor(inL[i] / step + 0.5);
        this.lastR = step * Math.floor(inR[i] / step + 0.5);
      }
      outL[i] = this.lastL;
      if (outR) outR[i] = this.lastR;
    }
    return true;
  }
}
registerProcessor('bitcrusher-processor', BitcrusherProcessor);
`;

function makeDistortionCurve(amount = 22) {
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Asymmetric soft-to-aggressive overdrive curve with controlled base gain (avoids sudden loudness jump).
    const driven = x * (1 + amount * 0.10);
    const asym = driven + 0.12 * Math.sin(driven * 3.1);
    curve[i] = Math.tanh(asym);
  }
  return curve;
}

export function createAudioDistortionEngine() {
  let ctx = null;
  let inputBus = null;
  let dryGain = null;
  let preGain = null;
  let shaper = null;
  let crusher = null;
  let crusherParam = null;
  let toneFilter = null;
  let wetGain = null;
  let masterGain = null;
  let analyser = null;
  let timeBuffer = null;

  let running = false;
  let sourceType = 'synth'; // 'synth' | 'file' | 'mic'
  let distortion = 0;

  // Built-in synth sequencer state
  let seqTimer = 0;
  let seqStep = 0;
  let noiseBuffer = null;

  // File playback state
  let audioElement = null;
  let fileNode = null;
  let fileUrl = '';
  let fileName = '';

  // Mic state
  let micStream = null;
  let micNode = null;

  async function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') await ctx.resume();
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error('此浏览器不支持 Web Audio API');
    ctx = new AudioCtx();

    inputBus = ctx.createGain();
    inputBus.gain.value = 0.9;

    dryGain = ctx.createGain();
    dryGain.gain.value = 1;

    preGain = ctx.createGain();
    preGain.gain.value = 1;

    shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(24);
    shaper.oversample = '4x';

    toneFilter = ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = 12000;
    toneFilter.Q.value = 0.75;

    // Dedicated wet-path dynamics leveler keeps saturated RMS locked to dry loudness across all sources.
    const wetLeveler = ctx.createDynamicsCompressor();
    wetLeveler.threshold.value = -16;
    wetLeveler.knee.value = 14;
    wetLeveler.ratio.value = 10;
    wetLeveler.attack.value = 0.002;
    wetLeveler.release.value = 0.11;

    wetGain = ctx.createGain();
    wetGain.gain.value = 0;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 16;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.14;

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.78;

    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    timeBuffer = new Float32Array(analyser.fftSize);

    // Optional AudioWorklet bitcrusher with graceful bypass fallback.
    try {
      if (ctx.audioWorklet) {
        const blob = new Blob([bitcrusherWorkletCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        try {
          await ctx.audioWorklet.addModule(url);
          crusher = new AudioWorkletNode(ctx, 'bitcrusher-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          });
          crusherParam = crusher.parameters.get('amount');
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    } catch (error) {
      console.warn('Bitcrusher AudioWorklet unavailable, using WaveShaper + Filter chain:', error);
      crusher = null;
      crusherParam = null;
    }

    // Dry path
    inputBus.connect(dryGain);
    dryGain.connect(compressor);

    // Wet distortion path (auto-leveled so distortion changes timbre without boosting loudness)
    inputBus.connect(preGain);
    preGain.connect(shaper);
    if (crusher) {
      shaper.connect(crusher);
      crusher.connect(toneFilter);
    } else {
      shaper.connect(toneFilter);
    }
    toneFilter.connect(wetLeveler);
    wetLeveler.connect(wetGain);
    wetGain.connect(compressor);

    compressor.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);

    // Reusable short noise buffer for hi-hats and snare snap.
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.22), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    applyDistortion(distortion);
  }

  function applyDistortion(amount) {
    distortion = Math.max(0, Math.min(1, amount));
    if (!ctx) return;
    const now = ctx.currentTime;
    const smooth = 0.045;

    // Constant-loudness dry/wet morph: auto-compensate WaveShaper RMS boost and mid-band resonance
    // so cranking distortion transforms texture cleanly without making the audio louder.
    const drive = 1 + Math.pow(distortion, 1.35) * 13;
    const wetMix = Math.pow(distortion, 0.88);
    const dry = 1 - wetMix * 0.90;
    // Saturating a ~0.22 RMS signal with tanh(3.4 * drive * x) lifts its RMS ~2.8x..4.0x;
    // trim the wet branch proportionally (plus subtle Fletcher-Munson mid-band compensation).
    const driveComp = 1 / (1 + Math.pow(drive, 0.56) * 0.72);
    const wet = wetMix * driveComp * 0.68;
    const cutoff = 12000 * Math.pow(0.16, distortion); // 12kHz -> ~1.9kHz gritty cyber band
    const q = 0.75 + distortion * 1.95; // Musical resonant bite without piercing +15dB loudness spike

    dryGain.gain.setTargetAtTime(dry, now, smooth);
    wetGain.gain.setTargetAtTime(wet, now, smooth);
    preGain.gain.setTargetAtTime(drive, now, smooth);
    toneFilter.frequency.setTargetAtTime(cutoff, now, smooth);
    toneFilter.Q.setTargetAtTime(q, now, smooth);
    if (crusherParam) {
      crusherParam.setTargetAtTime(distortion, now, smooth);
    }
  }

  function triggerKick(time) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(142, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    gain.gain.setValueAtTime(0.62, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);
    osc.connect(gain);
    gain.connect(inputBus);
    osc.start(time);
    osc.stop(time + 0.26);
  }

  function triggerSnare(time) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1850;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.28, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(inputBus);
    src.start(time);
    src.stop(time + 0.18);
  }

  function triggerHat(time, accent = false) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(accent ? 0.13 : 0.065, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + (accent ? 0.08 : 0.04));
    src.connect(hp);
    hp.connect(gain);
    gain.connect(inputBus);
    src.start(time);
    src.stop(time + 0.09);
  }

  function triggerChord(time, freqs, duration) {
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(1650, time);
      filt.frequency.exponentialRampToValueAtTime(520, time + duration);
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.095, time + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      osc.connect(filt);
      filt.connect(gain);
      gain.connect(inputBus);
      osc.start(time);
      osc.stop(time + duration + 0.04);
    }
  }

  function triggerBass(time, freq, duration) {
    const osc = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(620, time);
    gain.gain.setValueAtTime(0.28, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(inputBus);
    osc.start(time);
    osc.stop(time + duration + 0.03);
  }

  // 116 BPM 4-bar cyber-lofi progression (64 sixteenth-note steps)
  const chords = [
    [220.0, 261.63, 329.63, 392.0, 493.88],  // Am9
    [174.61, 220.0, 261.63, 329.63, 392.0],  // Fmaj9
    [146.83, 220.0, 261.63, 329.63, 349.23], // Dm9
    [164.81, 246.94, 293.66, 329.63, 415.3], // E7
  ];
  const bassNotes = [110.0, 87.31, 73.42, 82.41];

  function startSynthLoop() {
    stopSynthLoop();
    seqStep = 0;
    const stepMs = (60 / 116 / 4) * 1000; // ~129.3ms per 16th note

    const tick = () => {
      if (!running || sourceType !== 'synth' || !ctx) return;
      const now = ctx.currentTime + 0.02;
      const bar = Math.floor(seqStep / 16) % 4;
      const stepInBar = seqStep % 16;

      if (stepInBar === 0 || stepInBar === 10) triggerKick(now);
      if (stepInBar === 4 || stepInBar === 12) triggerSnare(now);
      if (stepInBar % 2 === 0) triggerHat(now, stepInBar % 4 === 2);

      if (stepInBar === 0 || stepInBar === 6) {
        triggerChord(now, chords[bar], stepInBar === 0 ? 0.68 : 0.45);
      }
      if (stepInBar === 0 || stepInBar === 8 || stepInBar === 14) {
        const oct = stepInBar === 14 ? 1.5 : 1;
        triggerBass(now, bassNotes[bar] * oct, 0.34);
      }
      seqStep = (seqStep + 1) % 64;
    };

    tick();
    seqTimer = window.setInterval(tick, stepMs);
  }

  function stopSynthLoop() {
    if (seqTimer) {
      clearInterval(seqTimer);
      seqTimer = 0;
    }
  }

  function stopMic() {
    micNode?.disconnect();
    micNode = null;
    micStream?.getTracks().forEach(t => t.stop());
    micStream = null;
  }

  function pauseFile() {
    if (audioElement) audioElement.pause();
  }

  async function start(nextSource = sourceType) {
    await ensureContext();
    sourceType = nextSource;
    running = true;

    stopSynthLoop();
    if (sourceType !== 'mic') stopMic();
    if (sourceType !== 'file') pauseFile();

    if (sourceType === 'synth') {
      startSynthLoop();
    } else if (sourceType === 'file') {
      if (!audioElement || !fileUrl) {
        running = false;
        throw new Error('请先选择一个本地音频文件');
      }
      await audioElement.play();
    } else if (sourceType === 'mic') {
      if (!navigator.mediaDevices?.getUserMedia) {
        running = false;
        throw new Error('麦克风需要通过 localhost 或 HTTPS 打开');
      }
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      micNode = ctx.createMediaStreamSource(micStream);
      micNode.connect(inputBus);
    }
    applyDistortion(distortion);
  }

  function stop() {
    running = false;
    stopSynthLoop();
    stopMic();
    pauseFile();
  }

  async function loadFile(file) {
    await ensureContext();
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = URL.createObjectURL(file);
    fileName = file.name;

    if (!audioElement) {
      audioElement = new Audio();
      audioElement.loop = true;
      audioElement.crossOrigin = 'anonymous';
      fileNode = ctx.createMediaElementSource(audioElement);
      fileNode.connect(inputBus);
    }
    audioElement.src = fileUrl;
    audioElement.currentTime = 0;
    sourceType = 'file';
    await start('file');
    return fileName;
  }

  function getWaveform() {
    if (!analyser || !running) return null;
    analyser.getFloatTimeDomainData(timeBuffer);
    return timeBuffer;
  }

  function getEnergy() {
    const wave = getWaveform();
    if (!wave) return 0;
    let sum = 0;
    for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i];
    return Math.min(1, Math.sqrt(sum / wave.length) * 3.4);
  }

  return {
    start,
    stop,
    loadFile,
    setDistortion: applyDistortion,
    getWaveform,
    getEnergy,
    isRunning: () => running,
    getSourceType: () => sourceType,
    getFileName: () => fileName,
  };
}
