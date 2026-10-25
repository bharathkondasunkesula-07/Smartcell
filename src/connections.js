/**
 * SmartCell — Hardware Connections & Interactive Wiring Subsystem
 * Provides component-by-component wiring schematics, pin maps, color-coded
 * wiring tables, interactive inspection checklists, step-by-step troubleshooting,
 * and live hardware diagnostic streaming.
 */

const CHECKLIST_STORAGE_KEY = 'smartcell_wiring_checklists_v1';

export class ConnectionsManager {
  constructor() {
    this.checklists = this.loadChecklistState();
    this.latestDiagnostics = {
      portState: 'Disconnected',
      lastMessage: null,
      lastReadingTime: null,
      activeFaults: [],
      gateSafetyState: 'OFF (Disarmed)',
      ina219Status: 'Not reported',
      ds18b20Status: 'Not reported',
      oledStatus: 'Not reported',
      mosfetStatus: 'NOT VALIDATED',
      batteryStatus: 'Disconnected'
    };
  }

  loadChecklistState() {
    try {
      const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  saveChecklistState() {
    try {
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(this.checklists));
    } catch (e) {}
  }

  setChecklistItem(componentKey, itemIndex, isChecked) {
    if (!this.checklists[componentKey]) {
      this.checklists[componentKey] = {};
    }
    this.checklists[componentKey][itemIndex] = isChecked;
    this.saveChecklistState();
  }

  isChecklistItemChecked(componentKey, itemIndex) {
    return !!(this.checklists[componentKey] && this.checklists[componentKey][itemIndex]);
  }

  /**
   * Updates diagnostic hardware statuses based on incoming serial message or connection event.
   */
  updateFromMessage(msg, connectionState) {
    if (connectionState) {
      this.latestDiagnostics.portState = connectionState.port
        ? `${connectionState.port} (9600 baud)`
        : 'Disconnected';
    }

    if (!msg || typeof msg !== 'object') return;

    this.latestDiagnostics.lastMessage = msg;
    const nowStr = new Date().toLocaleTimeString();

    if (msg.type === 'measurement') {
      this.latestDiagnostics.lastReadingTime = `${nowStr} (Voc: ${Number(msg.voltage_V || 0).toFixed(3)} V)`;

      // Battery Status
      const v = Number(msg.voltage_V || 0);
      if (v >= 0.50) {
        this.latestDiagnostics.batteryStatus = `Connected (${v.toFixed(3)} V)`;
      } else {
        this.latestDiagnostics.batteryStatus = 'Disconnected (< 0.50 V)';
      }

      // MOSFET State
      if (msg.load_state === 'ON') {
        this.latestDiagnostics.gateSafetyState = 'ON (Active Discharge)';
      } else {
        this.latestDiagnostics.gateSafetyState = 'OFF (Disarmed)';
      }

      // If measurement arrived, INA219 is working
      this.latestDiagnostics.ina219Status = 'Connected';

      // DS18B20 status from reading
      if (msg.temperature_C != null && Number.isFinite(msg.temperature_C)) {
        this.latestDiagnostics.ds18b20Status = `Connected (${msg.temperature_C.toFixed(1)} °C)`;
      } else if (msg.temperature_valid === false || msg.temperature_C === null) {
        this.latestDiagnostics.ds18b20Status = 'Disconnected';
      }
    } else if (msg.type === 'status') {
      if (msg.ina219 !== undefined) {
        this.latestDiagnostics.ina219Status = msg.ina219 ? 'Connected' : 'Error';
      }
      if (msg.ds18b20 !== undefined) {
        this.latestDiagnostics.ds18b20Status = msg.ds18b20 ? 'Connected' : 'Disconnected';
      }
      if (msg.oled !== undefined) {
        this.latestDiagnostics.oledStatus = msg.oled ? 'Detected (0x3C)' : 'Not detected';
      }
      if (msg.load_state) {
        this.latestDiagnostics.gateSafetyState = msg.load_state === 'ON' ? 'ON (Active)' : 'OFF (Disarmed)';
      }
    } else if (msg.type === 'error') {
      const faultStr = `${msg.sensor || 'Hardware'}: ${msg.message}`;
      if (!this.latestDiagnostics.activeFaults.includes(faultStr)) {
        this.latestDiagnostics.activeFaults.push(faultStr);
      }
      if (msg.sensor === 'INA219') this.latestDiagnostics.ina219Status = 'Error';
      if (msg.sensor === 'DS18B20') this.latestDiagnostics.ds18b20Status = 'Error';
    }
  }

  resetOnDisconnect() {
    this.latestDiagnostics.portState = 'Disconnected';
    this.latestDiagnostics.batteryStatus = 'Disconnected';
    this.latestDiagnostics.ina219Status = 'Not reported';
    this.latestDiagnostics.ds18b20Status = 'Not reported';
    this.latestDiagnostics.oledStatus = 'Not reported';
    this.latestDiagnostics.gateSafetyState = 'OFF (Disarmed)';
  }

  getComponentGuide(compKey) {
    const guides = {
      ina219: {
        title: 'Arduino Uno → INA219 DC Voltage & Current Sensor',
        subtitle: 'I²C Digital Interface + High-Side Current Shunt Path',
        diagramSvg: `
          <svg viewBox="0 0 540 180" width="100%" height="180" xmlns="http://www.w3.org/2000/svg" style="background:#f8f6ff; border-radius:8px; border:1px solid #e9e5f5;">
            <!-- Arduino Uno Box -->
            <rect x="20" y="20" width="160" height="140" rx="8" fill="#ffffff" stroke="#7c3aed" stroke-width="2"/>
            <text x="100" y="42" font-size="12" font-weight="bold" fill="#4c1d95" text-anchor="middle">Arduino Uno Rev3</text>
            <rect x="30" y="55" width="45" height="18" rx="3" fill="#fee2e2"/><text x="52" y="68" font-size="10" fill="#b91c1c" text-anchor="middle">5V</text>
            <rect x="30" y="80" width="45" height="18" rx="3" fill="#f1f5f9"/><text x="52" y="93" font-size="10" fill="#334155" text-anchor="middle">GND</text>
            <rect x="30" y="105" width="45" height="18" rx="3" fill="#dbeafe"/><text x="52" y="118" font-size="10" fill="#1d4ed8" text-anchor="middle">A4 (SDA)</text>
            <rect x="30" y="130" width="45" height="18" rx="3" fill="#fef9c3"/><text x="52" y="143" font-size="10" fill="#854d0e" text-anchor="middle">A5 (SCL)</text>

            <!-- INA219 Breakout Box -->
            <rect x="340" y="20" width="170" height="140" rx="8" fill="#ffffff" stroke="#059669" stroke-width="2"/>
            <text x="425" y="42" font-size="12" font-weight="bold" fill="#047857" text-anchor="middle">INA219 Breakout</text>
            <rect x="350" y="55" width="45" height="18" rx="3" fill="#fee2e2"/><text x="372" y="68" font-size="10" fill="#b91c1c" text-anchor="middle">VCC</text>
            <rect x="350" y="80" width="45" height="18" rx="3" fill="#f1f5f9"/><text x="372" y="93" font-size="10" fill="#334155" text-anchor="middle">GND</text>
            <rect x="350" y="105" width="45" height="18" rx="3" fill="#dbeafe"/><text x="372" y="118" font-size="10" fill="#1d4ed8" text-anchor="middle">SDA</text>
            <rect x="350" y="130" width="45" height="18" rx="3" fill="#fef9c3"/><text x="372" y="143" font-size="10" fill="#854d0e" text-anchor="middle">SCL</text>
            <!-- Screw Terminals -->
            <rect x="420" y="85" width="75" height="24" rx="4" fill="#ede9fe" stroke="#7c3aed"/>
            <text x="457" y="101" font-size="10" font-weight="bold" fill="#5b21b6" text-anchor="middle">Vin+ / Vin-</text>

            <!-- Connecting Wires -->
            <!-- 5V Wire (Red) -->
            <path d="M 75 64 L 350 64" stroke="#ef4444" stroke-width="2" fill="none"/>
            <!-- GND Wire (Black) -->
            <path d="M 75 89 L 350 89" stroke="#1e293b" stroke-width="2" fill="none"/>
            <!-- SDA Wire (Blue) -->
            <path d="M 75 114 L 350 114" stroke="#3b82f6" stroke-width="2" fill="none"/>
            <!-- SCL Wire (Yellow) -->
            <path d="M 75 139 L 350 139" stroke="#eab308" stroke-width="2" fill="none"/>
          </svg>
        `,
        table: [
          { from: 'VCC', to: 'Arduino 5V Power Header', color: 'red', name: 'Red', note: '5V logic power supply' },
          { from: 'GND', to: 'Arduino GND (Common Ground)', color: 'black', name: 'Black', note: 'Common ground with battery (-)' },
          { from: 'SDA', to: 'Arduino Analog Pin A4', color: 'blue', name: 'Blue', note: 'I2C Serial Data' },
          { from: 'SCL', to: 'Arduino Analog Pin A5', color: 'yellow', name: 'Yellow', note: 'I2C Serial Clock' },
          { from: 'VIN+', to: 'Battery Positive Terminal (+)', color: 'purple', name: 'Purple', note: 'High-side bus voltage sense' },
          { from: 'VIN−', to: 'Load Resistor (+ side)', color: 'purple', name: 'Purple', note: 'Current exit through 0.1 Ω shunt' }
        ],
        checklist: [
          'Arduino 5V and GND connected to INA219 VCC and GND.',
          'Analog A4 connected to SDA and Analog A5 connected to SCL.',
          'Battery positive (+) connected to VIN+ screw terminal.',
          'Load resistor connected to VIN− screw terminal (not battery negative).',
          'Common ground verified between battery negative and Arduino GND.'
        ],
        warning: 'CRITICAL: Never connect battery (+) directly across VIN+ and VIN− without a load resistor in series! Doing so short-circuits the battery through the 0.1 Ω shunt resistor.'
      },

      ds18b20: {
        title: 'Arduino Uno → DS18B20 Digital Temperature Sensor',
        subtitle: '1-Wire Thermal Bus on Pin D7 with 4.7 kΩ Pull-up',
        diagramSvg: `
          <svg viewBox="0 0 540 180" width="100%" height="180" xmlns="http://www.w3.org/2000/svg" style="background:#f8f6ff; border-radius:8px; border:1px solid #e9e5f5;">
            <!-- Arduino Uno Box -->
            <rect x="20" y="20" width="160" height="140" rx="8" fill="#ffffff" stroke="#7c3aed" stroke-width="2"/>
            <text x="100" y="42" font-size="12" font-weight="bold" fill="#4c1d95" text-anchor="middle">Arduino Uno Rev3</text>
            <rect x="30" y="55" width="45" height="18" rx="3" fill="#fee2e2"/><text x="52" y="68" font-size="10" fill="#b91c1c" text-anchor="middle">5V</text>
            <rect x="30" y="85" width="45" height="18" rx="3" fill="#f1f5f9"/><text x="52" y="98" font-size="10" fill="#334155" text-anchor="middle">GND</text>
            <rect x="30" y="115" width="55" height="18" rx="3" fill="#d1fae5"/><text x="57" y="128" font-size="10" fill="#047857" text-anchor="middle">Pin D7</text>

            <!-- Pullup Resistor -->
            <rect x="220" y="70" width="50" height="24" rx="4" fill="#fef3c7" stroke="#d97706" stroke-width="1.5"/>
            <text x="245" y="86" font-size="9" font-weight="bold" fill="#b45309" text-anchor="middle">4.7 kΩ</text>

            <!-- DS18B20 TO-92 Package -->
            <rect x="350" y="30" width="150" height="120" rx="8" fill="#ffffff" stroke="#d97706" stroke-width="2"/>
            <text x="425" y="52" font-size="12" font-weight="bold" fill="#92400e" text-anchor="middle">DS18B20 (Flat View)</text>
            <rect x="370" y="68" width="110" height="18" rx="3" fill="#f1f5f9"/><text x="425" y="81" font-size="10" fill="#334155" text-anchor="middle">Pin 1: GND (Left)</text>
            <rect x="370" y="93" width="110" height="18" rx="3" fill="#d1fae5"/><text x="425" y="106" font-size="10" fill="#047857" text-anchor="middle">Pin 2: DATA (Center)</text>
            <rect x="370" y="118" width="110" height="18" rx="3" fill="#fee2e2"/><text x="425" y="131" font-size="10" fill="#b91c1c" text-anchor="middle">Pin 3: VDD (Right)</text>

            <!-- Wires -->
            <!-- 5V Wire -->
            <path d="M 75 64 L 245 64 L 245 70 M 245 94 L 245 127 L 370 127" stroke="#ef4444" stroke-width="2" fill="none"/>
            <!-- GND Wire -->
            <path d="M 75 94 L 370 77" stroke="#1e293b" stroke-width="2" fill="none"/>
            <!-- DATA Wire with Pullup branch -->
            <path d="M 85 124 L 245 124 M 245 94 L 245 124 M 245 124 L 370 102" stroke="#10b981" stroke-width="2" fill="none"/>
          </svg>
        `,
        table: [
          { from: 'Pin 1 (Left)', to: 'Arduino GND', color: 'black', name: 'Black', note: 'Ground reference' },
          { from: 'Pin 2 (Center)', to: 'Arduino Digital Pin D7', color: 'green', name: 'Green', note: '1-Wire bidirectional data line' },
          { from: 'Pin 3 (Right)', to: 'Arduino 5V Power Header', color: 'red', name: 'Red', note: '3.0V - 5.5V Sensor VDD' },
          { from: '4.7 kΩ Pull-up', to: 'Between Pin D7 and 5V', color: 'orange', name: 'Orange', note: 'Required bus pull-up for 1-Wire protocol' }
        ],
        checklist: [
          '4.7 kΩ pull-up resistor firmly connected between Pin D7 and 5V.',
          'DS18B20 pinout verified (looking at flat front: 1=GND, 2=DATA, 3=VDD).',
          'Sensor probe thermally coupled to the battery body using thermal tape.',
          'Verified no solder bridges between adjacent TO-92 leads.'
        ],
        warning: 'CAUTION: Reversing VDD (Pin 3) and GND (Pin 1) will cause the DS18B20 to overheat immediately and may permanently damage the silicon die.'
      },

      oled: {
        title: 'Arduino Uno → OLED SSD1306 Display (0.96" I²C)',
        subtitle: 'Parallel I²C Bus Connection (Shared A4/A5 with INA219)',
        diagramSvg: `
          <svg viewBox="0 0 540 180" width="100%" height="180" xmlns="http://www.w3.org/2000/svg" style="background:#f8f6ff; border-radius:8px; border:1px solid #e9e5f5;">
            <!-- Arduino Uno -->
            <rect x="20" y="20" width="150" height="140" rx="8" fill="#ffffff" stroke="#7c3aed" stroke-width="2"/>
            <text x="95" y="42" font-size="12" font-weight="bold" fill="#4c1d95" text-anchor="middle">Arduino Uno</text>
            <rect x="30" y="55" width="40" height="18" rx="3" fill="#fee2e2"/><text x="50" y="68" font-size="10" fill="#b91c1c" text-anchor="middle">5V</text>
            <rect x="30" y="80" width="40" height="18" rx="3" fill="#f1f5f9"/><text x="50" y="93" font-size="10" fill="#334155" text-anchor="middle">GND</text>
            <rect x="30" y="105" width="55" height="18" rx="3" fill="#dbeafe"/><text x="57" y="118" font-size="10" fill="#1d4ed8" text-anchor="middle">A4 (SDA)</text>
            <rect x="30" y="130" width="55" height="18" rx="3" fill="#fef9c3"/><text x="57" y="143" font-size="10" fill="#854d0e" text-anchor="middle">A5 (SCL)</text>

            <!-- OLED Module -->
            <rect x="330" y="20" width="180" height="140" rx="8" fill="#ffffff" stroke="#7c3aed" stroke-width="2"/>
            <text x="420" y="42" font-size="12" font-weight="bold" fill="#4c1d95" text-anchor="middle">OLED SSD1306 (128x64)</text>
            <rect x="345" y="55" width="40" height="18" rx="3" fill="#fee2e2"/><text x="365" y="68" font-size="10" fill="#b91c1c" text-anchor="middle">VCC</text>
            <rect x="345" y="80" width="40" height="18" rx="3" fill="#f1f5f9"/><text x="365" y="93" font-size="10" fill="#334155" text-anchor="middle">GND</text>
            <rect x="345" y="105" width="40" height="18" rx="3" fill="#fef9c3"/><text x="365" y="118" font-size="10" fill="#854d0e" text-anchor="middle">SCL</text>
            <rect x="345" y="130" width="40" height="18" rx="3" fill="#dbeafe"/><text x="365" y="143" font-size="10" fill="#1d4ed8" text-anchor="middle">SDA</text>
            <!-- Screen area -->
            <rect x="400" y="60" width="95" height="80" rx="4" fill="#0f172a"/>
            <text x="447" y="105" font-size="10" fill="#38bdf8" text-anchor="middle">I²C: 0x3C</text>

            <!-- Bus Wires -->
            <path d="M 70 64 L 345 64" stroke="#ef4444" stroke-width="2" fill="none"/>
            <path d="M 70 89 L 345 89" stroke="#1e293b" stroke-width="2" fill="none"/>
            <path d="M 85 114 L 200 114 L 200 139 L 345 139" stroke="#3b82f6" stroke-width="2" fill="none"/>
            <path d="M 85 139 L 190 139 L 190 114 L 345 114" stroke="#eab308" stroke-width="2" fill="none"/>
          </svg>
        `,
        table: [
          { from: 'VCC', to: 'Arduino 5V (or 3.3V)', color: 'red', name: 'Red', note: 'Module power supply' },
          { from: 'GND', to: 'Arduino GND', color: 'black', name: 'Black', note: 'Common logic ground' },
          { from: 'SCL', to: 'Arduino Analog Pin A5', color: 'yellow', name: 'Yellow', note: 'Shared I2C clock line with INA219' },
          { from: 'SDA', to: 'Arduino Analog Pin A4', color: 'blue', name: 'Blue', note: 'Shared I2C data line with INA219' }
        ],
        checklist: [
          'VCC and GND connected to supported voltage (5V or 3.3V depending on module).',
          'SDA line connected to Pin A4 in parallel with INA219.',
          'SCL line connected to Pin A5 in parallel with INA219.',
          'I2C address verified as 0x3C (or 0x3D on some clones).'
        ],
        warning: 'NOTE: The OLED display is an optional hardware accessory. If you do not have an OLED display connected, all web dashboard features remain 100% operational.'
      },

      mosfet: {
        title: 'Arduino Uno → IRF540N MOSFET Load Switch Circuit',
        subtitle: 'Low-Side N-Channel Load Switching on Digital Pin D8',
        diagramSvg: `
          <svg viewBox="0 0 540 200" width="100%" height="200" xmlns="http://www.w3.org/2000/svg" style="background:#f8f6ff; border-radius:8px; border:1px solid #e9e5f5;">
            <!-- Arduino Uno Box -->
            <rect x="20" y="20" width="130" height="150" rx="8" fill="#ffffff" stroke="#7c3aed" stroke-width="2"/>
            <text x="85" y="42" font-size="12" font-weight="bold" fill="#4c1d95" text-anchor="middle">Arduino Uno</text>
            <rect x="30" y="65" width="55" height="18" rx="3" fill="#fed7aa"/><text x="57" y="78" font-size="10" fill="#9a3412" text-anchor="middle">Pin D8</text>
            <rect x="30" y="110" width="45" height="18" rx="3" fill="#f1f5f9"/><text x="52" y="123" font-size="10" fill="#334155" text-anchor="middle">GND</text>

            <!-- Series 100 ohm & 10k pulldown -->
            <rect x="170" y="62" width="45" height="20" rx="3" fill="#fef3c7" stroke="#d97706"/>
            <text x="192" y="76" font-size="9" font-weight="bold" fill="#b45309" text-anchor="middle">100 Ω</text>
            <rect x="235" y="95" width="22" height="40" rx="3" fill="#fef3c7" stroke="#d97706"/>
            <text x="246" y="118" font-size="8" font-weight="bold" fill="#b45309" text-anchor="middle">10k</text>

            <!-- MOSFET Package -->
            <rect x="320" y="30" width="180" height="140" rx="8" fill="#ffffff" stroke="#d97706" stroke-width="2"/>
            <text x="410" y="52" font-size="12" font-weight="bold" fill="#b45309" text-anchor="middle">IRF540N (TO-220)</text>
            <rect x="335" y="65" width="150" height="22" rx="4" fill="#ffedd5"/><text x="410" y="80" font-size="10" font-weight="bold" fill="#9a3412" text-anchor="middle">Pin 1: Gate (G)</text>
            <rect x="335" y="95" width="150" height="22" rx="4" fill="#dbeafe"/><text x="410" y="110" font-size="10" font-weight="bold" fill="#1e40af" text-anchor="middle">Pin 2: Drain (D) → Load (−)</text>
            <rect x="335" y="125" width="150" height="22" rx="4" fill="#f1f5f9"/><text x="410" y="140" font-size="10" font-weight="bold" fill="#334155" text-anchor="middle">Pin 3: Source (S) → GND</text>

            <!-- Wires -->
            <path d="M 85 74 L 170 74 M 215 74 L 246 74 L 335 74" stroke="#f97316" stroke-width="2" fill="none"/>
            <path d="M 246 74 L 246 95 M 246 135 L 246 150 L 75 150 L 75 128" stroke="#1e293b" stroke-width="2" fill="none"/>
            <path d="M 485 136 L 515 136 L 515 170 L 246 170" stroke="#1e293b" stroke-width="2" fill="none"/>
          </svg>
        `,
        table: [
          { from: 'Pin 1 (Left: Gate)', to: 'Arduino Pin D8 via 100 Ω', color: 'orange', name: 'Orange', note: 'Gate drive control' },
          { from: 'Gate Pulldown', to: '10 kΩ resistor between Gate and GND', color: 'black', name: 'Black', note: 'Guarantees OFF during microcontroller reboot' },
          { from: 'Pin 2 (Center: Drain)', to: 'Negative lead of Load Resistor', color: 'blue', name: 'Blue', note: 'Sinks load current through channel' },
          { from: 'Pin 3 (Right: Source)', to: 'Battery Negative (−) & Arduino GND', color: 'black', name: 'Black', note: 'Common low-side ground return' }
        ],
        checklist: [
          '100 Ω series resistor installed between Pin D8 and MOSFET Gate pin.',
          '10 kΩ pulldown resistor installed between Gate pin and GND.',
          'Heatsink securely mounted to MOSFET TO-220 metal tab.',
          'Power resistor wattage verified (> 10W for 3.3 Ω loads).',
          'Fast-blow DC fuse installed in series with battery under test.'
        ],
        warning: 'HARDWARE WARNING: The IRF540N is NOT a true logic-level MOSFET. It requires Vgs = 10V to fully saturate. When driven with Arduino 5V, it exhibits higher channel resistance and will heat up quickly. A true logic-level MOSFET (e.g. IRLZ44N, FQP30N06L, or IRL3034) is strongly recommended for sustained testing.'
      },

      loop: {
        title: 'Complete Battery → INA219 → Load Measurement Path',
        subtitle: 'High-Current Discharge Loop vs Microcontroller Logic Bus',
        diagramSvg: `
          <svg viewBox="0 0 540 200" width="100%" height="200" xmlns="http://www.w3.org/2000/svg" style="background:#f8f6ff; border-radius:8px; border:1px solid #e9e5f5;">
            <!-- Battery Cell Box -->
            <rect x="20" y="30" width="90" height="140" rx="6" fill="#ffffff" stroke="#7c3aed" stroke-width="2"/>
            <text x="65" y="52" font-size="11" font-weight="bold" fill="#4c1d95" text-anchor="middle">18650 Cell</text>
            <rect x="35" y="65" width="60" height="20" rx="3" fill="#fee2e2"/><text x="65" y="79" font-size="10" font-weight="bold" fill="#b91c1c" text-anchor="middle">(+) POS</text>
            <rect x="35" y="130" width="60" height="20" rx="3" fill="#f1f5f9"/><text x="65" y="144" font-size="10" font-weight="bold" fill="#334155" text-anchor="middle">(−) NEG</text>

            <!-- INA219 -->
            <rect x="160" y="30" width="100" height="80" rx="6" fill="#ffffff" stroke="#059669" stroke-width="2"/>
            <text x="210" y="50" font-size="10" font-weight="bold" fill="#047857" text-anchor="middle">INA219</text>
            <rect x="170" y="65" width="35" height="18" rx="2" fill="#ede9fe"/><text x="187" y="78" font-size="9" font-weight="bold" fill="#5b21b6" text-anchor="middle">Vin+</text>
            <rect x="215" y="65" width="35" height="18" rx="2" fill="#ede9fe"/><text x="232" y="78" font-size="9" font-weight="bold" fill="#5b21b6" text-anchor="middle">Vin−</text>

            <!-- Load Resistor -->
            <rect x="310" y="45" width="80" height="50" rx="4" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
            <text x="350" y="68" font-size="10" font-weight="bold" fill="#92400e" text-anchor="middle">Load Resistor</text>
            <text x="350" y="82" font-size="9" fill="#b45309" text-anchor="middle">3.3 Ω 10W</text>

            <!-- MOSFET -->
            <rect x="430" y="45" width="85" height="120" rx="6" fill="#ffffff" stroke="#d97706" stroke-width="2"/>
            <text x="472" y="65" font-size="10" font-weight="bold" fill="#92400e" text-anchor="middle">MOSFET</text>
            <rect x="440" y="80" width="65" height="18" rx="2" fill="#dbeafe"/><text x="472" y="93" font-size="9" fill="#1e40af" text-anchor="middle">Drain (D)</text>
            <rect x="440" y="110" width="65" height="18" rx="2" fill="#fed7aa"/><text x="472" y="123" font-size="9" fill="#9a3412" text-anchor="middle">Gate (D8)</text>
            <rect x="440" y="135" width="65" height="18" rx="2" fill="#f1f5f9"/><text x="472" y="148" font-size="9" fill="#334155" text-anchor="middle">Source (S)</text>

            <!-- Current Path Wires -->
            <!-- Bat(+) to Vin+ -->
            <path d="M 95 75 L 170 75" stroke="#8b5cf6" stroke-width="3" fill="none"/>
            <!-- Vin- to Load -->
            <path d="M 250 75 L 310 70" stroke="#8b5cf6" stroke-width="3" fill="none"/>
            <!-- Load to Drain -->
            <path d="M 390 70 L 440 89" stroke="#8b5cf6" stroke-width="3" fill="none"/>
            <!-- Source to Bat(-) -->
            <path d="M 440 144 L 200 180 L 95 140" stroke="#1e293b" stroke-width="3" fill="none"/>
            <circle cx="200" cy="180" r="4" fill="#1e293b"/>
            <text x="200" y="195" font-size="9" font-weight="bold" fill="#1e293b" text-anchor="middle">Common GND</text>
          </svg>
        `,
        table: [
          { from: '1. Battery (+)', to: 'INA219 VIN+ terminal', color: 'purple', name: 'Purple', note: 'Supplies test current to sensor high side' },
          { from: '2. INA219 Internal', to: 'Across 0.1 Ω precision shunt', color: 'purple', name: 'Internal', note: 'Shunt drops mV proportional to current' },
          { from: '3. INA219 VIN−', to: 'Load Resistor (+ side)', color: 'purple', name: 'Purple', note: 'Enters power load' },
          { from: '4. Load Resistor (−)', to: 'MOSFET Drain Pin 2', color: 'purple', name: 'Purple', note: 'Connects to N-channel switch' },
          { from: '5. MOSFET Source Pin 3', to: 'Battery (−) and Arduino GND', color: 'black', name: 'Black', note: 'Completes common ground return loop' }
        ],
        checklist: [
          'High-current loop uses 20 AWG or thicker wire (not flimsy breadboard jumper wires).',
          'INA219 screw terminals torqued tightly.',
          'Common ground connected between Arduino GND and Battery negative.',
          'Power resistor placed on a heat-safe surface with airflow.',
          'Load circuit kept NOT VALIDATED until physical bench verification complete.'
        ],
        warning: 'SAFETY RULE: Never energize the circuit without verifying all connections with power OFF. A short circuit on an 18650 cell can produce over 20A of current and cause fire or thermal runaway.'
      }
    };

    return guides[compKey] || null;
  }
}
