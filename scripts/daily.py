#!/usr/bin/env python3
"""
Sab Hisaab — roz ka poora nigraani engine (GitHub Actions me chalta hai)

Kya-kya dekhta hai:
  1. GSC  — clicks, impressions, CTR, position (kal vs pichhla hafta)
  2. GSC  — top pages / queries / countries / devices
  3. GSC  — kaunsa page NAYA index hua, kaunsa NIKAL gaya (roz ka farak)
  4. GSC  — coverage: kis wajah se kitne page atke (category-wise)
  5. GA4  — users, sessions, kahan se aaye, kaunse desh, ghante ka hisaab
  6. Speed — PageSpeed Insights (mobile + desktop), girne par alert
  7. Audit — spelling/heading/duplicate kitne bache
  8. Khabar — Google/Bing/Cloudflare/GitHub ki nayi policy ya badlaav
  9. Limit  — Cloudflare/GitHub quota kitna bacha
 10. Faltu file — jo kisi page se linked nahi

Report teen hisson me: 🔴 High priority, 🟠 Important, 🔵 Daily
High priority ka jawab na dein to ROZ dohraya jaata hai.
"""
import os, re, sys, json, time, base64, datetime, urllib.parse, urllib.request, urllib.error
import html as _html

SITE = "https://sabhisaab.com"
PROP = os.environ.get("GSC_PROPERTY", "sc-domain:sabhisaab.com")
GA4  = os.environ.get("GA4_PROPERTY_ID", "")
STATE_DIR = "state"
S_MAIN, S_ALERT = f"{STATE_DIR}/daily.json", f"{STATE_DIR}/alerts.json"
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

def today():  return datetime.datetime.now(IST).date()
def dstr(d):  return d.isoformat()

# ---------------------------------------------------------------- utils
def load(p, dflt):
    try:
        with open(p, encoding="utf-8") as f: return json.load(f)
    except Exception: return dflt

