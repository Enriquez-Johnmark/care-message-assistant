-- Review and sending (E1–E4, F1–F4), and emailed-link logins (H1).

-- An approval binds the draft's exact text by its hash (E2).
create table approvals (
    draft_id      uuid primary key references drafts (id),
    message_id    uuid not null references messages (id),
    content_hash  text not null,
    approved_by   uuid not null references staff (id),
    approved_at   timestamptz not null
);

alter table drafts add column discarded_reason text;

-- The reply sent to the portal: one per message (F2), with the disclosure
-- added by code (F3).
create table replies (
    id           uuid primary key default gen_random_uuid(),
    message_id   uuid not null unique references messages (id),
    draft_id     uuid not null references drafts (id),
    text         text not null,
    approved_by  uuid not null references staff (id),
    sent_at      timestamptz not null,
    -- Written to the FHIR server as a Communication (F4).
    fhir_written_at  timestamptz,
    fhir_attempts    integer not null default 0,
    fhir_error       text
);

-- A login link: only its hash is kept, used once, valid for 15 minutes.
create table login_tokens (
    token_hash   text primary key,
    who          text not null check (who in ('staff', 'patient')),
    person_id    uuid not null,
    created_at   timestamptz not null,
    expires_at   timestamptz not null,
    used_at      timestamptz
);

create table sessions (
    secret_hash  text primary key,
    who          text not null check (who in ('staff', 'patient')),
    person_id    uuid not null,
    created_at   timestamptz not null,
    expires_at   timestamptz not null
);
