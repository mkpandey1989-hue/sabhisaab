/**
 * Sab Hisaab — Telegram Control Center v3
 * Cloudflare Worker. VM par 0 load, ₹0 kharcha.
 */
import { unzipSync } from "fflate";
import { gapi, googleToken, SCOPE_GSC, SCOPE_GA4 } from "./google.js";

const SITE = "https://sabhisaab.com";
const j = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });

/** Telegram HTML mode: bina escape ke ek '&' ya '<' poora message gira deta hai */
const esc = (x) => String(x == null ? "" : x)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- telegram ----------
async function tgApi(env, m, b) {
  const r = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/${m}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  return r.json();
}
const kb = (rows) => ({ inline_keyboard: rows });
const plain = (t) => String(t).replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
/** HTML se message reject ho jaaye to wahi baat plain text me bhejo — message kabhi gayab na ho */
async function say(env, t, k) {
  const b = { chat_id: env.TG_CHAT, text: t, parse_mode: "HTML", disable_web_page_preview: true, ...(k ? { reply_markup: k } : {}) };
  const r = await tgApi(env, "sendMessage", b);
  if (r && r.ok === false) return tgApi(env, "sendMessage", { ...b, text: plain(t), parse_mode: undefined });
  return r;
}
async function edit(env, id, t, k) {
  const b = { chat_id: env.TG_CHAT, message_id: id, text: t, parse_mode: "HTML", disable_web_page_preview: true, ...(k ? { reply_markup: k } : {}) };
  const r = await tgApi(env, "editMessageText", b);
  if (r && r.ok === false && !/not modified/i.test(r.description || ""))
    return tgApi(env, "editMessageText", { ...b, text: plain(t), parse_mode: undefined });
  return r;
}

// ---------- github ----------
async function gh(env, path, init = {}) {
  // GitHub par bhi hard timeout — warna ek atki hui call poore bot ko chup kar deti hai
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  let r;
  try {
  r = await fetch("https://api.github.com" + path, { ...init, signal: ac.signal, headers: {
    Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json",
    "User-Agent": "sabhisaab-bot", "content-type": "application/json", ...(init.headers || {}) } });
  } catch (e) { clearTimeout(t); return { ok: false, status: 0, data: { raw: "GitHub ne 15s me jawab nahi diya" } }; }
  clearTimeout(t);
  const txt = await r.text(); let d = null;
  try { d = txt ? JSON.parse(txt) : null; } catch { d = { raw: txt }; }
  return { ok: r.ok, status: r.status, data: d };
}
/** Ek hi kaam do baar mat chalao — pehle dekho ki wahi workflow already chal to nahi raha */
async function wfBusy(env, wf) {
  const r = await gh(env, `/repos/${env.GH_REPO}/actions/workflows/${wf}/runs?per_page=3`);
  return (r.data?.workflow_runs || []).some((x) => x.status === "queued" || x.status === "in_progress");
}
const runWf = (env, wf, inputs = {}) =>
  gh(env, `/repos/${env.GH_REPO}/actions/workflows/${wf}/dispatches`,
     { method: "POST", body: JSON.stringify({ ref: "main", inputs }) });

