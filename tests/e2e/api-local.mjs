// Simulação mínima da API do Supabase (PostgREST + Auth) sobre um PostgreSQL local, só para os testes.
// Cobre o que o site e o painel usam:
//   GET/POST/PATCH/DELETE /rest/v1/<tabela>   filtros eq, neq, in, gte, lte, is; order; limit; select de colunas
//   POST /rest/v1/rpc/<função>                argumentos nomeados em JSON
//   /auth/v1/signup, /auth/v1/token (password e refresh_token), /auth/v1/user, /auth/v1/logout
// Cada requisição roda como "anon" ou, com o token de login, como "authenticated" com auth.uid() preenchido,
// então o RLS e as permissões são exatamente os do banco. A senha não é conferida (ambiente de teste).
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";

const PORTA = Number(process.env.API_PORTA || 54330);
const pool = new pg.Pool({ database: process.env.PGDATABASE || "matricula_teste" });
const IDENT = /^[a-z_][a-z0-9_]*$/;

// ---------- tokens de teste (formato JWT, sem assinatura válida) ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const emitirToken = (u) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.teste`;
function lerToken(req) {
  const m = (req.headers.authorization || "").match(/^Bearer\s+([^.]+)\.([^.]+)\./);
  if (!m) return null;
  try { const p = JSON.parse(Buffer.from(m[2], "base64url").toString()); return p.role === "authenticated" ? p : null; } catch { return null; }
}
const usuarioJson = (u) => ({ id: u.id, email: u.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
const sessao = (u) => ({ access_token: emitirToken(u), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r.${u.id}`, user: usuarioJson(u) });

async function comoUsuario(req, fn) {
  const c = await pool.connect();
  const tk = lerToken(req);
  try {
    await c.query("begin");
    await c.query(`set local role ${tk ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [tk?.sub || ""]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

function responder(res, status, corpo, extra = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Expose-Headers": "Content-Range",
    ...extra,
  });
  res.end(corpo === undefined ? "" : JSON.stringify(corpo));
}
const lerCorpo = (req) => new Promise((ok) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => ok(d ? JSON.parse(d) : null)); });
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });
// Argumentos de função (jsonb) vão como texto JSON; em tabelas, listas de valores simples viram arrays do PostgreSQL (text[])
const valorSql = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
const valorColuna = (v) => (Array.isArray(v) && v.every((x) => x === null || typeof x !== "object") ? v : valorSql(v));

// Converte os filtros da URL (?coluna=eq.valor) em SQL parametrizado
function filtros(url, valores) {
  const partes = [];
  for (const [col, expr] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(col)) continue;
    if (!IDENT.test(col)) throw erro(`coluna inválida: ${col}`);
    const [, op, v] = expr.match(/^(eq|neq|gte|lte|gt|lt|in|is)\.(.*)$/s) || [];
    if (!op) throw erro(`filtro não suportado: ${expr}`);
    if (op === "in") {
      const itens = v.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
      partes.push(`${col}::text = any($${valores.push(itens)})`);
    } else if (op === "is") {
      partes.push(`${col} is ${v === "null" ? "null" : v === "true" ? "true" : "false"}`);
    } else {
      const sqlOp = { eq: "=", neq: "<>", gte: ">=", lte: "<=", gt: ">", lt: "<" }[op];
      partes.push(`${col}::text ${sqlOp} $${valores.push(v)}::text`);
    }
  }
  return partes.length ? ` where ${partes.join(" and ")}` : "";
}
function colunasSelect(url) {
  const cols = (url.searchParams.get("select") || "*").split(",").map((c) => c.trim()).filter(Boolean);
  if (!cols.every((c) => c === "*" || IDENT.test(c))) throw erro("select não suportado pela API de teste");
  return cols.join(", ");
}
function ordem(url) {
  const o = url.searchParams.get("order");
  if (!o) return "";
  return " order by " + o.split(",").map((p) => {
    const [col, dir = "asc"] = p.split(".");
    if (!IDENT.test(col) || !["asc", "desc"].includes(dir)) throw erro("order inválido");
    return `${col} ${dir}`;
  }).join(", ");
}

