/*
  Automatic Bottle Compactor Bin
  Arduino UNO + HC-SR04 x2 + MG996R servo (lid) + BTS7960 + 12V linear actuator

  FLOW (bottles are pressed in bundles, not one by one)
    1. Idle (green LED). Slot sensor watches the opening.
    2. Something stays in front of the slot  -> servo opens lid.
    3. Bottle drops onto the pile / object leaves -> lid closes. No crushing yet.
    4. Fill sensor (on the housing floor, looking down) sees the pile reach
       the crush line (closer than BUNDLE_CM for a full second,
       so falling bottles don't count)          -> press the whole pile:
       actuators extend, then retract (yellow LED).
    5. Right after the press, the pile is still closer than FULL_CM
       -> bin full: red LED + buzzer, lid stays locked until it is emptied.
    Push button = press now, without waiting for the fill sensor.
    E-STOP is HARDWARE: wire it in series with the +12V line going to the BTS7960.

  WIRING
    HC-SR04 #1 (slot)   TRIG D2  ECHO D3   VCC 5V  GND GND
    HC-SR04 #2 (fill)   TRIG D4  ECHO D7   VCC 5V  GND GND
    BTS7960             RPWM D5  LPWM D6   R_EN+L_EN D8   VCC 5V  GND GND
                        B+ / B-  <- 12V PSU (through fuse + E-stop)
                        M+ / M-  -> actuator red / black (swap if direction is reversed)
    MG996R servo        signal D9, power from the 5V 5A PSU (NOT the Arduino 5V pin)
    Buzzer D12 | LEDs: green A0, yellow A1, red A2 (each with 220 ohm resistor)
    Push button A3 -> GND (uses internal pull-up)

    ALL GROUNDS MUST BE CONNECTED: Arduino GND, 5V PSU -, 12V PSU -, BTS7960 GND.
*/

#include <Servo.h>

// ---------- Pins ----------
const int SLOT_TRIG = 2, SLOT_ECHO = 3;
const int FILL_TRIG = 4, FILL_ECHO = 7;
const int ACT_RPWM = 5, ACT_LPWM = 6, ACT_EN = 8;
const int SERVO_PIN = 9;
const int BUZZER = 12;
const int LED_GREEN = A0, LED_YELLOW = A1, LED_RED = A2;
const int BTN = A3;

// ---------- Tuning (adjust while testing) ----------
const int DETECT_CM = 12;              // object closer than this to slot sensor = bottle present
const int BUNDLE_CM = 12;              // pile top closer than this to fill sensor = press the bundle
const unsigned long BUNDLE_HOLD_MS = 1000; // pile must read under BUNDLE_CM this long:
                                       // a bottle falling past the sensor only blocks it for a moment
const int FULL_CM = 15;                // still closer than this right after a press = bin full
const int LID_CLOSED = 0;              // servo angle when closed
const int LID_OPEN = 90;               // servo angle when open
const unsigned long STROKE_MS = 31000; // 200 mm stroke / 7 mm/s ~= 29 s, plus margin.
                                       // Actuator has internal limit switches, so overrunning is OK.
const unsigned long LID_TIMEOUT_MS = 8000;

Servo lid;

long readCm(int trig, int echo) {
  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long us = pulseIn(echo, HIGH, 25000); // ~4 m max
  if (us == 0) return 999;              // no echo = nothing there
  return us / 58;
}

// Require several consistent readings so noise doesn't open the lid
bool objectAtSlot() {
  int hits = 0;
  for (int i = 0; i < 5; i++) {
    if (readCm(SLOT_TRIG, SLOT_ECHO) < DETECT_CM) hits++;
    delay(40);
  }
  return hits >= 4;
}

// 2 of 3 fill-sensor readings closer than limitCm
bool pileCloserThan(int limitCm) {
  int hits = 0;
  for (int i = 0; i < 3; i++) {
    if (readCm(FILL_TRIG, FILL_ECHO) < limitCm) hits++;
    delay(40);
  }
  return hits >= 2;
}

