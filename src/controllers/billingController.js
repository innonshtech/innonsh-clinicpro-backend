import { ApiResponse } from '@/utils/apiResponse';
import * as billingService from '@/services/billingService';
import { billingCreateSchema, billingListQuerySchema, billingRefundSchema, billingPaymentSchema } from '@/validations/userValidation';
import dbConnect from '@/utils/db';
import Patient from '@/models/Patient';
import Counter from '@/models/Counter';
import Billing from '@/models/Billing';

/**
 * Controller to handle creating a new bill/invoice.
 */
export const createBilling = async (req) => {
  await dbConnect();
  
  const body = await req.json();

  // 1. Validate request
  const parsed = billingCreateSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(
      firstError,
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 2. Call service
    const billing = await billingService.createInvoice(parsed.data, req.user);

    // 3. Return success response
    return ApiResponse.success(
      { billing }, 
      "Invoice generated successfully", 
      201
    );
  } catch (error) {
    if (error.statusCode) {
      return ApiResponse.error(
        error.message,
        error.code || 'ERROR',
        [],
        error.statusCode
      );
    }

    console.error('Error in createBilling controller:', error);
    return ApiResponse.error(
      'Internal server error',
      'INTERNAL_ERROR',
      [],
      500
    );
  }

};

/**
 * Controller to handle fetching a single invoice by ID.
 */
export const getInvoice = async (req, { params }) => {
  await dbConnect();
  const { id } = await params;

  if (!id) {
    return ApiResponse.error('Billing ID is required', 'MISSING_FIELD', [], 400);
  }

  try {
    // 2. Call service
    const billing = await billingService.getInvoiceDetails(id, req.user);

    // 3. Return success response
    return ApiResponse.success({ billing }, "Invoice details fetched successfully");
  } catch (error) {
    if (error.statusCode) {
      return ApiResponse.error(
        error.message,
        error.code || 'ERROR',
        [],
        error.statusCode
      );
    }

    console.error('Error in getInvoice controller:', error);
    return ApiResponse.error(
      'Internal server error',
      'INTERNAL_ERROR',
      [],
      500
    );
  }

};

/**
 * Controller to handle fetching a list of invoices with filters.
 */
export const listBills = async (req) => {
  await dbConnect();
  
  const { searchParams } = new URL(req.url);
  const query = Object.fromEntries(searchParams.entries());

  // 1. Validate request
  const parsed = billingListQuerySchema.safeParse(query);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(firstError, 'VALIDATION_ERROR', parsed.error.format(), 400);
  }

  try {
    // RUN SYNC MIGRATION FOR PATIENTS
    const patientsToMigrate = await Patient.find({ patientCode: { $exists: false } });
    for (const p of patientsToMigrate) {
      const counter = await Counter.findByIdAndUpdate(
        { _id: 'patient_code' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      p.patientCode = `PAT-${String(counter.seq).padStart(6, '0')}`;
      await p.save();
    }

    // RUN SYNC MIGRATION FOR INVOICES
    const billsToMigrate = await Billing.find({ billingId: { $exists: false } });
    const currentYear = new Date().getFullYear();
    for (const b of billsToMigrate) {
      const counter = await Counter.findByIdAndUpdate(
        { _id: `invoice_seq_${currentYear}` },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      b.billingId = `INV-${currentYear}-${String(counter.seq).padStart(4, '0')}`;
      await b.save();
    }

    // 2. Call service
    const data = await billingService.getBillingHistory(parsed.data, req.user);

    // 3. Return success response
    return ApiResponse.success(data, "Invoice list fetched successfully");
  } catch (error) {
    if (error.statusCode) {
      return ApiResponse.error(
        error.message,
        error.code || 'ERROR',
        [],
        error.statusCode
      );
    }

    console.error('Error in listBills controller:', error);
    return ApiResponse.error(
      'Internal server error',
      'INTERNAL_ERROR',
      [],
      500
    );
  }


};

/**
 * Controller to handle billing refunds.
 */
export const processRefund = async (req, { params }) => {
  await dbConnect();
  const { id } = await params;
  
  const body = await req.json();

  // 1. Validate request
  const parsed = billingRefundSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(
      firstError,
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 2. Call service
    const bill = await billingService.processRefund(id, parsed.data, req.user);
    
    return ApiResponse.success(
      bill, 
      "Refund processed successfully"
    );

  } catch (error) {
    if (error.statusCode) {
      return ApiResponse.error(
        error.message,
        error.code || 'ERROR',
        [],
        error.statusCode
      );
    }

    console.error('Error in processRefund controller:', error);
    return ApiResponse.error(
      'Internal server error',
      'INTERNAL_ERROR',
      [],
      500
    );
  }
};

/**
 * Controller to handle billing payments.
 */
export const processPayment = async (req, { params }) => {
  await dbConnect();
  const { id } = await params;
  
  const body = await req.json();

  // 1. Validate request
  const parsed = billingPaymentSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(
      firstError,
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 2. Call service
    const bill = await billingService.processPayment(id, parsed.data, req.user);
    
    return ApiResponse.success(
      bill, 
      "Payment processed successfully"
    );

  } catch (error) {
    if (error.statusCode) {
      return ApiResponse.error(
        error.message,
        error.code || 'ERROR',
        [],
        error.statusCode
      );
    }

    console.error('Error in processPayment controller:', error);
    return ApiResponse.error(
      'Internal server error',
      'INTERNAL_ERROR',
      [],
      500
    );
  }
};
