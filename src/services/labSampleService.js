import { supabase } from '../lib/supabase.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Concurrency lock map for in-flight collection requests (order_id + sample_type)
const activeCollectionLocks = new Map();

async function acquireCollectionLock(key) {
  while (activeCollectionLocks.has(key)) {
    await activeCollectionLocks.get(key);
  }
  let resolver;
  const promise = new Promise((resolve) => {
    resolver = resolve;
  });
  activeCollectionLocks.set(key, promise);
  return () => {
    activeCollectionLocks.delete(key);
    resolver();
  };
}

// Resilient fallback JSON persistence directory & file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const FALLBACK_FILE = path.join(DATA_DIR, 'lab_samples.json');
const SYNC_RECEIPT_FILE = path.join(DATA_DIR, 'lab_samples.sync_receipt.json');

function ensureFallbackFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FALLBACK_FILE)) {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify([]), 'utf8');
  }
}

function readFallbackSamples() {
  try {
    ensureFallbackFile();
    const data = fs.readFileSync(FALLBACK_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('[LabSampleService] Error reading fallback file:', err);
    return [];
  }
}

function writeFallbackSamples(samples) {
  try {
    ensureFallbackFile();
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(samples, null, 2), 'utf8');
  } catch (err) {
    console.error('[LabSampleService] Error writing fallback file:', err);
  }
}

/**
 * Topologically sorts samples so all parent/original samples are placed before
 * replacement samples that reference them via recollected_sample_id.
 * Supports arbitrary multi-level recollection chains (parent -> child -> grandchild).
 */
export function sortSamplesByDependency(samples) {
  if (!Array.isArray(samples) || samples.length <= 1) return [...(samples || [])];

  const sampleMap = new Map(samples.map((s) => [s.id, s]));
  const result = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(sample) {
    if (visited.has(sample.id)) return;
    if (visiting.has(sample.id)) {
      // Cyclic recollection link guard
      console.warn(`[LabSampleService] Cyclic recollection link detected for sample ${sample.id}`);
      return;
    }

    visiting.add(sample.id);

    // If this sample references a parent in the batch, visit and insert parent first
    if (sample.recollected_sample_id && sampleMap.has(sample.recollected_sample_id)) {
      visit(sampleMap.get(sample.recollected_sample_id));
    }

    visiting.delete(sample.id);
    visited.add(sample.id);
    result.push(sample);
  }

  for (const sample of samples) {
    visit(sample);
  }

  return result;
}

let tableCheckedAt = 0;
let tableAvailable = null;
let migrationSynced = false;
let syncInProgressPromise = null;

/**
 * Check if the live Supabase database has the lab_samples table.
 * If newly detected, trigger concurrency-safe verified synchronization.
 */
async function checkTableAvailable() {
  const now = Date.now();
  if (tableAvailable === true) {
    if (!migrationSynced) {
      await syncFallbackRecordsToSupabase();
    }
    return true;
  }
  if (tableAvailable === false && now - tableCheckedAt < 30000) {
    return false;
  }

  tableCheckedAt = now;
  try {
    const { error } = await supabase.from('lab_samples').select('id').limit(1);
    if (!error) {
      tableAvailable = true;
      if (!migrationSynced) {
        await syncFallbackRecordsToSupabase();
      }
      return true;
    }
    tableAvailable = false;
    return false;
  } catch (e) {
    tableAvailable = false;
    return false;
  }
}

/**
 * Concurrency-safe, verified synchronization of fallback records into Supabase.
 * - Topological dependency ordering for multi-level recollections.
 * - Prevents stale overwrites: only imports confirmed missing records.
 * - Requires 100% verification of records and foreign-key links before switching to DB mode.
 * - Aborts transition on any failure, retaining JSON source and logging failed items.
 */
