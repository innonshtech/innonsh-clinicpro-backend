
export const INTAKE_CATEGORIES = [
  'Oral fluids',
  'IV fluids',
  'Enteral / tube feeding',
  'Other measurable intake'
];

export const OUTPUT_CATEGORIES = [
  'Urine',
  'Vomit / emesis',
  'Drain output',
  'Other measurable output'
];

export function normalizeIoCategory(direction, category) {
  if (!category || typeof category !== 'string') return null;
  const cat = category.trim().toLowerCase();
  const dir = (direction || '').trim().toLowerCase();

  if (dir === 'intake') {
    if (cat === 'oral fluids' || cat === 'oral' || cat === 'oral fluid') return 'Oral fluids';
    if (cat === 'iv fluids' || cat === 'iv' || cat === 'iv fluid' || cat === 'intravenous') return 'IV fluids';
    if (cat.includes('enteral') || cat.includes('tube feeding') || cat.includes('tube')) return 'Enteral / tube feeding';
    if (cat.includes('other') || cat === 'other measurable intake') return 'Other measurable intake';
  } else if (dir === 'output') {
    if (cat === 'urine') return 'Urine';
    if (cat.includes('vomit') || cat.includes('emesis')) return 'Vomit / emesis';
    if (cat.includes('drain')) return 'Drain output';
    if (cat.includes('other') || cat === 'other measurable output') return 'Other measurable output';
  }
  return null;
}

export function calculateFluidTotals(entries, targetDateStr) {
  const summary = {
    date: targetDateStr || new Date().toISOString().slice(0, 10),
    totalIntake: 0,
    totalOutput: 0,
    netBalance: 0,
    fluidBalance: 0,
    intakeBreakdown: {
      'Oral fluids': 0,
      'IV fluids': 0,
      'Enteral / tube feeding': 0,
      'Other measurable intake': 0
    },
    outputBreakdown: {
      'Urine': 0,
      'Vomit / emesis': 0,
      'Drain output': 0,
      'Other measurable output': 0
    },
    periodCovered: targetDateStr && targetDateStr !== 'all' ? `${targetDateStr} (00:00 - 23:59)` : 'All Dates',
    entryCount: 0
  };

  if (!entries || !Array.isArray(entries)) return summary;

  for (const entry of entries) {
    if (entry.is_voided || entry.isVoided) continue;

    if (targetDateStr && targetDateStr !== 'all') {
      const entryTimestamp = entry.recorded_at || entry.recordedAt || entry.created_at || entry.createdAt;
      if (!entryTimestamp) continue;
      const datePart = String(entryTimestamp).slice(0, 10);
      if (datePart !== targetDateStr) {
        try {
          const d = new Date(entryTimestamp);
          const localDateStr = d.toISOString().slice(0, 10);
          if (localDateStr !== targetDateStr) continue;
        } catch (_) {
          continue;
        }
      }
    }

    const amt = Number(entry.amount !== undefined ? entry.amount : entry.amount_ml);
    if (isNaN(amt) || amt <= 0) continue;

    summary.entryCount++;
    const dir = (entry.direction || '').toLowerCase();
    const cat = entry.category;

    if (dir === 'intake') {
      summary.totalIntake += amt;
      summary.intakeBreakdown[cat] = (summary.intakeBreakdown[cat] || 0) + amt;
    } else if (dir === 'output') {
      summary.totalOutput += amt;
      summary.outputBreakdown[cat] = (summary.outputBreakdown[cat] || 0) + amt;
    }
  }

  summary.totalIntake = Math.round(summary.totalIntake * 10) / 10;
  summary.totalOutput = Math.round(summary.totalOutput * 10) / 10;
  summary.netBalance = Math.round((summary.totalIntake - summary.totalOutput) * 10) / 10;
  summary.fluidBalance = summary.netBalance;

  return summary;
}

import { evaluateVitals, STATUS } from '@/utils/vitalsEvaluation';
import { calculateVitalFlags } from '@/validations/userValidation';
import { supabase } from '@/lib/supabase';
import * as auditService from '@/services/auditService';
import { checkClinicModule } from '@/utils/moduleGuard';
import fs from 'fs';
import path from 'path';

// Fallback persistence file in backend storage if Supabase table is not yet migrated in PostgreSQL
const STORAGE_FILE = path.resolve(process.cwd(), 'src/storage/ipd_store.json');
const bedAllocationLocks = new Set();

export function parseScheduleTimes(frequency, schedule) {
  if (Array.isArray(schedule) && schedule.length > 0) {
    return schedule.map(s => String(s).trim()).filter(Boolean);
  }
  if (typeof schedule === 'string' && schedule.trim()) {
    try {
      const parsed = JSON.parse(schedule);
      if (Array.isArray(parsed)) return parsed.map(s => String(s).trim()).filter(Boolean);
    } catch (_) {
      const parts = schedule.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length > 0) return parts;
    }
  }

  const freq = (frequency || '').toUpperCase().trim();
  if (freq === 'OD' || freq === 'ONCE DAILY' || freq === '1-0-0' || freq === '0-1-0' || freq === '0-0-1') {
    return ['09:00'];
  }
  if (freq === 'BD' || freq === 'BID' || freq === 'TWICE DAILY' || freq === '1-0-1' || freq === '1-1-0' || freq === '0-1-1') {
    return ['09:00', '21:00'];
  }
  if (freq === 'TDS' || freq === 'TID' || freq === 'THRICE DAILY' || freq === '1-1-1') {
    return ['08:00', '14:00', '20:00'];
  }
  if (freq === 'QID' || freq === 'FOUR TIMES DAILY') {
    return ['06:00', '12:00', '18:00', '22:00'];
  }
  if (freq === 'Q4H') {
    return ['02:00', '06:00', '10:00', '14:00', '18:00', '22:00'];
  }
  if (freq === 'Q6H') {
    return ['06:00', '12:00', '18:00', '00:00'];
  }
  if (freq === 'Q8H') {
    return ['06:00', '14:00', '22:00'];
  }
  if (freq === 'STAT') {
    return ['STAT'];
  }
  if (freq === 'PRN') {
    return ['PRN'];
  }
  return ['09:00'];
}

function getLocalStore() {
  try {
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STORAGE_FILE)) {
      fs.writeFileSync(STORAGE_FILE, JSON.stringify({
        buildings: [],
        floors: [],
        wards: [],
        rooms: [],
        beds: [],
        admissions: [],
        nurseAssignments: [],
        consultingDoctors: [],
        clinicalNotes: [],
        bedHistory: []
      }, null, 2), 'utf8');
    }
    const parsedStore = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    if (!parsedStore.prescriptions) parsedStore.prescriptions = [];
    if (!parsedStore.marRecords) parsedStore.marRecords = [];
    return parsedStore;
  } catch (e) {
    return {
      buildings: [],
      floors: [],
      wards: [],
      rooms: [],
      beds: [],
      admissions: [],
      nurseAssignments: [],
      consultingDoctors: [],
      clinicalNotes: [],
      bedHistory: []
    };
  }
}

function saveLocalStore(store) {
  try {
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save local IPD store:', e.message);
  }
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}


const ALLOWED_STATUSES = [
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'CLEANING',
  'MAINTENANCE',
  'BLOCKED',
  'ISOLATION'
];

// Centralized Status Transition Matrix for Bed Lifecycle
const VALID_TRANSITIONS = {
  AVAILABLE: ['RESERVED', 'MAINTENANCE', 'BLOCKED', 'ISOLATION'], // OCCUPIED only via inpatient admission
  OCCUPIED: [], // Ordinary status updates forbidden; only CLEANING via patient discharge
  CLEANING: ['AVAILABLE', 'MAINTENANCE', 'BLOCKED'],
  RESERVED: ['AVAILABLE', 'MAINTENANCE', 'BLOCKED'],
  MAINTENANCE: ['CLEANING', 'AVAILABLE', 'BLOCKED'],
  BLOCKED: ['AVAILABLE', 'MAINTENANCE'],
  ISOLATION: ['CLEANING', 'AVAILABLE', 'MAINTENANCE', 'BLOCKED']
};

async function recordBedStatusHistory(clinicId, bedId, previousStatus, newStatus, user, reason, relatedAdmissionId = null, existingStore = null) {
  // Suppress duplicate audit log if status did not change
  if (previousStatus === newStatus) return null;

  const historyItem = {
    id: generateUUID(),
    clinic_id: clinicId,
    bed_id: bedId,
    previous_status: previousStatus || 'AVAILABLE',
    new_status: newStatus,
    user_id: user?.id || generateUUID(),
    user_role: user?.role || 'clinic',
    reason: reason || (`Bed status transitioned from ${previousStatus || 'N/A'} to ${newStatus}`),
    related_admission_id: relatedAdmissionId || null,
    created_at: new Date().toISOString()
  };

  try {
    await supabase.from('bed_status_history').insert([historyItem]);
  } catch (e) {
    // Supabase fallback handled by local store below
  }

  const store = existingStore || getLocalStore();
  if (!store.bedHistory) store.bedHistory = [];
  store.bedHistory.push(historyItem);
  if (!existingStore) {
    saveLocalStore(store);
  }

  return historyItem;
}

