#!/usr/bin/env python3
"""
Sab Hisaab — poora publish pipeline. Ek command, baaki sab apne aap.

  incoming/*.html  ->  audit  ->  site/  ->  sitemap  ->  internal links
                   ->  git push (Cloudflare khud deploy karta hai)
                   ->  live verify  ->  IndexNow + Bing  ->  GSC sitemap
                   ->  Telegram report

Audit me ek bhi ERROR aaya to deploy HOTA HI NAHI. Ye sabse zaroori surakshaa hai.
"""
import sys, os, re, json, shutil, time, subprocess, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import cfg, log, run, read, write, site_dir, all_pages, slug_of, url_of, ROOT
import audit as AUDIT

HUB = {"Nivesh": "nivesh-calculators", "Loan/Tax": "loan-tax-calculators",
       "Rozana": "rozana-calculators", "Utility": "utility-tools",
       "Sehat": "sehat-calculators", "Trading": "trading-calculators",
       "Converter": "converter-tools", "Live": "utility-tools",
       "Guide": "guides", "Article": "articles"}

# ---------------------------------------------------------------- sitemap
def git_date(path):
    """Us file ke aakhri commit ki date (YYYY-MM-DD). Na mile to file ki mtime."""
    try:
        r = subprocess.run(["git", "log", "-1", "--format=%cs", "--", path],
                           capture_output=True, text=True, timeout=10)
        d = r.stdout.strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
            return d
    except Exception:
        pass
    return datetime.date.fromtimestamp(os.path.getmtime(path)).isoformat()


def rebuild_sitemap():
    """Har page ka lastmod uske git commit ki asli date se.

    Pehle file-mtime use hoti thi, par CI me checkout ke waqt sab file ki mtime ek
    ho jaati hai — isse poori sitemap par ek hi date chadh jaati thi. Google aisi
    sitemap ka lastmod maanna hi band kar deta hai. Ab git se asli date li jaati hai;
    git na mile to mtime fallback."""
    d = site_dir(); C = cfg(); base = C["site_url"].rstrip("/")
    hubs = set(HUB.values())
    legal = {"about", "author", "contact", "disclaimer", "privacy", "services", "terms"}
    rows = []
    for f in all_pages(d):
        p = slug_of(f)
        if p in ("404", "googleb9a1fd91a1579ee6"):
            continue
        loc = base + "/" if p == "index" else base + "/" + p
        mt = git_date(os.path.join(d, f))
        if p == "index":      pr, cf = "1.0", "daily"
        elif p in hubs:       pr, cf = "0.9", "weekly"
        elif p in legal:      pr, cf = "0.3", "yearly"
        elif p.endswith("-guide"): pr, cf = "0.7", "monthly"
        else:                 pr, cf = "0.8", "monthly"
        img = ""
        m = re.search(r'property="og:image" content="([^"]+)"', read(os.path.join(d, f)))
        if m:
            img = "\n<image:image><image:loc>%s</image:loc></image:image>" % m.group(1)
        rows.append("<url>\n<loc>%s</loc>\n<lastmod>%s</lastmod>\n<changefreq>%s</changefreq>"
                    "\n<priority>%s</priority>%s\n</url>" % (loc, mt, cf, pr, img))
    # homepage sabse pehle, baaki alphabetical — taaki kram kabhi na toote
    rows.sort(key=lambda r: ("" if "<loc>%s/</loc>" % base in r else
                             re.search(r"<loc>[^<]*/([^<]*)</loc>", r).group(1) or "\uffff"))
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
           'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
           + "\n".join(rows) + "\n</urlset>\n")
    write(os.path.join(d, "sitemap.xml"), xml)
    log("sitemap.xml banaya — %d URL" % len(rows))
    return len(rows)

