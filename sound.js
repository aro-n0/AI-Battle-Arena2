/**
 * sound.js - Web Audio API による BGM / SE サウンドシステム
 * 設定タブから音量調整・ミュート切替可能
 */

const SoundManager = {
  ctx: null,
  bgmGain: null,
  seGain: null,
  bgmSource: null,
  bgmEnabled: true,
  seEnabled: true,
  bgmVolume: 0.3,
  seVolume: 0.5,
  bgmPlaying: false,
  bgmInterval: null,

  init() {
    const savedBgm = localStorage.getItem('sound_bgm_enabled');
    const savedSe = localStorage.getItem('sound_se_enabled');
    const savedBgmVol = localStorage.getItem('sound_bgm_volume');
    const savedSeVol = localStorage.getItem('sound_se_volume');

    this.bgmEnabled = savedBgm !== null ? savedBgm === 'true' : true;
    this.seEnabled = savedSe !== null ? savedSe === 'true' : true;
    this.bgmVolume = savedBgmVol !== null ? parseFloat(savedBgmVol) : 0.3;
    this.seVolume = savedSeVol !== null ? parseFloat(savedSeVol) : 0.5;
  },

  ensureContext() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.bgmGain = this.ctx.createGain();
        this.seGain = this.ctx.createGain();
        this.bgmGain.connect(this.ctx.destination);
        this.seGain.connect(this.ctx.destination);
        this.bgmGain.gain.value = this.bgmEnabled ? this.bgmVolume : 0;
        this.seGain.gain.value = this.seEnabled ? this.seVolume : 0;
      } catch (e) {
        console.warn('Web Audio API not available:', e);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  playSE(type) {
    if (!this.seEnabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.seGain);

    switch (type) {
      case 'click':
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'attack':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      case 'special':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.3);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.45);
        break;
      case 'skill':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.linearRampToValueAtTime(784, now + 0.15);
        osc.frequency.linearRampToValueAtTime(1047, now + 0.3);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      case 'heal':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.linearRampToValueAtTime(784, now + 0.2);
        osc.frequency.linearRampToValueAtTime(1047, now + 0.4);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.55);
        break;
      case 'miss':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      case 'ko':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.65);
        break;
      case 'battle_start':
        this.playMelody([523, 659, 784, 1047], 0.1, 'square', 0.3);
        break;
      case 'battle_end':
        this.playMelody([784, 659, 523, 392], 0.15, 'triangle', 0.3);
        break;
      default:
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.12);
    }
  },

  playMelody(notes, noteDuration, waveType, volume) {
    if (!this.seEnabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.seGain);
      osc.type = waveType || 'square';
      osc.frequency.value = freq;
      const startTime = now + i * noteDuration;
      gain.gain.setValueAtTime(volume || 0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + noteDuration * 0.9);
      osc.start(startTime);
      osc.stop(startTime + noteDuration);
    });
  },

  startBGM() {
    if (!this.bgmEnabled) return;
    this.ensureContext();
    if (!this.ctx || this.bgmPlaying) return;

    this.bgmPlaying = true;
    this.playBGMLoop();
  },

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  },

  playBGMLoop() {
    if (!this.bgmPlaying || !this.ctx) return;

    const playNote = (freq, duration, delay) => {
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + duration - 0.05);
      osc.start(now);
      osc.stop(now + duration);
    };

    // 簡易BGM: 短いメロディパターンを繰り返す
    const melody = [261.63, 329.63, 392, 329.63, 261.63, 196, 220, 261.63];
    const noteDur = 0.4;
    const loopDur = melody.length * noteDur;

    const playLoop = () => {
      if (!this.bgmPlaying || !this.ctx) return;
      melody.forEach((freq, i) => {
        playNote(freq, noteDur, i * noteDur);
      });
    };

    playLoop();
    this.bgmInterval = setInterval(playLoop, loopDur * 1000);
  },

  setBgmEnabled(enabled) {
    this.bgmEnabled = enabled;
    localStorage.setItem('sound_bgm_enabled', String(enabled));
    if (enabled) {
      this.startBGM();
    } else {
      this.stopBGM();
    }
    if (this.bgmGain) {
      this.bgmGain.gain.value = enabled ? this.bgmVolume : 0;
    }
  },

  setSeEnabled(enabled) {
    this.seEnabled = enabled;
    localStorage.setItem('sound_se_enabled', String(enabled));
    if (this.seGain) {
      this.seGain.gain.value = enabled ? this.seVolume : 0;
    }
  },

  setBgmVolume(vol) {
    this.bgmVolume = Math.max(0, Math.min(1, vol));
    localStorage.setItem('sound_bgm_volume', String(this.bgmVolume));
    if (this.bgmGain && this.bgmEnabled) {
      this.bgmGain.gain.value = this.bgmVolume;
    }
  },

  setSeVolume(vol) {
    this.seVolume = Math.max(0, Math.min(1, vol));
    localStorage.setItem('sound_se_volume', String(this.seVolume));
    if (this.seGain && this.seEnabled) {
      this.seGain.gain.value = this.seVolume;
    }
  },

  applySettings() {
    if (this.bgmGain) {
      this.bgmGain.gain.value = this.bgmEnabled ? this.bgmVolume : 0;
    }
    if (this.seGain) {
      this.seGain.gain.value = this.seEnabled ? this.seVolume : 0;
    }
  }
};

function playSE(type) {
  if (typeof SoundManager !== 'undefined') {
    SoundManager.playSE(type);
  }
}

function toggleBgm() {
  const enabled = !SoundManager.bgmEnabled;
  SoundManager.setBgmEnabled(enabled);
  const btn = document.getElementById('bgm-toggle-btn');
  if (btn) btn.textContent = enabled ? '🎵 ON' : '🔇 OFF';
}

function toggleSe() {
  const enabled = !SoundManager.seEnabled;
  SoundManager.setSeEnabled(enabled);
  const btn = document.getElementById('se-toggle-btn');
  if (btn) btn.textContent = enabled ? '🔊 ON' : '🔇 OFF';
}

function setBgmVolumeFromSlider(val) {
  SoundManager.setBgmVolume(parseFloat(val) / 100);
}

function setSeVolumeFromSlider(val) {
  SoundManager.setSeVolume(parseFloat(val) / 100);
}

function initSoundSettings() {
  const bgmBtn = document.getElementById('bgm-toggle-btn');
  const seBtn = document.getElementById('se-toggle-btn');
  const bgmSlider = document.getElementById('bgm-volume-slider');
  const seSlider = document.getElementById('se-volume-slider');

  if (bgmBtn) bgmBtn.textContent = SoundManager.bgmEnabled ? '🎵 ON' : '🔇 OFF';
  if (seBtn) seBtn.textContent = SoundManager.seEnabled ? '🔊 ON' : '🔇 OFF';
  if (bgmSlider) bgmSlider.value = Math.round(SoundManager.bgmVolume * 100);
  if (seSlider) seSlider.value = Math.round(SoundManager.seVolume * 100);
}

document.addEventListener('DOMContentLoaded', () => {
  SoundManager.init();
  initSoundSettings();
});
