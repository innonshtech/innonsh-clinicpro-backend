import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICE_DATA_DIR = path.resolve(__dirname, '../../data');
const CWD_DATA_DIR = path.resolve(process.cwd(), 'data');

function resolveFallbackFile(filename) {
  const serviceFile = path.join(SERVICE_DATA_DIR, filename);
  const cwdFile = path.join(CWD_DATA_DIR, filename);
  if (fs.existsSync(serviceFile)) return serviceFile;
  if (fs.existsSync(cwdFile)) return cwdFile;
  return serviceFile;
}

function readJsonFile(filename) {
  try {
    const file = resolveFallbackFile(filename);
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (err) {}
  return [];
}

/**
 * Parse time range into start and end Date objects
 */
function parseDateRange(range = '7d', startDateStr = null, endDateStr = null) {
  const now = new Date();
  let start = new Date();
  let end = new Date();

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case '7d':
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case '30d':
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'custom':
      if (startDateStr) {
        const parsedStart = new Date(startDateStr.includes('T') ? startDateStr : `${startDateStr}T00:00:00`);
        if (!isNaN(parsedStart.getTime())) {
          start = parsedStart;
          start.setHours(0, 0, 0, 0);
        } else {
          start.setDate(now.getDate() - 6);
          start.setHours(0, 0, 0, 0);
        }
      } else {
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);
      }
      if (endDateStr) {
        const parsedEnd = new Date(endDateStr.includes('T') ? endDateStr : `${endDateStr}T23:59:59.999`);
        if (!isNaN(parsedEnd.getTime())) {
          end = parsedEnd;
          end.setHours(23, 59, 59, 999);
        } else {
          end.setHours(23, 59, 59, 999);
        }
      } else {
        end.setHours(23, 59, 59, 999);
      }
      if (start > end) {
        const tmp = start;
        start = end;
        end = tmp;
      }
      break;
    default:
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return { start, end };
}

