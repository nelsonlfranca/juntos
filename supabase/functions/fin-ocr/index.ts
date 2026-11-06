// Lê o texto da foto do cupom usando o OCR.space (plano gratuito: 25 mil leituras por mês).
// A chave fica guardada no Supabase (segredo OCRSPACE_KEY), nunca no app.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function ler(img: string, chave: string, motor: string) {
  const f = new FormData();
  f.append("base64Image", img);
  f.append("language", motor === "2" ? "auto" : "por");
  f.append("OCREngine", motor);
  f.append("isTable", "true");
  f.append("scale", "true");
  f.append("detectOrientation", "true");
  const r = await fetch("https://api.ocr.space/parse/image", { method: "POST", headers: { apikey: chave }, body: f });
  const j = await r.json().catch(() => ({}));
  console.log("OCR_RESP motor " + motor + " http " + r.status + " " + JSON.stringify({ e: j.IsErroredOnProcessing, m: j.ErrorMessage, d: j.ErrorDetails, x: j.OCRExitCode }).slice(0, 800));
  const texto = (j.ParsedResults || []).map((p: { ParsedText?: string }) => p.ParsedText || "").join("\n").trim();
  return { texto, erro: j.IsErroredOnProcessing ? String(j.ErrorMessage || "erro") : null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resp({ ok: false, erro: "metodo" }, 405);
  const chave = Deno.env.get("OCRSPACE_KEY");
  if (!chave) return resp({ ok: false, erro: "sem_chave" });
  let img = "";
  try { img = String((await req.json()).imagem || ""); } catch (_) { /* corpo inválido */ }
  if (!img.startsWith("data:image/")) return resp({ ok: false, erro: "sem_imagem" }, 400);
  if (img.length > 1_400_000) return resp({ ok: false, erro: "grande" }, 413);
  try {
    let r = await ler(img, chave, "2");
    if (!r.texto) r = await ler(img, chave, "1");
    if (!r.texto) return resp({ ok: false, erro: r.erro || "vazio" });
    return resp({ ok: true, texto: r.texto.slice(0, 8000) });
  } catch (e) {
    return resp({ ok: false, erro: String(e).slice(0, 200) });
  }
});
