#!/usr/bin/env python3
"""Bing URL Submission API — 10,000 URL/domain/din tak (quota Bing Webmaster me dikhta hai).
IndexNow ke saath dono chalane se Bing par coverage sabse tez milti hai."""
import sys, os, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import cfg, log, url_of

def submit(urls):
    C = cfg()
    # PEHLE: yahan `return True` tha — yaani band hone par bhi "safal" bata deta tha.
    # Isi wajah se mahino tak pata hi nahi chala ki Bing ko ek bhi URL nahi ja raha.
    # Ab False lautta hai taki calling code ko galatfehmi na ho.
    if not C.get("bing_enabled"):
        log("Bing API: BAND hai (config me bing_enabled=false) — %d URL NAHI bheje gaye"
            % len(urls)); return False
    if not (C.get("bing_api_key") or "").strip() or C.get("bing_api_key") == "x":
        log("Bing API: asli key nahi mili (bing_api_key khaali ya 'x') — "
            "%d URL NAHI bheje gaye" % len(urls)); return False
    ep = "https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=" + C["bing_api_key"]
    urls = [u for u in urls if u.startswith("http")][:500]
    if not urls:
        return True
    try:
        r = requests.post(ep, json={"siteUrl": C["site_url"].rstrip("/") + "/", "urlList": urls},
                          timeout=30, headers={"Content-Type": "application/json; charset=utf-8"})
        log("Bing API: %d URL -> HTTP %d %s" % (len(urls), r.status_code, r.text[:120]))
        return r.status_code == 200
    except Exception as e:
        log("Bing API FAIL: %s" % e); return False

if __name__ == "__main__":
    a = sys.argv[1:]
    u = [x if x.startswith("http") else url_of(x) for x in a] or [l.strip() for l in sys.stdin if l.strip()]
    sys.exit(0 if submit(u) else 1)
