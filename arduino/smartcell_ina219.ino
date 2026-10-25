/*
  SmartCell — Arduino Uno + INA219 High-Side DC Voltage & Current Telemetry
  Format: voltage,current_mA,discharged_mAh,equivalent_cycles,monitoring_time_s
  Example: 3.435,0.21,0.001,0.0000,11.1

  Hardware Connections (Arduino Uno to INA219 Breakout):
  - VCC    -> 5V (or 3.3V)
  - GND    -> GND (Common ground with battery and load negative)
  - SDA    -> A4 (or dedicated SDA pin on Uno Rev3)
  - SCL    -> A5 (or dedicated SCL pin on Uno Rev3)
  - Vin+   -> Battery Positive terminal
  - Vin-   -> Load Positive terminal

  SENSOR VALIDATION & TELEMETRY NOTES:
  1. If Vin+ is disconnected or floating, INA219 bus voltage can read near 0.000-0.009 V.
     Ensure firm screw-terminal or soldered connections on the INA219 breakout.
  2. If current reaches ~3200 mA, the INA219 ADC / PGA has reached full-scale saturation.
     This code guards accumulated capacity so it does not integrate saturated or invalid readings.
  3. Ensure Arduino IDE Serial Monitor is CLOSED before opening SmartCell web dashboard.

  Required Library: "Adafruit INA219" by Adafruit (install via Arduino Library Manager)
*/

#include <Wire.h>
#include <Adafruit_INA219.h>

Adafruit_INA219 ina219;

// Reference capacity for initial cycle estimation (user can adjust in dashboard)
const float REFERENCE_CAPACITY_MAH = 500.0;

// Plausibility thresholds to protect against integrating glitch / disconnected leads
const float MIN_PLAUSIBLE_VOLTAGE_V = 0.50; // Below 0.5V indicates disconnected lead
const float MAX_SATURATED_CURRENT_MA = 3150.0; // Saturation limit of 0.1 ohm shunt (3.2A)

// Internal telemetry state
unsigned long previousMillis = 0;
const unsigned long INTERVAL_MS = 1000; // 1 sample per second

float accumulatedDischarged_mAh = 0.0;
unsigned long startTimeMillis = 0;

void setup() {
  // Initialize Serial at 9600 baud (matches SmartCell dashboard default)
  Serial.begin(9600);
  while (!Serial) {
    ; // Wait for serial port to connect (needed for native USB boards)
  }

  // Initialize INA219 I2C communication
  if (!ina219.begin()) {
    Serial.println(F("# ERROR: INA219 sensor not found on I2C bus (0x40). Check SDA/SCL wiring."));
    while (1) {
      delay(1000);
    }
  }

  // Set calibration: standard 32V, 2A range (default shunt resistor: 0.1 ohm)
  // Or ina219.setCalibration_16V_400mA() for higher precision at lower currents (< 400 mA)
  ina219.setCalibration_32V_2A();

  startTimeMillis = millis();
  previousMillis = millis();
}

void loop() {
  unsigned long currentMillis = millis();

  if (currentMillis - previousMillis >= INTERVAL_MS) {
    float dt_seconds = (currentMillis - previousMillis) / 1000.0;
    previousMillis = currentMillis;

    // Read voltage & current from INA219
    float shuntVoltage_mV = ina219.getShuntVoltage_mV();
    float busVoltage_V = ina219.getBusVoltage_V();
    float current_mA = ina219.getCurrent_mA();
    float loadVoltage_V = busVoltage_V + (shuntVoltage_mV / 1000.0);

    // Validate physical plausibility before accumulating capacity:
    // 1. Must be above 0.50 V (battery actually connected)
    // 2. Must not be saturated (below 3150 mA)
    // 3. Current must indicate discharge (> 1.0 mA)
    bool isPlausible = (loadVoltage_V >= MIN_PLAUSIBLE_VOLTAGE_V) && 
                       (abs(current_mA) < MAX_SATURATED_CURRENT_MA);

    if (isPlausible && current_mA > 1.0) {
      float delta_mAh = (current_mA * dt_seconds) / 3600.0;
      accumulatedDischarged_mAh += delta_mAh;
    }

    // Compute equivalent full cycles throughput
    float equivalentCycles = accumulatedDischarged_mAh / REFERENCE_CAPACITY_MAH;

    // Elapsed monitoring duration in seconds
    float monitoring_time_s = (currentMillis - startTimeMillis) / 1000.0;

    // Output comma-separated record:
    // voltage,current_mA,discharged_mAh,equivalent_cycles,monitoring_time_s
    Serial.print(loadVoltage_V, 3);
    Serial.print(F(","));
    Serial.print(current_mA, 2);
    Serial.print(F(","));
    Serial.print(accumulatedDischarged_mAh, 4);
    Serial.print(F(","));
    Serial.print(equivalentCycles, 4);
    Serial.print(F(","));
    Serial.println(monitoring_time_s, 1);
  }
}