def save(p, o):
    os.makedirs(STATE_DIR, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f: json.dump(o, f, indent=1, ensure_ascii=False)

def esc(x):
    """Telegram HTML mode ke liye — bina iske ek '&' poora message gira deta hai."""
    return _html.escape(str(x), quote=False)

def _send(tok, chat, txt, buttons, as_html=True):
    body = {"chat_id": chat, "text": txt, "disable_web_page_preview": True}
    if as_html: body["parse_mode"] = "HTML"
    if buttons: body["reply_markup"] = {"inline_keyboard": buttons}
    req = urllib.request.Request("https://api.telegram.org/bot%s/sendMessage" % tok,
          data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=25).read()

def _chunks(text, limit=3500):
    """Line par kaato, beech me tag mat todo — warna Telegram poora message reject karta hai."""
    out, cur = [], ""
    for line in text.split("\n"):
        if len(line) > limit:
            if cur: out.append(cur); cur = ""
            for i in range(0, len(line), limit): out.append(line[i:i+limit])
            continue
        if cur and len(cur) + len(line) + 1 > limit:
            out.append(cur); cur = line
        else:
            cur = line if not cur else cur + "\n" + line
    if cur: out.append(cur)
    return out or [text[:limit]]

TG_FAILS = []
PEND_MSG = []

def tg(text, buttons=None):
    """Report kabhi gayab nahi honi chahiye: HTML fail ho to plain text me bhejta hai."""
    tok, chat = os.environ.get("TG_TOKEN"), os.environ.get("TG_CHAT")
    if not tok or not chat:
        print(text); return
    parts = _chunks(text)
    for k, part in enumerate(parts):
        btn = buttons if (buttons and k == len(parts) - 1) else None
        try:
            _send(tok, chat, part, btn, True); continue
        except Exception as e:
            why = ""
            try: why = e.read().decode("utf-8", "ignore")[:200]
            except Exception: why = str(e)[:200]
            print("tg HTML fail:", why)
        plain = re.sub(r"<[^>]+>", "", part)
        for a, b in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&nbsp;", " "), ("&middot;", "-")):
            plain = plain.replace(a, b)
        try:
            _send(tok, chat, plain, btn, False)
            print("plain text me bhej diya")
        except Exception as e2:
            print("tg plain bhi fail:", str(e2)[:200])
            TG_FAILS.append(why)

def creds(scopes):
    from google.oauth2 import service_account
    raw = os.environ.get("GOOGLE_SA_JSON") or ""
    if not raw and os.environ.get("GOOGLE_SA_JSON_B64"):
        raw = base64.b64decode(os.environ["GOOGLE_SA_JSON_B64"]).decode()
    return service_account.Credentials.from_service_account_info(json.loads(raw), scopes=scopes)

def gsc():
    from googleapiclient.discovery import build
    return build("searchconsole", "v1",
                 credentials=creds(["https://www.googleapis.com/auth/webmasters"]),
                 cache_discovery=False)

def n(x, w=0):
    try: return f"{x:,.{w}f}"
    except Exception: return str(x)

def arrow(now, before, less_is_better=False):
    """% ka farak. less_is_better=True jahan kam hona achha ho (galti, error)."""
    if before in (None, 0): return ""
    p = (now - before) / before * 100
    good = p < -2 if less_is_better else p > 2
    bad  = p > 2 if less_is_better else p < -2
    ic = "🟢" if good else ("🔴" if bad else "⚪")
    return f"  {ic} {p:+.0f}%"

# ---------------------------------------------------------------- 1-2. GSC search data
def gsc_query(svc, start, end, dims=None, limit=10):
    body = {"startDate": dstr(start), "endDate": dstr(end), "rowLimit": limit}
    if dims: body["dimensions"] = dims
    try:
        return svc.searchanalytics().query(siteUrl=PROP, body=body).execute().get("rows", [])
    except Exception as e:
        print("gsc query fail:", str(e)[:150]); return []

def gsc_totals(svc, start, end):
    r = gsc_query(svc, start, end)
    if not r: return dict(c=0, i=0, ctr=0, pos=0)
    x = r[0]
    return dict(c=x.get("clicks", 0), i=x.get("impressions", 0),
                ctr=x.get("ctr", 0) * 100, pos=x.get("position", 0))

# ---------------------------------------------------------------- 3-4. index status
def index_scan(svc, urls, budget, st):
    cur = st.get("cursor", 0) % max(len(urls), 1)
    batch = [urls[(cur + i) % len(urls)] for i in range(min(budget, len(urls)))]
    st["cursor"] = (cur + len(batch)) % max(len(urls), 1)
    old = st.get("status", {})
    new, errs = dict(old), 0
    for u in batch:
        try:
            r = svc.urlInspection().index().inspect(body={
                "inspectionUrl": u, "siteUrl": PROP, "languageCode": "en"}).execute()
            idx = r["inspectionResult"]["indexStatusResult"]
            new[u] = {"ok": idx.get("verdict") == "PASS",
                      "why": idx.get("coverageState", "?"),
                      "robots": idx.get("robotsTxtState", ""),
                      "day": dstr(today())}
        except Exception as e:
            errs += 1
            if "quota" in str(e).lower() or "429" in str(e): break
        time.sleep(0.12)
    gained = [u for u in batch if new.get(u, {}).get("ok") and not old.get(u, {}).get("ok") and u in old]
    lost   = [u for u in batch if not new.get(u, {}).get("ok") and old.get(u, {}).get("ok")]
    st["status"] = new
    return new, gained, lost, len(batch), errs

def coverage(status):
    c = {}
    for u, v in status.items():
        if v.get("ok"): continue
        c.setdefault(v.get("why", "?"), []).append(u)
    return dict(sorted(c.items(), key=lambda kv: -len(kv[1])))

# ---------------------------------------------------------------- 5. GA4
def ga4_run(body):
    if not GA4: return None
    from googleapiclient.discovery import build
    try:
        svc = build("analyticsdata", "v1beta",
                    credentials=creds(["https://www.googleapis.com/auth/analytics.readonly"]),
                    cache_discovery=False)
        return svc.properties().runReport(property="properties/" + GA4, body=body).execute()
    except Exception as e:
        print("ga4 fail:", str(e)[:200]); return None

def ga4_simple(days_back_from, days_back_to, dims=None, metrics=None, limit=8):
    return ga4_run({
        "dateRanges": [{"startDate": f"{days_back_from}daysAgo", "endDate": f"{days_back_to}daysAgo"}],
        "dimensions": [{"name": d} for d in (dims or [])],
        "metrics": [{"name": m} for m in (metrics or ["activeUsers", "sessions"])],
        "limit": limit,
    })

def ga4_rows(r):
    if not r or "rows" not in r: return []
    return [([d["value"] for d in row.get("dimensionValues", [])],
             [m["value"] for m in row.get("metricValues", [])]) for row in r["rows"]]

def ga4_total(r, idx=0):
    try: return float(r["totals"][0]["metricValues"][idx]["value"])
    except Exception: return 0.0

# ---------------------------------------------------------------- 6. speed
def psi(url, strategy):
    key = os.environ.get("PSI_KEY", "")
    q = urllib.parse.urlencode({"url": url, "strategy": strategy, "category": "performance",
                                **({"key": key} if key else {})})
    try:
        d = json.load(urllib.request.urlopen(
            "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?" + q, timeout=90))
        lh = d["lighthouseResult"]
        au = lh["audits"]
        return {
            "score": round(lh["categories"]["performance"]["score"] * 100),
            "lcp": au["largest-contentful-paint"]["numericValue"] / 1000,
            "cls": au["cumulative-layout-shift"]["numericValue"],
            "tbt": au["total-blocking-time"]["numericValue"],
        }
    except Exception as e:
        print("psi fail", strategy, str(e)[:120]); return None

# ---------------------------------------------------------------- 8. khabar (RSS)
FEEDS = [
    ("Google Search",  "https://developers.google.com/search/blog/feed.xml"),
    ("Bing Webmaster", "https://blogs.bing.com/webmaster/feed"),
    ("Cloudflare",     "https://developers.cloudflare.com/changelog/index.xml"),
    ("GitHub",         "https://github.blog/changelog/feed/"),
]
HOT = ("deprecat", "retir", "shut down", "sunset", "breaking", "policy", "spam",
       "core update", "limit", "quota", "pricing", "price", "removed", "migrate",
       "end of life", "discontinu")

def news(seen):
    out, new_seen = [], dict(seen)
    for name, url in FEEDS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 SabHisaabBot"})
            xml = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "ignore")
        except Exception:
            continue
        items = re.findall(r"<(?:item|entry)>(.*?)</(?:item|entry)>", xml, re.S)[:12]
        for it in items:
            t = re.search(r"<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", it, re.S)
            l = re.search(r'<link[^>]*href="([^"]+)"', it) or re.search(r"<link>(.*?)</link>", it, re.S)
            if not t: continue
            title = re.sub(r"<[^>]+>", "", t.group(1)).strip()
            link = (l.group(1) if l else "").strip()
            key = (name + "|" + title)[:180]
            if key in seen: continue
            new_seen[key] = dstr(today())
            low = title.lower()
            if any(h in low for h in HOT):
                out.append((name, title, link))
    # purani yaad 60 din baad hata do
    cut = dstr(today() - datetime.timedelta(days=60))
    new_seen = {k: v for k, v in new_seen.items() if v >= cut}
    return out, new_seen

