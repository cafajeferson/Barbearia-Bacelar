/**
 * Migração pontual do banco: projeto Supabase antigo (us-east-1) -> projeto
 * novo "Barbearia Bacelar SP" (sa-east-1). O banco ANTIGO só é lido, nunca
 * alterado. Credenciais: antigo no .env, novo no .env.novo (fora do git).
 *
 *   node scripts/migrar-supabase-sp.mjs checar     -> testa conexões, não altera nada
 *   node scripts/migrar-supabase-sp.mjs preparar   -> cria app_user + extensões no novo
 *   (rodar `prisma migrate deploy` contra o novo entre preparar e copiar)
 *   node scripts/migrar-supabase-sp.mjs copiar     -> apaga os dados do NOVO e recopia do antigo
 *   node scripts/migrar-supabase-sp.mjs verificar  -> compara antigo x novo, tabela por tabela
 *   node scripts/migrar-supabase-sp.mjs url        -> grava DATABASE_URL/APP_DATABASE_URL novas no .env.novo
 */
import fs from "node:fs";
import pg from "pg";

const NEW_REF = "drdiwesvsqnupkbjarjq";
const NEW_POOLER = "aws-1-sa-east-1.pooler.supabase.com";
// Só o cadastro de quem pode logar. Sessões/refresh tokens não servem no
// projeto novo (segredo de JWT diferente) — todo mundo loga de novo uma vez.
const AUTH_TABLES = ["users", "identities"];

function readEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
  return env;
}

const oldEnv = readEnv(".env");
const newEnv = readEnv(".env.novo");

function newUrl(user, password) {
  return `postgresql://${user}.${NEW_REF}:${encodeURIComponent(password)}@${NEW_POOLER}:5432/postgres`;
}

function appUserPassword() {
  return decodeURIComponent(new URL(oldEnv.APP_DATABASE_URL).password);
}

async function connect() {
  if (!newEnv.NOVO_DB_PASSWORD) throw new Error("NOVO_DB_PASSWORD vazio no .env.novo");
  const oldDb = new pg.Client({ connectionString: oldEnv.DATABASE_URL });
  const newDb = new pg.Client({ connectionString: newUrl("postgres", newEnv.NOVO_DB_PASSWORD) });
  await oldDb.connect();
  await newDb.connect();
  // Trava de segurança: nunca confundir os dois lados.
  if (!oldEnv.DATABASE_URL.includes("us-east-1")) throw new Error("O .env não aponta mais pro banco antigo (us-east-1) — abortando.");
  const users = await newDb.query(`select to_regclass('public."User"') as t`);
  return { oldDb, newDb, newHasSchema: users.rows[0].t !== null };
}

const one = async (db, sql, params) => (await db.query(sql, params)).rows;

async function publicTables(db) {
  const rows = await one(
    db,
    `select tablename from pg_tables where schemaname='public' and tablename <> '_prisma_migrations' order by 1`,
  );
  return rows.map((r) => r.tablename);
}

/** Colunas não-geradas que existem dos DOIS lados (o auth do projeto novo pode ter colunas a mais). */
async function commonColumns(oldDb, newDb, schema, table) {
  const sql = `select column_name from information_schema.columns
               where table_schema=$1 and table_name=$2 and is_generated='NEVER' order by ordinal_position`;
  const a = (await one(oldDb, sql, [schema, table])).map((r) => r.column_name);
  const b = new Set((await one(newDb, sql, [schema, table])).map((r) => r.column_name));
  return a.filter((c) => b.has(c));
}

const q = (id) => `"${id.replace(/"/g, '""')}"`;

async function copyTable(oldDb, newDb, schema, table) {
  const cols = await commonColumns(oldDb, newDb, schema, table);
  const fq = `${q(schema)}.${q(table)}`;
  const rows = await one(oldDb, `select to_jsonb(t) as j from ${fq} t`);
  const list = cols.map(q).join(", ");
  for (const { j } of rows) {
    await newDb.query(`insert into ${fq} (${list}) select ${list} from jsonb_populate_record(null::${fq}, $1::jsonb)`, [
      JSON.stringify(j),
    ]);
  }
  return rows.length;
}

async function fingerprint(db, schema, table, cols) {
  const fq = `${q(schema)}.${q(table)}`;
  const obj = cols.map((c) => `'${c.replace(/'/g, "''")}', t.${q(c)}`).join(", ");
  // jsonb_build_object em pedaços de até 50 pares (limite de 100 argumentos por chamada).
  const parts = [];
  const pairs = cols.map((c) => `'${c.replace(/'/g, "''")}', t.${q(c)}`);
  for (let i = 0; i < pairs.length; i += 50) parts.push(`jsonb_build_object(${pairs.slice(i, i + 50).join(", ")})`);
  void obj;
  const rows = await one(
    db,
    `select count(*)::int as n, coalesce(md5(string_agg(x, '|' order by x)), '-') as h
     from (select (${parts.join(" || ")})::text as x from ${fq} t) s`,
  );
  return rows[0];
}

async function checar() {
  const { oldDb, newDb, newHasSchema } = await connect();
  const o = (await one(oldDb, `select current_setting('server_version') v, (select count(*)::int from "User") u`))[0];
  const n = (await one(newDb, `select current_setting('server_version') v, current_user cu`))[0];
  console.log(`antigo: Postgres ${o.v}, ${o.u} usuários do app`);
  console.log(`novo:   Postgres ${n.v}, conectado como ${n.cu}, schema do app ${newHasSchema ? "JÁ existe" : "ainda não existe"}`);
  const t0 = Date.now();
  await newDb.query("select 1");
  console.log(`ida-e-volta até o banco novo (desta máquina, não do VPS): ${Date.now() - t0}ms`);
  await oldDb.end();
  await newDb.end();
}

