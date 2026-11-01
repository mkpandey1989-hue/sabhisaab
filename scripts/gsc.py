#!/usr/bin/env python3
"""
Google Search Console automation (sab kuch official API se, koi jugaad nahi):
  sitemap   -> sitemap dobara submit (Search Console API)
  inspect   -> URL Inspection API se check ki kaunse page index NAHI hue
               (quota ~2,000 URL/din). Report banti hai jisme har URL ka
               seedha GSC link hota hai -> ek tap me Request Indexing.

NOTE: Google me "auto request indexing" ka koi legitimate API nahi hai.
Indexing API sirf JobPosting/BroadcastEvent ke liye hai — usse calculator page
bhejna policy violation hai, isliye ye script wo NAHI karti.
"""
import sys, os, json, time, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import cfg, log, url_of, all_pages, slug_of, state_load, state_save, gsc_inspect_link, ROOT

SCOPES = ["https://www.googleapis.com/auth/webmasters"]

def service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    C = cfg()
    creds = service_account.Credentials.from_service_account_file(C["google_sa_json"], scopes=SCOPES)
    return build("searchconsole", "v1", credentials=creds, cache_discovery=False)

def resubmit_sitemap():
    C = cfg()
    sm = C["site_url"].rstrip("/") + "/sitemap.xml"
    try:
        service().sitemaps().submit(siteUrl=C["gsc_property"], feedpath=sm).execute()
        log("GSC: sitemap dobara submit — OK"); return True
    except Exception as e:
        log("GSC sitemap FAIL: %s" % e); return False

def inspect_all(limit=None):
    """Har URL ka index status. Round-robin: roz alag hisse check hote hain."""
    C = cfg()
    limit = limit or C.get("gsc_daily_budget", 150)
    svc = service()
    urls = [url_of(slug_of(f)) for f in all_pages()
            if f not in ("404.html", "googleb9a1fd91a1579ee6.html")]
    st = state_load(); cur = st.get("inspect_cursor", 0)
    batch = [urls[(cur + i) % len(urls)] for i in range(min(limit, len(urls)))]
    st["inspect_cursor"] = (cur + len(batch)) % len(urls)

    res = st.get("index_status", {})
    notidx, errs = [], 0
    for u in batch:
        try:
            r = svc.urlInspection().index().inspect(body={
                "inspectionUrl": u, "siteUrl": C["gsc_property"], "languageCode": "hi-Latn"}).execute()
            idx = r["inspectionResult"]["indexStatusResult"]
            verdict = idx.get("coverageState", "?")
            res[u] = {"state": verdict, "checked": datetime.date.today().isoformat(),
                      "robots": idx.get("robotsTxtState"), "canonical": idx.get("googleCanonical")}
            if "Submitted and indexed" not in verdict and "indexed" not in verdict.lower():
                notidx.append((u, verdict))
        except Exception as e:
            errs += 1
            if errs <= 3: log("inspect FAIL %s: %s" % (u, str(e)[:120]))
            if "quota" in str(e).lower(): break
        time.sleep(0.12)                      # 600/min limit se neeche
    st["index_status"] = res; state_save(st)
    log("GSC inspect: %d check kiye, %d index nahi hue, %d error" % (len(batch), len(notidx), errs))
    return notidx, res

def report():
    notidx, res = inspect_all()
    todo = notidx[:12]                        # rozana ka realistic manual quota
    lines = ["<b>Sab Hisaab — indexing report %s</b>" % datetime.date.today().isoformat()]
    tot = len(res); ok = sum(1 for v in res.values() if "index" in str(v["state"]).lower()
                             and "not" not in str(v["state"]).lower())
    lines.append("Ab tak check: %d | Indexed: %d | Baaki: %d" % (tot, ok, tot - ok))
    if not todo:
        lines.append("\nAaj koi page atka hua nahi mila. Kuch karne ki zaroorat nahi.")
    else:
        lines.append("\n<b>Aaj ye %d URL dabaayein</b> (link kholein → Request Indexing):" % len(todo))
        for i, (u, v) in enumerate(todo, 1):
            lines.append('%d. <a href="%s">%s</a>\n   <i>%s</i>' %
                         (i, gsc_inspect_link(u), u.split("/")[-1] or "homepage", v))
    txt = "\n".join(lines)
    with open(os.path.join(ROOT, "last_report.txt"), "w", encoding="utf-8") as f:
        f.write(txt)
    return txt

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    if cmd == "sitemap":
        sys.exit(0 if resubmit_sitemap() else 1)
    elif cmd == "report":
        from notify import send
        send(report())
    elif cmd == "inspect":
        print(json.dumps(inspect_all()[0], indent=1, ensure_ascii=False))
