// Simulação mínima da API REST do Supabase (PostgREST) sobre um PostgreSQL local, só para os testes.
// Atende exatamente o que o site do associado usa:
//   GET  /rest/v1/<tabela ou view>?select=...   (como o papel "anon", respeitando o RLS)
//   POST /rest/v1/rpc/<função>                  (argumentos nomeados em JSON)
// Erros das funções voltam como { message } com status 400, igual ao Supabase.
import http from "node:http";
import pg from "pg";

const PORTA = Number(process.env.API_PORTA || 54330);
const pool = new pg.Pool({ database: process.env.PGDATABASE || "matricula_teste" });
const IDENT = /^[a-z_][a-z0-9_]*$/;

async function comoAnon(fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role anon");
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

function responder(res, status, corpo) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(corpo));
}

const lerCorpo = (req) => new Promise((ok) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => ok(d)); });

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return responder(res, 204, null);
  const url = new URL(req.url, "http://x");
  const partes = url.pathname.replace(/^\/rest\/v1\//, "").split("/");
  const umObjeto = (req.headers.accept || "").includes("vnd.pgrst.object");
  try {
    if (req.method === "GET" && partes.length === 1 && IDENT.test(partes[0])) {
      const colunas = (url.searchParams.get("select") || "*").split(",").map((c) => c.trim());
      if (!colunas.every((c) => c === "*" || IDENT.test(c))) return responder(res, 400, { message: "select inválido" });
      const linhas = await comoAnon((c) => c.query(`select ${colunas.join(", ")} from public.${partes[0]}`).then((r) => r.rows));
      if (umObjeto) return linhas.length === 1 ? responder(res, 200, linhas[0]) : responder(res, 406, { message: "esperava 1 linha" });
      return responder(res, 200, linhas);
    }
    if (req.method === "POST" && partes[0] === "rpc" && IDENT.test(partes[1] || "")) {
      const args = JSON.parse((await lerCorpo(req)) || "{}");
      const nomes = Object.keys(args);
      if (!nomes.every((n) => IDENT.test(n))) return responder(res, 400, { message: "argumento inválido" });
      const resultado = await comoAnon(async (c) => {
        const { rows: [f] } = await c.query("select proretset from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace", [partes[1]]);
        if (!f) throw Object.assign(new Error(`função ${partes[1]} não existe`), { status: 404 });
        const params = nomes.map((n, i) => `${n} := $${i + 1}`).join(", ");
        const valores = nomes.map((n) => (args[n] !== null && typeof args[n] === "object" ? JSON.stringify(args[n]) : args[n]));
        const { rows } = await c.query(`select * from public.${partes[1]}(${params})`, valores);
        return f.proretset ? rows : Object.values(rows[0] ?? {})[0] ?? null;
      });
      return responder(res, 200, resultado);
    }
    return responder(res, 404, { message: "rota não suportada pela API de teste" });
  } catch (e) {
    return responder(res, e.status || 400, { message: e.message, code: e.code });
  }
}).listen(PORTA, () => console.log(`API de teste em http://localhost:${PORTA}`));
