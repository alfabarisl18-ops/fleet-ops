-- Commit enum additions before the migration that uses them.
alter type public.shortfall_treatment add value if not exists 'DEFERRED_INSTALLMENT';
alter type public.overpayment_reason add value if not exists 'PURCHASE_PAYMENT';