async function preparar() {
  const { oldDb, newDb } = await connect();
  const exists = (await one(newDb, `select 1 from pg_roles where rolname='app_user'`)).length > 0;
  // Mesma senha do app_user antigo (lida do .env, nunca impressa) — assim
  // só o host muda na APP_DATABASE_URL. format(%L) faz o escape do literal.
  const stmt = (await one(newDb, `select format('%s ROLE app_user WITH LOGIN PASSWORD %L', $1::text, $2::text) s`, [
    exists ? "ALTER" : "CREATE",
    appUserPassword(),
  ]))[0].s;
  await newDb.query(stmt);
  console.log(`papel app_user ${exists ? "atualizado" : "criado"}`);
  for (const ext of ["pg_cron", "pg_net", "pgcrypto", "uuid-ossp"]) {
    try {
      await newDb.query(`create extension if not exists ${q(ext)}`);
      console.log(`extensão ${ext}: ok`);
    } catch (e) {
      console.log(`extensão ${ext}: ERRO ${e.message}`);
    }
  }
  await oldDb.end();
  await newDb.end();
}

async function grants(newDb) {
  await newDb.query(`
    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO app_user;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO app_user;
  `);
}

async function copiar() {
  const { oldDb, newDb, newHasSchema } = await connect();
  if (!newHasSchema) throw new Error("Rode o prisma migrate deploy contra o banco novo antes de copiar.");
  const tables = await publicTables(oldDb);
  const newTables = new Set(await publicTables(newDb));
  const missing = tables.filter((t) => !newTables.has(t));
  if (missing.length) throw new Error(`Tabelas faltando no banco novo: ${missing.join(", ")}`);

  // Leitura consistente do antigo (um único snapshot pra todas as tabelas).
  await oldDb.query("begin transaction isolation level repeatable read read only");
  await newDb.query("begin");
  try {
    // Desliga triggers e checagem de FK só nesta transação — a ordem de
    // inserção deixa de importar e o trigger de sobreposição não reavalia
    // agendamentos que já eram válidos.
    await newDb.query("set local session_replication_role = replica");
    await newDb.query(`truncate ${tables.map((t) => `public.${q(t)}`).join(", ")} cascade`);
    await newDb.query(`delete from auth.identities`);
    await newDb.query(`delete from auth.users`);
    for (const t of AUTH_TABLES) console.log(`auth.${t}: ${await copyTable(oldDb, newDb, "auth", t)} linhas`);
    for (const t of tables) console.log(`public.${t}: ${await copyTable(oldDb, newDb, "public", t)} linhas`);
    await grants(newDb);
    await newDb.query("commit");
    console.log("cópia concluída (commit feito no banco novo)");
  } catch (e) {
    await newDb.query("rollback");
    throw e;
  } finally {
    await oldDb.query("rollback");
    await oldDb.end();
    await newDb.end();
  }
}

async function verificar() {
  const { oldDb, newDb } = await connect();
  let ok = true;
  const check = async (schema, table) => {
    const cols = await commonColumns(oldDb, newDb, schema, table);
    const a = await fingerprint(oldDb, schema, table, cols);
    const b = await fingerprint(newDb, schema, table, cols);
    const same = a.n === b.n && a.h === b.h;
    if (!same) ok = false;
    console.log(`${same ? "OK  " : "DIFF"} ${schema}.${table}: antigo ${a.n} / novo ${b.n}${same ? "" : "  <-- conteúdo diferente"}`);
  };
  for (const t of AUTH_TABLES) await check("auth", t);
  for (const t of await publicTables(oldDb)) await check("public", t);

  const meta = `select
    (select count(*)::int from pg_policies where schemaname='public') policies,
    (select count(*)::int from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and not t.tgisinternal) triggers,
    (select md5(string_agg(pg_get_functiondef(p.oid), '' order by p.proname)) from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') funcs,
    (select md5(string_agg(tablename||policyname||coalesce(qual,'')||coalesce(with_check,'')||cmd, '' order by tablename, policyname))
      from pg_policies where schemaname='public') policies_hash,
    (select count(*)::int from pg_tables where schemaname='public' and rowsecurity) rls_tables`;
  const a = (await one(oldDb, meta))[0];
  const b = (await one(newDb, meta))[0];
  for (const k of Object.keys(a)) {
    const same = String(a[k]) === String(b[k]);
    if (!same) ok = false;
    console.log(`${same ? "OK  " : "DIFF"} ${k}: antigo ${a[k]} / novo ${b[k]}`);
  }
  console.log(ok ? "\nTUDO IGUAL: banco novo confere com o antigo." : "\nHÁ DIFERENÇAS — não fazer a troca.");
  await oldDb.end();
  await newDb.end();
  if (!ok) process.exit(1);
}

function url() {
  const lines = fs.readFileSync(".env.novo", "utf8").split(/\r?\n/).filter((l) => !/^(DATABASE_URL|APP_DATABASE_URL)=/.test(l));
  lines.push(`DATABASE_URL="${newUrl("postgres", newEnv.NOVO_DB_PASSWORD)}"`);
  lines.push(`APP_DATABASE_URL="${newUrl("app_user", appUserPassword())}"`);
  fs.writeFileSync(".env.novo", lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n") + "\n");
  console.log("DATABASE_URL e APP_DATABASE_URL novas gravadas no .env.novo");
}

const steps = { checar, preparar, copiar, verificar, url };
const step = steps[process.argv[2]];
if (!step) {
  console.log(`uso: node scripts/migrar-supabase-sp.mjs <${Object.keys(steps).join("|")}>`);
  process.exit(1);
}
Promise.resolve(step()).catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
