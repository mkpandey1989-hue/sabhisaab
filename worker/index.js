/**
 * Sab Hisaab — Telegram control bot  (v2)
 * Cloudflare Worker par chalta hai. VM par 0 load, ₹0 kharcha.
 *
 * Naya v2 me:
 *   - ZIP file bhejo -> bot khud kholkar har file sahi folder me daal dega
 *   - Ek saath kai file bhejo -> sab jama hoti rehti hain, phir /deploy
 *   - /report  -> GSC indexing report abhi maango
 *   - /health  -> saare token aur connection theek hain ya nahi
 */
import { unzipSync, strFromU8 } from "fflate";

const HELP = `<b>Sab Hisaab — control panel</b>

<b>Naya page chadhana</b>
HTML file ya ZIP seedha yahan bhej dijiye.
Bot khud sahi folder me daal dega. Kai file ek saath bhej sakte hain.
Uske baad /deploy

<b>Deploy</b>
/deploy — audit + deploy + badle URL IndexNow par
/deploy sabhi — saare URL IndexNow par (mahine me ek baar)
/deploy chup — deploy karo, IndexNow ko kuch mat bhejo

<b>Dekhna</b>
/status — pichhle 5 run ka haal
/site — live site theek chal rahi hai?
/pages — site par kitne page hain
/audit — sirf audit (deploy nahi)
/report — GSC indexing report abhi
/health — token aur connection ki jaanch

/help — ye list`;

const j = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });

async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return r.json();
}
const say = (env, text, extra = {}) =>
  tg(env, "sendMessage", { chat_id: env.TG_CHAT, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

async function gh(env, path, init = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json",
      "User-Agent": "sabhisaab-bot", "content-type": "application/json", ...(init.headers || {}),
    },
  });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (_) { d = { raw: t }; }
  return { ok: r.ok, status: r.status, data: d };
}

function b64(bytes) {
  let s = ""; const c = 0x8000;
  for (let i = 0; i < bytes.length; i += c) s += String.fromCharCode.apply(null, bytes.subarray(i, i + c));
  return btoa(s);
}
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} min pehle`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} ghante pehle` : `${Math.round(h / 24)} din pehle`;
};

/** file ka naam dekhkar tay karo ki repo me kahan jaayegi */
function routeOf(name) {
  const n = name.split("/").pop();
  if (/\.(html|webp|png|xml|txt|json|js)$/i.test(n)) {
    if (/^(audit|publish|indexnow|gsc|lib|notify|bing_submit|gsc_report)\.py$/i.test(n)) return "scripts/" + n;
    if (/\.(yml|yaml)$/i.test(n)) return ".github/workflows/" + n;
    return "site/" + n;
  }
  if (/\.py$/i.test(n)) return "scripts/" + n;
  if (/\.(yml|yaml)$/i.test(n)) return ".github/workflows/" + n;
  return null;
}

async function putFile(env, path, bytes, msg) {
  const cur = await gh(env, `/repos/${env.GH_REPO}/contents/${path}`);
  const sha = cur.ok ? cur.data.sha : undefined;
  const r = await gh(env, `/repos/${env.GH_REPO}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message: msg, content: b64(bytes), sha, branch: "main" }),
  });
  return { ok: r.ok, status: r.status, updated: !!sha, err: r.ok ? null : JSON.stringify(r.data).slice(0, 200) };
}

// ---------- commands ----------
async function cmdDeploy(env, arg) {
  const map = { sabhi: "sabhi", chup: "koi-nahi", "": "badle-hue" };
  const mode = map[arg] ?? "badle-hue";
  const r = await gh(env, `/repos/${env.GH_REPO}/actions/workflows/deploy.yml/dispatches`, {
    method: "POST", body: JSON.stringify({ ref: "main", inputs: { indexnow: mode } }),
  });
  if (!r.ok) return say(env, `Deploy shuru nahi hua (${r.status})\n<code>${JSON.stringify(r.data).slice(0, 300)}</code>`);
  return say(env, `<b>Deploy chalu</b> — IndexNow: <code>${mode}</code>\n\nAudit paas hoga tabhi live jaayega.\n~2 minute. /status se haal dekhein.`);
}

async function dispatch(env, wf, label, inputs = {}) {
  const r = await gh(env, `/repos/${env.GH_REPO}/actions/workflows/${wf}/dispatches`, {
    method: "POST", body: JSON.stringify({ ref: "main", inputs }),
  });
  return say(env, r.ok ? `<b>${label} chalu</b>` : `${label} shuru nahi hua (${r.status})`);
}

async function cmdStatus(env) {
  const r = await gh(env, `/repos/${env.GH_REPO}/actions/runs?per_page=5`);
  if (!r.ok) return say(env, `GitHub se jawab nahi mila (${r.status}).`);
  const runs = r.data.workflow_runs || [];
  if (!runs.length) return say(env, "Abhi tak koi run nahi hua.");
  const ic = { success: "✅", failure: "❌", cancelled: "⚪", in_progress: "⏳", queued: "⏳" };
  return say(env, "<b>Pichhle 5 run</b>\n\n" + runs.map((x) => {
    const s = x.status === "completed" ? x.conclusion : x.status;
    return `${ic[s] || "•"} <b>${x.name}</b> #${x.run_number}\n   ${s} · ${ago(x.updated_at)}`;
  }).join("\n"));
}

