-- ============================================================
-- Migration: Hospital Resource Load Balancer (Idempotent)
-- Safe to re-run — all statements use IF NOT EXISTS / IF EXISTS
-- ============================================================

-- ============================================================
-- 1. CREATE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hospital_beds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ward_type TEXT NOT NULL CHECK (ward_type IN ('ICU', 'GENERAL', 'OBSERVATION', 'EMERGENCY')),
  bed_number TEXT NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  triage_id UUID REFERENCES public.triage_queue(id) ON DELETE SET NULL,
  priority_assigned TEXT,
  admitted_at TIMESTAMPTZ,
  est_discharge TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hospital_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('doctor', 'nurse', 'paramedic', 'specialist')),
  shift_status TEXT DEFAULT 'off_duty' CHECK (shift_status IN ('on_duty', 'on_call', 'off_duty')),
  ward_assigned TEXT,
  contact TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.load_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ DEFAULT now(),
  total_beds INT,
  occupied_beds INT,
  waiting_patients INT,
  red_count INT,
  orange_count INT,
  load_index TEXT CHECK (load_index IN ('LOW', 'MODERATE', 'PEAK', 'CRITICAL')),
  load_score FLOAT,
  forecast_1h INT,
  forecast_4h INT
);

CREATE TABLE IF NOT EXISTS public.resource_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT CHECK (alert_type IN ('BED_SHORTAGE', 'STAFF_SURGE', 'ICU_CRITICAL', 'CAPACITY_WARNING')),
  message TEXT,
  severity TEXT CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  ai_recommendation TEXT,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. ADD COLUMNS (safe re-run with IF NOT EXISTS)
-- ============================================================

-- Forecast breakdown for inflow forecaster
ALTER TABLE public.load_snapshots
  ADD COLUMN IF NOT EXISTS forecast_breakdown JSONB;

-- ============================================================
-- 3. ENABLE REALTIME (safe: drops first if already a member)
-- ============================================================

DO $$
BEGIN
  -- load_snapshots
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.load_snapshots;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- already a member, skip
  END;

  -- resource_alerts
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.resource_alerts;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  -- hospital_beds
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hospital_beds;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  -- hospital_staff
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hospital_staff;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  -- medicines
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.medicines;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- ============================================================
-- 4. ROW LEVEL SECURITY (safe: drops policy first if exists)
-- ============================================================

-- hospital_beds
ALTER TABLE public.hospital_beds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable ALL for hospital owning the beds" ON public.hospital_beds;
CREATE POLICY "Enable ALL for hospital owning the beds"
  ON public.hospital_beds FOR ALL
  USING (auth.uid() = hospital_id)
  WITH CHECK (auth.uid() = hospital_id);

-- hospital_staff
ALTER TABLE public.hospital_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable ALL for hospital owning the staff" ON public.hospital_staff;
CREATE POLICY "Enable ALL for hospital owning the staff"
  ON public.hospital_staff FOR ALL
  USING (auth.uid() = hospital_id)
  WITH CHECK (auth.uid() = hospital_id);

-- load_snapshots
ALTER TABLE public.load_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable ALL for hospital owning the snapshots" ON public.load_snapshots;
CREATE POLICY "Enable ALL for hospital owning the snapshots"
  ON public.load_snapshots FOR ALL
  USING (auth.uid() = hospital_id)
  WITH CHECK (auth.uid() = hospital_id);

-- resource_alerts
ALTER TABLE public.resource_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable ALL for hospital owning the alerts" ON public.resource_alerts;
CREATE POLICY "Enable ALL for hospital owning the alerts"
  ON public.resource_alerts FOR ALL
  USING (auth.uid() = hospital_id)
  WITH CHECK (auth.uid() = hospital_id);
