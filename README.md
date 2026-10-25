# SmartCell — Arduino Uno Battery Testing System

A laboratory-grade battery screening and internal resistance testing dashboard interfacing with an **Arduino Uno**, **INA219 DC voltage/current sensor**, and **DS18B20 digital temperature sensor**.

The system features a lavender-themed responsive UI with purple accents, persistent test history, real-time Chart.js telemetry waveforms, and a dual-mode communication layer (**Python Serial WebSocket Bridge** + **Direct Browser Web Serial API**).

---

## 🌟 Key Architecture & Capabilities

1. **Strict Hardware Integrity & No Fabricated Readings**:
   - Never displays simulated or estimated values as real hardware readings.
   - When disconnected, all live measurement values display `--` to avoid showing stale data as active telemetry.
   - Physical sensor plausibility validation guards against disconnected probes ($<0.50\text{ V}$) and INA219 ADC saturation ($\ge 3150\text{ mA}$).
2. **Dual Connection Modes**:
   - **Mode A (Preferred): Local Python WebSocket Bridge** (`bridge/serial_bridge.py`). Reads Windows COM ports via `pyserial` and broadcasts validated JSON to `ws://localhost:8765`.
   - **Mode B: Direct Browser Web Serial API**. Directly negotiates USB serial communication in Chrome or Edge without intermediate software.
3. **Transparent Battery Health Classification**:
   - **GOOD**, **WARNING**, **CRITICAL**, or **NOT TESTED**.
   - **Voltage alone never determines battery health**. A controlled 3-second load test measuring voltage sag ($V_{sag} = V_{oc} - V_{load}$) and internal resistance ($R_{int} = \frac{V_{oc} - V_{load}}{I_{load}}$) is required to evaluate degradation.
4. **Safety Watchdog**:
   - MOSFET gate control pin (Digital Pin 8) is **disabled (`LOW`) by default**.
   - Hardware pulse tests enforce an automatic 8-second firmware cutoff to prevent accidental continuous discharge.
5. **Comprehensive Data Export & Backup Hub**:
   - **RFC 4180 CSV Export**: With UTF-8 BOM encoding for seamless Microsoft Excel & Google Sheets compatibility.
   - **Structured JSON Export**: Full schema export with battery metadata, electrical metrics, and timestamps.
   - **Printable / PDF Laboratory Reports**: Instant browser printable certificates and executive screening summaries.
   - **Live Session Telemetry Export**: Download time-series sensor samples (voltage, current, power, temperature) directly from the live dashboard.

---

## ⚡ Quick Start (Running the System)

