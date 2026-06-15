-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Admins
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Clinics (Tenants)
CREATE TABLE IF NOT EXISTS public.clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_name TEXT,
  clinic_type TEXT,
  description TEXT,
  registration_number TEXT UNIQUE,
  tax_id TEXT,
  specialties TEXT[] DEFAULT '{}',
  logo TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  password TEXT,
  images TEXT[] DEFAULT '{}',
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  role TEXT DEFAULT 'clinic',
  license_document JSONB,
  gst_document JSONB,
  license_document_url TEXT,
  gst_document_url TEXT,
  rejection_reason TEXT,
  is_24x7 BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending',
  opening_hours JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Doctors
CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  profile_image TEXT,
  date_of_birth TEXT,
  gender TEXT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  home_address TEXT,
  phone TEXT,
  specialty TEXT,
  sup_speciality TEXT,
  identity_proof TEXT,
  degree_certificate TEXT,
  experience INTEGER DEFAULT 0,
  consultant_fee NUMERIC,
  qualifications TEXT[] DEFAULT '{}',
  license_number TEXT,
  session_time TEXT,
  hospital TEXT,
  hospital_address TEXT,
  hospital_number TEXT,
  is_verified BOOLEAN DEFAULT false,
  status TEXT,
  role TEXT DEFAULT 'doctor',
  available_days TEXT[] DEFAULT '{}',
  available_time TEXT,
  available JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Patients
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_code TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  blood_group TEXT,
  emergency_contact TEXT,
  medical_history TEXT,
  allergies TEXT,
  current_medications TEXT,
  symptoms TEXT,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'patient',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Staff
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  status TEXT DEFAULT 'active',
  password TEXT NOT NULL,
  role TEXT DEFAULT 'receptionist',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Visits
CREATE TABLE IF NOT EXISTS public.visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id UUID UNIQUE, -- Added constraint after creating appointments
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  status TEXT DEFAULT 'in_progress',
  diagnosis TEXT,
  medicines JSONB[] DEFAULT '{}',
  notes TEXT,
  follow_up_date TIMESTAMPTZ,
  follow_up_notes TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  prescription_url TEXT,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  status TEXT DEFAULT 'booked',
  type TEXT DEFAULT 'normal',
  linked_visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  cancel_reason TEXT,
  queue_number INTEGER,
  check_in_time TIMESTAMPTZ,
  is_emergency BOOLEAN DEFAULT false,
  rescheduled_from TEXT,
  sms_notified BOOLEAN DEFAULT false,
  doctor_name TEXT,
  patient_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key reference to visit that was skipped earlier due to ordering
ALTER TABLE public.visits 
ADD CONSTRAINT fk_visit_appointment 
FOREIGN KEY (appointment_id) 
REFERENCES public.appointments(id) 
ON DELETE CASCADE;

-- 8. Billings
CREATE TABLE IF NOT EXISTS public.billings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  billing_id TEXT UNIQUE NOT NULL,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES public.visits(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE,
  items JSONB[] DEFAULT '{}',
  total_amount NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  final_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  payment_method TEXT,
  transaction_id TEXT,
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC DEFAULT 0,
  remaining_amount NUMERIC DEFAULT 0,
  refund_amount NUMERIC DEFAULT 0,
  refund_reason TEXT,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL,
  user_name TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  changes_before JSONB,
  changes_after JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Availabilities
CREATE TABLE IF NOT EXISTS public.availabilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  available_slots TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, date)
);

-- 11. Leaves
CREATE TABLE IF NOT EXISTS public.leaves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT DEFAULT 'Not specified',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, date)
);

-- 12. Rate Limits
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  hits INTEGER DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Sessions (Optional, largely handled by Supabase Auth, but porting for completion)
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL,
  refresh_token TEXT UNIQUE NOT NULL,
  used_refresh_tokens TEXT[] DEFAULT '{}',
  ip_address TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Counters
CREATE TABLE IF NOT EXISTS public.counters (
  id TEXT PRIMARY KEY,
  seq INTEGER DEFAULT 0
);
