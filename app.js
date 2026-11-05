/* Juntos · finanças da família
   Funciona offline: tudo fica salvo no celular e sincroniza com o Supabase quando há internet. */
(function () {
"use strict";
const CFG = window.JUNTOS_CONFIG;
const KEY = CFG.supabaseKey, URLB = CFG.supabaseUrl;

/* ---------- constantes e utilidades ---------- */
const CATS = ["Mercado","Lanches e café","Delivery","Restaurantes","Uber e transporte","Saúde","Compras online","Pet","Roupas e beleza","Pix e outros"];
const METAS_PADRAO = {"Mercado":800,"Lanches e café":250,"Delivery":150,"Restaurantes":200,"Uber e transporte":150,"Saúde":150,"Compras online":150,"Pet":150,"Roupas e beleza":150,"Pix e outros":150};
const ABBR = {"Mercado":"Me","Lanches e café":"La","Delivery":"De","Restaurantes":"Re","Uber e transporte":"Ub","Saúde":"Sa","Compras online":"Co","Pet":"Pe","Roupas e beleza":"Ro","Pix e outros":"Px"};
const CONTAS = ["Nubank débito","Nubank PJ","Itaú crédito","Efí crédito","Dinheiro"];
const QUEM = ["Eu","Parceiro(a)","Casa"];
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const $ = (s, r) => (r || document).querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const parseNum = (s) => { s = String(s || "").trim().replace(/[R$\s]/g, ""); if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const n = parseFloat(s); return isFinite(n) ? n : NaN; };
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const hoje = () => new Date();
const mesAtual = () => ymd(hoje()).slice(0, 7);
const addM = (m, k) => { let [y, mo] = m.split("-").map(Number); mo += k; while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; } return y + "-" + pad(mo); };
const nomeM = (m) => MESES[+m.split("-")[1] - 1];
const curto = (m) => nomeM(m).slice(0, 3);
const diasNoMes = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo, 0).getDate(); };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

/* ---------- fotos guardadas no aparelho (IndexedDB) ---------- */
const fotos = {
  db: null,
  abrir() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const r = indexedDB.open("juntos", 1); r.onupgradeneeded = () => r.result.createObjectStore("fotos"); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
  async put(k, blob) { try { const db = await this.abrir(); await new Promise((res, rej) => { const t = db.transaction("fotos", "readwrite"); t.objectStore("fotos").put(blob, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) {} },
  async get(k) { try { const db = await this.abrir(); return await new Promise((res) => { const r = db.transaction("fotos").objectStore("fotos").get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; } },
  async del(k) { try { const db = await this.abrir(); db.transaction("fotos", "readwrite").objectStore("fotos").delete(k); } catch (e) {} },
};

/* ---------- cliente do Supabase (sem biblioteca, para funcionar offline) ---------- */
const api = {
  sess: ls.get("juntos:sessao", null),
  salvar(s) { if (s && !s.expires_at) s.expires_at = Math.floor(Date.now() / 1000) + (s.expires_in || 3600); this.sess = s; if (s) ls.set("juntos:sessao", s); else ls.del("juntos:sessao"); },
  async auth(path, body) {
    const r = await fetch(URLB + "/auth/v1/" + path, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(traduzErro(j.msg || j.error_description || j.message || j.error_code || "Erro " + r.status)); e.status = r.status; throw e; }
    return j;
  },
  async token() {
    if (!this.sess) throw Object.assign(new Error("sem login"), { status: 401 });
    if (this.sess.expires_at * 1000 - Date.now() < 90000) {
      const j = await this.auth("token?grant_type=refresh_token", { refresh_token: this.sess.refresh_token });
      this.salvar(j);
    }
    return this.sess.access_token;
  },
  async req(path, o) {
    o = o || {};
    const t = await this.token();
    const h = Object.assign({ apikey: KEY, Authorization: "Bearer " + t }, o.body !== undefined && !o.raw ? { "Content-Type": "application/json" } : {}, o.headers || {});
    const r = await fetch(URLB + path, { method: o.method || "GET", headers: h, body: o.raw ? o.body : o.body !== undefined ? JSON.stringify(o.body) : undefined });
    if (!r.ok) { const j = await r.json().catch(() => ({})); const e = new Error(traduzErro(j.message || j.msg || j.error || "Erro " + r.status)); e.status = r.status; throw e; }
    if (r.status === 204) return null;
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("json")) { const tx = await r.text(); return tx ? JSON.parse(tx) : null; }
    return r.blob();
  },
  uid() { return this.sess && this.sess.user && this.sess.user.id; },
  meuNome() { const u = this.sess && this.sess.user; return (u && u.user_metadata && u.user_metadata.nome) || (u && u.email ? u.email.split("@")[0] : "Você"); },
};
function traduzErro(m) {
  const s = String(m);
  if (/invalid login|invalid_credentials/i.test(s)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(s)) return "Confirme o e-mail pelo link que enviamos e tente de novo.";
  if (/already registered|user_already_exists/i.test(s)) return "Este e-mail já tem conta. Use Entrar.";
  if (/password.*(6|characters)|weak_password/i.test(s)) return "A senha precisa de pelo menos 6 caracteres.";
  if (/rate limit|too many/i.test(s)) return "Muitas tentativas. Espere um minuto e tente de novo.";
  if (/convite inv/i.test(s)) return "Código de convite inválido ou vencido.";
  if (/failed to fetch|network/i.test(s)) return "Sem conexão com a internet.";
  return s;
}

/* ---------- dados locais + fila de envio ---------- */
const TABS = {
  lanc: { t: "fin_lancamentos", k: (r) => r.id },
  contas: { t: "fin_contas", k: (r) => r.id },
  pag: { t: "fin_pagamentos", k: (r) => r.conta_id + "|" + r.mes, oc: "conta_id,mes" },
  metas: { t: "fin_metas", k: (r) => r.categoria, oc: "espaco_id,categoria" },
  objetivos: { t: "fin_objetivos", k: (r) => r.id },
};
let E = ls.get("juntos:espaco", null);
let D = null;
const novoD = () => ({ espaco: null, membros: [], lanc: {}, contas: {}, pag: {}, metas: {}, objetivos: {}, ts: {} });
function carregaD() { D = E ? ls.get("juntos:d:" + E, null) || novoD() : null; if (D) { D.objetivos = D.objetivos || {}; D.ts = D.ts || {}; } }
let salvarT;
function salvaD() { clearTimeout(salvarT); salvarT = setTimeout(() => { if (E && D) ls.set("juntos:d:" + E, D); }, 150); }
let fila = ls.get("juntos:fila", []);
const salvaFila = () => ls.set("juntos:fila", fila);

function grava(tab, row) {
  const k = TABS[tab].k(row);
  const atual = D[tab][k] || {};
  D[tab][k] = Object.assign({}, atual, row);
  salvaD();
  const limpo = {}; Object.keys(row).forEach((c) => { if (c[0] !== "_") limpo[c] = row[c]; });
  limpo.espaco_id = E;
  fila = fila.filter((f) => !(f.tab === tab && f.k === k && f.e === E));
  fila.push({ tab, k, e: E, row: Object.assign({}, D[tab][k] && soCampos(D[tab][k]), limpo) });
  salvaFila();
  agendaSync();
}
function soCampos(r) { const o = {}; Object.keys(r).forEach((c) => { if (c[0] !== "_" && c !== "updated_at") o[c] = r[c]; }); return o; }

/* ---------- sincronização ---------- */
const SY = { rodando: false, ultimo: ls.get("juntos:ultimoSync", null), erro: null, again: false };
let syncT;
function agendaSync(ms) { clearTimeout(syncT); syncT = setTimeout(sync, ms == null ? 500 : ms); }
async function sync() {
  if (!api.sess || !E) return;
  if (SY.rodando) { SY.again = true; return; }
  if (!navigator.onLine) { SY.erro = "offline"; render(); return; }
  SY.rodando = true; SY.erro = null;
  try {
    // 1. envia o que foi feito no aparelho
    for (const f of fila.slice()) {
      const T = TABS[f.tab];
      if (f.tab === "espaco") await api.req("/rest/v1/fin_espacos?id=eq." + f.e, { method: "PATCH", body: f.row, headers: { Prefer: "return=minimal" } });
      else await api.req("/rest/v1/" + T.t + (T.oc ? "?on_conflict=" + T.oc : ""), { method: "POST", body: f.row, headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
      fila = fila.filter((x) => x !== f); salvaFila();
    }
    // 2. fotos das notas
    const pend = ls.get("juntos:fotosPend", []);
    for (const p of pend.slice()) {
      const b = await fotos.get(p.id);
      if (b) await api.req("/storage/v1/object/" + CFG.bucket + "/" + p.path, { method: "POST", raw: true, body: b, headers: { "Content-Type": "image/jpeg", "x-upsert": "true" } });
      ls.set("juntos:fotosPend", ls.get("juntos:fotosPend", []).filter((x) => x.id !== p.id));
    }
    // 3. notas com QR Code esperando leitura
    for (const r of Object.values(D.lanc)) if (r._nfce && r.nfce_url && !r.deleted) await leNfcePendente(r);
    // 4. recebe as mudanças dos outros
    const esp = await api.req("/rest/v1/fin_espacos?id=eq." + E + "&select=id,nome,renda,proj_alvo,proj_prazo,proj_inicial");
    if (esp && esp[0]) D.espaco = esp[0];
    else { // perdeu acesso a este espaço
      SY.rodando = false; sairDoEspaco(); return;
    }
    D.membros = (await api.req("/rest/v1/fin_membros?espaco_id=eq." + E + "&select=user_id,papel,nome")) || [];
    for (const tab of Object.keys(TABS)) {
      for (let guard = 0; guard < 20; guard++) {
        let q = "/rest/v1/" + TABS[tab].t + "?espaco_id=eq." + E + "&order=updated_at.asc&limit=1000";
        if (D.ts[tab]) q += "&updated_at=gt." + encodeURIComponent(D.ts[tab]);
        const rows = (await api.req(q)) || [];
        rows.forEach((r) => {
          const k = TABS[tab].k(r);
          if (fila.some((f) => f.tab === tab && f.k === k && f.e === E)) return;
          const local = D[tab][k] || {};
          const extras = {}; Object.keys(local).forEach((c) => { if (c[0] === "_") extras[c] = local[c]; });
          D[tab][k] = Object.assign(r, extras);
          D.ts[tab] = r.updated_at;
        });
        if (rows.length < 1000) break;
      }
    }
    salvaD();
    SY.ultimo = new Date().toISOString(); ls.set("juntos:ultimoSync", SY.ultimo);
  } catch (e) {
    SY.erro = e.status === 401 ? "login" : navigator.onLine ? e.message : "offline";
    if (e.status === 401 && /sem login|JWT|token/i.test(e.message)) { api.salvar(null); }
  }
  SY.rodando = false;
  render();
  if (SY.again) { SY.again = false; agendaSync(300); }
}
window.addEventListener("online", () => agendaSync(100));
window.addEventListener("offline", () => render());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") agendaSync(100); });
setInterval(() => { if (document.visibilityState === "visible") sync(); }, 60000);

/* ---------- leitura da NFC-e pelo QR Code ---------- */
async function consultaNfce(url) {
  return api.req("/functions/v1/fin-nfce", { method: "POST", body: { url } });
}
async function leNfcePendente(r) {
  try {
    const n = await consultaNfce(r.nfce_url);
    if (n && n.ok) {
      const upd = { id: r.id, _nfce: false };
      if (!(+r.valor > 0) && n.total) upd.valor = n.total;
      if ((!r.descricao || r.descricao === "Nota fiscal") && n.loja) upd.descricao = String(n.loja).slice(0, 60);
      if (n.data) upd.data = n.data;
      if (n.itens && n.itens.length) upd.itens = n.itens.filter((i) => i.nome).slice(0, 60);
      if (n.loja && (!r.categoria || r.categoria === "Pix e outros")) { const g = adivinha(n.loja.toLowerCase()); if (g) upd.categoria = g[1]; }
      grava("lanc", Object.assign({}, D.lanc[r.id], upd));
    } else {
      const t = (r._tent || 0) + 1;
      D.lanc[r.id] = Object.assign({}, r, { _tent: t, _nfce: t < 3 }); salvaD();
    }
  } catch (e) { if (!navigator.onLine) throw e; }
}
let jsqrP = null;
function carregaJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsqrP) jsqrP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"; s.onload = () => res(window.jsQR); s.onerror = () => { jsqrP = null; rej(new Error("leitor indisponível")); }; document.head.appendChild(s); });
  return jsqrP;
}
// procura o QR Code em vários tamanhos e recortes (o QR costuma ficar no fim do cupom)
async function achaQR(fonte) {
  const jsQR = await carregaJsQR();
  const img = await createImageBitmap(fonte);
  const W = img.width, H = img.height;
  const recortes = [[0, 0, 1, 1], [0, 0.45, 1, 0.55], [0, 0.6, 1, 0.4], [0, 0.25, 1, 0.5], [0.1, 0.5, 0.8, 0.5], [0, 0, 1, 0.5]];
  for (const lado of [1200, 1800, 800, 2600]) {
    for (const [rx, ry, rw, rh] of recortes) {
      const sx = rx * W, sy = ry * H, sw = rw * W, sh = rh * H;
      const sc = Math.min(1, lado / Math.max(sw, sh));
      const c = document.createElement("canvas"); c.width = Math.round(sw * sc); c.height = Math.round(sh * sc);
      if (c.width < 60 || c.height < 60) continue;
      const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height);
      const q = jsQR(d.data, c.width, c.height, { inversionAttempts: "attemptBoth" });
      if (q && q.data) return q.data;
    }
  }
  return null;
}

// leitura do texto da foto (OCR), feita no próprio celular, sem custo
let tessP = null;
function carregaTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tessP) tessP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; s.onload = () => res(window.Tesseract); s.onerror = () => { tessP = null; rej(new Error("leitor indisponível")); }; document.head.appendChild(s); });
  return tessP;
}
let tessWorker = null;
async function lerTextoDaFoto(fonte, aoProgredir) {
  const T = await carregaTesseract();
  if (!tessWorker) tessWorker = await T.createWorker("por", 1, { logger: (m) => { if (m.status === "recognizing text" && aoProgredir) aoProgredir(m.progress); } });
  const img = await createImageBitmap(fonte);
  const sc = Math.min(1, 1700 / img.width);
  const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) { const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; const v = Math.max(0, Math.min(255, (y - 128) * 1.6 + 140)); px[i] = px[i + 1] = px[i + 2] = v; }
  g.putImageData(d, 0, 0);
  const r = await tessWorker.recognize(c);
  return (r && r.data && r.data.text) || "";
}