function b64(u8) { let s = ""; const c = 0x8000;
  for (let i = 0; i < u8.length; i += c) s += String.fromCharCode.apply(null, u8.subarray(i, i + c));
  return btoa(s); }
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m/60)}h` : `${Math.round(m/1440)}d`; };
const nf = (x, w = 0) => Number(x).toLocaleString("en-IN", { maximumFractionDigits: w });

// ---------- menus ----------
const MAIN = kb([
  [{ text: "🔍 Search (GSC)", callback_data: "m:gsc" }, { text: "📊 Analytics", callback_data: "m:ga" }],
  [{ text: "📑 Indexing", callback_data: "m:idx" }, { text: "⚡ Speed", callback_data: "m:spd" }],
  [{ text: "🛠 Audit", callback_data: "m:aud" }, { text: "🚀 Deploy", callback_data: "m:dep" }],
  [{ text: "☁️ Cloudflare", callback_data: "m:cf" }, { text: "📁 Files", callback_data: "m:file" }],
  [{ text: "📋 Pending kaam", callback_data: "do:pending" }, { text: "❤️ Health", callback_data: "do:health" }],
  [{ text: "📖 Madad", callback_data: "do:help" }],
]);
const back = [{ text: "⬅️ Wapas", callback_data: "m:main" }];
const CF_HOWTO = "\ndash.cloudflare.com/profile/api-tokens → apna token → <b>Edit</b> → <b>+ Add more</b> → Save.\nToken ki value nahi badlegi, GitHub secret waise hi rahega.";

// Hamesha message box ke upar chipka rehne wala keyboard — kabhi upar nahi khiskega
const RKB = { keyboard: [
    [{ text: "🚀 Deploy" }, { text: "📋 Pending" }],
    [{ text: "🔍 Search" }, { text: "📈 Analytics" }],
    [{ text: "📑 Indexing" }, { text: "⚡ Speed" }],
    [{ text: "🛠 Audit" }, { text: "❤️ Health" }],
    [{ text: "📖 Poora menu" }]],
  resize_keyboard: true, is_persistent: true,
  input_field_placeholder: "Button dabayein ya file bhejein" };
const MENUS = {
  gsc: { t: "<b>🔍 Google Search</b>\nKis samay ka data?", k: kb([
    [{ text: "Kal", callback_data: "g:1:1" }, { text: "7 din", callback_data: "g:7:1" }, { text: "28 din", callback_data: "g:28:1" }],
    [{ text: "90 din", callback_data: "g:90:1" }, { text: "Pichhle se compare", callback_data: "g:cmp:0" }],
    [{ text: "Top pages", callback_data: "gd:page" }, { text: "Top queries", callback_data: "gd:query" }],
    [{ text: "Desh", callback_data: "gd:country" }, { text: "Device", callback_data: "gd:device" }],
    back]) },
  ga: { t: "<b>📊 Analytics (GA4)</b>\nKitna samay?", k: kb([
    [{ text: "Abhi live", callback_data: "a:live" }, { text: "Aaj", callback_data: "a:0:0" }],
    [{ text: "Ghante-wise (aaj)", callback_data: "a:hr" }, { text: "Kal", callback_data: "a:1:1" }],
    [{ text: "7 din", callback_data: "a:7:1" }, { text: "28 din", callback_data: "a:28:1" }],
    [{ text: "Kahan se aaye", callback_data: "ad:sessionDefaultChannelGroup" }, { text: "Desh", callback_data: "ad:country" }],
    [{ text: "Top pages", callback_data: "ad:pagePath" }, { text: "Device", callback_data: "ad:deviceCategory" }],
    back]) },
  idx: { t: "<b>📑 Indexing</b>", k: kb([
    [{ text: "Aaj ki report", callback_data: "do:report" }],
    [{ text: "Poora scan abhi", callback_data: "do:daily" }],
    [{ text: "Sitemap Google ko submit", callback_data: "do:sitemap" }],
    [{ text: "🗺 Sitemap ka haal", callback_data: "do:smstatus" }],
    [{ text: "🔍 Bache hue URL jaanchein", callback_data: "do:checkpend" }],
    [{ text: "🔎 Abhi ka sach (sabse naye page)", callback_data: "do:taaza" }],
    [{ text: "IndexNow: badle URL", callback_data: "d:badle-hue" }],
    [{ text: "IndexNow: sabhi URL", callback_data: "d:sabhi" }],
    back]) },
  spd: { t: "<b>⚡ Speed</b>", k: kb([
    [{ text: "Mobile", callback_data: "s:mobile" }, { text: "Desktop", callback_data: "s:desktop" }],
    [{ text: "Live site check", callback_data: "do:site" }], back]) },
  aud: { t: "<b>🛠 Audit</b>\nSpelling, heading, duplicate, schema, link — sab", k: kb([
    [{ text: "Audit chalao", callback_data: "do:audit" }],
    [{ text: "Pichhla natija", callback_data: "do:auditlast" }], back]) },
  dep: { t: "<b>🚀 Deploy</b>", k: kb([
    [{ text: "Deploy (badle URL ping)", callback_data: "d:badle-hue" }],
    [{ text: "Deploy + sabhi URL ping", callback_data: "d:sabhi" }],
    [{ text: "Deploy (koi ping nahi)", callback_data: "d:koi-nahi" }],
    [{ text: "Pichhle 5 run", callback_data: "do:status" }], back]) },
  cf: { t: "<b>☁️ Cloudflare</b>", k: kb([
    [{ text: "Cache purge", callback_data: "cf:purge" }],
    [{ text: "Pages ka haal", callback_data: "cf:pages" }],
    [{ text: "↩️ Purane version par wapas", callback_data: "cf:rb" }], back]) },
  file: { t: "<b>📁 Files</b>\nFile chahiye? <code>/get naam.html</code>\nZIP ya file bhej dijiye — khud sahi jagah jaayegi", k: kb([
    [{ text: "Kitne page hain", callback_data: "do:pages" }],
    [{ text: "Faltu file dhundo", callback_data: "do:unused" }],
    [{ text: "📝 Aaj kya badla", callback_data: "do:changes" }],
    [{ text: "🔗 Toote link", callback_data: "do:linkcheck" }], back]) },
};

// ---------- google helpers ----------
const dISO = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
async function gscQuery(env, days, endBack, dims, limit = 10) {
  return gapi(env, `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.GSC_PROPERTY)}/searchAnalytics/query`,
    SCOPE_GSC, { startDate: dISO(days + endBack + 2), endDate: dISO(endBack + 2),
                 ...(dims ? { dimensions: dims } : {}), rowLimit: limit });
}
async function ga4(env, body) {
  return gapi(env, `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_ID}:runReport`, SCOPE_GA4, body);
}
async function ga4rt(env, body) {
  return gapi(env, `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_ID}:runRealtimeReport`, SCOPE_GA4, body);
}
const tot = (r, i = 0) => Number(r?.totals?.[0]?.metricValues?.[i]?.value || 0);
const rows = (r) => (r?.rows || []).map((x) => [
  (x.dimensionValues || []).map((d) => d.value), (x.metricValues || []).map((m) => m.value)]);

// ---------- actions ----------
async function doGsc(env, mid, days) {
  await edit(env, mid, "⏳ GSC se data la raha hoon…");
  try {
    const c = await gscQuery(env, days, 0, null, 1);
    const p = await gscQuery(env, days, days, null, 1);
    const g = (x) => x?.rows?.[0] || {};
    const a = g(c), b = g(p);
    const ar = (x, y) => (!y ? "" : `  ${x > y * 1.02 ? "🟢" : x < y * 0.98 ? "🔴" : "⚪"} ${(((x - y) / y) * 100).toFixed(0)}%`);
    await edit(env,
      mid, `<b>🔍 Google Search — pichhle ${days} din</b>\n<i>GSC ka data 2-3 din peeche chalta hai</i>\n\n` +
      `Clicks : <b>${nf(a.clicks || 0)}</b>${ar(a.clicks || 0, b.clicks || 0)}\n` +
      `Impressions : <b>${nf(a.impressions || 0)}</b>${ar(a.impressions || 0, b.impressions || 0)}\n` +
      `CTR : <b>${((a.ctr || 0) * 100).toFixed(2)}%</b>\n` +
      `Position : <b>${(a.position || 0).toFixed(1)}</b>\n\n<i>Pichhle ${days} din se tulna</i>`, MENUS.gsc.k);
  } catch (e) { await edit(env, mid, `❌ ${esc(String(e).slice(0, 250))}`, MENUS.gsc.k); }
}
async function doGscDim(env, mid, dim) {
  await edit(env, mid, "⏳ …");
  try {
    const r = await gscQuery(env, 28, 0, [dim], 10);
    const nm = { page: "Top pages", query: "Top queries", country: "Desh", device: "Device" }[dim];
    let t = `<b>${nm} — 28 din</b>\n\n`;
    (r.rows || []).forEach((x, i) => {
      const k = x.keys[0].replace(SITE, "") || "/";
      t += `${i + 1}. <code>${esc(k.slice(0, 42))}</code>\n   ${nf(x.clicks)} click · ${nf(x.impressions)} impr · pos ${x.position.toFixed(1)}\n`;
    });
    await edit(env, mid, t || "Data nahi mila", MENUS.gsc.k);
  } catch (e) { await edit(env, mid, `❌ ${esc(String(e).slice(0, 250))}`, MENUS.gsc.k); }
}
async function doGa(env, mid, from, to) {
  await edit(env, mid, "⏳ Analytics…");
  try {
    const body = { dateRanges: [{ startDate: `${from}daysAgo`, endDate: `${to}daysAgo` }],
      metrics: ["activeUsers", "sessions", "screenPageViews", "bounceRate", "averageSessionDuration"].map((n) => ({ name: n })) };
    const r = await ga4(env, body);
    const per = from - to + 1;
    const p = await ga4(env, { dateRanges: [{ startDate: `${from + per}daysAgo`, endDate: `${to + per}daysAgo` }],
      metrics: [{ name: "activeUsers" }] });
    const u = tot(r), pu = tot(p);
    const ar = !pu ? "" : `  ${u > pu * 1.02 ? "🟢" : u < pu * 0.98 ? "🔴" : "⚪"} ${(((u - pu) / pu) * 100).toFixed(0)}%`;
    await edit(env, mid, `<b>📊 Analytics — ${from === to ? (from ? from + " din pehle" : "aaj") : per + " din"}</b>\n\n` +
      `Users : <b>${nf(u)}</b>${ar}\nSessions : <b>${nf(tot(r,1))}</b>\nPageviews : <b>${nf(tot(r,2))}</b>\n` +
      `Bounce : <b>${(tot(r,3)*100).toFixed(1)}%</b>\nAvg time : <b>${(tot(r,4)/60).toFixed(1)} min</b>`, MENUS.ga.k);
  } catch (e) { await edit(env, mid, `❌ ${esc(String(e).slice(0, 250))}`, MENUS.ga.k); }
}
async function doGaHourly(env, mid) {
  await edit(env, mid, "⏳ Ghante ka hisaab…");
  try {
    const r = await ga4(env, { dateRanges: [{ startDate: "today", endDate: "today" }],
      dimensions: [{ name: "hour" }], metrics: [{ name: "activeUsers" }], orderBys: [{ dimension: { dimensionName: "hour" } }] });
    let t = "<b>📊 Aaj ghante ke hisaab se</b>\n<i>Google ka time IST me nahi bhi ho sakta</i>\n\n";
    const rs = rows(r); const mx = Math.max(1, ...rs.map(([, m]) => +m[0]));
    rs.forEach(([d, m]) => { const v = +m[0]; t += `${d[0].padStart(2,"0")}:00 ${"█".repeat(Math.round(v/mx*14)) || "·"} ${v}\n`; });
    await edit(env, mid, t, MENUS.ga.k);
  } catch (e) { await edit(env, mid, `❌ ${esc(String(e).slice(0, 250))}`, MENUS.ga.k); }
}
async function doGaLive(env, mid) {
  await edit(env, mid, "⏳ Live…");
  try {
    const r = await ga4rt(env, { metrics: [{ name: "activeUsers" }] });
    const p = await ga4rt(env, { dimensions: [{ name: "unifiedScreenName" }], metrics: [{ name: "activeUsers" }], limit: 6 });
    let t = `<b>🔴 Abhi site par : ${nf(tot(r))} log</b>\n<i>pichhle 30 minute</i>\n\n`;
    rows(p).forEach(([d, m]) => (t += `• ${esc(d[0].slice(0, 40))} — ${esc(m[0])}\n`));
    await edit(env, mid, t, MENUS.ga.k);
  } catch (e) { await edit(env, mid, `❌ ${esc(String(e).slice(0, 250))}`, MENUS.ga.k); }
}
async function doGaDim(env, mid, dim) {
  await edit(env, mid, "⏳ …");
  try {
    const r = await ga4(env, { dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: dim }], metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 10 });
    const nm = { sessionDefaultChannelGroup: "Kahan se aaye", country: "Desh", pagePath: "Top pages", deviceCategory: "Device" }[dim];
    let t = `<b>${nm} — 28 din</b>\n\n`;
    rows(r).forEach(([d, m], i) => (t += `${i + 1}. ${esc(d[0].slice(0, 40))} — <b>${nf(+m[0])}</b>\n`));
    await edit(env, mid, t, MENUS.ga.k);
  } catch (e) { await edit(env, mid, `❌ ${esc(String(e).slice(0, 250))}`, MENUS.ga.k); }
}
async function doSpeed(env, mid, st) {
  await edit(env, mid, "⏳ PageSpeed chal raha hai (30-60 sec)…");
  const key = (env.PSI_KEY || "").trim();
  const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(SITE)}` +
              `&strategy=${st}&category=performance${key ? "&key=" + encodeURIComponent(key) : ""}`;
  for (let try_ = 1; try_ <= 2; try_++) {
    try {
      const res = await fetch(url);
      const d = await res.json();
      const lh = d && d.lighthouseResult;
      if (!lh || !lh.audits) {
        const why = d?.error?.message || `HTTP ${res.status}`;
        if (try_ === 1) { await new Promise((r) => setTimeout(r, 4000)); continue; }
        return edit(env, mid,
          "⚠️ <b>PageSpeed ne jawab nahi diya</b>\n\n" + `<code>${esc(String(why).slice(0, 140))}</code>\n\n` +
          (key ? "Key lagi hui hai — Google ki taraf se der ho sakti hai, 2 minute baad phir dekhiye."
               : "Wajah: <b>API key nahi lagi</b>. Bina key ke Google bahut kam request deta hai aur aksar mana kar deta hai.\n\n" +
                 "Ek baar ka kaam: Google Cloud me <i>PageSpeed Insights API</i> chalu karke key banayein, phir GitHub me " +
                 "<code>PSI_KEY</code> naam ka secret jodein. Free hai — 25,000 request roz.") +
          "\n\nAbhi ke liye: pagespeed.web.dev par khud check kar sakte hain.", MENUS.spd.k);
      }
      const a = lh.audits, sc = Math.round((lh.categories?.performance?.score ?? 0) * 100);
      const v = (k) => a[k]?.displayValue || "-";
      return edit(env, mid, `<b>⚡ ${st === "mobile" ? "Mobile" : "Desktop"} speed</b>\n\n` +
        `Score : <b>${sc}</b> ${sc >= 90 ? "🟢" : sc >= 50 ? "🟠" : "🔴"}\n` +
        `LCP : ${esc(v("largest-contentful-paint"))}\nCLS : ${esc(v("cumulative-layout-shift"))}\n` +
        `TBT : ${esc(v("total-blocking-time"))}\nSpeed Index : ${esc(v("speed-index"))}\n\n` +
        `<i>${key ? "" : "Key lagne par ye report zyada bharosemand hogi."}</i>`, MENUS.spd.k);
    } catch (e) {
      if (try_ === 2) return edit(env, mid, `❌ ${esc(String(e).slice(0, 200))}`, MENUS.spd.k);
    }
  }
}
async function doSite(env, mid) {
  await edit(env, mid, "⏳ …");
  const us = ["/", "/percentage-calculator", "/sitemap.xml", "/contact", "/bigha-converter"];
  let t = "<b>Live site check</b>\n\n";
  for (const u of us) {
    try { const t0 = Date.now(); const r = await fetch(SITE + u, { cf: { cacheTtl: 0 } });
      t += `${r.ok ? "✅" : "❌"} <code>${u}</code> — ${r.status} · ${Date.now() - t0}ms\n`;
    } catch { t += `❌ <code>${u}</code>\n`; }
  }
  await edit(env, mid, t, MENUS.spd.k);
}
async function doStatus(env, mid) {
  const r = await gh(env, `/repos/${env.GH_REPO}/actions/runs?per_page=5`);
  const ic = { success: "✅", failure: "❌", cancelled: "⚪", in_progress: "⏳", queued: "⏳" };
  const t = "<b>Pichhle 5 run</b>\n\n" + (r.data?.workflow_runs || []).map((x) => {
    const s = x.status === "completed" ? x.conclusion : x.status;
    return `${ic[s] || "•"} ${esc(x.name)} #${x.run_number} — ${esc(s)}, ${ago(x.updated_at)} pehle`; }).join("\n");
  await edit(env, mid, t, MENUS.dep.k);
}
async function doPages(env, mid) {
  const r = await gh(env, `/repos/${env.GH_REPO}/contents/site`);
  const f = r.data || [];
  const h = f.filter((x) => x.name.endsWith(".html")).length;
  const i = f.filter((x) => /\.(webp|png)$/.test(x.name)).length;
  let sm = 0; try { sm = ((await (await fetch(SITE + "/sitemap.xml")).text()).match(/<loc>/g) || []).length; } catch {}
  await edit(env, mid, `<b>Site ka hisaab</b>\n\nHTML : <b>${h}</b>\nImages : <b>${i}</b>\nKul files : <b>${f.length}</b>\nSitemap URL : <b>${sm}</b>`, MENUS.file.k);
}
async function doState(env, mid, key, title) {
  const r = await gh(env, `/repos/${env.GH_REPO}/contents/state/daily.json`);
  if (!r.ok) return edit(env, mid, "Abhi koi report nahi bani. Pehle daily scan chalayein.", MENUS.file.k);
  const d = JSON.parse(atob(r.data?.content?.replace(/\n/g, "") || ""));
  const arr = d[key] || [];
  if (!arr.length) return edit(env, mid, `${title}: koi nahi ✅`, MENUS.file.k);
  await edit(env, mid, `<b>${title}</b> (${arr.length})\n\n` + arr.slice(0, 30).map((x) => `<code>${esc(x)}</code>`).join("\n"),
    key === "unused" ? kb([[{ text: "🗑 Sab hatao", callback_data: "rm_unused" }], back]) : MENUS.file.k);
}
/** Ek URL Google me index hua ya nahi — roz ke Request Indexing ke kaam ka */
/** Sitemap seedha Google ko — pehle ye sirf daily scan chalata tha */
async function doSitemap(env, mid) {
  await edit(env, mid, "⏳ Google ko sitemap bhej raha hoon…");
  try {
    const tok = await googleToken(env, SCOPE_GSC);
    const feed = encodeURIComponent(SITE + "/sitemap.xml");
    const site = encodeURIComponent(env.GSC_PROPERTY);
    const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${feed}`,
      { method: "PUT", headers: { Authorization: "Bearer " + tok } });
    if (!r.ok) return edit(env, mid, `❌ Sitemap submit nahi hua — ${r.status}`, MENUS.idx.k);
    const g = await gapi(env, `https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${feed}`, SCOPE_GSC);
    await edit(env, mid,
      `✅ <b>Sitemap Google ko bhej diya</b>\n\nURL : <b>${esc(g.contents?.[0]?.submitted || "?")}</b>\n` +
      `Aakhri baar padha : ${g.lastDownloaded ? ago(g.lastDownloaded) + " pehle" : "abhi tak nahi"}\n` +
      `Warning : ${esc(g.warnings ?? 0)}   Error : ${esc(g.errors ?? 0)}`, MENUS.idx.k);
  } catch (e) { await edit(env, mid, `❌ ${esc(String(e).slice(0, 250))}`, MENUS.idx.k); }
}
async function doInspect(env, mid, u) {
  try {
    let full = u.trim();
    if (!/^https?:/i.test(full)) full = SITE + (full.startsWith("/") ? full : "/" + full);
    const r = await gapi(env, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      SCOPE_GSC, { inspectionUrl: full, siteUrl: env.GSC_PROPERTY, languageCode: "en" });
    const x = r.inspectionResult?.indexStatusResult || {};
    const ok = x.verdict === "PASS";
    await edit(env, mid,
      `<b>${ok ? "🟢 Index hai" : "🔴 Index nahi hai"}</b>\n<code>${esc(full)}</code>\n\n` +
      `Haal : ${esc(x.coverageState || "?")}\n` +
      `Aakhri crawl : ${x.lastCrawlTime ? ago(x.lastCrawlTime) + " pehle" : "kabhi nahi"}\n` +
      `Google ka canonical : <code>${esc((x.googleCanonical || "-").replace(SITE, "") || "/")}</code>\n` +
      `Kahan se mila : ${esc(x.robotsTxtState || "?")}\n\n` +
      (ok ? "<i>Kuch karne ki zaroorat nahi.</i>"
          : "<i>GSC kholkar isi URL par Request Indexing dabaiye.</i>"), MAIN);
  } catch (e) { await edit(env, mid, `❌ ${esc(String(e).slice(0, 250))}`, MAIN); }
}
/** Bot khud apna haal batata hai — kya-kya chalu hai, aakhri kaam kab hua */
/** Aaj (ya N din me) site par kya-kya badla — GitHub ke commit se */
async function doChanges(env, mid, days) {
  await edit(env, mid, "⏳ dekh raha hoon…");
  const since = new Date(Date.now() - days * 864e5 + 330 * 6e4);
  since.setUTCHours(0, 0, 0, 0);
  const r = await gh(env, `/repos/${env.GH_REPO}/commits?since=${since.toISOString()}&per_page=60`);
  if (!r.ok) return edit(env, mid, `❌ GitHub se jawab nahi mila (${r.status})`, MAIN);
  const list = (r.data || []).filter((c) => !/^(daily|watch|pending) state/i.test(c.commit?.message || ""));
  if (!list.length)
    return edit(env, mid, `<b>📝 ${days === 1 ? "Aaj" : days + " din me"}</b>\n\nAbhi tak koi badlaav nahi hua.\n<i>Site waisi hi hai jaisi pehle thi.</i>`, MAIN);
  let files = 0;
  const lines = list.map((c) => {
    const m = String(c.commit.message).split("\n")[0];
    const n = /(\d+)\s*file/.exec(m);
    if (n) files += +n[1];
    const t = new Date(c.commit.author.date);
    const hhmm = new Date(t.getTime() + 330 * 6e4).toISOString().slice(11, 16);
    return `• ${hhmm} — ${esc(m.slice(0, 60)).replace(/([\w-]+\.zip)/g, "<code>$1</code>")}`;
  });
  return edit(env, mid,
    `<b>📝 ${days === 1 ? "Aaj" : "Pichhle " + days + " din"} ka kaam</b>\n\n` +
    `Badlaav : <b>${list.length}</b>` + (files ? ` · file chadhayi : <b>${files}</b> <i>(kul upload, alag-alag page nahi)</i>` : "") + "\n\n" +
    lines.slice(0, 20).join("\n") + (lines.length > 20 ? `\n…aur ${lines.length - 20}` : "") +
    "\n\n<i>Live hua ya nahi, ye 🚀 Deploy → Pichhle 5 run se dekhiye.</i>", MAIN);
}


/** GSC me sitemap ka asli haal — kitne URL, kab padha, kitne error */
/** Bing ka poora sach — kya apne aap hota hai, kya haath se */
async function doBing(env, mid) {
  await edit(env, mid, "⏳ …");
  let last = "?";
  try {
    const r = await gh(env, `/repos/${env.GH_REPO}/actions/workflows/deploy.yml/runs?per_page=1`);
    const x = r.data?.workflow_runs?.[0];
    if (x) last = `${x.conclusion === "success" ? "✅" : "❌"} ${ago(x.updated_at)} pehle`;
  } catch {}
  return edit(env, mid,
    "<b>🅱️ Bing ka haal</b>\n\n" +
    "<b>Jo apne aap hota hai</b>\n" +
    "✅ <b>IndexNow</b> — har deploy par saare badle URL Bing, Yandex, Naver aur Seznam ko chale jaate hain.\n" +
    `   Aakhri deploy: ${last}\n` +
    "✅ robots.txt me sitemap ki line — Bing khud padhta rehta hai.\n\n" +
    "<b>Jo apne aap NAHI ho sakta — aur kyun</b>\n" +
    "Bing ne sitemap ka <b>ping band kar diya hai</b> (2022 se). Google ne bhi 2023 me band kiya. " +
    "Ab koi bhi tool apne aap Bing ko sitemap nahi bhej sakta — ye Bing ne jaan-boojh kar band kiya, spam rokne ke liye.\n\n" +
    "Isliye Bing me sitemap <b>ek baar haath se</b> submit karna hota hai. Uske baad Bing khud roz padhta rehta hai — " +
    "dobara submit karne ki zaroorat nahi.\n\n" +
    "<b>Jaanchne ki jagah</b>\n" +
    "bing.com/webmasters → <b>IndexNow</b> — wahan roz ke bheje hue URL dikhte hain. Sitemap ki tareekh purani ho to koi baat nahi.",
    MAIN);
}

async function doSitemapStatus(env, mid) {
  await edit(env, mid, "⏳ Google se sitemap ka haal…");
  try {
    const site = encodeURIComponent(env.GSC_PROPERTY);
    const feed = encodeURIComponent(SITE + "/sitemap.xml");
    const g = await gapi(env, `https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${feed}`, SCOPE_GSC);
    const c = (g.contents || [{}])[0];
    return edit(env, mid,
      `<b>🗺 Sitemap ka haal</b>\n\n` +
      `URL sitemap me : <b>${esc(c.submitted ?? "?")}</b>\n` +
      `Google ne index kiye : <b>${esc(c.indexed ?? "batata nahi")}</b>\n` +
      `Aakhri baar submit : ${g.lastSubmitted ? ago(g.lastSubmitted) + " pehle" : "?"}\n` +
      `Aakhri baar padha : ${g.lastDownloaded ? ago(g.lastDownloaded) + " pehle" : "abhi tak nahi"}\n` +
      `Warning : ${esc(g.warnings ?? 0)}   Error : <b>${esc(g.errors ?? 0)}</b>\n\n` +
      (Number(g.errors) ? "🔴 Error hai — sitemap jaanchiye." : "🟢 Sitemap theek hai.") +
      "\n<i>Ab har deploy par ye apne aap Google aur Bing dono ko chala jaata hai.</i>", MENUS.idx.k);
  } catch (e) { return edit(env, mid, `❌ ${esc(String(e).slice(0, 200))}`, MENUS.idx.k); }
}

/** Wo queries jinpar dikh rahe hain par click nahi — sabse tez sudhaar ka mauka */
async function doOpportunity(env, mid) {
  await edit(env, mid, "⏳ mauke dhoondh raha hoon…");
  try {
    const r = await gscQuery(env, 28, 0, ["query"], 200);
    const rows = (r.rows || [])
      .filter((x) => x.impressions >= 5 && x.position >= 5 && x.position <= 30)
      .sort((a, b) => b.impressions - a.impressions).slice(0, 12);
    if (!rows.length) return edit(env, mid, "Abhi itna data nahi hai ki mauka bataya ja sake.\nKuch hafte aur rukiye.", MAIN);
    let t = "<b>🎯 Sabse bade mauke — 28 din</b>\n<i>Ye query dikh rahi hain par click kam. Position 5-30 matlab thoda dhakka kaafi hai.</i>\n\n";
    rows.forEach((x, i) => {
      t += `${i + 1}. <code>${esc(String(x.keys[0]).slice(0, 44))}</code>\n` +
           `   ${x.impressions} impr · ${x.clicks} click · position <b>${Number(x.position).toFixed(1)}</b>\n`;
    });
    t += "\n<b>Kya kariye:</b> in me se jo shabd hain, unhe hu-ba-hu us page ke FAQ ka sawaal bana dijiye. " +
         "Position 8-20 wali query par yahi sabse tez kaam karta hai.";
    return edit(env, mid, t, MAIN);
  } catch (e) { return edit(env, mid, `❌ ${esc(String(e).slice(0, 200))}`, MAIN); }
}

/** Jo page abhi index nahi hue, unhe ek-ek karke Google se poochho */
/** Sabse naye page Google se ABHI poochho — record ka intezaar nahi */
async function doFreshCheck(env, mid) {
  await edit(env, mid, "⏳ Google se abhi ka sach poochh raha hoon… (10-20 second)");
  let urls = [];
  try {
    const r = await gh(env, `/repos/${env.GH_REPO}/contents/site/sitemap.xml`);
    if (!r.ok) throw new Error(r.data?.raw || ("GitHub " + r.status));
    const sm = atob(r.data.content.replace(/\n/g, ""));
    const rows = [...sm.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([\d-]+)<\/lastmod>/g)].map((m) => [m[1], m[2]]);
    rows.sort((a, b) => (a[1] < b[1] ? 1 : -1));          // sabse naya pehle
    urls = rows.slice(0, 6).map((x) => x[0]);
  } catch (e) { return edit(env, mid, `❌ sitemap nahi padh paaya — ${esc(String(e).slice(0, 120))}`, MAIN); }

  // PEHLE: ek-ek karke poochta tha, 6 URL me 60-90 second lag jaate the aur bot atak jaata tha.
  // AB: sab ek saath (Promise.all), har ek par apna 15s ka timeout. Kul 15-20 second.
  const res = await Promise.all(urls.map(async (u) => {
    try {
      const x = await gapi(env, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        SCOPE_GSC, { inspectionUrl: u, siteUrl: env.GSC_PROPERTY, languageCode: "en" }, 15000);
      const i2 = x.inspectionResult?.indexStatusResult || {};
      return { u, ok: i2.verdict === "PASS", why: i2.coverageState || "?", crawl: i2.lastCrawlTime };
    } catch (e) { return { u, err: String(e).slice(0, 60) }; }
  }));

  const pass = res.filter((r) => r.ok).length;
  const fail = res.filter((r) => r.err).length;
  const lines = res.map((r) => r.err
    ? `⚪ <code>${esc(r.u.replace(SITE, "") || "/")}</code>\n   ${esc(r.err)}`
    : `${r.ok ? "🟢" : "🔴"} <code>${esc(r.u.replace(SITE, "") || "/")}</code>\n   ${esc(String(r.why).slice(0, 46))}` +
      (r.crawl ? ` · crawl ${ago(r.crawl)} pehle` : ""));

  return edit(env, mid,
    `<b>🔎 Abhi ka sach — sabse naye ${urls.length} page</b>\n` +
    `<i>Seedha Google se poochha gaya, kisi purane record se nahi.</i>\n\n` +
    `${lines.join("\n")}\n\n` +
    `Index : <b>${pass}</b> / ${urls.length}` + (fail ? ` · jaanch nahi hui : ${fail}` : "") + "\n\n" +
    `<i>Ek baar me 6 se zyada nahi poochh sakta (Cloudflare ki seema). ` +
    `Poori site ka taaza hisaab chahiye to <b>poora scan</b> — 262 URL, 3-5 minute.</i>`, MAIN);
}

async function doCheckPending(env, mid) {
  await edit(env, mid, "⏳ bache hue URL Google se jaanch raha hoon…");
  const r = await gh(env, `/repos/${env.GH_REPO}/contents/state/daily.json`);
  if (!r.ok) return edit(env, mid, "Record nahi mila. Pehle 📑 Indexing → Poora scan chalayein.", MAIN);
  let d = {}; try { d = JSON.parse(atob(r.data?.content?.replace(/\n/g, "") || "")); } catch {}
  const pend = Object.entries(d.status || {}).filter(([, v]) => v && !v.ok).map(([u]) => u).slice(0, 6);
  if (!pend.length) return edit(env, mid, "🟢 <b>Sab page index hain.</b>\nKuch jaanchne ko nahi bacha.", MAIN);
  const res = await Promise.all(pend.map(async (u) => {
    try {
      const x = await gapi(env, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        SCOPE_GSC, { inspectionUrl: u, siteUrl: env.GSC_PROPERTY, languageCode: "en" }, 15000);
      const i = x.inspectionResult?.indexStatusResult || {};
      return `${i.verdict === "PASS" ? "🟢" : "🔴"} <code>${esc(u.replace(SITE, ""))}</code>\n   ${esc(i.coverageState || "?")}` +
             (i.lastCrawlTime ? ` · crawl ${ago(i.lastCrawlTime)} pehle` : " · abhi tak crawl nahi");
    } catch (e) { return `⚪ <code>${esc(u.replace(SITE, ""))}</code> — jaanch nahi ho payi`; }
  }));
  const out = res;
  return edit(env, mid, `<b>🔍 Bache hue URL ka taaza haal</b>\n\n${out.join("\n")}\n\n` +
    `<i>Google ka apna record 2-3 din peeche chalta hai. "abhi tak crawl nahi" ka matlab hai ki wo aaya hi nahi — ` +
    `wahan content se zyada backlink kaam karta hai.</i>`, MAIN);
}

/** Site par toote link — bahari aur andar ke, dono */
async function doLinkCheck(env, mid) {
  await edit(env, mid, "⏳ link jaanch raha hoon (thoda samay lagega)…");
  const r = await gh(env, `/repos/${env.GH_REPO}/contents/site`);
  if (!r.ok) return edit(env, mid, "Repo se file list nahi mili.", MAIN);
  const have = new Set((r.data || []).map((x) => x.name));
  const idx = await gh(env, `/repos/${env.GH_REPO}/contents/site/sitemap.xml`);
  let dead = [];
  try {
    const sm = atob(idx.data.content.replace(/\n/g, ""));
    const slugs = [...sm.matchAll(/<loc>[^<]*sabhisaab\.com\/([^<]*)<\/loc>/g)].map((m) => m[1]);
    dead = slugs.filter((s) => s && !have.has(s + ".html"));
  } catch {}
  return edit(env, mid,
    `<b>🔗 Link ki jaanch</b>\n\n` +
    `site/ me file : <b>${have.size}</b>\n` +
    `sitemap ka URL jiski file nahi : <b>${dead.length}</b>\n` +
    (dead.length ? dead.slice(0, 10).map((x) => "• <code>" + esc(x) + "</code>").join("\n") : "🟢 sab theek") +
    `\n\n<i>Poori jaanch (har page ke andar ke link) audit karta hai — 🛠 Audit chalao.</i>`, MAIN);
}

async function doBotStatus(env, mid) {
  await edit(env, mid, "⏳ apna haal dekh raha hoon…");
  const o = [];
  const f = await siteFacts(env);
  o.push("<b>🤖 Bot ka haal</b>\n");
  o.push(`<b>Site</b>\nIndexed ${f.indexed} · baaki ${f.pending} · audit ERROR ${f.err}, WARNING ${f.warn}`);
  o.push(`GSC: 1 din ${f.c1} click · 7 din ${f.c7} click, ${f.i7} impression\n`);
  o.push("<b>Kya-kya chalu hai</b>");
  o.push((env.GEMINI_KEY || "").trim() ? "✅ Gemini (baat-cheet)" : "🟠 Gemini key nahi");
  o.push((env.PSI_KEY || "").trim() ? "✅ PageSpeed key" : "🟠 PageSpeed key nahi");
  o.push("✅ GSC · ✅ GA4 · ✅ GitHub · ✅ Cloudflare");
  o.push(`✅ ZIP me ${MAX_FILES} file tak — isse zyada par pehle hi mana kar dunga\n`);
  try {
    const wf = ["daily.yml", "watch.yml", "deploy.yml", "bot.yml"];
    const names = { "daily.yml": "Roz ki report", "watch.yml": "Chaukidaar", "deploy.yml": "Deploy", "bot.yml": "Bot update" };
    const rs = await Promise.all(wf.map((w) => gh(env, `/repos/${env.GH_REPO}/actions/workflows/${w}/runs?per_page=1`)));
    o.push("<b>Aakhri baar kab chala</b>");
    rs.forEach((r, i) => {
      const x = r.data?.workflow_runs?.[0];
      o.push(x ? `${x.conclusion === "success" ? "✅" : "❌"} ${names[wf[i]]} — ${ago(x.updated_at)} pehle`
                : `• ${names[wf[i]]} — abhi tak nahi`);
    });
  } catch {}
  o.push("\n<i>Kuch bhi poochh sakte hain — jaise \"aaj kaisa raha\", \"kitne index hue\", \"speed batao\".</i>");
  return edit(env, mid, o.join("\n"), MAIN);
}

async function doAuditLast(env, mid) {
  const r = await gh(env, `/repos/${env.GH_REPO}/contents/state/daily.json`);
  if (!r.ok) return edit(env, mid, "Abhi tak koi audit ka record nahi. \"Audit chalao\" dabaiye.", MENUS.aud.k);
  let d = {}; try { d = JSON.parse(atob(r.data.content.replace(/\n/g, ""))); } catch {}
  const e = d.aud_e, w = d.aud_w;
  if (e == null) return edit(env, mid, "Record me audit ka number nahi mila. \"Audit chalao\" dabaiye.", MENUS.aud.k);
  const wf = await gh(env, `/repos/${env.GH_REPO}/actions/workflows/audit.yml/runs?per_page=1`);
  const last = wf.data?.workflow_runs?.[0];
  return edit(env, mid,
    `<b>🛠 Pichhla audit</b>\n\nERROR : <b>${e}</b> ${e === 0 ? "🟢" : "🔴"}\nWARNING : <b>${w == null ? "?" : w}</b>\n` +
    `Record ki tareekh : ${esc(d.day || "?")}\n` +
    (last ? `Aakhri audit run : ${esc(last.conclusion || last.status)}, ${ago(last.updated_at)} pehle` : "") +
    `\n\n<i>ERROR 0 na ho to deploy apne aap ruk jaata hai.</i>`, MENUS.aud.k);
}
async function doHealth(env, mid) {
  const o = [];
  const a = await gh(env, `/repos/${env.GH_REPO}`);
  o.push(a.ok ? "✅ GitHub token" : `❌ GitHub token — ${a.status}`);
  try { const r = await fetch(SITE + "/sitemap.xml"); o.push(r.ok ? "✅ Live site" : `❌ Live site — ${r.status}`); }
  catch { o.push("❌ Live site"); }
  try { await gapi(env, `https://searchconsole.googleapis.com/webmasters/v3/sites`, SCOPE_GSC); o.push("✅ Google Search Console key"); }
  catch (e) { o.push(`❌ GSC key — ${esc(String(e).slice(0, 60))}`); }
  if (env.GA4_ID) { try { await ga4rt(env, { metrics: [{ name: "activeUsers" }] }); o.push("✅ GA4 key"); }
    catch (e) { o.push(`❌ GA4 — ${esc(String(e).slice(0, 60))}`); } }
  const s = await gh(env, `/repos/${env.GH_REPO}/actions/runs?per_page=1`);
  const x = s.data?.workflow_runs?.[0];
  if (x) o.push(`${x.conclusion === "success" ? "✅" : "❌"} Aakhri run — ${esc(x.name)}: ${esc(x.conclusion || x.status)}`);
  if ((env.GEMINI_KEY || "").trim()) {
    const t0 = Date.now();
    const g = await gemini(env, "Sirf ye shabd lauta do: OK", "test", 20);
    if (g) o.push(`✅ AI — Gemini chal raha hai · <code>${esc(GEM_MODEL)}</code> · ${Date.now() - t0}ms`);
    else {
      const list = await geminiModels((env.GEMINI_KEY || "").trim());
      o.push("🔴 Gemini nahi chali\n   Wajah: <code>" + esc(String(GEM_ERR).slice(0, 160)) + "</code>");
      o.push(list.length
        ? "   Is key par ye model milte hain:\n   <code>" + esc(list.slice(0, 12).join(", ")) + "</code>"
        : "   Is key par ek bhi model nahi mila — key galat hai ya API enable nahi hui.");
    }
  } else o.push(env.AI ? "🟠 AI — sirf Cloudflare ka chhota model (Gemini key nahi lagi)" : "❌ AI band hai");
  o.push((env.PSI_KEY || "").trim() ? "✅ PageSpeed key lagi hai" : "🟠 PageSpeed key nahi — speed report adhoori aayegi");
  await edit(env, mid, "<b>❤️ Jaanch</b>\n\n" + o.join("\n"), MAIN);
}
async function doCf(env, mid, what) {
  if (!env.CF_TOKEN) return edit(env, mid, "Cloudflare token bot me nahi laga.", MENUS.cf.k);
  try {
    if (what === "pages") {
      const d = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCT}/pages/projects`,
        { headers: { Authorization: "Bearer " + env.CF_TOKEN } })).json();
      const p = (d.result || []).find((x) => x.name === "sabhisaab") || {};
      const dep = p.latest_deployment || {};
      return edit(env, mid, `<b>Cloudflare Pages</b>\n\nProject : ${p.name}\nBranch : ${p.production_branch}\nAakhri deploy : ${dep.created_on ? ago(dep.created_on) + " pehle" : "?"}\nStatus : ${dep.latest_stage?.status || "?"}`, MENUS.cf.k);
    }
    if (what === "purge") {
      const z = await (await fetch(`https://api.cloudflare.com/client/v4/zones?name=sabhisaab.com`,
        { headers: { Authorization: "Bearer " + env.CF_TOKEN } })).json();
      if (!z.success)
        return edit(env, mid, "❌ Zone ki list nahi mili.\n\nToken me <b>Zone → Zone → Read</b> permission chahiye.\n" + CF_HOWTO, MENUS.cf.k);
      const id = z.result?.[0]?.id;
      if (!id) return edit(env, mid, "Zone nahi mila. Token ke <b>Zone Resources</b> me sabhisaab.com include kijiye.\n" + CF_HOWTO, MENUS.cf.k);
      const r = await (await fetch(`https://api.cloudflare.com/client/v4/zones/${id}/purge_cache`,
        { method: "POST", headers: { Authorization: "Bearer " + env.CF_TOKEN, "content-type": "application/json" },
          body: JSON.stringify({ purge_everything: true }) })).json();
      if (r.success) return edit(env, mid, "✅ Cache purge ho gaya", MENUS.cf.k);
      const code = r.errors?.[0]?.code;
      const msg = (code === 10000 || code === 9109 || code === 1012)
        ? "❌ Token me <b>Cache Purge</b> ki ijaazat nahi hai.\n\nYahi ek permission jodni hai:\n<code>Zone → Cache Purge → Purge</code>\n" + CF_HOWTO
        : `❌ Cloudflare: ${esc(r.errors?.[0]?.message || "pata nahi")}`;
      return edit(env, mid, msg, MENUS.cf.k);
    }
    if (what === "rb") {
      const d = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCT}/pages/projects/sabhisaab/deployments?per_page=12`,
        { headers: { Authorization: "Bearer " + env.CF_TOKEN } })).json();
      const ok = (d.result || []).filter((x) => x.environment === "production" && x.latest_stage?.status === "success");
      if (ok.length < 2) return edit(env, mid, "Pichhla theek deploy nahi mila.", MENUS.cf.k);
      const p = ok[1];
      return edit(env, mid,
        `<b>↩️ Purane version par wapas</b>\n\nAbhi live : ${ago(ok[0].created_on)} pehle\nJispar jaayenge : <b>${ago(p.created_on)} pehle</b> wala\n<i>${esc((p.deployment_trigger?.metadata?.commit_message || "").slice(0, 60))}</i>\n\nSirf tab dabaiye jab abhi wali site me kuch toota ho.`,
        kb([[{ text: "↩️ Haan, wapas le jao", callback_data: "cf:rbgo:" + p.id }], [{ text: "⬅️ Rehne do", callback_data: "m:cf" }]]));
    }
    if (what.startsWith("rbgo:")) {
      const id = what.slice(5);
      const r = await (await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCT}/pages/projects/sabhisaab/deployments/${id}/rollback`,
        { method: "POST", headers: { Authorization: "Bearer " + env.CF_TOKEN } })).json();
      return edit(env, mid, r.success ? "✅ Purane version par wapas aa gaye. Site kholkar dekh lijiye." : `❌ ${esc(r.errors?.[0]?.message || "nahi hua")}`, MENUS.cf.k);
    }
  } catch (e) { await edit(env, mid, `❌ ${esc(String(e).slice(0, 200))}`, MENUS.cf.k); }
}

