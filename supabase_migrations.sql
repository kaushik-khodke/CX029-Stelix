-- Create medication_logs table
CREATE TABLE IF NOT EXISTS public.medication_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL, -- auth.uid() or patients.user_id
    medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL, -- To link the log to a specific prescription/order
    status TEXT NOT NULL CHECK (status IN ('taken', 'missed')),
    scheduled_time TIMESTAMP WITH TIME ZONE,
    taken_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for medication_logs
ALTER TABLE public.medication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own medication logs" ON public.medication_logs
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- Create reminders table
CREATE TABLE IF NOT EXISTS public.reminders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL,
    reminder_time TIME NOT NULL, -- e.g., '08:00:00'
    frequency INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for reminders
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own reminders" ON public.reminders
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- Create health_routines table
CREATE TABLE IF NOT EXISTS public.health_routines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    metric_type TEXT NOT NULL CHECK (metric_type IN ('hydration', 'steps', 'sleep', 'blood_pressure', 'blood_sugar')),
    value TEXT NOT NULL, 
    unit TEXT,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for health_routines
ALTER TABLE public.health_routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own health routines" ON public.health_routines
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);