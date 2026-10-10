// Rooftop Nerf Battle - an original foam-dart dodging game.
// All art is drawn procedurally / from pixel arrays below; all sound is synthesized with WebAudio.
(function () {
  'use strict';

  // ---------- tuning (defaults) ----------
  const W = 640, H = 360;                 // logical playfield (16:9), scaled to fit the safe area
  const RUN = 270;                        // seconds from 06:00 sunrise to midnight (4.5 min)
  const ROOF_Y = 290, ROOF_L = 150, ROOF_R = 490;
  const GRAV = 1500, JUMP_V = 540, DJUMP_V = 470;   // jump apex ~97px (2.7x player height), air time ~0.72s
  const BASE_SPEED = 175, SPEED_STEP = 0.2, SPEED_MAX = 2;
  const DASH_V = 560, DASH_T = 0.14, DASH_CD = 0.35; // flick dash-step ~78px
  const SHIELD_DUR = 3, SHIELD_CD = 20, SHIELD_R = 28;
  const TP_COST = 100, TP_CD = 90;
  const UPG_EVERY = 500;
  const HB_W = 12, HB_H = 28;             // player hitbox (sprite is 24x36) -> lenient
  const PHASE_NAMES = ['SUNRISE', 'MIDDAY', 'TWILIGHT', 'NIGHT'];
  const PHASE_CLOCK = [6, 10, 17, 20.5, 24]; // clock hours at the phase boundaries
  const ENEMIES_PER_PHASE = [3, 4, 5, 5];

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const rnd = (a, b) => a + Math.random() * (b - a);

  const Q = new URLSearchParams(location.search);
  const qn = (k, d) => (Q.has(k) && Q.get(k) !== '' && isFinite(+Q.get(k))) ? +Q.get(k) : d;
  // test-only flags: ?auto=1 ?score=480 ?phase=0..3 ?t=sec ?god=1 ?unlock=tp,shield,dj,speed ?super=sec ?calm=1
  const DBG = {
    auto: Q.get('auto') === '1', score: qn('score', 0), phase: qn('phase', -1), t: qn('t', -1),
    god: Q.get('god') === '1', unlock: (Q.get('unlock') || '').split(',').filter(Boolean),
    superIn: qn('super', -1), calm: Q.get('calm') === '1'
  };

  // ---------- colour helpers ----------
  const hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgb = (c, a) => a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  // ---------- lighting keyframes (4 phases) ----------
  const LOOKS = {
    sunrise: { top: [104, 144, 226], bot: [255, 190, 112], far: [226, 166, 140], mid: [190, 130, 122], near: [92, 68, 96], roof: [132, 104, 118],
      tint: [255, 150, 60], tintA: 0.12, lit: 0.12, stars: 0, sunA: 1, sunX: 120, sunY: 108, sun: [255, 206, 120], cloud: [255, 228, 204] },
    midday: { top: [36, 136, 255], bot: [176, 224, 255], far: [158, 182, 210], mid: [118, 138, 170], near: [84, 96, 124], roof: [146, 152, 166],
      tint: [255, 255, 255], tintA: 0, lit: 0, stars: 0, sunA: 1, sunX: 330, sunY: 48, sun: [255, 250, 222], cloud: [255, 255, 255] },
    twilight: { top: [38, 26, 92], bot: [214, 98, 142], far: [96, 62, 116], mid: [68, 46, 94], near: [46, 34, 68], roof: [74, 60, 94],
      tint: [70, 30, 120], tintA: 0.30, lit: 0.55, stars: 0.35, sunA: 0.85, sunX: 585, sunY: 262, sun: [255, 118, 80], cloud: [200, 120, 170] },
    night: { top: [4, 6, 20], bot: [24, 24, 56], far: [28, 30, 56], mid: [19, 21, 42], near: [13, 14, 30], roof: [34, 34, 54],
      tint: [6, 6, 30], tintA: 0.50, lit: 0.92, stars: 1, sunA: 0, sunX: 600, sunY: 300, sun: [255, 100, 60], cloud: [60, 60, 90] }
  };
  const STOPS = [[0, 'sunrise'], [0.18, 'sunrise'], [0.30, 'midday'], [0.45, 'midday'], [0.55, 'twilight'], [0.68, 'twilight'], [0.80, 'night'], [1.01, 'night']];
  const L = {};
  const SH = new Map();
  function computeLook(p) {
    let i = 0;
    while (i < STOPS.length - 2 && p > STOPS[i + 1][0]) i++;
    const [p0, a] = STOPS[i], [p1, b] = STOPS[i + 1];
    const t = smooth(clamp((p - p0) / (p1 - p0), 0, 1));
    const A = LOOKS[a], B = LOOKS[b];
    for (const k in A) L[k] = Array.isArray(A[k]) ? mixc(A[k], B[k], t) : lerp(A[k], B[k], t);
    L.moonA = clamp((p - 0.62) / 0.15, 0, 1);
    SH.clear();
  }
  function sh(h) { // a base colour, shaded by the current ambient light
    let v = SH.get(h);
    if (!v) { v = rgb(mixc(hx(h), L.tint, L.tintA)); SH.set(h, v); }
    return v;
  }

  // ---------- pixel art ----------
  function spr(rows, pal) {
    const w = Math.max(...rows.map(r => r.length)), c = document.createElement('canvas');
    c.width = w; c.height = rows.length;
    const x = c.getContext('2d');
    rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) { const p = pal[r[i]]; if (p) { x.fillStyle = p; x.fillRect(i, y, 1, 1); } } });
    return c;
  }
  const PPAL = { K: '#1b1626', S: '#f1c19b', s: '#d39a74', H: '#4a2c1c', C: '#ffcf3a', c: '#d99a00', J: '#27c4b0', j: '#16877a', P: '#3b4a8f', B: '#f4f4f4' };
  const UP = [
    '....KKKK....',
    '...KCCCCK...',
    '..KCCCCCCKKK',
    '..KCCCCCCccK',
    '..KHHSSSSKK.',
    '..KHSSSKSK..',
    '..KSSSSSSK..',
    '...KKSSKK...'];
  const ARMS = [
    '..KJJJJJJK..',
    '.KJJjJJjJJK.',
    '.KJKJJJJKJK.',
    '.KSKjjjjKSK.'];
  const PL = {
    stand: spr([...UP, ...ARMS,
      '..KKPPPPKK..', '...KPPPPK...', '...KPKKPK...', '...KPK.KPK..', '..KBBK.KBBK.', '..KKKK.KKKK.'], PPAL),
    run1: spr([...UP, ...ARMS,
      '..KKPPPPKK..', '..KPPPPPPK..', '.KPPK..KPPK.', '.KPK....KPK.', 'KBBK....KBBK', 'KKKK....KKKK'], PPAL),
    run2: spr([...UP, ...ARMS,
      '..KKPPPPKK..', '...KPPPPK...', '...KPPPK....', '...KPKPK....', '...KBBKBBK..', '...KKKKKKK..'], PPAL),
    jump: spr([...UP,
      'KSKJJJJJJKSK', 'KJKJJjJJJKJK', '.KJJJJJJJJK.', '..KjjjjjjK..',
      '..KPPPPPPK..', '..KPPKKPPK..', '.KPPK..KPPK.', '.KBBK..KBBK.', '.KKKK..KKKK.', '............'], PPAL),
    hit: spr([
      '............', '..KKKKKK....', '.KCCCCCCK...', 'KCCCCCCCCKK.', '.KHSSSSSKK..', '.KSKSSKSK...', '.KSSSSSSK...', '..KSKKSK....',
      'KSKJJJJJJKSK', 'KJKJJJJJJKJK', '.KJJJJJJJJK.', '..KjjjjjjK..', '..KPPPPPPK..', '.KPPK..KPPK.', 'KPPK....KPPK', 'KBBK....KBBK', 'KKKK....KKKK', '............'], PPAL)
  };
  const BPAL = { K: '#16121f', M: '#9aa3b8', m: '#5d6580', V: '#7ff6ff', R: '#ff4060', O: '#ff9a2e' };
  const BOT = spr([
    '......K.......', '......R.......', '......K.......', '...KKKKKKKK...', '..KMMMMMMMMK..', '..KMKKKKKKMK..',
    '..KMKVVVVKMK..', '..KMKKKKKKMK..', '..KMMMMMMMMK..', '...KKKKKKKK...', '..KmOOOOOOmK..', '.KmmmmmmmmmmK.',
    '.KmmOmmmmOmmK.', '..KmmmmmmmmK..', '..KmK....KmK..', '..KKK....KKK..'], BPAL);
  const BOT_HEAD = spr(['...KKKKKKKK...', '..KMMMMMMMMK..', '..KMKKKKKKMK..', '..KMKVVVVKMK..', '..KMKKKKKKMK..', '..KMMMMMMMMK..', '...KKKKKKKK...'], BPAL);

  // ---------- skyline (seeded, generated once) ----------
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const SKY = { far: [], mid: [], winFar: [], winMid: [], stars: [], clouds: [] };
  (function genSkyline() {
    const r = mulberry32(90210);
    const make = (list, wins, topMin, topMax, wMin, wMax, ww, wh, gx, gy) => {
      let x = -8;
      while (x < W + 8) {
        const w = Math.round(wMin + r() * (wMax - wMin)), top = Math.round(topMin + r() * (topMax - topMin));
        const b = { x, w, top, ant: r() < 0.25, step: r() < 0.3 ? Math.round(w * 0.3) : 0 };
        list.push(b);
        for (let wy = top + 6; wy < H - 4; wy += gy)
          for (let wx = x + 3; wx + ww < x + w - 2; wx += gx)
            if (r() < 0.8) wins.push({ x: wx, y: wy, w: ww, h: wh, r: r(), c: r() < 0.7 ? 0 : r() < 0.6 ? 1 : 2 });
        x += w + (r() < 0.3 ? Math.round(r() * 8) : 0);
      }
    };
    make(SKY.far, SKY.winFar, 120, 220, 20, 46, 2, 3, 6, 7);
    make(SKY.mid, SKY.winMid, 170, 255, 30, 62, 3, 4, 8, 9);
    for (let i = 0; i < 90; i++) SKY.stars.push({ x: r() * W, y: r() * 200, s: r() < 0.15 ? 2 : 1, tw: 1 + r() * 3, ph: r() * 6 });
    for (let i = 0; i < 5; i++) SKY.clouds.push({ x: r() * W, y: 30 + r() * 110, w: 50 + r() * 70, v: 3 + r() * 6 });
  })();
  // near buildings: the player's roof plus neighbours at different heights
  const NEAR = [
    { x: 0, w: 82, top: 120, col: '#5b4a6e', trim: '#7d6a92' },      // left tall
    { x: 86, w: 52, top: 236, col: '#6e4a4a', trim: '#93685f' },     // left short
    { x: ROOF_L - 8, w: ROOF_R - ROOF_L + 16, top: ROOF_Y, col: '#4f5a74', trim: '#76839f', player: true },
    { x: 502, w: 52, top: 226, col: '#4e6a5a', trim: '#6f927e' },    // right short
    { x: 558, w: 82, top: 104, col: '#6a5a44', trim: '#8f7c5e' }     // right tall
  ];
  const NEAR_WIN = [];
  (function () {
    const r = mulberry32(4242);
    for (const b of NEAR) {
      const gx = b.player ? 22 : 14, gy = b.player ? 20 : 18;
      for (let wy = b.top + 14; wy < H; wy += gy)
        for (let wx = b.x + 7; wx + 8 < b.x + b.w - 4; wx += gx)
          NEAR_WIN.push({ x: wx, y: wy, w: b.player ? 12 : 7, h: b.player ? 10 : 9, r: r(), c: r() < 0.7 ? 0 : r() < 0.6 ? 1 : 2 });
    }
  })();
  const WINCOL = ['#ffd77a', '#fff1b8', '#9fe8ff'];

  // ---------- canvas / scaling ----------
  const cvs = document.getElementById('screen');
  const ctx = cvs.getContext('2d');
  const fitEl = document.getElementById('fit');
  let KX = 1, KY = 1;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const aw = fitEl.clientWidth || window.innerWidth, ah = fitEl.clientHeight || window.innerHeight;
    const s = Math.max(0.05, Math.min(aw / W, ah / H));
    const cw = Math.floor(W * s), ch = Math.floor(H * s);
    cvs.style.width = cw + 'px'; cvs.style.height = ch + 'px';
    cvs.width = Math.max(1, Math.round(cw * dpr)); cvs.height = Math.max(1, Math.round(ch * dpr));
    KX = cvs.width / W; KY = cvs.height / H;
    checkOrient();
  }
  const FINE = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  if (FINE) document.body.classList.add('desk');

  // ---------- audio (WebAudio synth) ----------
  let AC = null, master = null, noiseBuf = null;
  function initAudio() {
    try {
      if (!AC) {
        const A = window.AudioContext || window.webkitAudioContext;
        if (!A) return;
        AC = new A();
        master = AC.createGain(); master.gain.value = 0.25; master.connect(AC.destination);
        noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (AC.state !== 'running') AC.resume();
      // iOS: play a 1-sample silent buffer inside the gesture to fully unlock output
      const b = AC.createBuffer(1, 1, 22050), s = AC.createBufferSource();
      s.buffer = b; s.connect(AC.destination); s.start(0);
    } catch (e) { /* audio unavailable */ }
  }
  // iOS 17+: treat as media playback so the Silent switch doesn't mute the game
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
  // iOS only grants audio on touchend/pointerup/click/keydown, not touchstart/pointerdown
  ['touchend', 'pointerup', 'click', 'keydown'].forEach(t => document.addEventListener(t, () => {
    if (!AC || AC.state !== 'running') initAudio();
  }, { capture: true, passive: true }));
  const live = () => AC && AC.state === 'running';
  function osc(type, f0, f1, d, v, t0, attack) {
    if (!live()) return;
    const t = AC.currentTime + (t0 || 0), o = AC.createOscillator(), gn = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + d);
    if (attack) { gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(v, t + attack); }
    else gn.gain.setValueAtTime(v, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(gn); gn.connect(master); o.start(t); o.stop(t + d + 0.05);
  }
  function hiss(d, v, type, f0, f1, t0, q) {
    if (!live()) return;
    const t = AC.currentTime + (t0 || 0), s = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain();
    s.buffer = noiseBuf; f.type = type; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + d);
    gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(gn); gn.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
  }
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function arp(notes, step, type, v, t0) { notes.forEach((n, i) => osc(type, hz(n), 0, step * 1.6, v, (t0 || 0) + i * step, 0.005)); }
  const SFX = {
    fire() { hiss(0.09, 0.32, 'bandpass', 1600, 500, 0, 2); osc('triangle', 210, 90, 0.07, 0.18); },
    superFire() { hiss(0.35, 0.5, 'lowpass', 1400, 200, 0, 1); osc('sine', 150, 38, 0.38, 0.5); },
    warn() { osc('sawtooth', 170, 1150, 1.0, 0.12, 0, 0.05); osc('square', 85, 575, 1.0, 0.06, 0, 0.05); },
    dodge() { osc('sine', 1700, 2100, 0.04, 0.05); },
    dodgeBig() { arp([84, 88, 91], 0.045, 'triangle', 0.16); },
    jump() { osc('sine', 300, 720, 0.13, 0.22); osc('triangle', 150, 360, 0.13, 0.12); },
    djump() { osc('sine', 520, 1150, 0.14, 0.2); hiss(0.1, 0.12, 'highpass', 3000, 6000); },
    land() { hiss(0.06, 0.18, 'lowpass', 500, 120); },
    dash() { hiss(0.14, 0.25, 'bandpass', 900, 3500, 0, 1.5); },
    shieldOn() { osc('sine', 330, 990, 0.35, 0.22); osc('triangle', 495, 1485, 0.35, 0.1); },
    shieldOff() { osc('sine', 880, 260, 0.25, 0.15); },
    block() { osc('triangle', 1900, 900, 0.07, 0.18); hiss(0.05, 0.15, 'highpass', 4000); },
    teleport() { for (let i = 0; i < 8; i++) osc('sine', 600 + i * 180, 0, 0.09, 0.12, i * 0.025, 0.004); hiss(0.3, 0.12, 'bandpass', 6000, 1500, 0, 4); },
    deny() { osc('square', 160, 120, 0.12, 0.12); osc('square', 160, 120, 0.12, 0.12, 0.14); },
    upgrade() { arp([67, 71, 74, 79, 83], 0.07, 'triangle', 0.22); },
    pick() { arp([79, 83, 86], 0.03, 'square', 0.1); osc('sine', hz(55), 0, 0.5, 0.25); },
    phase() { osc('sine', 988, 0, 1.1, 0.16, 0, 0.01); osc('sine', 1482, 0, 0.9, 0.08, 0.02, 0.01); osc('sine', 659, 0, 1.3, 0.1, 0.12, 0.01); },
    hit() { hiss(0.35, 0.55, 'lowpass', 2500, 200); osc('square', 360, 55, 0.4, 0.2); },
    over() { [64, 62, 58, 55].forEach((n, i) => osc('triangle', hz(n), hz(n) * 0.97, 0.3, 0.25, i * 0.2, 0.01)); osc('sine', hz(31), 0, 1.2, 0.3, 0.6); },
    win() { arp([60, 64, 67, 72, 67, 72, 76, 79, 84], 0.09, 'triangle', 0.22); arp([48, 55, 60], 0.27, 'sine', 0.25); },
    start() { arp([72, 76, 79, 84], 0.05, 'square', 0.1); }
  };

  // ---------- state ----------
  const HI_KEY = 'rooftopFoamBest';
  function loadHi() { try { return parseInt(localStorage.getItem(HI_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
  function saveHi() { try { localStorage.setItem(HI_KEY, String(G.hi)); } catch (e) { /* ignore */ } }
  const G = {
    state: 'title', paused: false, pauseWhy: '', t: 0, phase: 0, score: 0, hi: loadHi(), newBest: false, nextUp: UPG_EVERY,
    up: { dj: 0, speed: 0, shield: 0, tp: 0 }, cards: [], sel: 0, menuT: 0,
    fireT: 2, superT: 15, shieldT: 0, shieldCd: 0, tpCd: 0, endT: 0, deathT: 0, bannerT: 0, banner: '',
    dodged: 0, superDodged: 0, hintT: 0, upPending: false, frame: 0, grace: 0
  };
  const P = { x: 320, y: ROOF_Y, vx: 0, vy: 0, ground: true, air: 0, face: 1, anim: 0, dashT: 0, dashDir: 1, dashCd: 0, inv: 0, tpFx: 0 };
  const B = [];   // bullets
  const FX = [];  // particles
  const FL = [];  // floating texts
  // enemy placement: 3 at sunrise, 4 from midday, 5 from twilight; both sides, different heights
  const SLOTS = [
    { type: 'bot', x: 40, y: 120, face: 1 },      // left tall roof
    { type: 'bot', x: 528, y: 226, face: -1 },    // right short roof
    { type: 'drone', x: 540, y: 74, face: -1 },   // drone hovering upper right
    { type: 'bot', x: 112, y: 236, face: 1 },     // left short roof (from midday)
    { type: 'heli', x: 205, y: 84, face: 1 }      // mini helicopter, upper left (from twilight)
  ];
  const E = SLOTS.map((s, i) => ({ i, ...s, bx: s.x, by: s.y, active: false, inT: 0, ang: s.face > 0 ? 0.4 : Math.PI - 0.4, recoil: 0, warn: 0, cd: 0, bob: Math.random() * 6 }));

  const UPGRADES = {
    dj: { name: 'DOUBLE JUMP', max: 1, desc: ['Jump again', 'in mid-air'] },
    speed: { name: 'SPEED BOOST', max: SPEED_MAX, desc: ['+20% run speed', 'stacks x2'] },
    shield: { name: 'FOAM SHIELD', max: 1, desc: ['3s bubble blocks darts', 'S key / button, 20s cd'] },
    tp: { name: 'TELEPORT', max: 1, desc: ['Blink to safest spot', '-100 pts, 90s cd'] }
  };

  function progress() { return clamp(G.t / RUN, 0, 1); }
  function phaseOf(t) { return Math.min(3, Math.floor(clamp(t / RUN, 0, 0.9999) * 4)); }
  function clockStr(t) {
    const p = clamp(t / RUN, 0, 1), ph = Math.min(3, Math.floor(p * 4)), f = p * 4 - ph;
    const h = p >= 1 ? 24 : lerp(PHASE_CLOCK[ph], PHASE_CLOCK[ph + 1], f);
    const mins = Math.floor(h * 60 / 5) * 5, hh = Math.floor(mins / 60) % 24, mm = mins % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  const bulletSpeed = p => 130 + 350 * Math.pow(p, 1.5);           // 130 px/s at sunrise -> 480 px/s at midnight
  const fireGap = p => lerp(1.7, 0.3, Math.pow(p, 1.2));             // seconds between shots (all enemies combined)
  const superGap = p => lerp(16, 8, p) + rnd(0, 3);                   // seconds between super bullets
  const playerSpeed = () => BASE_SPEED * (1 + SPEED_STEP * G.up.speed);

  function newGame() {
    Object.assign(G, {
      state: 'play', paused: false, t: 0, phase: 0, score: DBG.score, newBest: false, nextUp: (Math.floor(DBG.score / UPG_EVERY) + 1) * UPG_EVERY,
      up: { dj: 0, speed: 0, shield: 0, tp: 0 }, cards: [], fireT: 1.6, superT: DBG.superIn >= 0 ? DBG.superIn : 15,
      shieldT: 0, shieldCd: 0, tpCd: 0, endT: 0, deathT: 0, bannerT: 2.4, dodged: 0, superDodged: 0, hintT: 14, upPending: false, grace: 0
    });
    for (const u of DBG.unlock) if (G.up[u] !== undefined) G.up[u] = Math.min(UPGRADES[u].max, G.up[u] + 1);
    if (DBG.phase >= 0) G.t = clamp(DBG.phase, 0, 3) * RUN / 4 + 3;
    if (DBG.t >= 0) G.t = DBG.t;
    G.phase = phaseOf(G.t); G.banner = PHASE_NAMES[G.phase];
    Object.assign(P, { x: 320, y: ROOF_Y, vx: 0, vy: 0, ground: true, air: 0, face: 1, anim: 0, dashT: 0, dashCd: 0, inv: 0, tpFx: 0 });
    B.length = 0; FX.length = 0; FL.length = 0;
    for (const e of E) { e.active = false; e.inT = 0; e.warn = 0; e.cd = 0; e.recoil = 0; }
    activateEnemies(true);
    computeLook(progress());
    jumpQ = 0; clearMove(); SFX.start();
  }
  function activateEnemies(instant) {
    const n = ENEMIES_PER_PHASE[G.phase];
    E.forEach((e, i) => { if (i < n && !e.active) { e.active = true; e.inT = instant ? 1 : 0; e.cd = 1; } });
  }
  function endGame(won) {
    G.state = won ? 'win' : 'over'; G.endT = 0; G.paused = false;
    if (G.score > G.hi) { G.hi = G.score; G.newBest = true; }
    saveHi();
    if (won) SFX.win(); else SFX.over();
  }
  function addScore(n, x, y, col) {
    G.score = Math.max(0, G.score + n);
    FL.push({ x, y, t: 0, txt: (n > 0 ? '+' : '') + n, col: col || (n > 0 ? '#ffe45c' : '#ff6b6b') });
    if (n > 0 && G.score >= G.nextUp) {
      while (G.score >= G.nextUp) G.nextUp += UPG_EVERY;
      G.upPending = true;
    }
  }
  function available() { return Object.keys(UPGRADES).filter(k => G.up[k] < UPGRADES[k].max); }
  function openUpgrade() {
    const av = available();
    if (!av.length) return;
    for (let i = av.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = av[i]; av[i] = av[j]; av[j] = t; }
    G.cards = av.slice(0, 3); G.sel = 0; G.menuT = 0; G.state = 'upgrade';
    clearMove(); SFX.upgrade();
  }
  function pickUpgrade(i) {
    if (G.state !== 'upgrade' || G.paused || G.menuT < 0.35 || i < 0 || i >= G.cards.length) return;
    const k = G.cards[i];
    G.up[k] = Math.min(UPGRADES[k].max, G.up[k] + 1);
    G.state = 'play'; G.grace = 0.5; SFX.pick();
    FL.push({ x: P.x, y: P.y - 50, t: 0, txt: UPGRADES[k].name + '!', col: '#9fe8ff' });
    clearMove();
  }

  // ---------- abilities ----------
  function useShield() {
    if (G.state !== 'play' || G.paused) return;
    if (!G.up.shield || G.shieldCd > 0 || G.shieldT > 0) { SFX.deny(); return; }
    G.shieldT = SHIELD_DUR; G.shieldCd = SHIELD_CD; SFX.shieldOn();
  }
  function safestX() {
    // score each roof spot by how close incoming darts will pass in the next 1.2s (sooner and super = worse)
    let best = P.x, bestD = 1e9;
    const cy = ROOF_Y - 16;
    for (let x = ROOF_L + 16; x <= ROOF_R - 16; x += 6) {
      let d = 0;
      for (const b of B) {
        if (b.state !== 'fly') continue;
        for (let t = 0; t <= 1.2; t += 0.05) {
          const dist = Math.hypot(b.x + b.vx * t - x, b.y + b.vy * t - cy);
          if (dist < 70) d += (b.super ? 3 : 1) * Math.pow(1 - dist / 70, 2) * (1.4 - t);
        }
      }
      for (const e of E) if (e.active && e.warn > 0) d += 0.6 * Math.max(0, 1 - Math.abs(e.x - x) / 400);
      d += 0.4 * Math.max(0, 1 - Math.min(x - ROOF_L, ROOF_R - x) / 50); // avoid hugging the parapet
      d -= 0.002 * Math.min(120, Math.abs(x - P.x));                       // mild preference to actually move
      if (d < bestD) { bestD = d; best = x; }
    }
    return best;
  }
  function useTeleport() {
    if (G.state !== 'play' || G.paused) return false;
    if (!G.up.tp || G.tpCd > 0 || G.score < TP_COST) { SFX.deny(); return false; }
    const nx = safestX();
    sparkle(P.x, P.y - 18);
    addScore(-TP_COST, P.x, P.y - 44);
    P.x = nx; P.y = ROOF_Y; P.vy = 0; P.vx = 0; P.ground = true; P.air = 0; P.inv = 0.35; P.tpFx = 0.4;
    sparkle(P.x, P.y - 18);
    G.tpCd = TP_CD; SFX.teleport();
    return true;
  }
  function jumpPress() { jumpQ = 0.12; }
  function dash(dir) {
    if (G.state !== 'play' || G.paused || P.dashCd > 0) return;
    P.dashT = DASH_T; P.dashDir = dir; P.dashCd = DASH_CD; P.face = dir; SFX.dash();
    for (let i = 0; i < 6; i++) FX.push({ x: P.x, y: P.y - rnd(4, 30), vx: -dir * rnd(40, 120), vy: rnd(-20, 20), life: 0.3, max: 0.3, col: '#ffffff', s: 2, g: 0 });
  }

  // ---------- input ----------
  const keys = { left: false, right: false };
  const ptrs = new Map(); // pointerId -> {sx, sy, st, x, mode, dir, ax, btn}
  let jumpQ = 0;
  const DRAG_PX = 14, FLICK_MS = 230, FLICK_PX = 30, TAP_MS = 350;
  function moveDir() {
    let d = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (!d) { let latest = null; for (const p of ptrs.values()) if (p.mode === 'drag' && (!latest || p.st > latest.st)) latest = p; if (latest) d = latest.dir; }
    return d;
  }
  function clearMove() { ptrs.clear(); keys.left = keys.right = false; }
  const BTN = { tp: document.getElementById('bT'), shield: document.getElementById('bS'), pause: document.getElementById('bP') };
  const BTN_TXT = { tp: document.getElementById('bTs'), shield: document.getElementById('bSs') };
  function hitBtn(x, y) {
    for (const k in BTN) {
      const el = BTN[k];
      if (el.classList.contains('hide')) continue;
      const r = el.getBoundingClientRect(), pad = 8;
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return k;
    }
    return null;
  }
  function toLogical(cx, cy) {
    const r = cvs.getBoundingClientRect();
    return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H];
  }
  function pauseGame(why) {
    if ((G.state === 'play' || G.state === 'dying' || G.state === 'upgrade') && !G.paused) { G.paused = true; G.pauseWhy = why || ''; clearMove(); saveHi(); }
  }
  function togglePause() { if (G.paused) { if (!rotateOn) G.paused = false; } else pauseGame('button'); }
  function confirmAction(lx, ly) {
    // tap / Enter on menus. Returns true if the input was consumed.
    if (rotateOn) return true;
    if (G.paused) { G.paused = false; return true; }
    if (G.state === 'title') { newGame(); return true; }
    if ((G.state === 'over' || G.state === 'win') && G.endT > 0.9) { newGame(); return true; }
    if (G.state === 'over' || G.state === 'win' || G.state === 'dying') return true;
    if (G.state === 'upgrade') {
      if (lx === undefined) pickUpgrade(G.sel);
      else { const i = cardAt(lx, ly); if (i >= 0) pickUpgrade(i); }
      return true;
    }
    return false;
  }
  const ui = document.getElementById('ui');
  ui.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { ui.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const btn = hitBtn(e.clientX, e.clientY);
    if (btn === 'pause') { if (G.state === 'play' || G.state === 'dying' || G.state === 'upgrade') togglePause(); return; }
    if (btn === 'tp' && G.state === 'play' && !G.paused) { useTeleport(); BTN.tp.classList.add('on'); }
    if (btn === 'shield' && G.state === 'play' && !G.paused) { useShield(); BTN.shield.classList.add('on'); }
    ptrs.set(e.pointerId, { sx: e.clientX, sy: e.clientY, st: performance.now(), x: e.clientX, mode: btn ? 'btn' : 'pending', dir: 0, ax: e.clientX, btn });
  }, { passive: false });
  ui.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX;
    if (p.mode === 'pending') {
      const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
      if (Math.abs(dx) >= DRAG_PX && Math.abs(dx) >= Math.abs(dy) * 0.8) { p.mode = 'drag'; p.dir = dx > 0 ? 1 : -1; p.ax = e.clientX; }
      else if (dy <= -28 && Math.abs(dy) > Math.abs(dx) && G.state === 'play' && !G.paused) { p.mode = 'swipe'; jumpPress(); }
    } else if (p.mode === 'drag') {
      // direction follows the finger: reversing by DRAG_PX from the furthest point flips it
      if (p.dir > 0) { if (e.clientX > p.ax) p.ax = e.clientX; else if (e.clientX < p.ax - DRAG_PX) { p.dir = -1; p.ax = e.clientX; } }
      else { if (e.clientX < p.ax) p.ax = e.clientX; else if (e.clientX > p.ax + DRAG_PX) { p.dir = 1; p.ax = e.clientX; } }
    }
  }, { passive: false });
  function endPtr(e, cancelled) {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    if (p.btn) { if (BTN[p.btn]) BTN[p.btn].classList.remove('on'); return; }
    if (cancelled) return;
    const dt = performance.now() - p.st, dx = e.clientX - p.sx;
    if (p.mode === 'pending') {
      const [lx, ly] = toLogical(e.clientX, e.clientY);
      if (!confirmAction(lx, ly) && G.state === 'play' && dt < TAP_MS) jumpPress();
    } else if (p.mode === 'drag' && dt < FLICK_MS && Math.abs(dx) >= FLICK_PX && G.state === 'play') dash(dx > 0 ? 1 : -1);
  }
  ui.addEventListener('pointerup', e => endPtr(e, false));
  ui.addEventListener('pointercancel', e => endPtr(e, true));
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(t => document.addEventListener(t, e => { if (e.cancelable) e.preventDefault(); }, { passive: false }));
  ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));

  window.addEventListener('keydown', e => {
    const c = e.code;
    if (c === 'KeyP' || c === 'Escape') { if (!e.repeat) togglePause(); e.preventDefault(); return; }
    if (G.state === 'upgrade' && !G.paused) {
      if (c === 'Digit1' || c === 'Numpad1') pickUpgrade(0);
      else if (c === 'Digit2' || c === 'Numpad2') pickUpgrade(1);
      else if (c === 'Digit3' || c === 'Numpad3') pickUpgrade(2);
      else if (c === 'ArrowLeft' || c === 'KeyA') G.sel = (G.sel + G.cards.length - 1) % G.cards.length;
      else if (c === 'ArrowRight' || c === 'KeyD') G.sel = (G.sel + 1) % G.cards.length;
      else if ((c === 'Enter' || c === 'Space') && !e.repeat) pickUpgrade(G.sel);
      e.preventDefault(); return;
    }
    const isJump = c === 'Space' || c === 'KeyW' || c === 'ArrowUp';
    if (c === 'Enter' || (isJump && (G.state !== 'play' || G.paused))) { if (!e.repeat) confirmAction(); e.preventDefault(); return; }
    if (c === 'ArrowLeft' || c === 'KeyA') { keys.left = true; e.preventDefault(); return; }
    if (c === 'ArrowRight' || c === 'KeyD') { keys.right = true; e.preventDefault(); return; }
    if (e.repeat) { if (isJump || c === 'KeyT' || c === 'KeyS' || c === 'ArrowDown') e.preventDefault(); return; }
    if (isJump) { jumpPress(); e.preventDefault(); }
    else if (c === 'KeyT') { useTeleport(); e.preventDefault(); }
    else if (c === 'KeyS' || c === 'ArrowDown') { useShield(); e.preventDefault(); }
    else if (c === 'ShiftLeft' || c === 'ShiftRight') dash(moveDir() || P.face);
  });
  window.addEventListener('keyup', e => {
    const c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA') keys.left = false;
    if (c === 'ArrowRight' || c === 'KeyD') keys.right = false;
    if ((c === 'Space' || c === 'KeyW' || c === 'ArrowUp') && P.vy < -200) P.vy *= 0.55; // short hop
  });
  window.addEventListener('blur', () => { clearMove(); pauseGame('blur'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearMove(); pauseGame('hidden'); if (AC) AC.suspend(); }
    else if (AC) AC.resume();
  });
  window.addEventListener('pagehide', () => { pauseGame('hidden'); saveHi(); });

  const rotEl = document.getElementById('rotate');
  let rotateOn = false;
  function checkOrient() {
    const portrait = window.innerHeight > window.innerWidth;
    if (portrait !== rotateOn) {
      rotateOn = portrait;
      rotEl.style.display = portrait ? 'flex' : 'none';
      if (portrait) { clearMove(); pauseGame('rotate'); }
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  // ---------- simulation ----------
  const DT = 1 / 60;
  function enemyPivot(e) {
    if (e.type === 'bot') return [e.x + e.face * 5, e.y - 13];
    if (e.type === 'drone') return [e.x, e.y + 9];
    return [e.x + 12, e.y + 8];
  }
  function fireFrom(e, isSuper) {
    const p = progress();
    const spd = isSuper ? bulletSpeed(p) * 0.78 : bulletSpeed(p);
    const [px, py] = enemyPivot(e);
    const ty = P.y - HB_H / 2 - 2;
    const tt = Math.hypot(P.x - px, ty - py) / spd;
    const lead = isSuper ? 0.5 : 0.6;                    // partial lead on the player's current velocity
    const tx = clamp(P.x + P.vx * tt * lead, ROOF_L - 20, ROOF_R + 20);
    const a = Math.atan2(ty - py, tx - px) + rnd(-1, 1) * lerp(0.06, 0.02, p);
    const mx = px + Math.cos(a) * 15, my = py + Math.sin(a) * 15;
    B.push({ x: mx, y: my, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: isSuper ? 10 : 4, hitR: isSuper ? 8 : 3.5, super: isSuper, dodged: false, state: 'fly', t: 0, spin: 0 });
    e.ang = a; e.recoil = 1;
    for (let i = 0; i < (isSuper ? 14 : 5); i++) FX.push({ x: mx, y: my, vx: Math.cos(a) * rnd(20, 80) + rnd(-30, 30), vy: Math.sin(a) * rnd(20, 80) + rnd(-30, 30), life: 0.25, max: 0.25, col: isSuper ? '#ff5050' : '#ffffff', s: isSuper ? 3 : 2, g: 0 });
    if (isSuper) SFX.superFire(); else SFX.fire();
  }
  function markDodged(b) {
    if (b.dodged) return;
    b.dodged = true;
    if (G.state !== 'play') return;
    if (b.super) { G.superDodged++; addScore(50, clamp(b.x, 30, W - 30), clamp(b.y, 90, ROOF_Y - 10), '#ff8ad0'); SFX.dodgeBig(); }
    else { G.dodged++; addScore(10, clamp(b.x, 20, W - 20), clamp(b.y, 90, ROOF_Y - 6)); SFX.dodge(); }
  }
  function playerHit(b) {
    const cx = P.x, cy = P.y - HB_H / 2 - 2;
    const nx = clamp(b.x, cx - HB_W / 2, cx + HB_W / 2), ny = clamp(b.y, cy - HB_H / 2, cy + HB_H / 2);
    return (b.x - nx) * (b.x - nx) + (b.y - ny) * (b.y - ny) < b.hitR * b.hitR;
  }
  function die(b) {
    if (DBG.god) { if (!b.godT) { FL.push({ x: P.x, y: P.y - 50, t: 0, txt: 'GOD MODE', col: '#9fe8ff' }); b.godT = 1; } return; }
    if (G.state !== 'play') return;
    G.state = 'dying'; G.deathT = 0; SFX.hit();
    for (let i = 0; i < 26; i++) FX.push({ x: b.x, y: b.y, vx: rnd(-160, 160), vy: rnd(-220, 40), life: 0.9, max: 0.9, col: b.super ? '#ff4f7a' : (i % 2 ? '#7bdc3a' : '#ffffff'), s: 3, g: 500 });
    b.state = 'gone';
  }
  function sparkle(x, y) {
    for (let i = 0; i < 22; i++) { const a = rnd(0, 6.283), v = rnd(30, 140); FX.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, col: i % 2 ? '#c8a0ff' : '#9fe8ff', s: 2, g: 0 }); }
  }
  function burst(x, y) {
    const cols = ['#ffe45c', '#7bdc3a', '#ff7ac8', '#7ff6ff'];
    for (let i = 0; i < 40; i++) { const a = rnd(0, 6.283), v = rnd(40, 170); FX.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.2, max: 1.2, col: cols[i % 4], s: 2, g: 60 }); }
    SFX.block();
  }

  function stepPlayer(dt) {
    const dir = G.state === 'play' ? moveDir() : 0, sp = playerSpeed();
    P.dashCd = Math.max(0, P.dashCd - dt);
    if (P.dashT > 0) { P.dashT -= dt; P.vx = P.dashDir * DASH_V; }
    else { const tgt = dir * sp, a = (P.ground ? 2800 : 1900) * dt; P.vx += clamp(tgt - P.vx, -a, a); }
    if (dir) P.face = dir;
    if (jumpQ > 0) {
      if (P.ground) { P.vy = -JUMP_V; P.ground = false; P.air = 1; jumpQ = 0; SFX.jump(); }
      else if (G.up.dj && P.air === 1) {
        P.vy = -DJUMP_V; P.air = 2; jumpQ = 0; SFX.djump();
        for (let i = 0; i < 8; i++) FX.push({ x: P.x + rnd(-8, 8), y: P.y, vx: rnd(-50, 50), vy: rnd(30, 90), life: 0.35, max: 0.35, col: '#ffffff', s: 2, g: 0 });
      }
      jumpQ = Math.max(0, jumpQ - dt);
    }
    if (!P.ground) P.vy += GRAV * dt;
    P.x += P.vx * dt; P.y += P.vy * dt;
    if (P.y >= ROOF_Y) { if (!P.ground) SFX.land(); P.y = ROOF_Y; P.vy = 0; P.ground = true; P.air = 0; }
    const lo = ROOF_L + 10, hi = ROOF_R - 10;
    if (P.x < lo) { P.x = lo; if (P.vx < 0) P.vx = 0; } else if (P.x > hi) { P.x = hi; if (P.vx > 0) P.vx = 0; }
    P.anim += Math.abs(P.vx) * dt;
    P.inv = Math.max(0, P.inv - dt); P.tpFx = Math.max(0, P.tpFx - dt);
  }
  function stepEnemies(dt, firing) {
    const p = progress();
    for (const e of E) {
      if (!e.active) continue;
      e.bob += dt;
      if (e.inT < 1) e.inT = Math.min(1, e.inT + dt / 1.4);
      const k = 1 - smooth(e.inT);
      if (e.type === 'drone') { e.x = e.bx + k * 160 + Math.sin(e.bob * 0.9) * 22; e.y = e.by + Math.sin(e.bob * 2.1) * 6; }
      else if (e.type === 'heli') { e.x = e.bx - k * 300 + Math.sin(e.bob * 0.45) * 34; e.y = e.by + Math.sin(e.bob * 1.3) * 5; }
      else { e.x = e.bx; e.y = e.by + k * 24; }
      e.recoil = Math.max(0, e.recoil - dt * 6);
      e.cd = Math.max(0, e.cd - dt);
      const [px, py] = enemyPivot(e);   // blaster tracks the player
      const want = Math.atan2(P.y - 16 - py, P.x - px);
      let d = want - e.ang; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      e.ang += d * Math.min(1, dt * 5);
      if (e.warn > 0) {
        e.warn -= dt;
        if (e.warn <= 0) { e.warn = 0; if (firing) fireFrom(e, true); e.cd = 0.8; }
      }
    }
    if (!firing) return;
    G.fireT -= dt;
    if (G.fireT <= 0) {
      const ready = E.filter(e => e.active && e.inT >= 1 && e.warn <= 0 && e.cd <= 0);
      if (ready.length && !DBG.calm) { const e = ready[Math.floor(Math.random() * ready.length)]; fireFrom(e, false); e.cd = 0.55; }
      G.fireT = fireGap(p) * rnd(0.75, 1.25);
    }
    G.superT -= dt;
    if (G.superT <= 0) {
      const ready = E.filter(e => e.active && e.inT >= 1 && e.warn <= 0);
      if (ready.length) { const e = ready[Math.floor(Math.random() * ready.length)]; e.warn = 1.0; SFX.warn(); }
      G.superT = superGap(p);
    }
  }
  function stepBullets(dt) {
    const pcx = P.x, pcy = P.y - HB_H / 2 - 2;
    for (const b of B) {
      b.t += dt;
      if (b.state === 'fly') {
        b.x += b.vx * dt; b.y += b.vy * dt; b.spin += dt * 12;
        if (G.state === 'play' && G.shieldT > 0 && !b.super && Math.hypot(b.x - pcx, b.y - pcy) < SHIELD_R + b.r) {
          b.state = 'drop'; b.t = 0;
          const a = Math.atan2(b.y - pcy, b.x - pcx);
          b.vx = Math.cos(a) * 180; b.vy = Math.sin(a) * 180 - 120; markDodged(b); SFX.block();
          for (let i = 0; i < 5; i++) FX.push({ x: b.x, y: b.y, vx: rnd(-80, 80), vy: rnd(-80, 80), life: 0.3, max: 0.3, col: '#bff6ff', s: 2, g: 0 });
          continue;
        }
        if (G.state === 'play' && P.inv <= 0 && G.grace <= 0 && playerHit(b)) { die(b); continue; }
        if (b.vy > 0 && b.y >= ROOF_Y - b.r * 0.5 && b.x > ROOF_L - 8 && b.x < ROOF_R + 8) {
          b.y = ROOF_Y - b.r * 0.5; b.state = 'drop'; b.t = 0; b.vx *= 0.25; b.vy = -Math.abs(b.vy) * 0.18; markDodged(b);
          continue;
        }
        if (!b.dodged) {
          const rx = pcx - b.x, ry = pcy - b.y;
          if (rx * b.vx + ry * b.vy < 0 && rx * rx + ry * ry > 34 * 34) markDodged(b);
        }
        if (b.x < -40 || b.x > W + 40 || b.y > H + 40 || b.y < -60) { markDodged(b); b.state = 'gone'; }
      } else if (b.state === 'drop') {
        b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.spin += dt * 4;
        if (b.y > ROOF_Y - b.r * 0.5 && b.x > ROOF_L - 8 && b.x < ROOF_R + 8 && b.vy > 0) { b.y = ROOF_Y - b.r * 0.5; b.vy = -b.vy * 0.3; b.vx *= 0.6; }
        if (b.t > 1.4 || b.y > H + 20) b.state = 'gone';
      }
    }
    for (let i = B.length - 1; i >= 0; i--) if (B[i].state === 'gone') B.splice(i, 1);
  }
  function stepFx(dt) {
    for (const f of FX) { f.life -= dt; f.vy += f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
    for (let i = FX.length - 1; i >= 0; i--) if (FX[i].life <= 0) FX.splice(i, 1);
    for (const f of FL) f.t += dt;
    for (let i = FL.length - 1; i >= 0; i--) if (FL[i].t > 1) FL.splice(i, 1);
  }
  function update(dt) {
    G.frame++;
    for (const c of SKY.clouds) { c.x += c.v * dt; if (c.x > W + 80) c.x = -c.w - 40; }
    if (G.paused) return;
    if (G.state === 'title') {
      computeLook(0.08);
      for (const e of E) { e.active = e.i < 3; e.inT = 1; }
      stepEnemies(dt, false); stepFx(dt); return;
    }
    if (G.state === 'upgrade') { G.menuT += dt; return; }
    if (G.state === 'play') {
      G.t += dt;
      G.grace = Math.max(0, G.grace - dt);
      G.hintT = Math.max(0, G.hintT - dt);
      const ph = phaseOf(G.t);
      if (ph !== G.phase) { G.phase = ph; G.banner = PHASE_NAMES[ph]; G.bannerT = 2.4; SFX.phase(); activateEnemies(false); }
      G.bannerT = Math.max(0, G.bannerT - dt);
      if (G.shieldT > 0) { G.shieldT -= dt; if (G.shieldT <= 0) { G.shieldT = 0; SFX.shieldOff(); } }
      G.shieldCd = Math.max(0, G.shieldCd - dt);
      G.tpCd = Math.max(0, G.tpCd - dt);
      computeLook(progress());
      stepPlayer(dt);
      stepEnemies(dt, true);
      stepBullets(dt);
      stepFx(dt);
      if (G.state === 'play' && G.t >= RUN) {
        for (const b of B) if (b.state === 'fly') markDodged(b);
        endGame(true); return;
      }
      if (G.state === 'play' && G.upPending) { G.upPending = false; openUpgrade(); }
      return;
    }
    if (G.state === 'dying') {
      G.deathT += dt;
      stepEnemies(dt, false); stepBullets(dt); stepFx(dt);
      if (G.deathT > 1.0) endGame(false);
      return;
    }
    if (G.state === 'over' || G.state === 'win') {
      G.endT += dt; stepEnemies(dt, false); stepBullets(dt); stepFx(dt);
      if (G.state === 'win' && (G.frame % 50) === 0) burst(rnd(140, 500), rnd(60, 150));
    }
  }

  // ---------- rendering ----------
  const FONT = '-apple-system, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  function font(sz, wt) { ctx.font = `${wt || 800} ${sz}px ${FONT}`; }
  function txt(s, x, y, sz, col, align, outline, wt) {
    font(sz, wt); ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    if (outline) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, sz / 5); ctx.strokeStyle = outline; ctx.strokeText(s, x, y); }
    ctx.fillStyle = col; ctx.fillText(s, x, y);
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const scratch = document.createElement('canvas'), sctx = scratch.getContext('2d');
  function drawSprite(img, x, y, scale, flip, extra) {
    let src = img;
    if (L.tintA > 0.01 || extra) {   // shade the sprite with the ambient light (and optional warning tint)
      scratch.width = img.width; scratch.height = img.height;
      sctx.globalCompositeOperation = 'source-over'; sctx.drawImage(img, 0, 0);
      sctx.globalCompositeOperation = 'source-atop';
      if (L.tintA > 0.01) { sctx.fillStyle = rgb(L.tint, L.tintA); sctx.fillRect(0, 0, img.width, img.height); }
      if (extra) { sctx.fillStyle = extra; sctx.fillRect(0, 0, img.width, img.height); }
      src = scratch;
    }
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(x), Math.round(y));
    if (flip) { ctx.translate(img.width * scale, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, 0, 0, img.width * scale, img.height * scale);
    ctx.restore();
  }
  function glow(x, y, r, col, a) {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgb(col, a)); gr.addColorStop(1, rgb(col, 0));
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function drawSky() {
    const gr = ctx.createLinearGradient(0, 0, 0, 300);
    gr.addColorStop(0, rgb(L.top)); gr.addColorStop(1, rgb(L.bot));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    if (L.stars > 0.01) {
      const tt = G.frame / 60;
      for (const s of SKY.stars) { ctx.fillStyle = `rgba(255,255,240,${(L.stars * (0.55 + 0.45 * Math.sin(tt * s.tw + s.ph))).toFixed(3)})`; ctx.fillRect(s.x, s.y, s.s, s.s); }
    }
    if (L.sunA > 0.01) {
      glow(L.sunX, L.sunY, 90, L.sun, 0.45 * L.sunA);
      ctx.fillStyle = rgb(L.sun, L.sunA); ctx.beginPath(); ctx.arc(L.sunX, L.sunY, 22, 0, 6.283); ctx.fill();
    }
    if (L.moonA > 0.01) {
      const mx = 470, my = 58;
      glow(mx, my, 60, [200, 210, 255], 0.25 * L.moonA);
      ctx.fillStyle = `rgba(236,236,220,${L.moonA})`; ctx.beginPath(); ctx.arc(mx, my, 15, 0, 6.283); ctx.fill();
      ctx.fillStyle = rgb(L.top, L.moonA); ctx.beginPath(); ctx.arc(mx + 7, my - 4, 13, 0, 6.283); ctx.fill();
    }
    ctx.fillStyle = rgb(L.cloud, 0.55);
    for (const c of SKY.clouds) {
      ctx.beginPath(); ctx.ellipse(c.x + c.w / 2, c.y, c.w / 2, 7, 0, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c.x + c.w * 0.35, c.y - 5, c.w * 0.22, 7, 0, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.ellipse(c.x + c.w * 0.62, c.y - 7, c.w * 0.2, 8, 0, 0, 6.283); ctx.fill();
    }
  }
  function drawLayer(list, wins, col, litScale) {
    ctx.fillStyle = rgb(col);
    for (const b of list) {
      ctx.fillRect(b.x, b.top, b.w, H - b.top);
      if (b.step) ctx.fillRect(b.x + b.step, b.top - 8, b.w - b.step * 2, 8);
      if (b.ant) ctx.fillRect(b.x + b.w / 2, b.top - 18, 1.5, 18);
    }
    const lit = L.lit * litScale;
    ctx.fillStyle = rgb(mixc(col, [0, 0, 0], 0.25));
    for (const w of wins) ctx.fillRect(w.x, w.y, w.w, w.h);
    if (lit > 0.01) for (const w of wins) if (w.r < lit) { ctx.fillStyle = WINCOL[w.c]; ctx.fillRect(w.x, w.y, w.w, w.h); }
  }
  function drawNear() {
    for (const b of NEAR) {
      ctx.fillStyle = sh(b.col); ctx.fillRect(b.x, b.top, b.w, H - b.top);
      ctx.fillStyle = sh(b.trim); ctx.fillRect(b.x - 2, b.top - 4, b.w + 4, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(b.x + b.w - 6, b.top + 2, 6, H - b.top);
    }
    for (const w of NEAR_WIN) {     // lit windows glow at twilight / night
      if (w.r < L.lit) { ctx.fillStyle = WINCOL[w.c]; ctx.fillRect(w.x, w.y, w.w, w.h); }
      else { ctx.fillStyle = sh('#2a3048'); ctx.fillRect(w.x, w.y, w.w, w.h); ctx.fillStyle = sh('#4a5878'); ctx.fillRect(w.x, w.y, w.w, 2); }
    }
    const at = NEAR[4];             // antenna with a blinking light
    ctx.fillStyle = sh('#3a3a46'); ctx.fillRect(at.x + 60, at.top - 44, 3, 40); ctx.fillRect(at.x + 54, at.top - 8, 15, 4);
    if ((G.frame >> 5) % 2 === 0) glow(at.x + 61.5, at.top - 46, 8, [255, 60, 60], 0.9);
    // the player's roof props (background only): stair shed, vent, water tank, lamps
    ctx.fillStyle = sh('#5d6782'); ctx.fillRect(196, ROOF_Y - 34, 46, 34);
    ctx.fillStyle = sh('#3b4258'); ctx.fillRect(206, ROOF_Y - 26, 16, 26);
    ctx.fillStyle = sh('#79849f'); ctx.fillRect(193, ROOF_Y - 38, 52, 5);
    ctx.fillStyle = sh('#8c96ac'); ctx.fillRect(300, ROOF_Y - 14, 30, 14);
    ctx.fillStyle = sh('#6c768c'); for (let i = 0; i < 4; i++) ctx.fillRect(303 + i * 7, ROOF_Y - 11, 4, 8);
    ctx.fillStyle = sh('#6b4a34'); ctx.fillRect(404, ROOF_Y - 26, 4, 26); ctx.fillRect(436, ROOF_Y - 26, 4, 26);
    ctx.fillStyle = sh('#8a6044'); ctx.fillRect(398, ROOF_Y - 62, 48, 38);
    ctx.fillStyle = sh('#6b4a34'); for (let i = 0; i < 3; i++) ctx.fillRect(398, ROOF_Y - 56 + i * 12, 48, 2);
    ctx.fillStyle = sh('#5a3c2a'); ctx.beginPath(); ctx.moveTo(394, ROOF_Y - 62); ctx.lineTo(422, ROOF_Y - 78); ctx.lineTo(450, ROOF_Y - 62); ctx.fill();
    for (const lx of [ROOF_L + 4, ROOF_R - 4]) { ctx.fillStyle = sh('#2c2c36'); ctx.fillRect(lx - 1, ROOF_Y - 40, 3, 40); ctx.fillRect(lx - 5, ROOF_Y - 42, 11, 4); }
    ctx.fillStyle = sh('#9aa0b4'); ctx.fillRect(ROOF_L - 10, ROOF_Y, ROOF_R - ROOF_L + 20, 6);
    ctx.fillStyle = sh('#6c7288'); ctx.fillRect(ROOF_L - 10, ROOF_Y + 6, ROOF_R - ROOF_L + 20, 3);
  }
  function drawLampLight() {
    const a = clamp((L.lit - 0.3) / 0.6, 0, 1);
    if (a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const lx of [ROOF_L + 4, ROOF_R - 4]) {
      const gr = ctx.createRadialGradient(lx, ROOF_Y - 40, 2, lx, ROOF_Y - 10, 150);
      gr.addColorStop(0, `rgba(255,214,140,${(0.38 * a).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(lx - 4, ROOF_Y - 40); ctx.lineTo(lx + 150, ROOF_Y + 8); ctx.lineTo(lx - 150, ROOF_Y + 8); ctx.fill();
      glow(lx + 0.5, ROOF_Y - 40, 10, [255, 230, 170], a);
    }
    ctx.restore();
  }
  function drawBlaster(e, px, py) {   // generic chunky foam blaster that tracks the player
    ctx.save(); ctx.translate(px, py); ctx.rotate(e.ang);
    const rk = -e.recoil * 3;
    ctx.fillStyle = sh('#2b2440'); ctx.fillRect(rk - 4, -4, 16, 8);
    ctx.fillStyle = sh('#e8d24a'); ctx.fillRect(rk - 3, -3, 14, 6);
    ctx.fillStyle = sh('#8a62ff'); ctx.fillRect(rk + 10, -2.5, 6, 5);
    ctx.fillStyle = sh('#2b2440'); ctx.fillRect(rk + 2, 2, 3, 5);
    ctx.restore();
  }
  function drawEnemy(e) {
    if (!e.active) return;
    const [px, py] = enemyPivot(e);
    const pulse = 0.6 + 0.4 * Math.sin(G.frame * 0.6);
    if (e.warn > 0) {   // ~1s red charge-up glow before a super bullet
      const gy = e.y - (e.type === 'bot' ? 16 : 0), k = 1 - e.warn;
      glow(e.x, gy, 50 + k * 30, [255, 30, 40], 0.9 * pulse);
      ctx.strokeStyle = `rgba(255,80,80,${(0.9 * e.warn).toFixed(3)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, gy, 14 + k * 40, 0, 6.283); ctx.stroke();
    }
    const red = e.warn > 0 ? `rgba(255,40,40,${(0.35 + 0.3 * pulse).toFixed(3)})` : null;
    const x = e.x, y = e.y;
    if (e.type === 'bot') {
      drawSprite(BOT, x - 14, y - 32, 2, e.face < 0, red);
    } else if (e.type === 'drone') {
      ctx.fillStyle = sh('#2c2a3a'); ctx.fillRect(x - 24, y - 3, 48, 4);
      ctx.fillStyle = sh('#3f3c56'); rrect(x - 13, y - 7, 26, 14, 5); ctx.fill();
      ctx.fillStyle = sh('#9aa3b8'); ctx.fillRect(x - 9, y - 4, 18, 3);
      for (const sx of [-24, 24]) {
        ctx.fillStyle = sh('#2c2a3a'); ctx.fillRect(x + sx - 1, y - 9, 3, 7);
        const w = 10 + 8 * Math.abs(Math.sin(G.frame * 0.9 + sx));
        ctx.fillStyle = 'rgba(220,220,240,0.5)'; ctx.fillRect(x + sx - w, y - 11, w * 2, 2);
      }
      if (red) { ctx.fillStyle = red; rrect(x - 13, y - 7, 26, 14, 5); ctx.fill(); }
    } else {
      ctx.fillStyle = sh('#2c2a3a'); ctx.fillRect(x - 46, y - 3, 30, 4); ctx.fillRect(x - 50, y - 10, 4, 12);
      ctx.fillStyle = 'rgba(220,220,240,0.6)'; ctx.fillRect(x - 54, G.frame % 6 < 3 ? y - 12 : y - 4, 12, 2);
      ctx.fillStyle = sh('#c0392b'); rrect(x - 22, y - 12, 44, 24, 11); ctx.fill();
      ctx.fillStyle = sh('#e8e8f0'); ctx.fillRect(x - 18, y + 1, 36, 3);
      ctx.fillStyle = sh('#8fd8ff'); rrect(x + 6, y - 9, 14, 11, 4); ctx.fill();
      drawSprite(BOT_HEAD, x - 12, y - 10, 1.2, false, red);
      ctx.fillStyle = sh('#2c2a3a'); ctx.fillRect(x - 2, y - 17, 4, 6); ctx.fillRect(x - 14, y + 12, 3, 5); ctx.fillRect(x + 11, y + 12, 3, 5); ctx.fillRect(x - 20, y + 16, 40, 2);
      const rw = 46 * Math.abs(Math.cos(G.frame * 0.5));
      ctx.fillStyle = 'rgba(30,30,40,0.75)'; ctx.fillRect(x - rw, y - 18, rw * 2, 2);
      if (red) { ctx.fillStyle = red; rrect(x - 22, y - 12, 44, 24, 11); ctx.fill(); }
    }
    drawBlaster(e, px, py);
  }
  function drawEnemyGlow(e) {        // visors glow at night; red warning glow before a super bullet
    if (!e.active) return;
    const warn = e.warn > 0, col = warn ? [255, 50, 50] : [127, 246, 255];
    let vx, vy;
    if (e.type === 'bot') { vx = e.x; vy = e.y - 19; }
    else if (e.type === 'drone') { vx = e.x; vy = e.y + 1; }
    else { vx = e.x - 3.6; vy = e.y - 5.2; }
    if (L.lit > 0.2 || warn) glow(vx, vy, warn ? 24 : 18, col, warn ? 0.95 : 0.75 * clamp(L.lit, 0, 1));
    if (e.type === 'drone' || L.lit > 0.4 || warn) { ctx.fillStyle = rgb(col); ctx.fillRect(vx - 4, vy - 1, 8, 2); }
    if (warn) txt('!', e.x, e.y - (e.type === 'bot' ? 44 : 26), 18, '#ff4848', 'center', '#1b1626');
  }
  function drawPlayer() {
    let img = PL.stand;
    if (G.state === 'dying' || G.state === 'over') img = PL.hit;
    else if (!P.ground) img = PL.jump;
    else if (Math.abs(P.vx) > 20) img = (Math.floor(P.anim / 14) % 2) ? PL.run1 : PL.run2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(P.x, ROOF_Y + 1, 11, 3, 0, 0, 6.283); ctx.fill();
    if ((P.inv > 0 || G.grace > 0) && G.frame % 6 < 3) return;
    drawSprite(img, P.x - 12, P.y - 36, 2, P.face < 0);
    if (P.tpFx > 0) glow(P.x, P.y - 18, 40, [180, 140, 255], P.tpFx * 1.5);
  }
  function drawShield() {
    if (G.shieldT <= 0 || (G.state !== 'play' && G.state !== 'upgrade')) return;
    if (G.shieldT < 0.8 && G.frame % 8 < 4) return;
    const cx = P.x, cy = P.y - HB_H / 2 - 2;
    glow(cx, cy, SHIELD_R + 6, [120, 230, 255], 0.35);
    ctx.strokeStyle = 'rgba(190,245,255,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, SHIELD_R, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, SHIELD_R + 5, -Math.PI / 2, -Math.PI / 2 + 6.283 * (G.shieldT / SHIELD_DUR)); ctx.stroke();
  }
  function drawBullets() {
    const night = clamp(L.lit, 0, 1);
    for (const b of B) {
      const a = b.state === 'drop' ? clamp(1.4 - b.t, 0, 1) : 1;
      if (b.super) {   // big foam ball
        if (b.state === 'fly') glow(b.x, b.y, 26, [255, 40, 90], 0.55);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ff2f6d'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill();
        ctx.strokeStyle = '#ffe45c'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 3, b.spin, b.spin + 2.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 3, b.spin + 3.14, b.spin + 5.3); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(b.x - 4, b.y - 6, 3, 3);
        ctx.globalAlpha = 1;
      } else {         // lime foam dart with a soft pink tip
        if (night > 0.3 && b.state === 'fly') glow(b.x, b.y, 12, [140, 255, 90], 0.35 * night);
        const ang = b.state === 'fly' ? Math.atan2(b.vy, b.vx) : b.spin;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(b.x, b.y); ctx.rotate(ang);
        ctx.fillStyle = '#7bdc3a'; rrect(-9, -2.5, 12, 5, 2); ctx.fill();
        ctx.fillStyle = '#4fa81f'; ctx.fillRect(-7, -2.5, 1.5, 5); ctx.fillRect(-3, -2.5, 1.5, 5);
        ctx.fillStyle = '#ff5fa8'; rrect(2, -3, 6, 6, 3); ctx.fill();
        ctx.restore();
      }
    }
  }
  function drawFx() {
    for (const f of FX) { ctx.globalAlpha = clamp(f.life / f.max, 0, 1); ctx.fillStyle = f.col; ctx.fillRect(f.x - f.s / 2, f.y - f.s / 2, f.s, f.s); }
    ctx.globalAlpha = 1;
    for (const f of FL) { ctx.globalAlpha = clamp(1.4 - f.t * 1.4, 0, 1); txt(f.txt, f.x, f.y - f.t * 28, 12, f.col, 'center', '#1b1626'); }
    ctx.globalAlpha = 1;
  }

  const PHASE_COL = ['#ffb347', '#ffe45c', '#ff9ad0', '#9fb8ff'];
  function phaseIcon(ph, x, y) {
    if (ph === 0) { ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(x, y + 3, 7, Math.PI, 0); ctx.fill(); ctx.fillRect(x - 10, y + 3, 20, 2); }
    else if (ph === 1) { ctx.fillStyle = '#ffe45c'; ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.283); ctx.fill(); for (let i = 0; i < 8; i++) { const a = i * 0.785; ctx.fillRect(x + Math.cos(a) * 9 - 1, y + Math.sin(a) * 9 - 1, 2, 2); } }
    else if (ph === 2) { ctx.fillStyle = '#ff7aa8'; ctx.beginPath(); ctx.arc(x, y + 4, 7, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#a07aff'; ctx.fillRect(x - 10, y + 4, 20, 2); }
    else { ctx.fillStyle = '#e8e8d8'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.283); ctx.fill(); ctx.fillStyle = '#2a2850'; ctx.beginPath(); ctx.arc(x + 4, y - 2, 6, 0, 6.283); ctx.fill(); }
  }
  function drawHUD() {
    ctx.fillStyle = 'rgba(14,10,30,0.55)'; rrect(8, 8, 128, 44, 8); ctx.fill();
    txt('SCORE', 16, 18, 9, '#9fe8ff', 'left', null, 700);
    txt(String(G.score), 16, 36, 20, '#ffffff', 'left', null, 800);
    txt('BEST ' + G.hi, 128, 18, 9, '#ffe45c', 'right', null, 700);
    const chips = [];
    if (G.up.dj) chips.push('2x JUMP');
    if (G.up.speed) chips.push('SPEED+' + G.up.speed);
    if (G.up.shield) chips.push('SHIELD');
    if (G.up.tp) chips.push('TELEPORT');
    let ux = 8; font(9, 800);
    for (const c of chips) { const w = ctx.measureText(c).width + 10; ctx.fillStyle = 'rgba(80,40,190,0.7)'; rrect(ux, 56, w, 14, 7); ctx.fill(); txt(c, ux + 5, 63.5, 9, '#ffffff', 'left', null, 800); ux += w + 4; }
    if (available().length) txt('NEXT UPGRADE ' + G.nextUp, 10, chips.length ? 80 : 63, 9, 'rgba(255,255,255,0.85)', 'left', '#1b1626', 700);
    const cx = W / 2;
    ctx.fillStyle = 'rgba(14,10,30,0.55)'; rrect(cx - 82, 8, 164, 36, 10); ctx.fill();
    phaseIcon(G.phase, cx - 64, 21);
    txt(clockStr(G.t), cx - 46, 21, 17, '#ffffff', 'left', null, 800);
    txt(PHASE_NAMES[G.phase], cx + 74, 21, 11, PHASE_COL[G.phase], 'right', null, 800);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(cx - 72, 35, 144, 3);
    ctx.fillStyle = '#ffe45c'; ctx.fillRect(cx - 72, 35, 144 * progress(), 3);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 1; i < 4; i++) ctx.fillRect(cx - 72 + 36 * i - 0.5, 33, 1, 7);
    if (G.bannerT > 0 && G.state === 'play') {
      ctx.globalAlpha = clamp(G.bannerT, 0, 1);
      txt(G.banner, cx, 112, 30, PHASE_COL[G.phase], 'center', '#1b1626');
      txt(['THE CITY WAKES UP', 'FULL SUN - THE DARTS SPEED UP', 'DUSK - WATCH FOR THE RED GLOW', 'SURVIVE UNTIL MIDNIGHT!'][G.phase], cx, 138, 12, '#ffffff', 'center', '#1b1626');
      ctx.globalAlpha = 1;
    }
    if (FINE && G.hintT > 0 && G.state === 'play') {
      ctx.globalAlpha = clamp(G.hintT, 0, 1);
      ctx.fillStyle = 'rgba(14,10,30,0.65)'; rrect(cx - 205, H - 28, 410, 20, 8); ctx.fill();
      txt('\u2190 \u2192 / A D move   SPACE / W jump   SHIFT dash   S shield   T teleport   P pause', cx, H - 18, 10, '#ffffff', 'center', null, 700);
      ctx.globalAlpha = 1;
    }
  }
  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(14,10,30,0.84)'; rrect(x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(159,232,255,0.6)'; ctx.lineWidth = 2; rrect(x, y, w, h, 14); ctx.stroke();
  }
  function cardRects() {
    const n = G.cards.length, cw = 150, chh = 176, gap = 18, x0 = (W - (n * cw + (n - 1) * gap)) / 2;
    return G.cards.map((k, i) => ({ k, x: x0 + i * (cw + gap), y: 104, w: cw, h: chh }));
  }
  function cardAt(lx, ly) {
    const rs = cardRects();
    for (let i = 0; i < rs.length; i++) { const r = rs[i]; if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) return i; }
    return -1;
  }
  function cardIcon(k, x, y) {
    ctx.save(); ctx.translate(x, y);
    if (k === 'dj') { ctx.fillStyle = '#7bdc3a'; for (const oy of [6, -10]) { ctx.beginPath(); ctx.moveTo(-16, oy + 8); ctx.lineTo(0, oy - 6); ctx.lineTo(16, oy + 8); ctx.lineTo(10, oy + 8); ctx.lineTo(0, oy); ctx.lineTo(-10, oy + 8); ctx.closePath(); ctx.fill(); } }
    else if (k === 'speed') { ctx.fillStyle = '#ffe45c'; ctx.beginPath(); ctx.moveTo(4, -20); ctx.lineTo(-10, 2); ctx.lineTo(0, 2); ctx.lineTo(-4, 20); ctx.lineTo(12, -4); ctx.lineTo(2, -4); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-26, -6, 10, 2); ctx.fillRect(-28, 2, 12, 2); ctx.fillRect(-24, 10, 8, 2); }
    else if (k === 'shield') { glow(0, 0, 26, [120, 230, 255], 0.5); ctx.strokeStyle = '#bff6ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 6.283); ctx.stroke(); ctx.restore(); drawSprite(PL.stand, x - 6, y - 9, 1, false); return; }
    else { for (let i = 0; i < 12; i++) { const a = i * 0.7 + G.frame * 0.05, r = 4 + i * 1.5; ctx.fillStyle = i % 2 ? '#c8a0ff' : '#9fe8ff'; ctx.fillRect(Math.cos(a) * r - 2, Math.sin(a) * r - 2, 4, 4); } }
    ctx.restore();
  }
  function drawUpgrade() {
    ctx.fillStyle = 'rgba(8,6,20,0.6)'; ctx.fillRect(0, 0, W, H);
    txt('UPGRADE!', W / 2, 62, 30, '#ffe45c', 'center', '#1b1626');
    txt(FINE ? 'Pick one: click it, or press 1 / 2 / 3' : 'Tap a card to pick one', W / 2, 88, 12, '#ffffff', 'center', '#1b1626', 700);
    cardRects().forEach((r, i) => {
      const u = UPGRADES[r.k], selc = FINE && i === G.sel;
      ctx.fillStyle = selc ? 'rgba(80,40,190,0.94)' : 'rgba(30,22,60,0.94)'; rrect(r.x, r.y, r.w, r.h, 12); ctx.fill();
      ctx.strokeStyle = selc ? '#ffe45c' : 'rgba(159,232,255,0.8)'; ctx.lineWidth = selc ? 3 : 2; rrect(r.x, r.y, r.w, r.h, 12); ctx.stroke();
      if (FINE) txt(String(i + 1), r.x + 14, r.y + 16, 12, '#ffe45c', 'center', null, 800);
      cardIcon(r.k, r.x + r.w / 2, r.y + 52);
      txt(u.name, r.x + r.w / 2, r.y + 100, 14, '#ffffff', 'center', null, 800);
      txt(u.desc[0], r.x + r.w / 2, r.y + 124, 10, '#cfe9ff', 'center', null, 600);
      txt(u.desc[1], r.x + r.w / 2, r.y + 139, 10, '#cfe9ff', 'center', null, 600);
      if (u.max > 1) txt('LEVEL ' + (G.up[r.k] + 1) + ' / ' + u.max, r.x + r.w / 2, r.y + 160, 9, '#ffe45c', 'center', null, 800);
    });
  }
  function drawTitle() {
    ctx.fillStyle = 'rgba(8,6,20,0.35)'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, 72); ctx.rotate(-0.035);
    txt('ROOFTOP', 0, -14, 40, '#ffe45c', 'center', '#2a1650');
    txt('NERF BATTLE', 0, 26, 32, '#7ff6ff', 'center', '#2a1650');
    ctx.restore();
    txt('Dodge the foam darts from sunrise to midnight!', W / 2, 126, 13, '#ffffff', 'center', '#1b1626', 700);
    panel(W / 2 - 175, 142, 350, 88);
    const lines = FINE
      ? ['\u2190 \u2192 or A / D  move     SHIFT  dash-step', 'SPACE / W / \u2191  jump', 'S / \u2193  shield     T  teleport     P / ESC  pause', 'Every 500 pts: pick an upgrade']
      : ['Drag left / right to run  \u2022  flick to dash', 'Tap anywhere to jump', 'SHIELD & TELEPORT buttons unlock via upgrades', 'Every 500 pts: pick an upgrade'];
    lines.forEach((l, i) => txt(l, W / 2, 158 + i * 19, 11, i === 3 ? '#ffe45c' : '#e6f4ff', 'center', null, 700));
    txt('BEST ' + G.hi, W / 2, 252, 14, '#ffe45c', 'center', '#1b1626');
    if ((G.frame >> 5) % 2 === 0) txt(FINE ? 'PRESS ENTER TO START' : 'TAP TO START', W / 2, 278, 18, '#ffffff', 'center', '#1b1626');
  }
  function drawEnd() {
    const won = G.state === 'win';
    ctx.fillStyle = won ? 'rgba(8,6,20,0.3)' : 'rgba(40,0,10,0.4)'; ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 165, 70, 330, 196);
    txt(won ? 'MIDNIGHT! YOU WIN' : 'SPLAT! GAME OVER', W / 2, 100, 26, won ? '#ffe45c' : '#ff6b8a', 'center', '#1b1626');
    txt(won ? 'You survived the whole day on the roof' : 'Tagged at ' + clockStr(G.t) + ' (' + PHASE_NAMES[G.phase].toLowerCase() + ')', W / 2, 130, 12, '#ffffff', 'center', null, 700);
    txt('SCORE ' + G.score, W / 2, 160, 22, '#ffffff', 'center', null, 800);
    txt((G.newBest ? 'NEW BEST! ' : 'BEST ') + G.hi, W / 2, 188, 15, '#ffe45c', 'center', null, 800);
    txt('Darts dodged ' + G.dodged + '    Super dodged ' + G.superDodged, W / 2, 212, 11, '#cfe9ff', 'center', null, 600);
    if (G.endT > 0.9 && (G.frame >> 5) % 2 === 0) txt(FINE ? 'PRESS ENTER TO PLAY AGAIN' : 'TAP TO PLAY AGAIN', W / 2, 242, 14, '#ffffff', 'center', null, 800);
  }
  function drawPause() {
    ctx.fillStyle = 'rgba(8,6,20,0.55)'; ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 140, 110, 280, 110);
    txt('PAUSED', W / 2, 140, 28, '#ffe45c', 'center', '#1b1626');
    txt(rotateOn ? 'Rotate to landscape to continue' : (FINE ? 'Press P, Esc or Enter to resume' : 'Tap to resume'), W / 2, 174, 12, '#ffffff', 'center', null, 700);
    txt(clockStr(G.t) + '  \u2022  ' + PHASE_NAMES[G.phase] + '  \u2022  ' + G.score + ' pts', W / 2, 198, 11, '#9fe8ff', 'center', null, 700);
  }

  function render() {
    ctx.setTransform(KX, 0, 0, KY, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawSky();
    drawLayer(SKY.far, SKY.winFar, L.far, 0.8);
    drawLayer(SKY.mid, SKY.winMid, L.mid, 0.9);
    drawNear();
    for (const e of E) drawEnemy(e);
    if (G.state !== 'title') drawPlayer();
    drawLampLight();
    for (const e of E) drawEnemyGlow(e);
    drawShield();
    drawBullets();
    drawFx();
    if (G.state === 'title') drawTitle();
    else {
      drawHUD();
      if (G.state === 'upgrade') drawUpgrade();
      if (G.state === 'over' || G.state === 'win') drawEnd();
      if (G.paused) drawPause();
    }
    updateButtons();
  }
  const btnCache = {};
  function setBtn(k, cls, label) {
    const key = cls + '|' + label;
    if (btnCache[k] === key) return;
    btnCache[k] = key;
    const el = BTN[k];
    el.classList.remove('hide', 'locked', 'cool', 'ready', 'active');
    if (cls) el.classList.add(cls);
    BTN_TXT[k].textContent = label;
  }
  function updateButtons() {
    const show = G.state === 'play' || G.state === 'upgrade' || G.state === 'dying';
    BTN.pause.classList.toggle('hide', !show);
    if (!show) { setBtn('tp', 'hide', ''); setBtn('shield', 'hide', ''); return; }
    if (!G.up.tp) setBtn('tp', 'locked', 'LOCKED');
    else if (G.tpCd > 0) setBtn('tp', 'cool', Math.ceil(G.tpCd) + 's');
    else if (G.score < TP_COST) setBtn('tp', 'locked', 'NEED ' + TP_COST);
    else setBtn('tp', 'ready', '-' + TP_COST + ' PTS');
    if (!G.up.shield) setBtn('shield', 'locked', 'LOCKED');
    else if (G.shieldT > 0) setBtn('shield', 'active', 'ON ' + Math.ceil(G.shieldT) + 's');
    else if (G.shieldCd > 0) setBtn('shield', 'cool', Math.ceil(G.shieldCd) + 's');
    else setBtn('shield', 'ready', 'READY');
  }

  // ---------- main loop (fixed 60 Hz step) ----------
  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(250, now - last); last = now;
    while (acc >= STEP) { update(DT); acc -= STEP; }
    render();
    requestAnimationFrame(frame);
  }

  computeLook(0.08);
  resize();
  if (DBG.auto) newGame();
  requestAnimationFrame(frame);

  // small hook for automated testing / debugging
  window.Rooftop = {
    G, P, E, B, ptrs, keys, newGame, useTeleport, useShield, safestX, clockStr, moveDir,
    forceSuper(i) { const e = E.filter(x => x.active && x.inT >= 1)[i || 0]; if (e) { e.warn = 1.0; SFX.warn(); } return !!e; }
  };
})();
