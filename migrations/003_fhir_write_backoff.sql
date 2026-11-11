-- A reply whose write to the FHIR server failed waits longer each time before
-- it is tried again, and is given up on after ten tries.
alter table replies add column fhir_next_try_at timestamptz;
