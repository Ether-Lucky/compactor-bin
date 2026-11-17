/* Guided demo (SPEC I6): a five-part story on the live simulation for the panel. */
(function (root) {
  'use strict';
  var CB = root.CB = root.CB || {};

  var CHAPTERS = [
    { title: 'Bottles pile up, then get pressed together', cfg: { detect: 'basic' }, item: 'pet500', fill: true,
      text: 'Each bottle is checked at the slot, the lid opens, and it drops onto the pile. Nothing is crushed yet. This bottle brings the pile up to the crush line, 12 cm under the fill sensor, so both actuators press the whole pile at once. Afterwards the fill sensor checks again: still closer than 15 cm means the bin is full.' },
    { title: 'A hand fools one sensor', cfg: { detect: 'basic' }, item: 'handHeld',
      text: 'The slot sensor only measures distance. A hand held still is just as close as a bottle, so the lid opens for nothing. That is a false positive.' },
    { title: 'Measuring width fixes it', cfg: { detect: 'width' }, item: 'handHeld',
      text: 'With a second sensor facing the first, the Arduino can measure width. A hand is too wide and never holds a steady width, so it is refused.' },
    { title: 'Cans need a metal sensor', cfg: { detect: 'metal' }, item: 'can',
      text: 'A can is bottle-sized, so the width check alone would accept it. An inductive sensor only reacts to metal, so the can is refused.' },
    { title: 'Glass is the limit of sound', cfg: { detect: 'metal' }, item: 'glass', fill: true,
      text: 'Over 99.9% of the sound bounces off glass, plastic and skin alike, so no echo can tell them apart. The glass is accepted and lands on top of the pile. When the pile is pressed, the plate pushes on the glass, which will not flatten at 3000 N, and the actuators stall.' }
  ];

  CB.Demo = function (app, ui) {
    var idx = -1, saved = null, active = false;

    function show() {
      var c = CHAPTERS[idx];
      ui.title.textContent = c.title; ui.text.textContent = c.text;
      ui.count.textContent = (idx + 1) + ' / ' + CHAPTERS.length;
      ui.back.disabled = idx === 0;
      ui.next.textContent = idx === CHAPTERS.length - 1 ? 'Finish' : 'Next';
      app.applyConfig(Object.assign({ n: 2, fuse: 15, hold: 0.2 }, c.cfg));
      app.resetSim(true);
      if (c.fill) app.sim.fillTo(app.sim.P.BUNDLE_CM);
      setTimeout(function () { if (active && app.sim) app.sim.insert(c.item); }, 700);
    }
    function start() {
      if (active) return;
      active = true; idx = 0;
      saved = { cfg: Object.assign({}, app.cfg), speed: app.speed, view: app.view, paused: app.paused };
      app.setPaused(false); app.setSpeed(4); app.setView('machine');
      ui.bar.hidden = false; show(); ui.next.focus();
    }
    function exit() {
      if (!active) return;
      active = false; ui.bar.hidden = true;
      app.applyConfig(saved.cfg); app.setSpeed(saved.speed); app.resetSim(); app.setView(saved.view); app.setPaused(saved.paused);
    }
    ui.next.addEventListener('click', function () { if (idx < CHAPTERS.length - 1) { idx++; show(); } else exit(); });
    ui.back.addEventListener('click', function () { if (idx > 0) { idx--; show(); } });
    ui.exit.addEventListener('click', exit);

    return {
      start: start, exit: exit,
      active: function () { return active; },
      // fast-forward the long, uneventful parts so the demo stays under two minutes
      speedFor: function (sim, base) { if (!active) return base; return /^(EXTEND|RETRACT|PAUSE|BOOT|CHECK)$/.test(sim.S.mode) && !sim.S.stall ? 10 : base; }
    };
  };
})(window);
