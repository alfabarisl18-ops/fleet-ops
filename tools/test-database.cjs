
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.FLEET_PGLITE_MODULE || path.join(require('node:os').tmpdir(), 'fleet-ops-db-test-runtime/node_modules/@electric-sql/pglite'));
(async () => {
 const db = new PGlite();
 await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema extensions; create schema storage; create schema cron;
 create table auth.users(id uuid primary key, email text, encrypted_password text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select current_user::text $$;
 create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
 create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
 create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
 create function cron.unschedule(text) returns boolean language sql as $$ select true $$;
 grant usage on schema auth,storage to authenticated,anon;
 grant execute on all functions in schema auth to authenticated,anon;
 `);
 for (const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort()) {
   if(file==='20260916130000_maintenance_issues.sql') await db.exec(`
     insert into auth.users(id) values ('e1000000-0000-0000-0000-000000000001');
     insert into public.users(id,auth_user_id,display_name,role,email)
     values ('e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','Backfill manager','FLEET_MANAGER','backfill@example.test');
     insert into public.vehicles(id,client_record_id,fleet_id,type)
     values ('e1000000-0000-0000-0000-000000000002',gen_random_uuid(),'BACKFILL','LONG_SPRINTER');
     insert into public.maintenance_orders(id,client_record_id,vehicle_id,record_type,service_area,work_action,problem_descriptor,opened_by)
     values ('e1000000-0000-0000-0000-000000000003',gen_random_uuid(),'e1000000-0000-0000-0000-000000000002','REPAIR','Suspension','Replaced spring',null,'e1000000-0000-0000-0000-000000000001');
   `);
   if(file==='20260907172000_purchase_schedule.sql') await db.exec(fs.readFileSync('tools/database-before-policy.sql','utf8'));
   let sql=fs.readFileSync(path.join('supabase/migrations',file),'utf8');
   sql=sql.replace(/create extension if not exists pg_cron[^;]*;/gi,'');
   sql=sql.replace(/create extension if not exists pgcrypto[^;]*;/gi,'');
   try { await db.exec(sql); } catch(e) { throw new Error(file+': '+e.message); }
 }
 if(process.argv.includes('--generate-types')) await require('./update-local-types.cjs')(db);
 console.log('All migrations applied to isolated PostgreSQL (platform auth/storage/cron scaffolding).');
 if(fs.existsSync('tools/database-tests.sql')) await db.exec(fs.readFileSync('tools/database-tests.sql','utf8'));
 console.log('Database behavior assertions passed.');
 await db.close();
})().catch(e=>{ console.error(e.message, e.where || ''); process.exit(1); });
