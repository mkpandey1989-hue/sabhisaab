/** Google service-account se access token — Cloudflare Worker ke andar hi (Web Crypto) */
const b64uToBytes = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};
const bytesToB64u = (buf) => {
  const u = new Uint8Array(buf); let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const strToB64u = (s) => bytesToB64u(new TextEncoder().encode(s));

let _cache = { token: null, exp: 0, scope: "" };

export function saInfo(env) {
  const raw = env.GSA_B64 ? new TextDecoder().decode(b64uToBytes(env.GSA_B64.replace(/\s/g, ""))) : null;
  if (!raw) throw new Error("GSA_B64 secret nahi mila");
  return JSON.parse(raw);
}

export async function googleToken(env, scope) {
  const now = Math.floor(Date.now() / 1000);
  if (_cache.token && _cache.exp > now + 60 && _cache.scope === scope) return _cache.token;

  const sa = saInfo(env);
  const header = strToB64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = strToB64u(JSON.stringify({
    iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", b64uToBytes(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key,
    new TextEncoder().encode(`${header}.${claim}`));
  const jwt = `${header}.${claim}.${bytesToB64u(sig)}`;

  const ac = new AbortController();
  const tt = setTimeout(() => ac.abort(), 12000);
  let r;
  try {
    r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
      signal: ac.signal,
    });
  } catch (e) { clearTimeout(tt); throw new Error("Google login me 12s se zyada lag gaya"); }
  clearTimeout(tt);
  const d = await r.json();
  if (!d.access_token) throw new Error("Google token nahi mila: " + JSON.stringify(d).slice(0, 200));
  _cache = { token: d.access_token, exp: now + (d.expires_in || 3600), scope };
  return d.access_token;
}

/** Har Google call par HARD TIMEOUT.
 *  Pehle koi timeout tha hi nahi — ek call atak jaati to bot hamesha ke liye chup ho jaata tha,
 *  aur user ko sirf "⏳ …" dikhta rehta tha. Ab 15 second se zyada koi call nahi chalti. */
export async function gapi(env, url, scope, body, ms = 15000) {
  const tok = await googleToken(env, scope);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  let r;
  try {
    r = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { Authorization: "Bearer " + tok, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(t);
    throw new Error(String(e).includes("abort") ? `Google ne ${ms / 1000}s me jawab nahi diya` : String(e));
  }
  clearTimeout(t);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(d).slice(0, 250)}`);
  return d;
}

export const SCOPE_GSC = "https://www.googleapis.com/auth/webmasters";
export const SCOPE_GA4 = "https://www.googleapis.com/auth/analytics.readonly";
