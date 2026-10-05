/* ============================================================
   陶瓷音效：全部用 Web Audio 即時合成，不需要任何音檔
   ============================================================ */
(function () {
  const P = (window.Pottery = window.Pottery || {});
  const VOLUME = 0.5;

  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem('pottery-muted') === '1'; } catch (e) { /* 無痕模式讀不到就算了 */ }

  // 瀏覽器規定：要等使用者點過畫面才能發聲，所以第一次要用時才建立
  function ready() {
    if (muted) return false;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // 會快速衰減的正弦波＝敲擊的「叮」
  function ping(freq, start, decay, gain) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(amp).connect(master);
    osc.start(start);
    osc.stop(start + decay + 0.05);
  }

  // 濾過的白噪音＝碎裂的「唰」
  function noise(start, dur, gain, freq, q) {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = buf;
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    amp.gain.value = gain;
    src.connect(filter).connect(amp).connect(master);
    src.start(start);
  }

  // iPhone 的 Safari 比較嚴格：在使用者第一次碰畫面時先放一段無聲的音，之後才發得出聲
  const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];
  function unlock() {
    if (!ready()) return;
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
    if (ctx.state === 'running') UNLOCK_EVENTS.forEach((t) => document.removeEventListener(t, unlock));
  }
  UNLOCK_EVENTS.forEach((t) => document.addEventListener(t, unlock, { passive: true }));

  P.sound = {
    // 敲陶罐。裂得越多，聲音越悶、越短
    tap(cracks) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const base = 1450 + Math.random() * 180 - cracks * 280;
      const decay = cracks > 0 ? 0.16 : 0.65;
      ping(base, t, decay, 0.22);
      ping(base * 2.76, t, decay * 0.5, 0.07);
      noise(t, 0.04, 0.5, 3000, 1);
    },

    // 整個碎掉
    shatter() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, 0.55, 1.5, 4200, 0.7);
      noise(t, 0.25, 1.1, 900, 0.8);
      ping(85, t, 0.3, 0.5);
    },

    // 碎片落地的細碎聲（由物理碰撞觸發）
    clink(strength) {
      if (!ready()) return;
      const t = ctx.currentTime;
      const g = Math.min(strength / 4, 1) * 0.07;
      ping(2600 + Math.random() * 3400, t, 0.05 + Math.random() * 0.08, g);
    },

    // 碎片飛回去重組
    rebuild() {
      if (!ready()) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 1.1);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.06, t + 0.5);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      osc.connect(amp).connect(master);
      osc.start(t);
      osc.stop(t + 1.25);
      ping(1500, t + 1.2, 0.6, 0.18);
    },

    get muted() { return muted; },

    setMuted(value) {
      muted = value;
      try { localStorage.setItem('pottery-muted', value ? '1' : '0'); } catch (e) { /* 忽略 */ }
      if (master) master.gain.value = value ? 0 : VOLUME;
    },
  };
})();
