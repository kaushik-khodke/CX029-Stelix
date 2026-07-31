-- Add RLS policy for pharmacists to view profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pharmacists can view all profiles" ON public.profiles;
CREATE POLICY "Pharmacists can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'pharmacist')
  );