async function cmdSite(env) {
  const urls = ["/", "/percentage-calculator", "/sitemap.xml", "/contact", "/bigha-converter"];
  const out = [];
  for (const u of urls) {
    try {
      const t0 = Date.now();
      const res = await fetch("https://sabhisaab.com" + u, { cf: { cacheTtl: 0 } });
      out.push(`${res.ok ? "✅" : "❌"} <code>${u}</code> — ${res.status} · ${Date.now() - t0}ms`);
    } catch (_) { out.push(`❌ <code>${u}</code> — nahi khula`); }
  }
  return say(env, `<b>Live site check</b>\n\n${out.join("\n")}`);
}

async function cmdPages(env) {
  const r = await gh(env, `/repos/${env.GH_REPO}/contents/site`);
  if (!r.ok) return say(env, `Repo nahi padha ja saka (${r.status}).`);
  const f = r.data;
  const html = f.filter((x) => x.name.endsWith(".html")).length;
  const img = f.filter((x) => /\.(webp|png)$/.test(x.name)).length;
  let sm = 0;
  try { sm = ((await (await fetch("https://sabhisaab.com/sitemap.xml")).text()).match(/<loc>/g) || []).length; } catch (_) {}
  return say(env, `<b>Site ka hisaab</b>\n\nHTML page : <b>${html}</b>\nImages : <b>${img}</b>\nKul files : <b>${f.length}</b>\nSitemap URL : <b>${sm}</b>`);
}

async function cmdHealth(env) {
  const out = [];
  const a = await gh(env, `/repos/${env.GH_REPO}`);
  out.push(a.ok ? "✅ GitHub token — theek" : `❌ GitHub token — ${a.status} (naya banana padega)`);
  try {
    const r = await fetch("https://sabhisaab.com/sitemap.xml");
    out.push(r.ok ? "✅ Live site — chal rahi hai" : `❌ Live site — ${r.status}`);
  } catch (_) { out.push("❌ Live site — nahi khuli"); }
  const s = await gh(env, `/repos/${env.GH_REPO}/actions/runs?per_page=1`);
  if (s.ok && s.data.workflow_runs?.length) {
    const x = s.data.workflow_runs[0];
    const c = x.status === "completed" ? x.conclusion : x.status;
    out.push(`${c === "success" ? "✅" : c === "failure" ? "❌" : "⏳"} Aakhri run — ${x.name}: ${c}, ${ago(x.updated_at)}`);
  }
  out.push("✅ Telegram — ye message aa gaya");
  return say(env, `<b>Jaanch</b>\n\n${out.join("\n")}\n\n<i>Cloudflare token ki jaanch deploy chalane par hi hoti hai.</i>`);
}

