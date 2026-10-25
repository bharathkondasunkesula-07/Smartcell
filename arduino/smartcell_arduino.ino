/*
  SmartCell — Battery Testing System Firmware for Arduino Uno
  Hardware:
    - Arduino Uno Rev3
    - Adafruit INA219 DC Voltage & Current Sensor (I2C: A4/SDA, A5/SCL)
    - DS18B20 Digital Temperature Sensor (1-Wire: Digital Pin 2 with 4.7k pullup)
    - MOSFET Gate Control (Digital Pin 7, Active HIGH, Default: LOW / OFF)
    - 18650 3.7V Li-ion Cell Holder

  Serial Protocol (9600 baud, 8N1):
    Outputs 1 JSON object per line every 1000 ms:
    {"type":"measurement","voltage_V":3.720,"current_mA":125.40,"power_mW":466.49,"temperature_C":28.50,"load_state":"OFF","uptime_s":12}

    Sensor error notice:
    {"type":"error","sensor":"DS18B20","message":"Sensor disconnected or invalid CRC"}

    Incoming Commands:
    - "LOAD:ON"     -> Turns MOSFET load ON (with 10-second automatic safety cutoff)
    - "LOAD:OFF"    -> Immediately disables MOSFET load (Gate LOW)
    - "STATUS"      -> Reports hardware check status

  Libraries Required (Install via Arduino IDE Library Manager):
    1. "Adafruit INA219" by Adafruit
    2. "OneWire" by Paul Stoffregen
    3. "DallasTemperature" by Miles Burton
*/

#include <Wire.h>
#include <Adafruit_INA219.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// --- Pin Definitions ---
const uint8_t PIN_ONEWIRE = 7;       // DS18B20 1-Wire data pin (matches D7 pinout, requires 4.7k pullup to 5V)
const uint8_t PIN_MOSFET_GATE = 8;   // N-Channel MOSFET Gate control (via 100 ohm resistor & 10k pulldown to GND)
const uint8_t PIN_STATUS_LED = 13;   // Onboard LED indicates active load or status

// --- Safety & Timing Constants ---
const unsigned long TELEMETRY_INTERVAL_MS = 1000;    // Telemetry rate: 1 Hz
const unsigned long MAX_LOAD_PULSE_MS = 8000;        // Maximum continuous load pulse (safety watchdog)
const float MIN_PLAUSIBLE_VOLTAGE_V = 0.50;          // Below 0.5V indicates disconnected probe
const float MAX_INA219_CURRENT_MA = 3150.0;          // INA219 0.1 ohm shunt ADC saturation bound

// --- Sensor Objects ---
Adafruit_INA219 ina219;
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature dallasSensors(&oneWire);

// --- Operational State ---
bool ina219_present = false;
bool ds18b20_present = false;
bool oled_present = false;
bool load_active = false;
unsigned long load_start_time = 0;
unsigned long last_telemetry_time = 0;
unsigned long start_time_ms = 0;

// Buffer for incoming serial commands
String inputBuffer = "";

// Helper to check if I2C address ACKs
bool checkI2CAddress(uint8_t addr) {
  Wire.beginTransmission(addr);
  return (Wire.endTransmission() == 0);
}

void setup() {
  // 1. Safety First: Ensure MOSFET load is driven LOW immediately
  pinMode(PIN_MOSFET_GATE, OUTPUT);
  digitalWrite(PIN_MOSFET_GATE, LOW);
  load_active = false;

  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_STATUS_LED, LOW);

  // 2. Initialize Serial at 9600 baud
  Serial.begin(9600);
  while (!Serial && millis() < 3000) {
    ; // Wait for USB connection
  }

  // Initialize I2C Bus
  Wire.begin();

  // 3. Initialize INA219 Voltage/Current Sensor (default 0x40)
  if (ina219.begin()) {
    ina219_present = true;
    ina219.setCalibration_32V_2A();
  } else {
    ina219_present = false;
    Serial.println(F("{\"type\":\"error\",\"sensor\":\"INA219\",\"message\":\"Sensor not detected on I2C (0x40). Check SDA/SCL wiring.\"}"));
  }

  // 4. Probe for OLED Display on common I2C addresses 0x3C or 0x3D
  oled_present = checkI2CAddress(0x3C) || checkI2CAddress(0x3D);

  // 5. Initialize DS18B20 Temperature Sensor on Pin D7
  dallasSensors.begin();
  uint8_t deviceCount = dallasSensors.getDeviceCount();
  if (deviceCount > 0) {
    ds18b20_present = true;
    dallasSensors.setResolution(11); // 11-bit resolution = 0.125°C step (~375ms conversion)
    dallasSensors.setWaitForConversion(false); // Non-blocking reads
    dallasSensors.requestTemperatures();
  } else {
    ds18b20_present = false;
    Serial.println(F("{\"type\":\"error\",\"sensor\":\"DS18B20\",\"message\":\"No 1-Wire device found on Pin D7. Check 4.7k pullup resistor.\"}"));
  }

  start_time_ms = millis();
  last_telemetry_time = millis();

  // 6. Send initial boot status
  Serial.print(F("{\"type\":\"status\",\"device\":\"SmartCell Arduino Uno\",\"ina219\":"));
  Serial.print(ina219_present ? F("true") : F("false"));
  Serial.print(F(",\"ds18b20\":"));
  Serial.print(ds18b20_present ? F("true") : F("false"));
  Serial.print(F(",\"oled\":"));
  Serial.print(oled_present ? F("true") : F("false"));
  Serial.print(F(",\"load_state\":\"OFF\",\"firmware_ver\":\"2.1.0\"}\n"));
}

