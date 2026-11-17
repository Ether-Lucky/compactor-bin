# Compactor Bin Simulator

A browser simulator of a student-built **automatic plastic-bottle compactor bin**: an Arduino UNO reads ultrasonic sensors, a servo opens the lid, bottles pile up in the bin, and when the fill sensor sees the pile reach the crush line, two 12V linear actuators press the whole bundle at once. It models the real parts and runs the same steps and timings as the Arduino program in `arduino/compactor_bin/`.

Three views share one live simulation:

- **Machine**: 2D side cross-section with live sensors, lid, plate, the pile, and the crush and full lines.
- **3D**: the bin as a 3D model built in Blender. Rotate, zoom, cut away the front, tap parts.
- **Wiring**: every part and wire, live: dead wires after the E-stop or a blown fuse, current on the motor wires, every Arduino pin's value.

Also: seven wiring faults to switch on (or a mystery fault to diagnose), a live current and force graph, pause and step-by-step, editable measured values, Arduino code values to paste into the sketch, a scenario runner, a batch test that compares detection methods, and a guided two-minute demo for presentations.

## Run it

Nothing to install.

1. On GitHub, click **Code → Download ZIP**.
2. **Unzip it.** (Windows can't run it from inside the zip.)
3. Double-click **`index.html`**.

It works offline in Chrome, Edge and Firefox. Without internet only the fonts change. The 3D view needs WebGL, which every modern browser has; if a computer can't show 3D, the 3D tab says so and everything else still works.

Keyboard: `1`–`7` items, `Space` pause, `N` next step, `E` E-stop, `M` press now, `R` reset, `G` / `D` / `W` views, `?` help.

## Publish on GitHub Pages

Push this folder to a repository, then **Settings → Pages → Deploy from a branch → `main` / `(root)`**. The site appears at `https://<username>.github.io/<repository>/`. Links like `…/#wiring` open a view directly.

## Change the machine

All numbers live in one file, **`data/parts.js`**: dimensions, part ratings, program timings, items and faults. Each value is tagged with where it came from: product listing, datasheet, the Arduino program, the group's drawing, a proposed design choice, or an **estimate**.

- **Measured something?** Use the *Measured values* panel on the page. Values are remembered in that browser. To make a measurement permanent for everyone, change it in `data/parts.js`.
- **Changed a dimension?** Rebuild the 3D model with Blender (5.x), from this folder:

  ```
  blender --background --python assets/blender/make_bin.py
  ```

  This rewrites `assets/models/compactor_bin.glb`, `assets/models/compactor_bin.model.js` and `assets/blender/compactor_bin.blend`. Commit all three. Blender is only needed for this, never to run the site.

## Tests (optional, for developers)

The scenario runner is built into the page (*Scenario runner* panel). The same scenarios also run in Node:

```
npm install
npm test
```

## What's in the folder

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/` | The site. `js/core.js` is the simulation; the other files draw it and run the panels. |
| `data/parts.js` | The one parts table |
| `assets/blender/make_bin.py` | Builds the 3D model from the parts table |
| `assets/models/` | The exported model (`.glb`, plus a `.js` copy that a double-clicked page can load) |
| `vendor/` | Three.js r147 (MIT), saved here so the site runs offline |
| `arduino/compactor_bin/` | The Arduino program the simulator mirrors |
| `arduino/bench_test/` | Serial-menu sketch for testing each part on its own |
| `guide/` | Printable bench test guide (PDF and HTML): part tests, breadboard layout, how to wire the whole machine |
| `SPEC.md` | The spec this was built from, including the acceptance scenarios |
| `tests/` | Node test suite for the scenarios |

## Limits

The simulator is for understanding the system and comparing design choices. It is not proof the real build works.

- Actuator current, crush forces and sensor noise are **estimates** until the group measures them.
- How the pile packs and springs back, and how much force a dense pile takes, are **estimates**.
- The 220V side and structural strength aren't simulated.
- It copies the program's logic but doesn't run the real `.ino` code, so a bug in the sketch won't show up here.
