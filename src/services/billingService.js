/**
 * billingService.js - Migrated from Mongoose to Supabase.
 * All business logic is preserved.
 */
import { supabase } from '@/lib/supabase';
import AppError from '@/utils/AppError';
import * as auditService from '@/services/auditService';

const getNextInvoiceCode = async () => {
  const currentYear = new Date().getFullYear();
  const counterId = `invoice_seq_${currentYear}`;
  const { data, error } = await supabase.rpc('increment_counter', { counter_id: counterId });
  if (error) return `INV-${currentYear}-${Date.now()}`;
  return `INV-${currentYear}-${String(data).padStart(4, '0')}`;
};

const findBillByAnyId = async (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let req = supabase.from('billings').select('*');
  if (uuidRegex.test(id)) {
    req = req.eq('id', id);
  } else {
    req = req.eq('billing_id', id);
  }
  const { data, error } = await req.maybeSingle();
  if (error) throw error;
  if (data) data._id = data.id;
  return data;
};

/**
 * Service to generate a new invoice for a completed visit.
 */
export const createInvoice = async (payload, user) => {
  const { visit_id, items, discount = 0, tax = 0 } = payload;

  // 1. Fetch Visit Details
  const { data: visit, error: visitError } = await supabase.from('visits').select('*').eq('id', visit_id).maybeSingle();
  if (visitError) throw visitError;
  if (!visit) throw new AppError('Visit record not found', 404, 'NOT_FOUND');

  // 2. Clinic Isolation
  if (user.clinicId && visit.clinic_id && visit.clinic_id !== user.clinicId) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }

  // 3. Prevent Duplicate Billing (update if exists)
  const { data: existingBill } = await supabase.from('billings').select('*').eq('visit_id', visit.id).maybeSingle();

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const finalAmount = totalAmount + tax - discount;

  if (existingBill) {
    const paidAmount = existingBill.paid_amount || 0;
    const remainingAmount = finalAmount - paidAmount;
    let status = 'pending';
    if (remainingAmount <= 0) status = 'paid';
    else if (paidAmount > 0) status = 'partially_paid';

    const { data: updated, error } = await supabase
      .from('billings')
      .update({ items, total_amount: totalAmount, discount, tax, final_amount: finalAmount, remaining_amount: remainingAmount, status })
      .eq('id', existingBill.id)
      .select()
      .single();
    if (error) throw error;
    updated._id = updated.id;
    return updated;
  }

  // 4. Auto-generate sequential invoice code
  const billingId = await getNextInvoiceCode();

  // 5. Create Billing Record
  const { data: newBill, error: createError } = await supabase
    .from('billings')
    .insert([{
      billing_id: billingId,
      patient_id: visit.patient_id,
      visit_id: visit.id,
      doctor_id: visit.doctor_id,
      clinic_id: visit.clinic_id,
      items,
      total_amount: totalAmount,
      discount,
      tax,
      final_amount: finalAmount,
      remaining_amount: finalAmount,
      status: 'pending',
    }])
    .select()
    .single();

  if (createError) throw createError;
  newBill._id = newBill.id;
  return newBill;
};

/**
 * Service to fetch billing history with filters and pagination.
 */