void loop() {
  unsigned long now = millis();

  // --- 1. Process Incoming Serial Commands ---
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (inputBuffer.length() > 0) {
        processCommand(inputBuffer);
        inputBuffer = "";
      }
    } else {
      if (inputBuffer.length() < 64) {
        inputBuffer += c;
      }
    }
  }

  // --- 2. Hardware Safety Watchdog for MOSFET Load ---
  if (load_active) {
    if (now - load_start_time >= MAX_LOAD_PULSE_MS) {
      // Automatic safety cutoff if active longer than max pulse limit
      disableLoad("SAFETY_TIMEOUT_EXCEEDED");
    }
  }

  // --- 3. Periodic Telemetry Emission (1 Hz) ---
  if (now - last_telemetry_time >= TELEMETRY_INTERVAL_MS) {
    last_telemetry_time = now;
    emitTelemetry(now);

    // Request next temperature sample asynchronously
    if (ds18b20_present) {
      dallasSensors.requestTemperatures();
    }
  }
}

void processCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "LOAD:ON") {
    // Enable load with safety bounds check
    enableLoad();
  } else if (cmd == "LOAD:OFF") {
    disableLoad("USER_REQUEST");
  } else if (cmd == "STATUS") {
    Serial.print(F("{\"type\":\"status\",\"ina219\":"));
    Serial.print(ina219_present ? F("true") : F("false"));
    Serial.print(F(",\"ds18b20\":"));
    Serial.print(ds18b20_present ? F("true") : F("false"));
    Serial.print(F(",\"oled\":"));
    Serial.print(oled_present ? F("true") : F("false"));
    Serial.print(F(",\"load_state\":\""));
    Serial.print(load_active ? F("ON") : F("OFF"));
    Serial.println(F("\"}"));
  }
}

void enableLoad() {
  if (!ina219_present) {
    Serial.println(F("{\"type\":\"error\",\"sensor\":\"LOAD\",\"message\":\"Cannot enable load: INA219 is offline.\"}"));
    return;
  }

  // Measure current voltage before connecting load
  float v_bus = ina219.getBusVoltage_V();
  if (v_bus < MIN_PLAUSIBLE_VOLTAGE_V) {
    Serial.println(F("{\"type\":\"error\",\"sensor\":\"LOAD\",\"message\":\"Cannot enable load: No battery detected (< 0.50 V).\"}"));
    return;
  }

  load_active = true;
  load_start_time = millis();
  digitalWrite(PIN_MOSFET_GATE, HIGH);
  digitalWrite(PIN_STATUS_LED, HIGH);

  Serial.println(F("{\"type\":\"load_status\",\"state\":\"ON\",\"message\":\"MOSFET gate energized. Safety timer active.\"}"));
}

void disableLoad(const char* reason) {
  load_active = false;
  digitalWrite(PIN_MOSFET_GATE, LOW);
  digitalWrite(PIN_STATUS_LED, LOW);

  Serial.print(F("{\"type\":\"load_status\",\"state\":\"OFF\",\"reason\":\""));
  Serial.print(reason);
  Serial.println(F("\"}"));
}

void emitTelemetry(unsigned long now) {
  float voltage_V = 0.0;
  float current_mA = 0.0;
  float power_mW = 0.0;
  bool voltage_valid = false;

  // --- Read INA219 ---
  if (ina219_present) {
    float shunt_mV = ina219.getShuntVoltage_mV();
    float bus_V = ina219.getBusVoltage_V();
    current_mA = ina219.getCurrent_mA();
    voltage_V = bus_V + (shunt_mV / 1000.0);
    power_mW = ina219.getPower_mW();

    // Check physical plausibility
    voltage_valid = (voltage_V >= MIN_PLAUSIBLE_VOLTAGE_V);

    // Over-current safety check
    if (abs(current_mA) >= MAX_INA219_CURRENT_MA && load_active) {
      disableLoad("OVERCURRENT_DETECTED");
      Serial.println(F("{\"type\":\"error\",\"sensor\":\"INA219\",\"message\":\"Overcurrent saturation detected! Load disabled.\"}"));
    }
  }

  // --- Read DS18B20 ---
  float temp_C = -127.0;
  bool temp_valid = false;
  if (ds18b20_present) {
    temp_C = dallasSensors.getTempCByIndex(0);
    if (temp_C > -55.0 && temp_C < 125.0 && temp_C != 85.0) { // 85°C is DS18B20 power-on reset state
      temp_valid = true;
    }
  }

  // --- Build and emit single JSON line ---
  Serial.print(F("{\"type\":\"measurement\",\"voltage_V\":"));
  if (voltage_valid) {
    Serial.print(voltage_V, 3);
  } else {
    Serial.print(F("0.000"));
  }

  Serial.print(F(",\"current_mA\":"));
  Serial.print(current_mA, 2);

  Serial.print(F(",\"power_mW\":"));
  Serial.print(power_mW, 2);

  Serial.print(F(",\"temperature_C\":"));
  if (temp_valid) {
    Serial.print(temp_C, 1);
  } else {
    Serial.print(F("null"));
  }

  Serial.print(F(",\"load_state\":\""));
  Serial.print(load_active ? F("ON") : F("OFF"));

  Serial.print(F("\",\"uptime_s\":"));
  Serial.print((now - start_time_ms) / 1000);

  Serial.println(F("}"));
}