// ---------- files in/out ----------
function routeOf(name) {
  const n = name.split("/").pop();
  if (/^(audit|publish|indexnow|gsc|lib|notify|bing_submit|gsc_report|daily)\.py$/i.test(n)) return "scripts/" + n;
  if (/\.(yml|yaml)$/i.test(n)) return ".github/workflows/" + n;
  if (/\.py$/i.test(n)) return "scripts/" + n;
  if (/^(index|google)\.js$|^wrangler\.toml$|^package(-lock)?\.json$/i.test(n)) return "worker/" + n;
  // bina extension wali site files — _headers, _redirects, googleXXXX verification
  if (/^_(headers|redirects|routes)$/i.test(n)) return "site/" + n;
  if (/^google[a-f0-9]{16}\.html$/i.test(n)) return "site/" + n;
  if (/\.(html|webp|png|jpg|jpeg|gif|xml|txt|json|js|ico|svg|webmanifest)$/i.test(n)) return "site/" + n;
  return null;
}

/** ZIP ki saari file EK hi commit me — warna har file par audit chal jaata hai */
/** GitHub par kai file ek hi commit me.
 *  Do seemayein dhyan me rakhi gayi hain:
 *  1) Cloudflare free plan me ek request se 50 se zyada bahari call nahi ho sakte.
 *     Har file = 1 call. Isi wajah se 60 file wali ZIP chup-chaap fail ho jaati thi.
 *     Ab 22 se zyada file ek baar me nahi lete — bache hue file agli ZIP me maangte hain.
 *  2) Do ZIP ek saath aayein to dono ek hi purana commit padhkar ek doosre ko mita deti thin.
 *     Ab ref update fail hone par dobara koshish hoti hai (naya base lekar). */
