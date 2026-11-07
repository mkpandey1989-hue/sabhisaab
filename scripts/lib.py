#!/usr/bin/env python3
"""Sab Hisaab automation — shared helpers. Python 3.8+, stdlib + requests only."""
import json, os, re, sys, subprocess, datetime, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG_PATH = os.path.join(ROOT, "config.json")

def cfg():
    if not os.path.exists(CFG_PATH):
        sys.exit("config.json nahi mila. config.example.json ko copy karke bharein.")
    with open(CFG_PATH, encoding="utf-8") as f:
        return json.load(f)

def site_dir():
    return cfg()["site_dir"]

def today():
    return datetime.date.today().isoformat()

def log(msg):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = "[%s] %s" % (ts, msg)
    print(line, flush=True)
    try:
        with open(os.path.join(ROOT, "run.log"), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def run(cmd, cwd=None, check=True):
    p = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError("CMD FAIL: %s\n%s\n%s" % (cmd, p.stdout[-2000:], p.stderr[-2000:]))
    return p.stdout.strip()

def all_pages(d=None):
    d = d or site_dir()
    return sorted(f for f in os.listdir(d) if f.endswith(".html"))

def slug_of(f):
    return f[:-5]

def url_of(slug):
    base = cfg()["site_url"].rstrip("/")
    return base + "/" if slug == "index" else base + "/" + slug

def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()

def write(path, txt):
    with open(path, "w", encoding="utf-8") as f:
        f.write(txt)

def state_load():
    p = os.path.join(ROOT, "state.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}

def state_save(s):
    with open(os.path.join(ROOT, "state.json"), "w", encoding="utf-8") as f:
        json.dump(s, f, indent=1, ensure_ascii=False)

def gsc_inspect_link(url):
    """GSC URL Inspection ka seedha link — kholte hi Request Indexing button dikhta hai."""
    c = cfg()
    prop = urllib.parse.quote(c["gsc_property"], safe="")
    return ("https://search.google.com/search-console/inspect?resource_id=%s&id=%s"
            % (prop, urllib.parse.quote(url, safe="")))