export async function syncFallbackRecordsToSupabase({ force = false } = {}) {
  // If already syncing concurrently, join existing in-flight promise
  if (syncInProgressPromise) {
    return syncInProgressPromise;
  }

  syncInProgressPromise = (async () => {
    const fallbackSamples = readFallbackSamples();
    if (!fallbackSamples || fallbackSamples.length === 0) {
      migrationSynced = true;
      return { status: 'NOOP', total: 0, inserted: 0, existing: 0 };
    }

    const sampleIds = fallbackSamples.map((s) => s.id);

    // 1. Check existing database rows to prevent stale overwrites
    const { data: existingDbRows, error: checkErr } = await supabase
      .from('lab_samples')
      .select('id, barcode, recollected_sample_id, updated_at')
      .in('id', sampleIds);

    if (checkErr) {
      tableAvailable = false;
      migrationSynced = false;
      throw new Error(`[LabSampleService] Cannot check existing Supabase records: ${checkErr.message}`);
    }

    const existingIdSet = new Set((existingDbRows || []).map((r) => r.id));
    const missingSamples = fallbackSamples.filter((s) => !existingIdSet.has(s.id));

    console.log(
      `[LabSampleService] Fallback sync audit: ${fallbackSamples.length} total, ${existingIdSet.size} already in DB, ${missingSamples.length} missing.`
    );

    // 2. If there are missing samples, sort topologically and insert
    if (missingSamples.length > 0) {
      const sortedMissing = sortSamplesByDependency(missingSamples);
      const failedRecords = [];
      const insertedIds = [];

      for (const smp of sortedMissing) {
        const { order_number: _on, patient_name: _pn, order: _ord, ...dbRecord } = smp;

        const { error: insErr } = await supabase.from('lab_samples').insert(dbRecord);
        if (insErr) {
          failedRecords.push({
            id: smp.id,
            barcode: smp.barcode,
            error: insErr.message
          });
          console.error(
            `[LabSampleService] Sync failure on sample ${smp.barcode} (${smp.id}): ${insErr.message}`
          );
          // Abort further inserts on failure to avoid partial dependency chains
          break;
        }
        insertedIds.push(smp.id);
      }

      if (failedRecords.length > 0) {
        tableAvailable = false;
        migrationSynced = false;
        const err = new Error(
          `[LabSampleService] Fallback synchronization aborted: ${failedRecords.length} record(s) failed to insert. Details: ${JSON.stringify(failedRecords)}`
        );
        err.failedRecords = failedRecords;
        err.insertedCount = insertedIds.length;
        throw err;
      }
    }

    // 3. Post-sync verification: verify that ALL expected samples now exist in DB with valid relationships
    const { data: verifiedRows, error: verErr } = await supabase
      .from('lab_samples')
      .select('id, barcode, recollected_sample_id')
      .in('id', sampleIds);

    if (verErr || !verifiedRows || verifiedRows.length !== sampleIds.length) {
      tableAvailable = false;
      migrationSynced = false;
      throw new Error(
        `[LabSampleService] Verification check failed: Expected ${sampleIds.length} records in database, verified ${verifiedRows?.length || 0}.`
      );
    }

    // Verify self-referential recollection links
    const verifiedMap = new Map(verifiedRows.map((r) => [r.id, r]));
    for (const fbSample of fallbackSamples) {
      if (fbSample.recollected_sample_id) {
        const dbRow = verifiedMap.get(fbSample.id);
        if (!dbRow || dbRow.recollected_sample_id !== fbSample.recollected_sample_id) {
          tableAvailable = false;
          migrationSynced = false;
          throw new Error(
            `[LabSampleService] Recollection link verification failed for sample ${fbSample.barcode}. Expected parent: ${fbSample.recollected_sample_id}, found: ${dbRow?.recollected_sample_id}`
          );
        }
      }
    }

    // 4. Safe archival: Create timestamped backup and sync receipt
    const archivePath = path.join(DATA_DIR, `lab_samples.migrated.${Date.now()}.json`);
    try {
      fs.copyFileSync(FALLBACK_FILE, archivePath);
      const receipt = {
        synced_at: new Date().toISOString(),
        total_records: sampleIds.length,
        missing_imported: missingSamples.length,
        existing_preserved: existingIdSet.size,
        status: 'VERIFIED'
      };
      fs.writeFileSync(SYNC_RECEIPT_FILE, JSON.stringify(receipt, null, 2), 'utf8');
      console.log(`[LabSampleService] Verified synchronization complete. Backup archived at ${archivePath}`);
    } catch (ioErr) {
      console.warn('[LabSampleService] Backup archive write warning:', ioErr.message);
    }

    migrationSynced = true;
    tableAvailable = true;

    return {
      status: 'VERIFIED',
      total: sampleIds.length,
      inserted: missingSamples.length,
      preserved: existingIdSet.size
    };
  })().finally(() => {
    syncInProgressPromise = null;
  });

  return syncInProgressPromise;
}

