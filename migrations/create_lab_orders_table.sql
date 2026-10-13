-- ====================================================================
-- PHASE 5A: LAB ORDERS & ORDER ITEMS SCHEMA
-- ====================================================================

-- 1. Create lab_orders table
CREATE TABLE IF NOT EXISTS public.lab_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    ordering_type TEXT NOT NULL CHECK (ordering_type IN ('doctor', 'clinic')),
    doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
    lab_id UUID NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
    total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    clinical_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Create lab_order_items table
CREATE TABLE IF NOT EXISTS public.lab_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('test', 'package')),
    test_id UUID REFERENCES public.lab_tests(id) ON DELETE SET NULL,
    package_id UUID REFERENCES public.lab_test_packages(id) ON DELETE SET NULL,
    item_name TEXT NOT NULL,
    item_code TEXT NOT NULL,
    price NUMERIC NOT NULL CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Indexes for fast lookup & tenant isolation
CREATE INDEX IF NOT EXISTS idx_lab_orders_lab_id ON public.lab_orders(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_id ON public.lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_doctor_id ON public.lab_orders(doctor_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_clinic_id ON public.lab_orders(clinic_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON public.lab_orders(status);
CREATE INDEX IF NOT EXISTS idx_lab_order_items_order_id ON public.lab_order_items(order_id);

-- 4. Automatic updated_at trigger
CREATE OR REPLACE FUNCTION update_lab_orders_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_lab_orders_modtime ON public.lab_orders;
CREATE TRIGGER trigger_update_lab_orders_modtime
    BEFORE UPDATE ON public.lab_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_lab_orders_modtime();