// ---------- file / zip ----------
async function fetchTgFile(env, file_id) {
  const f = await tg(env, "getFile", { file_id });
  if (!f.ok) return null;
  const r = await fetch(`https://api.telegram.org/file/bot${env.TG_TOKEN}/${f.result.file_path}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function handleDoc(env, doc) {
  const name = doc.file_name || "";
  if (doc.file_size > 15000000) return say(env, "File bahut badi hai (15 MB se zyada).");
  const bytes = await fetchTgFile(env, doc.file_id);
  if (!bytes) return say(env, "File download nahi hui.");

  // ---- ZIP ----
  if (/\.zip$/i.test(name)) {
    let files;
    try { files = unzipSync(bytes); }
    catch (e) { return say(env, `ZIP khul nahi paayi: <code>${String(e).slice(0, 150)}</code>`); }
    const ok = [], skip = [], fail = [];
    for (const [p, data] of Object.entries(files)) {
      if (!data.length || p.endsWith("/")) continue;
      const target = routeOf(p);
      if (!target) { skip.push(p.split("/").pop()); continue; }
      const r = await putFile(env, target, data, `zip se: ${target}`);
      (r.ok ? ok : fail).push(`${target}${r.ok && r.updated ? " (update)" : ""}${r.ok ? "" : " — " + r.status}`);
    }
    let msg = `<b>ZIP khol di</b> — <code>${name}</code>\n\n`;
    if (ok.length) msg += `✅ <b>${ok.length} file chadh gayi</b>\n` + ok.slice(0, 25).map((x) => `• ${x}`).join("\n") + (ok.length > 25 ? `\n…aur ${ok.length - 25}` : "") + "\n\n";
    if (skip.length) msg += `⚪ chhodi (pehchani nahi): ${skip.slice(0, 10).join(", ")}\n\n`;
    if (fail.length) msg += `❌ nahi chadhi:\n` + fail.slice(0, 10).map((x) => `• ${x}`).join("\n") + "\n\n";
    msg += "Ab <b>/deploy</b> bhejiye.";
    return say(env, msg, { reply_markup: { inline_keyboard: [[{ text: "Abhi deploy karein", callback_data: "deploy" }]] } });
  }

  // ---- ek file ----
  const target = routeOf(name);
  if (!target) return say(env, `Ye file nahi pehchani: <code>${name}</code>\n\n.html, .webp, .png, .py, .yml, .xml, .txt, .json ya .zip bhejiye.`);
  const r = await putFile(env, target, bytes, `telegram se: ${target}`);
  if (!r.ok) return say(env, `GitHub par nahi chadhi (${r.status})\n<code>${r.err}</code>`);
  return say(env,
    `${r.updated ? "♻️ <b>Update ho gaya</b>" : "🆕 <b>Nayi file chadh gayi</b>"}\n\n<code>${target}</code>\n${(doc.file_size / 1024).toFixed(0)} KB\n\nAur file bhejni ho to bhej dijiye, warna <b>/deploy</b>.`,
    { reply_markup: { inline_keyboard: [[{ text: "Abhi deploy karein", callback_data: "deploy" }]] } });
}

// ---------- router ----------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/setup") {
      if (url.searchParams.get("key") !== env.SETUP_KEY) return new Response("nope", { status: 403 });
      const hook = `${url.origin}/tg/${env.HOOK_PATH}`;
      const r = await tg(env, "setWebhook", { url: hook, allowed_updates: ["message", "callback_query"] });
      return j({ webhook: hook, telegram: r });
    }
    if (req.method !== "POST" || url.pathname !== `/tg/${env.HOOK_PATH}`) {
      return new Response("Sab Hisaab bot", { status: 200 });
    }

    const u = await req.json();

    if (u.callback_query) {
      const q = u.callback_query;
      await tg(env, "answerCallbackQuery", { callback_query_id: q.id });
      if (String(q.message.chat.id) !== String(env.TG_CHAT)) return j({ ok: true });
      if (q.data === "deploy") await cmdDeploy(env, "");
      return j({ ok: true });
    }

    const m = u.message;
    if (!m) return j({ ok: true });
    if (String(m.chat.id) !== String(env.TG_CHAT)) return j({ ok: true });

    if (m.document) { await handleDoc(env, m.document); return j({ ok: true }); }

    const text = (m.text || "").trim();
    const [cmd, ...rest] = text.split(/\s+/);
    const arg = (rest[0] || "").toLowerCase();

    switch (cmd.toLowerCase().replace(/@.*$/, "")) {
      case "/start":
      case "/help":   await say(env, HELP); break;
      case "/deploy": await cmdDeploy(env, arg); break;
      case "/status": await cmdStatus(env); break;
      case "/site":   await cmdSite(env); break;
      case "/pages":  await cmdPages(env); break;
      case "/health": await cmdHealth(env); break;
      case "/audit":  await dispatch(env, "audit.yml", "Audit"); break;
      case "/report": await dispatch(env, "gsc.yml", "GSC report"); break;
      default:
        if (text.startsWith("/")) await say(env, "Ye command nahi jaanta. /help dekhiye.");
    }
    return j({ ok: true });
  },
};
