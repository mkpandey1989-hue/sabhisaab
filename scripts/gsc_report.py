#!/usr/bin/env python3
"""
Google Search Console - roz ka kaam (GitHub Actions me chalta hai)

  sitemap  -> sitemap dobara submit
  report   -> kaunse page index NAHI hue, uski list Telegram par
              (har URL ke saath GSC ka seedha link - ek tap me Request Indexing)

Google me "auto request indexing" ka koi legitimate API hai hi nahi.
Indexing API sirf JobPosting/BroadcastEvent ke liye hai - usse calculator page
bhejna policy ka ullanghan hai, isliye ye script wo NAHI karti.
"""
import os, re, sys, json, time, datetime, urllib.parse, urllib.request

SITE   = "https://sabhisaab.com"
PROP   = os.environ.get("GSC_PROPERTY", "sc-domain:sabhisaab.com")
BUDGET = int(os.environ.get("GSC_BUDGET", "150"))
TODO   = int(os.environ.get("GSC_TODO", "12"))
STATE  = "state/gsc.json"

def creds():
    from google.oauth2 import service_account
    info = json.loads(os.environ["GOOGLE_SA_JSON"])
    return service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/webmasters"])

def svc():
    from googleapiclient.discovery import build
    return build("searchconsole", "v1", credentials=creds(), cache_discovery=False)

def tg(text):
    tok, chat = os.environ.get("TG_TOKEN"), os.environ.get("TG_CHAT")
    if not tok or not chat:
        print(text); return
    for i in range(0, len(text), 3800):
        body = json.dumps({"chat_id": chat, "text": text[i:i+3800],
                           "parse_mode": "HTML", "disable_web_page_preview": True}).encode()
        req = urllib.request.Request("https://api.telegram.org/bot%s/sendMessage" % tok,
                                     data=body, headers={"Content-Type": "application/json"})
        try: urllib.request.urlopen(req).read()
        except Exception as e: print("telegram fail:", e)

def urls():
    """Sitemap repo se hi padho - Cloudflare bot ko rok deta hai."""
    for p in ("site/sitemap.xml", "sitemap.xml"):
        if os.path.exists(p):
            sm = open(p, encoding="utf-8").read()
            return re.findall(r"<loc>([^<]+)</loc>", sm)
    req = urllib.request.Request(SITE + "/sitemap.xml",
          headers={"User-Agent": "Mozilla/5.0 (compatible; SabHisaabBot/1.0)"})
    sm = urllib.request.urlopen(req, timeout=30).read().decode()
    return re.findall(r"<loc>([^<]+)</loc>", sm)

def load():
    try:
        with open(STATE, encoding="utf-8") as f: return json.load(f)
    except Exception: return {"cursor": 0, "status": {}}

def save(st):
    os.makedirs("state", exist_ok=True)
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(st, f, indent=1, ensure_ascii=False)

def inspect_link(u):
    return ("https://search.google.com/search-console/inspect?resource_id=%s&id=%s"
            % (urllib.parse.quote(PROP, safe=""), urllib.parse.quote(u, safe="")))

def cmd_sitemap():
    try:
        svc().sitemaps().submit(siteUrl=PROP, feedpath=SITE + "/sitemap.xml").execute()
        print("sitemap submit OK"); return True
    except Exception as e:
        print("sitemap FAIL:", str(e)[:200]); return False

def cmd_report():
    all_u = urls()
    print("sitemap me URL:", len(all_u))
    st = load()
    s = svc()
    cur = st.get("cursor", 0) % max(len(all_u), 1)
    batch = [all_u[(cur + i) % len(all_u)] for i in range(min(BUDGET, len(all_u)))]
    st["cursor"] = (cur + len(batch)) % len(all_u)

    res, notidx, errs = st.get("status", {}), [], 0
    for u in batch:
        try:
            r = s.urlInspection().index().inspect(body={
                "inspectionUrl": u, "siteUrl": PROP, "languageCode": "en"}).execute()
            idx = r["inspectionResult"]["indexStatusResult"]
            v = idx.get("coverageState", "?")
            # verdict PASS = Google ne index kar liya. Ye bhasha par nirbhar nahi.
            ok = idx.get("verdict") == "PASS"
            res[u] = {"state": v, "ok": ok, "checked": datetime.date.today().isoformat()}
            if not ok:
                notidx.append((u, v))
        except Exception as e:
            errs += 1
            if errs <= 3: print("inspect fail:", u, str(e)[:150])
            if "quota" in str(e).lower() or "429" in str(e): break
        time.sleep(0.15)
    st["status"] = res
    save(st)

    done = sum(1 for v in res.values() if v.get("ok"))
    lines = ["<b>Sab Hisaab - indexing report</b>  %s" % datetime.date.today().strftime("%d %b %Y"),
             "",
             "Site par URL : <b>%d</b>" % len(all_u),
             "Ab tak check : <b>%d</b>" % len(res),
             "Indexed : <b>%d</b>   |   Baaki : <b>%d</b>" % (done, len(res) - done),
             "Aaj check kiye : %d  (error %d)" % (len(batch), errs)]

    todo = notidx[:TODO]
    if not todo:
        lines += ["", "Aaj koi page atka hua nahi mila. Kuch karne ki zaroorat nahi."]
    else:
        lines += ["", "<b>Aaj ye %d URL dabaayein</b> - link kholein, phir Request Indexing:" % len(todo)]
        for i, (u, v) in enumerate(todo, 1):
            slug = u.rstrip("/").split("/")[-1] or "homepage"
            lines.append('%d. <a href="%s">%s</a>\n    <i>%s</i>' % (i, inspect_link(u), slug, v))
    tg("\n".join(lines))
    print("report bhej diya | not-indexed:", len(notidx))

if __name__ == "__main__":
    c = sys.argv[1] if len(sys.argv) > 1 else "report"
    if c == "sitemap": cmd_sitemap()
    else:
        cmd_sitemap()
        cmd_report()
