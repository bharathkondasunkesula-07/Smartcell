/**
 * SmartCell — Battery Calculations, Validation & Health Assessment Engine
 * Complies with strict testing criteria:
 * - Chemistry selection is manual (never inferred from voltage alone).
 * - Distinguishes Open-Circuit Voltage (Voc) from Loaded Voltage (Vload).
 * - Computes Voltage Sag (V and %) and Estimated Internal Resistance (Rint).
 * - Evaluates Health: GOOD, WARNING, CRITICAL, or NOT TESTED (if insufficient data).
 */

export const BATTERY_PRESETS = {
  liion: {
    id: 'liion',
    name: '18650 Lithium-Ion (3.7V)',
    chemistry: 'Li-ion (NMC/LCO)',
    nominalVoltage: 3.70,
    maxVoltage: 4.20,
    minVoltage: 3.00,
    referenceCapacity: 2500, // mAh typical 18650 cell
    rechargeable: true,
    healthyRint_mOhm: 90,     // < 90 mOhm is Good
    warningRint_mOhm: 220,    // 90 - 220 mOhm is Warning (> 220 mOhm Critical)
    maxSagPct: 10.0,
    description: 'High energy density rechargeable cylinder cell. Severe degradation exhibits elevated internal resistance.'
  },
  lipo: {
    id: 'lipo',
    name: 'Lithium Polymer (Li-Po 3.7V)',
    chemistry: 'Li-Po',
    nominalVoltage: 3.70,
    maxVoltage: 4.20,
    minVoltage: 3.00,
    referenceCapacity: 1200,
    rechargeable: true,
    healthyRint_mOhm: 75,
    warningRint_mOhm: 180,
    maxSagPct: 8.0,
    description: 'Pouch format high discharge rate cell. Sensitive to over-discharge below 3.0V.'
  },
  lifepo4: {
    id: 'lifepo4',
    name: 'Lithium Iron Phosphate (LiFePO4 3.2V)',
    chemistry: 'LiFePO4',
    nominalVoltage: 3.20,
    maxVoltage: 3.65,
    minVoltage: 2.50,
    referenceCapacity: 1500,
    rechargeable: true,
    healthyRint_mOhm: 60,
    warningRint_mOhm: 150,
    maxSagPct: 7.0,
    description: 'Ultra-stable, long cycle life chemistry with very flat discharge plateau.'
  },
  nimh: {
    id: 'nimh',
    name: 'Nickel-Metal Hydride (Ni-MH 1.2V)',
    chemistry: 'Ni-MH',
    nominalVoltage: 1.20,
    maxVoltage: 1.45,
    minVoltage: 1.00,
    referenceCapacity: 2000,
    rechargeable: true,
    healthyRint_mOhm: 150,
    warningRint_mOhm: 350,
    maxSagPct: 15.0,
    description: 'Common rechargeable AA/AAA format. Higher internal resistance than lithium.'
  },
  nicd: {
    id: 'nicd',
    name: 'Nickel-Cadmium (Ni-Cd 1.2V)',
    chemistry: 'Ni-Cd',
    nominalVoltage: 1.20,
    maxVoltage: 1.45,
    minVoltage: 0.90,
    referenceCapacity: 1000,
    rechargeable: true,
    healthyRint_mOhm: 120,
    warningRint_mOhm: 300,
    maxSagPct: 14.0,
    description: 'Legacy chemistry with memory effect. High burst current capability.'
  },
  alkaline: {
    id: 'alkaline',
    name: 'Alkaline Primary (1.5V)',
    chemistry: 'Alkaline (Zn-MnO2)',
    nominalVoltage: 1.50,
    maxVoltage: 1.62,
    minVoltage: 0.90,
    referenceCapacity: 1800,
    rechargeable: false,
    healthyRint_mOhm: 250,
    warningRint_mOhm: 800,
    maxSagPct: 20.0,
    description: 'Non-rechargeable primary cell. Linear discharge curve with higher internal resistance.'
  },
  leadacid: {
    id: 'leadacid',
    name: 'Lead-Acid 12V SLA / AGM',
    chemistry: 'Lead-Acid (PbSO4)',
    nominalVoltage: 12.00,
    maxVoltage: 14.40,
    minVoltage: 10.50,
    referenceCapacity: 7000, // 7 Ah
    rechargeable: true,
    healthyRint_mOhm: 35,
    warningRint_mOhm: 90,
    maxSagPct: 10.0,
    description: 'Heavy duty starter or backup battery. High risk of sulfation if left discharged.'
  },
  custom: {
    id: 'custom',
    name: 'Custom Battery Configuration',
    chemistry: 'Custom',
    nominalVoltage: 3.70,
    maxVoltage: 4.20,
    minVoltage: 3.00,
    referenceCapacity: 1000,
    rechargeable: true,
    healthyRint_mOhm: 100,
    warningRint_mOhm: 250,
    maxSagPct: 12.0,
    description: 'User-specified thresholds according to manufacturer datasheet.'
  }
};

export const MIN_PLAUSIBLE_VOLTAGE = 0.50; // Under 0.50V indicates open circuit or disconnected probe
export const MAX_INA219_CURRENT_MA = 3150.0; // Shunt ADC saturation threshold