// every reading for BUNDLE_HOLD_MS closer than limitCm (stops at the first one that isn't)
bool pileSteadyCloserThan(int limitCm) {
  unsigned long t0 = millis();
  while (millis() - t0 < BUNDLE_HOLD_MS) {
    if (readCm(FILL_TRIG, FILL_ECHO) >= limitCm) return false;
    delay(40);
  }
  return true;
}

bool binFull = false;   // set after a press that could not get the pile below FULL_CM

void leds(bool g, bool y, bool r) {
  digitalWrite(LED_GREEN, g);
  digitalWrite(LED_YELLOW, y);
  digitalWrite(LED_RED, r);
}

void actuatorStop()    { analogWrite(ACT_RPWM, 0);   analogWrite(ACT_LPWM, 0); }
void actuatorExtend()  { analogWrite(ACT_LPWM, 0);   analogWrite(ACT_RPWM, 255); }
void actuatorRetract() { analogWrite(ACT_RPWM, 0);   analogWrite(ACT_LPWM, 255); }

void beep(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER, HIGH); delay(120);
    digitalWrite(BUZZER, LOW);  delay(120);
  }
}

void compress() {
  leds(false, true, false);
  lid.write(LID_CLOSED);   // safety: lid must be closed while crushing
  delay(800);
  beep(2);

  actuatorExtend();
  delay(STROKE_MS);
  actuatorStop();
  delay(500);

  actuatorRetract();
  delay(STROKE_MS);
  actuatorStop();
  beep(1);

  // still high after pressing? then there is no room left
  if (pileCloserThan(FULL_CM)) binFull = true;
}

void setup() {
  Serial.begin(9600);
  pinMode(SLOT_TRIG, OUTPUT); pinMode(SLOT_ECHO, INPUT);
  pinMode(FILL_TRIG, OUTPUT); pinMode(FILL_ECHO, INPUT);
  pinMode(ACT_RPWM, OUTPUT);  pinMode(ACT_LPWM, OUTPUT);
  pinMode(ACT_EN, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(LED_GREEN, OUTPUT); pinMode(LED_YELLOW, OUTPUT); pinMode(LED_RED, OUTPUT);
  pinMode(BTN, INPUT_PULLUP);

  digitalWrite(ACT_EN, HIGH);
  actuatorStop();
  lid.attach(SERVO_PIN);
  lid.write(LID_CLOSED);

  // Start from a known position: fully retracted
  leds(false, true, false);
  actuatorRetract();
  delay(STROKE_MS);
  actuatorStop();
  beep(1);
}

void loop() {
  // 1. Full? lock the lid and alarm until someone empties the bin
  if (binFull) {
    leds(false, false, true);
    lid.write(LID_CLOSED);
    beep(3);
    delay(2000);
    if (!pileCloserThan(FULL_CM + 5)) binFull = false;   // emptied (5 cm margin against noise)
    return;
  }

  leds(true, false, false);

  // 2. Manual press button
  if (digitalRead(BTN) == LOW) {
    compress();
    return;
  }

  // 3. Pile reached the crush line and stays there -> press the whole bundle.
  //    Only checked here, with the lid closed, and it must hold for 1 s,
  //    so a bottle falling past the fill sensor never starts a press.
  if (pileSteadyCloserThan(BUNDLE_CM)) {
    Serial.println("Bundle ready");
    compress();
    return;
  }

  // 4. Bottle at the slot -> open lid, let it drop onto the pile
  if (objectAtSlot()) {
    Serial.println("Bottle detected");
    lid.write(LID_OPEN);
    delay(1000);

    // wait until the bottle has been dropped (sensor clear) or timeout
    unsigned long t0 = millis();
    while (millis() - t0 < LID_TIMEOUT_MS) {
      if (readCm(SLOT_TRIG, SLOT_ECHO) >= DETECT_CM) break;
      delay(100);
    }
    delay(1500); // give the hand time to move away
    lid.write(LID_CLOSED);
    delay(1000);
    // no crush here: the fill sensor decides when the pile is pressed
  }

  delay(100);
}