async function rest(req, res, url, tabela) {
  const umObjeto = (req.headers.accept || "").includes("vnd.pgrst.object");
  const representar = (req.headers.prefer || "").includes("return=representation");
  const valores = [];
  let sql;
  if (req.method === "GET") {
    const lim = Number(url.searchParams.get("limit"));
    sql = `select ${colunasSelect(url)} from public.${tabela}${filtros(url, valores)}${ordem(url)}${lim ? ` limit ${lim}` : ""}`;
  } else if (req.method === "POST") {
    const corpo = await lerCorpo(req);
    const linhas = Array.isArray(corpo) ? corpo : [corpo];
    const cols = Object.keys(linhas[0] || {});
    if (!cols.every((c) => IDENT.test(c))) throw erro("coluna inválida");
    const vals = linhas.map((l) => `(${cols.map((c) => `$${valores.push(valorColuna(l[c]))}`).join(", ")})`).join(", ");
    sql = `insert into public.${tabela} (${cols.join(", ")}) values ${vals} returning *`;
  } else if (req.method === "PATCH") {
    const corpo = await lerCorpo(req);
    const sets = Object.keys(corpo).map((c) => { if (!IDENT.test(c)) throw erro("coluna inválida"); return `${c} = $${valores.push(valorColuna(corpo[c]))}`; });
    sql = `update public.${tabela} set ${sets.join(", ")}${filtros(url, valores)} returning *`;
  } else if (req.method === "DELETE") {
    sql = `delete from public.${tabela}${filtros(url, valores)} returning *`;
  } else throw erro("método não suportado", 405);
  const linhas = await comoUsuario(req, (c) => c.query(sql, valores).then((r) => r.rows));
  if (req.method !== "GET" && !representar) return responder(res, 204);
  if (umObjeto) return linhas.length === 1 ? responder(res, 200, linhas[0]) : responder(res, 406, { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" });
  return responder(res, req.method === "POST" ? 201 : 200, linhas);
}

async function rpc(req, res, nome) {
  const args = (await lerCorpo(req)) || {};
  const nomes = Object.keys(args);
  if (!nomes.every((n) => IDENT.test(n))) throw erro("argumento inválido");
  const resultado = await comoUsuario(req, async (c) => {
    const { rows: [f] } = await c.query("select proretset from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace", [nome]);
    if (!f) throw erro(`função ${nome} não existe`, 404);
    const params = nomes.map((n, i) => `${n} := $${i + 1}`).join(", ");
    const { rows } = await c.query(`select * from public.${nome}(${params})`, nomes.map((n) => valorSql(args[n])));
    return f.proretset ? rows : Object.values(rows[0] ?? {})[0] ?? null;
  });
  return responder(res, 200, resultado);
}

async function auth(req, res, url, rota) {
  if (rota === "signup" && req.method === "POST") {
    const { email } = await lerCorpo(req);
    const u = { id: randomUUID(), email: String(email).toLowerCase() };
    await pool.query("insert into auth.users (id, email) values ($1, $2)", [u.id, u.email]);
    return responder(res, 200, sessao(u));
  }
  if (rota === "token" && req.method === "POST") {
    const corpo = await lerCorpo(req);
    let u;
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const id = String(corpo.refresh_token || "").replace(/^r\./, "");
      u = (await pool.query("select id, email from auth.users where id::text = $1", [id])).rows[0];
    } else {
      u = (await pool.query("select id, email from auth.users where email = lower($1)", [corpo.email])).rows[0];
    }
    if (!u) return responder(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials", code: "invalid_credentials" });
    return responder(res, 200, sessao(u));
  }
  if (rota === "user" && req.method === "GET") {
    const tk = lerToken(req);
    if (!tk) return responder(res, 401, { msg: "sem sessão" });
    return responder(res, 200, usuarioJson({ id: tk.sub, email: tk.email }));
  }
  if (rota === "logout") return responder(res, 204);
  return responder(res, 404, { msg: "rota de auth não suportada" });
}

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return responder(res, 204);
  const url = new URL(req.url, "http://x");
  try {
    let m;
    if ((m = url.pathname.match(/^\/auth\/v1\/([a-z_]+)$/))) return await auth(req, res, url, m[1]);
    if ((m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/))) return await rpc(req, res, m[1]);
    if ((m = url.pathname.match(/^\/rest\/v1\/([a-z_][a-z0-9_]*)$/))) return await rest(req, res, url, m[1]);
    return responder(res, 404, { message: "rota não suportada pela API de teste" });
  } catch (e) {
    return responder(res, e.status || 400, { message: e.message, code: e.code, details: e.detail ?? null, hint: null });
  }
}).listen(PORTA, () => console.log(`API de teste em http://localhost:${PORTA}`));