// tira loja, total e data do texto do cupom
function interpretaCupom(texto) {
  const linhas = String(texto).split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const VAL = /(\d{1,3}(?:[.\s]\d{3})*[.,]\s?\d{2})(?!\d)/g;
  const num = (t) => { t = t.replace(/\s/g, ""); const dec = t.slice(-3, -2); const int = t.slice(0, -3).replace(/[.,]/g, ""); return parseFloat(int + "." + t.slice(-2)); };
  const ruim = /tribut|imposto|troco|desconto|acr[eé]sc|qtd|quantidade|itens|lei\s*12|aprox|ibpt|cr[eé]dito\s*de|saldo|limite/i;
  const pref = [/valor\s*(a\s*)?pag(ar|o)/i, /total\s*a\s*pagar/i, /valor\s*total/i, /vl\.?\s*total/i, /total\s*(geral|r\$)?/i];
  let total = null;
  for (const re of pref) {
    for (let i = 0; i < linhas.length && total == null; i++) {
      if (!re.test(linhas[i]) || ruim.test(linhas[i])) continue;
      const aqui = linhas[i].match(VAL) || ((linhas[i + 1] || "").match(VAL) || []);
      if (aqui.length) total = num(aqui[aqui.length - 1]);
    }
    if (total != null) break;
  }
  if (total == null) {
    let mx = 0; linhas.forEach((l) => { if (ruim.test(l)) return; (l.match(VAL) || []).forEach((v) => { const n = num(v); if (n > mx && n < 100000) mx = n; }); });
    if (mx > 0) total = mx;
  }
  let data = null;
  for (const l of linhas) { const m = l.match(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4}|\d{2})\b/); if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3], mo = +m[2], d = +m[1]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && +y >= 2020) { data = y + "-" + pad(mo) + "-" + pad(d); break; } } }
  let loja = null;
  const pula = /cnpj|cpf|\bie\b|inscri|endere|rua |av\.|avenida|documento|auxiliar|nfc-?e|nota fiscal|consumidor|extrato|cupom|sat|fone|tel|cep|^\W*$/i;
  for (const l of linhas.slice(0, 8)) { const letras = (l.match(/[A-Za-zÀ-ú]/g) || []).length; if (letras >= 4 && letras / l.length > 0.55 && !pula.test(l)) { loja = l.replace(/[^A-Za-zÀ-ú0-9&'. -]/g, "").trim().slice(0, 40); break; } }
  if (loja) loja = loja.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return { total, data, loja };
}

function escanearQR() {
  return new Promise((resolve) => {
    let stream = null, fim = false, raf = 0;
    const fecharScan = (r) => { if (fim) return; fim = true; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); ov.remove(); resolve(r); };
    const ov = document.createElement("div");
    ov.className = "scan";
    ov.innerHTML = '<video playsinline muted autoplay></video><div class="scan-mira" aria-hidden="true"></div><p class="scan-txt" role="status">Aponte para o QR Code no fim da nota</p><button class="btn secondary scan-x">Cancelar</button>';
    document.body.appendChild(ov);
    ov.querySelector(".scan-x").onclick = () => fecharScan(null);
    const v = ov.querySelector("video"), txt = ov.querySelector(".scan-txt");
    const c = document.createElement("canvas"), g = c.getContext("2d", { willReadFrequently: true });
    Promise.all([carregaJsQR(), navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }) : Promise.reject(new Error("sem câmera"))])
      .then(([jsQR, s]) => {
        stream = s; v.srcObject = s; v.play().catch(() => {});
        const passo = () => {
          if (fim) return;
          if (v.readyState >= 2 && v.videoWidth) {
            const lado = Math.min(v.videoWidth, v.videoHeight) * 0.8, sx = (v.videoWidth - lado) / 2, sy = (v.videoHeight - lado) / 2;
            c.width = c.height = Math.min(640, Math.round(lado));
            g.drawImage(v, sx, sy, lado, lado, 0, 0, c.width, c.height);
            const d = g.getImageData(0, 0, c.width, c.height);
            const q = jsQR(d.data, c.width, c.height, { inversionAttempts: "dontInvert" });
            if (q && q.data) { if (navigator.vibrate) navigator.vibrate(60); return fecharScan(q.data); }
          }
          raf = requestAnimationFrame(passo);
        };
        raf = requestAnimationFrame(passo);
      })
      .catch(() => { txt.textContent = "Não consegui abrir a câmera. Permita o acesso à câmera nos ajustes do celular ou use a foto da nota."; });
  });
}
async function comprime(file) {
  try {
    const img = await createImageBitmap(file);
    const sc = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || file), "image/jpeg", 0.82));
  } catch (e) { return file; }
}

