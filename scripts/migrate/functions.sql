-- Generic function to update the 'updated_at' column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to handle new user signups via Supabase Auth
-- This function will be triggered when a new user is created in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- We don't automatically insert into profiles here because the role could be clinic, doctor, patient, or staff.
  -- This will be handled by the backend application logic mapping auth.uid() to the respective tables.
  -- However, we can store a generic profile mapping if needed in the future.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Queue number generator for appointments
CREATE OR REPLACE FUNCTION public.generate_appointment_queue_number()
RETURNS TRIGGER AS $$
DECLARE
  next_queue INT;
BEGIN
  IF NEW.queue_number IS NULL THEN
    SELECT COALESCE(MAX(queue_number), 0) + 1 INTO next_queue
    FROM public.appointments
    WHERE clinic_id = NEW.clinic_id 
      AND doctor_id = NEW.doctor_id 
      AND appointment_date = NEW.appointment_date;
      
    NEW.queue_number := next_queue;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Atomic counter increment for patient codes, invoice numbers, etc.
-- Replaces the Mongoose findByIdAndUpdate + $inc pattern.
CREATE OR REPLACE FUNCTION public.increment_counter(counter_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  new_seq INTEGER;
BEGIN
  INSERT INTO public.counters (id, seq)
  VALUES (counter_id, 1)
  ON CONFLICT (id)
  DO UPDATE SET seq = public.counters.seq + 1
  RETURNING seq INTO new_seq;

  RETURN new_seq;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
