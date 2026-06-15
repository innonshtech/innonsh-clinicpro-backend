-- Patients Indexes
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON public.patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_code ON public.patients(patient_code);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_patients_email ON public.patients(email);
-- Compound Index for Name Search
CREATE INDEX IF NOT EXISTS idx_patients_clinic_name ON public.patients(clinic_id, first_name, last_name);
-- Text search index
CREATE INDEX IF NOT EXISTS idx_patients_text_search ON public.patients USING GIN (
  to_tsvector('english', first_name || ' ' || last_name || ' ' || phone_number || ' ' || patient_code)
);

-- Doctors Indexes
CREATE INDEX IF NOT EXISTS idx_doctors_clinic_id ON public.doctors(clinic_id);
CREATE INDEX IF NOT EXISTS idx_doctors_email ON public.doctors(email);

-- Appointments Indexes
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id ON public.appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON public.appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date_doctor ON public.appointments(appointment_date, doctor_id);
-- Compound index for sequential queue
CREATE INDEX IF NOT EXISTS idx_appointments_queue ON public.appointments(clinic_id, doctor_id, appointment_date, queue_number);
-- Partial unique index to prevent double booking
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_double_booking 
ON public.appointments(doctor_id, appointment_date, time_slot)
WHERE status IN ('booked', 'scheduled', 'checked_in', 'in_progress');

-- Billings Indexes
CREATE INDEX IF NOT EXISTS idx_billings_billing_id ON public.billings(billing_id);
CREATE INDEX IF NOT EXISTS idx_billings_clinic_id ON public.billings(clinic_id);
CREATE INDEX IF NOT EXISTS idx_billings_patient_id ON public.billings(patient_id);
CREATE INDEX IF NOT EXISTS idx_billings_visit_id ON public.billings(visit_id);
CREATE INDEX IF NOT EXISTS idx_billings_doctor_id ON public.billings(doctor_id);
CREATE INDEX IF NOT EXISTS idx_billings_status ON public.billings(status);

-- Visits Indexes
CREATE INDEX IF NOT EXISTS idx_visits_clinic_id ON public.visits(clinic_id);
CREATE INDEX IF NOT EXISTS idx_visits_doctor_id ON public.visits(doctor_id);
CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON public.visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_appointment_id ON public.visits(appointment_id);

-- Staff Indexes
CREATE INDEX IF NOT EXISTS idx_staff_clinic_id ON public.staff(clinic_id);
CREATE INDEX IF NOT EXISTS idx_staff_email ON public.staff(email);

-- AuditLogs Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_id ON public.audit_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);

-- Availabilities Indexes
CREATE INDEX IF NOT EXISTS idx_availabilities_clinic_id ON public.availabilities(clinic_id);
CREATE INDEX IF NOT EXISTS idx_availabilities_date ON public.availabilities(date);

-- Leaves Indexes
CREATE INDEX IF NOT EXISTS idx_leaves_clinic_id ON public.leaves(clinic_id);

-- RateLimits Indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_endpoint ON public.rate_limits(ip, endpoint);
-- Rate limits TTL index equivalent (in Supabase, we might use pg_cron to clean up, but index helps with lookup)
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires_at ON public.rate_limits(expires_at);

-- Sessions Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.sessions(expires_at);