/* ---------- leitura de frase falada/escrita (sem IA) ---------- */
const GUESS = [[/mercado ?livre|shopee|amazon|shein|magalu/, "Compras online"], [/ifood|ifd|99 ?food|rappi|delivery/, "Delivery"], [/mercad|super|emporio|empório|pietra|atacad|feira|hortifruti|carrefour|assa[ií]/, "Mercado"], [/pani|padar|caf[eé]|lanch|gourmet|sorvet|a[cç]a[ií]|doceria/, "Lanches e café"], [/mc ?donald|outback|pizz|restaur|burger|subway|jantar|almo[cç]|churrasc/, "Restaurantes"], [/uber|\b99\b|posto|gasolina|combust|estacion|ped[aá]gio/, "Uber e transporte"], [/drog|farm|rem[eé]dio|sa[uú]de|m[eé]dic|cl[ií]nica/, "Saúde"], [/\bpet\b|fauna|sploot|ra[cç][aã]o|veterin/, "Pet"], [/marisa|riachuelo|c&a|\bcea\b|renner|cosm|laser|roupa|sal[aã]o|cabel|boticario|botic[aá]rio/, "Roupas e beleza"]];
const adivinha = (t) => GUESS.find(([r]) => r.test(t));
function lerFrase(txt) {
  const t = " " + txt.toLowerCase() + " "; const o = {};
  const m = t.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais|real|r\$)?/); if (m) o.valor = parseNum(m[1]);
  const g = adivinha(t); if (g) o.categoria = g[1];
  if (/ita[uú]/.test(t)) o.pagamento = "Itaú crédito"; else if (/ef[ií]/.test(t)) o.pagamento = "Efí crédito"; else if (/cr[eé]dito|cart[aã]o/.test(t)) o.pagamento = "Itaú crédito"; else if (/\bpj\b|empresa|ag[eê]ncia/.test(t)) o.pagamento = "Nubank PJ"; else if (/dinheiro/.test(t)) o.pagamento = "Dinheiro"; else if (/d[eé]bito|pix|nubank/.test(t)) o.pagamento = "Nubank débito";
  if (/marido|esposa|parceir|nelson/.test(t)) o.quem = "Parceiro(a)"; else if (/\bcasa\b|n[oó]s dois|casal/.test(t)) o.quem = "Casa";
  if (/anteontem/.test(t)) { const d = hoje(); d.setDate(d.getDate() - 2); o.data = ymd(d); } else if (/ontem/.test(t)) { const d = hoje(); d.setDate(d.getDate() - 1); o.data = ymd(d); }
  if (/recebi|entrou|ganhei|sal[aá]rio/.test(t)) o.tipo = "e";
  const lj = t.match(/\b(?:no|na|em)\s+([a-zà-ú0-9&' ]{2,30}?)(?=\s+(?:no|na|com|pelo|pela|de|ontem|hoje|anteontem)\b|[,.]|\s*$)/); if (lj) o.loja = lj[1].trim().replace(/^\S/, (c) => c.toUpperCase());
  return o;
}

/* ---------- tema ---------- */
const TEMAS = ["auto", "light", "dark"], NOME_TEMA = { auto: "automático", light: "claro", dark: "escuro" };
let tema = ls.get("juntos:tema", "auto");
const ICON_TEMA = { auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>', light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>', dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>' };
function aplicaTema() {
  const r = document.documentElement;
  if (tema === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", tema);
  const escuro = tema === "dark" || (tema === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const mt = $('meta[name="theme-color"]'); if (mt) mt.content = escuro ? "#0D1411" : "#EDF1EE";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", aplicaTema);
aplicaTema();

/* ---------- toast e folha inferior ---------- */
let tt; function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => (el.hidden = true), 2400); }
let ultimoFoco = null;
let rolagemAntes = 0;
function abre(html, montar) {
  ultimoFoco = document.activeElement;
  if ($("#sheet").hidden) { rolagemAntes = window.scrollY; document.body.classList.add("travado"); document.body.style.top = -rolagemAntes + "px"; }
  $("#panel").innerHTML = html; $("#panel").scrollTop = 0; $("#sheet").hidden = false;
  montar && montar($("#panel"));
}
function fecha() {
  $("#sheet").hidden = true; $("#panel").innerHTML = "";
  document.body.classList.remove("travado"); document.body.style.top = ""; window.scrollTo(0, rolagemAntes);
  ultimoFoco && ultimoFoco.focus && ultimoFoco.focus({ preventScroll: true });
}
$("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") fecha(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) fecha(); });

/* ---------- leitura dos dados ---------- */
const S = { tab: "inicio", mes: mesAtual(), cen: "metas", metaTab: "objetivos" };
const lancs = () => Object.values((D && D.lanc) || {}).filter((r) => !r.deleted && r.data);
const itensMes = (m) => lancs().filter((r) => r.data.slice(0, 7) === m).map((r) => ({ id: r.id, d: r.data, s: r.descricao, v: +r.valor || 0, t: r.tipo, c: r.categoria, q: r.quem, k: r.conta, nf: r.nota_path, pend: !!r._nfce, ts: r.updated_at || "" }));
const gastos = (its) => its.filter((i) => i.t !== "e");
const somaVar = (its) => gastos(its).reduce((a, i) => a + i.v, 0);
const porCat = (its) => { const o = {}; gastos(its).forEach((i) => { o[i.c] = (o[i.c] || 0) + i.v; }); return o; };
const metas = () => { const o = {}; Object.values((D && D.metas) || {}).forEach((r) => (o[r.categoria] = +r.valor || 0)); return o; };
const teto = () => { const m = metas(); return CATS.reduce((a, c) => a + (m[c] || 0), 0); };
const renda = () => +((D && D.espaco && D.espaco.renda) || 0);
function contasDoMes(m) {
  const out = [];
  Object.values((D && D.contas) || {}).forEach((c) => {
    if (!c || c.deleted) return;
    let v = null;
    if (c.valores && typeof c.valores === "object") { if (c.valores[m] != null) v = +c.valores[m]; }
    else { if (c.desde && m < c.desde) return; if (c.ate && m > c.ate) return; v = +c.valor; }
    if (v == null || !isFinite(v)) return;
    out.push({ id: c.id, nome: c.nome, valor: v, grupo: c.grupo || "Outras", ordem: c.ordem || 50, porMes: !!c.valores });
  });
  return out.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}
const pago = (cid, m) => { const r = D.pag[cid + "|" + m]; return !!(r && r.pago); };
const totalContas = (m) => contasDoMes(m).reduce((a, c) => a + c.valor, 0);
function ritmo() { const ms = [1, 2, 3].map((k) => addM(mesAtual(), -k)).filter((m) => gastos(itensMes(m)).length); if (!ms.length) return teto(); return ms.reduce((a, m) => a + somaVar(itensMes(m)), 0) / ms.length; }
const souAdmin = () => !!(D && D.membros.find((x) => x.user_id === api.uid() && x.papel === "admin"));

/* ---------- telas de entrada ---------- */
const LOGO = '<span class="logo" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke-width="2.4"><circle cx="9" cy="12" r="5" stroke="#CFE6D9"/><circle cx="15" cy="12" r="5" stroke="#7FD3AE"/></svg></span>';
function telaLogin(modo, msg) {
  $("#tabs").hidden = true;
  modo = modo || "entrar";
  const criar = modo === "criar";
  $("#root").innerHTML = '<main class="auth" id="view"><div class="brand">' + LOGO + '<h1>Juntos</h1></div><p class="lead">O dinheiro da família num lugar só. Funciona até sem internet.</p>' +
    '<form id="fLogin" class="card" style="display:flex;flex-direction:column;gap:12px" novalidate>' +
    '<div class="seg" role="group" aria-label="Acesso"><button type="button" data-modo="entrar" aria-pressed="' + !criar + '">Entrar</button><button type="button" data-modo="criar" aria-pressed="' + criar + '">Criar conta</button></div>' +
    (criar ? '<label class="field">Seu nome<input id="lNome" autocomplete="name" required></label>' : "") +
    '<label class="field">E-mail<input id="lEmail" type="email" autocomplete="email" inputmode="email" required></label>' +
    '<label class="field">Senha<input id="lSenha" type="password" autocomplete="' + (criar ? "new-password" : "current-password") + '" minlength="6" required></label>' +
    '<p class="err" id="lErr" role="alert">' + esc(msg || "") + "</p>" +
    '<button class="btn" id="lBtn" type="submit">' + (criar ? "Criar conta" : "Entrar") + "</button>" +
    (criar ? "" : '<button class="linkbtn" type="button" id="lEsqueci" style="align-self:center">Esqueci a senha</button>') +
    "</form></main>";
  $("#root").querySelectorAll("[data-modo]").forEach((b) => (b.onclick = () => telaLogin(b.dataset.modo)));
  const esq = $("#lEsqueci"); if (esq) esq.onclick = async () => { const em = $("#lEmail").value.trim(); if (!em) { $("#lErr").textContent = "Digite seu e-mail acima primeiro."; return; } try { await api.auth("recover?redirect_to=" + encodeURIComponent(location.origin + location.pathname), { email: em }); $("#lErr").style.color = "var(--primary-text)"; $("#lErr").textContent = "Enviamos um link para redefinir a senha."; } catch (e) { $("#lErr").textContent = e.message; } };
  $("#fLogin").onsubmit = async (ev) => {
    ev.preventDefault();
    const em = $("#lEmail").value.trim(), se = $("#lSenha").value, nome = criar ? $("#lNome").value.trim() : "";
    const err = $("#lErr"); err.style.color = "";
    if (criar && !nome) { err.textContent = "Digite seu nome."; return; }
    if (!/^\S+@\S+\.\S+$/.test(em)) { err.textContent = "Digite um e-mail válido."; return; }
    if (se.length < 6) { err.textContent = "A senha precisa de pelo menos 6 caracteres."; return; }
    if (!navigator.onLine) { err.textContent = "Para entrar pela primeira vez, conecte-se à internet."; return; }
    const b = $("#lBtn"); b.disabled = true; b.textContent = "Aguarde…";
    try {
      if (criar) {
        const j = await api.auth("signup?redirect_to=" + encodeURIComponent(location.origin + location.pathname), { email: em, password: se, data: { nome } });
        if (j.access_token) { api.salvar(j); return iniciar(); }
        return telaConfirma(em, se);
      }
      const j = await api.auth("token?grant_type=password", { email: em, password: se });
      api.salvar(j); iniciar();
    } catch (e) { err.textContent = e.message; b.disabled = false; b.textContent = criar ? "Criar conta" : "Entrar"; }
  };
}

/* espera a confirmação do e-mail e entra sozinho quando a pessoa volta para o app */
let confirmaPend = null;
function telaConfirma(email, senha) {
  confirmaPend = { email, senha };
  $("#tabs").hidden = true;
  $("#root").innerHTML = '<main class="auth" id="view"><div class="brand">' + LOGO + '<h1>Quase lá</h1></div>' +
    '<div class="card" style="display:flex;flex-direction:column;gap:12px"><p style="margin:0;font-size:16px;line-height:1.5">Enviamos um e-mail para <b>' + esc(email) + '</b>. Toque no link de confirmação dentro dele.</p>' +
    '<p class="small muted" style="margin:0">Se o link abrir outra página, tudo bem: a conta fica confirmada. Volte para cá que o Juntos entra sozinho.</p>' +
    '<p class="err" id="cErr" role="alert"></p><button class="btn" id="cBtn">Já confirmei, entrar</button><button class="linkbtn" id="cVoltar" style="align-self:center">Usar outro e-mail</button></div>' +
    '<p class="xs muted" style="text-align:center">Não chegou? Olhe a caixa de spam e a aba Promoções.</p></main>';
  $("#cVoltar").onclick = () => { confirmaPend = null; telaLogin("criar"); };
  $("#cBtn").onclick = () => tentaConfirmado(true);
}
async function tentaConfirmado(manual) {
  if (!confirmaPend || !navigator.onLine) return;
  try {
    const j = await api.auth("token?grant_type=password", { email: confirmaPend.email, password: confirmaPend.senha });
    confirmaPend = null; api.salvar(j); iniciar();
  } catch (e) { if (manual && $("#cErr")) $("#cErr").textContent = /confirme/i.test(e.message) ? "Ainda não aparece confirmado. Toque no link do e-mail e tente de novo." : e.message; }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && confirmaPend) tentaConfirmado(false); });
window.addEventListener("focus", () => { if (confirmaPend) tentaConfirmado(false); });

/* volta do link do e-mail com a sessão no endereço */
async function pegaSessaoDoLink() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (!h.get("access_token") || !h.get("refresh_token")) return false;
  const s = { access_token: h.get("access_token"), refresh_token: h.get("refresh_token"), expires_in: +h.get("expires_in") || 3600 };
  if (h.get("expires_at")) s.expires_at = +h.get("expires_at");
  try { const r = await fetch(URLB + "/auth/v1/user", { headers: { apikey: KEY, Authorization: "Bearer " + s.access_token } }); if (r.ok) s.user = await r.json(); } catch (e) {}
  history.replaceState(null, "", location.pathname + location.search);
  if (h.get("type") === "recovery") ls.set("juntos:novaSenha", 1);
  if (s.user) { api.salvar(s); return true; }
  return false;
}
/* convite pelo link: ?c=CODIGO */
(function () { const c = new URLSearchParams(location.search).get("c"); if (c && /^[A-Za-z0-9]{4,10}$/.test(c)) { ls.set("juntos:convitePend", c.toUpperCase()); history.replaceState(null, "", location.pathname + location.hash); } })();
async function usaConvitePendente() {
  const c = ls.get("juntos:convitePend", null); if (!c || !navigator.onLine) return false;
  try { const id = await api.req("/rest/v1/rpc/fin_entrar", { method: "POST", body: { p_codigo: c, p_meu_nome: api.meuNome() } }); ls.del("juntos:convitePend"); escolheEspaco(id); toast("Você entrou no espaço"); return true; }
  catch (e) { ls.del("juntos:convitePend"); toast(e.message); return false; }
}

async function telaEspaco(msg) {
  $("#tabs").hidden = true;
  const nome = api.meuNome();
  $("#root").innerHTML = '<main class="auth" id="view"><div class="brand">' + LOGO + "<h1>Olá, " + esc(nome) + "</h1></div><p class=\"lead\">Crie o espaço da sua família ou entre no de alguém com o código de convite.</p>" +
    '<form id="fEsp" class="card" style="display:flex;flex-direction:column;gap:12px"><h2>Criar espaço</h2><label class="field">Nome do espaço<input id="eNome" value="' + esc("Casa de " + nome) + '" maxlength="60"></label><button class="btn" type="submit">Criar</button></form>' +
    '<form id="fCod" class="card" style="display:flex;flex-direction:column;gap:12px"><h2>Tenho um convite</h2><label class="field">Código de 6 letras<input id="eCod" autocomplete="off" autocapitalize="characters" maxlength="8" value="' + esc(ls.get("juntos:convitePend", "") || "") + '" style="text-transform:uppercase;letter-spacing:4px;font-weight:800"></label><button class="btn secondary" type="submit">Entrar no espaço</button></form>' +
    '<p class="err" id="eErr" role="alert">' + esc(msg || "") + '</p><button class="linkbtn" id="eSair" style="align-self:center">Sair da conta</button></main>';
  $("#eSair").onclick = sairConta;
  $("#fEsp").onsubmit = async (ev) => {
    ev.preventDefault(); const n = $("#eNome").value.trim(); if (!n) return;
    try {
      const id = await api.req("/rest/v1/rpc/fin_criar_espaco", { method: "POST", body: { p_nome: n, p_meu_nome: nome } });
      escolheEspaco(id);
      Object.entries(METAS_PADRAO).forEach(([c, v]) => grava("metas", { categoria: c, valor: v }));
      toast("Espaço criado"); S.tab = "inicio"; render(); sync();
    } catch (e) { $("#eErr").textContent = e.message; }
  };
  $("#fCod").onsubmit = async (ev) => {
    ev.preventDefault(); const c = $("#eCod").value.trim(); if (!c) return;
    const b = ev.submitter || $("#fCod button"); if (b) { b.disabled = true; b.textContent = "Entrando…"; }
    if (!navigator.onLine) { $("#eErr").textContent = "Para entrar com código, conecte-se à internet."; if (b) { b.disabled = false; b.textContent = "Entrar no espaço"; } return; }
    try { const id = await api.req("/rest/v1/rpc/fin_entrar", { method: "POST", body: { p_codigo: c.replace(/[^A-Za-z0-9]/g, ""), p_meu_nome: nome } }); ls.del("juntos:convitePend"); escolheEspaco(id); toast("Você entrou no espaço"); render(); sync(); }
    catch (e) { $("#eErr").textContent = e.status === 401 ? "Sua sessão expirou. Saia e entre de novo." : e.message; if (b) { b.disabled = false; b.textContent = "Entrar no espaço"; } }
  };
}
function escolheEspaco(id) { E = id; ls.set("juntos:espaco", id); carregaD(); }
function sairDoEspaco() { ls.del("juntos:d:" + E); E = null; ls.del("juntos:espaco"); D = null; iniciar(); }
function sairConta() {
  try { Object.keys(localStorage).filter((k) => k.startsWith("juntos:") && k !== "juntos:tema").forEach((k) => localStorage.removeItem(k)); } catch (e) {}
  fila = []; api.salvar(null); E = null; D = null; telaLogin("entrar");
}

