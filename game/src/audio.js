// Solmar Heat — all sound is synthesized with WebAudio, no audio files.
// Engine hum, sirens, gunshots, pickups and a small bass loop are built from
// oscillators and filtered noise, so the game ships zero audio assets.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenOn = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Browsers only allow audio after a user gesture; call from the first
  // click or keypress and everything after it just works.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // --- Engine ---------------------------------------------------------------
  startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  // speed01 is 0..1 of the car's top speed; onFoot silences the engine.
  setEngine(speed01, driving) {
    if (!this.engineGain) return;
    const target = driving ? 0.05 + speed01 * 0.06 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, this.ctx.currentTime, 0.08);
  }

  // --- Siren ----------------------------------------------------------------
  setSiren(on) {
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 780;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenGain.gain.setTargetAtTime(0.045, this.ctx.currentTime, 0.2);
    } else if (!on && this.sirenOsc) {
      const osc = this.sirenOsc;
      const gain = this.sirenGain;
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      setTimeout(() => { try { osc.stop(); } catch (e) { /* already stopped */ } }, 400);
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }

  // Called every frame while the siren plays: two-tone wail.
  updateSiren(dt) {
    if (!this.sirenOsc) return;
    this.sirenTimer += dt;
    const phase = Math.floor(this.sirenTimer / 0.45) % 2;
    this.sirenOsc.frequency.setTargetAtTime(phase === 0 ? 780 : 1040, this.ctx.currentTime, 0.05);
  }

  // --- One-shots --------------------------------------------------------------
  blip(freq, dur, type = 'sine', vol = 0.16, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  gunshot() { this.noiseBurst(0.12, 0.5, 2400); this.blip(160, 0.09, 'square', 0.14, 60); }
  crash() { this.noiseBurst(0.25, 0.4, 900); }
  pickup() { this.blip(660, 0.09, 'sine', 0.16); setTimeout(() => this.blip(990, 0.12, 'sine', 0.16), 70); }
  coin() { this.blip(880, 0.07, 'sine', 0.14); setTimeout(() => this.blip(1320, 0.1, 'sine', 0.14), 60); }
  busted() { this.blip(220, 0.5, 'sawtooth', 0.16, 110); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.18), i * 110));
  }
  missionFail() { this.blip(392, 0.25, 'sawtooth', 0.14, 196); }

  // --- Music: a slow sun-soaked bass loop ------------------------------------
  startMusic() {
    // A minor-key bass walk over a soft pad, one note every half second.
    const bass = [55, 55, 65.4, 49, 55, 55, 82.4, 73.4];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const f = bass[this.musicStep % bass.length];
      this.musicStep++;
      this.blip(f, 0.5, 'triangle', 0.07);
      if (this.musicStep % 2 === 0) this.blip(f * 2, 0.3, 'sine', 0.035);
    }, 480);
  }
}
