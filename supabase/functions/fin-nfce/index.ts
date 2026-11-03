// Juntos: lê a NFC-e a partir da URL do QR Code e devolve loja, total, data e itens.
// Só consulta sites oficiais (.gov.br). Não guarda nada.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const limpa = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
const num = (s?: string | null) => { if (!s) return null; const v = parseFloat(s.replace(/\./g, "").replace(",", ".")); return isFinite(v) ? v : null; };

function daChave(url: string) {
  const m = url.match(/(?:p=|chNFe=)(\d{44})/);
  if (!m) return {};
  const c = m[1];
  return { chave: c, cnpj: c.slice(6, 20), mes: `20${c.slice(2, 4)}-${c.slice(4, 6)}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);
  let url = "";
  try { url = String((await req.json()).url || "").trim(); } catch { return json({ ok: false, erro: "corpo" }, 400); }
  let u: URL;
  try { u = new URL(url); } catch { return json({ ok: false, erro: "url_invalida" }, 400); }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.endsWith(".gov.br")) return json({ ok: false, erro: "nao_e_sefaz", ...daChave(url) }, 400);
  if (u.protocol === "http:") u.protocol = "https:";
  const base = daChave(url);
  let html = "";
  try {
    let alvo = u.toString();
    for (let i = 0; i < 4; i++) {
      const r = await fetch(alvo, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148", "Accept": "text/html" }, signal: AbortSignal.timeout(12000) });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        const prox = new URL(r.headers.get("location")!, alvo);
        if (!prox.hostname.endsWith(".gov.br")) return json({ ok: false, erro: "redirecionamento", ...base });
        alvo = prox.toString();
        continue;
      }
      html = (await r.text()).slice(0, 2_000_000);
      break;
    }
  } catch { return json({ ok: false, erro: "sefaz_indisponivel", ...base }); }
  if (!html) return json({ ok: false, erro: "sem_resposta", ...base });

  const loja = (html.match(/id="u20"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/class="txtTopo"[^>]*>([\s\S]*?)<\//i) || html.match(/Raz[aã]o Social[^<]*<\/label>\s*<span[^>]*>([\s\S]*?)<\/span>/i) || [])[1];
  const totalStr = (html.match(/Valor a pagar[\s\S]{0,120}?class="totalNumb[^"]*"[^>]*>([\d.,]+)/i) || html.match(/Valor total[\s\S]{0,120}?class="totalNumb[^"]*"[^>]*>([\d.,]+)/i) || html.match(/Valor (?:a pagar|total)[^0-9]{0,80}([\d.]+,\d{2})/i) || [])[1];
  const dataStr = (html.match(/Emiss[aã]o:?\s*(?:<\/strong>)?\s*(\d{2}\/\d{2}\/\d{4})/i) || html.match(/(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}(?::\d{2})?/) || [])[1];
  const cnpj = (html.match(/CNPJ:?\s*(?:<[^>]+>\s*)*([\d]{2}\.?[\d]{3}\.?[\d]{3}\/?[\d]{4}-?[\d]{2})/i) || [])[1];
  const itens: { nome: string; valor: number | null }[] = [];
  const re = /class="txtTit[^"]*"[^>]*>([\s\S]*?)<\/span>[\s\S]*?class="valor"[^>]*>([\d.,]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && itens.length < 60) itens.push({ nome: limpa(m[1]).slice(0, 60), valor: num(m[2]) });

  let data: string | null = null;
  if (dataStr) { const [d, mo, y] = dataStr.split("/"); data = `${y}-${mo}-${d}`; }
  const total = num(totalStr) ?? (itens.length ? Math.round(itens.reduce((a, i) => a + (i.valor || 0), 0) * 100) / 100 : null);
  const ok = !!(total || loja);
  return json({ ok, loja: loja ? limpa(loja).slice(0, 60) : null, total, data, cnpj: cnpj || base.cnpj || null, itens, ...base });
});
