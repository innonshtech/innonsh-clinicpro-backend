-- Migration: create_lab_staff_table.sql
-- Description: Creates public.lab_staff table for Lab Account Staff Management and Role-Based Access Control (RBAC).

CREATE TABLE IF NOT EXISTS public.lab_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  role VARCHAR(50) NOT NULL DEFAULT 'technician', -- 'lab_admin', 'pathologist', 'technician'
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'inactive'
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualification VARCHAR(255),
  license_number VARCHAR(100),
  password_hash VARCHAR(255),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure email uniqueness within the same laboratory tenant (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_staff_tenant_email 
  ON public.lab_staff (lab_id, lower(email));

-- Tenant isolation lookup index
CREATE INDEX IF NOT EXISTS idx_lab_staff_tenant 
  ON public.lab_staff (lab_id);

-- Filter by lab and status
CREATE INDEX IF NOT EXISTS idx_lab_staff_tenant_status 
  ON public.lab_staff (lab_id, status);

-- Filter by lab and role
CREATE INDEX IF NOT EXISTS idx_lab_staff_tenant_role 
  ON public.lab_staff (lab_id, role);

-- Enable Row Level Security (RLS)
ALTER TABLE public.lab_staff ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.handle_lab_staff_modtime()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lab_staff_modtime ON public.lab_staff;
CREATE TRIGGER trg_lab_staff_modtime
  BEFORE UPDATE ON public.lab_staff
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_lab_staff_modtime();