const MAX_FILES = 22;
let ZIP_BUSY = false;   // ek waqt me ek hi ZIP — do saath aayein to doosri ruk jaaye


/** ================= ZIP KA PEHLE-SE AUDIT =================
 *  Pehle bot har file aankh band karke chadha deta tha, aur galti audit gate par
 *  ya usse bhi aage pakdi jaati thi. Ab bot khud har HTML file jaanchta hai aur
 *  kami milne par CHADHATA HI NAHI — saaf batata hai ki kya theek karna hai.
 *  Google ki apni policy (structured-data spam, AdSense, misleading claims) bhi isi me hai. */

const LEGAL_PAGES = ["about", "author", "contact", "disclaimer", "privacy", "services", "terms"];
const HUB_PAGES = ["nivesh-calculators", "loan-tax-calculators", "rozana-calculators", "utility-tools",
                   "sehat-calculators", "trading-calculators", "converter-tools", "guides", "articles"];

function auditHtml(name, s) {
  const slug = String(name).split("/").pop().replace(/\.html$/i, "");
  const isLegal = LEGAL_PAGES.includes(slug);
  const isHub = HUB_PAGES.includes(slug);
  const isHome = slug === "index";
  const is404 = slug === "404";
  const P = [];                                   // rukawat — chadhega nahi
  const W = [];                                   // chetavni — chadh jaayega
  const body = (s.match(/<body[\s\S]*<\/body>/) || [""])[0]
    .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
  const text = body.replace(/<[^>]+>/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;

  // ---- Google ki policy (in par kabhi samjhauta nahi) ----
  if (/aggregateRating/.test(s)) P.push("aggregateRating hai — Google ki structured-data spam policy ka seedha ullanghan. Manual action + AdSense ban ka khatra.");
  if (/adsbygoogle/.test(s)) P.push("adsbygoogle ka code hai — AdSense approval se pehle ye nahi lagna chahiye.");
  if (/\b(guaranteed|risk-free)\b/i.test(text) && !/nahi/i.test(text)) P.push("'guaranteed' ya 'risk-free' likha hai bina 'nahi' ke — paise wale page par ye misleading claim hai.");
  if (/\d[\d,]*\s*(log|people)\s*(padh|read)/i.test(text)) P.push("'itne log padh chuke' jaisa counter hai — jhoothi social proof, AdSense review me pakdi jaati hai.");

  // ---- URL aur canonical ----
  if (/href="\/[a-z0-9-]+\.html"/.test(s)) P.push("andar koi link .html par jaa raha hai — canonical clean URL hi hona chahiye.");
  if (/href="[^"]*\?t=/.test(s)) P.push("purana ?t= wala link hai.");
  const can = s.match(/<link rel="canonical" href="([^"]*)"/);
  if (!can && !is404) P.push("canonical tag hi nahi hai.");
  else if (can && !/^https:\/\/sabhisaab\.com\/[a-z0-9-]*$/.test(can[1])) P.push("canonical galat hai: " + can[1]);
  const ogu = s.match(/property="og:url" content="([^"]*)"/);
  if (can && ogu && can[1] !== ogu[1]) P.push("og:url canonical se match nahi karta.");

  // ---- head ke zaroori tag ----
  const t = s.match(/<title>([\s\S]*?)<\/title>/);
  if (!t) P.push("title hi nahi hai.");
  else if (t[1].trim().length > 60) P.push(`title ${t[1].trim().length} character ka hai — 60 se kam hona chahiye.`);
  const d = s.match(/name="description" content="([^"]*)"/);
  if (!d) P.push("meta description nahi hai.");
  else if (d[1].length < 95 || d[1].length > 165) P.push(`description ${d[1].length} character ka hai — 95 se 165 ke beech hona chahiye.`);
  if (!/lang="hi-Latn"/.test(s)) P.push('lang="hi-Latn" nahi hai.');
  if (!/G-QX5MWV42TR/.test(s) && !is404) P.push("GA4 ka code nahi hai.");
  if (!/shConsent/.test(s) && !is404) P.push("cookie consent banner nahi hai — privacy niyam aur AdSense dono ki shart.");

  // ---- schema ----
  const blocks = [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  // FAQ nahi hai to FAQPage schema bhi nahi hoga — tab 2 block hi theek hain
  const hasFaq = /<details/.test(body);
  const needBlocks = is404 ? 0 : (isLegal || isHub || isHome || !hasFaq) ? 2 : 3;
  if (blocks.length < needBlocks)
    P.push(`sirf ${blocks.length} JSON-LD block hain — is page par kam se kam ${needBlocks} chahiye.`);
  let faqSchema = null;
  blocks.forEach((b, i) => {
    try { const j = JSON.parse(b); if (JSON.stringify(j).includes('"FAQPage"')) faqSchema = j; }
    catch (e) { P.push(`JSON-LD block ${i + 1} toota hua hai (JSON valid nahi).`); }
  });
  if (!/BreadcrumbList/.test(s) && !isHome && !is404) P.push("BreadcrumbList schema nahi hai.");

  // ---- FAQ page se match ----
  const unesc = (x) => String(x).replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013")
    .replace(/&middot;/g, "\u00b7").replace(/&times;/g, "\u00d7").replace(/&divide;/g, "\u00f7")
    .replace(/&minus;/g, "\u2212").replace(/&rarr;/g, "\u2192").replace(/&harr;/g, "\u2194")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ").trim();
  const dets = [...body.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => unesc(m[1]));
  if (dets.length && dets.length < 4) W.push(`sirf ${dets.length} FAQ hain — 4-6 rakhna behtar hai.`);
  if (faqSchema) {
    const q = (faqSchema.mainEntity || []).map((x) => unesc(x.name));
    if (q.join("|") !== dets.join("|")) P.push("FAQ schema page ke sawaalon se match nahi karta — Google ise galat data maanta hai.");
  } else if (dets.length) P.push("page par FAQ hain par FAQPage schema nahi hai.");
  if (new Set(dets).size !== dets.length) P.push("ek hi page par do FAQ ek jaise hain.");

  // ---- content ----
  if (words < 1000 && !isLegal && !is404) P.push(`sirf ${words} shabd hain — 1000 se zyada chahiye.`);
  if (!/<table/.test(body) && !isLegal && !is404 && !isHome) W.push("koi table nahi — featured snippet ka mauka chhoot raha hai.");
  const h1 = (body.match(/<h1/g) || []).length;
  if (h1 !== 1) P.push(`H1 ${h1} hain — theek 1 hona chahiye.`);
  const h2 = [...body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  if (new Set(h2).size !== h2.length) P.push("do H2 ek jaise hain.");
  if (/[a-zA-Z][\u0900-\u097F]|[\u0900-\u097F][a-zA-Z]/.test(text)) P.push("Hinglish me Devanagari akshar mila hua hai (jaise 'kुch').");

  // ---- TOC ----
  const toc = body.match(/<div class="tocbox">[\s\S]*?<\/div>/);
  if (toc) {
    const have = [...toc[0].matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]);
    const ids = [...body.matchAll(/<h2 id="([a-z0-9-]+)"/g)].map((m) => m[1]);
    const miss = ids.filter((x) => !have.includes(x));
    if (miss.length) P.push("ye H2 TOC me nahi hain: " + miss.join(", "));
  }

  // ---- perf / policy ----
  if (!/install-app\.js/.test(s) && !is404) P.push("install-app.js ka tag nahi hai.");
  if (/<input[^>]*type="number"/.test(s) && !/inputmode/.test(s)) P.push("number wale input par inputmode nahi — phone par galat keyboard khulega.");
  const ext = [...s.matchAll(/<a [^>]*href="https?:\/\/(?!sabhisaab)[^"]*"[^>]*>/g)].map((m) => m[0]);
  if (ext.some((a) => !/noopener/.test(a))) P.push("bahari link par rel=\"noopener\" nahi hai.");
  const bad = /\b(15[0-9]|16[0-9]|17[0-9]|18[0-2])\b[^0-9]{0,20}(tool|calculator)/i.exec(s);
  if (bad) W.push(`purani tool ginti likhi lagti hai (${bad[1]}) — abhi 183 hai.`);
  if (/FY 2025-26|AY 2026-27/.test(s)) W.push("purana FY 2025-26 label hai.");

  return { P, W, words };
}

function zipAuditReport(files) {
  const html = files.filter(([p]) => /\.html$/i.test(p) && !/googleb[a-f0-9]{16}\.html/.test(p));
  if (!html.length) return null;
  const rep = [];
  for (const [path, bytes] of html) {
    let txt = "";
    try { txt = new TextDecoder("utf-8").decode(bytes); } catch { continue; }
    const r = auditHtml(path, txt);
    if (r.P.length || r.W.length) rep.push([path.split("/").pop(), r]);
  }
  return rep;
}

async function putMany(env, files, msg) {
  const R = `/repos/${env.GH_REPO}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ref = await gh(env, `${R}/git/ref/heads/main`);
    if (!ref.ok) return { ok: false, err: `ref ${ref.status}` };
    const baseSha = ref.data.object.sha;
    const baseCommit = await gh(env, `${R}/git/commits/${baseSha}`);
    if (!baseCommit.ok) return { ok: false, err: `commit ${baseCommit.status}` };

    const tree = [];
    for (let i = 0; i < files.length; i += 4) {
      const part = files.slice(i, i + 4);
      const res = await Promise.all(part.map(([path, bytes]) =>
        gh(env, `${R}/git/blobs`, { method: "POST",
          body: JSON.stringify({ content: b64(bytes), encoding: "base64" }) })));
      for (let k = 0; k < part.length; k++) {
        if (!res[k].ok) return { ok: false, err: `blob ${part[k][0]} ${res[k].status}` };
        tree.push({ path: part[k][0], mode: "100644", type: "blob", sha: res[k].data.sha });
      }
    }
    const nt = await gh(env, `${R}/git/trees`, {
      method: "POST", body: JSON.stringify({ base_tree: baseCommit.data.tree.sha, tree }) });
    if (!nt.ok) return { ok: false, err: `tree ${nt.status}` };

    const nc = await gh(env, `${R}/git/commits`, {
      method: "POST", body: JSON.stringify({ message: msg, tree: nt.data.sha, parents: [baseSha] }) });
    if (!nc.ok) return { ok: false, err: `newcommit ${nc.status}` };

    const upd = await gh(env, `${R}/git/refs/heads/main`, {
      method: "PATCH", body: JSON.stringify({ sha: nc.data.sha }) });
    if (upd.ok) return { ok: true, err: null };
    if (attempt === 3) return { ok: false, err: `ref-update ${upd.status}` };
    await new Promise((r) => setTimeout(r, 1200 * attempt));   // koi aur ZIP chadh gayi — dobara
  }
  return { ok: false, err: "ref-update" };
}

async function putFile(env, path, bytes, msg) {
  const cur = await gh(env, `/repos/${env.GH_REPO}/contents/${path}`);
  const sha = cur.ok ? cur.data.sha : undefined;
  const r = await gh(env, `/repos/${env.GH_REPO}/contents/${path}`,
    { method: "PUT", body: JSON.stringify({ message: msg, content: b64(bytes), sha, branch: "main" }) });
  return { ok: r.ok, status: r.status, updated: !!sha };
}
async function sendFile(env, name) {
  for (const p of [`site/${name}`, `scripts/${name}`, `.github/workflows/${name}`, name]) {
    const r = await gh(env, `/repos/${env.GH_REPO}/contents/${p}`);
    if (!r.ok) continue;
    const bin = Uint8Array.from(atob(r.data.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append("chat_id", env.TG_CHAT);
    fd.append("caption", `<code>${p}</code>`);
    fd.append("parse_mode", "HTML");
    fd.append("document", new Blob([bin]), name);
    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendDocument`, { method: "POST", body: fd });
    return true;
  }
  return false;
}
async function delFiles(env, names) {
  let ok = 0;
  for (const nm of names.slice(0, 40)) {
    const p = `site/${nm}`;
    const c = await gh(env, `/repos/${env.GH_REPO}/contents/${p}`);
    if (!c.ok) continue;
    const r = await gh(env, `/repos/${env.GH_REPO}/contents/${p}`,
      { method: "DELETE", body: JSON.stringify({ message: `faltu file hatai: ${nm}`, sha: c.data.sha, branch: "main" }) });
    if (r.ok) ok++;
  }
  return ok;
}
async function handleDoc(env, doc) {
  const name = doc.file_name || "";
  if (doc.file_size > 18e6) return say(env, "File 18 MB se badi hai.");
  const f = await tgApi(env, "getFile", { file_id: doc.file_id });
  if (!f.ok) return say(env, "Download nahi hui.");
  const bytes = new Uint8Array(await (await fetch(`https://api.telegram.org/file/bot${env.TG_TOKEN}/${f.result.file_path}`)).arrayBuffer());
  const btn = kb([[{ text: "🚀 Abhi deploy karein", callback_data: "d:badle-hue" }]]);

  if (/\.zip$/i.test(name)) {
    let files; try { files = unzipSync(bytes); } catch (e) { return say(env, `ZIP nahi khuli: ${esc(String(e).slice(0,120))}`); }
    const batch = [], skip = [];
    for (const [p, data] of Object.entries(files)) {
      if (!data.length || p.endsWith("/")) continue;
      const t = routeOf(p); if (!t) { skip.push(p.split("/").pop()); continue; }
      batch.push([t, data]);
    }
    if (!batch.length) return say(env, `ZIP me koi pehchani file nahi mili.\n⚪ chhodi: ${skip.slice(0,10).join(", ")}`);
    if (batch.length > MAX_FILES)
      return say(env,
        `⚠️ <b>Is ZIP me ${batch.length} file hain — itni ek saath nahi chadh sakti.</b>\n\n` +
        `Cloudflare ek baar me sirf ${MAX_FILES} file tak hi bhej paata hai. ` +
        `Isse zyada par kaam beech me ruk jaata hai aur GitHub par kuch nahi pahunchta — ` +
        `pehle aisa chup-chaap hota tha, ab main pehle hi bata deta hoon.\n\n` +
        `<b>ZIP ko ${Math.ceil(batch.length / MAX_FILES)} hisson me</b> (har ek me ${MAX_FILES} ya usse kam file) ` +
        `banwa kar ek-ek karke bhejiye. Har ZIP ke baad ✅ ka intezaar kijiye.`);

    if (ZIP_BUSY) return say(env, "⏳ <b>Ek ZIP pehle se chadh rahi hai.</b>\nUska ✅ aane dijiye, phir agli bhejiye — warna dono ek doosre ko mita sakti hain.");

    // ---- chadhane se PEHLE khud audit ----
    if (!/-force\b/i.test(name)) {
      let rep = [];
      try { rep = zipAuditReport(batch) || []; }
      catch (e) { rep = []; }
      const stop = rep.filter(([, r]) => r.P.length);
      if (stop.length) {
        let t = `🛑 <b>Ye ZIP maine nahi chadhayi.</b>\n${stop.length} file me kami hai — pehle ye theek kariye:\n`;
        for (const [f, r] of stop.slice(0, 6)) {
          t += `\n<b>${esc(f)}</b>\n` + r.P.slice(0, 5).map((x) => "  • " + esc(x)).join("\n") + "\n";
        }
        if (stop.length > 6) t += `\n…aur ${stop.length - 6} file me bhi kami hai.\n`;
        t += "\n<i>Theek karke dobara bhejiye. Ye jaanch Google ki apni policy aur site ke audit niyam par hai — " +
             "kami ke saath chadhane par deploy waise bhi ruk jaata.</i>\n" +
             "<i>Bahut zaroori ho to ZIP ka naam me <code>-force</code> jodkar bhejiye, tab jaanch chhod dunga.</i>";
        return say(env, t);
      }
      const warn = rep.filter(([, r]) => r.W.length);
      if (warn.length) {
        let t = `⚠️ <b>Chetavni — ${warn.length} file me chhoti kami hai</b> (chadha raha hoon, rokunga nahi):\n`;
        for (const [f, r] of warn.slice(0, 4)) t += `\n<b>${esc(f)}</b>\n` + r.W.slice(0, 3).map((x) => "  • " + esc(x)).join("\n") + "\n";
        await say(env, t);
      }
      const n = batch.filter(([p2]) => /\.html$/i.test(p2)).length;
      if (n >= 10) await say(env,
        `📌 <b>Dhyan dijiye — is ZIP me ${n} page hain.</b>\n` +
        `Google ki 'scaled content abuse' policy ke hisaab se hafte me 2-3 naye page hi surakshit hain. ` +
        `Ye page purane hain to koi baat nahi. Agar naye hain, to live karne ke baad AdSense 3-4 hafte tak apply mat kariye.`);
    }

    ZIP_BUSY = true;
    await say(env, `⏳ ${batch.length} file chadha raha hoon — ek hi commit me…`);
    let r;
    try { r = await putMany(env, batch, `zip se ${batch.length} file: ${name}`); }
    catch (e) { ZIP_BUSY = false; return say(env, `❌ Nahi chadhi — <code>${esc(String(e).slice(0, 300))}</code>`); }
    finally { ZIP_BUSY = false; }
    if (!r.ok) return say(env, `❌ <b>Nahi chadhi</b> — ${esc(r.err)}\n\nZIP dobara bhejna surakshit hai — file wahi rahegi.`);

    const list = batch.map(([t]) => t);
    return say(env,
      `<b>ZIP khol di</b> — ${name}\n\n✅ <b>${batch.length} file — ek commit me</b>\n` +
      list.slice(0, 20).map((x) => "• " + esc(x)).join("\n") +
      (list.length > 20 ? `\n…aur ${list.length - 20}` : "") +
      (skip.length ? `\n\n⚪ chhodi: ${esc(skip.slice(0, 8).join(", "))}` : "") + "\n\nAb deploy?", btn);
  }

  const t = routeOf(name);
  if (!t) return say(env, `Ye file nahi pehchani: <code>${esc(name)}</code>`);
  const r = await putFile(env, t, bytes, `telegram se: ${t}`);
  return say(env, r.ok ? `${r.updated ? "♻️ Update" : "🆕 Nayi file"}\n<code>${t}</code>\n${(doc.file_size/1024).toFixed(0)} KB` : `❌ ${r.status}`, btn);
}


