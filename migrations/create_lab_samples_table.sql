-- ====================================================================
-- PHASE 1 MIGRATION: LAB SAMPLE COLLECTION, TRACKING & RECOLLECTION
-- ====================================================================

-- 1. Safely expand lab_orders status constraint to allow full diagnostic lifecycle
ALTER TABLE public.lab_orders DROP CONSTRAINT IF EXISTS lab_orders_status_check;

ALTER TABLE public.lab_orders ADD CONSTRAINT lab_orders_status_check 
  CHECK (status IN (
    'pending',
    'accepted',
    'rejected',
    'sample_collected',
    'in_progress',
    'completed',
    'cancelled'
  ));

-- 2. Create lab_samples table for Sample Collection & Tracking
CREATE TABLE IF NOT EXISTS public.lab_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES public.lab_order_items(id) ON DELETE SET NULL,
    lab_id UUID NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    barcode TEXT NOT NULL UNIQUE,
    sample_type TEXT NOT NULL,
    collection_status TEXT NOT NULL DEFAULT 'collected' 
      CHECK (collection_status IN ('pending', 'collected', 'received', 'rejected', 'recollection_requested')),
    collected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    collected_by TEXT,
    received_at TIMESTAMPTZ,
    received_by TEXT,
    rejection_reason TEXT,
    rejection_category TEXT,
    rejected_at TIMESTAMPTZ,
    rejected_by TEXT,
    is_recollection BOOLEAN NOT NULL DEFAULT FALSE,
    recollected_sample_id UUID REFERENCES public.lab_samples(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Indexes for fast query lookup and strict tenant isolation
CREATE INDEX IF NOT EXISTS idx_lab_samples_lab_id ON public.lab_samples(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_samples_order_id ON public.lab_samples(order_id);
CREATE INDEX IF NOT EXISTS idx_lab_samples_patient_id ON public.lab_samples(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_samples_barcode ON public.lab_samples(barcode);
CREATE INDEX IF NOT EXISTS idx_lab_samples_status ON public.lab_samples(collection_status);
CREATE INDEX IF NOT EXISTS idx_lab_samples_recollected_id ON public.lab_samples(recollected_sample_id);

-- 4. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION update_lab_samples_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_lab_samples_modtime ON public.lab_samples;
CREATE TRIGGER trigger_update_lab_samples_modtime
    BEFORE UPDATE ON public.lab_samples
    FOR EACH ROW
    EXECUTE FUNCTION update_lab_samples_modtime();