/**
 * Validates raw telemetry packet from hardware or bridge.
 */
export function validateSensorTelemetry(reading, config) {
  if (!reading || typeof reading !== 'object') {
    return {
      isValid: false,
      status: 'SENSOR_ERROR',
      errorReason: 'No data packet received.',
      hasVoltageError: true,
      hasCurrentError: false,
      hasTempError: false
    };
  }

  const v = Number(reading.voltage_V ?? reading.voltage);
  const i_mA = Number(reading.current_mA ?? 0);
  const t_C = reading.temperature_C != null ? Number(reading.temperature_C) : null;

  let isValid = true;
  let errorReason = null;
  let hasVoltageError = false;
  let hasCurrentError = false;
  let hasTempError = false;

  // 1. Voltage validation
  if (!Number.isFinite(v) || v < MIN_PLAUSIBLE_VOLTAGE) {
    isValid = false;
    hasVoltageError = true;
    errorReason = `Implausible voltage (${isNaN(v) ? 'NaN' : v.toFixed(3)} V). Probe disconnected or open circuit.`;
  } else if (config && config.maxVoltage && v > (config.maxVoltage * 1.25 + 0.5)) {
    isValid = false;
    hasVoltageError = true;
    errorReason = `Voltage (${v.toFixed(3)} V) exceeds safe limits for selected ${config.name}. Check configuration or sensor connections.`;
  }

  // 2. Current validation
  if (!Number.isFinite(i_mA)) {
    hasCurrentError = true;
    isValid = false;
    errorReason = errorReason ? `${errorReason} | Invalid current.` : 'Invalid current reading.';
  } else if (Math.abs(i_mA) >= MAX_INA219_CURRENT_MA) {
    hasCurrentError = true;
    errorReason = errorReason ? `${errorReason} | INA219 ADC saturated (>= 3150 mA).` : 'INA219 current sensor saturated (over-current).';
  }

  // 3. Temperature validation (DS18B20 returns -127°C on 1-Wire error/disconnected)
  if (t_C != null) {
    if (!Number.isFinite(t_C) || t_C <= -55 || t_C >= 125) {
      hasTempError = true;
      // Note: Temp error doesn't completely invalidate voltage/current readings, but is flagged
    }
  }

  return {
    isValid,
    status: isValid ? 'VALID' : 'SENSOR_ERROR',
    errorReason,
    hasVoltageError,
    hasCurrentError,
    hasTempError
  };
}

/**
 * Calculates Voltage Sag and Voltage Sag Percentage.
 * Only returns valid numbers when both Voc and Vload are valid numbers with Voc >= Vload.
 */
export function calculateVoltageSag(voc, vload) {
  if (!Number.isFinite(voc) || !Number.isFinite(vload)) {
    return {
      sag_V: null,
      sag_pct: null,
      isValid: false,
      reason: 'Missing Voc or Vload measurement.'
    };
  }

  if (voc <= 0) {
    return {
      sag_V: null,
      sag_pct: null,
      isValid: false,
      reason: 'Open-circuit voltage must be positive.'
    };
  }

  const sag_V = Math.max(0, voc - vload);
  const sag_pct = (sag_V / voc) * 100.0;

  return {
    sag_V: Number(sag_V.toFixed(3)),
    sag_pct: Number(sag_pct.toFixed(2)),
    isValid: true,
    reason: null
  };
}

/**
 * Calculates Estimated Internal Resistance (Rint) in Ohms and Milliohms.
 * Rint = (Voc - Vload) / Iload
 * Requires valid Voc, Vload, and Iload >= 0.05 A (50 mA).
 */
export function calculateInternalResistance(voc, vload, iload_A) {
  if (!Number.isFinite(voc) || !Number.isFinite(vload) || !Number.isFinite(iload_A)) {
    return {
      rint_ohm: null,
      rint_mohm: null,
      isValid: false,
      reason: 'Incomplete measurement parameters.'
    };
  }

  const absI = Math.abs(iload_A);
  if (absI < 0.040) { // Under 40 mA is insufficient load for reliable delta-V resistance calculation
    return {
      rint_ohm: null,
      rint_mohm: null,
      isValid: false,
      reason: 'Load current too small (< 40 mA) to determine internal resistance.'
    };
  }

  if (voc < vload) {
    return {
      rint_ohm: null,
      rint_mohm: null,
      isValid: false,
      reason: 'Loaded voltage unexpectedly exceeds open-circuit voltage.'
    };
  }

  const deltaV = voc - vload;
  const rint_ohm = deltaV / absI;
  const rint_mohm = rint_ohm * 1000.0;

  return {
    rint_ohm: Number(rint_ohm.toFixed(4)),
    rint_mohm: Number(rint_mohm.toFixed(1)),
    isValid: true,
    reason: null
  };
}

/**
 * Evaluates Battery Health Assessment:
 * Returns: GOOD, WARNING, CRITICAL, or NOT TESTED.
 *
 * CRITICAL RULE: Voltage alone NEVER classifies battery health.
 * If no load test or discharge cycle has been completed, returns NOT TESTED.
 */