# ---------------------------------------------------------------- incoming
def ingest():
    """incoming/ me pade naye page site/ me le jao."""
    C = cfg(); inc = C["incoming_dir"]; d = site_dir()
    os.makedirs(inc, exist_ok=True)
    moved = []
    for f in sorted(os.listdir(inc)):
        if not f.endswith(".html"):
            continue
        src, dst = os.path.join(inc, f), os.path.join(d, f)
        new = not os.path.exists(dst)
        shutil.copy2(src, dst)
        rc = AUDIT.main(f)
        if rc != 0:                                    # audit fail -> wapas hatao
            if new: os.remove(dst)
            log("AUDIT FAIL: %s — site par NAHI daala gaya" % f)
            os.rename(src, src + ".rejected")
            continue
        os.remove(src); moved.append((f, new))
        log("%s: %s" % ("NAYA page" if new else "UPDATE", f))
    return moved

# ---------------------------------------------------------------- deploy
def git_push(msg):
    d = site_dir()
    if not run("git -C %s status --porcelain" % d, check=False):
        log("git: kuch nahi badla"); return False
    run("git -C %s add -A" % d)
    run('git -C %s commit -m "%s"' % (d, msg.replace('"', "'")))
    run("git -C %s push origin %s" % (d, cfg()["git_branch"]))
    log("git push ho gaya — Cloudflare deploy shuru")
    return True

def wait_live(urls, tries=20, gap=15):
    """Cloudflare deploy hone tak rukho, tabhi indexing ping bhejo."""
    import requests
    pending = list(urls)
    for _ in range(tries):
        time.sleep(gap)
        still = []
        for u in pending:
            try:
                if requests.get(u, timeout=15, headers={"Cache-Control": "no-cache"}).status_code != 200:
                    still.append(u)
            except Exception:
                still.append(u)
        pending = still
        if not pending:
            log("saare naye URL live hain"); return True
    log("WARN: %d URL abhi live nahi: %s" % (len(pending), pending[:3]))
    return False

# ---------------------------------------------------------------- main
def main():
    C = cfg()
    moved = ingest()
    changed = [url_of(slug_of(f)) for f, _ in moved]

    n = rebuild_sitemap()
    rc = AUDIT.main()                                   # poori site ka audit
    if rc != 0:
        from notify import send
        res = json.load(open(os.path.join(ROOT, "audit_result.json"), encoding="utf-8"))
        send("<b>DEPLOY ROKA GAYA</b>\nAudit me %d error hain:\n\n%s" %
             (res["errors"], "\n".join("• %s (%d)" % (k, len(v)) for k, v in res["detail"].items())[:2500]))
        log("DEPLOY ROKA — audit error"); return 1

    msg = "auto: %d page update, sitemap %d URL (%s)" % (len(moved), n, datetime.date.today())
    if not git_push(msg):
        log("kuch naya nahi — bas nikal rahe hain"); return 0

    if changed:
        wait_live(changed)

    from indexnow import submit as inow
    from bing_submit import submit as bing
    from notify import send
    ping = changed or [C["site_url"].rstrip("/") + "/"]
    inow(ping)
    bing(ping)

    if C.get("gsc_enabled"):
        try:
            from gsc import resubmit_sitemap
            resubmit_sitemap()
        except Exception as e:
            log("GSC sitemap skip: %s" % str(e)[:100])

    res = json.load(open(os.path.join(ROOT, "audit_result.json"), encoding="utf-8"))
    lines = ["<b>Deploy ho gaya</b> — %s" % datetime.date.today().isoformat(),
             "Pages: %d | Sitemap: %d URL" % (len(all_pages()), n),
             "Audit: %d error, %d warning" % (res["errors"], res["warnings"])]
    if changed:
        lines.append("\n<b>Naye/badle URL:</b>")
        lines += ["• %s" % u for u in changed[:15]]
        lines.append("\nBing/Yandex/Naver ko turant khabar bhej di gayi.")
        lines.append("Google ke liye kal subah ki report me link aayenge.")
    send("\n".join(lines))
    return 0

if __name__ == "__main__":
    sys.exit(main())
