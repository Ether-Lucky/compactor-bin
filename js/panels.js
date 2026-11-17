/* App: wires the simulation core to the views, panels and controls. */
(function (root) {
  'use strict';
  var CB = root.CB, PARTS = root.PARTS;
  var $ = function (id) { return document.getElementById(id); };
  var LS_KEY = 'compactor-bin.measured.v1';

  function loadOverrides() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveOverrides(o) { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) { /* storage blocked: still works, just not remembered */ } }
  function fmtT(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var app = {
    cfg: { detect: 'basic', hold: 0.2, n: 2, fuse: 15 },
    seed: 1234, overrides: loadOverrides(), sim: null, paused: false, speed: 4, view: 'machine', lastEvent: 0, mystery: null
  };

  /* ---------------- simulation lifecycle ---------------- */
  app.resetSim = function (quiet) {
    app.sim = CB.createSim(PARTS, { seed: app.seed, overrides: app.overrides, config: app.cfg });
    app.lastEvent = 0; $('log').innerHTML = '';
    app.mystery = null; syncFaultUI();
    if (!quiet) renderLog();
  };
  app.applyConfig = function (c) {
    Object.assign(app.cfg, c);
    if (app.sim) Object.assign(app.sim.cfg, c);
    syncSetupUI();
  };
  app.setPaused = function (p) { app.paused = !!p; $('pauseBtn').setAttribute('aria-pressed', app.paused ? 'true' : 'false'); $('pauseBtn').setAttribute('aria-label', app.paused ? 'Resume' : 'Pause'); };
  app.setSpeed = function (v) { app.speed = v; pressSeg('segSpeed', String(v)); };

  /* ---------------- views and routing ---------------- */
  var view2d = CB.View2D($('cv2d')), view3d = null, wiring = null;
  app.setView = function (v) {
    if (['machine', 'model', 'wiring'].indexOf(v) < 0) v = 'machine';
    app.view = v;
    ['machine', 'model', 'wiring'].forEach(function (k) {
      $('view-' + k).hidden = k !== v;
      $('tab-' + k).setAttribute('aria-selected', k === v ? 'true' : 'false');
    });
    if (('#' + v) !== location.hash) { try { history.replaceState(null, '', '#' + v); } catch (e) { location.hash = v; } }
    if (v === 'machine') { view2d.resize(); }
    if (v === 'model') {
      if (!view3d) view3d = CB.View3D($('three'), showCard, function () { $('no3d').hidden = false; $('tools3d').hidden = true; });
      requestAnimationFrame(function () { view3d.resize(); });
    }
    if (v === 'wiring' && !wiring) { wiring = CB.Wiring($('wiringSvg'), showCard); buildLegend(); }
  };
  function routeFromHash() { app.setView((location.hash || '#machine').slice(1)); }
  window.addEventListener('hashchange', routeFromHash);
  ['machine', 'model', 'wiring'].forEach(function (k) {
    $('tab-' + k).addEventListener('click', function (e) { e.preventDefault(); app.setView(k); });
  });
  function buildLegend() {
    $('wireLegend').innerHTML = CB.WIRE_LEGEND.map(function (l) { return '<span><i class="' + l[0] + '"></i>' + l[1] + '</span>'; }).join('') + '<span>Click a part for details, a wire to trace it</span>';
  }

  /* ---------------- part cards (shared by all views) ---------------- */
  var TAG_TEXT = { E: 'estimate', L: 'listing', D: 'datasheet', C: 'program', G: 'drawing', P: 'proposed' };
  var LIVE_SPECS = { 'Stall current': 'act_i_stall' };
  function showCard(id) {
    var p = PARTS.parts[id]; if (!p) return;
    if (id === 'estop' && app.view !== 'wiring') { toggleEstop(); }
    $('cardTitle').textContent = p.name; $('cardRole').textContent = p.role;
    $('cardSpecs').innerHTML = p.specs.map(function (s) {
      var val = s[1], tag = s[2], cls = tag === 'E' ? 'e' : '';
      var key = LIVE_SPECS[s[0]];
      if (key) { val = '~' + app.sim.P[key] + 'A each'; if (app.overrides[key] != null) { tag = 'M'; cls = 'm'; } }
      return '<dt>' + esc(s[0]) + '</dt><dd>' + esc(val) + '</dd><dd><span class="tag ' + cls + '">' + (tag === 'M' ? 'measured' : TAG_TEXT[tag] || tag) + '</span></dd>';
    }).join('');
    $('cardPins').innerHTML = p.pins.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    $('partCard').hidden = false;
  }
  $('cardClose').addEventListener('click', function () { $('partCard').hidden = true; });

  /* ---------------- items: click, keys, drag ---------------- */
  var itemBtns = {};
  (function buildItems() {
    var box = $('items'), items = PARTS.items;
    Object.keys(items).forEach(function (id) {
      var d = items[id], b = document.createElement('button');
      b.type = 'button'; b.className = 'item'; b.id = 'item-' + id;
      b.innerHTML = '<kbd>' + d.key + '</kbd><b>' + esc(d.name) + '</b><span>' + (d.shape === 'hand' ? 'not a bottle' : d.w.toFixed(1) + ' cm wide' + (d.metal ? ' · metal' : '')) + '</span>';
      box.appendChild(b); itemBtns[id] = b;
      attachDrag(b, id);
    });
  })();
  function insert(id) { if (app.sim.busy() && app.sim.S.mode !== 'FULL') return; app.sim.insert(id); }
  function attachDrag(btn, id) {
    var start = null, dragging = false, ghost = $('ghost'), stage = $('stage');
    btn.addEventListener('pointerdown', function (e) {
      if (btn.disabled) return;
      start = [e.clientX, e.clientY]; dragging = false; btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointermove', function (e) {
      if (!start) return;
      if (!dragging && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) { dragging = true; ghost.textContent = PARTS.items[id].name; ghost.hidden = false; }
      if (dragging) {
        ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
        var r = stage.getBoundingClientRect(), over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        stage.classList.toggle('drop-target', over);
      }
    });
    btn.addEventListener('pointerup', function (e) {
      if (!start) return;
      var r = stage.getBoundingClientRect(), over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!dragging || over) insert(id);
      start = null; dragging = false; ghost.hidden = true; stage.classList.remove('drop-target');
    });
    btn.addEventListener('pointercancel', function () { start = null; dragging = false; ghost.hidden = true; stage.classList.remove('drop-target'); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insert(id); } });
  }

  /* ---------------- setup ---------------- */
  function pressSeg(id, v) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'); }); }
  function seg(id, fn) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.addEventListener('click', function () { pressSeg(id, b.dataset.v); fn(b.dataset.v); }); }); }
  seg('segDetect', function (v) { app.applyConfig({ detect: v }); });
  seg('segAct', function (v) { app.applyConfig({ n: Number(v) }); });
  seg('segFuse', function (v) { app.applyConfig({ fuse: Number(v) }); });
  seg('segSpeed', function (v) { app.speed = Number(v); });
  seg('segCam', function (v) { view3d && view3d.setCamera(v); });
  $('cutaway').addEventListener('change', function (e) { view3d && view3d.setCutaway(e.target.checked); });
  $('hold').addEventListener('input', function (e) { app.applyConfig({ hold: Number(e.target.value) }); });
  function syncSetupUI() {
    pressSeg('segDetect', app.cfg.detect); pressSeg('segAct', String(app.cfg.n)); pressSeg('segFuse', String(app.cfg.fuse));
    $('hold').value = app.cfg.hold; $('holdVal').textContent = app.cfg.hold.toFixed(2) + ' s';
    var P = app.sim ? app.sim.P : CB.values(PARTS, app.overrides);
    $('detectHint').textContent = app.cfg.detect === 'basic' ? 'Same as the current program: anything closer than ' + P.DETECT_CM + ' cm opens the lid.' + (app.cfg.hold < 0.3 ? ' At 0.2 s a quick wave can sometimes open it.' : '')
      : app.cfg.detect === 'width' ? 'Two facing sensors measure width. Needs ' + P.W_MIN + '–' + P.W_MAX + ' cm, steady over ' + P.W_SAMPLES + ' readings. Needs new code.'
      : 'Width check plus an inductive sensor that refuses metal (≈₱150–300). Needs new code.';
    var stall = app.cfg.n * P.act_i_stall;
    $('fuseHint').textContent = app.cfg.fuse === 30 ? 'A 30A fuse will not protect 16 AWG wire: the wire overheats before the fuse blows.'
      : stall > app.cfg.fuse ? app.cfg.n + ' actuator' + (app.cfg.n > 1 ? 's' : '') + ' stall at about ' + stall + 'A, above this ' + app.cfg.fuse + 'A fuse. Expect it to blow at the end of a press.'
      : app.cfg.n + ' actuator' + (app.cfg.n > 1 ? 's' : '') + ' stall at about ' + stall + 'A, within this ' + app.cfg.fuse + 'A fuse.';
    renderConst();
  }

  /* ---------------- controls ---------------- */
  function toggleEstop() { app.sim.setEstop(!app.sim.S.estop); }
  $('manualBtn').addEventListener('click', function () { app.sim.manualCrush(); });
  $('estopBtn').addEventListener('click', toggleEstop);
  $('fuseBtn').addEventListener('click', function () { app.sim.replaceFuse(); });
  $('pileBtn').addEventListener('click', function () { app.sim.addItems('pet500', 20, true); });
  $('emptyBtn').addEventListener('click', function () { app.sim.emptyBin(); });
  $('resetBtn').addEventListener('click', function () { app.resetSim(); });
  $('seed').addEventListener('change', function (e) { var v = parseInt(e.target.value, 10); if (!isNaN(v)) { app.seed = v; app.resetSim(); } });
  $('pauseBtn').addEventListener('click', function () { app.setPaused(!app.paused); });
  $('stepBtn').addEventListener('click', function () { CB.advanceStep(app.sim, 90); app.setPaused(true); });

  /* ---------------- faults ---------------- */
  (function buildFaults() {
    var html = '<label><input type="radio" name="fault" value="" checked><span>No faults<small>Everything wired correctly.</small></span></label>';
    Object.keys(PARTS.faults).forEach(function (id) {
      var f = PARTS.faults[id];
      html += '<label><input type="radio" name="fault" value="' + id + '"><span>' + esc(f.name) + '<small>' + esc(f.symptom) + '</small></span></label>';
    });
    $('faults').innerHTML = html;
    $('faults').addEventListener('change', function (e) { app.mystery = null; app.sim.setFault(e.target.value || null, false); syncFaultUI(); });
    $('guess').innerHTML = '<option value="">Choose a fault…</option>' + Object.keys(PARTS.faults).map(function (id) { return '<option value="' + id + '">' + esc(PARTS.faults[id].name) + '</option>'; }).join('');
  })();
  function syncFaultUI() {
    var f = app.sim ? app.sim.S.fault : null;
    document.querySelectorAll('#faults input').forEach(function (i) { i.checked = app.mystery ? false : (i.value || null) === f; });
    $('mysteryBox').hidden = !app.mystery; $('mysteryResult').textContent = '';
  }
  $('mysteryBtn').addEventListener('click', function () {
    var ids = Object.keys(PARTS.faults), id = ids[Math.floor(Math.random() * ids.length)];
    app.mystery = id; app.sim.setFault(id, true); syncFaultUI(); $('guess').value = '';
  });
  $('revealBtn').addEventListener('click', function () {
    if (!app.mystery) return;
    var f = PARTS.faults[app.mystery], right = $('guess').value === app.mystery;
    $('mysteryResult').textContent = (right ? 'Correct: ' : 'Not quite. It was: ') + f.name + '. Fix: ' + f.fix + ' The Wiring view now shows it.';
    app.sim.S.faultHidden = false;
    app.sim.log('Mystery fault revealed: ' + f.name + '.', right ? 'ok' : 'warn', 'reveal');
  });

  /* ---------------- measured values (R-Q2) ---------------- */
  function measuredRows() {
    var rows = [], P = PARTS.params;
    rows.push({ grp: 'Actuators and sensors' });
    Object.keys(P).forEach(function (k) { if (P[k].edit) rows.push({ key: k, label: P[k].label, unit: P[k].unit, def: P[k].v, min: P[k].min, max: P[k].max }); });
    rows.push({ grp: 'Items (crush force and flattened height)' });
    Object.keys(PARTS.items).forEach(function (id) {
      var it = PARTS.items[id]; if (it.crushN == null) return;
      rows.push({ key: id + '.crushN', label: it.name + ': crush force', unit: 'N', def: it.crushN, min: 1, max: 20000 });
      rows.push({ key: id + '.final', label: it.name + ': flattened height', unit: 'mm', def: it.final, min: 1, max: it.h });
    });
    return rows;
  }
  function renderMeasured() {
    $('measured').innerHTML = measuredRows().map(function (r) {
      if (r.grp) return '<div class="grp">' + esc(r.grp) + '</div>';
      var v = app.overrides[r.key] != null ? app.overrides[r.key] : r.def, m = app.overrides[r.key] != null;
      var id = 'm-' + r.key.replace('.', '-');
      return '<label for="' + id + '">' + esc(r.label) + ' <span class="hint">(' + esc(r.unit) + ')</span></label>' +
        '<input id="' + id + '" type="number" step="any" min="' + r.min + '" max="' + r.max + '" value="' + v + '" data-key="' + r.key + '" data-def="' + r.def + '">' +
        '<span class="tag ' + (m ? 'm' : 'e') + '">' + (m ? 'measured' : 'estimate') + '</span>';
    }).join('');
  }
  $('measured').addEventListener('change', function (e) {
    var inp = e.target; if (!inp.dataset.key) return;
    var key = inp.dataset.key, v = Number(inp.value), def = Number(inp.dataset.def);
    if (inp.value === '' || isNaN(v) || v === def) delete app.overrides[key]; else app.overrides[key] = v;
    saveOverrides(app.overrides);
    var P = app.sim.P, val = app.overrides[key] != null ? app.overrides[key] : def;
    if (key.indexOf('.') > 0) { var parts = key.split('.'); P.items[parts[0]][parts[1]] = val; } else P[key] = val;
    app.sim.log((app.overrides[key] != null ? 'Measured value set: ' : 'Estimate restored: ') + key + ' = ' + val + '.', '', 'measured');
    renderMeasured(); syncSetupUI();
  });
  $('measuredReset').addEventListener('click', function () { app.overrides = {}; saveOverrides({}); app.resetSim(); renderMeasured(); syncSetupUI(); });

  /* ---------------- const lines (R-Q4) ---------------- */
  var lastConst = '';
  function renderConst() { if (!app.sim) return; var t = CB.constLines(app.sim); if (t !== lastConst) { $('constCode').textContent = t; lastConst = t; } }
  $('copyConst').addEventListener('click', function () {
    var text = $('constCode').textContent, msg = $('copyMsg');
    function fallback() { var r = document.createRange(); r.selectNodeContents($('constCode')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); msg.textContent = 'Selected. Press Ctrl+C (Cmd+C on Mac) to copy.'; }
    try { navigator.clipboard.writeText(text).then(function () { msg.textContent = 'Copied.'; }, fallback); } catch (e) { fallback(); }
  });

  /* ---------------- scenario runner (I5) ---------------- */
  var results = {};
  function renderTests() {
    var pass = 0, fail = 0, auto = 0;
    $('tests').innerHTML = CB.SCENARIOS.map(function (sc) {
      var r = results[sc.id], res;
      if (sc.auto) { auto++; if (r) { r.pass ? pass++ : fail++; } }
      if (!sc.auto) res = '<label class="check"><input type="checkbox" data-manual="' + sc.id + '"' + (results[sc.id] ? ' checked' : '') + '> manual</label>';
      else res = r ? '<span class="res ' + (r.pass ? 'pass' : 'fail') + '">' + (r.pass ? 'Pass' : 'Fail') + '</span><small>' + esc(r.detail) + '</small>' : '<span class="res manual">Not run</span>';
      return '<tr><td>' + sc.id + '</td><td>' + esc(sc.title) + '</td><td>' + res + '</td><td>' + (sc.auto ? '<button type="button" class="btn" data-run="' + sc.id + '">Run</button>' : '') + '</td></tr>';
    }).join('');
    $('testSummary').textContent = (pass + fail) ? pass + ' of ' + auto + ' automatic scenarios pass' + (fail ? ', ' + fail + ' fail' : '') + '.' : '';
  }
  function runOne(id) { var sc = CB.SCENARIOS.filter(function (s) { return s.id === id; })[0]; results[id] = CB.runScenario(PARTS, sc, { overrides: app.overrides }); }
  $('tests').addEventListener('click', function (e) { var id = e.target.dataset && e.target.dataset.run; if (id) { runOne(id); renderTests(); } });
  $('tests').addEventListener('change', function (e) { var id = e.target.dataset.manual; if (id) results[id] = e.target.checked; });
  $('runAll').addEventListener('click', function () {
    var list = CB.SCENARIOS.filter(function (s) { return s.auto; }), i = 0, btn = $('runAll');
    btn.disabled = true;
    (function next() {
      if (i >= list.length) { btn.disabled = false; renderTests(); return; }
      runOne(list[i++].id); renderTests(); setTimeout(next, 0);
    })();
  });

  /* ---------------- batch test (I7) ---------------- */
  var MODE_NAMES = { basic: '1 sensor', width: 'Width check', metal: 'Width + metal' };
  $('runBatch').addEventListener('click', function () {
    var n = Math.max(10, Math.min(500, parseInt($('batchN').value, 10) || 50)), btn = $('runBatch');
    btn.disabled = true; $('batchNote').textContent = 'Running…';
    setTimeout(function () {
      var res = CB.batch(PARTS, { seed: app.seed, n: n, overrides: app.overrides, config: { hold: app.cfg.hold } });
      $('batch').innerHTML = res.map(function (r) {
        return '<tr><td>' + MODE_NAMES[r.mode] + '</td><td class="n">' + r.tp + '</td><td class="n">' + r.tn + '</td><td class="n">' + r.fp + '</td><td class="n">' + r.fn + '</td><td class="n">' + Math.round(r.accuracy * 100) + '%</td></tr>';
      }).join('');
      $('batchNote').textContent = n + ' random items (seed ' + app.seed + ', hold ' + app.cfg.hold.toFixed(1) + ' s): bottles should be accepted; cans, glass, cartons and hands refused. Same seed gives the same table.';
      btn.disabled = false;
    }, 20);
  });

  /* ---------------- physics table ---------------- */
  (function () {
    var seen = {}, Z0 = 0.000415;
    $('phys').innerHTML = Object.keys(PARTS.items).map(function (id) { return PARTS.items[id]; }).filter(function (d) { if (seen[d.mat]) return false; seen[d.mat] = 1; return true; })
      .map(function (d) { var r = Math.pow((d.Z - Z0) / (d.Z + Z0), 2); return '<tr><td>' + esc(d.name.replace(', held still', '')) + '</td><td>' + esc(d.mat) + '</td><td class="n">' + d.Z + '</td><td class="n">' + (r * 100).toFixed(3) + '%</td></tr>'; }).join('');
  })();

  /* ---------------- live readouts ---------------- */
  (function buildSteps() {
    $('steps').innerHTML = CB.STEPS.map(function (s) { return '<li data-m="' + s.id + '"><span>' + esc(s.label) + (s.proposed ? '<em>proposed</em>' : '') + '</span><span class="tm"></span></li>'; }).join('') +
      '<li data-m="FULL"><span>Bin full: lid locked</span><span class="tm"></span></li>';
  })();
  function setText(id, t) { var e = $(id); if (e.textContent !== t) e.textContent = t; }
  function setClass(id, c) { var e = $(id); if (e.className !== c) e.className = c; }
  function renderGauges() {
    var sim = app.sim, S = sim.S, P = sim.P, cfg = sim.cfg;
    var busy = sim.busy() && S.mode !== 'FULL';
    Object.keys(itemBtns).forEach(function (id) { itemBtns[id].disabled = !!S.slot || busy; });
    setText('slotHint', S.slot ? S.slot.def.name + ' is at the slot.' : busy ? 'Machine is busy. Wait for Ready.' : 'Click an item, press 1–7, or drag it onto the machine.');
    $('manualBtn').disabled = S.mode !== 'READY' || !!S.slot;
    $('fuseBtn').hidden = !S.blown;
    $('estopBtn').setAttribute('aria-pressed', S.estop ? 'true' : 'false'); setText('estopBtn', S.estop ? 'Release E-stop' : 'E-stop');
    var cls = S.blown || S.estop || S.stall || S.mode === 'FULL' || (S.fault && S.resets) ? 'bad' : S.mode === 'READY' ? 'ok' : 'warn';
    setClass('statePill', 'pill ' + cls);
    setText('stateTxt', S.blown ? 'Fuse blown' : S.estop ? 'E-stop pressed' : app.paused ? 'Paused · ' + CB.STATE_NAMES[S.mode] : CB.STATE_NAMES[S.mode]);
    setText('clock', fmtT(S.t));
    document.querySelectorAll('#steps li').forEach(function (li) {
      var on = li.dataset.m === S.mode; if (li.classList.contains('on') !== on) li.classList.toggle('on', on);
      var st = CB.STEPS.filter(function (s) { return s.id === li.dataset.m; })[0], dur = st && st.dur ? st.dur(P) : null;
      var t = on && dur ? Math.max(0, dur - S.modeT).toFixed(1) + ' s' : dur ? dur.toFixed(dur < 2 ? 2 : 0) + ' s' : '';
      var tm = li.querySelector('.tm'); if (tm.textContent !== t) tm.textContent = t;
    });
    setText('gS1', S.s1 > 900 ? 'no echo' : S.s1.toFixed(1) + ' cm');
    setText('gEcho', S.s1 > 900 ? '0 µs (timeout)' : Math.round(S.s1 * P.us_per_cm) + ' µs');
    setText('gS2', cfg.detect === 'basic' ? 'not fitted' : S.s2.toFixed(1) + ' cm');
    setText('gW', cfg.detect === 'basic' ? 'not measured' : (S.w > 0.3 ? S.w.toFixed(1) + ' cm' : '0 (empty)'));
    setText('gM', cfg.detect === 'metal' ? (S.metal && S.slot ? 'METAL' : 'none') : 'not fitted');
    setText('gHits', S.hits + ' of ' + sim.hitsNeeded() + ' needed (' + sim.N() + ' readings)');
    var v = S.mode === 'READY' || S.mode === 'FULL' ? S.verdict : { text: 'Not checking: the machine is running a cycle.', cls: '' };
    setText('verdict', v.text); setClass('verdict', 'verdict ' + v.cls);
    var est = ['act_i_free', 'act_i_rated', 'act_i_stall', 'act_speed_loss'].some(function (k) { return app.overrides[k] != null; }) ? ' (measured)' : ' (estimate)';
    setText('gP', S.p.toFixed(0) + ' of ' + P.act_stroke + ' mm');
    setText('gV', S.v.toFixed(1) + ' mm/s');
    setText('gF', S.F.toFixed(0) + ' N' + (S.F ? ' (estimate)' : ''));
    setText('gI', S.I.toFixed(1) + ' A' + (S.I ? est : ''));
    setText('gPsu', Math.round(S.I / P.psu12_a * 100) + '% of ' + P.psu12_a + 'A');
    setText('gFuse', cfg.fuse + 'A · ' + (S.blown ? 'BLOWN' : S.heat > 0 ? 'heating' : 'OK'));
    $('bFuse').style.width = (S.heat * 100) + '%';
    var a = 'Idle.', ac = '';
    if (S.blown) { a = 'No power to the actuators. Replace the fuse.'; ac = 'bad'; }
    else if (S.estop && S.cmd) { a = 'E-stop is cutting the 12V. The Arduino timer keeps running.'; ac = 'bad'; }
    else if (S.cmd && (S.fault === 'F6' || S.fault === 'F1') && !S.faultHidden) { a = 'The driver gets the command but the actuators do not move.'; ac = 'bad'; }
    else if (S.stall) { a = 'Stalled at ' + S.F.toFixed(0) + ' N, drawing ' + S.I.toFixed(0) + 'A.'; ac = 'bad'; }
    else if (S.limit) a = 'Stopped by the built-in limit switch.';
    else if (S.dir === 1) { a = S.F > 0 ? 'Pressing at ' + S.F.toFixed(0) + ' N.' : 'Moving down, no load yet.'; ac = S.F > 0 ? 'warn' : ''; }
    else if (S.dir === -1) a = 'Moving up.';
    setText('actVerdict', a); setClass('actVerdict', 'verdict ' + ac);
    var rows = sim.pins().map(function (p) { return '<tr class="' + (p.on ? 'on' : '') + '" data-part="' + p.part + '"><td>' + p.pin + '</td><td>' + esc(p.label) + '</td><td>' + esc(p.val) + '</td></tr>'; }).join('');
    if ($('pins').innerHTML !== rows) $('pins').innerHTML = rows;
    setText('gPile', S.pileN + ' items · pile ' + (S.pile / 10).toFixed(1) + ' cm · fill sensor ' + S.fillCm.toFixed(1) + ' cm');
  }
  $('pins').addEventListener('click', function (e) { var tr = e.target.closest('tr'); if (tr) showCard(tr.dataset.part); });

  function renderLog() {
    var ev = app.sim.events, ul = $('log'), frag = document.createDocumentFragment(), added = false;
    for (var i = 0; i < ev.length; i++) {
      if (ev[i].id <= app.lastEvent) continue;
      var li = document.createElement('li'); if (ev[i].cls) li.className = ev[i].cls;
      li.innerHTML = '<time>' + fmtT(ev[i].t) + '</time><span></span>'; li.lastChild.textContent = ev[i].msg;
      frag.insertBefore(li, frag.firstChild); app.lastEvent = ev[i].id; added = true;
    }
    if (added) { ul.insertBefore(frag, ul.firstChild); while (ul.children.length > 120) ul.lastChild.remove(); }
  }

  /* ---------------- graph (two panels, one axis each) ---------------- */
  var graph = $('graph'), gctx = graph.getContext('2d'), GC = {}, hoverX = null, WIN = 70;
  function readGraphColors() { var cs = getComputedStyle(document.documentElement); ['--ink', '--muted', '--line', '--well', '--series', '--bad', '--warn', '--data', '--body'].forEach(function (n) { GC[n] = cs.getPropertyValue(n).trim(); }); }
  graph.addEventListener('pointermove', function (e) { var r = graph.getBoundingClientRect(); hoverX = e.clientX - r.left; });
  graph.addEventListener('pointerleave', function () { hoverX = null; });
  function drawGraph() {
    var r = graph.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1);
    if (graph.width !== Math.round(r.width * dpr)) { graph.width = Math.round(r.width * dpr); graph.height = Math.round(r.height * dpr); }
    var W = r.width, H = r.height; gctx.setTransform(dpr, 0, 0, dpr, 0, 0); gctx.clearRect(0, 0, W, H);
    var sim = app.sim, hist = sim.history, P = sim.P, cfg = sim.cfg, tNow = sim.S.t, t0 = Math.max(0, tNow - WIN);
    var L = 52, R = 12, top = 8, gap = 30, ph = (H - top - gap - 24) / 2;
    var font = '12px ' + (GC['--data'] || 'monospace');
    var X = function (t) { return L + (t - t0) / WIN * (W - L - R); };
    var pts = hist.filter(function (h) { return h.t >= t0; });
    var panels = [
      { y0: top, key: 'I', name: '12V current', unit: 'A', max: Math.max(cfg.fuse * 1.35, cfg.n * P.act_i_stall * 1.15), line: cfg.fuse, lineLabel: 'fuse ' + cfg.fuse + 'A', lineCol: GC['--bad'] },
      { y0: top + ph + gap, key: 'F', name: 'Crush force', unit: 'N', max: cfg.n * P.act_force * 1.45, line: cfg.n * P.act_force, lineLabel: 'rated ' + cfg.n * P.act_force + ' N', lineCol: GC['--muted'] }
    ];
    panels.forEach(function (pn) {
      var Y = function (v) { return pn.y0 + ph - Math.min(v, pn.max) / pn.max * ph; };
      // crush/retract phases, shaded
      gctx.fillStyle = GC['--well'];
      var run = null;
      pts.forEach(function (h, i) { var inPh = h.mode === 'EXTEND'; if (inPh && run == null) run = h.t; if ((!inPh || i === pts.length - 1) && run != null) { gctx.fillRect(X(run), pn.y0, X(h.t) - X(run), ph); run = null; } });
      // grid
      gctx.strokeStyle = GC['--line']; gctx.lineWidth = 1; gctx.font = font; gctx.fillStyle = GC['--muted']; gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
      [0, 0.5, 1].forEach(function (f) { var v = pn.max * f, y = Y(v); gctx.beginPath(); gctx.moveTo(L, y + 0.5); gctx.lineTo(W - R, y + 0.5); gctx.stroke(); gctx.fillText(v >= 100 ? Math.round(v) : v.toFixed(0), L - 6, y); });
      gctx.textAlign = 'left'; gctx.fillStyle = GC['--ink']; gctx.fillText(pn.name + ' (' + pn.unit + ')', L + 6, pn.y0 + 9);
      // threshold
      gctx.save(); gctx.setLineDash([6, 5]); gctx.strokeStyle = pn.lineCol; gctx.lineWidth = 1.5; var ly = Y(pn.line);
      gctx.beginPath(); gctx.moveTo(L, ly); gctx.lineTo(W - R, ly); gctx.stroke(); gctx.restore();
      gctx.fillStyle = GC['--ink']; gctx.textAlign = 'right'; gctx.fillText(pn.lineLabel, W - R - 4, ly - 9);
      // series
      gctx.strokeStyle = GC['--series']; gctx.lineWidth = 2; gctx.lineJoin = 'round'; gctx.beginPath();
      pts.forEach(function (h, i) { var x = X(h.t), y = Y(h[pn.key]); if (i) gctx.lineTo(x, y); else gctx.moveTo(x, y); }); gctx.stroke();
    });
    // markers: stall start and fuse blown (labelled, not colour alone)
    gctx.font = font; gctx.textAlign = 'left';
    pts.forEach(function (h, i) {
      var prev = pts[i - 1]; if (!prev) return;
      if (h.blown && !prev.blown) { var x = X(h.t); gctx.strokeStyle = GC['--bad']; gctx.lineWidth = 1.5; gctx.beginPath(); gctx.moveTo(x, top); gctx.lineTo(x, H - 24); gctx.stroke(); gctx.fillStyle = GC['--ink']; gctx.fillText('fuse blown', Math.min(x + 4, W - 80), top + ph + gap / 2); }
      if (h.stall && !prev.stall) { var xs = X(h.t), ys = top + ph - Math.min(h.I, panels[0].max) / panels[0].max * ph; gctx.fillStyle = GC['--bad']; gctx.beginPath(); gctx.arc(xs, ys, 4, 0, Math.PI * 2); gctx.fill(); gctx.fillStyle = GC['--ink']; gctx.fillText('stall', Math.min(xs + 6, W - 40), ys - 10); }
    });
    // time axis
    gctx.fillStyle = GC['--muted']; gctx.textAlign = 'center'; gctx.textBaseline = 'alphabetic';
    for (var s = Math.ceil(t0 / 10) * 10; s <= tNow; s += 10) gctx.fillText(fmtT(s), X(s), H - 6);
    // hover crosshair + readout
    if (hoverX != null && pts.length && hoverX > L) {
      var tt = t0 + (hoverX - L) / (W - L - R) * WIN, best = pts[0];
      pts.forEach(function (h) { if (Math.abs(h.t - tt) < Math.abs(best.t - tt)) best = h; });
      var hx = X(best.t); gctx.strokeStyle = GC['--ink']; gctx.lineWidth = 1; gctx.beginPath(); gctx.moveTo(hx, top); gctx.lineTo(hx, H - 24); gctx.stroke();
      var label = fmtT(best.t) + '  ' + best.I.toFixed(1) + ' A  ' + Math.round(best.F) + ' N  ' + (CB.STATE_NAMES[best.mode] || best.mode);
      gctx.font = font; var tw = gctx.measureText(label).width + 14, bx = Math.min(Math.max(hx + 8, L), W - R - tw);
      gctx.fillStyle = GC['--ink']; gctx.fillRect(bx, top + ph + 4, tw, 22); gctx.fillStyle = GC['--well']; gctx.textAlign = 'left'; gctx.textBaseline = 'middle'; gctx.fillText(label, bx + 7, top + ph + 15);
    }
  }

  /* ---------------- keyboard ---------------- */
  var keyItem = {}; Object.keys(PARTS.items).forEach(function (id) { keyItem[PARTS.items[id].key] = id; });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    var k = e.key;
    if (keyItem[k]) { insert(keyItem[k]); }
    else if (k === ' ') { if (tag === 'button' || tag === 'summary' || tag === 'a') return; e.preventDefault(); app.setPaused(!app.paused); }
    else if (k === 'n' || k === 'N') { CB.advanceStep(app.sim, 90); app.setPaused(true); }
    else if (k === 'e' || k === 'E') toggleEstop();
    else if (k === 'm' || k === 'M') app.sim.manualCrush();
    else if (k === 'r' || k === 'R') app.resetSim();
    else if (k === 'g' || k === 'G') app.setView('machine');
    else if (k === 'd' || k === 'D') app.setView('model');
    else if (k === 'w' || k === 'W') app.setView('wiring');
    else if (k === '?') { $('helpSheet').hidden = false; $('helpClose').focus(); }
    else if (k === 'Escape') { $('helpSheet').hidden = true; $('partCard').hidden = true; }
  });
  $('helpBtn').addEventListener('click', function () { $('helpSheet').hidden = false; $('helpClose').focus(); });
  $('helpClose').addEventListener('click', function () { $('helpSheet').hidden = true; });
  $('helpSheet').addEventListener('click', function (e) { if (e.target === $('helpSheet')) $('helpSheet').hidden = true; });

  /* ---------------- 2D canvas clicks ---------------- */
  $('cv2d').addEventListener('click', function (e) { var r = e.target.getBoundingClientRect(), id = view2d.partAt(e.clientX - r.left, e.clientY - r.top); if (id) showCard(id); });

  /* ---------------- theme + resize ---------------- */
  function themeChanged() { view2d.readColors(); readGraphColors(); view3d && view3d.readColors(); }
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged); } catch (e) { /* old browsers */ }
  new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', function () { view2d.resize(); view3d && view3d.resize(); });

  /* ---------------- main loop ---------------- */
  var demo = CB.Demo(app, { bar: $('demoBar'), title: $('demoTitle'), text: $('demoText'), count: $('demoCount'), back: $('demoBack'), next: $('demoNext'), exit: $('demoExit') });
  $('demoBtn').addEventListener('click', function () { demo.start(); });

  var last = performance.now(), uiAcc = 1;
  function frame(now) {
    var real = Math.min(0.25, (now - last) / 1000); last = now;
    if (!app.paused) {
      var simT = real * demo.speedFor(app.sim, app.speed);
      while (simT > 0) { var h = Math.min(0.01, simT); app.sim.step(h); simT -= h; }
    }
    if (app.view === 'machine') view2d.draw(app.sim);
    else if (app.view === 'model' && view3d) view3d.update(app.sim, real);
    uiAcc += real;
    if (uiAcc >= 0.08) {
      uiAcc = 0;
      if (app.view === 'wiring' && wiring) wiring.update(app.sim);
      renderGauges(); renderLog(); drawGraph();
      if (!$('constPanel').open) { /* const lines refresh only when visible */ } else renderConst();
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- start ---------------- */
  readGraphColors();
  app.resetSim();
  renderMeasured(); syncSetupUI(); renderTests();
  routeFromHash();
  // open on a realistic working state: a bottle at the slot
  setTimeout(function () { if (!app.sim.S.slot && app.sim.S.mode === 'READY' && !demo.active()) app.sim.insert('pet500'); }, 800);
  requestAnimationFrame(frame);
  root.APP = app;
})(window);
