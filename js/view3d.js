/* 3D view (SPEC 6.5): the Blender model, driven by the simulation.
   Uses vendored Three.js r147 (classic scripts) so it works from a double-clicked file. */
(function (root) {
  'use strict';
  var CB = root.CB = root.CB || {};

  var PART_OF = [
    [/^lid|^slot_tube|^front_chamber/, 'lid'], [/^servo/, 'servo'], [/^sensor_slot1/, 'slot1'], [/^sensor_slot2/, 'slot2'],
    [/^sensor_metal/, 'metal'], [/^sensor_fill/, 'fill'], [/^actuator_|^rod_/, 'actuator'], [/^plate/, 'plate'],
    [/^bottom|^door/, 'bin'], [/^led_/, 'leds'], [/^buzzer/, 'buzzer'], [/^button/, 'button'], [/^estop/, 'estop'],
    [/^psu12/, 'psu12'], [/^psu5/, 'psu5'], [/^arduino/, 'arduino'], [/^bts/, 'bts'], [/^fuse/, 'fuse'], [/^terminal/, 'terminal'], [/^buck/, 'buck']
  ];
  function partFor(name) { for (var i = 0; i < PART_OF.length; i++) if (PART_OF[i][0].test(name)) return PART_OF[i][1]; return null; }

  function webgl() {
    try { var c = document.createElement('canvas'); return !!(root.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch (e) { return false; }
  }

  CB.View3D = function (container, onPart, onFail) {
    var api = { ok: false, update: function () {}, resize: function () {}, setCutaway: function () {}, setCamera: function () {}, readColors: function () {} };
    var THREE = root.THREE;
    if (!THREE || !THREE.GLTFLoader || !THREE.OrbitControls || !root.MODEL_GLB_BASE64 || !webgl()) { onFail && onFail(); return api; }

    var renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch (e) { onFail && onFail(); return api; }
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1, 0.02, 20);
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 0.4; controls.maxDistance = 6;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 0.85));
    var sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(1.6, 2.8, 2.2); scene.add(sun);
    var fillL = new THREE.DirectionalLight(0xffffff, 0.35); fillL.position.set(-2, 1, -1); scene.add(fillL);
    var floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 64), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.001; scene.add(floor);

    var model = null, N = {}, rest = {}, frontMats = [], ledMats = {}, cutaway = true, G = null;
    var items = { slot: null, chamber: null, falling: null }, pile = null, colors = {};
    var camAnim = null;

    var PRESETS = {
      front: { pos: [0.7, 0.95, 3.0], target: [0, 0.66, 0] },
      side: { pos: [2.2, 0.85, 0.5], target: [0, 0.68, 0] },
      inside: { pos: [0.5, 1.0, 0.95], target: [0, 0.85, 0] },
      top: { pos: [0.02, 2.6, 0.35], target: [0, 0.6, 0] }
    };

    function readColors() {
      var cs = getComputedStyle(document.documentElement);
      ['--pet', '--can', '--glass', '--carton', '--hand', '--well', '--ok', '--warn', '--bad'].forEach(function (n) { colors[n] = cs.getPropertyValue(n).trim(); });
      floor.material.color.set(colors['--well'] || '#888888');
      if (pile) pile.material.color.set('#3f78d6');
    }

    function base64ToBuffer(b64) {
      var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
      for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
      return u.buffer;
    }

    new THREE.GLTFLoader().parse(base64ToBuffer(root.MODEL_GLB_BASE64), '', function (gltf) {
      model = gltf.scene; scene.add(model);
      model.traverse(function (o) {
        if (!o.name) return;
        N[o.name] = o;
        rest[o.name] = { p: o.position.clone(), q: o.quaternion.clone() };
        if (o.isMesh) {
          if (/^front_|^door/.test(o.name)) { o.material = o.material.clone(); o.material.transparent = true; frontMats.push(o.material); }
          if (/^led_/.test(o.name)) { o.material = o.material.clone(); ledMats[o.name] = o.material; }
          if (o.name === 'estop') { o.material = o.material.clone(); }
        }
      });
      setCutaway(cutaway);
      readColors();
    }, function () { onFail && onFail(); });

    function setCutaway(on) {
      cutaway = !!on;
      frontMats.forEach(function (m) { m.opacity = cutaway ? 0.14 : 1; m.depthWrite = !cutaway; m.needsUpdate = true; });
    }

    function setCamera(name, instant) {
      var p = PRESETS[name] || PRESETS.front;
      var to = { pos: new THREE.Vector3().fromArray(p.pos), target: new THREE.Vector3().fromArray(p.target) };
      if (instant) { camera.position.copy(to.pos); controls.target.copy(to.target); controls.update(); return; }
      camAnim = { t: 0, from: { pos: camera.position.clone(), target: controls.target.clone() }, to: to };
    }
    setCamera('front', true);

    function itemMesh(d) {
      var col = new THREE.Color(colors['--' + d.color] || '#5b8fd6');
      var mat = new THREE.MeshStandardMaterial({ color: col, roughness: d.mat === 'Glass' ? 0.1 : 0.45, metalness: d.metal ? 0.7 : 0, transparent: d.shape === 'bottle', opacity: d.mat === 'Glass' ? 0.8 : 0.72 });
      var r = d.w / 200, len = d.len / 1000, h = d.h / 1000, g;
      if (d.shape === 'bottle' || d.shape === 'can') { g = new THREE.CylinderGeometry(r, r, len, 28); g.rotateX(Math.PI / 2); }
      else if (d.shape === 'box') { g = new THREE.BoxGeometry(r * 2, h, len); }
      else { g = new THREE.SphereGeometry(0.5, 20, 14); g.scale(r * 2, h * 0.5, len); }
      var m = new THREE.Mesh(g, mat); m.userData.def = d; m.userData.h = (d.shape === 'bottle' || d.shape === 'can') ? r * 2 : h;
      if (d.shape === 'bottle') {
        var neck = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r * 0.38, len * 0.22, 16), mat);
        neck.rotation.x = Math.PI / 2; neck.position.z = len * 0.6; m.add(neck);
      }
      return m;
    }
    function syncItem(slotKey, def) {
      var cur = items[slotKey];
      if (cur && (!def || cur.userData.def !== def)) { scene.remove(cur); cur.geometry.dispose(); items[slotKey] = null; cur = null; }
      if (!cur && def) { cur = items[slotKey] = itemMesh(def); scene.add(cur); }
      return cur;
    }

    function q(axis, ang) { return new THREE.Quaternion().setFromAxisAngle(axis, ang); }
    var AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);

    function update(sim, dt) {
      if (!model) return;
      var S = sim.S, P = sim.P;
      if (!G) {
        G = { zS0: P.base_h / 1000, zc: (P.base_h + P.chamber_h - P.slot_top - P.slot_w / 2) / 1000,
          tubeZ: (P.inner_d / 2 + P.wall + P.slot_len / 2) / 1000, W: P.inner_w / 1000, D: P.inner_d / 1000 };
        pile = new THREE.Mesh(new THREE.BoxGeometry(G.W - 0.01, 1, G.D - 0.01), new THREE.MeshStandardMaterial({ color: '#3f78d6', transparent: true, opacity: 0.6, roughness: 0.6 }));
        scene.add(pile);
      }
      var p = S.p / 1000;
      ['rod_1', 'rod_2', 'plate'].forEach(function (n) { if (N[n]) N[n].position.y = rest[n].p.y - p; });
      if (N.lid) N.lid.quaternion.copy(rest.lid.q).multiply(q(AX, S.servo * Math.PI / 180));
      if (N.door) N.door.quaternion.copy(rest.door.q);
      var two = sim.cfg.n === 2;
      ['actuator_1_body', 'actuator_1_motor', 'actuator_1_mount', 'rod_1'].forEach(function (n) { if (N[n]) N[n].visible = two; });
      var s2 = sim.cfg.detect !== 'basic', mt = sim.cfg.detect === 'metal';
      Object.keys(N).forEach(function (n) { if (/^sensor_slot2/.test(n)) N[n].visible = s2; });
      if (N.sensor_metal) N.sensor_metal.visible = mt;
      var leds = { led_green: [S.leds.g, colors['--ok']], led_yellow: [S.leds.y, colors['--warn']], led_red: [S.leds.r, colors['--bad']] };
      Object.keys(leds).forEach(function (n) { var m = ledMats[n]; if (!m) return; m.emissive.set(leds[n][0] ? (leds[n][1] || '#ffffff') : '#000000'); m.emissiveIntensity = leds[n][0] ? 1.6 : 0; });
      if (N.estop) { N.estop.position.z = rest.estop.p.z - (S.estop ? -0.008 : 0); N.estop.material.color.set(S.estop ? '#7a1a12' : '#c0281c'); }
      if (N.plate && N.plate.material) N.plate.material.emissive && N.plate.material.emissive.set(S.stall ? '#5a0a05' : '#000000');

      // items
      var sl = S.slot && S.slot.def;
      var m = syncItem('slot', sl);
      if (m) {
        var d = S.slot.def, len = d.len / 1000, z = G.tubeZ + len / 2 - 0.05, y = G.zc + S.slot.off / 100, sc = 1;
        if (S.slot.beamLen != null) { var u = Math.min(1, S.slot.t / d.giveUp); z = G.tubeZ + len * 0.9 - Math.sin(u * Math.PI) * len * 0.8; }
        if (S.slot.state === 'dropping') { var k = Math.min(1, S.slot.dt / 0.5); z = z * (1 - k); }
        m.position.set(0, y, z); m.scale.set(1, sc, 1);
      }
      var fa = syncItem('falling', S.falling && S.falling.def);
      if (fa) {
        var kk = Math.min(1, S.falling.t / 0.4), h2 = S.falling.hc / 1000, top = G.zS0 + S.pile / 1000 + h2 / 2;
        fa.position.set(0, G.zc + (top - G.zc) * kk * kk, 0);
      }
      var ph = Math.max(0.0001, S.pile / 1000);
      pile.visible = S.pile > 0.5; pile.scale.y = ph; pile.position.set(0, G.zS0 + ph / 2, 0);

      if (camAnim) {
        camAnim.t = Math.min(1, camAnim.t + (dt || 0.016) / 0.6);
        var e = 1 - Math.pow(1 - camAnim.t, 3);
        camera.position.lerpVectors(camAnim.from.pos, camAnim.to.pos, e);
        controls.target.lerpVectors(camAnim.from.target, camAnim.to.target, e);
        if (camAnim.t >= 1) camAnim = null;
      }
      controls.update();
      renderer.render(scene, camera);
    }

    function resize() {
      var r = container.getBoundingClientRect(); if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      renderer.domElement.style.width = r.width + 'px'; renderer.domElement.style.height = r.height + 'px';
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    }

    // click a part (ignore drags)
    var down = null, ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
    renderer.domElement.addEventListener('pointerdown', function (e) { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', function (e) {
      if (!down || !model) return;
      var moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]); down = null;
      if (moved > 5) return;
      var r = renderer.domElement.getBoundingClientRect();
      v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v2, camera);
      var hitList = ray.intersectObject(model, true);
      for (var i = 0; i < hitList.length; i++) {
        var o = hitList[i].object;
        if (!o.visible) continue;
        if (cutaway && /^front_|^door/.test(o.name)) continue;
        var id = partFor(o.name); if (id) { onPart && onPart(id); return; }
      }
    });

    api.ok = true; api.update = update; api.resize = resize; api.setCutaway = setCutaway; api.setCamera = setCamera; api.readColors = readColors;
    return api;
  };
})(window);