// ================= BAAT-CHEET (naya) =================
// Do parat: (1) shabd pehchano — turant, kabhi fail nahi hota
//           (2) samajh na aaye to Workers AI — par wo sirf ye tay karta hai
//               ki kaunsa kaam chalana hai. NUMBER hamesha asli API se aate hain.

/** Site ke asli aankde — AI ko yahi diye jaate hain, taaki wo apne se number na banaye */
async function siteFacts(env) {
  const f = { indexed: "?", pending: "?", total: "?", err: "?", warn: "?", day: "?",
              c7: "?", i7: "?", c1: "?", i1: "?", c28: "?", i28: "?", pos: "?", topq: "" };
  try {
    const r = await gh(env, `/repos/${env.GH_REPO}/contents/state/daily.json`);
    if (r.ok) {
      const d = JSON.parse(atob(r.data?.content?.replace(/\n/g, "") || ""));
      const st = d.status || {};
      const ok = Object.values(st).filter((v) => v && v.ok).length;
      f.indexed = ok; f.pending = Object.keys(st).length - ok; f.total = Object.keys(st).length;
      f.err = d.aud_e ?? "?"; f.warn = d.aud_w ?? "?"; f.day = d.day || "?";
      if (d.gsc_last) { f.c7 = d.gsc_last.c; f.i7 = d.gsc_last.i; }
    }
  } catch {}
  // GSC se taaza data — taaki "aaj kuch hua ya nahi" ka jawab de sake
  try {
    const [a, b, q] = await Promise.all([
      gscQuery(env, 1, 0), gscQuery(env, 28, 0), gscQuery(env, 28, 0, ["query"], 5),
    ]);
    const g = (x) => x?.rows?.[0] || {};
    f.c1 = g(a).clicks ?? 0; f.i1 = g(a).impressions ?? 0;
    f.c28 = g(b).clicks ?? 0; f.i28 = g(b).impressions ?? 0;
    f.pos = g(b).position ? Number(g(b).position).toFixed(1) : "?";
    f.topq = (q?.rows || []).map((x) => `${x.keys[0]} (${x.impressions} impr)`).join(", ");
  } catch {}
  return f;
}

