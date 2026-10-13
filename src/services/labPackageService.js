import { supabase } from '@/lib/supabase';
import { labTestService } from './labTestService';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Fallback JSON persistence directory & file
const DATA_DIR = path.join(process.cwd(), 'data');
const FALLBACK_FILE = path.join(DATA_DIR, 'lab_packages.json');

function ensureFallbackFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FALLBACK_FILE)) {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify([]), 'utf8');
  }
}

function readFallbackPackages() {
  try {
    ensureFallbackFile();
    const data = fs.readFileSync(FALLBACK_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('[LabPackageService] Error reading fallback file:', err);
    return [];
  }
}

function writeFallbackPackages(packages) {
  try {
    ensureFallbackFile();
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(packages, null, 2), 'utf8');
  } catch (err) {
    console.error('[LabPackageService] Error writing fallback file:', err);
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
    const { error: err1 } = await supabase.from('lab_test_packages').select('id').limit(1);
    const { error: err2 } = await supabase.from('lab_test_package_items').select('id').limit(1);
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

export const labPackageService = {
  /**
   * List packages belonging strictly to the authenticated lab.
   */
  async listPackages(labId, { search, status } = {}) {
    if (!labId) throw new Error('lab_id is required');

    const isSupabaseReady = await checkTableAvailable();
    if (isSupabaseReady) {
      try {
        let query = supabase
          .from('lab_test_packages')
          .select('*')
          .eq('lab_id', labId)
          .order('created_at', { ascending: false });

        if (status && status !== 'all') {
          query = query.eq('status', status.toLowerCase());
        }

        const { data: packages, error } = await query;
        if (!error && Array.isArray(packages)) {
          // Fetch items for these packages
          const packageIds = packages.map((p) => p.id);
          let items = [];
          if (packageIds.length > 0) {
            const { data: itemsData } = await supabase
              .from('lab_test_package_items')
              .select('package_id, test_id')
              .in('package_id', packageIds);
            items = itemsData || [];
          }

          // Fetch all tests for this lab to enrich package items
          const allLabTests = await labTestService.listTests(labId);
          const testsMap = new Map(allLabTests.map((t) => [t.id, t]));

          let enriched = packages.map((pkg) => {
            const pkgTestIds = items
              .filter((it) => it.package_id === pkg.id)
              .map((it) => it.test_id);
            const includedTests = pkgTestIds
              .map((tid) => testsMap.get(tid))
              .filter(Boolean);

            const individualTotal = includedTests.reduce(
              (sum, t) => sum + Number(t.price || 0),
              0
            );

            return {
              ...pkg,
              tests: includedTests,
              test_ids: pkgTestIds,
              test_count: includedTests.length,
              individual_total: individualTotal
            };
          });

          if (search && search.trim()) {
            const q = search.trim().toLowerCase();
            enriched = enriched.filter(
              (p) =>
                (p.package_name && p.package_name.toLowerCase().includes(q)) ||
                (p.package_code && p.package_code.toLowerCase().includes(q))
            );
          }

          return enriched;
        }
      } catch (e) {
        // Fall through to fallback
      }
    }

    return this.listPackagesFallback(labId, { search, status });
  },

  async listPackagesFallback(labId, { search, status } = {}) {
    const all = readFallbackPackages();
    let packages = all.filter((p) => p.lab_id === labId);

    if (status && status !== 'all') {
      packages = packages.filter(
        (p) => (p.status || 'active').toLowerCase() === status.toLowerCase()
      );
    }

    // Enrich with current test information from this lab
    const allLabTests = await labTestService.listTests(labId);
    const testsMap = new Map(allLabTests.map((t) => [t.id, t]));

    let enriched = packages.map((pkg) => {
      const testIds = pkg.test_ids || [];
      const includedTests = testIds.map((tid) => testsMap.get(tid)).filter(Boolean);
      const individualTotal = includedTests.reduce(
        (sum, t) => sum + Number(t.price || 0),
        0
      );

      return {
        ...pkg,
        tests: includedTests,
        test_ids: testIds,
        test_count: includedTests.length,
        individual_total: individualTotal
      };
    });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      enriched = enriched.filter(
        (p) =>
          (p.package_name && p.package_name.toLowerCase().includes(q)) ||
          (p.package_code && p.package_code.toLowerCase().includes(q))
      );
    }

    return enriched.sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
  },

  /**
   * Get single package by ID scoped strictly to the authenticated lab.
   */
  async getPackageById(labId, packageId) {
    if (!labId || !packageId) return null;

    const list = await this.listPackages(labId);
    return list.find((p) => p.id === packageId && p.lab_id === labId) || null;
  },

  /**
   * Create a new test package.
   */
  async createPackage(labId, packageData) {
    if (!labId) throw new Error('lab_id is required');

    const packageName = (packageData.package_name || packageData.packageName || '').trim();
    const packageCode = (packageData.package_code || packageData.packageCode || '')
      .trim()
      .toUpperCase();
    const description = (packageData.description || '').trim() || null;
    const packagePrice = Number(packageData.package_price ?? packageData.packagePrice);
    const status =
      (packageData.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';
    const testIds = Array.isArray(packageData.test_ids || packageData.testIds)
      ? Array.from(new Set(packageData.test_ids || packageData.testIds))
      : [];

    if (!packageName) throw new Error('Package Name is required');
    if (!packageCode) throw new Error('Package Code is required');
    if (isNaN(packagePrice) || packagePrice < 0) {
      throw new Error('Package Price must be a valid non-negative number');
    }
    if (testIds.length === 0) {
      throw new Error('At least one diagnostic test must be included in the package');
    }

    // Check package code uniqueness within this lab (per-lab uniqueness)
    const existingCode = await this.findPackageByCode(labId, packageCode);
    if (existingCode) {
      const err = new Error(
        `A package with code "${packageCode}" already exists in your laboratory.`
      );
      err.code = 'DUPLICATE_CODE';
      err.status = 409;
      throw err;
    }

    // Validate that ALL selected tests belong to THIS LAB (DATA ISOLATION)
    const allLabTests = await labTestService.listTests(labId);
    const labTestMap = new Map(allLabTests.map((t) => [t.id, t]));

    for (const tid of testIds) {
      if (!labTestMap.has(tid)) {
        const err = new Error(
          `Unauthorized: Test ID "${tid}" does not exist in your laboratory catalog.`
        );
        err.code = 'INVALID_TEST_SELECTION';
        err.status = 403;
        throw err;
      }
    }

    const packageId = crypto.randomUUID();
    const newRecord = {
      id: packageId,
      lab_id: labId,
      package_name: packageName,
      package_code: packageCode,
      description,
      package_price: packagePrice,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const isSupabaseReady = await checkTableAvailable();
    if (isSupabaseReady) {
      try {
        const { data: createdPkg, error: pkgErr } = await supabase
          .from('lab_test_packages')
          .insert(newRecord)
          .select('*')
          .single();

        if (!pkgErr && createdPkg) {
          // Insert items
          const itemsPayload = testIds.map((tid) => ({
            id: crypto.randomUUID(),
            package_id: packageId,
            test_id: tid,
            created_at: new Date().toISOString()
          }));

          await supabase.from('lab_test_package_items').insert(itemsPayload);
          return await this.getPackageById(labId, packageId);
        }

        if (pkgErr && pkgErr.code === '23505') {
          const err = new Error(
            `A package with code "${packageCode}" already exists in your laboratory.`
          );
          err.code = 'DUPLICATE_CODE';
          err.status = 409;
          throw err;
        }
      } catch (e) {
        if (e.code === 'DUPLICATE_CODE') throw e;
      }
    }

    // Fallback store
    const packages = readFallbackPackages();
    const fallbackRecord = {
      ...newRecord,
      test_ids: testIds
    };
    packages.push(fallbackRecord);
    writeFallbackPackages(packages);

    return await this.getPackageById(labId, packageId);
  },

  /**
   * Update an existing package.
   */
  async updatePackage(labId, packageId, updateData) {
    if (!labId || !packageId) throw new Error('lab_id and package_id are required');

    const current = await this.getPackageById(labId, packageId);
    if (!current) {
      const err = new Error('Package not found or access denied');
      err.status = 404;
      throw err;
    }

    const payload = {};

    if (updateData.package_name !== undefined || updateData.packageName !== undefined) {
      const name = (updateData.package_name || updateData.packageName || '').trim();
      if (!name) throw new Error('Package Name cannot be empty');
      payload.package_name = name;
    }

    if (updateData.package_code !== undefined || updateData.packageCode !== undefined) {
      const code = (updateData.package_code || updateData.packageCode || '').trim().toUpperCase();
      if (!code) throw new Error('Package Code cannot be empty');
      if (code !== current.package_code) {
        const dup = await this.findPackageByCode(labId, code);
        if (dup && dup.id !== packageId) {
          const err = new Error(
            `A package with code "${code}" already exists in your laboratory.`
          );
          err.code = 'DUPLICATE_CODE';
          err.status = 409;
          throw err;
        }
      }
      payload.package_code = code;
    }

    if (updateData.description !== undefined) {
      payload.description = (updateData.description || '').trim() || null;
    }

    if (updateData.package_price !== undefined || updateData.packagePrice !== undefined) {
      const price = Number(updateData.package_price ?? updateData.packagePrice);
      if (isNaN(price) || price < 0) {
        throw new Error('Package Price must be a valid non-negative number');
      }
      payload.package_price = price;
    }

    if (updateData.status !== undefined) {
      payload.status =
        (updateData.status || '').toLowerCase() === 'inactive' ? 'inactive' : 'active';
    }

    payload.updated_at = new Date().toISOString();

    // Check if test_ids are being updated
    let newTestIds = null;
    if (updateData.test_ids !== undefined || updateData.testIds !== undefined) {
      const raw = updateData.test_ids || updateData.testIds;
      if (Array.isArray(raw)) {
        newTestIds = Array.from(new Set(raw));
        if (newTestIds.length === 0) {
          throw new Error('At least one diagnostic test must be included in the package');
        }

        // Validate that all test IDs belong to THIS lab
        const allLabTests = await labTestService.listTests(labId);
        const labTestMap = new Map(allLabTests.map((t) => [t.id, t]));

        for (const tid of newTestIds) {
          if (!labTestMap.has(tid)) {
            const err = new Error(
              `Unauthorized: Test ID "${tid}" does not exist in your laboratory catalog.`
            );
            err.code = 'INVALID_TEST_SELECTION';
            err.status = 403;
            throw err;
          }
        }
      }
    }

    const isSupabaseReady = await checkTableAvailable();
    if (isSupabaseReady) {
      try {
        const { error: pkgErr } = await supabase
          .from('lab_test_packages')
          .update(payload)
          .eq('id', packageId)
          .eq('lab_id', labId);

        if (!pkgErr) {
          if (newTestIds) {
            // Delete old items & insert new
            await supabase
              .from('lab_test_package_items')
              .delete()
              .eq('package_id', packageId);

            const itemsPayload = newTestIds.map((tid) => ({
              id: crypto.randomUUID(),
              package_id: packageId,
              test_id: tid,
              created_at: new Date().toISOString()
            }));
            await supabase.from('lab_test_package_items').insert(itemsPayload);
          }
          return await this.getPackageById(labId, packageId);
        }
      } catch (e) {
        if (e.code === 'DUPLICATE_CODE') throw e;
      }
    }

    // Fallback store update
    const packages = readFallbackPackages();
    const idx = packages.findIndex((p) => p.id === packageId && p.lab_id === labId);
    if (idx === -1) {
      const err = new Error('Package not found');
      err.status = 404;
      throw err;
    }

    packages[idx] = {
      ...packages[idx],
      ...payload,
      ...(newTestIds ? { test_ids: newTestIds } : {})
    };
    writeFallbackPackages(packages);

    return await this.getPackageById(labId, packageId);
  },

  /**
   * Helper: Find package by code within a lab.
   */
  async findPackageByCode(labId, packageCode) {
    if (!labId || !packageCode) return null;
    const cleanCode = packageCode.trim().toUpperCase();

    const isSupabaseReady = await checkTableAvailable();
    if (isSupabaseReady) {
      try {
        const { data, error } = await supabase
          .from('lab_test_packages')
          .select('id, package_code, lab_id')
          .eq('lab_id', labId)
          .ilike('package_code', cleanCode)
          .maybeSingle();

        if (!error && data) return data;
      } catch (e) {}
    }

    const packages = readFallbackPackages();
    return (
      packages.find(
        (p) =>
          p.lab_id === labId && (p.package_code || '').toUpperCase() === cleanCode
      ) || null
    );
  }
};