### Step 1: Start the Web Dashboard Server
Double-click **`start-server.bat`** in the project root, or run in PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```
The dashboard will open automatically in your browser at:
```
http://localhost:3000
```

### Step 2: Flash the Arduino Firmware
1. Open the Arduino IDE.
2. Install the required libraries via **Tools > Manage Libraries**:
   - `Adafruit INA219` by Adafruit
   - `OneWire` by Paul Stoffregen
   - `DallasTemperature` by Miles Burton
3. Open `arduino/smartcell_arduino.ino` and upload to your **Arduino Uno** at 9600 baud.
4. *Important: Close the Arduino IDE Serial Monitor before connecting through SmartCell to avoid COM port access conflicts.*

### Step 3: Run the Python Serial Bridge (Recommended)
1. Double-click `bridge/start_bridge.bat` or run:
   ```bash
   cd bridge
   pip install -r requirements.txt
   python serial_bridge.py
   ```
2. The bridge will scan your Windows COM ports, auto-detect the Arduino, and open WebSocket port `8765`.
3. In the web dashboard header, click **Connect Device**.

*(Alternative: If you do not have Python installed, select "Direct Browser Web Serial" in the Settings tab, click **Connect Device**, and pick your Arduino COM port directly in Chrome or Edge.)*

---

## 🔌 Hardware Wiring & Pinout Guide

| Sensor / Component | Arduino Pin | Notes |
| :--- | :--- | :--- |
| **INA219 VCC** | **5V** (or 3.3V) | Sensor logic supply |
| **INA219 GND** | **GND** | **Crucial:** Must share common ground with battery & load negative |
| **INA219 SDA** | **Pin A4** | Shared I²C Data line (7-bit address 0x40) |
| **INA219 SCL** | **Pin A5** | Shared I²C Clock line |
| **INA219 Vin+** | **Battery (+)** | High-side terminal voltage sense |
| **INA219 Vin−** | **Load Resistor (+)** | Current shunt (0.1 $\Omega$) high-side measurement path |
| **DS18B20 VDD** | **5V** (or 3.3V) | Power for digital thermal probe |
| **DS18B20 GND** | **GND** | Probe ground |
| **DS18B20 Data** | **Digital Pin 7** | **Requires 4.7 k$\Omega$ pull-up resistor between Data and VDD** |
| **OLED SSD1306 VCC** | **5V** (or 3.3V) | Display power |
| **OLED SSD1306 GND** | **GND** | Display ground |
| **OLED SSD1306 SDA** | **Pin A4** | Shared I²C Data bus (address 0x3C or 0x3D) |
| **OLED SSD1306 SCL** | **Pin A5** | Shared I²C Clock bus |
| **MOSFET Gate** | **Digital Pin 8** | Via **100 $\Omega$** series resistor + **10 k$\Omega$** pulldown to GND |

---

## ⚡ Hardware Connections Page & Component Guides

The SmartCell dashboard includes a dedicated **Connections** tab in the sidebar featuring real-time diagnostic reporting and comprehensive wiring diagrams.

### 1. Diagnostic Overview
Status tiles track 6 hardware subsystems:
- **Arduino Uno**: Serial handshake and heartbeat status (`Connected` / `Disconnected`).
- **INA219 Current/Voltage Sensor**: I²C communication at address `0x40` verified via firmware probe (`Connected`, `Error`, or `Not reported by Arduino`).
- **DS18B20 Temperature Sensor**: 1-Wire thermal probe bus status on Pin 7 (`Connected`, `Error`, or `Not reported`).
- **OLED Display (SSD1306)**: I²C address detection at `0x3C`/`0x3D` (`Detected`, `Not installed`, or `Not reported`).
- **IRF540N MOSFET Load Switch**: Kept marked **NOT VALIDATED** by default until physical bench validation of resistor rating, gate drive, and thermal limits is performed.
- **Battery Connection**: Safety-evaluated based on terminal voltage ($V > 0.50\text{V}$) under verified hardware conditions.

> **Hardware Diagnostic Transparency Principle**: SmartCell never fabricates or pretends to verify a hardware component in software. If the firmware has not confirmed a sensor, it is accurately displayed as *Not reported by Arduino* or *Not tested*.

### 2. Component Wiring Guides & Inspection Checklists
Each component card features a **View Connections** button opening an interactive wiring modal:
- **Labelled SVG Wiring Diagram**: Shows pinouts, polarity markers, and pull-up/pulldown resistors.
- **Color-Coded Wiring Table**: Pin-by-pin source, destination, suggested wire color, and circuit function.
- **Inspection Checklist**: Interactive checkboxes that persist in `localStorage` so you can verify physical connections before powering on.
- **Safety Callout Notice**: Highlighting polarity warnings, hot resistors, and common-ground rules.

### 3. Critical Engineering Notice: IRF540N Gate Drive
- **Limitation**: The standard **IRF540N** has a gate threshold $V_{gs(th)}$ between $2\text{ V}$ and $4\text{ V}$, but requires $V_{gs} = 10\text{ V}$ across Gate and Source to reach full saturation and minimum $R_{ds(on)} = 44\text{ m}\Omega$.
- When driven directly with **5V logic** from the Arduino Uno (Pin 8), the MOSFET operates in its **linear / partially conducting region**. Its on-resistance remains high, causing significant thermal dissipation under high discharge currents ($I^2 R$), potential gate voltage drops, and reduced test current.
- **Recommendation**: For high-current battery testing ($I > 1\text{ A}$), replace the IRF540N with a true **Logic-Level N-Channel MOSFET** such as:
  - **IRLZ44N** ($V_{gs} = 5\text{V}$ rated, $R_{ds(on)} = 22\text{ m}\Omega$)
  - **FQP30N06L** ($V_{gs} = 5\text{V}$ rated, $R_{ds(on)} = 35\text{ m}\Omega$)
  - **IRL3034** ($V_{gs} = 4.5\text{V}$ rated, ultra-low $R_{ds(on)} = 1.7\text{ m}\Omega$)

---

## 📖 About Project — System Architecture & Reference

SmartCell includes a dedicated, vertically-stacked **About Project** page structured as 9 independent cards:

1. **Project Overview**: Tagline (*"Measure Smarter. Monitor Better. Understand Battery Health."*), system summary, SVG electrochemistry graphic, and quick-action navigation buttons.
2. **Project Objectives**: 7 mini-cards covering voltage, current & power, thermal monitoring, real-time telemetry, voltage sag & recovery, transparent warning detection, and historical comparison.
3. **Hardware Components**: Status-tagged cards for Arduino Uno, INA219, DS18B20, 18650 cell, holder, power resistor, IRF540N MOSFET, OLED SSD1306, rotary encoder, LEDs & buzzer, and supporting hardware.
4. **How SmartCell Works**: 5-step end-to-end data acquisition flowchart (Battery Input &rarr; Sensor Measurement &rarr; Arduino Processing &rarr; USB Communication &rarr; Dashboard Visualization).
5. **Software & Technologies**: Documenting the actual stack (Arduino IDE, AVR C/C++, HTML5/CSS3/ES6+, USB JSON protocol, Python Bridge / Web Serial API, and Chart.js v4.4.1).
6. **Battery Screening Features**: 9 measurement and evaluation capabilities, paired with a transparent engineering prototype disclaimer.
7. **Project Status**: Subsystem status tiles displaying operational states for web, serial, INA219, DS18B20, streaming, OLED, load testing, and battery health rules.
8. **Future Scope**: 9 roadmap items covering multi-session comparison, cloud storage, calibration, and automated cell sorting (CSV, JSON, and PDF report generation are now fully implemented).
9. **Project Information**: Academic metadata, microcontroller specifications, editable team placeholders, and disclaimer notice.

---

## 📡 Serial JSON Protocol Specification

The Arduino transmits newline-delimited JSON objects over USB serial at **9600 baud, 8 data bits, no parity, 1 stop bit (8N1)**.

### 1. Periodic Measurement Record (1 Hz)
```json
{
  "type": "measurement",
  "voltage_V": 3.720,
  "current_mA": 125.40,
  "power_mW": 466.49,
  "temperature_C": 28.5,
  "load_state": "OFF",
  "uptime_s": 42
}
```

*Notes on Measurement Fields:*
- `voltage_V`: Float, terminal voltage in Volts. Values $< 0.50\text{ V}$ trigger open-circuit/probe disconnected error.
- `current_mA`: Float, instantaneous load current. Values $\ge 3150\text{ mA}$ trigger ADC saturation shutdown.
- `temperature_C`: Float, Celsius reading from DS18B20. Transmitted as `null` if the sensor is disconnected.
- `load_state`: String, `"OFF"` or `"ON"`.

### 2. Status & Boot Record
```json
{
  "type": "status",
  "device": "SmartCell Arduino Uno",
  "ina219": true,
  "ds18b20": true,
  "load_state": "OFF",
  "firmware_ver": "2.0.0"
}
```

### 3. Sensor Fault Notice
```json
{
  "type": "error",
  "sensor": "DS18B20",
  "message": "No 1-Wire device found on Pin 2. Check 4.7k pullup resistor."
}
```

### 4. Incoming Control Commands (Bridge -> Arduino)
- `LOAD:ON\n`: Energizes MOSFET gate (with 8-second safety timeout).
- `LOAD:OFF\n`: Immediately shuts off MOSFET gate (`LOW`).
- `STATUS\n`: Requests current hardware check.

---

## 🔬 Battery Chemistry & Health Assessment Rules

### 1. Chemistry Baseline Standards

| Chemistry | Nominal V | Full V | Cutoff V | Healthy $R_{int}$ Benchmark | Warning $R_{int}$ | Max Sag % |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **18650 Li-ion** | 3.70 V | 4.20 V | 3.00 V | $< 90\text{ m}\Omega$ | $90 - 220\text{ m}\Omega$ | $10.0\%$ |
| **Lithium Polymer (Li-Po)** | 3.70 V | 4.20 V | 3.00 V | $< 75\text{ m}\Omega$ | $75 - 180\text{ m}\Omega$ | $8.0\%$ |
| **LiFePO4** | 3.20 V | 3.65 V | 2.50 V | $< 60\text{ m}\Omega$ | $60 - 150\text{ m}\Omega$ | $7.0\%$ |
| **Ni-MH** | 1.20 V | 1.45 V | 1.00 V | $< 150\text{ m}\Omega$ | $150 - 350\text{ m}\Omega$ | $15.0\%$ |
| **Ni-Cd** | 1.20 V | 1.45 V | 0.90 V | $< 120\text{ m}\Omega$ | $120 - 300\text{ m}\Omega$ | $14.0\%$ |
| **Alkaline Primary** | 1.50 V | 1.62 V | 0.90 V | $< 250\text{ m}\Omega$ | $250 - 800\text{ m}\Omega$ | $20.0\%$ |
| **Lead-Acid (12V SLA)** | 12.00 V | 14.40 V | 10.50 V | $< 35\text{ m}\Omega$ | $35 - 90\text{ m}\Omega$ | $10.0\%$ |

### 2. Classification Logic:
- **NOT TESTED**: Returned whenever no controlled load test has been conducted. Explains: *"Health cannot be classified from voltage alone. A controlled load test is required to measure voltage sag, internal resistance, or discharge capacity."*
- **GOOD**: Loaded voltage maintains well above safe cutoff, voltage sag is within verified benchmark, and internal resistance $R_{int}$ satisfies cell baseline.
- **WARNING**: Voltage sag exceeds limit ($>10\%$) or internal resistance shows early cell degradation.
- **CRITICAL**: Cell dropped below minimum safe cutoff voltage under load, internal resistance exceeds threshold ($> 220\text{ m}\Omega$ on 18650), or cell temperature exceeds $50^\circ\text{C}$.

---

## 🛡️ Safety & Engineering Disclaimers

1. **Prototype Screening Tool**: SmartCell is an educational and laboratory battery screening system. It is **not** a certified commercial battery analyzer.
2. **Software Interlocks**: Software commands do not substitute for physical protection. Always install a **properly rated fast-blow DC fuse** in series with the battery under test.
3. **No Charging**: SmartCell is strictly a discharge and test monitoring tool. Never attempt to charge batteries through this circuit.
4. **Thermal Monitoring**: Disconnect cells immediately if temperature exceeds $45^\circ\text{C}$ or if any physical swelling is observed.

---

## 📂 Project Directory Structure

```
Smartcell/
├── index.html                   # Responsive Lavender Dashboard UI & Sidebar
├── README.md                    # System documentation, pinouts & safety
├── server.ps1                   # Zero-dependency local web server (PowerShell)
├── start-server.bat             # 1-Click web server launcher
├── package.json                 # Optional Vite/Node configuration
├── arduino/
│   ├── smartcell_arduino.ino    # Arduino Uno + INA219 + DS18B20 + MOSFET firmware
│   └── smartcell_ina219.ino     # Legacy firmware sketch
├── bridge/
│   ├── serial_bridge.py         # Python USB serial to WebSocket bridge
│   ├── requirements.txt         # pyserial, websockets
│   └── start_bridge.bat         # 1-Click Python bridge launcher
└── src/
    ├── main.js                  # Application controller & DOM bindings
    ├── connections.js           # Hardware connections manager, diagrams & diagnostics
    ├── serial.js                # Dual Connection Manager (Bridge WS + Web Serial)
    ├── calculations.js          # Plausibility checks, sag, Rint, health engine
    ├── charts.js                # Chart.js time-series manager & fallback canvas
    ├── history.js               # Test history persistence & CSV export
    └── styles.css               # Light lavender theme with purple accents (#7c3aed)