/**
 * Generate a collision-resistant clinical specimen barcode.
 * Format: SMP-YYYYMMDD-<8-char-crypto-hex>
 * (Provides 4.29 billion possibilities per date)
 */
function generateBarcode() {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `SMP-${dateStr}-${hex}`;
}

export const labSampleService = {
  /**
   * Helper to check active storage mechanism & migration status
   */
  async getStorageStatus() {
    const hasDb = await checkTableAvailable();
    return {
      activeStorage: hasDb ? 'supabase' : 'fallback_json',
      fallbackCount: readFallbackSamples().length,
      migrationSynced,
      migrationPending: !hasDb
    };
  },

  /**
   * Directly exposes verified sync logic for testing & manual sync triggers
   */
  async syncFallbackToSupabase(options) {
    return syncFallbackRecordsToSupabase(options);
  },

  /**
   * List samples scoped strictly to authenticated lab
   */
  async listSamples(labId, { search = '', status = 'all', orderId = null } = {}) {
    if (!labId) throw new Error('lab_id is required');

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      let q = supabase
        .from('lab_samples')
        .select(`
          *,
          order:lab_orders(
            id, order_number, status, total_amount, created_at,
            patient:patients(id, first_name, last_name, phone_number, gender, date_of_birth, patient_code),
            clinic:clinics(id, clinic_name, phone),
            doctor:doctors(id, first_name, last_name)
          )
        `)
        .eq('lab_id', labId)
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        q = q.eq('collection_status', status.toLowerCase());
      }
      if (orderId) {
        q = q.eq('order_id', orderId);
      }

      const { data, error } = await q;
      if (error) {
        // Explicit error: do not silently switch storage systems
        throw new Error(`Database query failed: ${error.message}`);
      }

      let samples = data || [];
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        samples = samples.filter((smp) => {
          const bCode = (smp.barcode || '').toLowerCase();
          const oNum = (smp.order?.order_number || smp.order_number || '').toLowerCase();
          const pName = `${smp.order?.patient?.first_name || smp.patient_name || ''} ${smp.order?.patient?.last_name || ''}`.toLowerCase();
          const sType = (smp.sample_type || '').toLowerCase();
          return bCode.includes(s) || oNum.includes(s) || pName.includes(s) || sType.includes(s);
        });
      }
      return samples;
    }

    // Explicit fallback when table does not exist in DB yet
    const all = readFallbackSamples();
    let filtered = all.filter((s) => s.lab_id === labId);

    if (orderId) {
      filtered = filtered.filter((s) => s.order_id === orderId);
    }
    if (status && status !== 'all') {
      filtered = filtered.filter((s) => (s.collection_status || '').toLowerCase() === status.toLowerCase());
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter((smp) => {
        const bCode = (smp.barcode || '').toLowerCase();
        const oNum = (smp.order?.order_number || smp.order_number || '').toLowerCase();
        const pName = `${smp.order?.patient?.first_name || smp.patient_name || ''} ${smp.order?.patient?.last_name || ''}`.toLowerCase();
        const sType = (smp.sample_type || '').toLowerCase();
        return bCode.includes(s) || oNum.includes(s) || pName.includes(s) || sType.includes(s);
      });
    }

    return filtered;
  },

  /**
   * Get single sample by ID scoped to authenticated lab
   */
  async getSampleById(labId, sampleId) {
    if (!labId || !sampleId) return null;

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      const { data, error } = await supabase
        .from('lab_samples')
        .select(`
          *,
          order:lab_orders(
            id, order_number, status, total_amount, created_at,
            patient:patients(id, first_name, last_name, phone_number, gender, date_of_birth, patient_code),
            clinic:clinics(id, clinic_name, phone),
            doctor:doctors(id, first_name, last_name)
          )
        `)
        .eq('id', sampleId)
        .eq('lab_id', labId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw new Error(`Database query failed: ${error.message}`);
      }
      return data;
    }

    const all = readFallbackSamples();
    return all.find((s) => s.id === sampleId && s.lab_id === labId) || null;
  },

  /**
   * Fetch eligible accepted lab orders that need sample collection
   */
  async getEligibleOrders(labId, { search = '' } = {}) {
    if (!labId) throw new Error('lab_id is required');

    let labOrderService;
    try {
      const mod = await import('@/services/labOrderService');
      labOrderService = mod.labOrderService;
    } catch (e) {
      const mod = await import('./labOrderService.js');
      labOrderService = mod.labOrderService;
    }
    const allOrders = await labOrderService.listOrders({ status: 'all', search }, { role: 'lab', labId });

    // Orders eligible for collection: status is 'accepted' or 'sample_collected'
    const eligible = allOrders.filter((o) => {
      const st = (o.status || '').toLowerCase();
      return st === 'accepted' || st === 'sample_collected';
    });

    return eligible;
  },

  /**
   * Collect a new sample for an accepted order.
   * Concurrency-safe against simultaneous requests.
   * Enforces duplicate protection per (order_id, sample_type) for active samples.
   */
  async collectSample(labId, payload, authUser) {
    const { order_id, order_item_id, sample_type, collected_by, notes, collected_at } = payload;

    if (!labId) throw new Error('Unauthorized: Lab identifier missing');
    if (!order_id) throw new Error('Order ID is required for sample collection');
    if (!sample_type || !sample_type.trim()) throw new Error('Sample Type is required');

    const normalizedSampleType = sample_type.trim().toLowerCase();
    const lockKey = `${labId}:${order_id}:${normalizedSampleType}`;

    // Acquire concurrency lock for this order & sample type
    const releaseLock = await acquireCollectionLock(lockKey);

    try {
      // 1. Verify that order exists and belongs to this laboratory
      let labOrderService;
      try {
        const mod = await import('@/services/labOrderService');
        labOrderService = mod.labOrderService;
      } catch (e) {
        const mod = await import('./labOrderService.js');
        labOrderService = mod.labOrderService;
      }
      const order = await labOrderService.getOrderById(order_id, { role: 'lab', labId });
      if (!order) {
        const err = new Error('Lab order not found or access denied');
        err.status = 404;
        throw err;
      }

      const orderStatus = (order.status || '').toLowerCase();
      if (orderStatus !== 'accepted' && orderStatus !== 'sample_collected') {
        const err = new Error(
          `Cannot collect sample: Order is in "${order.status}" status. Only accepted orders are eligible for collection.`
        );
        err.status = 400;
        throw err;
      }

      // 2. Concurrency-safe duplicate check:
      // An active sample is one currently in 'collected' or 'received' status.
      // If a specimen was rejected or recollection was requested, re-collection is allowed.
      const existingSamples = await this.listSamples(labId, { orderId: order_id });
      const duplicateActive = existingSamples.find((s) => {
        const isSameType = (s.sample_type || '').toLowerCase() === normalizedSampleType;
        const isSameItem = order_item_id && s.order_item_id === order_item_id;
        const isActive = s.collection_status === 'collected' || s.collection_status === 'received';
        return (isSameItem || isSameType) && isActive;
      });

      if (duplicateActive) {
        const err = new Error(
          `An active ${sample_type.trim()} specimen (${duplicateActive.barcode}) has already been collected for this order. Status: "${duplicateActive.collection_status}".`
        );
        err.status = 409;
        throw err;
      }

      const sampleId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const collectionTime = collected_at ? new Date(collected_at).toISOString() : nowIso;
      const collector = (collected_by || authUser?.name || 'Lab Phlebotomist').trim();

      const hasDb = await checkTableAvailable();

      // 3. Retry loop for unique barcode generation to safely handle constraint conflicts
      let barcode = generateBarcode();
      let insertSuccess = false;
      let attempts = 0;
      const maxAttempts = 5;

      while (!insertSuccess && attempts < maxAttempts) {
        attempts++;

        const sampleRecord = {
          id: sampleId,
          order_id,
          order_item_id: order_item_id || null,
          lab_id: labId,
          patient_id: order.patient_id,
          barcode,
          sample_type: sample_type.trim(),
          collection_status: 'collected',
          collected_at: collectionTime,
          collected_by: collector,
          received_at: null,
          received_by: null,
          rejection_reason: null,
          rejection_category: null,
          rejected_at: null,
          rejected_by: null,
          is_recollection: false,
          recollected_sample_id: null,
          notes: notes ? notes.trim() : null,
          created_at: nowIso,
          updated_at: nowIso,
          // Preview metadata
          order_number: order.order_number,
          patient_name: order.patient ? `${order.patient.first_name || ''} ${order.patient.last_name || ''}`.trim() : 'Patient',
          order: {
            id: order.id,
            order_number: order.order_number,
            patient: order.patient,
            clinic: order.clinic,
            doctor: order.doctor
          }
        };

        if (hasDb) {
          const { order_number: _on, patient_name: _pn, order: _ord, ...insertData } = sampleRecord;
          const { error: insErr } = await supabase.from('lab_samples').insert(insertData);

          if (!insErr) {
            insertSuccess = true;
          } else {
            // Check for barcode unique violation (code 23505)
            if (insErr.code === '23505' || (insErr.message && insErr.message.includes('barcode'))) {
              console.warn(`[LabSampleService] Barcode collision (${barcode}), retrying with fresh code...`);
              barcode = generateBarcode();
              continue;
            }
            // Explicit error: do not silently divert to fallback!
            throw new Error(`Failed to save sample to database: ${insErr.message}`);
          }
        } else {
          // Fallback storage
          const all = readFallbackSamples();
          // Check collision in fallback
          if (all.some((s) => s.barcode === barcode)) {
            barcode = generateBarcode();
            continue;
          }
          all.unshift(sampleRecord);
          writeFallbackSamples(all);
          insertSuccess = true;
        }

        // 4. Update order status to 'sample_collected' if order was 'accepted'
        if (orderStatus === 'accepted') {
          try {
            await supabase
              .from('lab_orders')
              .update({ status: 'sample_collected', updated_at: nowIso })
              .eq('id', order_id);
          } catch (e) {
            // Check constraint might not yet include 'sample_collected' before migration
          }
        }

        return sampleRecord;
      }

      throw new Error('Failed to generate a unique specimen barcode after multiple attempts.');
    } finally {
      releaseLock();
    }
  },

  /**
   * Mark a collected sample as received / checked-in at the laboratory bench
   */
  async receiveSample(labId, sampleId, payload = {}, authUser) {
    if (!labId || !sampleId) throw new Error('Lab ID and Sample ID are required');

    const sample = await this.getSampleById(labId, sampleId);
    if (!sample) {
      const err = new Error('Sample not found or access denied');
      err.status = 404;
      throw err;
    }

    if (sample.collection_status !== 'collected') {
      const err = new Error(
        `Cannot receive sample: Current status is "${sample.collection_status}". Only "collected" samples can be marked as received.`
      );
      err.status = 400;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const receiver = (payload.received_by || authUser?.name || 'Lab Technician').trim();
    const notes = payload.notes ? `${sample.notes ? sample.notes + ' | ' : ''}${payload.notes.trim()}` : sample.notes;

    const updates = {
      collection_status: 'received',
      received_at: nowIso,
      received_by: receiver,
      notes,
      updated_at: nowIso
    };

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      const { error } = await supabase
        .from('lab_samples')
        .update(updates)
        .eq('id', sampleId)
        .eq('lab_id', labId);
      if (error) {
        throw new Error(`Failed to update sample in database: ${error.message}`);
      }
    } else {
      const all = readFallbackSamples();
      const idx = all.findIndex((s) => s.id === sampleId);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...updates };
        writeFallbackSamples(all);
      }
    }

    return { ...sample, ...updates };
  },

  /**
   * Reject a sample with mandatory reason & category
   */
  async rejectSample(labId, sampleId, payload, authUser) {
    if (!labId || !sampleId) throw new Error('Lab ID and Sample ID are required');

    const { rejection_reason, rejection_category, notes } = payload;
    if (!rejection_reason || !rejection_reason.trim()) {
      const err = new Error('Rejection reason is mandatory when rejecting a sample');
      err.status = 400;
      throw err;
    }

    const sample = await this.getSampleById(labId, sampleId);
    if (!sample) {
      const err = new Error('Sample not found or access denied');
      err.status = 404;
      throw err;
    }

    if (sample.collection_status === 'rejected' || sample.collection_status === 'recollection_requested') {
      const err = new Error(`Sample is already marked as "${sample.collection_status}"`);
      err.status = 400;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const rejector = authUser?.name || 'Lab Staff';

    const updates = {
      collection_status: 'rejected',
      rejection_reason: rejection_reason.trim(),
      rejection_category: (rejection_category || 'Quality Failure').trim(),
      rejected_at: nowIso,
      rejected_by: rejector,
      notes: notes ? `${sample.notes ? sample.notes + ' | ' : ''}${notes.trim()}` : sample.notes,
      updated_at: nowIso
    };

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      const { error } = await supabase
        .from('lab_samples')
        .update(updates)
        .eq('id', sampleId)
        .eq('lab_id', labId);
      if (error) {
        throw new Error(`Failed to update sample in database: ${error.message}`);
      }
    } else {
      const all = readFallbackSamples();
      const idx = all.findIndex((s) => s.id === sampleId);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...updates };
        writeFallbackSamples(all);
      }
    }

    return { ...sample, ...updates };
  },

  /**
   * Request recollection of a rejected sample without losing original specimen record.
   * Concurrency-safe against simultaneous requests.
   */
  async requestRecollection(labId, sampleId, payload = {}, authUser) {
    if (!labId || !sampleId) throw new Error('Lab ID and Sample ID are required');

    const sample = await this.getSampleById(labId, sampleId);
    if (!sample) {
      const err = new Error('Sample not found or access denied');
      err.status = 404;
      throw err;
    }

    if (sample.collection_status !== 'rejected') {
      const err = new Error(
        `Cannot request recollection: Current sample status is "${sample.collection_status}". Only rejected samples can be flagged for recollection.`
      );
      err.status = 400;
      throw err;
    }

    const lockKey = `${labId}:${sample.order_id}:${(sample.sample_type || '').toLowerCase()}`;
    const releaseLock = await acquireCollectionLock(lockKey);

    try {
      // Re-verify after acquiring lock to prevent race conditions
      const freshSample = await this.getSampleById(labId, sampleId);
      if (freshSample.collection_status !== 'rejected') {
        const err = new Error(`Recollection has already been requested for this specimen.`);
        err.status = 409;
        throw err;
      }

      const nowIso = new Date().toISOString();

      // 1. Mark original sample as 'recollection_requested'
      const origUpdates = {
        collection_status: 'recollection_requested',
        updated_at: nowIso
      };

      const hasDb = await checkTableAvailable();
      if (hasDb) {
        const { error: updErr } = await supabase
          .from('lab_samples')
          .update(origUpdates)
          .eq('id', sampleId)
          .eq('lab_id', labId);
        if (updErr) throw new Error(`Database error updating original sample: ${updErr.message}`);
      }

      // 2. Spawn a replacement sample linked to the original
      const newSampleId = crypto.randomUUID();
      let newBarcode = generateBarcode();
      const collector = (payload.collected_by || authUser?.name || 'Lab Phlebotomist').trim();

      let insertSuccess = false;
      let attempts = 0;
      const maxAttempts = 5;

      while (!insertSuccess && attempts < maxAttempts) {
        attempts++;

        const replacementRecord = {
          id: newSampleId,
          order_id: sample.order_id,
          order_item_id: sample.order_item_id,
          lab_id: labId,
          patient_id: sample.patient_id,
          barcode: newBarcode,
          sample_type: sample.sample_type,
          collection_status: 'collected',
          collected_at: nowIso,
          collected_by: collector,
          received_at: null,
          received_by: null,
          rejection_reason: null,
          rejection_category: null,
          rejected_at: null,
          rejected_by: null,
          is_recollection: true,
          recollected_sample_id: sample.id, // Audit link to the original rejected sample
          notes: payload.notes
            ? `Replacement sample for ${sample.barcode}. Reason: ${payload.notes.trim()}`
            : `Replacement sample for ${sample.barcode}`,
          created_at: nowIso,
          updated_at: nowIso,
          order_number: sample.order_number,
          patient_name: sample.patient_name,
          order: sample.order
        };

        if (hasDb) {
          const { order_number: _on, patient_name: _pn, order: _ord, ...insertData } = replacementRecord;
          const { error: insErr } = await supabase.from('lab_samples').insert(insertData);

          if (!insErr) {
            insertSuccess = true;
          } else {
            if (insErr.code === '23505' || (insErr.message && insErr.message.includes('barcode'))) {
              newBarcode = generateBarcode();
              continue;
            }
            throw new Error(`Failed to save replacement sample to database: ${insErr.message}`);
          }
        } else {
          const all = readFallbackSamples();
          const origIdx = all.findIndex((s) => s.id === sampleId);
          if (origIdx !== -1) {
            all[origIdx].collection_status = 'recollection_requested';
            all[origIdx].updated_at = nowIso;
          }
          all.unshift(replacementRecord);
          writeFallbackSamples(all);
          insertSuccess = true;
        }

        return {
          originalSample: { ...sample, ...origUpdates },
          replacementSample: replacementRecord
        };
      }

      throw new Error('Failed to generate a unique barcode for recollection sample.');
    } finally {
      releaseLock();
    }
  }
};
