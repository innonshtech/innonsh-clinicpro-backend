-- ====================================================================
-- MIGRATION: ADD PRIORITY FIELD TO LAB ORDERS TABLE
-- ====================================================================
-- This migration adds the `priority` column to public.lab_orders
-- to support Routine, Urgent, and Critical / STAT order prioritization.

-- 1. Add priority column with default 'routine'
ALTER TABLE public.lab_orders
ADD COLUMN IF NOT EXISTS priority VARCHAR(30) DEFAULT 'routine' NOT NULL;

-- 2. Add check constraint on allowed priority levels
ALTER TABLE public.lab_orders
DROP CONSTRAINT IF EXISTS lab_orders_priority_check;

ALTER TABLE public.lab_orders
ADD CONSTRAINT lab_orders_priority_check
CHECK (priority IN ('routine', 'urgent', 'critical', 'stat'));

-- 3. Create index for fast priority sorting and queue retrieval
CREATE INDEX IF NOT EXISTS idx_lab_orders_priority ON public.lab_orders(priority);
