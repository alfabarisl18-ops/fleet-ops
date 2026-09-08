// Generate additive schema changes from the isolated migrated PostgreSQL catalog.
// Hosted rollout should also run the repository's full Supabase type generation.
const fs = require('node:fs');
module.exports = async function(db) {
 let s=fs.readFileSync('src/types/database.ts','utf8');
 for(const table of ['driver_purchase_agreements','daily_payment_records','ledger_entries']) {
  const cols=(await db.query(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,[table])).rows;
  const start=s.indexOf(`      ${table}: {`), end=s.indexOf('\n      ',start+7);
  // Find next table, not nested members.
  const tail=s.slice(start); const next=tail.slice(1).search(/\n      \w+: \{/);
  const length=next<0?tail.length:next+1;
  let block=tail.slice(0,length);
  for(const section of ['Row','Insert','Update']) {
   const marker=`        ${section}: {`, from=block.indexOf(marker), to=block.indexOf('\n        }',from);
   const old=block.slice(from,to); let extra='';
   for(const c of cols) {
    if(new RegExp(`\\b${c.column_name}\\??:`).test(old))continue;
    let type={bigint:'number',integer:'number',boolean:'boolean',uuid:'string',date:'string',jsonb:'Json'}[c.data_type];
    if(!type)throw Error(`Unsupported new type ${c.data_type}`);
    if(c.is_nullable==='YES')type+=' | null';
    const optional=section==='Update'||(section==='Insert'&&(c.column_default!==null||c.is_nullable==='YES'))?'?':'';
    extra+=`\n          ${c.column_name}${optional}: ${type}`;
   }
   block=block.slice(0,to)+extra+block.slice(to);
  }
  const fks=(await db.query(`select c.conname, a.attname, ft.relname as foreign_table from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_class ft on ft.oid=c.confrelid join pg_attribute a on a.attrelid=t.oid and a.attnum=c.conkey[1] where t.relname=$1 and c.contype='f' and a.attname='purchase_agreement_id'`,[table])).rows;
  for(const f of fks)if(!block.includes(f.conname)) {
   const rel=block.indexOf('        Relationships: [')+'        Relationships: ['.length;
   block=block.slice(0,rel)+`\n          {\n            foreignKeyName: "${f.conname}"\n            columns: ["${f.attname}"]\n            isOneToOne: false\n            referencedRelation: "${f.foreign_table}"\n            referencedColumns: ["id"]\n          },`+block.slice(rel);
  }
  s=s.slice(0,start)+block+s.slice(start+length);
 }
 for(const name of ['day_outcome','shortfall_treatment','overpayment_reason']) {
  const values=(await db.query(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname=$1 order by e.enumsortorder`,[name])).rows.map(r=>r.enumlabel);
  const split=s.indexOf('export const Constants'); let a=s.slice(0,split),b=s.slice(split);
  const re=new RegExp(`^      ${name}:[\\s\\S]*?(?=^      \\w+:|^    })`,'m');
  a=a.replace(re,`      ${name}: ${values.map(v=>JSON.stringify(v)).join(' | ')}\n`);
  b=b.replace(re,`      ${name}: [${values.map(v=>JSON.stringify(v)).join(', ')}],\n`);s=a+b;
 }
 for(const name of ['driver_purchase_progress','vehicle_purchase_payment_context','correct_purchase_payment'])if(!s.includes(`      ${name}: {`)) {
  const row=(await db.query(`select proargnames from pg_proc where proname=$1`,[name])).rows[0];
  const fn=`      ${name}: {\n        Args: { ${row.proargnames.map(n=>n+': '+(n==='p_amount_minor'?'number':'string')).join('; ')} }\n        Returns: ${name==='correct_purchase_payment'?'string':'Json'}\n      }\n`;
  s=s.replace('    Functions: {\n','    Functions: {\n'+fn);
 }
 fs.writeFileSync('src/types/database.ts',s);
};