function isDateInRange(dateStr, start, end) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getRecordLocalDateKey(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return formatDateKey(d);
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

export const labAnalyticsService = {
  /**
   * Get complete laboratory analytics overview scoped strictly by authenticated labId.
   */
  async getAnalyticsOverview(labId, options = {}) {
    if (!labId) {
      throw new Error('Unauthorized: Laboratory identity missing');
    }

    const { range = '7d', startDate = null, endDate = null } = options;
    const { start, end } = parseDateRange(range, startDate, endDate);

    // 1. Fetch Orders
    let orders = [];
    try {
      const { data, error } = await supabase
        .from('lab_orders')
        .select('*')
        .eq('lab_id', labId);
      if (!error && Array.isArray(data) && data.length > 0) {
        orders = data;
      } else {
        orders = readJsonFile('lab_orders.json').filter((o) => o.lab_id === labId);
      }
    } catch (e) {
      orders = readJsonFile('lab_orders.json').filter((o) => o.lab_id === labId);
    }

    // 2. Fetch Samples
    let samples = [];
    try {
      const { data, error } = await supabase
        .from('lab_samples')
        .select('*')
        .eq('lab_id', labId);
      if (!error && Array.isArray(data) && data.length > 0) {
        samples = data;
      } else {
        samples = readJsonFile('lab_samples.json').filter((s) => s.lab_id === labId);
      }
    } catch (e) {
      samples = readJsonFile('lab_samples.json').filter((s) => s.lab_id === labId);
    }

    // 3. Fetch Results
    let results = [];
    try {
      const { data, error } = await supabase
        .from('lab_results')
        .select('*')
        .eq('lab_id', labId);
      if (!error && Array.isArray(data) && data.length > 0) {
        results = data;
      } else {
        results = readJsonFile('lab_results.json').filter((r) => r.lab_id === labId);
      }
    } catch (e) {
      results = readJsonFile('lab_results.json').filter((r) => r.lab_id === labId);
    }

    // 4. Fetch Reports
    let reports = [];
    try {
      const { data, error } = await supabase
        .from('lab_reports')
        .select('*')
        .eq('lab_id', labId);
      if (!error && Array.isArray(data) && data.length > 0) {
        reports = data;
      } else {
        reports = readJsonFile('lab_reports.json').filter((rep) => rep.lab_id === labId);
      }
    } catch (e) {
      reports = readJsonFile('lab_reports.json').filter((rep) => rep.lab_id === labId);
    }

    // 5. Fetch Tests catalog for category mapping
    let testsCatalog = [];
    try {
      const { data, error } = await supabase.from('lab_tests').select('*').eq('lab_id', labId);
      if (!error && Array.isArray(data) && data.length > 0) {
        testsCatalog = data;
      } else {
        testsCatalog = readJsonFile('lab_tests.json').filter((t) => !t.lab_id || t.lab_id === labId);
      }
    } catch (e) {
      testsCatalog = readJsonFile('lab_tests.json').filter((t) => !t.lab_id || t.lab_id === labId);
    }
    const testCategoryMap = new Map();
    testsCatalog.forEach((t) => {
      const name = (t.name || t.test_name || '').trim().toLowerCase();
      if (name) testCategoryMap.set(name, t.category || 'General');
      if (t.id) testCategoryMap.set(t.id, t.category || 'General');
    });

    // ----------------------------------------------------
    // Filter entities within the selected time window
    // ----------------------------------------------------
    const filteredOrders = orders.filter((o) =>
      isDateInRange(o.created_at || o.order_date, start, end)
    );

    const filteredSamples = samples.filter((s) =>
      isDateInRange(s.created_at || s.collected_at || s.received_at, start, end)
    );

    const filteredResults = results.filter((r) =>
      isDateInRange(r.created_at || r.entered_at || r.validated_at, start, end)
    );

    const filteredReports = reports.filter((rep) =>
      isDateInRange(rep.created_at || rep.issued_at || rep.generated_at, start, end)
    );

    // ----------------------------------------------------
    // KPI Cards Calculations
    // ----------------------------------------------------
    const totalOrders = filteredOrders.length;
    let pendingOrders = 0;
    let acceptedOrders = 0;
    let rejectedOrders = 0;

    filteredOrders.forEach((o) => {
      const st = (o.status || '').toLowerCase();
      if (['pending', 'draft', 'created'].includes(st)) {
        pendingOrders++;
      } else if (['accepted', 'completed', 'in_progress', 'received'].includes(st)) {
        acceptedOrders++;
      } else if (['rejected', 'cancelled'].includes(st)) {
        rejectedOrders++;
      } else {
        // default treat active as accepted
        acceptedOrders++;
      }
    });

    // Samples collected / received
    let samplesCollected = 0;
    let samplesReceived = 0;
    let samplesRejected = 0;
    let samplesPending = 0;
    let samplesRecollection = 0;

    filteredSamples.forEach((s) => {
      const cs = (s.collection_status || '').toLowerCase();
      if (cs === 'collected') samplesCollected++;
      else if (cs === 'received') samplesReceived++;
      else if (cs === 'rejected') samplesRejected++;
      else if (cs === 'recollection_requested') samplesRecollection++;
      else samplesPending++;
    });

    const samplesCollectedReceived = samplesCollected + samplesReceived;

    // Tests completed (validated or corrected parameters, excluding superseded records)
    const testsCompleted = filteredResults.filter(
      (r) => r.is_corrected !== true && ['validated', 'corrected'].includes((r.status || '').toLowerCase())
    ).length;

    // Reports issued
    const reportsIssued = filteredReports.filter((rep) =>
      ['issued', 'final', 'completed'].includes((rep.report_status || '').toLowerCase())
    ).length;

    // Critical panic findings (active, non-superseded)
    const activeCriticalFindings = filteredResults.filter(
      (r) => r.is_corrected !== true && r.is_critical === true
    );
    const criticalResults = activeCriticalFindings.length;
    const criticalAcknowledged = activeCriticalFindings.filter(
      (r) => r.critical_acknowledged === true
    ).length;

    // ----------------------------------------------------
    // Trend Charts (Daily series within range)
    // ----------------------------------------------------
    const dateMap = new Map();
    // Initialize day buckets with a 366-day safety guard
    const cur = new Date(start);
    let loopGuard = 0;
    while (cur <= end && loopGuard < 366) {
      loopGuard++;
      const key = formatDateKey(cur);
      dateMap.set(key, {
        date: key,
        label: formatDateLabel(key),
        orders: 0,
        samples: 0,
        reports: 0
      });
      cur.setDate(cur.getDate() + 1);
    }

    filteredOrders.forEach((o) => {
      const dStr = getRecordLocalDateKey(o.created_at || o.order_date);
      if (dStr && dateMap.has(dStr)) {
        dateMap.get(dStr).orders += 1;
      }
    });

    filteredSamples.forEach((s) => {
      const dStr = getRecordLocalDateKey(s.created_at || s.collected_at || s.received_at);
      if (dStr && dateMap.has(dStr)) {
        dateMap.get(dStr).samples += 1;
      }
    });

    filteredReports.forEach((rep) => {
      const dStr = getRecordLocalDateKey(rep.created_at || rep.issued_at || rep.generated_at);
      if (dStr && dateMap.has(dStr)) {
        dateMap.get(dStr).reports += 1;
      }
    });

    const timeSeries = Array.from(dateMap.values());

    // ----------------------------------------------------
    // Order Status Distribution
    // ----------------------------------------------------
    const orderStatusCounts = {
      pending: pendingOrders,
      accepted: acceptedOrders,
      rejected: rejectedOrders
    };
    const orderStatusDistribution = [
      {
        status: 'pending',
        label: 'Pending',
        count: pendingOrders,
        percentage: totalOrders > 0 ? Math.round((pendingOrders / totalOrders) * 100) : 0,
        color: '#f59e0b'
      },
      {
        status: 'accepted',
        label: 'Accepted / Active',
        count: acceptedOrders,
        percentage: totalOrders > 0 ? Math.round((acceptedOrders / totalOrders) * 100) : 0,
        color: '#10b981'
      },
      {
        status: 'rejected',
        label: 'Rejected / Cancelled',
        count: rejectedOrders,
        percentage: totalOrders > 0 ? Math.round((rejectedOrders / totalOrders) * 100) : 0,
        color: '#ef4444'
      }
    ];

    // ----------------------------------------------------
    // Sample Workflow Distribution
    // ----------------------------------------------------
    const totalSamples = filteredSamples.length;
    const sampleWorkflowDistribution = [
      {
        status: 'received',
        label: 'Received in Lab',
        count: samplesReceived,
        percentage: totalSamples > 0 ? Math.round((samplesReceived / totalSamples) * 100) : 0,
        color: '#0d9488'
      },
      {
        status: 'collected',
        label: 'Collected / In Transit',
        count: samplesCollected,
        percentage: totalSamples > 0 ? Math.round((samplesCollected / totalSamples) * 100) : 0,
        color: '#0284c7'
      },
      {
        status: 'pending_collection',
        label: 'Pending Collection',
        count: samplesPending,
        percentage: totalSamples > 0 ? Math.round((samplesPending / totalSamples) * 100) : 0,
        color: '#f59e0b'
      },
      {
        status: 'rejected',
        label: 'Rejected',
        count: samplesRejected,
        percentage: totalSamples > 0 ? Math.round((samplesRejected / totalSamples) * 100) : 0,
        color: '#ef4444'
      },
      {
        status: 'recollection_requested',
        label: 'Recollection Requested',
        count: samplesRecollection,
        percentage: totalSamples > 0 ? Math.round((samplesRecollection / totalSamples) * 100) : 0,
        color: '#8b5cf6'
      }
    ];

    // ----------------------------------------------------
    // Tests Performed by Name & Category
    // ----------------------------------------------------
    const testCountMap = new Map();
    const categoryCountMap = new Map();

    // From non-cancelled/rejected orders line items
    filteredOrders
      .filter((o) => !['cancelled', 'rejected'].includes((o.status || '').toLowerCase()))
      .forEach((o) => {
        const items = Array.isArray(o.items) ? o.items : [];
        items.forEach((item) => {
          const testName = item.item_name || item.test_name || item.name || 'Laboratory Test';
          const qty = Number(item.quantity) || 1;
          const testId = item.test_id || item.id;
          const cat =
            testCategoryMap.get(testId) ||
            testCategoryMap.get(testName.toLowerCase()) ||
            'Diagnostic Pathology';

          testCountMap.set(testName, (testCountMap.get(testName) || 0) + qty);
          categoryCountMap.set(cat, (categoryCountMap.get(cat) || 0) + qty);
        });
      });

    // If order items were empty, fall back to active result parameters
    if (testCountMap.size === 0 && filteredResults.length > 0) {
      filteredResults
        .filter((r) => r.is_corrected !== true)
        .forEach((r) => {
          const testName = r.test_name || r.parameter_name || 'Laboratory Test';
          const cat =
            testCategoryMap.get(r.test_id) ||
            testCategoryMap.get(testName.toLowerCase()) ||
            'Diagnostic Pathology';
          testCountMap.set(testName, (testCountMap.get(testName) || 0) + 1);
          categoryCountMap.set(cat, (categoryCountMap.get(cat) || 0) + 1);
        });
    }

    const topTests = Array.from(testCountMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const testsByCategory = Array.from(categoryCountMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // ----------------------------------------------------
    // Critical vs Normal Results Ratio
    // ----------------------------------------------------
    const activeResults = filteredResults.filter((r) => r.is_corrected !== true);
    const totalResultsCount = activeResults.length;
    const normalResultsCount = Math.max(0, totalResultsCount - criticalResults);
    const criticalRatio = {
      total: totalResultsCount,
      critical: criticalResults,
      normal: normalResultsCount,
      critical_acknowledged: criticalAcknowledged,
      critical_percentage:
        totalResultsCount > 0 ? Math.round((criticalResults / totalResultsCount) * 100) : 0,
      normal_percentage:
        totalResultsCount > 0 ? Math.round((normalResultsCount / totalResultsCount) * 100) : 0
    };

    // ----------------------------------------------------
    // Recent Lab Workflow Activity Feed (De-identified)
    // ----------------------------------------------------
    const activities = [];

    // Order events
    filteredOrders.slice(0, 10).forEach((o) => {
      activities.push({
        id: `ord-${o.id}`,
        type: 'order',
        title: `Lab Order ${o.order_number || 'ORD'}`,
        description: `Order status: ${o.status || 'Received'} (${o.items?.length || 1} test item(s))`,
        timestamp: o.created_at || o.order_date,
        badgeColor: 'blue'
      });
    });

    // Sample events
    filteredSamples.slice(0, 10).forEach((s) => {
      activities.push({
        id: `smp-${s.id}`,
        type: 'sample',
        title: `Specimen ${s.barcode || 'SMP'}`,
        description: `${s.sample_type || 'Sample'} • Status: ${s.collection_status || 'collected'}`,
        timestamp: s.received_at || s.collected_at || s.created_at,
        badgeColor: s.collection_status === 'rejected' ? 'rose' : 'cyan'
      });
    });

    // Critical panic alerts (active, non-superseded)
    filteredResults
      .filter((r) => r.is_corrected !== true && r.is_critical)
      .slice(0, 10)
      .forEach((r) => {
        activities.push({
          id: `crit-${r.id}`,
          type: 'critical',
          title: `Critical Panic Alert: ${r.parameter_name || r.test_name}`,
          description: `Result: ${r.result_value} ${r.unit || ''} • ${r.critical_acknowledged ? 'Acknowledged' : 'Pending Call'}`,
          timestamp: r.critical_flagged_at || r.entered_at || r.created_at,
          badgeColor: 'red'
        });
      });

    // Report events
    filteredReports.slice(0, 10).forEach((rep) => {
      activities.push({
        id: `rep-${rep.id}`,
        type: 'report',
        title: `Report ${rep.report_number || 'Issued'}`,
        description: `Diagnostic report status: ${rep.report_status || 'Issued'}`,
        timestamp: rep.issued_at || rep.generated_at || rep.created_at,
        badgeColor: 'teal'
      });
    });

    // Sort all activities descending by timestamp
    activities.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    const recentActivity = activities.slice(0, 12);

    return {
      time_range: {
        range,
        start_date: start.toISOString(),
        end_date: end.toISOString()
      },
      kpis: {
        total_orders: totalOrders,
        pending_orders: pendingOrders,
        accepted_orders: acceptedOrders,
        rejected_orders: rejectedOrders,
        samples_collected_received: samplesCollectedReceived,
        samples_collected: samplesCollected,
        samples_received: samplesReceived,
        samples_rejected: samplesRejected,
        samples_recollection: samplesRecollection,
        tests_completed: testsCompleted,
        reports_issued: reportsIssued,
        critical_results: criticalResults,
        critical_acknowledged: criticalAcknowledged
      },
      charts: {
        orders_trend: timeSeries.map((t) => ({ date: t.date, label: t.label, count: t.orders })),
        reports_trend: timeSeries.map((t) => ({ date: t.date, label: t.label, count: t.reports })),
        samples_trend: timeSeries.map((t) => ({ date: t.date, label: t.label, count: t.samples })),
        order_status_distribution: orderStatusDistribution,
        sample_workflow_distribution: sampleWorkflowDistribution,
        top_tests: topTests,
        tests_by_category: testsByCategory,
        critical_vs_normal: criticalRatio
      },
      recent_activity: recentActivity
    };
  }
};
