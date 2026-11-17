/* 2D side cross-section. Reads the simulation; never changes it.
   Drawn in millimetres from data/parts.js geometry, then scaled to fit. */
(function (root) {
  'use strict';
  var CB = root.CB = root.CB || {};

  CB.View2D = function (canvas) {
    var ctx = canvas.getContext('2d');
    var C = {}, W = 0, H = 0, k = 1, ox = 0, oy = 0, hits = [];

    function readColors() {
      var cs = getComputedStyle(document.documentElement);
      ['--ink', '--muted', '--line', '--well', '--surface', '--accent', '--sig', '--ok', '--warn', '--bad', '--ply', '--pvc', '--steel', '--pet', '--can', '--glass', '--carton', '--hand', '--data']
        .forEach(function (n) { C[n] = cs.getPropertyValue(n).trim(); });
    }
    function resize() {
      var r = canvas.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // mm -> px
    function X(mm) { return ox + mm * k; }
    function Y(mm) { return oy + mm * k; }
    function L(mm) { return mm * k; }
    function rect(x, y, w, h) { ctx.beginPath(); ctx.rect(X(x), Y(y), L(w), L(h)); }
    function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(X(x), Y(y), L(w), L(h), Math.min(L(r), L(h) / 2, L(w) / 2)); else ctx.rect(X(x), Y(y), L(w), L(h)); }
    function text(t, x, y, col, align, size, weight) {
      ctx.fillStyle = col || C['--muted']; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
      ctx.font = (weight || 500) + ' ' + (size || 12) + 'px ' + (C['--data'] || 'monospace');
      ctx.fillText(t, x, y);
    }
    function hit(id, x, y, w, h) { hits.push({ id: id, x: X(x), y: Y(y), w: L(w), h: L(h) }); }

    function drawItem(d, cx, cy, len, dia, alpha) {
      var col = C['--' + d.color] || C['--pet'];
      ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.fillStyle = col; ctx.strokeStyle = C['--ink']; ctx.lineWidth = 1;
      var x = cx - len / 2, y = cy - dia / 2;
      if (d.shape === 'bottle') {
        var body = len * 0.78, neck = len - body, nh = Math.max(dia * 0.4, 6);
        rr(x + neck, y, body, dia, Math.min(25, dia / 2));
        ctx.globalAlpha = (alpha == null ? 1 : alpha) * (d.mat === 'Glass' ? 0.85 : 0.6); ctx.fill(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.stroke();
        rr(x, cy - nh / 2, neck + 4, nh, 4); ctx.fill(); ctx.stroke();
      } else if (d.shape === 'can') {
        rr(x, y, len, dia, 6); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(X(x + 8), Y(y)); ctx.lineTo(X(x + 8), Y(y + dia)); ctx.moveTo(X(x + len - 8), Y(y)); ctx.lineTo(X(x + len - 8), Y(y + dia)); ctx.stroke();
      } else if (d.shape === 'box') {
        rr(x, y, len, dia, 3); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.ellipse(X(cx - len * 0.15), Y(cy), L(len * 0.35), L(dia / 2), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (var i = 0; i < 4; i++) { rr(cx + len * 0.12, cy - dia * 0.33 + i * dia * 0.22 - 7, len * 0.3, 14, 7); ctx.fill(); ctx.stroke(); }
      }
      ctx.restore();
    }

    function draw(sim) {
      if (!W) resize();
      var P = sim.P, S = sim.S, cfg = sim.cfg;
      var t = P.wall, D = P.inner_d, H1 = P.housing_h, H2 = H1 + P.chamber_h, H3 = H2, H4 = H2 + P.base_h;
      var tube = P.slot_len, slot = P.slot_w, rec = P.sensor_recess;
      // layout: slot tube on the left (front), labels on the right
      var labelPx = W < 520 ? 96 : 150, mmW = tube + t + D + t + 60, mmH = H4 + 70;
      k = Math.min((W - labelPx) / mmW, H / mmH);
      ox = (W - labelPx - mmW * k) / 2 + (tube + t + 60) * k; oy = (H - mmH * k) / 2 + 40 * k;
      hits = [];
      ctx.clearRect(0, 0, W, H);
      var ink = C['--ink'], muted = C['--muted'];

      // walls (plywood) and section fill
      ctx.fillStyle = C['--well']; rect(0, 0, D, H4); ctx.fill();
      ctx.fillStyle = C['--ply'];
      rect(-t, -t, D + 2 * t, t); ctx.fill();                       // top
      rect(D, -t, t, H4 + t); ctx.fill();                           // back wall
      var tTop = H1 + P.slot_top, tBot = tTop + slot, zc = tTop + slot / 2;
      rect(-t, -t, t, tTop + t); ctx.fill();                        // front wall above slot
      rect(-t, tBot, t, H2 - tBot); ctx.fill();                     // front wall below slot (bin door)
      rect(-t, H3, t, P.base_h); ctx.fill();                        // front of base
      ctx.fillStyle = C['--pvc']; rect(0, H1 - 6, D, 6); ctx.fill(); // housing floor (PVC board)
      ctx.strokeStyle = ink; ctx.lineWidth = 1; rect(0, H1 - 6, D, 6); ctx.stroke();

      // bin door (lower front, for emptying)
      var doorTop = tBot + 40;
      ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = muted; rect(-t, doorTop, t, H2 - doorTop); ctx.stroke(); ctx.restore();
      hit('bin', 0, H1 + P.act_stroke + 20, D, H2 - H1 - P.act_stroke - 20);

      // reference lines: crush line, full line, how far the plate reaches
      var refLine = function (depth, label, col) {
        var y = H1 + depth; ctx.save(); ctx.setLineDash([3, 6]); ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(D + t) + 6, Y(y)); ctx.stroke(); ctx.restore();
        if (label) text(label, X(D + t) + 10, Y(y), col, 'left', 12, 600);
      };

      // pile
      if (S.pile > 0) {
        var top = H3 - S.pile;
        ctx.fillStyle = C['--pet']; ctx.globalAlpha = 0.32; ctx.beginPath(); ctx.moveTo(X(0), Y(H3));
        for (var x = 0; x <= D; x += 20) ctx.lineTo(X(x), Y(top + Math.sin(x * 0.07) * 6));
        ctx.lineTo(X(D), Y(H3)); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      }
      // bin floor (bottom panel)
      ctx.fillStyle = C['--ply']; rect(-t, H4, D + 2 * t, t); ctx.fill();

      refLine(P.BUNDLE_CM * 10, 'Crush line ' + P.BUNDLE_CM + ' cm', C['--warn']);
      refLine(P.FULL_CM * 10, 'Full line ' + P.FULL_CM + ' cm', C['--bad']);
      refLine(P.act_stroke, 'Plate reach ' + (P.act_stroke / 10) + ' cm', muted);

      // fill sensor (on the housing floor at the back corner, looking down; the plate has a notch here)
      var fx = D - 34;
      ctx.fillStyle = C['--sig']; rect(fx - 22, H1, 45, 15); ctx.fill(); hit('fill', fx - 22, H1, 45, 15);
      if (!/^(PRECRUSH|EXTEND|PAUSE|RETRACT)$/.test(S.mode)) {
        ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = S.fault === 'F7' && !S.faultHidden ? C['--bad'] : C['--sig']; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(X(fx), Y(H1 + 15)); ctx.lineTo(X(fx), Y(S.fault === 'F7' ? H1 + 30 : H1 + Math.min(S.fillCm * 10, P.chamber_h))); ctx.stroke(); ctx.restore();
      }
      if (S.fault === 'F7') { ctx.fillStyle = C['--muted']; rect(fx - 25, H1 + 22, 50, 12); ctx.fill(); }

      // falling item: from the slot down onto the pile
      if (S.falling) {
        var f = S.falling, kk = Math.min(1, f.t / 0.4), y0 = zc, y1 = H2 - S.pile - f.hc / 2;
        drawItem(f.def, D / 2, y0 + (y1 - y0) * kk * kk, f.def.len, Math.max(6, f.hc));
      }

      // slot tube (PVC)
      ctx.fillStyle = C['--pvc']; ctx.strokeStyle = ink; ctx.lineWidth = 1;
      rect(-t - tube, tTop - 6, tube, 6); ctx.fill(); ctx.stroke();
      rect(-t - tube, tBot, tube, 6); ctx.fill(); ctx.stroke();
      hit('lid', -t - tube, tTop, tube + t + 20, slot);

      // slot item
      if (S.slot) {
        var sl = S.slot, d = sl.def, dia = d.w * 10, cx = -t - tube + d.len / 2 - 40, cy = zc + sl.off * 10;
        if (sl.beamLen != null) { var u = Math.min(1, sl.t / d.giveUp); cx = -t - tube - d.len / 2 + Math.sin(u * Math.PI) * (d.len * 0.9); }
        if (sl.state === 'dropping') { var q = Math.min(1, sl.dt / 0.5); cx = cx + (D / 2 - cx) * q; dia = dia + (d.h - dia) * q; }
        ctx.save();
        if (sl.state === 'waiting') { ctx.beginPath(); ctx.rect(0, Y(tTop), X(0), L(slot)); ctx.clip(); }
        drawItem(d, cx, cy, d.len, dia);
        ctx.restore();
      }

      // slot sensors (set back in pockets above/below the tube)
      var sx = -t - tube / 2, s1y = tTop - rec, s2y = tBot + rec;
      var beam = function (y0, dirn, reading, on) {
        ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = on ? C['--sig'] : muted; ctx.lineWidth = 1.3;
        var len = Math.min(reading > 900 ? 0 : reading, sim.EMPTY) * 10;
        ctx.beginPath(); ctx.moveTo(X(sx), Y(y0)); ctx.lineTo(X(sx), Y(y0 + dirn * len)); ctx.stroke(); ctx.restore();
      };
      ctx.fillStyle = C['--sig']; rect(sx - 22, s1y - 15, 45, 15); ctx.fill(); hit('slot1', sx - 22, s1y - 15, 45, 15);
      beam(s1y, 1, S.s1, S.s1 < P.DETECT_CM);
      if (cfg.detect !== 'basic') { ctx.fillStyle = C['--sig']; rect(sx - 22, s2y, 45, 15); ctx.fill(); hit('slot2', sx - 22, s2y, 45, 15); beam(s2y, -1, S.s2, S.s2 < P.DETECT_CM); }
      if (cfg.detect === 'metal') { ctx.fillStyle = S.metal && S.slot ? C['--warn'] : C['--steel']; rect(-t - 40, tBot + 6, 24, 40); ctx.fill(); hit('metal', -t - 40, tBot + 6, 24, 40); }

      // lid flap (hinge at top of opening) and servo
      var la = S.servo * Math.PI / 180;
      ctx.strokeStyle = C['--accent']; ctx.lineWidth = Math.max(3, L(8)); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(X(2), Y(tTop)); ctx.lineTo(X(2 + slot * Math.sin(la)), Y(tTop + slot * Math.cos(la))); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = C['--ink']; rect(6, tTop - 46, 40, 38); ctx.fill(); hit('servo', 6, tTop - 46, 40, 38);

      // actuators, rods, plate
      var py = H1 + S.p, xs = D / 2;
      ctx.fillStyle = C['--steel'];
      rr(xs - 20, 14, 40, P.act_len, 6); ctx.fill(); rr(xs + 22, 18, 30, 100, 6); ctx.fill();
      hit('actuator', xs - 20, 14, 52, P.act_len);
      ctx.fillStyle = ink; rect(xs - 9, 14 + P.act_len, 18, Math.max(0, py - P.plate_t - (14 + P.act_len))); ctx.fill();
      ctx.fillStyle = S.stall ? C['--bad'] : C['--steel']; rect(8, py - Math.max(P.plate_t, 8), D - 16, Math.max(P.plate_t, 8)); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 1; rect(8, py - Math.max(P.plate_t, 8), D - 16, Math.max(P.plate_t, 8)); ctx.stroke();
      hit('plate', 8, py - 14, D - 16, 20);
      if (cfg.n === 2) text('×2', X(xs + 60), Y(60), muted, 'left', 12, 600);

      // front panel: LEDs, buzzer, button, E-stop (outside the front wall)
      var lx = -t - 14, ly = 40;
      [['g', '--ok'], ['y', '--warn'], ['r', '--bad']].forEach(function (c, i) {
        ctx.beginPath(); ctx.arc(X(lx), Y(ly + i * 26), Math.max(4, L(9)), 0, Math.PI * 2);
        ctx.fillStyle = S.leds[c[0]] ? C[c[1]] : C['--well']; ctx.fill(); ctx.strokeStyle = C[c[1]]; ctx.lineWidth = 1.5; ctx.stroke();
      });
      hit('leds', lx - 12, ly - 12, 24, 76);
      var bz = sim.buzzer();
      ctx.beginPath(); ctx.arc(X(lx), Y(ly + 104), Math.max(5, L(11)), 0, Math.PI * 2); ctx.fillStyle = bz ? C['--accent'] : C['--well']; ctx.fill(); ctx.strokeStyle = muted; ctx.stroke();
      if (bz) { ctx.strokeStyle = C['--accent']; ctx.beginPath(); ctx.arc(X(lx), Y(ly + 104), Math.max(9, L(22)), Math.PI * 0.6, Math.PI * 1.4); ctx.stroke(); }
      hit('buzzer', lx - 14, ly + 90, 28, 28);
      ctx.beginPath(); ctx.arc(X(lx), Y(ly + 150), Math.max(5, L(11)), 0, Math.PI * 2); ctx.fillStyle = S.manual ? C['--accent'] : C['--bad']; ctx.fill();
      hit('button', lx - 14, ly + 136, 28, 28);
      ctx.beginPath(); ctx.arc(X(lx - 4), Y(ly + 210), Math.max(8, L(20)), 0, Math.PI * 2); ctx.fillStyle = S.estop ? C['--muted'] : C['--bad']; ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
      hit('estop', lx - 26, ly + 188, 44, 44);

      // labels (≥12px for projectors)
      var rx = X(D + t) + 10;
      text('Housing', rx, Y(H1 / 2), muted);
      text('Bin', rx, Y(H1 + P.chamber_h * 0.6) - 8, muted); text((P.chamber_h / 10) + ' cm', rx, Y(H1 + P.chamber_h * 0.6) + 8, muted);
      text('Fill ' + S.fillCm.toFixed(0) + ' cm', rx, Y(H1 + 8), C['--sig']);
      text(S.pileN + (S.pileN === 1 ? ' item' : ' items') + ' inside', rx, Y(H1 + P.chamber_h * 0.6) + 26, C['--ink'], 'left', 12, 600);
      text('Slot ' + (slot / 10) + ' cm', X(-t - tube), Y(tTop - rec - 34), muted);
      text('Lid', X(20), Y(tBot + 18), C['--accent'], 'left', 12, 600);
      text('S1', X(sx + 30), Y(s1y - 8), C['--sig']);
      if (cfg.detect !== 'basic') text('S2', X(sx + 30), Y(s2y + 8), C['--sig']);
      if (S.blown) text('FUSE BLOWN', X(D / 2), Y(H1 - 40), C['--bad'], 'center', 14, 700);
      else if (S.estop) text('E-STOP', X(D / 2), Y(H1 - 40), C['--bad'], 'center', 14, 700);
      if (S.stall) text('STALLED', X(D / 2), Y(py + 30), C['--bad'], 'center', 13, 700);
    }

    function partAt(px, py) {
      for (var i = hits.length - 1; i >= 0; i--) { var h = hits[i]; if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h.id; }
      return null;
    }

    readColors();
    return { draw: draw, resize: resize, readColors: readColors, partAt: partAt };
  };
})(window);
