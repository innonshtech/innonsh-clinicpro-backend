-- ============================================================================
-- ClinicPro Laboratory Phase 5: Billing & Invoicing Module Migration
-- Target: Supabase Postgres
-- Description: Creates public.lab_invoices and public.lab_payments tables
-- with strict tenant isolation, unique invoice numbers, and payment tracking.
-- Note: Prepared for review; do not execute automatically.
-- ============================================================================

-- 1. Create public.lab_invoices table
CREATE TABLE IF NOT EXISTS public.lab_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) NOT NULL,
    lab_id UUID NOT NULL,
    order_id UUID NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    patient_id VARCHAR(100),
    patient_name VARCHAR(255) NOT NULL,
    patient_code VARCHAR(100),
    patient_phone VARCHAR(50),
    patient_gender VARCHAR(50),
    patient_dob VARCHAR(50),
    clinic_id VARCHAR(100),
    clinic_name VARCHAR(255),
    doctor_id VARCHAR(100),
    doctor_name VARCHAR(255),
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'issued',
    notes TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_lab_invoices_invoice_number UNIQUE (invoice_number),
    CONSTRAINT uq_lab_invoices_lab_order UNIQUE (lab_id, order_id),
    CONSTRAINT chk_lab_invoices_status CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
    CONSTRAINT chk_lab_invoices_amounts CHECK (
        total_amount >= 0.00 AND 
        paid_amount >= 0.00 AND 
        balance_amount >= 0.00
    )
);

-- Indexes for performance & multi-tenant isolation
CREATE INDEX IF NOT EXISTS idx_lab_invoices_lab_id ON public.lab_invoices(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_invoices_order_id ON public.lab_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_lab_invoices_status ON public.lab_invoices(status);
CREATE INDEX IF NOT EXISTS idx_lab_invoices_issued_at ON public.lab_invoices(issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_invoices_patient ON public.lab_invoices(patient_name, patient_code);

-- 2. Create public.lab_payments table
CREATE TABLE IF NOT EXISTS public.lab_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_id UUID NOT NULL,
    invoice_id UUID NOT NULL REFERENCES public.lab_invoices(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(50) NOT NULL,
    payment_number VARCHAR(50) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
    transaction_reference VARCHAR(100),
    notes TEXT,
    recorded_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_lab_payments_payment_number UNIQUE (payment_number),
    CONSTRAINT chk_lab_payments_amount CHECK (amount > 0.00),
    CONSTRAINT chk_lab_payments_method CHECK (payment_method IN ('cash', 'card', 'upi', 'bank_transfer', 'cheque', 'other'))
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_lab_payments_lab_id ON public.lab_payments(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_payments_invoice_id ON public.lab_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_lab_payments_date ON public.lab_payments(payment_date DESC);

-- Automatic updated_at trigger function for lab_invoices
CREATE OR REPLACE FUNCTION public.update_lab_invoices_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lab_invoices_updated_at ON public.lab_invoices;
CREATE TRIGGER trg_lab_invoices_updated_at
    BEFORE UPDATE ON public.lab_invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.update_lab_invoices_modtime();
