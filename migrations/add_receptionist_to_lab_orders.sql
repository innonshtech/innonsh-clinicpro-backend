-- ====================================================================
-- PHASE 1: ADD RECEPTIONIST AS A VALID LAB ORDER CREATOR
-- ====================================================================

-- 1. Add receptionist_id column referencing public.staff (where receptionists are stored)
ALTER TABLE public.lab_orders
ADD COLUMN IF NOT EXISTS receptionist_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

-- 2. Index on receptionist_id for fast queries and tenant isolation
CREATE INDEX IF NOT EXISTS idx_lab_orders_receptionist_id ON public.lab_orders(receptionist_id);

-- 3. Update ordering_type CHECK constraint to allow: doctor, receptionist
ALTER TABLE public.lab_orders
DROP CONSTRAINT IF EXISTS lab_orders_ordering_type_check;

ALTER TABLE public.lab_orders
ADD CONSTRAINT lab_orders_ordering_type_check
CHECK (ordering_type IN ('doctor', 'receptionist'));
