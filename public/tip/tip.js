// "The Tip" — live 3D product animation. mountTip(el, 'mulch')
import * as THREE from '/vendor/three.module.min.js';

const T_END = 9.6;
const c01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => c01((t - a) / (b - a));
const ease = (x) => x * x * (3 - 2 * x);
const outBack = (x) => { const c = 1.70158; const y = x - 1; return 1 + (c + 1) * y * y * y + c * y * y; };
const lerp = (a, b, k) => a + (b - a) * k;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const KINDS = {
  mulch: {
    chips: ['#6b3a1e', '#7d4524', '#8f5229', '#5a2f18', '#a0612f', '#74401f', '#4c2713'],
    under: '#4a2815',
    steps: ['Tipped on your driveway', 'Spread 75 mm deep', 'Garden locked in'],
    calls: [
      { k: 'depth', t: 7.0, text: '75 mm deep', dx: 70, dy: -46 },
      { k: 'weed', t: 7.45, text: 'Weeds starved of light', dx: -70, dy: -90 },
      { k: 'water', t: 7.9, text: 'Moisture stays in the soil', dx: -90, dy: 70 },
      { k: 'plant', t: 8.35, text: 'Roots stay cool. Plants thrive', dx: 60, dy: -70 },
    ],
  },
};

function speckle(w, h, base, specks, n, r) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, w, h);
  const rnd = rng(7 + n);
  for (let i = 0; i < n; i++) {
    g.fillStyle = specks[(rnd() * specks.length) | 0];
    g.globalAlpha = 0.35 + rnd() * 0.5;
    const s = r * (0.4 + rnd());
    g.beginPath(); g.ellipse(rnd() * w, rnd() * h, s, s * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  return c;
}
function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t;
}
function faceTexture() {
  // cut-away soil profile: topsoil over clay
  const w = 1024, h = 256, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(speckle(w, h, '#b98a5a', ['#a87848', '#c99b6c', '#9a6c40', '#d6b48a'], 900, 5), 0, 0);
  const top = speckle(w, 150, '#3d2616', ['#2c1a0e', '#55361f', '#1f120a', '#6a452a'], 1600, 3);
  g.drawImage(top, 0, 0);
  const rnd = rng(31);
  g.fillStyle = '#b98a5a';
  g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w; x += 16) g.lineTo(x, 138 + Math.sin(x * 0.02) * 6 + rnd() * 8);
  g.lineTo(w, h); g.fill();
  g.drawImage(speckle(w, 110, 'rgba(0,0,0,0)', ['#8d8377', '#a59a8c', '#77695a'], 60, 7), 0, 150);
  return c;
}
function label(text, fg, bg, w = 512, h = 160) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = '900 120px "Barlow Condensed", Arial Narrow, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 6);
  return c;
}

