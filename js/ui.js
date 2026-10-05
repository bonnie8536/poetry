/* ============================================================
   網頁介面：主題色、釉色名稱、提示文字、重做按鈕、音效開關
   ============================================================ */
(function () {
  const P = (window.Pottery = window.Pottery || {});
  const root = document.documentElement;
  const $ = (sel) => document.querySelector(sel);

  const MARQUEE_SPEED = 55; // 跑馬燈速度（每秒幾 px）

  let rebuildTimer = 0;

  // 跑馬燈：依螢幕寬度複製足夠份數的文字，再整串往左移一半，就能無縫循環
  function initMarquee() {
    const track = $('.marquee-track');
    const first = track && track.querySelector('p');
    if (!first) return;
    const unit = Math.max(first.getBoundingClientRect().width, 200);
    const need = Math.max(window.screen.width, window.innerWidth) * 1.5;
    const perHalf = Math.max(1, Math.ceil(need / unit));
    for (let i = 1; i < perHalf * 2; i++) {
      const copy = first.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      track.appendChild(copy);
    }
    const setSpeed = () => { track.style.animationDuration = `${track.scrollWidth / 2 / MARQUEE_SPEED}s`; };
    setSpeed();
    if (document.fonts) document.fonts.ready.then(setSpeed);
  }
  initMarquee();

  P.ui = {
    // 換整站主題色：只改 CSS 變數，顏色漸變交給 CSS transition
    applyTheme(theme) {
      root.style.setProperty('--theme', theme.site);
      root.style.setProperty('--accent', theme.accent);
      root.style.setProperty('--pot', theme.pot);
      $('#glaze-name').textContent = theme.name;
      $('#glaze-en').textContent = theme.en;
      const meta = $('meta[name="theme-color"]');
      if (meta) meta.content = theme.site;
    },

    ready() {
      $('.hero').classList.add('is-ready');
    },

    played() {
      $('.hero').classList.add('has-played');
    },

    broken() {
      const hero = $('.hero');
      hero.classList.add('is-broken', 'is-shaking');
      setTimeout(() => hero.classList.remove('is-shaking'), 500);
      // 用鍵盤操作的人，焦點跟著移到按鈕；滑鼠使用者就不要多一圈焦點框
      const keyboardUser = $('#pot-canvas').matches(':focus-visible');
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => {
        const btn = $('.rebuild-btn');
        btn.hidden = false;
        if (keyboardUser) btn.focus({ preventScroll: true });
      }, 1300);
    },

    rebuilding() {
      const btn = $('.rebuild-btn');
      this.returnFocus = btn.matches(':focus-visible');
      btn.hidden = true;
    },

    rebuilt() {
      $('.hero').classList.remove('is-broken', 'has-played');
      if (this.returnFocus) $('#pot-canvas').focus({ preventScroll: true });
    },

    onRebuild(handler) {
      $('.rebuild-btn').addEventListener('click', handler);
    },

    showFallback(message) {
      const hero = $('.hero');
      hero.classList.add('no-3d');
      const box = $('.pot-fallback');
      box.textContent = message;
      box.hidden = false;
    },

    initSoundToggle(sound) {
      const btn = $('.sound-toggle');
      const sync = () => {
        btn.setAttribute('aria-pressed', String(!sound.muted));
        btn.setAttribute('aria-label', sound.muted ? '開啟音效' : '關閉音效');
        btn.classList.toggle('is-muted', sound.muted);
      };
      btn.addEventListener('click', () => {
        sound.setMuted(!sound.muted);
        sync();
      });
      sync();
    },
  };
})();
