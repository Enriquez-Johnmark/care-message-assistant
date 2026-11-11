-- The made-up clinic: its staff, its patients as last fetched, the messages
-- and their drafts, the guidance and an append-only activity log.

create table staff (
    id          uuid primary key default gen_random_uuid(),
    email       text not null unique,
    name        text not null,
    role        text not null check (role in ('administrator', 'clinician', 'front-desk'))
);

-- Who the patient is is kept apart from the record the model may see.
create table patients (
    id          uuid primary key default gen_random_uuid(),
    fhir_id     text not null unique,
    given       text not null,
    family      text not null,
    birth_date  date not null,
    email       text not null,
    phone       text not null,
    address     text not null,
    facts       jsonb not null,
    fetched_at  timestamptz not null
);

create table messages (
    id           uuid primary key default gen_random_uuid(),
    fhir_id      text not null unique,
    key          text not null,
    patient_id   uuid not null references patients (id),
    sent_at      timestamptz not null,
    subject      text not null,
    text         text not null,
    received_at  timestamptz not null,
    type         text check (type in ('medication', 'symptom', 'test-result', 'admin')),
    urgency      text not null default 'routine' check (urgency in ('urgent', 'soon', 'routine')),
    red_flags    jsonb not null default '[]',
    needs_person text,
    status       text not null default 'open' check (status in ('open', 'answered'))
);

create table guidance_versions (
    version     integer primary key,
    text        text not null,
    created_at  timestamptz not null,
    created_by  text not null
);

create table drafts (
    id                uuid primary key default gen_random_uuid(),
    message_id        uuid not null references messages (id),
    attempt           integer not null,
    source            text not null check (source in ('model', 'template', 'urgent-template', 'clinician')),
    model             text,
    guidance_version  integer references guidance_versions (version),
    text              text not null,
    problems          jsonb not null,
    grade             double precision not null,
    created_at        timestamptz not null,
    created_by        text not null,
    unique (message_id, attempt)
);

-- Every model call, with its tokens, for the cost report.
create table model_calls (
    id             bigserial primary key,
    message_id     uuid references messages (id),
    purpose        text not null check (purpose in ('sort', 'draft')),
    model          text not null,
    input_tokens   integer not null,
    output_tokens  integer not null,
    ok             boolean not null,
    at             timestamptz not null
);

-- Every step, never changed or removed (G2).
create table audit_events (
    id            bigserial primary key,
    at            timestamptz not null,
    actor         text not null,
    action        text not null,
    subject_type  text not null,
    subject_id    text not null,
    details       jsonb not null default '{}'
);

create function audit_events_are_append_only() returns trigger language plpgsql as $$
begin
    raise exception 'the activity log is append-only';
end $$;

create trigger audit_events_append_only
    before update or delete or truncate on audit_events
    for each statement execute function audit_events_are_append_only();
