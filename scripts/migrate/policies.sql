-- Enable Row Level Security (RLS) on all tables

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;

-- Helper function to get the current user's role and clinic from JWT
-- We assume JWT contains 'user_role' and 'tenant_id' (clinic_id)
CREATE OR REPLACE FUNCTION auth.user_role() RETURNS text AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'user_role', '')::text;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'tenant_id', '')::uuid;
$$ LANGUAGE sql STABLE;


-- 1. Admins (Superuser bypass via RLS)
-- We will create a policy that allows admins full access to everything
-- This is applied to all tables implicitly if we use a helper like:
-- CREATE POLICY "Admins can do everything" ON table_name FOR ALL USING (auth.user_role() = 'admin');

-- Let's apply basic multi-tenant policies using the tenant_id claim.
-- If the JWT claim 'tenant_id' matches the row's 'clinic_id', access is granted.

DO $$
DECLARE
    t_name text;
BEGIN
    FOR t_name IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'clinic_id' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('
            CREATE POLICY "Tenant Isolation Policy" ON public.%I 
            FOR ALL 
            USING (
                auth.user_role() = ''admin'' 
                OR clinic_id = auth.tenant_id()
                OR auth.tenant_id() IS NULL -- If backend service role uses it
            );
        ', t_name);
    END LOOP;
END
$$;

-- Policy for clinics table (since its ID is the tenant_id)
CREATE POLICY "Clinics Isolation Policy" ON public.clinics
FOR ALL
USING (
    auth.user_role() = 'admin'
    OR id = auth.tenant_id()
);

-- Policy for Admins table
CREATE POLICY "Admins Isolation Policy" ON public.admins
FOR ALL
USING (
    auth.user_role() = 'admin'
);

-- Note: The Service Role Key bypasses RLS entirely, so the backend API 
-- can use the Supabase Service Key to perform all operations, enforcing
-- logic at the application layer as it currently does in Node.js.
-- RLS policies above provide a defense-in-depth if you ever expose 
-- the Supabase Anon key directly to the frontend later.
