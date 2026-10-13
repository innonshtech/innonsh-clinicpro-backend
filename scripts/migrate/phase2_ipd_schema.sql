-- ==============================================================================
-- CLINICPRO PHASE 2: IPD & BED MANAGEMENT SCHEMA MIGRATION
-- Database: Supabase PostgreSQL
-- ==============================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Ensure clinics table has modules JSONB column with backward-compatible defaults
ALTER TABLE IF EXISTS public.clinics
ADD COLUMN IF NOT EXISTS modules JSONB DEFAULT '{"lab": true, "ipd": false}'::jsonb;

-- Backfill any existing clinics with NULL to preserve their existing behavior
UPDATE public.clinics 
SET modules = '{"lab": true, "ipd": false}'::jsonb 
WHERE modules IS NULL;

-- 3. Extend staff table to support ward assignment and housekeeping role
ALTER TABLE IF EXISTS public.staff
ADD COLUMN IF NOT EXISTS ward_id UUID,
ADD COLUMN IF NOT EXISTS department TEXT;

-- 4. BUILDINGS (Hospital Structure Level 1)
CREATE TABLE IF NOT EXISTS public.buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_clinic_building_name UNIQUE(clinic_id, name)
);

-- 5. FLOORS (Hospital Structure Level 2)
CREATE TABLE IF NOT EXISTS public.floors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  floor_number INT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_building_floor_number UNIQUE(building_id, floor_number)
);

-- 6. WARDS (Hospital Structure Level 3)
CREATE TABLE IF NOT EXISTS public.wards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  floor_id UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ward_type TEXT NOT NULL DEFAULT 'General',
  gender_type TEXT DEFAULT 'All',
  total_capacity INT DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_clinic_ward_name UNIQUE(clinic_id, name)
);

-- 7. ROOMS (Hospital Structure Level 4)
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  ward_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  room_type TEXT DEFAULT 'Standard',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_ward_room_number UNIQUE(ward_id, room_number)
);

-- 8. BEDS (Hospital Structure Level 5)
CREATE TABLE IF NOT EXISTS public.beds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  ward_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  bed_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE', 
  daily_rate NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_bed_status CHECK (
    status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'MAINTENANCE', 'BLOCKED', 'ISOLATION')
  ),
  CONSTRAINT uq_room_bed_number UNIQUE(room_id, bed_number)
);

-- 9. IPD ADMISSIONS
CREATE TABLE IF NOT EXISTS public.ipd_admissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  admission_number TEXT NOT NULL,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  admitting_doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  ward_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  bed_id UUID NOT NULL REFERENCES public.beds(id) ON DELETE RESTRICT,
  assigned_nurse_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  admission_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discharge_date TIMESTAMPTZ,
  diagnosis TEXT,
  admission_reason TEXT,
  status TEXT NOT NULL DEFAULT 'admitted',
  discharge_summary TEXT,
  calendar_days INT,
  bed_daily_rate NUMERIC(10, 2) DEFAULT 0.00,
  total_bed_charge NUMERIC(10, 2) DEFAULT 0.00,
  billing_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_admission_status CHECK (
    status IN ('admitted', 'discharged', 'transferred', 'cancelled')
  ),
  CONSTRAINT uq_clinic_admission_number UNIQUE(clinic_id, admission_number)
);

-- 10. IPD NURSE ASSIGNMENTS
CREATE TABLE IF NOT EXISTS public.ipd_nurse_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES public.ipd_admissions(id) ON DELETE CASCADE,
  nurse_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  ward_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. IPD CONSULTING / MULTIPLE DOCTORS
CREATE TABLE IF NOT EXISTS public.ipd_consulting_doctors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES public.ipd_admissions(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  assigned_by_doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  specialty TEXT,
  consultation_reason TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_admission_consulting_doctor UNIQUE(admission_id, doctor_id)
);

-- 12. IPD CLINICAL NOTES
CREATE TABLE IF NOT EXISTS public.ipd_clinical_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES public.ipd_admissions(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  note_type TEXT DEFAULT 'Progress Note',
  notes TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. BED STATUS HISTORY
CREATE TABLE IF NOT EXISTS public.bed_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  bed_id UUID NOT NULL REFERENCES public.beds(id) ON DELETE CASCADE,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL,
  reason TEXT,
  related_admission_id UUID REFERENCES public.ipd_admissions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. INDEXES
CREATE INDEX IF NOT EXISTS idx_buildings_clinic ON public.buildings(clinic_id);
CREATE INDEX IF NOT EXISTS idx_floors_clinic_building ON public.floors(clinic_id, building_id);
CREATE INDEX IF NOT EXISTS idx_wards_clinic ON public.wards(clinic_id);
CREATE INDEX IF NOT EXISTS idx_rooms_ward ON public.rooms(clinic_id, ward_id);
CREATE INDEX IF NOT EXISTS idx_beds_status ON public.beds(clinic_id, ward_id, status);
CREATE INDEX IF NOT EXISTS idx_beds_room ON public.beds(room_id);
CREATE INDEX IF NOT EXISTS idx_staff_ward ON public.staff(clinic_id, ward_id, role);
CREATE INDEX IF NOT EXISTS idx_admissions_active_patient ON public.ipd_admissions(clinic_id, patient_id) WHERE status = 'admitted';
CREATE INDEX IF NOT EXISTS idx_admissions_active_bed ON public.ipd_admissions(clinic_id, bed_id) WHERE status = 'admitted';
CREATE INDEX IF NOT EXISTS idx_nurse_active_assignments ON public.ipd_nurse_assignments(clinic_id, nurse_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_consulting_doctors_admission ON public.ipd_consulting_doctors(admission_id);
CREATE INDEX IF NOT EXISTS idx_bed_history_bed ON public.bed_status_history(clinic_id, bed_id, created_at DESC);
