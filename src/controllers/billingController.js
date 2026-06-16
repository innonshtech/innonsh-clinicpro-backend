import { ApiResponse } from '@/utils/apiResponse';
import * as billingService from '@/services/billingService';
import { billingCreateSchema, billingListQuerySchema, billingRefundSchema, billingPaymentSchema } from '@/validations/userValidation';


/**
 * Controller to handle creating a new bill/invoice.
 */
export const createBilling = async (req) => {
  
  
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
  
  
  const { searchParams } = new URL(req.url);
  const query = Object.fromEntries(searchParams.entries());

  // 1. Validate request
  const parsed = billingListQuerySchema.safeParse(query);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(firstError, 'VALIDATION_ERROR', parsed.error.format(), 400);
  }

  try {
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
