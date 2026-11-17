/* Scenario runner (SPEC I5): the acceptance scenarios from SPEC.md.
   Automatic ones run on hidden copies of the simulation (never the one on screen).
   Also loaded by the Node test suite (tests/scenarios.test.js). */
(function (root) {
  'use strict';
  var CB = root.CB = root.CB || (typeof require !== 'undefined' ? require('./core.js') : {});

  /* advance until the program moves to its next step (I3) */
  CB.advanceStep = function (sim, maxSeconds) {
    var start = sim.S.mode, h = 0.01, n = Math.ceil((maxSeconds || 90) / h);
    for (var i = 0; i < n; i++) { sim.step(h); if (sim.S.mode !== start) return true; }
    return false;
  };

  function mk(parts, opts, cfg) { return CB.createSim(parts, { seed: (opts && opts.seed) || 1234, overrides: opts && opts.overrides, config: cfg || {} }); }
  function codes(sim) { return sim.events.map(function (e) { return e.code; }); }
  function has(sim, c) { return codes(sim).indexOf(c) >= 0; }
  function ok(pass, detail) { return { pass: !!pass, detail: detail }; }
  function untilCycle(s) { return s.S.cycles >= 1; }

  CB.SCENARIOS = [
    { id: 'S1', title: 'PET 500 mL, 1 sensor, 2 actuators, 15A fuse', auto: true, run: function (parts, o) {
      var s = mk(parts, o); s.insert('pet500'); s.run(100, untilCycle);
      return ok(has(s, 'accept') && has(s, 'stored') && !s.S.blown && s.S.peakI <= 12.01 && has(s, 'stallSolid'),
        'accepted ' + has(s, 'accept') + ', stored ' + has(s, 'stored') + ', fuse ' + (s.S.blown ? 'blown' : 'OK') + ', peak ' + s.S.peakI.toFixed(1) + 'A'); } },
    { id: 'S2', title: 'Held hand, 1 sensor: lid opens (false positive), empty crush reaches the limit switch', auto: true, run: function (parts, o) {
      var s = mk(parts, o), maxP = 0; s.insert('handHeld');
      s.run(100, function (x) { if (x.S.mode === 'EXTEND') maxP = Math.max(maxP, x.S.p); return x.S.cycles >= 1; });
      return ok(has(s, 'falsepos') && maxP >= s.P.act_stroke - 0.5, 'false positive ' + has(s, 'falsepos') + ', plate reached ' + maxP.toFixed(0) + ' mm'); } },
    { id: 'S3', title: 'Waved hand, 1 sensor, hold time 0.5 s: refused', auto: true, run: function (parts, o) {
      var s = mk(parts, o, { hold: 0.5 }); s.insert('handWave'); s.run(4, function (x) { return !x.S.slot; });
      return ok(has(s, 'refuse') && !has(s, 'falsepos'), has(s, 'refuse') ? 'refused' : 'lid opened'); } },
    { id: 'S4', title: 'Held hand, width check: refused', auto: true, run: function (parts, o) {
      var s = mk(parts, o, { detect: 'width' }); s.insert('handHeld'); s.run(5, function (x) { return !x.S.slot; });
      return ok(has(s, 'refuse'), has(s, 'refuse') ? 'refused' : 'accepted'); } },
    { id: 'S5', title: 'Aluminum can, width check: accepted (false positive)', auto: true, run: function (parts, o) {
      var s = mk(parts, o, { detect: 'width' }); s.insert('can'); s.run(5, function (x) { return x.S.accepted || !x.S.slot; });
      return ok(has(s, 'falsepos'), has(s, 'falsepos') ? 'false positive, as expected' : 'refused'); } },
    { id: 'S6', title: 'Aluminum can, width + metal: refused for metal', auto: true, run: function (parts, o) {
      var s = mk(parts, o, { detect: 'metal' }); s.insert('can'); s.run(5, function (x) { return !x.S.slot; });
      var e = s.events.filter(function (x) { return x.code === 'refuse'; })[0];
      return ok(e && /metal/i.test(e.msg), e ? e.msg : 'not refused'); } },
    { id: 'S7', title: 'PET 500 mL with 2 actuators and a 10A fuse: fuse blows', auto: true, run: function (parts, o) {
      var s = mk(parts, o, { fuse: 10 }); s.insert('pet500'); s.run(100, untilCycle);
      return ok(s.S.blown, s.S.blown ? 'fuse blew at ' + s.S.peakI.toFixed(0) + 'A' : 'fuse held'); } },
    { id: 'S8', title: 'Glass bottle: stall, falls uncrushed, logged as wrong material', auto: true, run: function (parts, o) {
      var s = mk(parts, o); s.insert('glass'); s.run(100, untilCycle);
      return ok(has(s, 'stall') && has(s, 'storedWhole') && has(s, 'falsepos'), codes(s).filter(function (c) { return /stall|stored|falsepos/.test(c); }).join(', ')); } },
    { id: 'S9', title: 'Storage near full: one more crush locks the lid', auto: true, run: function (parts, o) {
      var s = mk(parts, o); s.S.pile = s.P.storage_h - s.P.FULL_CM * 10 - 10; s.insert('pet500'); s.run(100, untilCycle); s.run(3);
      var locked = s.S.mode === 'FULL' && s.S.leds.r; s.insert('pet500'); s.run(5);
      return ok(locked && has(s, 'full') && !s.events.slice(-3).some(function (e) { return e.code === 'accept'; }), 'mode ' + s.S.mode + ', red LED ' + !!s.S.leds.r); } },
    { id: 'S10', title: 'E-stop for 5 s during a crush: plate stops, timer keeps going, plate resumes', auto: true, run: function (parts, o) {
      var s = mk(parts, o); s.insert('pet500'); s.run(60, function (x) { return x.S.mode === 'EXTEND' && x.S.p > 20; });
      var p0 = s.S.p, m0 = s.S.modeT; s.setEstop(true); s.run(5); var p1 = s.S.p, m1 = s.S.modeT; s.setEstop(false); s.run(1);
      return ok(Math.abs(p1 - p0) < 0.01 && m1 - m0 > 4.9 && s.S.p > p1, 'plate ' + p0.toFixed(1) + '→' + p1.toFixed(1) + '→' + s.S.p.toFixed(1) + ' mm, timer +' + (m1 - m0).toFixed(1) + ' s'); } },
    { id: 'S11', title: 'Width check: PET 500 mL accepted at least 9 of 10 times', auto: true, run: function (parts, o) {
      var n = 0; for (var i = 0; i < 10; i++) { var s = CB.createSim(parts, { seed: 500 + i, overrides: o && o.overrides, config: { detect: 'width' } }); s.insert('pet500'); s.run(5, function (x) { return x.S.accepted || !x.S.slot; }); if (s.S.accepted) n++; }
      return ok(n >= 9, n + ' of 10 accepted'); } },
    { id: 'S12', title: 'Measured stall current 10A, 2 actuators, 15A fuse: fuse blows', auto: true, run: function (parts) {
      var s = CB.createSim(parts, { seed: 1234, overrides: { act_i_stall: 10 } }); s.insert('pet500'); s.run(100, untilCycle);
      return ok(s.S.blown, s.S.blown ? 'fuse blew (20A > 15A)' : 'fuse held'); } },
    { id: 'S13', title: 'Hold time 1.0 s prints SAMPLE_COUNT = 25 (Copy button: check by hand)', auto: true, run: function (parts, o) {
      var s = mk(parts, o, { hold: 1.0 }); var txt = CB.constLines(s);
      return ok(/SAMPLE_COUNT = 25;/.test(txt), (txt.match(/SAMPLE_COUNT = \d+/) || ['missing'])[0]); } },
    { id: 'S14', title: 'Wiring view during a crush: D5 = 255, motor wires show live current', auto: false },
    { id: 'S15', title: 'Wiring view: E-stop turns the wires after it dead', auto: false },
    { id: 'S16', title: 'Wiring view: 10A fuse heats, then blows; 12V wires after it go dead', auto: false },
    { id: 'S17', title: 'Wiring view: tap BTS7960 → card with role, 43A, pins', auto: false },
    { id: 'S18', title: 'Switch views mid-crush: nothing resets', auto: false },
    { id: 'S19', title: 'Unzipped download, offline, double-click index.html: all views work', auto: false },
    { id: 'S20', title: 'GitHub Pages URL and #wiring link both work', auto: false },
    { id: 'S21', title: 'Actuator wires reversed: plate rises on crush, sinks on retract, ends down', auto: true, run: function (parts, o) {
      var s = mk(parts, o); s.setFault('F3'); s.insert('pet500'); var downDuringExtend = 0;
      s.run(100, function (x) { if (x.S.mode === 'EXTEND') downDuringExtend = Math.max(downDuringExtend, x.S.p); return x.S.cycles >= 1; });
      return ok(downDuringExtend < 0.5 && s.S.p > 50, 'max during crush ' + downDuringExtend.toFixed(0) + ' mm, end ' + s.S.p.toFixed(0) + ' mm'); } },
    { id: 'S22', title: 'Servo on Arduino 5V: Arduino restarts when the lid opens', auto: true, run: function (parts, o) {
      var s = mk(parts, o); s.setFault('F5'); s.insert('pet500'); s.run(10);
      return ok(s.S.resets >= 1 && has(s, 'reset'), s.S.resets + ' restart(s), mode ' + s.S.mode); } },
    { id: 'S23', title: 'Mystery fault: wrong guess, reveal shows answer and faulty wire', auto: false },
    { id: 'S24', title: 'Graph data: current crosses the 10A line, then the fuse blows', auto: true, run: function (parts, o) {
      var s = mk(parts, o, { fuse: 10 }); s.insert('pet500'); s.run(100, untilCycle);
      var over = s.history.some(function (h) { return h.I > 10; }), blown = s.history.some(function (h) { return h.blown; });
      return ok(over && blown, 'over 10A ' + over + ', blown ' + blown); } },
    { id: 'S25', title: 'Next step from Ready with a bottle: stops exactly at Open lid', auto: true, run: function (parts, o) {
      var s = mk(parts, o); s.insert('pet500'); CB.advanceStep(s, 10);
      return ok(s.S.mode === 'OPENING', 'stopped at ' + s.S.mode); } },
    { id: 'S26', title: 'Guided demo: all five parts behave as described; settings restored', auto: false },
    { id: 'S27', title: 'Batch test, seed 1234, 50 items: identical twice; mode C refuses all cans', auto: true, run: function (parts, o) {
      var a = CB.batch(parts, { seed: 1234, n: 50, overrides: o && o.overrides }), b = CB.batch(parts, { seed: 1234, n: 50, overrides: o && o.overrides });
      var same = JSON.stringify(a) === JSON.stringify(b);
      var canFp = a[2].rows.filter(function (r) { return r.id === 'can' && r.accepted; }).length;
      var handFpA = a[0].rows.filter(function (r) { return /^hand/.test(r.id) && r.accepted; }).length;
      return ok(same && canFp === 0 && handFpA > 0, 'identical ' + same + ', mode A hand false positives ' + handFpA + ', mode C cans accepted ' + canFp); } },
    { id: 'S28', title: 'Drag a can onto the machine; press E toggles E-stop', auto: false },
    { id: 'S29', title: '3D: lid, rods, plate, bottle and trapdoor move with the simulation', auto: false },
    { id: 'S30', title: '3D: orbit, zoom, Inside camera, tap actuator opens its card', auto: false },
    { id: 'S31', title: 'Change chamber height to 25 cm, rerun make_bin.py: all views use 25 cm', auto: false },
    { id: 'S32', title: 'WebGL off: 3D tab shows a message; other views fine', auto: false },
    { id: 'S33', title: '3D runs at 30 fps or better on a school laptop', auto: false }
  ];

  CB.runScenario = function (parts, sc, opts) {
    try { return sc.run(parts, opts || {}); }
    catch (e) { return { pass: false, detail: 'error: ' + e.message }; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CB;
})(typeof window !== 'undefined' ? window : globalThis);
