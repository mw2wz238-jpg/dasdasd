/**
 * Web Audio procedural synthesis engine for Project Vanguard AAA sound design
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private isMuted: boolean = false;

  public init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.75;
    this.sfxGain.connect(this.masterGain);

    this.voiceGain = this.ctx.createGain();
    this.voiceGain.gain.value = 0.9;
    this.voiceGain.connect(this.masterGain);
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.8, this.ctx.currentTime);
    }
  }

  public playGunshot(category: string, isSuppressed: boolean = false, pos?: { x: number; y: number; z: number }, listenerPos?: { x: number; y: number; z: number }) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    // Spatial attenuation if not player
    let volume = 1.0;
    if (pos && listenerPos) {
      const dx = pos.x - listenerPos.x;
      const dz = pos.z - listenerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      volume = Math.max(0.02, 1.0 / (1.0 + dist * 0.08));
    }

    // 1. Transient White Noise crack
    const bufLen = Math.floor(this.ctx.sampleRate * (isSuppressed ? 0.06 : (category === 'sniper' ? 0.22 : 0.12)));
    const buffer = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, isSuppressed ? 3 : 1.5);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = isSuppressed ? 'lowpass' : 'bandpass';
    noiseFilter.frequency.setValueAtTime(isSuppressed ? 600 : (category === 'sniper' ? 850 : 1600), t);
    noiseFilter.Q.setValueAtTime(isSuppressed ? 0.8 : 2.0, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime((isSuppressed ? 0.25 : 0.45) * volume, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + (isSuppressed ? 0.06 : (category === 'sniper' ? 0.22 : 0.12)));

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.sfxGain!);
    noise.start(t);

    // 2. Sub-bass punch (except when suppressed)
    if (!isSuppressed) {
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      const startFreq = category === 'sniper' ? 120 : (category === 'shotgun' ? 95 : 150);
      sub.frequency.setValueAtTime(startFreq, t);
      sub.frequency.exponentialRampToValueAtTime(25, t + (category === 'sniper' ? 0.18 : 0.08));

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.5 * volume, t);
      subGain.gain.exponentialRampToValueAtTime(0.001, t + (category === 'sniper' ? 0.2 : 0.09));

      sub.connect(subGain);
      subGain.connect(this.sfxGain!);
      sub.start(t);
      sub.stop(t + (category === 'sniper' ? 0.22 : 0.1));
    }
  }

  public playReload() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    // Mag eject at 0.15s, Mag insert at 0.65s, Bolt pull at 1.1s
    const clicks = [
      { delay: 0.12, freq: 800, dur: 0.04, vol: 0.2 },
      { delay: 0.65, freq: 450, dur: 0.06, vol: 0.3 },
      { delay: 1.05, freq: 1100, dur: 0.05, vol: 0.25 },
    ];

    clicks.forEach((c) => {
      const time = t + c.delay;
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(c.freq, time);
      osc.frequency.exponentialRampToValueAtTime(c.freq * 0.5, time + c.dur);

      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(c.vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + c.dur);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(time);
      osc.stop(time + c.dur);
    });
  }

  public playFootstep(material: 'concrete' | 'snow' | 'metal' = 'concrete') {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = material === 'metal' ? 'sawtooth' : 'triangle';
    const freq = material === 'snow' ? 140 : material === 'metal' ? 320 : 180;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, t + 0.06);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(material === 'snow' ? 0.06 : 0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  public playHitmarker(isHeadshot: boolean = false) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isHeadshot ? 1800 : 1100, t);
    osc.frequency.setValueAtTime(isHeadshot ? 2400 : 900, t + 0.03);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isHeadshot ? 0.35 : 0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (isHeadshot ? 0.12 : 0.07));

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  public playImpactSound(
    materialType: string = 'concrete',
    pos?: { x: number; y: number; z: number },
    listenerPos?: { x: number; y: number; z: number }
  ) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    let volume = 1.0;
    if (pos && listenerPos) {
      const dx = pos.x - listenerPos.x;
      const dz = pos.z - listenerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      volume = Math.max(0.03, 1.0 / (1.0 + dist * 0.09));
    }

    if (materialType === 'metal') {
      // Iskrzący rykoszet metalowy
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(2400, t);
      osc.frequency.exponentialRampToValueAtTime(800, t + 0.08);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.35 * volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.09);
    } else if (materialType === 'container') {
      // Pusty rezonans głębokiej blachy kontenera
      const sub = this.ctx.createOscillator();
      sub.type = 'square';
      sub.frequency.setValueAtTime(140, t);
      sub.frequency.exponentialRampToValueAtTime(45, t + 0.12);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.4 * volume, t);
      subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      sub.connect(subGain);
      subGain.connect(this.sfxGain!);
      sub.start(t);
      sub.stop(t + 0.13);
    } else if (materialType === 'wood') {
      // Puknięcie i chrupnięcie drewna
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.06);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3 * volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.07);
    } else if (materialType === 'glass') {
      // Brzęk pękającego szkła
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(3800, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.07);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.32 * volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.08);
    } else {
      // Stłumiony plask/krach betonu lub asfaltu (concrete / asphalt)
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.05);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.28 * volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  public playExplosion(pos?: { x: number; y: number; z: number }, listenerPos?: { x: number; y: number; z: number }) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    let volume = 1.0;
    if (pos && listenerPos) {
      const dx = pos.x - listenerPos.x;
      const dz = pos.z - listenerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      volume = Math.max(0.05, 1.0 / (1.0 + dist * 0.04));
    }

    // Heavy low bass blast
    const sub = this.ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(65, t);
    sub.frequency.exponentialRampToValueAtTime(15, t + 1.2);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.7 * volume, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    sub.connect(subGain);
    subGain.connect(this.sfxGain!);
    sub.start(t);
    sub.stop(t + 1.3);

    // Blast noise
    const bufLen = Math.floor(this.ctx.sampleRate * 1.4);
    const buffer = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 0.8);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.linearRampToValueAtTime(100, t + 1.2);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6 * volume, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain!);
    noise.start(t);
  }

  public playSmokeHiss() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const bufLen = Math.floor(this.ctx.sampleRate * 2.2);
    const buffer = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.Q.value = 3;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 2.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);
    noise.start(t);
  }

  public playBombBeep(urgent: boolean = false) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(urgent ? 2900 : 2200, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (urgent ? 0.05 : 0.08));
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + (urgent ? 0.06 : 0.09));
  }

  public playBombPlanted() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    [1800, 2200, 2600].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t + idx * 0.1);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.18, t + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.1 + 0.08);
      osc.connect(gain);
      gain.connect(this.voiceGain!);
      osc.start(t + idx * 0.1);
      osc.stop(t + idx * 0.1 + 0.09);
    });
  }

  public playBombDefused() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    [1200, 1600, 2400].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.12);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.25, t + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.12 + 0.2);
      osc.connect(gain);
      gain.connect(this.voiceGain!);
      osc.start(t + idx * 0.12);
      osc.stop(t + idx * 0.12 + 0.22);
    });
  }

  public playDefuseWireSnip() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.04);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  public playInspectWeapon() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Mechanical sling and swivel sound
    [0.1, 0.45, 0.9].forEach((delay, idx) => {
      const time = t + delay;
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320 + idx * 140, time);
      osc.frequency.exponentialRampToValueAtTime(160, time + 0.08);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.06, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(time);
      osc.stop(time + 0.09);
    });
  }

  public playUIBeep(high: boolean = false) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(high ? 880 : 440, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  public playUI(type: 'click' | 'purchase' | 'hover' = 'click') {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    if (type === 'purchase') {
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + idx * 0.04);
        const gain = this.ctx!.createGain();
        gain.gain.setValueAtTime(0.1, t + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.04 + 0.08);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t + idx * 0.04);
        osc.stop(t + idx * 0.04 + 0.09);
      });
    } else if (type === 'hover') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(540, t);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.03);
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, t);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.05);
    }
  }

  public playRoundStart() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Military radio double-tone
    [480, 720].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.12, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.09);
      osc.connect(gain);
      gain.connect(this.voiceGain!);
      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.1);
    });
  }

  public playRoundWon() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Victory fanfare chords (D4, F#4, A4)
    [293.66, 369.99, 440.00, 587.33].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t + i * 0.09);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.14, t + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.5);
      osc.connect(gain);
      gain.connect(this.voiceGain!);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.6);
    });
  }

  public playRoundLost() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Defeat minor low drone
    [220.0, 207.65, 196.0].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t + i * 0.18);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.1, t + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.18 + 0.4);
      osc.connect(gain);
      gain.connect(this.voiceGain!);
      osc.start(t + i * 0.18);
      osc.stop(t + i * 0.18 + 0.45);
    });
  }

  public playFlashbangDetonate() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Sharp high explosive crack
    const bufLen = Math.floor(this.ctx.sampleRate * 0.18);
    const buffer = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2.5);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2200, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);
    noise.start(t);
  }

  public playTinnitus(durationSec: number = 3.5) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // High-pitched ringing sine wave at ~3800Hz
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3800, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + durationSec);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + durationSec);
  }

  public playClaymoreArm() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Double metallic latch click
    [1800, 2400].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0.09, t + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.04);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.05);
    });
  }

  public playClaymoreTrigger() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Tiny click before detonation
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2800, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  public playUAVScan() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Sonar radar sweep ping
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain);
    gain.connect(this.voiceGain!);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  public playAirstrikeJet() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Low jet turbine pass whoosh
    const bufLen = Math.floor(this.ctx.sampleRate * 2.2);
    const buffer = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufLen) * Math.PI);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(350, t);
    filter.frequency.linearRampToValueAtTime(750, t + 1.1);
    filter.frequency.linearRampToValueAtTime(200, t + 2.2);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);
    noise.start(t);
  }

  public playPredatorRocket() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Rocket thruster acceleration scream
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(650, t + 1.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 1.5);
  }

  public playWallbang() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Heavy wooden/metal penetration splinter thud
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  public playRadioCallout(type: string) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // Tactically stylized radio mic chirp
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const freq = type === 'enemy_spotted' ? 950 : (type === 'grenade' ? 760 : 620);
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.setValueAtTime(freq * 1.25, t + 0.04);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain);
    gain.connect(this.voiceGain!);
    osc.start(t);
    osc.stop(t + 0.1);
  }
}

export const Sound = new SoundEngine();
