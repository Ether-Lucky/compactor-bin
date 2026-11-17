/* Wiring view (SPEC 6.2): every part and wire, live from the simulation. */
(function (root) {
  'use strict';
  var CB = root.CB = root.CB || {};
  var NS = 'http://www.w3.org/2000/svg';

  // [x, y, w, h, title]
  var NODES = {
    outlet:   [20, 40, 130, 56, 'Wall outlet'],
    psu12:    [200, 20, 180, 56, '12V 15A supply'],
    psu5:     [200, 130, 180, 56, '5V 5A supply'],
    fuse:     [440, 20, 110, 56, 'Fuse'],
    estop:    [590, 20, 120, 56, 'E-stop'],
    terminal: [750, 20, 150, 56, 'Terminal block'],
    bts:      [960, 14, 210, 70, 'BTS7960 driver'],
    actuator: [960, 170, 210, 64, 'Actuators ×2'],
    buck:     [750, 240, 150, 56, 'Buck 12V→5V'],
    servo:    [200, 300, 180, 56, 'MG996R lid servo'],
    arduino:  [480, 360, 260, 200, 'Arduino UNO'],
    slot1:    [20, 400, 200, 46, 'Slot sensor S1'],
    slot2:    [20, 456, 200, 46, 'Slot sensor S2'],
    metal:    [20, 512, 200, 46, 'Metal sensor'],
    fill:     [20, 586, 200, 46, 'Fill sensor'],
    leds:     [440, 616, 140, 50, 'Status LEDs'],
    buzzer:   [600, 616, 120, 50, 'Buzzer'],
    button:   [740, 616, 150, 50, 'Manual button']
  };

  // id: [kind, path, endpoint parts, wire type label, segment]
  var WIRES = {
    ac1:      ['ac',  'M150 68 H175 V48 H200', ['outlet', 'psu12'], '220V cord', 'ac'],
    ac2:      ['ac',  'M175 68 V158 H200', ['outlet', 'psu5'], '220V cord', 'ac'],
    v12a:     ['w12', 'M380 48 H440', ['psu12', 'fuse'], '16 AWG', 'a'],
    v12b:     ['w12', 'M550 48 H590', ['fuse', 'estop'], '16 AWG', 'b'],
    v12c:     ['w12', 'M710 48 H750', ['estop', 'terminal'], '16 AWG', 'c'],
    v12d:     ['w12', 'M900 48 H960', ['terminal', 'bts'], '16 AWG', 'c'],
    motA:     ['w12', 'M1040 84 V170', ['bts', 'actuator'], '16 AWG', 'motor'],
    motB:     ['gnd', 'M1090 84 V170', ['bts', 'actuator'], '16 AWG', 'motor'],
    buckIn:   ['w12', 'M825 76 V240', ['terminal', 'buck'], '18 AWG', 'c'],
    buckUsb:  ['w5',  'M825 296 V430 H740', ['buck', 'arduino'], 'USB (backup)', 'alt'],
    v5servo:  ['w5',  'M290 186 V300', ['psu5', 'servo'], '22 AWG', 'v5'],
    v5ard:    ['w5',  'M380 158 H600 V360', ['psu5', 'arduino'], '22 AWG', 'v5'],
    sServo:   ['sig', 'M480 382 H420 V328 H380', ['arduino', 'servo'], 'jumper', 'sig'],
    sBts:     ['sig', 'M720 360 V120 H1000 V84', ['arduino', 'bts'], 'jumper', 'sig'],
    sSlot1:   ['sig', 'M220 423 H480', ['slot1', 'arduino'], 'jumper', 'sig'],
    sSlot2:   ['sig', 'M220 479 H480', ['slot2', 'arduino'], 'jumper', 'new'],
    sMetal:   ['sig', 'M220 535 H480', ['metal', 'arduino'], 'jumper', 'new'],
    sFill:    ['sig', 'M220 609 H455 V505 H480', ['fill', 'arduino'], 'jumper', 'sig'],
    sLeds:    ['sig', 'M510 560 V616', ['arduino', 'leds'], 'jumper', 'sig'],
    sBuzz:    ['sig', 'M660 560 V616', ['arduino', 'buzzer'], 'jumper', 'sig'],
    sBtn:     ['sig', 'M720 560 V590 H815 V616', ['arduino', 'button'], 'jumper', 'sig'],
    gnd:      ['gnd', 'M200 66 H185 V690 H1185 V60 H1170 M200 176 H185 M500 560 V690', ['psu12', 'psu5', 'arduino', 'bts'], 'common ground', 'gnd']
  };
  var F5_SERVO = 'M480 540 H440 V356 H380';

  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  CB.Wiring = function (svg, onPart) {
    var refs = { nodes: {}, subs: {}, wires: {}, pinText: {} }, highlighted = null;
    svg.setAttribute('viewBox', '0 0 1200 710');
    var gW = el('g', { 'class': 'wires' }, svg), gN = el('g', { 'class': 'nodes' }, svg), gL = el('g', { 'class': 'wlabels' }, svg);

    Object.keys(WIRES).forEach(function (id) {
      var w = WIRES[id];
      var hitPath = el('path', { d: w[1], 'class': 'whit', 'data-wire': id }, gW);
      var p = el('path', { d: w[1], 'class': 'w ' + w[0], 'data-wire': id }, gW);
      refs.wires[id] = { path: p, hit: hitPath, def: w };
      hitPath.addEventListener('click', function () { highlight(id); });
      p.addEventListener('click', function () { highlight(id); });
    });
    refs.cross = el('path', { d: 'M1030 110 L1100 150 M1100 110 L1030 150', 'class': 'faultmark', visibility: 'hidden' }, gW);

    Object.keys(NODES).forEach(function (id) {
      var n = NODES[id], g = el('g', { 'class': 'wn', 'data-part': id, tabindex: 0, role: 'button', 'aria-label': n[4] }, gN);
      el('rect', { x: n[0], y: n[1], width: n[2], height: n[3], rx: 8 }, g);
      var t = el('text', { x: n[0] + 12, y: n[1] + 22, 'class': 'nt' }, g); t.textContent = n[4];
      var s = el('text', { x: n[0] + 12, y: n[1] + 42, 'class': 'ns' }, g);
      refs.nodes[id] = g; refs.subs[id] = s;
      g.addEventListener('click', function () { onPart && onPart(id); });
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPart && onPart(id); } });
    });

    // Arduino pin list inside its box
    var ard = NODES.arduino, pinRows = ['D2/D3', 'D4/D7', 'D5', 'D6', 'D8', 'D9', 'D12', 'A0', 'A1', 'A2', 'A3'];
    pinRows.forEach(function (pin, i) {
      var y = ard[1] + 62 + i * 12.5;
      var a = el('text', { x: ard[0] + 12, y: y, 'class': 'pin' }, refs.nodes.arduino);
      refs.pinText[pin] = a;
    });

    // wire type labels
    [['220V cord', 120, 120], ['16 AWG', 1100, 130], ['22 AWG +5V', 392, 150], ['jumper wires (signal)', 232, 392], ['common ground', 900, 704]]
      .forEach(function (l) { var t = el('text', { x: l[1], y: l[2], 'class': 'wl' }, gL); t.textContent = l[0]; });
    refs.motorI = el('text', { x: 1108, y: 150, 'class': 'amps' }, gL);
    refs.f5label = el('text', { x: 300, y: 560, 'class': 'flabel', visibility: 'hidden' }, gL); refs.f5label.textContent = 'servo powered from Arduino 5V';
    refs.f3label = el('text', { x: 1108, y: 104, 'class': 'flabel', visibility: 'hidden' }, gL); refs.f3label.textContent = 'swapped';

    function highlight(id) {
      if (highlighted) { refs.wires[highlighted].path.classList.remove('hl'); WIRES[highlighted][2].forEach(function (p) { refs.nodes[p].classList.remove('hl'); }); }
      if (highlighted === id) { highlighted = null; return; }
      highlighted = id; refs.wires[id].path.classList.add('hl');
      WIRES[id][2].forEach(function (p) { refs.nodes[p].classList.add('hl'); });
    }

    function setWire(id, state, extra) {
      var r = refs.wires[id], c = 'w ' + r.def[0] + ' ' + state + (extra ? ' ' + extra : '') + (highlighted === id ? ' hl' : '');
      if (r.path.getAttribute('class') !== c) r.path.setAttribute('class', c);
    }
    function sub(id, text, cls) { var s = refs.subs[id]; if (s.textContent !== text) s.textContent = text; var c = 'ns' + (cls ? ' ' + cls : ''); if (s.getAttribute('class') !== c) s.setAttribute('class', c); }

    function update(sim) {
      var S = sim.S, P = sim.P, cfg = sim.cfg;
      var shown = S.fault && !S.faultHidden ? S.fault : null;
      var a = true, b = !S.blown, c = b && !S.estop;
      var driverOk = S.fault !== 'F6' && S.fault !== 'F1';
      setWire('ac1', 'live'); setWire('ac2', 'live');
      setWire('v12a', 'live', S.I > 0 ? 'hot' : '');
      setWire('v12b', b ? 'live' : 'dead', b && S.I > 0 ? 'hot' : '');
      setWire('v12c', c ? 'live' : 'dead', c && S.I > 0 ? 'hot' : '');
      setWire('v12d', c ? 'live' : 'dead', c && S.I > 0 ? 'hot' : '');
      setWire('buckIn', c ? 'live' : 'dead');
      setWire('buckUsb', 'alt');
      var mot = c && driverOk && S.I > 0;
      setWire('motA', c ? (mot ? 'live' : 'idle') : 'dead', mot ? 'hot' : '');
      setWire('motB', c ? (mot ? 'live' : 'idle') : 'dead', mot ? 'hot' : '');
      setWire('v5servo', 'live'); setWire('v5ard', 'live');
      refs.wires.v5servo.path.setAttribute('d', shown === 'F5' ? F5_SERVO : WIRES.v5servo[1]);
      refs.wires.v5servo.hit.setAttribute('d', shown === 'F5' ? F5_SERVO : WIRES.v5servo[1]);
      refs.f5label.setAttribute('visibility', shown === 'F5' ? 'visible' : 'hidden');
      setWire('v5servo', 'live', shown === 'F5' ? 'fault' : '');
      setWire('sServo', S.servoT > 1 ? 'on' : 'off', shown === 'F4' ? 'fault' : '');
      setWire('sBts', S.cmd !== 0 ? 'on' : 'off', shown === 'F6' ? 'fault' : '');
      setWire('sSlot1', S.s1 < P.DETECT_CM ? 'on' : 'off', shown === 'F2' ? 'fault cut' : '');
      setWire('sSlot2', cfg.detect === 'basic' ? 'unused' : (S.s2 < P.DETECT_CM ? 'on' : 'off'));
      setWire('sMetal', cfg.detect === 'metal' ? (S.metal && S.slot ? 'on' : 'off') : 'unused');
      setWire('sFill', S.fillCm < P.FULL_CM ? 'on' : 'off');
      setWire('sLeds', 'on'); setWire('sBuzz', sim.buzzer() ? 'on' : 'off'); setWire('sBtn', S.manual ? 'on' : 'off');
      setWire('gnd', 'live', shown === 'F1' ? 'fault cut' : '');
      refs.cross.setAttribute('visibility', shown === 'F3' ? 'visible' : 'hidden');
      refs.f3label.setAttribute('visibility', shown === 'F3' ? 'visible' : 'hidden');

      var heatPct = Math.round(S.heat * 100);
      sub('outlet', '220V AC');
      sub('psu12', 'load ' + S.I.toFixed(1) + ' / ' + P.psu12_a + 'A');
      sub('psu5', '5V on');
      sub('fuse', S.blown ? cfg.fuse + 'A · BLOWN' : cfg.fuse + 'A · ' + (heatPct > 0 ? 'heating ' + heatPct + '%' : 'OK'), S.blown ? 'bad' : heatPct > 0 ? 'warn' : '');
      sub('estop', S.estop ? 'OPEN · 12V cut' : 'closed', S.estop ? 'bad' : '');
      sub('terminal', c ? '12V bus live' : '12V bus dead', c ? '' : 'bad');
      sub('bts', S.cmd === 1 ? 'RPWM 255 → down' : S.cmd === -1 ? 'LPWM 255 → up' : 'idle', shown === 'F6' ? 'bad' : '');
      var act = !c ? 'no power' : !driverOk ? 'not moving' : S.stall ? 'STALLED' : S.dir === 1 ? 'extending' : S.dir === -1 ? 'retracting' : S.limit ? 'at limit switch' : 'stopped';
      sub('actuator', act + ' · ' + S.p.toFixed(0) + ' mm', S.stall || !c ? 'bad' : '');
      refs.motorI.textContent = S.I > 0 ? S.I.toFixed(1) + ' A' : '';
      sub('buck', 'backup, not used');
      sub('servo', Math.round(S.servo) + '°' + (shown === 'F4' ? ' · signal on D10' : ''), shown === 'F4' || shown === 'F5' ? 'bad' : '');
      sub('arduino', S.mode === 'BOOT' ? 'restarting' : CB.STATE_NAMES[S.mode]);
      sub('slot1', S.s1 > 900 ? 'no echo' : S.s1.toFixed(1) + ' cm', shown === 'F2' ? 'bad' : '');
      sub('slot2', cfg.detect === 'basic' ? 'not fitted' : S.s2.toFixed(1) + ' cm · needs new code');
      sub('metal', cfg.detect === 'metal' ? (S.metal && S.slot ? 'METAL' : 'none') + ' · needs new code' : 'not fitted');
      sub('fill', shown === 'F7' ? 'BLOCKED · reads 3 cm' : S.fillCm.toFixed(1) + ' cm', shown === 'F7' ? 'bad' : '');
      sub('leds', (S.leds.g ? 'green ' : '') + (S.leds.y ? 'yellow ' : '') + (S.leds.r ? 'red' : ''));
      sub('buzzer', sim.buzzer() ? 'beeping' : 'quiet');
      sub('button', S.manual ? 'pressed' : 'released');
      ['slot2', 'metal'].forEach(function (id) { refs.nodes[id].classList.toggle('unused', id === 'slot2' ? cfg.detect === 'basic' : cfg.detect !== 'metal'); });
      sim.pins().forEach(function (p) {
        var key = p.pin.indexOf('D9') === 0 || p.pin.indexOf('D10') === 0 ? 'D9' : p.pin;
        var t = refs.pinText[key]; if (!t) return;
        var s = p.pin + '  ' + p.label + ': ' + p.val;
        if (t.textContent !== s) t.textContent = s;
        t.setAttribute('class', 'pin' + (p.on ? ' on' : ''));
      });
    }

    return { update: update, highlight: highlight };
  };

  CB.WIRE_LEGEND = [['ac', '220V cord'], ['w12', '+12V, 16 AWG'], ['w5', '+5V, 22 AWG'], ['gnd', 'Ground'], ['sig', 'Signal, jumper wire'], ['dead', 'No power']];
})(window);
