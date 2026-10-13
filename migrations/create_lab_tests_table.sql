-- Migration: Create lab_tests table for Lab Test Catalog
-- Safe and idempotent

CREATE TABLE IF NOT EXISTS public.lab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  test_code TEXT NOT NULL,
  department TEXT NOT NULL,
  sample_type TEXT NOT NULL,
  tat_value NUMERIC NOT NULL,
  tat_unit TEXT NOT NULL DEFAULT 'Hours',
  price NUMERIC NOT NULL DEFAULT 0,
  test_method TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_lab_test_code UNIQUE (lab_id, test_code)
);

CREATE INDEX IF NOT EXISTS idx_lab_tests_lab_id ON public.lab_tests(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_tests_status ON public.lab_tests(status);