/** Sab kaam ek jagah — shabd wala tarika aur AI, dono isi list se chalte hain */
const JOBS = {
  gsc:       (env, mid, a) => doGsc(env, mid, +a || 7),
  topquery:  (env, mid) => doGscDim(env, mid, "query"),
  toppage:   (env, mid) => doGscDim(env, mid, "page"),
  desh:      (env, mid) => doGscDim(env, mid, "country"),
  device:    (env, mid) => doGscDim(env, mid, "device"),
  ga:        (env, mid, a) => doGa(env, mid, +a || 7, 1),
  live:      (env, mid) => doGaLive(env, mid),
  ghante:    (env, mid) => doGaHourly(env, mid),
  kahanse:   (env, mid) => doGaDim(env, mid, "sessionDefaultChannelGroup"),
  indexing:  (env, mid) => doIndexQuick(env, mid),
  check:     (env, mid, a) => doInspect(env, mid, a || "/"),
  speed:     (env, mid, a) => doSpeed(env, mid, /desk/i.test(a || "") ? "desktop" : "mobile"),
  audit:     (env, mid) => doAuditLast(env, mid),
  auditrun:  async (env, mid) => { await runWf(env, "audit.yml"); return edit(env, mid, "🛠 Audit chalu — natija aayega.", MAIN); },
  pages:     (env, mid) => doPages(env, mid),
  sitecheck: (env, mid) => doSite(env, mid),
  health:    (env, mid) => doHealth(env, mid),
  status:    (env, mid) => doStatus(env, mid),
  sitemap:   (env, mid) => doSitemap(env, mid),
  purge:     (env, mid) => doCf(env, mid, "purge"),
  rollback:  (env, mid) => doCf(env, mid, "rb"),
  pending:   async (env, mid) => { await runWf(env, "pending.yml"); return edit(env, mid, "📋 Pending list ban rahi hai — 1 min.", MAIN); },
  botstatus: (env, mid) => doBotStatus(env, mid),
  smstatus:  (env, mid) => doSitemapStatus(env, mid),
  bing:      (env, mid) => doBing(env, mid),
  mauka:     (env, mid) => doOpportunity(env, mid),
  checkpend: (env, mid) => doCheckPending(env, mid),
  taaza:     (env, mid) => doFreshCheck(env, mid),
  linkcheck: (env, mid) => doLinkCheck(env, mid),
  changes:   (env, mid, a) => doChanges(env, mid, +a || 1),
  botupdate: async (env, mid) => {
    if (await wfBusy(env, "bot.yml")) return edit(env, mid, "⏳ Bot ka update pehle se chal raha hai.", MAIN);
    await runWf(env, "bot.yml");
    return edit(env, mid, "🤖 Bot ka update chalu — 1-2 minute me ho jaayega.", MAIN); },
  report:    async (env, mid) => { await runWf(env, "daily.yml"); return edit(env, mid, "📑 Poora scan chalu — 3-5 minute.", MAIN); },
  deploy:    async (env, mid) => {
    if (await wfBusy(env, "deploy.yml")) return edit(env, mid, "⏳ Ek deploy pehle se chal raha hai.", MAIN);
    await runWf(env, "deploy.yml", { indexnow: "badle-hue" });
    return edit(env, mid, "🚀 Deploy chalu — audit paas hoga tabhi live jaayega.", MAIN); },
};

/** Bina AI ke — sirf shabd dekhkar. Ye hamesha chalta hai, kabhi quota khatam nahi hota. */
function understand(t) {
  const x = " " + t.toLowerCase().replace(/[?.,!|]/g, " ").replace(/\s+/g, " ") + " ";
  const has = (...w) => w.some((k) => x.includes(" " + k) || x.includes(k + " "));
  let num = (x.match(/\b(\d{1,3})\s*(din|day)\b/) || [])[1];
  if (!num && has("kal", "yesterday", "aaj", "today")) num = "1";
  if (!num && has("teen mahine", "3 mahine", "quarter", "tim'ahi")) num = "90";
  if (!num && has("mahine", "mahina", "month", "maheene")) num = "28";
  if (!num && has("hafte", "hafta", "week", "saptah")) num = "7";

  // ---- kisi URL ki jaanch ----
  const url = (t.match(/\/[a-z0-9][a-z0-9-]{3,}/i) || [])[0];
  if (url && has("index", "indexed", "crawl", "chadha", "hua", "google", "jaanch", "check", "dekho"))
    return ["check", url];

  // ---- live / abhi ----
  if (has("bing", "yandex", "indexnow", "index now", "seznam", "naver")) return ["bing", ""];
  if (has("live", "abhi kitne", "is waqt", "is samay", "real time", "realtime", "abhi kaun"))
    return ["live", ""];
  if (has("ghante", "ghanta", "hourly", "hour", "kis samay", "kaunse time"))
    return ["ghante", ""];

  // ---- traffic kahan se ----
  if (has("kahan se", "kaha se", "source", "channel", "referral", "direct ya", "organic"))
    return ["kahanse", ""];

  // ---- search console ke tukde ----
  if (has("kaunsi query par kaam", "kis query par kaam", "kaunse keyword par kaam"))
    return ["mauka", ""];
  if (has("query", "queries", "keyword", "kya search", "kaunsi search", "konsi search", "kis shabd"))
    return ["topquery", ""];
  if (has("top page", "best page", "kaunsa page", "konsa page", "kaun sa page", "sabse zyada page"))
    return ["toppage", ""];
  if (has("desh", "country", "kis desh", "videsh", "bharat ke bahar"))
    return ["desh", ""];
  if (has("device", "mobile ya desktop", "phone ya computer", "kis device"))
    return ["device", ""];

  // ---- speed ----
  if (has("speed", "kitni tez", "dheemi", "dheema", "slow", "fast", "pagespeed", "lcp", "cls", "tbt", "score", "performance"))
    return ["speed", has("desktop", "computer", "laptop") ? "desktop" : "mobile"];

  // ---- indexing ----
  if (has("naye page", "naya page", "nayi page") && has("index", "chadha", "chadhe", "hua", "hue"))
    return ["taaza", ""];
  if (has("index", "indexed", "indexing", "kitne page chadhe", "pending url", "crawl", "google ko pata", "kitne baaki"))
    return ["indexing", ""];
  if (has("sitemap")) return has("haal", "status", "kaisa", "error", "kitne url", "dekho", "jaanch")
    ? ["smstatus", ""] : ["sitemap", ""];
  if (has("mauka", "mauke", "kya sudhaar", "kahan sudhaar", "opportunity", "kaunsi query par kaam",
          "click kaise", "traffic kaise badh", "ranking kaise"))
    return ["mauka", ""];
  if (has("taaza jaanch", "abhi ka", "live jaanch", "abhi check", "fresh", "taza", "abhi ka sach") ||
      (has("naye page", "naya page") && has("index", "chadha", "hua")))
    return ["taaza", ""];
  if (has("bache hue", "pending url", "jo index nahi", "unindexed", "dobara jaanch", "phir se check"))
    return ["checkpend", ""];
  if (has("toota link", "toote link", "tute link", "broken link", "link jaanch", "link check", "dead link"))
    return ["linkcheck", ""];

  // ---- cloudflare ----
  if (has("purge", "cache", "purana dikh", "refresh nahi")) return ["purge", ""];
  if (has("rollback", "wapas le", "purana version", "undo", "pehle wala")) return ["rollback", ""];

  // ---- audit / deploy ----
  if (has("audit chalao", "audit karo", "naya audit", "dobara audit")) return ["auditrun", ""];
  if (has("audit", "error kitne", "kitne error", "warning", "kami", "galti"))
    return ["audit", ""];
  if (has("deploy", "live karo", "chadha do", "publish", "upload kar"))
    return ["deploy", ""];

  // ---- kaam ki list ----
  if (has("pending", "kya baaki", "kaam baaki", "kya karna", "todo", "kaam kya", "aage kya"))
    return ["pending", ""];
  if (has("health", "sab theek", "token theek", "sab chal", "kuch toota"))
    return ["health", ""];
  // BOT ke apne kaam SABSE PEHLE.
  // Pehle "bot update" me se "update" shabd pakda jaata tha aur wo "aaj kya badla" chala deta tha —
  // isi wajah se "bot update" likhne par bot Aaj ka kaam dikhata tha aur code chadhta hi nahi tha.
  if (has("bot update", "bot ka code", "bot chadha", "bot deploy", "bot updat", "botupdate", "update bot"))
    return ["botupdate", ""];
  if (has("bot") && has("haal", "kaisa", "kaise ho", "theek", "chal raha", "kya kar", "status", "sab theek"))
    return ["botstatus", ""];

  // "aaj kitne page update kiye", "kya badla", "aaj kya kaam hua" — ginti se pehle
  if (!has("bot") &&
      has("update", "badla", "badle", "badli", "kya kiya", "kya hua", "kaam hua", "chadha", "chadhe", "commit"))
    return ["changes", num || (has("hafte", "week") ? "7" : "1")];
  if (has("kitne page", "kitne tool", "kitni file", "total page", "kul page", "ginti"))
    return has("google", "index", "crawl", "search") ? ["indexing", ""] : ["pages", ""];
  if (has("site chal", "site down", "site khul", "site theek", "server", "uptime"))
    return ["sitecheck", ""];
  if (has("workflow", "pichhle run", "last run", "kya chala"))
    return ["status", ""];
  if (has("poora scan", "report banao", "scan karo", "naya scan", "poori report"))
    return ["report", ""];

  // "aaj kuch hua kya", "kal ek bhi nahi", "kuch aaya kya" — seedha GSC
  if (has("aaj", "kal", "today", "yesterday") &&
      has("hua", "huwa", "aaya", "ek bhi", "kuch nahi", "nahi huwa", "nahi hua", "kaisa raha"))
    return ["gsc", num || "1"];

  // ---- GSC / GA ka aam data ----
  if (has("click", "clicks", "impression", "impressions", "search console", "gsc", "ranking", "position", "ctr"))
    return ["gsc", num || "7"];
  if (has("user", "users", "visitor", "log aaye", "kitne log", "analytics", "ga4", "session", "traffic", "view"))
    return ["ga", num || "7"];

  // ---- sirf din ka zikr ----
  if (num && has("data", "haal", "batao", "dikhao", "report", "kaisa", "kaisi", "kya hua"))
    return ["gsc", num];
  return null;
}

const AI_FAST = ["@cf/meta/llama-3.2-3b-instruct", "@cf/meta/llama-3.1-8b-instruct"];
const AI_GOOD = ["@cf/meta/llama-3.1-8b-instruct", "@cf/meta/llama-3.2-3b-instruct"];

/** Gemini — sabse samajhdar. Key na ho ya na chale to apne aap Cloudflare wale par chala jaata hai. */
let GEM_MODEL = "";   // jo model chal gaya, wahi yaad rakho
let GEM_ERR = "";     // Google ne kya wajah batayi

