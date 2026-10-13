-- Migration: Create lab_test_packages and lab_test_package_items tables
-- Safe and idempotent

CREATE TABLE IF NOT EXISTS public.lab_test_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  package_code TEXT NOT NULL,
  description TEXT,
  package_price NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_lab_package_code UNIQUE (lab_id, package_code)
);

CREATE INDEX IF NOT EXISTS idx_lab_test_packages_lab_id ON public.lab_test_packages(lab_id);
CREATE INDEX IF NOT EXISTS idx_lab_test_packages_status ON public.lab_test_packages(status);

CREATE TABLE IF NOT EXISTS public.lab_test_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.lab_test_packages(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.lab_tests(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_package_test UNIQUE (package_id, test_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_test_package_items_package_id ON public.lab_test_package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_lab_test_package_items_test_id ON public.lab_test_package_items(test_id);
