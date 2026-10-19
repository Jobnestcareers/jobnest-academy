-- Jobnest Academy update 27: two-part fee rounds to the nearest ₦5,000.
-- Example: fee ₦150,000 with 7% extra = ₦160,500, which now becomes ₦160,000 (2 × ₦80,000).
-- The current fee (₦85,000 with 6%) still gives ₦90,000, so nothing changes until you edit the fee.
create or replace function private.inst_total(p programmes) returns int
language sql immutable as $$
  select (round(p.fee * (1 + p.inst_pct / 100.0) / 5000) * 5000)::int
$$;
notify pgrst, 'reload schema';