export const getBillingHistory = async (filters, user) => {
  const { page = 1, limit = 10, status, patientId, doctorId, startDate, endDate, visitId } = filters;

  if (!user?.clinicId) throw new AppError('clinicId missing', 401, 'UNAUTHORIZED');

  // Ensure any completed visits for this clinic have their invoice generated (reconciliation sync)
  try {
    const { data: completedVisits } = await supabase
      .from('visits')
      .select('id, clinic_id, doctor_id, patient_id')
      .eq('clinic_id', user.clinicId)
      .eq('status', 'completed');

    if (completedVisits && completedVisits.length > 0) {
      const { data: existingBills } = await supabase
        .from('billings')
        .select('visit_id')
        .eq('clinic_id', user.clinicId);

      const billedVisitIds = new Set((existingBills || []).map(b => b.visit_id).filter(Boolean));

      for (const v of completedVisits) {
        if (!billedVisitIds.has(v.id)) {
          const { data: doc } = await supabase
            .from('doctors')
            .select('consultant_fee')
            .eq('id', v.doctor_id)
            .maybeSingle();

          const fee = Number(doc?.consultant_fee) || 500;
          await createInvoice({
            visit_id: v.id,
            items: [{ name: 'Consultation Fee', type: 'consultation', amount: fee }]
          }, {
            id: user.id,
            clinicId: user.clinicId,
            role: user.role || 'receptionist'
          });
          billedVisitIds.add(v.id);
        }
      }
    }
  } catch (syncErr) {
    console.error('Error in completed visit billing reconciliation:', syncErr);
  }

  let req = supabase
    .from('billings')
    .select(`
      *,
      patients (first_name, last_name, id, phone_number, email, patient_code),
      doctors (first_name, last_name)
    `, { count: 'exact' })
    .eq('clinic_id', user.clinicId);

  if (status) req = req.eq('status', status);
  if (patientId) req = req.eq('patient_id', patientId);
  if (doctorId) req = req.eq('doctor_id', doctorId);
  if (visitId) req = req.eq('visit_id', visitId);
  if (startDate) req = req.gte('created_at', startDate);
  if (endDate) req = req.lte('created_at', endDate);

  req = req
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await req;
  if (error) throw error;

  const bills = (data || []).map(b => ({
    ...b,
    _id: b.id,
    billingId: b.billing_id,
    finalAmount: Number(b.final_amount) || 0,
    totalAmount: Number(b.total_amount) || 0,
    paidAmount: Number(b.paid_amount) || 0,
    remainingAmount: Number(b.remaining_amount !== undefined && b.remaining_amount !== null ? b.remaining_amount : (b.final_amount - (b.paid_amount || 0))) || 0,
    paymentMethod: b.payment_method || null,
    createdAt: b.created_at,
    paidAt: b.paid_at,
    patientId: b.patients ? { 
      _id: b.patients.id, 
      firstName: b.patients.first_name, 
      lastName: b.patients.last_name, 
      patientCode: b.patients.patient_code, // patient_code mapping for client code display
      ...b.patients 
    } : b.patient_id,
    doctorId: b.doctors ? { _id: b.doctors.id, ...b.doctors } : b.doctor_id,
  }));

  return { bills, total: count || 0, page, limit, totalPages: Math.ceil((count || 0) / limit) };
};

/**
 * Service to fetch full details of a specific invoice.
 */
export const getInvoiceDetails = async (id, user) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let req = supabase.from('billings').select(`
    *,
    patients (first_name, last_name, id, phone_number, email, patient_code),
    visits (*),
    doctors (first_name, last_name, specialty)
  `);

  if (uuidRegex.test(id)) {
    req = req.eq('id', id);
  } else {
    req = req.eq('billing_id', id);
  }

  const { data: bill, error } = await req.maybeSingle();
  if (error) throw error;
  if (!bill) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  if (user.clinicId && bill.clinic_id !== user.clinicId) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }

  bill._id = bill.id;
  bill.billingId = bill.billing_id;
  bill.finalAmount = Number(bill.final_amount) || 0;
  bill.totalAmount = Number(bill.total_amount) || 0;
  bill.createdAt = bill.created_at;
  bill.patientId = bill.patients ? { 
    _id: bill.patients.id, 
    firstName: bill.patients.first_name, 
    lastName: bill.patients.last_name,
    patientCode: bill.patients.patient_code,
    ...bill.patients 
  } : bill.patient_id;
  bill.visitId = bill.visits ? { 
    _id: bill.visits.id, 
    diagnosis: bill.visits.diagnosis,
    followUpDate: bill.visits.follow_up_date,
    ...bill.visits 
  } : bill.visit_id;
  bill.doctorId = bill.doctors ? { 
    _id: bill.doctors.id, 
    firstName: bill.doctors.first_name, 
    lastName: bill.doctors.last_name,
    ...bill.doctors 
  } : bill.doctor_id;

  return bill;
};

