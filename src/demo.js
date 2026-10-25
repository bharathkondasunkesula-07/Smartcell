/**
 * SmartCell — Demo Mode Simulator
 * Generates realistic battery telemetry for testing and demonstration
 * without requiring physical Arduino or INA219 hardware.
 * Simulates LiPo discharge curves, ADC noise, capacity accumulation,
 * and controlled discharge test scenarios (Good, Bad, Critical, Unknown).
 */

export class DemoSimulator {
  constructor(options = {}) {
    this.onRecord = options.onRecord || (() => {});
    this.timer = null;
    this.isRunning = false;

    // Simulation state
    this.simulatedTime_s = 0;
    this.voltage = 4.15; // Start near full LiPo charge
    this.baseCurrent = 185.0; // Simulated 185 mA load
    this.dischargedCapacity_mAh = 0.0;
    this.referenceCapacity_mAh = options.referenceCapacity || 500;
    this.cutoffVoltage = options.cutoffVoltage || 3.0;

    // Health test simulation state
    this.simulatedTestCompleted = false;
    this.simulatedUsableCapacity_mAh = 0;
  }

  setReferenceCapacity(capacity) {
    this.referenceCapacity_mAh = capacity || 500;
  }

  setCutoffVoltage(cutoff) {
    this.cutoffVoltage = cutoff || 3.0;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.simulatedTime_s = 0;
    this.voltage = 4.12;
    this.dischargedCapacity_mAh = 0.0;
    this.simulatedTestCompleted = false;
    this.simulatedUsableCapacity_mAh = 0;

    // Tick every 1000ms (1 Hz update rate matching Arduino telemetry)
    this.timer = setInterval(() => this.tick(), 1000);
    this.tick(); // Immediate first tick
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  reset() {
    this.simulatedTime_s = 0;
    this.voltage = 4.15;
    this.dischargedCapacity_mAh = 0.0;
    this.simulatedTestCompleted = false;
    this.simulatedUsableCapacity_mAh = 0;
  }

  /**
   * Sets a predefined test scenario for immediate presentation / grading demonstration.
   * @param {'good' | 'bad' | 'critical' | 'unknown'} scenario
   */
  simulateScenario(scenario) {
    switch (scenario) {
      case 'good':
        // 88% capacity retention (440 mAh on 500 mAh rated cell)
        this.simulatedTestCompleted = true;
        this.simulatedUsableCapacity_mAh = Number((this.referenceCapacity_mAh * 0.88).toFixed(1));
        this.dischargedCapacity_mAh = this.simulatedUsableCapacity_mAh;
        this.voltage = Number((this.cutoffVoltage - 0.02).toFixed(3));
        break;

      case 'bad':
        // 71% capacity retention (355 mAh on 500 mAh rated cell)
        this.simulatedTestCompleted = true;
        this.simulatedUsableCapacity_mAh = Number((this.referenceCapacity_mAh * 0.71).toFixed(1));
        this.dischargedCapacity_mAh = this.simulatedUsableCapacity_mAh;
        this.voltage = Number((this.cutoffVoltage - 0.02).toFixed(3));
        break;

      case 'critical':
        // 52% capacity retention (260 mAh on 500 mAh rated cell)
        this.simulatedTestCompleted = true;
        this.simulatedUsableCapacity_mAh = Number((this.referenceCapacity_mAh * 0.52).toFixed(1));
        this.dischargedCapacity_mAh = this.simulatedUsableCapacity_mAh;
        this.voltage = Number((this.cutoffVoltage - 0.02).toFixed(3));
        break;

      case 'err_low_v':
        // Implausible disconnected voltage (0.005 V)
        this.simulatedTestCompleted = false;
        this.voltage = 0.005;
        this.current_mA = 0.21;
        break;

      case 'err_high_v':
        // Implausible supply rail leak (5.000 V)
        this.simulatedTestCompleted = false;
        this.voltage = 5.000;
        this.current_mA = 0.15;
        break;

      case 'err_sat_i':
        // INA219 ADC saturation / short circuit (3200 mA)
        this.simulatedTestCompleted = false;
        this.voltage = 3.435;
        this.current_mA = 3200.00;
        break;

      case 'unknown':
      default:
        // Test not completed yet
        this.simulatedTestCompleted = false;
        this.simulatedUsableCapacity_mAh = 0;
        this.dischargedCapacity_mAh = 12.5; // slight initial discharge, test in progress
        this.voltage = 3.82;
        break;
    }

    // Emit updated record immediately
    const outCurrent = this.current_mA !== undefined ? this.current_mA : this.baseCurrent;
    const record = {
      voltage: this.voltage,
      current_mA: outCurrent,
      discharged_mAh: this.dischargedCapacity_mAh,
      equivalent_cycles: Number((this.dischargedCapacity_mAh / this.referenceCapacity_mAh).toFixed(4)),
      monitoring_time_s: this.simulatedTime_s,
      rawVoltage: this.voltage,
      rawCurrent_mA: outCurrent,
      rawDischarged_mAh: this.dischargedCapacity_mAh,
      rawCycles: Number((this.dischargedCapacity_mAh / this.referenceCapacity_mAh).toFixed(4)),
      rawTime_s: this.simulatedTime_s,
      timestamp: new Date(),
      isSimulated: true,
      testCompleted: this.simulatedTestCompleted,
      usableCapacity_mAh: this.simulatedUsableCapacity_mAh
    };

    this.onRecord(record);
  }

  tick() {
    if (!this.isRunning) return;

    this.simulatedTime_s += 1.0;

    // Add slight realistic sensor noise (INA219 ADC jitter: ±0.003 V, ±0.8 mA)
    const vNoise = (Math.random() - 0.5) * 0.006;
    const iNoise = (Math.random() - 0.5) * 1.6;

    const current_mA = Math.max(10, this.baseCurrent + iNoise);

    // Integrate capacity: mAh = (mA * dt_s) / 3600
    const deltaCapacity = (current_mA * 1.0) / 3600;
    this.dischargedCapacity_mAh += deltaCapacity;

    // Realistic LiPo discharge profile based on depth of discharge (DoD)
    const dod = Math.min(1.0, this.dischargedCapacity_mAh / this.referenceCapacity_mAh);
    if (dod < 0.15) {
      // Rapid initial drop from 4.15V to 3.85V
      this.voltage = 4.15 - (dod / 0.15) * 0.30 + vNoise;
    } else if (dod < 0.85) {
      // Nominal plateau between 3.85V and 3.60V
      const plateauProgress = (dod - 0.15) / 0.70;
      this.voltage = 3.85 - plateauProgress * 0.25 + vNoise;
    } else {
      // Steep cutoff knee down towards 3.0V
      const cutoffProgress = (dod - 0.85) / 0.15;
      this.voltage = 3.60 - cutoffProgress * 0.60 + vNoise;
    }

    // Check if cell voltage reached cutoff under load
    if (this.voltage <= this.cutoffVoltage && !this.simulatedTestCompleted) {
      this.simulatedTestCompleted = true;
      this.simulatedUsableCapacity_mAh = Number(this.dischargedCapacity_mAh.toFixed(2));
    }

    // Guard against excessive negative voltage in simulation
    this.voltage = Math.max(2.8, this.voltage);

    const equivalentCycles = this.dischargedCapacity_mAh / this.referenceCapacity_mAh;

    const record = {
      voltage: Number(this.voltage.toFixed(3)),
      current_mA: Number(current_mA.toFixed(2)),
      discharged_mAh: Number(this.dischargedCapacity_mAh.toFixed(4)),
      equivalent_cycles: Number(equivalentCycles.toFixed(4)),
      monitoring_time_s: Number(this.simulatedTime_s.toFixed(1)),
      timestamp: new Date(),
      isSimulated: true,
      testCompleted: this.simulatedTestCompleted,
      usableCapacity_mAh: this.simulatedUsableCapacity_mAh
    };

    this.onRecord(record);
  }
}
