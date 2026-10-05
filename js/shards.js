/* ============================================================
   破掉：把陶罐切成一片片有厚度的碎片，再用簡單物理讓它們飛出去、落地
   ============================================================ */
(function () {
  const P = (window.Pottery = window.Pottery || {});
  const TAU = Math.PI * 2;
  const GRAVITY = 12;
  const rand = (a, b) => a + Math.random() * (b - a);

  // 分段線性的隨機函數：用來畫鋸齒狀的裂縫邊緣
  function jagged(knots, amp) {
    const vals = Array.from({ length: knots }, () => rand(-amp, amp));
    return (x) => {
      const f = Math.min(Math.max(x, 0), 1) * (knots - 1);
      const i = Math.min(Math.floor(f), knots - 2);
      const k = f - i;
      return vals[i] * (1 - k) + vals[i + 1] * k;
    };
  }

  /* ---------- 切碎片 ----------
     在「角度 × 剖面位置」的平面上切成不規則的格子：
     直的裂縫一欄一欄，橫的裂縫每欄各自亂切，最底下一圈是底座的扇形。 */
  P.buildShards = function (THREE, profile) {
    const COLS = 12;
    const w = TAU / COLS;
    const offset = rand(0, TAU);
    const colA = [];
    for (let i = 0; i < COLS; i++) colA.push(offset + (i + rand(-0.2, 0.2)) * w);
    colA.push(colA[0] + TAU);
    const edges = [];
    for (let i = 0; i < COLS; i++) edges.push(jagged(7, 0.24 * w));
    edges.push(edges[0]);

    const shards = [];
    for (let c = 0; c < COLS; c++) {
      const rows = Math.random() < 0.5 ? 5 : 6;
      const first = profile.tBase + rand(0.01, 0.05);
      const span = (1 - first) / (rows - 1);
      const levels = [0, first];
      for (let k = 1; k < rows - 1; k++) levels.push(first + span * k + rand(-0.22, 0.22) * span);
      levels.push(1);
      const cuts = levels.map((lv, k) => {
        if (k === 0 || k === levels.length - 1) return () => lv;
        const jig = jagged(4, 0.028);
        return (u) => lv + jig(u);
      });
      for (let r = 0; r < rows; r++) {
        shards.push(buildOne(THREE, profile, colA[c], colA[c + 1], edges[c], edges[c + 1], cuts[r], cuts[r + 1], r === 0));
      }
    }
    return shards;
  };

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function buildOne(THREE, profile, a0, a1, edge0, edge1, bottom, top, isBase) {
    const NU = 7;
    const NV = Math.max(3, Math.ceil((top(0.5) - bottom(0.5)) * 40));
    const outer = [];
    const inner = [];
    for (let v = 0; v <= NV; v++) {
      const rowO = [];
      const rowI = [];
      for (let u = 0; u <= NU; u++) {
        const uu = u / NU;
        const t = bottom(uu) + (top(uu) - bottom(uu)) * (v / NV);
        const a = a0 + (a1 - a0) * uu + edge0(t) * (1 - uu) + edge1(t) * uu;
        rowO.push(profile.vertexAt(t * profile.sCrest, a));
        rowI.push(profile.vertexAt(1 - t * (1 - profile.sCrest), a));
      }
      outer.push(rowO);
      inner.push(rowI);
    }

    const pos = [];
    const nor = [];
    const uvs = [];
    // 外表面、內表面：用平滑法線，三角形方向依法線自動校正
    function smoothTri(A, B, C) {
      const f = cross(sub(B.p, A.p), sub(C.p, A.p));
      const n = [A.n[0] + B.n[0] + C.n[0], A.n[1] + B.n[1] + C.n[1], A.n[2] + B.n[2] + C.n[2]];
      const list = dot(f, n) < 0 ? [A, C, B] : [A, B, C];
      for (const V of list) { pos.push(...V.p); nor.push(...V.n); uvs.push(...V.uv); }
    }
    for (const grid of [outer, inner]) {
      for (let v = 0; v < NV; v++) {
        for (let u = 0; u < NU; u++) {
          smoothTri(grid[v][u], grid[v][u + 1], grid[v + 1][u + 1]);
          smoothTri(grid[v][u], grid[v + 1][u + 1], grid[v + 1][u]);
        }
      }
    }
    const surfaceCount = pos.length / 3;

    // 斷面（看得到陶土本色的那一圈）：平面法線，雙面材質
    function flatTri(A, B, C) {
      const f = cross(sub(B.p, A.p), sub(C.p, A.p));
      const len = Math.hypot(f[0], f[1], f[2]);
      if (len < 1e-12) return;
      const n = [f[0] / len, f[1] / len, f[2] / len];
      for (const V of [A, B, C]) { pos.push(...V.p); nor.push(...n); uvs.push(...V.uv); }
    }
    const rim = [
      outer[0].map((o, k) => [o, inner[0][k]]),
      outer[NV].map((o, k) => [o, inner[NV][k]]),
      outer.map((row, k) => [row[0], inner[k][0]]),
      outer.map((row, k) => [row[NU], inner[k][NU]]),
    ];
    for (const line of rim) {
      for (let k = 0; k < line.length - 1; k++) {
        const [o1, i1] = line[k];
        const [o2, i2] = line[k + 1];
        flatTri(o1, o2, i2);
        flatTri(o1, i2, i1);
      }
    }

    // 以碎片中心為原點，之後旋轉才會繞著自己轉
    const center = new THREE.Vector3();
    let count = 0;
    for (const grid of [outer, inner]) {
      for (const row of grid) for (const V of row) { center.x += V.p[0]; center.y += V.p[1]; center.z += V.p[2]; count++; }
    }
    center.divideScalar(count);
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] -= center.x; pos[i + 1] -= center.y; pos[i + 2] -= center.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.addGroup(0, surfaceCount, 0);
    geometry.addGroup(surfaceCount, pos.length / 3 - surfaceCount, 1);

    // 碰撞用的取樣點（角落＋邊中點）與「平均朝向」（落地後會慢慢躺平）
    const hu = Math.floor(NU / 2);
    const hv = Math.floor(NV / 2);
    const picks = [
      outer[0][0], outer[0][NU], outer[NV][0], outer[NV][NU], outer[0][hu], outer[NV][hu], outer[hv][0], outer[hv][NU], outer[hv][hu],
      inner[0][0], inner[0][NU], inner[NV][0], inner[NV][NU],
    ];
    const points = picks.map((V) => new THREE.Vector3(V.p[0], V.p[1], V.p[2]).sub(center));
    const normal = new THREE.Vector3();
    for (const row of outer) for (const V of row) normal.add(new THREE.Vector3(V.n[0], V.n[1], V.n[2]));
    normal.normalize();

    return { geometry, center, points, normal, isBase };
  }

  /* ---------- 灰塵 ---------- */
  function makeDust(THREE, scene, profile) {
    const N = 160;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 64;
    const g = dot.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const mat = new THREE.PointsMaterial({
      color: 0xd8bea6, size: 0.06, map: new THREE.CanvasTexture(dot),
      transparent: true, depthWrite: false, opacity: 0,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);
    const LIFE = 2.2;
    let age = LIFE;
    const tmp = new THREE.Vector3();

    return {
      emit(matrixWorld) {
        for (let i = 0; i < N; i++) {
          const V = profile.vertexAt(rand(0.06, profile.sCrest), rand(0, TAU));
          tmp.set(V.p[0], V.p[1], V.p[2]).applyMatrix4(matrixWorld);
          pos.set([tmp.x, tmp.y, tmp.z], i * 3);
          const s = rand(0.2, 1.0);
          vel.set([V.n[0] * s, rand(0.05, 0.7), V.n[2] * s], i * 3);
        }
        geo.attributes.position.needsUpdate = true;
        age = 0;
        points.visible = true;
      },
      update(dt) {
        if (age >= LIFE) return;
        age += dt;
        const drag = Math.max(0, 1 - 1.8 * dt);
        for (let i = 0; i < N * 3; i += 3) {
          vel[i] *= drag; vel[i + 2] *= drag;
          vel[i + 1] = vel[i + 1] * drag - 0.25 * dt;
          pos[i] += vel[i] * dt; pos[i + 1] += vel[i + 1] * dt; pos[i + 2] += vel[i + 2] * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0.6 * Math.pow(Math.max(0, 1 - age / LIFE), 1.5);
        if (age >= LIFE) points.visible = false;
      },
    };
  }

  /* ---------- 碎片系統：爆開、物理、飛回去重組 ---------- */
  P.createShardSystem = function (THREE, scene, profile, glazeMat, edgeMat, onImpact) {
    const pieces = P.buildShards(THREE, profile).map((d) => {
      const mesh = new THREE.Mesh(d.geometry, [glazeMat, edgeMat]);
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      return Object.assign(d, {
        mesh,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        rest: 0,
        sleeping: false,
        fromP: new THREE.Vector3(),
        fromQ: new THREE.Quaternion(),
        delay: 0,
      });
    });
    const dust = makeDust(THREE, scene, profile);
    const bounds = { minX: -2, maxX: 2, minZ: -1.4, maxZ: 0.5 };
    const tv = new THREE.Vector3();
    const tn = new THREE.Vector3();
    const up = new THREE.Vector3();
    const tq = new THREE.Quaternion();
    const tq2 = new THREE.Quaternion();
    const potQ = new THREE.Quaternion();
    const potP = new THREE.Vector3();
    const potS = new THREE.Vector3();
    let mode = 'idle';
    let rebuildT = 0;
    let rebuildDur = 1.3;
    let rebuildMatrix = null;
    let rebuildDone = null;

    function explode(matrixWorld, hitPoint) {
      matrixWorld.decompose(potP, potQ, potS);
      for (const pc of pieces) {
        pc.mesh.position.copy(pc.center).applyMatrix4(matrixWorld);
        pc.mesh.quaternion.copy(potQ);
        pc.mesh.visible = true;
        pc.sleeping = false;
        pc.rest = 0;
        // 往外噴：越靠近敲擊點、位置越高，飛越遠
        tv.set(pc.center.x, 0, pc.center.z);
        if (tv.lengthSq() < 1e-6) tv.set(rand(-1, 1), 0, rand(-1, 1));
        tv.applyQuaternion(potQ).setY(0).normalize();
        const near = 1 - Math.min(pc.mesh.position.distanceTo(hitPoint) / 1.1, 1);
        if (pc.isBase) {
          pc.vel.copy(tv).multiplyScalar(rand(0.05, 0.3));
          pc.vel.y = rand(0, 0.35);
          pc.spin.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(1.2);
        } else {
          pc.vel.copy(tv).multiplyScalar(rand(0.5, 1.15) + near * 0.9);
          pc.vel.y = rand(0.8, 2.0) + pc.center.y * 0.8;
          pc.spin.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(rand(4, 10));
        }
        if (pc.vel.z > 0) pc.vel.z *= 0.35; // 少往鏡頭飛，免得擋住畫面跟按鈕
      }
      dust.emit(matrixWorld);
      mode = 'flying';
    }

    function step(pc, dt) {
      if (pc.sleeping) return;
      const m = pc.mesh;
      pc.vel.y -= GRAVITY * dt;
      m.position.addScaledVector(pc.vel, dt);
      const w = pc.spin.length();
      if (w > 1e-4) {
        tq.setFromAxisAngle(tv.copy(pc.spin).divideScalar(w), w * dt);
        m.quaternion.premultiply(tq);
      }
      // 看不見的牆：碎片不會飛出畫面
      if (m.position.x < bounds.minX) { m.position.x = bounds.minX; pc.vel.x = Math.abs(pc.vel.x) * 0.3; }
      if (m.position.x > bounds.maxX) { m.position.x = bounds.maxX; pc.vel.x = -Math.abs(pc.vel.x) * 0.3; }
      if (m.position.z < bounds.minZ) { m.position.z = bounds.minZ; pc.vel.z = Math.abs(pc.vel.z) * 0.3; }
      if (m.position.z > bounds.maxZ) { m.position.z = bounds.maxZ; pc.vel.z = -Math.abs(pc.vel.z) * 0.3; }

      // 地板碰撞：找出碎片目前最低的點
      let minY = Infinity;
      for (const p of pc.points) minY = Math.min(minY, tv.copy(p).applyQuaternion(m.quaternion).y);
      const bottom = m.position.y + minY;
      if (bottom >= 0) { pc.rest = 0; return; }

      m.position.y -= bottom;
      if (pc.vel.y < 0) {
        const impact = -pc.vel.y;
        pc.vel.y = impact > 0.6 ? impact * 0.3 : 0;
        pc.vel.x *= 0.65;
        pc.vel.z *= 0.65;
        pc.spin.multiplyScalar(0.55);
        if (impact > 1.2 && onImpact) onImpact(impact);
      }
      // 貼著地板：摩擦減速，並慢慢躺平
      const fr = Math.max(0, 1 - dt * 5);
      pc.vel.x *= fr;
      pc.vel.z *= fr;
      pc.spin.multiplyScalar(Math.max(0, 1 - dt * 6));
      tn.copy(pc.normal).applyQuaternion(m.quaternion);
      up.set(0, tn.y >= 0 ? 1 : -1, 0);
      tq.setFromUnitVectors(tn, up);
      tq2.copy(m.quaternion).premultiply(tq);
      m.quaternion.slerp(tq2, Math.min(1, dt * 3));
      pc.rest += dt;
      if (pc.rest > 1.5 && pc.vel.lengthSq() < 4e-4) pc.sleeping = true;
    }

    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

    function stepRebuild(dt) {
      rebuildT += dt;
      rebuildMatrix.decompose(potP, potQ, potS);
      for (const pc of pieces) {
        const k = ease(Math.min(Math.max((rebuildT - pc.delay) / (rebuildDur - 0.3), 0), 1));
        tv.copy(pc.center).applyMatrix4(rebuildMatrix);
        pc.mesh.position.lerpVectors(pc.fromP, tv, k);
        pc.mesh.position.y += Math.sin(k * Math.PI) * 0.35;
        pc.mesh.quaternion.slerpQuaternions(pc.fromQ, potQ, k);
      }
      if (rebuildT >= rebuildDur) {
        hide();
        const done = rebuildDone;
        rebuildDone = null;
        if (done) done();
      }
    }

    function rebuild(matrixWorld, duration, onDone) {
      rebuildMatrix = matrixWorld; // 是即時更新的參考：陶罐一邊轉，碎片一邊追著飛回去
      rebuildDur = duration;
      rebuildDone = onDone;
      rebuildT = 0;
      for (const pc of pieces) {
        pc.fromP.copy(pc.mesh.position);
        pc.fromQ.copy(pc.mesh.quaternion);
        pc.delay = rand(0, 0.3);
      }
      mode = 'rebuilding';
    }

    function hide() {
      for (const pc of pieces) pc.mesh.visible = false;
      mode = 'idle';
    }

    return {
      explode,
      rebuild,
      hide,
      setBounds(minX, maxX) { bounds.minX = minX; bounds.maxX = maxX; },
      update(dt) {
        if (mode === 'flying') for (const pc of pieces) step(pc, dt);
        else if (mode === 'rebuilding') stepRebuild(dt);
        dust.update(dt);
      },
    };
  };
})();
