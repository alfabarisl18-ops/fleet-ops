-- Fleet Operations SL
-- New alert type: a correction someone other than Owner/Admin requested is
-- now something the bell can actually surface, not just the Records page —
-- see docs/decisions/0022-correction-requested-alert.md. Split into its own
-- migration: ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction that also uses the new value, and the next migration's
-- triggers reference it immediately.

alter type public.alert_type add value 'CORRECTION_REQUESTED';