# ---------------------------------------------------------------- 9. limits
def cf_limits():
    tok, acct = os.environ.get("CF_TOKEN"), os.environ.get("CF_ACCT")
    if not tok or not acct: return []
    out = []
    try:
        req = urllib.request.Request(
            f"https://api.cloudflare.com/client/v4/accounts/{acct}/pages/projects",
            headers={"Authorization": "Bearer " + tok})
        d = json.load(urllib.request.urlopen(req, timeout=25))
        for p in d.get("result", []):
            if p.get("name") == "sabhisaab":
                dep = p.get("latest_deployment") or {}
                out.append(("Cloudflare Pages", "theek", dep.get("latest_stage", {}).get("status", "?")))
    except Exception as e:
        out.append(("Cloudflare", "jaanch fail", str(e)[:60]))
    return out

# ---------------------------------------------------------------- 10. faltu file
def unused_files():
    site = "site"
    if not os.path.isdir(site): return []
    html = [f for f in os.listdir(site) if f.endswith(".html")]
    blob = ""
    for f in html:
        try: blob += open(os.path.join(site, f), encoding="utf-8", errors="ignore").read()
        except Exception: pass
    try: blob += open(os.path.join(site, "sitemap.xml"), encoding="utf-8").read()
    except Exception: pass
    for extra in ("manifest.json", "llms.txt", "sw.js", "install-app.js", "_headers", "robots.txt"):
        try: blob += open(os.path.join(site, extra), encoding="utf-8", errors="ignore").read()
        except Exception: pass
    out = []
    for f in os.listdir(site):
        if f.endswith((".html", ".xml", ".txt", ".json", ".js")) or f.startswith("_"): continue
        if f not in blob: out.append(f)
    return sorted(out)

