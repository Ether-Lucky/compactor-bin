/* Guided demo (SPEC I6): a five-part story on the live simulation for the panel. */
(function (root) {
  'use strict';
  var CB = root.CB = root.CB || {};

  var CHAPTERS = [
    { title: 'A normal cycle', cfg: { detect: 'basic' }, item: 'pet500',
      text: 'A 500 mL bottle is held at the slot. The sensor sees it for 0.2 s, the servo opens the lid, the bottle drops, and both actuators crush it. At the end they stall against the flat bottle until the 31 s timer runs out.' },
    { title: 'A hand fools one sensor', cfg: { detect: 'basic' }, item: 'handHeld',
      text: 'The single sensor only measures distance. A hand held still is just as close as a bottle, so the lid opens and the machine runs an empty crush. That is a false positive.' },
    { title: 'Measuring width fixes it', cfg: { detect: 'width' }, item: 'handHeld',
      text: 'With a second sensor facing the first, the Arduino can measure width. A hand is too wide and never holds a steady width, so it is refused.' },
    { title: 'Cans need a metal sensor', cfg: { detect: 'metal' }, item: 'can',
      text: 'A can is bottle-sized, so the width check alone would accept it. An inductive sensor only reacts to metal, so the can is refused.' },
    { title: 'Glass is the limit of sound', cfg: { detect: 'metal' }, item: 'glass',
      text: 'Over 99.9% of the sound bounces off glass, plastic and skin alike, so no echo can tell them apart. The glass is accepted, will not crush at 3000 N, and the actuators stall.' }
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
      speedFor: function (sim, base) { if (!active) return base; return /^(EXTEND|RETRACT|PAUSE|BOOT|TRAPDOOR)$/.test(sim.S.mode) && !sim.S.stall ? 10 : base; }
    };
  };
})(window);
