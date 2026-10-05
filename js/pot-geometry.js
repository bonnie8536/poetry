/* ============================================================
   陶罐本體：剖面曲線 → 旋轉成形（就像拉坯）＋ 程式畫的陶土貼圖
   ============================================================ */
(function () {
  const P = (window.Pottery = window.Pottery || {});
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);

  // 陶罐剖面 [半徑, 高度]，比例照截圖量：最寬處直徑約 1、高約 1。
  // 一筆畫完：外側底部中心 → 外壁 → 罐口 → 內壁 → 內底中心
  const PROFILE = [
    [0.000, 0.000], [0.120, 0.000], [0.225, 0.002], [0.258, 0.012], [0.272, 0.032],
    [0.300, 0.065], [0.360, 0.130], [0.430, 0.215], [0.478, 0.320], [0.498, 0.430],
    [0.497, 0.530], [0.482, 0.630], [0.448, 0.725], [0.398, 0.800], [0.360, 0.850],
    [0.348, 0.885], [0.358, 0.905], [0.380, 0.925], [0.392, 0.952], [0.388, 0.978],
    [0.372, 0.995],
    [0.345, 1.004], // ← 罐口最高點（外壁與內壁的分界）
    [0.325, 0.995], [0.316, 0.975], [0.318, 0.940], [0.322, 0.905], [0.326, 0.870],
    [0.345, 0.830], [0.385, 0.775], [0.428, 0.705], [0.458, 0.620], [0.470, 0.530],
    [0.470, 0.430], [0.452, 0.330], [0.410, 0.235], [0.345, 0.155], [0.285, 0.090],
    [0.245, 0.055], [0.180, 0.040], [0.090, 0.036], [0.000, 0.035],
  ];
  const CREST_INDEX = 21;
  const BASE_CORNER_INDEX = 4;

  /* ---------- 剖面：沿弧長均勻取樣，之後查表就很快 ---------- */
  P.makeProfile = function (THREE) {
    const curve = new THREE.SplineCurve(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)));
    const RAW = 8000;
    const raw = curve.getPoints(RAW);
    const cum = [0];
    for (let i = 1; i <= RAW; i++) cum.push(cum[i - 1] + raw[i].distanceTo(raw[i - 1]));
    const total = cum[RAW];
    const sOf = (index) => cum[Math.round((index / (PROFILE.length - 1)) * RAW)] / total;

    const N = 2400;
    const R = new Float32Array(N + 1);
    const Y = new Float32Array(N + 1);
    let j = 0;
    for (let i = 0; i <= N; i++) {
      const target = (i / N) * total;
      while (j < RAW - 1 && cum[j + 1] < target) j++;
      const k = (target - cum[j]) / Math.max(cum[j + 1] - cum[j], 1e-9);
      R[i] = raw[j].x + (raw[j + 1].x - raw[j].x) * k;
      Y[i] = raw[j].y + (raw[j + 1].y - raw[j].y) * k;
    }
    // 法線＝切線往右轉 90°（外壁朝外、內壁朝罐子裡面）
    const NR = new Float32Array(N + 1);
    const NY = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const a = Math.max(i - 1, 0);
      const b = Math.min(i + 1, N);
      const tx = R[b] - R[a];
      const ty = Y[b] - Y[a];
      const len = Math.hypot(tx, ty) || 1;
      NR[i] = ty / len;
      NY[i] = -tx / len;
    }

    function at(s) {
      const f = Math.min(Math.max(s, 0), 1) * N;
      const i = Math.min(Math.floor(f), N - 1);
      const k = f - i;
      const nr = NR[i] + (NR[i + 1] - NR[i]) * k;
      const ny = NY[i] + (NY[i + 1] - NY[i]) * k;
      const nl = Math.hypot(nr, ny) || 1;
      return { r: R[i] + (R[i + 1] - R[i]) * k, y: Y[i] + (Y[i + 1] - Y[i]) * k, nr: nr / nl, ny: ny / nl };
    }

    // s＝剖面上的位置(0~1)，a＝繞中心軸的角度 → 3D 頂點
    function vertexAt(s, a) {
      const p = at(s);
      const sin = Math.sin(a);
      const cos = Math.cos(a);
      return {
        p: [p.r * sin, p.y, p.r * cos],
        n: [p.nr * sin, p.ny, p.nr * cos],
        uv: [a / TAU, s],
      };
    }

    const sCrest = sOf(CREST_INDEX);
    return { at, vertexAt, sCrest, tBase: sOf(BASE_CORNER_INDEX) / sCrest };
  };

  /* ---------- 完整的陶罐網格（沒破之前顯示這個） ---------- */
  P.makePotGeometry = function (THREE, profile) {
    const RADIAL = 160;
    const SEGS = 440;
    const pos = [];
    const nor = [];
    const uv = [];
    for (let i = 0; i <= SEGS; i++) {
      for (let j = 0; j <= RADIAL; j++) {
        const v = profile.vertexAt(i / SEGS, (j / RADIAL) * TAU);
        pos.push(...v.p);
        nor.push(...v.n);
        uv.push(v.uv[0], v.uv[1]);
      }
    }
    const index = [];
    for (let i = 0; i < SEGS; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * (RADIAL + 1) + j;
        const b = a + RADIAL + 1;
        const c = b + 1;
        const d = a + 1;
        index.push(a, d, b, d, c, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    return geo;
  };

  /* ---------- 陶土貼圖：拉坯紋、鐵斑點、細顆粒（灰階，顏色交給釉色決定） ---------- */
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function paintClay(W, H) {
    const color = canvas(W, H);
    const bump = canvas(W, H);
    const gc = color.getContext('2d');
    const gb = bump.getContext('2d');
    const ci = gc.createImageData(W, H);
    const bi = gb.createImageData(W, H);
    const ph = [rand(0, TAU), rand(0, TAU), rand(0, TAU), rand(0, TAU)];

    // 每一橫列的明暗與凹凸（拉坯時手指留下的一圈圈紋路）
    const rowL = new Float32Array(H);
    const rowB = new Float32Array(H);
    let drift = 0;
    for (let y = 0; y < H; y++) {
      const v = y / H;
      drift = drift * 0.97 + (Math.random() - 0.5) * 0.012;
      rowL[y] = 0.028 * Math.sin(v * TAU * 9 + ph[0]) + 0.016 * Math.sin(v * TAU * 31 + ph[1]) + drift;
      rowB[y] = Math.sin(v * TAU * 30 + 1.6 * Math.sin(v * TAU * 5 + ph[2])) * 0.5 + 0.5;
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const wave = 0.012 * Math.sin((x / W) * TAU * 2 + y * 0.004 + ph[3]);
        const L = Math.min(1, 0.95 + rowL[y] + wave + (Math.random() - 0.5) * 0.035) * 255;
        ci.data[i] = ci.data[i + 1] = ci.data[i + 2] = L;
        ci.data[i + 3] = 255;
        const B = 110 + rowB[y] * 70 + (Math.random() - 0.5) * 26;
        bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = B;
        bi.data[i + 3] = 255;
      }
    }
    gc.putImageData(ci, 0, 0);
    gb.putImageData(bi, 0, 0);

    // 細細的拉坯線
    for (let k = 0; k < 34; k++) {
      const y0 = rand(0, H);
      gc.strokeStyle = `rgba(0,0,0,${rand(0.03, 0.08)})`;
      gc.lineWidth = rand(0.6, 1.6);
      gc.beginPath();
      for (let x = 0; x <= W; x += 16) gc.lineTo(x, y0 + Math.sin(x * 0.01 + k) * 1.5);
      gc.stroke();
    }
    // 鐵斑點（深）與石英粒（淺），凹凸圖上也壓出小坑
    for (let k = 0; k < 2200; k++) {
      const x = rand(0, W);
      const y = rand(0, H);
      const r = Math.pow(Math.random(), 3) * 1.3 + 0.3; // 大多是細點，偶爾一顆大的
      gc.fillStyle = `rgba(70,42,28,${rand(0.12, 0.4)})`;
      gc.beginPath(); gc.arc(x, y, r, 0, TAU); gc.fill();
      gb.fillStyle = 'rgba(0,0,0,0.5)';
      gb.beginPath(); gb.arc(x, y, r, 0, TAU); gb.fill();
    }
    for (let k = 0; k < 700; k++) {
      gc.fillStyle = `rgba(255,255,255,${rand(0.15, 0.35)})`;
      gc.beginPath(); gc.arc(rand(0, W), rand(0, H), rand(0.4, 1.1), 0, TAU); gc.fill();
    }
    return { color, bump };
  }

  // 一道裂痕＝從敲擊點往外亂走的幾條折線（會分岔）
  function makeCrackLines(x, y, size) {
    const lines = [];
    function branch(bx, by, ang, len, width, depth) {
      const pts = [[bx, by]];
      let walked = 0;
      while (walked < len) {
        const step = rand(5, 11);
        ang += rand(-0.55, 0.55);
        bx += Math.cos(ang) * step;
        by += Math.sin(ang) * step;
        walked += step;
        pts.push([bx, by]);
        if (depth < 2 && Math.random() < 0.12) {
          const turn = (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 1.1);
          branch(bx, by, ang + turn, (len - walked) * rand(0.4, 0.7), width * 0.6, depth + 1);
        }
      }
      lines.push({ pts, width });
    }
    const count = 3 + Math.floor(Math.random() * 2);
    const start = rand(0, TAU);
    for (let i = 0; i < count; i++) {
      branch(x, y, start + (i * TAU) / count + rand(-0.4, 0.4), size * rand(0.6, 1), 2.2, 0);
    }
    return lines;
  }

  function strokeLines(g, lines, style, widthScale, dx, dy) {
    g.strokeStyle = style;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const line of lines) {
      g.lineWidth = line.width * widthScale;
      g.beginPath();
      line.pts.forEach(([x, y], i) => (i ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy)));
      g.stroke();
    }
  }

  P.makeClayTextures = function (THREE, anisotropy) {
    const W = 1024;
    const H = 1024;
    const pristine = paintClay(W, H);
    const color = canvas(W, H);
    const bump = canvas(W, H);
    const gc = color.getContext('2d');
    const gb = bump.getContext('2d');

    const map = new THREE.CanvasTexture(color);
    map.colorSpace = THREE.SRGBColorSpace;
    const bumpMap = new THREE.CanvasTexture(bump);
    for (const t of [map, bumpMap]) {
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = anisotropy;
    }

    function reset() {
      gc.drawImage(pristine.color, 0, 0);
      gb.drawImage(pristine.bump, 0, 0);
      map.needsUpdate = true;
      bumpMap.needsUpdate = true;
    }

    // uv＝點到陶罐的位置；size＝裂痕長度（貼圖像素）
    function addCrack(uv, size) {
      const x = (((uv.x % 1) + 1) % 1) * W;
      const y = (1 - uv.y) * H;
      const lines = makeCrackLines(x, y, size);
      for (const dx of [-W, 0, W]) { // 左右各畫一份，跨過接縫也連得起來
        strokeLines(gc, lines, 'rgba(255,255,255,0.35)', 1, dx + 1, 1);
        strokeLines(gc, lines, 'rgba(28,14,8,0.92)', 1, dx, 0);
        strokeLines(gb, lines, '#000', 1.8, dx, 0);
      }
      map.needsUpdate = true;
      bumpMap.needsUpdate = true;
    }

    reset();
    return { map, bumpMap, reset, addCrack };
  };

  /* ---------- 釉料材質：換色時新釉從罐口往下流（像沾釉） ---------- */
  P.makeGlazeMaterial = function (THREE, theme, textures) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: theme.pot,
      map: textures.map,
      bumpMap: textures.bumpMap,
      bumpScale: theme.bump,
      roughness: theme.roughness,
      // 清漆層一開始就打開（素燒陶給極小值），之後換釉才不用重新編譯 shader 而卡一下
      clearcoat: Math.max(theme.clearcoat, 0.001),
      clearcoatRoughness: 0.12,
    });
    const uniforms = {
      uFlow: { value: 1 },
      uOldColor: { value: new THREE.Color(theme.pot) },
      uOldRough: { value: theme.roughness },
      uOldCoat: { value: theme.clearcoat },
    };

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying float vPotY;\nvarying float vPotA;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPotY = position.y;\nvPotA = atan(position.x, position.z);');

      const physical = THREE.ShaderChunk.lights_physical_fragment
        .replace('material.clearcoat = clearcoat;', 'material.clearcoat = mix(uOldCoat, clearcoat, glazeMask);');
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', [
          'uniform float uFlow;', 'uniform vec3 uOldColor;', 'uniform float uOldRough;', 'uniform float uOldCoat;',
          'varying float vPotY;', 'varying float vPotA;', 'void main() {',
        ].join('\n'))
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', [
          // 釉面前緣從罐口往下移動，邊緣帶幾條往下流的釉痕
          'float drip = 0.06 * pow(max(sin(vPotA * 7.0 + 1.3), 0.0), 3.0) + 0.018 * sin(vPotA * 17.0 + 0.4);',
          'float front = 1.12 - uFlow * 1.32;',
          'float glazeMask = uFlow >= 1.0 ? 1.0 : smoothstep(front - 0.012, front + 0.012, vPotY + drip);',
          'vec4 diffuseColor = vec4( mix(uOldColor, diffuse, glazeMask), opacity );',
        ].join('\n'))
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(uOldRough, roughness, glazeMask);')
        .replace('#include <lights_physical_fragment>', physical);
    };
    mat.userData.glaze = uniforms;
    return mat;
  };
})();