export function mountTip(el, kind = 'mulch') {
  const K = KINDS[kind] || KINDS.mulch;
  el.classList.add('tip');
  el.innerHTML = '<canvas class="tip-c"></canvas><svg class="tip-svg"></svg><div class="tip-labels"></div>' +
    '<div class="tip-step"><b></b><span></span></div><button class="tip-replay" type="button" aria-label="Replay animation">&#8635; Replay</button>' +
    '<div class="tip-hint">Drag to look around</div>';
  const canvas = el.querySelector('.tip-c'), svg = el.querySelector('.tip-svg'), labels = el.querySelector('.tip-labels');
  const stepB = el.querySelector('.tip-step b'), stepS = el.querySelector('.tip-step span');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(26, 16 / 9, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xfff4e2, 0x8a6f58, 0.95));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
  sun.position.set(5, 9, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 30 });
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5); fill.position.set(-6, 4, 5); scene.add(fill);

  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const box = (w, h, d, mat, x, y, z, parent = scene) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };

  // ── ground block (cut-away) ──
  const X0 = -5.7, X1 = 4.4, D = 2.6, H = 1.15, BX0 = -0.3, BX1 = 4.3, ZF = D / 2;
  const W = X1 - X0, CXm = (X0 + X1) / 2;
  const faceT = tex(faceTexture(), 1, 1);
  const sideT = tex(faceTexture(), 0.26, 1);
  const soilTop = M('#3a2415', { map: tex(speckle(256, 256, '#3a2415', ['#2a180c', '#4f321d', '#1d1109'], 500, 3), 4, 1.5), roughness: 1 });
  const faceM = M('#ffffff', { map: faceT, roughness: 1 }), sideM = M('#ffffff', { map: sideT, roughness: 1 });
  box(W, H, D, [sideM, sideM, soilTop, M('#6b4a2c'), faceM, faceM], CXm, -H / 2, 0);
  // driveway slab
  const conc = M('#c9c6bf', { map: tex(speckle(256, 256, '#c9c6bf', ['#b5b2ab', '#d8d5cf', '#a9a69f'], 700, 2), 3, 1.5), roughness: 0.95 });
  box(BX0 - 0.04 - X0, 0.14, D + 0.004, conc, (X0 + BX0 - 0.04) / 2, -0.068, 0);
  // crushed rock base under slab (thin band)
  box(BX0 - 0.04 - X0, 0.1, D + 0.002, M('#8c857b', { map: tex(speckle(256, 64, '#8c857b', ['#6f695f', '#a59e93', '#5c564e'], 500, 3), 6, 1), roughness: 1 }), (X0 + BX0 - 0.04) / 2, -0.19, 0);
  // timber edging round the bed
  const timber = M('#a8774a');
  const EH = 0.16;
  box(0.08, EH + 0.1, D, timber, BX0, EH / 2 - 0.05, 0);
  box(0.08, EH + 0.1, D, timber, BX1, EH / 2 - 0.05, 0);
  box(BX1 - BX0, EH + 0.1, 0.07, timber, (BX0 + BX1) / 2, EH / 2 - 0.05, -ZF + 0.035);
  const frontEdge = box(BX1 - BX0, EH + 0.1, 0.05, M('#a8774a', { transparent: true, opacity: 0.28 }), (BX0 + BX1) / 2, EH / 2 - 0.05, ZF - 0.025);
  frontEdge.castShadow = false;
  // paling fence along the back
  const pal = M('#d9c3a1'), pal2 = M('#cdb692');
  for (let i = 0, x = X0 + 0.14; x < X1; x += 0.27, i++) box(0.23, 1.25 + (i % 3) * 0.015, 0.04, i % 2 ? pal : pal2, x, 0.62, -ZF + 0.02);
  box(W, 0.07, 0.05, M('#b79c78'), CXm, 0.95, -ZF + 0.06); box(W, 0.07, 0.05, M('#b79c78'), CXm, 0.3, -ZF + 0.06);
  // soft contact shadow under the floating block
  {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(60,30,10,.34)'); gr.addColorStop(1, 'rgba(60,30,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.5, D * 2.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    p.rotation.x = -Math.PI / 2; p.position.set(CXm, -H - 0.35, 0); scene.add(p);
  }

  // ── truck (faces -x, reverses toward +x) ──
  const truck = new THREE.Group(); scene.add(truck);
  const red = M('#d81f26', { roughness: 0.45, metalness: 0.1 }), white = M('#f6f4f0', { roughness: 0.5 }), black = M('#1b1b1d', { roughness: 0.7 });
  const glass = M('#22303a', { roughness: 0.15, metalness: 0.4 });
  box(3.3, 0.16, 0.8, black, -1.65, 0.48, 0, truck);
  box(1.05, 1.0, 1.36, red, -2.72, 1.02, 0, truck);          // cab
  box(0.3, 0.42, 1.36, red, -3.36, 0.73, 0, truck);          // bonnet
  box(0.06, 0.44, 1.2, glass, -3.235, 1.22, 0, truck);       // windscreen
  box(0.5, 0.4, 1.38, glass, -2.82, 1.24, 0, truck);         // side windows
  box(0.1, 0.16, 1.42, black, -3.5, 0.5, 0, truck);          // bumper
  box(0.03, 0.1, 0.24, M('#fff3c4', { emissive: '#ffe9a0', emissiveIntensity: 0.6 }), -3.52, 0.72, 0.46, truck);
  box(0.03, 0.1, 0.24, M('#fff3c4', { emissive: '#ffe9a0', emissiveIntensity: 0.6 }), -3.52, 0.72, -0.46, truck);
  const wheels = [];
  const wg = new THREE.CylinderGeometry(0.31, 0.31, 0.24, 24); wg.rotateX(Math.PI / 2);
  const hg = new THREE.CylinderGeometry(0.14, 0.14, 0.26, 6); hg.rotateX(Math.PI / 2);
  for (const wx of [-0.5, -1.2, -2.85]) for (const wz of [-0.6, 0.6]) {
    const w = new THREE.Group(); w.position.set(wx, 0.31, wz);
    const tyre = new THREE.Mesh(wg, black); tyre.castShadow = true; w.add(tyre);
    w.add(new THREE.Mesh(hg, M('#d9d9d9', { metalness: 0.5, roughness: 0.4 })));
    truck.add(w); wheels.push(w);
  }
  const tray = new THREE.Group(); tray.position.set(-0.12, 0.58, 0); truck.add(tray);
  const TL = 2.02, TW = 1.4, TH = 0.56;
  box(TL, 0.07, TW, white, -TL / 2 + 0.12, 0.035, 0, tray);
  const advT = tex(label('ADV SUPPLIES', '#d81f26', '#f6f4f0', 1024, 280));
  const sideMat = M('#ffffff', { map: advT, roughness: 0.5 });
  const s1 = box(TL, TH, 0.06, [white, white, white, white, sideMat, white], -TL / 2 + 0.12, TH / 2 + 0.07, TW / 2 - 0.03, tray);
  box(TL, TH, 0.06, [white, white, white, white, white, sideMat], -TL / 2 + 0.12, TH / 2 + 0.07, -TW / 2 + 0.03, tray);
  box(0.06, TH + 0.16, TW, white, -TL + 0.15, TH / 2 + 0.15, 0, tray);   // headboard
  box(TL, 0.07, 0.07, red, -TL / 2 + 0.12, TH + 0.1, TW / 2 - 0.03, tray);
  box(TL, 0.07, 0.07, red, -TL / 2 + 0.12, TH + 0.1, -TW / 2 + 0.03, tray);
  const gate = new THREE.Group(); gate.position.set(0.12, TH + 0.07, 0); tray.add(gate);
  box(0.05, TH, TW - 0.12, red, 0, -TH / 2, 0, gate);
  const load = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), M(K.under, { roughness: 1 }));
  load.castShadow = true; tray.add(load);
  void s1;

  // ── the load: individual pieces ──
  const N = 3200, rnd = rng(42);
  const chipG = new THREE.BoxGeometry(0.13, 0.035, 0.065);
  const chips = new THREE.InstancedMesh(chipG, M('#ffffff', { roughness: 0.95 }), N);
  chips.castShadow = chips.receiveShadow = true; chips.frustumCulled = false; scene.add(chips);
  const PX = -1.22, PR = 0.82, PH = 0.7, LAY = 0.125;
  const P = [];
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const r = PR * Math.sqrt(rnd()), a = rnd() * 6.283;
    const py = rnd() * PH * (1 - r / PR) + 0.02;
    const fx = lerp(BX0 + 0.1, BX1 - 0.1, rnd()), fz = lerp(-ZF + 0.12, ZF - 0.1, rnd());
    const frac = (fx - BX0) / (BX1 - BX0);
    P.push({
      px: PX + r * Math.cos(a), py, pz: r * Math.sin(a) * 0.95,
      fx, fy: 0.02 + rnd() * (LAY - 0.03), fz,
      s: 2.05 + 2.15 * (0.72 * (py / PH) + 0.28 * rnd()),
      m: 4.95 + 1.05 * frac + 0.18 * rnd(),
      lz: (rnd() - 0.5) * 1.0, hop: 0.25 + rnd() * 0.5,
      r0: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], r1: [(rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5],
      sc: 0.7 + rnd() * 0.7,
    });
    col.set(K.chips[(rnd() * K.chips.length) | 0]).offsetHSL(0, 0, (rnd() - 0.5) * 0.06);
    chips.setColorAt(i, col);
  }
  const pile = new THREE.Mesh(new THREE.ConeGeometry(PR * 0.92, PH * 0.9, 24), M(K.under, { roughness: 1 }));
  pile.position.set(PX, 0, 0); scene.add(pile);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(BX1 - BX0 - 0.08, LAY - 0.035, D - 0.1), M(K.under, { roughness: 1 }));
  slab.geometry.translate((BX1 - BX0 - 0.08) / 2, (LAY - 0.035) / 2, 0); slab.position.set(BX0 + 0.04, 0, 0); slab.receiveShadow = true; scene.add(slab);

  // ── weeds, plants, roots, moisture ──
  const weeds = [];
  const wGeo = new THREE.ConeGeometry(0.035, 0.34, 5); wGeo.translate(0, 0.17, 0);
  for (const [x, z] of [[0.5, 0.75], [1.3, -0.3], [2.0, 0.85], [2.9, -0.8], [3.3, 0.5], [3.9, -0.1], [0.9, -0.95]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); const mat = M('#7fb23a');
    for (let j = 0; j < 4; j++) { const b = new THREE.Mesh(wGeo, mat); b.rotation.set((rnd() - 0.5) * 0.9, rnd() * 6, (rnd() - 0.5) * 0.9); b.castShadow = true; g.add(b); }
    scene.add(g); weeds.push({ g, mat });
  }
  const plants = [];
  const leafG = new THREE.IcosahedronGeometry(1, 0);
  const greens = ['#2f7d32', '#3f9a3c', '#57b04a', '#2a6b2c'];
  for (const [x, z, s] of [[1.75, ZF - 0.34, 1], [0.75, -0.55, 0.8], [2.95, -0.25, 0.92], [3.8, 0.55, 0.72]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.5, 6), M('#5b3b22')); stem.position.y = 0.25; stem.castShadow = true; g.add(stem);
    for (let j = 0; j < 7; j++) {
      const l = new THREE.Mesh(leafG, M(greens[j % 4], { flatShading: true, roughness: 0.7 }));
      const a = j * 0.9; const rr = j ? 0.2 : 0; l.position.set(Math.cos(a) * rr, 0.55 + (j % 3) * 0.13, Math.sin(a) * rr);
      l.scale.setScalar(0.2 + rnd() * 0.08); l.rotation.set(rnd() * 3, rnd() * 3, 0); l.castShadow = true; g.add(l);
    }
    scene.add(g); plants.push({ g, s });
  }
  const roots = [];
  for (const pts of [[[0, 0], [-0.05, -0.2], [-0.02, -0.45], [-0.1, -0.72]], [[0, -0.05], [-0.2, -0.16], [-0.42, -0.2], [-0.62, -0.34]], [[0, -0.05], [0.2, -0.18], [0.4, -0.2], [0.6, -0.38]], [[-0.03, -0.3], [-0.22, -0.42], [-0.34, -0.6]], [[-0.02, -0.4], [0.16, -0.52], [0.3, -0.74]]]) {
    const cv = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(1.75 + x, y, ZF + 0.012)));
    const m = new THREE.Mesh(new THREE.TubeGeometry(cv, 24, 0.016, 5), new THREE.MeshBasicMaterial({ color: '#f1dfc2' }));
    m.userData.n = m.geometry.index.count; scene.add(m); roots.push(m);
  }
  const drops = [];
  const dG = new THREE.CircleGeometry(0.045, 14);
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(dG, new THREE.MeshBasicMaterial({ color: '#39a7ee', transparent: true, opacity: 0 }));
    m.position.set(lerp(BX0 + 0.2, BX1 - 0.15, rnd()), -0.07 - rnd() * 0.5, ZF + 0.008); m.userData = { t: 6.9 + rnd() * 1.3, s: 0.6 + rnd() * 0.8 };
    scene.add(m); drops.push(m);
  }

  // ── callouts ──
  const anchors = {
    depth: new THREE.Vector3(BX1 - 0.5, LAY / 2, ZF), weed: new THREE.Vector3(0.5, 0.08, 0.75),
    water: new THREE.Vector3(1.0, -0.3, ZF), plant: new THREE.Vector3(2.95, 0.85, -0.25),
  };
  const calls = K.calls.map((c) => {
    const d = document.createElement('div'); d.className = 'tip-call'; d.textContent = c.text; labels.appendChild(d);
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.appendChild(ln);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); dot.setAttribute('r', 4); svg.appendChild(dot);
    return { ...c, d, ln, dot };
  });

  // ── timeline ──
  const o = new THREE.Object3D(), v = new THREE.Vector3(), tgt = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const green = new THREE.Color('#7fb23a'), dead = new THREE.Color('#b59a58');
  let drag = { az: 0, el: 0 }, size = { w: 1, h: 1 }, curT = 0;

  function frame(t) {
    curT = t;
    // truck
    const park = -2.02;
    let tx = lerp(-10.5, park, 1 - Math.pow(1 - seg(t, 0, 1.75), 3));
    const leave = seg(t, 4.75, 6.3); tx = lerp(tx, -11.5, leave * leave);
    truck.position.x = tx; for (const w of wheels) w.rotation.z = -tx / 0.31;
    const tilt = ease(seg(t, 1.55, 2.6)) * (1 - ease(seg(t, 4.3, 4.95)));
    tray.rotation.z = -tilt * 0.86; gate.rotation.z = tilt * 1.25;
    truck.position.y = Math.sin(seg(t, 1.7, 1.95) * Math.PI) * 0.025;
    const pour = seg(t, 2.05, 4.2), spread = seg(t, 4.95, 6.2);
    const ls = 1 - pour; load.visible = ls > 0.01;
    load.scale.set(0.95 * (0.35 + 0.65 * ls), 0.42 * ls, 0.6); load.position.set(lerp(-0.45, -TL / 2 + 0.1, ls), 0.2, 0);
    // lip of the tray in world space
    tray.updateWorldMatrix(true, false); v.set(0.2, 0.12, 0).applyMatrix4(tray.matrixWorld); const lx = v.x, ly = v.y;
    const FL = 0.52, G = 0.7;
    for (let i = 0; i < N; i++) {
      const p = P[i];
      if (t < p.s) { chips.setMatrixAt(i, zero); continue; }
      let x, y, z, k = 0, rx = p.r0[0], ry = p.r0[1], rz = p.r0[2];
      if (t < p.s + FL) {
        const u = (t - p.s) / FL; x = lerp(lx, p.px, u); z = lerp(p.lz * 0.9, p.pz, u);
        y = lerp(ly, p.py, u * u) + Math.sin(u * Math.PI) * 0.1; rx += u * 7; rz += u * 5;
      } else if (t < p.m) { x = p.px; y = p.py; z = p.pz; }
      else if (t < p.m + G) {
        k = ease((t - p.m) / G); x = lerp(p.px, p.fx, k); z = lerp(p.pz, p.fz, k);
        y = lerp(p.py, p.fy, k) + Math.sin(k * Math.PI) * p.hop; rx += k * 6;
      } else { k = 1; x = p.fx; y = p.fy; z = p.fz; }
      if (k >= 1) o.rotation.set(p.r1[0], p.r1[1], p.r1[2]); else o.rotation.set(rx, ry, rz);
      o.position.set(x, y, z); o.scale.setScalar(p.sc); o.updateMatrix(); chips.setMatrixAt(i, o.matrix);
    }
    chips.instanceMatrix.needsUpdate = true;
    const ps = ease(pour) * (1 - ease(seg(t, 5.0, 6.3)));
    pile.visible = ps > 0.02; pile.scale.set(0.5 + 0.5 * ps, ps, 0.5 + 0.5 * ps); pile.position.y = PH * 0.45 * ps;
    slab.visible = spread > 0.01; slab.scale.x = Math.max(0.001, ease(seg(t, 5.3, 6.75)));
    // payoff
    weeds.forEach((w, i) => {
      const k = ease(seg(t, 6.3 + i * 0.08, 7.3 + i * 0.08));
      w.g.scale.set(1 + k * 0.3, 1 - 0.72 * k, 1 + k * 0.3); w.mat.color.copy(green).lerp(dead, k);
    });
    plants.forEach((p, i) => { const k = seg(t, 6.7 + i * 0.22, 8.0 + i * 0.22); p.g.scale.setScalar(p.s * lerp(0.5, 1.12, outBack(k) * 0.9 + k * 0.1)); });
    roots.forEach((r, i) => r.geometry.setDrawRange(0, Math.floor(r.userData.n * lerp(0, 1, ease(seg(t, 6.9 + i * 0.12, 8.4))) / 3) * 3));
    for (const d of drops) { const k = seg(t, d.userData.t, d.userData.t + 0.45); d.material.opacity = k * 0.95; d.scale.setScalar(d.userData.s * outBack(k)); }
    // camera: ground-level profile → three-quarter
    const ck = ease(seg(t, 4.5, 7.1));
    const fit = Math.max(1, 1.72 / (size.w / size.h));
    const az = lerp(0, 0.6, ck) + drag.az, elv = Math.min(1.2, Math.max(0.02, lerp(0.075, 0.5, ck) + drag.el));
    const dist = lerp(15.6, 13.2, ck) * fit;
    tgt.set(lerp(-0.65, 1.6, ck), lerp(0.42, -0.05, ck), 0);
    cam.position.set(tgt.x + dist * Math.sin(az) * Math.cos(elv), tgt.y + dist * Math.sin(elv), tgt.z + dist * Math.cos(az) * Math.cos(elv));
    cam.lookAt(tgt); cam.updateMatrixWorld();
    renderer.render(scene, cam);
    // overlay
    const si = t < 4.8 ? 0 : t < 6.6 ? 1 : 2;
    if (stepB.textContent !== String(si + 1)) { stepB.textContent = si + 1; stepS.textContent = K.steps[si]; }
    const sc = Math.min(1, size.w / 900);
    for (const c of calls) {
      const k = ease(seg(t, c.t, c.t + 0.45));
      v.copy(anchors[c.k]).project(cam);
      const ax = (v.x * 0.5 + 0.5) * size.w, ay = (-v.y * 0.5 + 0.5) * size.h;
      const lw = c.d.offsetWidth, lh = c.d.offsetHeight;
      let bx = ax + c.dx * (0.55 + 0.45 * sc), by = ay + c.dy * (0.6 + 0.4 * sc);
      const left = Math.min(size.w - lw - 6, Math.max(6, c.dx < 0 ? bx - lw : bx));
      const top = Math.min(size.h - lh - 6, Math.max(6, by - lh / 2));
      c.d.style.transform = `translate(${left}px,${top}px)`; c.d.style.opacity = k;
      const ex = c.dx < 0 ? left + lw : left, ey = top + lh / 2;
      c.ln.setAttribute('d', `M${ax},${ay} L${lerp(ax, ex, k)},${lerp(ay, ey, k)}`); c.ln.style.opacity = k ? 1 : 0;
      c.dot.setAttribute('cx', ax); c.dot.setAttribute('cy', ay); c.dot.style.opacity = k;
    }
    el.classList.toggle('tip-done', t >= T_END - 0.05);
  }

  function resize() {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    size = { w, h }; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`); frame(curT);
  }
  new ResizeObserver(resize).observe(el); resize();

  // playback
  let t0 = 0, playing = false, raf = 0;
  const tick = (now) => { const t = Math.min(T_END, (now - t0) / 1000); frame(t); if (t < T_END) raf = requestAnimationFrame(tick); else playing = false; };
  const play = () => { cancelAnimationFrame(raf); drag = { az: 0, el: 0 }; playing = true; t0 = performance.now(); raf = requestAnimationFrame(tick); };
  el.querySelector('.tip-replay').addEventListener('click', play);
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) frame(T_END);
  else {
    frame(0); let seen = false;
    new IntersectionObserver((es) => { if (!seen && es.some((e) => e.isIntersecting)) { seen = true; play(); } }, { threshold: 0.4 }).observe(el);
  }
  // drag to look around
  let dn = null;
  canvas.addEventListener('pointerdown', (e) => { dn = { x: e.clientX, y: e.clientY, az: drag.az, el: drag.el }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dn) return; if (Math.abs(e.clientX - dn.x) < 4 && Math.abs(e.clientY - dn.y) < 4) return;
    drag.az = Math.max(-1.3, Math.min(1.3, dn.az - (e.clientX - dn.x) * 0.006)); drag.el = Math.max(-0.45, Math.min(0.6, dn.el + (e.clientY - dn.y) * 0.004));
    if (!playing) frame(curT);
  });
  const up = () => { dn = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  return { seek: frame, play, duration: T_END };
}
