/*
  Automatic Bottle Compactor Bin
  Arduino UNO + HC-SR04 x2 + MG996R servo (lid) + BTS7960 + 12V linear actuator

  FLOW
    1. Idle (green LED). Slot sensor watches the opening.
    2. Something stays in front of the slot  -> servo opens lid.
    3. Bottle drops in / object leaves        -> lid closes.
    4. Actuator extends (crush), then retracts (yellow LED).
    5. Fill sensor says bin is full           -> red LED + buzzer, lid stays locked.
    Push button = manual compress cycle.
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
const int FULL_CM = 15;                // pile top closer than this to fill sensor = bin full
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

bool binFull() {
  int hits = 0;
  for (int i = 0; i < 3; i++) {
    if (readCm(FILL_TRIG, FILL_ECHO) < FULL_CM) hits++;
    delay(40);
  }
  return hits >= 2;
}

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
  // 1. Full? lock the lid and alarm
  if (binFull()) {
    leds(false, false, true);
    lid.write(LID_CLOSED);
    beep(3);
    delay(2000);
    return;
  }

  leds(true, false, false);

  // 2. Manual compress button
  if (digitalRead(BTN) == LOW) {
    compress();
    return;
  }

  // 3. Bottle at the slot -> open lid
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

    compress();
  }

  delay(100);
}
