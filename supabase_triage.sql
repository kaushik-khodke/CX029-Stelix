-- Save this file and run it in your Supabase SQL Editor

-- 1. Create the sequence/table for triage queue
CREATE TABLE IF NOT EXISTS triage_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    patient_name TEXT NOT NULL,
    hospital_id UUID REFERENCES auth.users(id),
    arrival_time TIMESTAMPTZ DEFAULT NOW(),
    vitals JSONB DEFAULT '{}'::jsonb,
    symptoms TEXT,
    priority_level TEXT CHECK (priority_level IN ('RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE')),
    ai_confidence INTEGER,
    ai_reasoning TEXT,
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_treatment', 'discharged', 'admitted'))
);

-- 2. Enable Real-Time explicitly
alter publication supabase_realtime add table triage_queue;

-- 3. Row Level Security Set up
ALTER TABLE triage_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hospitals can read their own queue"
ON triage_queue FOR SELECT
TO authenticated
USING (hospital_id = auth.uid());

CREATE POLICY "Hospitals can insert to their queue"
ON triage_queue FOR INSERT
TO authenticated
WITH CHECK (hospital_id = auth.uid());

CREATE POLICY "Hospitals can update their queue"
ON triage_queue FOR UPDATE
TO authenticated
USING (hospital_id = auth.uid());
