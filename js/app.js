/* ============================================================
   主程式：3D 場景、拖曳旋轉、點擊換釉、第 6 下破掉、再捏一個
   ============================================================ */
(function () {
  const P = window.Pottery;
  const FOV = 26;
  const DEFAULT_ELEV = 0.2;   // 鏡頭俯角（弧度），稍微看得到罐口，跟原稿一樣
  const FLOW_TIME = 0.9;      // 新釉流下來要幾秒
  const REBUILD_TIME = 1.4;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AUTO_SPIN = reduceMotion ? 0 : 0.35; // 自轉速度（弧度/秒）

  const lerp = (a, b, k) => a + (b - a) * k;
  const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  /* ---------- 舞台：燈光、環境反射、接影子的地板 ---------- */
  function createStage(THREE, renderer, addons) {
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new addons.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.4;

    // 主光從左上前方打過來（跟原稿照片一樣左亮右暗）
    const key = new THREE.DirectionalLight(0xfff8f0, 2.6);
    key.position.set(-2.4, 4.6, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 0.5, far: 12 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    const fill = new THREE.DirectionalLight(0xfff3e6, 0.25);
    fill.position.set(2.6, 1.2, 1.6);
    scene.add(key, fill);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.07 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
    return { scene, camera };
  }

  /* ---------- 陶罐：搖晃層（以底部為支點）→ 轉盤層 → 網格 ---------- */
  function createPot(THREE, scene, anisotropy) {
    const profile = P.makeProfile(THREE);
    const textures = P.makeClayTextures(THREE, anisotropy);
    const glaze = P.makeGlazeMaterial(THREE, P.THEMES[0], textures);
    const clay = new THREE.MeshStandardMaterial({ color: '#D9AD8F', map: textures.map, roughness: 1, side: THREE.DoubleSide });

    const root = new THREE.Group();
    const spin = new THREE.Group();
    const mesh = new THREE.Mesh(P.makePotGeometry(THREE, profile), glaze);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // 點擊判定用的低面數替身（看不見），滑鼠移動時算得快
    const proxy = new THREE.Mesh(simplify(THREE, profile), new THREE.MeshBasicMaterial({ visible: false }));
    spin.add(mesh, proxy);
    root.add(spin);
    scene.add(root);
    return { profile, textures, glaze, clay, root, spin, mesh, proxy };
  }

  // 低解析度的陶罐（只給滑鼠判定用）
  function simplify(THREE, profile) {
    const geo = new THREE.BufferGeometry();
    const RADIAL = 48;
    const SEGS = 120;
    const pos = [];
    const uv = [];
    for (let i = 0; i <= SEGS; i++) {
      for (let j = 0; j <= RADIAL; j++) {
        const v = profile.vertexAt(i / SEGS, (j / RADIAL) * Math.PI * 2);
        pos.push(...v.p);
        uv.push(v.uv[0], v.uv[1]);
      }
    }
    const index = [];
    for (let i = 0; i < SEGS; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * (RADIAL + 1) + j;
        index.push(a, a + 1, a + RADIAL + 1, a + 1, a + RADIAL + 2, a + RADIAL + 1);
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    return geo;
  }

  P.start = function (THREE, addons) {
    const hero = document.querySelector('.hero');
    const canvas = document.getElementById('pot-canvas');
    const slot = document.querySelector('.pot-slot');

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (err) {
      P.ui.showFallback('這個瀏覽器不支援 WebGL，看不到 3D 陶罐。');
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping; // 這個色調映射比較不會把主題色洗掉
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const { scene, camera } = createStage(THREE, renderer, addons);
    const pot = createPot(THREE, scene, renderer.capabilities.getMaxAnisotropy());
    let lastClink = 0;
    const shards = P.createShardSystem(THREE, scene, pot.profile, pot.glaze, pot.clay, (impact) => {
      const now = performance.now();
      if (now - lastClink > 35) { lastClink = now; P.sound.clink(impact); }
    });

    const state = { mode: 'intact', clicks: 0, cracks: 0 };
    const view = { elev: DEFAULT_ELEV, elevTarget: DEFAULT_ELEV, dist: 4 };
    const spin = { vel: AUTO_SPIN };
    const wobble = { a: 0, v: 0 };
    const flow = { active: false, t: 0, bump0: 0, bump1: 0, queued: null };
    const fade = { active: false, t: 0, from: null, to: null };

    /* ---------- 版面：讓 3D 陶罐剛好落在 HTML 預留的 .pot-slot 位置 ---------- */
    function layout() {
      const w = hero.clientWidth;
      const h = hero.clientHeight;
      if (!w || !h) return;
      // 超大螢幕限制總像素數，筆電才跑得順
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2, Math.sqrt(4.5e6 / (w * h))));
      renderer.setSize(w, h, false);
      const hr = hero.getBoundingClientRect();
      const sr = slot.getBoundingClientRect();
      const cx = sr.left - hr.left + sr.width / 2;
      const cy = sr.top - hr.top + sr.height / 2;
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      view.dist = (h * 1.1) / (sr.height * 2 * tanHalf);
      camera.aspect = w / h;
      camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
      camera.updateProjectionMatrix();
      const visW = 2 * view.dist * tanHalf * camera.aspect;
      shards.setBounds(-(cx / w) * visW + 0.15, ((w - cx) / w) * visW - 0.15);
      renderer.render(scene, camera); // setSize 會清空畫布，立刻補畫一張，縮放視窗才不會閃
    }

    function updateCamera() {
      camera.position.set(0, 0.5 + Math.sin(view.elev) * view.dist, Math.cos(view.elev) * view.dist);
      camera.lookAt(0, 0.5, 0);
    }

    /* ---------- 換釉 ---------- */
    function snapshot() {
      return { color: pot.glaze.color.clone(), roughness: pot.glaze.roughness, clearcoat: pot.glaze.clearcoat, bump: pot.glaze.bumpScale };
    }

    function glazeWith(theme) {
      // 上一層釉還沒流完就又點：先讓它快速流完，再接著流這一層（不然下半截會瞬間跳色）
      if (flow.active) { flow.queued = theme; return; }
      // 新釉從罐口流下來：舊顏色交給 shader 當底，材質直接設成新顏色
      const u = pot.glaze.userData.glaze;
      u.uOldColor.value.copy(pot.glaze.color);
      u.uOldRough.value = pot.glaze.roughness;
      u.uOldCoat.value = pot.glaze.clearcoat;
      flow.bump0 = pot.glaze.bumpScale;
      flow.bump1 = theme.bump;
      pot.glaze.color.set(theme.pot);
      pot.glaze.roughness = theme.roughness;
      pot.glaze.clearcoat = Math.max(theme.clearcoat, 0.001);
      u.uFlow.value = 0;
      flow.t = 0;
      flow.active = true;
      fade.active = false;
    }

    function fadeTo(theme, seconds) {
      pot.glaze.userData.glaze.uFlow.value = 1;
      flow.active = false;
      flow.queued = null;
      fade.from = snapshot();
      fade.to = theme;
      fade.t = 0;
      fade.dur = seconds;
      fade.active = true;
    }

    function finishFlow() {
      if (!flow.active) return;
      flow.active = false;
      pot.glaze.userData.glaze.uFlow.value = 1;
      pot.glaze.bumpScale = flow.bump1;
    }

    // 破掉前：正在流的、排隊中的釉一次到位，碎片才會跟網頁主題同色
    function settleGlaze() {
      finishFlow();
      const next = flow.queued;
      flow.queued = null;
      if (!next) return;
      pot.glaze.color.set(next.pot);
      pot.glaze.roughness = next.roughness;
      pot.glaze.clearcoat = Math.max(next.clearcoat, 0.001);
      pot.glaze.bumpScale = next.bump;
    }

    function animateGlaze(dt) {
      if (flow.active) {
        const speed = flow.queued ? FLOW_TIME / 5 : FLOW_TIME;
        flow.t = Math.min(flow.t + dt / speed, 1);
        const k = easeInOut(flow.t);
        pot.glaze.userData.glaze.uFlow.value = k;
        pot.glaze.bumpScale = lerp(flow.bump0, flow.bump1, k);
        if (flow.t >= 1) {
          finishFlow();
          const next = flow.queued;
          flow.queued = null;
          if (next) glazeWith(next);
        }
      }
      if (fade.active) {
        fade.t = Math.min(fade.t + dt / fade.dur, 1);
        const k = easeInOut(fade.t);
        const { from, to } = fade;
        pot.glaze.color.copy(from.color).lerp(new THREE.Color(to.pot), k);
        pot.glaze.roughness = lerp(from.roughness, to.roughness, k);
        pot.glaze.clearcoat = lerp(from.clearcoat, Math.max(to.clearcoat, 0.001), k);
        pot.glaze.bumpScale = lerp(from.bump, to.bump, k);
        if (fade.t >= 1) fade.active = false;
      }
    }

    /* ---------- 點陶罐 ---------- */
    function hitPot(hit) {
      if (state.mode !== 'intact') return;
      state.clicks += 1;
      P.ui.played();
      if (state.clicks > P.BREAK_AFTER) { breakPot(hit); return; }

      const theme = P.THEMES[state.clicks % P.THEMES.length];
      P.ui.applyTheme(theme);
      glazeWith(theme);
      // 第 4、5 下開始出現裂痕，第 6 下就碎
      if (state.clicks >= P.BREAK_AFTER - 1) {
        pot.textures.addCrack(hit.uv, state.clicks === P.BREAK_AFTER ? 170 : 90);
        state.cracks += 1;
      }
      wobble.v += Math.sign(hit.point.x || 1) * (0.45 + state.clicks * 0.18);
      P.sound.tap(state.cracks);
    }

    function breakPot(hit) {
      state.mode = 'broken';
      settleGlaze();
      pot.root.updateMatrixWorld(true);
      shards.explode(pot.spin.matrixWorld, hit.point);
      pot.mesh.visible = false;
      P.sound.shatter();
      P.ui.broken();
    }

    P.ui.onRebuild(() => {
      if (state.mode !== 'broken') return;
      state.mode = 'rebuilding';
      P.ui.rebuilding();
      P.ui.applyTheme(P.THEMES[0]);
      fadeTo(P.THEMES[0], REBUILD_TIME);
      P.sound.rebuild();
      shards.rebuild(pot.spin.matrixWorld, REBUILD_TIME, () => {
        pot.textures.reset();
        pot.mesh.visible = true;
        state.mode = 'intact';
        state.clicks = 0;
        state.cracks = 0;
        P.ui.rebuilt();
      });
    });

    /* ---------- 滑鼠／觸控 ---------- */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function pick(clientX, clientY) {
      if (state.mode !== 'intact') return null;
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      camera.updateMatrixWorld();
      pot.root.updateMatrixWorld(true);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(pot.proxy, false)[0] || null;
    }

    const drag = { active: false, id: null, moved: false, x0: 0, y0: 0, lastX: 0, lastY: 0, lastT: 0 };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || drag.active) return; // 第二根手指落下就忽略
      Object.assign(drag, { active: true, id: e.pointerId, moved: false, x0: e.clientX, y0: e.clientY, lastX: e.clientX, lastY: e.clientY, lastT: performance.now() });
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag.active) {
        canvas.classList.toggle('is-over-pot', !!pick(e.clientX, e.clientY));
        return;
      }
      if (e.pointerId !== drag.id) return;
      // 視窗失焦時瀏覽器可能沒送放開事件：滑鼠鍵其實已經放開，就當作取消
      if (e.pointerType === 'mouse' && e.buttons === 0) { endDrag(e, true); return; }
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) {
        drag.moved = true;
        canvas.classList.add('is-dragging');
      }
      if (drag.moved) {
        const now = performance.now();
        const turn = (e.clientX - drag.lastX) * 0.012;
        pot.spin.rotation.y += turn;
        spin.vel = clamp(turn / Math.max((now - drag.lastT) / 1000, 0.008), -12, 12);
        view.elevTarget = clamp(view.elevTarget + (e.clientY - drag.lastY) * 0.004, -0.05, 0.9);
        drag.lastT = now;
      }
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
    });
    function endDrag(e, cancelled) {
      if (!drag.active || e.pointerId !== drag.id) return;
      drag.active = false;
      canvas.classList.remove('is-dragging');
      if (performance.now() - drag.lastT > 90) spin.vel = 0; // 停住才放開，就不要甩
      if (!drag.moved && !cancelled) {
        const hit = pick(e.clientX, e.clientY);
        if (hit) hitPot(hit);
      }
    }
    canvas.addEventListener('pointerup', (e) => endDrag(e, false));
    canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

    // 鍵盤：Tab 到陶罐後，Enter／空白鍵＝點一下，左右鍵＝轉
    canvas.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.repeat) return; // 按住不放不算連點
        const r = slot.getBoundingClientRect();
        const hit = pick(r.left + r.width / 2, r.top + r.height / 2);
        if (hit) hitPot(hit);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        spin.vel = clamp(spin.vel + (e.key === 'ArrowLeft' ? -2.5 : 2.5), -6, 6);
      }
    });

    /* ---------- 每一格動畫 ---------- */
    let prev = performance.now();
    function frame(now) {
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      tick(dt);
      requestAnimationFrame(frame);
    }

    function tick(dt) {
      if (!drag.active) {
        spin.vel = damp(spin.vel, AUTO_SPIN, 1.2, dt);
        pot.spin.rotation.y += spin.vel * dt;
        view.elevTarget = damp(view.elevTarget, DEFAULT_ELEV, 0.8, dt);
      }
      view.elev = damp(view.elev, view.elevTarget, 10, dt);
      updateCamera();

      // 被敲時的搖晃：阻尼彈簧
      wobble.v += (-170 * wobble.a - 7 * wobble.v) * dt;
      wobble.a += wobble.v * dt;
      pot.root.rotation.z = wobble.a;

      animateGlaze(dt);
      shards.update(dt);
      renderer.render(scene, camera);
    }

    new ResizeObserver(layout).observe(hero);
    new ResizeObserver(layout).observe(document.querySelector('.hero-title'));
    if (document.fonts) document.fonts.ready.then(layout);
    updateCamera();
    layout();
    P.ui.initSoundToggle(P.sound);
    requestAnimationFrame((t) => {
      prev = t;
      frame(t);
      P.ui.ready();
    });

  };
})();
