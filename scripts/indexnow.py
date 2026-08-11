#!/usr/bin/env python3
"""IndexNow — Bing, Yandex, Naver, Seznam ko turant khabar. Free, unlimited, legitimate.
Google IndexNow support NAHI karta — wo alag se sitemap + GSC se hota hai."""
import sys, os, json, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import cfg, log, url_of

ENDPOINT = "https://api.indexnow.org/IndexNow"

def submit(urls):
    C = cfg()
    key = C["indexnow_key"]
    host = C["site_url"].split("//")[1].rstrip("/")
    urls = [u for u in urls if u.startswith("http")][:10000]
    if not urls:
        log("IndexNow: koi URL nahi"); return True
    payload = {
        "host": host,
        "key": key,
        "keyLocation": "%s/%s.txt" % (C["site_url"].rstrip("/"), key),
        "urlList": urls,
    }
    try:
        r = requests.post(ENDPOINT, json=payload, timeout=30,
                          headers={"Content-Type": "application/json; charset=utf-8"})
    except Exception as e:
        log("IndexNow FAIL: %s" % e); return False
    ok = r.status_code in (200, 202)
    log("IndexNow: %d URL bheje -> HTTP %d %s" % (len(urls), r.status_code, "OK" if ok else r.text[:150]))
    return ok

if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--all":
        from lib import all_pages, slug_of
        u = [url_of(slug_of(f)) for f in all_pages()
             if f not in ("404.html", "googleb9a1fd91a1579ee6.html")]
    elif args:
        u = [a if a.startswith("http") else url_of(a) for a in args]
    else:
        u = [l.strip() for l in sys.stdin if l.strip()]
    sys.exit(0 if submit(u) else 1)
