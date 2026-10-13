-- ====================================================================
-- PHASE 3 MIGRATION: DIAGNOSTIC REPORT GENERATION, PDF & REPORT HISTORY
-- ====================================================================

-- 1. Create lab_reports table for issued diagnostic reports
CREATE TABLE IF NOT EXISTS public.lab_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_number VARCHAR(100) NOT NULL UNIQUE,
    lab_id UUID NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
    sample_id UUID REFERENCES public.lab_samples(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    report_status VARCHAR(50) NOT NULL DEFAULT 'issued'
      CHECK (report_status IN ('draft', 'issued', 'reissued', 'cancelled')),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    generated_by VARCHAR(255),
    generated_by_user_id UUID,
    validated_by VARCHAR(255),
    validated_at TIMESTAMPTZ,
    report_data JSONB NOT NULL, -- Full immutable snapshot of report at time of issuance (patient, test, results, interpretations, ranges, lab info)
    pdf_url TEXT,
    is_reissue BOOLEAN NOT NULL DEFAULT FALSE,
    reissue_reason TEXT,
    previous_report_id UUID REFERENCES public.lab_reports(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Unique index to prevent duplicate issued reports for the same order and sample
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_lab_report_order_sample
ON public.lab_reports (
    lab_id, 
    order_id, 
    COALESCE(sample_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE report_status = 'issued' AND is_reissue = FALSE;

-- 3. Performance & Tenant Isolation Indexes
CREATE INDEX IF NOT EXISTS idx_lab_reports_lab_id ON public.lab_reports(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_reports_order_id ON public.lab_reports(order_id);
CREATE INDEX IF NOT EXISTS idx_lab_reports_patient_id ON public.lab_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_reports_sample_id ON public.lab_reports(sample_id);
CREATE INDEX IF NOT EXISTS idx_lab_reports_status ON public.lab_reports(report_status);
CREATE INDEX IF NOT EXISTS idx_lab_reports_generated_at ON public.lab_reports(generated_at);

-- 4. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION update_lab_reports_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_lab_reports_modtime ON public.lab_reports;
CREATE TRIGGER trigger_update_lab_reports_modtime
    BEFORE UPDATE ON public.lab_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_lab_reports_modtime();
