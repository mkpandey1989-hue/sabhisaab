#!/usr/bin/env python3
"""
Sab Hisaab — chaukidaar (har 30 min chalta hai)

  1. Site zinda hai? (downtime = TURANT alert)
  2. Koi internal/external link toota?
  3. Official srot (incometax, EPFO, NSI, RBI) ka page badla? -> rate check karo
  4. Kis page ka data purana ho gaya (90 din se review nahi hua)
  5. Jo services free hain (Web3Forms, Cloudflare, GitHub) unki limit/policy badli?
  6. Pending kaam ka tracker — kitna hua, kitna baaki, priority-wise
"""
import os, re, sys, json, time, hashlib, datetime, urllib.request, urllib.error
import html as _html

SITE = "https://sabhisaab.com"
ST   = "state/watch.json"
IST  = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
UA   = {"User-Agent": "Mozilla/5.0 (compatible; SabHisaabBot/1.0; +https://sabhisaab.com)"}

def today(): return datetime.datetime.now(IST).date()
def now():   return datetime.datetime.now(IST).strftime("%d %b %H:%M")

def load(p, d):
    try:
        with open(p, encoding="utf-8") as f: return json.load(f)
    except Exception: return d
def save(p, o):
    os.makedirs("state", exist_ok=True)
    with open(p, "w", encoding="utf-8") as f: json.dump(o, f, indent=1, ensure_ascii=False)

def esc(x):
    return _html.escape(str(x), quote=False)

def _send(tok, chat, txt, buttons, as_html=True):
    b = {"chat_id": chat, "text": txt, "disable_web_page_preview": True}
    if as_html: b["parse_mode"] = "HTML"
    if buttons: b["reply_markup"] = {"inline_keyboard": buttons}
    return urllib.request.urlopen(urllib.request.Request(
        "https://api.telegram.org/bot%s/sendMessage" % tok,
        data=json.dumps(b).encode(), headers={"Content-Type": "application/json"}), timeout=25).read()

def _chunks(text, limit=3500):
    out, cur = [], ""
    for line in text.split("\n"):
        if len(line) > limit:
            if cur: out.append(cur); cur = ""
            for k in range(0, len(line), limit): out.append(line[k:k+limit])
            continue
        if cur and len(cur) + len(line) + 1 > limit:
            out.append(cur); cur = line
        else:
            cur = line if not cur else cur + "\n" + line
    if cur: out.append(cur)
    return out or [text[:limit]]

def tg(text, buttons=None):
    """HTML fail ho to plain text me bhejo — chaukidaar ka alert kabhi gayab na ho."""
    tok, chat = os.environ.get("TG_TOKEN"), os.environ.get("TG_CHAT")
    if not tok or not chat: print(text); return
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
        for a, b2 in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&middot;", "-")):
            plain = plain.replace(a, b2)
        try: _send(tok, chat, plain, btn, False); print("plain text me bhej diya")
        except Exception as e2: print("tg plain bhi fail:", str(e2)[:200])

def get(url, timeout=25):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)
        return r.status, r.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e: return e.code, ""
    except Exception: return 0, ""

# ---------------------------------------------------------------- 1. uptime
def uptime(st, alerts):
    pages = ["/", "/sitemap.xml", "/percentage-calculator", "/emi-calculator", "/contact"]
    bad, slow = [], []
    for p in pages:
        t0 = time.time()
        code, _ = get(SITE + p, 20)
        ms = int((time.time() - t0) * 1000)
        if code != 200: bad.append(f"{p} → {code or 'nahi khula'}")
        elif ms > 4000: slow.append(f"{p} → {ms}ms")
    was_down = st.get("down", False)
    if bad:
        st["down"] = True
        st["down_since"] = st.get("down_since") or now()
        alerts.append(("HI", f"🔴 <b>SITE DOWN</b> — {now()}\n" + "\n".join("• " + b for b in bad) +
                             f"\n\n<i>{st['down_since']} se</i>"))
    else:
        if was_down:
            alerts.append(("HI", f"🟢 <b>Site wapas chal gayi</b> — {now()}\n<i>{st.get('down_since','?')} se band thi</i>"))
        st["down"] = False; st["down_since"] = None
        if slow: alerts.append(("IMP", "🐢 <b>Site dheemi</b>\n" + "\n".join("• " + s for s in slow)))
    return bad