/** Google se poochho ki is key par kaunse model chalte hain */
async function geminiModels(key) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(key)}`);
    const d = await r.json();
    if (!r.ok) { GEM_ERR = d?.error?.message || ("HTTP " + r.status); return []; }
    return (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name).replace("models/", ""));
  } catch (e) { GEM_ERR = String(e).slice(0, 120); return []; }
}

/** Jo model milte hain unme se sabse naya flash chuno.
 *  Google purane naam band karta rehta hai (jaise 2.5-flash naye users ke liye band ho gaya),
 *  isliye version ka number dekhkar sabse naya uthate hain — naam hardcode nahi karte. */
function pickModel(list) {
  const ok = list.filter((m) => /^gemini-/.test(m) &&
    !/tts|embed|vision|image|audio|live|thinking|exp$/i.test(m));
  const ver = (m) => { const x = m.match(/gemini-(\d+)(?:\.(\d+))?/); return x ? (+x[1]) * 100 + (+(x[2] || 0)) : 0; };
  const rank = (m) => (/flash-lite/.test(m) ? 2 : /flash/.test(m) ? 3 : /pro/.test(m) ? 1 : 0);
  ok.sort((a, b) => (ver(b) - ver(a)) || (rank(b) - rank(a)) || (a.length - b.length));
  return ok[0] || list[0] || "";
}

async function geminiCall(key, model, sys, user, max_tokens) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: max_tokens },
      }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { GEM_ERR = d?.error?.message || ("HTTP " + r.status); return null; }
  const t = d?.candidates?.[0]?.content?.parts?.map((x) => x.text).filter(Boolean).join("");
  if (!t || !t.trim()) { GEM_ERR = "khaali jawab (" + (d?.candidates?.[0]?.finishReason || "?") + ")"; return null; }
  return t.trim();
}

const GEM_DEAD = new Set();   // jo model mana kar chuke, unpar samay barbaad mat karo
async function gemini(env, sys, user, max_tokens = 700) {
  const key = (env.GEMINI_KEY || "").trim();
  if (!key) { GEM_ERR = "key nahi lagi"; return null; }
  GEM_ERR = "";
  if (GEM_MODEL) { const t = await geminiCall(key, GEM_MODEL, sys, user, max_tokens); if (t) return t; GEM_DEAD.add(GEM_MODEL); GEM_MODEL = ""; }
  for (const m of ["gemini-3.6-flash", "gemini-flash-latest", "gemini-3.6-flash-lite", "gemini-2.5-flash"]) {
    if (GEM_DEAD.has(m)) continue;
    const t = await geminiCall(key, m, sys, user, max_tokens);
    if (t) { GEM_MODEL = m; return t; }
    GEM_DEAD.add(m);
  }
  // naam badal gaye hon to Google se hi list mangwa lo
  const list = (await geminiModels(key)).filter((m) => !GEM_DEAD.has(m));
  for (let k = 0; k < 3 && list.length; k++) {
    const pick = pickModel(list);
    if (!pick) break;
    const t = await geminiCall(key, pick, sys, user, max_tokens);
    if (t) { GEM_MODEL = pick; return t; }
    GEM_DEAD.add(pick);
    list.splice(list.indexOf(pick), 1);
  }
  return null;
}

async function aiRun(env, messages, max_tokens = 320, models = AI_GOOD) {
  if (!env.AI) return null;
  for (const m of models) {
    try { const r = await env.AI.run(m, { messages, max_tokens }); if (r && r.response) return r.response; }
    catch {}
  }
  return null;
}

/** Dono ko ek jagah se poochho: pehle Gemini, na chale to Cloudflare */
let LAST_BRAIN = "";
async function think(env, sys, user, max_tokens = 700, fast = false) {
  const g = await gemini(env, sys, user, max_tokens);
  if (g) { LAST_BRAIN = "Gemini"; return g; }
  const c = await aiRun(env, [{ role: "system", content: sys }, { role: "user", content: user }],
                        max_tokens, fast ? AI_FAST : AI_GOOD);
  LAST_BRAIN = c ? "Cloudflare AI" : "";
  return c;
}

/** Model markdown me likhta hai, Telegram HTML samajhta hai — beech ka pul */
function md2tg(t) {
  return esc(t)
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, "$1<i>$2</i>")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\n{3,}/g, "\n\n");
}

/** AI sirf ye tay karta hai ki kaunsa kaam chalana hai — jawab wo khud nahi banata */
async function aiPick(env, t) {
  const out = await think(env,
      "Tum ek router ho. User Hinglish (Roman script me Hindi) me kuch poochhta hai.\n" +
      'Sirf ek JSON lauta do, aur kuch bhi nahi: {"a":"KAAM","x":"ARG"}\n\n' +
      "KAAM ki poori list aur matlab:\n" +
      "gsc = Google Search ke click/impression (x me dinon ki ginti)\n" +
      "topquery = log kaunse shabd search karke aaye\n" +
      "toppage = kaunsa page sabse zyada chala\n" +
      "desh = kis desh se log aaye | device = mobile ya desktop\n" +
      "ga = website par kitne log aaye (x me din) | live = abhi kitne log hain\n" +
      "ghante = ghante ke hisaab se | kahanse = traffic kis raaste se aaya\n" +
      "indexing = kitne page Google me chadhe, kitne baaki\n" +
      "check = ek khaas URL index hua ya nahi (x me us page ka slug)\n" +
      "speed = website kitni tez hai (x me mobile ya desktop)\n" +
      "audit = site me kitne error/warning | auditrun = naya audit chalao\n" +
      "pages = site par kitne page/tool hain | sitecheck = site chal rahi hai ya nahi\n" +
      "health = sab system theek hain ya nahi | status = pichhle workflow run\n" +
      "sitemap = Google ko sitemap bhejo | pending = kya kaam baaki hai\n" +
      "report = poora naya scan chalao | deploy = site live karo\n" +
      "purge = cache saaf karo | rollback = purane version par wapas\n" +
      "none = ye kaam nahi, ye aam sawaal hai\n\n" +
      "Misaal:\n" +
      'User: pichhle hafte kitni kamai wali query thi -> {"a":"topquery","x":""}\n' +
      'User: 15 din ka search data -> {"a":"gsc","x":"15"}\n' +
      'User: /ppf-calculator google me aaya kya -> {"a":"check","x":"/ppf-calculator"}\n' +
      'User: site kyu dheemi hai -> {"a":"speed","x":"mobile"}\n' +
      'User: backlink kaise banau -> {"a":"none","x":""}',
    t.slice(0, 300), 80, true);
  if (!out) return null;
  try {
    const m = out.match(/\{[\s\S]*?\}/); if (!m) return null;
    const d = JSON.parse(m[0]);
    if (!d.a || d.a === "none" || !JOBS[d.a]) return null;
    return [d.a, String(d.x || "")];
  } catch { return null; }
}

/** Aam sawaal ka jawab — sirf asli aankdon ke saath, apne se number nahi */
async function aiTalk(env, mid, t) {
  const f = await siteFacts(env);
  const out = await think(env,
      "Tum 'Sab Hisaab' ke maalik Manoj ke apne sahayak ho. Unki website sabhisaab.com hai.\n\n" +
      "SITE KA SACH:\n" +
      "- Hinglish calculator site, 154 tool, 38 guide, 24 lekh. Cloudflare Pages par, GitHub Actions se deploy.\n" +
      "- Sab kuch pehle se laga hua hai: sitemap, schema (FAQ/Breadcrumb/WebApplication), canonical, IndexNow, " +
      "security headers grade A, consent banner, internal linking, hub pages, GSC aur GA4 juda hua.\n" +
      "- " + f.indexed + " page Google me index hain, " + f.pending + " baaki. Audit me ERROR " + f.err + ", WARNING " + f.warn + ".\n" +
      "- ASLI GSC DATA (Google 2-3 din peeche chalta hai, isliye 'aaj' ka matlab 3 din pehle):\n" +
      "  · pichhle 1 din: " + f.c1 + " click, " + f.i1 + " impression\n" +
      "  · pichhle 7 din: " + f.c7 + " click, " + f.i7 + " impression\n" +
      "  · pichhle 28 din: " + f.c28 + " click, " + f.i28 + " impression, average position " + f.pos + "\n" +
      (f.topq ? "  · sabse zyada dikhne wali query: " + f.topq + "\n" : "") +
      "- Agar koi poochhe 'aaj kuch hua ya nahi' to upar wale 1-din ke number se jawab do. " +
      "Ye mat kaho ki data mere paas nahi hai.\n" +
      "- ASLI KAMZORI: site par lagbhag ZERO backlink hain aur koi social profile nahi. Page index to hain, " +
      "par Google unhe upar nahi rakhta kyunki domain ki koi sakh (authority) nahi bani.\n" +
      "- AdSense abhi apply nahi ki. Pehle backlink, social profile aur bache hue thin page theek karne hain.\n\n" +
      "JAWAB DENE KE NIYAM — inhe todna nahi:\n" +
      "1. Hinglish me likho (Roman script me Hindi). Chhote vaakya.\n" +
      "2. Zyada se zyada 6-8 line. Lambi list mat banao.\n" +
      "3. GHISI-PITI SALAH BILKUL MAT DO. 'SEO karo', 'quality content likho', 'content marketing karo', " +
      "'email marketing', 'social media marketing' — ye sab BEKAAR jawab hain. Ye sab pehle se ho chuka hai.\n" +
      "4. Hamesha SAB HISAAB ki apni sthiti par baat karo. Agar aage badhne ki salah deni ho to yaad rakho ki " +
      "asli rukawat backlink hai, content nahi.\n" +
      "5. Koi number apne se MAT banao. Sirf upar diye aankde use karo. Pata na ho to keh do 'ye number mere paas nahi, /menu se dekh lijiye'.\n" +
      "6. Markdown ka # heading mat lagao. Seedha likho.\n\n" +
      "BOT (yaani tum) ke baare me — agar Manoj tumhare baare me poochhein:\n" +
      "- Tum Telegram par chalte ho, Cloudflare Worker par. Tum ye kar sakte ho: GSC aur GA4 ki report, " +
      "indexing ka haal, kisi URL ka index status (/check), speed, audit, deploy, sitemap submit, " +
      "cache purge, purane version par wapas jaana (rollback), aur apna khud ka code update karna.\n" +
      "- Tum ye NAHI kar sakte: naya page banana, content likhna, code theek karna, ya GSC me " +
      "Request Indexing dabana (Google ka API hai hi nahi). Ye kaam Manoj ya unka AI karta hai.\n" +
      "- ZIP me ek baar me 22 file tak hi chadh sakti hai — isse zyada par tum pehle hi mana kar dete ho.\n" +
      "- 'Aaj kya update hua' jaisa sawaal aaye to tum GitHub ke commit se bata sakte ho.\n" +
      "- Indexing wali ginti roz ke scan se aati hai, live nahi hoti. Agar Manoj kahein ki number purana hai, " +
      "to unhe 'taaza jaanch' batao (sabse naye 8 page Google se abhi poochhta hai) ya 'poora scan' (3-5 min, poori site).\n" +
      "- Tum ye bhi kar sakte ho: sitemap ka haal (GSC se), sabse bade mauke (wo query jinpar dikh rahe hain " +
      "par click nahi), bache hue URL ka taaza index status, aur toote link ki jaanch.\n" +
      "- Har deploy par: Google ko sitemap (Search Console API se) aur Bing ko IndexNow — dono apne aap.\n" +
      "- Bing ka sitemap 'ping' 2022 se band hai (Google ka 2023 se). Isliye Bing me sitemap ek baar haath se " +
      "submit karna padta hai; uske baad Bing khud padhta rehta hai. Ye kami nahi hai, Bing ka apna niyam hai. " +
      "Bing ko roz ki khabar IndexNow se jaati hai — aur wo chal raha hai.\n" +
      "- Ye sab poochha jaaye to seedha bata do, ghumao mat.",
      t.slice(0, 600), 700);
  if (!out) return edit(env, mid,
    "Ye baat samajh nahi aayi.\n\nAise poochh sakte hain:\n• <i>7 din ke click batao</i>\n• <i>kitne page index hue</i>\n• <i>speed kaisi hai</i>\n• <i>/check /nsc-calculator</i>\n\nYa 📖 Poora menu dabaiye.", MAIN);
  return edit(env, mid, md2tg(out.trim()).slice(0, 3400) +
    "\n\n<i>— " + esc(LAST_BRAIN || "AI") + " · jaanch ke liye /menu</i>", MAIN);
}

/** Poora raasta: pehle shabd, phir AI se kaam chuno, phir AI se baat */
async function chat(env, t) {
  const r = await say(env, "⏳ …");
  const mid = r?.result?.message_id;
  if (!mid) return;
  let pick = understand(t);
  if (!pick) pick = await aiPick(env, t);
  if (pick && JOBS[pick[0]]) return runJob(env, mid, pick[0], pick[1]);
  return aiTalk(env, mid, t);
}

/** CHOWKIDAR — har kaam ka rakhwala.
 *  Pehle agar koi kaam beech me atak jaata (jaise Google ka jawab na aaye), to bot
 *  chup ho jaata tha aur user ko sirf "⏳ …" dikhta rehta tha — ghanton tak.
 *  Ab: har kaam ko 50 second milte hain. Us se zyada laga to bot khud batata hai
 *  ki kya hua aur aage kya kariye. Bot ab kabhi chup nahi hoga. */
async function runJob(env, mid, job, arg) {
  const NAMES = { taaza: "taaza jaanch", checkpend: "bache hue URL ki jaanch", indexing: "Indexing",
                  gsc: "Search ka data", ga: "Analytics", speed: "Speed test", mauka: "mauke",
                  smstatus: "sitemap ka haal", linkcheck: "link ki jaanch" };
  const naam = NAMES[job] || job;
  let done = false;
  const guard = (async () => {
    await new Promise((r) => setTimeout(r, 50000));
    if (done) return;
    await edit(env, mid,
      `⏱ <b>${esc(naam)} 50 second me poori nahi hui.</b>\n\n` +
      `Aksar iska matlab hai ki Google ya GitHub dheema chal raha hai — bot theek hai.\n\n` +
      `<b>Kya kariye</b>\n` +
      `• 1-2 minute ruk kar dobara try kijiye\n` +
      (job === "taaza" ? "• Poori site ka hisaab chahiye to <b>poora scan</b> chalaiye (GitHub par chalta hai, wahan koi seema nahi)\n" : "") +
      `• Baar-baar ho to ❤️ Health dabaiye`, MAIN);
  })();
  try {
    const r = await JOBS[job](env, mid, arg);
    done = true;
    return r;
  } catch (e) {
    done = true;
    return edit(env, mid,
      `❌ <b>${esc(naam)} nahi ho payi.</b>\n\n<code>${esc(String(e).slice(0, 200))}</code>\n\n` +
      `<i>Ye galti bot ne pakad li hai — chup nahi raha. Dobara try kijiye.</i>`, MAIN);
  }
}

/** Indexing ka jawab — saaf batata hai ki data kitna purana hai */
async function doIndexQuick(env, mid) {
  await edit(env, mid, "⏳ …");
  const r = await gh(env, `/repos/${env.GH_REPO}/contents/state/daily.json`);
  if (!r.ok) return edit(env, mid, "Abhi koi record nahi. 📑 Indexing → Poora scan chalayein.", MAIN);
  let d = {}; try { d = JSON.parse(atob(r.data?.content?.replace(/\n/g, "") || "")); } catch {}
  const st = d.status || {};
  const ok = Object.values(st).filter((v) => v && v.ok);
  const no = Object.entries(st).filter(([, v]) => v && !v.ok);
  const why = {};
  no.forEach(([, v]) => { const k = v.why || "?"; why[k] = (why[k] || 0) + 1; });
  const h = (d.hist || []).slice(-5);

  // record kitna purana hai — ye sabse zaroori baat hai
  let umr = "";
  try {
    const c = await gh(env, `/repos/${env.GH_REPO}/commits?path=state/daily.json&per_page=1`);
    const t = c.data?.[0]?.commit?.author?.date;
    if (t) umr = ago(t) + " pehle";
  } catch {}

  return edit(env, mid,
    `<b>📑 Indexing</b>\n` +
    `<i>Ye Google se ki gayi aakhri jaanch hai — ${esc(umr || d.day || "?")}. Live nahi hai.</i>\n\n` +
    `Indexed : <b>${ok.length}</b>\nBaaki : <b>${no.length}</b>\n\n` +
    (Object.keys(why).length ? "<b>Kis wajah se atke</b>\n" +
      Object.entries(why).map(([k, v]) => `• ${esc(k)} — <b>${v}</b>`).join("\n") + "\n\n" : "") +
    (h.length > 1 ? "<b>Pichhle din</b>\n" + h.map((x) => `• ${x.d} — ${x.ok} indexed`).join("\n") + "\n\n" : "") +
    (no.length ? "<b>Ye dabaiye</b>\n" + no.slice(0, 10).map(([u]) => `<code>${esc(u)}</code>`).join("\n") + "\n\n" : "Sab index hai ✅\n\n") +
    "<i>Abhi ka sach chahiye to likhiye <b>taaza jaanch</b> — Google se seedha poochh lunga. " +
    "Poori site dobara jaanchni ho to <b>poora scan</b> (3-5 minute).</i>",
    MAIN);
}

// ---------- callbacks ----------
async function onCb(env, q) {
  const mid = q.message.message_id, d = q.data;
  await tgApi(env, "answerCallbackQuery", { callback_query_id: q.id });
  if (d === "m:main") return edit(env, mid, "<b>Sab Hisaab — control center</b>", MAIN);
  if (d.startsWith("m:")) { const m = MENUS[d.slice(2)]; return m && edit(env, mid, m.t, m.k); }
  if (d.startsWith("g:")) { const [, a] = d.split(":");
    return a === "cmp" ? doGsc(env, mid, 28) : doGsc(env, mid, +a); }
  if (d.startsWith("gd:")) return doGscDim(env, mid, d.slice(3));
  if (d === "a:live") return doGaLive(env, mid);
  if (d === "a:hr") return doGaHourly(env, mid);
  if (d.startsWith("a:")) { const [, f, t] = d.split(":"); return doGa(env, mid, +f, +t); }
  if (d.startsWith("ad:")) return doGaDim(env, mid, d.slice(3));
  if (d.startsWith("s:")) return doSpeed(env, mid, d.slice(2));
  if (d.startsWith("cf:")) return doCf(env, mid, d.slice(3));
  if (d.startsWith("d:")) {
    if (await wfBusy(env, "deploy.yml"))
      return edit(env, mid, "⏳ <b>Ek deploy pehle se chal raha hai.</b>\nUsi ka intezaar kijiye — natija apne aap aayega.\nDobara dabane se do baar chalta hai, faayda kuch nahi.", MENUS.dep.k);
    await runWf(env, "deploy.yml", { indexnow: d.slice(2) });
    return edit(env, mid, `🚀 Deploy chalu — IndexNow: <code>${esc(d.slice(2))}</code>\nAudit paas hoga tabhi live jaayega.\n<i>Ab is button ko dobara mat dabaiye.</i>`, MENUS.dep.k); }
  if (d === "do:status") return doStatus(env, mid);
  if (d === "do:changes") return doChanges(env, mid, 1);
  // button se bhi chowkidar ke saath — koi kaam chup-chaap na mare
  if (d === "do:smstatus") return runJob(env, mid, "smstatus", "");
  if (d === "do:checkpend") return runJob(env, mid, "checkpend", "");
  if (d === "do:taaza") return runJob(env, mid, "taaza", "");
  if (d === "do:mauka") return runJob(env, mid, "mauka", "");
  if (d === "do:linkcheck") return doLinkCheck(env, mid);
  if (d === "do:pages") return doPages(env, mid);
  if (d === "do:site") return doSite(env, mid);
  if (d === "do:health") return doHealth(env, mid);
  if (d === "do:unused") return doState(env, mid, "unused", "Faltu file");
  if (d === "do:auditlast") return doAuditLast(env, mid);
  if (d === "do:help") return edit(env, mid, HELP, MAIN);
  if (d === "do:pending") { await runWf(env, "pending.yml"); return edit(env, mid, "📋 Pending list ban rahi hai — 1 min me aayegi.", MAIN); }
  if (d === "do:audit") { await runWf(env, "audit.yml"); return edit(env, mid, "🛠 Audit chalu — natija Telegram par aayega.", MENUS.aud.k); }
  if (d === "do:report" || d === "do:daily") { await runWf(env, "daily.yml"); return edit(env, mid, "📑 Poora scan chalu — 3-5 minute me report aayegi.", MENUS.idx.k); }
  if (d === "do:sitemap") return doSitemap(env, mid);
  if (d === "rm_unused") {
    const r = await gh(env, `/repos/${env.GH_REPO}/contents/state/daily.json`);
    if (!r.ok) return edit(env, mid, "List nahi mili.", MAIN);
    const list = JSON.parse(atob(r.data.content.replace(/\n/g, ""))).unused || [];
    const done = await delFiles(env, list);
    return edit(env, mid, `🗑 ${done} file hata di.\nAb deploy karein.`, kb([[{ text: "🚀 Deploy", callback_data: "d:koi-nahi" }], back]));
  }
  if (d === "ack_all") {
    await gh(env, `/repos/${env.GH_REPO}/actions/workflows/daily.yml/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main", inputs: { ack: "yes" } }) });
    return edit(env, mid, "✅ Samajh liya — ye alert ab dobara nahi dohraya jaayega.");
  }
}