/* ---------- casca do app ---------- */
function casca() {
  if ($("#mesTitulo")) return;
  $("#root").innerHTML = '<header class="top"><button class="avatar" id="btnPerfil" aria-label="Família e ajustes"></button><div class="month"><button class="iconbtn ghost" id="prevM" aria-label="Mês anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button><h1 id="mesTitulo"></h1><button class="iconbtn ghost" id="nextM" aria-label="Próximo mês"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button></div><button class="iconbtn" id="btnTema"></button></header><main id="view"></main>';
  $("#prevM").onclick = () => { S.mes = addM(S.mes, -1); render(); };
  $("#nextM").onclick = () => { S.mes = addM(S.mes, 1); render(); };
  $("#btnPerfil").onclick = perfil;
  $("#btnTema").onclick = () => { tema = TEMAS[(TEMAS.indexOf(tema) + 1) % 3]; ls.set("juntos:tema", tema); aplicaTema(); render(); toast("Tema " + NOME_TEMA[tema]); };
  $("#tabs").hidden = false;
}

function render() {
  if (!api.sess || !E || !D) return;
  casca();
  const ma = mesAtual();
  $("#mesTitulo").textContent = nomeM(S.mes) + (S.mes.slice(0, 4) !== ma.slice(0, 4) ? " " + S.mes.slice(0, 4) : "");
  $("#btnPerfil").textContent = (api.meuNome()[0] || "?").toUpperCase();
  $("#btnTema").innerHTML = ICON_TEMA[tema]; $("#btnTema").setAttribute("aria-label", "Tema " + NOME_TEMA[tema] + ". Tocar para trocar");
  document.querySelectorAll(".tab").forEach((b) => { if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (!D.espaco) { $("#view").innerHTML = '<div class="skel"></div><p class="small muted" style="text-align:center">Baixando os dados do espaço…</p>'; return; }
  ({ inicio: vInicio, contas: vContas, metas: vMetas, projecao: vProjecao, lancamentos: vLancamentos })[S.tab]();
}

function statusSync() {
  const n = fila.length + ls.get("juntos:fotosPend", []).length;
  if (!navigator.onLine) return '<span class="sync off"><i></i>Sem internet' + (n ? " · " + n + " alterações guardadas no celular" : " · tudo salvo no celular") + "</span>";
  if (SY.rodando) return '<span class="sync"><i></i>Sincronizando…</span>';
  if (SY.erro && SY.erro !== "offline") return '<span class="sync off"><i></i>Não sincronizou: ' + esc(SY.erro) + "</span>";
  return '<span class="sync"><i></i>' + (n ? n + " alterações para enviar" : "Tudo sincronizado") + "</span>";
}

function itemHTML(i) {
  const ent = i.t === "e", neg = i.v < 0;
  return '<button class="item" data-item="' + esc(i.id) + '"><span class="ico" aria-hidden="true">' + esc(ent ? "+" : ABBR[i.c] || "•") + '</span><span class="main"><b>' + esc(i.s || i.c) + (i.pend ? '<span class="pend">lendo nota</span>' : i.nf ? '<span class="clip">nota</span>' : "") + '</b><span class="xs muted">' + esc(ent ? "Entrada" : i.c) + " · " + esc(i.k || "") + " · " + esc(i.q || "") + '</span></span><span class="amt num" style="color:' + (ent || neg ? "var(--ok)" : "var(--ink)") + '">' + (ent || neg ? "+" : "−") + esc(brl.format(Math.abs(i.v))) + "</span></button>";
}

function vInicio() {
  const m = S.mes, ma = mesAtual(), its = itensMes(m), gasto = somaVar(its), T = teto(), resta = T - gasto;
  const dias = diasNoMes(m), dia = m === ma ? hoje().getDate() : m < ma ? dias : 1, restDias = Math.max(1, dias - dia + 1);
  const pct = T ? Math.min(100, (gasto / T) * 100) : 0;
  const status = resta < 0 ? "passou do limite" : gasto > T * (dia / dias) * 1.1 ? "acima do ritmo" : "no ritmo";
  const cs = contasDoMes(m), faltam = cs.filter((c) => !pago(c.id, m)), faltaV = faltam.reduce((a, c) => a + c.valor, 0), totC = cs.reduce((a, c) => a + c.valor, 0);
  const cartoes = faltam.filter((c) => c.grupo === "Cartões").reduce((a, c) => a + c.valor, 0);
  const sobra = renda() - totC - Math.max(T, gasto);
  const cat = porCat(its), mt = metas();
  let insight = null;
  const est = CATS.map((c) => ({ c, d: (cat[c] || 0) - (mt[c] || 0) })).filter((x) => (mt[x.c] || 0) > 0 && x.d > 0).sort((a, b) => b.d - a.d)[0];
  if (est) insight = { t: esc(est.c) + " já passou " + brl0.format(est.d) + " da meta este mês.", a: cat[est.c], b: mt[est.c], la: "gasto", lb: "meta" };
  else { const pc = porCat(itensMes(addM(m, -1))), fora = (pc["Lanches e café"] || 0) + (pc["Delivery"] || 0) + (pc["Restaurantes"] || 0), merc = pc["Mercado"] || 0; if (fora > merc && merc > 0) insight = { t: "Em " + nomeM(addM(m, -1)) + ", comer fora custou " + brl0.format(fora) + ", mais que o mercado (" + brl0.format(merc) + ").", a: fora, b: merc, la: "lanches, delivery e restaurantes", lb: "mercado" }; }
  const ult = its.slice().sort((a, b) => (b.d || "").localeCompare(a.d || "") || (b.ts || "").localeCompare(a.ts || "")).slice(0, 4);
  let h = '<div class="row" style="padding-inline:4px">' + statusSync() + "</div>";
  h += '<section class="hero" aria-label="Limite do mês"><div class="row"><span class="small" style="font-weight:700;opacity:.85">' + (m === ma ? "Dia " + dia + " de " + dias : esc(nomeM(m))) + '</span><span class="pill">' + status + "</span></div>";
  h += '<div><div class="sub">' + (resta >= 0 ? "Ainda dá para gastar" : "Passou do limite em") + '</div><div class="big num">' + esc(brl0.format(Math.abs(resta))) + "</div>";
  if (resta >= 0 && m >= ma) h += '<div class="sub num">≈ ' + esc(brl0.format(resta / restDias)) + " por dia · " + esc(brl0.format(T / (dias / 7))) + " por semana</div>";
  h += '</div><div style="display:flex;flex-direction:column;gap:6px"><div class="track" role="img" aria-label="' + Math.round(pct) + '% do limite usado"><div class="fill" style="width:' + pct + '%"></div></div><div class="row xs" style="opacity:.85"><span class="num">' + esc(brl0.format(gasto)) + ' gastos</span><span class="num">limite ' + esc(brl0.format(T)) + "</span></div></div></section>";
  h += '<div class="grid2"><div class="card stat"><div class="xs muted" style="font-weight:700">Entra no mês</div><div class="v num">' + esc(brl0.format(renda())) + '</div><div class="xs muted">renda da família</div></div>';
  h += '<div class="card stat"><div class="xs muted" style="font-weight:700">Sobra prevista</div><div class="v num" style="color:' + (sobra >= 0 ? "var(--primary-text)" : "var(--warn)") + '">' + esc(brl0.format(sobra)) + '</div><div class="xs muted">' + (gasto > T ? "com o gasto atual" : "se ficar no limite") + "</div></div></div>";
  if (faltam.length) h += '<div class="alert"><span class="ic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span><div style="display:flex;flex-direction:column;gap:2px;flex:1"><b>' + faltam.length + " contas a pagar · " + esc(brl0.format(faltaV)) + '</b><span class="small">' + (cartoes ? "Inclui " + esc(brl0.format(cartoes)) + " de faturas. Pague sempre o valor total." : "Marque cada uma quando pagar.") + '</span><button class="linkbtn" data-go="contas">Ver contas</button></div></div>';
  if (insight) { const mx = Math.max(insight.a, insight.b) || 1; h += '<section class="card" style="display:flex;flex-direction:column;gap:10px"><span class="label" style="color:var(--primary-text)">Insight</span><span style="font-weight:700;font-size:16px;line-height:1.4">' + insight.t + '</span><div style="display:flex;flex-direction:column;gap:6px"><div class="row xs muted"><span>' + esc(insight.la) + '</span><span class="num">' + esc(brl0.format(insight.a)) + '</span></div><div class="track"><div class="fill" style="width:' + (insight.a / mx) * 100 + '%;background:var(--warn)"></div></div><div class="row xs muted"><span>' + esc(insight.lb) + '</span><span class="num">' + esc(brl0.format(insight.b)) + '</span></div><div class="track"><div class="fill" style="width:' + (insight.b / mx) * 100 + '%"></div></div></div></section>'; }
  h += '<section class="card"><div class="row"><h2>Últimos lançamentos</h2><button class="linkbtn" data-go="lancamentos">Ver todos</button></div>';
  h += ult.length ? '<div class="list">' + ult.map(itemHTML).join("") + "</div>" : '<div class="empty"><b>Nada lançado em ' + esc(nomeM(m)) + "</b>Toque no + para lançar o primeiro gasto.</div>";
  h += "</section>";
  $("#view").innerHTML = h;
}

function vLancamentos() {
  const its = itensMes(S.mes).sort((a, b) => (b.d || "").localeCompare(a.d || "") || (b.ts || "").localeCompare(a.ts || ""));
  let h = '<div class="row"><button class="linkbtn" data-go="inicio">← Início</button><span class="small muted num">' + its.length + " lançamentos · " + esc(brl0.format(somaVar(its))) + "</span></div>";
  if (!its.length) { $("#view").innerHTML = h + '<div class="card empty"><b>Nenhum lançamento</b>Toque no + para lançar.</div>'; return; }
  const porDia = {}; its.forEach((i) => (porDia[i.d] = porDia[i.d] || []).push(i));
  h += '<section class="card"><div class="list">';
  Object.keys(porDia).sort().reverse().forEach((d) => { h += '<div class="daytitle">' + esc(new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })) + "</div>" + porDia[d].map(itemHTML).join(""); });
  $("#view").innerHTML = h + "</div></section>";
}