```

---

## ❓ Connection Troubleshooting Guide

| Issue | Likely Cause | Step-by-Step Solution |
| :--- | :--- | :--- |
| **INA219 not detected at 0x40** | Loose I²C wires or address jumper bridged | 1. Check A4 (SDA) and A5 (SCL) connections.<br>2. Confirm INA219 VCC has 5V and GND is connected.<br>3. Verify address solder pads A0/A1 are unbridged for standard address `0x40`. |
| **OLED display blank or not detected** | I²C wiring loose or address mismatch | 1. Confirm OLED VCC is 3.3V or 5V and GND is solid.<br>2. Verify SDA → A4 and SCL → A5.<br>3. Check OLED address (standard is `0x3C`, some displays use `0x3D`). |
| **DS18B20 reads `--` or `-127°C`** | Missing pull-up resistor or wrong pin | 1. Ensure DATA is wired to **Digital Pin 7**.<br>2. Confirm a **4.7 kΩ pull-up resistor** is connected between DATA and 5V (VDD).<br>3. Verify sensor polarity (flat face pinout: Pin 1 GND, Pin 2 Data, Pin 3 VDD). |
| **Invalid or fluctuating voltage readings** | Floating ground or loose screw terminals | 1. Tighten the battery screw terminals on INA219 VIN+ and VIN−.<br>2. **Crucial:** Ensure Arduino GND is firmly tied to Battery negative.<br>3. Avoid long jumper wires on the battery path. |
| **Serial COM Port Unavailable / Access Denied** | Port locked by Arduino IDE Serial Monitor or Cura | 1. Close the Arduino IDE Serial Monitor or Cura terminal.<br>2. Unplug and replug the Arduino USB cable.<br>3. Select the correct COM port in Device Manager or the SmartCell modal. |
| **Arduino Disconnected in SmartCell** | USB baud rate mismatch or bridge not running | 1. Check that the Arduino is flashed with `smartcell_arduino.ino` at 9600 baud.<br>2. If using Python mode, verify `serial_bridge.py` is running on `ws://localhost:8765`.<br>3. Click "Connect Device" to re-establish the handshake. |
| **MOSFET / Load circuit marked NOT VALIDATED** | Safety interlock active | 1. IRF540N is not fully saturated by 5V logic; test load is disabled until bench verification.<br>2. Inspect gate pulldown resistor (10 kΩ) on Pin 8.<br>3. Validate load resistor power rating (minimum 10W) before running discharge tests. |
