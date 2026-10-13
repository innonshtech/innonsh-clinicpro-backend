-- ====================================================================
-- PHASE 2 MIGRATION: LAB RESULT ENTRY, CRITICAL RESULTS & VALIDATION
-- ====================================================================

-- 1. Create lab_results table for individual diagnostic parameters & results
CREATE TABLE IF NOT EXISTS public.lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_id UUID NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES public.lab_order_items(id) ON DELETE SET NULL,
    sample_id UUID REFERENCES public.lab_samples(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    test_id UUID REFERENCES public.lab_tests(id) ON DELETE SET NULL,
    test_name TEXT NOT NULL,
    test_code TEXT,
    parameter_name TEXT NOT NULL,
    result_value TEXT NOT NULL,
    numeric_value NUMERIC,
    unit TEXT,
    reference_range TEXT,
    reference_min NUMERIC,
    reference_max NUMERIC,
    interpretation TEXT NOT NULL DEFAULT 'normal' 
      CHECK (interpretation IN ('normal', 'abnormal', 'critical_low', 'critical_high', 'inconclusive')),
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,
    critical_threshold_rule TEXT,
    critical_flagged_at TIMESTAMPTZ,
    critical_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    critical_acknowledged_at TIMESTAMPTZ,
    critical_acknowledged_by TEXT,
    critical_acknowledgement_notes TEXT,
    technician_remarks TEXT,
    status TEXT NOT NULL DEFAULT 'entered' 
      CHECK (status IN ('draft', 'entered', 'validated', 'corrected', 'rejected')),
    entered_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    entered_by TEXT,
    entered_by_user_id UUID,
    validated_at TIMESTAMPTZ,
    validated_by TEXT,
    validated_by_user_id UUID,
    validation_remarks TEXT,
    is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
    correction_reason TEXT,
    previous_result_id UUID REFERENCES public.lab_results(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Create lab_critical_rules table for lab-configurable critical thresholds
CREATE TABLE IF NOT EXISTS public.lab_critical_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_id UUID NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
    test_id UUID REFERENCES public.lab_tests(id) ON DELETE CASCADE,
    test_code TEXT,
    parameter_name TEXT NOT NULL,
    critical_low NUMERIC,
    critical_high NUMERIC,
    unit TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Indexes for fast query lookup and strict tenant isolation
CREATE INDEX IF NOT EXISTS idx_lab_results_lab_id ON public.lab_results(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_order_id ON public.lab_results(order_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_sample_id ON public.lab_results(sample_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_patient_id ON public.lab_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_status ON public.lab_results(status);
CREATE INDEX IF NOT EXISTS idx_lab_results_is_critical ON public.lab_results(is_critical);
CREATE INDEX IF NOT EXISTS idx_lab_results_critical_ack ON public.lab_results(critical_acknowledged);
CREATE INDEX IF NOT EXISTS idx_lab_results_created_at ON public.lab_results(created_at);

-- 3b. Prevent duplicate active parameter results for the same specimen & test item
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_lab_result_param 
ON public.lab_results (
    sample_id, 
    COALESCE(order_item_id, '00000000-0000-0000-0000-000000000000'::uuid), 
    COALESCE(test_id, '00000000-0000-0000-0000-000000000000'::uuid), 
    lower(test_name), 
    lower(parameter_name)
) 
WHERE is_corrected = FALSE;

CREATE INDEX IF NOT EXISTS idx_lab_critical_rules_lab ON public.lab_critical_rules(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_critical_rules_param ON public.lab_critical_rules(parameter_name);

-- 4. Automatic updated_at triggers
CREATE OR REPLACE FUNCTION update_lab_results_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_lab_results_modtime ON public.lab_results;
CREATE TRIGGER trigger_update_lab_results_modtime
    BEFORE UPDATE ON public.lab_results
    FOR EACH ROW
    EXECUTE FUNCTION update_lab_results_modtime();

DROP TRIGGER IF EXISTS trigger_update_lab_critical_rules_modtime ON public.lab_critical_rules;
CREATE TRIGGER trigger_update_lab_critical_rules_modtime
    BEFORE UPDATE ON public.lab_critical_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_lab_results_modtime();