# ---------------------------------------------------------------- 2. toote link
def link_check(st, alerts, limit=40):
    pages = sorted([f for f in os.listdir("site") if f.endswith(".html")]) if os.path.isdir("site") else []
    if not pages: return
    cur = st.get("lcur", 0) % max(len(pages), 1)
    batch = [pages[(cur + i) % len(pages)] for i in range(min(6, len(pages)))]
    st["lcur"] = (cur + len(batch)) % max(len(pages), 1)
    ext, seen = [], set(st.get("ok_links", []))
    for f in batch:
        try: h = open("site/" + f, encoding="utf-8").read()
        except Exception: continue
        for u in re.findall(r'href="(https?://[^"]+)"', h):
            if "sabhisaab.com" in u or u in seen: continue
            ext.append((f, u))
    dead = []
    for f, u in ext[:limit]:
        code, _ = get(u, 15)
        if code in (0, 404, 410, 500, 502, 503): dead.append((f, u, code))
        else: seen.add(u)
    st["ok_links"] = sorted(seen)[-800:]
    if dead:
        alerts.append(("IMP", "🔗 <b>Toota bahari link</b>\n" +
            "\n".join(f"• <code>{f}</code>\n  {u} → {c or 'khula nahi'}" for f, u, c in dead[:8])))

# ---------------------------------------------------------------- 3. official srot
SRC = {
    "Income Tax":  "https://www.incometax.gov.in/iec/foportal/",
    "EPFO":        "https://www.epfindia.gov.in/site_en/index.php",
    "India Post":  "https://www.nsiindia.gov.in/InternalPage.aspx?Id_Pk=180",
    "RBI":         "https://www.rbi.org.in/",
    "GST":         "https://www.gst.gov.in/",
}
AFFECT = {
    "Income Tax": "income-tax, tax-regime, advance-tax, capital-gain, tds, section-80c wale page",
    "EPFO":       "epf-calculator, epf-guide, vpf, gratuity wale page",
    "India Post": "ppf, nsc, kvp, scss, sukanya, post-office-mis, mahila-samman wale page",
    "RBI":        "gold-loan, home-loan, emi, fd wale page",
    "GST":        "gst-calculator, gst-guide",
}
def src_watch(st, alerts):
    h = st.get("src_hash", {})
    for name, url in SRC.items():
        code, body = get(url, 30)
        if code != 200 or not body: continue
        txt = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", body, flags=re.S)
        nums = " ".join(re.findall(r"\d+(?:\.\d+)?\s*%", txt)[:60])
        key = hashlib.md5(nums.encode()).hexdigest()[:12]
        old = h.get(name)
        h[name] = key
        if old and old != key:
            alerts.append(("IMP",
                f"📋 <b>{name}</b> ki site par dar/niyam badla lagta hai\n{url}\n\n"
                f"<b>Ye page dekh lein:</b> {AFFECT.get(name,'')}"))
    st["src_hash"] = h

# ---------------------------------------------------------------- 4. purana data
REVIEW = {  # slug ka hissa : kitne din baad review
    "ppf": 90, "nsc": 90, "kvp": 90, "scss": 90, "sukanya": 90, "post-office": 90,
    "mahila-samman": 90, "epf": 180, "income-tax": 90, "tax-regime": 90, "gst": 120,
    "capital-gain": 90, "tds": 90, "section-80c": 90, "gold-loan": 180, "stamp-duty": 180,
}
def stale(st, alerts):
    if not os.path.isdir("site"): return
    last = st.get("review", {})
    due = []
    for f in sorted(os.listdir("site")):
        if not f.endswith(".html"): continue
        for k, days in REVIEW.items():
            if k in f:
                d = last.get(f)
                if not d:
                    last[f] = str(today()); break
                age = (today() - datetime.date.fromisoformat(d)).days
                if age >= days: due.append((f, age, days))
                break
    st["review"] = last
    if due:
        due.sort(key=lambda x: -x[1])
        alerts.append(("IMP", "🗓 <b>In page ka data purana ho sakta hai</b>\n<i>Official site se dar milaa lein</i>\n\n" +
            "\n".join(f"• <code>{f[:-5]}</code> — {a} din se review nahi ({d} din ka niyam)" for f, a, d in due[:10])))

