# Compactor Bin Simulator — Spec

Status: **v1.0 — built** · 2026-11-17 (S3 and S12 corrected during build; see §8.2 and §7)
Prototype already exists (v1, built before this spec): `compactor-simulator.html`. Once approved, this spec replaces v1's choices; v1 changes only to match it.

---

## 1. Purpose

A browser tool that shows what the real compactor bin does, using **only the parts already bought** and **the same logic as the Arduino program**, so the group can:

1. Understand how the parts work together before wiring them.
2. Try design choices (detection method, number of actuators, fuse size) without breaking hardware.
3. Show and explain the machine during their presentation.

**Not** a general physics engine and **not** a replacement for testing the real hardware.

## 2. Users

| User | Needs |
|---|---|
| Student group (builders) | See cause → effect, test choices, tune values |
| You (mentor) | Explain parts and failure cases at meetings |
| Panel / teacher (viewers) | Follow a demo in under 2 minutes |

## 3. Scope

**In**
- Side cross-section of the bin: slot, lid, crush chamber, plate, trapdoor, storage, drain.
- Item insertion (bottles and non-bottles).
- Sensor readings, detection decision, lid, crush cycle, storage fill.
- Electrical behavior that matters for decisions: current draw, fuse, E-stop, 12V supply load.
- Live Arduino pin states and program step.

**Out**
- 220V AC side behavior.
- Liquid/drain physics (drawn only).
- Real crushing deformation graphics (shown as height reduction only).
- Sound output, saving runs, multi-user.

## 4. Source of truth: parts

Every number used by the simulator lives in one table in the code, tagged with where it came from.
Tags: **[L]** product listing/label · **[D]** datasheet · **[C]** `compactor_bin.ino` · **[E]** estimate, to be replaced by measurement · **[G]** group's drawing.

| Part | Parameter | Value | Tag |
|---|---|---|---|
| Linear actuator | Voltage / rated force / stroke / speed | 12V / 1500N / 200 mm / 7 mm/s | L |
| | Count on plate | 2 (switchable 1) | L |
| | Current: free / at rated force / stall | 1.0 / 5.0 / 6.0 A each | **E** |
| | Speed loss at rated force | 40% | **E** |
| | Internal limit switches at both ends | yes | L |
| HC-SR04 | Range / beam / timing | 2–400 cm / 15° / µs ÷ 58 = cm | D |
| | Reading noise / missed echo on curved plastic | ±0.12 cm / 6–8% | **E** |
| MG996R servo | Speed | 0.17 s per 60° | D |
| BTS7960 | Max current | 43A | L |
| 12V PSU / 5V PSU | Capacity | 15A / 5A | L |
| Fuse | Rating options | 10 / 15 / 30A | L |
| Body | Slot width / crush chamber / storage | 10 cm / 20 cm / 60 cm | G (slot: proposed) |
| Sensor recess in slot wall | | 3 cm | proposed (HC-SR04 min range) |

**Items** (lying sideways in chamber)