function vContas() {
  const m = S.mes, cs = contasDoMes(m);
  const tot = cs.reduce((a, c) => a + c.valor, 0), pg = cs.filter((c) => pago(c.id, m)).reduce((a, c) => a + c.valor, 0);
  const credAnt = gastos(itensMes(addM(m, -1))).filter((i) => /crédito/.test(i.k || "")).reduce((a, i) => a + i.v, 0);
  let h = '<section class="card" style="display:flex;flex-direction:column;gap:10px"><div class="row"><span class="label">Contas de ' + esc(nomeM(m)) + '</span><span class="pill" style="background:var(--primary-soft);color:var(--primary-text)">' + cs.filter((c) => pago(c.id, m)).length + " de " + cs.length + " pagas</span></div>";
  h += '<div class="row"><span class="num" style="font-family:var(--f-display);font-size:32px;font-weight:700;letter-spacing:-.8px">' + esc(brl0.format(tot - pg)) + '</span><span class="small muted num">faltam de ' + esc(brl0.format(tot)) + '</span></div><div class="track"><div class="fill" style="width:' + (tot ? (pg / tot) * 100 : 0) + '%"></div></div></section>';
  if (!cs.length) h += '<div class="card empty"><b>Nenhuma conta em ' + esc(nomeM(m)) + "</b>Adicione aluguel, luz, internet e o que mais vence todo mês.</div>";
  const grupos = {}; cs.forEach((c) => (grupos[c.grupo] = grupos[c.grupo] || []).push(c));
  Object.keys(grupos).forEach((g) => {
    h += '<section class="card"><div class="row" style="padding-bottom:4px"><h2>' + esc(g) + '</h2><span class="small muted num">' + esc(brl0.format(grupos[g].reduce((a, c) => a + c.valor, 0))) + '</span></div><div class="list">';
    grupos[g].forEach((c) => {
      const on = pago(c.id, m);
      h += '<div class="item' + (on ? " done" : "") + '"><button class="check' + (on ? " on" : "") + '" data-pagar="' + esc(c.id) + '" aria-pressed="' + on + '" aria-label="' + (on ? "Desmarcar " : "Marcar como paga: ") + esc(c.nome) + '">' + (on ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>' : "") + '</button><button class="main" data-conta="' + esc(c.id) + '" style="border:0;background:none;text-align:left;padding:0"><b>' + esc(c.nome) + '</b><span class="xs muted">' + (on ? "paga" : "toque para editar") + '</span></button><span class="amt num">' + esc(brl.format(c.valor)) + "</span></div>";
      if (/fatura/i.test(c.nome) && credAnt > 0) h += '<div class="xs muted" style="padding:0 0 8px 40px">+ ' + esc(brl.format(credAnt)) + " de compras no crédito em " + esc(nomeM(addM(m, -1))) + " (já contadas no limite daquele mês)</div>";
    });
    h += "</div></section>";
  });
  $("#view").innerHTML = h + '<button class="btn secondary" data-novaconta="1">Adicionar conta</button>';
}

function mesesAte(prazo) { if (!prazo) return null; const [y1, m1] = mesAtual().split("-").map(Number), [y2, m2] = prazo.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1) + 1; }
function vMetas() {
  const seg = '<div class="seg" role="group" aria-label="Tipo de meta"><button data-mtab="objetivos" aria-pressed="' + (S.metaTab === "objetivos") + '">Objetivos</button><button data-mtab="limites" aria-pressed="' + (S.metaTab === "limites") + '">Limites de gasto</button></div>';
  if (S.metaTab === "objetivos") return vObjetivos(seg);
  vLimites(seg);
}
function vObjetivos(seg) {
  const obs = Object.values(D.objetivos || {}).filter((o) => !o.deleted).sort((a, b) => (a.ordem || 50) - (b.ordem || 50) || String(a.nome).localeCompare(b.nome));
  const tot = obs.reduce((a, o) => a + (+o.alvo || 0), 0), gu = obs.reduce((a, o) => a + Math.min(+o.guardado || 0, +o.alvo || 0), 0);
  let h = seg;
  if (!obs.length) { $("#view").innerHTML = h + '<div class="card empty"><b>Qual é o próximo sonho?</b>Crie um objetivo com o valor que vocês querem juntar, como reserva de emergência, viagem ou carro. O app mostra quanto guardar por mês.</div><button class="btn" data-novoobj="1">Criar objetivo</button>'; return; }
  h += '<section class="card" style="display:flex;flex-direction:column;gap:8px"><span class="label">Guardado nos objetivos</span><div class="row"><span class="num" style="font-family:var(--f-display);font-size:32px;font-weight:700;letter-spacing:-.8px">' + esc(brl0.format(gu)) + '</span><span class="small muted num">de ' + esc(brl0.format(tot)) + '</span></div><div class="track"><div class="fill" style="width:' + (tot ? (gu / tot) * 100 : 0) + '%"></div></div></section>';
  obs.forEach((o) => {
    const alvo = +o.alvo || 0, g = +o.guardado || 0, falta = Math.max(0, alvo - g), r = alvo ? Math.min(1, g / alvo) : 0, ms = mesesAte(o.prazo);
    let linha;
    if (falta <= 0) linha = '<span class="xs" style="color:var(--ok);font-weight:800">Objetivo alcançado</span>';
    else if (ms == null) linha = '<span class="xs muted">Faltam ' + esc(brl0.format(falta)) + ". Sem prazo definido.</span>";
    else if (ms < 1) linha = '<span class="xs" style="color:var(--warn);font-weight:800">O prazo passou. Faltam ' + esc(brl0.format(falta)) + ".</span>";
    else linha = '<span class="xs muted">Guardar <b style="color:var(--ink)">' + esc(brl0.format(falta / ms)) + "</b> por mês até " + esc(curto(o.prazo)) + "/" + esc(o.prazo.slice(2, 4)) + " · faltam " + esc(brl0.format(falta)) + "</span>";
    h += '<button class="card metaRow" data-obj="' + esc(o.id) + '" style="border-radius:22px;padding:16px;gap:8px"><div class="row"><h2>' + esc(o.nome) + '</h2><span class="small num" style="font-weight:800;color:var(--primary-text)">' + Math.round(r * 100) + '%</span></div><div class="row"><span class="num" style="font-family:var(--f-display);font-size:24px;font-weight:700">' + esc(brl0.format(g)) + '</span><span class="small muted num">de ' + esc(brl0.format(alvo)) + '</span></div><div class="track"><div class="fill" style="width:' + r * 100 + '%"></div></div>' + linha + "</button>";
  });
  $("#view").innerHTML = h + '<button class="btn secondary" data-novoobj="1">Criar objetivo</button>';
}
function vLimites(seg) {
  const its = itensMes(S.mes), cat = porCat(its), T = teto(), g = somaVar(its), mt = metas();
  let h = seg + '<section class="card" style="display:flex;flex-direction:column;gap:8px"><div class="row"><span class="label">Dia a dia em ' + esc(nomeM(S.mes)) + '</span><span class="pill" style="background:' + (g > T ? "var(--warn-bg)" : "var(--primary-soft)") + ";color:" + (g > T ? "var(--warn-ink)" : "var(--primary-text)") + '">' + (g > T ? "passou " + esc(brl0.format(g - T)) : "dentro do limite") + '</span></div><div class="row"><span class="num" style="font-family:var(--f-display);font-size:32px;font-weight:700;letter-spacing:-.8px">' + esc(brl0.format(g)) + '</span><span class="small muted num">de ' + esc(brl0.format(T)) + '</span></div><span class="xs muted">Quanto vocês se permitem gastar por categoria no mês. Toque numa categoria para mudar o limite.</span></section><section class="card"><div class="list">';
  CATS.slice().sort((a, b) => (cat[b] || 0) / (mt[b] || 1) - (cat[a] || 0) / (mt[a] || 1)).forEach((c) => {
    const v = cat[c] || 0, m = mt[c] || 0, r = m ? v / m : 0, cor = r > 1 ? "var(--warn)" : r > 0.85 ? "var(--amber)" : "var(--ok)";
    h += '<button class="metaRow" data-meta="' + esc(c) + '"><div class="row"><b>' + esc(c) + '</b><span class="small num"><b>' + esc(brl0.format(v)) + '</b> <span class="muted">/ ' + esc(brl0.format(m)) + '</span></span></div><div class="track"><div class="fill" style="width:' + Math.min(100, r * 100) + "%;background:" + cor + '"></div></div>' + (r > 1 ? '<span class="xs" style="color:var(--warn);font-weight:800">passou ' + esc(brl0.format(v - m)) + "</span>" : "") + "</button>";
  });
  $("#view").innerHTML = h + "</div></section>";
}

const abrev = (v) => { const a = Math.abs(v), s = v < 0 ? "−" : ""; return s + (a >= 1000 ? (a / 1000).toFixed(a >= 100000 ? 0 : 1).replace(".", ",").replace(/,0$/, "") + "k" : Math.round(a)); };
function patchEspaco(obj) {
  D.espaco = Object.assign({}, D.espaco, obj); salvaD();
  const ant = fila.find((f) => f.tab === "espaco" && f.e === E);
  fila = fila.filter((f) => f !== ant);
  fila.push({ tab: "espaco", k: E, e: E, row: Object.assign({}, ant ? ant.row : {}, obj) });
  salvaFila(); agendaSync();
}
const mesAno = (m) => curto(m) + "/" + m.slice(2, 4);
function vProjecao() {
  const e = D.espaco || {}, alvo = +e.proj_alvo || 0, prazo = e.proj_prazo || null, ini = +e.proj_inicial || 0;
  if (!alvo || !prazo || S.editProj) return formProjecao();
  const n = mesesAte(prazo);
  if (n < 1) return formProjecao("O prazo escolhido já passou. Escolha um novo mês.");
  const falta = Math.max(0, alvo - ini), porMes = falta / n;
  const vals = []; for (let k = 0; k < n; k++) vals.push({ m: addM(mesAtual(), k), acc: ini + porMes * (k + 1) });
  const passo = Math.ceil(n / 12), pv = Math.ceil(n / 6), mx = Math.max(1, alvo), gap = n > 8 ? 3 : 8;
  let h = '<section class="hero" aria-label="Meta da projeção"><div class="row"><span class="small" style="font-weight:700;opacity:.85">Meta até ' + esc(nomeM(prazo)) + " de " + prazo.slice(0, 4) + '</span><span class="pill">' + n + (n === 1 ? " mês" : " meses") + '</span></div><div><div class="sub">Para ter ' + esc(brl0.format(alvo)) + ', guardem</div><div class="big num">' + esc(brl0.format(porMes)) + '</div><div class="sub">por mês' + (ini ? ", partindo de " + esc(brl0.format(ini)) + " já guardados" : "") + "</div></div></section>";
  h += '<section class="card" style="display:flex;flex-direction:column;gap:10px"><div class="row"><span class="label">Guardado mês a mês</span><span class="xs muted num">meta ' + esc(brl0.format(alvo)) + '</span></div>';
  h += '<div class="bars" role="img" aria-label="Valor guardado acumulado até a meta" style="gap:' + gap + 'px">' + vals.map((v, i) => '<div class="b">' + ((i % pv === pv - 1) || i === n - 1 ? '<span class="num">' + esc(abrev(v.acc)) + "</span>" : "") + '<i style="height:' + Math.max(4, (v.acc / mx) * 110) + 'px"></i></div>').join("") + '</div><div class="axis" style="gap:' + gap + 'px">' + vals.map((v, i) => "<span>" + ((i % passo === passo - 1) || i === n - 1 ? esc(n > 12 ? mesAno(v.m) : curto(v.m)) : "") + "</span>").join("") + "</div></section>";
  h += '<section class="card"><h2 style="padding-bottom:6px">Mês a mês</h2><div class="list">' + vals.map((v) => '<div class="item" style="cursor:default"><span class="main"><b style="text-transform:capitalize">' + esc(nomeM(v.m)) + " " + v.m.slice(0, 4) + '</b><span class="xs muted num">guardar ' + esc(brl0.format(porMes)) + '</span></span><span class="amt num">' + esc(brl0.format(v.acc)) + "</span></div>").join("") + "</div></section>";
  h += '<div class="row-actions"><button class="btn secondary" data-projedit="1">Alterar meta</button><button class="btn danger" data-projzerar="1">Zerar</button></div>';
  $("#view").innerHTML = h;
}
function formProjecao(msg) {
  const e = D.espaco || {}, ma = mesAtual(), [ya] = ma.split("-").map(Number);
  const pz = e.proj_prazo && e.proj_prazo >= ma ? e.proj_prazo : addM(ma, 11);
  const [py, pm] = pz.split("-").map(Number);
  const anos = []; for (let y = ya; y <= ya + 15; y++) anos.push(y);
  const sel = 'height:48px;border-radius:14px;border:1.5px solid var(--line);background:var(--surface);padding:0 12px;font-size:16px;font-weight:600;color:var(--ink);width:100%';
  let h = '<section class="card" style="display:flex;flex-direction:column;gap:12px"><h2>Projeção</h2><p class="small muted" style="margin:0">Escolha quanto querem ter guardado e até quando. O app calcula quanto guardar por mês.</p>' +
    '<label class="field">Valor que querem ter<input id="pjV" inputmode="decimal" placeholder="Ex.: 100.000" value="' + esc(e.proj_alvo ? String(+e.proj_alvo).replace(".", ",") : "") + '"></label>' +
    '<div class="field">Até quando<div class="grid2"><select id="pjM" aria-label="Mês" style="' + sel + '">' + MESES.map((n, i) => '<option value="' + pad(i + 1) + '"' + (i + 1 === pm ? " selected" : "") + ">" + n[0].toUpperCase() + n.slice(1) + "</option>").join("") + '</select><select id="pjA" aria-label="Ano" style="' + sel + '">' + anos.map((y) => '<option' + (y === py ? " selected" : "") + ">" + y + "</option>").join("") + "</select></div></div>" +
    '<label class="field">Já têm guardado hoje (opcional)<input id="pjI" inputmode="decimal" placeholder="R$ 0" value="' + esc(+e.proj_inicial ? String(+e.proj_inicial).replace(".", ",") : "") + '"></label>' +
    '<p class="err" id="pjE" role="alert">' + esc(msg || "") + '</p><button class="btn" id="pjS">Calcular projeção</button>' + (S.editProj ? '<button class="btn secondary" id="pjC">Cancelar</button>' : "") + "</section>";
  $("#view").innerHTML = h;
  $("#pjS").onclick = () => {
    const v = parseNum($("#pjV").value), p = $("#pjA").value + "-" + $("#pjM").value, i = parseNum($("#pjI").value);
    if (!(v > 0)) { $("#pjE").textContent = "Digite o valor que querem ter."; $("#pjV").focus(); return; }
    if (p < ma) { $("#pjE").textContent = "Escolha um mês a partir de " + nomeM(ma) + " de " + ya + "."; return; }
    if (i > 0 && i >= v) { $("#pjE").textContent = "O valor já guardado é maior que a meta."; return; }
    S.editProj = false; patchEspaco({ proj_alvo: v, proj_prazo: p, proj_inicial: i > 0 ? i : 0 }); render();
  };
  const c = $("#pjC"); if (c) c.onclick = () => { S.editProj = false; render(); };
}
/* ---------- ações ---------- */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab],[data-go],[data-cen],[data-pagar],[data-conta],[data-meta],[data-item],[data-novaconta],[data-mtab],[data-obj],[data-novoobj],[data-projedit],[data-projzerar]");
  if (!t || t.closest("#panel")) return;
  if (t.dataset.tab || t.dataset.go) { S.tab = t.dataset.tab || t.dataset.go; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.cen) { S.cen = t.dataset.cen; render(); return; }
  if (t.dataset.projedit) { S.editProj = true; render(); return; }
  if (t.dataset.projzerar) { if (t.dataset.arm) { patchEspaco({ proj_alvo: null, proj_prazo: null, proj_inicial: 0 }); render(); toast("Projeção zerada"); } else { t.dataset.arm = "1"; t.textContent = "Toque de novo"; } return; }
  if (t.dataset.pagar) { const id = t.dataset.pagar, on = !pago(id, S.mes); grava("pag", { conta_id: id, mes: S.mes, pago: on }); render(); toast(on ? "Conta marcada como paga" : "Conta desmarcada"); return; }
  if (t.dataset.conta) return editaConta(t.dataset.conta);
  if (t.dataset.meta) return editaMeta(t.dataset.meta);
  if (t.dataset.mtab) { S.metaTab = t.dataset.mtab; render(); return; }
  if (t.dataset.obj) return objetivo(t.dataset.obj);
  if (t.dataset.novoobj) return objetivo(null);
  if (t.dataset.item) return detalheItem(t.dataset.item);
  if (t.dataset.novaconta) return novaConta();
});
$("#btnAdd").onclick = () => lancar();