# ---------------------------------------------------------------- 5. free service ki nazar
FREE = [
    ("Web3Forms", "https://web3forms.com/", "250 submission/mahina free"),
    ("IndexNow",  "https://www.indexnow.org/", "free, koi limit nahi"),
]
def service_watch(st, alerts):
    h = st.get("svc_hash", {})
    for name, url, note in FREE:
        code, body = get(url, 25)
        if code != 200 or not body: continue
        txt = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", body, flags=re.S).lower()
        hot = [w for w in ("deprecat", "shutting down", "discontinu", "no longer free",
                           "price increase", "sunset", "retir") if w in txt]
        nums = " ".join(re.findall(r"\b\d{2,5}\s*(?:submission|request|free)", txt)[:20])
        key = hashlib.md5(nums.encode()).hexdigest()[:12]
        if h.get(name) and h[name] != key:
            alerts.append(("IMP", f"💳 <b>{name}</b> ki free limit badli lagti hai\n{url}\n<i>Abhi tak: {note}</i>"))
        h[name] = key
        if hot:
            alerts.append(("HI", f"🔴 <b>{name}</b> par khatre ka shabd mila: {', '.join(hot)}\n{url}"))
    st["svc_hash"] = h

# ---------------------------------------------------------------- 6. pending tracker
def pending(st):
    """daily.json + audit se pending kaam ki priority-wise list"""
    d = load("state/daily.json", {})
    a = load("audit_result.json", {})
    out = []
    e = a.get("errors", 0)
    if e: out.append(("🔴", f"Audit me {e} ERROR — deploy rukega", "abhi"))
    idx = d.get("status", {})
    if idx:
        notok = sum(1 for v in idx.values() if not v.get("ok"))
        if notok: out.append(("🟠", f"{notok} page abhi index nahi hue", "roz 12 dabayein"))
    if d.get("unused"): out.append(("🟠", f"{len(d['unused'])} faltu file", "Telegram se hatayein"))
    wd = a.get("warn_detail", {})
    for k, v in list(wd.items())[:5]:
        out.append(("🔵", f"{k} — {len(v)}", "content ke saath"))
    if d.get("psi_mobile", 100) < 90:
        out.append(("🟠", f"Mobile speed {d.get('psi_mobile')} — 90 chahiye", "images/JS"))
    return out

# ---------------------------------------------------------------- main
def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "watch"
    st = load(ST, {})
    alerts = []

    if mode in ("watch", "all"):
        down = uptime(st, alerts)
        if not down:                       # site down ho to baaki jaanch ka matlab nahi
            if st.get("lastheavy") != str(today()):
                link_check(st, alerts)
                src_watch(st, alerts)
                stale(st, alerts)
                service_watch(st, alerts)
                st["lastheavy"] = str(today())

    if mode in ("pending", "all"):
        p = pending(st)
        if p:
            txt = "<b>📋 PENDING KAAM</b> — " + str(today()) + "\n\n"
            for ic, what, how in p: txt += f"{ic} {what}\n   <i>{how}</i>\n"
            txt += f"\nKul pending: <b>{len(p)}</b>"
            tg(txt, [[{"text": "🛠 Audit chalao", "callback_data": "do:audit"},
                      {"text": "📑 Indexing", "callback_data": "m:idx"}]])

    hi  = [t for k, t in alerts if k == "HI"]
    imp = [t for k, t in alerts if k == "IMP"]
    if hi:  tg("🔴 <b>TURANT DHYAN DEIN</b>\n\n" + "\n\n".join(hi),
               [[{"text": "✅ Dekh liya", "callback_data": "ack_all"}]])
    if imp: tg("🟠 <b>IMPORTANT</b>\n\n" + "\n\n".join(imp))
    save(ST, st)
    print("watch done | hi:", len(hi), "imp:", len(imp))

if __name__ == "__main__":
    main()