/**
 * Service to handle billing refunds.
 */
export const processRefund = async (id, refundData, user) => {
  const { refundAmount, reason } = refundData;
  const { clinicId, role } = user;

  const bill = await findBillByAnyId(id);
  if (!bill) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  if (clinicId && bill.clinic_id !== clinicId) throw new AppError('Access Denied', 403, 'FORBIDDEN');
  if (role.toLowerCase() === 'doctor') throw new AppError('Doctors cannot process billing refunds', 403, 'FORBIDDEN');
  if (bill.status === 'refunded') throw new AppError('Invoice is already refunded', 400, 'ALREADY_REFUNDED');
  if (bill.status !== 'paid') throw new AppError('Can only refund paid invoices.', 400, 'INVALID_STATUS');
  if (refundAmount > bill.final_amount) throw new AppError('Refund amount cannot exceed final amount paid', 400, 'INVALID_AMOUNT');

  const { data: updated, error } = await supabase
    .from('billings')
    .update({ status: 'refunded', refund_amount: refundAmount, refund_reason: reason, refunded_at: new Date().toISOString() })
    .eq('id', bill.id)
    .select()
    .single();

  if (error) throw error;

  await auditService.recordLog({
    user,
    action: 'BILLING_REFUND',
    resourceType: 'Billing',
    resourceId: updated.billing_id || updated.id,
    changes: { status: 'refunded', refundAmount, reason },
  });

  updated._id = updated.id;
  return updated;
};

/**
 * Service to handle billing payments (partial or full).
 */
export const processPayment = async (id, paymentData, user) => {
  const { paymentAmount, paymentMethod, transactionId } = paymentData;
  const { clinicId, role } = user;

  const bill = await findBillByAnyId(id);
  if (!bill) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  if (clinicId && bill.clinic_id !== clinicId) throw new AppError('Access Denied', 403, 'FORBIDDEN');
  if (role.toLowerCase() === 'doctor') throw new AppError('Doctors cannot process billing payments', 403, 'FORBIDDEN');
  if (bill.status === 'paid') throw new AppError('Invoice is already fully paid', 400, 'ALREADY_PAID');
  if (bill.status === 'cancelled') throw new AppError('Cannot process payment for a cancelled invoice', 400, 'INVALID_STATUS');
  if (paymentAmount <= 0) throw new AppError('Payment amount must be greater than 0', 400, 'INVALID_AMOUNT');

  const currentPaid = bill.paid_amount || 0;
  const newPaidAmount = currentPaid + paymentAmount;
  if (newPaidAmount > bill.final_amount) throw new AppError('Payment amount exceeds remaining balance', 400, 'INVALID_AMOUNT');

  const remainingAmount = bill.final_amount - newPaidAmount;
  const newStatus = remainingAmount === 0 ? 'paid' : 'partially_paid';

  const updateData = {
    paid_amount: newPaidAmount,
    remaining_amount: remainingAmount,
    payment_method: paymentMethod,
    paid_at: new Date().toISOString(),
    status: newStatus,
  };
  if (transactionId) updateData.transaction_id = transactionId;

  const { data: updated, error } = await supabase.from('billings').update(updateData).eq('id', bill.id).select().single();
  if (error) throw error;

  await auditService.recordLog({
    user,
    action: 'BILLING_PAYMENT',
    resourceType: 'Billing',
    resourceId: updated.billing_id || updated.id,
    changes: { status: updated.status, paymentAmount, remainingAmount },
  });

  updated._id = updated.id;
  return updated;
};
