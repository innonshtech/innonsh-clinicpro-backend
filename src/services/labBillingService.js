import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { supabase } from '../lib/supabase.js';
import { generateInvoicePdf } from '../utils/pdfInvoiceGenerator.js';

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

function ensureFallbackFiles() {
  const invoiceFile = resolveFallbackFile('lab_invoices.json');
  const paymentFile = resolveFallbackFile('lab_payments.json');
  const dir = path.dirname(invoiceFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(invoiceFile)) {
    fs.writeFileSync(invoiceFile, '[]', 'utf8');
  }
  if (!fs.existsSync(paymentFile)) {
    fs.writeFileSync(paymentFile, '[]', 'utf8');
  }
}

function readFallbackInvoices() {
  try {
    const file = resolveFallbackFile('lab_invoices.json');
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (err) {
    return [];
  }
  return [];
}

function writeFallbackInvoices(invoices) {
  try {
    ensureFallbackFiles();
    const file = resolveFallbackFile('lab_invoices.json');
    fs.writeFileSync(file, JSON.stringify(invoices, null, 2), 'utf8');
  } catch (err) {
    console.error('[LabBillingService] Error writing invoices fallback:', err);
  }
}

function readFallbackPayments() {
  try {
    const file = resolveFallbackFile('lab_payments.json');
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (err) {
    return [];
  }
  return [];
}

function writeFallbackPayments(payments) {
  try {
    ensureFallbackFiles();
    const file = resolveFallbackFile('lab_payments.json');
    fs.writeFileSync(file, JSON.stringify(payments, null, 2), 'utf8');
  } catch (err) {
    console.error('[LabBillingService] Error writing payments fallback:', err);
  }
}

function readFallbackOrders() {
  try {
    const file = resolveFallbackFile('lab_orders.json');
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (err) {}
  return [];
}

let tableCheckedAt = 0;
let tableAvailable = null;

async function checkBillingTableAvailable() {
  const now = Date.now();
  if (tableAvailable === true) return true;
  if (tableAvailable === false && now - tableCheckedAt < 30000) {
    return false;
  }
  try {
    tableCheckedAt = now;
    const { error } = await supabase.from('lab_invoices').select('id').limit(1);
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

function roundToTwo(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

function generateInvoiceNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `INV-${dateStr}-${rand}`;
}

function generatePaymentNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `PAY-${dateStr}-${rand}`;
}

export const labBillingService = {
  /**
   * Get financial summary metrics calculated from persisted records.
   */
  async getBillingSummary(labId) {
    if (!labId) throw new Error('Unauthorized: Laboratory identity missing');

    const hasDb = await checkBillingTableAvailable();
    let invoices = [];

    if (hasDb) {
      const { data, error } = await supabase
        .from('lab_invoices')
        .select('*')
        .eq('lab_id', labId);
      if (!error && data) {
        invoices = data;
      }
    } else {
      invoices = readFallbackInvoices().filter((inv) => inv.lab_id === labId);
    }

    // Filter non-cancelled for revenue calculation
    const activeInvoices = invoices.filter((inv) => inv.status !== 'cancelled');

    const totalRevenue = activeInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
    const paidAmount = activeInvoices.reduce((sum, inv) => sum + Number(inv.paid_amount || 0), 0);
    const pendingAmount = activeInvoices.reduce((sum, inv) => sum + Number(inv.balance_amount || 0), 0);
    const totalInvoices = invoices.length;

    const countsByStatus = {
      all: totalInvoices,
      issued: invoices.filter((i) => i.status === 'issued').length,
      partially_paid: invoices.filter((i) => i.status === 'partially_paid').length,
      paid: invoices.filter((i) => i.status === 'paid').length,
      draft: invoices.filter((i) => i.status === 'draft').length,
      cancelled: invoices.filter((i) => i.status === 'cancelled').length
    };

    return {
      total_revenue: roundToTwo(totalRevenue),
      paid_amount: roundToTwo(paidAmount),
      pending_amount: roundToTwo(pendingAmount),
      total_invoices: totalInvoices,
      status_counts: countsByStatus
    };
  },

  /**
   * List invoices scoped strictly to authenticated lab tenant.
   */
  async listInvoices(labId, { search = '', status = 'all', page = 1, limit = 50 } = {}) {
    if (!labId) throw new Error('Unauthorized: Laboratory identity missing');

    const hasDb = await checkBillingTableAvailable();
    let invoices = [];

    if (hasDb) {
      let query = supabase
        .from('lab_invoices')
        .select('*')
        .eq('lab_id', labId)
        .order('issued_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status.toLowerCase());
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`Database error listing invoices: ${error.message}`);
      }
      invoices = data || [];
    } else {
      invoices = readFallbackInvoices().filter((inv) => inv.lab_id === labId);
      if (status && status !== 'all') {
        invoices = invoices.filter((inv) => (inv.status || '').toLowerCase() === status.toLowerCase());
      }
      invoices.sort((a, b) => new Date(b.issued_at || 0) - new Date(a.issued_at || 0));
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      invoices = invoices.filter((inv) => {
        const invNo = (inv.invoice_number || '').toLowerCase();
        const ordNo = (inv.order_number || '').toLowerCase();
        const patName = (inv.patient_name || '').toLowerCase();
        const patCode = (inv.patient_code || '').toLowerCase();
        const clinicName = (inv.clinic_name || '').toLowerCase();
        return (
          invNo.includes(q) ||
          ordNo.includes(q) ||
          patName.includes(q) ||
          patCode.includes(q) ||
          clinicName.includes(q)
        );
      });
    }

    return invoices;
  },

  /**
   * Get single invoice by ID with linked payment history.
   */
  async getInvoiceById(labId, invoiceId) {
    if (!labId || !invoiceId) return null;

    const hasDb = await checkBillingTableAvailable();
    let invoice = null;
    let payments = [];

    if (hasDb) {
      const { data, error } = await supabase
        .from('lab_invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('lab_id', labId)
        .maybeSingle();

      if (error) throw new Error(`Database error fetching invoice: ${error.message}`);
      if (!data) return null;
      invoice = data;

      const { data: pData } = await supabase
        .from('lab_payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .eq('lab_id', labId)
        .order('payment_date', { ascending: false });
      payments = pData || [];
    } else {
      const allInvoices = readFallbackInvoices();
      invoice = allInvoices.find((inv) => inv.id === invoiceId && inv.lab_id === labId) || null;
      if (!invoice) return null;

      const allPayments = readFallbackPayments();
      payments = allPayments.filter((p) => p.invoice_id === invoiceId && p.lab_id === labId);
      payments.sort((a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0));
    }

    return {
      ...invoice,
      payments
    };
  },

  /**
   * Get eligible lab orders for invoice creation.
   * Returns orders that do NOT already have an active invoice.
   */
  async getEligibleOrdersForBilling(labId) {
    if (!labId) throw new Error('Unauthorized: Laboratory identity missing');

    // 1. Get existing non-cancelled invoice order_ids for this lab
    const existingInvoices = await this.listInvoices(labId);
    const invoicedOrderIds = new Set(
      existingInvoices
        .filter((inv) => inv.status !== 'cancelled')
        .map((inv) => inv.order_id)
    );

    // 2. Fetch lab orders for this lab
    let orders = [];
    try {
      const { data, error } = await supabase
        .from('lab_orders')
        .select('*')
        .eq('lab_id', labId);
      if (!error && Array.isArray(data) && data.length > 0) {
        orders = data;
      } else {
        orders = readFallbackOrders().filter((o) => o.lab_id === labId);
      }
    } catch (e) {
      orders = readFallbackOrders().filter((o) => o.lab_id === labId);
    }

    // 3. Filter orders that are eligible (not cancelled/rejected, not already invoiced)
    const eligibleOrders = orders.filter((o) => {
      if (invoicedOrderIds.has(o.id)) return false;
      const st = (o.status || '').toLowerCase();
      return st !== 'cancelled' && st !== 'rejected';
    });

    return eligibleOrders.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      created_at: o.created_at,
      patient: o.patient || {
        first_name: 'Patient',
        last_name: '',
        patient_code: 'N/A'
      },
      clinic: o.clinic || null,
      doctor: o.doctor || null,
      total_amount: Number(o.total_amount || 0),
      items: o.items || []
    }));
  },

  /**
   * Create an invoice from an eligible lab order.
   * Prevents duplicate invoices for the same order within the lab tenant.
   */
  async createInvoice(labId, payload, authUser) {
    if (!labId) throw new Error('Unauthorized: Laboratory identity missing');

    const {
      order_id,
      notes = '',
      due_date = null,
      status = 'issued'
    } = payload;
    const discount = payload.discount !== undefined ? payload.discount : (payload.discount_amount ?? 0);
    const tax = payload.tax !== undefined ? payload.tax : (payload.tax_amount ?? 0);

    if (!order_id) throw new Error('order_id is required to create an invoice');

    // 1. Check duplicate prevention
    const existingInvoices = await this.listInvoices(labId);
    const duplicate = existingInvoices.find(
      (inv) => inv.order_id === order_id && inv.status !== 'cancelled'
    );
    if (duplicate) {
      const err = new Error(
        `An active invoice (${duplicate.invoice_number}) already exists for this laboratory order.`
      );
      err.status = 409;
      throw err;
    }

    // 2. Fetch the associated order
    let order = null;
    try {
      const { data, error } = await supabase
        .from('lab_orders')
        .select('*')
        .eq('id', order_id)
        .eq('lab_id', labId)
        .maybeSingle();
      if (!error && data) {
        order = data;
      }
    } catch (e) {}

    if (!order) {
      order = readFallbackOrders().find((o) => o.id === order_id && o.lab_id === labId);
    }

    if (!order) {
      const err = new Error('Laboratory order not found or access denied');
      err.status = 404;
      throw err;
    }

    // 3. Build line items with valid pricing
    const orderItems = Array.isArray(order.items) && order.items.length > 0 ? order.items : [];
    const lineItems = orderItems.map((item, idx) => {
      const unitPrice = roundToTwo(Number(item.price || item.package_price || item.unit_price || 0));
      const qty = Number(item.quantity) || 1;
      const totalPrice = roundToTwo(unitPrice * qty);
      return {
        id: item.id || crypto.randomUUID(),
        item_type: item.item_type || (item.package_id ? 'package' : 'test'),
        item_id: item.test_id || item.package_id || item.id || `item-${idx + 1}`,
        item_name: item.item_name || item.name || item.test_name || item.package_name || 'Laboratory Service',
        item_code: item.item_code || item.code || item.test_code || item.package_code || 'LAB-SVC',
        quantity: qty,
        unit_price: unitPrice,
        total_price: totalPrice
      };
    });

    // 4. Calculate subtotal and final totals
    const calculatedSubtotal = roundToTwo(
      lineItems.reduce((acc, item) => acc + item.total_price, 0)
    );
    const subtotalAmt = calculatedSubtotal > 0 ? calculatedSubtotal : roundToTwo(Number(order.total_amount || 0));

    const numDiscount = Math.max(0, roundToTwo(Number(discount || 0)));
    const numTax = Math.max(0, roundToTwo(Number(tax || 0)));

    if (numDiscount > subtotalAmt) {
      throw new Error(`Discount (₹${numDiscount}) cannot exceed the subtotal amount (₹${subtotalAmt})`);
    }

    const totalAmount = roundToTwo(subtotalAmt - numDiscount + numTax);

    // 5. Patient details extraction
    const p = order.patient || {};
    const patientName = order.patient_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Patient';
    const patientCode = order.patient_code || order.patient_id || p.patient_code || p.mrn || 'N/A';
    const patientPhone = order.patient_phone || p.phone_number || p.phone || '';
    const patientGender = order.patient_gender || p.gender || '';
    const patientDob = order.patient_age ? `${order.patient_age} yrs` : (p.date_of_birth || p.dob || '');

    // Clinic / Doctor extraction
    const clinicName = order.clinic?.clinic_name || order.clinic_name || null;
    const clinicId = order.clinic?.id || order.clinic_id || null;
    const doctorName = order.doctor_name || (order.doctor
      ? `Dr. ${order.doctor.first_name || ''} ${order.doctor.last_name || ''}`.trim()
      : null);
    const doctorId = order.doctor?.id || order.doctor_id || null;

    const nowIso = new Date().toISOString();
    const invoiceNumber = generateInvoiceNumber();

    const newInvoice = {
      id: crypto.randomUUID(),
      invoice_number: invoiceNumber,
      lab_id: labId,
      order_id: order.id,
      order_number: order.order_number,
      patient_id: p.id || order.patient_id || null,
      patient_name: patientName,
      patient_code: patientCode,
      patient_phone: patientPhone,
      patient_gender: patientGender,
      patient_dob: patientDob,
      clinic_id: clinicId,
      clinic_name: clinicName,
      doctor_id: doctorId,
      doctor_name: doctorName,
      items: lineItems,
      subtotal: subtotalAmt,
      discount: numDiscount,
      tax: numTax,
      total_amount: totalAmount,
      paid_amount: 0.00,
      balance_amount: totalAmount,
      status: ['draft', 'issued'].includes(status) ? status : 'issued',
      notes: (notes || '').trim() || null,
      issued_at: nowIso,
      due_date: due_date ? new Date(due_date).toISOString() : null,
      created_by: authUser?.id || null,
      created_at: nowIso,
      updated_at: nowIso
    };

    const hasDb = await checkBillingTableAvailable();
    if (hasDb) {
      const { error: insErr } = await supabase.from('lab_invoices').insert(newInvoice);
      if (insErr) {
        throw new Error(`Database error saving invoice: ${insErr.message}`);
      }
    } else {
      const allInvoices = readFallbackInvoices();
      allInvoices.unshift(newInvoice);
      writeFallbackInvoices(allInvoices);
    }

    return newInvoice;
  },

  /**
   * Record a full or partial payment against an invoice.
   * Recalculates outstanding balance and updates status on the server.
   * Prevents negative amounts, overpayments, and duplicate submissions.
   */
  async recordPayment(labId, invoiceId, payload, authUser) {
    if (!labId || !invoiceId) throw new Error('Lab ID and Invoice ID are required');

    const invoice = await this.getInvoiceById(labId, invoiceId);
    if (!invoice) {
      const err = new Error('Invoice not found or access denied');
      err.status = 404;
      throw err;
    }

    if (invoice.status === 'cancelled') {
      const err = new Error('Cannot record payment: Invoice has been cancelled');
      err.status = 400;
      throw err;
    }

    if (invoice.status === 'paid' || invoice.balance_amount <= 0) {
      const err = new Error('This invoice is already fully paid. Outstanding balance is ₹0.00');
      err.status = 400;
      throw err;
    }

    const {
      amount,
      payment_date = new Date().toISOString(),
      payment_method = 'cash',
      transaction_reference = '',
      notes = ''
    } = payload;

    const numAmount = roundToTwo(Number(amount));

    // 1. Validation: positive amount
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Payment amount must be a positive number greater than zero');
    }

    // 2. Validation: prevent overpayment
    const currentBalance = roundToTwo(Number(invoice.balance_amount || 0));
    if (numAmount > currentBalance) {
      const err = new Error(
        `Payment amount (₹${numAmount.toFixed(2)}) exceeds outstanding balance of ₹${currentBalance.toFixed(2)}.`
      );
      err.status = 400;
      throw err;
    }

    // 3. Validation: payment method
    const validMethods = ['cash', 'card', 'upi', 'bank_transfer', 'cheque', 'other'];
    const normMethod = (payment_method || 'cash').toLowerCase();
    if (!validMethods.includes(normMethod)) {
      throw new Error(`Invalid payment method "${payment_method}". Allowed methods: ${validMethods.join(', ')}`);
    }

    // 4. Calculate new amounts and status
    const currentPaid = roundToTwo(Number(invoice.paid_amount || 0));
    const newPaidAmount = roundToTwo(currentPaid + numAmount);
    const newBalanceAmount = roundToTwo(Number(invoice.total_amount) - newPaidAmount);

    let newStatus = 'partially_paid';
    if (newBalanceAmount <= 0.001) {
      newStatus = 'paid';
    }

    const nowIso = new Date().toISOString();
    const paymentNumber = generatePaymentNumber();

    const newPayment = {
      id: crypto.randomUUID(),
      lab_id: labId,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      payment_number: paymentNumber,
      amount: numAmount,
      payment_date: payment_date ? new Date(payment_date).toISOString() : nowIso,
      payment_method: normMethod,
      transaction_reference: (transaction_reference || '').trim() || null,
      notes: (notes || '').trim() || null,
      recorded_by: authUser?.id || null,
      created_at: nowIso
    };

    const hasDb = await checkBillingTableAvailable();
    if (hasDb) {
      // Insert payment
      const { error: pErr } = await supabase.from('lab_payments').insert(newPayment);
      if (pErr) throw new Error(`Database error recording payment: ${pErr.message}`);

      // Update invoice
      const { error: updErr } = await supabase
        .from('lab_invoices')
        .update({
          paid_amount: newPaidAmount,
          balance_amount: newBalanceAmount,
          status: newStatus,
          updated_at: nowIso
        })
        .eq('id', invoice.id)
        .eq('lab_id', labId);

      if (updErr) throw new Error(`Database error updating invoice balance: ${updErr.message}`);
    } else {
      // Fallback payments
      const allPayments = readFallbackPayments();
      allPayments.unshift(newPayment);
      writeFallbackPayments(allPayments);

      // Fallback invoices
      const allInvoices = readFallbackInvoices();
      const idx = allInvoices.findIndex((inv) => inv.id === invoice.id && inv.lab_id === labId);
      if (idx !== -1) {
        allInvoices[idx].paid_amount = newPaidAmount;
        allInvoices[idx].balance_amount = newBalanceAmount;
        allInvoices[idx].status = newStatus;
        allInvoices[idx].updated_at = nowIso;
        writeFallbackInvoices(allInvoices);
      }
    }

    const updatedInvoice = await this.getInvoiceById(labId, invoiceId);
    return {
      payment: newPayment,
      invoice: updatedInvoice
    };
  },

  /**
   * Cancel an invoice if no payments have been recorded.
   */
  async cancelInvoice(labId, invoiceId, reason, authUser) {
    if (!labId || !invoiceId) throw new Error('Lab ID and Invoice ID are required');

    const invoice = await this.getInvoiceById(labId, invoiceId);
    if (!invoice) {
      const err = new Error('Invoice not found or access denied');
      err.status = 404;
      throw err;
    }

    if (invoice.status === 'cancelled') {
      return invoice;
    }

    if (Number(invoice.paid_amount || 0) > 0) {
      const err = new Error(
        'Cannot cancel an invoice with recorded payments. Please refund or adjust payments first.'
      );
      err.status = 400;
      throw err;
    }

    const nowIso = new Date().toISOString();
    const updatePayload = {
      status: 'cancelled',
      notes: reason ? `${invoice.notes || ''} [Cancelled: ${reason}]`.trim() : invoice.notes,
      updated_at: nowIso
    };

    const hasDb = await checkBillingTableAvailable();
    if (hasDb) {
      const { error } = await supabase
        .from('lab_invoices')
        .update(updatePayload)
        .eq('id', invoiceId)
        .eq('lab_id', labId);
      if (error) throw new Error(`Database error cancelling invoice: ${error.message}`);
    } else {
      const allInvoices = readFallbackInvoices();
      const idx = allInvoices.findIndex((inv) => inv.id === invoiceId && inv.lab_id === labId);
      if (idx !== -1) {
        allInvoices[idx] = { ...allInvoices[idx], ...updatePayload };
        writeFallbackInvoices(allInvoices);
      }
    }

    return await this.getInvoiceById(labId, invoiceId);
  },

  /**
   * Generate official PDF Tax Invoice buffer.
   */
  async generateInvoicePdfBuffer(labId, invoiceId) {
    const invoice = await this.getInvoiceById(labId, invoiceId);
    if (!invoice) {
      const err = new Error('Invoice not found or access denied');
      err.status = 404;
      throw err;
    }

    // Retrieve lab details
    let lab = { lab_name: 'ClinicPro Diagnostic Services' };
    try {
      const { data } = await supabase.from('labs').select('*').eq('id', labId).maybeSingle();
      if (data) lab = data;
    } catch (e) {}

    const pdfBuffer = generateInvoicePdf({
      ...invoice,
      lab
    });

    return {
      pdfBuffer,
      filename: `Invoice-${invoice.invoice_number}.pdf`
    };
  }
};