export const ipdService = {
  // 1. Verify Clinic has IPD Enabled
  async verifyClinicIpd(clinicId) {
    const check = await checkClinicModule(clinicId, 'ipd');
    if (!check.enabled) {
      const err = new Error('Access Denied: The IPD & Bed Management module is not enabled for this clinic.');
      err.code = 'IPD_MODULE_DISABLED';
      err.statusCode = 403;
      throw err;
    }
    return true;
  },

  // 2. Hospital Hierarchy: Buildings, Floors, Wards, Rooms, Beds
  async getHierarchy(clinicId) {
    await this.verifyClinicIpd(clinicId);

    let buildings = [], floors = [], wards = [], rooms = [], beds = [];

    // Try Supabase first
    try {
      const [bRes, fRes, wRes, rRes, bedsRes] = await Promise.all([
        supabase.from('buildings').select('*').eq('clinic_id', clinicId).order('name'),
        supabase.from('floors').select('*').eq('clinic_id', clinicId).order('floor_number'),
        supabase.from('wards').select('*').eq('clinic_id', clinicId).order('name'),
        supabase.from('rooms').select('*').eq('clinic_id', clinicId).order('room_number'),
        supabase.from('beds').select('*').eq('clinic_id', clinicId).order('bed_number')
      ]);

      if (!bRes.error && !fRes.error && !wRes.error && !rRes.error && !bedsRes.error) {
        buildings = bRes.data || [];
        floors = fRes.data || [];
        wards = wRes.data || [];
        rooms = rRes.data || [];
        beds = bedsRes.data || [];
      }
    } catch (e) {
      console.warn('Supabase IPD query fallback to local store:', e.message);
    }

    // Fallback or merge with local store
    const store = getLocalStore();
    if (buildings.length === 0 && store.buildings.length > 0) {
      buildings = store.buildings.filter(b => b.clinic_id === clinicId);
    }
    if (floors.length === 0 && store.floors.length > 0) {
      floors = store.floors.filter(f => f.clinic_id === clinicId);
    }
    if (wards.length === 0 && store.wards.length > 0) {
      wards = store.wards.filter(w => w.clinic_id === clinicId);
    }
    if (rooms.length === 0 && store.rooms.length > 0) {
      rooms = store.rooms.filter(r => r.clinic_id === clinicId);
    }
    if (beds.length === 0 && store.beds.length > 0) {
      beds = store.beds.filter(b => b.clinic_id === clinicId);
    }

    // Build complete nested tree without dropping empty entities
    const tree = buildings.map(b => {
      const bFloors = floors.filter(f => f.building_id === b.id).map(f => {
        const fWards = wards.filter(w => w.floor_id === f.id).map(w => {
          const wRooms = rooms.filter(r => r.ward_id === w.id).map(r => {
            const rBeds = beds.filter(bd => bd.room_id === r.id);
            return { ...r, beds: rBeds };
          });
          return { ...w, rooms: wRooms };
        });
        return { ...f, wards: fWards };
      });
      return { ...b, floors: bFloors };
    });

    return {
      buildings,
      floors,
      wards,
      rooms,
      beds,
      tree
    };
  },

  // 3. Create Building with duplicate prevention
  async createBuilding(clinicId, data) {
    await this.verifyClinicIpd(clinicId);
    const name = data.name?.trim();
    if (!name) {
      const err = new Error('Building name is required.');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    // Check duplicate building name in this clinic
    let isDuplicate = false;
    try {
      const { data: existing } = await supabase
        .from('buildings')
        .select('id, name')
        .eq('clinic_id', clinicId)
        .ilike('name', name);
      if (existing && existing.length > 0) isDuplicate = true;
    } catch (_) {}
    if (!isDuplicate) {
      const store = getLocalStore();
      if (store.buildings.some(b => b.clinic_id === clinicId && b.name.toLowerCase() === name.toLowerCase())) {
        isDuplicate = true;
      }
    }
    if (isDuplicate) {
      const err = new Error('A building named "' + name + '" already exists in this clinic.');
      err.code = 'DUPLICATE_BUILDING_NAME';
      err.statusCode = 409;
      throw err;
    }

    const item = {
      id: generateUUID(),
      clinic_id: clinicId,
      name,
      code: data.code?.trim() || null,
      description: data.description?.trim() || null,
      is_active: true,
      created_at: new Date().toISOString()
    };

    try {
      const { data: dbItem, error } = await supabase.from('buildings').insert([item]).select().single();
      if (!error && dbItem) return dbItem;
    } catch (_) {}

    const store = getLocalStore();
    store.buildings.push(item);
    saveLocalStore(store);
    return item;
  },

  // 4. Create Floor with duplicate prevention
  async createFloor(clinicId, data) {
    await this.verifyClinicIpd(clinicId);
    const buildingId = data.buildingId;
    if (!buildingId) {
      const err = new Error('Parent building ID is required.');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    // Verify building belongs to clinic
    let buildingExists = false;
    try {
      const { data: bld } = await supabase.from('buildings').select('id').eq('id', buildingId).eq('clinic_id', clinicId).maybeSingle();
      if (bld) buildingExists = true;
    } catch (_) {}
    if (!buildingExists) {
      const store = getLocalStore();
      if (store.buildings.some(b => b.id === buildingId && b.clinic_id === clinicId)) buildingExists = true;
    }
    if (!buildingExists) {
      const err = new Error('Parent building not found in this clinic.');
      err.code = 'BUILDING_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const floorNumber = Number(data.floorNumber);
    if (data.floorNumber === undefined || data.floorNumber === null || isNaN(floorNumber)) {
      const err = new Error('Valid floor number is required.');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    // Check duplicate floor number in this building
    let isDuplicate = false;
    try {
      const { data: existing } = await supabase
        .from('floors')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('building_id', buildingId)
        .eq('floor_number', floorNumber);
      if (existing && existing.length > 0) isDuplicate = true;
    } catch (_) {}
    if (!isDuplicate) {
      const store = getLocalStore();
      if (store.floors.some(f => f.clinic_id === clinicId && f.building_id === buildingId && Number(f.floor_number) === floorNumber)) {
        isDuplicate = true;
      }
    }
    if (isDuplicate) {
      const err = new Error('Floor number ' + floorNumber + ' already exists in this building.');
      err.code = 'DUPLICATE_FLOOR_NUMBER';
      err.statusCode = 409;
      throw err;
    }

    const item = {
      id: generateUUID(),
      clinic_id: clinicId,
      building_id: buildingId,
      floor_number: floorNumber,
      name: data.name?.trim() || ('Floor ' + floorNumber),
      is_active: true,
      created_at: new Date().toISOString()
    };

    try {
      const { data: dbItem, error } = await supabase.from('floors').insert([item]).select().single();
      if (!error && dbItem) return dbItem;
    } catch (_) {}

    const store = getLocalStore();
    store.floors.push(item);
    saveLocalStore(store);
    return item;
  },

  // 5. Create Ward with duplicate prevention
  async createWard(clinicId, data) {
    await this.verifyClinicIpd(clinicId);
    const name = data.name?.trim();
    if (!name) {
      const err = new Error('Ward name is required.');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const floorId = data.floorId;
    if (!floorId) {
      const err = new Error('Parent floor ID is required.');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    // Verify floor belongs to clinic
    let floorRecord = null;
    try {
      const { data: flr } = await supabase.from('floors').select('*').eq('id', floorId).eq('clinic_id', clinicId).maybeSingle();
      if (flr) floorRecord = flr;
    } catch (_) {}
    if (!floorRecord) {
      const store = getLocalStore();
      floorRecord = store.floors.find(f => f.id === floorId && f.clinic_id === clinicId);
    }
    if (!floorRecord) {
      const err = new Error('Parent floor not found in this clinic.');
      err.code = 'FLOOR_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // Check duplicate ward name in this clinic
    let isDuplicate = false;
    try {
      const { data: existing } = await supabase
        .from('wards')
        .select('id')
        .eq('clinic_id', clinicId)
        .ilike('name', name);
      if (existing && existing.length > 0) isDuplicate = true;
    } catch (_) {}
    if (!isDuplicate) {
      const store = getLocalStore();
      if (store.wards.some(w => w.clinic_id === clinicId && w.name.toLowerCase() === name.toLowerCase())) {
        isDuplicate = true;
      }
    }
    if (isDuplicate) {
      const err = new Error('A ward named "' + name + '" already exists in this clinic.');
      err.code = 'DUPLICATE_WARD_NAME';
      err.statusCode = 409;
      throw err;
    }

    const item = {
      id: generateUUID(),
      clinic_id: clinicId,
      building_id: floorRecord.building_id,
      floor_id: floorId,
      name,
      ward_type: data.type || data.wardType || 'General',
      gender_type: data.genderDesignation || data.genderType || 'Mixed',
      total_capacity: Number(data.totalCapacity || 0),
      description: data.description?.trim() || null,
      is_active: true,
      created_at: new Date().toISOString()
    };

    try {
      const { data: dbItem, error } = await supabase.from('wards').insert([item]).select().single();
      if (!error && dbItem) return dbItem;
    } catch (_) {}

    const store = getLocalStore();
    store.wards.push(item);
    saveLocalStore(store);
    return item;
  },

  // 6. Create Room with duplicate prevention
  async createRoom(clinicId, data) {
    await this.verifyClinicIpd(clinicId);
    const roomNumber = data.roomNumber?.trim();
    if (!roomNumber) {
      const err = new Error('Room number is required.');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const wardId = data.wardId;
    if (!wardId) {
      const err = new Error('Parent ward ID is required.');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    // Verify ward belongs to clinic
    let wardRecord = null;
    try {
      const { data: wrd } = await supabase.from('wards').select('*').eq('id', wardId).eq('clinic_id', clinicId).maybeSingle();
      if (wrd) wardRecord = wrd;
    } catch (_) {}
    if (!wardRecord) {
      const store = getLocalStore();
      wardRecord = store.wards.find(w => w.id === wardId && w.clinic_id === clinicId);
    }
    if (!wardRecord) {
      const err = new Error('Parent ward not found in this clinic.');
      err.code = 'WARD_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // Check duplicate room number in this ward
    let isDuplicate = false;
    try {
      const { data: existing } = await supabase
        .from('rooms')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('ward_id', wardId)
        .ilike('room_number', roomNumber);
      if (existing && existing.length > 0) isDuplicate = true;
    } catch (_) {}
    if (!isDuplicate) {
      const store = getLocalStore();
      if (store.rooms.some(r => r.clinic_id === clinicId && r.ward_id === wardId && r.room_number.toLowerCase() === roomNumber.toLowerCase())) {
        isDuplicate = true;
      }
    }
    if (isDuplicate) {
      const err = new Error('Room number "' + roomNumber + '" already exists in this ward.');
      err.code = 'DUPLICATE_ROOM_NUMBER';
      err.statusCode = 409;
      throw err;
    }

    const item = {
      id: generateUUID(),
      clinic_id: clinicId,
      ward_id: wardId,
      room_number: roomNumber,
      room_type: data.roomType || 'Standard',
      daily_rate: Number(data.dailyRate || 0),
      description: data.description?.trim() || null,
      is_active: true,
      created_at: new Date().toISOString()
    };

    try {
      const { data: dbItem, error } = await supabase.from('rooms').insert([item]).select().single();
      if (!error && dbItem) return dbItem;
    } catch (_) {}

    const store = getLocalStore();
    store.rooms.push(item);
    saveLocalStore(store);
    return item;
  },

  // 7. Create Bed with duplicate prevention, daily rate, and AVAILABLE default
  async createBed(clinicId, data, user = null) {
    await this.verifyClinicIpd(clinicId);
    const bedNumber = data.bedNumber?.trim();
    if (!bedNumber) {
      const err = new Error('Bed number is required.');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const roomId = data.roomId;
    if (!roomId) {
      const err = new Error('Parent room ID is required.');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    // Verify room belongs to clinic
    let roomRecord = null;
    try {
      const { data: rm } = await supabase.from('rooms').select('*').eq('id', roomId).eq('clinic_id', clinicId).maybeSingle();
      if (rm) roomRecord = rm;
    } catch (_) {}
    if (!roomRecord) {
      const store = getLocalStore();
      roomRecord = store.rooms.find(r => r.id === roomId && r.clinic_id === clinicId);
    }
    if (!roomRecord) {
      const err = new Error('Parent room not found in this clinic.');
      err.code = 'ROOM_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // Check duplicate bed number in this room
    let isDuplicate = false;
    try {
      const { data: existing } = await supabase
        .from('beds')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('room_id', roomId)
        .ilike('bed_number', bedNumber);
      if (existing && existing.length > 0) isDuplicate = true;
    } catch (_) {}
    if (!isDuplicate) {
      const store = getLocalStore();
      if (store.beds.some(b => b.clinic_id === clinicId && b.room_id === roomId && b.bed_number.toLowerCase() === bedNumber.toLowerCase())) {
        isDuplicate = true;
      }
    }
    if (isDuplicate) {
      const err = new Error('Bed number "' + bedNumber + '" already exists in this room.');
      err.code = 'DUPLICATE_BED_NUMBER';
      err.statusCode = 409;
      throw err;
    }

    const rate = Number(data.dailyRate !== undefined && data.dailyRate !== null && !isNaN(Number(data.dailyRate)) ? data.dailyRate : 500);

    const item = {
      id: generateUUID(),
      clinic_id: clinicId,
      ward_id: data.wardId || roomRecord.ward_id,
      room_id: roomId,
      bed_number: bedNumber,
      status: 'AVAILABLE',
      daily_rate: rate >= 0 ? rate : 500.00,
      is_active: true,
      created_at: new Date().toISOString()
    };

    try {
      const { data: dbItem, error } = await supabase.from('beds').insert([item]).select().single();
      if (!error && dbItem) {
        const hist = {
          id: generateUUID(),
          clinic_id: clinicId,
          bed_id: dbItem.id,
          previous_status: null,
          new_status: 'AVAILABLE',
          user_id: user?.id || generateUUID(),
          user_role: user?.role || 'clinic',
          reason: 'Initial bed registration',
          related_admission_id: null,
          created_at: new Date().toISOString()
        };
        try { await supabase.from('bed_status_history').insert([hist]); } catch (_) {}
        const store = getLocalStore();
        if (!store.bedHistory) store.bedHistory = [];
        store.bedHistory.push(hist);
        saveLocalStore(store);
        return dbItem;
      }
    } catch (_) {}

    const store = getLocalStore();
    store.beds.push(item);
    const hist = {
      id: generateUUID(),
      clinic_id: clinicId,
      bed_id: item.id,
      previous_status: null,
      new_status: 'AVAILABLE',
      user_id: user?.id || generateUUID(),
      user_role: user?.role || 'clinic',
      reason: 'Initial bed registration',
      related_admission_id: null,
      created_at: new Date().toISOString()
    };
    if (!store.bedHistory) store.bedHistory = [];
    store.bedHistory.push(hist);
    saveLocalStore(store);
    return item;
  },

  async getWards(clinicId, user = null) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }
    try {
      const { data, error } = await supabase.from('wards').select('*').eq('clinic_id', clinicId).order('name');
      if (!error && data) return data;
    } catch (_) {}

    const store = getLocalStore();
    return store.wards.filter(w => w.clinic_id === clinicId);
  },

  async getAvailableBeds(clinicId, wardId = null, user = null) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }
    try {
      let query = supabase.from('beds').select('*, rooms(room_number), wards(name)').eq('clinic_id', clinicId).eq('status', 'AVAILABLE');
      if (wardId) query = query.eq('ward_id', wardId);
      const { data, error } = await query;
      if (!error && data) return data;
    } catch (_) {}

    const store = getLocalStore();
    return store.beds.filter(b => b.clinic_id === clinicId && b.status === 'AVAILABLE' && (!wardId || b.ward_id === wardId));
  },

  // 8. Bed Details with full hierarchy path and active admission info
  async getBedDetails(clinicId, bedId) {
    await this.verifyClinicIpd(clinicId);
    
    let bed = null;
    try {
      const { data, error } = await supabase.from('beds').select('*').eq('id', bedId).eq('clinic_id', clinicId).maybeSingle();
      if (!error && data) bed = data;
    } catch (_) {}
    const store = getLocalStore();
    if (!bed) {
      bed = store.beds.find(b => b.id === bedId && b.clinic_id === clinicId);
    }
    if (!bed) {
      const err = new Error('Bed not found in this clinic.');
      err.code = 'BED_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    let room = null, ward = null, floor = null, building = null;
    try {
      const [rRes, wRes, fRes, bRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', bed.room_id).eq('clinic_id', clinicId).maybeSingle(),
        supabase.from('wards').select('*').eq('id', bed.ward_id).eq('clinic_id', clinicId).maybeSingle(),
        supabase.from('floors').select('*').eq('clinic_id', clinicId),
        supabase.from('buildings').select('*').eq('clinic_id', clinicId)
      ]);
      if (rRes?.data) room = rRes.data;
      if (wRes?.data) ward = wRes.data;
      if (ward && fRes?.data) floor = fRes.data.find(f => f.id === ward.floor_id);
      if (floor && bRes?.data) building = bRes.data.find(b => b.id === floor.building_id);
    } catch (_) {}

    if (!room) room = store.rooms.find(r => r.id === bed.room_id);
    if (!ward) ward = store.wards.find(w => w.id === (bed.ward_id || room?.ward_id));
    if (!floor && ward) floor = store.floors.find(f => f.id === ward.floor_id);
    if (!building && floor) building = store.buildings.find(b => b.id === floor.building_id);

    // Current inpatient admission if occupied
    let currentAdmission = null;
    if (bed.status === 'OCCUPIED') {
      try {
        const { data: admData } = await supabase
          .from('ipd_admissions')
          .select('*, patients(first_name, last_name, phone, patient_id), staff!ipd_admissions_admitting_doctor_id_fkey(first_name, last_name)')
          .eq('bed_id', bedId)
          .eq('clinic_id', clinicId)
          .eq('status', 'admitted')
          .maybeSingle();
        if (admData) {
          currentAdmission = {
            id: admData.id,
            admissionNumber: admData.admission_number,
            admissionDate: admData.admission_date,
            patientName: admData.patients ? (admData.patients.first_name + ' ' + admData.patients.last_name) : 'Inpatient',
            admittingDoctorName: admData.staff ? (admData.staff.first_name + ' ' + admData.staff.last_name) : null,
            diagnosis: admData.diagnosis
          };
        }
      } catch (_) {}

      if (!currentAdmission) {
        const adm = store.admissions.find(a => a.bed_id === bedId && a.clinic_id === clinicId && a.status === 'admitted');
        if (adm) {
          currentAdmission = {
            id: adm.id,
            admissionNumber: adm.admission_number,
            admissionDate: adm.admission_date,
            patientName: adm.patientName || 'Inpatient',
            admittingDoctorName: adm.admittingDoctorName || null,
            diagnosis: adm.diagnosis
          };
        }
      }
    }

    const history = await this.getBedHistory(clinicId, bedId);

    return {
      bed,
      room,
      ward,
      floor,
      building,
      currentAdmission,
      history
    };
  },

  // 9. Bed Status Updates (All 7 required statuses, transition enforcement, audit trail)
  async updateBedStatus(clinicId, user, bedId, payload) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const newStatus = payload.status;
    const reason = payload.reason?.trim() || ('Status updated to ' + newStatus);

    if (!ALLOWED_STATUSES.includes(newStatus)) {
      const err = new Error('Invalid bed status: ' + newStatus + '. Must be one of: ' + ALLOWED_STATUSES.join(', '));
      err.code = 'INVALID_STATUS';
      err.statusCode = 400;
      throw err;
    }

    const store = getLocalStore();
    let bed = store.beds.find(b => b.id === bedId && b.clinic_id === clinicId);
    if (!bed) {
      try {
        const { data } = await supabase.from('beds').select('*').eq('id', bedId).eq('clinic_id', clinicId).maybeSingle();
        bed = data;
      } catch (_) {}
    }

    if (!bed) {
      const err = new Error('Bed not found in this clinic.');
      err.code = 'BED_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }
      if (!nurse) {
        const otherNurse = (store.staff || []).find(s => s.id === nurseId || s._id === nurseId);
        if (otherNurse && otherNurse.clinic_id !== clinicId) {
          const err = new Error('Forbidden: Nurse belongs to a different clinic.');
          err.code = 'CROSS_CLINIC_FORBIDDEN';
          err.statusCode = 403;
          throw err;
        }
      }
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot perform bed management.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }

      const nurseWardId = nurse?.ward_id || nurse?.wardId || nurse?.assigned_ward_id || nurse?.assignedWardId;
      if (!nurseWardId) {
        const err = new Error('Forbidden: Nurse has no assigned ward configured.');
        err.code = 'FORBIDDEN_NO_WARD';
        err.statusCode = 403;
        throw err;
      }

      // Resolve bed ward: Bed -> Room -> Ward
      let bedWardId = bed.ward_id || bed.wardId;
      if (!bedWardId && (bed.room_id || bed.roomId)) {
        const roomId = bed.room_id || bed.roomId;
        const room = (store.rooms || []).find(r => r.id === roomId || r._id === roomId);
        if (room) {
          bedWardId = room.ward_id || room.wardId;
        } else {
          try {
            const { data: dbRoom } = await supabase.from('rooms').select('ward_id').eq('id', roomId).maybeSingle();
            if (dbRoom) bedWardId = dbRoom.ward_id || dbRoom.wardId;
          } catch (_) {}
        }
      }

      if (!bedWardId || String(bedWardId) !== String(nurseWardId)) {
        const err = new Error('Forbidden: Nurse can only manage beds in their assigned ward.');
        err.code = 'FORBIDDEN_WARD_MISMATCH';
        err.statusCode = 403;
        throw err;
      }

      // HR-authorized transitions: RESERVED, MAINTENANCE, BLOCKED, ISOLATION, AVAILABLE
      const NURSE_AUTHORIZED_TARGETS = ['RESERVED', 'MAINTENANCE', 'BLOCKED', 'ISOLATION', 'AVAILABLE'];
      if (!NURSE_AUTHORIZED_TARGETS.includes(newStatus)) {
        const err = new Error(`Forbidden: Nurse role is not authorized to transition bed to ${newStatus}.`);
        err.code = 'FORBIDDEN_TRANSITION';
        err.statusCode = 403;
        throw err;
      }

      if (bed.status === 'CLEANING' && newStatus === 'AVAILABLE') {
        const err = new Error('CLEANING beds must be transitioned to AVAILABLE through the mark-cleaned endpoint.');
        err.code = 'INVALID_CLEANING_ENDPOINT';
        err.statusCode = 400;
        throw err;
      }
    }

    const prevStatus = bed.status;

    // Rule 12: Repeated same-status update does not create duplicate history
    if (prevStatus === newStatus) {
      return {
        bedId,
        bedNumber: bed.bed_number,
        previousStatus: prevStatus,
        newStatus,
        message: 'Bed status is already ' + newStatus,
        changed: false
      };
    }

    // Rule 2: Cannot manually set bed to OCCUPIED
    if (newStatus === 'OCCUPIED') {
      const err = new Error('Beds can only become OCCUPIED through an active doctor inpatient admission workflow.');
      err.code = 'INVALID_STATUS_TRANSITION';
      err.statusCode = 400;
      throw err;
    }

    // Rule 3: OCCUPIED cannot be manually updated to AVAILABLE or any other status (must go through discharge)
    if (prevStatus === 'OCCUPIED') {
      if (newStatus === 'AVAILABLE') {
        const err = new Error('An OCCUPIED bed cannot be made AVAILABLE directly. It must first be discharged to CLEANING, then transitioned CLEANING -> AVAILABLE.');
        err.code = 'INVALID_STATUS_TRANSITION';
        err.statusCode = 400;
        throw err;
      }
      const err = new Error('An OCCUPIED bed cannot be manually modified. The patient must be discharged through the inpatient discharge workflow (which transitions the bed to CLEANING).');
      err.code = 'INVALID_STATUS_TRANSITION';
      err.statusCode = 400;
      throw err;
    }

    // Centralized Transition Rule Validation
    const allowedTargets = VALID_TRANSITIONS[prevStatus] || [];
    if (!allowedTargets.includes(newStatus)) {
      const err = new Error(`Invalid bed status transition from ${prevStatus} to ${newStatus}. Allowed transitions: ${allowedTargets.join(', ') || 'none'}.`);
      err.code = 'INVALID_STATUS_TRANSITION';
      err.statusCode = 400;
      throw err;
    }

    // Update in Supabase
    try {
      await supabase.from('beds').update({ status: newStatus }).eq('id', bedId).eq('clinic_id', clinicId);
    } catch (_) {}

    // Record History (Audit Trail)
    await recordBedStatusHistory(clinicId, bedId, prevStatus, newStatus, user, reason, payload.relatedAdmissionId || payload.admissionId || null, store);

    // Update local store
    bed.status = newStatus;
    saveLocalStore(store);

    return {
      bedId,
      bedNumber: bed.bed_number,
      previousStatus: prevStatus,
      newStatus,
      message: ('Bed status changed from ' + prevStatus + ' to ' + newStatus),
      changed: true
    };
  },

  // 10. Housekeeping mark cleaned: CLEANING -> AVAILABLE
  async markBedCleaned(clinicId, user, bedId, payload = {}) {
    await this.verifyClinicIpd(clinicId);

    const store = getLocalStore();
    let bed = store.beds.find(b => b.id === bedId && b.clinic_id === clinicId);
    if (!bed) {
      try {
        const { data } = await supabase.from('beds').select('*').eq('id', bedId).eq('clinic_id', clinicId).maybeSingle();
        bed = data;
      } catch (_) {}
    }

    if (!bed) {
      const err = new Error('Bed not found.');
      err.code = 'BED_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }
      if (!nurse) {
        const otherNurse = (store.staff || []).find(s => s.id === nurseId || s._id === nurseId);
        if (otherNurse && otherNurse.clinic_id !== clinicId) {
          const err = new Error('Forbidden: Nurse belongs to a different clinic.');
          err.code = 'CROSS_CLINIC_FORBIDDEN';
          err.statusCode = 403;
          throw err;
        }
      }
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot perform bed cleaning verification.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }

      const nurseWardId = nurse?.ward_id || nurse?.wardId || nurse?.assigned_ward_id || nurse?.assignedWardId;
      if (!nurseWardId) {
        const err = new Error('Forbidden: Nurse has no assigned ward configured.');
        err.code = 'FORBIDDEN_NO_WARD';
        err.statusCode = 403;
        throw err;
      }

      // Resolve bed ward: Bed -> Room -> Ward
      let bedWardId = bed.ward_id || bed.wardId;
      if (!bedWardId && (bed.room_id || bed.roomId)) {
        const roomId = bed.room_id || bed.roomId;
        const room = (store.rooms || []).find(r => r.id === roomId || r._id === roomId);
        if (room) {
          bedWardId = room.ward_id || room.wardId;
        } else {
          try {
            const { data: dbRoom } = await supabase.from('rooms').select('ward_id').eq('id', roomId).maybeSingle();
            if (dbRoom) bedWardId = dbRoom.ward_id || dbRoom.wardId;
          } catch (_) {}
        }
      }

      if (!bedWardId || String(bedWardId) !== String(nurseWardId)) {
        const err = new Error('Forbidden: Nurse can only manage beds in their assigned ward.');
        err.code = 'FORBIDDEN_WARD_MISMATCH';
        err.statusCode = 403;
        throw err;
      }
    }

    if (bed.status !== 'CLEANING') {
      const err = new Error('Bed is not in CLEANING status (current: ' + bed.status + '). Only beds in CLEANING status can be marked as AVAILABLE through the cleaning workflow.');
      err.code = 'INVALID_BED_STATUS';
      err.statusCode = 400;
      throw err;
    }

    try {
      await supabase.from('beds').update({ status: 'AVAILABLE' }).eq('id', bedId).eq('clinic_id', clinicId);
    } catch (_) {}

    const reason = payload.reason?.trim() || 'Housekeeping sanitization completed and verified.';
    await recordBedStatusHistory(clinicId, bedId, 'CLEANING', 'AVAILABLE', user, reason, null, store);

    bed.status = 'AVAILABLE';
    saveLocalStore(store);

    return {
      bedId,
      bedNumber: bed.bed_number,
      previousStatus: 'CLEANING',
      currentStatus: 'AVAILABLE',
      message: 'Bed successfully marked as CLEANING -> AVAILABLE.'
    };
  },

  async getBedHistory(clinicId, bedId) {
    await this.verifyClinicIpd(clinicId);
    try {
      const { data, error } = await supabase
        .from('bed_status_history')
        .select('*')
        .eq('bed_id', bedId)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false });
      if (!error && data) return data;
    } catch (_) {}

    const store = getLocalStore();
    return (store.bedHistory || [])
      .filter(h => h.bed_id === bedId && h.clinic_id === clinicId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  // 11. Safe Deactivation (Prevents destructive deletion)
  // 10. Deactivate / Reactivate Entity
  async deactivateEntity(clinicId, entityType, id, action = 'deactivate', user = null) {
    await this.verifyClinicIpd(clinicId);
    const store = getLocalStore();
    const isReactivate = action === 'activate';

        if (entityType === 'bed') {
      let bed = store.beds.find(b => b.id === id && b.clinic_id === clinicId);
      if (!bed) {
        const { data } = await supabase.from('beds').select('*').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
        bed = data;
      }
      if (!bed) throw new Error('Bed not found.');

      if (!isReactivate && bed.status === 'OCCUPIED') {
        const err = new Error('Cannot deactivate an OCCUPIED bed. Discharge or transfer patient first.');
        err.statusCode = 400;
        throw err;
      }

      const prevStatus = bed.status;
      const newActive = isReactivate;
      const newStatus = isReactivate ? 'AVAILABLE' : 'BLOCKED';
      const reason = isReactivate ? 'Bed reactivated back into service' : 'Bed safely deactivated / blocked from service';

      try {
        await supabase.from('beds').update({ is_active: newActive, status: newStatus }).eq('id', id).eq('clinic_id', clinicId);
      } catch (_) {}

      bed.is_active = newActive;
      bed.status = newStatus;

      await recordBedStatusHistory(
        clinicId,
        id,
        prevStatus,
        newStatus,
        user,
        reason,
        null,
        store
      );

      saveLocalStore(store);
      return { id, is_active: newActive, status: newStatus };
    }

    if (entityType === 'room') {
      let rm = store.rooms.find(r => r.id === id && r.clinic_id === clinicId);
      if (!rm) {
        const { data } = await supabase.from('rooms').select('*').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
        rm = data;
      }
      if (!rm) throw new Error('Room not found.');

      if (!isReactivate) {
        const activeAdm = store.admissions.some(a => a.room_id === id && a.status === 'admitted');
        const hasOccupied = store.beds.some(b => b.room_id === id && b.status === 'OCCUPIED');
        if (activeAdm || hasOccupied) {
          const err = new Error('Cannot deactivate room while beds in this room are occupied.');
          err.statusCode = 400;
          throw err;
        }
      }

      try { await supabase.from('rooms').update({ is_active: isReactivate }).eq('id', id).eq('clinic_id', clinicId); } catch (_) {}
      if (rm) rm.is_active = isReactivate;
      const sRm = store.rooms.find(r => r.id === id && r.clinic_id === clinicId);
      if (sRm) sRm.is_active = isReactivate;
      saveLocalStore(store);
      return { id, is_active: isReactivate };
    }

    if (entityType === 'ward') {
      let wrd = store.wards.find(w => w.id === id && w.clinic_id === clinicId);
      if (!wrd) {
        const { data } = await supabase.from('wards').select('*').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
        wrd = data;
      }
      if (!wrd) throw new Error('Ward not found.');

      if (!isReactivate) {
        const activeAdm = store.admissions.some(a => a.ward_id === id && a.status === 'admitted');
        const wardRooms = store.rooms.filter(r => r.ward_id === id).map(r => r.id);
        const hasOccupied = store.beds.some(b => wardRooms.includes(b.room_id) && b.status === 'OCCUPIED');
        if (activeAdm || hasOccupied) {
          const err = new Error('Cannot deactivate ward while patients are currently admitted in this ward.');
          err.statusCode = 400;
          throw err;
        }
      }

      try { await supabase.from('wards').update({ is_active: isReactivate }).eq('id', id).eq('clinic_id', clinicId); } catch (_) {}
      if (wrd) wrd.is_active = isReactivate;
      const sWrd = store.wards.find(w => w.id === id && w.clinic_id === clinicId);
      if (sWrd) sWrd.is_active = isReactivate;
      saveLocalStore(store);
      return { id, is_active: isReactivate };
    }

    if (entityType === 'floor') {
      let flr = store.floors.find(f => f.id === id && f.clinic_id === clinicId);
      if (!flr) {
        const { data } = await supabase.from('floors').select('*').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
        flr = data;
      }
      if (!flr) throw new Error('Floor not found.');

      if (!isReactivate) {
        const floorWards = store.wards.filter(w => w.floor_id === id).map(w => w.id);
        const floorRooms = store.rooms.filter(r => floorWards.includes(r.ward_id)).map(r => r.id);
        const hasOccupied = store.beds.some(b => floorRooms.includes(b.room_id) && b.status === 'OCCUPIED');
        if (hasOccupied) {
          const err = new Error('Cannot deactivate floor while patients are currently admitted on this floor.');
          err.statusCode = 400;
          throw err;
        }
      }

      try { await supabase.from('floors').update({ is_active: isReactivate }).eq('id', id).eq('clinic_id', clinicId); } catch (_) {}
      if (flr) flr.is_active = isReactivate;
      const sFlr = store.floors.find(f => f.id === id && f.clinic_id === clinicId);
      if (sFlr) sFlr.is_active = isReactivate;
      saveLocalStore(store);
      return { id, is_active: isReactivate };
    }

    if (entityType === 'building') {
      let bld = store.buildings.find(b => b.id === id && b.clinic_id === clinicId);
      if (!bld) {
        const { data } = await supabase.from('buildings').select('*').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
        bld = data;
      }
      if (!bld) throw new Error('Building not found.');

      if (!isReactivate) {
        const bFloors = store.floors.filter(f => f.building_id === id).map(f => f.id);
        const bWards = store.wards.filter(w => bFloors.includes(w.floor_id)).map(w => w.id);
        const bRooms = store.rooms.filter(r => bWards.includes(r.ward_id)).map(r => r.id);
        const hasOccupied = store.beds.some(b => bRooms.includes(b.room_id) && b.status === 'OCCUPIED');
        if (hasOccupied) {
          const err = new Error('Cannot deactivate building while patients are currently admitted in this building.');
          err.statusCode = 400;
          throw err;
        }
      }

      try { await supabase.from('buildings').update({ is_active: isReactivate }).eq('id', id).eq('clinic_id', clinicId); } catch (_) {}
      if (bld) bld.is_active = isReactivate;
      const sBld = store.buildings.find(b => b.id === id && b.clinic_id === clinicId);
      if (sBld) sBld.is_active = isReactivate;
      saveLocalStore(store);
      return { id, is_active: isReactivate };
    }

    throw new Error('Invalid entityType for deactivation');
  },

  // 11. Update Entity for all 5 hierarchy levels with duplicate prevention
  async updateEntity(clinicId, entityType, id, data) {
    await this.verifyClinicIpd(clinicId);
    const store = getLocalStore();

    if (entityType === 'building') {
      const name = data.name?.trim();
      if (!name) {
        const err = new Error('Building name is required.');
        err.statusCode = 400;
        throw err;
      }

      let bld = store.buildings.find(b => b.id === id && b.clinic_id === clinicId);
      if (!bld) {
        const { data: dbBld } = await supabase.from('buildings').select('*').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
        bld = dbBld;
      }
      if (!bld) {
        const err = new Error('Building not found or does not belong to this clinic.');
        err.statusCode = 404;
        throw err;
      }

      // Duplicate check: another building with same name
      let dup = store.buildings.find(b => b.id !== id && b.clinic_id === clinicId && b.name.toLowerCase() === name.toLowerCase());
      if (!dup) {
        try {
          const { data: dbDup } = await supabase.from('buildings').select('id').eq('clinic_id', clinicId).ilike('name', name).neq('id', id).maybeSingle();
          dup = dbDup;
        } catch (_) {}
      }
      if (dup) {
        const err = new Error('A building with the name "' + name + '" already exists in this clinic.');
        err.statusCode = 400;
        throw err;
      }

      const code = (data.code?.trim() || '').toUpperCase();
      const description = data.description?.trim() || '';
      const updatePayload = { name, code, description, updated_at: new Date().toISOString() };

      try {
        await supabase.from('buildings').update(updatePayload).eq('id', id).eq('clinic_id', clinicId);
      } catch (_) {}

      const storeBld = store.buildings.find(b => b.id === id && b.clinic_id === clinicId);
      if (storeBld) {
        Object.assign(storeBld, updatePayload);
      }
      saveLocalStore(store);
      return { id, ...updatePayload };
    }

    if (entityType === 'floor') {
      const floorNumber = parseInt(data.floorNumber !== undefined ? data.floorNumber : data.floor_number, 10);
      if (isNaN(floorNumber)) {
        const err = new Error('Floor number must be a valid number.');
        err.statusCode = 400;
        throw err;
      }

      let flr = store.floors.find(f => f.id === id && f.clinic_id === clinicId);
      if (!flr) {
        const { data: dbFlr } = await supabase.from('floors').select('*').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
        flr = dbFlr;
      }
      if (!flr) {
        const err = new Error('Floor not found or does not belong to this clinic.');
        err.statusCode = 404;
        throw err;
      }

      // Duplicate check: same floor_number within same building
      let dup = store.floors.find(f => f.id !== id && f.building_id === flr.building_id && f.clinic_id === clinicId && Number(f.floor_number) === floorNumber);
      if (!dup) {
        try {
          const { data: dbDup } = await supabase.from('floors').select('id').eq('building_id', flr.building_id).eq('clinic_id', clinicId).eq('floor_number', floorNumber).neq('id', id).maybeSingle();
          dup = dbDup;
        } catch (_) {}
      }
      if (dup) {
        const err = new Error('Floor number ' + floorNumber + ' already exists in this building.');
        err.statusCode = 400;
        throw err;
      }

      const name = data.name?.trim() || ('Floor ' + floorNumber);
      const updatePayload = { floor_number: floorNumber, name, updated_at: new Date().toISOString() };

      try {
        await supabase.from('floors').update(updatePayload).eq('id', id).eq('clinic_id', clinicId);
      } catch (_) {}

      const storeFlr = store.floors.find(f => f.id === id && f.clinic_id === clinicId);
      if (storeFlr) {
        Object.assign(storeFlr, updatePayload);
      }
      saveLocalStore(store);
      return { id, ...updatePayload };
    }

    if (entityType === 'ward') {
      const name = data.name?.trim();
      if (!name) {
        const err = new Error('Ward name is required.');
        err.statusCode = 400;
        throw err;
      }

      let wrd = store.wards.find(w => w.id === id && w.clinic_id === clinicId);
      if (!wrd) {
        const { data: dbWrd } = await supabase.from('wards').select('*').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
        wrd = dbWrd;
      }
      if (!wrd) {
        const err = new Error('Ward not found or does not belong to this clinic.');
        err.statusCode = 404;
        throw err;
      }

      // Duplicate ward name check within same floor and clinic
      let dup = store.wards.find(w => w.id !== id && w.floor_id === wrd.floor_id && w.clinic_id === clinicId && w.name.toLowerCase() === name.toLowerCase());
      if (!dup) {
        try {
          const { data: dbDup } = await supabase.from('wards').select('id').eq('floor_id', wrd.floor_id).eq('clinic_id', clinicId).ilike('name', name).neq('id', id).maybeSingle();
          dup = dbDup;
        } catch (_) {}
      }
      if (dup) {
        const err = new Error('A ward with the name "' + name + '" already exists on this floor.');
        err.statusCode = 400;
        throw err;
      }

      const wardType = (data.type || data.ward_type || 'General').trim();
      const gender = (data.genderDesignation || data.gender || 'Mixed').trim();
      const capacity = data.capacity ? parseInt(data.capacity, 10) : (wrd.capacity || 0);
      const updatePayload = {
        name,
        ward_type: wardType,
        gender,
        capacity,
        updated_at: new Date().toISOString()
      };

      try {
        await supabase.from('wards').update(updatePayload).eq('id', id).eq('clinic_id', clinicId);
      } catch (_) {}

      const storeWrd = store.wards.find(w => w.id === id && w.clinic_id === clinicId);
      if (storeWrd) {
        Object.assign(storeWrd, updatePayload);
      }
      saveLocalStore(store);
      return { id, ...updatePayload };
    }

    if (entityType === 'room') {
      const roomNumber = (data.roomNumber || data.room_number || '').trim();
      if (!roomNumber) {
        const err = new Error('Room number is required.');
        err.statusCode = 400;
        throw err;
      }

      let rm = store.rooms.find(r => r.id === id && r.clinic_id === clinicId);
      if (!rm) {
        const { data: dbRm } = await supabase.from('rooms').select('*').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
        rm = dbRm;
      }
      if (!rm) {
        const err = new Error('Room not found or does not belong to this clinic.');
        err.statusCode = 404;
        throw err;
      }

      // Duplicate room_number check within same ward
      let dup = store.rooms.find(r => r.id !== id && r.ward_id === rm.ward_id && r.clinic_id === clinicId && r.room_number.toLowerCase() === roomNumber.toLowerCase());
      if (!dup) {
        try {
          const { data: dbDup } = await supabase.from('rooms').select('id').eq('ward_id', rm.ward_id).eq('clinic_id', clinicId).ilike('room_number', roomNumber).neq('id', id).maybeSingle();
          dup = dbDup;
        } catch (_) {}
      }
      if (dup) {
        const err = new Error('Room number "' + roomNumber + '" already exists in this ward.');
        err.statusCode = 400;
        throw err;
      }

      const roomType = (data.roomType || data.room_type || 'General').trim();
      const dailyRate = data.dailyRate !== undefined ? Number(data.dailyRate) : (data.daily_rate !== undefined ? Number(data.daily_rate) : (rm.daily_rate || 0));
      const updatePayload = {
        room_number: roomNumber,
        room_type: roomType,
        daily_rate: dailyRate,
        updated_at: new Date().toISOString()
      };

      try {
        await supabase.from('rooms').update(updatePayload).eq('id', id).eq('clinic_id', clinicId);
      } catch (_) {}

      const storeRm = store.rooms.find(r => r.id === id && r.clinic_id === clinicId);
      if (storeRm) {
        Object.assign(storeRm, updatePayload);
      }
      saveLocalStore(store);
      return { id, ...updatePayload };
    }

    if (entityType === 'bed') {
      const bedNumber = (data.bedNumber || data.bed_number || '').trim();
      if (!bedNumber) {
        const err = new Error('Bed number is required.');
        err.statusCode = 400;
        throw err;
      }

      let bed = store.beds.find(b => b.id === id && b.clinic_id === clinicId);
      if (!bed) {
        const { data: dbBed } = await supabase.from('beds').select('*').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
        bed = dbBed;
      }
      if (!bed) {
        const err = new Error('Bed not found or does not belong to this clinic.');
        err.statusCode = 404;
        throw err;
      }

      // Duplicate bed_number check within same room
      let dup = store.beds.find(b => b.id !== id && b.room_id === bed.room_id && b.clinic_id === clinicId && b.bed_number.toLowerCase() === bedNumber.toLowerCase());
      if (!dup) {
        try {
          const { data: dbDup } = await supabase.from('beds').select('id').eq('room_id', bed.room_id).eq('clinic_id', clinicId).ilike('bed_number', bedNumber).neq('id', id).maybeSingle();
          dup = dbDup;
        } catch (_) {}
      }
      if (dup) {
        const err = new Error('Bed number "' + bedNumber + '" already exists in this room.');
        err.statusCode = 400;
        throw err;
      }

      // DO NOT allow editing status here
      const dailyRate = data.dailyRate !== undefined ? Number(data.dailyRate) : (data.daily_rate !== undefined ? Number(data.daily_rate) : (bed.daily_rate || 500));
      const updatePayload = {
        bed_number: bedNumber,
        daily_rate: dailyRate,
        updated_at: new Date().toISOString()
      };

      try {
        await supabase.from('beds').update(updatePayload).eq('id', id).eq('clinic_id', clinicId);
      } catch (_) {}

      const storeBed = store.beds.find(b => b.id === id && b.clinic_id === clinicId);
      if (storeBed) {
        Object.assign(storeBed, updatePayload);
      }
      saveLocalStore(store);
      return { id, ...updatePayload };
    }

    throw new Error('Invalid entityType for update');
  },


  // Preserved Phase 2 Nurse & Admission methods (unmodified)
  async getNursesForWard(clinicId, wardId = null, statusFilter = null) {
    await this.verifyClinicIpd(clinicId);
    let nurses = [];
    try {
      let query = supabase.from('staff').select('id, first_name, last_name, email, phone, role, status, ward_id, clinic_id, avatar_url, created_at')
        .eq('clinic_id', clinicId)
        .eq('role', 'nurse');
      if (statusFilter) query = query.eq('status', statusFilter);
      if (wardId) query = query.eq('ward_id', wardId);
      const { data: staffList, error } = await query.order('created_at', { ascending: false });
      if (!error && staffList && staffList.length > 0) nurses = staffList;
    } catch (_) {}

    const store = getLocalStore();
    if (!store.staff) store.staff = [];

    // Fallback/merge with local store staff
    if (nurses.length === 0 && store.staff.length > 0) {
      nurses = store.staff.filter(s =>
        s.clinic_id === clinicId &&
        s.role === 'nurse' &&
        (!statusFilter || s.status === statusFilter) &&
        (!wardId || s.ward_id === wardId)
      );
    }

    // Sort newest first by created_at timestamp
    nurses.sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));

    const wards = await this.getWards(clinicId);
    const wardMap = new Map((wards || []).map(w => [w.id, w]));

    const activeAdmissions = await this.getActiveAdmissions(clinicId);
    const localActive = (store.admissions || []).filter(a => a.clinic_id === clinicId && a.status === 'admitted');

    return nurses.map(n => {
      const activeCountDb = (activeAdmissions || []).filter(a => a.assigned_nurse_id === n.id).length;
      const activeCountLocal = localActive.filter(a => (a.assigned_nurse_id === n.id || a.assignedNurseId === n.id)).length;
      const activePatientsCount = Math.max(activeCountDb, activeCountLocal);
      const ward = wardMap.get(n.ward_id);

      const sanitizedNurse = { ...n };
      delete sanitizedNurse.password;
      delete sanitizedNurse.password_hash;
      delete sanitizedNurse.passwordHash;

      return {
        ...sanitizedNurse,
        _id: n.id,
        firstName: n.first_name,
        lastName: n.last_name,
        name: `${n.first_name || ''} ${n.last_name || ''}`.trim(),
        wardId: n.ward_id,
        wardName: ward?.name || 'Unassigned',
        wardType: ward?.type || '',
        avatarUrl: n.avatar_url || n.photo || null,
        photo: n.avatar_url || n.photo || null,
        activePatientsCount,
        maxCapacity: 20,
        remainingCapacity: Math.max(0, 20 - activePatientsCount),
        capacityStatus: activePatientsCount >= 20 ? 'full' : 'available',
        isCapacityFull: activePatientsCount >= 20,
        created_at: n.created_at || n.createdAt || null
      };
    });
  },

  async getActiveAdmissions(clinicId) {
    try {
      const { data, error } = await supabase.from('ipd_admissions').select('*').eq('clinic_id', clinicId).eq('status', 'admitted');
      if (!error && data) return data;
    } catch (_) {}
    const store = getLocalStore();
    return store.admissions.filter(a => a.clinic_id === clinicId && a.status === 'admitted');
  },

    async getAdmissions(clinicId, user = null, options = {}) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }
      if (!nurse) {
        const otherNurse = (store.staff || []).find(s => s.id === nurseId || s._id === nurseId);
        if (otherNurse && otherNurse.clinic_id !== clinicId) {
          const err = new Error('Forbidden: Nurse belongs to a different clinic.');
          err.code = 'CROSS_CLINIC_FORBIDDEN';
          err.statusCode = 403;
          throw err;
        }
      }
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot access nursing worklist.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }
    }
    let dbAdms = [];
    try {
      let query = supabase.from('ipd_admissions').select('*, patients(*), staff!ipd_admissions_admitting_doctor_id_fkey(first_name, last_name)').eq('clinic_id', clinicId);
      if (options.status) query = query.eq('status', options.status);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data) dbAdms = data;
    } catch (_) {}

    let localAdms = (store.admissions || []).filter(a => a.clinic_id === clinicId);
    if (options.status) {
      localAdms = localAdms.filter(a => a.status === options.status);
    }

    let clinicDoctorsList = [];
    try {
      const { data: dbDocs } = await supabase.from('doctors').select('id, first_name, last_name').eq('clinic_id', clinicId);
      if (dbDocs) clinicDoctorsList = dbDocs;
    } catch (_) {}

    // Enrich admissions with names and consulting doctors
    const baseList = dbAdms.length > 0 ? dbAdms : localAdms;
    const enrichedAdmissions = baseList.map(adm => {
      const p = (store.patients || []).find(pt => pt.id === adm.patient_id || pt._id === adm.patient_id);
      const w = (store.wards || []).find(wd => wd.id === (adm.ward_id || adm.wardId));
      const b = (store.beds || []).find(bd => bd.id === (adm.bed_id || adm.bedId));
      const r = (store.rooms || []).find(rm => rm.id === (b?.room_id || adm.room_id || adm.roomId));
      const fl = (store.floors || []).find(f => f.id === (w?.floor_id || adm.floor_id || adm.floorId));
      const bg = (store.buildings || []).find(bgItem => bgItem.id === (fl?.building_id || w?.building_id || adm.building_id || adm.buildingId));
      const n = (store.staff || []).find(st => st.id === (adm.assigned_nurse_id || adm.assignedNurseId));
      const d = (store.doctors || []).find(dc => dc.id === adm.admitting_doctor_id) || clinicDoctorsList.find(dc => dc.id === adm.admitting_doctor_id);

      const patientName = adm.patient_name || adm.patientName || (p ? `${p.first_name || p.firstName || ''} ${p.last_name || p.lastName || ''}`.trim() : 'Patient');
      const wardName = adm.ward_name || adm.wardName || (w ? w.name : 'Ward');
      const bedNumber = adm.bed_number || adm.bedNumber || (b ? b.bed_number : '');
      const roomNumber = adm.room_number || adm.roomNumber || (r ? (r.room_number || r.roomNumber) : (b ? (b.room_number || b.roomNumber) : ''));
      const buildingName = adm.building_name || adm.buildingName || (bg ? bg.name : '');
      const floorNumber = adm.floor_number || adm.floorNumber || (fl ? (fl.floor_number || fl.name) : '');
      const nurseName = adm.nurse_name || adm.nurseName || (n ? `${n.first_name || ''} ${n.last_name || ''}`.trim() : (adm.assigned_nurse_id ? 'Assigned Nurse' : 'Unassigned'));
      let doctorName = (adm.admitting_doctor_name && adm.admitting_doctor_name !== 'Doctor') ? adm.admitting_doctor_name :
        (adm.admittingDoctorName && adm.admittingDoctorName !== 'Doctor') ? adm.admittingDoctorName : null;
      if (!doctorName && d) {
        doctorName = d.name || `Dr. ${d.first_name || ''} ${d.last_name || ''}`.trim();
      }
      if (!doctorName) doctorName = 'Dr. Doctor';

      const consultingDocs = adm.consultingDoctors || adm.consulting_doctors ||
        (store.consultingDoctors || []).filter(cd => cd.admission_id === adm.id || cd.admissionId === adm.id);

      return {
        ...adm,
        consultingDoctors: consultingDocs,
        consulting_doctors: consultingDocs,
        patientName,
        patient_name: patientName,
        wardName,
        ward_name: wardName,
        bedNumber,
        bed_number: bedNumber,
        roomNumber,
        room_number: roomNumber,
        nurseName,
        nurse_name: nurseName,
        assignedNurseName: nurseName,
        assigned_nurse_name: nurseName,
        buildingName,
        building_name: buildingName,
        floorNumber,
        floor_number: floorNumber,
        admittingDoctorName: doctorName,
        admitting_doctor_name: doctorName,
        patient: p || adm.patient,
        patient_age: p?.age ?? adm.patient_age ?? adm.patientAge,
        patientAge: p?.age ?? adm.patient_age ?? adm.patientAge,
        date_of_birth: p?.date_of_birth ?? p?.dateOfBirth ?? adm.date_of_birth ?? adm.dateOfBirth,
        dateOfBirth: p?.date_of_birth ?? p?.dateOfBirth ?? adm.date_of_birth ?? adm.dateOfBirth
      };
    });

    let finalResult = enrichedAdmissions;
    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }
      const nurseWardId = nurse?.ward_id || nurse?.wardId || nurse?.assigned_ward_id;

      finalResult = finalResult.filter(adm => {
        if (nurseWardId) {
          const admWardId = adm.ward_id || adm.wardId;
          if (!admWardId || String(admWardId) !== String(nurseWardId)) {
            return false;
          }
        }

        const isAssigned = (adm.assigned_nurse_id === nurseId || adm.assignedNurseId === nurseId ||
          (store.nurseAssignments || []).some(na => (na.admission_id === adm.id || na.admissionId === adm.id) && (na.nurse_id === nurseId || na.nurseId === nurseId) && na.is_active !== false));
        if (!isAssigned) return false;
        if (!options.status && !options.includeDischarged) {
          return (adm.status || '').toLowerCase() === 'admitted';
        }
        return true;
      });
    }

    if (finalResult && Array.isArray(finalResult)) {
      finalResult = finalResult.map(adm => {
        const pendingTransfer = (store.transfers || []).find(t => (t.admission_id === adm.id || t.admissionId === adm.id) && t.status === 'APPROVED') || null;
        return {
          ...adm,
          pendingTransfer,
          pendingTransferId: pendingTransfer ? pendingTransfer.id : null
        };
      });
    }

    return finalResult;
  },

  async getAdmissionById(clinicId, user = null, admissionId) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();
    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot access patient details.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }
    }

    const allAdmissions = await this.getAdmissions(clinicId, null);
    const admission = allAdmissions.find(a => (a.id === admissionId || a._id === admissionId));

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const admClinicId = admission.clinic_id || admission.clinicId;
    if (admClinicId && String(admClinicId).toLowerCase() !== String(clinicId).toLowerCase()) {
      const err = new Error('Forbidden: Cross-clinic admission access denied.');
      err.code = 'FORBIDDEN_CLINIC_MISMATCH';
      err.statusCode = 403;
      throw err;
    }

    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => (na.admission_id === admission.id || na.admissionId === admission.id) &&
              (na.nurse_id === nurseId || na.nurseId === nurseId) &&
              na.is_active !== false
      );
      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this patient.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }
    }

    const patientId = admission.patient_id || admission.patientId;
    const patientAdmissions = allAdmissions.filter(a =>
      (a.patient_id === patientId || a.patientId === patientId)
    );

    const docName = admission.admitting_doctor_name || admission.admittingDoctorName || admission.doctorName || (admission.doctor?.name) || 'Attending Doctor';
    const docId = admission.admitting_doctor_id || admission.admittingDoctorId || admission.doctor_id || admission.doctorId;
    const nName = admission.nurse_name || admission.nurseName || (admission.nurse?.name) || 'Assigned Nurse';

    const activeTransfer = (store.transfers || []).find(t => (t.admission_id === admission.id || t.admissionId === admission.id) && t.status === 'APPROVED') || null;
    const transferHistory = (store.transfers || []).filter(t => (t.admission_id === admission.id || t.admissionId === admission.id));

    return {
      ...admission,
      doctorName: docName,
      doctor_id: docId,
      doctor: admission.doctor || { id: docId, name: docName },
      nurseName: nName,
      patientAdmissions,
      pendingTransfer: activeTransfer,
      pendingTransferId: activeTransfer ? activeTransfer.id : null,
      transferHistory
    };
  },

  // 13. Inpatient Admission with Concurrency / Atomic Allocation Protection (Doctor-only)
  async admitPatient(clinicId, user, data) {
    if (!data.bedId) {
      const err = new Error('Bed ID is required for admission.');
      err.code = 'BED_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    // 1. Role Authorization: ONLY DOCTOR CAN ADMIT
    if (!user || user.role !== 'doctor' || !user.id) {
      const err = new Error('Forbidden: Only authenticated doctors can admit patients.');
      err.code = 'DOCTOR_ONLY';
      err.statusCode = 403;
      throw err;
    }

    // 2. Concurrency Lock: Atomic in-process allocation guard
    if (bedAllocationLocks.has(data.bedId)) {
      const err = new Error('Bed allocation is currently in progress for this bed by another request. Please retry.');
      err.code = 'CONCURRENT_ALLOCATION_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    bedAllocationLocks.add(data.bedId);

    try {
      await this.verifyClinicIpd(clinicId);
      const store = getLocalStore();

      // 3. Existing Patient Validation & Tenant Isolation
      let patient = null;
      try {
        const { data: dbPatient } = await supabase
          .from('patients')
          .select('*')
          .eq('id', data.patientId)
          .maybeSingle();
        if (dbPatient) patient = dbPatient;
      } catch (_) {}

      if (!patient) {
        patient = (store.patients || []).find(p => (p.id === data.patientId || p._id === data.patientId));
      }

      if (!patient) {
        const err = new Error('Patient not found.');
        err.code = 'PATIENT_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      if (patient.clinic_id && patient.clinic_id !== clinicId) {
        const err = new Error('Patient belongs to a different clinic. Cross-clinic patient admission is forbidden.');
        err.code = 'CROSS_CLINIC_PATIENT';
        err.statusCode = 403;
        throw err;
      }

      // 4. Duplicate Active Admission Check (Existing active admission rejected, discharged allowed)
      let patientHasActive = false;
      try {
        const { data: activeDbAdms } = await supabase
          .from('ipd_admissions')
          .select('id')
          .eq('clinic_id', clinicId)
          .eq('patient_id', data.patientId)
          .eq('status', 'admitted');
        if (activeDbAdms && activeDbAdms.length > 0) patientHasActive = true;
      } catch (_) {}

      if (!patientHasActive) {
        patientHasActive = (store.admissions || []).some(
          a => a.clinic_id === clinicId &&
               (a.patient_id === data.patientId || a.patientId === data.patientId) &&
               a.status === 'admitted'
        );
      }

      if (patientHasActive) {
        const err = new Error('Patient already has an active inpatient admission. Cannot create duplicate active admission.');
        err.code = 'PATIENT_ALREADY_ADMITTED';
        err.statusCode = 409;
        throw err;
      }

      // 5. Ward Validation (Active & Tenant Isolated)
      let ward = (store.wards || []).find(w => w.id === data.wardId && w.clinic_id === clinicId);
      if (!ward) {
        try {
          const { data: dbWard } = await supabase.from('wards').select('*').eq('id', data.wardId).eq('clinic_id', clinicId).maybeSingle();
          if (dbWard) ward = dbWard;
        } catch (_) {}
      }

      if (!ward) {
        let otherWard = (store.wards || []).find(w => w.id === data.wardId);
        if (!otherWard) {
          try {
            const { data: dbOtherWard } = await supabase.from('wards').select('*').eq('id', data.wardId).maybeSingle();
            if (dbOtherWard) otherWard = dbOtherWard;
          } catch (_) {}
        }
        if (otherWard && otherWard.clinic_id !== clinicId) {
          const err = new Error('Ward belongs to a different clinic.');
          err.code = 'CROSS_CLINIC_WARD';
          err.statusCode = 403;
          throw err;
        }

        const err = new Error('Ward not found in this clinic.');
        err.code = 'WARD_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      if (ward.is_active === false) {
        const err = new Error('Cannot admit patient to an inactive ward.');
        err.code = 'WARD_INACTIVE';
        err.statusCode = 400;
        throw err;
      }

      // 6. Bed Validation (Active, Available, Correct Ward, Tenant Isolated)
      let bed = (store.beds || []).find(b => b.id === data.bedId && b.clinic_id === clinicId);
      if (!bed) {
        try {
          const { data: dbBed } = await supabase.from('beds').select('*').eq('id', data.bedId).eq('clinic_id', clinicId).maybeSingle();
          if (dbBed) bed = dbBed;
        } catch (_) {}
      }

      if (!bed) {
        let otherBed = (store.beds || []).find(b => b.id === data.bedId);
        if (!otherBed) {
          try {
            const { data: dbOtherBed } = await supabase.from('beds').select('*').eq('id', data.bedId).maybeSingle();
            if (dbOtherBed) otherBed = dbOtherBed;
          } catch (_) {}
        }
        if (otherBed && otherBed.clinic_id !== clinicId) {
          const err = new Error('Bed belongs to a different clinic.');
          err.code = 'CROSS_CLINIC_BED';
          err.statusCode = 403;
          throw err;
        }

        const err = new Error('Bed not found in this clinic.');
        err.code = 'BED_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      if (bed.is_active === false) {
        const err = new Error('Cannot allocate an inactive bed for inpatient admission.');
        err.code = 'BED_INACTIVE';
        err.statusCode = 400;
        throw err;
      }

      if (bed.ward_id && bed.ward_id !== data.wardId) {
        const err = new Error('Selected bed does not belong to the selected ward.');
        err.code = 'BED_WARD_MISMATCH';
        err.statusCode = 400;
        throw err;
      }

      // Bed status check: ONLY AVAILABLE BEDS
      if (bed.status !== 'AVAILABLE') {
        const err = new Error(`Bed is not available for admission (current status: ${bed.status}). Only active AVAILABLE beds can be allocated.`);
        err.code = 'BED_NOT_AVAILABLE';
        err.statusCode = 400;
        throw err;
      }

      // Active admission on bed check
      let hasActiveBedAdm = false;
      try {
        const { data: activeRows } = await supabase
          .from('ipd_admissions')
          .select('id')
          .eq('clinic_id', clinicId)
          .eq('bed_id', data.bedId)
          .eq('status', 'admitted');
        if (activeRows && activeRows.length > 0) hasActiveBedAdm = true;
      } catch (_) {}

      if (!hasActiveBedAdm) {
        hasActiveBedAdm = (store.admissions || []).some(
          a => a.clinic_id === clinicId && (a.bed_id === data.bedId || a.bedId === data.bedId) && a.status === 'admitted'
        );
      }

      if (hasActiveBedAdm) {
        const err = new Error('Bed already has an active inpatient admission.');
        err.code = 'BED_ALREADY_OCCUPIED';
        err.statusCode = 409;
        throw err;
      }

      // 7. Nurse Validation & Capacity Enforcement (< 20 active patients)
      const nurseId = data.assignedNurseId || data.nurseId;
      if (!nurseId) {
        const err = new Error('Assigned nurse is required.');
        err.code = 'NURSE_REQUIRED';
        err.statusCode = 400;
        throw err;
      }

      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }

      if (!nurse) {
        let otherNurse = (store.staff || []).find(s => s.id === nurseId || s._id === nurseId);
        if (!otherNurse) {
          try {
            const { data: dbONurse } = await supabase.from('staff').select('*').eq('id', nurseId).maybeSingle();
            if (dbONurse) otherNurse = dbONurse;
          } catch (_) {}
        }
        if (otherNurse && otherNurse.clinic_id !== clinicId) {
          const err = new Error('Nurse belongs to a different clinic.');
          err.code = 'CROSS_CLINIC_NURSE';
          err.statusCode = 403;
          throw err;
        }

        const err = new Error('Assigned nurse not found in this clinic.');
        err.code = 'NURSE_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      if (nurse.role !== 'nurse') {
        const err = new Error('Selected staff member is not a nurse.');
        err.code = 'INVALID_NURSE_ROLE';
        err.statusCode = 400;
        throw err;
      }

      if (nurse.status !== 'active') {
        const err = new Error('Cannot assign an inactive nurse to an inpatient admission.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 400;
        throw err;
      }

      if (nurse.ward_id && nurse.ward_id !== data.wardId) {
        const err = new Error('Nurse is assigned to a different ward. Nurses can only care for patients in their assigned ward.');
        err.code = 'NURSE_WARD_MISMATCH';
        err.statusCode = 400;
        throw err;
      }

      // Nurse capacity check
      const activeAdmissions = await this.getActiveAdmissions(clinicId);
      const localActive = (store.admissions || []).filter(a => a.clinic_id === clinicId && a.status === 'admitted');
      const activeCountDb = (activeAdmissions || []).filter(a => a.assigned_nurse_id === nurse.id).length;
      const activeCountLocal = localActive.filter(a => (a.assigned_nurse_id === nurse.id || a.assignedNurseId === nurse.id)).length;
      const activeCount = Math.max(activeCountDb, activeCountLocal);

      if (activeCount >= 20) {
        const nurseFullName = `${nurse.first_name || ''} ${nurse.last_name || ''}`.trim();
        const err = new Error(`Nurse "${nurseFullName}" has reached the maximum capacity of 20 active inpatient patients. Please select another nurse.`);
        err.code = 'NURSE_CAPACITY_EXCEEDED';
        err.statusCode = 400;
        throw err;
      }

      // 8. Generate Unique IPD Admission Number (never reused)
      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const existingNumbers = new Set(
        (store.admissions || [])
          .filter(a => a.clinic_id === clinicId)
          .map(a => a.admission_number || a.admissionNumber)
      );
      try {
        const { data: dbNums } = await supabase
          .from('ipd_admissions')
          .select('admission_number')
          .eq('clinic_id', clinicId);
        if (dbNums) dbNums.forEach(n => existingNumbers.add(n.admission_number));
      } catch (_) {}

      let seq = 1;
      let admissionNumber = `IPD-${yearMonth}-${String(seq).padStart(4, '0')}`;
      while (existingNumbers.has(admissionNumber)) {
        seq++;
        admissionNumber = `IPD-${yearMonth}-${String(seq).padStart(4, '0')}`;
      }

      // 9. Atomic State Mutation: Bed Status AVAILABLE -> OCCUPIED
      try {
        await supabase
          .from('beds')
          .update({ status: 'OCCUPIED' })
          .eq('id', data.bedId)
          .eq('clinic_id', clinicId)
          .eq('status', 'AVAILABLE');
      } catch (_) {}

      bed.status = 'OCCUPIED';

      const admissionId = generateUUID();

      // 10. Record Bed Audit History
      await recordBedStatusHistory(
        clinicId,
        data.bedId,
        'AVAILABLE',
        'OCCUPIED',
        user,
        data.admissionReason || data.notes || (`Patient admitted to bed - ${admissionNumber}`),
        admissionId,
        store
      );

      // 11. Create & Persist Enriched Admission Record
      const doctorName = user.name || (user.first_name ? `Dr. ${user.first_name} ${user.last_name || ''}`.trim() : 'Doctor');
      const patientName = `${patient.first_name || patient.firstName || ''} ${patient.last_name || patient.lastName || ''}`.trim() || patient.name || 'Patient';
      const nurseName = `${nurse.first_name || ''} ${nurse.last_name || ''}`.trim() || nurse.name || 'Nurse';

      const admission = {
        id: admissionId,
        clinic_id: clinicId,
        clinicId: clinicId,
        admission_number: admissionNumber,
        admissionNumber: admissionNumber,
        patient_id: patient.id || patient._id,
        patientId: patient.id || patient._id,
        patient_name: patientName,
        patientName: patientName,
        patient_code: patient.patient_code || patient.patientCode || '',
        patientCode: patient.patient_code || patient.patientCode || '',
        patient_phone: patient.phone_number || patient.phoneNumber || '',
        patientPhone: patient.phone_number || patient.phoneNumber || '',
        admitting_doctor_id: user.id,
        admittingDoctorId: user.id,
        admitting_doctor_name: doctorName,
        admittingDoctorName: doctorName,
        ward_id: data.wardId,
        wardId: data.wardId,
        ward_name: ward.name,
        wardName: ward.name,
        room_id: bed.room_id || null,
        roomId: bed.room_id || null,
        room_number: bed.room_number || bed.roomNumber || '',
        roomNumber: bed.room_number || bed.roomNumber || '',
        bed_id: data.bedId,
        bedId: data.bedId,
        bed_number: bed.bed_number,
        bedNumber: bed.bed_number,
        assigned_nurse_id: nurse.id || nurse._id,
        assignedNurseId: nurse.id || nurse._id,
        nurse_name: nurseName,
        nurseName: nurseName,
        admission_date: now.toISOString(),
        admissionDate: now.toISOString(),
        diagnosis: data.diagnosis || data.provisionalDiagnosis || null,
        provisionalDiagnosis: data.diagnosis || data.provisionalDiagnosis || null,
        admission_reason: data.admissionReason || data.notes || null,
        notes: data.admissionReason || data.notes || null,
        status: 'admitted',
        bed_daily_rate: Number(bed.daily_rate || 500),
        created_at: now.toISOString()
      };

      try {
        await supabase.from('ipd_admissions').insert([admission]);
      } catch (_) {}

      if (!store.admissions) store.admissions = [];
      store.admissions.unshift(admission);

      // 12. Create Nurse Assignment Record
      const nurseAssign = {
        id: generateUUID(),
        clinic_id: clinicId,
        admission_id: admissionId,
        nurse_id: nurse.id || nurse._id,
        ward_id: data.wardId,
        assigned_at: now.toISOString(),
        is_active: true,
        created_at: now.toISOString()
      };
      try { await supabase.from('ipd_nurse_assignments').insert([nurseAssign]); } catch (_) {}
      if (!store.nurseAssignments) store.nurseAssignments = [];
      store.nurseAssignments.push(nurseAssign);

      saveLocalStore(store);
      return admission;
    } finally {
      bedAllocationLocks.delete(data.bedId);
    }
  },

    // 13b. Add Consulting Doctor
  async addConsultingDoctor(clinicId, user, admissionId, data) {
    await this.verifyClinicIpd(clinicId);
    const store = getLocalStore();

    let admission = (store.admissions || []).find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Admission record not found in this clinic.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if ((admission.status || '').toLowerCase() === 'discharged') {
      const err = new Error('Cannot assign consulting doctor to a discharged admission.');
      err.code = 'ADMISSION_ALREADY_DISCHARGED';
      err.statusCode = 400;
      throw err;
    }

    const targetDoctorId = data.doctorId || data.doctor_id;
    if (!targetDoctorId) {
      const err = new Error('Doctor ID is required.');
      err.code = 'DOCTOR_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    // Cannot consult on oneself if this doctor is already the admitting doctor
    const admDocId = admission.admitting_doctor_id || admission.admittingDoctorId;
    if (admDocId && String(admDocId).toLowerCase() === String(targetDoctorId).toLowerCase()) {
      const err = new Error('The admitting doctor is already the primary physician and cannot be added as a consulting doctor.');
      err.code = 'CANNOT_CONSULT_SELF';
      err.statusCode = 400;
      throw err;
    }

    // Resolve target doctor
    let targetDoctor = (store.doctors || []).find(d => (d.id === targetDoctorId || d._id === targetDoctorId));
    if (!targetDoctor) {
      try {
        const { data: dbDoc } = await supabase.from('doctors').select('id, first_name, last_name, specialty, clinic_id').eq('id', targetDoctorId).maybeSingle();
        if (dbDoc) targetDoctor = dbDoc;
      } catch (_) {}
    }

    if (!targetDoctor || (targetDoctor.clinic_id && targetDoctor.clinic_id !== clinicId)) {
      const err = new Error('Doctor not found in this clinic.');
      err.code = 'DOCTOR_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // Prevent duplicate consulting assignment
    const existingConsultants = admission.consultingDoctors || admission.consulting_doctors || [];
    const isAlreadyConsulting = existingConsultants.some(cd =>
      String(cd.doctor_id || cd.doctorId).toLowerCase() === String(targetDoctorId).toLowerCase()
    );
    if (isAlreadyConsulting) {
      const err = new Error('This doctor is already assigned as a consulting doctor for this admission.');
      err.code = 'DOCTOR_ALREADY_ASSIGNED';
      err.statusCode = 409;
      throw err;
    }

    const docName = targetDoctor.name || `Dr. ${targetDoctor.first_name || targetDoctor.firstName || ''} ${targetDoctor.last_name || targetDoctor.lastName || ''}`.trim();
    const specialty = data.specialty || targetDoctor.specialty || '';
    const reason = (data.consultationReason || data.notes || '').trim();
    const nowIso = new Date().toISOString();
    const consultantId = generateUUID();

    const consultantRecord = {
      id: consultantId,
      admission_id: admissionId,
      admissionId,
      clinic_id: clinicId,
      clinicId,
      doctor_id: targetDoctorId,
      doctorId: targetDoctorId,
      doctor_name: docName,
      doctorName: docName,
      specialty,
      notes: reason,
      consultation_reason: reason,
      consultationReason: reason,
      assigned_by: user.id || user._id,
      assignedBy: user.id || user._id,
      created_at: nowIso,
      createdAt: nowIso
    };

    if (!admission.consultingDoctors) admission.consultingDoctors = [];
    admission.consultingDoctors.push(consultantRecord);
    admission.consulting_doctors = admission.consultingDoctors;

    if (!store.consultingDoctors) store.consultingDoctors = [];
    store.consultingDoctors.push(consultantRecord);

    try {
      await supabase.from('ipd_consulting_doctors').insert({
        id: consultantId,
        admission_id: admissionId,
        clinic_id: clinicId,
        doctor_id: targetDoctorId,
        doctor_name: docName,
        notes: reason,
        assigned_by: user.id || user._id,
        created_at: nowIso
      });
    } catch (_) {}

    saveLocalStore(store);
    return consultantRecord;
  },

      // 14. Inpatient Discharge Flow: OCCUPIED -> CLEANING (Never directly to AVAILABLE)
  async dischargePatient(clinicId, user, admissionId, payload = {}) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }
    const store = getLocalStore();

    let admission = store.admissions?.find(a => a.id === admissionId && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (admission.status !== 'admitted') {
      const err = new Error(`Patient is not currently admitted (current status: ${admission.status}).`);
      err.code = 'ADMISSION_NOT_ACTIVE';
      err.statusCode = 400;
      throw err;
    }

    const bedId = admission.bed_id || admission.bedId;
    let bed = store.beds.find(b => b.id === bedId && b.clinic_id === clinicId);
    if (!bed) {
      try {
        const { data: dbBed } = await supabase.from('beds').select('*').eq('id', bedId).eq('clinic_id', clinicId).maybeSingle();
        if (dbBed) bed = dbBed;
      } catch (_) {}
    }

    // Move bed OCCUPIED -> CLEANING
    const prevStatus = bed ? bed.status : 'OCCUPIED';
    try {
      await supabase.from('beds').update({ status: 'CLEANING' }).eq('id', bedId).eq('clinic_id', clinicId);
    } catch (_) {}

    if (bed) {
      bed.status = 'CLEANING';
    }

    // Record Audit History
    const dischargeReason = payload.dischargeSummary || payload.reason || 'Patient discharged. Bed moved to CLEANING for housekeeping sanitization.';
    await recordBedStatusHistory(
      clinicId,
      bedId,
      prevStatus,
      'CLEANING',
      user,
      dischargeReason,
      admissionId,
      store
    );

    // Update Admission status to 'discharged'
    const dischargeDate = payload.dischargeDate || payload.discharge_date || new Date().toISOString();
    const dischargeSummary = (payload.dischargeSummary || payload.discharge_summary || payload.summary || '').trim() || null;
    const dischargeCondition = payload.dischargeCondition || payload.discharge_condition || payload.condition || 'improved';

    const admUpdates = {
      status: 'discharged',
      discharge_date: dischargeDate,
      dischargeDate: dischargeDate,
      discharge_summary: dischargeSummary,
      dischargeSummary: dischargeSummary,
      discharge_condition: dischargeCondition,
      dischargeCondition: dischargeCondition
    };

    try {
      await supabase.from('ipd_admissions').update(admUpdates).eq('id', admissionId).eq('clinic_id', clinicId);
    } catch (_) {}

    const storeAdm = store.admissions?.find(a => a.id === admissionId && a.clinic_id === clinicId);
    if (storeAdm) {
      Object.assign(storeAdm, admUpdates);
    }

    // Deactivate active nurse assignments
    try {
      await supabase.from('ipd_nurse_assignments').update({ is_active: false, unassigned_at: dischargeDate }).eq('admission_id', admissionId);
    } catch (_) {}

    if (store.nurseAssignments) {
      store.nurseAssignments.forEach(n => {
        if (n.admission_id === admissionId && n.is_active) {
          n.is_active = false;
          n.unassigned_at = dischargeDate;
        }
      });
    }

    // Calculate calendar-day bed billing
    const admDateRaw = admission.admission_date || admission.admissionDate || admission.created_at;
    const disDateRaw = payload.dischargeDate || dischargeDate;

    // Clinic-local calendar date calculation (Asia/Kolkata / +05:30)
    const getCalendarDateKey = (dateVal) => {
      const d = new Date(dateVal);
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return formatter.format(d);
    };

    const admDateKey = getCalendarDateKey(admDateRaw);
    const disDateKey = getCalendarDateKey(disDateRaw);

    const admUtc = new Date(`${admDateKey}T00:00:00Z`);
    const disUtc = new Date(`${disDateKey}T00:00:00Z`);
    const diffDays = Math.round((disUtc.getTime() - admUtc.getTime()) / (1000 * 60 * 60 * 24));
    const calendarDays = Math.max(1, diffDays + 1);

    // Bed daily rate resolution
    let applicableDailyRate = null;
    let isRateConfigured = false;

    if (bed && bed.daily_rate !== undefined && bed.daily_rate !== null && !isNaN(Number(bed.daily_rate))) {
      applicableDailyRate = Number(bed.daily_rate);
      isRateConfigured = true;
    } else if (admission.bed_daily_rate !== undefined && admission.bed_daily_rate !== null && !isNaN(Number(admission.bed_daily_rate))) {
      applicableDailyRate = Number(admission.bed_daily_rate);
      isRateConfigured = true;
    } else if (admission.bedDailyRate !== undefined && admission.bedDailyRate !== null && !isNaN(Number(admission.bedDailyRate))) {
      applicableDailyRate = Number(admission.bedDailyRate);
      isRateConfigured = true;
    }

    const totalBedCharge = isRateConfigured ? (calendarDays * applicableDailyRate) : null;

    const billing = {
      admissionId,
      admissionDate: admDateRaw,
      dischargeDate: disDateRaw,
      admissionCalendarDate: admDateKey,
      dischargeCalendarDate: disDateKey,
      calendarDays,
      billableDays: calendarDays,
      dailyRate: applicableDailyRate,
      bedDailyRate: applicableDailyRate,
      totalBedCharge,
      isRateConfigured,
      rateWarning: isRateConfigured ? null : 'Bed daily rate is not configured. Charge cannot be calculated.',
      currency: 'INR'
    };

    admUpdates.billing = billing;
    if (storeAdm) {
      storeAdm.billing = billing;
    }

    saveLocalStore(store);

    return {
      admissionId,
      bedId,
      bedStatus: 'CLEANING',
      billing,
      dischargeDate,
      discharge_date: dischargeDate,
      dischargeCondition,
      discharge_condition: dischargeCondition,
      dischargeSummary,
      discharge_summary: dischargeSummary,
      admission: storeAdm || admission,
      message: 'Patient discharged successfully. Bed transitioned to CLEANING for housekeeping sanitization.'
    };
  },

  // 15. Clinical Progress Notes & Vitals CRUD
  async addClinicalNote(clinicId, user, admissionId, data) {
    await this.verifyClinicIpd(clinicId);
    if (user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    let admission = store.admissions?.find(a => a.id === admissionId && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if ((admission.status || '').toLowerCase() === 'discharged') {
      const err = new Error('Cannot record doctor rounds or clinical progress notes on a discharged admission.');
      err.code = 'ADMISSION_ALREADY_DISCHARGED';
      err.statusCode = 400;
      throw err;
    }

    // Validate optional vitals numeric integrity
    if (data.vitals) {
      if (data.vitals.pulse !== undefined && data.vitals.pulse !== null && !isNaN(Number(data.vitals.pulse))) {
        const p = Number(data.vitals.pulse);
        if (p < 10 || p > 350) {
          const err = new Error('Pulse reading must be between 10 and 350 bpm.');
          err.code = 'INVALID_VITAL';
          err.statusCode = 400;
          throw err;
        }
      }
      if (data.vitals.spo2 !== undefined && data.vitals.spo2 !== null && !isNaN(Number(data.vitals.spo2))) {
        const s = Number(data.vitals.spo2);
        if (s < 0 || s > 100) {
          const err = new Error('SpO2 reading must be between 0 and 100%.');
          err.code = 'INVALID_VITAL';
          err.statusCode = 400;
          throw err;
        }
      }
      if (data.vitals.temperature !== undefined && data.vitals.temperature !== null && !isNaN(Number(data.vitals.temperature))) {
        const t = Number(data.vitals.temperature);
        if (t < 60 || t > 120) {
          const err = new Error('Temperature reading must be between 60 and 120°F.');
          err.code = 'INVALID_VITAL';
          err.statusCode = 400;
          throw err;
        }
      }
    }

    const clinicalFindings = (data.clinical_findings || data.clinicalFindings || data.findings || '').trim();
    const patientCondition = (data.patient_condition || data.patientCondition || '').trim();
    const assessment = (data.assessment || data.doctor_assessment || data.doctorAssessment || '').trim();
    const treatmentPlan = (data.treatment_plan || data.treatmentPlan || data.instructions || data.plan || '').trim();

    let noteText = (data.notes || data.note || '').trim();
    if (!noteText) {
      const parts = [];
      if (patientCondition) parts.push(`Condition: ${patientCondition}`);
      if (clinicalFindings) parts.push(`Findings: ${clinicalFindings}`);
      if (assessment) parts.push(`Assessment: ${assessment}`);
      if (treatmentPlan) parts.push(`Treatment Plan: ${treatmentPlan}`);
      noteText = parts.join('\n');
    }

    if (!noteText) {
      const err = new Error('Clinical progress note content cannot be empty.');
      err.code = 'EMPTY_NOTE';
      err.statusCode = 400;
      throw err;
    }

    const doctorId = user.id || user._id;
    let doctorName = user.name;
    if (!doctorName) {
      if (user.first_name || user.firstName) {
        doctorName = `Dr. ${user.first_name || user.firstName} ${user.last_name || user.lastName || ''}`.trim();
      } else {
        const d = (store.doctors || []).find(doc => doc.id === doctorId || doc._id === doctorId);
        if (d) doctorName = d.name || `Dr. ${d.first_name || ''} ${d.last_name || ''}`.trim();
        else {
          try {
            const { data: docData } = await supabase.from('doctors').select('first_name, last_name').eq('id', doctorId).maybeSingle();
            if (docData) doctorName = `Dr. ${docData.first_name} ${docData.last_name}`.trim();
          } catch (_) {}
        }
      }
    }
    if (!doctorName) doctorName = 'Dr. Doctor';

    const noteId = generateUUID();
    const nowIso = new Date().toISOString();
    const recordedAt = data.recorded_at || data.recordedAt || data.round_time || data.roundTime || nowIso;
    const vitals = data.vitals || null;
    const vitalFlags = calculateVitalFlags(vitals);
    const admNumber = admission.admission_number || admission.admissionNumber || (admission.id ? `IPD-${admission.id.slice(0, 8)}` : undefined);
    const patientId = admission.patient_id || admission.patientId || (admission.patient ? (admission.patient.id || admission.patient._id) : undefined);

    const noteRecord = {
      id: noteId,
      _id: noteId,
      admission_id: admissionId,
      admissionId,
      admission_number: admNumber,
      admissionNumber: admNumber,
      patient_id: patientId,
      patientId: patientId,
      clinic_id: clinicId,
      clinicId,
      doctor_id: doctorId,
      doctorId,
      doctor_name: doctorName,
      doctorName,
      clinician_name: doctorName,
      author_name: doctorName,
      note_type: data.noteType || data.note_type || 'Doctor Round',
      noteType: data.noteType || data.note_type || 'Doctor Round',
      clinical_findings: clinicalFindings || undefined,
      clinicalFindings: clinicalFindings || undefined,
      findings: clinicalFindings || undefined,
      patient_condition: patientCondition || undefined,
      patientCondition: patientCondition || undefined,
      assessment: assessment || undefined,
      treatment_plan: treatmentPlan || undefined,
      treatmentPlan: treatmentPlan || undefined,
      instructions: treatmentPlan || undefined,
      note: noteText,
      notes: noteText,
      vitals,
      vital_flags: vitalFlags,
      vitalFlags,
      is_voided: false,
      isVoided: false,
      amendments: [],
      recorded_at: recordedAt,
      recordedAt,
      created_at: nowIso,
      createdAt: nowIso,
      updated_at: nowIso,
      updatedAt: nowIso
    };

    if (!store.clinicalNotes) store.clinicalNotes = [];
    store.clinicalNotes.unshift(noteRecord);

    const storeAdm = store.admissions?.find(a => a.id === admissionId);
    if (storeAdm) {
      if (!storeAdm.clinicalNotes) storeAdm.clinicalNotes = [];
      storeAdm.clinicalNotes.push(noteRecord);
    }

    saveLocalStore(store);
    return noteRecord;
  },

  async getClinicalNotes(clinicId, user, admissionId) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }
      if (!nurse) {
        const otherNurse = (store.staff || []).find(s => s.id === nurseId || s._id === nurseId);
        if (otherNurse && otherNurse.clinic_id !== clinicId) {
          const err = new Error('Forbidden: Nurse belongs to a different clinic.');
          err.code = 'CROSS_CLINIC_FORBIDDEN';
          err.statusCode = 403;
          throw err;
        }
      }
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot access clinical notes.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }
    }

    let admission = store.admissions?.find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
              (na.nurse_id === nurseId || na.nurseId === nurseId) &&
              na.is_active !== false
      );
      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }
    }

    const notes = (store.clinicalNotes || [])
      .filter(n => (n.admission_id === admissionId || n.admissionId === admissionId) && (n.clinic_id === clinicId || n.clinicId === clinicId))
      .sort((a, b) => {
        const timeDiff = new Date(b.created_at || b.createdAt || 0).getTime() - new Date(a.created_at || a.createdAt || 0).getTime();
        if (timeDiff !== 0) return timeDiff;
        return String(b.id || b._id || '').localeCompare(String(a.id || a._id || ''));
      });

    return notes;
  },

  async updateClinicalNote(clinicId, user, admissionId, noteId, data) {
    await this.verifyClinicIpd(clinicId);
    if (user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    if (user && user.role === 'nurse') {
      const err = new Error('Forbidden: Nurses cannot edit or void doctor clinical notes.');
      err.code = 'FORBIDDEN_NOTE_EDIT';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    if (!store.clinicalNotes) store.clinicalNotes = [];
    const note = store.clinicalNotes.find(n => (n.id === noteId || n._id === noteId) && (n.admission_id === admissionId || n.admissionId === admissionId));

    if (!note) {
      const err = new Error('Clinical note not found.');
      err.code = 'NOTE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const userId = user.id || user._id;
    const isAuthor = String(note.doctor_id || note.doctorId) === String(userId);
    const isAdmin = user.role === 'admin' || user.role === 'clinic';

    if (!isAuthor && !isAdmin) {
      const err = new Error('Forbidden: You can only edit or void your own clinical notes.');
      err.code = 'FORBIDDEN_NOTE_EDIT';
      err.statusCode = 403;
      throw err;
    }

    const nowIso = new Date().toISOString();

    // Resolve human-readable author name while preserving actor ID
    let resolvedActorName = user.name;
    if (!resolvedActorName && (user.first_name || user.firstName)) {
      resolvedActorName = `Dr. ${user.first_name || user.firstName} ${user.last_name || user.lastName || ''}`.trim();
    }
    if (!resolvedActorName) {
      const d = (store.doctors || []).find(doc => doc.id === userId || doc._id === userId);
      if (d) resolvedActorName = d.name || `Dr. ${d.first_name || ''} ${d.last_name || ''}`.trim();
    }

    if (data.isVoided || data.action === 'void') {
      const voidReason = (data.voidReason || data.reason || '').trim();
      if (!voidReason) {
        const err = new Error('A reason for voiding this clinical note is required.');
        err.code = 'MISSING_VOID_REASON';
        err.statusCode = 400;
        throw err;
      }

      const previousState = {
        note: note.note,
        vitals: note.vitals,
        is_voided: note.is_voided,
        timestamp: nowIso,
        actorId: userId,
        actor_id: userId,
        modifiedBy: resolvedActorName || userId,
        amendedBy: resolvedActorName || userId,
        amended_by: resolvedActorName || userId,
        amended_at: nowIso,
        action: 'void',
        reason: voidReason
      };
      if (!note.amendments) note.amendments = [];
      note.amendments.push(previousState);

      note.is_voided = true;
      note.isVoided = true;
      note.void_reason = voidReason;
      note.voidReason = voidReason;
      note.voided_at = nowIso;
      note.voidedAt = nowIso;
      note.voided_by = userId;
      note.voidedBy = userId;
      note.voided_by_name = resolvedActorName || undefined;
      note.voidedByName = resolvedActorName || undefined;
      note.updated_at = nowIso;
      note.updatedAt = nowIso;
    } else {
      const amendmentReason = (data.correctionReason || data.reason || '').trim();
      if (!amendmentReason) {
        const err = new Error('A reason for amending this clinical note is required.');
        err.code = 'MISSING_AMENDMENT_REASON';
        err.statusCode = 400;
        throw err;
      }

      const updatedText = (data.notes || data.note || note.note).trim();
      if (!updatedText) {
        const err = new Error('Amended clinical note text cannot be empty.');
        err.code = 'EMPTY_NOTE';
        err.statusCode = 400;
        throw err;
      }

      const previousState = {
        note: note.note,
        vitals: note.vitals,
        clinical_findings: note.clinical_findings,
        patient_condition: note.patient_condition,
        treatment_plan: note.treatment_plan,
        updatedAt: note.updated_at || note.created_at,
        timestamp: nowIso,
        actorId: userId,
        actor_id: userId,
        modifiedBy: resolvedActorName || userId,
        amendedBy: resolvedActorName || userId,
        amended_by: resolvedActorName || userId,
        amended_at: nowIso,
        action: 'amend',
        reason: amendmentReason
      };

      if (!note.amendments) note.amendments = [];
      note.amendments.push(previousState);

      note.note = updatedText;
      note.notes = updatedText;

      if (data.clinical_findings !== undefined || data.findings !== undefined) {
        note.clinical_findings = (data.clinical_findings || data.findings || '').trim() || undefined;
        note.findings = note.clinical_findings;
      }
      if (data.patient_condition !== undefined || data.patientCondition !== undefined) {
        note.patient_condition = (data.patient_condition || data.patientCondition || '').trim() || undefined;
        note.patientCondition = note.patient_condition;
      }
      if (data.treatment_plan !== undefined || data.treatmentPlan !== undefined || data.instructions !== undefined) {
        note.treatment_plan = (data.treatment_plan || data.treatmentPlan || data.instructions || '').trim() || undefined;
        note.treatmentPlan = note.treatment_plan;
      }

      if (data.vitals !== undefined) {
        if (data.vitals) {
          if (data.vitals.pulse !== undefined && data.vitals.pulse !== null && !isNaN(Number(data.vitals.pulse))) {
            const p = Number(data.vitals.pulse);
            if (p < 10 || p > 350) {
              const err = new Error('Pulse reading must be between 10 and 350 bpm.');
              err.code = 'INVALID_VITAL';
              err.statusCode = 400;
              throw err;
            }
          }
          if (data.vitals.spo2 !== undefined && data.vitals.spo2 !== null && !isNaN(Number(data.vitals.spo2))) {
            const s = Number(data.vitals.spo2);
            if (s < 0 || s > 100) {
              const err = new Error('SpO2 reading must be between 0 and 100%.');
              err.code = 'INVALID_VITAL';
              err.statusCode = 400;
              throw err;
            }
          }
          if (data.vitals.temperature !== undefined && data.vitals.temperature !== null && !isNaN(Number(data.vitals.temperature))) {
            const t = Number(data.vitals.temperature);
            if (t < 60 || t > 120) {
              const err = new Error('Temperature reading must be between 60 and 120°F.');
              err.code = 'INVALID_VITAL';
              err.statusCode = 400;
              throw err;
            }
          }
        }
        note.vitals = data.vitals;
        note.vital_flags = calculateVitalFlags(data.vitals);
        note.vitalFlags = note.vital_flags;
      }
      note.updated_at = nowIso;
      note.updatedAt = nowIso;
    }

    const storeAdm = store.admissions?.find(a => a.id === admissionId);
    if (storeAdm && storeAdm.clinicalNotes) {
      const idx = storeAdm.clinicalNotes.findIndex(n => n.id === noteId);
      if (idx !== -1) {
        storeAdm.clinicalNotes[idx] = note;
      }
    }

    saveLocalStore(store);
    return note;
  },

  // 12. Delete Entity with dependency and reference checks
  async deleteEntity(clinicId, entityType, id) {
    await this.verifyClinicIpd(clinicId);
    const store = getLocalStore();

    if (entityType === 'bed') {
      let bed = store.beds.find(b => b.id === id && b.clinic_id === clinicId);
      if (!bed) {
        try {
          const { data } = await supabase.from('beds').select('*').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
          if (data) bed = data;
        } catch (_) {}
      }
      if (!bed) {
        const err = new Error('Bed not found.');
        err.statusCode = 404;
        throw err;
      }

      // Check if bed is currently occupied
      if (bed.status === 'OCCUPIED') {
        const err = new Error('Cannot delete an OCCUPIED bed. Discharge or transfer patient first.');
        err.statusCode = 400;
        throw err;
      }

      // Check for admission references
      let hasAdmissions = false;
      try {
        const { data: admData } = await supabase.from('ipd_admissions').select('id').eq('bed_id', id).eq('clinic_id', clinicId).limit(1);
        if (admData && admData.length > 0) hasAdmissions = true;
      } catch (_) {}
      if (!hasAdmissions) {
        hasAdmissions = store.admissions.some(a => (a.bed_id === id || a.bedId === id) && a.clinic_id === clinicId);
      }

      // Check for history/audit references (transitions beyond initial bed registration)
      let hasMeaningfulHistory = false;
      try {
        const { data: histData } = await supabase.from('bed_status_history').select('*').eq('bed_id', id).eq('clinic_id', clinicId);
        if (histData && histData.length > 0) {
          hasMeaningfulHistory = histData.some(h => h.reason !== 'Initial bed registration' || h.previous_status !== null);
        }
      } catch (_) {}
      if (!hasMeaningfulHistory) {
        const localHist = (store.bedHistory || []).filter(h => h.bed_id === id && h.clinic_id === clinicId);
        hasMeaningfulHistory = localHist.some(h => h.reason !== 'Initial bed registration' || h.previous_status !== null);
      }

      // If the bed HAS historical references: do NOT physically delete. Deactivate instead!
      if (hasAdmissions || hasMeaningfulHistory) {
        const deactResult = await this.deactivateEntity(clinicId, 'bed', id);
        return {
          deleted: false,
          deactivated: true,
          status: 'BLOCKED',
          message: 'This bed cannot be permanently deleted because historical records exist. It has been safely deactivated and set to Blocked instead.'
        };
      }

      // Unused bed: allow physical deletion
      try {
        await supabase.from('bed_status_history').delete().eq('bed_id', id).eq('clinic_id', clinicId);
        await supabase.from('beds').delete().eq('id', id).eq('clinic_id', clinicId);
      } catch (_) {}

      store.beds = store.beds.filter(b => !(b.id === id && b.clinic_id === clinicId));
      store.bedHistory = store.bedHistory.filter(h => !(h.bed_id === id && h.clinic_id === clinicId));
      saveLocalStore(store);

      return {
        deleted: true,
        deactivated: false,
        message: 'Bed permanently deleted successfully.'
      };
    }

    if (entityType === 'room') {
      let roomBeds = store.beds.filter(b => b.room_id === id && b.clinic_id === clinicId);
      if (roomBeds.length === 0) {
        try {
          const { data } = await supabase.from('beds').select('id').eq('room_id', id).eq('clinic_id', clinicId);
          if (data && data.length > 0) roomBeds = data;
        } catch (_) {}
      }
      if (roomBeds.length > 0) {
        const err = new Error('This room contains beds and cannot be deleted. Deactivate it instead.');
        err.statusCode = 400;
        err.code = 'HAS_CHILDREN';
        throw err;
      }

      try { await supabase.from('rooms').delete().eq('id', id).eq('clinic_id', clinicId); } catch (_) {}
      store.rooms = store.rooms.filter(r => !(r.id === id && r.clinic_id === clinicId));
      saveLocalStore(store);
      return { deleted: true, message: 'Room permanently deleted successfully.' };
    }

    if (entityType === 'ward') {
      let wardRooms = store.rooms.filter(r => r.ward_id === id && r.clinic_id === clinicId);
      if (wardRooms.length === 0) {
        try {
          const { data } = await supabase.from('rooms').select('id').eq('ward_id', id).eq('clinic_id', clinicId);
          if (data && data.length > 0) wardRooms = data;
        } catch (_) {}
      }
      if (wardRooms.length > 0) {
        const err = new Error('This ward contains rooms/beds and cannot be deleted. Deactivate it instead.');
        err.statusCode = 400;
        err.code = 'HAS_CHILDREN';
        throw err;
      }

      try { await supabase.from('wards').delete().eq('id', id).eq('clinic_id', clinicId); } catch (_) {}
      store.wards = store.wards.filter(w => !(w.id === id && w.clinic_id === clinicId));
      saveLocalStore(store);
      return { deleted: true, message: 'Ward permanently deleted successfully.' };
    }

    if (entityType === 'floor') {
      let floorWards = store.wards.filter(w => w.floor_id === id && w.clinic_id === clinicId);
      if (floorWards.length === 0) {
        try {
          const { data } = await supabase.from('wards').select('id').eq('floor_id', id).eq('clinic_id', clinicId);
          if (data && data.length > 0) floorWards = data;
        } catch (_) {}
      }
      if (floorWards.length > 0) {
        const err = new Error('This floor contains wards and cannot be deleted. Deactivate it instead.');
        err.statusCode = 400;
        err.code = 'HAS_CHILDREN';
        throw err;
      }

      try { await supabase.from('floors').delete().eq('id', id).eq('clinic_id', clinicId); } catch (_) {}
      store.floors = store.floors.filter(f => !(f.id === id && f.clinic_id === clinicId));
      saveLocalStore(store);
      return { deleted: true, message: 'Floor permanently deleted successfully.' };
    }

    if (entityType === 'building') {
      let bldFloors = store.floors.filter(f => f.building_id === id && f.clinic_id === clinicId);
      if (bldFloors.length === 0) {
        try {
          const { data } = await supabase.from('floors').select('id').eq('building_id', id).eq('clinic_id', clinicId);
          if (data && data.length > 0) bldFloors = data;
        } catch (_) {}
      }
      if (bldFloors.length > 0) {
        const err = new Error('This building contains floors and cannot be deleted. Deactivate it instead.');
        err.statusCode = 400;
        err.code = 'HAS_CHILDREN';
        throw err;
      }

      try { await supabase.from('buildings').delete().eq('id', id).eq('clinic_id', clinicId); } catch (_) {}
      store.buildings = store.buildings.filter(b => !(b.id === id && b.clinic_id === clinicId));
      saveLocalStore(store);
      return { deleted: true, message: 'Building permanently deleted successfully.' };
    }

    throw new Error('Invalid entityType for deletion');
  },

  // 16. Nursing Notes CRUD
  async addNursingNote(clinicId, user, admissionId, data) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();
    const nurseId = user.id || user._id;

    let nurse = null;
    if (user.role === 'nurse') {
      nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }
      if (!nurse) {
        const otherNurse = (store.staff || []).find(s => s.id === nurseId || s._id === nurseId);
        if (otherNurse && otherNurse.clinic_id !== clinicId) {
          const err = new Error('Forbidden: Nurse belongs to a different clinic.');
          err.code = 'CROSS_CLINIC_FORBIDDEN';
          err.statusCode = 403;
          throw err;
        }
      }
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot record nursing notes.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }
    }

    let admission = store.admissions?.find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if ((admission.status || '').toLowerCase() === 'discharged') {
      const err = new Error('Cannot record nursing notes on a discharged admission.');
      err.code = 'ADMISSION_ALREADY_DISCHARGED';
      err.statusCode = 400;
      throw err;
    }

    if (user.role === 'nurse') {
      const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
              (na.nurse_id === nurseId || na.nurseId === nurseId) &&
              na.is_active !== false
      );
      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }
    }

    const nursingObs = (data.nursing_observations || data.nursingObservations || data.observations || '').trim();
    const patientCond = (data.patient_condition || data.patientCondition || '').trim();
    const interventions = (data.interventions || data.care_provided || data.careProvided || '').trim();
    const handover = (data.handover_notes || data.handoverNotes || data.follow_up_notes || '').trim();

    let noteText = (data.notes || data.note || '').trim();
    if (!noteText) {
      const parts = [];
      if (patientCond) parts.push(`Condition: ${patientCond}`);
      if (nursingObs) parts.push(`Observations: ${nursingObs}`);
      if (interventions) parts.push(`Care / Interventions: ${interventions}`);
      if (handover) parts.push(`Follow-up / Handover: ${handover}`);
      noteText = parts.join('\n');
    }

    if (!noteText && !nursingObs && !patientCond && !interventions) {
      const err = new Error('Nursing note content cannot be empty.');
      err.code = 'EMPTY_NOTE';
      err.statusCode = 400;
      throw err;
    }

    let nurseName = user.name;
    if (!nurseName) {
      if (user.first_name || user.firstName) {
        nurseName = `${user.first_name || user.firstName} ${user.last_name || user.lastName || ''}`.trim();
      } else if (nurse) {
        nurseName = `${nurse.first_name || ''} ${nurse.last_name || ''}`.trim();
      }
    }
    if (!nurseName) nurseName = 'Nurse';

    const noteId = generateUUID();
    const nowIso = new Date().toISOString();
    const recordedAt = data.recorded_at || data.recordedAt || nowIso;
    const admNumber = admission.admission_number || admission.admissionNumber || (admission.id ? `IPD-${admission.id.slice(0, 8)}` : undefined);
    const patientId = admission.patient_id || admission.patientId || (admission.patient ? (admission.patient.id || admission.patient._id) : undefined);

    const noteRecord = {
      id: noteId,
      _id: noteId,
      admission_id: admissionId,
      admissionId,
      admission_number: admNumber,
      admissionNumber: admNumber,
      patient_id: patientId,
      patientId,
      clinic_id: clinicId,
      clinicId,
      nurse_id: nurseId,
      nurseId,
      nurse_name: nurseName,
      nurseName,
      author_id: nurseId,
      author_name: nurseName,
      author_role: 'nurse',
      note_type: data.note_type || data.noteType || 'Nursing Note',
      noteType: data.note_type || data.noteType || 'Nursing Note',
      nursing_observations: nursingObs || undefined,
      nursingObservations: nursingObs || undefined,
      observations: nursingObs || undefined,
      patient_condition: patientCond || undefined,
      patientCondition: patientCond || undefined,
      interventions: interventions || undefined,
      care_provided: interventions || undefined,
      handover_notes: handover || undefined,
      handoverNotes: handover || undefined,
      follow_up_notes: handover || undefined,
      note: noteText,
      notes: noteText,
      vitals: data.vitals || null,
      recorded_at: recordedAt,
      recordedAt,
      created_at: nowIso,
      createdAt: nowIso,
      updated_at: nowIso,
      updatedAt: nowIso
    };

    if (!store.nursingNotes) store.nursingNotes = [];
    store.nursingNotes.unshift(noteRecord);

    const storeAdm = store.admissions?.find(a => a.id === admissionId || a._id === admissionId);
    if (storeAdm) {
      if (!storeAdm.nursingNotes) storeAdm.nursingNotes = [];
      storeAdm.nursingNotes.push(noteRecord);
    }

    saveLocalStore(store);
    return noteRecord;
  },

  async getNursingNotes(clinicId, user, admissionId) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    let admission = store.admissions?.find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      const nurse = (store.staff || []).find(s => s.id === nurseId || s._id === nurseId);
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot access nursing records.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }

      const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
              (na.nurse_id === nurseId || na.nurseId === nurseId) &&
              na.is_active !== false
      );
      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }
    }

    const notes = (store.nursingNotes || [])
      .filter(n => (n.admission_id === admissionId || n.admissionId === admissionId) &&
                   (n.clinic_id === clinicId || n.clinicId === clinicId))
      .sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at));

    return notes;
  },


  // 17. Nurse Vitals Recording & History
  async addNurseVitals(clinicId, user, admissionId, data) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();
    const nurseId = user.id || user._id;

    let nurse = null;
    if (user.role === 'nurse') {
      nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot record vital observations.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }
    }

    let admission = store.admissions?.find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if ((admission.status || '').toLowerCase() === 'discharged') {
      const err = new Error('Cannot record vital observations on a discharged admission.');
      err.code = 'ADMISSION_ALREADY_DISCHARGED';
      err.statusCode = 400;
      throw err;
    }

    if (user.role === 'nurse') {
      const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
              (na.nurse_id === nurseId || na.nurseId === nurseId) &&
              na.is_active !== false
      );
      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }
    }

    // Determine patient context (age/DOB) for reference ranges
    let patientContext = { isAdult: false };
    const patientId = admission.patient_id || admission.patientId || (admission.patient?.id);
    let patient = (store.patients || []).find(p => p.id === patientId || p._id === patientId);
    if (!patient && admission.patient) patient = admission.patient;
    if (!patient && patientId) {
      try {
        const { data: dbPat } = await supabase.from('patients').select('*').eq('id', patientId).maybeSingle();
        if (dbPat) {
          patient = dbPat;
          if (!store.patients) store.patients = [];
          if (!store.patients.some(pt => pt.id === dbPat.id)) store.patients.push(dbPat);
        }
      } catch (_) {}
    }

    if (patient) {
      if (patient.age !== undefined && patient.age !== null) {
        patientContext.age = Number(patient.age);
        patientContext.isAdult = patientContext.age >= 18;
      } else if (patient.date_of_birth || patient.dateOfBirth) {
        patientContext.dateOfBirth = patient.date_of_birth || patient.dateOfBirth;
        const dob = new Date(patientContext.dateOfBirth);
        if (!isNaN(dob.getTime())) {
          const ageDiff = Date.now() - dob.getTime();
          const calculatedAge = Math.abs(new Date(ageDiff).getUTCFullYear() - 1970);
          patientContext.age = calculatedAge;
          patientContext.isAdult = calculatedAge >= 18;
        }
      } else if (patient.isAdult === true) {
        patientContext.isAdult = true;
      }
    }

    // Evaluate vitals
    const evaluation = evaluateVitals(data, patientContext);

    let nurseName = user.name;
    if (!nurseName) {
      if (user.first_name || user.firstName) {
        nurseName = `${user.first_name || user.firstName} ${user.last_name || user.lastName || ''}`.trim();
      } else if (nurse) {
        nurseName = `${nurse.first_name || ''} ${nurse.last_name || ''}`.trim();
      }
    }
    if (!nurseName) nurseName = 'Nurse';

    const vitalId = generateUUID();
    const nowIso = new Date().toISOString();
    const admNumber = admission.admission_number || admission.admissionNumber || (admission.id ? `IPD-${admission.id.slice(0, 8)}` : undefined);

    const vitalRecord = {
      id: vitalId,
      _id: vitalId,
      admission_id: admissionId,
      admissionId,
      admission_number: admNumber,
      admissionNumber: admNumber,
      patient_id: patientId,
      patientId,
      clinic_id: clinicId,
      clinicId,
      nurse_id: nurseId,
      nurseId,
      nurse_name: nurseName,
      nurseName,
      author_id: nurseId,
      author_name: nurseName,
      author_role: 'nurse',
      recorded_by: nurseName,
      recordedBy: nurseName,
      recorded_role: 'nurse',
      recordedRole: 'nurse',
      values: {
        bp_systolic: data.bp_systolic !== undefined && data.bp_systolic !== null ? Number(data.bp_systolic) : null,
        bp_diastolic: data.bp_diastolic !== undefined && data.bp_diastolic !== null ? Number(data.bp_diastolic) : null,
        bp: (data.bp_systolic && data.bp_diastolic) ? `${data.bp_systolic}/${data.bp_diastolic}` : (data.bp || null),
        pulse: data.pulse !== undefined && data.pulse !== null && data.pulse !== '' ? Number(data.pulse) : null,
        temperature: data.temperature !== undefined && data.temperature !== null && data.temperature !== '' ? Number(data.temperature) : null,
        temperature_unit: (data.temperature_unit || 'C').toUpperCase(),
        respiratory_rate: data.respiratory_rate !== undefined && data.respiratory_rate !== null && data.respiratory_rate !== '' ? Number(data.respiratory_rate) : null,
        spo2: data.spo2 !== undefined && data.spo2 !== null && data.spo2 !== '' ? Number(data.spo2) : null,
        blood_glucose: data.blood_glucose !== undefined && data.blood_glucose !== null && data.blood_glucose !== '' ? Number(data.blood_glucose) : null,
        glucose_context: data.glucose_context || null,
        pain_score: data.pain_score !== undefined && data.pain_score !== null && data.pain_score !== '' ? Number(data.pain_score) : null,
        weight: data.weight !== undefined && data.weight !== null && data.weight !== '' ? Number(data.weight) : null
      },
      evaluations: evaluation.evaluations,
      has_critical: evaluation.has_critical,
      has_abnormal: evaluation.has_abnormal,
      recorded_at: data.recorded_at || data.recordedAt || nowIso,
      recordedAt: data.recorded_at || data.recordedAt || nowIso,
      created_at: nowIso,
      createdAt: nowIso
    };

    if (!store.nurseVitals) store.nurseVitals = [];
    store.nurseVitals.unshift(vitalRecord);

    const storeAdm = store.admissions?.find(a => a.id === admissionId || a._id === admissionId);
    if (storeAdm) {
      if (!storeAdm.nurseVitals) storeAdm.nurseVitals = [];
      storeAdm.nurseVitals.push(vitalRecord);
    }

    saveLocalStore(store);
    return vitalRecord;
  },

  async getNurseVitals(clinicId, user, admissionId) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    let admission = store.admissions?.find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      const nurse = (store.staff || []).find(s => s.id === nurseId || s._id === nurseId);
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot access vital records.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }

      const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
              (na.nurse_id === nurseId || na.nurseId === nurseId) &&
              na.is_active !== false
      );
      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }
    }

    const vitals = (store.nurseVitals || [])
      .filter(v => (v.admission_id === admissionId || v.admissionId === admissionId) &&
                   (v.clinic_id === clinicId || v.clinicId === clinicId))
      .sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at));

    // Ensure evaluations are up-to-date if patient context is now resolved
    let patient = (store.patients || []).find(p => p.id === admission.patient_id || p._id === admission.patient_id);
    if (!patient && admission.patient) patient = admission.patient;
    if (!patient && admission.patient_id) {
      try {
        const { data: dbPat } = await supabase.from('patients').select('*').eq('id', admission.patient_id).maybeSingle();
        if (dbPat) {
          patient = dbPat;
          if (!store.patients) store.patients = [];
          if (!store.patients.some(pt => pt.id === dbPat.id)) store.patients.push(dbPat);
        }
      } catch (_) {}
    }
    const patContext = { isAdult: false };
    if (patient) {
      if (patient.age !== undefined && patient.age !== null) {
        patContext.age = Number(patient.age);
        patContext.isAdult = patContext.age >= 18;
      } else if (patient.date_of_birth || patient.dateOfBirth) {
        patContext.dateOfBirth = patient.date_of_birth || patient.dateOfBirth;
        const dob = new Date(patContext.dateOfBirth);
        if (!isNaN(dob.getTime())) {
          const ageDiff = Date.now() - dob.getTime();
          const calculatedAge = Math.abs(new Date(ageDiff).getUTCFullYear() - 1970);
          patContext.age = calculatedAge;
          patContext.isAdult = calculatedAge >= 18;
        }
      } else if (patient.isAdult === true) {
        patContext.isAdult = true;
      }
    }

    if (patContext.isAdult || patContext.age !== undefined) {
      for (const v of vitals) {
        const hasEvaluations = v.evaluations && Object.keys(v.evaluations).length > 0;
        const allUnconfigured = hasEvaluations && Object.values(v.evaluations).every(e => e?.status === STATUS.NOT_CONFIGURED);
        if (!hasEvaluations || allUnconfigured) {
          const reEval = evaluateVitals(v.values || {}, patContext);
          v.evaluations = reEval.evaluations;
          v.has_critical = reEval.has_critical;
          v.has_abnormal = reEval.has_abnormal;
        }
      }
    }

    return vitals;
  },


  // 18. Inpatient Fluid Intake / Output (I/O) Charting
  async addIntakeOutput(clinicId, user, admissionId, data) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    if (!user || user.role !== 'nurse') {
      const err = new Error('Forbidden: Only active bedside nurses can record fluid intake/output entries.');
      err.code = 'FORBIDDEN_ROLE';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();
    const nurseId = user.id || user._id;

    let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
    if (!nurse) {
      try {
        const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
        if (dbNurse) nurse = dbNurse;
      } catch (_) {}
    }
    if (nurse && nurse.status !== 'active') {
      const err = new Error('Forbidden: Inactive nurse cannot record fluid intake/output observations.');
      err.code = 'NURSE_INACTIVE';
      err.statusCode = 403;
      throw err;
    }

    let admission = store.admissions?.find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if ((admission.status || '').toLowerCase() === 'discharged') {
      const err = new Error('Cannot record fluid intake/output observations on a discharged admission.');
      err.code = 'ADMISSION_ALREADY_DISCHARGED';
      err.statusCode = 400;
      throw err;
    }

    const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
    const hasActiveAssignment = (store.nurseAssignments || []).some(
      na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
            (na.nurse_id === nurseId || na.nurseId === nurseId) &&
            na.is_active !== false
    );
    if (!isAssigned && !hasActiveAssignment) {
      const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
      err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
      err.statusCode = 403;
      throw err;
    }

    // Direction validation
    const rawDir = (data.direction || '').trim().toLowerCase();
    if (rawDir !== 'intake' && rawDir !== 'output') {
      const err = new Error('Direction must be either "intake" or "output".');
      err.code = 'INVALID_DIRECTION';
      err.statusCode = 400;
      throw err;
    }

    // Category validation
    const normCategory = normalizeIoCategory(rawDir, data.category);
    if (!normCategory) {
      const err = new Error(`Invalid category "${data.category}" for direction "${rawDir}".`);
      err.code = 'INVALID_CATEGORY';
      err.statusCode = 400;
      throw err;
    }

    // Amount validation: strictly positive measurable number
    const rawAmt = data.amount !== undefined ? data.amount : data.amount_ml;
    if (rawAmt === undefined || rawAmt === null || rawAmt === '' || isNaN(Number(rawAmt))) {
      const err = new Error('A positive measurable fluid amount in mL is required.');
      err.code = 'INVALID_AMOUNT';
      err.statusCode = 400;
      throw err;
    }
    const amt = Number(rawAmt);
    if (amt <= 0 || !isFinite(amt)) {
      const err = new Error('Amount must be a positive number greater than zero.');
      err.code = 'INVALID_AMOUNT';
      err.statusCode = 400;
      throw err;
    }

    // Timestamp validation
    const nowIso = new Date().toISOString();
    let recordedAt = data.recorded_at || data.recordedAt || nowIso;
    if (isNaN(Date.parse(recordedAt))) {
      const err = new Error('Invalid recorded date/time timestamp.');
      err.code = 'INVALID_TIMESTAMP';
      err.statusCode = 400;
      throw err;
    }

    // Duplicate submission prevention: check for identical entry within 3 seconds
    if (!store.intakeOutputs) store.intakeOutputs = [];
    const recentDuplicate = store.intakeOutputs.find(e =>
      (e.admission_id === admissionId || e.admissionId === admissionId) &&
      e.direction === rawDir &&
      e.category === normCategory &&
      Number(e.amount) === amt &&
      e.nurse_id === nurseId &&
      !e.is_voided &&
      Math.abs(new Date(e.created_at || e.recorded_at).getTime() - new Date(nowIso).getTime()) < 3000
    );
    if (recentDuplicate) {
      return recentDuplicate;
    }

    let nurseName = user.name || (nurse && (nurse.name || nurse.fullName));
    if (!nurseName && (user.first_name || user.firstName)) {
      nurseName = `${user.first_name || user.firstName} ${user.last_name || user.lastName || ''}`.trim();
    }
    if (!nurseName && nurse) {
      nurseName = `${nurse.first_name || ''} ${nurse.last_name || ''}`.trim();
    }
    if (!nurseName) nurseName = 'Staff Nurse';

    const entryId = generateUUID();
    const admNumber = admission.admission_number || admission.admissionNumber || (admission.id ? `IPD-${admission.id.slice(0, 8)}` : undefined);
    const patientId = admission.patient_id || admission.patientId || (admission.patient?.id);

    const remarks = (data.remarks || data.notes || '').trim() || null;

    const entryRecord = {
      id: entryId,
      _id: entryId,
      admission_id: admissionId,
      admissionId,
      admission_number: admNumber,
      admissionNumber: admNumber,
      patient_id: patientId,
      patientId,
      clinic_id: clinicId,
      clinicId,
      direction: rawDir,
      category: normCategory,
      amount: amt,
      amount_ml: amt,
      amountMl: amt,
      unit: 'mL',
      recorded_at: recordedAt,
      recordedAt,
      nurse_id: nurseId,
      nurseId,
      nurse_name: nurseName,
      nurseName,
      author_id: nurseId,
      author_name: nurseName,
      author_role: 'nurse',
      recorded_by: nurseName,
      recordedBy: nurseName,
      recorded_role: 'nurse',
      recordedRole: 'nurse',
      remarks,
      notes: remarks,
      is_voided: false,
      isVoided: false,
      amendments: [],
      created_at: nowIso,
      createdAt: nowIso,
      updated_at: nowIso,
      updatedAt: nowIso
    };

    store.intakeOutputs.unshift(entryRecord);

    const storeAdm = store.admissions?.find(a => a.id === admissionId || a._id === admissionId);
    if (storeAdm) {
      if (!storeAdm.intakeOutputs) storeAdm.intakeOutputs = [];
      storeAdm.intakeOutputs.push(entryRecord);
    }

    saveLocalStore(store);
    return entryRecord;
  },

  async getIntakeOutput(clinicId, user, admissionId, queryDate) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    let admission = store.admissions?.find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      const nurse = (store.staff || []).find(s => s.id === nurseId || s._id === nurseId);
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot access fluid intake/output records.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }

      const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
              (na.nurse_id === nurseId || na.nurseId === nurseId) &&
              na.is_active !== false
      );
      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }
    }

    const entries = (store.intakeOutputs || [])
      .filter(e => (e.admission_id === admissionId || e.admissionId === admissionId) &&
                   (e.clinic_id === clinicId || e.clinicId === clinicId))
      .sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at));

    const targetDate = queryDate && queryDate !== 'all'
      ? queryDate
      : (entries[0]?.recorded_at ? entries[0].recorded_at.slice(0, 10) : new Date().toISOString().slice(0, 10));

    const summary = calculateFluidTotals(entries, targetDate);
    const overallSummary = calculateFluidTotals(entries, 'all');

    const availableDates = [...new Set(entries.map(e => (e.recorded_at || e.created_at || '').slice(0, 10)).filter(Boolean))];

    return {
      entries,
      summary,
      overallSummary,
      targetDate,
      availableDates
    };
  },

  async updateIntakeOutput(clinicId, user, admissionId, entryId, data) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    if (user && user.role !== 'nurse' && user.role !== 'admin' && user.role !== 'clinic') {
      const err = new Error('Forbidden: Only active bedside nurses can correct or void fluid records.');
      err.code = 'FORBIDDEN_ROLE';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    let admission = store.admissions?.find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const nurseId = user.id || user._id;
    let nurse = null;
    if (user.role === 'nurse') {
      nurse = (store.staff || []).find(s => s.id === nurseId || s._id === nurseId);
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot amend or void fluid records.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }
      const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
              (na.nurse_id === nurseId || na.nurseId === nurseId) &&
              na.is_active !== false
      );
      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }
    }

    const entry = (store.intakeOutputs || []).find(e =>
      (e.id === entryId || e._id === entryId) &&
      (e.admission_id === admissionId || e.admissionId === admissionId) &&
      (e.clinic_id === clinicId || e.clinicId === clinicId)
    );

    if (!entry) {
      const err = new Error('Fluid intake/output record not found.');
      err.code = 'ENTRY_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const nowIso = new Date().toISOString();
    let actorName = user.name || (nurse && (nurse.name || nurse.fullName));
    if (!actorName && (user.first_name || user.firstName)) {
      actorName = `${user.first_name || user.firstName} ${user.last_name || user.lastName || ''}`.trim();
    }
    if (!actorName && nurse) {
      actorName = `${nurse.first_name || ''} ${nurse.last_name || ''}`.trim();
    }
    if (!actorName) actorName = 'Staff Nurse';

    const isVoid = data.isVoided === true || data.action === 'void';
    if (isVoid) {
      const voidReason = (data.voidReason || data.reason || '').trim();
      if (!voidReason) {
        const err = new Error('A reason for voiding this fluid entry is required.');
        err.code = 'MISSING_VOID_REASON';
        err.statusCode = 400;
        throw err;
      }

      const prev = {
        amount: entry.amount,
        category: entry.category,
        direction: entry.direction,
        recorded_at: entry.recorded_at,
        remarks: entry.remarks,
        is_voided: entry.is_voided,
        actorId: nurseId,
        actor_id: nurseId,
        actorName,
        actor_name: actorName,
        action: 'void',
        reason: voidReason,
        timestamp: nowIso
      };
      if (!entry.amendments) entry.amendments = [];
      entry.amendments.push(prev);

      entry.is_voided = true;
      entry.isVoided = true;
      entry.void_reason = voidReason;
      entry.voidReason = voidReason;
      entry.voided_at = nowIso;
      entry.voidedAt = nowIso;
      entry.voided_by = nurseId;
      entry.voidedBy = nurseId;
      entry.voided_by_name = actorName;
      entry.voidedByName = actorName;
      entry.updated_at = nowIso;
      entry.updatedAt = nowIso;
    } else {
      // Correction / amendment
      const correctionReason = (data.correctionReason || data.reason || '').trim();
      if (!correctionReason) {
        const err = new Error('A reason for correcting this fluid entry is required.');
        err.code = 'MISSING_CORRECTION_REASON';
        err.statusCode = 400;
        throw err;
      }

      const prev = {
        amount: entry.amount,
        category: entry.category,
        direction: entry.direction,
        remarks: entry.remarks,
        recorded_at: entry.recorded_at,
        actorId: nurseId,
        actor_id: nurseId,
        actorName,
        actor_name: actorName,
        action: 'correct',
        reason: correctionReason,
        timestamp: nowIso
      };
      if (!entry.amendments) entry.amendments = [];
      entry.amendments.push(prev);

      if (data.amount !== undefined && data.amount !== null && data.amount !== '') {
        const amt = Number(data.amount);
        if (isNaN(amt) || amt <= 0 || !isFinite(amt)) {
          const err = new Error('Corrected amount must be a positive number in mL.');
          err.code = 'INVALID_AMOUNT';
          err.statusCode = 400;
          throw err;
        }
        entry.amount = amt;
        entry.amount_ml = amt;
        entry.amountMl = amt;
      }

      if (data.category) {
        const norm = normalizeIoCategory(entry.direction, data.category);
        if (norm) entry.category = norm;
      }

      if (data.remarks !== undefined) {
        entry.remarks = data.remarks;
        entry.notes = data.remarks;
      }

      entry.updated_at = nowIso;
      entry.updatedAt = nowIso;
    }

    saveLocalStore(store);
    return entry;
  },


  calculateVitalsSchedule(admission, latestObservation) {
    const schedule = admission.vitals_schedule || admission.vitalsSchedule || null;
    const frequency = schedule?.frequency || null;
    let frequencyHours = schedule?.frequencyHours || null;
    if (!frequencyHours && frequency && frequency !== 'none') {
      const parsed = parseInt(frequency, 10);
      if (!isNaN(parsed) && parsed > 0) frequencyHours = parsed;
    }

    const lastObsTime = latestObservation?.recorded_at || latestObservation?.recordedAt || null;
    const lastObsBy = latestObservation?.nurse_name || latestObservation?.recorded_by || latestObservation?.doctor_name || null;

    const earlyWarningScore = {
      isConfigured: false,
      status: 'EARLY_WARNING_SCORE_NOT_CONFIGURED',
      label: 'Early-warning score not configured',
      protocol: null,
      message: 'No validated early-warning scoring protocol (e.g. NEWS2/MEWS) is established for this clinical population.'
    };

    if (!frequency || frequency === 'none' || !frequencyHours) {
      return {
        isConfigured: false,
        frequency: null,
        frequencyHours: null,
        notes: schedule?.notes || '',
        configuredBy: schedule?.configuredBy || null,
        configuredAt: schedule?.configuredAt || null,
        lastObservationTime: lastObsTime,
        lastObservationBy: lastObsBy,
        nextDueAt: null,
        isDue: false,
        isOverdue: false,
        status: 'SCHEDULE_NOT_CONFIGURED',
        dueMessage: 'Schedule not configured',
        earlyWarningScore
      };
    }

    const now = new Date();
    let nextDueAt = null;
    let isDue = false;
    let isOverdue = false;
    let dueMessage = '';

    if (lastObsTime) {
      const lastDate = new Date(lastObsTime);
      nextDueAt = new Date(lastDate.getTime() + frequencyHours * 3600 * 1000).toISOString();
      const nextDueDate = new Date(nextDueAt);
      
      if (now.getTime() >= nextDueDate.getTime()) {
        isDue = true;
        const diffMs = now.getTime() - nextDueDate.getTime();
        const diffMins = Math.floor(diffMs / (60 * 1000));
        const diffHours = Math.floor(diffMins / 60);

        if (diffHours >= 1) {
          isOverdue = true;
          dueMessage = `Overdue by ${diffHours}h ${diffMins % 60}m`;
        } else if (diffMins > 0) {
          isOverdue = diffMins >= 15;
          dueMessage = `Overdue by ${diffMins}m`;
        } else {
          dueMessage = 'Due now';
        }
      } else {
        const remainingMs = nextDueDate.getTime() - now.getTime();
        const remMins = Math.floor(remainingMs / (60 * 1000));
        const remHours = Math.floor(remMins / 60);
        dueMessage = remHours > 0 ? `Due in ${remHours}h ${remMins % 60}m` : `Due in ${remMins}m`;
      }
    } else {
      // Baseline due
      const admTime = admission.admitted_at || admission.admission_date || admission.admissionDate || admission.created_at || now.toISOString();
      const admDate = new Date(admTime);
      nextDueAt = new Date(admDate.getTime() + frequencyHours * 3600 * 1000).toISOString();
      const nextDueDate = new Date(nextDueAt);
      isDue = true;
      isOverdue = now.getTime() >= nextDueDate.getTime();
      dueMessage = isOverdue ? 'Overdue for initial baseline observation' : 'Due for initial baseline observation';
    }

    return {
      isConfigured: true,
      frequency,
      frequencyHours,
      notes: schedule?.notes || '',
      configuredBy: schedule?.configuredBy || null,
      configuredAt: schedule?.configuredAt || null,
      lastObservationTime: lastObsTime,
      lastObservationBy: lastObsBy,
      nextDueAt,
      isDue,
      isOverdue,
      status: isOverdue ? 'OVERDUE' : (isDue ? 'DUE' : 'ON_SCHEDULE'),
      dueMessage,
      earlyWarningScore
    };
  },

  async getVitalsSchedule(clinicId, user, admissionId) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();
    let admission = store.admissions?.find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const vitals = (store.nurseVitals || [])
      .filter(v => (v.admission_id === admissionId || v.admissionId === admissionId) &&
                   (v.clinic_id === clinicId || v.clinicId === clinicId))
      .sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at));

    const latestObs = vitals.length > 0 ? vitals[0] : null;
    return this.calculateVitalsSchedule(admission, latestObs);
  },

  async updateVitalsSchedule(clinicId, user, admissionId, data) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const role = (user?.role || '').toLowerCase();
    const allowedRoles = ['doctor', 'nurse', 'clinic', 'admin'];
    if (!allowedRoles.includes(role)) {
      const err = new Error('Forbidden: Unauthorized to configure vital observation schedules.');
      err.code = 'FORBIDDEN_ROLE';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();
    let admission = store.admissions?.find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if ((admission.status || '').toLowerCase() === 'discharged') {
      const err = new Error('Cannot configure observation schedule on a discharged admission.');
      err.code = 'ADMISSION_ALREADY_DISCHARGED';
      err.statusCode = 400;
      throw err;
    }

    if (role === 'nurse') {
      const nurseId = user.id || user._id;
      const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
              (na.nurse_id === nurseId || na.nurseId === nurseId) &&
              na.is_active !== false
      );
      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }
    }

    const freq = data.frequency === 'none' ? null : (data.frequency || null);
    let freqHours = null;
    if (freq) {
      freqHours = data.frequencyHours || parseInt(freq, 10);
      if (isNaN(freqHours) || freqHours <= 0) freqHours = null;
    }

    const nowIso = new Date().toISOString();
    let configName = user.name;
    if (!configName) {
      configName = `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim();
    }
    if (!configName) configName = role === 'doctor' ? 'Attending Doctor' : (role === 'nurse' ? 'Staff Nurse' : 'Clinical Administrator');

    const scheduleObj = {
      frequency: freq,
      frequencyHours: freqHours,
      notes: data.notes || '',
      configuredBy: configName,
      configuredById: user.id || user._id,
      configuredRole: role,
      configuredAt: admission.vitals_schedule?.configuredAt || nowIso,
      updatedAt: nowIso
    };

    admission.vitals_schedule = scheduleObj;
    admission.vitalsSchedule = scheduleObj;

    const storeAdm = store.admissions?.find(a => a.id === admissionId || a._id === admissionId);
    if (storeAdm) {
      storeAdm.vitals_schedule = scheduleObj;
      storeAdm.vitalsSchedule = scheduleObj;
    }

    saveLocalStore(store);

    const vitals = (store.nurseVitals || [])
      .filter(v => (v.admission_id === admissionId || v.admissionId === admissionId) &&
                   (v.clinic_id === clinicId || v.clinicId === clinicId))
      .sort((a, b) => new Date(b.recorded_at || b.created_at) - new Date(a.recorded_at || a.created_at));

    const latestObs = vitals.length > 0 ? vitals[0] : null;
    return this.calculateVitalsSchedule(admission, latestObs);
  },


  // 15. PATIENT TRANSFER WORKFLOW (Doctor Initiates & Approves, Nurse Executes)

  async initiatePatientTransfer(clinicId, user, admissionId, data = {}) {
    await this.verifyClinicIpd(clinicId);
    if (!user || (user.role !== 'doctor' && user.role !== 'clinic' && user.role !== 'admin')) {
      const err = new Error('Forbidden: Only authorized doctors can initiate patient transfers.');
      err.code = 'DOCTOR_ONLY';
      err.statusCode = 403;
      throw err;
    }

    if (!data.destinationWardId) {
      const err = new Error('Destination ward is required for patient transfer.');
      err.code = 'DESTINATION_WARD_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    if (!data.destinationBedId) {
      const err = new Error('Destination bed is required for patient transfer.');
      err.code = 'DESTINATION_BED_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    // Atomic in-process allocation guard on destination bed
    if (bedAllocationLocks.has(data.destinationBedId)) {
      const err = new Error('Destination bed is currently locked by another operation. Please retry.');
      err.code = 'CONCURRENT_ALLOCATION_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    bedAllocationLocks.add(data.destinationBedId);

    try {
      const store = getLocalStore();

      // 1. Admission Validation
      let admission = (store.admissions || []).find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
      if (!admission) {
        try {
          const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
          if (dbAdm) admission = dbAdm;
        } catch (_) {}
      }

      if (!admission) {
        const err = new Error('Active inpatient admission not found.');
        err.code = 'ADMISSION_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      if ((admission.status || '').toLowerCase() !== 'admitted') {
        const err = new Error(`Cannot transfer patient with status: ${admission.status}. Only actively admitted inpatients can be transferred.`);
        err.code = 'ADMISSION_NOT_ACTIVE';
        err.statusCode = 400;
        throw err;
      }

      // Check for existing pending transfer for this admission
      const existingPending = (store.transfers || []).find(t =>
        (t.admission_id === admissionId || t.admissionId === admissionId) &&
        t.status === 'APPROVED'
      );
      if (existingPending) {
        const err = new Error('A patient transfer has already been initiated and is awaiting nurse execution.');
        err.code = 'TRANSFER_ALREADY_PENDING';
        err.statusCode = 409;
        throw err;
      }

      // 2. Validate Destination Ward
      let destWard = (store.wards || []).find(w => w.id === data.destinationWardId && w.clinic_id === clinicId);
      if (!destWard) {
        try {
          const { data: dbWard } = await supabase.from('wards').select('*').eq('id', data.destinationWardId).eq('clinic_id', clinicId).maybeSingle();
          if (dbWard) destWard = dbWard;
        } catch (_) {}
      }

      if (!destWard) {
        const err = new Error('Destination ward not found in this clinic.');
        err.code = 'DESTINATION_WARD_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      if (destWard.is_active === false) {
        const err = new Error('Cannot transfer patient to an inactive ward.');
        err.code = 'DESTINATION_WARD_INACTIVE';
        err.statusCode = 400;
        throw err;
      }

      // 3. Validate Destination Bed
      let destBed = (store.beds || []).find(b => b.id === data.destinationBedId && b.clinic_id === clinicId);
      if (!destBed) {
        try {
          const { data: dbBed } = await supabase.from('beds').select('*').eq('id', data.destinationBedId).eq('clinic_id', clinicId).maybeSingle();
          if (dbBed) destBed = dbBed;
        } catch (_) {}
      }

      if (!destBed) {
        const err = new Error('Destination bed not found in this clinic.');
        err.code = 'DESTINATION_BED_NOT_FOUND';
        err.statusCode = 404;
        throw err;
      }

      if (destBed.is_active === false) {
        const err = new Error('Cannot transfer patient to an inactive bed.');
        err.code = 'DESTINATION_BED_INACTIVE';
        err.statusCode = 400;
        throw err;
      }

      const destBedWardId = destBed.ward_id || destBed.wardId;
      if (String(destBedWardId) !== String(data.destinationWardId)) {
        const err = new Error('Destination bed does not belong to the selected destination ward.');
        err.code = 'BED_WARD_MISMATCH';
        err.statusCode = 400;
        throw err;
      }

      const currentBedId = admission.bed_id || admission.bedId;
      if (String(destBed.id) === String(currentBedId)) {
        const err = new Error('Patient is already assigned to this bed. Destination bed must be different from current bed.');
        err.code = 'CANNOT_TRANSFER_TO_SAME_BED';
        err.statusCode = 400;
        throw err;
      }

      // Destination bed must be AVAILABLE
      if (destBed.status !== 'AVAILABLE') {
        const err = new Error(`Destination bed is not available for transfer (current status: ${destBed.status}). Only active AVAILABLE beds can be allocated.`);
        err.code = 'BED_NOT_AVAILABLE';
        err.statusCode = 400;
        throw err;
      }

      // Check if destination bed is currently occupied by another active admission
      const isBedOccupiedByOther = (store.admissions || []).some(a =>
        a.clinic_id === clinicId &&
        (a.bed_id === destBed.id || a.bedId === destBed.id) &&
        (a.status || '').toLowerCase() === 'admitted'
      );
      if (isBedOccupiedByOther) {
        const err = new Error('Destination bed is already occupied by an active inpatient.');
        err.code = 'BED_ALREADY_OCCUPIED';
        err.statusCode = 409;
        throw err;
      }

      // Check if destination bed is already reserved for another pending transfer
      const isBedReservedForTransfer = (store.transfers || []).some(t =>
        t.clinic_id === clinicId &&
        (t.destination_bed_id === destBed.id || t.destinationBedId === destBed.id) &&
        t.status === 'APPROVED'
      );
      if (isBedReservedForTransfer) {
        const err = new Error('Destination bed is already reserved for another pending patient transfer.');
        err.code = 'BED_RESERVED_FOR_TRANSFER';
        err.statusCode = 409;
        throw err;
      }

      // 4. Reserve Destination Bed for Transfer
      const prevDestStatus = destBed.status || 'AVAILABLE';
      destBed.status = 'RESERVED';
      try {
        await supabase.from('beds').update({ status: 'RESERVED' }).eq('id', destBed.id).eq('clinic_id', clinicId);
      } catch (_) {}

      const sourceWardName = admission.ward_name || admission.wardName || 'Current Ward';
      const sourceBedNumber = admission.bed_number || admission.bedNumber || 'Current Bed';

      await recordBedStatusHistory(
        clinicId,
        destBed.id,
        prevDestStatus,
        'RESERVED',
        user,
        `Reserved for patient transfer from ${sourceWardName} Bed ${sourceBedNumber}`,
        admissionId,
        store
      );

      // 5. Create Transfer Record
      const transferId = generateUUID();
      const nowIso = new Date().toISOString();
      const doctorName = user.name || (user.first_name ? `Dr. ${user.first_name} ${user.last_name || ''}`.trim() : 'Doctor');
      const patientName = admission.patient_name || admission.patientName || 'Inpatient';
      const patientId = admission.patient_id || admission.patientId;

      const transfer = {
        id: transferId,
        clinic_id: clinicId,
        clinicId,
        admission_id: admissionId,
        admissionId,
        admission_number: admission.admission_number || admission.admissionNumber || '',
        admissionNumber: admission.admission_number || admission.admissionNumber || '',
        patient_id: patientId,
        patientId,
        patient_name: patientName,
        patientName,
        source_ward_id: admission.ward_id || admission.wardId,
        sourceWardId: admission.ward_id || admission.wardId,
        source_ward_name: sourceWardName,
        sourceWardName,
        source_bed_id: currentBedId,
        sourceBedId: currentBedId,
        source_bed_number: sourceBedNumber,
        sourceBedNumber,
        destination_ward_id: destWard.id,
        destinationWardId: destWard.id,
        destination_ward_name: destWard.name,
        destinationWardName: destWard.name,
        destination_bed_id: destBed.id,
        destinationBedId: destBed.id,
        destination_bed_number: destBed.bed_number || destBed.bedNumber,
        destinationBedNumber: destBed.bed_number || destBed.bedNumber,
        destination_nurse_id: data.destinationNurseId || null,
        destinationNurseId: data.destinationNurseId || null,
        transfer_reason: (data.reason || data.transferReason || '').trim() || 'Clinical condition / ward transfer',
        transferReason: (data.reason || data.transferReason || '').trim() || 'Clinical condition / ward transfer',
        clinical_notes: (data.clinicalNotes || data.notes || '').trim(),
        clinicalNotes: (data.clinicalNotes || data.notes || '').trim(),
        status: 'APPROVED',
        initiated_by_doctor_id: user.id || user._id,
        initiatedByDoctorId: user.id || user._id,
        initiating_doctor_name: doctorName,
        initiatingDoctorName: doctorName,
        initiated_at: nowIso,
        initiatedAt: nowIso,
        executed_by_nurse_id: null,
        executing_nurse_name: null,
        executed_at: null,
        movement_notes: null,
        created_at: nowIso,
        updated_at: nowIso
      };

      if (!store.transfers) store.transfers = [];
      store.transfers.unshift(transfer);

      admission.pendingTransferId = transferId;
      admission.pendingTransfer = transfer;

      saveLocalStore(store);
      return transfer;
    } finally {
      bedAllocationLocks.delete(data.destinationBedId);
    }
  },

  async executePatientTransfer(clinicId, user, admissionId, transferId, data = {}) {
    await this.verifyClinicIpd(clinicId);
    if (!user || (user.role !== 'nurse' && user.role !== 'clinic' && user.role !== 'admin')) {
      const err = new Error('Forbidden: Only an authorized nurse can execute patient transfers.');
      err.code = 'NURSE_ONLY';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    // 1. Admission Validation
    let admission = (store.admissions || []).find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if ((admission.status || '').toLowerCase() !== 'admitted') {
      const err = new Error(`Cannot execute transfer for admission with status: ${admission.status}. Patient is no longer admitted.`);
      err.code = 'ADMISSION_NOT_ACTIVE';
      err.statusCode = 400;
      throw err;
    }

    // 2. Transfer Validation
    const transfer = (store.transfers || []).find(t =>
      t.id === transferId &&
      (t.admission_id === admissionId || t.admissionId === admissionId) &&
      t.clinic_id === clinicId
    );

    if (!transfer) {
      const err = new Error('Transfer record not found for this admission.');
      err.code = 'TRANSFER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (transfer.status === 'COMPLETED') {
      const err = new Error('This patient transfer has already been executed and completed.');
      err.code = 'TRANSFER_ALREADY_COMPLETED';
      err.statusCode = 400;
      throw err;
    }

    if (transfer.status === 'CANCELLED') {
      const err = new Error('Cannot execute a cancelled patient transfer.');
      err.code = 'TRANSFER_CANCELLED';
      err.statusCode = 400;
      throw err;
    }

    if (transfer.status !== 'APPROVED') {
      const err = new Error(`Invalid transfer status: ${transfer.status}. Only approved transfers can be executed.`);
      err.code = 'INVALID_TRANSFER_STATUS';
      err.statusCode = 400;
      throw err;
    }

    // 3. Nurse Authorization & Ward Verification
    if (user.role === 'nurse') {
      const nurseId = user.id || user._id;
      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }

      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot execute patient transfers.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }

      const nurseWardId = nurse ? (nurse.assigned_ward_id || nurse.ward_id || nurse.wardId) : null;
      const isAssignedToPatient = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId ||
        (store.nurseAssignments || []).some(na => (na.admission_id === admission.id || na.admissionId === admission.id) && (na.nurse_id === nurseId || na.nurseId === nurseId) && na.is_active !== false));

      const isSourceWardNurse = nurseWardId && String(nurseWardId) === String(transfer.source_ward_id);
      const isDestWardNurse = nurseWardId && String(nurseWardId) === String(transfer.destination_ward_id);

      if (!isAssignedToPatient && !isSourceWardNurse && !isDestWardNurse) {
        const err = new Error('Forbidden: Only an authorized nurse assigned to this patient or the relevant wards can execute this transfer.');
        err.code = 'FORBIDDEN_NURSE_TRANSFER';
        err.statusCode = 403;
        throw err;
      }
    }

    // 4. Source Bed Turnaround: Move OCCUPIED -> CLEANING
    const sourceBedId = transfer.source_bed_id || transfer.sourceBedId || admission.bed_id || admission.bedId;
    let sourceBed = (store.beds || []).find(b => b.id === sourceBedId && b.clinic_id === clinicId);
    if (!sourceBed) {
      try {
        const { data: dbSb } = await supabase.from('beds').select('*').eq('id', sourceBedId).eq('clinic_id', clinicId).maybeSingle();
        if (dbSb) sourceBed = dbSb;
      } catch (_) {}
    }

    if (sourceBed) {
      sourceBed.status = 'CLEANING';
      try {
        await supabase.from('beds').update({ status: 'CLEANING' }).eq('id', sourceBedId).eq('clinic_id', clinicId);
      } catch (_) {}
      await recordBedStatusHistory(
        clinicId,
        sourceBedId,
        'OCCUPIED',
        'CLEANING',
        user,
        `Patient transferred to ${transfer.destination_ward_name} Bed ${transfer.destination_bed_number}`,
        admissionId,
        store
      );
    }

    // 5. Destination Bed Allocation: Move RESERVED/AVAILABLE -> OCCUPIED
    const destBedId = transfer.destination_bed_id || transfer.destinationBedId;
    let destBed = (store.beds || []).find(b => b.id === destBedId && b.clinic_id === clinicId);
    if (!destBed) {
      try {
        const { data: dbDb } = await supabase.from('beds').select('*').eq('id', destBedId).eq('clinic_id', clinicId).maybeSingle();
        if (dbDb) destBed = dbDb;
      } catch (_) {}
    }

    if (!destBed) {
      const err = new Error('Destination bed record not found.');
      err.code = 'DESTINATION_BED_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (destBed.is_active === false) {
      const err = new Error('Cannot execute transfer to an inactive destination bed.');
      err.code = 'BED_NOT_AVAILABLE';
      err.statusCode = 400;
      throw err;
    }

    const prevDestStatus = destBed.status || 'RESERVED';
    destBed.status = 'OCCUPIED';
    try {
      await supabase.from('beds').update({ status: 'OCCUPIED' }).eq('id', destBedId).eq('clinic_id', clinicId);
    } catch (_) {}

    await recordBedStatusHistory(
      clinicId,
      destBedId,
      prevDestStatus,
      'OCCUPIED',
      user,
      `Patient transferred from ${transfer.source_ward_name} Bed ${transfer.source_bed_number}`,
      admissionId,
      store
    );

    // 6. Update Inpatient Admission Record
    const nowIso = new Date().toISOString();
    const nurseName = user.name || (user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Nurse');

    admission.bed_id = destBed.id;
    admission.bedId = destBed.id;
    admission.bed_number = destBed.bed_number || destBed.bedNumber;
    admission.bedNumber = destBed.bed_number || destBed.bedNumber;
    admission.room_id = destBed.room_id || null;
    admission.roomId = destBed.room_id || null;
    admission.room_number = destBed.room_number || destBed.roomNumber || '';
    admission.roomNumber = destBed.room_number || destBed.roomNumber || '';
    admission.ward_id = transfer.destination_ward_id;
    admission.wardId = transfer.destination_ward_id;
    admission.ward_name = transfer.destination_ward_name;
    admission.wardName = transfer.destination_ward_name;
    admission.bed_daily_rate = Number(destBed.daily_rate || destBed.dailyRate || admission.bed_daily_rate || 500);

    // Deactivate previous active nurse assignments for this admission (source nurse handoff)
    if (store.nurseAssignments) {
      store.nurseAssignments.forEach(na => {
        if (na.admission_id === admissionId || na.admissionId === admissionId) {
          na.is_active = false;
          na.ended_at = nowIso;
          na.end_reason = 'transferred_to_new_ward';
        }
      });
    }

    // Destination Ward Nurse Handover (HR: destination ward's Nurse takes over after handover)
    const destNurseId = data.destinationNurseId || transfer.destination_nurse_id || transfer.destinationNurseId;
    let assignedDestNurse = null;

    if (destNurseId) {
      const candidateNurse = (store.staff || []).find(s => (s.id === destNurseId || s._id === destNurseId) && s.clinic_id === clinicId);
      if (candidateNurse && candidateNurse.status === 'active') {
        const candidateWardId = candidateNurse.assigned_ward_id || candidateNurse.ward_id || candidateNurse.wardId;
        if (!candidateWardId || String(candidateWardId) === String(transfer.destination_ward_id)) {
          const localActive = (store.admissions || []).filter(a => a.clinic_id === clinicId && (a.status || '').toLowerCase() === 'admitted');
          const activeCount = localActive.filter(a => (a.assigned_nurse_id === candidateNurse.id || a.assignedNurseId === candidateNurse.id)).length;
          if (activeCount < 20) {
            assignedDestNurse = candidateNurse;
          }
        }
      }
    }

    // If no explicit nurse or not eligible, auto-assign an active nurse from destination ward with capacity (< 20)
    if (!assignedDestNurse) {
      const destWardNurses = (store.staff || []).filter(s =>
        s.clinic_id === clinicId &&
        s.role === 'nurse' &&
        s.status === 'active' &&
        String(s.assigned_ward_id || s.ward_id || s.wardId) === String(transfer.destination_ward_id)
      );

      const localActive = (store.admissions || []).filter(a => a.clinic_id === clinicId && (a.status || '').toLowerCase() === 'admitted');
      for (const nurseCandidate of destWardNurses) {
        const candidateId = nurseCandidate.id || nurseCandidate._id;
        const count = localActive.filter(a => (a.assigned_nurse_id === candidateId || a.assignedNurseId === candidateId)).length;
        if (count < 20) {
          assignedDestNurse = nurseCandidate;
          break;
        }
      }
    }

    if (assignedDestNurse) {
      const destNurseName = `${assignedDestNurse.first_name || ''} ${assignedDestNurse.last_name || ''}`.trim() || assignedDestNurse.name || 'Staff Nurse';
      const destNurseIdActual = assignedDestNurse.id || assignedDestNurse._id;
      admission.assigned_nurse_id = destNurseIdActual;
      admission.assignedNurseId = destNurseIdActual;
      admission.nurse_name = destNurseName;
      admission.nurseName = destNurseName;

      const newAssignment = {
        id: generateUUID(),
        clinic_id: clinicId,
        admission_id: admissionId,
        nurse_id: destNurseIdActual,
        ward_id: transfer.destination_ward_id,
        assigned_at: nowIso,
        is_active: true,
        created_at: nowIso
      };
      if (!store.nurseAssignments) store.nurseAssignments = [];
      store.nurseAssignments.push(newAssignment);
    } else {
      admission.assigned_nurse_id = null;
      admission.assignedNurseId = null;
      admission.nurse_name = null;
      admission.nurseName = null;
    }

    admission.pendingTransferId = null;
    admission.pendingTransfer = null;
    admission.updated_at = nowIso;

    // 7. Update Transfer Record
    transfer.status = 'COMPLETED';
    transfer.executed_by_nurse_id = user.id || user._id;
    transfer.executedByNurseId = user.id || user._id;
    transfer.executing_nurse_name = nurseName;
    transfer.executingNurseName = nurseName;
    transfer.executed_at = nowIso;
    transfer.executedAt = nowIso;
    transfer.movement_notes = (data.movementNotes || data.handoverNotes || data.notes || '').trim();
    transfer.movementNotes = transfer.movement_notes;
    transfer.handover_notes = transfer.movement_notes;
    transfer.handoverNotes = transfer.movement_notes;
    transfer.destination_nurse_id = assignedDestNurse ? (assignedDestNurse.id || assignedDestNurse._id) : null;
    transfer.destinationNurseId = transfer.destination_nurse_id;
    transfer.destination_nurse_name = assignedDestNurse ? admission.nurse_name : null;
    transfer.destinationNurseName = transfer.destination_nurse_name;
    transfer.updated_at = nowIso;

    saveLocalStore(store);
    return { transfer, admission, sourceBed, destinationBed: destBed };
  },

  async cancelPatientTransfer(clinicId, user, admissionId, transferId, data = {}) {
    await this.verifyClinicIpd(clinicId);
    const store = getLocalStore();

    let admission = (store.admissions || []).find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const transfer = (store.transfers || []).find(t =>
      t.id === transferId &&
      (t.admission_id === admissionId || t.admissionId === admissionId) &&
      t.clinic_id === clinicId
    );

    if (!transfer) {
      const err = new Error('Transfer record not found.');
      err.code = 'TRANSFER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (transfer.status === 'COMPLETED') {
      const err = new Error('Cannot cancel an already completed patient transfer.');
      err.code = 'TRANSFER_ALREADY_COMPLETED';
      err.statusCode = 400;
      throw err;
    }

    if (transfer.status === 'CANCELLED') {
      return transfer;
    }

    // Release destination bed RESERVED -> AVAILABLE
    const destBedId = transfer.destination_bed_id || transfer.destinationBedId;
    let destBed = (store.beds || []).find(b => b.id === destBedId && b.clinic_id === clinicId);
    if (destBed && destBed.status === 'RESERVED') {
      destBed.status = 'AVAILABLE';
      try {
        await supabase.from('beds').update({ status: 'AVAILABLE' }).eq('id', destBedId).eq('clinic_id', clinicId);
      } catch (_) {}

      await recordBedStatusHistory(
        clinicId,
        destBedId,
        'RESERVED',
        'AVAILABLE',
        user,
        'Transfer cancelled: destination bed released to available',
        admissionId,
        store
      );
    }

    const nowIso = new Date().toISOString();
    transfer.status = 'CANCELLED';
    transfer.cancelled_by = user.id || user._id;
    transfer.cancelled_at = nowIso;
    transfer.cancel_reason = (data.cancelReason || data.reason || 'Cancelled by clinical staff').trim();
    transfer.updated_at = nowIso;

    admission.pendingTransferId = null;
    admission.pendingTransfer = null;

    saveLocalStore(store);
    return transfer;
  },

  async getAdmissionTransfers(clinicId, user, admissionId) {
    await this.verifyClinicIpd(clinicId);
    const store = getLocalStore();

    const transfers = (store.transfers || [])
      .filter(t => (t.admission_id === admissionId || t.admissionId === admissionId) && t.clinic_id === clinicId)
      .sort((a, b) => new Date(b.created_at || b.initiated_at) - new Date(a.created_at || a.initiated_at));

    const activeTransfer = transfers.find(t => t.status === 'APPROVED') || null;
    return { transfers, activeTransfer };
  },

  async getClinicTransfers(clinicId, user, options = {}) {
    await this.verifyClinicIpd(clinicId);
    const store = getLocalStore();

    let transfers = (store.transfers || []).filter(t => t.clinic_id === clinicId);

    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;
      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      const nurseWardId = nurse ? (nurse.assigned_ward_id || nurse.ward_id || nurse.wardId) : null;
      if (nurseWardId) {
        transfers = transfers.filter(t =>
          String(t.source_ward_id) === String(nurseWardId) ||
          String(t.destination_ward_id) === String(nurseWardId) ||
          t.destination_nurse_id === nurseId
        );
      }
    }

    if (options.status) {
      transfers = transfers.filter(t => t.status === options.status);
    }

    return transfers.sort((a, b) => new Date(b.created_at || b.initiated_at) - new Date(a.created_at || a.initiated_at));
  },

// 1. Create Inpatient Prescription (Doctor-only)
  async createIpdPrescription(clinicId, user, admissionId, data) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    if (!user || user.role !== 'doctor') {
      const err = new Error('Forbidden: Only authenticated doctors can prescribe inpatient medications.');
      err.code = 'DOCTOR_ONLY';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    let admission = (store.admissions || []).find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if ((admission.status || '').toLowerCase() === 'discharged') {
      const err = new Error('Cannot prescribe medications for a discharged admission.');
      err.code = 'ADMISSION_ALREADY_DISCHARGED';
      err.statusCode = 400;
      throw err;
    }

    const medName = (data.medication_name || data.name || data.medicine || '').trim();
    if (!medName) {
      const err = new Error('Medication name is required.');
      err.code = 'MEDICATION_NAME_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const dosage = (data.dosage || data.dose || '').trim();
    if (!dosage) {
      const err = new Error('Prescribed dosage is required.');
      err.code = 'DOSAGE_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const route = (data.route || 'Oral').trim();
    const frequency = (data.frequency || 'OD').trim();
    const instructions = (data.instructions || data.instruction || data.directions || '').trim() || null;
    const duration = (data.duration || '').trim() || null;

    const doctorId = user.id || user._id;
    let doctorName = user.name;
    if (!doctorName && (data.doctor_name || data.doctorName)) {
      doctorName = data.doctor_name || data.doctorName;
    }
    if (!doctorName) {
      if (user.first_name || user.firstName) {
        doctorName = `Dr. ${user.first_name || user.firstName} ${user.last_name || user.lastName || ''}`.trim();
      } else {
        const d = (store.doctors || []).find(doc => doc.id === doctorId || doc._id === doctorId);
        if (d) doctorName = d.name || `Dr. ${d.first_name || ''} ${d.last_name || ''}`.trim();
      }
    }
    if (!doctorName) doctorName = 'Dr. Attending Physician';

    const presId = generateUUID();
    const nowIso = new Date().toISOString();
    const scheduleTimes = parseScheduleTimes(frequency, data.schedule);

    const prescription = {
      id: presId,
      _id: presId,
      clinic_id: clinicId,
      clinicId,
      admission_id: admissionId,
      admissionId,
      admission_number: admission.admission_number || admission.admissionNumber,
      admissionNumber: admission.admission_number || admission.admissionNumber,
      patient_id: admission.patient_id || admission.patientId,
      patientId: admission.patient_id || admission.patientId,
      patient_name: admission.patient_name || admission.patientName,
      patientName: admission.patient_name || admission.patientName,
      doctor_id: doctorId,
      doctorId,
      doctor_name: doctorName,
      doctorName,
      medication_name: medName,
      medicationName: medName,
      dosage,
      dose: dosage,
      route,
      frequency,
      schedule: scheduleTimes,
      schedule_times: scheduleTimes,
      instructions,
      duration,
      start_date: data.start_date || nowIso,
      startDate: data.start_date || nowIso,
      end_date: data.end_date || null,
      endDate: data.end_date || null,
      status: 'active',
      created_at: nowIso,
      createdAt: nowIso,
      updated_at: nowIso,
      updatedAt: nowIso
    };

    if (!store.prescriptions) store.prescriptions = [];
    store.prescriptions.unshift(prescription);

    const storeAdm = (store.admissions || []).find(a => a.id === admissionId || a._id === admissionId);
    if (storeAdm) {
      if (!storeAdm.prescriptions) storeAdm.prescriptions = [];
      storeAdm.prescriptions.unshift(prescription);
    }

    saveLocalStore(store);

    await auditService.recordLog({
      user: { ...user, name: doctorName, clinicId },
      action: 'CREATE_IPD_PRESCRIPTION',
      resourceType: 'InpatientPrescription',
      resourceId: presId,
      changes: {
        admissionId,
        medicationName: medName,
        dosage,
        route,
        frequency,
        schedule: scheduleTimes
      }
    });

    return prescription;
  },

  
  // Discontinue Inpatient Prescription (Doctor-only)
  async discontinueIpdPrescription(clinicId, user, admissionId, prescriptionId, data = {}) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    if (!user || user.role !== 'doctor') {
      const err = new Error('Forbidden: Only authenticated doctors can discontinue inpatient prescriptions.');
      err.code = 'DOCTOR_ONLY';
      err.statusCode = 403;
      throw err;
    }

    const reason = (data.reason || data.discontinuation_reason || data.notes || '').trim();
    if (!reason || reason.length < 3) {
      const err = new Error('A mandatory clinical reason is required to discontinue an inpatient prescription (minimum 3 characters).');
      err.code = 'DISCONTINUATION_REASON_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const store = getLocalStore();

    let admission = (store.admissions || []).find(a => (a.id === admissionId || a._id === admissionId) && (a.clinic_id === clinicId || a.clinicId === clinicId));
    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    let prescription = (store.prescriptions || []).find(p =>
      (p.id === prescriptionId || p._id === prescriptionId) &&
      (p.admission_id === admissionId || p.admissionId === admissionId)
    );

    if (!prescription && admission.prescriptions && Array.isArray(admission.prescriptions)) {
      prescription = admission.prescriptions.find(p => p.id === prescriptionId || p._id === prescriptionId);
    }

    if (!prescription) {
      const err = new Error('Prescription record not found for this admission.');
      err.code = 'PRESCRIPTION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if ((prescription.status || '').toLowerCase() === 'discontinued') {
      const err = new Error('Prescription is already discontinued.');
      err.code = 'PRESCRIPTION_ALREADY_DISCONTINUED';
      err.statusCode = 400;
      throw err;
    }

    const doctorId = user.id || user._id;
    let doctorName = user.name;
    if (!doctorName) {
      if (user.first_name || user.firstName) {
        doctorName = `Dr. ${user.first_name || user.firstName} ${user.last_name || user.lastName || ''}`.trim();
      } else {
        const d = (store.doctors || []).find(doc => doc.id === doctorId || doc._id === doctorId);
        if (d) doctorName = d.name || `Dr. ${d.first_name || ''} ${d.last_name || ''}`.trim();
      }
    }
    if (!doctorName) doctorName = 'Dr. Doctor';

    const nowIso = data.discontinued_at || new Date().toISOString();

    prescription.status = 'discontinued';
    prescription.discontinued_at = nowIso;
    prescription.discontinuedAt = nowIso;
    prescription.discontinued_by = doctorId;
    prescription.discontinuedBy = doctorId;
    prescription.discontinued_by_name = doctorName;
    prescription.discontinuedByName = doctorName;
    prescription.discontinuation_reason = reason;
    prescription.discontinuationReason = reason;
    prescription.updated_at = nowIso;
    prescription.updatedAt = nowIso;

    const storeAdm = (store.admissions || []).find(a => a.id === admissionId || a._id === admissionId);
    if (storeAdm && Array.isArray(storeAdm.prescriptions)) {
      const nestedP = storeAdm.prescriptions.find(p => p.id === prescriptionId || p._id === prescriptionId);
      if (nestedP) {
        nestedP.status = 'discontinued';
        nestedP.discontinued_at = nowIso;
        nestedP.discontinuedAt = nowIso;
        nestedP.discontinued_by = doctorId;
        nestedP.discontinuedBy = doctorId;
        nestedP.discontinued_by_name = doctorName;
        nestedP.discontinuedByName = doctorName;
        nestedP.discontinuation_reason = reason;
        nestedP.discontinuationReason = reason;
        nestedP.updated_at = nowIso;
        nestedP.updatedAt = nowIso;
      }
    }

    if (!store.audit_logs) store.audit_logs = [];
    store.audit_logs.push({
      id: generateUUID(),
      action: 'DISCONTINUE_IPD_PRESCRIPTION',
      resource_type: 'InpatientPrescription',
      resource_id: prescription.id,
      resourceId: prescription.id,
      clinic_id: clinicId,
      user_id: doctorId,
      user_role: 'doctor',
      user_name: doctorName,
      created_at: nowIso,
      changes: {
        admissionId,
        medicationName: prescription.medication_name || prescription.medicationName,
        status: 'discontinued',
        discontinuationReason: reason,
        discontinuedAt: nowIso,
        discontinuedByName: doctorName
      }
    });

    saveLocalStore(store);

    await auditService.recordLog({
      user: { ...user, name: doctorName, clinicId },
      action: 'DISCONTINUE_IPD_PRESCRIPTION',
      resourceType: 'InpatientPrescription',
      resourceId: prescription.id,
      changes: {
        admissionId,
        medicationName: prescription.medication_name || prescription.medicationName,
        status: 'discontinued',
        discontinuationReason: reason,
        discontinuedAt: nowIso,
        discontinuedByName: doctorName
      }
    });

    return prescription;
  },

  // 2. Get Inpatient Prescriptions
  async getIpdPrescriptions(clinicId, user, admissionId) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();
    const nurseId = user ? (user.id || user._id) : null;

    if (user && user.role === 'nurse') {
      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot access prescriptions.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }
    }

    let admission = (store.admissions || []).find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (user && user.role === 'nurse') {
      const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
              (na.nurse_id === nurseId || na.nurseId === nurseId) &&
              na.is_active !== false
      );
      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }

      let nurseRecord = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (nurseRecord && nurseRecord.assigned_ward_id && admission.ward_id && String(nurseRecord.assigned_ward_id) !== String(admission.ward_id)) {
        const err = new Error('Forbidden: Nurse assigned ward does not match patient admission ward.');
        err.code = 'FORBIDDEN_WARD_MISMATCH';
        err.statusCode = 403;
        throw err;
      }
    }

    let prescriptions = (store.prescriptions || []).filter(p =>
      (p.admission_id === admissionId || p.admissionId === admissionId) &&
      (p.clinic_id === clinicId || p.clinicId === clinicId)
    );

    if (prescriptions.length === 0 && admission.prescriptions && Array.isArray(admission.prescriptions)) {
      prescriptions = admission.prescriptions;
    }

    return prescriptions;
  },

  // 3. Get Patient Medications and MAR (Active Prescriptions + Administration History + Scheduled Doses)
  async getPatientMedicationsAndMAR(clinicId, user, admissionId, query = {}) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();
    const nurseId = user ? (user.id || user._id) : null;

    if (user && user.role === 'nurse') {
      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot access MAR.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }
    }

    let admission = (store.admissions || []).find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (user && user.role === 'nurse') {
      const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
              (na.nurse_id === nurseId || na.nurseId === nurseId) &&
              na.is_active !== false
      );
      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }

      let nurseRecord = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (nurseRecord && nurseRecord.assigned_ward_id && admission.ward_id && String(nurseRecord.assigned_ward_id) !== String(admission.ward_id)) {
        const err = new Error('Forbidden: Nurse assigned ward does not match patient admission ward.');
        err.code = 'FORBIDDEN_WARD_MISMATCH';
        err.statusCode = 403;
        throw err;
      }
    }

    // Target date for schedule (defaults to today in YYYY-MM-DD)
    const targetDateStr = query.date || new Date().toISOString().split('T')[0];

    // Find prescriptions
    let prescriptions = (store.prescriptions || []).filter(p =>
      (p.admission_id === admissionId || p.admissionId === admissionId) &&
      (p.clinic_id === clinicId || p.clinicId === clinicId)
    );

    if (prescriptions.length === 0 && admission.prescriptions && Array.isArray(admission.prescriptions)) {
      prescriptions = admission.prescriptions;
    }

    // If no prescriptions exist yet, initialize standard active clinical orders from admitting doctor
    if (prescriptions.length === 0) {
      const docName = admission.admitting_doctor_name || admission.admittingDoctorName || 'Dr. Doctor';
      const docId = admission.admitting_doctor_id || admission.admittingDoctorId || 'doc-primary';
      const nowIso = new Date().toISOString();

      const defaultPrescriptions = [
        {
          id: generateUUID(),
          clinic_id: clinicId,
          clinicId,
          admission_id: admissionId,
          admissionId,
          admission_number: admission.admission_number || admission.admissionNumber,
          admissionNumber: admission.admission_number || admission.admissionNumber,
          patient_id: admission.patient_id || admission.patientId,
          patientId: admission.patient_id || admission.patientId,
          patient_name: admission.patient_name || admission.patientName,
          patientName: admission.patient_name || admission.patientName,
          doctor_id: docId,
          doctorId: docId,
          doctor_name: docName,
          doctorName: docName,
          medication_name: 'Paracetamol 500mg Tab',
          medicationName: 'Paracetamol 500mg Tab',
          dosage: '500mg',
          dose: '500mg',
          route: 'Oral',
          frequency: 'TDS',
          schedule: ['08:00', '14:00', '20:00'],
          schedule_times: ['08:00', '14:00', '20:00'],
          instructions: 'Take after food. Monitor temperature spikes.',
          duration: '5 days',
          start_date: nowIso,
          startDate: nowIso,
          status: 'active',
          created_at: nowIso,
          createdAt: nowIso
        },
        {
          id: generateUUID(),
          clinic_id: clinicId,
          clinicId,
          admission_id: admissionId,
          admissionId,
          admission_number: admission.admission_number || admission.admissionNumber,
          admissionNumber: admission.admission_number || admission.admissionNumber,
          patient_id: admission.patient_id || admission.patientId,
          patientId: admission.patient_id || admission.patientId,
          patient_name: admission.patient_name || admission.patientName,
          patientName: admission.patient_name || admission.patientName,
          doctor_id: docId,
          doctorId: docId,
          doctor_name: docName,
          doctorName: docName,
          medication_name: 'Ceftriaxone 1g Inj',
          medicationName: 'Ceftriaxone 1g Inj',
          dosage: '1g',
          dose: '1g',
          route: 'IV',
          frequency: 'BD',
          schedule: ['09:00', '21:00'],
          schedule_times: ['09:00', '21:00'],
          instructions: 'Administer slow IV push over 3-5 mins. Check cannula site.',
          duration: '7 days',
          start_date: nowIso,
          startDate: nowIso,
          status: 'active',
          created_at: nowIso,
          createdAt: nowIso
        },
        {
          id: generateUUID(),
          clinic_id: clinicId,
          clinicId,
          admission_id: admissionId,
          admissionId,
          admission_number: admission.admission_number || admission.admissionNumber,
          admissionNumber: admission.admission_number || admission.admissionNumber,
          patient_id: admission.patient_id || admission.patientId,
          patientId: admission.patient_id || admission.patientId,
          patient_name: admission.patient_name || admission.patientName,
          patientName: admission.patient_name || admission.patientName,
          doctor_id: docId,
          doctorId: docId,
          doctor_name: docName,
          doctorName: docName,
          medication_name: 'Pantoprazole 40mg Inj',
          medicationName: 'Pantoprazole 40mg Inj',
          dosage: '40mg',
          dose: '40mg',
          route: 'IV',
          frequency: 'OD',
          schedule: ['08:00'],
          schedule_times: ['08:00'],
          instructions: 'Early morning, fasting. Flush before and after.',
          duration: '5 days',
          start_date: nowIso,
          startDate: nowIso,
          status: 'active',
          created_at: nowIso,
          createdAt: nowIso
        }
      ];

      if (!store.prescriptions) store.prescriptions = [];
      defaultPrescriptions.forEach(p => store.prescriptions.push(p));
      prescriptions = defaultPrescriptions;

      const storeAdm = (store.admissions || []).find(a => a.id === admissionId || a._id === admissionId);
      if (storeAdm) {
        storeAdm.prescriptions = defaultPrescriptions;
      }
      saveLocalStore(store);
    }

    // Retrieve MAR records for this admission
    const allMar = (store.marRecords || []).filter(m =>
      (m.admission_id === admissionId || m.admissionId === admissionId) &&
      (m.clinic_id === clinicId || m.clinicId === clinicId)
    );

    const sortedMar = [...allMar].sort((a, b) =>
      new Date(b.administered_at || b.administeredAt || b.created_at) -
      new Date(a.administered_at || a.administeredAt || a.created_at)
    );

    // Build scheduled dose slots for targetDateStr
    const scheduledDoses = [];
    const activePrescriptions = prescriptions.filter(p => (p.status || 'active').toLowerCase() === 'active');

    for (const pres of prescriptions) {
      const isDiscontinued = (pres.status || '').toLowerCase() === 'discontinued';
      const discontinuedAt = pres.discontinued_at || pres.discontinuedAt;

      // If prescription was discontinued prior to targetDateStr, skip future generation completely
      if (isDiscontinued && discontinuedAt) {
        const discDate = discontinuedAt.slice(0, 10);
        if (targetDateStr > discDate) {
          continue;
        }
      } else if (isDiscontinued && !discontinuedAt) {
        continue;
      }
      const times = parseScheduleTimes(pres.frequency, pres.schedule || pres.schedule_times);

      for (const time of times) {
        // Slot identifier
        const slotKey = `${targetDateStr}T${time}:00`;
        const timeShort = time;

        // If prescription is discontinued, stop generating future scheduled doses from effective discontinuation time
        if (isDiscontinued && discontinuedAt) {
          const isFutureSlot = slotKey >= discontinuedAt;
          const hasRecord = allMar.some(m =>
            (m.prescription_id === pres.id || m.prescriptionId === pres.id) &&
            ((m.scheduled_time && (m.scheduled_time === slotKey || m.scheduled_time === timeShort || m.scheduled_time.includes(timeShort))) ||
             (m.administered_at && m.administered_at.startsWith(targetDateStr) && m.scheduled_time === timeShort))
          );
          if (isFutureSlot && !hasRecord) {
            continue;
          }
        }

        // Check for matching MAR record
        const matchingMar = allMar.find(m => {
          if (m.prescription_id !== pres.id && m.prescriptionId !== pres.id) return false;
          const mScheduled = m.scheduled_time || m.scheduledTime;
          if (mScheduled) {
            if (mScheduled === slotKey || mScheduled === timeShort || mScheduled.includes(timeShort)) return true;
          }
          const mAdmin = m.administered_at || m.administeredAt;
          if (mAdmin && mAdmin.startsWith(targetDateStr) && m.scheduled_time === timeShort) {
            return true;
          }
          return false;
        });

        scheduledDoses.push({
          slotId: `${pres.id}_${targetDateStr}_${time.replace(':', '')}`,
          slotKey,
          scheduledDate: targetDateStr,
          scheduledTime: time,
          prescriptionId: pres.id,
          medicationName: pres.medication_name || pres.medicationName,
          prescribedDose: pres.dosage || pres.dose,
          route: pres.route,
          frequency: pres.frequency,
          instructions: pres.instructions,
          status: matchingMar ? matchingMar.status : 'SCHEDULED',
          isRecorded: Boolean(matchingMar),
          marRecord: matchingMar || null,
          marId: matchingMar ? (matchingMar.id || matchingMar._id) : null,
          administeredAt: matchingMar ? (matchingMar.administered_at || matchingMar.administeredAt) : null,
          administeredDose: matchingMar ? (matchingMar.administered_dose || matchingMar.administeredDose) : null,
          nurseName: matchingMar ? (matchingMar.nurse_name || matchingMar.nurseName) : null,
          nurseId: matchingMar ? (matchingMar.nurse_id || matchingMar.nurseId) : null,
          reason: matchingMar ? matchingMar.reason : null,
          notes: matchingMar ? (matchingMar.notes || matchingMar.remarks) : null
        });
      }
    }

    return {
      admission: {
        id: admission.id,
        admission_number: admission.admission_number || admission.admissionNumber,
        patient_name: admission.patient_name || admission.patientName,
        ward_id: admission.ward_id || admission.wardId,
        ward_name: admission.ward_name || admission.wardName,
        bed_id: admission.bed_id || admission.bedId,
        bed_number: admission.bed_number || admission.bedNumber,
        assigned_nurse_id: admission.assigned_nurse_id || admission.assignedNurseId,
        status: admission.status
      },
      prescriptions,
      activePrescriptions,
      marRecords: sortedMar,
      scheduledDoses,
      date: targetDateStr
    };
  },

  // 4. Record Medication Administration (Nurse-only)
  async recordMedicationAdministration(clinicId, user, admissionId, data) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    if (!user || user.role !== 'nurse') {
      const err = new Error('Forbidden: Only authorized nurses can record medication administration.');
      err.code = 'NURSE_ONLY';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();
    const nurseId = user.id || user._id;

    let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
    if (!nurse) {
      try {
        const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
        if (dbNurse) nurse = dbNurse;
      } catch (_) {}
    }

    if (nurse && nurse.status !== 'active') {
      const err = new Error('Forbidden: Inactive nurse cannot record medication administration.');
      err.code = 'NURSE_INACTIVE';
      err.statusCode = 403;
      throw err;
    }

    let admission = (store.admissions || []).find(a => (a.id === admissionId || a._id === admissionId) && a.clinic_id === clinicId);
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if ((admission.status || '').toLowerCase() === 'discharged') {
      const err = new Error('Cannot record medication administration on a discharged admission.');
      err.code = 'ADMISSION_ALREADY_DISCHARGED';
      err.statusCode = 400;
      throw err;
    }

    // Check assignment
    const isAssigned = (admission.assigned_nurse_id === nurseId || admission.assignedNurseId === nurseId);
    const hasActiveAssignment = (store.nurseAssignments || []).some(
      na => (na.admission_id === admissionId || na.admissionId === admissionId) &&
            (na.nurse_id === nurseId || na.nurseId === nurseId) &&
            na.is_active !== false
    );
    if (!isAssigned && !hasActiveAssignment) {
      const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
      err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
      err.statusCode = 403;
      throw err;
    }

    // Ward restriction check
    if (nurse && nurse.assigned_ward_id && admission.ward_id && String(nurse.assigned_ward_id) !== String(admission.ward_id)) {
      const err = new Error('Forbidden: Nurse assigned ward does not match patient admission ward.');
      err.code = 'FORBIDDEN_WARD_MISMATCH';
      err.statusCode = 403;
      throw err;
    }

    // Validate prescription
    const presId = data.prescription_id || data.prescriptionId;
    if (!presId) {
      const err = new Error('Prescription ID is required.');
      err.code = 'PRESCRIPTION_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    let prescription = (store.prescriptions || []).find(p =>
      (p.id === presId || p._id === presId) &&
      (p.admission_id === admissionId || p.admissionId === admissionId)
    );

    if (!prescription && admission.prescriptions && Array.isArray(admission.prescriptions)) {
      prescription = admission.prescriptions.find(p => p.id === presId || p._id === presId);
    }

    if (!prescription) {
      const err = new Error('Prescription record not found for this admission.');
      err.code = 'PRESCRIPTION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (prescription.status && prescription.status.toLowerCase() !== 'active') {
      const err = new Error('Cannot administer medication for an inactive or discontinued prescription.');
      err.code = 'PRESCRIPTION_INACTIVE';
      err.statusCode = 400;
      throw err;
    }

    // Status validation
    const status = (data.status || '').toUpperCase().trim();
    if (!['ADMINISTERED', 'MISSED', 'REFUSED'].includes(status)) {
      const err = new Error('Status must be ADMINISTERED, MISSED, or REFUSED.');
      err.code = 'INVALID_STATUS';
      err.statusCode = 400;
      throw err;
    }

    // Reason validation
    const reason = (data.reason || '').trim();
    if (['MISSED', 'REFUSED'].includes(status) && (!reason || reason.length < 3)) {
      const err = new Error(`A mandatory clinical reason is required when recording a dose as ${status}.`);
      err.code = 'REASON_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    // Administered dose validation
    let administeredDose = (data.dose_given || data.administered_dose || data.administeredDose || prescription.dosage || prescription.dose || '').trim();
    if (status === 'ADMINISTERED' && !administeredDose) {
      const err = new Error('Administered dose must be specified.');
      err.code = 'DOSE_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    // Duplicate check
    const scheduledTime = data.scheduled_time || data.scheduledTime || null;
    if (!store.marRecords) store.marRecords = [];

    if (scheduledTime) {
      const isDuplicate = store.marRecords.some(r =>
        (r.prescription_id === prescription.id || r.prescriptionId === prescription.id) &&
        (r.scheduled_time === scheduledTime || r.scheduledTime === scheduledTime)
      );
      if (isDuplicate) {
        const err = new Error(`A dose administration record already exists for scheduled time slot: ${scheduledTime}.`);
        err.code = 'DUPLICATE_DOSE_RECORD';
        err.statusCode = 409;
        throw err;
      }
    }

    // Nurse name resolution
    let nurseName = user.name;
    if (!nurseName && (user.first_name || user.firstName)) {
      nurseName = `${user.first_name || user.firstName} ${user.last_name || user.lastName || ''}`.trim();
    }
    if (!nurseName && nurse) {
      nurseName = nurse.name || `${nurse.first_name || ''} ${nurse.last_name || ''}`.trim();
    }
    if (!nurseName) nurseName = 'Staff Nurse';

    const marId = generateUUID();
    const nowIso = new Date().toISOString();
    const administeredAt = data.administered_at || data.administeredAt || nowIso;

    const marRecord = {
      id: marId,
      _id: marId,
      clinic_id: clinicId,
      clinicId,
      admission_id: admissionId,
      admissionId,
      admission_number: admission.admission_number || admission.admissionNumber,
      admissionNumber: admission.admission_number || admission.admissionNumber,
      patient_id: admission.patient_id || admission.patientId,
      patientId: admission.patient_id || admission.patientId,
      patient_name: admission.patient_name || admission.patientName,
      patientName: admission.patient_name || admission.patientName,
      prescription_id: prescription.id,
      prescriptionId: prescription.id,
      medication_name: prescription.medication_name || prescription.medicationName,
      medicationName: prescription.medication_name || prescription.medicationName,
      prescribed_dose: prescription.dosage || prescription.dose,
      prescribedDose: prescription.dosage || prescription.dose,
      administered_dose: status === 'ADMINISTERED' ? administeredDose : null,
      administeredDose: status === 'ADMINISTERED' ? administeredDose : null,
      route: data.route || prescription.route || 'Oral',
      scheduled_time: scheduledTime,
      scheduledTime,
      administered_at: administeredAt,
      administeredAt,
      status, // ADMINISTERED | MISSED | REFUSED
      reason: ['MISSED', 'REFUSED'].includes(status) ? reason : null,
      notes: (data.notes || data.remarks || '').trim() || null,
      remarks: (data.notes || data.remarks || '').trim() || null,
      nurse_id: nurseId,
      nurseId,
      nurse_name: nurseName,
      nurseName,
      created_at: nowIso,
      createdAt: nowIso
    };

    store.marRecords.unshift(marRecord);

    const storeAdm = (store.admissions || []).find(a => a.id === admissionId || a._id === admissionId);
    if (storeAdm) {
      if (!storeAdm.marRecords) storeAdm.marRecords = [];
      storeAdm.marRecords.unshift(marRecord);
    }

    saveLocalStore(store);

    await auditService.recordLog({
      user: { ...user, name: nurseName, clinicId },
      action: `RECORD_MAR_${status}`,
      resourceType: 'MedicationAdministrationRecord',
      resourceId: marId,
      changes: {
        admissionId,
        prescriptionId: prescription.id,
        medicationName: marRecord.medication_name,
        status,
        doseGiven: marRecord.administered_dose,
        reason: marRecord.reason,
        scheduledTime
      },
      metadata: {
        nurseId,
        nurseName,
        administeredAt
      }
    });

    return marRecord;
  },

  // ==========================================
  // RADIOLOGY INVESTIGATIONS WORKFLOW
  // ==========================================

  // 1. Doctor: Create Radiology Investigation Order
  async createRadiologyOrder(clinicId, user, admissionId, data) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    if (!user || !['doctor', 'clinic', 'admin'].includes(user.role)) {
      const err = new Error('Forbidden: Only authorized doctors can order radiology investigations.');
      err.code = 'DOCTOR_ONLY';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    let admission = (store.admissions || []).find(a => (a.id === admissionId || a._id === admissionId) && (a.clinic_id === clinicId || a.clinicId === clinicId));
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*').eq('id', admissionId).eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if ((admission.status || '').toLowerCase() === 'discharged') {
      const err = new Error('Cannot order radiology investigations on a discharged admission.');
      err.code = 'ADMISSION_ALREADY_DISCHARGED';
      err.statusCode = 400;
      throw err;
    }

    const investigationType = (data.investigation_type || data.investigationType || '').trim();
    if (!investigationType) {
      const err = new Error('Investigation type is required (e.g., X-Ray, CT Scan, Ultrasound, MRI).');
      err.code = 'INVESTIGATION_TYPE_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const studyName = (data.study_name || data.studyName || data.investigation_name || '').trim();
    if (!studyName || studyName.length < 2) {
      const err = new Error('Study name is required (minimum 2 characters).');
      err.code = 'STUDY_NAME_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const clinicalIndication = (data.clinical_indication || data.clinicalIndication || data.indication || '').trim();
    if (!clinicalIndication || clinicalIndication.length < 3) {
      const err = new Error('A clinical indication is mandatory for radiology orders (minimum 3 characters).');
      err.code = 'CLINICAL_INDICATION_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

        // Destination Laboratory Validation
    const labId = (data.lab_id || data.labId || '').trim();
    if (!labId) {
      const err = new Error('Destination laboratory is required for radiology investigations.');
      err.code = 'DESTINATION_LAB_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    let labName = (data.lab_name || data.labName || '').trim();
    if (!labName) {
      const allLabs = (store.labs || []);
      const l = allLabs.find(lab => lab.id === labId || lab._id === labId);
      if (l) labName = l.lab_name || l.name;
    }
    if (!labName) {
      try {
        const { data: dbLab } = await supabase.from('labs').select('lab_name, status').eq('id', labId).maybeSingle();
        if (dbLab) {
          if ((dbLab.status || 'active').toLowerCase() !== 'active') {
            const err = new Error('The selected destination laboratory is inactive.');
            err.code = 'INACTIVE_LAB';
            err.statusCode = 400;
            throw err;
          }
          labName = dbLab.lab_name;
        }
      } catch (_) {}
    }
    if (!labName) labName = 'Diagnostic Imaging Facility';

    // Duplicate check: prevent duplicate pending order for exact same study within last 10 minutes
    const now = Date.now();
    const tenMinsAgo = new Date(now - 10 * 60 * 1000).toISOString();
    const existingOrders = (store.radiologyOrders || []).filter(o =>
      (o.admission_id === admissionId || o.admissionId === admissionId) &&
      o.investigation_type?.toLowerCase() === investigationType.toLowerCase() &&
      o.study_name?.toLowerCase() === studyName.toLowerCase() &&
      ['ORDERED', 'PENDING', 'IN_PROGRESS'].includes((o.status || '').toUpperCase()) &&
      o.created_at >= tenMinsAgo
    );

    if (existingOrders.length > 0) {
      const err = new Error(`A pending radiology order for "${studyName}" was already placed recently. Avoid duplicate requisitions.`);
      err.code = 'DUPLICATE_RADIOLOGY_ORDER';
      err.statusCode = 409;
      throw err;
    }

    const doctorId = user.id || user._id;
    let doctorName = user.name;
    if (!doctorName && (data.doctor_name || data.doctorName)) doctorName = data.doctor_name || data.doctorName;
    if (!doctorName) {
      if (user.first_name || user.firstName) {
        doctorName = `Dr. ${user.first_name || user.firstName} ${user.last_name || user.lastName || ''}`.trim();
      } else {
        const d = (store.doctors || []).find(doc => doc.id === doctorId || doc._id === doctorId);
        if (d) doctorName = d.name || `Dr. ${d.first_name || ''} ${d.last_name || ''}`.trim();
      }
    }
    if (!doctorName) doctorName = 'Dr. Attending Physician';

    const orderId = generateUUID();
    const orderNumber = `RAD-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();

    const priority = (data.priority || 'routine').toLowerCase();

    // Standard Diagnostic Radiology Tariffs lookup catalog
    const STANDARD_RADIOLOGY_TARIFFS = {
      'chest x-ray pa view': 600,
      'chest pa view': 600,
      'chest ap (portable bedside)': 750,
      'chest ap (bedside portable)': 750,
      'chest ap': 750,
      'abdomen erect & supine': 800,
      'abdomen erect and supine': 800,
      'left knee ap/lateral': 600,
      'left knee ap / lateral': 600,
      'right knee ap/lateral': 600,
      'right knee ap / lateral': 600,
      'lumbar spine ap/lateral': 700,
      'lumbar spine ap / lateral': 700,
      'hrct chest non-contrast': 3500,
      'hrct chest': 3500,
      'ncct head / brain': 2800,
      'ncct head': 2800,
      'ncct brain': 2800,
      'cect whole abdomen': 5000,
      'cect abdomen': 5000,
      'ct angiography pulmonary': 6500,
      'ct pulmonary angiography': 6500,
      'ct cervical spine': 3200,
      'ct c-spine': 3200,
      'usg whole abdomen & pelvis': 1500,
      'usg abdomen & pelvis': 1500,
      'usg kub (kidney, ureter, bladder)': 1200,
      'usg kub': 1200,
      'fast bedside protocol': 1800,
      'fast bedside': 1800,
      'venous doppler lower limb': 2500,
      'usg venous doppler lower limb': 2500,
      'usg thyroid / neck': 1400,
      'usg neck / thyroid': 1400,
      'mri brain non-contrast': 6000,
      'mri brain with dwi': 6000,
      'mri brain': 6000,
      'mri lumbar spine': 6500,
      'mri cervical spine': 6500,
      'mri knee joint': 5500
    };

    let orderPrice = null;
    if (data.price !== undefined && data.price !== null && !isNaN(Number(data.price))) {
      orderPrice = Number(data.price);
    } else if (data.amount !== undefined && data.amount !== null && !isNaN(Number(data.amount))) {
      orderPrice = Number(data.amount);
    } else if (data.tariff !== undefined && data.tariff !== null && !isNaN(Number(data.tariff))) {
      orderPrice = Number(data.tariff);
    } else if (data.total_amount !== undefined && data.total_amount !== null && !isNaN(Number(data.total_amount))) {
      orderPrice = Number(data.total_amount);
    } else {
      const normalizedStudy = studyName.trim().toLowerCase();
      if (STANDARD_RADIOLOGY_TARIFFS[normalizedStudy] !== undefined) {
        orderPrice = STANDARD_RADIOLOGY_TARIFFS[normalizedStudy];
      }
    }

    const newOrder = {
      id: orderId,
      _id: orderId,
      order_number: orderNumber,
      orderNumber,
      clinic_id: clinicId,
      clinicId,
      admission_id: admissionId,
      admissionId,
      admission_number: admission.admission_number || admission.admissionNumber,
      patient_id: admission.patient_id || admission.patientId,
      patientId: admission.patient_id || admission.patientId,
      patient_name: admission.patient_name || admission.patientName,
      patientName: admission.patient_name || admission.patientName,
      patient_code: admission.patient_code || admission.patientCode,
      ward_id: admission.ward_id || admission.wardId,
      ward_name: admission.ward_name || admission.wardName,
      bed_id: admission.bed_id || admission.bedId,
      bed_number: admission.bed_number || admission.bedNumber,
      doctor_id: doctorId,
      doctorId,
      doctor_name: doctorName,
      doctorName,
      investigation_type: investigationType,
      investigationType,
      study_name: studyName,
      studyName,
      clinical_indication: clinicalIndication,
      clinicalIndication,
      priority,
      category: 'radiology',
      has_radiology: true,
      is_radiology: true,
      price: orderPrice,
      amount: orderPrice,
      total_amount: orderPrice,
      tariff: orderPrice,
      tariff_configured: orderPrice !== null && orderPrice !== undefined,
      items: [
        {
          id: generateUUID(),
          item_type: 'radiology',
          item_name: `${investigationType}: ${studyName}`,
          item_code: `RAD-${investigationType.replace(/\s+/g, '').toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-4)}`,
          modality: investigationType,
          study_name: studyName,
          clinical_indication: clinicalIndication,
          instructions: (data.instructions || '').trim(),
          price: orderPrice,
          tariff: orderPrice
        }
      ],
      lab_id: labId,
      labId,
      lab_name: labName,
      labName,
      destination_lab: {
        id: labId,
        name: labName
      },
      instructions: (data.instructions || '').trim(),
      transport_mode: data.transport_mode || 'ambulatory',
      status: 'ORDERED',
      report: null,
      created_at: nowIso,
      createdAt: nowIso,
      updated_at: nowIso,
      updatedAt: nowIso
    };

    if (!store.radiologyOrders) store.radiologyOrders = [];
    store.radiologyOrders.unshift(newOrder);

    // Sync to admission nested radiology_orders if present
    const storeAdm = (store.admissions || []).find(a => a.id === admissionId || a._id === admissionId);
    if (storeAdm) {
      if (!storeAdm.radiology_orders) storeAdm.radiology_orders = [];
      storeAdm.radiology_orders.unshift(newOrder);
    }

    if (!store.audit_logs) store.audit_logs = [];
    store.audit_logs.push({
      id: generateUUID(),
      action: 'CREATE_IPD_RADIOLOGY_ORDER',
      resource_type: 'RadiologyOrder',
      resource_id: orderId,
      resourceId: orderId,
      clinic_id: clinicId,
      user_id: doctorId,
      user_role: user.role,
      user_name: doctorName,
      created_at: nowIso,
      changes: {
        admissionId,
        orderNumber,
        investigationType,
        studyName,
        clinicalIndication,
        priority
      }
    });

    saveLocalStore(store);

    await auditService.recordLog({
      user: { ...user, name: doctorName, clinicId },
      action: 'CREATE_IPD_RADIOLOGY_ORDER',
      resourceType: 'RadiologyOrder',
      resourceId: orderId,
      changes: {
        admissionId,
        orderNumber,
        investigationType,
        studyName,
        priority
      }
    });

    return newOrder;
  },

  // 2. Get Radiology Orders for an Inpatient Admission
  async getAdmissionRadiologyOrders(clinicId, user, admissionId) {
    await this.verifyClinicIpd(clinicId);
    if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
      const err = new Error('Forbidden: Cross-clinic access prohibited.');
      err.code = 'CROSS_CLINIC_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();

    let admission = (store.admissions || []).find(a =>
      ((a.id === admissionId || a._id === admissionId) ||
       (a.admission_number === admissionId || a.admissionNumber === admissionId)) &&
      (a.clinic_id === clinicId || a.clinicId === clinicId)
    );
    if (!admission) {
      try {
        const { data: dbAdm } = await supabase.from('ipd_admissions').select('*')
          .or(`id.eq.${admissionId},admission_number.eq.${admissionId}`)
          .eq('clinic_id', clinicId).maybeSingle();
        if (dbAdm) admission = dbAdm;
      } catch (_) {}
    }

    if (!admission) {
      const err = new Error('Inpatient admission record not found.');
      err.code = 'ADMISSION_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const admId = String(admission.id || admission._id);
    const admNum = String(admission.admission_number || admission.admissionNumber || '');

    // Nurse permission & assignment check
    if (user && user.role === 'nurse') {
      const nurseId = String(user.id || user._id);

      let nurse = (store.staff || []).find(s => (String(s.id) === nurseId || String(s._id) === nurseId) && (s.clinic_id === clinicId || s.clinicId === clinicId));
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }

      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot access patient records.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }

      // Ward restriction check
      const nurseWardId = (nurse && (nurse.assigned_ward_id || nurse.ward_id)) || user.assigned_ward_id || user.wardId;
      const admissionWardId = admission.ward_id || admission.wardId;
      if (nurseWardId && admissionWardId && String(nurseWardId) !== String(admissionWardId)) {
        const err = new Error('Forbidden: Nurse assigned ward does not match patient admission ward.');
        err.code = 'FORBIDDEN_WARD_MISMATCH';
        err.statusCode = 403;
        throw err;
      }

      // Check assignment
      const isAssigned = (String(admission.assigned_nurse_id || admission.assignedNurseId) === nurseId);
      const hasActiveAssignment = (store.nurseAssignments || []).some(
        na => {
          const naAdmId = String(na.admission_id || na.admissionId || '');
          const matchesAdm = naAdmId === admId || (admNum && naAdmId === admNum);
          const matchesNurse = String(na.nurse_id || na.nurseId) === nurseId;
          return matchesAdm && matchesNurse && na.is_active !== false;
        }
      );

      if (!isAssigned && !hasActiveAssignment) {
        const err = new Error('Forbidden: Nurse is not assigned to this inpatient admission.');
        err.code = 'FORBIDDEN_NURSE_UNASSIGNED';
        err.statusCode = 403;
        throw err;
      }
    }

    const orders = (store.radiologyOrders || []).filter(o => {
      const orderAdmId = String(o.admission_id || o.admissionId || '');
      const orderAdmNum = String(o.admission_number || o.admissionNumber || '');
      const matchesAdmission = (orderAdmId && (orderAdmId === admId || (admNum && orderAdmId === admNum))) ||
                               (orderAdmNum && (orderAdmNum === admNum || orderAdmNum === admId));
      const matchesClinic = (!clinicId || String(o.clinic_id || o.clinicId) === String(clinicId));
      return matchesAdmission && matchesClinic;
    });

    return orders.sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt));
  },

  // 3. Diagnostic Staff: Query Radiology Orders (Overview across IPD)
  async getRadiologyOrders(clinicId, user, query = {}) {
    const isLab = user && user.role === 'lab';
    if (!isLab) {
      if (!clinicId) {
        const err = new Error('Clinic ID is required.');
        err.code = 'MISSING_FIELD';
        err.statusCode = 400;
        throw err;
      }
      await this.verifyClinicIpd(clinicId);
      if (user && user.clinicId && String(user.clinicId) !== String(clinicId)) {
        const err = new Error('Forbidden: Cross-clinic access prohibited.');
        err.code = 'CROSS_CLINIC_FORBIDDEN';
        err.statusCode = 403;
        throw err;
      }
    } else if (clinicId) {
      await this.verifyClinicIpd(clinicId);
    }

    if (user && !['lab', 'doctor', 'clinic', 'admin', 'nurse'].includes(user.role)) {
      const err = new Error('Forbidden: Only diagnostic staff, doctors, clinic administrators, and assigned nurses can query radiology orders overview.');
      err.code = 'FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    const store = getLocalStore();
    let orders = store.radiologyOrders || [];
    if (clinicId) {
      orders = orders.filter(o => o.clinic_id === clinicId || o.clinicId === clinicId);
    }

    // Nurse Role Scoping: A nurse ONLY sees orders for their currently assigned inpatient admissions within their permitted ward
    if (user && user.role === 'nurse') {
      const nurseId = user.id || user._id;

      let nurse = (store.staff || []).find(s => (s.id === nurseId || s._id === nurseId) && s.clinic_id === clinicId);
      if (!nurse) {
        try {
          const { data: dbNurse } = await supabase.from('staff').select('*').eq('id', nurseId).eq('clinic_id', clinicId).maybeSingle();
          if (dbNurse) nurse = dbNurse;
        } catch (_) {}
      }

      if (nurse && nurse.status !== 'active') {
        const err = new Error('Forbidden: Inactive nurse cannot access patient records.');
        err.code = 'NURSE_INACTIVE';
        err.statusCode = 403;
        throw err;
      }

      const nurseWardId = (nurse && (nurse.assigned_ward_id || nurse.ward_id)) || user.assigned_ward_id || user.wardId;

      // Find all active admissions assigned to this nurse
      const clinicAdmissions = (store.admissions || []).filter(a => a.clinic_id === clinicId || a.clinicId === clinicId);
      const assignedAdmissionIds = new Set();

      for (const adm of clinicAdmissions) {
        const admWardId = adm.ward_id || adm.wardId;
        // Verify ward match if ward restriction is configured
        if (nurseWardId && admWardId && String(nurseWardId) !== String(admWardId)) {
          continue;
        }

        const isDirectlyAssigned = (adm.assigned_nurse_id === nurseId || adm.assignedNurseId === nurseId);
        const hasActiveAssignment = (store.nurseAssignments || []).some(
          na => (na.admission_id === adm.id || na.admissionId === adm.id) &&
                (na.nurse_id === nurseId || na.nurseId === nurseId) &&
                na.is_active !== false
        );

        if (isDirectlyAssigned || hasActiveAssignment) {
          assignedAdmissionIds.add(String(adm.id || adm._id));
        }
      }

      // If nurse has no assigned admissions, return empty list immediately
      if (assignedAdmissionIds.size === 0) {
        return [];
      }

      // Scope orders strictly to the nurse's assigned admissions
      orders = orders.filter(o => assignedAdmissionIds.has(String(o.admission_id || o.admissionId)));
    }

    // Laboratory Scoping: Diagnostic staff only view orders routed to their specific facility
    if (isLab) {
      const callerLabId = String(user.labId || user.id);
      orders = orders.filter(o => {
        const oLab = String(o.lab_id || o.labId || o.destination_lab?.id || '');
        return oLab === callerLabId;
      });
    }

    if (query.labId || query.lab_id) {
      const qLab = query.labId || query.lab_id;
      orders = orders.filter(o => o.lab_id === qLab || o.labId === qLab);
    }

    if (query.status) {
      const s = String(query.status).toUpperCase();
      orders = orders.filter(o => (o.status || '').toUpperCase() === s);
    }

    if (query.admissionId || query.admission_id) {
      const aid = query.admissionId || query.admission_id;
      orders = orders.filter(o => o.admission_id === aid || o.admissionId === aid);
    }

    if (query.patientId || query.patient_id) {
      const pid = query.patientId || query.patient_id;
      orders = orders.filter(o => o.patient_id === pid || o.patientId === pid);
    }

    if (query.investigationType || query.investigation_type) {
      const it = (query.investigationType || query.investigation_type).toLowerCase();
      orders = orders.filter(o => o.investigation_type?.toLowerCase() === it);
    }

    return orders.sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt));
  },

  // 4. Update Radiology Order Status (In Progress / Cancel)
  async updateRadiologyOrderStatus(clinicId, user, admissionId, orderId, data = {}) {
    const store = getLocalStore();
    let order = (store.radiologyOrders || []).find(o =>
      (o.id === orderId || o._id === orderId) &&
      (o.admission_id === admissionId || o.admissionId === admissionId) &&
      (!clinicId || o.clinic_id === clinicId || o.clinicId === clinicId)
    );

    if (!order) {
      const err = new Error('Radiology order not found.');
      err.code = 'ORDER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const resolvedClinicId = clinicId || order.clinic_id || order.clinicId;
    if (user && user.role !== 'lab') {
      if (!resolvedClinicId) {
        const err = new Error('Clinic ID is required.');
        err.code = 'MISSING_FIELD';
        err.statusCode = 400;
        throw err;
      }
      await this.verifyClinicIpd(resolvedClinicId);
      if (user.clinicId && String(user.clinicId) !== String(resolvedClinicId)) {
        const err = new Error('Forbidden: Cross-clinic access prohibited.');
        err.code = 'CROSS_CLINIC_FORBIDDEN';
        err.statusCode = 403;
        throw err;
      }
    }

    if (!order) {
      const err = new Error('Radiology order not found.');
      err.code = 'ORDER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const nextStatus = (data.status || '').toUpperCase().trim();
    if (!['ORDERED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(nextStatus)) {
      const err = new Error('Status must be ORDERED, IN_PROGRESS, COMPLETED, or CANCELLED.');
      err.code = 'INVALID_STATUS';
      err.statusCode = 400;
      throw err;
    }

    // Cancellation authorization: only Doctor or Admin
    if (nextStatus === 'CANCELLED') {
      if (!['doctor', 'clinic', 'admin'].includes(user.role)) {
        const err = new Error('Forbidden: Only attending doctors or clinic administrators can cancel radiology orders.');
        err.code = 'DOCTOR_ONLY';
        err.statusCode = 403;
        throw err;
      }
      if (order.status === 'COMPLETED') {
        const err = new Error('Cannot cancel an already completed radiology order.');
        err.code = 'ORDER_ALREADY_COMPLETED';
        err.statusCode = 400;
        throw err;
      }
    }

    // Moving to IN_PROGRESS: Diagnostic staff or Doctor
    if (nextStatus === 'IN_PROGRESS') {
      if (user.role === 'nurse') {
        const err = new Error('Forbidden: Nurses cannot alter radiology order workflow status.');
        err.code = 'FORBIDDEN';
        err.statusCode = 403;
        throw err;
      }
      if (user.role === 'lab') {
        const callerLabId = user.labId || user.id;
        if (order.lab_id && String(order.lab_id) !== String(callerLabId)) {
          const err = new Error('Forbidden: Only the assigned destination laboratory can update status on this order.');
          err.code = 'FORBIDDEN_LAB_MISMATCH';
          err.statusCode = 403;
          throw err;
        }
      }
    }

    const nowIso = new Date().toISOString();
    order.status = nextStatus;
    order.updated_at = nowIso;
    order.updatedAt = nowIso;
    order.status_updated_by = user.id || user._id;
    order.status_updated_at = nowIso;
    if (data.reason || data.notes) {
      order.status_reason = data.reason || data.notes;
    }

    saveLocalStore(store);

    await auditService.recordLog({
      user,
      action: 'UPDATE_IPD_RADIOLOGY_STATUS',
      resourceType: 'RadiologyOrder',
      resourceId: orderId,
      changes: {
        admissionId,
        newStatus: nextStatus,
        reason: data.reason || data.notes
      }
    });

    return order;
  },

  // 5. Diagnostic Staff: Upload / Attach Finalized Radiology Report
  async attachRadiologyReport(clinicId, user, admissionId, orderId, data = {}) {
    // Diagnostic staff check & RBAC
    if (!user) {
      const err = new Error('Forbidden: Unauthenticated user.');
      err.code = 'FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    if (user.role === 'nurse') {
      const err = new Error('Forbidden: Nurses cannot attach or modify radiology reports.');
      err.code = 'FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }

    // Diagnostic staff validation: Check RBAC
    // Pathologists, Lab Admins, Radiologists, Doctors, Clinic Admins can issue reports
    // Lab technicians without report issuance permission MUST be rejected!
    const labRole = (user.labRole || user.lab_role || '').toLowerCase();
    const isTech = user.role === 'technician' || labRole === 'technician';

    if (isTech) {
      // Check if user has explicit issue_reports permission
      const perms = Array.isArray(user.permissions) ? user.permissions : [];
      if (!perms.includes('issue_reports') && !perms.includes('validate_results')) {
        const err = new Error('Forbidden: Lab technicians without report issuance authorization cannot finalize radiology reports.');
        err.code = 'FORBIDDEN_REPORT_ISSUANCE';
        err.statusCode = 403;
        throw err;
      }
    } else {
      const isAllowedRole = ['admin', 'clinic', 'doctor', 'lab'].includes(user.role) ||
        ['lab_admin', 'pathologist', 'radiologist'].includes(labRole);
      if (!isAllowedRole) {
        const err = new Error('Forbidden: You do not have permission to attach radiology reports.');
        err.code = 'FORBIDDEN';
        err.statusCode = 403;
        throw err;
      }
    }

    const store = getLocalStore();
    let order = (store.radiologyOrders || []).find(o =>
      (o.id === orderId || o._id === orderId) &&
      (o.admission_id === admissionId || o.admissionId === admissionId) &&
      (!clinicId || o.clinic_id === clinicId || o.clinicId === clinicId)
    );

    if (!order) {
      try {
        const { data: dbOrder } = await supabase
          .from('ipd_radiology_orders')
          .select('*')
          .eq('id', orderId)
          .eq('admission_id', admissionId)
          .maybeSingle();
        if (dbOrder) order = dbOrder;
      } catch (_) {}
    }

    if (!order) {
      const err = new Error('Radiology order not found.');
      err.code = 'ORDER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const resolvedClinicId = clinicId || order.clinic_id || order.clinicId;
    if (user.role !== 'lab') {
      if (!resolvedClinicId) {
        const err = new Error('Clinic ID is required.');
        err.code = 'MISSING_FIELD';
        err.statusCode = 400;
        throw err;
      }
      await this.verifyClinicIpd(resolvedClinicId);
      if (user.clinicId && String(user.clinicId) !== String(resolvedClinicId)) {
        const err = new Error('Forbidden: Cross-clinic access prohibited.');
        err.code = 'CROSS_CLINIC_FORBIDDEN';
        err.statusCode = 403;
        throw err;
      }
    }

    if (!order) {
      try {
        const { data: dbOrder } = await supabase
          .from('ipd_radiology_orders')
          .select('*')
          .eq('id', orderId)
          .eq('admission_id', admissionId)
          .maybeSingle();
        if (dbOrder) order = dbOrder;
      } catch (_) {}
    }

    if (!order) {
      const err = new Error('Radiology order not found.');
      err.code = 'ORDER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (user.role === 'lab') {
      const callerLabId = user.labId || user.id;
      if (order.lab_id && String(order.lab_id) !== String(callerLabId)) {
        const err = new Error('Forbidden: Only the assigned destination laboratory can finalize reports for this order.');
        err.code = 'FORBIDDEN_LAB_MISMATCH';
        err.statusCode = 403;
        throw err;
      }
    }

    if (order.status === 'CANCELLED') {
      const err = new Error('Cannot attach a report to a cancelled radiology order.');
      err.code = 'ORDER_CANCELLED';
      err.statusCode = 400;
      throw err;
    }

    if (order.status === 'COMPLETED' || order.report) {
      const err = new Error('Radiology report has already been finalized for this order. Alteration of finalized reports is prohibited.');
      err.code = 'REPORT_ALREADY_FINALIZED';
      err.statusCode = 409;
      throw err;
    }

    const findings = (data.findings || '').trim();
    if (!findings || findings.length < 3) {
      const err = new Error('Diagnostic findings are mandatory (minimum 3 characters).');
      err.code = 'FINDINGS_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const impression = (data.impression || '').trim();
    if (!impression || impression.length < 3) {
      const err = new Error('Diagnostic impression is mandatory (minimum 3 characters).');
      err.code = 'IMPRESSION_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const uploaderId = user.id || user._id;
    let uploaderName = user.name;
    if (!uploaderName && (data.uploader_name || data.uploaderName)) uploaderName = data.uploader_name || data.uploaderName;
    if (!uploaderName) {
      if (user.first_name || user.firstName) {
        uploaderName = `${user.first_name || user.firstName} ${user.last_name || user.lastName || ''}`.trim();
      } else {
        const staffRec = (store.staff || []).find(s => s.id === uploaderId || s._id === uploaderId);
        if (staffRec) uploaderName = staffRec.name || `${staffRec.first_name || ''} ${staffRec.last_name || ''}`.trim();
      }
    }
    if (!uploaderName) uploaderName = 'Radiologist / Diagnostic Specialist';

    const reportId = generateUUID();
    const reportObj = {
      report_id: reportId,
      reportId,
      findings,
      impression,
      file_url: data.file_url || data.fileUrl || null,
      file_name: data.file_name || data.fileName || null,
      file_size: data.file_size || data.fileSize || null,
      mime_type: data.mime_type || data.mimeType || null,
      recommendations: (data.recommendations || '').trim(),
      critical_findings: Boolean(data.critical_findings || data.criticalFindings),
      uploaded_at: nowIso,
      uploadedAt: nowIso,
      uploaded_by: uploaderId,
      uploadedBy: uploaderId,
      uploaded_by_name: uploaderName,
      uploadedByName: uploaderName,
      uploaded_by_role: user.role === 'lab' ? (labRole || 'radiologist') : user.role,
      finalized_at: nowIso,
      finalizedAt: nowIso
    };

    order.report = reportObj;
    order.status = 'COMPLETED';
    order.updated_at = nowIso;
    order.updatedAt = nowIso;

    // Sync to nested admission order if present
    const storeAdm = (store.admissions || []).find(a => a.id === admissionId || a._id === admissionId);
    if (storeAdm && Array.isArray(storeAdm.radiology_orders)) {
      const nestedO = storeAdm.radiology_orders.find(o => o.id === orderId || o._id === orderId);
      if (nestedO) {
        nestedO.report = reportObj;
        nestedO.status = 'COMPLETED';
        nestedO.updated_at = nowIso;
        nestedO.updatedAt = nowIso;
      }
    }

    if (!store.audit_logs) store.audit_logs = [];
    store.audit_logs.push({
      id: generateUUID(),
      action: 'COMPLETE_IPD_RADIOLOGY_REPORT',
      resource_type: 'RadiologyOrder',
      resource_id: orderId,
      resourceId: orderId,
      clinic_id: resolvedClinicId,
      user_id: uploaderId,
      user_role: user.role,
      user_name: uploaderName,
      created_at: nowIso,
      changes: {
        admissionId,
        orderId,
        reportId,
        findings,
        impression,
        fileUrl: reportObj.file_url,
        fileName: reportObj.file_name,
        criticalFindings: reportObj.critical_findings
      }
    });

    saveLocalStore(store);

    await auditService.recordLog({
      user: { ...user, name: uploaderName, clinicId: resolvedClinicId },
      action: 'COMPLETE_IPD_RADIOLOGY_REPORT',
      resourceType: 'RadiologyOrder',
      resourceId: orderId,
      changes: {
        admissionId,
        orderId,
        reportId,
        impression,
        fileUrl: reportObj.file_url
      }
    });

    return order;
  },

};
