/*
  Bench test for the compactor bin parts, one part at a time.

  1. Upload this sketch.
  2. Open Tools > Serial Monitor, set 9600 baud.
  3. Type a number and press Enter:

     1  Slot sensor   (HC-SR04 on D2 TRIG, D3 ECHO)   prints distance for 15 s
     2  Fill sensor   (HC-SR04 on D4 TRIG, D7 ECHO)   prints distance for 15 s
     3  Servo         (signal D9, power from a separate 5V supply)  0 -> 90 -> 0, three times
     4  Push button   (A3 to GND)                      shows presses for 15 s
     5  E-stop        (A4 through the NC contact to GND) shows pressed / released for 15 s
     6  Buzzer        (D12)                            three beeps
     7  LEDs          (A0 green, A1 yellow, A2 red, each through 220 ohm)  cycles 3 times
     8  Actuator      (BTS7960: D5 RPWM, D6 LPWM, D8 enable; needs 12V on B+ / B-)
                      asks before moving: 3 s out, pause, 3 s back

  Pins match compactor_bin.ino, except A4, which is only used here for the E-stop test.
*/

#include <Servo.h>

const int SLOT_TRIG = 2, SLOT_ECHO = 3;
const int FILL_TRIG = 4, FILL_ECHO = 7;
const int ACT_RPWM = 5, ACT_LPWM = 6, ACT_EN = 8;
const int SERVO_PIN = 9;
const int BUZZER = 12;
const int LED_GREEN = A0, LED_YELLOW = A1, LED_RED = A2;
const int BUTTON = A3;
const int ESTOP = A4;

Servo lid;

long readCm(int trig, int echo) {
  digitalWrite(trig, LOW);  delayMicroseconds(2);
  digitalWrite(trig, HIGH); delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long us = pulseIn(echo, HIGH, 25000);
  if (us == 0) return -1;            // no echo
  return us / 58;
}

// true when a real key (not a line ending) is waiting
bool keyWaiting() {
  while (Serial.available()) {
    int c = Serial.peek();
    if (c == '\n' || c == '\r') { Serial.read(); continue; }
    return true;
  }
  return false;
}
void clearInput() { while (Serial.available()) Serial.read(); }

void menu() {
  Serial.println();
  Serial.println(F("=== Compactor bin bench test ==="));
  Serial.println(F("1 Slot sensor   2 Fill sensor   3 Servo   4 Button"));
  Serial.println(F("5 E-stop        6 Buzzer        7 LEDs    8 Actuator"));
  Serial.println(F("Type a number and press Enter. Type any key to stop a running test."));
}

void sensorTest(const char *name, int trig, int echo) {
  Serial.print(F("-- ")); Serial.print(name); Serial.println(F(": distance every 0.25 s for 15 s"));
  unsigned long t0 = millis();
  while (millis() - t0 < 15000 && !keyWaiting()) {
    long cm = readCm(trig, echo);
    if (cm < 0) Serial.println(F("no echo (check wiring, or nothing within 4 m)"));
    else { Serial.print(cm); Serial.println(F(" cm")); }
    delay(250);
  }
}

void servoTest() {
  Serial.println(F("-- Servo: 0 -> 90 -> 0, three times"));
  lid.attach(SERVO_PIN);
  for (int i = 0; i < 3; i++) {
    lid.write(0);  delay(800);
    lid.write(90); delay(800);
  }
  lid.write(0); delay(800);
  lid.detach();
  Serial.println(F("Done. If the Arduino restarted during this test, the servo is not on its own 5V supply."));
}

void inputTest(const char *name, int pin, const char *lowMeans, const char *highMeans) {
  pinMode(pin, INPUT_PULLUP);
  Serial.print(F("-- ")); Serial.print(name); Serial.println(F(": press and release it. Showing changes for 15 s"));
  int last = -1;
  unsigned long t0 = millis();
  while (millis() - t0 < 15000 && !keyWaiting()) {
    int v = digitalRead(pin);
    if (v != last) { Serial.println(v == LOW ? lowMeans : highMeans); last = v; }
    delay(20);
  }
}

void buzzerTest() {
  Serial.println(F("-- Buzzer: three beeps"));
  for (int i = 0; i < 3; i++) { digitalWrite(BUZZER, HIGH); delay(150); digitalWrite(BUZZER, LOW); delay(250); }
}

void ledTest() {
  Serial.println(F("-- LEDs: green, yellow, red, three times"));
  int pins[3] = { LED_GREEN, LED_YELLOW, LED_RED };
  for (int r = 0; r < 3; r++)
    for (int i = 0; i < 3; i++) { digitalWrite(pins[i], HIGH); delay(400); digitalWrite(pins[i], LOW); }
}

void actuatorStop() { analogWrite(ACT_RPWM, 0); analogWrite(ACT_LPWM, 0); }

void actuatorTest() {
  Serial.println(F("-- Actuator through the BTS7960"));
  Serial.println(F("Check: 12V on B+ / B-, actuator on M+ / M-, rod free to move, hands clear."));
  Serial.println(F("Type y and Enter to start, anything else to cancel."));
  clearInput();
  while (!keyWaiting()) {}
  char c = Serial.read(); clearInput();
  if (c != 'y' && c != 'Y') { Serial.println(F("Cancelled.")); return; }
  digitalWrite(ACT_EN, HIGH);
  Serial.println(F("Extending 3 s (RPWM)..."));
  analogWrite(ACT_LPWM, 0); analogWrite(ACT_RPWM, 255); delay(3000);
  actuatorStop(); delay(1000);
  Serial.println(F("Retracting 3 s (LPWM)..."));
  analogWrite(ACT_RPWM, 0); analogWrite(ACT_LPWM, 255); delay(3000);
  actuatorStop();
  digitalWrite(ACT_EN, LOW);
  Serial.println(F("Done. The rod should have moved out about 2 cm, then back."));
}

void setup() {
  Serial.begin(9600);
  pinMode(SLOT_TRIG, OUTPUT); pinMode(SLOT_ECHO, INPUT);
  pinMode(FILL_TRIG, OUTPUT); pinMode(FILL_ECHO, INPUT);
  pinMode(ACT_RPWM, OUTPUT); pinMode(ACT_LPWM, OUTPUT); pinMode(ACT_EN, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(LED_GREEN, OUTPUT); pinMode(LED_YELLOW, OUTPUT); pinMode(LED_RED, OUTPUT);
  actuatorStop(); digitalWrite(ACT_EN, LOW);
  menu();
}

void loop() {
  if (!keyWaiting()) return;
  char c = Serial.read();
  delay(50); clearInput();
  switch (c) {
    case '1': sensorTest("Slot sensor", SLOT_TRIG, SLOT_ECHO); break;
    case '2': sensorTest("Fill sensor", FILL_TRIG, FILL_ECHO); break;
    case '3': servoTest(); break;
    case '4': inputTest("Push button", BUTTON, "PRESSED", "released"); break;
    case '5': inputTest("E-stop", ESTOP, "released (contact closed, normal)", "PRESSED (contact open, stop)"); break;
    case '6': buzzerTest(); break;
    case '7': ledTest(); break;
    case '8': actuatorTest(); break;
    default: return;
  }
  clearInput();
  menu();
}
