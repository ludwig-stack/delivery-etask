begin;

-- Private tables and server-only RPCs. Browser roles have no access.
create schema if not exists dsi_private;
revoke all on schema dsi_private from public, anon, authenticated;
grant usage on schema dsi_private to service_role;
create table if not exists dsi_private.store_metadata (
 id integer primary key check (id=1),
 revision bigint not null check (revision>=0),
 updated_at text not null check (updated_at::timestamptz is not null)
);
insert into dsi_private.store_metadata values (1,0,to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) on conflict do nothing;
create table if not exists dsi_private.events (
 sequence bigint generated always as identity primary key,
 id text not null unique check (length(id)>0),
 entity_type text not null check (entity_type in ('task','milestone','metrics')),
 entity_id text not null check (length(entity_id)>0),
 version integer not null check (version>=1),
 payload text not null check (jsonb_typeof(payload::jsonb)='object'),
 actor_id text not null check (length(actor_id)>0),
 actor_name text not null check (length(actor_name)>0),
 at text not null check (at::timestamptz is not null),
 unique (entity_type,entity_id,version)
);
create table if not exists dsi_private.login_attempts (
 identifier text not null,
 at text not null check (at::timestamptz is not null)
);
create index if not exists login_attempts_identifier on dsi_private.login_attempts(identifier);
alter table dsi_private.store_metadata enable row level security;
alter table dsi_private.events enable row level security;
alter table dsi_private.login_attempts enable row level security;
revoke all on all tables in schema dsi_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema dsi_private to service_role;
grant usage, select on all sequences in schema dsi_private to service_role;

create or replace function public.dsi_read_store() returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object(
  'revision',m.revision,'updatedAt',m.updated_at,
  'events',coalesce((select jsonb_agg(to_jsonb(e)-'sequence' order by e.sequence) from dsi_private.events e),'[]'::jsonb),
  'loginAttempts',coalesce((select jsonb_agg(to_jsonb(a)) from dsi_private.login_attempts a),'[]'::jsonb)
 ) from dsi_private.store_metadata m where m.id=1;
$$;

create or replace function public.dsi_commit_event(p_revision bigint,p_event jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare current_revision bigint; previous_version integer;
begin
 select revision into current_revision from dsi_private.store_metadata where id=1 for update;
 if current_revision is distinct from p_revision then
  raise exception 'Tracker changed during validation' using errcode='40001';
 end if;
 select coalesce(max(version),0) into previous_version from dsi_private.events
  where entity_type=p_event->>'entity_type' and entity_id=p_event->>'entity_id';
 if (p_event->>'version')::integer is distinct from previous_version+1 then
  raise exception 'Record version changed' using errcode='40001';
 end if;
 insert into dsi_private.events(id,entity_type,entity_id,version,payload,actor_id,actor_name,at)
 values(p_event->>'id',p_event->>'entity_type',p_event->>'entity_id',(p_event->>'version')::integer,
  p_event->>'payload',p_event->>'actor_id',p_event->>'actor_name',p_event->>'at');
 update dsi_private.store_metadata set revision=revision+1,
  updated_at=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') where id=1;
end;
$$;

create or replace function public.dsi_record_login_attempt(p_identifier text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare attempt_count integer; server_now timestamptz;
begin
 -- Shared across Vercel instances. The database clock controls the rate window.
 perform 1 from dsi_private.store_metadata where id=1 for update;
 server_now:=clock_timestamp();
 delete from dsi_private.login_attempts where at::timestamptz<server_now-interval '15 minutes';
 select count(*) into attempt_count from dsi_private.login_attempts where identifier=p_identifier;
 if attempt_count>=8 then return false; end if;
 insert into dsi_private.login_attempts values(p_identifier,to_char(server_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 return true;
end;
$$;

create or replace function public.dsi_import_store(p_data jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from dsi_private.store_metadata where id=1 for update;
 if exists(select 1 from dsi_private.events) or exists(select 1 from dsi_private.login_attempts)
  or exists(select 1 from dsi_private.store_metadata where revision<>0) then
  raise exception 'Import requires an empty database; existing data was preserved' using errcode='55000';
 end if;
 if p_data->>'schema' is distinct from 'dsi-json-store/1'
  or jsonb_typeof(p_data->'events') is distinct from 'array'
  or jsonb_typeof(p_data->'loginAttempts') is distinct from 'array'
  or (p_data->>'revision')::bigint is null
  or (p_data->>'updatedAt')::timestamptz is null then
  raise exception 'Invalid import';
 end if;
 insert into dsi_private.events(id,entity_type,entity_id,version,payload,actor_id,actor_name,at)
 select e.id,e.entity_type,e.entity_id,e.version,e.payload,e.actor_id,e.actor_name,e.at
 from jsonb_to_recordset(p_data->'events') as e(id text,entity_type text,entity_id text,version integer,payload text,actor_id text,actor_name text,at text);
 if exists(select 1 from dsi_private.events group by entity_type,entity_id having min(version)<>1 or count(*)<>max(version)) then
  raise exception 'Incomplete event version history';
 end if;
 insert into dsi_private.login_attempts select a.identifier,a.at
 from jsonb_to_recordset(p_data->'loginAttempts') as a(identifier text,at text);
 update dsi_private.store_metadata set revision=(p_data->>'revision')::bigint,updated_at=p_data->>'updatedAt' where id=1;
end;
$$;

revoke all on function public.dsi_read_store() from public, anon, authenticated;
revoke all on function public.dsi_commit_event(bigint,jsonb) from public, anon, authenticated;
revoke all on function public.dsi_record_login_attempt(text) from public, anon, authenticated;
revoke all on function public.dsi_import_store(jsonb) from public, anon, authenticated;
grant execute on function public.dsi_read_store() to service_role;
grant execute on function public.dsi_commit_event(bigint,jsonb) to service_role;
grant execute on function public.dsi_record_login_attempt(text) to service_role;
grant execute on function public.dsi_import_store(jsonb) to service_role;
commit;
