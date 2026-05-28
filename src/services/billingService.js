import Billing from '@/models/Billing';
import Visit from '@/models/Visit';
import Appointment from '@/models/Appointments';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Counter from '@/models/Counter';
import dbConnect from '@/utils/db';
import AppError from '@/utils/AppError';
import * as auditService from '@/services/auditService';


/**
 * Service to generate a new invoice for a completed visit.
 */
export const createInvoice = async (payload, user) => {
  await dbConnect();
  const { visit_id, items, discount = 0, tax = 0 } = payload;

  // 1. Fetch Visit Details
  const visit = await Visit.findById(visit_id);
  if (!visit) throw new AppError('Visit record not found', 404, 'NOT_FOUND');

  // Check if clinic matches (Data Isolation)
  const appointment = await Appointment.findById(visit.appointmentId);
  const clinicId = appointment?.clinicId;
  if (user.clinicId && clinicId && String(clinicId) !== String(user.clinicId)) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }



  // 2. Prevent Duplicate Billing
  const existingBill = await Billing.findOne({ visitId: visit._id });
  
  // 3. Calculate Totals
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const finalAmount = totalAmount + tax - discount;

  if (existingBill) {
    existingBill.items = items;
    existingBill.totalAmount = totalAmount;
    existingBill.discount = discount;
    existingBill.tax = tax;
    existingBill.finalAmount = finalAmount;
    existingBill.remainingAmount = finalAmount - (existingBill.paidAmount || 0);
    
    if (existingBill.remainingAmount <= 0) {
      existingBill.status = 'paid';
    } else if ((existingBill.paidAmount || 0) > 0) {
      existingBill.status = 'partially_paid';
    } else {
      existingBill.status = 'pending';
    }

    await existingBill.save();
    return existingBill;
  }

  // 4. Auto-generate sequential invoice code: INV-[YEAR]-[INCREMENT]
  const currentYear = new Date().getFullYear();
  const counter = await Counter.findByIdAndUpdate(
    { _id: `invoice_seq_${currentYear}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const billingId = `INV-${currentYear}-${String(counter.seq).padStart(4, '0')}`;

  // 5. Create Billing Record
  const newBill = await Billing.create({
    billingId,
    patientId: visit.patientId,
    visitId: visit._id,
    doctorId: visit.doctorId,
    clinicId: clinicId,
    items,
    totalAmount,
    discount,
    tax,
    finalAmount,
    status: 'pending'
  });

  return newBill;
};

/**
 * Service to fetch billing history with filters and pagination.
 */
export const getBillingHistory = async (filters, user) => {
  await dbConnect();
  const { page = 1, limit = 10, status, patientId, doctorId, startDate, endDate, visitId } = filters;

  // 1. Build Query Object
  if (!user?.clinicId) {
    throw new AppError('clinicId missing', 401, 'UNAUTHORIZED');
  }


  const query = {
    clinicId: String(user.clinicId) // Enforce data isolation
  };


  if (status) query.status = status;
  if (patientId) query.patientId = patientId;
  if (doctorId) query.doctorId = doctorId;
  if (visitId) query.visitId = visitId;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // 2. Execute Query with Pagination
  const skip = (page - 1) * limit;

  console.log(`[BILLING DEBUG] Fetching history with query:`, JSON.stringify(query));

  try {
    const [bills, total] = await Promise.all([
      Billing.find(query)
        .populate('patientId')
        .populate('doctorId', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Billing.countDocuments(query)
    ]);

    return {
      bills,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (dbError) {
    console.error(`[BILLING ERROR] DB Query Failed:`, dbError);
    throw new AppError(`Database error in billing history: ${dbError.message}`, 500, 'DB_ERROR');

  }
};


/**
 * Service to fetch full details of a specific invoice.
 */
export const getInvoiceDetails = async (id, user) => {
  await dbConnect();
  const mongoose = (await import('mongoose')).default;

  // 1. Build Query (handle both string BillingID and ObjectId)
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { _id: id }
    : { billingId: id };

  // 2. Fetch with Population
  const bill = await Billing.findOne(query)
    .populate('patientId', 'firstName lastName patientId phoneNumber email')
    .populate('visitId')
    .populate('doctorId', 'firstName lastName specialty');

  if (!bill) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  // 3. Clinic Isolation
  if (user.clinicId && String(bill.clinicId) !== String(user.clinicId)) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }



  return bill;
};

/**
 * Service to handle billing refunds.
 * @param {string} id - Billing ID
 * @param {Object} refundData - Refund details (amount, reason)
 * @param {Object} user - User initiating refund
 */
export const processRefund = async (id, refundData, user) => {
  await dbConnect();
  const mongoose = (await import('mongoose')).default;

  const { refundAmount, reason } = refundData;
  const { clinicId, role } = user;

  // 1. Find Billing Record
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { _id: id }
    : { billingId: id };

  const bill = await Billing.findOne(query);

  if (!bill) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }

  // 2. Enforce Scoping & RBAC
  if (clinicId && String(bill.clinicId) !== String(clinicId)) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }

  // Usually admins or receptionists process refunds. Let's allow both.
  if (role.toLowerCase() === 'doctor') {
    throw new AppError('Doctors cannot process billing refunds', 403, 'FORBIDDEN');
  }

  // 3. Validation
  if (bill.status === 'refunded') {
    throw new AppError('Invoice is already refunded', 400, 'ALREADY_REFUNDED');
  }

  // We can only refund paid bills. If pending, it should be cancelled instead.
  if (bill.status !== 'paid') {
    throw new AppError('Can only refund paid invoices. Use cancellation for pending invoices.', 400, 'INVALID_STATUS');
  }

  if (refundAmount > bill.finalAmount) {
    throw new AppError('Refund amount cannot exceed final amount paid', 400, 'INVALID_AMOUNT');
  }

  // 4. Process Update
  bill.status = 'refunded';
  bill.refundAmount = refundAmount;
  bill.refundReason = reason;
  bill.refundedAt = new Date();

  await bill.save();

  // Audit Log
  await auditService.recordLog({
    user,
    action: 'BILLING_REFUND',
    resourceType: 'Billing',
    resourceId: bill.billingId || bill._id.toString(),
    changes: {
      status: 'refunded',
      refundAmount: refundAmount,
      reason: reason
    }
  });

  return bill;
};

/**
 * Service to handle billing payments (partial or full).
 * @param {string} id - Billing ID
 * @param {Object} paymentData - Payment details (paymentAmount, paymentMethod, transactionId)
 * @param {Object} user - User initiating payment
 */
export const processPayment = async (id, paymentData, user) => {
  await dbConnect();
  const mongoose = (await import('mongoose')).default;

  const { paymentAmount, paymentMethod, transactionId } = paymentData;
  const { clinicId, role } = user;

  // 1. Find Billing Record
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { _id: id }
    : { billingId: id };

  const bill = await Billing.findOne(query);

  if (!bill) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }

  // 2. Enforce Scoping & RBAC
  if (clinicId && String(bill.clinicId) !== String(clinicId)) {
    throw new AppError('Access Denied', 403, 'FORBIDDEN');
  }

  // Receptionists or Admins usually handle payments
  if (role.toLowerCase() === 'doctor') {
    throw new AppError('Doctors cannot process billing payments', 403, 'FORBIDDEN');
  }

  // 3. Validation
  if (bill.status === 'paid') {
    throw new AppError('Invoice is already fully paid', 400, 'ALREADY_PAID');
  }
  
  if (bill.status === 'cancelled') {
    throw new AppError('Cannot process payment for a cancelled invoice', 400, 'INVALID_STATUS');
  }

  if (paymentAmount <= 0) {
    throw new AppError('Payment amount must be greater than 0', 400, 'INVALID_AMOUNT');
  }

  // Calculate new paid and remaining amounts
  const currentPaid = bill.paidAmount || 0;
  const newPaidAmount = currentPaid + paymentAmount;
  
  if (newPaidAmount > bill.finalAmount) {
    throw new AppError('Payment amount exceeds remaining balance', 400, 'INVALID_AMOUNT');
  }

  // 4. Update bill
  bill.paidAmount = newPaidAmount;
  bill.remainingAmount = bill.finalAmount - newPaidAmount;
  bill.paymentMethod = paymentMethod;
  if (transactionId) bill.transactionId = transactionId;
  bill.paidAt = new Date();

  // Set status based on whether the full amount is paid
  if (bill.remainingAmount === 0) {
    bill.status = 'paid';
  } else {
    bill.status = 'partially_paid';
  }

  await bill.save();

  // Audit Log
  await auditService.recordLog({
    user,
    action: 'BILLING_PAYMENT',
    resourceType: 'Billing',
    resourceId: bill.billingId || bill._id.toString(),
    changes: {
      status: bill.status,
      paymentAmount: paymentAmount,
      remainingAmount: bill.remainingAmount
    }
  });

  return bill;
};