# ---------------------------------------------------------------- audit
def audit_summary():
    try:
        d = load("audit_result.json", None)
        if not d: return None
        return d.get("errors", 0), d.get("warnings", 0), d.get("warn_detail", {})
    except Exception: return None

# ---------------------------------------------------------------- main
def main():
    st = load(S_MAIN, {})
    alerts = load(S_ALERT, {"open": {}, "seen_news": {}})
    hi, imp, day = [], [], []
    y  = today() - datetime.timedelta(days=1)
    d3 = today() - datetime.timedelta(days=3)     # GSC 2-3 din peeche rehta hai
    svc = None
    try: svc = gsc()
    except Exception as e: hi.append(f"❌ GSC key kaam nahi kar rahi — <code>{esc(str(e)[:90])}</code>")

    # ---------- sitemap roz dobara submit ----------
    if svc:
        try:
            svc.sitemaps().submit(siteUrl=PROP, feedpath=SITE + "/sitemap.xml").execute()
            st["sitemap_day"] = dstr(today())
        except Exception as e:
            imp.append(f"🟠 Sitemap submit fail — <code>{esc(str(e)[:80])}</code>")

    # ---------- GSC search ----------
    if svc:
        cur  = gsc_totals(svc, d3 - datetime.timedelta(days=6), d3)
        prev = gsc_totals(svc, d3 - datetime.timedelta(days=13), d3 - datetime.timedelta(days=7))
        day.append("<b>🔍 Google Search (7 din)</b>")
        day.append(f"Clicks : <b>{n(cur['c'])}</b>{arrow(cur['c'], prev['c'])}")
        day.append(f"Impr.  : <b>{n(cur['i'])}</b>{arrow(cur['i'], prev['i'])}")
        day.append(f"CTR    : <b>{cur['ctr']:.2f}%</b>   Position : <b>{cur['pos']:.1f}</b>")
        st["gsc_last"] = cur
        if prev["c"] > 10 and cur["c"] < prev["c"] * 0.5:
            hi.append(f"🔴 Google clicks aadhe se kam ho gaye — {n(prev['c'])} se {n(cur['c'])}")

        for label, dim, k in (("Top pages", "page", 5), ("Top queries", "query", 5),
                              ("Desh", "country", 4), ("Device", "device", 3)):
            rows = gsc_query(svc, d3 - datetime.timedelta(days=6), d3, [dim], k)
            if not rows: continue
            day.append(f"\n<b>{label}</b>")
            for r in rows:
                nm = r["keys"][0].replace(SITE, "") or "/"
                day.append(f"• {esc(nm[:44])} — {n(r.get('clicks',0))} click, {n(r.get('impressions',0))} impr")

    # ---------- indexing ----------
    urls = []
    try:
        sm = open("site/sitemap.xml", encoding="utf-8").read()
        urls = re.findall(r"<loc>([^<]+)</loc>", sm)
    except Exception: pass

    if svc and urls:
        status, gained, lost, done, errs = index_scan(svc, urls, int(os.environ.get("GSC_BUDGET", "150")), st)
        ok = sum(1 for v in status.values() if v.get("ok"))
        day.append(f"\n<b>📑 Indexing</b>")
        day.append(f"Site par URL : <b>{len(urls)}</b>   |   Check ho chuke : <b>{len(status)}</b>")
        day.append(f"Indexed : <b>{ok}</b>   |   Baaki : <b>{len(status)-ok}</b>")
        day.append(f"Aaj scan : {done} (error {errs})")

        if gained:
            imp.append(f"🟢 <b>{len(gained)} naya page INDEX hua</b>")
            imp += [f"• <code>{u}</code>" for u in gained[:10]]
        if lost:
            hi.append(f"🔴 <b>{len(lost)} page index se NIKAL gaya</b>")
            hi += [f"• <code>{u}</code>\n  {esc(status[u]['why'])}" for u in lost[:10]]

        # kal jo 12 URL diye the, unme se kitne ban gaye
        prev_todo = st.get("todo", [])
        if prev_todo:
            became = [u for u in prev_todo if status.get(u, {}).get("ok")]
            still  = [u for u in prev_todo if u in status and not status[u].get("ok")]
            day.append(f"\nKal diye <b>{len(prev_todo)}</b> URL me se — index hue : <b>{len(became)}</b>, "
                       f"abhi baaki : <b>{len(still)}</b>")

        # ---- Google ko abhi tak pata hi nahi (kabhi inspect nahi hue) ----
        never = [u for u in urls if u not in status]
        if never:
            day.append(f"Abhi jaanch hi nahi hui : <b>{len(never)}</b>")

        # ---- Roz ka itihaas — indexed count ka trend ----
        hist = st.get("hist", [])
        tdy = dstr(today())
        hist = [h for h in hist if h.get("d") != tdy]
        hist.append({"d": tdy, "total": len(urls), "ok": ok, "pending": len(status) - ok})
        hist = hist[-60:]
        st["hist"] = hist
        if len(hist) > 1:
            y = hist[-2]
            day.append(f"Kal ke muqable : indexed {ok - y.get('ok', ok):+d}, "
                       f"pending {(len(status)-ok) - y.get('pending', 0):+d}")
        w = [h for h in hist if h["d"] <= tdy][-8:]
        if len(w) > 2:
            day.append("\n<b>Pichhle din — indexed / pending</b>")
            for h in w:
                day.append(f"• {h['d']} — {h['ok']} / {h.get('pending', 0)}")

        cov = coverage(status)
        if cov:
            day.append("\n<b>Kis wajah se atke (category-wise)</b>")
            for why, lst in list(cov.items())[:10]:
                day.append(f"• {esc(why)} — <b>{len(lst)}</b>")

            # ---- POORI pending list, wajah ke hisaab se ----
            pend = ["\n<b>📋 Pending URL — poori list</b>"]
            for why, lst in cov.items():
                pend.append(f"\n<b>{esc(why)}</b> — {len(lst)}")
                for u in lst[:40]:
                    pend.append(f"<code>{u}</code>")
                if len(lst) > 40:
                    pend.append(f"…aur {len(lst)-40}")
            if never:
                pend.append(f"\n<b>Google ko abhi pata nahi (jaanch baaki)</b> — {len(never)}")
                for u in never[:40]:
                    pend.append(f"<code>{u}</code>")
                if len(never) > 40:
                    pend.append(f"…aur {len(never)-40}")
            PEND_MSG.append("\n".join(pend))

            top = list(cov.items())[0]
            day.append(f"\n<b>Aaj ye {min(12,len(top[1]))} dabaayein</b> — <i>{esc(top[0])}</i>")
            for u in top[1][:12]:
                day.append(f"<code>{u}</code>")
            st["todo"] = top[1][:12]

    # ---------- GA4 ----------
    if GA4:
        r7  = ga4_simple(7, 1, [], ["activeUsers", "sessions", "screenPageViews"])
        r14 = ga4_simple(14, 8, [], ["activeUsers"])
        if r7:
            u7, pv = ga4_total(r7, 0), ga4_total(r7, 2)
            u14 = ga4_total(r14, 0) if r14 else 0
            day.append("\n<b>📊 Analytics (7 din)</b>")
            day.append(f"Users : <b>{n(u7)}</b>{arrow(u7, u14)}")
            day.append(f"Sessions : <b>{n(ga4_total(r7,1))}</b>   Pageviews : <b>{n(pv)}</b>")
            if u14 > 20 and u7 < u14 * 0.6:
                hi.append(f"🔴 Users 40%+ gir gaye — {n(u14)} se {n(u7)}")
            st["ga_last"] = u7
            for label, dim in (("Kahan se aaye", "sessionDefaultChannelGroup"),
                               ("Desh", "country"), ("Sabse zyada dekhe page", "pagePath")):
                rr = ga4_simple(7, 1, [dim], ["activeUsers"], 5)
                rows = ga4_rows(rr)
                if rows:
                    day.append(f"\n<b>{label}</b>")
                    for dv, mv in rows:
                        day.append(f"• {esc(dv[0][:40])} — {n(float(mv[0]))}")
        rt = ga4_run({"metrics": [{"name": "activeUsers"}]})
        if rt: day.append(f"\nAbhi site par : <b>{n(ga4_total(rt))}</b> log")

    # ---------- speed ----------
    m, dsk = psi(SITE, "mobile"), psi(SITE, "desktop")
    if not m:
        day.append("\n<b>⚡ Speed</b>")
        day.append("PageSpeed se jawab nahi mila." + ("" if os.environ.get("PSI_KEY")
                   else " PSI_KEY secret nahi laga — bina key ke Google quota bahut jaldi khatam kar deta hai."))
    if m:
        old = st.get("psi_mobile")
        day.append(f"\n<b>⚡ Speed</b>")
        day.append(f"Mobile : <b>{m['score']}</b>{arrow(m['score'], old)}   Desktop : <b>{dsk['score'] if dsk else '?'}</b>")
        day.append(f"LCP {m['lcp']:.1f}s · CLS {m['cls']:.3f} · TBT {m['tbt']:.0f}ms")
        if old and m["score"] < old - 12:
            hi.append(f"🔴 Mobile speed gir gaya — {old} se {m['score']}")
        if m["score"] < 50:
            imp.append(f"🟠 Mobile speed sirf {m['score']} — dekhna padega")
        st["psi_mobile"] = m["score"]

    # ---------- audit ----------
    a = audit_summary()
    if a:
        e, w, wd = a
        pe, pw = st.get("aud_e"), st.get("aud_w")
        day.append(f"\n<b>🛠 Audit</b>")
        day.append(f"Error : <b>{e}</b>{arrow(e, pe, True)}   Warning : <b>{w}</b>{arrow(w, pw, True)}")
        if pw is not None:
            fixed = (pe - e if pe is not None else 0) + (pw - w)
            if fixed > 0:  imp.append(f"🟢 Kal se <b>{fixed} galti theek</b> ho gayi (spelling/heading/duplicate)")
            elif fixed < 0: imp.append(f"🟠 Kal se <b>{-fixed} nayi galti</b> aa gayi")
        for k, v in list(wd.items())[:5]:
            day.append(f"• {esc(k)} — {len(v)}")
        st["aud_e"], st["aud_w"] = e, w
        if e: hi.append(f"🔴 Audit me {e} ERROR — deploy nahi hoga")

    # ---------- faltu file ----------
    uf = unused_files()
    if uf:
        imp.append(f"🟠 <b>{len(uf)} file kahin use nahi ho rahi</b>")
        imp += [f"• <code>{esc(f)}</code>" for f in uf[:12]]
        st["unused"] = uf

    # ---------- khabar ----------
    hot, seen = news(alerts.get("seen_news", {}))
    alerts["seen_news"] = seen
    for src, title, link in hot[:6]:
        imp.append(f"📰 <b>{esc(src)}</b>\n{esc(title)}\n{link}")

    # ---------- limits ----------
    for a1, a2, a3 in cf_limits():
        day.append(f"\n{esc(a1)} : {esc(a2)} ({esc(a3)})")

    # ---------- khule alert dohrao ----------
    op = alerts.get("open", {})
    for line in hi:
        key = line[:70]
        op.setdefault(key, {"text": line, "since": dstr(today()), "days": 0})
        op[key]["days"] += 1
    old_open = [v for k, v in op.items() if v["text"] not in hi]
    alerts["open"] = op

    # ---------- bhejo ----------
    hdr = f"<b>Sab Hisaab</b> · {today().strftime('%d %b %Y')}"
    if hi:
        txt = f"🔴 <b>HIGH PRIORITY</b>\n{hdr}\n\n" + "\n".join(hi)
        if old_open:
            txt += "\n\n<b>Purane khule mudde</b>\n" + "\n".join(
                f"• {v['text'][:80]} ({v['days']} din se)" for v in old_open[:5])
        tg(txt, [[{"text": "✅ Dekh liya, band karo", "callback_data": "ack_all"}]])
    if imp:
        tg(f"🟠 <b>IMPORTANT</b>\n{hdr}\n\n" + "\n".join(imp),
           [[{"text": "🗑 Faltu file hatao", "callback_data": "rm_unused"}]] if uf else None)
    if day:
        tg(f"🔵 <b>DAILY REPORT</b>\n{hdr}\n\n" + "\n".join(day))
    for m in PEND_MSG:
        tg(f"🔵 <b>PENDING URL</b>\n{hdr}\n{m}")

    # report bhejne me sach me dikkat aayi to chup mat raho
    if TG_FAILS:
        try:
            _send(os.environ.get("TG_TOKEN"), os.environ.get("TG_CHAT"),
                  "Report ka %d hissa Telegram par nahi ja paaya. "
                  "Pehli wajah: %s" % (len(TG_FAILS), TG_FAILS[0][:150]), None, False)
        except Exception as e:
            print("fail-alert bhi nahi gaya:", str(e)[:120])

    st["day"] = dstr(today())
    save(S_MAIN, st); save(S_ALERT, alerts)
    print("ho gaya | high:", len(hi), "imp:", len(imp), "| tg fail:", len(TG_FAILS))

if __name__ == "__main__":
    main()
