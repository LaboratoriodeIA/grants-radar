-- Fix security warning by recreating function with proper search_path
CREATE OR REPLACE FUNCTION public.update_last_seen_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.last_seen_at = now();
    RETURN NEW;
END;
$$;