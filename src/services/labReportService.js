import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';
import { generateDiagnosticReportPdf } from '../utils/pdfReportGenerator.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_FALLBACK_FILE = path.join(DATA_DIR, 'lab_reports.json');

function ensureReportsFallbackFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(REPORTS_FALLBACK_FILE)) {
      fs.writeFileSync(REPORTS_FALLBACK_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[LabReportService] Error initializing fallback file:', err);
  }
}

function readFallbackReports() {
  try {
    ensureReportsFallbackFile();
    const data = fs.readFileSync(REPORTS_FALLBACK_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    return [];
  }
}

function writeFallbackReports(reports) {
  try {
    ensureReportsFallbackFile();
    fs.writeFileSync(REPORTS_FALLBACK_FILE, JSON.stringify(reports, null, 2), 'utf8');
  } catch (err) {
    console.error('[LabReportService] Error writing fallback reports:', err);
  }
}

let tableCheckedAt = 0;
let tableAvailable = null;

async function checkReportsTableAvailable() {
  const now = Date.now();
  if (tableAvailable === true) return true;
  if (tableAvailable === false && now - tableCheckedAt < 30000) {
    return false;
  }

  tableCheckedAt = now;
  try {
    const { error } = await supabase.from('lab_reports').select('id').limit(1);
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

export function generateReportNumber() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `REP-${yyyy}${mm}${dd}-${rand}`;
}

export const labReportService = {
  /**
   * List eligible orders and specimens for report generation.
   * Only specimens where all results are validated and received are eligible.
   */
  async listEligibleOrdersForReport(labId, { search = '', status = 'all' } = {}) {
    if (!labId) throw new Error('Unauthorized: Lab identifier missing');

    let labResultService;
    let labSampleService;
    try {
      const resMod = await import('@/services/labResultService');
      const sampMod = await import('@/services/labSampleService');
      labResultService = resMod.labResultService;
      labSampleService = sampMod.labSampleService;
    } catch (e) {
      const resMod = await import('./labResultService.js');
      const sampMod = await import('./labSampleService.js');
      labResultService = resMod.labResultService;
      labSampleService = sampMod.labSampleService;
    }

    // 1. Fetch all received samples for this lab
    const samples = await labSampleService.listSamples(labId, { status: 'received', search });
    const allResults = await labResultService.listResults(labId);
    const existingReports = await this.listReports(labId);

    const eligibleList = [];

    for (const sample of samples) {
      const sampleResults = allResults.filter((r) => r.sample_id === sample.id);

      // Check results status
      const hasResults = sampleResults.length > 0;
      const allValidated = hasResults && sampleResults.every((r) => r.status === 'validated');
      const hasPending = sampleResults.some((r) => r.status === 'entered' || r.status === 'corrected');
      const hasCritical = sampleResults.some((r) => r.is_critical && !r.critical_acknowledged);

      // Check if report has already been generated
      const activeReport = existingReports.find(
        (rep) => rep.sample_id === sample.id && (rep.report_status === 'issued' || rep.report_status === 'reissued')
      );

      const eligibility = allValidated ? 'ready' : hasPending ? 'awaiting_validation' : 'no_results';

      if (status === 'ready' && eligibility !== 'ready') continue;
      if (status === 'reported' && !activeReport) continue;
      if (status === 'unreported' && activeReport) continue;

      eligibleList.push({
        sample_id: sample.id,
        order_id: sample.order_id,
        patient_id: sample.patient_id,
        sample_barcode: sample.barcode,
        sample_type: sample.sample_type,
        order_number: sample.order?.order_number || sample.order_number || 'N/A',
        patient_name: sample.patient_name || (sample.order?.patient ? `${sample.order.patient.first_name || ''} ${sample.order.patient.last_name || ''}`.trim() : 'Patient'),
        patient_code: sample.order?.patient?.patient_code || 'N/A',
        doctor_name: sample.order?.doctor ? `Dr. ${sample.order.doctor.first_name || ''} ${sample.order.doctor.last_name || ''}`.trim() : 'Attending Physician',
        clinic_name: sample.order?.clinic?.clinic_name || 'Clinic',
        received_at: sample.received_at,
        results_count: sampleResults.length,
        has_critical: hasCritical,
        eligibility,
        is_eligible_for_report: allValidated,
        active_report_id: activeReport?.id || null,
        active_report_number: activeReport?.report_number || null,
        active_report_status: activeReport?.report_status || null,
        active_report_generated_at: activeReport?.generated_at || null,
        results: sampleResults
      });
    }

    return eligibleList;
  },

  /**
   * Preview a diagnostic report without persisting it
   */
  async previewReport(labId, { orderId, sampleId }) {
    if (!labId) throw new Error('Unauthorized: Lab identifier missing');
    if (!orderId && !sampleId) throw new Error('order_id or sample_id is required');

    let labResultService;
    let labSampleService;
    try {
      const resMod = await import('@/services/labResultService');
      const sampMod = await import('@/services/labSampleService');
      labResultService = resMod.labResultService;
      labSampleService = sampMod.labSampleService;
    } catch (e) {
      const resMod = await import('./labResultService.js');
      const sampMod = await import('./labSampleService.js');
      labResultService = resMod.labResultService;
      labSampleService = sampMod.labSampleService;
    }

    let sample = null;
    if (sampleId) {
      sample = await labSampleService.getSampleById(labId, sampleId);
    }
    if (!sample && orderId) {
      const samples = await labSampleService.listSamples(labId, { orderId });
      sample = samples[0] || null;
    }

    if (!sample) {
      const err = new Error('Specimen or Order not found or access denied');
      err.status = 404;
      throw err;
    }

    // Fetch diagnostic results for this sample
    const results = await labResultService.listResults(labId, { sampleId: sample.id });

    if (!results || results.length === 0) {
      const err = new Error('Cannot issue report: No diagnostic results have been entered for this specimen.');
      err.status = 400;
      throw err;
    }

    const unvalidated = results.filter((r) => r.status !== 'validated');
    if (unvalidated.length > 0) {
      const err = new Error(
        `Cannot issue report: Diagnostic results are awaiting validation signoff (${unvalidated.length} pending parameter(s)). All parameters must be validated by an authorized pathologist/director before generating the final report.`
      );
      err.status = 400;
      throw err;
    }

    // Fetch verified lab details from database
    let labInfo = { id: labId, lab_name: 'Diagnostic Laboratory' };
    try {
      const { data: dbLab } = await supabase.from('labs').select('id, lab_name, email, phone, address').eq('id', labId).maybeSingle();
      if (dbLab) labInfo = dbLab;
    } catch (e) {}

    // Find validator details from results
    const validatorResult = results.find((r) => r.validated_by);
    const validationDetails = {
      validated_by: validatorResult?.validated_by || 'Dr. Pathologist / Lab Director',
      validated_at: validatorResult?.validated_at || new Date().toISOString(),
      validation_remarks: validatorResult?.validation_remarks || 'Correlates with clinical findings. Authorized for release.'
    };

    // Construct immutable preview payload
    const previewPayload = {
      report_number: 'PREVIEW-' + Date.now().toString(36).toUpperCase(),
      generated_at: new Date().toISOString(),
      report_status: 'draft',
      lab: labInfo,
      patient: {
        id: sample.patient_id,
        first_name: sample.order?.patient?.first_name || sample.patient?.first_name || '',
        last_name: sample.order?.patient?.last_name || sample.patient?.last_name || '',
        name: `${sample.order?.patient?.first_name || sample.patient?.first_name || ''} ${sample.order?.patient?.last_name || sample.patient?.last_name || ''}`.trim() || sample.patient_name || 'Patient',
        patient_code: sample.order?.patient?.patient_code || sample.patient?.patient_code || sample.patient_code || 'N/A',
        gender: sample.order?.patient?.gender || sample.patient?.gender || 'N/A',
        date_of_birth: sample.order?.patient?.date_of_birth || sample.patient?.date_of_birth || null,
        phone_number: sample.order?.patient?.phone_number || sample.patient?.phone_number || sample.patient?.phone || ''
      },
      order: {
        id: sample.order_id,
        order_number: sample.order?.order_number || sample.order_number || 'N/A',
        doctor: sample.order?.doctor || null,
        clinic: sample.order?.clinic || null
      },
      sample: {
        id: sample.id,
        barcode: sample.barcode,
        sample_type: sample.sample_type,
        collected_at: sample.collected_at,
        received_at: sample.received_at
      },
      results: results.map((r) => ({
        id: r.id,
        test_name: r.test_name,
        test_code: r.test_code,
        parameter_name: r.parameter_name,
        result_value: r.result_value,
        unit: r.unit,
        reference_range: r.reference_range,
        interpretation: r.interpretation,
        is_critical: Boolean(r.is_critical),
        technician_remarks: r.technician_remarks
      })),
      validation: validationDetails
    };

    return previewPayload;
  },

  /**
   * Final report generation & persistence
   * Idempotent: returns existing issued report on repeated clicks / refresh
   */
  async generateReport(labId, { orderId, sampleId }, authUser) {
    if (!labId) throw new Error('Unauthorized: Lab identifier missing');
    if (!orderId && !sampleId) throw new Error('order_id or sample_id is required');

    // 1. Build immutable report snapshot (validates all parameters are validated)
    const reportSnapshot = await this.previewReport(labId, { orderId, sampleId });

    // 2. Idempotency Check: Avoid duplicate reports on repeated clicks
    const targetSampleId = reportSnapshot.sample.id;
    const targetOrderId = reportSnapshot.order.id;

    const existingReports = await this.listReports(labId, { orderId: targetOrderId, sampleId: targetSampleId });
    const existingActive = existingReports.find((r) => r.report_status === 'issued' && !r.is_reissue);

    if (existingActive) {
      return {
        already_issued: true,
        report_id: existingActive.id,
        report_number: existingActive.report_number,
        report: existingActive
      };
    }

    // 3. Create fresh issued report
    const nowIso = new Date().toISOString();
    const reportNum = generateReportNumber();
    const generatorName = (authUser?.name || 'Lab Staff').trim();
    const generatorUserId = authUser?.id || null;

    reportSnapshot.report_number = reportNum;
    reportSnapshot.generated_at = nowIso;
    reportSnapshot.report_status = 'issued';

    const reportRecord = {
      id: crypto.randomUUID(),
      report_number: reportNum,
      lab_id: labId,
      order_id: targetOrderId,
      sample_id: targetSampleId,
      patient_id: reportSnapshot.patient.id,
      report_status: 'issued',
      generated_at: nowIso,
      generated_by: generatorName,
      generated_by_user_id: generatorUserId,
      validated_by: reportSnapshot.validation.validated_by,
      validated_at: reportSnapshot.validation.validated_at,
      report_data: reportSnapshot,
      pdf_url: null,
      is_reissue: false,
      reissue_reason: null,
      previous_report_id: null,
      created_at: nowIso,
      updated_at: nowIso,
      // Metadata for quick listing in fallback
      patient_name: `${reportSnapshot.patient.first_name || ''} ${reportSnapshot.patient.last_name || ''}`.trim(),
      patient_code: reportSnapshot.patient.patient_code,
      order_number: reportSnapshot.order.order_number,
      sample_barcode: reportSnapshot.sample.barcode
    };

    const hasDb = await checkReportsTableAvailable();
    if (hasDb) {
      const { patient_name: _pn, patient_code: _pc, order_number: _on, sample_barcode: _sb, ...dbData } = reportRecord;
      const { error: insErr } = await supabase.from('lab_reports').insert(dbData);
      if (insErr) {
        throw new Error(`Database error saving diagnostic report: ${insErr.message}`);
      }
    } else {
      const all = readFallbackReports();
      all.unshift(reportRecord);
      writeFallbackReports(all);
    }

    return {
      already_issued: false,
      report_id: reportRecord.id,
      report_number: reportRecord.report_number,
      report: reportRecord
    };
  },

  /**
   * List reports scoped strictly to authenticated lab with search and filters
   */
  async listReports(labId, { search = '', patientId = null, orderId = null, sampleId = null, status = 'all' } = {}) {
    if (!labId) throw new Error('Unauthorized: Lab identifier missing');

    const hasDb = await checkReportsTableAvailable();
    if (hasDb) {
      let q = supabase
        .from('lab_reports')
        .select(`
          *,
          patient:patients(id, first_name, last_name, patient_code, phone_number, gender, date_of_birth),
          order:lab_orders(id, order_number, status, created_at, clinic:clinics(id, clinic_name), doctor:doctors(id, first_name, last_name)),
          sample:lab_samples(id, barcode, sample_type, collected_at, received_at)
        `)
        .eq('lab_id', labId)
        .order('generated_at', { ascending: false });

      if (patientId) q = q.eq('patient_id', patientId);
      if (orderId) q = q.eq('order_id', orderId);
      if (sampleId) q = q.eq('sample_id', sampleId);
      if (status && status !== 'all') q = q.eq('report_status', status.toLowerCase());

      const { data, error } = await q;
      if (error) {
        throw new Error(`Database error querying reports: ${error.message}`);
      }

      let reports = data || [];
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        reports = reports.filter((r) => {
          const rNum = (r.report_number || '').toLowerCase();
          const oNum = (r.order?.order_number || '').toLowerCase();
          const bCode = (r.sample?.barcode || '').toLowerCase();
          const pName = `${r.patient?.first_name || ''} ${r.patient?.last_name || ''}`.toLowerCase();
          const pCode = (r.patient?.patient_code || '').toLowerCase();
          return rNum.includes(s) || oNum.includes(s) || bCode.includes(s) || pName.includes(s) || pCode.includes(s);
        });
      }
      return reports;
    }

    // Fallback store
    const all = readFallbackReports();
    let filtered = all.filter((r) => r.lab_id === labId);

    if (patientId) filtered = filtered.filter((r) => r.patient_id === patientId);
    if (orderId) filtered = filtered.filter((r) => r.order_id === orderId);
    if (sampleId) filtered = filtered.filter((r) => r.sample_id === sampleId);
    if (status && status !== 'all') filtered = filtered.filter((r) => (r.report_status || '').toLowerCase() === status.toLowerCase());

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter((r) => {
        const rNum = (r.report_number || '').toLowerCase();
        const oNum = (r.order_number || r.order?.order_number || '').toLowerCase();
        const bCode = (r.sample_barcode || r.sample?.barcode || '').toLowerCase();
        const pName = (r.patient_name || '').toLowerCase();
        const pCode = (r.patient_code || '').toLowerCase();
        return rNum.includes(s) || oNum.includes(s) || bCode.includes(s) || pName.includes(s) || pCode.includes(s);
      });
    }

    return filtered;
  },

  /**
   * Get single report by ID scoped to authenticated lab
   */
  async getReportById(labId, reportId) {
    if (!labId || !reportId) return null;

    const hasDb = await checkReportsTableAvailable();
    if (hasDb) {
      const { data, error } = await supabase
        .from('lab_reports')
        .select(`
          *,
          patient:patients(id, first_name, last_name, patient_code, phone_number, gender, date_of_birth),
          order:lab_orders(id, order_number, status, created_at, clinic:clinics(id, clinic_name), doctor:doctors(id, first_name, last_name)),
          sample:lab_samples(id, barcode, sample_type, collected_at, received_at)
        `)
        .eq('id', reportId)
        .eq('lab_id', labId)
        .maybeSingle();

      if (error) {
        throw new Error(`Database error fetching report: ${error.message}`);
      }
      return data;
    }

    const all = readFallbackReports();
    return all.find((r) => r.id === reportId && r.lab_id === labId) || null;
  },

  /**
   * Generate downloadable PDF binary for an authorized report
   */
  async generateReportPdfBuffer(labId, reportId) {
    const report = await this.getReportById(labId, reportId);
    if (!report) {
      const err = new Error('Diagnostic report not found or access denied');
      err.status = 404;
      throw err;
    }

    const reportData = report.report_data || {};
    const pdfBuffer = generateDiagnosticReportPdf(reportData);

    return {
      filename: `Report-${report.report_number || 'diagnostic'}.pdf`,
      pdfBuffer
    };
  },

  /**
   * Reissue an amended diagnostic report with audit tracking
   */
  async reissueReport(labId, reportId, payload, authUser) {
    if (!labId || !reportId) throw new Error('Lab ID and Report ID are required');

    const { reissue_reason } = payload;
    if (!reissue_reason || reissue_reason.trim().length < 5) {
      const err = new Error('A detailed reason for report reissue (minimum 5 characters) is required');
      err.status = 400;
      throw err;
    }

    const previous = await this.getReportById(labId, reportId);
    if (!previous) {
      const err = new Error('Previous diagnostic report not found or access denied');
      err.status = 404;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const issuerName = (authUser?.name || 'Lab Staff').trim();

    // 1. Mark previous report as 'reissued'
    const prevUpdates = {
      report_status: 'reissued',
      updated_at: nowIso
    };

    const hasDb = await checkReportsTableAvailable();
    if (hasDb) {
      await supabase.from('lab_reports').update(prevUpdates).eq('id', reportId).eq('lab_id', labId);
    } else {
      const all = readFallbackReports();
      const idx = all.findIndex((r) => r.id === reportId);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...prevUpdates };
        writeFallbackReports(all);
      }
    }

    // 2. Fetch fresh validated results & build new snapshot
    const freshSnapshot = await this.previewReport(labId, { orderId: previous.order_id, sampleId: previous.sample_id });
    const newReportNum = generateReportNumber();
    freshSnapshot.report_number = newReportNum;
    freshSnapshot.generated_at = nowIso;
    freshSnapshot.report_status = 'issued';

    const newReportRecord = {
      id: crypto.randomUUID(),
      report_number: newReportNum,
      lab_id: labId,
      order_id: previous.order_id,
      sample_id: previous.sample_id,
      patient_id: previous.patient_id,
      report_status: 'issued',
      generated_at: nowIso,
      generated_by: issuerName,
      generated_by_user_id: authUser?.id || null,
      validated_by: freshSnapshot.validation.validated_by,
      validated_at: freshSnapshot.validation.validated_at,
      report_data: freshSnapshot,
      pdf_url: null,
      is_reissue: true,
      reissue_reason: reissue_reason.trim(),
      previous_report_id: previous.id,
      created_at: nowIso,
      updated_at: nowIso,
      patient_name: previous.patient_name,
      patient_code: previous.patient_code,
      order_number: previous.order_number,
      sample_barcode: previous.sample_barcode
    };

    if (hasDb) {
      const { patient_name: _pn, patient_code: _pc, order_number: _on, sample_barcode: _sb, ...dbData } = newReportRecord;
      const { error: insErr } = await supabase.from('lab_reports').insert(dbData);
      if (insErr) throw new Error(`Database error saving reissued report: ${insErr.message}`);
    } else {
      const all = readFallbackReports();
      all.unshift(newReportRecord);
      writeFallbackReports(all);
    }

    return {
      previous_report: { ...previous, ...prevUpdates },
      reissued_report: newReportRecord
    };
  }
};