| Item | Width | Metal | Crush force | Crushed height | Tag |
|---|---|---|---|---|---|
| PET 500 mL | 6.5 cm | no | ~250N | 15 mm | E |
| PET 1.5 L | 9.0 cm | no | ~400N | 22 mm | E |
| Aluminum can | 6.6 cm | yes | ~450N | 14 mm | E |
| Glass bottle | 6.8 cm | no | >3000N (won't crush) | — | E |
| Juice carton | 5.6 cm | no | ~120N | 8 mm | E |
| Hand (held / waved) | 8.8–10.4 cm, unsteady | no | n/a | n/a | E |

## 5. Behavior

### 5.1 Controller — must mirror `compactor_bin.ino`

The simulator runs the **same steps, timings and thresholds** as the Arduino program. If the program changes, the simulator changes (see Q4).

| # | Step | Ends when | Pins |
|---|---|---|---|
| 1 | Ready: sample slot sensor every 40 ms | object accepted → 2 · bin full → Full · button → 6 | A0 HIGH |
| 2 | Open lid | 1.0 s | D9 = 90° |
| 3 | Wait for drop | slot clear, or 8 s timeout | |
| 4 | Clear delay | 1.5 s | |
| 5 | Close lid | 1.0 s | D9 = 0° |
| 6 | Warning beeps ×2 | 1.28 s | D12, A1 HIGH |
| 7 | Crush (extend) | 31 s timer (not position) | D5 = 255 |
| 8 | Pause | 0.5 s | |
| 9 | Retract | 31 s timer | D6 = 255 |
| 10 | Trapdoor | 2 s | **proposed — not in program** |
| — | Full | re-check every 2 s | A2 HIGH, beeps ×3, lid locked |

Rules:
- Ready → accept requires ≥80% of the last N readings below 12 cm, N = hold time ÷ 40 ms (min 5).
- E-stop and blown fuse cut actuator power only. The Arduino keeps running its timers.

### 5.2 Detection modes

| Mode | Hardware | Accept if |
|---|---|---|
| A. Basic (current program) | 1 HC-SR04 | Rule above |
| B. Width check | 2 facing HC-SR04 | A, plus width 5.5–9.5 cm and spread ≤ 0.5 cm (both sensors must echo) |
| C. Width + metal | B + inductive sensor | B, plus no metal reading |

Width = (slot width + 2 × recess) − sensor 1 − sensor 2.

### 5.3 Actuator and power

- Moves only when the step commands it and power is present.
- Before contact: free speed, free current.
- In contact: required force from the item's crush curve. Speed and current scale with force ÷ (1500N × count).
- Required force ≥ available → **stall**: speed 0, stall current, logged once.
- A fully crushed item counts as solid → stall until the 31 s timer ends (real behavior with a timer-based program).
- Fuse: above its rating it heats; at 1.2× rating it blows in about 2 s. Blown → no actuator power until replaced.

### 5.4 Storage

- Each crushed item adds about 2.2× its crushed height to the pile (loose packing). Uncrushed items add 1.2× their height.
- Fill sensor reads (60 cm − pile). Below 15 cm → Full.

## 6. Interface requirements

1. Machine view and the current step are visible together without scrolling on a laptop.
2. Every reading shows units (cm, µs, mm, N, A, °).
3. Each item outcome is logged with plain-language cause: accepted, refused correctly, false positive, false negative, stall, fuse blown.
4. Values tagged **[E]** are marked as estimates wherever shown.
5. Works on a phone (single column) and on a projector (large enough text).
6. Light and dark themes.

### 6.1 Views

The site has two views, switched by tabs at the top. Both run on the same live simulation, so switching views never resets anything.

| View | URL | Shows |
|---|---|---|
| Machine | `#machine` (default) | 2D cross-section, controls, gauges, log (everything in §5) |
| 3D | `#model` | The bin as a 3D model built in Blender, moving with the simulation (§6.5) |
| Wiring | `#wiring` | How every part connects (§6.2) |

Controls, gauges and the log stay visible beside whichever of Machine / 3D is shown.

### 6.2 Wiring view

A diagram of **every part and every wire**, matching the brief and `compactor_bin.ino`.

**Content**
- **Power path (12V):** wall outlet → 12V PSU → fuse → E-stop → terminal block → BTS7960 → actuator(s).
- **Power path (5V):** 5V PSU → servo power and Arduino 5V. Buck converter shown as the alternative way to power the Arduino.
- **Signal wires:** every Arduino pin to its part: D2/D3 slot sensor, D4/D7 fill sensor, D5/D6/D8 BTS7960, D9 servo, D12 buzzer, A0–A2 LEDs, A3 button. In modes B/C, also the second slot sensor and the metal sensor, marked "needs new code / pins TBD".
- **Common ground:** drawn as one shared line joining 12V PSU −, 5V PSU −, Arduino GND and BTS7960 GND.
- **Every wire is labeled** with its type: 220V cord, 16 AWG, 22 AWG or jumper. Colors follow the brief's rule: red = +12V, orange = +5V, black = ground, blue = signal, brown = 220V.

**Live state** (from the running simulation)
- 12V wires show the current flowing (A). Wires with no power after an open E-stop or a blown fuse appear dead (greyed and dashed).
- Fuse shows OK / heating / blown. E-stop shows closed / open.
- Each signal pin shows its value: HIGH/LOW, PWM 0–255, servo angle, sensor distance.
- The actuator and servo show what they're doing (extending, retracting, stalled; angle).

**Interaction**
- Clicking or tapping a part opens a short card: what it does, its key specs (from the §4 parts table, with source tags), and which pins and wires connect to it.
- Clicking a wire highlights its whole path from end to end.

**Layout**
- Fits a laptop screen without scrolling. On a phone it scrolls sideways inside its own frame (the page itself never does).
- Text is readable on a projector (≥ 12 px at 1280 px wide).

### 6.3 Interactivity

**I1 — Fault injection ("Break something")**
A panel of faults that can be switched on one at a time. Each changes how the simulated hardware behaves, so the symptom appears the way it would on the real build.

| Fault | Symptom in the sim |
|---|---|
| F1 Loose common ground | Sensor readings jump randomly, servo twitches, actuator ignores commands |
| F2 Slot sensor unplugged | Echo times out (0 µs / no reading); nothing is ever detected |
| F3 Actuator wires reversed | Plate goes up when told to crush and down when told to retract; ends the cycle stuck down |
| F4 Servo signal on wrong pin | Lid never opens; bottle can't drop; lid timeout; empty crush |
| F5 Servo powered from Arduino 5V pin | Arduino resets whenever the servo moves; program restarts from power-on |
| F6 Driver enable pins (R_EN/L_EN) not connected | D5/D6 change but the actuator never moves, draws 0A |
| F7 Fill sensor blocked | Bin always reads full; lid stays locked |

- **Mystery mode:** picks a random fault without saying which. The group diagnoses it from the gauges, pins and Wiring view, makes a guess, and then reveals the answer.
- In the Wiring view, the faulty wire or part is drawn wrong (loose, swapped or moved) **only after the reveal**.

**I2 — Live graph**
- Plots crush force (N) and 12V current (A) against time for the last ~70 s of simulated time.
- Shows the fuse rating as a dashed line, and shades the program steps in the background.
- Marks stall and fuse-blown moments.

**I3 — Pause and step**
- Pause / Resume button.
- "Next step" advances the simulation until the program moves to its next step, then pauses again.
- While paused, everything (gauges, pins, Wiring view, part cards) can still be inspected.

**I4 — Clickable machine parts**
- Tapping the lid, either sensor, the actuator, plate, trapdoor, fill sensor, LEDs, buzzer or E-stop on the cross-section opens the same part card as the Wiring view (one shared set of cards).
- Tapping the E-stop on the drawing presses it.

**I5 — Scenario runner**
- Lists S1–S28 with a Run button each and "Run all".
- Automatic scenarios run on a hidden copy of the simulation at full speed and show pass/fail with the reason (e.g. "expected fuse blown, got 9.8A peak").
- Scenarios that need a person (S13 clipboard, S18 tab switch, S19 offline, S20 GitHub) are listed as **manual**, with a checkbox.
- Running scenarios never disturbs the live simulation on screen.

**I6 — Guided demo mode**
- One button plays a five-part story on the live simulation, with a caption bar and Next / Back / Exit:
  1. PET bottle: a normal cycle.
  2. Held hand in 1-sensor mode: the lid opens (false positive).
  3. Width check: the same hand is refused.
  4. Can: refused by the metal sensor.
  5. Glass: the actuator stalls, and why sound can't tell glass from plastic.
- Runs at 10× during crushes so the whole demo takes under 2 minutes.
- Exiting restores the settings that were active before.

**I7 — Batch test and stats**
- Drops N random items (default 50, mix of bottles and non-bottles) through the detection logic, without running the crush cycle, for each detection mode.
- Table per mode: correct accepts, correct refusals, false positives, false negatives, accuracy %.
- Same seed gives the same results (see R-A2).

**I8 — Drag-and-drop and keyboard shortcuts**
- Items can be dragged onto the slot in the machine view (mouse and touch). The buttons stay for accessibility.
- Keys: `1`–`7` items · `Space` pause/resume · `N` next step · `E` E-stop · `M` manual crush · `R` reset · `W` / `G` switch to Wiring / Machine view · `?` show the list.
- Shortcuts are ignored while typing in an input.

### 6.4 Architecture rules (needed by I5 and I7)

- **R-A1 Simulation core with no drawing.** All state and the `step(dt)` function live in one part of the code that never touches the page. The machine view, Wiring view, graph and gauges only read from it. This lets the scenario runner and batch test run hidden copies at full speed.
- **R-A2 Seeded randomness.** Every random value (sensor noise, missed echoes, hand width) comes from one seeded random generator. The seed is shown and can be changed. Same seed + same actions = same result.
- **R-A3 One parts table** (§4) feeds the core, the part cards, the Wiring view, the const lines panel **and the Blender model**. No number is typed in two places. It lives in `data/parts.js` as `window.PARTS = { … };` where everything between the braces is strict JSON, so the Blender script can read the same file.

### 6.5 3D view

**Model (made in Blender)**
- Built by a script, `assets/blender/make_bin.py`, run with Blender 5.2 in the background: `blender --background --python assets/blender/make_bin.py`.
- The script reads `data/parts.js` and builds every part to those dimensions: body panels (plywood / PVC board), slot tube, lid, the two actuators (body, motor, rod), crusher plate, trapdoor flaps, storage door, fill sensor, slot sensors, funnel and hose, and electronics box.
- Every moving part is a separate, named object with its pivot at the real hinge or mount point: `lid`, `rod_1`, `rod_2`, `plate`, `trap_front`, `trap_back`, `door`.
- Simple materials only (plywood, PVC white, steel, aluminum, red E-stop). No textures, to keep the file small.
- Output, written by the same script:
  - `assets/models/compactor_bin.glb`: the normal model file, viewable in any 3D viewer.
  - `assets/models/compactor_bin.model.js`: the same model wrapped as `window.MODEL_GLB_BASE64 = "…"`, because browsers block a double-clicked page from loading `.glb` files directly.
  - `assets/blender/compactor_bin.blend`: the Blender file, for anyone who wants to edit the model by hand.

**View (in the browser)**
- Uses Three.js saved in the repo (`vendor/`). Version **r147**, the last release that has both the classic `three.min.js` and the classic loaders, because double-clicked pages can't load the newer module version.
- Each frame, the simulation state drives the model: lid angle → `lid`, plate position → `rod_*` and `plate`, trapdoor → `trap_*`, the item in the chamber shrinks as it is crushed, and LEDs and E-stop light up.
- Orbit (drag), zoom (wheel or pinch), and a **cutaway toggle** that hides the front panel so the inside is visible.
- Preset cameras: Front, Side, Inside, Top.
- Tapping a part opens the same part card as the other views (I4).
- If the device can't run 3D (no WebGL), the tab shows a message and points to the 2D view. Nothing else breaks.

## 7. Acceptance scenarios

Each must pass before release. These double as the demo script.

| # | Setup | Action | Expected |
|---|---|---|---|
| S1 | Mode A, 2 actuators, 15A | Insert PET 500 mL | Lid opens; crushed to 15 mm; stall at end, ≤ 12A; fuse OK; into storage |
| S2 | Mode A | Hand held still | Lid opens → logged **false positive**; empty crush runs to limit switch |
| S3 | Mode A, hold time 0.5 s | Hand waved past | Refused (not held long enough). Note: at the program's 0.2 s a quick wave can sometimes open the lid |
| S4 | Mode B | Hand held still | Refused for width or unsteady reading |
| S5 | Mode B | Aluminum can | Accepted → logged false positive |
| S6 | Mode C | Aluminum can | Refused: metal |
| S7 | Mode A, 2 actuators, **10A** | PET 500 mL | Fuse blows during end-of-crush stall |
| S8 | Any, 2 actuators, 15A | Glass bottle | Stall at contact; falls uncrushed; logged as wrong material |
| S9 | Storage near full | Crush one more | Full state: red LED, lid locked, items refused |
| S10 | During crush | Press E-stop for 5 s, release | Plate stops; timer keeps counting; plate resumes on release |
| S11 | Mode B | PET 500 mL × 10 runs | Accepted ≥ 9 of 10 (missed echoes must not cause false negatives) |

## 8. Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Main use | **Both equally**: group learning tool and panel demo |
| Q2 | Editable estimates | **Yes.** Collapsed "Measured values" panel. Each [E] value can be overwritten; overwritten values show as "measured", the rest stay marked "estimate". Reset restores estimates. |
| Q3 | Trapdoor | Default kept: shown, marked "proposed", until the group decides the design |
| Q4 | Sim ↔ Arduino sync | **Show const lines.** A panel prints the current thresholds and timings as `const` lines matching `compactor_bin.ino`, with a Copy button |
| Q5 | Language | **English** |
| Q6 | Guided demo mode | **Yes** (I6) |
| Q7 | Extra interactivity | **All eight:** fault injection, live graph, pause/step, clickable parts, scenario runner, guided demo, batch stats, drag-and-drop + shortcuts (§6.3) |
| Q8 | 3D | **Yes.** Extra view; model built with Blender 5.2 (installed at `D:\Blender\`); 2D stays the default (§6.5) |
| Q9 | How it runs | **Every asset in the repo; double-click works on any computer.** Vendored Three.js r147 + model wrapped in a `.js` file (§9) |
| Q10 | Skills used while building | **Confirmed:** **impeccable** (UI, every phase), **emil-design-eng** (interactions), **dataviz** (graph, stats tables), **vitest** (core unit tests, dev only), **web-perf** (3D speed), **run** + **code-review** (end of each phase). Not used: ui-ux-pro-max, design-taste-frontend, gsap-core |

### 8.1 Requirements added by these decisions

- **R-Q2a** "Measured values" panel lists: actuator free/rated/stall current, speed loss, each item's crush force and crushed height, sensor noise and missed-echo rate.
- **R-Q2b** Edited values take effect immediately and are remembered in that browser only.
- **R-Q2c** Every place an [E] value is shown says "estimate" or "measured".
- **R-Q4a** The const panel covers: `DETECT_CM`, `FULL_CM`, `LID_OPEN`, `LID_CLOSED`, `STROKE_MS`, `LID_TIMEOUT_MS`, sample count, and (modes B/C) the width limits.
- **R-Q4b** Values the current `compactor_bin.ino` does not have yet (width check, metal sensor, trapdoor) are printed as a commented block marked "needs new code".
- **R-Q1a** Machine view text stays readable from the back of a room (canvas labels ≥ 12 px at 1280 px wide).

### 8.2 Added acceptance scenarios

| # | Setup | Action | Expected |
|---|---|---|---|
| S12 | Measured values panel | Set stall current to 10A, 2 actuators, 15A fuse, run S1 | Fuse blows (20A > 15A; a fuse needs a clear overload to blow in seconds); UI shows stall current as "measured" |
| S13 | Const panel | Change hold time to 1.0 s | Printed sample count updates to 25; Copy puts the lines on the clipboard |

### 8.3 More acceptance scenarios (wiring view, running locally)

| # | Setup | Action | Expected |
|---|---|---|---|
| S14 | Wiring view, crush in progress | Watch | D5 shows 255; actuator wires show live current; actuator state "extending" |
| S15 | Wiring view | Press E-stop | Wires after the E-stop turn dead; E-stop shows open; Arduino pins still active |
| S16 | Wiring view, 10A fuse | Run S7 | Fuse shows heating, then blown; every 12V wire after it turns dead |
| S17 | Wiring view | Tap BTS7960 | Card shows role, 43A rating [L], pins D5/D6/D8, wires to fuse line and actuators |
| S18 | Wiring view | Switch to Machine and back mid-crush | Simulation keeps running; nothing resets |
| S19 | Repo downloaded as ZIP and unzipped, on a computer with nothing installed, no internet | Double-click `index.html` | Site opens; Machine, 3D and Wiring views all work; only the fonts fall back. Checked on Windows (Chrome, Edge) and in Firefox |
| S20 | GitHub Pages | Open the published URL, then `#wiring` | Both views load; direct link to `#wiring` opens the Wiring view |

### 8.4 Interactivity scenarios

| # | Setup | Action | Expected |
|---|---|---|---|
| S21 | F3 actuator reversed | Insert PET 500 mL | Plate doesn't go down during crush; goes down during retract; cycle ends with plate down |
| S22 | F5 servo on Arduino 5V | Insert PET 500 mL | Arduino resets when lid starts moving; log shows restart; power-on retract runs |
| S23 | Mystery mode | Guess wrong, then reveal | Answer shown; Wiring view shows the faulty wire |
| S24 | Graph visible, 10A fuse | Run S7 | Current line crosses the dashed 10A line, then drops to 0 at the blow |
| S25 | Paused in Ready | Press Next step after inserting a bottle | Advances exactly to "Open lid" and pauses |
| S26 | Guided demo | Play all five parts, then Exit | Each part's expected outcome happens; settings restored afterward |
| S27 | Batch test, seed 1234, 50 items | Run twice | Identical tables both times; mode A shows false positives for hands, mode C shows none for cans |
| S28 | Machine view | Drag a can onto the slot; press `E` | Can is inserted; E-stop toggles |

### 8.5 3D scenarios

| # | Setup | Action | Expected |
|---|---|---|---|
| S29 | 3D view, cutaway on | Insert PET 500 mL | Lid swings open, bottle drops, plate and both rods move down in step with the 2D view and gauges, bottle shrinks, trapdoor opens |
| S30 | 3D view | Drag to orbit, zoom, pick "Inside" camera, tap the actuator | Camera moves smoothly; actuator card opens |
| S31 | Change crush chamber height in `data/parts.js` from 20 to 25 cm; run `make_bin.py` | Reload the site | 3D model, 2D view and simulation all use 25 cm |
| S32 | Browser with WebGL turned off | Open the 3D tab | Clear message pointing to the 2D view; other views unaffected |
| S33 | Typical school laptop | 3D view during a crush | Runs at 30 fps or better |

## 9. Running locally and publishing on GitHub

**Requirements**
- **R-D1** Everything needed to run the site is inside the repo: page, scripts, data, 3D model and libraries. No build step, no npm, no server, nothing to install.
- **R-D2** Opening `index.html` by double-clicking it (file://) works in Chrome, Edge and Firefox on Windows and Mac, **including the 3D view**. To make that possible, every script is loaded as a classic `<script src>` (no ES modules), and the model is loaded from its `.model.js` copy (no `fetch`).
- **R-D3** No scripts from the internet. Three.js and its loader and camera-controls files live in `vendor/` with their MIT license. Google Fonts is the only outside request; offline, the site uses system fonts and everything else works.
- **R-D4** Browser storage (remembered measured values) is optional: if the browser blocks it, the site still works and just doesn't remember.
- **R-D5** Copy button falls back to selecting the text if the clipboard is blocked.
- **R-D6** The repo contains **no personal information**: no names, phone numbers, addresses or order screenshots.
- **R-D7** Repo size stays under 10 MB. The `.glb` is under 2 MB (stored twice: as `.glb` and inside `.model.js`).
- **R-D8** Blender is needed **only to change the model**, never to run the site.

**Repo layout**
```
compactor-bin/
├── index.html                          ← the site (GitHub Pages serves this)
├── README.md                           ← what it is, how to run it, how to change it, how to publish
├── SPEC.md                             ← this file
├── LICENSE
├── css/
│   └── style.css
├── js/
│   ├── core.js                         ← simulation core, no drawing (R-A1)
│   ├── view2d.js                       ← machine cross-section
│   ├── view3d.js                       ← 3D view
│   ├── wiring.js                       ← wiring view
│   ├── panels.js                       ← controls, gauges, graph, cards, faults
│   ├── tests.js                        ← scenario runner
│   └── demo.js                         ← guided demo
├── data/
│   └── parts.js                        ← the one parts table (R-A3)
├── assets/
│   ├── models/
│   │   ├── compactor_bin.glb
│   │   └── compactor_bin.model.js      ← same model, loadable by a double-clicked page
│   └── blender/
│       ├── make_bin.py                 ← builds the model from data/parts.js
│       └── compactor_bin.blend
├── vendor/
│   ├── three.min.js                    ← Three.js r147
│   ├── GLTFLoader.js
│   ├── OrbitControls.js
│   └── THREE-LICENSE.txt
└── arduino/
    └── compactor_bin/
        └── compactor_bin.ino           ← the program the simulator mirrors
```

**Running locally:** on GitHub, click Code → Download ZIP. **Unzip it first** (Windows can't run it from inside the zip), then double-click `index.html`. Or `git clone` and double-click.

**Changing the model:** edit `data/parts.js`, then run `blender --background --python assets/blender/make_bin.py`. Commit the updated files in `assets/models/` and `assets/blender/`.

**Publishing:** push to GitHub → Settings → Pages → Deploy from branch → `main`, folder `/ (root)`. The site appears at `https://<username>.github.io/compactor-bin/`.

**claude.ai preview:** optional and not kept in sync. The GitHub repo is the source of truth.

## 10. v1 vs this spec

| Area | v1 | Needed |
|---|---|---|
| Parts table with source tags | Constants exist, untagged | Add tags, show [E] marks in UI (§4, §6.4) |
| Editable measured values | No | Build (R-Q2a–c) |
| Code-sync output | No | Build (R-Q4a–b) |
| Wiring view | Not built (only in the separate brief, static) | Build live version (§6.1, §6.2) |
| Runs locally / GitHub | Page fragment made for claude.ai (no `<html>`/`<head>`) | Full `index.html` document + repo files (§9) |
| Interactivity I1–I8 | Buttons and settings only | Build all eight (§6.3) |
| 3D view and Blender assets | None | Blender script, model files, vendored Three.js, 3D view (§6.5) |
| Architecture | Core and drawing mixed; `Math.random` | Separate core, seeded RNG, single parts table (§6.4) |
| Acceptance scenarios | S1–S8 manually checked once | All S1–S28, automatic ones via the scenario runner |
| Projector readability | Canvas labels 10–11 px | Raise to ≥ 12 px (R-Q1a) |

## 11. Build plan

Each phase ends with its scenarios passing before the next starts.

| Phase | Builds | Done when |
|---|---|---|
| P1 Foundation | Repo layout (§9); simulation core separated (R-A1); seeded RNG (R-A2); `data/parts.js` with tags (R-A3); tabs | S1–S11 pass; site opens by double-click offline |
| P2 Wiring view | Live diagram, shared part cards, clickable machine parts (I4) | S14–S18 pass |
| P3 3D | `make_bin.py` → `.glb`, `.model.js`, `.blend`; vendored Three.js r147; 3D view | S29–S33 pass; S19 passes with 3D |
| P4 Values & code | Measured values panel; const lines panel | S12, S13 pass |
| P5 Controls | Pause/step (I3), live graph (I2), drag-and-drop + shortcuts (I8) | S24, S25, S28 pass |
| P6 Faults | Fault injection + mystery mode (I1) | S21–S23 pass |
| P7 Testing & demo | Scenario runner (I5), batch stats (I7), guided demo (I6) | Runner shows all automatic scenarios green; S26, S27 pass |
| P8 Release | README, LICENSE, personal-info check (R-D6), projector check, GitHub Pages | S19, S20 pass |
| Everything else in §5 | Implemented | Verify against S1–S11 |