function lancar(existente) {
  const ex = existente || null;
  const st = ex ? { t: ex.tipo || "s", c: ex.categoria || "Mercado", q: ex.quem || "Eu", k: ex.conta || "Nubank débito", nfce: ex.nfce_url || null } : { t: "s", c: "Mercado", q: "Eu", k: "Nubank débito", nfce: null };
  const chips = (arr, attr, val) => arr.map((x) => '<button type="button" class="chip" data-' + attr + '="' + esc(x) + '" aria-pressed="' + (val === x) + '">' + esc(x) + "</button>").join("");
  abre('<div class="row"><h2>' + (ex ? "Editar lançamento" : "Novo lançamento") + '</h2><button class="linkbtn" id="xClose">Cancelar</button></div>' +
    '<div class="seg" role="group" aria-label="Tipo"><button data-tp="s" aria-pressed="' + (st.t !== "e") + '">Gasto</button><button data-tp="e" aria-pressed="' + (st.t === "e") + '">Entrada</button></div>' +
    (ex ? "" : '<div class="field">Fale ou escreva o gasto<div style="display:flex;gap:8px"><input id="fFala" placeholder="Ex.: 45 no mercado, no débito" autocomplete="off" enterkeyhint="done" style="flex:1;min-width:0"><button class="btn" id="fFalaOk" type="button" style="width:auto;height:48px;padding:0 16px;font-size:14px">Preencher</button></div><span class="note" id="falaStatus" style="color:var(--muted);font-weight:600">Toque no campo e use o microfone do teclado.</span></div>' +
      '<div><div class="grid2" id="nfLabel"><button type="button" class="nfbtn" id="nfScan"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8h3v3H8zM13 13h3v3h-3zM13 8h3M8 16h3"/></svg>Escanear QR</button><label class="nfbtn" for="fFoto"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Foto da nota</label></div><input id="fFoto" class="vh" type="file" accept="image/*"><div class="nfprev" id="nfPrev" hidden><img id="nfThumb" alt="Nota fiscal escolhida"><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px"><b class="small">Nota anexada</b><span class="note" id="nfStatus" style="color:var(--muted)"></span></div><button class="linkbtn" type="button" id="nfTirar">Remover</button></div></div>') +
    '<label class="field amount">Valor<input id="fValor" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off" value="' + (ex ? esc(String(ex.valor).replace(".", ",")) : "") + '"></label>' +
    '<label class="field">Onde<input id="fDesc" placeholder="Ex.: Padaria" autocomplete="off" maxlength="60" value="' + esc(ex ? ex.descricao || "" : "") + '"></label>' +
    '<div class="field" id="boxCat"' + (st.t === "e" ? " hidden" : "") + '>Categoria<div class="chips" role="group" aria-label="Categoria">' + chips(CATS, "cat", st.c) + '</div><span class="note" id="fInfo"></span></div>' +
    '<div class="field">Quem<div class="chips" role="group" aria-label="Quem">' + chips(QUEM, "quem", st.q) + "</div></div>" +
    '<div class="field">Pagou com<div class="chips" role="group" aria-label="Forma de pagamento">' + chips(CONTAS, "pg", st.k) + '</div><span class="note" id="fCred" style="color:var(--warn)" hidden>Conta no limite deste mês e cai na próxima fatura.</span></div>' +
    '<label class="field">Data<input id="fData" type="date" value="' + (ex ? esc(ex.data) : ymd(hoje())) + '"></label>' +
    '<button class="btn" id="fSalvar">' + (ex ? "Salvar alterações" : "Salvar lançamento") + "</button>", (p) => {
    const info = () => {
      const v = parseNum($("#fValor", p).value) || 0, dm = ($("#fData", p).value || ymd(hoje())).slice(0, 7);
      const base = porCat(itensMes(dm).filter((i) => !ex || i.id !== ex.id)), m = metas()[st.c] || 0, us = (base[st.c] || 0) + v, inf = $("#fInfo", p);
      inf.textContent = st.t === "e" || !m ? "" : us <= m ? st.c + ": sobram " + brl0.format(m - us) + " da meta depois deste." : st.c + ": passa " + brl0.format(us - m) + " da meta.";
      inf.style.color = us > m ? "var(--warn)" : "var(--primary-text)";
      $("#fCred", p).hidden = !/crédito/.test(st.k);
    };
    const marca = (attr, v) => p.querySelectorAll("[data-" + attr + "]").forEach((x) => x.setAttribute("aria-pressed", x.dataset[attr] === v));
    const setCat = (c) => { if (CATS.includes(c)) { st.c = c; marca("cat", c); } };
    const aplica = (r) => {
      if (r.tipo === "e") { st.t = "e"; marca("tp", "e"); $("#boxCat", p).hidden = true; }
      if (+r.valor > 0) $("#fValor", p).value = (+r.valor).toFixed(2).replace(".", ",");
      if (r.loja) $("#fDesc", p).value = String(r.loja).slice(0, 60);
      if (r.data && /^\d{4}-\d{2}-\d{2}$/.test(r.data)) $("#fData", p).value = r.data;
      setCat(r.categoria);
      if (CONTAS.includes(r.pagamento)) { st.k = r.pagamento; marca("pg", st.k); }
      if (QUEM.includes(r.quem)) { st.q = r.quem; marca("quem", st.q); }
      info();
    };
    $("#xClose", p).onclick = fecha;
    p.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat],[data-quem],[data-pg],[data-tp]"); if (!b) return;
      if (b.dataset.tp) { st.t = b.dataset.tp; marca("tp", st.t); $("#boxCat", p).hidden = st.t === "e"; }
      else if (b.dataset.cat != null) setCat(b.dataset.cat);
      else if (b.dataset.quem != null) { st.q = b.dataset.quem; marca("quem", st.q); }
      else { st.k = b.dataset.pg; marca("pg", st.k); }
      info();
    });
    $("#fValor", p).addEventListener("input", info);
    $("#fData", p).addEventListener("change", info);
    $("#fDesc", p).addEventListener("input", (e) => { const g = adivinha(e.target.value.toLowerCase()); if (g && g[1] !== st.c) { setCat(g[1]); info(); } });
    if (!ex) {
      const fala = () => { const tx = $("#fFala", p).value.trim(), s = $("#falaStatus", p); if (!tx) { s.textContent = "Diga algo como: 32 reais na padaria ontem."; $("#fFala", p).focus(); return; } aplica(lerFrase(tx)); s.textContent = "Preenchido. Confira e salve."; s.style.color = "var(--primary-text)"; };
      $("#fFalaOk", p).onclick = fala;
      $("#fFala", p).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); fala(); } });
      $("#nfTirar", p).onclick = () => { st.foto = null; st.nfce = null; st.itens = null; $("#nfPrev", p).hidden = true; $("#nfLabel", p).hidden = false; $("#fFoto", p).value = ""; };
      const mostra = (txt, ok) => { const s = $("#nfStatus", p); s.textContent = txt; s.style.color = ok ? "var(--primary-text)" : "var(--muted)"; $("#nfPrev", p).hidden = false; $("#nfLabel", p).hidden = true; };
      // nota com QR: busca na SEFAZ e salva sozinho
      const pelaSefaz = async (qr) => {
        if (!/^https?:\/\/[^/]*\.gov\.br/i.test(qr)) return false;
        st.nfce = qr;
        if (!navigator.onLine) { mostra("Sem internet: a nota será lida quando conectar. Salve agora.", true); return true; }
        mostra("Lendo a nota na SEFAZ…");
        try {
          const n = await consultaNfce(qr);
          if (n && n.ok && n.total > 0) {
            st.itens = (n.itens || []).filter((i) => i.nome).slice(0, 60);
            aplica({ valor: n.total, loja: n.loja, data: n.data, categoria: n.loja ? (adivinha(n.loja.toLowerCase()) || [])[1] : null });
            mostra("Lido: " + brl.format(n.total) + (st.itens.length ? " · " + st.itens.length + " itens" : ""), true);
            salvar(true);
            return true;
          }
        } catch (err) {}
        mostra("A SEFAZ não respondeu. Salve: o app tenta de novo depois.");
        return true;
      };
      $("#nfScan", p).onclick = async () => {
        const qr = await escanearQR(); if (!qr) return;
        if (!(await pelaSefaz(qr))) { mostra("Esse QR Code não é de nota fiscal."); }
      };
      $("#fFoto", p).addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        mostra("Preparando a foto…");
        st.foto = await comprime(f);
        try { $("#nfThumb", p).src = URL.createObjectURL(st.foto); } catch (err) {}
        mostra("Procurando o QR Code…");
        let qr = null; try { qr = await achaQR(f); } catch (err) { qr = null; }
        if (qr && (await pelaSefaz(qr))) return;
        // sem QR: lê o texto da foto
        mostra("Lendo os valores da nota…");
        try {
          const texto = await lerTextoDaFoto(f, (pr) => mostra("Lendo os valores da nota… " + Math.round(pr * 100) + "%"));
          const r = interpretaCupom(texto);
          if (r.total) {
            aplica({ valor: r.total, loja: r.loja, data: r.data, categoria: r.loja ? (adivinha(r.loja.toLowerCase()) || [])[1] : null });
            mostra("Li " + brl.format(r.total) + (r.loja ? " em " + r.loja : "") + ". Confira e toque em Salvar.", true);
            $("#fSalvar", p).scrollIntoView({ behavior: "smooth", block: "center" });
          } else mostra("Não consegui ler o valor. Digite o valor abaixo.");
        } catch (err) { mostra(navigator.onLine ? "Não consegui ler a foto. Digite o valor abaixo." : "Sem internet para ler a foto agora. Digite o valor."); }
      });
    }
    const salvar = async (auto) => {
      let v = parseNum($("#fValor", p).value);
      const pendente = !(v > 0) && !!st.nfce && !ex;
      if (!(v > 0) && !pendente) { toast("Digite um valor, por exemplo 29,90"); $("#fValor", p).focus(); return; }
      if (pendente) v = 0;
      const id = ex ? ex.id : uuid(), d = $("#fData", p).value || ymd(hoje());
      const row = { id, data: d, descricao: $("#fDesc", p).value.trim().slice(0, 60) || (pendente ? "Nota fiscal" : st.t === "e" ? "Entrada" : st.c), valor: Math.round(v * 100) / 100, tipo: st.t, categoria: st.t === "e" ? "Entrada" : st.c, quem: st.q, conta: st.k, deleted: false };
      if (!ex) row.criado_por = api.uid();
      if (st.nfce) row.nfce_url = st.nfce;
      if (st.itens && st.itens.length) row.itens = st.itens;
      if (pendente) row._nfce = true;
      if (st.foto) { row.nota_path = E + "/" + id + ".jpg"; await fotos.put(id, st.foto); const pend = ls.get("juntos:fotosPend", []); pend.push({ id, path: row.nota_path }); ls.set("juntos:fotosPend", pend); }
      grava("lanc", row);
      fecha(); toast(pendente ? "Salvo. O valor entra quando a nota for lida." : ex ? "Alterado" : auto ? "Lançado pela nota: " + brl.format(row.valor) + ". Toque nele para conferir." : "Lançado");
      if (d.slice(0, 7) !== S.mes) S.mes = d.slice(0, 7);
      render();
    };
    $("#fSalvar", p).onclick = () => salvar(false);
    info();
  });
}