const HELP = `<b>Sab Hisaab — control center</b>

Sab kuch <b>Menu ke button</b> se. Type karne ki zaroorat nahi.

<b>Command bhi chalti hain</b>
/menu — poora dashboard
/get naam.html — file wapas mangao
/check /nsc-calculator — ye URL index hua ya nahi
/deploy · /report · /audit · /health
/gsc 7 · /ga 28 — seedha data

<b>Ya seedha Hinglish me likh dijiye</b>
<i>7 din ke click batao</i>
<i>kitne page index hue</i>
<i>speed kaisi hai</i>
<i>top query kya hai</i>
<i>nsc-calculator index hua kya</i>

<b>File chadhana</b>
HTML ya ZIP bhej dijiye — bot khud sahi folder me daal dega.

<b>Roz apne aap</b>
🔴 High priority · 🟠 Important · 🔵 Daily report
Indexing, clicks, users, speed, audit, nayi policy ki khabar — sab.`;

// ---------- router ----------
/**
 * Telegram jawab 60 sec me na mile to WAHI update dobara bhejta hai.
 * Isi wajah se 14 Aug ko ek ZIP do baar commit hui thi aur deploy #40/#41 do baar chala.
 * Ilaaj: (1) update_id yaad rakho, dobara aaye to chhod do
 *        (2) turant 200 lauta do, kaam peeche waitUntil me karo
 */
const SEEN = new Map();
function firstTime(id) {
  if (id == null) return true;
  const now = Date.now();
  if (SEEN.has(id)) return false;
  SEEN.set(id, now);
  if (SEEN.size > 300) for (const [k, v] of SEEN) if (now - v > 9e5) SEEN.delete(k);
  return true;
}

async function handle(env, u) {
  if (u.callback_query) {
    if (String(u.callback_query.message.chat.id) !== String(env.TG_CHAT)) return;
    try { await onCb(env, u.callback_query); } catch (e) { await say(env, `❌ ${esc(String(e).slice(0, 300))}`); }
    return;
  }
  const m = u.message;
  if (!m || String(m.chat.id) !== String(env.TG_CHAT)) return;
  if (m.document) {
    try { await handleDoc(env, m.document); }
    catch (e) { await say(env, `❌ File nahi chadhi\n<code>${esc(String(e).slice(0, 400))}</code>`); }
    return;
  }

  let txt = (m.text || "").trim();
  const RMAP = { "🚀 Deploy": "/deploy", "📋 Pending": "/pending", "🔍 Search": "/gsc 7",
    "📈 Analytics": "/ga 7", "📑 Indexing": "/report", "⚡ Speed": "/speed",
    "🛠 Audit": "/audit", "❤️ Health": "/health", "📖 Poora menu": "/menu" };
  if (RMAP[txt]) txt = RMAP[txt];
  const [c0, ...rest] = txt.split(/\s+/);
  const cmd = c0.toLowerCase().replace(/@.*$/, ""), arg = rest[0] || "";
  try {
    if (["/start", "/menu", "/help"].includes(cmd)) {
      await tgApi(env, "sendMessage", { chat_id: env.TG_CHAT,
        text: "⌨️ Neeche wale button hamesha yahin rahenge.", reply_markup: RKB });
      await say(env, cmd === "/help" ? HELP : "<b>Sab Hisaab — control center</b>", MAIN);
    }
    else if (cmd === "/get") { if (!arg) await say(env, "Aise: <code>/get nsc-calculator.html</code>");
      else if (!(await sendFile(env, arg))) await say(env, `Nahi mili: <code>${esc(arg)}</code>`); }
    else if (cmd === "/check") { if (!arg) await say(env, "Aise: <code>/check /nsc-calculator</code>");
      else { const r = await say(env, "⏳ Google se poochh raha hoon…"); await doInspect(env, r.result.message_id, arg); } }
    else if (cmd === "/deploy") {
      if (await wfBusy(env, "deploy.yml")) await say(env, "⏳ Ek deploy pehle se chal raha hai — usi ka intezaar kijiye.");
      else { await runWf(env, "deploy.yml", { indexnow: arg === "sabhi" ? "sabhi" : arg === "chup" ? "koi-nahi" : "badle-hue" });
        await say(env, "🚀 Deploy chalu."); } }
    else if (cmd === "/botupdate") {
      if (await wfBusy(env, "bot.yml")) await say(env, "⏳ Bot ka update pehle se chal raha hai.");
      else { await runWf(env, "bot.yml"); await say(env, "🤖 Bot ka update chalu — 1-2 minute."); } }
    else if (cmd === "/report") { await runWf(env, "daily.yml"); await say(env, "📑 Scan chalu — 3-5 min."); }
    else if (cmd === "/audit") { await runWf(env, "audit.yml"); await say(env, "🛠 Audit chalu."); }
    else if (cmd === "/pending") { await runWf(env, "pending.yml"); await say(env, "📋 Pending list ban rahi hai — 1 min."); }
    else if (cmd === "/watch") { await runWf(env, "watch.yml", { mode: "watch" }); await say(env, "👁 Nigraani chalu."); }
    else if (cmd === "/speed") { const r = await say(env, "⏳ …"); if (r?.result) await doSpeed(env, r.result.message_id, "mobile"); }
    else if (["/gsc", "/ga", "/health", "/pages", "/status", "/site"].includes(cmd)) {
      const r = await say(env, "⏳ …", MAIN);
      if (!r?.result) return;
      const mid = r.result.message_id;
      if (cmd === "/gsc") await doGsc(env, mid, +arg || 7);
      else if (cmd === "/ga") await doGa(env, mid, +arg || 7, 1);
      else if (cmd === "/health") await doHealth(env, mid);
      else if (cmd === "/pages") await doPages(env, mid);
      else if (cmd === "/status") await doStatus(env, mid);
      else await doSite(env, mid);
    } else if (txt.startsWith("/")) await say(env, "Ye command nahi jaanta. /menu dekhiye, ya seedha Hinglish me likh dijiye.", MAIN);
    else if (txt.length > 2) await chat(env, txt);   // <- saada Hinglish sawaal
  } catch (e) { await say(env, `❌ ${esc(String(e).slice(0, 300))}`); }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/setup") {
      if (url.searchParams.get("key") !== env.SETUP_KEY) return new Response("nope", { status: 403 });
      const hook = `${url.origin}/tg/${env.HOOK_PATH}`;
      const a = await tgApi(env, "setWebhook", { url: hook, allowed_updates: ["message", "callback_query"] });
      const b = await tgApi(env, "setMyCommands", { commands: [
        { command: "menu", description: "Poora dashboard" },
        { command: "gsc", description: "Google Search data" },
        { command: "ga", description: "Analytics data" },
        { command: "report", description: "Indexing report" },
        { command: "check", description: "URL index hua ya nahi" },
        { command: "deploy", description: "Site live karo" },
        { command: "audit", description: "Audit chalao" },
        { command: "health", description: "Sab theek hai?" },
        { command: "pages", description: "Kitne page hain" },
        { command: "get", description: "File wapas mangao" },
        { command: "help", description: "Madad" }]});
      return j({ webhook: hook, setWebhook: a, setMyCommands: b });
    }
    if (req.method !== "POST" || url.pathname !== `/tg/${env.HOOK_PATH}`) return new Response("Sab Hisaab bot");

    let u; try { u = await req.json(); } catch { return j({ ok: true }); }
    if (!firstTime(u.update_id)) return j({ ok: true, dup: true });
    ctx.waitUntil(handle(env, u).catch((e) => say(env, `❌ ${esc(String(e).slice(0, 300))}`)));
    return j({ ok: true });
  },
};
