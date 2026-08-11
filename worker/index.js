/**
 * Sab Hisaab — Telegram control bot
 * Cloudflare Worker par chalta hai. VM par 0 load, ₹0 kharcha.
 *
 * Ye bot GitHub ko command deta hai; GitHub Actions kaam karta hai.
 * Isliye site, deploy, audit — sab Telegram se chalta hai.
 */

const HELP = `<b>Sab Hisaab — control panel</b>

<b>Deploy</b>
/deploy — audit + deploy + badle URL IndexNow par
/deploy sabhi — saare 231 URL IndexNow par (mahine me ek baar bas)
/deploy chup — deploy karo, IndexNow ko kuch mat bhejo

<b>Dekhna</b>
/status — pichhle 5 run ka haal
/site — live site theek chal rahi hai?
/pages — site par kitne page hain
/audit — sirf audit chalao (deploy nahi)

<b>Naya page</b>
HTML file seedha yahan bhej dijiye.
Bot use site/ me daal dega, phir /deploy bol dijiye.

/help — ye list`;

// ---------- helpers ----------
const j = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });

async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function say(env, text, extra = {}) {
  return tg(env, "sendMessage", {
    chat_id: env.TG_CHAT,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

async function gh(env, path, init = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "sabhisaab-bot",
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const t = await r.text();
  let d = null;
  try { d = t ? JSON.parse(t) : null; } catch (_) { d = { raw: t }; }
  return { ok: r.ok, status: r.status, data: d };
}

function b64(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} min pehle`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} ghante pehle` : `${Math.round(h / 24)} din pehle`;
};

// ---------- commands ----------
async function cmdDeploy(env, arg) {
  const map = { sabhi: "sabhi", chup: "koi-nahi", "": "badle-hue" };
  const mode = map[arg] ?? "badle-hue";
  const r = await gh(env, `/repos/${env.GH_REPO}/actions/workflows/deploy.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { indexnow: mode } }),
  });
  if (!r.ok) return say(env, `Deploy shuru nahi hua.\nGitHub: ${r.status}\n<code>${JSON.stringify(r.data).slice(0, 300)}</code>`);
  return say(env,
    `<b>Deploy chalu</b> — IndexNow: <code>${mode}</code>\n\n` +
    `Audit paas hoga tabhi live jaayega.\n~2 minute me natija aayega.\n\n/status se haal dekh sakte hain.`);
}

async function cmdStatus(env) {
  const r = await gh(env, `/repos/${env.GH_REPO}/actions/runs?per_page=5`);
  if (!r.ok) return say(env, `GitHub se jawab nahi mila (${r.status}).`);
  const runs = r.data.workflow_runs || [];
  if (!runs.length) return say(env, "Abhi tak koi run nahi hua.");
  const ic = { success: "✅", failure: "❌", cancelled: "⚪", in_progress: "⏳", queued: "⏳" };
  const lines = runs.map((x) => {
    const s = x.status === "completed" ? x.conclusion : x.status;
    return `${ic[s] || "•"} <b>${x.name}</b> #${x.run_number}\n   ${s} · ${ago(x.updated_at)}`;
  });
  return say(env, `<b>Pichhle 5 run</b>\n\n${lines.join("\n")}`);
}

async function cmdSite(env) {
  const urls = ["/", "/percentage-calculator", "/sitemap.xml", "/contact", "/bigha-converter"];
  const out = [];
  for (const u of urls) {
    try {
      const t0 = Date.now();
      const res = await fetch("https://sabhisaab.com" + u, { cf: { cacheTtl: 0 } });
      out.push(`${res.ok ? "✅" : "❌"} <code>${u}</code> — ${res.status} · ${Date.now() - t0}ms`);
    } catch (e) {
      out.push(`❌ <code>${u}</code> — nahi khula`);
    }
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
  try {
    const s = await fetch("https://sabhisaab.com/sitemap.xml");
    sm = ((await s.text()).match(/<loc>/g) || []).length;
  } catch (_) {}
  return say(env,
    `<b>Site ka hisaab</b>\n\n` +
    `HTML page : <b>${html}</b>\nImages : <b>${img}</b>\nKul files : <b>${f.length}</b>\n` +
    `Sitemap URL : <b>${sm}</b>`);
}

async function cmdAudit(env) {
  const r = await gh(env, `/repos/${env.GH_REPO}/actions/workflows/audit.yml/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main" }),
  });
  if (!r.ok) return say(env, `Audit shuru nahi hua (${r.status}).`);
  return say(env, "<b>Audit chalu</b> — sirf jaanch, deploy nahi hoga.\n~1 minute.");
}

// ---------- file upload ----------
async function handleDoc(env, doc) {
  const name = doc.file_name || "";
  if (!name.endsWith(".html")) {
    return say(env, `Sirf <code>.html</code> file chalegi. Aapne bheji: <code>${name}</code>`);
  }
  if (doc.file_size > 900000) return say(env, "File bahut badi hai (900 KB se zyada).");

  const f = await tg(env, "getFile", { file_id: doc.file_id });
  if (!f.ok) return say(env, "File download nahi hui.");
  const bin = await fetch(`https://api.telegram.org/file/bot${env.TG_TOKEN}/${f.result.file_path}`);
  const bytes = new Uint8Array(await bin.arrayBuffer());
  const content = b64(bytes);

  const path = `site/${name}`;
  const cur = await gh(env, `/repos/${env.GH_REPO}/contents/${path}`);
  const sha = cur.ok ? cur.data.sha : undefined;

  const put = await gh(env, `/repos/${env.GH_REPO}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `${sha ? "update" : "naya page"}: ${name} (telegram se)`,
      content,
      sha,
      branch: "main",
    }),
  });
  if (!put.ok) {
    return say(env, `GitHub par nahi chadhi (${put.status})\n<code>${JSON.stringify(put.data).slice(0, 300)}</code>`);
  }
  return say(env,
    `${sha ? "♻️ <b>Update ho gaya</b>" : "🆕 <b>Naya page chadh gaya</b>"}\n\n` +
    `<code>${path}</code>\n${(doc.file_size / 1024).toFixed(0)} KB\n\n` +
    `Ab <b>/deploy</b> bhejiye — audit paas hote hi live ho jaayega.`,
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
    if (String(m.chat.id) !== String(env.TG_CHAT)) {
      return j({ ok: true }); // sirf aapki chat, aur kisi ki nahi
    }

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
      case "/audit":  await cmdAudit(env); break;
      default:
        if (text.startsWith("/")) await say(env, "Ye command nahi jaanta. /help dekhiye.");
    }
    return j({ ok: true });
  },
};
