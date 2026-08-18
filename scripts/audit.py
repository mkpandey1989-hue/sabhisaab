#!/usr/bin/env python3
"""
Sab Hisaab — Roadmap Section 30 ka poora audit.
Har check ka jawab ZERO aana chahiye. Exit code 0 = pass, 1 = fail.
Usage:  python3 scripts/audit.py            (poori site)
        python3 scripts/audit.py page.html  (sirf ek page)
"""
import re, os, sys, json, glob, html as H, difflib, collections, subprocess

TYPOS = {
    "kholha": "khola", "tootа": "toota", "bharне": "bharne",
    "hotaa": "hota", "kartaa": "karta", "jaataa": "jaata",
    "ki liye": "ke liye", "ka liye": "ke liye", "se pahle": "se pehle",
    "chahiaye": "chahiye", "chaiye": "chahiye", "aapko ko": "aapko",
    "bahut zyada zyada": "bahut zyada",
}
TYPOS_CASE = {"jhelI": "jheli", "kुछ": "kuch", "kई": "kai", "औसat": "ausat"}
ALLPARA = {}
# template ka text — ye har page par ek jaisa hona hi chahiye
BOILER = (
    "is page ke number aur niyam in sarkari",
    "ye website cookies ka istemaal karti hai",
    "hum sebi-registered advisor",
    "jin tools par apna page",
    "sirf shaikshanik aur aam jaankari",
)

def p_slugsafe(x):
    return re.sub(r"[^a-z0-9]+", "_", x.lower())
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import cfg, site_dir, read, log

SKIP_ALL = {"googleb9a1fd91a1579ee6.html"}
SKIP_SEO = {"404.html"}
LEGAL = {"about", "contact", "privacy", "terms", "disclaimer", "services", "author", "index"}
ENT = re.compile(r"&(?:[a-zA-Z][a-zA-Z0-9]{1,31};|#\d{1,7};|#[xX][0-9a-fA-F]{1,6};)")

P = collections.OrderedDict()   # ERROR — deploy rok deta hai
W = collections.OrderedDict()   # WARNING — sirf report me
def bad(k, v):
    P.setdefault(k, []).append(v)
def warn(k, v):
    W.setdefault(k, []).append(v)

def strip_code(s):
    s = re.sub(r"<script\b.*?</script>", "", s, flags=re.S)
    return re.sub(r"<style\b.*?</style>", "", s, flags=re.S)

