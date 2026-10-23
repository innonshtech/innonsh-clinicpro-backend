import { supabase } from '@/lib/supabase';
import { labTestService } from './labTestService';
import { labPackageService } from './labPackageService';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PRIORITY_RANK = {
  critical: 3,
  stat: 3,
  urgent: 2,
  routine: 1
};

export function getPriorityRank(p) {
  return PRIORITY_RANK[(p || 'routine').toLowerCase()] || 1;
}

export function normalizePriority(val) {
  if (val === undefined || val === null || String(val).trim() === '') {
    return 'routine';
  }
  const clean = String(val).trim().toLowerCase();
  if (clean === 'routine') return 'routine';
  if (clean === 'urgent') return 'urgent';
  if (clean === 'critical' || clean === 'stat' || clean === 'critical_stat' || clean === 'critical / stat' || clean === 'critical/stat') {
    return clean === 'stat' ? 'stat' : 'critical';
  }
  return null;
}

// Fallback JSON persistence directory & file
const DATA_DIR = path.join(process.cwd(), 'data');
const FALLBACK_FILE = path.join(DATA_DIR, 'lab_orders.json');

function ensureFallbackFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FALLBACK_FILE)) {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify([]), 'utf8');
  }
}

function readFallbackOrders() {
  try {
    ensureFallbackFile();
    const data = fs.readFileSync(FALLBACK_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('[LabOrderService] Error reading fallback file:', err);
    return [];
  }
}

function writeFallbackOrders(orders) {
  try {
    ensureFallbackFile();
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(orders, null, 2), 'utf8');
  } catch (err) {
    console.error('[LabOrderService] Error writing fallback file:', err);
  }
}


const FALLBACK_LABS_FILE = path.join(DATA_DIR, 'labs.json');

