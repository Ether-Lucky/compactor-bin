/* The one parts table (SPEC R-A3).
   Everything after "var PARTS =" up to the final semicolon must stay strict JSON:
   the Blender script (assets/blender/make_bin.py) and the tests read this file too.
   Tags: L = product listing/label, D = datasheet, C = compactor_bin.ino, G = group's drawing,
         E = estimate (replace with a measurement), P = proposed design choice. */
var PARTS = {
  "version": "1.0",
  "tags": {
    "L": "Product listing or label",
    "D": "Datasheet",
    "C": "compactor_bin.ino",
    "G": "Group's drawing",
    "E": "Estimate: replace with a measurement",
    "P": "Proposed design choice"
  },

  "geometry": {
    "inner_w":        {"v": 380, "unit": "mm", "tag": "G", "label": "Inside width"},
    "inner_d":        {"v": 380, "unit": "mm", "tag": "E", "label": "Inside depth"},
    "wall":           {"v": 12,  "unit": "mm", "tag": "E", "label": "Plywood wall thickness"},
    "housing_h":      {"v": 360, "unit": "mm", "tag": "E", "label": "Actuator housing height"},
    "chamber_h":      {"v": 200, "unit": "mm", "tag": "G", "label": "Crush chamber height"},
    "storage_h":      {"v": 600, "unit": "mm", "tag": "G", "label": "Storage height"},
    "base_h":         {"v": 120, "unit": "mm", "tag": "E", "label": "Base with drain funnel"},
    "slot_w":         {"v": 100, "unit": "mm", "tag": "P", "label": "Slot opening"},
    "slot_len":       {"v": 140, "unit": "mm", "tag": "P", "label": "Slot tube length"},
    "sensor_recess":  {"v": 30,  "unit": "mm", "tag": "P", "label": "Slot sensor set back in wall"},
    "act_len":        {"v": 330, "unit": "mm", "tag": "E", "label": "Actuator length, retracted"},
    "act_offset":     {"v": 90,  "unit": "mm", "tag": "P", "label": "Actuator distance from center"},
    "plate_t":        {"v": 6,   "unit": "mm", "tag": "P", "label": "Crusher plate thickness"},
    "trap_t":         {"v": 12,  "unit": "mm", "tag": "P", "label": "Trapdoor thickness"}
  },

  "params": {
    "act_force":      {"v": 1500, "unit": "N",    "tag": "L", "label": "Actuator rated force (each)"},
    "act_stroke":     {"v": 200,  "unit": "mm",   "tag": "L", "label": "Actuator stroke"},
    "act_speed":      {"v": 7,    "unit": "mm/s", "tag": "L", "label": "Actuator speed, no load"},
    "act_speed_loss": {"v": 40,   "unit": "%",    "tag": "E", "label": "Speed lost at rated force", "edit": true, "min": 0, "max": 90},
    "act_i_free":     {"v": 1.0,  "unit": "A",    "tag": "E", "label": "Current, no load (each)", "edit": true, "min": 0.1, "max": 10},
    "act_i_rated":    {"v": 5.0,  "unit": "A",    "tag": "E", "label": "Current at rated force (each)", "edit": true, "min": 0.5, "max": 20},
    "act_i_stall":    {"v": 6.0,  "unit": "A",    "tag": "E", "label": "Current when stalled (each)", "edit": true, "min": 0.5, "max": 25},
    "psu12_a":        {"v": 15,   "unit": "A",    "tag": "L", "label": "12V supply capacity"},
    "psu5_a":         {"v": 5,    "unit": "A",    "tag": "L", "label": "5V supply capacity"},
    "bts_a":          {"v": 43,   "unit": "A",    "tag": "L", "label": "BTS7960 max current"},
    "servo_s60":      {"v": 0.17, "unit": "s/60°","tag": "D", "label": "MG996R speed"},
    "us_per_cm":      {"v": 58,   "unit": "µs/cm","tag": "D", "label": "HC-SR04 echo time per cm"},
    "us_min_cm":      {"v": 2,    "unit": "cm",   "tag": "D", "label": "HC-SR04 minimum range"},
    "sensor_noise":   {"v": 0.12, "unit": "cm",   "tag": "E", "label": "Sensor reading noise", "edit": true, "min": 0, "max": 3},
    "fuse_blow_x":    {"v": 1.2,  "unit": "×",    "tag": "E", "label": "Overload that blows the fuse in ~2 s"},
    "pile_pack":      {"v": 2.2,  "unit": "×",    "tag": "E", "label": "Loose packing of crushed items", "edit": true, "min": 1, "max": 5}
  },

  "program": {
    "DETECT_CM":      {"v": 12,    "unit": "cm", "tag": "C", "label": "Object closer than this = present"},
    "FULL_CM":        {"v": 15,    "unit": "cm", "tag": "C", "label": "Pile closer than this = full"},
    "LID_OPEN":       {"v": 90,    "unit": "°",  "tag": "C", "label": "Servo angle, lid open"},
    "LID_CLOSED":     {"v": 0,     "unit": "°",  "tag": "C", "label": "Servo angle, lid closed"},
    "STROKE_MS":      {"v": 31000, "unit": "ms", "tag": "C", "label": "Crush / retract timer"},
    "LID_TIMEOUT_MS": {"v": 8000,  "unit": "ms", "tag": "C", "label": "Max wait for the drop"},
    "SAMPLE_GAP_MS":  {"v": 40,    "unit": "ms", "tag": "C", "label": "Time between readings"},
    "SAMPLE_COUNT":   {"v": 5,     "unit": "",   "tag": "C", "label": "Readings per check"},
    "OPEN_WAIT_MS":   {"v": 1000,  "unit": "ms", "tag": "C", "label": "Wait after opening lid"},
    "CLEAR_WAIT_MS":  {"v": 1500,  "unit": "ms", "tag": "C", "label": "Wait for the hand to move away"},
    "CLOSE_WAIT_MS":  {"v": 1000,  "unit": "ms", "tag": "C", "label": "Wait after closing lid"},
    "PRECRUSH_MS":    {"v": 800,   "unit": "ms", "tag": "C", "label": "Wait before warning beeps"},
    "BEEP_MS":        {"v": 120,   "unit": "ms", "tag": "C", "label": "Beep length"},
    "PAUSE_MS":       {"v": 500,   "unit": "ms", "tag": "C", "label": "Pause between down and up"},
    "FULL_RECHECK_MS":{"v": 2000,  "unit": "ms", "tag": "C", "label": "Full-bin recheck interval"}
  },

  "detection": {
    "W_MIN": {"v": 5.5, "unit": "cm", "tag": "P", "label": "Narrowest accepted width"},
    "W_MAX": {"v": 9.5, "unit": "cm", "tag": "P", "label": "Widest accepted width"},
    "W_STD": {"v": 0.5, "unit": "cm", "tag": "P", "label": "Max width wobble"},
    "W_SAMPLES": {"v": 10, "unit": "", "tag": "P", "label": "Readings used for the width check"}
  },

  "items": {
    "pet500":   {"name": "PET bottle 500 mL", "mat": "PET plastic", "Z": 2.9, "w": 6.5, "len": 200, "h": 65, "metal": false, "drops": true, "giveUp": 4, "crushN": 250, "final": 15, "jitter": 0.05, "dropout": 0.06, "color": "pet", "shape": "bottle", "bottle": true, "key": "1"},
    "pet15":    {"name": "PET bottle 1.5 L", "mat": "PET plastic", "Z": 2.9, "w": 9.0, "len": 300, "h": 90, "metal": false, "drops": true, "giveUp": 4, "crushN": 400, "final": 22, "jitter": 0.05, "dropout": 0.08, "color": "pet", "shape": "bottle", "bottle": true, "key": "2"},
    "can":      {"name": "Aluminum can", "mat": "Aluminum", "Z": 17, "w": 6.6, "len": 115, "h": 66, "metal": true, "drops": true, "giveUp": 4, "crushN": 450, "final": 14, "jitter": 0.03, "dropout": 0.03, "color": "can", "shape": "can", "key": "3"},
    "glass":    {"name": "Glass bottle", "mat": "Glass", "Z": 13, "w": 6.8, "len": 230, "h": 68, "metal": false, "drops": true, "giveUp": 4, "crushN": 5000, "final": 68, "jitter": 0.03, "dropout": 0.04, "color": "glass", "shape": "bottle", "key": "4", "note": "Wrong material: glass won't crush at 3000N and could shatter. The sensors can't tell it from plastic."},
    "carton":   {"name": "Juice carton", "mat": "Paperboard", "Z": 0.8, "w": 5.6, "len": 110, "h": 40, "metal": false, "drops": true, "giveUp": 4, "crushN": 120, "final": 8, "jitter": 0.05, "dropout": 0.02, "color": "carton", "shape": "box", "key": "5"},
    "handHeld": {"name": "Hand, held still", "mat": "Skin", "Z": 1.6, "w": 9.2, "wMin": 8.8, "wMax": 11, "len": 180, "h": 90, "metal": false, "drops": false, "giveUp": 3, "jitter": 1.5, "dropout": 0.05, "color": "hand", "shape": "hand", "key": "6"},
    "handWave": {"name": "Hand, waved past", "mat": "Skin", "Z": 1.6, "w": 9.2, "wMin": 8.8, "wMax": 11, "len": 180, "h": 90, "metal": false, "drops": false, "giveUp": 0.6, "beam": [0.06, 0.16], "jitter": 1.5, "dropout": 0.05, "color": "hand", "shape": "hand", "key": "7"}
  },
  "itemTags": {"crushN": "E", "final": "E", "dropout": "E", "w": "E"},

  "faults": {
    "F1": {"name": "Loose common ground", "symptom": "Readings jump randomly, the servo twitches, the actuator ignores commands.", "fix": "Join 12V PSU −, 5V PSU −, Arduino GND and BTS7960 GND on one terminal and tighten it."},
    "F2": {"name": "Slot sensor unplugged", "symptom": "The echo never comes back (0 µs), so nothing is ever detected.", "fix": "Reconnect the slot sensor's VCC, TRIG, ECHO and GND (D2/D3)."},
    "F3": {"name": "Actuator wires reversed", "symptom": "The plate goes up when told to crush and down when told to retract.", "fix": "Swap the two actuator wires on the BTS7960 M+ / M− terminals."},
    "F4": {"name": "Servo signal on the wrong pin", "symptom": "The lid never opens, so bottles can't drop in.", "fix": "Move the servo's orange signal wire to D9."},
    "F5": {"name": "Servo powered from the Arduino 5V pin", "symptom": "The Arduino restarts every time the lid starts to open.", "fix": "Power the servo from the 5V 5A supply, sharing ground with the Arduino."},
    "F6": {"name": "Driver enable pins not connected", "symptom": "D5/D6 switch on, but the actuator never moves and draws 0A.", "fix": "Connect R_EN and L_EN together to D8 (or to 5V)."},
    "F7": {"name": "Fill sensor blocked", "symptom": "The bin always reads full and the lid stays locked.", "fix": "Clear whatever is in front of the fill sensor, or re-aim it at the pile."}
  },

  "parts": {
    "arduino":  {"name": "Arduino UNO R3", "role": "The brain. Reads the sensors and button, runs the program, and gives orders to the servo, driver, LEDs and buzzer.", "specs": [["Logic", "5V", "L"], ["Pin current", "~20 mA", "D"]], "pins": ["D2–D9", "D12", "A0–A3", "5V", "GND"]},
    "slot1":    {"name": "HC-SR04 slot sensor (S1)", "role": "Measures distance across the slot with sound pulses. An object closer than 12 cm counts as present.", "specs": [["Range", "2–400 cm", "D"], ["Beam", "15°", "D"], ["Echo", "58 µs per cm", "D"]], "pins": ["TRIG D2", "ECHO D3", "VCC 5V", "GND"]},
    "slot2":    {"name": "HC-SR04 slot sensor (S2)", "role": "Faces S1 from the other side so the two can measure an object's width. Needs new code.", "specs": [["Range", "2–400 cm", "D"]], "pins": ["TRIG / ECHO: pins to be chosen"]},
    "metal":    {"name": "Inductive metal sensor", "role": "Detects metal only, so cans can be refused. Optional purchase, needs new code.", "specs": [["Example", "LJ12A3-4-Z/BX", "P"], ["Price", "≈₱150–300", "E"]], "pins": ["Signal: pin to be chosen"]},
    "fill":     {"name": "HC-SR04 fill sensor", "role": "Looks down at the pile in storage. Closer than 15 cm means the bin is full.", "specs": [["Range", "2–400 cm", "D"]], "pins": ["TRIG D4", "ECHO D7", "VCC 5V", "GND"]},
    "servo":    {"name": "MG996R servo (lid)", "role": "Swings the lid open to 90° and closed to 0°.", "specs": [["Speed", "0.17 s per 60°", "D"], ["Torque", "~10 kg·cm", "D"], ["Peak current", "2A+", "D"]], "pins": ["Signal D9", "Power from 5V PSU", "GND shared"]},
    "bts":      {"name": "BTS7960 motor driver", "role": "The muscle switch. The Arduino says up or down; the driver sends 12V to the actuators in that direction.", "specs": [["Max current", "43A", "L"], ["Logic", "5V", "L"]], "pins": ["RPWM D5", "LPWM D6", "R_EN + L_EN D8", "VCC 5V", "GND", "B+ / B− from 12V", "M+ / M− to actuators"]},
    "actuator": {"name": "Linear actuators (×2)", "role": "Electric push-rods that drive the crusher plate down and back up. Built-in limit switches stop them at each end.", "specs": [["Force", "1500N each", "L"], ["Stroke", "200 mm", "L"], ["Speed", "7 mm/s", "L"], ["Voltage", "12V DC", "L"], ["Stall current", "~6A each", "E"]], "pins": ["Red / black to BTS7960 M+ / M−"]},
    "psu12":    {"name": "12V 15A power supply", "role": "Turns 220V wall power into 12V for the actuators.", "specs": [["Output", "12V 15A", "L"]], "pins": ["L / N / ⏚ from the 220V cord", "+V to fuse", "−V to ground bus"]},
    "psu5":     {"name": "5V 5A power supply", "role": "Powers the servo and the Arduino, keeping servo current spikes away from the Arduino.", "specs": [["Output", "5V 5A", "L"]], "pins": ["L / N / ⏚ from the 220V cord", "+V to servo and Arduino 5V", "−V to ground bus"]},
    "buck":     {"name": "Buck converter 12V → 5V", "role": "Backup way to power the Arduino from the 12V supply through its USB cable.", "specs": [["Output", "5V USB", "L"]], "pins": ["In: 12V", "Out: USB to Arduino"]},
    "fuse":     {"name": "Fuse", "role": "A deliberate weak link right after the 12V supply. Burns out instead of the wires if the current gets too high.", "specs": [["Use", "15A for two actuators, 10A for one", "P"]], "pins": ["In: 12V PSU +V", "Out: E-stop"]},
    "estop":    {"name": "Emergency stop", "role": "Cuts 12V to the actuators instantly, whatever the program is doing.", "specs": [["Rating", "10A", "L"], ["Contact", "Normally closed", "L"]], "pins": ["In: fuse", "Out: terminal block → BTS7960 B+"]},
    "terminal": {"name": "Terminal block", "role": "Screw strip where the 12V line splits and all grounds join.", "specs": [["Rating", "15A", "L"]], "pins": ["12V bus", "Ground bus"]},
    "button":   {"name": "Push button (manual crush)", "role": "Runs a crush cycle by hand.", "specs": [["Type", "Momentary", "L"]], "pins": ["A3 to GND"]},
    "leds":     {"name": "Status LEDs", "role": "Green = ready, yellow = crushing, red = full.", "specs": [["Resistor", "220Ω each", "P"]], "pins": ["Green A0", "Yellow A1", "Red A2"]},
    "buzzer":   {"name": "Active buzzer", "role": "Beeps twice before crushing and three times when full.", "specs": [["Voltage", "3–5V", "L"]], "pins": ["D12"]},
    "lid":      {"name": "Lid", "role": "Covers the slot opening. Must be closed before crushing.", "specs": [["Opening", "10 cm", "P"]], "pins": ["Moved by the servo"]},
    "plate":    {"name": "Crusher plate", "role": "Steel plate pushed down by the actuators to flatten the bottle.", "specs": [["Travel", "200 mm", "L"]], "pins": ["Bolted to both actuator rods"]},
    "trapdoor": {"name": "Trapdoor (proposed)", "role": "Floor of the crush chamber that opens to drop crushed bottles into storage. Not in the program yet.", "specs": [["Status", "Proposed", "P"]], "pins": ["Mechanism to be decided"]},
    "outlet":   {"name": "Wall outlet 220V", "role": "Mains power for both supplies. Adults wire this side.", "specs": [["Voltage", "220V AC", "L"]], "pins": ["3-core cord with ground"]}
  }
};