function detalheItem(id) {
  const r = D.lanc[id]; if (!r) return;
  abre('<h2>' + esc(r.descricao) + '</h2><div class="card"><div class="list">' +
    [["Valor", brl.format(+r.valor)], ["Categoria", r.categoria], ["Data", new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR")], ["Pagou com", r.conta], ["Quem", r.quem]].map(([a, b]) => '<div class="item" style="cursor:default"><span class="main muted">' + esc(a) + '</span><span class="amt">' + esc(b) + "</span></div>").join("") +
    "</div></div>" + (Array.isArray(r.itens) && r.itens.length ? '<div class="card"><span class="label">Itens da nota</span><div class="list" style="margin-top:4px">' + r.itens.map((i) => '<div class="item" style="cursor:default;padding:7px 0"><span class="main small">' + esc(i.nome) + '</span><span class="small num">' + (i.valor != null ? esc(brl.format(+i.valor)) : "") + "</span></div>").join("") + "</div></div>" : "") + (r.nota_path ? '<div id="dNota" class="small muted" style="text-align:center">Carregando a nota…</div>' : "") +
    (r._nfce ? '<p class="small" style="margin:0;color:var(--amber);font-weight:700">A nota será lida assim que houver internet.</p>' : "") +
    '<div class="row-actions"><button class="btn secondary" id="dEd">Editar</button><button class="btn danger" id="dDel">Apagar</button></div><button class="btn secondary" id="dOk">Fechar</button>', async (p) => {
    $("#dOk", p).onclick = fecha;
    $("#dEd", p).onclick = () => { fecha(); lancar(r); };
    let arm = false; $("#dDel", p).onclick = (e) => { if (!arm) { arm = true; e.target.textContent = "Toque de novo"; return; } grava("lanc", { id, deleted: true }); fecha(); render(); toast("Apagado"); };
    if (r.nota_path) {
      let b = await fotos.get(id);
      if (!b && navigator.onLine) { try { b = await api.req("/storage/v1/object/authenticated/" + CFG.bucket + "/" + r.nota_path); if (b) fotos.put(id, b); } catch (e) { b = null; } }
      const box = $("#dNota", p); if (!box) return;
      box.outerHTML = b ? '<img class="nfimg" alt="Nota fiscal" src="' + URL.createObjectURL(b) + '">' : '<p class="small muted" style="text-align:center">A foto aparece quando houver internet.</p>';
    }
  });
}

function editaMeta(c) {
  abre("<h2>Limite de " + esc(c) + '</h2><label class="field">Limite por mês<input id="mV" inputmode="decimal" value="' + esc(String(metas()[c] || 0).replace(".", ",")) + '"></label><button class="btn" id="mS">Salvar meta</button>', (p) => {
    $("#mS", p).onclick = () => { const v = parseNum($("#mV", p).value); if (!(v >= 0)) { toast("Digite um valor"); return; } grava("metas", { categoria: c, valor: v }); fecha(); render(); toast("Limite salvo"); };
  });
}

function objetivo(id) {
  const o = id ? D.objetivos[id] : null;
  const campo = (lbl, idc, val, extra) => '<label class="field">' + lbl + '<input id="' + idc + '" ' + (extra || 'inputmode="decimal"') + ' value="' + esc(val == null ? "" : val) + '"></label>';
  const vstr = (n) => (n == null || n === "" ? "" : String(n).replace(".", ","));
  let html = "<h2>" + (o ? esc(o.nome) : "Novo objetivo") + "</h2>";
  if (o) html += '<div class="card" style="display:flex;flex-direction:column;gap:10px"><span class="label">Movimentar</span>' + campo("Valor", "oMov", "", 'inputmode="decimal" placeholder="R$ 0,00"') + '<div class="row-actions"><button class="btn" id="oAdd">Guardei</button><button class="btn secondary" id="oTir">Retirei</button></div></div>';
  html += '<div class="card" style="display:flex;flex-direction:column;gap:10px"><span class="label">' + (o ? "Editar objetivo" : "Qual é o objetivo") + "</span>" +
    campo("Nome", "oNome", o ? o.nome : "", 'maxlength="60" placeholder="Ex.: Reserva de emergência"') +
    campo("Quanto quer juntar", "oAlvo", o ? vstr(o.alvo) : "", 'inputmode="decimal" placeholder="R$ 0,00"') +
    campo("Até quando (opcional)", "oPrazo", o ? o.prazo || "" : "", 'type="month" min="' + mesAtual() + '"') +
    (o ? "" : campo("Já tem guardado (opcional)", "oJa", "", 'inputmode="decimal" placeholder="R$ 0,00"')) +
    '<p class="err" id="oErr" role="alert"></p><button class="btn' + (o ? " secondary" : "") + '" id="oSalvar">' + (o ? "Salvar alterações" : "Criar objetivo") + "</button></div>" +
    (o ? '<button class="btn danger" id="oDel">Apagar objetivo</button>' : "") + '<button class="btn secondary" id="oF">Fechar</button>';
  abre(html, (p) => {
    $("#oF", p).onclick = fecha;
    const salva = (row, msg) => { grava("objetivos", row); fecha(); render(); toast(msg); };
    if (o) {
      const mov = (sinal) => { const v = parseNum($("#oMov", p).value); if (!(v > 0)) { toast("Digite o valor"); $("#oMov", p).focus(); return; } const g = Math.max(0, Math.round(((+o.guardado || 0) + sinal * v) * 100) / 100); salva(Object.assign(soCampos(o), { guardado: g }), sinal > 0 ? "Guardado " + brl.format(v) : "Retirado " + brl.format(v)); };
      $("#oAdd", p).onclick = () => mov(1);
      $("#oTir", p).onclick = () => mov(-1);
      let arm = false; $("#oDel", p).onclick = (e) => { if (!arm) { arm = true; e.target.textContent = "Toque de novo para apagar"; return; } salva(Object.assign(soCampos(o), { deleted: true }), "Objetivo apagado"); };
    }
    $("#oSalvar", p).onclick = () => {
      const nome = $("#oNome", p).value.trim().slice(0, 60), alvo = parseNum($("#oAlvo", p).value), prazo = $("#oPrazo", p).value || null, err = $("#oErr", p);
      if (!nome) { err.textContent = "Dê um nome ao objetivo."; return; }
      if (!(alvo > 0)) { err.textContent = "Digite quanto quer juntar."; return; }
      if (prazo && !/^\d{4}-\d{2}$/.test(prazo)) { err.textContent = "Escolha o mês do prazo."; return; }
      if (o) return salva(Object.assign(soCampos(o), { nome, alvo, prazo }), "Objetivo salvo");
      const ja = parseNum($("#oJa", p).value);
      salva({ id: uuid(), nome, alvo, prazo, guardado: ja > 0 ? ja : 0, ordem: 50, deleted: false }, "Objetivo criado");
    };
  });
}

function editaConta(id) {
  const c = D.contas[id]; if (!c) return;
  const porMes = !!(c.valores && typeof c.valores === "object"), atual = porMes ? c.valores[S.mes] || 0 : c.valor;
  abre("<h2>" + esc(c.nome) + '</h2><label class="field">Nome<input id="cN" value="' + esc(c.nome) + '" maxlength="60"></label><label class="field">' + (porMes ? "Valor em " + esc(nomeM(S.mes)) : "Valor por mês") + '<input id="cV" inputmode="decimal" value="' + esc(String(atual).replace(".", ",")) + '"></label><span class="xs muted">' + (porMes ? "Esta conta muda a cada mês." : "Vale para todos os meses a partir de agora.") + '</span><button class="btn" id="cS">Salvar</button><button class="btn danger" id="cD">Remover a partir de ' + esc(nomeM(S.mes)) + "</button>", (p) => {
    $("#cS", p).onclick = () => {
      const v = parseNum($("#cV", p).value), n = $("#cN", p).value.trim().slice(0, 60) || c.nome; if (!(v >= 0)) { toast("Digite um valor"); return; }
      const row = Object.assign(soCampos(c), { nome: n });
      if (porMes) row.valores = Object.assign({}, c.valores, { [S.mes]: v }); else row.valor = v;
      grava("contas", row); fecha(); render(); toast("Salvo");
    };
    let arm = false; $("#cD", p).onclick = (e) => {
      if (!arm) { arm = true; e.target.textContent = "Toque de novo para remover"; return; }
      const row = soCampos(c);
      if (porMes) { const vs = Object.assign({}, c.valores); delete vs[S.mes]; row.valores = vs; } else row.ate = addM(S.mes, -1);
      grava("contas", row); fecha(); render(); toast("Conta removida a partir de " + nomeM(S.mes));
    };
  });
}

function novaConta() {
  abre('<h2>Nova conta</h2><label class="field">Nome<input id="nN" placeholder="Ex.: Luz" maxlength="60"></label><label class="field">Valor<input id="nV" inputmode="decimal" placeholder="R$ 0,00"></label><label class="field">Grupo<select id="nG"><option>Casa</option><option>Moto</option><option>Carro</option><option>Impostos</option><option>Assinaturas</option><option>Cartões</option><option>Outras</option></select></label><div class="seg" role="group" aria-label="Repetição"><button data-rep="todo" aria-pressed="true">Todo mês</button><button data-rep="so" aria-pressed="false">Só em ' + esc(nomeM(S.mes)) + '</button></div><button class="btn" id="nS">Adicionar</button>', (p) => {
    let rep = "todo";
    p.addEventListener("click", (e) => { const b = e.target.closest("[data-rep]"); if (!b) return; rep = b.dataset.rep; p.querySelectorAll("[data-rep]").forEach((x) => x.setAttribute("aria-pressed", x === b)); });
    $("#nS", p).onclick = () => {
      const n = $("#nN", p).value.trim().slice(0, 60), v = parseNum($("#nV", p).value);
      if (!n || !(v >= 0)) { toast("Preencha nome e valor"); return; }
      const row = { id: uuid(), nome: n, grupo: $("#nG", p).value, ordem: 50, deleted: false, valor: null, desde: null, ate: null, valores: null };
      if (rep === "so") row.valores = { [S.mes]: v }; else { row.valor = v; row.desde = S.mes; }
      grava("contas", row); fecha(); render(); toast("Conta adicionada");
    };
  });
}

function pessoa(uid) {
  const m = (D.membros || []).find((x) => x.user_id === uid); if (!m) return;
  const eu = uid === api.uid();
  abre("<h2>" + esc(m.nome || "Membro") + (eu ? " (você)" : "") + '</h2><p class="small muted" style="margin:0">Administrador(a) muda papéis e remove pessoas. Convidado(a) vê e lança tudo.</p><div class="seg" role="group" aria-label="Papel"><button data-papel="admin" aria-pressed="' + (m.papel === "admin") + '">Administrador(a)</button><button data-papel="membro" aria-pressed="' + (m.papel !== "admin") + '">Convidado(a)</button></div><p class="err" id="rErr" role="alert"></p>' + (eu ? "" : '<button class="btn danger" id="rRem">Remover do espaço</button>') + '<button class="btn secondary" id="rF">Fechar</button>', (p) => {
    $("#rF", p).onclick = fecha;
    p.querySelectorAll("[data-papel]").forEach((b) => (b.onclick = async () => {
      const papel = b.dataset.papel; if (papel === m.papel) return;
      if (!navigator.onLine) { $("#rErr", p).textContent = "Para mudar papéis, conecte-se à internet."; return; }
      try { await api.req("/rest/v1/rpc/fin_mudar_papel", { method: "POST", body: { p_espaco: E, p_user: uid, p_papel: papel } }); m.papel = papel; salvaD(); fecha(); toast(papel === "admin" ? "Agora é administrador(a)" : "Agora é convidado(a)"); sync(); }
      catch (e) { $("#rErr", p).textContent = e.message; }
    }));
    const rem = $("#rRem", p); if (rem) { let arm = false; rem.onclick = async (e) => {
      if (!arm) { arm = true; e.target.textContent = "Toque de novo para remover"; return; }
      if (!navigator.onLine) { $("#rErr", p).textContent = "Para remover, conecte-se à internet."; return; }
      try { await api.req("/rest/v1/fin_membros?espaco_id=eq." + E + "&user_id=eq." + uid, { method: "DELETE", headers: { Prefer: "return=minimal" } }); D.membros = D.membros.filter((x) => x.user_id !== uid); salvaD(); fecha(); toast("Removido do espaço"); }
      catch (e2) { $("#rErr", p).textContent = e2.message; }
    }; }
  });
}

async function perfil() {
  const espacos = ls.get("juntos:espacos", []);
  const admin = souAdmin();
  const membros = (D.membros || []).map((m) => '<div class="item" style="cursor:default"><span class="ico">' + esc((m.nome || "?")[0].toUpperCase()) + '</span><span class="main"><b>' + esc(m.nome || "Membro") + (m.user_id === api.uid() ? " (você)" : "") + '</b><span class="xs muted">' + (m.papel === "admin" ? "Administrador(a)" : "Convidado(a)") + "</span></span>" + (admin ? '<button class="linkbtn" data-pessoa="' + esc(m.user_id) + '">Alterar</button>' : "") + "</div>").join("");
  abre('<h2>' + esc((D.espaco && D.espaco.nome) || "Espaço") + '</h2>' +
    '<div class="card" style="display:flex;flex-direction:column;gap:10px"><span class="label">Renda mensal da família</span><input id="pR" class="num" inputmode="decimal" style="height:48px;border-radius:14px;border:1.5px solid var(--line);background:var(--surface);padding:0 14px;font-size:16px;font-weight:700;color:var(--ink)" value="' + esc(String(renda()).replace(".", ",")) + '" aria-label="Renda mensal"><button class="btn" id="pS">Salvar renda</button></div>' +
    '<div class="card"><div class="row"><span class="label">Pessoas</span><button class="linkbtn" id="pConv">Convidar</button></div><div class="list" style="margin-top:4px">' + (membros || '<p class="small muted">Só você por enquanto.</p>') + '</div><div id="pCodeBox"></div></div>' +
    '<div class="card" style="display:flex;flex-direction:column;gap:10px"><span class="label">Aparência</span><div class="seg" role="group" aria-label="Tema">' + TEMAS.map((t) => '<button data-tema="' + t + '" aria-pressed="' + (tema === t) + '">' + (t === "auto" ? "Automático" : t === "light" ? "Claro" : "Escuro") + "</button>").join("") + "</div></div>" +
    '<div class="card" style="display:flex;flex-direction:column;gap:10px"><span class="label">Sincronização</span>' + statusSync() + '<span class="xs muted">' + (SY.ultimo ? "Última: " + esc(new Date(SY.ultimo).toLocaleString("pt-BR")) : "Ainda não sincronizou") + '</span><button class="btn secondary" id="pSync">Sincronizar agora</button></div>' +
    (espacos.length > 1 ? '<div class="card" style="display:flex;flex-direction:column;gap:10px"><span class="label">Trocar de espaço</span>' + espacos.map((x) => '<button class="btn secondary" data-esp="' + esc(x.id) + '"' + (x.id === E ? " disabled" : "") + ">" + esc(x.nome) + "</button>").join("") + "</div>" : "") +
    '<button class="btn secondary" id="pOutro">Entrar em outro espaço com código</button><button class="btn danger" id="pSair">Sair da conta</button><button class="btn secondary" id="pF">Fechar</button>', (p) => {
    $("#pF", p).onclick = fecha;
    p.querySelectorAll("[data-pessoa]").forEach((b) => (b.onclick = () => { fecha(); pessoa(b.dataset.pessoa); }));
    $("#pS", p).onclick = () => { const v = parseNum($("#pR", p).value); if (!(v >= 0)) { toast("Digite a renda"); return; } patchEspaco({ renda: v }); fecha(); render(); toast("Renda salva"); };
    p.querySelectorAll("[data-tema]").forEach((b) => (b.onclick = () => { tema = b.dataset.tema; ls.set("juntos:tema", tema); aplicaTema(); p.querySelectorAll("[data-tema]").forEach((x) => x.setAttribute("aria-pressed", x === b)); render(); }));
    $("#pSync", p).onclick = async () => { fecha(); await sync(); toast(SY.erro ? "Não sincronizou agora" : "Sincronizado"); };
    p.querySelectorAll("[data-esp]").forEach((b) => (b.onclick = () => { escolheEspaco(b.dataset.esp); fecha(); S.tab = "inicio"; render(); sync(); }));
    $("#pOutro", p).onclick = () => { fecha(); telaEspaco(); };
    let arm = false; $("#pSair", p).onclick = (e) => { if (!arm) { arm = true; e.target.textContent = fila.length ? "Há alterações não enviadas. Toque de novo para sair" : "Toque de novo para sair"; return; } fecha(); sairConta(); };
    $("#pConv", p).onclick = async () => {
      const box = $("#pCodeBox", p);
      if (!navigator.onLine) { box.innerHTML = '<p class="small" style="color:var(--warn)">Para convidar, conecte-se à internet.</p>'; return; }
      box.innerHTML = '<p class="small muted">Gerando código…</p>';
      try {
        const c = await api.req("/rest/v1/rpc/fin_criar_convite", { method: "POST", body: { p_espaco: E } });
        const link = location.origin + location.pathname;
        box.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px"><div class="code" id="pCode">' + esc(c) + '</div><span class="xs muted">Vale por 7 dias. A pessoa abre ' + esc(link) + ', cria a conta e digita o código.</span><button class="btn secondary" id="pCopy">Copiar convite</button></div>';
        $("#pCopy", p).onclick = async () => { const txt = "Entre no nosso espaço do Juntos: abra " + link + "?c=" + c + " , crie sua conta (ou entre) e o convite já vem preenchido. Código: " + c; try { await navigator.clipboard.writeText(txt); toast("Convite copiado"); } catch (e) { toast("Toque e segure o código para copiar"); } };
      } catch (e) { box.innerHTML = '<p class="small" style="color:var(--warn)">' + esc(e.message) + "</p>"; }
    };
  });
}

/* ---------- início ---------- */
async function iniciar() {
  if (!api.sess && location.hash.includes("access_token")) await pegaSessaoDoLink();
  if (!api.sess) return telaLogin(ls.get("juntos:convitePend", null) ? "criar" : "entrar", ls.get("juntos:convitePend", null) ? "Você recebeu um convite. Crie sua conta ou entre para participar." : "");
  if (E) { carregaD(); render(); }
  if (navigator.onLine) {
    try {
      const ms = (await api.req("/rest/v1/fin_membros?user_id=eq." + api.uid() + "&select=espaco_id,papel,fin_espacos(id,nome)")) || [];
      const lista = ms.filter((m) => m.fin_espacos).map((m) => ({ id: m.fin_espacos.id, nome: m.fin_espacos.nome }));
      ls.set("juntos:espacos", lista);
      if (E && !lista.find((x) => x.id === E)) { ls.del("juntos:d:" + E); E = null; ls.del("juntos:espaco"); D = null; }
      if (!E && lista.length) escolheEspaco(lista[0].id);
    } catch (e) {
      if (e.status === 401 || /refresh|JWT|sem login/i.test(e.message)) { api.salvar(null); return telaLogin("entrar", "Sua sessão expirou. Entre de novo."); }
    }
  }
  if (ls.get("juntos:convitePend", null)) await usaConvitePendente();
  if (!E) return telaEspaco(navigator.onLine ? "" : "Conecte-se à internet para criar ou entrar em um espaço.");
  render(); sync();
  if (ls.get("juntos:novaSenha", null)) novaSenha();
}

function novaSenha() {
  abre('<h2>Crie uma nova senha</h2><label class="field">Nova senha<input id="nsS" type="password" autocomplete="new-password" minlength="6"></label><p class="err" id="nsE" role="alert"></p><button class="btn" id="nsB">Salvar senha</button>', (p) => {
    $("#nsB", p).onclick = async () => {
      const v = $("#nsS", p).value; if (v.length < 6) { $("#nsE", p).textContent = "A senha precisa de pelo menos 6 caracteres."; return; }
      try { await api.req("/auth/v1/user", { method: "PUT", body: { password: v } }); ls.del("juntos:novaSenha"); fecha(); toast("Senha alterada"); }
      catch (e) { $("#nsE", p).textContent = e.message; }
    };
  });
}

if ("serviceWorker" in navigator) {
  // quando sai uma versão nova, o app recarrega sozinho (só se nenhuma janela estiver aberta)
  let recarregou = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (recarregou || !$("#sheet").hidden) return; recarregou = true; location.reload(); });
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((r) => { r.update().catch(() => {}); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") r.update().catch(() => {}); }); }).catch(() => {}));
}
iniciar();
})();
