"""Replay project migrations without data in a disposable local Supabase database.

Run from the repository root: python3 scripts/verify-migration-baseline.py
Never connects to a remote project or resets the existing database.
"""
from pathlib import Path
import subprocess,json,re,uuid
CONTAINER='supabase_db_prontuario-cbb'
SCRATCH='cbb_008a_verify_'+uuid.uuid4().hex[:10]
def run(args,stdin=None):
 r=subprocess.run(['docker','exec','-i',CONTAINER,*args],input=stdin,text=True,capture_output=True)
 if r.returncode: raise RuntimeError(r.stderr[-5000:])
 return r.stdout
def sql(s,db='postgres'):
 return run(['psql','-X','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1'],s).strip()
def snapshot(db):
 q="""
 with objects as (
 select 'function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' key,
 jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl::text) value
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','clinical') and p.prokind='f'
 and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
 union all
 select 'column:'||n.nspname||'.'||c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity)
 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
 where n.nspname in('public','clinical') and c.relkind in('r','p') and a.attnum>0 and not a.attisdropped
 union all
 select 'table:'||n.nspname||'.'||c.relname,jsonb_build_object('rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','clinical') and c.relkind in('r','p')
 union all
 select 'constraint:'||n.nspname||'.'||c.relname||'.'||t.conname,to_jsonb(pg_get_constraintdef(t.oid))
 from pg_constraint t join pg_class c on c.oid=t.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','clinical')
 union all
 select 'trigger:'||n.nspname||'.'||c.relname||'.'||t.tgname,to_jsonb(pg_get_triggerdef(t.oid))
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','clinical') and not t.tgisinternal
 union all
 select 'index:'||schemaname||'.'||indexname,to_jsonb(indexdef) from pg_indexes where schemaname in('public','clinical')
 union all
 select 'policy:'||schemaname||'.'||tablename||'.'||policyname,to_jsonb(p)-'schemaname'-'tablename'-'policyname'
 from pg_policies p where schemaname in('public','clinical') or (schemaname='storage' and policyname like 'clinical%')
 ) select jsonb_object_agg(key,value) from objects;
 """
 result=json.loads(sql(q,db))
 # pg_get_functiondef preserves insignificant trailing spaces in function source.
 for value in result.values():
  if isinstance(value,dict) and 'definition' in value:
   value['definition']='\n'.join(line.rstrip() for line in value['definition'].splitlines())
 return result
created=False
try:
 files=sorted(Path('supabase/migrations').glob('*.sql'))
 versions=[p.name.split('_',1)[0] for p in files]
 if len(versions)!=len(set(versions)): raise SystemExit('Duplicate migration versions')
 ledger=set(sql('select version from supabase_migrations.schema_migrations;').splitlines())
 if set(versions)!=ledger:
  raise SystemExit(f'Ledger mismatch: missing={sorted(set(versions)-ledger)}, extra={sorted(ledger-set(versions))}')
 print('Local ledger:',len(ledger),'unique versions, matching repository')
 sql('create database '+SCRATCH+' template template0;')
 created=True
 bootstrap=run(['pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--no-privileges','--schema=auth','--schema=storage'])
 bootstrap=re.sub(r'CREATE POLICY .*?;\n','',bootstrap,flags=re.S)
 sql('create schema extensions; create extension pgcrypto with schema extensions; create extension unaccent with schema extensions; create extension pg_trgm with schema extensions; create extension "uuid-ossp" with schema extensions;',SCRATCH)
 sql(bootstrap,SCRATCH)
 # Match Supabase's public defaults before applying project migrations.
 defaults=run(['pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--schema=public'])
 sql('\n'.join(re.findall(r'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public .*?;',defaults)),SCRATCH)
 for p in files:
  sql('begin;\n'+p.read_text()+'\ncommit;',SCRATCH)
 print('Fresh ordered replay:',len(files),'migrations passed')
 local=snapshot('postgres');fresh=snapshot(SCRATCH)
 changes={k:{'local':local.get(k),'fresh':fresh.get(k)} for k in sorted(local.keys()|fresh.keys()) if local.get(k)!=fresh.get(k)}
 Path('/tmp/cbb-008a-schema-diff.json').write_text(json.dumps(changes,indent=2,ensure_ascii=False))
 print('Schema differences:',len(changes))
 for k in changes:
  a=changes[k]['local'];b=changes[k]['fresh']
  print(k, 'ACL only' if isinstance(a,dict) and isinstance(b,dict) and a.get('definition')==b.get('definition') else 'definition/structure')
 print('Details: /tmp/cbb-008a-schema-diff.json')
 if changes: raise SystemExit('Migration schema differs from the local baseline')
finally:
 if created:
  assert re.fullmatch(r'cbb_008a_verify_[0-9a-f]{10}',SCRATCH)
  sql('drop database '+SCRATCH+';')
  print('Temporary database removed:',SCRATCH)
