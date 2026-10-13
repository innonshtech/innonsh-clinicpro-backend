/**
 * Centralized configurable reference-range evaluation utility for patient vital signs.
 * Evaluates measured values against adult clinical reference ranges when supported by patient context,
 * or marks as REFERENCE NOT CONFIGURED for pediatric, unknown age, or unconfigured metrics.
 */

export const STATUS = {
  LOW: 'LOW',
  WITHIN_REFERENCE: 'WITHIN REFERENCE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
  NOT_CONFIGURED: 'REFERENCE NOT CONFIGURED'
};

export function evaluateVitals(values = {}, patientContext = {}) {
  // Determine if patient supports adult reference ranges
  let isAdult = false;
  if (patientContext.isAdult === true) {
    isAdult = true;
  } else if (typeof patientContext.age === 'number' && patientContext.age >= 18) {
    isAdult = true;
  } else if (patientContext.dateOfBirth) {
    const dob = new Date(patientContext.dateOfBirth);
    if (!isNaN(dob.getTime())) {
      const ageDiff = Date.now() - dob.getTime();
      const ageDate = new Date(ageDiff);
      const calculatedAge = Math.abs(ageDate.getUTCFullYear() - 1970);
      if (calculatedAge >= 18) isAdult = true;
    }
  }

  const results = {};
  let hasCritical = false;
  let hasAbnormal = false;

  // 1. Blood Pressure: systolic and diastolic in mmHg
  const systolic = values.bp_systolic !== undefined && values.bp_systolic !== null && values.bp_systolic !== ''
    ? Number(values.bp_systolic) : null;
  const diastolic = values.bp_diastolic !== undefined && values.bp_diastolic !== null && values.bp_diastolic !== ''
    ? Number(values.bp_diastolic) : null;

  if (systolic !== null || diastolic !== null) {
    const bpStr = (systolic !== null && diastolic !== null)
      ? `${systolic}/${diastolic}`
      : (systolic !== null ? `${systolic}/—` : `—/${diastolic}`);

    if (!isAdult) {
      results.blood_pressure = {
        value: bpStr,
        unit: 'mmHg',
        reference_range: 'Age-specific reference not configured',
        status: STATUS.NOT_CONFIGURED,
        is_abnormal: false,
        is_critical: false
      };
    } else {
      let status = STATUS.WITHIN_REFERENCE;
      let isCrit = false;
      let isAbn = false;
      let alertMsg = null;

      if ((systolic !== null && systolic >= 180) || (diastolic !== null && diastolic >= 120)) {
        status = STATUS.CRITICAL;
        isCrit = true;
        isAbn = true;
        alertMsg = 'Hypertensive Crisis: Promptly notify attending clinician per clinic protocol.';
      } else if ((systolic !== null && systolic < 90) || (diastolic !== null && diastolic < 60)) {
        status = STATUS.LOW;
        isAbn = true;
        alertMsg = 'Hypotension observed.';
      } else if ((systolic !== null && systolic >= 140) || (diastolic !== null && diastolic >= 90)) {
        status = STATUS.HIGH;
        isAbn = true;
        alertMsg = 'Stage 2 Hypertension.';
      } else if ((systolic !== null && systolic > 120) || (diastolic !== null && diastolic > 80)) {
        status = STATUS.HIGH;
        isAbn = true;
        alertMsg = 'Elevated Blood Pressure.';
      }

      if (isCrit) hasCritical = true;
      if (isAbn) hasAbnormal = true;

      results.blood_pressure = {
        value: bpStr,
        unit: 'mmHg',
        systolic,
        diastolic,
        reference_range: '90–120 / 60–80 mmHg',
        status,
        is_abnormal: isAbn,
        is_critical: isCrit,
        alert_message: alertMsg
      };
    }
  }

  // 2. Pulse / Heart Rate: bpm
  const pulse = values.pulse !== undefined && values.pulse !== null && values.pulse !== ''
    ? Number(values.pulse) : (values.heart_rate !== undefined && values.heart_rate !== null && values.heart_rate !== '' ? Number(values.heart_rate) : null);

  if (pulse !== null && !isNaN(pulse)) {
    if (!isAdult) {
      results.pulse = {
        value: pulse,
        unit: 'bpm',
        reference_range: 'Age-specific reference not configured',
        status: STATUS.NOT_CONFIGURED,
        is_abnormal: false,
        is_critical: false
      };
    } else {
      let status = STATUS.WITHIN_REFERENCE;
      let isCrit = false;
      let isAbn = false;
      let alertMsg = null;

      if (pulse <= 40 || pulse >= 140) {
        status = STATUS.CRITICAL;
        isCrit = true;
        isAbn = true;
        alertMsg = 'Critical heart rate: Promptly notify attending clinician per clinic protocol.';
      } else if (pulse < 60) {
        status = STATUS.LOW;
        isAbn = true;
        alertMsg = 'Bradycardia observed.';
      } else if (pulse > 100) {
        status = STATUS.HIGH;
        isAbn = true;
        alertMsg = 'Tachycardia observed.';
      }

      if (isCrit) hasCritical = true;
      if (isAbn) hasAbnormal = true;

      results.pulse = {
        value: pulse,
        unit: 'bpm',
        reference_range: '60–100 bpm',
        status,
        is_abnormal: isAbn,
        is_critical: isCrit,
        alert_message: alertMsg
      };
    }
  }

  // 3. Temperature: explicit unit 'C' or 'F'
  const tempRaw = values.temperature !== undefined && values.temperature !== null && values.temperature !== ''
    ? Number(values.temperature) : null;
  const tempUnit = (values.temperature_unit || 'C').toUpperCase();

  if (tempRaw !== null && !isNaN(tempRaw)) {
    const tempC = tempUnit === 'F' ? (tempRaw - 32) * (5 / 9) : tempRaw;

    if (!isAdult) {
      results.temperature = {
        value: tempRaw,
        unit: `°${tempUnit}`,
        reference_range: 'Age-specific reference not configured',
        status: STATUS.NOT_CONFIGURED,
        is_abnormal: false,
        is_critical: false
      };
    } else {
      let status = STATUS.WITHIN_REFERENCE;
      let isCrit = false;
      let isAbn = false;
      let alertMsg = null;

      if (tempC <= 35.0 || tempC >= 40.0) {
        status = STATUS.CRITICAL;
        isCrit = true;
        isAbn = true;
        alertMsg = tempC <= 35.0
          ? 'Critical hypothermia: Promptly notify attending clinician per clinic protocol.'
          : 'Hyperpyrexia: Promptly notify attending clinician per clinic protocol.';
      } else if (tempC >= 38.0) {
        status = STATUS.HIGH;
        isAbn = true;
        alertMsg = 'Fever observed (>= 38°C).';
      } else if (tempC < 36.1) {
        status = STATUS.LOW;
        isAbn = true;
        alertMsg = 'Subnormal temperature.';
      } else if (tempC > 37.2) {
        status = STATUS.HIGH;
        isAbn = true;
        alertMsg = 'Mildly elevated temperature.';
      }

      if (isCrit) hasCritical = true;
      if (isAbn) hasAbnormal = true;

      const refStr = tempUnit === 'F' ? '97.0–99.0 °F' : '36.1–37.2 °C';

      results.temperature = {
        value: tempRaw,
        unit: `°${tempUnit}`,
        temp_celsius: Math.round(tempC * 10) / 10,
        reference_range: refStr,
        status,
        is_abnormal: isAbn,
        is_critical: isCrit,
        alert_message: alertMsg
      };
    }
  }

  // 4. Respiratory Rate: breaths/min
  const resp = values.respiratory_rate !== undefined && values.respiratory_rate !== null && values.respiratory_rate !== ''
    ? Number(values.respiratory_rate) : null;

  if (resp !== null && !isNaN(resp)) {
    if (!isAdult) {
      results.respiratory_rate = {
        value: resp,
        unit: 'breaths/min',
        reference_range: 'Age-specific reference not configured',
        status: STATUS.NOT_CONFIGURED,
        is_abnormal: false,
        is_critical: false
      };
    } else {
      let status = STATUS.WITHIN_REFERENCE;
      let isCrit = false;
      let isAbn = false;
      let alertMsg = null;

      if (resp <= 8 || resp >= 35) {
        status = STATUS.CRITICAL;
        isCrit = true;
        isAbn = true;
        alertMsg = 'Critical respiratory rate: Promptly notify attending clinician per clinic protocol.';
      } else if (resp < 12) {
        status = STATUS.LOW;
        isAbn = true;
        alertMsg = 'Bradypnea observed.';
      } else if (resp > 20) {
        status = STATUS.HIGH;
        isAbn = true;
        alertMsg = 'Tachypnea observed.';
      }

      if (isCrit) hasCritical = true;
      if (isAbn) hasAbnormal = true;

      results.respiratory_rate = {
        value: resp,
        unit: 'breaths/min',
        reference_range: '12–20 breaths/min',
        status,
        is_abnormal: isAbn,
        is_critical: isCrit,
        alert_message: alertMsg
      };
    }
  }

  // 5. SpO2: percentage
  const spo2 = values.spo2 !== undefined && values.spo2 !== null && values.spo2 !== ''
    ? Number(values.spo2) : null;

  if (spo2 !== null && !isNaN(spo2)) {
    if (!isAdult) {
      results.spo2 = {
        value: spo2,
        unit: '%',
        reference_range: 'Age-specific reference not configured',
        status: STATUS.NOT_CONFIGURED,
        is_abnormal: false,
        is_critical: false
      };
    } else {
      let status = STATUS.WITHIN_REFERENCE;
      let isCrit = false;
      let isAbn = false;
      let alertMsg = null;

      if (spo2 <= 90) {
        status = STATUS.CRITICAL;
        isCrit = true;
        isAbn = true;
        alertMsg = 'Critical Hypoxemia (SpO2 <= 90%): Promptly notify attending clinician per clinic protocol.';
      } else if (spo2 < 95) {
        status = STATUS.LOW;
        isAbn = true;
        alertMsg = 'Sub-optimal oxygen saturation (SpO2 < 95%).';
      }

      if (isCrit) hasCritical = true;
      if (isAbn) hasAbnormal = true;

      results.spo2 = {
        value: spo2,
        unit: '%',
        reference_range: '95–100%',
        status,
        is_abnormal: isAbn,
        is_critical: isCrit,
        alert_message: alertMsg
      };
    }
  }

  // 6. Blood Glucose: mg/dL with context ('fasting', 'random', 'post_meal')
  const glucose = values.blood_glucose !== undefined && values.blood_glucose !== null && values.blood_glucose !== ''
    ? Number(values.blood_glucose) : null;
  const glucoseContext = (values.glucose_context || '').toLowerCase();

  if (glucose !== null && !isNaN(glucose)) {
    if (!isAdult || !['fasting', 'random', 'post_meal'].includes(glucoseContext)) {
      results.blood_glucose = {
        value: glucose,
        unit: 'mg/dL',
        context: glucoseContext || 'unspecified',
        reference_range: !isAdult ? 'Age-specific reference not configured' : 'Context required (fasting, post-meal, or random)',
        status: STATUS.NOT_CONFIGURED,
        is_abnormal: false,
        is_critical: false
      };
    } else {
      let status = STATUS.WITHIN_REFERENCE;
      let isCrit = false;
      let isAbn = false;
      let alertMsg = null;
      let refStr = '70–99 mg/dL';

      if (glucose < 50 || glucose >= 300) {
        status = STATUS.CRITICAL;
        isCrit = true;
        isAbn = true;
        alertMsg = glucose < 50
          ? 'Critical Hypoglycemia (< 50 mg/dL): Promptly notify attending clinician per clinic protocol.'
          : 'Critical Hyperglycemia (>= 300 mg/dL): Promptly notify attending clinician per clinic protocol.';
      } else if (glucose < 70) {
        status = STATUS.LOW;
        isAbn = true;
        alertMsg = 'Hypoglycemia observed (< 70 mg/dL).';
      } else if (glucoseContext === 'fasting') {
        refStr = '70–99 mg/dL (fasting)';
        if (glucose >= 126) {
          status = STATUS.HIGH;
          isAbn = true;
          alertMsg = 'Fasting hyperglycemia (>= 126 mg/dL).';
        } else if (glucose >= 100) {
          status = STATUS.HIGH;
          isAbn = true;
          alertMsg = 'Impaired fasting glucose (100–125 mg/dL).';
        }
      } else {
        // post_meal or random
        refStr = `70–140 mg/dL (${glucoseContext === 'post_meal' ? 'post-meal' : 'random'})`;
        if (glucose >= 200) {
          status = STATUS.HIGH;
          isAbn = true;
          alertMsg = 'Hyperglycemia (>= 200 mg/dL).';
        } else if (glucose > 140) {
          status = STATUS.HIGH;
          isAbn = true;
          alertMsg = 'Elevated blood glucose (> 140 mg/dL).';
        }
      }

      if (isCrit) hasCritical = true;
      if (isAbn) hasAbnormal = true;

      results.blood_glucose = {
        value: glucose,
        unit: 'mg/dL',
        context: glucoseContext,
        reference_range: refStr,
        status,
        is_abnormal: isAbn,
        is_critical: isCrit,
        alert_message: alertMsg
      };
    }
  }

  // 7. Pain Score: 0–10
  const pain = values.pain_score !== undefined && values.pain_score !== null && values.pain_score !== ''
    ? Number(values.pain_score) : null;

  if (pain !== null && !isNaN(pain)) {
    let status = STATUS.WITHIN_REFERENCE;
    let label = 'No Pain (0)';
    let isCrit = false;
    let isAbn = false;

    if (pain >= 7) {
      status = STATUS.CRITICAL;
      label = `Severe Pain (${pain}/10)`;
      isCrit = true;
      isAbn = true;
    } else if (pain >= 4) {
      status = STATUS.HIGH;
      label = `Moderate Pain (${pain}/10)`;
      isAbn = true;
    } else if (pain >= 1) {
      status = STATUS.LOW;
      label = `Mild Pain (${pain}/10)`;
    }

    if (isCrit) hasCritical = true;
    if (isAbn) hasAbnormal = true;

    results.pain_score = {
      value: pain,
      unit: '/10',
      label,
      reference_range: '0 (None)',
      status,
      is_abnormal: isAbn,
      is_critical: isCrit
    };
  }

  // 8. Weight: kg (always REFERENCE NOT CONFIGURED without clinician target)
  const weight = values.weight !== undefined && values.weight !== null && values.weight !== ''
    ? Number(values.weight) : null;

  if (weight !== null && !isNaN(weight)) {
    results.weight = {
      value: weight,
      unit: 'kg',
      reference_range: 'Clinician-defined target required',
      status: STATUS.NOT_CONFIGURED,
      is_abnormal: false,
      is_critical: false
    };
  }

  return {
    evaluations: results,
    has_critical: hasCritical,
    has_abnormal: hasAbnormal
  };
}
