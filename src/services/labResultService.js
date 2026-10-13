import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';

// Fallback JSON paths when Supabase migration has not been applied yet
const DATA_DIR = path.join(process.cwd(), 'data');
const RESULTS_FALLBACK_FILE = path.join(DATA_DIR, 'lab_results.json');
const RULES_FALLBACK_FILE = path.join(DATA_DIR, 'lab_critical_rules.json');

function ensureFallbackFiles() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(RESULTS_FALLBACK_FILE)) {
      fs.writeFileSync(RESULTS_FALLBACK_FILE, JSON.stringify([], null, 2), 'utf8');
    }
    if (!fs.existsSync(RULES_FALLBACK_FILE)) {
      fs.writeFileSync(RULES_FALLBACK_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[LabResultService] Error initializing fallback storage:', err);
  }
}

function readFallbackResults() {
  try {
    ensureFallbackFiles();
    const data = fs.readFileSync(RESULTS_FALLBACK_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    return [];
  }
}

function writeFallbackResults(results) {
  try {
    ensureFallbackFiles();
    fs.writeFileSync(RESULTS_FALLBACK_FILE, JSON.stringify(results, null, 2), 'utf8');
  } catch (err) {
    console.error('[LabResultService] Error writing results fallback file:', err);
  }
}

function readFallbackRules() {
  try {
    ensureFallbackFiles();
    const data = fs.readFileSync(RULES_FALLBACK_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    return [];
  }
}

function writeFallbackRules(rules) {
  try {
    ensureFallbackFiles();
    fs.writeFileSync(RULES_FALLBACK_FILE, JSON.stringify(rules, null, 2), 'utf8');
  } catch (err) {}
}

/**
 * Composite identity key for a parameter within a specimen:
 * Combines order_item_id / test_id / test_code / normalized test_name WITH normalized parameter_name
 */
export function getResultParameterKey(item) {
  if (!item) return '';
  const testScope = (
    item.order_item_id ||
    item.test_id ||
    item.test_code ||
    (item.test_name || '').trim().toLowerCase()
  );
  const paramScope = (item.parameter_name || '').trim().toLowerCase();
  return `${testScope}:::${paramScope}`;
}

/**
 * Safe, non-destructive deduplication for legacy fallback results
 * Preserves audit history, backups original file, and retains newest data & critical flags
 */
export function deduplicateLegacyFallbackResults() {
  try {
    ensureFallbackFiles();
    const all = readFallbackResults();
    if (!Array.isArray(all) || all.length <= 1) return;

    let hasDuplicates = false;
    const seenMap = new Map();
    const deduplicated = [];

    for (const r of all) {
      // Validated, corrected, and correction-audit records are preserved unconditionally
      if (r.status === 'validated' || r.status === 'corrected' || r.is_corrected) {
        deduplicated.push(r);
        continue;
      }

      // For unvalidated 'entered' records, identify duplicates by lab_id + sample_id + parameter key
      const key = `${r.lab_id}:::${r.sample_id}:::${getResultParameterKey(r)}`;
      if (!seenMap.has(key)) {
        seenMap.set(key, r);
        deduplicated.push(r);
      } else {
        hasDuplicates = true;
        const existing = seenMap.get(key);
        // Merge critical status / ack if duplicate had critical flagged
        if (r.is_critical && !existing.is_critical) {
          existing.is_critical = true;
          existing.critical_threshold_rule = r.critical_threshold_rule;
          existing.critical_flagged_at = r.critical_flagged_at;
        }
        if (r.critical_acknowledged && !existing.critical_acknowledged) {
          existing.critical_acknowledged = true;
          existing.critical_acknowledged_at = r.critical_acknowledged_at;
          existing.critical_acknowledged_by = r.critical_acknowledged_by;
          existing.critical_acknowledgement_notes = r.critical_acknowledgement_notes;
        }
        // Update to latest timestamp/value if newer
        if (new Date(r.updated_at || r.created_at) > new Date(existing.updated_at || existing.created_at)) {
          existing.result_value = r.result_value;
          existing.numeric_value = r.numeric_value;
          existing.updated_at = r.updated_at || r.created_at;
          existing.interpretation = r.interpretation;
        }
      }
    }

    if (hasDuplicates) {
      const backupPath = path.join(DATA_DIR, `lab_results.backup.${Date.now()}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(all, null, 2), 'utf8');
      writeFallbackResults(deduplicated);
      console.log(`[LabResultService] Cleaned legacy duplicates: ${all.length} -> ${deduplicated.length} records. Backup created.`);
    }
  } catch (err) {
    console.error('[LabResultService] Error during safe deduplication:', err);
  }
}

let tableCheckedAt = 0;
let tableAvailable = null;

async function checkTableAvailable() {
  const now = Date.now();
  if (tableAvailable === true) return true;
  if (tableAvailable === false && now - tableCheckedAt < 30000) {
    return false;
  }

  tableCheckedAt = now;
  try {
    const { error } = await supabase.from('lab_results').select('id').limit(1);
    if (!error) {
      tableAvailable = true;
      return true;
    }
    tableAvailable = false;
    return false;
  } catch (e) {
    tableAvailable = false;
    return false;
  }
}

export const labResultService = {
  /**
   * Helper to check active storage status and perform safe cleanup if needed
   */
  async getStorageStatus() {
    deduplicateLegacyFallbackResults();
    const hasDb = await checkTableAvailable();
    return {
      activeStorage: hasDb ? 'supabase' : 'fallback_json',
      fallbackCount: readFallbackResults().length,
      migrationPending: !hasDb
    };
  },

  /**
   * List received samples eligible for result entry
   */
  async listEligibleSamplesForEntry(labId, { search = '' } = {}) {
    if (!labId) throw new Error('lab_id is required');

    // 1. Get received samples using labSampleService
    let labSampleService;
    try {
      const mod = await import('@/services/labSampleService');
      labSampleService = mod.labSampleService;
    } catch (e) {
      const mod = await import('./labSampleService.js');
      labSampleService = mod.labSampleService;
    }

    const allSamples = await labSampleService.listSamples(labId, { status: 'received', search });

    // 2. Attach existing entered results count & test details
    const allResults = await this.listResults(labId);

    const eligible = allSamples.map((sample) => {
      // Filter results for this sample and deduplicate by identity key (taking newest)
      const rawSampleResults = allResults.filter((r) => r.sample_id === sample.id);
      const seenParams = new Map();
      for (const r of rawSampleResults) {
        const pKey = getResultParameterKey(r);
        if (!seenParams.has(pKey)) {
          seenParams.set(pKey, r);
        } else {
          const existing = seenParams.get(pKey);
          if (new Date(r.updated_at || r.created_at) > new Date(existing.updated_at || existing.created_at)) {
            seenParams.set(pKey, r);
          }
        }
      }
      const sampleResults = Array.from(seenParams.values());

      const isComplete = sampleResults.length > 0 && sampleResults.every((r) => r.status === 'validated');
      const hasPendingValidation = sampleResults.some((r) => r.status === 'entered' || r.status === 'corrected');
      const hasCritical = sampleResults.some((r) => r.is_critical && !r.critical_acknowledged);

      return {
        ...sample,
        results_count: sampleResults.length,
        entry_status: sampleResults.length === 0 ? 'pending_entry' : isComplete ? 'validated' : hasPendingValidation ? 'awaiting_validation' : 'in_progress',
        has_critical: hasCritical,
        results: sampleResults
      };
    });

    return eligible;
  },

  /**
   * List results scoped to authenticated lab with filters
   */
  async listResults(labId, { orderId = null, sampleId = null, status = 'all', isCritical = null, search = '' } = {}) {
    if (!labId) throw new Error('lab_id is required');

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      let q = supabase
        .from('lab_results')
        .select(`
          *,
          order:lab_orders(
            id, order_number, status, total_amount, created_at,
            patient:patients(id, first_name, last_name, phone_number, gender, date_of_birth, patient_code),
            clinic:clinics(id, clinic_name, phone),
            doctor:doctors(id, first_name, last_name)
          ),
          sample:lab_samples(id, barcode, sample_type, collection_status, collected_at, received_at)
        `)
        .eq('lab_id', labId)
        .order('created_at', { ascending: false });

      if (orderId) q = q.eq('order_id', orderId);
      if (sampleId) q = q.eq('sample_id', sampleId);
      if (status && status !== 'all') q = q.eq('status', status.toLowerCase());
      if (isCritical !== null) q = q.eq('is_critical', isCritical);

      const { data, error } = await q;
      if (error) {
        throw new Error(`Database query failed: ${error.message}`);
      }

      let results = data || [];
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        results = results.filter((r) => {
          const tName = (r.test_name || '').toLowerCase();
          const pName = (r.parameter_name || '').toLowerCase();
          const bCode = (r.sample?.barcode || '').toLowerCase();
          const oNum = (r.order?.order_number || '').toLowerCase();
          const pat = `${r.order?.patient?.first_name || ''} ${r.order?.patient?.last_name || ''}`.toLowerCase();
          return tName.includes(s) || pName.includes(s) || bCode.includes(s) || oNum.includes(s) || pat.includes(s);
        });
      }
      return results;
    }

    // Fallback store
    const all = readFallbackResults();
    let filtered = all.filter((r) => r.lab_id === labId);

    if (orderId) filtered = filtered.filter((r) => r.order_id === orderId);
    if (sampleId) filtered = filtered.filter((r) => r.sample_id === sampleId);
    if (status && status !== 'all') filtered = filtered.filter((r) => (r.status || '').toLowerCase() === status.toLowerCase());
    if (isCritical !== null) filtered = filtered.filter((r) => r.is_critical === isCritical);

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter((r) => {
        const tName = (r.test_name || '').toLowerCase();
        const pName = (r.parameter_name || '').toLowerCase();
        const bCode = (r.sample_barcode || r.sample?.barcode || '').toLowerCase();
        const oNum = (r.order_number || r.order?.order_number || '').toLowerCase();
        const pat = (r.patient_name || '').toLowerCase();
        return tName.includes(s) || pName.includes(s) || bCode.includes(s) || oNum.includes(s) || pat.includes(s);
      });
    }

    return filtered;
  },

  /**
   * Get single result by ID scoped to authenticated lab
   */
  async getResultById(labId, resultId) {
    if (!labId || !resultId) return null;

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      const { data, error } = await supabase
        .from('lab_results')
        .select(`
          *,
          order:lab_orders(
            id, order_number, status, total_amount, created_at,
            patient:patients(id, first_name, last_name, phone_number, gender, date_of_birth, patient_code),
            clinic:clinics(id, clinic_name, phone),
            doctor:doctors(id, first_name, last_name)
          ),
          sample:lab_samples(id, barcode, sample_type, collection_status, collected_at, received_at)
        `)
        .eq('id', resultId)
        .eq('lab_id', labId)
        .maybeSingle();

      if (error) {
        throw new Error(`Database error fetching result: ${error.message}`);
      }
      return data;
    }

    const all = readFallbackResults();
    return all.find((r) => r.id === resultId && r.lab_id === labId) || null;
  },

  /**
   * Enter or Edit Diagnostic Results for a received specimen.
   * - Updates existing unvalidated records in place rather than creating duplicates.
   * - Safely deletes unvalidated parameters removed by user.
   * - Never deletes or overwrites validated or corrected records.
   * - Deduplicates repeated critical findings.
   */
  async enterResults(labId, payload, authUser) {
    const { sample_id, order_id, results } = payload;

    if (!labId) throw new Error('Unauthorized: Laboratory identifier missing');
    if (!sample_id) throw new Error('sample_id is required for result entry');
    if (!order_id) throw new Error('order_id is required for result entry');
    if (!Array.isArray(results) || results.length === 0) {
      throw new Error('At least one test result parameter is required');
    }

    // 1. Verify Sample Eligibility & Tenant Scoping
    let labSampleService;
    try {
      const mod = await import('@/services/labSampleService');
      labSampleService = mod.labSampleService;
    } catch (e) {
      const mod = await import('./labSampleService.js');
      labSampleService = mod.labSampleService;
    }

    const sample = await labSampleService.getSampleById(labId, sample_id);
    if (!sample) {
      const err = new Error('Sample not found or access denied for this laboratory');
      err.status = 404;
      throw err;
    }

    const sampleStatus = (sample.collection_status || '').toLowerCase();
    if (sampleStatus !== 'received') {
      const err = new Error(
        `Cannot enter results: Sample is in "${sample.collection_status}" status. Results can only be entered for samples in "received" status.`
      );
      err.status = 400;
      throw err;
    }

    // 2. Fetch existing results for this sample to distinguish unvalidated from locked results
    const existingSampleResults = await this.listResults(labId, { sampleId: sample_id });
    const lockedResults = existingSampleResults.filter((r) => r.status === 'validated' || r.status === 'corrected');
    const unvalidatedResults = existingSampleResults.filter((r) => r.status === 'entered');

    // 3. Deduplicate payload items to avoid duplicate parameters in single submission
    const seenInPayload = new Map();

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      const testName = (item.test_name || sample.order?.order_number || 'Diagnostic Test').trim();
      const paramName = (item.parameter_name || testName).trim();
      const valStr = String(item.result_value !== undefined && item.result_value !== null ? item.result_value : '').trim();

      if (!paramName) {
        const err = new Error(`Parameter name is required for row #${i + 1}`);
        err.status = 400;
        throw err;
      }

      if (!valStr) {
        const err = new Error(`Result value is required for parameter "${paramName}"`);
        err.status = 400;
        throw err;
      }

      const pKey = getResultParameterKey({
        order_item_id: item.order_item_id || sample.order_item_id || null,
        test_id: item.test_id || null,
        test_code: item.test_code || null,
        test_name: testName,
        parameter_name: paramName
      });

      // Prevent overwriting locked (validated/corrected) results directly
      const isLocked = lockedResults.some((lr) => lr.id === item.id || getResultParameterKey(lr) === pKey);
      if (isLocked) {
        const err = new Error(
          `Cannot overwrite validated result for "${paramName}". Please use the formal Clinical Correction workflow.`
        );
        err.status = 400;
        throw err;
      }

      // Deduplicate within payload: keep last occurrence
      seenInPayload.set(pKey, { ...item, test_name: testName, parameter_name: paramName, result_value: valStr, _key: pKey });
    }

    const uniquePayloadItems = Array.from(seenInPayload.values());

    // 4. Fetch lab-configured critical threshold rules
    const criticalRules = await this.getCriticalRules(labId);

    const nowIso = new Date().toISOString();
    const enteredByName = (authUser?.name || 'Lab Technician').trim();
    const enteredByUserId = authUser?.id || null;

    const matchedUnvalidatedIds = new Set();
    const recordsToUpdate = [];
    const recordsToInsert = [];

    for (const item of uniquePayloadItems) {
      const paramName = item.parameter_name;
      const valStr = item.result_value;
      const parsedNum = parseFloat(valStr);
      const isNumeric = !isNaN(parsedNum);
      const numericVal = isNumeric ? parsedNum : null;

      // Critical threshold rule evaluation
      let isCritical = Boolean(item.is_critical);
      let thresholdRule = item.critical_threshold_rule || null;
      let interpretation = item.interpretation || 'normal';

      // Evaluate against lab-configured rules if available
      const matchingRule = criticalRules.find((r) => {
        const matchTest = !r.test_code || r.test_code === item.test_code;
        const matchParam = (r.parameter_name || '').toLowerCase() === paramName.toLowerCase();
        return matchTest && matchParam && r.status === 'active';
      });

      if (matchingRule && isNumeric) {
        if (matchingRule.critical_low !== null && matchingRule.critical_low !== undefined && numericVal < matchingRule.critical_low) {
          isCritical = true;
          interpretation = 'critical_low';
          thresholdRule = `Critical Low Threshold: < ${matchingRule.critical_low} ${matchingRule.unit || ''}`.trim();
        } else if (matchingRule.critical_high !== null && matchingRule.critical_high !== undefined && numericVal > matchingRule.critical_high) {
          isCritical = true;
          interpretation = 'critical_high';
          thresholdRule = `Critical High Threshold: > ${matchingRule.critical_high} ${matchingRule.unit || ''}`.trim();
        }
      }

      // Check if this item matches an existing unvalidated record
      let existingRecord = null;
      if (item.id) {
        existingRecord = unvalidatedResults.find((r) => r.id === item.id);
      }
      if (!existingRecord) {
        existingRecord = unvalidatedResults.find(
          (r) => !matchedUnvalidatedIds.has(r.id) && getResultParameterKey(r) === item._key
        );
      }

      if (existingRecord) {
        matchedUnvalidatedIds.add(existingRecord.id);

        // Compute critical flags: preserve acknowledgment if already acknowledged and still critical
        let critFlaggedAt = existingRecord.critical_flagged_at;
        let critAck = existingRecord.critical_acknowledged;
        let critAckAt = existingRecord.critical_acknowledged_at;
        let critAckBy = existingRecord.critical_acknowledged_by;
        let critAckNotes = existingRecord.critical_acknowledgement_notes;

        if (isCritical && !existingRecord.is_critical) {
          critFlaggedAt = nowIso;
          critAck = false;
          critAckAt = null;
          critAckBy = null;
          critAckNotes = null;
        } else if (!isCritical && existingRecord.is_critical) {
          critFlaggedAt = null;
          critAck = false;
          critAckAt = null;
          critAckBy = null;
          critAckNotes = null;
          thresholdRule = null;
        }

        const updateRecord = {
          ...existingRecord,
          result_value: valStr,
          numeric_value: numericVal,
          unit: item.unit ? item.unit.trim() : existingRecord.unit,
          reference_range: item.reference_range ? item.reference_range.trim() : existingRecord.reference_range,
          reference_min: item.reference_min !== undefined && item.reference_min !== null ? parseFloat(item.reference_min) : null,
          reference_max: item.reference_max !== undefined && item.reference_max !== null ? parseFloat(item.reference_max) : null,
          interpretation,
          is_critical: isCritical,
          critical_threshold_rule: thresholdRule,
          critical_flagged_at: critFlaggedAt,
          critical_acknowledged: critAck,
          critical_acknowledged_at: critAckAt,
          critical_acknowledged_by: critAckBy,
          critical_acknowledgement_notes: critAckNotes,
          technician_remarks: item.technician_remarks ? item.technician_remarks.trim() : existingRecord.technician_remarks,
          updated_at: nowIso
        };
        updateRecord._key = item._key;
        item._savedRecord = updateRecord;
        recordsToUpdate.push(updateRecord);
      } else {
        const insertRecord = {
          id: crypto.randomUUID(),
          lab_id: labId,
          order_id: order_id,
          order_item_id: item.order_item_id || sample.order_item_id || null,
          sample_id: sample_id,
          patient_id: sample.patient_id,
          test_id: item.test_id || null,
          test_name: item.test_name,
          test_code: item.test_code || null,
          parameter_name: paramName,
          result_value: valStr,
          numeric_value: numericVal,
          unit: item.unit ? item.unit.trim() : null,
          reference_range: item.reference_range ? item.reference_range.trim() : null,
          reference_min: item.reference_min !== undefined && item.reference_min !== null ? parseFloat(item.reference_min) : null,
          reference_max: item.reference_max !== undefined && item.reference_max !== null ? parseFloat(item.reference_max) : null,
          interpretation,
          is_critical: isCritical,
          critical_threshold_rule: thresholdRule,
          critical_flagged_at: isCritical ? nowIso : null,
          critical_acknowledged: false,
          critical_acknowledged_at: null,
          critical_acknowledged_by: null,
          critical_acknowledgement_notes: null,
          technician_remarks: item.technician_remarks ? item.technician_remarks.trim() : null,
          status: 'entered',
          entered_at: nowIso,
          entered_by: enteredByName,
          entered_by_user_id: enteredByUserId,
          validated_at: null,
          validated_by: null,
          validated_by_user_id: null,
          validation_remarks: null,
          is_corrected: false,
          correction_reason: null,
          previous_result_id: null,
          created_at: nowIso,
          updated_at: nowIso,
          // UI preview metadata
          sample_barcode: sample.barcode,
          order_number: sample.order_number,
          patient_name: sample.patient_name
        };
        insertRecord._key = item._key;
        item._savedRecord = insertRecord;
        recordsToInsert.push(insertRecord);
      }
    }

    // 5. Identify unvalidated records removed by the user in this submission
    // An unvalidated record is removed if its test scope was included in this submission, but this specific parameter was omitted.
    const submittedTestScopes = new Set(
      uniquePayloadItems.map((item) => {
        return item.order_item_id || item.test_id || item.test_code || (item.test_name || '').trim().toLowerCase();
      })
    );

    const idsToRemove = unvalidatedResults
      .filter((r) => {
        const rTestScope = r.order_item_id || r.test_id || r.test_code || (r.test_name || '').trim().toLowerCase();
        return submittedTestScopes.has(rTestScope) && !matchedUnvalidatedIds.has(r.id);
      })
      .map((r) => r.id);

    // 6. Persist to Supabase or Fallback Storage
    const hasDb = await checkTableAvailable();
    if (hasDb) {
      // A. Perform Updates
      for (const rec of recordsToUpdate) {
        const { sample_barcode: _sb, order_number: _on, patient_name: _pn, order: _o, sample: _s, _key: _k, ...updData } = rec;
        const { error: updErr } = await supabase
          .from('lab_results')
          .update(updData)
          .eq('id', rec.id)
          .eq('lab_id', labId);
        if (updErr) throw new Error(`Failed to update result ${rec.id}: ${updErr.message}`);
      }

      // B. Perform Inserts
      if (recordsToInsert.length > 0) {
        const insertData = recordsToInsert.map((rec) => {
          const { sample_barcode: _sb, order_number: _on, patient_name: _pn, order: _o, sample: _s, _key: _k, ...rest } = rec;
          return rest;
        });
        const { error: insErr } = await supabase.from('lab_results').insert(insertData);
        if (insErr) throw new Error(`Failed to save new results: ${insErr.message}`);
      }

      // C. Perform Removals for omitted unvalidated records
      if (idsToRemove.length > 0) {
        const { error: delErr } = await supabase
          .from('lab_results')
          .delete()
          .in('id', idsToRemove)
          .eq('lab_id', labId)
          .eq('status', 'entered');
        if (delErr) throw new Error(`Failed to remove omitted results: ${delErr.message}`);
      }
    } else {
      let all = readFallbackResults();

      // Remove deleted unvalidated ids
      if (idsToRemove.length > 0) {
        const removeSet = new Set(idsToRemove);
        all = all.filter((r) => !removeSet.has(r.id));
      }

      // Update matched records in place
      for (const rec of recordsToUpdate) {
        const idx = all.findIndex((r) => r.id === rec.id);
        if (idx !== -1) {
          const { _key: _k, ...cleanRec } = rec;
          all[idx] = { ...all[idx], ...cleanRec };
        }
      }

      // Insert new records
      if (recordsToInsert.length > 0) {
        const cleanInserts = recordsToInsert.map((r) => {
          const { _key: _k, ...cleanR } = r;
          return cleanR;
        });
        all.unshift(...cleanInserts);
      }

      writeFallbackResults(all);
    }

    // 7. Update Order status to 'in_progress' if currently 'sample_collected' or 'accepted'
    try {
      await supabase
        .from('lab_orders')
        .update({ status: 'in_progress', updated_at: nowIso })
        .eq('id', order_id);
    } catch (e) {}

    // Preserve exact submitted order for allSaved
    const allSaved = uniquePayloadItems.map((item) => item._savedRecord).filter(Boolean);
    return {
      sample_id,
      order_id,
      saved_count: allSaved.length,
      updated_count: recordsToUpdate.length,
      inserted_count: recordsToInsert.length,
      removed_count: idsToRemove.length,
      results: allSaved
    };
  },

  /**
   * Review queue: List entered / corrected results awaiting validation
   * Deduplicates parameters per specimen, ensuring no repeated rows.
   */
  async listValidationQueue(labId, { search = '' } = {}) {
    if (!labId) throw new Error('lab_id is required');

    const results = await this.listResults(labId, { search });
    // Filter for results awaiting validation
    const pendingValidation = results.filter((r) => r.status === 'entered' || r.status === 'corrected');

    // Group by sample / order for clean clinical signoff
    const groupedMap = new Map();
    for (const r of pendingValidation) {
      const key = r.sample_id || r.order_id;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          sample_id: r.sample_id,
          order_id: r.order_id,
          sample_barcode: r.sample?.barcode || r.sample_barcode || 'Unassigned',
          order_number: r.order?.order_number || r.order_number || 'N/A',
          patient_name: r.order?.patient ? `${r.order.patient.first_name || ''} ${r.order.patient.last_name || ''}`.trim() : r.patient_name || 'Patient',
          sample_type: r.sample?.sample_type || 'Specimen',
          entered_at: r.entered_at,
          entered_by: r.entered_by,
          has_critical: false,
          results: []
        });
      }
      const entry = groupedMap.get(key);

      // Deduplicate parameters within review group by identity key (taking latest)
      const paramKey = getResultParameterKey(r);
      const existingIdx = entry.results.findIndex((item) => getResultParameterKey(item) === paramKey);
      if (existingIdx !== -1) {
        if (new Date(r.updated_at || r.entered_at) >= new Date(entry.results[existingIdx].updated_at || entry.results[existingIdx].entered_at)) {
          entry.results[existingIdx] = r;
        }
      } else {
        entry.results.push(r);
      }

      if (r.is_critical) entry.has_critical = true;
    }

    return Array.from(groupedMap.values());
  },

  /**
   * Validate diagnostic results (Pathologist / Lab Director signoff)
   * Prevents unauthorized edits and updates status to 'validated'
   */
  async validateResults(labId, payload, authUser) {
    const { result_ids, validation_remarks } = payload;

    if (!labId) throw new Error('Unauthorized: Laboratory identifier missing');
    if (!Array.isArray(result_ids) || result_ids.length === 0) {
      throw new Error('At least one result_id is required for validation');
    }

    const nowIso = new Date().toISOString();
    const validatorName = (authUser?.name || 'Pathologist / Lab Director').trim();
    const validatorUserId = authUser?.id || null;

    const validatedResults = [];
    const hasDb = await checkTableAvailable();
    const affectedOrderIds = new Set();

    for (const id of result_ids) {
      const existing = await this.getResultById(labId, id);
      if (!existing) {
        const err = new Error(`Result ${id} not found or access denied`);
        err.status = 404;
        throw err;
      }

      if (existing.status === 'validated') {
        validatedResults.push(existing);
        continue;
      }

      const updates = {
        status: 'validated',
        validated_at: nowIso,
        validated_by: validatorName,
        validated_by_user_id: validatorUserId,
        validation_remarks: validation_remarks ? validation_remarks.trim() : existing.validation_remarks,
        updated_at: nowIso
      };

      if (hasDb) {
        const { error: updErr } = await supabase
          .from('lab_results')
          .update(updates)
          .eq('id', id)
          .eq('lab_id', labId);
        if (updErr) throw new Error(`Database validation error: ${updErr.message}`);
      } else {
        const all = readFallbackResults();
        const idx = all.findIndex((r) => r.id === id);
        if (idx !== -1) {
          all[idx] = { ...all[idx], ...updates };
          writeFallbackResults(all);
        }
      }

      affectedOrderIds.add(existing.order_id);
      validatedResults.push({ ...existing, ...updates });
    }

    // Check if all results for each affected order are validated
    for (const ordId of affectedOrderIds) {
      const orderResults = await this.listResults(labId, { orderId: ordId });
      const allValidated = orderResults.length > 0 && orderResults.every((r) => r.status === 'validated');
      if (allValidated) {
        try {
          await supabase
            .from('lab_orders')
            .update({ status: 'completed', updated_at: nowIso })
            .eq('id', ordId);
        } catch (e) {}
      }
    }

    return {
      validated_count: validatedResults.length,
      results: validatedResults
    };
  },

  /**
   * Correct an already validated result with mandatory correction reason.
   * Preserves audit history by retaining previous result row.
   */
  async correctValidatedResult(labId, resultId, payload, authUser) {
    if (!labId || !resultId) throw new Error('Lab ID and Result ID are required');

    const { new_result_value, correction_reason, technician_remarks } = payload;
    if (!correction_reason || !correction_reason.trim() || correction_reason.trim().length < 5) {
      const err = new Error('A detailed correction reason (minimum 5 characters) is required');
      err.status = 400;
      throw err;
    }
    if (!new_result_value || !String(new_result_value).trim()) {
      const err = new Error('New result value is required');
      err.status = 400;
      throw err;
    }

    const previous = await this.getResultById(labId, resultId);
    if (!previous) {
      const err = new Error('Result not found or access denied');
      err.status = 404;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const corrector = (authUser?.name || 'Lab Staff').trim();

    // 1. Mark previous result as superseded / corrected
    const prevUpdates = {
      is_corrected: true,
      updated_at: nowIso
    };

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      await supabase.from('lab_results').update(prevUpdates).eq('id', resultId).eq('lab_id', labId);
    } else {
      const all = readFallbackResults();
      const idx = all.findIndex((r) => r.id === resultId);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...prevUpdates };
        writeFallbackResults(all);
      }
    }

    // 2. Insert corrected replacement result row
    const parsedNum = parseFloat(new_result_value);
    const numericVal = !isNaN(parsedNum) ? parsedNum : null;

    const correctedRecord = {
      id: crypto.randomUUID(),
      lab_id: labId,
      order_id: previous.order_id,
      order_item_id: previous.order_item_id,
      sample_id: previous.sample_id,
      patient_id: previous.patient_id,
      test_id: previous.test_id,
      test_name: previous.test_name,
      test_code: previous.test_code,
      parameter_name: previous.parameter_name,
      result_value: String(new_result_value).trim(),
      numeric_value: numericVal,
      unit: previous.unit,
      reference_range: previous.reference_range,
      reference_min: previous.reference_min,
      reference_max: previous.reference_max,
      interpretation: payload.interpretation || previous.interpretation,
      is_critical: Boolean(payload.is_critical),
      critical_threshold_rule: previous.critical_threshold_rule,
      critical_flagged_at: payload.is_critical ? nowIso : null,
      critical_acknowledged: false,
      critical_acknowledged_at: null,
      critical_acknowledged_by: null,
      critical_acknowledgement_notes: null,
      technician_remarks: technician_remarks ? technician_remarks.trim() : previous.technician_remarks,
      status: 'corrected', // Requires validation signoff again!
      entered_at: nowIso,
      entered_by: corrector,
      entered_by_user_id: authUser?.id || null,
      validated_at: null,
      validated_by: null,
      validated_by_user_id: null,
      validation_remarks: null,
      is_corrected: false,
      correction_reason: correction_reason.trim(),
      previous_result_id: previous.id, // Audit link to previous result!
      created_at: nowIso,
      updated_at: nowIso,
      sample_barcode: previous.sample_barcode || previous.sample?.barcode,
      order_number: previous.order_number || previous.order?.order_number,
      patient_name: previous.patient_name
    };

    if (hasDb) {
      const { sample_barcode: _sb, order_number: _on, patient_name: _pn, ...insertData } = correctedRecord;
      const { error: insErr } = await supabase.from('lab_results').insert(insertData);
      if (insErr) throw new Error(`Database error saving corrected result: ${insErr.message}`);
    } else {
      const all = readFallbackResults();
      all.unshift(correctedRecord);
      writeFallbackResults(all);
    }

    return {
      previous_result: { ...previous, ...prevUpdates },
      corrected_result: correctedRecord
    };
  },

  /**
   * Critical Results: List all critical findings.
   * Deduplicates findings per sample + parameter, ensuring toggles do not multiply findings.
   */
  async listCriticalResults(labId, { status = 'all', search = '' } = {}) {
    if (!labId) throw new Error('lab_id is required');

    let isCrit = true;
    const results = await this.listResults(labId, { isCritical: isCrit, search });

    // Deduplicate critical results for the same sample and parameter identity
    // (taking the most recent finding, preserving ack if present)
    const dedupedCritical = [];
    const seenMap = new Map();
    for (const r of results) {
      if (r.is_corrected) continue; // Exclude superseded corrected results
      const key = `${r.sample_id}:::${getResultParameterKey(r)}`;
      if (!seenMap.has(key)) {
        seenMap.set(key, r);
        dedupedCritical.push(r);
      } else {
        const existing = seenMap.get(key);
        if (r.critical_acknowledged && !existing.critical_acknowledged) {
          seenMap.set(key, r);
          const idx = dedupedCritical.indexOf(existing);
          if (idx !== -1) dedupedCritical[idx] = r;
        }
      }
    }

    if (status === 'unacknowledged') {
      return dedupedCritical.filter((r) => !r.critical_acknowledged);
    }
    if (status === 'acknowledged') {
      return dedupedCritical.filter((r) => r.critical_acknowledged);
    }

    return dedupedCritical;
  },

  /**
   * Critical Results: Acknowledge urgent clinician communication
   */
  async acknowledgeCriticalResult(labId, resultId, payload, authUser) {
    if (!labId || !resultId) throw new Error('Lab ID and Result ID are required');

    const result = await this.getResultById(labId, resultId);
    if (!result || !result.is_critical) {
      const err = new Error('Critical result not found or access denied');
      err.status = 404;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const ackUser = (authUser?.name || 'Lab Staff').trim();
    const ackNotes = (payload.notes || 'Physician notified of critical diagnostic finding via phone call').trim();

    const updates = {
      critical_acknowledged: true,
      critical_acknowledged_at: nowIso,
      critical_acknowledged_by: ackUser,
      critical_acknowledgement_notes: ackNotes,
      updated_at: nowIso
    };

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      const { error: updErr } = await supabase
        .from('lab_results')
        .update(updates)
        .eq('id', resultId)
        .eq('lab_id', labId);
      if (updErr) throw new Error(`Database error acknowledging critical result: ${updErr.message}`);
    } else {
      const all = readFallbackResults();
      const idx = all.findIndex((r) => r.id === resultId);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...updates };
        writeFallbackResults(all);
      }
    }

    return {
      acknowledged: true,
      critical_acknowledged: true,
      result_id: resultId,
      critical_acknowledged_at: nowIso,
      critical_acknowledged_by: ackUser,
      critical_acknowledgement_notes: ackNotes,
      acknowledged_at: nowIso,
      acknowledged_by: ackUser,
      notes: ackNotes,
      result: { ...result, ...updates }
    };
  },

  /**
   * Critical Rules: List lab-configured critical threshold rules
   */
  async getCriticalRules(labId) {
    if (!labId) throw new Error('lab_id is required');

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      const { data, error } = await supabase
        .from('lab_critical_rules')
        .select('*')
        .eq('lab_id', labId)
        .order('created_at', { ascending: false });

      if (error) {
        return [];
      }
      return data || [];
    }

    const all = readFallbackRules();
    return all.filter((r) => r.lab_id === labId);
  },

  /**
   * Critical Rules: Create or update a critical threshold rule
   */
  async saveCriticalRule(labId, ruleData) {
    if (!labId) throw new Error('lab_id is required');
    if (!ruleData.parameter_name) throw new Error('parameter_name is required');

    const hasDb = await checkTableAvailable();
    const nowIso = new Date().toISOString();

    const ruleRecord = {
      id: ruleData.id || crypto.randomUUID(),
      lab_id: labId,
      test_id: ruleData.test_id || null,
      test_code: ruleData.test_code || null,
      test_name: ruleData.test_name || null,
      parameter_name: ruleData.parameter_name.trim(),
      critical_low: ruleData.critical_low !== undefined && ruleData.critical_low !== null ? parseFloat(ruleData.critical_low) : null,
      critical_high: ruleData.critical_high !== undefined && ruleData.critical_high !== null ? parseFloat(ruleData.critical_high) : null,
      unit: ruleData.unit || null,
      status: ruleData.status || 'active',
      updated_at: nowIso
    };

    if (hasDb) {
      const { data, error } = await supabase
        .from('lab_critical_rules')
        .upsert(ruleRecord)
        .select()
        .single();
      if (error) throw new Error(`Database error saving critical rule: ${error.message}`);
      return data;
    }

    const all = readFallbackRules();
    const existingIdx = all.findIndex((r) => r.id === ruleRecord.id);
    if (existingIdx !== -1) {
      all[existingIdx] = ruleRecord;
    } else {
      ruleRecord.created_at = nowIso;
      all.unshift(ruleRecord);
    }
    writeFallbackRules(all);
    return ruleRecord;
  }
};
