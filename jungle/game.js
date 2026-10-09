/* Vine Runner - an original retro jungle runner. All art and audio generated in code. */
'use strict';
(function () {
  // ---------- constants ----------
  const W = 320, H = 180, HUD = 14;
  const GROUND = 112, CEIL = 138, FLOOR = 172;
  const PIT_X = 112, PIT_W = 96, LAD_X = 152, LAD_W = 16, TRE_X = 284;
  const CROCS = [124, 156, 188];
  const RUN = 1.1, JUMPV = -3.05, GRAV = 0.18, CLIMB = 0.9;
  const NS = 20, SKIP = 3, TIME0 = 20 * 60 * 60, SEED = 0x7a11e5;
  const TVAL = { bag: 2000, silver: 3000, gold: 4000, ring: 5000 };
  const TTYPES = ['bag', 'silver', 'gold', 'ring'];

  // 16-colour palette
  const PAL = {
    K: '#0b0b10', N: '#1b2a4e', H: '#123d22', G: '#1f7a2e', L: '#5cc23c', Y: '#f0d040',
    O: '#e07a22', R: '#d02a2e', B: '#7a4a22', D: '#3e2614', T: '#e8b88a', W: '#f4f4ec',
    S: '#a8b0b8', C: '#2f8fd8', Q: '#c8a050', P: '#6a3a8a'
  };

  const qs = new URLSearchParams(location.search);
  const DBG = {
    start: Math.max(0, Math.min(NS - 1, parseInt(qs.get('start') || '0', 10) || 0)),
    under: qs.get('under') === '1', god: qs.get('god') === '1', auto: qs.get('auto') === '1'
  };

  // ---------- pixel sprites ----------
  function spr(rows) {
    const h = rows.length, w = Math.max.apply(null, rows.map(r => r.length));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, j, 1, 1); }
    }
    return c;
  }
  const TOP = [
    '....DDDD..',
    '..RRRRRRR.',
    '.RR.TTTKT.',
    'R...TTTTT.',
    '.....TTT..',
    '....GGGGG.',
    '...GGWGGGT',
    '...TGWGG.T',
    '...TGWGG..',
    '....BYBB..',
    '....QQQQ..'
  ];
  const LEGS = {
    stand: ['....Q..Q..', '....T..T..', '....T..T..', '....D..D..', '...DD..DD.'],
    run1: ['...QQ..Q..', '..T.....T.', '..T......T', '.DD......D', '..........'],
    run2: ['....QQQ...', '....TT....', '....TT....', '....DD....', '....DDD...'],
    run3: ['....Q...Q.', '...T....T.', '...T.....T', '..DD....DD', '..........'],
    jump: ['...QQ.QQ..', '..TT...T..', '..T...T...', '..DD..DD..', '..........']
  };
  const HERO = {};
  for (const k in LEGS) HERO[k] = spr(TOP.concat(LEGS[k]));
  HERO.climb = spr([
    '...DDDD...', '..DDDDDD..', '..RRRRRR..', '..DDDDDD..', 'T..TTTT..T', 'T.GGGGGG.T',
    'TGGGGGGGGT', '..GGGGGG..', '..GGGGGG..', '..BBBBBB..', '..QQQQQQ..', '..Q....Q..',
    '..T....T..', '..T....T..', '..D....D..', '.DD....DD.'
  ]);
  HERO.hang = spr([
    '...T..T...', '...T..T...', '...TDDDD..', '..RRRRRRR.', '.RR.TTTKT.', 'R...TTTTT.',
    '.....TTT..', '....GGGGG.', '....GWGGG.', '....GWGG..', '....BYBB..', '....QQQQ..',
    '....T..T..', '....T..T..', '....D..D..', '...DD..DD.'
  ]);
  const LIFE = spr(['.DDD.', 'RRRRR', 'R.TKT', '..TT.']);
  const SNAKE = spr([
    '..........GG..', '.........GLLG.', '.........GLKLG', '..........GLLG',
    '......GGGLLG..', '....GLLLLLG...', '..GLLGGGLLLG..', '.GLLG...GLLLG.',
    '.GLLLGGGLLLLG.', '..GGGGGGGGGG..'
  ]);
  const SCORP = [
    spr(['.OOO........', 'O...O.......', 'O....O......', '.Y...OOOOO..', '....OOOOOOOO', '....OOOOOKOO', '....O.O.O.OO', '...O.O.O.O..']),
    spr(['.OOO........', 'O...O.......', 'O....O......', '.Y...OOOOO..', '....OOOOOOOO', '....OOOOOKOO', '...O.O.O.O.O', '....O.O.O...'])
  ];
  const LOG = spr([
    '...DDDDDD...', '..DBBBBBBD..', '.DBBQQQQBBD.', 'DBBQBBBBQBBD', 'DBQBBDDBBQBD', 'DBQBDQQDBQBD',
    'DBQBDQQDBQBD', 'DBQBBDDBBQBD', 'DBBQBBBBQBBD', '.DBBQQQQBBD.', '..DBBBBBBD..', '...DDDDDD...'
  ]);
  const TRE = {
    gold: spr(['..YYYYYY..', '.YWWYYYYO.', 'YYYYYYYYYO', 'OOOOOOOOOO']),
    silver: spr(['..SSSSSS..', '.SWWSSSSN.', 'SSSSSSSSSN', 'NNNNNNNNNN']),
    ring: spr(['...WW...', '..WCCW..', '...WW...', '..YYYY..', '.Y....Y.', '.Y....Y.', '..YYYY..']),
    bag: spr(['....BB....', '...B..B...', '....BB....', '...QQQQ...', '..QQGGQQ..', '.QQGQQQQQ.', '.QQQGGQQQ.', '.QQQQQGQQ.', '..QGGGQQ..', '...QQQQ...'])
  };

  // ---------- 3x5 pixel font ----------
  const FONT = {
    A: '75755', B: '65656', C: '74447', D: '65556', E: '74647', F: '74644', G: '74557', H: '55755',
    I: '72227', J: '11157', K: '55655', L: '44447', M: '57755', N: '65555', O: '75557', P: '75744',
    Q: '75571', R: '65655', S: '74717', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255',
    Y: '55222', Z: '71247', 0: '75557', 1: '26227', 2: '71747', 3: '71317', 4: '55711', 5: '74717',
    6: '74757', 7: '71122', 8: '75757', 9: '75717', ':': '02020', '.': '00002', '!': '22202',
    '-': '00700', '+': '02720', ' ': '00000', '/': '11244', '?': '71202', ',': '00024', "'": '22000'
  };

  // ---------- world (deterministic, seeded) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(a, b) {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // hand-designed sequence of ground features; the seed fills in hazards, walls, treasure and trees
  const PITS = ['none', 'ladder', 'water', 'croc', 'ladder', 'tar', 'none', 'quick', 'croc', 'ladder',
    'none', 'croc', 'tar', 'ladder', 'quick', 'none', 'croc', 'water', 'ladder', 'quick'];
  function buildWorld() {
    const rnd = mulberry32(SEED), out = [];
    let tc = 0;
    for (let i = 0; i < NS; i++) {
      const pit = PITS[i];
      const s = { i, pit, vine: false, hazard: 'none', hx: 0, logs: [], treasure: null, wall: 0, trees: [], scorp: i !== 0, scX: 220 };
      if (pit === 'tar' || pit === 'water') s.vine = true;
      else if (pit === 'quick') s.vine = rnd() < 0.6;
      else if (pit === 'croc') s.vine = rnd() < 0.35;
      if ((pit === 'ladder' || pit === 'none') && i > 0) {
        const base = pit === 'ladder' ? 200 : 110;
        const h = rnd();
        if (h < 0.5) {
          s.hazard = 'logs';
          const n = 1 + Math.floor(rnd() * 3), roll = rnd() < 0.6;
          for (let k = 0; k < n; k++) s.logs.push({ x0: roll ? 236 + k * 34 : base + k * 26, x: 0, roll });
        } else if (h < 0.72) { s.hazard = 'snake'; s.hx = base + 18; }
        else { s.hazard = 'fire'; s.hx = base + 18; }
      }
      if (pit === 'ladder' && rnd() < 0.6) s.wall = rnd() < 0.5 ? -1 : 1;
      if (s.wall === 1) s.scX = 90;
      if (i > 0 && rnd() < 0.5) s.treasure = TTYPES[tc++ % 4];
      const nt = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < nt; k++) s.trees.push({ x: Math.floor(k * (W / nt) + rnd() * (W / nt - 14)), w: 6 + Math.floor(rnd() * 5) });
      out.push(s);
    }
    for (let i = 3; tc < 8 && i < NS; i += 2) if (!out[i].treasure) out[i].treasure = TTYPES[tc++ % 4];
    return out;
  }
  const world = buildWorld();
  const TOTAL = world.filter(s => s.treasure).length;

  // ---------- canvas / scaling ----------
  const cvs = document.getElementById('screen');
  const ctx = cvs.getContext('2d');
  const buf = document.createElement('canvas'); buf.width = W; buf.height = H;
  const g = buf.getContext('2d');
  const fitEl = document.getElementById('fit');
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const aw = fitEl.clientWidth, ah = fitEl.clientHeight;
    let k = Math.floor(Math.min(aw * dpr / W, ah * dpr / H));
    if (k < 1) k = 1;
    cvs.width = W * k; cvs.height = H * k;
    cvs.style.width = (W * k / dpr) + 'px';
    cvs.style.height = (H * k / dpr) + 'px';
    ctx.imageSmoothingEnabled = false;
    checkOrient();
  }

  // ---------- audio (WebAudio synth, started on first tap) ----------
  let AC = null, master = null, noiseBuf = null;
  function initAudio() {
    try {
      if (!AC) {
        const A = window.AudioContext || window.webkitAudioContext;
        if (!A) return;
        AC = new A();
        master = AC.createGain(); master.gain.value = 0.22; master.connect(AC.destination);
        noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (AC.state === 'suspended') AC.resume();
    } catch (e) { /* audio unavailable */ }
  }
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  function tone(f, d, type, v, f2, t0) {
    if (!AC || AC.state !== 'running') return;
    const t = AC.currentTime + (t0 || 0);
    const o = AC.createOscillator(), gn = AC.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    gn.gain.setValueAtTime(v || 0.3, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(gn); gn.connect(master); o.start(t); o.stop(t + d + 0.03);
  }
  function noise(d, v, freq, t0) {
    if (!AC || AC.state !== 'running') return;
    const t = AC.currentTime + (t0 || 0);
    const s = AC.createBufferSource(); s.buffer = noiseBuf;
    const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1200;
    const gn = AC.createGain();
    gn.gain.setValueAtTime(v || 0.3, t); gn.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f); f.connect(gn); gn.connect(master); s.start(t); s.stop(t + d + 0.03);
  }
  function tune(notes, beat, type, v) {
    let t = 0;
    for (const n of notes) { if (n[0]) tone(mf(n[0]), n[1] * beat * 0.92, type, v, null, t); t += n[1] * beat; }
  }
  const SFX = {
    title() {
      tune([[67, 1], [72, 1], [76, 1], [79, 2], [77, 1], [76, 1], [74, 2], [72, 1], [74, 1], [76, 1], [72, 1], [69, 1], [67, 3]], 0.12, 'square', 0.22);
      tune([[48, 4], [53, 4], [55, 4], [48, 5]], 0.12, 'triangle', 0.35);
    },
    start() { tune([[72, 1], [79, 1], [84, 2]], 0.08, 'square', 0.25); },
    jump() { tone(300, 0.14, 'square', 0.18, 620); },
    grab() { tone(480, 0.08, 'triangle', 0.3, 920); },
    release() { tone(760, 0.12, 'triangle', 0.25, 380); },
    bump() { noise(0.12, 0.5, 300); tone(120, 0.12, 'square', 0.25, 70); },
    step() { noise(0.025, 0.07, 2600); },
    climb() { tone(880, 0.025, 'square', 0.06); },
    snap() { noise(0.05, 0.12, 3200); },
    treasure() { tune([[79, 0.5], [83, 0.5], [86, 0.5], [91, 1.5]], 0.08, 'square', 0.25); },
    death() { tune([[72, 1], [68, 1], [65, 1], [60, 3]], 0.12, 'triangle', 0.45); },
    over() { tune([[67, 2], [66, 2], [65, 2], [64, 1], [60, 4]], 0.14, 'square', 0.2); tune([[43, 6], [36, 7]], 0.14, 'triangle', 0.4); },
    win() { tune([[72, 1], [76, 1], [79, 1], [84, 1], [79, 1], [84, 3]], 0.1, 'square', 0.25); },
    hurry() { tone(1320, 0.05, 'square', 0.12); }
  };

  // ---------- game state ----------
  function loadHi() { try { return parseInt(localStorage.getItem('vineRunnerHi') || '0', 10) || 0; } catch (e) { return 0; } }
  function saveHi() { try { localStorage.setItem('vineRunnerHi', String(G.hi)); } catch (e) { /* ignore */ } }
  const G = { state: 'title', paused: false, pauseWhy: '', frame: 0, tick: 0, si: 0, score: 0, lives: 3, time: TIME0,
    got: new Set(), hi: loadHi(), deathT: 0, deathKind: '', endT: 0, msg: '', floats: [] };
  const P = { x: 12, y: GROUND, vx: 0, vy: 0, state: 'ground', face: 1, under: false, anim: 0, stumble: 0, kb: 0, inv: 0, hitCd: 0, relCd: 0 };
  const cur = () => world[G.si];

  function enterScreen() {
    const s = cur();
    for (const l of s.logs) l.x = l.x0;
    s.sc = { x: s.scX, dir: -1, face: -1 };
  }
  function resetPlayer() {
    Object.assign(P, { x: 12, y: GROUND, vx: 0, vy: 0, state: 'ground', face: 1, under: false, anim: 0, stumble: 0, kb: 0, inv: 90, hitCd: 0, relCd: 0 });
  }
  function newGame() {
    Object.assign(G, { state: 'play', paused: false, frame: 0, si: DBG.start, score: 0, lives: 3, time: TIME0, got: new Set(), deathT: 0, endT: 0, msg: '', floats: [] });
    resetPlayer(); P.inv = 0;
    if (DBG.under) { P.under = true; P.y = FLOOR; P.x = 40; }
    enterScreen();
    SFX.start();
  }
  function endGame(msg, won) {
    G.state = won ? 'win' : 'over'; G.msg = msg; G.endT = 0;
    if (G.score > G.hi) G.hi = G.score;
    saveHi();
    won ? SFX.win() : SFX.over();
  }
  function die(kind) {
    if (DBG.god || G.state !== 'play') return;
    G.state = 'dying'; G.deathKind = kind; G.deathT = 0; P.state = 'dead';
    SFX.death();
  }
  function addScore(n, x, y) {
    G.score = Math.max(0, G.score + n);
    if (G.score > G.hi) G.hi = G.score;
    G.floats.push({ x, y, t: 0, txt: (n > 0 ? '+' : '') + n, col: n > 0 ? 'Y' : 'R' });
  }

  // ---------- input ----------
  const keys = { left: false, right: false, up: false, down: false, jump: false };
  const touch = new Map(); // pointerId -> control name
  const input = { left: false, right: false, up: false, down: false, jump: false };
  let jumpQueued = false;
  function refreshInput() {
    for (const k in input) input[k] = keys[k];
    for (const v of touch.values()) if (v && v in input) input[v] = true;
    for (const b of BTNS) b.el.classList.toggle('on', !!input[b.name]);
  }
  const BTNS = [
    { el: document.getElementById('bL'), name: 'left' }, { el: document.getElementById('bR'), name: 'right' },
    { el: document.getElementById('bU'), name: 'up' }, { el: document.getElementById('bD'), name: 'down' },
    { el: document.getElementById('bJ'), name: 'jump' }, { el: document.getElementById('bP'), name: 'pause' }
  ];
  function hitTest(x, y) {
    let best = null, bd = 1e9;
    for (const b of BTNS) {
      const r = b.el.getBoundingClientRect(), pad = 14;
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) {
        const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
        if (d < bd) { bd = d; best = b.name; }
      }
    }
    return best;
  }
  function pauseGame(why) {
    if (G.state === 'play' || G.state === 'dying') { G.paused = true; G.pauseWhy = why || ''; saveHi(); }
  }
  function togglePause() { if (G.paused) G.paused = false; else pauseGame('button'); }
  function anyStart() {
    // shared by tap and keyboard: start / resume / restart
    initAudio();
    if (rotateOn) return true;
    if (G.state === 'title') { newGame(); return true; }
    if ((G.state === 'over' || G.state === 'win') && G.endT > 50) { G.state = 'title'; G.endT = 0; SFX.title(); return true; }
    if (G.paused) { G.paused = false; return true; }
    return false;
  }
  const ui = document.getElementById('ui');
  ui.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { ui.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const name = hitTest(e.clientX, e.clientY);
    if (name === 'pause') { initAudio(); if (G.state === 'play' || G.state === 'dying') togglePause(); return; }
    const consumed = anyStart();
    touch.set(e.pointerId, name);
    if (name === 'jump' && !consumed) jumpQueued = true;
    refreshInput();
  }, { passive: false });
  ui.addEventListener('pointermove', e => {
    if (!touch.has(e.pointerId)) return;
    e.preventDefault();
    const old = touch.get(e.pointerId);
    let name = hitTest(e.clientX, e.clientY);
    if (name === 'pause') name = null;
    if (name !== old) {
      touch.set(e.pointerId, name);
      if (name === 'jump') jumpQueued = true;
      refreshInput();
    }
  }, { passive: false });
  const endPtr = e => { if (touch.delete(e.pointerId)) refreshInput(); };
  ui.addEventListener('pointerup', endPtr);
  ui.addEventListener('pointercancel', endPtr);
  ui.addEventListener('lostpointercapture', endPtr);
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(t => document.addEventListener(t, e => { if (e.cancelable) e.preventDefault(); }, { passive: false }));
  ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));

  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyZ: 'jump', KeyX: 'jump' };
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyP' || e.code === 'Escape') { initAudio(); togglePause(); e.preventDefault(); return; }
    const k = KEYMAP[e.code];
    if (e.code === 'Enter' || k === 'jump') { if (!e.repeat && anyStart()) { e.preventDefault(); return; } }
    if (!k) return;
    e.preventDefault();
    if (k === 'jump' && !e.repeat) jumpQueued = true;
    keys[k] = true; refreshInput();
  });
  window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) { keys[k] = false; refreshInput(); } });
  function clearInput() { touch.clear(); for (const k in keys) keys[k] = false; refreshInput(); }
  window.addEventListener('blur', () => { clearInput(); pauseGame('blur'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInput(); pauseGame('hidden'); if (AC) AC.suspend(); }
    else if (AC) AC.resume();
  });
  window.addEventListener('pagehide', () => { pauseGame('hidden'); saveHi(); });

  // orientation
  const rotEl = document.getElementById('rotate');
  let rotateOn = false;
  function checkOrient() {
    const portrait = window.innerHeight > window.innerWidth;
    if (portrait !== rotateOn) {
      rotateOn = portrait;
      rotEl.style.display = portrait ? 'flex' : 'none';
      if (portrait) { clearInput(); pauseGame('rotate'); }
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  // ---------- simulation ----------
  function vineAt(f) {
    const ph = f * 2 * Math.PI / 180, a = 0.8 * Math.sin(ph);
    return { x: 160 + 74 * Math.sin(a), y: 22 + 74 * Math.cos(a), vx: 74 * Math.cos(a) * 0.8 * Math.cos(ph) * (2 * Math.PI / 180), a };
  }
  function quickW() { return PIT_W * Math.max(0, Math.min(1, 1.6 * Math.sin(G.frame * 2 * Math.PI / 360))); }
  const mouthOpen = () => (G.frame % 200) < 70;
  function footing(s) {
    const f0 = P.x + 3, f1 = P.x + 7, c = P.x + 5;
    if (s.pit === 'ladder') return (c > LAD_X + 2 && c < LAD_X + LAD_W - 2) ? 'hole' : 'ok';
    if (s.pit === 'none') return 'ok';
    let a = PIT_X, b = PIT_X + PIT_W;
    if (s.pit === 'quick') { const w = quickW(); if (w < 2) return 'ok'; a = 160 - w / 2; b = 160 + w / 2; }
    if (!(f0 >= a && f1 <= b)) return 'ok';
    if (s.pit === 'croc') for (const cx of CROCS) if (f1 > cx && f0 < cx + 16) return 'croc';
    return 'pit';
  }
  const ovl = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const wallX = s => s.wall < 0 ? 24 : 286;

  function stepWorld() {
    G.frame++;
    const s = cur();
    for (const l of s.logs) if (l.roll) { l.x -= 0.75; if (l.x < -14) l.x += 334; }
    if (s.scorp && s.sc) {
      const sc = s.sc;
      let lo = 4, hi = 304;
      if (s.wall < 0) lo = wallX(s) + 11; if (s.wall > 0) hi = wallX(s) - 13;
      let d;
      if (P.under && G.state === 'play') { const dx = (P.x + 5) - (sc.x + 6); d = Math.abs(dx) < 2 ? 0 : Math.sign(dx); }
      else { if (sc.x <= lo + 1) sc.dir = 1; if (sc.x >= hi - 1) sc.dir = -1; d = sc.dir; }
      if (d) sc.face = d;
      sc.x = Math.max(lo, Math.min(hi, sc.x + d * 0.35));
    }
    if (s.pit === 'croc' && G.frame % 200 === 70) SFX.snap();
    for (const f of G.floats) { f.t++; f.y -= 0.4; }
    G.floats = G.floats.filter(f => f.t < 50);
  }

  function stepPlayer() {
    const s = cur();
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const jump = jumpQueued; jumpQueued = false;
    const ox = P.x;
    if (P.inv > 0) P.inv--;
    if (P.hitCd > 0) P.hitCd--;
    if (P.relCd > 0) P.relCd--;
    const nearLadder = s.pit === 'ladder' && Math.abs(P.x + 5 - (LAD_X + 8)) < 8;

    switch (P.state) {
      case 'ground': {
        if (P.stumble > 0) { P.stumble--; P.x += P.kb; P.kb *= 0.85; }
        else {
          if (dir) { P.face = dir; P.x += dir * RUN; P.anim++; if (P.anim % 10 === 0) SFX.step(); }
          else P.anim = 0;
        }
        if (jump && P.stumble <= 0) {
          P.state = 'air'; P.vy = JUMPV; P.vx = dir * RUN; SFX.jump();
        } else if (input.up && P.under && nearLadder) {
          P.state = 'climb'; P.y = FLOOR - 1;
        } else if (input.down && !P.under && nearLadder) {
          P.state = 'climb'; P.y = GROUND + 1;
        } else if (!P.under) {
          const ft = footing(s);
          if (ft === 'hole' || ft === 'pit') { P.state = 'air'; P.vy = 0.4; P.vx = 0; }
          else if (ft === 'croc' && mouthOpen()) {
            for (const cx of CROCS) if (P.x + 5 >= cx - 1 && P.x + 5 <= cx + 7) die('croc');
          }
        }
        break;
      }
      case 'air': {
        P.vy = Math.min(P.vy + GRAV, 4); P.x += P.vx; P.y += P.vy;
        if (P.under && P.y - 16 < CEIL) { P.y = CEIL + 16; if (P.vy < 0) P.vy = 0; }
        if (s.vine && !P.under && P.relCd === 0) {
          const v = vineAt(G.frame);
          if (Math.hypot(P.x + 5 - v.x, P.y - 16 - v.y) < 10) { P.state = 'vine'; SFX.grab(); break; }
        }
        if (P.under) {
          if (P.vy > 0 && P.y >= FLOOR) { P.y = FLOOR; P.state = 'ground'; P.vy = 0; P.vx = 0; }
        } else if (P.vy > 0 && P.y >= GROUND) {
          if (s.pit === 'ladder' && P.y > GROUND + 2) {
            P.x = Math.max(LAD_X - 1, Math.min(LAD_X + 7, P.x)); P.vx = 0;
            if (P.y >= FLOOR) { P.y = FLOOR; P.under = true; P.state = 'ground'; P.vy = 0; }
          } else {
            const ft = footing(s);
            if (ft === 'ok' || ft === 'croc') {
              if (P.y - P.vy <= GROUND + 1) { P.y = GROUND; P.state = 'ground'; P.vy = 0; P.vx = 0; }
            } else if (ft === 'pit') {
              P.vx = 0;
              if (P.y >= GROUND + 4) die('sink');
            }
          }
        }
        break;
      }
      case 'vine': {
        if (!s.vine) { P.state = 'air'; break; }
        const v = vineAt(G.frame);
        P.x = v.x - 5; P.y = v.y + 16; P.face = v.vx >= 0 ? 1 : -1;
        if (jump || input.down) {
          P.state = 'air'; P.vx = Math.max(-2.2, Math.min(2.2, v.vx + dir * 0.5)); P.vy = -1.2; P.relCd = 24; SFX.release();
        }
        break;
      }
      case 'climb': {
        P.x = LAD_X + 3;
        if (input.up) { P.y -= CLIMB; P.anim++; }
        else if (input.down) { P.y += CLIMB; P.anim++; }
        if (P.anim % 12 === 1 && (input.up || input.down)) SFX.climb();
        if (P.y <= GROUND) {
          P.y = GROUND; P.under = false; P.state = 'ground';
          P.x = P.face > 0 ? LAD_X + LAD_W + 1 : LAD_X - 11;
        } else if (P.y >= FLOOR) { P.y = FLOOR; P.under = true; P.state = 'ground'; }
        break;
      }
    }
    if (G.state !== 'play') return;

    // tunnel walls
    if (P.under && s.wall && P.state !== 'climb') {
      const wx = wallX(s);
      if (P.x + 8 > wx && P.x + 2 < wx + 10) { P.x = ox; P.vx = 0; }
    }

    // screen edges (underground skips several screens)
    if (P.x + 5 < 0 || P.x + 5 >= W) {
      const d = P.x + 5 < 0 ? -1 : 1, step = P.under ? SKIP : 1;
      G.si = ((G.si + d * step) % NS + NS) % NS;
      P.x -= d * W;
      enterScreen();
    }

    // hazards
    const pb = { x: P.x + 2, y: P.y - 15, w: 6, h: 15 };
    const s2 = cur();
    if (!P.under && P.state !== 'climb') {
      for (const l of s2.logs) {
        const lb = { x: l.x + 1, y: GROUND - 11 - logBounce(l), w: 10, h: 11 };
        if (ovl(pb, lb) && P.hitCd === 0) {
          P.hitCd = 45; addScore(-100, P.x, P.y - 20); SFX.bump();
          const away = (P.x + 5) < (l.x + 6) ? -1 : 1;
          if (P.state === 'ground') { P.stumble = 16; P.kb = away * 1.6; } else P.vx = away * 0.8;
        }
      }
      if (P.inv === 0) {
        if (s2.hazard === 'snake' && ovl(pb, { x: s2.hx + 3, y: GROUND - 9, w: 9, h: 9 })) die('snake');
        if (s2.hazard === 'fire' && ovl(pb, { x: s2.hx + 2, y: GROUND - 10, w: 8, h: 10 })) die('fire');
      }
      if (s2.treasure && !G.got.has(s2.i) && ovl(pb, { x: TRE_X, y: GROUND - 10, w: 10, h: 10 })) {
        G.got.add(s2.i); addScore(TVAL[s2.treasure], TRE_X - 6, GROUND - 16); SFX.treasure();
        if (G.got.size >= TOTAL) {
          const bonus = Math.floor(G.time / 60) * 10;
          addScore(bonus, 140, 80);
          endGame('ALL TREASURE FOUND!', true);
        }
      }
    }
    if (P.under && s2.scorp && s2.sc && P.inv === 0 && P.state !== 'climb') {
      if (ovl(pb, { x: s2.sc.x + 2, y: FLOOR - 7, w: 8, h: 7 })) die('scorpion');
    }
  }
  function logBounce(l) { return l.roll ? (Math.abs(Math.sin(l.x / 5)) * 2) | 0 : 0; }

  function update() {
    G.tick++;
    if (G.state === 'title') { G.frame++; return; }
    if (G.state === 'over' || G.state === 'win') { G.endT++; G.frame++; return; }
    if (G.paused) return;
    if (G.state === 'play') {
      G.time--;
      if (G.time <= 60 * 30 && G.time % 60 === 0) SFX.hurry();
      if (G.time <= 0) { G.time = 0; endGame('TIME UP'); return; }
      stepWorld();
      stepPlayer();
    } else if (G.state === 'dying') {
      stepWorld();
      G.deathT++;
      if (G.deathKind === 'sink') P.y += 0.25;
      if (G.deathT >= 100) {
        G.lives--;
        if (G.lives <= 0) { endGame('GAME OVER'); }
        else { G.state = 'play'; resetPlayer(); enterScreen(); }
      }
    }
  }

  // ---------- rendering ----------
  function fill(c, x, y, w, h) { g.fillStyle = PAL[c]; g.fillRect(x | 0, y | 0, w, h); }
  function text(str, x, y, c, sc, align) {
    sc = sc || 1; str = String(str).toUpperCase();
    const w = str.length * 4 * sc - sc;
    if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
    x = Math.round(x); g.fillStyle = PAL[c];
    for (let i = 0; i < str.length; i++) {
      const gl = FONT[str[i]] || FONT['?'];
      for (let r = 0; r < 5; r++) {
        const bits = +gl[r];
        for (let b = 0; b < 3; b++) if (bits & (4 >> b)) g.fillRect(x + i * 4 * sc + b * sc, y + r * sc, sc, sc);
      }
    }
  }
  function shadowText(str, x, y, c, sc, align) { text(str, x + sc, y + sc, 'K', sc, align); text(str, x, y, c, sc, align); }
  function drawSpr(img, x, y, flip) {
    x = Math.round(x); y = Math.round(y);
    if (!flip) { g.drawImage(img, x, y); return; }
    g.save(); g.translate(x + img.width, y); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore();
  }

  function drawScene(s) {
    const id = s.i * 31 + 7;
    fill('N', 0, HUD, W, 50);
    for (let x = 0; x < W; x += 4) { const h = hash(id, x >> 2); fill('H', x, 44 + ((h * 22) | 0), 4, GROUND); }
    for (const t of s.trees) {
      fill('D', t.x, HUD + 10, t.w, GROUND - HUD - 10);
      fill('B', t.x + 1, HUD + 10, t.w - 3, GROUND - HUD - 10);
      for (let y = HUD + 18 + (t.x % 7); y < GROUND - 4; y += 9) fill('D', t.x + 2, y, 2, 1);
      fill('D', t.x - 2, GROUND - 3, t.w + 4, 3);
    }
    fill('G', 0, HUD, W, 12);
    for (let x = 0; x < W; x += 4) {
      const h = hash(id + 3, x >> 2);
      fill('G', x, HUD + 12, 4, (h * 16) | 0);
      if (h > 0.45) fill('L', x + 1, HUD + 2 + ((h * 12) | 0), 2, 2);
      if (h > 0.85) fill('H', x, HUD + 12 + ((h * 16) | 0), 4, 2);
    }
    // ground strip
    fill('Q', 0, GROUND, W, 12); fill('L', 0, GROUND, W, 2);
    for (let x = 0; x < W; x += 3) { const h = hash(id + 5, x); if (h > 0.6) fill('G', x, GROUND - 2, 1, 2); if (h < 0.15) fill('B', x, GROUND + 5 + ((h * 30) | 0), 2, 1); }
    // dirt band with stones
    fill('B', 0, 124, W, CEIL - 124);
    for (let r = 0; r < 2; r++) {
      const y = 124 + r * 7; fill('D', 0, y + 6, W, 1);
      for (let x = (r ? 8 : 0); x < W; x += 16) fill('D', x, y, 1, 6);
    }
    // tunnel
    fill('K', 0, CEIL, W, FLOOR - CEIL);
    for (let x = 0; x < W; x += 5) { const h = hash(id + 9, x); if (h > 0.8) fill('D', x, CEIL + 1 + ((h * 30) | 0), 1, 1); }
    fill('D', 0, CEIL, W, 1);
    fill('B', 0, FLOOR, W, H - FLOOR); fill('D', 0, FLOOR, W, 1);
    for (let x = 2; x < W; x += 11) fill('D', x, FLOOR + 3 + (x % 3), 3, 1);

    // pits
    if (s.pit === 'water' || s.pit === 'croc') {
      fill('C', PIT_X, GROUND, PIT_W, 10);
      for (let x = PIT_X; x < PIT_X + PIT_W; x++) if (((x + (G.frame >> 3)) % 9) < 2) fill('W', x, GROUND + 1 + ((x >> 3) & 1) * 3, 1, 1);
      fill('D', PIT_X - 1, GROUND, 1, 10); fill('D', PIT_X + PIT_W, GROUND, 1, 10);
      if (s.pit === 'croc') for (const cx of CROCS) drawCroc(cx, mouthOpen());
    } else if (s.pit === 'tar') {
      fill('K', PIT_X, GROUND, PIT_W, 10);
      for (let x = PIT_X + 4; x < PIT_X + PIT_W - 4; x += 13) fill('P', x + ((G.frame >> 4) % 4), GROUND + 2 + (x % 4), 3, 1);
      fill('D', PIT_X - 1, GROUND, 1, 10); fill('D', PIT_X + PIT_W, GROUND, 1, 10);
    } else if (s.pit === 'quick') {
      for (let x = PIT_X; x < PIT_X + PIT_W; x += 4) fill('B', x, GROUND + 9, 2, 1);
      const w = quickW();
      if (w >= 2) {
        fill('O', 160 - w / 2, GROUND, w, 10); fill('B', 160 - w / 2, GROUND, w, 1);
        for (let k = 0; k < 6; k++) { const a = G.frame / 20 + k; fill('B', 160 + Math.cos(a) * w * 0.4, GROUND + 4 + Math.sin(a * 1.3) * 3, 2, 1); }
      }
    } else if (s.pit === 'ladder') {
      fill('K', LAD_X, GROUND, LAD_W, CEIL - GROUND);
      fill('Q', LAD_X + 2, GROUND, 1, FLOOR - GROUND); fill('Q', LAD_X + 13, GROUND, 1, FLOOR - GROUND);
      for (let y = GROUND + 3; y < FLOOR; y += 5) fill('Q', LAD_X + 2, y, 12, 1);
    }
    if (s.wall) {
      const wx = wallX(s);
      for (let y = CEIL + 1, r = 0; y < FLOOR; y += 4, r++) {
        fill('R', wx, y, 10, 4); fill('D', wx, y + 3, 10, 1); fill('D', wx + (r % 2 ? 3 : 7), y, 1, 3);
      }
    }
    if (s.vine) {
      const v = vineAt(G.frame);
      fill('D', 157, HUD + 4, 6, 6);
      for (let k = 0; k <= 74; k++) {
        const px = 160 + k * Math.sin(v.a), py = 22 + k * Math.cos(v.a);
        fill('G', px, py, 1, 1);
        if (k % 9 === 4) fill('L', px + (k % 18 ? 1 : -2), py, 2, 1);
      }
    }
  }
  function drawCroc(cx, open) {
    const y = GROUND;
    fill('G', cx, y - 2, 16, 4); fill('H', cx, y + 1, 16, 1);
    fill('L', cx + 10, y - 3, 2, 1); fill('L', cx + 13, y - 3, 2, 1);
    fill('G', cx + 8, y - 5, 5, 3); fill('W', cx + 9, y - 5, 2, 2); fill('K', cx + 9, y - 4, 1, 1);
    if (open) {
      fill('R', cx + 1, y - 3, 7, 1);
      fill('G', cx + 5, y - 5, 4, 2); fill('G', cx + 2, y - 7, 4, 2); fill('G', cx, y - 9, 3, 2);
      fill('W', cx + 1, y - 7, 1, 1); fill('W', cx + 3, y - 5, 1, 1); fill('W', cx + 2, y - 2, 1, 1); fill('W', cx + 5, y - 2, 1, 1);
    } else {
      fill('G', cx, y - 4, 9, 2); fill('K', cx + 1, y - 4, 1, 1);
      fill('W', cx + 2, y - 2, 1, 1); fill('W', cx + 5, y - 2, 1, 1);
    }
  }
  function drawEntities(s) {
    for (const l of s.logs) {
      const by = GROUND - 12 - logBounce(l);
      drawSpr(LOG, l.x, by);
      const a = -l.x / 6; fill('W', l.x + 5.5 + Math.cos(a) * 4, by + 5.5 + Math.sin(a) * 4, 1, 1);
    }
    if (s.hazard === 'snake') {
      drawSpr(SNAKE, s.hx, GROUND - 10);
      if ((G.frame >> 4) % 3 === 0) { fill('R', s.hx + 14, GROUND - 7, 2, 1); fill('R', s.hx + 16, GROUND - 8, 1, 1); fill('R', s.hx + 16, GROUND - 6, 1, 1); }
    } else if (s.hazard === 'fire') {
      const x = s.hx;
      for (let c = 0; c < 10; c++) {
        const h = Math.max(2, Math.round(11 - Math.abs(c - 4.5) * 2 + hash(c + 1, G.frame >> 2) * 4));
        const top = GROUND - 3 - h;
        fill('R', x + 1 + c, top, 1, h);
        if (c > 1 && c < 8) fill('O', x + 1 + c, top + Math.round(h * 0.35), 1, Math.round(h * 0.65));
        if (c > 2 && c < 7) fill('Y', x + 1 + c, top + Math.round(h * 0.6), 1, Math.round(h * 0.4));
      }
      if ((G.frame >> 3) % 3 === 0) fill('Y', x + 3 + ((G.frame >> 2) % 6), GROUND - 18 - ((G.frame >> 1) % 4), 1, 1);
      fill('B', x, GROUND - 3, 12, 2); fill('D', x + 2, GROUND - 2, 3, 2); fill('D', x + 7, GROUND - 2, 3, 2);
    }
    if (s.treasure && !G.got.has(s.i)) {
      const img = TRE[s.treasure], bob = (G.frame >> 4) % 2;
      drawSpr(img, TRE_X + 5 - (img.width >> 1), GROUND - img.height - bob);
      if ((G.frame >> 3) % 6 === 0) fill('W', TRE_X + 8, GROUND - img.height - 3, 1, 1);
    }
    if (s.scorp && s.sc) drawSpr(SCORP[(G.frame >> 3) % 2], s.sc.x, FLOOR - 8, s.sc.face < 0);
  }
  function drawPlayer() {
    if (P.inv > 0 && (P.inv >> 2) % 2 && G.state === 'play') return;
    let img = HERO.stand, flip = P.face < 0;
    if (P.state === 'air') img = HERO.jump;
    else if (P.state === 'vine') img = HERO.hang;
    else if (P.state === 'climb') { img = HERO.climb; flip = ((P.y >> 3) & 1) === 1; }
    else if (P.state === 'dead') img = G.deathKind === 'sink' ? HERO.hang : HERO.jump;
    else if (P.anim > 0) img = [HERO.run1, HERO.run2, HERO.run3, HERO.run2][(P.anim / 6 | 0) % 4];
    if (P.state === 'dead') {
      if (G.deathKind === 'sink') {
        g.save(); g.beginPath(); g.rect(0, 0, W, GROUND + 1); g.clip();
        drawSpr(img, P.x, P.y - 16, flip); g.restore();
        return;
      }
      if ((G.deathT >> 2) % 2) return;
    }
    drawSpr(img, P.x, P.y - 16, flip);
  }
  const pad = (n, l) => String(n).padStart(l, '0');
  function fmtTime(fr) { const s = Math.ceil(fr / 60); return pad(Math.floor(s / 60), 2) + ':' + pad(s % 60, 2); }
  function drawHUD() {
    fill('K', 0, 0, W, HUD);
    text('SCORE', 4, 2, 'S'); text(pad(G.score, 6), 26, 2, 'W');
    for (let i = 0; i < G.lives; i++) g.drawImage(LIFE, 4 + i * 7, 8);
    text('TIME', 120, 2, 'S'); text(fmtTime(G.time), 140, 2, G.time < 60 * 60 ? 'R' : 'Y');
    text('AREA ' + pad(G.si + 1, 2) + (P.under ? ' DOWN' : ''), 120, 8, 'L');
    text('HI ' + pad(G.hi, 6), 270, 2, 'S', 1, 'right');
    text(G.got.size + '/' + TOTAL, 270, 8, 'Y', 1, 'right');
    g.drawImage(TRE.gold, 246, 8);
  }
  function panel(y, h) { g.globalAlpha = 0.82; fill('K', 40, y, 240, h); g.globalAlpha = 1; fill('Y', 40, y, 240, 1); fill('Y', 40, y + h - 1, 240, 1); }

  function render() {
    if (G.state === 'title') {
      drawScene(world[0]);
      drawSpr(HERO[[ 'run1', 'run2', 'run3', 'run2'][(G.frame / 8 | 0) % 4]], 60 + ((G.frame / 2) % 200), GROUND - 16);
      fill('K', 0, 0, W, HUD);
      panel(30, 74);
      shadowText('VINE RUNNER', 160, 38, 'Y', 3, 'center');
      text('AN ORIGINAL JUNGLE DASH', 160, 60, 'L', 1, 'center');
      text('GRAB THE TREASURE BEFORE 20:00 RUNS OUT', 160, 70, 'S', 1, 'center');
      if ((G.frame >> 5) % 3 !== 2) shadowText('TAP TO START', 160, 84, 'W', 2, 'center');
      text('HI ' + pad(G.hi, 6), 160, 4, 'S', 1, 'center');
      text('KEYS: ARROWS/WASD + SPACE', 160, 150, 'S', 1, 'center');
      return;
    }
    const s = cur();
    drawScene(s);
    drawEntities(s);
    drawPlayer();
    for (const f of G.floats) shadowText(f.txt, f.x, f.y, f.col);
    drawHUD();
    if (G.state === 'over' || G.state === 'win') {
      panel(44, 80);
      shadowText(G.msg, 160, 54, G.state === 'win' ? 'Y' : 'R', 2, 'center');
      text('SCORE ' + pad(G.score, 6), 160, 76, 'W', 1, 'center');
      text('HI ' + pad(G.hi, 6), 160, 86, 'Y', 1, 'center');
      text('TREASURE ' + G.got.size + '/' + TOTAL, 160, 96, 'L', 1, 'center');
      if (G.endT > 50 && (G.endT >> 5) % 2 === 0) text('TAP TO PLAY AGAIN', 160, 110, 'W', 1, 'center');
    } else if (G.paused) {
      panel(62, 46);
      shadowText('PAUSED', 160, 70, 'Y', 2, 'center');
      text('TAP TO RESUME', 160, 92, 'W', 1, 'center');
    }
  }

  // ---------- main loop (fixed 60Hz step) ----------
  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(250, now - last); last = now;
    while (acc >= STEP) { update(); acc -= STEP; }
    render();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, cvs.width, cvs.height);
    requestAnimationFrame(frame);
  }

  resize();
  enterScreen();
  if (DBG.auto) newGame();
  requestAnimationFrame(frame);
  // small hook for automated testing / debugging
  window.VineRunner = { G, P, world, input, newGame };
})();
