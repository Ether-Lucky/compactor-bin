/* Simulation core (SPEC R-A1): all state and step(dt). Never touches the page.
   Works in the browser (window.CB) and in Node (module.exports) for tests. */
(function (root) {
  'use strict';
  var CB = root.CB = root.CB || {};

  /* ---------- Seeded randomness (R-A2) ---------- */
  CB.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    function next() {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    next.gauss = function (s) {
      var u = 0, v = 0;
      while (!u) u = next();
      while (!v) v = next();
      return (s || 1) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return next;
  };

  /* ---------- Values from the parts table, with measured overrides ---------- */
  CB.values = function (parts, overrides) {
    overrides = overrides || {};
    var P = {};
    ['geometry', 'params', 'program', 'detection'].forEach(function (g) {
      Object.keys(parts[g]).forEach(function (k) {
        P[k] = overrides[k] != null ? Number(overrides[k]) : parts[g][k].v;
      });
    });
    if (P.CHECK_MS == null) P.CHECK_MS = 3 * P.SAMPLE_GAP_MS;
    P.items = {};
    Object.keys(parts.items).forEach(function (k) {
      var it = Object.assign({ id: k }, parts.items[k]);
      ['crushN', 'final', 'dropout'].forEach(function (f) {
        var ok = k + '.' + f;
        if (overrides[ok] != null) it[f] = Number(overrides[ok]);
      });
      P.items[k] = it;
    });
    return P;
  };

  /* ---------- Program steps (mirror compactor_bin.ino) ---------- */
  CB.STEPS = [
    { id: 'BOOT', label: 'Power-on: pull plate fully up', dur: function (P) { return P.STROKE_MS / 1000; } },
    { id: 'READY', label: 'Wait for an object at the slot' },
    { id: 'OPENING', label: 'Open lid (servo → 90°)', dur: function (P) { return P.OPEN_WAIT_MS / 1000; } },
    { id: 'WAIT_CLEAR', label: 'Wait for the item to drop', dur: function (P) { return P.LID_TIMEOUT_MS / 1000; } },
    { id: 'CLEAR_DELAY', label: 'Let the hand move away', dur: function (P) { return P.CLEAR_WAIT_MS / 1000; } },
    { id: 'CLOSING', label: 'Close lid (servo → 0°), back to Ready', dur: function (P) { return P.CLOSE_WAIT_MS / 1000; } },
    { id: 'PRECRUSH', label: 'Pile at the line: two warning beeps', dur: function (P) { return (P.PRECRUSH_MS + 4 * P.BEEP_MS) / 1000; } },
    { id: 'EXTEND', label: 'Press the bundle: actuators extend', dur: function (P) { return P.STROKE_MS / 1000; } },
    { id: 'PAUSE', label: 'Pause', dur: function (P) { return P.PAUSE_MS / 1000; } },
    { id: 'RETRACT', label: 'Pull plate back up', dur: function (P) { return P.STROKE_MS / 1000; } },
    { id: 'CHECK', label: 'Check the pile: still high = full', dur: function (P) { return P.CHECK_MS / 1000; } }
  ];
  CB.STATE_NAMES = { BOOT: 'Starting up', READY: 'Ready', FULL: 'Bin full', OPENING: 'Opening lid', WAIT_CLEAR: 'Waiting for drop', CLEAR_DELAY: 'Hand clearing', CLOSING: 'Closing lid', PRECRUSH: 'Warning beeps', EXTEND: 'Pressing', PAUSE: 'Pause', RETRACT: 'Plate going up', CHECK: 'Checking the pile' };

  /* ---------- The simulation ---------- */
  CB.createSim = function (parts, opts) {
    opts = opts || {};
    var P = CB.values(parts, opts.overrides);
    var cfg = Object.assign({ detect: 'basic', hold: 0.2, n: 2, fuse: 15 }, opts.config || {});
    var seed = opts.seed != null ? opts.seed : 1234;
    var rng = CB.rng(seed), rngFill = CB.rng(seed + 9973);   // fill sensor has its own stream so it never shifts slot readings

    var SLOT = P.slot_w / 10, REC = P.sensor_recess / 10, EMPTY = SLOT + REC;
    var GAP = P.SAMPLE_GAP_MS / 1000;

    var S = {
      t: 0, mode: 'READY', modeT: 0, sAcc: 0, hist: [], histAcc: 0,
      p: 0, v: 0, F: 0, I: 0, cmd: 0, dir: 0, stall: false, limit: false,
      heat: 0, blown: false, estop: false,
      servo: 0, servoT: 0,
      pile: 0, pileL: 0, pileS: 0, pileN: 0, pileF: 0, pileGlass: 0, press: null, fillHist: [], presses: 0,
      slot: null, falling: null, beeps: [],
      leds: { g: 1, y: 0, r: 0 },
      s1: EMPTY, s2: EMPTY, w: 0, metal: false, hits: 0,
      verdict: { text: 'Slot empty.', cls: '' },
      cycles: 0, manual: false, accepted: false,
      fault: null, faultHidden: false, resets: 0, peakI: 0, fillCm: P.chamber_h / 10
    };

    var sim = { P: P, cfg: cfg, S: S, seed: seed, rng: rng, events: [], history: [], parts: parts };

    function log(msg, cls, code) { sim.seq = (sim.seq || 0) + 1; sim.events.push({ id: sim.seq, t: S.t, msg: msg, cls: cls || '', code: code || '' }); if (sim.events.length > 500) sim.events.shift(); }
    function beep(n) { var b = P.BEEP_MS / 1000; for (var i = 0; i < n; i++) S.beeps.push([S.t + i * 2 * b, S.t + i * 2 * b + b]); }
    function setMode(m) { S.mode = m; S.modeT = 0; }
    function N() { var n = Math.max(P.SAMPLE_COUNT, Math.round(cfg.hold / GAP)); return cfg.detect === 'basic' ? n : Math.max(n, P.W_SAMPLES); }
    function hitsNeeded() { return Math.ceil(0.8 * N()); }
    sim.N = N; sim.hitsNeeded = hitsNeeded; sim.log = log;
    sim.EMPTY = EMPTY; sim.SLOT = SLOT; sim.REC = REC;

    /* sensors */
    function sample() {
      var it = S.slot && S.slot.state === 'waiting' ? S.slot : null;
      if (it && it.beamLen != null && (it.t < it.beamStart || it.t > it.beamStart + it.beamLen)) it = null; // waved hand: only briefly in the 15° beam
      var noise = P.sensor_noise;
      if (S.fault === 'F1') {
        S.s1 = 2 + rng() * 40; S.s2 = 2 + rng() * 40; S.metal = rng() < 0.2;
      } else if (it) {
        var d = it.def, w = it.wReal + rng.gauss(d.jitter);
        var off = it.off + rng.gauss(0.08);
        var s1 = REC + (SLOT - w) / 2 + off + rng.gauss(noise);
        var s2 = REC + (SLOT - w) / 2 - off + rng.gauss(noise);
        if (rng() < d.dropout) s1 = EMPTY + rng.gauss(0.05);
        if (rng() < d.dropout) s2 = EMPTY + rng.gauss(0.05);
        S.s1 = Math.max(P.us_min_cm, s1); S.s2 = Math.max(P.us_min_cm, s2); S.metal = !!d.metal;
      } else {
        S.s1 = EMPTY + rng.gauss(0.05); S.s2 = EMPTY + rng.gauss(0.05); S.metal = false;
      }
      if (S.fault === 'F2') S.s1 = 999; // no echo: pulseIn times out, readCm returns 999
      S.w = (SLOT + 2 * REC) - S.s1 - S.s2;
      S.hist.push({ s1: S.s1, s2: S.s2, w: S.w, metal: S.metal });
      while (S.hist.length > N()) S.hist.shift();
    }

    function evaluate() {
      var n = N(), need = hitsNeeded();
      var hits = S.hist.filter(function (h) { return h.s1 < P.DETECT_CM && (cfg.detect === 'basic' || h.s2 < P.DETECT_CM); });
      S.hits = hits.length;
      if (S.hist.length < n || hits.length < need) {
        S.verdict = S.slot ? { text: 'Something may be there. Readings agreeing: ' + hits.length + ' of ' + need + ' needed.', cls: 'warn' } : { text: 'Slot empty.', cls: '' };
        return false;
      }
      if (cfg.detect !== 'basic') {
        var ws = hits.map(function (h) { return h.w; });
        var mean = ws.reduce(function (a, b) { return a + b; }, 0) / ws.length;
        var sd = Math.sqrt(ws.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / ws.length);
        if (mean < P.W_MIN || mean > P.W_MAX) { S.verdict = { text: 'Refused: width ' + mean.toFixed(1) + ' cm is outside ' + P.W_MIN + '–' + P.W_MAX + ' cm.', cls: 'bad' }; return false; }
        if (sd > P.W_STD) { S.verdict = { text: 'Refused: width keeps changing (±' + sd.toFixed(2) + ' cm). A bottle gives a steady width.', cls: 'bad' }; return false; }
        if (cfg.detect === 'metal' && hits.some(function (h) { return h.metal; })) { S.verdict = { text: 'Refused: the metal sensor triggered.', cls: 'bad' }; return false; }
        S.verdict = { text: 'Accepted: width ' + mean.toFixed(1) + ' cm, steady (±' + sd.toFixed(2) + ')' + (cfg.detect === 'metal' ? ', no metal' : '') + '.', cls: 'ok' };
      } else {
        S.verdict = { text: 'Accepted: something stayed closer than ' + P.DETECT_CM + ' cm for ' + (n * GAP).toFixed(2) + ' s.', cls: 'ok' };
      }
      return true;
    }

    /* fill sensor: on the housing floor, looking down at the pile (reads the bin floor when empty) */
    function readFill() {
      var d = (P.chamber_h - S.pile) / 10;
      var f = S.falling;
      if (f && f.inBeam) {   // a bottle dropping past the beam gives a brief short reading
        var top = (P.slot_top + P.slot_w / 2) / 10, k = Math.min(1, f.t / 0.4), fd = top + (d - top) * k * k;
        if (fd < d) d = fd;
      }
      S.fillCm = S.fault === 'F7' ? 3 : Math.max(P.us_min_cm, d + rngFill.gauss(P.sensor_noise));
      if (f && f.inBeam && !f.logged && S.fillCm < P.BUNDLE_CM && S.fault !== 'F7') {
        f.logged = true;
        log('Fill sensor briefly read ' + S.fillCm.toFixed(1) + ' cm: that was the bottle falling past it. Ignored, because the pile has to read under ' + P.BUNDLE_CM + ' cm for a full ' + (P.BUNDLE_HOLD_MS / 1000) + ' s with the lid closed.', '', 'fillBlip');
      }
      return S.fillCm;
    }
    function binFull() { return readFill() < P.FULL_CM; }
    /* every reading for BUNDLE_HOLD_MS must be under the line: a falling bottle passes in a fraction of a second */
    function bundleReady() {
      var n = Math.ceil(P.BUNDLE_HOLD_MS / P.SAMPLE_GAP_MS);
      if (S.servo > P.LID_CLOSED + 2 || S.falling) { S.fillHist = []; return false; }
      S.fillHist.push(readFill() < P.BUNDLE_CM); while (S.fillHist.length > n) S.fillHist.shift();
      return S.fillHist.length === n && S.fillHist.every(Boolean);
    }
    function pileCm() { return (S.pile / 10).toFixed(1) + ' cm'; }
    function count(n) { return n + (n === 1 ? ' item' : ' items'); }
    /* each item adds a layer: its share of the floor area times its height times a packing factor */
    sim.footprint = function (d) { return (d.len * d.h) / (P.inner_w * P.inner_d); };
    function addToPile(d, pressed) {
      var fp = sim.footprint(d), loose = d.h * fp * P.pile_loose;
      var solid = d.final < d.h - 1 ? d.final * fp * P.pile_pack : loose;   // glass does not compress
      S.pileL += loose; S.pileS += solid; S.pileN++; S.pileF += d.crushN || 0; if (d.mat === 'Glass') { S.pileGlass++; S.topGlassN = d.crushN; }
      S.pile = Math.min(P.chamber_h, S.pile + (pressed ? solid * 1.1 : loose));
    }
    /* force needed to hold the pile at height h (mm). Estimate: grows as the pile gets denser. */
    function pileForce(h) {
      if (S.pileN === 0) return 0;
      if (h <= S.pileS + 0.5) return Infinity;
      var span = Math.max(1, S.pileL - S.pileS), c = Math.max(0, Math.min(1, (S.pileL - h) / span));
      var F = P.bundle_k * (S.pileF / S.pileN) * (0.3 + c) / Math.max(0.02, 1 - c);
      return Math.max(F, S.topGlassN || 0);   // an unbroken glass bottle near the top takes the whole push
    }
    sim.pileForce = pileForce;

    function arduinoReset() {
      S.resets++;
      log('Arduino restarted: the servo pulled the 5V line down (brownout). The program starts over.', 'bad', 'reset');
      S.accepted = false; S.manual = false; S.hist = []; S.beeps = []; S._beeped = false;
      S.servoT = P.LID_CLOSED; S.leds = { g: 0, y: 1, r: 0 };
      if (S.slot) S.verdict = { text: 'Arduino restarted before the lid opened.', cls: 'bad' };
      setMode('BOOT');
    }
    sim.reset = arduinoReset;

    /* controller: compactor_bin.ino loop() */
    function controller(dt) {
      S.modeT += dt; S.sAcc += dt;
      var doSample = S.sAcc >= GAP; if (doSample) S.sAcc -= GAP;
      if (doSample && S.mode !== 'READY' && S.mode !== 'FULL' && S.mode !== 'CHECK') readFill();   // live reading for the gauges only
      switch (S.mode) {
        case 'BOOT':
          S.leds = { g: 0, y: 1, r: 0 }; S.servoT = P.LID_CLOSED;
          if (S.modeT >= P.STROKE_MS / 1000) { beep(1); setMode('READY'); }
          break;
        case 'READY':
          S.leds = { g: 1, y: 0, r: 0 }; S.servoT = P.LID_CLOSED;
          if (S.manual) { S.manual = false; log('Manual press button pressed.', '', 'manual'); setMode('PRECRUSH'); break; }
          if (doSample) {
            if (bundleReady()) { S.fillHist = []; log('Fill sensor reads ' + S.fillCm.toFixed(1) + ' cm: the pile reached the crush line. Pressing the bundle (' + count(S.pileN) + ' in the bin).', 'warn', 'bundle'); setMode('PRECRUSH'); break; }
            sample();
            if (evaluate()) {
              S.accepted = true; setMode('OPENING'); S.servoT = P.LID_OPEN;
              var d = S.slot && S.slot.state === 'waiting' ? S.slot.def : null;
              if (!d) log('Lid opened with nothing at the slot (bad sensor readings).', 'bad', 'ghost');
              else if (d.bottle) log('Accepted ' + d.name + '. Lid opening.', 'ok', 'accept');
              else log('Lid opened for: ' + d.name + '. ' + (d.note || 'False positive: this is not a plastic bottle.'), 'bad', 'falsepos');
            }
          }
          break;
        case 'FULL':
          S.leds = { g: 0, y: 0, r: 1 }; S.servoT = P.LID_CLOSED;
          if (doSample) sample();
          S.verdict = { text: 'Bin full: the lid stays locked.', cls: 'bad' };
          if (S.modeT >= P.FULL_RECHECK_MS / 1000) {
            if (readFill() < P.FULL_CM + 5) { S.modeT = 0; beep(3); }   // 5 cm margin so sensor noise can't unlock it
            else { log('Bin emptied. Ready again.', 'ok', 'unfull'); S.fillHist = []; setMode('READY'); }
          }
          break;
        case 'OPENING':
          if (doSample) sample();
          if (S.modeT >= P.OPEN_WAIT_MS / 1000) setMode('WAIT_CLEAR');
          break;
        case 'WAIT_CLEAR':
          if (doSample) { sample(); if (S.s1 >= P.DETECT_CM && !S.slot) { setMode('CLEAR_DELAY'); break; } }
          if (S.modeT >= P.LID_TIMEOUT_MS / 1000) { log('Lid timeout (' + P.LID_TIMEOUT_MS / 1000 + ' s). Closing anyway.', 'warn', 'timeout'); setMode('CLEAR_DELAY'); }
          break;
        case 'CLEAR_DELAY':
          if (S.modeT >= P.CLEAR_WAIT_MS / 1000) { S.servoT = P.LID_CLOSED; setMode('CLOSING'); }
          break;
        case 'CLOSING':
          if (S.modeT >= P.CLOSE_WAIT_MS / 1000) { S.accepted = false; S.cycles++; setMode('READY'); }
          break;
        case 'PRECRUSH':
          S.leds = { g: 0, y: 1, r: 0 }; S.servoT = P.LID_CLOSED;
          if (S.modeT >= P.PRECRUSH_MS / 1000 && S.beeps.length === 0 && !S._beeped) { beep(2); S._beeped = true; }
          if (S.modeT >= (P.PRECRUSH_MS + 4 * P.BEEP_MS) / 1000) {
            S._beeped = false; S.peakI = 0; setMode('EXTEND'); S.press = { h0: S.pile, min: S.pile };
            log(S.pileN ? 'Pressing ' + count(S.pileN) + ' (pile ' + pileCm() + ').' + (S.pileGlass ? ' Glass is in the pile: it will not crush and could shatter.' : '') : 'Pressing (the bin is empty).', S.pileGlass ? 'bad' : '', 'crush');
          }
          break;
        case 'EXTEND':
          if (S.modeT >= P.STROKE_MS / 1000) { if (S.stall) log('The ' + P.STROKE_MS / 1000 + ' s timer ended while the actuators were still stalled.', 'warn', 'timerStall'); setMode('PAUSE'); }
          break;
        case 'PAUSE':
          if (S.modeT >= P.PAUSE_MS / 1000) setMode('RETRACT');
          break;
        case 'RETRACT':
          if (S.modeT >= P.STROKE_MS / 1000) { beep(1); S.press = null; setMode('CHECK'); }
          break;
        case 'CHECK':
          if (S.modeT >= P.CHECK_MS / 1000) {
            S.presses++;
            if (binFull()) { setMode('FULL'); beep(3); log('After the press the fill sensor still reads ' + S.fillCm.toFixed(1) + ' cm (under ' + P.FULL_CM + ' cm). Bin full: red light on, lid locked. Empty the bin.', 'bad', 'full'); }
            else { log('Press done. The pile is now ' + pileCm() + ' high (' + count(S.pileN) + '). Fill sensor ' + S.fillCm.toFixed(1) + ' cm.', 'ok', 'pressed'); S.fillHist = []; setMode('READY'); }
          }
          break;
      }
    }

    /* items held at the slot */
    function slotStep(dt) {
      var sl = S.slot; if (!sl) return;
      sl.t += dt;
      if (sl.state === 'waiting') {
        var lidOpen = S.servo > P.LID_OPEN - 10;
        if (S.accepted && lidOpen && sl.def.drops && S.mode === 'WAIT_CLEAR' && S.modeT > 0.3) { sl.state = 'dropping'; sl.dt = 0; return; }
        var waitingForLid = S.accepted && sl.def.drops && (S.mode === 'OPENING' || S.mode === 'WAIT_CLEAR');
        if (S.accepted && sl.def.drops && !waitingForLid) {
          log('The lid never opened, so the ' + sl.def.name + ' was taken back.', 'bad', 'noLid');
          S.slot = null; return;
        }
        if (sl.t >= sl.def.giveUp && !waitingForLid && !(S.accepted && sl.def.drops)) {
          if (!S.accepted) {
            var why = S.verdict.cls === 'bad' ? S.verdict.text : (S.mode === 'FULL' ? 'The bin is full.' : 'The lid never opened.');
            if (sl.def.bottle) log('False negative: ' + sl.def.name + ' was refused. ' + why, 'bad', 'falseneg');
            else log(sl.def.name + ' was refused, as it should be. ' + why, 'ok', 'refuse');
          }
          S.slot = null;
        }
      } else if (sl.state === 'dropping') {
        sl.dt += dt;
        if (sl.dt >= 0.5) { S.falling = { def: sl.def, hc: sl.def.h, t: 0, inBeam: rngFill() < 0.5 }; S.slot = null; }
      }
    }

    /* actuators + power */
    function actuator(dt) {
      var m = S.mode;
      S.cmd = (m === 'EXTEND') ? 1 : (m === 'RETRACT' || m === 'BOOT') ? -1 : 0;
      var dir = S.fault === 'F3' ? -S.cmd : S.cmd;
      var driverOk = S.fault !== 'F6' && S.fault !== 'F1';
      var powered = !S.estop && !S.blown && driverOk;
      var n = cfg.n, Fmax = P.act_force * n, wasStall = S.stall;
      S.v = 0; S.F = 0; S.I = 0; S.limit = false; S.stall = false; S.dir = 0;
      if (powered && dir === 1) {
        if (S.p >= P.act_stroke) S.limit = true;
        else {
          var top = P.chamber_h - S.pile, touching = S.pile > 0.5 && S.p >= top - 0.01;
          var Freq = touching ? pileForce(P.chamber_h - S.p) : 0;
          S.dir = 1;
          if (Freq >= Fmax) { S.stall = true; S.F = Fmax; S.I = n * P.act_i_stall; }
          else {
            S.v = P.act_speed * (1 - (P.act_speed_loss / 100) * Freq / Fmax);
            S.p = Math.min(P.act_stroke, S.p + S.v * dt);
            if (S.pile > 0.5 && S.p > top) { S.pile = Math.max(S.pileS, P.chamber_h - S.p); if (S.press) S.press.min = Math.min(S.press.min, S.pile); }
            S.F = Freq; S.I = n * (P.act_i_free + (P.act_i_rated - P.act_i_free) * Freq / Fmax);
          }
        }
      } else if (powered && dir === -1) {
        if (S.p <= 0) S.limit = true;
        else {
          S.dir = -1; S.v = -P.act_speed; S.p = Math.max(0, S.p + S.v * dt); S.I = n * P.act_i_free;
          if (S.press && S.press.min < S.press.h0) {   // the pressed pile springs back a little as the plate lifts
            var back = S.press.min + P.pile_spring * (S.press.h0 - S.press.min);
            S.pile = Math.max(S.pile, Math.min(back, P.chamber_h - S.p));
          }
        }
      }
      if (S.I > S.peakI) S.peakI = S.I;
      if (S.stall && !wasStall) {
        if (S.pileGlass) log('STALL: the glass in the pile does not crush. The actuators push at full force and draw ' + S.I.toFixed(0) + 'A.', 'bad', 'stall');
        else log('The bundle is pressed as far as ' + (Fmax / 1000).toFixed(1) + ' kN can push it (' + pileCm() + '). The actuators stall against it (' + S.I.toFixed(0) + 'A) until the timer ends.', 'warn', 'stallSolid');
      }
      if (!S.blown) {
        if (S.I > cfg.fuse) {
          var k = 1 / ((P.fuse_blow_x * P.fuse_blow_x - 1) * 2);
          S.heat += dt * (Math.pow(S.I / cfg.fuse, 2) - 1) * k;
          if (S.heat >= 1) { S.blown = true; S.heat = 1; log('FUSE BLOWN (' + cfg.fuse + 'A). ' + S.I.toFixed(0) + 'A was too much. The actuators have no power.', 'bad', 'fuse'); }
        } else S.heat = Math.max(0, S.heat - 0.3 * dt);
      }
    }

    function mechanics(dt) {
      var dps = 60 / P.servo_s60;
      var target = S.fault === 'F4' ? S.servo : S.servoT;
      var delta = target - S.servo;
      if (S.fault === 'F5' && delta > 5 && S.mode !== 'BOOT') { arduinoReset(); return; }
      var ds = dps * dt; S.servo += Math.max(-ds, Math.min(ds, delta));
      if (S.fault === 'F1') S.servo = Math.max(0, Math.min(95, S.servo + rng.gauss(3)));
      if (S.falling) {
        S.falling.t += dt;
        if (S.falling.t >= 0.4) {
          var f = S.falling; addToPile(f.def, false);
          log(f.def.name + ' dropped onto the pile. ' + count(S.pileN) + ' in the bin, pile ' + pileCm() + '.', '', 'drop');
          S.falling = null;
        }
      }
    }

    sim.step = function (dt) {
      S.t += dt;
      controller(dt); slotStep(dt); actuator(dt); mechanics(dt);
      S.beeps = S.beeps.filter(function (b) { return b[1] > S.t; });
      S.histAcc += dt;
      if (S.histAcc >= 0.1) { S.histAcc -= 0.1; sim.history.push({ t: S.t, F: S.F, I: S.I, mode: S.mode, fuse: cfg.fuse, blown: S.blown, stall: S.stall }); if (sim.history.length > 1200) sim.history.shift(); }
    };
    sim.run = function (seconds, until) {
      var h = 0.01, n = Math.ceil(seconds / h);
      for (var i = 0; i < n; i++) { sim.step(h); if (until && until(sim)) return true; }
      return false;
    };

    /* actions */
    sim.busy = function () { return !(S.mode === 'READY' || S.mode === 'FULL'); };
    sim.insert = function (id) {
      if (S.slot) return false;
      var d = P.items[id]; if (!d) return false;
      var wReal = d.wMin != null ? d.wMin + rng() * (d.wMax - d.wMin) : d.w;
      S.slot = { def: d, t: 0, state: 'waiting', off: (rng() - 0.5) * 1.2, wReal: wReal };
      if (d.beam) { S.slot.beamStart = 0.15; S.slot.beamLen = d.beam[0] + rng() * (d.beam[1] - d.beam[0]); }
      S.hist = []; S.accepted = false;
      log(d.name + ' placed at the slot.', '', 'insert');
      return true;
    };
    sim.manualCrush = function () { if (S.mode === 'READY' && !S.slot) { S.manual = true; return true; } return false; };
    /* put n items straight into the bin (pressed = as if a press already flattened them) */
    sim.addItems = function (id, n, pressed) {
      var d = P.items[id]; if (!d) return;
      for (var i = 0; i < n; i++) addToPile(d, pressed);
      if (pressed) S.pileL = Math.max(S.pileS + 1, (S.pile - 0.8 * S.pileS) / 0.2);   // as dense as earlier presses could get it
      log('Added ' + n + (pressed ? ' pressed ' : ' loose ') + d.name + (n > 1 ? 's' : '') + ' to the bin. Pile ' + pileCm() + '.', '', 'pile');
    };
    sim.setEstop = function (on) { if (S.estop === !!on) return; S.estop = !!on; log(on ? 'E-STOP pressed. 12V to the actuators is cut. The Arduino keeps running.' : 'E-STOP released. Actuator power restored.', on ? 'bad' : '', on ? 'estop' : 'estopOff'); };
    sim.replaceFuse = function () { if (!S.blown) return; S.blown = false; S.heat = 0; log('Fuse replaced (' + cfg.fuse + 'A).', '', 'fuseNew'); };
    /* fill the bin with PET 500 mL bottles while the next one would still stay below depth cm (for tests and the demo) */
    sim.fillTo = function (cm, pressed) {
      var d = P.items.pet500, fp = sim.footprint(d), step = pressed ? d.final * fp * P.pile_pack * 1.1 : d.h * fp * P.pile_loose, n = 0;
      while (S.pile + step < P.chamber_h - cm * 10) { addToPile(d, pressed); n++; }
      if (pressed) S.pileL = Math.max(S.pileS + 1, (S.pile - 0.8 * S.pileS) / 0.2);   // as dense as earlier presses could get it
      if (n) log('Bin filled with ' + n + (pressed ? ' pressed' : ' loose') + ' PET 500 mL bottles. Pile ' + pileCm() + '.', '', 'pile');
      return n;
    };
    sim.emptyBin = function () { S.topGlassN = 0; S.pile = 0; S.pileL = 0; S.pileS = 0; S.pileN = 0; S.pileF = 0; S.pileGlass = 0; S.fillHist = []; log('Bin door opened and emptied.', '', 'empty'); };
    sim.setFault = function (id, hidden) {
      S.fault = id || null; S.faultHidden = !!(id && hidden);
      if (!id) log('All wiring faults cleared.', 'ok', 'faultOff');
      else if (hidden) log('Mystery fault switched on. Find it from the readings.', 'warn', 'faultOn');
      else log('Fault on: ' + parts.faults[id].name + '.', 'warn', 'faultOn');
    };
    sim.buzzer = function () { return S.beeps.some(function (b) { return S.t >= b[0] && S.t < b[1]; }); };

    /* live Arduino pins */
    sim.pins = function () {
      var bz = sim.buzzer(), servoPin = S.fault === 'F4' ? 'D10 (wrong)' : 'D9';
      return [
        { pin: 'D2/D3', part: 'slot1', label: 'Slot sensor S1', val: S.s1 > 900 ? 'no echo' : S.s1.toFixed(1) + ' cm', on: S.s1 < P.DETECT_CM },
        { pin: 'D4/D7', part: 'fill', label: 'Fill sensor', val: S.fillCm.toFixed(1) + ' cm', on: S.fillCm < P.BUNDLE_CM },
        { pin: 'D5', part: 'bts', label: 'RPWM (down)', val: S.cmd === 1 ? '255' : '0', on: S.cmd === 1 },
        { pin: 'D6', part: 'bts', label: 'LPWM (up)', val: S.cmd === -1 ? '255' : '0', on: S.cmd === -1 },
        { pin: 'D8', part: 'bts', label: 'Driver enable', val: S.fault === 'F6' ? 'not wired' : 'HIGH', on: S.fault !== 'F6' },
        { pin: servoPin, part: 'servo', label: 'Lid servo', val: Math.round(S.servoT) + '°', on: S.servoT > 1 },
        { pin: 'D12', part: 'buzzer', label: 'Buzzer', val: bz ? 'HIGH' : 'LOW', on: bz },
        { pin: 'A0', part: 'leds', label: 'Green LED', val: S.leds.g ? 'HIGH' : 'LOW', on: !!S.leds.g },
        { pin: 'A1', part: 'leds', label: 'Yellow LED', val: S.leds.y ? 'HIGH' : 'LOW', on: !!S.leds.y },
        { pin: 'A2', part: 'leds', label: 'Red LED', val: S.leds.r ? 'HIGH' : 'LOW', on: !!S.leds.r },
        { pin: 'A3', part: 'button', label: 'Manual button', val: S.manual ? 'LOW (pressed)' : 'HIGH', on: S.manual }
      ];
    };

    log('Power on. Plate fully up, lid closed.', '', 'power');
    return sim;
  };

  /* ---------- Batch test (I7): detection only ---------- */
  CB.MIX = [['pet500', 30], ['pet15', 15], ['can', 15], ['glass', 10], ['carton', 10], ['handHeld', 10], ['handWave', 10]];
  CB.shouldAccept = function (item) { return !!item.bottle; };
  CB.batch = function (parts, opts) {
    opts = opts || {};
    var seed = opts.seed != null ? opts.seed : 1234, n = opts.n || 50;
    var modes = opts.modes || ['basic', 'width', 'metal'];
    var total = CB.MIX.reduce(function (a, m) { return a + m[1]; }, 0);
    var pick = CB.rng(seed + 7), seq = [];
    for (var i = 0; i < n; i++) {
      var r = pick() * total, acc = 0, id = CB.MIX[0][0];
      for (var j = 0; j < CB.MIX.length; j++) { acc += CB.MIX[j][1]; if (r < acc) { id = CB.MIX[j][0]; break; } }
      seq.push(id);
    }
    return modes.map(function (mode) {
      var res = { mode: mode, tp: 0, tn: 0, fp: 0, fn: 0, rows: [] };
      seq.forEach(function (id, i) {
        var sim = CB.createSim(parts, { seed: seed * 1000 + i, overrides: opts.overrides, config: Object.assign({}, opts.config || {}, { detect: mode }) });
        sim.insert(id);
        var accepted = false;
        sim.run(8, function (s) { if (s.S.accepted) { accepted = true; return true; } return !s.S.slot; });
        var want = CB.shouldAccept(sim.P.items[id]);
        var kind = accepted ? (want ? 'tp' : 'fp') : (want ? 'fn' : 'tn');
        res[kind]++; res.rows.push({ id: id, accepted: accepted, kind: kind });
      });
      res.accuracy = (res.tp + res.tn) / n;
      return res;
    });
  };

  /* ---------- Arduino const lines (R-Q4) ---------- */
  CB.constLines = function (sim) {
    var P = sim.P, cfg = sim.cfg, n = sim.N(), need = sim.hitsNeeded();
    var L = [];
    L.push('// Generated by the Compactor Bin Simulator. Paste over the Tuning block in compactor_bin.ino.');
    L.push('const int  DETECT_CM = ' + P.DETECT_CM + ';        // object closer than this to slot sensor = present');
    L.push('const int  BUNDLE_CM = ' + P.BUNDLE_CM + ';        // pile closer than this to the fill sensor = press the bundle');
    L.push('const unsigned long BUNDLE_HOLD_MS = ' + P.BUNDLE_HOLD_MS + '; // pile must read under BUNDLE_CM this long (ignores falling bottles)');
    L.push('const int  FULL_CM   = ' + P.FULL_CM + ';        // still closer than this right after a press = bin full');
    L.push('const int  LID_CLOSED = ' + P.LID_CLOSED + ';');
    L.push('const int  LID_OPEN   = ' + P.LID_OPEN + ';');
    L.push('const unsigned long STROKE_MS = ' + P.STROKE_MS + '; // ' + P.act_stroke + ' mm / ' + P.act_speed + ' mm/s + margin');
    L.push('const unsigned long LID_TIMEOUT_MS = ' + P.LID_TIMEOUT_MS + ';');
    L.push('const int  SAMPLE_COUNT = ' + n + ';      // readings per check (' + (n * P.SAMPLE_GAP_MS / 1000).toFixed(2) + ' s)');
    L.push('const int  HITS_NEEDED  = ' + need + ';      // readings that must agree');
    L.push('const int  SAMPLE_GAP_MS = ' + P.SAMPLE_GAP_MS + ';');
    if (cfg.detect !== 'basic') {
      L.push('');
      L.push('// ---- needs new code: width check (second slot sensor) ----');
      L.push('// const float SLOT_PLUS_RECESS_CM = ' + (sim.SLOT + 2 * sim.REC).toFixed(1) + '; // width = this - S1 - S2');
      L.push('// const float W_MIN_CM = ' + P.W_MIN + ';');
      L.push('// const float W_MAX_CM = ' + P.W_MAX + ';');
      L.push('// const float W_MAX_WOBBLE_CM = ' + P.W_STD + ';');
    }
    if (cfg.detect === 'metal') {
      L.push('// ---- needs new code: inductive metal sensor ----');
      L.push('// const int METAL_PIN = ?;  // refuse when this reads LOW (sensor-dependent)');
    }
    return L.join('\n');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CB;
})(typeof window !== 'undefined' ? window : globalThis);
