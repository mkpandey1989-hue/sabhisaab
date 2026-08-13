/**
 * Sab Hisaab — Telegram Control Center v3
 * Cloudflare Worker. VM par 0 load, ₹0 kharcha.
 */
import { unzipSync } from "fflate";
import { gapi, SCOPE_GSC, SCOPE_GA4 } from "./google.js";

const SITE = "https://sabhisaab.com";
const j = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });

// ---------- telegram ----------
async function tgApi(env, m, b) {
  const r = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/${m}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  return r.json();
}
const kb = (rows) => ({ inline_keyboard: rows });
const say = (env, t, k) => tgApi(env, "sendMessage",
  { chat_id: env.TG_CHAT, text: t, parse_mode: "HTML", disable_web_page_preview: true, ...(k ? { reply_markup: k } : {}) });
const edit = (env, id, t, k) => tgApi(env, "editMessageText",
  { chat_id: env.TG_CHAT, message_id: id, text: t, parse_mode: "HTML", disable_web_page_preview: true, ...(k ? { reply_markup: k } : {}) });

// ---------- github ----------
async function gh(env, path, init = {}) {
  const r = await fetch("https://api.github.com" + path, { ...init, headers: {
    Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json",
    "User-Agent": "sabhisaab-bot", "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text(); let d = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = { raw: t }; }
  return { ok: r.ok, status: r.status, data: d };
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
    [{ text: "Sitemap Google ko", callback_data: "do:sitemap" }],
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
    [{ text: "Pages ka haal", callback_data: "cf:pages" }], back]) },
  file: { t: "<b>📁 Files</b>\nFile chahiye? <code>/get naam.html</code>\nZIP ya file bhej dijiye — khud sahi jagah jaayegi", k: kb([
    [{ text: "Kitne page hain", callback_data: "do:pages" }],
    [{ text: "Faltu file dhundo", callback_data: "do:unused" }], back]) },
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
  } catch (e) { await edit(env, mid, `❌ ${String(e).slice(0, 250)}`, MENUS.gsc.k); }
}
async function doGscDim(env, mid, dim) {
  await edit(env, mid, "⏳ …");
  try {
    const r = await gscQuery(env, 28, 0, [dim], 10);
    const nm = { page: "Top pages", query: "Top queries", country: "Desh", device: "Device" }[dim];
    let t = `<b>${nm} — 28 din</b>\n\n`;
    (r.rows || []).forEach((x, i) => {
      const k = x.keys[0].replace(SITE, "") || "/";
      t += `${i + 1}. <code>${k.slice(0, 42)}</code>\n   ${nf(x.clicks)} click · ${nf(x.impressions)} impr · pos ${x.position.toFixed(1)}\n`;
    });
    await edit(env, mid, t || "Data nahi mila", MENUS.gsc.k);
  } catch (e) { await edit(env, mid, `❌ ${String(e).slice(0, 250)}`, MENUS.gsc.k); }
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
  } catch (e) { await edit(env, mid, `❌ ${String(e).slice(0, 250)}`, MENUS.ga.k); }
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
  } catch (e) { await edit(env, mid, `❌ ${String(e).slice(0, 250)}`, MENUS.ga.k); }
}
async function doGaLive(env, mid) {
  await edit(env, mid, "⏳ Live…");
  try {
    const r = await ga4rt(env, { metrics: [{ name: "activeUsers" }] });
    const p = await ga4rt(env, { dimensions: [{ name: "unifiedScreenName" }], metrics: [{ name: "activeUsers" }], limit: 6 });
    let t = `<b>🔴 Abhi site par : ${nf(tot(r))} log</b>\n<i>pichhle 30 minute</i>\n\n`;
    rows(p).forEach(([d, m]) => (t += `• ${d[0].slice(0, 40)} — ${m[0]}\n`));
    await edit(env, mid, t, MENUS.ga.k);
  } catch (e) { await edit(env, mid, `❌ ${String(e).slice(0, 250)}`, MENUS.ga.k); }
}
async function doGaDim(env, mid, dim) {
  await edit(env, mid, "⏳ …");
  try {
    const r = await ga4(env, { dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: dim }], metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 10 });
    const nm = { sessionDefaultChannelGroup: "Kahan se aaye", country: "Desh", pagePath: "Top pages", deviceCategory: "Device" }[dim];
    let t = `<b>${nm} — 28 din</b>\n\n`;
    rows(r).forEach(([d, m], i) => (t += `${i + 1}. ${d[0].slice(0, 40)} — <b>${nf(+m[0])}</b>\n`));
    await edit(env, mid, t, MENUS.ga.k);
  } catch (e) { await edit(env, mid, `❌ ${String(e).slice(0, 250)}`, MENUS.ga.k); }
}
async function doSpeed(env, mid, st) {
  await edit(env, mid, "⏳ PageSpeed chal raha hai (30-60 sec)…");
  try {
    const d = await (await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(SITE)}&strategy=${st}&category=performance`)).json();
    const lh = d.lighthouseResult, a = lh.audits;
    const sc = Math.round(lh.categories.performance.score * 100);
    await edit(env, mid, `<b>⚡ ${st === "mobile" ? "Mobile" : "Desktop"} speed</b>\n\n` +
      `Score : <b>${sc}</b> ${sc >= 90 ? "🟢" : sc >= 50 ? "🟠" : "🔴"}\n` +
      `LCP : ${a["largest-contentful-paint"].displayValue}\nCLS : ${a["cumulative-layout-shift"].displayValue}\n` +
      `TBT : ${a["total-blocking-time"].displayValue}\nSpeed Index : ${a["speed-index"].displayValue}`, MENUS.spd.k);
  } catch (e) { await edit(env, mid, `❌ ${String(e).slice(0, 250)}`, MENUS.spd.k); }
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
  const t = "<b>Pichhle 5 run</b>\n\n" + (r.data.workflow_runs || []).map((x) => {
    const s = x.status === "completed" ? x.conclusion : x.status;
    return `${ic[s] || "•"} ${x.name} #${x.run_number} — ${s}, ${ago(x.updated_at)} pehle`; }).join("\n");
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
  const d = JSON.parse(atob(r.data.content.replace(/\n/g, "")));
  const arr = d[key] || [];
  if (!arr.length) return edit(env, mid, `${title}: koi nahi ✅`, MENUS.file.k);
  await edit(env, mid, `<b>${title}</b> (${arr.length})\n\n` + arr.slice(0, 30).map((x) => `<code>${x}</code>`).join("\n"),
    key === "unused" ? kb([[{ text: "🗑 Sab hatao", callback_data: "rm_unused" }], back]) : MENUS.file.k);
}
async function doHealth(env, mid) {
  const o = [];
  const a = await gh(env, `/repos/${env.GH_REPO}`);
  o.push(a.ok ? "✅ GitHub token" : `❌ GitHub token — ${a.status}`);
  try { const r = await fetch(SITE + "/sitemap.xml"); o.push(r.ok ? "✅ Live site" : `❌ Live site — ${r.status}`); }
  catch { o.push("❌ Live site"); }
  try { await gapi(env, `https://searchconsole.googleapis.com/webmasters/v3/sites`, SCOPE_GSC); o.push("✅ Google Search Console key"); }
  catch (e) { o.push(`❌ GSC key — ${String(e).slice(0, 60)}`); }
  if (env.GA4_ID) { try { await ga4rt(env, { metrics: [{ name: "activeUsers" }] }); o.push("✅ GA4 key"); }
    catch (e) { o.push(`❌ GA4 — ${String(e).slice(0, 60)}`); } }
  const s = await gh(env, `/repos/${env.GH_REPO}/actions/runs?per_page=1`);
  const x = s.data?.workflow_runs?.[0];
  if (x) o.push(`${x.conclusion === "success" ? "✅" : "❌"} Aakhri run — ${x.name}: ${x.conclusion || x.status}`);
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
      const id = z.result?.[0]?.id;
      if (!id) return edit(env, mid, "Zone nahi mila — token me Zone permission chahiye.", MENUS.cf.k);
      const r = await (await fetch(`https://api.cloudflare.com/client/v4/zones/${id}/purge_cache`,
        { method: "POST", headers: { Authorization: "Bearer " + env.CF_TOKEN, "content-type": "application/json" },
          body: JSON.stringify({ purge_everything: true }) })).json();
      return edit(env, mid, r.success ? "✅ Cache purge ho gaya" : `❌ ${JSON.stringify(r.errors).slice(0, 150)}`, MENUS.cf.k);
    }
  } catch (e) { await edit(env, mid, `❌ ${String(e).slice(0, 200)}`, MENUS.cf.k); }
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
async function putMany(env, files, msg) {
  const R = `/repos/${env.GH_REPO}`;
  const ref = await gh(env, `${R}/git/ref/heads/main`);
  if (!ref.ok) return { ok: false, err: `ref ${ref.status}` };
  const baseSha = ref.data.object.sha;
  const baseCommit = await gh(env, `${R}/git/commits/${baseSha}`);
  if (!baseCommit.ok) return { ok: false, err: `commit ${baseCommit.status}` };

  const tree = [];
  for (let i = 0; i < files.length; i += 4) {          // 4-4 ke jatthe me, ek saath
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
  return { ok: upd.ok, err: upd.ok ? null : `ref-update ${upd.status}` };
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
    let files; try { files = unzipSync(bytes); } catch (e) { return say(env, `ZIP nahi khuli: ${String(e).slice(0,120)}`); }
    const batch = [], skip = [];
    for (const [p, data] of Object.entries(files)) {
      if (!data.length || p.endsWith("/")) continue;
      const t = routeOf(p); if (!t) { skip.push(p.split("/").pop()); continue; }
      batch.push([t, data]);
    }
    if (!batch.length) return say(env, `ZIP me koi pehchani file nahi mili.\n⚪ chhodi: ${skip.slice(0,10).join(", ")}`);
    if (batch.length > 300) return say(env, `ZIP me ${batch.length} file hain — 300 se zyada. Do hisson me bhejiye.`);

    await say(env, `⏳ ${batch.length} file chadha raha hoon — ek hi commit me…`);
    let r;
    try { r = await putMany(env, batch, `zip se ${batch.length} file: ${name}`); }
    catch (e) { return say(env, `❌ Nahi chadhi — <code>${String(e).slice(0, 300)}</code>`); }
    if (!r.ok) return say(env, `❌ Nahi chadhi — ${r.err}`);

    const list = batch.map(([t]) => t);
    return say(env,
      `<b>ZIP khol di</b> — ${name}\n\n✅ <b>${batch.length} file — ek commit me</b>\n` +
      list.slice(0, 20).map((x) => "• " + x).join("\n") +
      (list.length > 20 ? `\n…aur ${list.length - 20}` : "") +
      (skip.length ? `\n\n⚪ chhodi: ${skip.slice(0, 8).join(", ")}` : "") + "\n\nAb deploy?", btn);
  }

  const t = routeOf(name);
  if (!t) return say(env, `Ye file nahi pehchani: <code>${name}</code>`);
  const r = await putFile(env, t, bytes, `telegram se: ${t}`);
  return say(env, r.ok ? `${r.updated ? "♻️ Update" : "🆕 Nayi file"}\n<code>${t}</code>\n${(doc.file_size/1024).toFixed(0)} KB` : `❌ ${r.status}`, btn);
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
  if (d.startsWith("d:")) { await runWf(env, "deploy.yml", { indexnow: d.slice(2) });
    return edit(env, mid, `🚀 Deploy chalu — IndexNow: <code>${d.slice(2)}</code>\nAudit paas hoga tabhi live jaayega.`, MENUS.dep.k); }
  if (d === "do:status") return doStatus(env, mid);
  if (d === "do:pages") return doPages(env, mid);
  if (d === "do:site") return doSite(env, mid);
  if (d === "do:health") return doHealth(env, mid);
  if (d === "do:unused") return doState(env, mid, "unused", "Faltu file");
  if (d === "do:auditlast") return doState(env, mid, "todo", "Aaj dabane wale URL");
  if (d === "do:help") return edit(env, mid, HELP, MAIN);
  if (d === "do:pending") { await runWf(env, "pending.yml"); return edit(env, mid, "📋 Pending list ban rahi hai — 1 min me aayegi.", MAIN); }
  if (d === "do:audit") { await runWf(env, "audit.yml"); return edit(env, mid, "🛠 Audit chalu — natija Telegram par aayega.", MENUS.aud.k); }
  if (d === "do:report" || d === "do:daily") { await runWf(env, "daily.yml"); return edit(env, mid, "📑 Poora scan chalu — 3-5 minute me report aayegi.", MENUS.idx.k); }
  if (d === "do:sitemap") { await runWf(env, "daily.yml", {}); return edit(env, mid, "Sitemap submit ho jaayega (daily scan ke saath).", MENUS.idx.k); }
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
/deploy · /report · /audit · /health
/gsc 7 · /ga 28 — seedha data

<b>File chadhana</b>
HTML ya ZIP bhej dijiye — bot khud sahi folder me daal dega.

<b>Roz apne aap</b>
🔴 High priority · 🟠 Important · 🔵 Daily report
Indexing, clicks, users, speed, audit, nayi policy ki khabar — sab.`;

// ---------- router ----------
export default {
  async fetch(req, env) {
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
        { command: "deploy", description: "Site live karo" },
        { command: "audit", description: "Audit chalao" },
        { command: "health", description: "Sab theek hai?" },
        { command: "pages", description: "Kitne page hain" },
        { command: "get", description: "File wapas mangao" },
        { command: "help", description: "Madad" }]});
      return j({ webhook: hook, setWebhook: a, setMyCommands: b });
    }
    if (req.method !== "POST" || url.pathname !== `/tg/${env.HOOK_PATH}`) return new Response("Sab Hisaab bot");

    const u = await req.json();
    if (u.callback_query) {
      if (String(u.callback_query.message.chat.id) !== String(env.TG_CHAT)) return j({ ok: true });
      try { await onCb(env, u.callback_query); } catch (e) { await say(env, `❌ ${String(e).slice(0, 300)}`); }
      return j({ ok: true });
    }
    const m = u.message;
    if (!m || String(m.chat.id) !== String(env.TG_CHAT)) return j({ ok: true });
    if (m.document) {
      try { await handleDoc(env, m.document); }
      catch (e) { await say(env, `❌ File nahi chadhi\n<code>${String(e).slice(0, 400)}</code>`); }
      return j({ ok: true });
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
        else if (!(await sendFile(env, arg))) await say(env, `Nahi mili: <code>${arg}</code>`); }
      else if (cmd === "/deploy") { await runWf(env, "deploy.yml", { indexnow: arg === "sabhi" ? "sabhi" : arg === "chup" ? "koi-nahi" : "badle-hue" });
        await say(env, "🚀 Deploy chalu."); }
      else if (cmd === "/report") { await runWf(env, "daily.yml"); await say(env, "📑 Scan chalu — 3-5 min."); }
      else if (cmd === "/audit") { await runWf(env, "audit.yml"); await say(env, "🛠 Audit chalu."); }
      else if (cmd === "/pending") { await runWf(env, "pending.yml"); await say(env, "📋 Pending list ban rahi hai — 1 min."); }
      else if (cmd === "/watch") { await runWf(env, "watch.yml", { mode: "watch" }); await say(env, "👁 Nigraani chalu."); }
      else if (cmd === "/speed") { const r = await say(env, "⏳ …"); await doSpeed(env, r.result.message_id, "mobile"); }
      else if (["/gsc", "/ga", "/health", "/pages", "/status", "/site"].includes(cmd)) {
        const r = await say(env, "⏳ …", MAIN); const mid = r.result.message_id;
        if (cmd === "/gsc") await doGsc(env, mid, +arg || 7);
        else if (cmd === "/ga") await doGa(env, mid, +arg || 7, 1);
        else if (cmd === "/health") await doHealth(env, mid);
        else if (cmd === "/pages") await doPages(env, mid);
        else if (cmd === "/status") await doStatus(env, mid);
        else await doSite(env, mid);
      } else if (txt.startsWith("/")) await say(env, "Ye command nahi jaanta. /menu dekhiye.", MAIN);
    } catch (e) { await say(env, `❌ ${String(e).slice(0, 300)}`); }
    return j({ ok: true });
  },
};
