-- Commit enum addition before any statement uses SERVICE.
alter type public.day_outcome add value if not exists 'SERVICE' after 'DRIVERS_DAY';
