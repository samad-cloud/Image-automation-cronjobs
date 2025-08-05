begin;
  -- Enable UUID generation
  create extension if not exists "uuid-ossp";

  -- Create enum types
  create type event_status as enum ('pending', 'processing', 'completed', 'failed');
  create type job_status as enum ('running', 'completed', 'failed');

  -- Create test calendar events table
  create table test_calendar_events (
    id uuid primary key default uuid_generate_v4(),
    jira_id text not null unique,
    summary text not null,
    description text,
    due_date timestamp with time zone not null,
    region text not null,
    product_type text not null,
    campaign_type text not null,
    status event_status not null default 'pending',
    agent_result jsonb,
    image_urls text[],
    processed_by text,
    error text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    locked_until timestamp with time zone
  );

  -- Create test job runs table
  create table test_job_runs (
    id uuid primary key default uuid_generate_v4(),
    job_name text not null,
    instance_id text not null,
    status job_status not null default 'running',
    started_at timestamp with time zone default now(),
    completed_at timestamp with time zone,
    error text,
    metadata jsonb
  );

  -- Create function to claim next event
  create or replace function test_claim_next_event(
    p_worker_id text,
    p_timeout_minutes int
  )
  returns table (
    id uuid,
    jira_id text,
    summary text,
    description text,
    due_date timestamp with time zone,
    region text,
    product_type text,
    campaign_type text
  )
  security definer
  language plpgsql
  as $$
  begin
    return query
    with next_event as (
      select *
      from test_calendar_events
      where (status = 'pending'
         or (status = 'processing' 
             and locked_until < now()))
      order by due_date asc
      limit 1
      for update skip locked
    )
    update test_calendar_events ce
    set 
      status = 'processing',
      updated_at = now(),
      processed_by = p_worker_id,
      locked_until = now() + (p_timeout_minutes || ' minutes')::interval
    from next_event
    where ce.id = next_event.id
    returning 
      ce.id, ce.jira_id, ce.summary, ce.description,
      ce.due_date, ce.region, ce.product_type, ce.campaign_type;
  end;
  $$;

  -- Create RLS policies
  alter table test_calendar_events enable row level security;
  alter table test_job_runs enable row level security;

  -- Create policies for service role
  create policy "Service can do all on test_calendar_events"
    on test_calendar_events for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

  create policy "Service can do all on test_job_runs"
    on test_job_runs for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');
commit;