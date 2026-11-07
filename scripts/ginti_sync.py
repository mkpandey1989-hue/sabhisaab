#!/usr/bin/env python3
"""
Ginti sync — tools.js me jitne tool hain, wahi ginti har page par likh deta hai.
Naya tool jodne par "Saare 183 Tools" jaisi line 265 page me hoti hai. Unhe haath se
badalna = 13 ZIP. Ye script wahi kaam GitHub par khud kar deti hai.

Niyam (galti na ho isliye):
  * Wahi number badalta hai jo audit.py ki ginti-jaanch pakadti hai
    (100-299 ka number, jiske 40 akshar ke andar 'tool' ya 'calculator' ho).
  * Audit.py har aise number ko ERROR maanta hai jo asli ginti se alag ho,
    isliye script bhi wahi saare number asli ginti se badal deti hai.
    Rupaye (₹) wale aur bracket wale number audit ki tarah hi chhode jaate hain.
  * Page ki tareekh (dateModified / sitemap lastmod) NAHI badalti — ye content
    badlaav nahi hai, isliye IndexNow par bhi kuch nahi jaata.
Usage: python3 scripts/ginti_sync.py          (badlaav karke likhta hai)
       python3 scripts/ginti_sync.py --check  (sirf batata hai)
"""
import re, os, sys, glob, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
NUMPAT = re.compile(r"(?<![-\d/])\b(1\d\d|2\d\d)\b(?![-\d])")

def tool_count():
    s = open(os.path.join(SITE, "tools.js"), encoding="utf-8").read()
    return len(re.findall(r"\{id:'([A-Za-z0-9_-]+)',cat:'([^']+)'", s))

def hits(s):
    for m in NUMPAT.finditer(s):
        pre, post = s[max(0, m.start()-9):m.start()], s[m.end():m.end()+40]
        if "\u20b9" in pre or "&#8377;" in pre or "(" in pre[-2:]: continue
        if not re.search(r"^[^.]{0,40}?(tool|calculator)", post, re.I): continue
        yield m

def main():
    check = "--check" in sys.argv
    n = tool_count()
    files = sorted(glob.glob(os.path.join(SITE, "*.html")) +
                   [os.path.join(SITE, x) for x in ("manifest.json", "llms.txt") if os.path.exists(os.path.join(SITE, x))])
    wrong = collections.Counter()
    for f in files:
        for m in hits(open(f, encoding="utf-8").read()):
            if m.group(1) != str(n): wrong[m.group(1)] += 1
    if not wrong:
        print("Sab jagah ginti %d hai. Kuch nahi badla." % n); return 0
    print("Asli ginti: %d | purani ginti: %s" % (n, dict(wrong)))
    changed = 0
    for f in files:
        s = open(f, encoding="utf-8").read()
        spans = [m.span(1) for m in hits(s) if m.group(1) != str(n)]
        if not spans: continue
        for a, b in reversed(spans): s = s[:a] + str(n) + s[b:]
        changed += 1
        if not check: open(f, "w", encoding="utf-8").write(s)
    print("%s %d file" % ("Badalni padengi:" if check else "Badli:", changed))
    return 0

if __name__ == "__main__":
    sys.exit(main())
