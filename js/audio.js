const AudioEngine = (() => {
  let ctx = null;
  let compressor = null;
  let masterBus = null;
  let effectsBus = null;
  let musicBus = null;
  let unlockedByGesture = false;
  let musicEnabled = STORE.get('kosen_music_enabled', true) !== false;
  let musicVolume = Math.max(0, Math.min(1, Number(STORE.get('kosen_music_volume', 0.60)) || 0));
  let musicWasPlaying = false;
  let nextStepTime = 0;
  let sequenceStep = 0;
  let liveMusicVoices = 0;
  let scheduledNotes = 0;
  let musicLastBpm = 0;
  const MAX_MUSIC_VOICES = 20;

  function init() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-16, ctx.currentTime);
      compressor.knee.setValueAtTime(18, ctx.currentTime);
      compressor.ratio.setValueAtTime(5, ctx.currentTime);
      compressor.attack.setValueAtTime(0.004, ctx.currentTime);
      compressor.release.setValueAtTime(0.14, ctx.currentTime);

      masterBus = ctx.createGain();
      masterBus.gain.setValueAtTime(0.52, ctx.currentTime);

      effectsBus = ctx.createGain();
      effectsBus.gain.value = 0.78;
      effectsBus.connect(compressor);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.0001;
      musicBus.connect(compressor);
      compressor.connect(masterBus);
      masterBus.connect(ctx.destination);
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return effectsBus;
  }

  function tone({ type = 'sine', fStart, fEnd, dur, gainPeak, delay = 0, subFreq = 0, filterFreq = 0 }) {
    if (muted) return;
    const out = init();
    if (!ctx || !out) return;
    const t0 = ctx.currentTime + Math.max(0, delay);

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, fStart), t0);
    if (fEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(24, fEnd), t0 + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(Math.max(0.001, gainPeak), t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);

    if (filterFreq > 0) {
      const biquad = ctx.createBiquadFilter();
      biquad.type = 'lowpass';
      biquad.frequency.setValueAtTime(filterFreq, t0);
      biquad.Q.setValueAtTime(1.5, t0);
      env.connect(biquad);
      biquad.connect(out);
    } else {
      env.connect(out);
    }

    osc.connect(env);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);

    if (subFreq > 0) {
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(Math.max(28, subFreq), t0);
      sub.frequency.exponentialRampToValueAtTime(Math.max(28, subFreq * 0.55), t0 + dur * 1.15);
      subGain.gain.setValueAtTime(0.0001, t0);
      subGain.gain.linearRampToValueAtTime(Math.max(0.001, gainPeak * 0.85), t0 + 0.006);
      subGain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur * 1.15);
      sub.connect(subGain);
      subGain.connect(out);
      sub.start(t0);
      sub.stop(t0 + dur * 1.2 + 0.02);
    }
  }

  const scale = [69, 71, 74, 76, 79, 81, 83, 86, 88, 91, 93, 95];

  function playShoot() {
    tone({ type: 'triangle', fStart: 350, fEnd: 120, dur: 0.09, gainPeak: 0.23, subFreq: 150, filterFreq: 2500 });
  }

  function playSwap() {
    tone({ type: 'sine', fStart: 460, fEnd: 690, dur: 0.075, gainPeak: 0.19, filterFreq: 3400 });
    tone({ type: 'triangle', fStart: 690, fEnd: 920, dur: 0.06, delay: 0.025, gainPeak: 0.12, filterFreq: 3800 });
  }

  function playLock() {
    tone({ type: 'sine', fStart: 225, fEnd: 95, dur: 0.12, gainPeak: 0.25, subFreq: 112, filterFreq: 1900 });
    tone({ type: 'triangle', fStart: 600, fEnd: 900, dur: 0.09, delay: 0.015, gainPeak: 0.15, filterFreq: 3600 });
  }

  function playHeal() {
    [76, 83, 88, 95].forEach((midi, i) => {
      const freq = Math.pow(2, (midi - 69) / 12) * 440;
      tone({ type: 'sine', fStart: freq, fEnd: freq * 1.01, dur: 0.28, delay: i * 0.055, gainPeak: 0.19, filterFreq: 4200 });
    });
  }

  function playTempoShift(up) {
    tone({
      type: 'sine',
      fStart: up ? 290 : 640,
      fEnd: up ? 780 : 210,
      dur: 0.18,
      gainPeak: 0.21,
      subFreq: up ? 125 : 95,
      filterFreq: 2900
    });
  }

  function playSkullDeath() {
    tone({ type: 'sawtooth', fStart: 190, fEnd: 42, dur: 0.42, gainPeak: 0.27, subFreq: 95, filterFreq: 980 });
    tone({ type: 'square', fStart: 120, fEnd: 36, dur: 0.35, delay: 0.06, gainPeak: 0.17, filterFreq: 780 });
  }

  function playReject() {
    tone({ type: 'sawtooth', fStart: 160, fEnd: 70, dur: 0.22, gainPeak: 0.22, subFreq: 88, filterFreq: 1150 });
  }

  function playBombBlast() {
    tone({ type: 'sawtooth', fStart: 170, fEnd: 34, dur: 0.38, gainPeak: 0.27, subFreq: 96, filterFreq: 1250 });
    tone({ type: 'triangle', fStart: 98, fEnd: 30, dur: 0.42, delay: 0.02, gainPeak: 0.25, filterFreq: 680 });
  }

  function playMerge(level, combo) {
    const baseMidi = scale[Math.min(Math.max(1, level) - 1, scale.length - 1)] + Math.min((Math.max(1, combo) - 1) * 2, 10);
    const intervals = combo > 1 ? [0, 7, 12, 19] : [0, 7, 12];
    const rootFreq = Math.pow(2, (baseMidi - 69) / 12) * 440;

    tone({ type: 'sine', fStart: rootFreq * 0.5, fEnd: rootFreq * 0.5, dur: 0.24, gainPeak: 0.25, filterFreq: 950 });

    intervals.forEach((semi, idx) => {
      const freq = Math.pow(2, (baseMidi + semi - 69) / 12) * 440;
      tone({
        type: idx === 0 ? 'triangle' : 'sine',
        fStart: freq * 0.98,
        fEnd: freq,
        dur: 0.36,
        delay: idx * 0.042,
        gainPeak: 0.21 / (idx * 0.35 + 1),
        filterFreq: 4300
      });
    });
  }

  function playMilestone() {
    [74, 79, 83, 86, 91].forEach((midi, i) => {
      const freq = Math.pow(2, (midi - 69) / 12) * 440;
      tone({ type: 'sine', fStart: freq, fEnd: freq * 1.01, dur: 0.32, delay: i * 0.055, gainPeak: 0.2, filterFreq: 4100 });
    });
  }

  function playCoreDetonation() {
    tone({ type: 'sine', fStart: 112, fEnd: 38, dur: 0.55, gainPeak: 0.29, filterFreq: 720 });
    [76, 81, 88, 93, 95].forEach((midi, i) => {
      const freq = Math.pow(2, (midi - 69) / 12) * 440;
      tone({ type: 'triangle', fStart: freq, fEnd: freq, dur: 0.45, delay: i * 0.05, gainPeak: 0.21, filterFreq: 4500 });
    });
  }

  function playUnlock() {
    [76, 81, 83, 88].forEach((midi, i) => {
      const freq = Math.pow(2, (midi - 69) / 12) * 440;
      tone({ type: 'sine', fStart: freq, fEnd: freq, dur: 0.3, delay: i * 0.055, gainPeak: 0.19, filterFreq: 4200 });
    });
  }

  // Original generative score, written for BERKAN; no prerecorded assets or dependencies.
  // Follows a four-bar D-minor-pentatonic motif, transposed with each environment.
  const MOTIF = [null, 0, 2, null, 3, null, 4, 2, null, 3, 1, null, 2, null, 0, null];
  const PENTATONIC = [0, 3, 5, 7, 10, 12, 15];
  const BAR_ROOTS = [0, -2, 3, -5];
  const ENV_SHIFTS = [0, 5, -2, 3];
  const midiFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);
  let lastMusicState = { milestoneIndex: 0, envIndex: 0, combo: 0, centerLevel: null, tempoMult: 1 };

  function voice(midi, when, hold, volume, waveform = 'sine', attack = 0.018, release = 0.28, cutoff = 2400) {
    if (!ctx || !musicBus || liveMusicVoices >= MAX_MUSIC_VOICES || !Number.isFinite(midi)) return;
    const start = Math.max(ctx.currentTime + 0.002, when);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    osc.type = waveform;
    osc.frequency.setValueAtTime(midiFreq(midi), start);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(.001, volume), start + attack);
    env.gain.setValueAtTime(Math.max(.001, volume), start + Math.max(attack, hold));
    env.gain.exponentialRampToValueAtTime(.0001, start + Math.max(attack, hold) + release);
    osc.connect(filter);
    filter.connect(env);
    env.connect(musicBus);
    liveMusicVoices++;
    osc.onended = () => {
      osc.disconnect(); filter.disconnect(); env.disconnect();
      liveMusicVoices = Math.max(0, liveMusicVoices - 1);
    };
    osc.start(start);
    osc.stop(start + Math.max(attack, hold) + release + 0.025);
    scheduledNotes++;
  }

  function transportStep(t, data) {
    const phase = sequenceStep % 16;
    const bar = Math.floor(sequenceStep / 16) % BAR_ROOTS.length;
    const env = Math.abs(data.envIndex || 0) % ENV_SHIFTS.length;
    const root = 62 + ENV_SHIFTS[env] + BAR_ROOTS[bar];
    const energy = Math.min(1, .42 + Math.min(5, data.milestoneIndex || 0) * .085 + Math.min(4, data.combo || 0) * .09 + (data.centerLevel !== null ? .2 : 0));
    const core = data.centerLevel !== null;

    // Soft glass harmonics and a low drone provide a stable, unobtrusive floor.
    if (phase === 0 || phase === 8) {
      voice(root - 24, t, 1.55, .070, 'triangle', .21, .9, 900);
      voice(root - 12 + (phase === 8 ? 7 : 0), t + .03, 1.35, .040, 'sine', .32, .8, 1500);
    }
    const noteIdx = MOTIF[(phase + (bar % 2 === 1 ? 4 : 0)) % 16];
    if (noteIdx !== null) {
      voice(root + PENTATONIC[noteIdx], t, .12, .075 + .030 * energy, 'sine', .009, .39, 3900);
    }
    // Rhythm arrives after the first milestone or through intentional combo play.
    if (phase % 4 === 0 && ((data.milestoneIndex || 0) > 0 || (data.combo || 0) >= 2)) {
      voice(root - 12, t, .045, .045 + .023 * energy, 'triangle', .008, .19, 520);
    }
    // Higher harmonics emerge only in advanced play; core adds a restrained beacon.
    if ((data.combo || 0) >= 3 && phase % 4 === 2) {
      voice(root + 19 + (phase % 8 === 2 ? 0 : 3), t, .055, .044, 'sine', .005, .34, 5200);
    }
    if (core && phase % 8 === 4) {
      voice(root + 24, t, .48, .066, 'sine', .055, .6, 4400);
    }
    sequenceStep = (sequenceStep + 1) % 64;
  }

  function fadeMusic(target, seconds = .07) {
    if (!ctx || !musicBus) return;
    musicBus.gain.setTargetAtTime(Math.max(.0001, target), ctx.currentTime, seconds);
  }

  function unlock() {
    const audio = init();
    if (!audio || !ctx) return;
    unlockedByGesture = true;
  }

  function setMusicEnabled(next) {
    musicEnabled = Boolean(next);
    STORE.set('kosen_music_enabled', musicEnabled);
    if (!musicEnabled) { musicWasPlaying = false; fadeMusic(.0001, .025); }
    else if (!muted) unlock();
  }

  function setMusicVolume(next) {
    musicVolume = Math.max(0, Math.min(1, Number(next) || 0));
    STORE.set('kosen_music_volume', musicVolume);
    if (musicWasPlaying) fadeMusic(musicVolume * .41, .07);
  }

  function syncMute() {
    if (ctx && effectsBus) effectsBus.gain.setTargetAtTime(muted ? .0001 : .78, ctx.currentTime, .014);
    if (muted) { musicWasPlaying = false; fadeMusic(.0001, .018); }
    else if (unlockedByGesture) unlock();
  }

  function pauseMusic() {
    musicWasPlaying = false;
    fadeMusic(.0001, .018);
  }

  function tick(data, notPlaying) {
    lastMusicState = data;
    if (!ctx || ctx.state !== 'running') return;
    const active = unlockedByGesture && musicEnabled && musicVolume > 0 && !muted && !notPlaying;
    if (!active) {
      if (musicWasPlaying) { musicWasPlaying = false; fadeMusic(.0001, .025); }
      return;
    }
    if (!musicWasPlaying) {
      musicWasPlaying = true;
      nextStepTime = ctx.currentTime + .075;
      sequenceStep = 0;
      fadeMusic(musicVolume * .41, .15);
    }
    const bpm = Math.min(116, 86 + Math.min(5, data.milestoneIndex || 0) * 3 + Math.min(5, data.combo || 0) * 2 + (data.tempoMult > 1 ? 7 : 0));
    musicLastBpm = bpm;
    const stepLength = 30 / bpm; // eighth note in seconds
    // Web Audio scheduling is clock-accurate; bounded work and <=130ms lookahead.
    let scheduled = 0;
    while (nextStepTime < ctx.currentTime + .13 && scheduled++ < 2) {
      transportStep(nextStepTime, data);
      nextStepTime += stepLength;
    }
    if (nextStepTime < ctx.currentTime - stepLength) nextStepTime = ctx.currentTime + .02;
  }

  function onReset() {
    musicWasPlaying = false;
    sequenceStep = 0;
    fadeMusic(.0001, .025);
  }
  function onGameOver() {
    musicWasPlaying = false;
    fadeMusic(.0001, .028);
  }
  function debugStatus() {
    return { supported: !!(window.AudioContext || window.webkitAudioContext), initialized: !!ctx,
      unlocked: unlockedByGesture, contextState: ctx ? ctx.state : 'absent',
      musicEnabled, musicVolume, musicPlaying: musicWasPlaying,
      liveMusicVoices, scheduledNotes, bpm: musicLastBpm, step: sequenceStep };
  }

  return {
    playShoot, playSwap, playLock, playHeal, playTempoShift,
    playSkullDeath, playReject, playBombBlast, playMerge, playMilestone,
    playCoreDetonation, playUnlock, unlock, tick, setMusicEnabled,
    setMusicVolume, syncMute, pauseMusic, onReset, onGameOver, debugStatus
  };
})();

