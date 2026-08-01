-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['patient'::text, 'doctor'::text, 'admin'::text, 'pharmacist'::text, 'hospital'::text])),
  full_name text,
  phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.patients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  uhid text UNIQUE,
  full_name text NOT NULL,
  phone text,
  date_of_birth date,
  blood_group text,
  emergency_name text,
  emergency_contact text,
  address text,
  city text,
  state text,
  pincode text,
  profile_completed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  smart_pin text,
  external_id text,
  CONSTRAINT patients_pkey PRIMARY KEY (id),
  CONSTRAINT patients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.doctors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  license_id text UNIQUE,
  specialization text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  shift_type text DEFAULT 'Morning Shift'::text,
  ward_assigned text DEFAULT 'General Ward'::text,
  CONSTRAINT doctors_pkey PRIMARY KEY (id),
  CONSTRAINT doctors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.consent_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text])),
  access_type text NOT NULL DEFAULT 'read'::text CHECK (access_type = ANY (ARRAY['read'::text, 'read_write'::text])),
  reason text,
  expires_at timestamp with time zone,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT consent_requests_pkey PRIMARY KEY (id),
  CONSTRAINT consent_requests_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT consent_requests_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id)
);
CREATE TABLE public.records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  record_type text NOT NULL,
  title text NOT NULL,
  record_date date,
  doctor_name text,
  notes text,
  file_url text,
  file_name text,
  file_size integer,
  ipfs_hash text,
  extracted_text text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ipfs_cid text,
  sha256_hash text,
  encrypted_metadata jsonb,
  file_size_bytes bigint,
  file_type text,
  encrypted boolean NOT NULL DEFAULT false,
  CONSTRAINT records_pkey PRIMARY KEY (id),
  CONSTRAINT records_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT records_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.document_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  content text NOT NULL,
  embedding USER-DEFINED,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT document_chunks_pkey PRIMARY KEY (id),
  CONSTRAINT document_chunks_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.records(id),
  CONSTRAINT document_chunks_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id)
);
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id)
);
CREATE TABLE public.medicines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  strength text,
  unit_type text,
  stock integer NOT NULL DEFAULT 0,
  prescription_required boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  product_id bigint,
  pzn text,
  price_rec numeric,
  package_size text,
  description text,
  reorder_threshold integer DEFAULT 10,
  last_restocked_at timestamp with time zone,
  CONSTRAINT medicines_pkey PRIMARY KEY (id)
);
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid,
  status text NOT NULL CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'fulfilled'::text, 'cancelled'::text])),
  total_items integer NOT NULL DEFAULT 0,
  channel text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  finalized_at timestamp with time zone,
  shipping_name text,
  shipping_email text,
  shipping_phone text,
  shipping_address text,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id)
);
CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid,
  medicine_id uuid,
  qty integer NOT NULL,
  dosage_text text,
  frequency_per_day integer,
  days_supply integer,
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_items_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.medicines(id)
);
CREATE TABLE public.refill_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid,
  medicine_id uuid,
  predicted_runout_date date,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT refill_alerts_pkey PRIMARY KEY (id),
  CONSTRAINT refill_alerts_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT refill_alerts_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.medicines(id)
);
CREATE TABLE public.notification_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid,
  channel text NOT NULL,
  type text NOT NULL,
  payload jsonb,
  status text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_logs_pkey PRIMARY KEY (id),
  CONSTRAINT notification_logs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id)
);
CREATE TABLE public.order_history_raw (
  id bigint NOT NULL DEFAULT nextval('order_history_raw_id_seq'::regclass),
  patient_external_id text,
  patient_age integer,
  patient_gender text,
  purchase_date timestamp with time zone,
  product_name text,
  quantity integer,
  total_price_eur numeric,
  dosage_frequency text,
  prescription_required_raw text,
  CONSTRAINT order_history_raw_pkey PRIMARY KEY (id)
);
CREATE TABLE public.triage_queue (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id uuid,
  patient_name text NOT NULL,
  hospital_id uuid,
  arrival_time timestamp with time zone DEFAULT now(),
  vitals jsonb DEFAULT '{}'::jsonb,
  symptoms text,
  priority_level text CHECK (priority_level = ANY (ARRAY['RED'::text, 'ORANGE'::text, 'YELLOW'::text, 'GREEN'::text, 'BLUE'::text])),
  ai_confidence integer,
  ai_reasoning text,
  status text DEFAULT 'waiting'::text CHECK (status = ANY (ARRAY['waiting'::text, 'in_treatment'::text, 'discharged'::text, 'admitted'::text])),
  CONSTRAINT triage_queue_pkey PRIMARY KEY (id),
  CONSTRAINT triage_queue_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT triage_queue_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES auth.users(id)
);
CREATE TABLE public.medication_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  medicine_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['taken'::text, 'missed'::text])),
  scheduled_time timestamp with time zone,
  taken_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT medication_logs_pkey PRIMARY KEY (id),
  CONSTRAINT medication_logs_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.medicines(id)
);
CREATE TABLE public.reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  medicine_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  reminder_time time without time zone NOT NULL,
  frequency integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reminders_pkey PRIMARY KEY (id),
  CONSTRAINT reminders_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.medicines(id)
);
CREATE TABLE public.health_routines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  metric_type text NOT NULL CHECK (metric_type = ANY (ARRAY['hydration'::text, 'steps'::text, 'sleep'::text, 'blood_pressure'::text, 'blood_sugar'::text])),
  value text NOT NULL,
  unit text,
  logged_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT health_routines_pkey PRIMARY KEY (id)
);
CREATE TABLE public.hospital_beds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  ward_type text NOT NULL CHECK (ward_type = ANY (ARRAY['ICU'::text, 'GENERAL'::text, 'OBSERVATION'::text, 'EMERGENCY'::text])),
  bed_number text NOT NULL,
  status text DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'occupied'::text, 'reserved'::text, 'maintenance'::text])),
  patient_id uuid,
  triage_id uuid,
  priority_assigned text,
  admitted_at timestamp with time zone,
  est_discharge timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hospital_beds_pkey PRIMARY KEY (id),
  CONSTRAINT hospital_beds_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES auth.users(id),
  CONSTRAINT hospital_beds_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT hospital_beds_triage_id_fkey FOREIGN KEY (triage_id) REFERENCES public.triage_queue(id)
);
CREATE TABLE public.load_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  snapshot_at timestamp with time zone DEFAULT now(),
  total_beds integer,
  occupied_beds integer,
  waiting_patients integer,
  red_count integer,
  orange_count integer,
  load_index text CHECK (load_index = ANY (ARRAY['LOW'::text, 'MODERATE'::text, 'PEAK'::text, 'CRITICAL'::text])),
  load_score double precision,
  forecast_1h integer,
  forecast_4h integer,
  forecast_breakdown jsonb,
  CONSTRAINT load_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT load_snapshots_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES auth.users(id)
);
CREATE TABLE public.resource_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL,
  alert_type text CHECK (alert_type = ANY (ARRAY['BED_SHORTAGE'::text, 'STAFF_SURGE'::text, 'ICU_CRITICAL'::text, 'CAPACITY_WARNING'::text])),
  message text,
  severity text CHECK (severity = ANY (ARRAY['INFO'::text, 'WARNING'::text, 'CRITICAL'::text])),
  ai_recommendation text,
  acknowledged boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  metadata jsonb,
  CONSTRAINT resource_alerts_pkey PRIMARY KEY (id),
  CONSTRAINT resource_alerts_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES auth.users(id)
);
CREATE TABLE public.medical_equipment (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_id uuid,
  name text NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'available'::text,
  last_inspected_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT medical_equipment_pkey PRIMARY KEY (id),
  CONSTRAINT medical_equipment_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES auth.users(id)
);
CREATE TABLE public.ambulance_fleet (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_id uuid,
  vehicle_number text NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'station'::text,
  last_location text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ambulance_fleet_pkey PRIMARY KEY (id),
  CONSTRAINT ambulance_fleet_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES auth.users(id)
);
CREATE TABLE public.blood_bank (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_id uuid,
  blood_type text NOT NULL,
  units_available integer DEFAULT 0,
  low_threshold integer DEFAULT 5,
  last_updated timestamp with time zone DEFAULT now(),
  CONSTRAINT blood_bank_pkey PRIMARY KEY (id),
  CONSTRAINT blood_bank_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES auth.users(id)
);
CREATE TABLE public.lab_supplies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  hospital_id uuid,
  item_name text NOT NULL,
  quantity integer DEFAULT 0,
  unit text NOT NULL,
  category text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lab_supplies_pkey PRIMARY KEY (id),
  CONSTRAINT lab_supplies_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES auth.users(id)
);
CREATE TABLE public.doctor_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_id uuid,
  hospital_id uuid,
  ward text,
  shift text,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'no_response'::text])),
  created_at timestamp with time zone DEFAULT now(),
  responded_at timestamp with time zone,
  CONSTRAINT doctor_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT doctor_assignments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id)
);