export function evaluateBatteryHealthAssessment({
  voc,
  vload,
  current_A,
  temperature_C,
  config = BATTERY_PRESETS.liion,
  testCompleted = false,
  usableCapacity_mAh = null
}) {
  // If no load test or capacity test was performed, strictly return NOT TESTED
  if (!testCompleted && (vload == null || current_A == null || Math.abs(current_A) < 0.04)) {
    return {
      status: 'NOT TESTED',
      badgeClass: 'health-not-tested',
      title: 'NOT TESTED',
      summary: 'Controlled load test required.',
      reason: 'Health cannot be classified from voltage alone. A controlled load test is required to measure voltage sag, internal resistance, or discharge capacity.',
      criteriaMet: [],
      sag_pct: null,
      rint_mohm: null
    };
  }

  // If voltage is below physical plausibility
  if (!Number.isFinite(voc) || voc < MIN_PLAUSIBLE_VOLTAGE) {
    return {
      status: 'NOT TESTED',
      badgeClass: 'health-not-tested',
      title: 'NO CELL DETECTED',
      summary: 'Open circuit or probe disconnected.',
      reason: 'Measured terminal voltage is below 0.50 V. Check battery contacts.',
      criteriaMet: [],
      sag_pct: null,
      rint_mohm: null
    };
  }

  // Calculate sag and internal resistance
  const sag = calculateVoltageSag(voc, vload);
  const rint = calculateInternalResistance(voc, vload, current_A);

  let status = 'GOOD';
  let badgeClass = 'health-good';
  const criteria = [];
  const warnings = [];
  const criticals = [];

  // 1. Cutoff Voltage Check
  if (vload < config.minVoltage) {
    criticals.push(`Loaded voltage (${vload.toFixed(2)} V) dropped below safe cutoff limit (${config.minVoltage.toFixed(2)} V).`);
  } else {
    criteria.push(`Under-load voltage (${vload.toFixed(2)} V) maintained above cutoff limit (${config.minVoltage.toFixed(2)} V).`);
  }

  // 2. Voltage Sag Evaluation
  if (sag.isValid) {
    if (sag.sag_pct > (config.maxSagPct * 1.8)) {
      criticals.push(`Severe voltage sag (${sag.sag_pct.toFixed(1)}% > ${config.maxSagPct * 1.8}% limit). High cell impedance.`);
    } else if (sag.sag_pct > config.maxSagPct) {
      warnings.push(`Elevated voltage sag (${sag.sag_pct.toFixed(1)}% exceeds standard ${config.maxSagPct}% threshold).`);
    } else {
      criteria.push(`Normal voltage sag (${sag.sag_pct.toFixed(1)}% within ${config.maxSagPct}% limit).`);
    }
  }

  // 3. Internal Resistance Evaluation
  if (rint.isValid) {
    if (rint.rint_mohm > config.warningRint_mOhm) {
      criticals.push(`Critical internal resistance (${rint.rint_mohm.toFixed(0)} mΩ > ${config.warningRint_mOhm} mΩ threshold). Severe cell aging.`);
    } else if (rint.rint_mohm > config.healthyRint_mOhm) {
      warnings.push(`Moderate internal resistance (${rint.rint_mohm.toFixed(0)} mΩ > ${config.healthyRint_mOhm} mΩ baseline). Cell exhibits aging.`);
    } else {
      criteria.push(`Low internal resistance (${rint.rint_mohm.toFixed(0)} mΩ meets < ${config.healthyRint_mOhm} mΩ benchmark).`);
    }
  }

  // 4. Temperature Safety Evaluation
  if (temperature_C != null && Number.isFinite(temperature_C)) {
    if (temperature_C >= 55.0) {
      criticals.push(`Thermal hazard! Battery temperature (${temperature_C.toFixed(1)} °C >= 55.0 °C). Immediately disconnect!`);
    } else if (temperature_C >= 42.0) {
      warnings.push(`Elevated operating temperature (${temperature_C.toFixed(1)} °C >= 42.0 °C).`);
    } else {
      criteria.push(`Temperature normal (${temperature_C.toFixed(1)} °C within safe operating window).`);
    }
  }

  // Determine overall status
  if (criticals.length > 0) {
    status = 'CRITICAL';
    badgeClass = 'health-critical';
  } else if (warnings.length > 0) {
    status = 'WARNING';
    badgeClass = 'health-warning';
  } else {
    status = 'GOOD';
    badgeClass = 'health-good';
  }

  const reasonList = [...criticals, ...warnings, ...criteria];
  const summary = criticals[0] || warnings[0] || 'Cell passed loaded screening criteria.';

  return {
    status,
    badgeClass,
    title: status,
    summary,
    reason: reasonList.join(' '),
    criteriaMet: criteria,
    criticalReasons: criticals,
    warningReasons: warnings,
    sag_pct: sag.isValid ? sag.sag_pct : null,
    rint_mohm: rint.isValid ? rint.rint_mohm : null
  };
}

/**
 * Formats duration in seconds to HH:MM:SS string.
 */
export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00:00';
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
