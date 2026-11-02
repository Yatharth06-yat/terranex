#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <DHT.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>

// ---------------- EDIT THESE ----------------
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
// Laptop IPv4 address + Flask port. Do not use the gateway IP.
const char* SERVER_URL = "http://192.168.1.25:5000";
// --------------------------------------------

#define IN1 25
#define IN2 26
#define IN3 27
#define IN4 23
#define MOTOR_SPEED 128   // 8-bit PWM: 128 is about 50%

#define TRIG_FRONT 16
#define ECHO_FRONT 19
#define TRIG_LEFT 17
#define ECHO_LEFT 21
#define TRIG_RIGHT 18
#define ECHO_RIGHT 22

#define ENCODER_PIN 33
#define MQ2_PIN 34
#define MQ4_PIN 35
#define CO_PIN 32
#define DHT_PIN 5
#define DHT_TYPE DHT11

#define I2C_SDA 13
#define I2C_SCL 14
#define MPU_ADDR 0x68

DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_BME280 bme;
bool bmeAvailable = false;
volatile unsigned long encoderTicks = 0;
String currentCommand = "stop";
unsigned long lastTelemetry = 0;
unsigned long lastCommandPoll = 0;

void IRAM_ATTR encoderISR() { encoderTicks++; }

void stopMotors() {
  analogWrite(IN1, 0); analogWrite(IN2, 0);
  analogWrite(IN3, 0); analogWrite(IN4, 0);
}
void motorA(int direction) {
  if (direction > 0) { analogWrite(IN1, MOTOR_SPEED); digitalWrite(IN2, LOW); }
  else if (direction < 0) { analogWrite(IN1, 0); analogWrite(IN2, MOTOR_SPEED); }
  else { analogWrite(IN1, 0); analogWrite(IN2, 0); }
}
void motorB(int direction) {
  if (direction > 0) { analogWrite(IN3, MOTOR_SPEED); digitalWrite(IN4, LOW); }
  else if (direction < 0) { analogWrite(IN3, 0); analogWrite(IN4, MOTOR_SPEED); }
  else { analogWrite(IN3, 0); analogWrite(IN4, 0); }
}
void drive(String cmd) {
  if (cmd == "forward") { motorA(1); motorB(1); }
  else if (cmd == "backward") { motorA(-1); motorB(-1); }
  else if (cmd == "left") { motorA(-1); motorB(1); }
  else if (cmd == "right") { motorA(1); motorB(-1); }
  else stopMotors();
}

float readDistance(int trig, int echo) {
  digitalWrite(trig, LOW); delayMicroseconds(3);
  digitalWrite(trig, HIGH); delayMicroseconds(10);
  digitalWrite(trig, LOW);
  unsigned long duration = pulseIn(echo, HIGH, 25000);
  if (duration == 0) return -1;
  return duration * 0.0343f / 2.0f;
}

bool readMPU(float &tiltX, float &tiltY) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDR, 6, true) != 6) return false;
  int16_t ax = (Wire.read() << 8) | Wire.read();
  int16_t ay = (Wire.read() << 8) | Wire.read();
  int16_t az = (Wire.read() << 8) | Wire.read();
  tiltX = atan2((float)ay, (float)az) * 180.0f / PI;
  tiltY = atan2(-(float)ax, sqrt((float)ay * ay + (float)az * az)) * 180.0f / PI;
  return true;
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(500); Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("ESP32 IP: "); Serial.println(WiFi.localIP());
  } else Serial.println("Wi-Fi not connected; will retry in loop.");
}

void pollCommand() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/command/current";
  http.begin(url);
  http.setTimeout(1500);
  int code = http.GET();
  if (code == 200) {
    DynamicJsonDocument doc(512);
    if (deserializeJson(doc, http.getString()) == DeserializationError::Ok) {
      const char* c = doc["command"] | "stop";
      currentCommand = String(c);
    }
  }
  http.end();
}

void sendTelemetry(float front, float left, float right, float temp, float humidity,
                   float pressure, float tiltX, float tiltY) {
  if (WiFi.status() != WL_CONNECTED) return;
  DynamicJsonDocument doc(1024);
  doc["rover_id"] = "ROVER_1";
  doc["online"] = true;
  doc["front_cm"] = front;
  doc["left_cm"] = left;
  doc["right_cm"] = right;
  doc["encoder_ticks"] = (unsigned long)encoderTicks;
  doc["mq2_raw"] = analogRead(MQ2_PIN);
  doc["mq4_raw"] = analogRead(MQ4_PIN);
  doc["co_raw"] = analogRead(CO_PIN);
  doc["temperature_c"] = temp;
  doc["humidity_pct"] = humidity;
  doc["pressure_hpa"] = pressure;
  doc["tilt_x"] = tiltX;
  doc["tilt_y"] = tiltY;
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["command"] = currentCommand;

  String body;
  serializeJson(doc, body);
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/telemetry");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2500);
  int code = http.POST(body);
  Serial.printf("Telemetry HTTP: %d\n", code);
  if (code < 0) Serial.println(http.errorToString(code));
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  analogWriteResolution(8); // ESP32 Arduino core 2.0.14: set once, not per pin
  stopMotors();

  pinMode(TRIG_FRONT, OUTPUT); pinMode(ECHO_FRONT, INPUT);
  pinMode(TRIG_LEFT, OUTPUT); pinMode(ECHO_LEFT, INPUT);
  pinMode(TRIG_RIGHT, OUTPUT); pinMode(ECHO_RIGHT, INPUT);
  pinMode(ENCODER_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENCODER_PIN), encoderISR, RISING);

  analogReadResolution(12);
  Wire.begin(I2C_SDA, I2C_SCL);
  dht.begin();
  bmeAvailable = bme.begin(0x76);
  if (!bmeAvailable) bmeAvailable = bme.begin(0x77);
  Serial.println(bmeAvailable ? "BME280 detected" : "BME280 not detected");
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(100);
  }

  float front = readDistance(TRIG_FRONT, ECHO_FRONT);
  float left = readDistance(TRIG_LEFT, ECHO_LEFT);
  float right = readDistance(TRIG_RIGHT, ECHO_RIGHT);

  // Manual command is accepted only when the front path is clear.
  // If the front sensor reports an obstacle, stop forward motion.
  String effective = currentCommand;
  if (effective == "forward" && front > 0 && front < 25) effective = "stop";
  if (effective == "forward" && front < 0) effective = "stop";
  drive(effective);

  if (millis() - lastCommandPoll >= 250) {
    lastCommandPoll = millis();
    pollCommand();
  }

  if (millis() - lastTelemetry >= 1000) {
    lastTelemetry = millis();
    float temp = dht.readTemperature();
    float humidity = dht.readHumidity();
    float pressure = bmeAvailable ? bme.readPressure() / 100.0f : NAN;
    float tiltX = NAN, tiltY = NAN;
    readMPU(tiltX, tiltY);
    sendTelemetry(front, left, right, temp, humidity, pressure, tiltX, tiltY);
  }
  delay(30);
}
