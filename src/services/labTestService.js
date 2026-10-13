import { supabase } from '@/lib/supabase';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Fallback JSON persistence directory & file
const DATA_DIR = path.join(process.cwd(), 'data');
const FALLBACK_FILE = path.join(DATA_DIR, 'lab_tests.json');

function ensureFallbackFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FALLBACK_FILE)) {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify([]), 'utf8');
  }
}

function readFallbackTests() {
  try {
    ensureFallbackFile();
    const data = fs.readFileSync(FALLBACK_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('[LabTestService] Error reading fallback file:', err);
    return [];
  }
}

function writeFallbackTests(tests) {
  try {
    ensureFallbackFile();
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(tests, null, 2), 'utf8');
  } catch (err) {
    console.error('[LabTestService] Error writing fallback file:', err);
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
    const { error } = await supabase.from('lab_tests').select('id').limit(1);
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

export const labTestService = {
  /**
   * Fetch tests for a specific lab with optional search and status filter
   */
  async listTests(labId, { search, status, department } = {}) {
    if (!labId) {
      throw new Error('lab_id is required');
    }

    const isSupabaseReady = await checkTableAvailable();
    if (isSupabaseReady) {
      try {
        let query = supabase
          .from('lab_tests')
          .select('*')
          .eq('lab_id', labId)
          .order('created_at', { ascending: false });

        if (status && status !== 'all') {
          query = query.eq('status', status.toLowerCase());
        }

        if (department && department !== 'all') {
          query = query.eq('department', department);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          let results = data;
          if (search && search.trim()) {
            const q = search.trim().toLowerCase();
            results = results.filter(
              (t) =>
                (t.test_name && t.test_name.toLowerCase().includes(q)) ||
                (t.test_code && t.test_code.toLowerCase().includes(q))
            );
          }
          return results;
        }
      } catch (e) {
        // Fall through to fallback
      }
    }

    return this.listTestsFallback(labId, { search, status, department });
  },

  listTestsFallback(labId, { search, status, department } = {}) {
    const all = readFallbackTests();
    let tests = all.filter((t) => t.lab_id === labId);

    if (status && status !== 'all') {
      tests = tests.filter((t) => (t.status || 'active').toLowerCase() === status.toLowerCase());
    }

    if (department && department !== 'all') {
      tests = tests.filter((t) => t.department === department);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      tests = tests.filter(
        (t) =>
          (t.test_name && t.test_name.toLowerCase().includes(q)) ||
          (t.test_code && t.test_code.toLowerCase().includes(q))
      );
    }

    return tests.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  },

  /**
   * Get single test by ID scoped strictly to authenticated lab
   */
  async getTestById(labId, testId) {
    if (!labId || !testId) return null;

    const isSupabaseReady = await checkTableAvailable();
    if (isSupabaseReady) {
      try {
        const { data, error } = await supabase
          .from('lab_tests')
          .select('*')
          .eq('id', testId)
          .eq('lab_id', labId)
          .maybeSingle();

        if (!error && data) return data;
      } catch (e) {}
    }

    const tests = readFallbackTests();
    return tests.find((t) => t.id === testId && t.lab_id === labId) || null;
  },

  /**
   * Create a new test in the catalog
   */
  async createTest(labId, testData) {
    if (!labId) throw new Error('lab_id is required');

    const testName = (testData.test_name || testData.testName || '').trim();
    const testCode = (testData.test_code || testData.testCode || '').trim().toUpperCase();
    const department = (testData.department || '').trim();
    const sampleType = (testData.sample_type || testData.sampleType || '').trim();
    const tatValue = Number(testData.tat_value ?? testData.tatValue);
    const tatUnit = (testData.tat_unit || testData.tatUnit || 'Hours').trim();
    const price = Number(testData.price);
    const testMethod = (testData.test_method || testData.testMethod || '').trim() || null;
    const description = (testData.description || '').trim() || null;
    const status = (testData.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';

    if (!testName) throw new Error('Test Name is required');
    if (!testCode) throw new Error('Test Code is required');
    if (!department) throw new Error('Department is required');
    if (!sampleType) throw new Error('Sample Type is required');
    if (isNaN(tatValue) || tatValue <= 0) throw new Error('Turnaround Time must be a valid positive number');
    if (isNaN(price) || price < 0) throw new Error('Price must be a valid non-negative number');

    // Check code uniqueness within this lab
    const existing = await this.findTestByCode(labId, testCode);
    if (existing) {
      const err = new Error(`A test with code "${testCode}" already exists in your laboratory catalog.`);
      err.code = 'DUPLICATE_CODE';
      err.status = 409;
      throw err;
    }

    const newRecord = {
      id: crypto.randomUUID(),
      lab_id: labId,
      test_name: testName,
      test_code: testCode,
      department,
      sample_type: sampleType,
      tat_value: tatValue,
      tat_unit: tatUnit,
      price,
      test_method: testMethod,
      description,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const isSupabaseReady = await checkTableAvailable();
    if (isSupabaseReady) {
      try {
        const { data, error } = await supabase
          .from('lab_tests')
          .insert(newRecord)
          .select('*')
          .single();

        if (!error && data) return data;
        if (error && error.code === '23505') {
          const err = new Error(`A test with code "${testCode}" already exists in your laboratory catalog.`);
          err.code = 'DUPLICATE_CODE';
          err.status = 409;
          throw err;
        }
      } catch (e) {
        if (e.code === 'DUPLICATE_CODE') throw e;
      }
    }

    const tests = readFallbackTests();
    tests.push(newRecord);
    writeFallbackTests(tests);
    return newRecord;
  },

  /**
   * Update an existing test
   */
  async updateTest(labId, testId, updateData) {
    if (!labId || !testId) throw new Error('lab_id and test_id are required');

    const currentTest = await this.getTestById(labId, testId);
    if (!currentTest) {
      const err = new Error('Test not found or you do not have permission to modify it');
      err.status = 404;
      throw err;
    }

    const payload = {};

    if (updateData.test_name !== undefined || updateData.testName !== undefined) {
      const name = (updateData.test_name || updateData.testName || '').trim();
      if (!name) throw new Error('Test Name cannot be empty');
      payload.test_name = name;
    }

    if (updateData.test_code !== undefined || updateData.testCode !== undefined) {
      const code = (updateData.test_code || updateData.testCode || '').trim().toUpperCase();
      if (!code) throw new Error('Test Code cannot be empty');
      if (code !== currentTest.test_code) {
        const dup = await this.findTestByCode(labId, code);
        if (dup && dup.id !== testId) {
          const err = new Error(`A test with code "${code}" already exists in your laboratory catalog.`);
          err.code = 'DUPLICATE_CODE';
          err.status = 409;
          throw err;
        }
      }
      payload.test_code = code;
    }

    if (updateData.department !== undefined) {
      const dept = (updateData.department || '').trim();
      if (!dept) throw new Error('Department cannot be empty');
      payload.department = dept;
    }

    if (updateData.sample_type !== undefined || updateData.sampleType !== undefined) {
      const st = (updateData.sample_type || updateData.sampleType || '').trim();
      if (!st) throw new Error('Sample Type cannot be empty');
      payload.sample_type = st;
    }

    if (updateData.tat_value !== undefined || updateData.tatValue !== undefined) {
      const tv = Number(updateData.tat_value ?? updateData.tatValue);
      if (isNaN(tv) || tv <= 0) throw new Error('Turnaround Time must be a positive number');
      payload.tat_value = tv;
    }

    if (updateData.tat_unit !== undefined || updateData.tatUnit !== undefined) {
      payload.tat_unit = (updateData.tat_unit || updateData.tatUnit || 'Hours').trim();
    }

    if (updateData.price !== undefined) {
      const pr = Number(updateData.price);
      if (isNaN(pr) || pr < 0) throw new Error('Price must be a valid non-negative number');
      payload.price = pr;
    }

    if (updateData.test_method !== undefined || updateData.testMethod !== undefined) {
      payload.test_method = (updateData.test_method || updateData.testMethod || '').trim() || null;
    }

    if (updateData.description !== undefined) {
      payload.description = (updateData.description || '').trim() || null;
    }

    if (updateData.status !== undefined) {
      payload.status = (updateData.status || '').toLowerCase() === 'inactive' ? 'inactive' : 'active';
    }

    payload.updated_at = new Date().toISOString();

    const isSupabaseReady = await checkTableAvailable();
    if (isSupabaseReady) {
      try {
        const { data, error } = await supabase
          .from('lab_tests')
          .update(payload)
          .eq('id', testId)
          .eq('lab_id', labId)
          .select('*')
          .single();

        if (!error && data) return data;
      } catch (e) {}
    }

    const tests = readFallbackTests();
    const idx = tests.findIndex((t) => t.id === testId && t.lab_id === labId);
    if (idx === -1) {
      const err = new Error('Test not found');
      err.status = 404;
      throw err;
    }
    tests[idx] = { ...tests[idx], ...payload };
    writeFallbackTests(tests);
    return tests[idx];
  },

  /**
   * Helper: Find test by code within a lab
   */
  async findTestByCode(labId, testCode) {
    if (!labId || !testCode) return null;
    const cleanCode = testCode.trim().toUpperCase();

    const isSupabaseReady = await checkTableAvailable();
    if (isSupabaseReady) {
      try {
        const { data, error } = await supabase
          .from('lab_tests')
          .select('id, test_code, lab_id')
          .eq('lab_id', labId)
          .ilike('test_code', cleanCode)
          .maybeSingle();

        if (!error && data) return data;
      } catch (e) {}
    }

    const tests = readFallbackTests();
    return (
      tests.find(
        (t) => t.lab_id === labId && (t.test_code || '').toUpperCase() === cleanCode
      ) || null
    );
  }
};