function readFallbackLabs() {
  try {
    if (fs.existsSync(FALLBACK_LABS_FILE)) {
      const data = fs.readFileSync(FALLBACK_LABS_FILE, 'utf8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  try {
    const orders = readFallbackOrders();
    const map = new Map();
    for (const o of orders) {
      if (o.lab && o.lab.id && !map.has(o.lab.id)) {
        map.set(o.lab.id, {
          id: o.lab.id,
          lab_name: o.lab.lab_name || 'Central Diagnostic Center',
          email: o.lab.email || 'lab@clinicpro.com',
          phone: o.lab.phone || '9876543210',
          city: o.lab.city || 'Central City',
          address: o.lab.address || 'Medical Enclave',
          status: 'active'
        });
      }
    }
    if (map.size > 0) return Array.from(map.values());
  } catch (_) {}

  return [
    {
      id: '74a3e334-1cd5-4288-916c-bc83c33e058e',
      lab_name: 'Apex Diagnostic & Imaging Center',
      email: 'apex.diagnostics@clinicpro.com',
      phone: '9876543210',
      address: 'Suite 101, Diagnostic Plaza',
      city: 'Metro City',
      state: 'State',
      postal_code: '110001',
      status: 'active'
    },
    {
      id: '88b4f445-2de6-5399-a27d-cd94d44f169f',
      lab_name: 'Metro Radiology & Pathology Facility',
      email: 'metro.radiology@clinicpro.com',
      phone: '9876543211',
      address: 'Plot 45, Health Avenue',
      city: 'Metro City',
      state: 'State',
      postal_code: '110002',
      status: 'active'
    }
  ];
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
    const { error: err1 } = await supabase.from('lab_orders').select('id').limit(1);
    const { error: err2 } = await supabase.from('lab_order_items').select('id').limit(1);
    if (!err1 && !err2) {
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

function generateOrderNumber() {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${dateStr}-${rand}`;
}

export const labOrderService = {
  /**
   * Fetch active laboratories available for ordering
   */
  async listActiveLabs() {
    try {
      const { data, error } = await supabase
        .from('labs')
        .select('id, lab_name, email, login_email, phone, address, city, state, postal_code, status')
        .order('lab_name', { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.filter(l => (l.status || 'active').toLowerCase() === 'active');
      }
    } catch (err) {
      console.warn('[LabOrderService] listActiveLabs DB query failed, using fallback:', err.message);
    }
    return readFallbackLabs().filter(l => (l.status || 'active').toLowerCase() === 'active');
  },

  /**
   * Get active diagnostic tests and packages offered by a specific laboratory
   */
  async getLabServices(labId) {
    if (!labId) throw new Error('labId is required');

    // 1. Get tests for labId
    let tests = [];
    try {
      tests = await labTestService.listTests(labId, { status: 'active' });
    } catch (err) {
      console.warn('[LabOrderService] Error fetching tests for lab:', err.message);
    }

    // 2. Get packages for labId
    let packages = [];
    try {
      packages = await labPackageService.listPackages(labId, { status: 'active' });
    } catch (err) {
      console.warn('[LabOrderService] Error fetching packages for lab:', err.message);
    }

    return {
      labId,
      tests: (tests || []).filter(t => (t.status || 'active').toLowerCase() === 'active'),
      packages: (packages || []).filter(p => (p.status || 'active').toLowerCase() === 'active')
    };
  },

  /**
   * Create a new Lab Order
   */
  async createOrder(orderPayload, authUser) {
    const { patient_id, lab_id, items, clinical_notes, priority: rawPriority } = orderPayload;

    const validatedPriority = normalizePriority(rawPriority);
    if (!validatedPriority) {
      throw new Error(`Invalid order priority "${rawPriority}". Allowed values are: Routine, Urgent, Critical / STAT.`);
    }

    if (!patient_id) throw new Error('Patient is required');
    if (!lab_id) throw new Error('Destination laboratory is required');
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('At least one diagnostic test or package must be included in the order');
    }

    // Determine ordering context
    const role = (authUser.role || '').toLowerCase();
    let ordering_type = 'doctor';
    let doctor_id = null;
    let receptionist_id = null;
    let clinic_id = null;

    if (role === 'doctor') {
      ordering_type = 'doctor';
      doctor_id = authUser.id || authUser.doctorId;
      clinic_id = authUser.clinicId || null;
    } else if (role === 'receptionist') {
      ordering_type = 'receptionist';
      receptionist_id = authUser.id || authUser.receptionistId;
      clinic_id = authUser.clinicId || null;
      if (!clinic_id) {
        try {
          const { data: staffData } = await supabase
            .from('staff')
            .select('clinic_id')
            .eq('id', receptionist_id)
            .single();
          if (staffData?.clinic_id) {
            clinic_id = staffData.clinic_id;
          }
        } catch (e) {}
      }
    } else if (role === 'admin') {
      ordering_type = orderPayload.ordering_type || (orderPayload.receptionist_id ? 'receptionist' : 'doctor');
      doctor_id = orderPayload.doctor_id || null;
      receptionist_id = orderPayload.receptionist_id || null;
      clinic_id = orderPayload.clinic_id || null;
    } else if (role === 'clinic') {
      throw new Error('Forbidden: Clinics cannot create lab orders; only Doctors and Receptionists can create lab orders.');
    } else {
      throw new Error('Only doctors or receptionists can create lab orders.');
    }

    // Fetch patient info
    let patientObj = null;
    try {
      const { data: pData } = await supabase
        .from('patients')
        .select('id, first_name, last_name, phone_number, gender, date_of_birth, patient_code')
        .eq('id', patient_id)
        .single();
      patientObj = pData;
    } catch (e) {
      console.warn('[LabOrderService] Patient lookup failed:', e.message);
    }
    if (!patientObj) {
      patientObj = {
        id: patient_id,
        first_name: orderPayload.patient_name || 'Patient',
        last_name: '',
        phone_number: '',
        gender: ''
      };
    }

    // Fetch lab info
    let labObj = null;
    try {
      const { data: lData } = await supabase
        .from('labs')
        .select('id, lab_name, email, phone, city, address, status')
        .eq('id', lab_id)
        .single();
      labObj = lData;
    } catch (e) {
      console.warn('[LabOrderService] Lab lookup failed:', e.message);
    }

    if (labObj && (labObj.status || 'active').toLowerCase() !== 'active') {
      throw new Error(`The selected laboratory (${labObj.lab_name}) is currently inactive`);
    }

    // Fetch doctor info if present
    let doctorObj = null;
    if (doctor_id) {
      try {
        const { data: dData } = await supabase
          .from('doctors')
          .select('id, first_name, last_name, email, specialty')
          .eq('id', doctor_id)
          .single();
        doctorObj = dData;
      } catch (e) {}
    }

    // Fetch receptionist info if present
    let receptionistObj = null;
    if (receptionist_id) {
      try {
        const { data: rData } = await supabase
          .from('staff')
          .select('id, first_name, last_name, email, phone, role')
          .eq('id', receptionist_id)
          .single();
        receptionistObj = rData;
      } catch (e) {}
    }

    // Fetch clinic info if present
    let clinicObj = null;
    if (clinic_id) {
      try {
        const { data: cData } = await supabase
          .from('clinics')
          .select('id, clinic_name, email, phone')
          .eq('id', clinic_id)
          .single();
        clinicObj = cData;
      } catch (e) {}
    }

    // Fetch valid active catalog & packages for this lab
    const labServices = await this.getLabServices(lab_id);
    const testsMap = new Map(labServices.tests.map(t => [t.id, t]));
    const packagesMap = new Map(labServices.packages.map(p => [p.id, p]));

    // Validate and build enriched order items
    const enrichedItems = [];
    let calculatedTotal = 0;

    for (const item of items) {
      const itemType = (item.item_type || 'test').toLowerCase();
      if (itemType === 'test') {
        const testId = item.test_id || item.id;
        const test = testsMap.get(testId);
        if (!test) {
          throw new Error(
            `Diagnostic test ID "${testId}" is not available or does not belong to the selected laboratory.`
          );
        }
        const price = Number(test.price) || 0;
        calculatedTotal += price;
        enrichedItems.push({
          id: crypto.randomUUID(),
          item_type: 'test',
          test_id: test.id,
          package_id: null,
          item_name: test.test_name,
          item_code: test.test_code,
          price
        });
      } else if (itemType === 'package') {
        const packageId = item.package_id || item.id;
        const pkg = packagesMap.get(packageId);
        if (!pkg) {
          throw new Error(
            `Test package ID "${packageId}" is not available or does not belong to the selected laboratory.`
          );
        }
        const price = Number(pkg.package_price) || 0;
        calculatedTotal += price;
        enrichedItems.push({
          id: crypto.randomUUID(),
          item_type: 'package',
          test_id: null,
          package_id: pkg.id,
          item_name: pkg.package_name,
          item_code: pkg.package_code,
          price
        });
      } else if (itemType === 'radiology' || itemType === 'imaging') {
        const modality = (item.modality || item.investigation_type || 'X-Ray').trim();
        const studyName = (item.study_name || item.item_name || item.investigation_name || '').trim();
        if (!studyName || studyName.length < 2) {
          throw new Error('Study name is required for radiology investigations (minimum 2 characters).');
        }
        const indication = (item.clinical_indication || item.indication || clinical_notes || '').trim();
        if (!indication || indication.length < 3) {
          throw new Error('A clinical indication is mandatory for radiology orders (minimum 3 characters).');
        }
        const price = Number(item.price) || 0;
        calculatedTotal += price;
        const radTestCode = item.item_code || `RAD-${modality.replace(/\s+/g, '').toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-4)}`;
        enrichedItems.push({
          id: crypto.randomUUID(),
          item_type: 'radiology',
          test_id: item.test_id || null,
          package_id: null,
          item_name: `${modality}: ${studyName}`,
          item_code: radTestCode,
          modality,
          study_name: studyName,
          clinical_indication: indication,
          instructions: (item.instructions || '').trim(),
          price
        });
      } else {
        throw new Error(`Invalid item_type "${itemType}". Must be 'test', 'package', or 'radiology'.`);
      }
    }

    const orderNumber = generateOrderNumber();
    const orderId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const orderRecord = {
      id: orderId,
      order_number: orderNumber,
      patient_id,
      ordering_type,
      doctor_id,
      receptionist_id,
      clinic_id,
      lab_id,
      total_amount: calculatedTotal,
      status: 'pending',
      priority: validatedPriority,
      clinical_notes: clinical_notes ? String(clinical_notes).trim() : null,
      category: enrichedItems.some(i => i.item_type === 'radiology') ? 'radiology' : 'pathology',
      has_radiology: enrichedItems.some(i => i.item_type === 'radiology'),
      created_at: nowIso,
      updated_at: nowIso
    };

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      try {
        let insertPayload = { ...orderRecord };
        let { error: ordErr } = await supabase.from('lab_orders').insert(insertPayload);
        if (ordErr && ordErr.message && ordErr.message.includes('priority')) {
          const { priority: _, ...payloadWithoutPriority } = insertPayload;
          insertPayload = payloadWithoutPriority;
          const retryRes = await supabase.from('lab_orders').insert(insertPayload);
          ordErr = retryRes.error;
        }
        if (ordErr && ordErr.message && ordErr.message.includes('receptionist_id')) {
          // If receptionist_id column is not yet migrated in Supabase, insert without it to preserve compatibility
          const { receptionist_id: _, ...payloadWithoutRec } = insertPayload;
          const retryRes = await supabase.from('lab_orders').insert(payloadWithoutRec);
          ordErr = retryRes.error;
        }
        if (ordErr) throw ordErr;
        // Also persist to fallback so priority is retained even if Supabase column is not yet migrated
        writeFallback(orderRecord, enrichedItems, patientObj, labObj, doctorObj, clinicObj, receptionistObj);

        const dbItems = enrichedItems.map(it => ({
          id: it.id,
          order_id: orderId,
          item_type: it.item_type,
          test_id: it.test_id,
          package_id: it.package_id,
          item_name: it.item_name,
          item_code: it.item_code,
          price: it.price,
          created_at: nowIso
        }));

        const { error: itErr } = await supabase.from('lab_order_items').insert(dbItems);
        if (itErr) console.warn('[LabOrderService] Error inserting order items to DB:', itErr.message);
      } catch (dbErr) {
        console.warn('[LabOrderService] DB insert failed, saving to fallback:', dbErr.message);
        writeFallback(orderRecord, enrichedItems, patientObj, labObj, doctorObj, clinicObj, receptionistObj);
      }
    } else {
      writeFallback(orderRecord, enrichedItems, patientObj, labObj, doctorObj, clinicObj, receptionistObj);
    }

    return {
      ...orderRecord,
      patient: patientObj,
      lab: labObj,
      doctor: doctorObj,
      receptionist: receptionistObj,
      clinic: clinicObj,
      items: enrichedItems
    };
  },

  /**
   * List orders scoped by authenticated user role and ID (Strict Data Isolation)
   */
  async listOrders(filters = {}, authUser) {
    const role = (authUser.role || '').toLowerCase();
    const { status = 'all', search = '' } = filters;

    // Strict multi-tenant scoping
    let labFilter = null;
    let doctorFilter = null;
    let receptionistFilter = null;
    let clinicFilter = null;

    if (role === 'lab') {
      labFilter = authUser.labId || authUser.id;
    } else if (role === 'doctor') {
      doctorFilter = authUser.id || authUser.doctorId;
    } else if (role === 'receptionist') {
      receptionistFilter = authUser.id || authUser.receptionistId;
    } else if (role === 'clinic') {
      clinicFilter = authUser.id || authUser.clinicId;
    } else if (role === 'admin') {
      if (filters.labId) labFilter = filters.labId;
      if (filters.doctorId) doctorFilter = filters.doctorId;
      if (filters.receptionistId) receptionistFilter = filters.receptionistId;
      if (filters.clinicId) clinicFilter = filters.clinicId;
    } else {
      return [];
    }

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      try {
        let q = supabase
          .from('lab_orders')
          .select(`
            *,
            patient:patients(id, first_name, last_name, phone_number, gender, date_of_birth, patient_code),
            lab:labs(id, lab_name, email, phone, city, address),
            doctor:doctors(id, first_name, last_name, email, specialty),
            clinic:clinics(id, clinic_name, email, phone),
            items:lab_order_items(*)
          `)
          .order('created_at', { ascending: false });

        if (labFilter) q = q.eq('lab_id', labFilter);
        if (doctorFilter) q = q.eq('doctor_id', doctorFilter);
        if (receptionistFilter) q = q.eq('receptionist_id', receptionistFilter);
        if (clinicFilter) q = q.eq('clinic_id', clinicFilter);
        if (status && status !== 'all') q = q.eq('status', status.toLowerCase());

        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          let orders = data;
          const fallbackOrders = readFallbackOrders();
          const fallbackMap = new Map(fallbackOrders.map(o => [o.id, o]));
          const numMap = new Map(fallbackOrders.map(o => [o.order_number, o]));
          orders.forEach(o => {
            const fb = fallbackMap.get(o.id) || numMap.get(o.order_number);
            if (!o.priority && fb?.priority) {
              o.priority = fb.priority;
            }
            o.priority = o.priority || 'routine';
          });
          try {
            const fallbackOrders = readFallbackOrders();
            const dbIds = new Set(orders.map(o => o.id));
            const dbNums = new Set(orders.map(o => o.order_number));
            const matchingFallback = fallbackOrders.filter(o => {
              if (dbIds.has(o.id) || dbNums.has(o.order_number)) return false;
              if (labFilter && o.lab_id !== labFilter) return false;
              if (doctorFilter && o.doctor_id !== doctorFilter) return false;
              if (receptionistFilter && o.receptionist_id !== receptionistFilter) return false;
              if (clinicFilter && o.clinic_id !== clinicFilter) return false;
              if (status && status !== 'all' && (o.status || 'pending').toLowerCase() !== status.toLowerCase()) return false;
              return true;
            });
            orders = [...orders, ...matchingFallback];
          } catch (_) {}

          // Enrich receptionist from staff table if receptionist_id exists
          const recIds = [...new Set(orders.map(o => o.receptionist_id).filter(Boolean))];
          if (recIds.length > 0) {
            try {
              const { data: staffList } = await supabase
                .from('staff')
                .select('id, first_name, last_name, email, phone, role')
                .in('id', recIds);
              if (staffList) {
                const staffMap = new Map(staffList.map(s => [s.id, s]));
                orders.forEach(o => {
                  if (o.receptionist_id && staffMap.has(o.receptionist_id)) {
                    o.receptionist = staffMap.get(o.receptionist_id);
                  }
                });
              }
            } catch (e) {}
          }

          if (search.trim()) {
            const s = search.trim().toLowerCase();
            orders = orders.filter(o => {
              const num = (o.order_number || '').toLowerCase();
              const pName = `${o.patient?.first_name || ''} ${o.patient?.last_name || ''}`.toLowerCase();
              const lName = (o.lab?.lab_name || '').toLowerCase();
              const docName = `${o.doctor?.first_name || ''} ${o.doctor?.last_name || ''}`.toLowerCase();
              const recName = `${o.receptionist?.first_name || ''} ${o.receptionist?.last_name || ''}`.toLowerCase();
              return num.includes(s) || pName.includes(s) || lName.includes(s) || docName.includes(s) || recName.includes(s);
            });
          }
          orders.sort((a, b) => {
            const timeA = new Date(a.created_at || a.createdAt || 0).getTime();
            const timeB = new Date(b.created_at || b.createdAt || 0).getTime();
            if (timeB !== timeA) return timeB - timeA;
            return String(b.id || b._id || '').localeCompare(String(a.id || a._id || ''));
          });
          return orders;
        }
      } catch (dbErr) {
        console.warn('[LabOrderService] Supabase listOrders failed, using fallback:', dbErr.message);
      }
    }

    // Fallback list
    const all = readFallbackOrders();
    let filtered = all.filter(o => {
      if (labFilter && o.lab_id !== labFilter) return false;
      if (doctorFilter && o.doctor_id !== doctorFilter) return false;
      if (receptionistFilter && o.receptionist_id !== receptionistFilter) return false;
      if (clinicFilter && o.clinic_id !== clinicFilter) return false;
      if (status && status !== 'all' && (o.status || 'pending').toLowerCase() !== status.toLowerCase()) {
        return false;
      }
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const num = (o.order_number || '').toLowerCase();
        const pName = `${o.patient?.first_name || ''} ${o.patient?.last_name || ''}`.toLowerCase();
        const lName = (o.lab?.lab_name || '').toLowerCase();
        const docName = `${o.doctor?.first_name || ''} ${o.doctor?.last_name || ''}`.toLowerCase();
        const recName = `${o.receptionist?.first_name || ''} ${o.receptionist?.last_name || ''}`.toLowerCase();
        if (!num.includes(s) && !pName.includes(s) && !lName.includes(s) && !docName.includes(s) && !recName.includes(s)) return false;
      }
      return true;
    });

    filtered.forEach(o => {
      o.priority = o.priority || 'routine';
    });
    filtered.sort((a, b) => {
      const timeA = new Date(a.created_at || a.createdAt || 0).getTime();
      const timeB = new Date(b.created_at || b.createdAt || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return String(b.id || b._id || '').localeCompare(String(a.id || a._id || ''));
    });
    return filtered;
  },

  /**
   * Get single order by ID with tenant access check
   */
  async getOrderById(orderId, authUser) {
    if (!orderId) throw new Error('Order ID is required');
    const role = (authUser.role || '').toLowerCase();

    const hasDb = await checkTableAvailable();
    if (hasDb) {
      try {
        const { data, error } = await supabase
          .from('lab_orders')
          .select(`
            *,
            patient:patients(id, first_name, last_name, phone_number, gender, date_of_birth, patient_code),
            lab:labs(id, lab_name, email, phone, city, address),
            doctor:doctors(id, first_name, last_name, email, specialty),
            clinic:clinics(id, clinic_name, email, phone),
            items:lab_order_items(*)
          `)
          .eq('id', orderId)
          .single();

        if (!error && data) {
          const fallbackOrders = readFallbackOrders();
          const fb = fallbackOrders.find(o => o.id === data.id || o.order_number === data.order_number);
          if (!data.priority && fb?.priority) {
            data.priority = fb.priority;
          }
          data.priority = data.priority || 'routine';
          if (Array.isArray(fb?.items)) {
            data.items = (data.items || []).map((it, idx) => {
              const fbIt = fb.items.find(f => f.id === it.id || (f.item_code === it.item_code && f.item_name === it.item_name)) || fb.items[idx];
              return {
                ...it,
                modality: it.modality || fbIt?.modality,
                study_name: it.study_name || fbIt?.study_name,
                clinical_indication: it.clinical_indication || fbIt?.clinical_indication,
                instructions: it.instructions || fbIt?.instructions
              };
            });
            if (data.items.length === 0 && fb.items.length > 0) {
              data.items = fb.items;
            }
          }
          if (!data.category && fb?.category) data.category = fb.category;
          if (data.has_radiology === undefined && fb?.has_radiology !== undefined) data.has_radiology = fb.has_radiology;
          if (!data.report && fb?.report) data.report = fb.report;
          // Check access permission
          if (role === 'lab' && data.lab_id !== (authUser.labId || authUser.id)) {
            return null; // Forbidden / Access Denied
          }
          if (role === 'doctor' && data.doctor_id !== (authUser.id || authUser.doctorId)) {
            return null;
          }
          if (role === 'receptionist') {
            const recId = authUser.id || authUser.receptionistId;
            if (data.receptionist_id !== recId && data.clinic_id !== authUser.clinicId) {
              return null;
            }
          }
          if (role === 'clinic' && data.clinic_id !== (authUser.id || authUser.clinicId)) {
            return null;
          }

          // Enrich receptionist if present
          if (data.receptionist_id && !data.receptionist) {
            try {
              const { data: rData } = await supabase
                .from('staff')
                .select('id, first_name, last_name, email, phone, role')
                .eq('id', data.receptionist_id)
                .single();
              if (rData) data.receptionist = rData;
            } catch (e) {}
          }

          return data;
        }
      } catch (e) {
        console.warn('[LabOrderService] getOrderById DB failed, falling back:', e.message);
      }
    }

    const all = readFallbackOrders();
    const found = all.find(o => o.id === orderId);
    if (!found) return null;

    if (role === 'lab' && found.lab_id !== (authUser.labId || authUser.id)) {
      return null;
    }
    if (role === 'doctor' && found.doctor_id !== (authUser.id || authUser.doctorId)) {
      return null;
    }
    if (role === 'receptionist') {
      const recId = authUser.id || authUser.receptionistId;
      if (found.receptionist_id !== recId && found.clinic_id !== authUser.clinicId) {
        return null;
      }
    }
    if (role === 'clinic' && found.clinic_id !== (authUser.id || authUser.clinicId)) {
      return null;
    }
    return found;
  },

  /**
   * Update order status (Accept or Reject)
   */
  async updateOrderStatus(orderId, newStatus, authUser, rejectionReason = null) {
    const role = (authUser.role || '').toLowerCase();
    const callerLabId = authUser.labId || authUser.id;

    const normalizedStatus = (newStatus || '').toLowerCase();
    if (!['pending', 'accepted', 'rejected', 'in_progress', 'completed'].includes(normalizedStatus)) {
      throw new Error(`Invalid status "${newStatus}". Must be 'accepted' or 'rejected'.`);
    }

    const order = await this.getOrderById(orderId, authUser);
    if (!order) {
      throw new Error('Lab order not found or access denied');
    }

    // Only destination lab or admin can accept/reject
    if (role !== 'admin' && (role !== 'lab' || order.lab_id !== callerLabId)) {
      const err = new Error('Unauthorized: Only the assigned laboratory can accept or reject this order.');
      err.status = 403;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const hasDb = await checkTableAvailable();

    if (hasDb) {
      try {
        const dbUpdatePayload = {
          status: normalizedStatus,
          updated_at: nowIso
        };
        if (normalizedStatus === 'rejected') {
          dbUpdatePayload.rejection_reason = rejectionReason || null;
        }
        const { error } = await supabase
          .from('lab_orders')
          .update(dbUpdatePayload)
          .eq('id', orderId);

        if (error) throw error;
      } catch (dbErr) {
        console.warn('[LabOrderService] DB updateOrderStatus failed, using fallback:', dbErr.message);
      }
    }

    // Always update fallback
    const all = readFallbackOrders();
    const idx = all.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      all[idx].status = normalizedStatus;
      all[idx].updated_at = nowIso;
      if (rejectionReason) all[idx].rejection_reason = rejectionReason;
      writeFallbackOrders(all);
    }

    return {
      ...order,
      status: normalizedStatus,
      updated_at: nowIso,
      rejection_reason: rejectionReason || order.rejection_reason
    };
  },

  /**
   * Attach Finalized Diagnostic Radiology Report to OPD Lab Order
   */
  async attachRadiologyReportToLabOrder(orderId, authUser, reportData = {}) {
    const role = (authUser.role || '').toLowerCase();
    const callerLabId = authUser.labId || authUser.id;

    if (role !== 'admin' && role !== 'lab') {
      const err = new Error('Forbidden: Only diagnostic staff or administrators can attach diagnostic reports.');
      err.code = 'FORBIDDEN_REPORT_ISSUANCE';
      err.status = 403;
      throw err;
    }

    // Check technician RBAC
    const labRole = (authUser.labRole || authUser.role_title || '').toLowerCase();
    const isTech = authUser.role === 'technician' || labRole === 'technician';
    if (isTech) {
      const perms = Array.isArray(authUser.permissions) ? authUser.permissions : [];
      if (!perms.includes('issue_reports') && !perms.includes('validate_results')) {
        const err = new Error('Forbidden: Lab technicians without report issuance authorization cannot finalize radiology reports.');
        err.code = 'FORBIDDEN_REPORT_ISSUANCE';
        err.status = 403;
        throw err;
      }
    }

    const order = await this.getOrderById(orderId, authUser);
    if (!order) {
      const err = new Error('Lab order not found or access denied.');
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    if (role === 'lab' && String(order.lab_id) !== String(callerLabId)) {
      const err = new Error('Forbidden: Only the assigned destination laboratory can report on this order.');
      err.code = 'FORBIDDEN_LAB_MISMATCH';
      err.status = 403;
      throw err;
    }

    if (order.report) {
      const err = new Error('Conflict: A diagnostic report has already been finalized for this order. Reports are immutable.');
      err.code = 'REPORT_ALREADY_FINALIZED';
      err.status = 409;
      err.statusCode = 409;
      throw err;
    }

    const findings = (reportData.findings || '').trim();
    if (!findings || findings.length < 3) {
      const err = new Error('Diagnostic findings are mandatory (minimum 3 characters).');
      err.code = 'FINDINGS_REQUIRED';
      err.status = 400;
      throw err;
    }

    const impression = (reportData.impression || '').trim();
    if (!impression || impression.length < 3) {
      const err = new Error('Diagnostic impression is mandatory (minimum 3 characters).');
      err.code = 'IMPRESSION_REQUIRED';
      err.status = 400;
      throw err;
    }

    const reportId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const uploaderName = authUser.name || (authUser.first_name ? `Dr. ${authUser.first_name} ${authUser.last_name || ''}`.trim() : 'Radiologist / Specialist');

    const reportRecord = {
      reportId,
      id: reportId,
      findings,
      impression,
      recommendations: (reportData.recommendations || '').trim(),
      isCritical: Boolean(reportData.isCritical || reportData.is_critical || reportData.critical_findings),
      file: reportData.file || (reportData.fileUrl || reportData.file_url ? {
        fileName: reportData.fileName || reportData.file_name || 'report.pdf',
        fileUrl: reportData.fileUrl || reportData.file_url,
        fileSize: reportData.fileSize || reportData.file_size || null,
        mimeType: reportData.mimeType || reportData.mime_type || 'application/pdf'
      } : null),
      uploadedBy: {
        id: authUser.id,
        name: uploaderName,
        role: authUser.role,
        labRole: authUser.labRole || 'specialist'
      },
      uploadedAt: nowIso
    };

    const all = readFallbackOrders();
    const idx = all.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      all[idx].status = 'completed';
      all[idx].report = reportRecord;
      all[idx].updated_at = nowIso;
      writeFallbackOrders(all);
    }

    try {
      await supabase.from('lab_orders').update({
        status: 'completed',
        updated_at: nowIso
      }).eq('id', orderId);
    } catch (_) {}

    return {
      ...order,
      status: 'completed',
      report: reportRecord,
      updated_at: nowIso
    };
  }
};

function writeFallback(orderRecord, items, patient, lab, doctor, clinic, receptionist = null) {
  const all = readFallbackOrders();
  const existingIdx = all.findIndex(o => o.id === orderRecord.id || o.order_number === orderRecord.order_number);
  const entry = {
    ...orderRecord,
    patient,
    lab,
    doctor,
    clinic,
    receptionist,
    items
  };
  if (existingIdx !== -1) {
    all[existingIdx] = entry;
  } else {
    all.unshift(entry);
  }
  writeFallbackOrders(all);
}