def text_of(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()

def main(only=None):
    d = site_dir()
    C = cfg()
    base = C["site_url"].rstrip("/")
    files = sorted(os.path.basename(f) for f in glob.glob(os.path.join(d, "*.html")))
    pages = {f[:-5] for f in files}
    targets = [only] if only else files
    inb = collections.Counter()
    titles, descs, qa = {}, {}, collections.defaultdict(list)

    for f in files:                      # link graph poori site se banta hai
        s = strip_code(read(os.path.join(d, f)))
        body = s[s.find("</head>"):]
        for href in re.findall(r'href="(/[a-z0-9\-]*)"', body):
            t = href.strip("/") or "index"
            if t in pages and t != f[:-5]:
                inb[t] += 1
            elif t not in pages:
                bad("SEO: dead internal link", (f, href))

    for f in targets:
        p = f[:-5]
        s = read(os.path.join(d, f))
        nos = re.sub(r"<script\b.*?</script>", "", s, flags=re.S)
        body = re.sub(r"<style\b.*?</style>", "", nos, flags=re.S)
        body = body[body.find("</head>"):]

        # ---- 30.1 HTML validity ----
        if s.count("</html>") != 1: bad("HTML: </html> ek baar nahi", f)
        if s.count("</body>") != 1: bad("HTML: </body> ek baar nahi", f)
        if "<style" in s[s.find("</head>"):]: bad("HTML: <style> body ke andar", f)
        if re.search(r'href="data:image[^"]* ', s): bad("HTML: favicon data URI me space", f)
        for m in re.finditer(r"&", strip_code(s)):
            if not ENT.match(strip_code(s), m.start()):
                bad("HTML: bina &amp; wala &", f); break
        for tag in ("p", "div", "ul", "ol", "table", "li", "main"):
            o = len(re.findall(r"<%s\b" % tag, body)); c = len(re.findall(r"</%s>" % tag, body))
            if o != c: bad("HTML: <%s> balance galat" % tag, (f, o, c))
        ids = re.findall(r'\sid="([^"]+)"', nos)
        dup = [k for k, v in collections.Counter(ids).items() if v > 1]
        if dup: bad("HTML: duplicate id", (f, dup))
        if f in SKIP_ALL or f in SKIP_SEO: continue

        # ---- 30.2 SEO ----
        t = re.search(r"<title>(.*?)</title>", s, re.S)
        t = text_of(t.group(1)) if t else ""
        titles.setdefault(t, []).append(f)
        if len(t) > 60: bad("SEO: title 60 se lamba", (f, len(t)))
        dm = re.search(r'<meta name="description" content="([^"]*)"', s)
        dsc = dm.group(1) if dm else ""
        descs.setdefault(dsc, []).append(f)
        if not 95 <= len(dsc) <= 165: bad("SEO: description 95-165 se bahar", (f, len(dsc)))
        if len(re.findall(r"<h1[^>]*>", s)) != 1: bad("SEO: H1 exactly 1 nahi", f)
        want = base + "/" + ("" if p == "index" else p)
        cm = re.search(r'rel="canonical" href="([^"]+)"', s)
        if not cm or cm.group(1) != want: bad("SEO: canonical galat", (f, cm.group(1) if cm else None))
        om = re.search(r'property="og:url" content="([^"]+)"', s)
        if not om or om.group(1) != want: bad("SEO: og:url != canonical", f)
        if re.search(r'href="(?:%s)?/[a-z0-9\-]+\.html"' % re.escape(base), body): bad("SEO: .html internal link", f)
        if "?t=" in body: bad("SEO: ?t= link", f)
        if "/img/" in s: bad("SEO: purana /img/ path", f)
        if "max-image-preview:large" not in s: bad("SEO: robots meta adhoora", f)

        # ---- 30.3 Schema ----
        tys = []
        for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
            try: j = json.loads(m.group(1))
            except Exception as e: bad("Schema: JSON-LD invalid", (f, str(e)[:40])); continue
            tys.append(j.get("@type"))
            if "aggregateRating" in m.group(1): bad("Schema: aggregateRating (NEVER)", f)
            if j.get("@type") == "BreadcrumbList":
                for it in j["itemListElement"]:
                    if it["position"] > 1 and it["item"] == base + "/": bad("Schema: crumb home par", f)
                    if it.get("name") in ("Page", "Guide", "Calculator"): bad("Schema: crumb generic naam", f)
                    if "?t=" in it["item"] or it["item"].endswith(".html"): bad("Schema: crumb URL ganda", f)
            if j.get("@type") == "FAQPage":
                qs = [q["name"] for q in j["mainEntity"]]
                pg = [H.unescape(text_of(q)) for q, _ in
                      re.findall(r"<details[^>]*><summary>(.*?)</summary>(.*?)</details>", s, re.S)]
                if qs != pg: bad("Schema: FAQ schema != page ke FAQ", f)
        if p != "index" and "BreadcrumbList" not in tys: bad("Schema: BreadcrumbList nahi", f)
        if "<details" in body and "FAQPage" not in tys: bad("Schema: FAQPage nahi", f)
        for need in ("dateModified", "datePublished", '"author"'):
            if need not in s: bad("Schema: %s nahi" % need.strip('"'), f)

        # ---- 30.4 Content ----
        w = len(re.sub(r"<[^>]+>", " ", body).split())
        if p not in LEGAL and w < 800: bad("Content: 800 se kam shabd", (f, w))
        elif p not in LEGAL and w < 1000: warn("Content: 1000 se kam shabd (roadmap ka naya target)", (f, w))
        if re.search(r"[A-Za-z][\u0900-\u097F]|[\u0900-\u097F][A-Za-z]", s): bad("Content: mixed script", f)
        if "Hindi me:" in s: bad("Content: Devanagari keyword block (stuffing)", f)
        h2 = [text_of(x) for x in re.findall(r"<h2[^>]*>(.*?)</h2>", body, re.S)]
        for i in range(len(h2)):
            for j2 in range(i + 1, len(h2)):
                a_, b_ = h2[i].lower(), h2[j2].lower()
                r_ = difflib.SequenceMatcher(None, a_, b_).ratio()
                if a_ == b_ or (r_ >= 0.85 and min(len(a_), len(b_)) > 24 and
                                set(a_.split()) - set(b_.split()) == set()):
                    bad("Content: duplicate H2", (f, h2[i]))
                elif r_ >= 0.85:
                    warn("Content: milta-julta H2 (dekh lein)", (f, h2[i], h2[j2]))
        pairs = re.findall(r"<details[^>]*><summary>(.*?)</summary>(.*?)</details>", body, re.S)
        qs = [H.unescape(text_of(q)) for q, _ in pairs]
        if pairs and len(pairs) < 4: bad("Content: 4 se kam FAQ", (f, len(pairs)))
        for i in range(len(qs)):
            for j2 in range(i + 1, len(qs)):
                if difflib.SequenceMatcher(None, qs[i].lower(), qs[j2].lower()).ratio() >= 0.85:
                    bad("Content: milta-julta FAQ ek hi page par", (f, qs[i]))
        for q, a in pairs:
            qa[(text_of(q).lower(), text_of(a).lower())].append(f)
        low = re.sub(r"<[^>]+>", " ", body).lower()
        for word in ("guaranteed return", "pakka munafa", "risk-free"):
            if word in low:
                i = low.find(word); ctx = low[max(0, i - 140):i + 40]
                if not any(k in ctx for k in ("nahi", "jaal", "daava nahi", "sifarish nahi")):
                    bad("Content: khatarnak daava", (f, word))
        if not re.search(r"<table", body) and p not in LEGAL: warn("Content: koi table nahi (featured snippet ka mauka)", f)


        # ---- 30.7 Bhasha aur code ki safai (naya) ----
        plain = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body))
        # 1. ek hi shabd do baar — sirf ek hi vaakya ke andar, tag ke aar-paar nahi
        for node in re.split(r"<[^>]+>", body):
            node = re.sub(r"\s+", " ", node)
            for m in re.finditer(r"\b([A-Za-z]{3,})\s+\1\b", node):
                if m.group(1).lower() not in ("bahut", "bilkul"):
                    bad("Bhasha: shabd do baar", (f, m.group(0)))
        # 2. jaani-pehchani spelling galtiyan
        for wrong, right in TYPOS.items():
            if re.search(r"\b%s\b" % re.escape(wrong), plain, re.I):
                bad("Bhasha: spelling", (f, "%s -> %s" % (wrong, right)))
        for wrong, right in TYPOS_CASE.items():
            if wrong in s:
                bad("Bhasha: spelling", (f, "%s -> %s" % (wrong, right)))
        # 3. do space, space se pehle comma/purnviram
        if re.search(r"[a-z] {2,}[a-z]", plain): warn("Bhasha: do space", f)
        # 4. inline JavaScript ka syntax
        for i, m in enumerate(re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", s, re.S)):
            js = m.group(1)
            if not js.strip() or '"@context"' in js: continue
            fn = "/tmp/_js_%s_%d.js" % (p_slugsafe(f), i)
            open(fn, "w", encoding="utf-8").write(js)
            r = subprocess.run(["node", "--check", fn], capture_output=True, text=True)
            if r.returncode != 0:
                bad("Code: JavaScript toota hai", (f, r.stderr.strip().split("\n")[0][:90]))
        # 5. paragraph ka dohraav isi page par
        paras = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", x)).strip().lower()
                 for x in re.findall(r"<p[^>]*>(.*?)</p>", body, re.S)]
        paras = [x for x in paras if len(x) > 120]
        for i in range(len(paras)):
            for j2 in range(i + 1, len(paras)):
                if difflib.SequenceMatcher(None, paras[i], paras[j2]).ratio() >= 0.80:
                    bad("Content: paragraph dobara likha", (f, paras[i][:70]))
        for x in paras:
            if any(k in x for k in BOILER): continue
            ALLPARA.setdefault(x, []).append(f)

        # ---- 30.5 Performance / mobile ----
        fp = len(re.findall(r'rel="preload"[^>]*fonts', s)); fa = s.count("this.media='all'")
        if not (fp == 1 and fa == 1 and "<noscript>" in s): bad("Perf: font tag 1+1+1 nahi", (f, fp, fa))
        if s.count("<noscript><noscript>"): bad("Perf: nested <noscript> (font marr gaya)", f)
        for m in re.finditer(r'<input\b[^>]*type="number"[^>]*>', body):
            if "inputmode" not in m.group(0): bad("Perf: inputmode nahi", f)
        for m in re.finditer(r"<img\b[^>]*>", body):
            for at in ("alt=", "width=", "height=", "loading=", "decoding="):
                if at not in m.group(0): bad("Perf: img me %s nahi" % at.strip("="), f)
        if "@media print" not in s: bad("Perf: print CSS nahi", f)
        if ":focus-visible" not in s: bad("A11y: focus-visible nahi", f)
        if "<table" in body and "overflow-x" not in s: bad("Perf: table overflow-x nahi", f)
        if (re.search(r'id="res"', s) or re.search(r'class="result', s)) and "min-height" not in s:
            bad("Perf: CLS min-height nahi", f)

        # ---- 30.6 Policy / AdSense ----
        if "shConsent" not in s: bad("Policy: consent banner nahi", f)
        if C["ga4_id"] not in s: bad("Policy: GA4 nahi", f)
        if "adsbygoogle" in s and not C.get("adsense_approved"): bad("Policy: adsense code (approval se pehle)", f)
        if "disclaimer" not in s.lower(): bad("Policy: disclaimer nahi", f)
        for a in re.findall(r'<a\b[^>]*href="https?://(?!%s)[^"]*"[^>]*>' % re.escape(base.split("//")[1]), body):
            if "noopener" not in a: bad("Policy: rel=noopener nahi", (f, a[:60]))

    if not only:
        # ---------- v9 NAYE CHECK (17 Aug 2026) ----------
        try:
            ix = read(os.path.join(d, "index.html"))
            # tools ka JS ab alag file me hai (speed ke liye) — dono jodkar dekho
            tjs = os.path.join(d, "tools.js")
            if os.path.exists(tjs): ix += "\n" + read(tjs)
            ixline = [l for l in ix.split("\n") if l.startswith("const PAGES=")]
            tool_ids = re.findall(r"\{id:'([A-Za-z0-9_-]+)',cat:'([^']+)'", ix)
            n_tools = len(tool_ids)

            # 1) duplicate tool id ya duplicate tool naam
            for tid, c in collections.Counter(i for i, _ in tool_ids).items():
                if c > 1: bad("Tools: duplicate tool id", (tid, c))
            names = re.findall(r"\{id:'[A-Za-z0-9_-]+',cat:'[^']+',ic:'[^']*',name:'([^']*)'", ix)
            for nm, c in collections.Counter(names).items():
                if c > 1: bad("Tools: duplicate tool naam", (nm, c))

            # 2) khokhla tool (calc ya fields khaali) jiska apna page bhi nahi
            pmap = dict(re.findall(r'"([^"]+)":"([^"]+)"', ixline[0])) if ixline else {}
            for m in re.finditer(r"\{id:'([A-Za-z0-9_-]+)',cat:'[^']+',ic:'[^']*',name:'[^']*',desc:'[^']*',fields:''", ix):
                if m.group(1) not in pmap:
                    bad("Tools: khokhla tool (fields khaali, page bhi nahi)", m.group(1))
            if ixline:
                # 3) PAGES map <-> tools array ka milaan
                for k in pmap:
                    if k not in [i for i, _ in tool_ids]:
                        bad("Tools: PAGES me entry par tool nahi", k)
                for i, _ in tool_ids:
                    if i not in pmap:
                        bad("Tools: tool ka dedicated page nahi", i)
                for k, v in pmap.items():
                    if not os.path.exists(os.path.join(d, v.strip("/") + ".html")):
                        bad("Tools: PAGES ka page file gayab", (k, v))

            # 4) tool ki ginti har page par ek jaisi (yahi 4 alag ginti wali galti thi)
            numpat = re.compile(r"(?<![-\d/])\b(1\d\d|2\d\d)\b(?![-\d])")
            for f2 in files:
                if f2 in SKIP_ALL: continue
                s2 = read(os.path.join(d, f2))
                for m in numpat.finditer(s2):
                    pre, post = s2[max(0, m.start()-9):m.start()], s2[m.end():m.end()+40]
                    if "\u20b9" in pre or "&#8377;" in pre or "(" in pre[-2:]: continue
                    if not re.search(r"^[^.]{0,40}?(tool|calculator)", post, re.I): continue
                    if m.group(1) != str(n_tools):
                        bad("Tools: ginti galat likhi hai (asli %d)" % n_tools, (f2, m.group(1)))
        except Exception as e:
            bad("Tools: ginti check chal nahi paaya", str(e)[:120])

        # 5) sitemap lastmod aur schema dateModified ek jaise hon
        try:
            sm = read(os.path.join(d, "sitemap.xml"))
            lm = dict(re.findall(r"<loc>([^<]+)</loc>\s*<lastmod>([\d-]+)</lastmod>", sm))
            for f2 in files:
                if f2 in SKIP_ALL or f2 == "404.html": continue
                s2 = read(os.path.join(d, f2))
                dm = re.search(r'"dateModified"\s*:\s*"([\d-]+)"', s2)
                if not dm: continue
                slug = f2[:-5]
                u = base + "/" if slug == "index" else base + "/" + slug
                if u in lm and lm[u] != dm.group(1):
                    warn("SEO: sitemap lastmod aur dateModified alag", (f2, lm[u], dm.group(1)))
        except Exception as e:
            warn("SEO: lastmod check chal nahi paaya", str(e)[:120])

        # 6) common script har page par (install-app.js chhoot jaata hai)
        miss = [f2 for f2 in files if f2 not in SKIP_ALL and f2 != "404.html"
                and "install-app.js" not in read(os.path.join(d, f2))]
        if miss: warn("Perf: install-app.js page par nahi", miss)

        # 7) robots.txt me canonical/redirect wale URL block na hon
        try:
            rb = read(os.path.join(d, "robots.txt"))
            for line in rb.split("\n"):
                if line.strip().lower().startswith("disallow:") and "?" in line:
                    bad("SEO: robots.txt me query-string block (canonical padha nahi jaayega)", line.strip())
        except Exception:
            pass

        # TOC me har H2 hona chahiye, aur har TOC anchor page par maujood ho
        for f in targets:
            t = read(os.path.join(d, f))
            m = re.search(r'<div class="tocbox">.*?</div>', t, re.S)
            if not m: continue
            have = re.findall(r'href="#([a-z0-9-]+)"', m.group(0))
            h2 = re.findall(r'<h2 id="([a-z0-9-]+)"', t)
            miss = [x for x in h2 if x not in have]
            dead = [x for x in have if x not in h2]
            if miss: bad("Content: H2 TOC me nahi hai", (f, ",".join(miss)))
            if dead: bad("Content: TOC ka anchor page par nahi", (f, ",".join(dead)))

        # sitemap: kram theek ho aur lastmod ek hi date par sab na hon
        try:
            smx = read(os.path.join(d, "sitemap.xml"))
            slugs = re.findall(r"<loc>[^<]*sabhisaab\.com/([^<]*)</loc>", smx)
            if slugs[1:] != sorted(slugs[1:]):
                warn("Sitemap: URL alphabetical kram me nahi", "publish.py se banwayein")
            lms = re.findall(r"<lastmod>([\d-]+)</lastmod>", smx)
            if lms and len(set(lms)) == 1:
                bad("Sitemap: har URL par ek hi lastmod (Google bharosa nahi karta)", lms[0])
        except Exception:
            pass

        # site/ ki alag .js file ka syntax bhi jaancho (tools.js, install-app.js, sw.js)
        for jf in sorted(glob.glob(os.path.join(d, "*.js"))):
            r = subprocess.run(["node", "--check", jf], capture_output=True, text=True)
            if r.returncode != 0:
                bad("Code: JS file tooti hai", (os.path.basename(jf), r.stderr.strip().split("\n")[0][:90]))
        # har page par jo .js file link hai, wo maujood hai ya nahi
        for f in targets:
            for src in re.findall(r'<script[^>]*src="/([^"]+\.js)"', read(os.path.join(d, f))):
                if not os.path.exists(os.path.join(d, src)):
                    bad("Code: JS file gayab hai", (f, src))

        for p in sorted(pages):
            if p in ("404", "googleb9a1fd91a1579ee6"): continue
            if inb.get(p, 0) < 3: bad("SEO: inbound link 3 se kam", (p, inb.get(p, 0)))
        for k, v in titles.items():
            if len(v) > 1: bad("SEO: duplicate title", (k[:40], v))
        for k, v in descs.items():
            if len(v) > 1: bad("SEO: duplicate description", (k[:40], v))
        for k, v in qa.items():
            if len(v) > 1: bad("Content: same FAQ do page par", (k[0][:50], v))
        for k, v in ALLPARA.items():
            if len(set(v)) > 1: bad("Content: same paragraph do page par", (k[:60], sorted(set(v))))

    tot = sum(len(v) for v in P.values())
    wt = sum(len(v) for v in W.values())
    print("=" * 66)
    print("  SAB HISAAB AUDIT — %d page check kiye" % len(targets))
    print("=" * 66)
    if tot == 0:
        print("  SAB CHECK PASS. Kul issue: 0")
    else:
        for k in sorted(P):
            print("  %-44s %4d" % (k, len(P[k])))
            for x in P[k][:5]:
                print("        - %s" % (str(x)[:110]))
    if wt:
        print("  --- WARNING (deploy nahi rukega, par sudhaarne layak) ---")
        for k in sorted(W):
            print("  %-44s %4d" % (k, len(W[k])))
            for x in W[k][:3]:
                print("        - %s" % (str(x)[:110]))
    print("=" * 66)
    print("  ERROR: %d   |   WARNING: %d" % (tot, wt))
    try:
        with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "audit_result.json"), "w", encoding="utf-8") as fh:
            json.dump({"errors": tot, "warnings": wt,
                       "detail": {k: [str(x) for x in v[:20]] for k, v in P.items()},
                       "warn_detail": {k: [str(x) for x in v[:20]] for k, v in W.items()}},
                      fh, indent=1, ensure_ascii=False)
    except Exception:
        pass
    return 0 if tot == 0 else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else None))
