# Sab Hisaab — Poora Automation (Oracle VM)

Manual kaam **zero ke kareeb**. Aap sirf content likhwate hain aur ek file drop karte hain — baaki sab VM khud karta hai.

---

## Ye kaam kaise karega

```
  Aap Claude se: "topic: 7th Pay Commission calculator"
        │
        ▼  (Claude poora ready HTML page deta hai — aap download karte hain)
  VM ke incoming/ folder me daal dein
        │
        ▼  har 10 minute me cron
  audit.py     → 60+ check. Ek bhi ERROR = deploy ROK
  sitemap      → har page ka apna lastmod
  git push     → Cloudflare khud deploy karta hai
  live check   → URL sach me khul raha hai?
  IndexNow     → Bing, Yandex, Naver, Seznam ko TURANT khabar
  Bing API     → doosra channel
  GSC sitemap  → Google ko dobara submit
  Telegram     → "deploy ho gaya" ka message
        │
        ▼  roz subah 6:30
  gsc.py report → jo page index nahi hue, unki list Telegram par
                  har URL par tap karo → GSC khulta hai → Request Indexing
```

**Aapka rozana kaam: 2 minute.** Ek file drop karna, aur subah Telegram me 10-12 link par tap karna.

---

## Imaandaar baat — kya automatic ho sakta hai, kya nahi

| Kaam | Automatic? |
|---|---|
| Audit + deploy | **Haan, 100%** |
| Sitemap banana + submit | **Haan, 100%** |
| Bing / Yandex / Naver / Seznam indexing | **Haan, 100%** (IndexNow — minute bhar me) |
| Google ko sitemap batana | **Haan** |
| Google me kaunsa page atka hai — pata lagana | **Haan** (URL Inspection API) |
| Google ka **"Request Indexing" button dabana** | **NAHI ho sakta** |

Google ke paas iska koi API hai hi nahi. Jo "instant indexing" bechte hain wo **Indexing API** ka galat istemaal karte hain — wo API sirf **JobPosting aur BroadcastEvent** ke liye hai. Calculator page usse bhejna seedha policy violation hai, aur aapke roadmap §31 ka ullanghan bhi.

**Isliye ye system wo kaam karta hai jo asal me chalta hai:** aapko roz batata hai ki **sirf 10-12 URL** par dhyan dena hai, aur har URL ka seedha GSC link deta hai. 30 second ka kaam, 231 URL check karne ka nahi.

Aur sach ye bhi hai — **2-3 hafte baad manual Request Indexing ki zaroorat hi khatam ho jaati hai.** Wo naye site ki bais hai. Sahi `lastmod` + internal linking + regular content — Google khud aata rehta hai.

---

## Kharcha

| Cheez | Paisa |
|---|---|
| Cloudflare Pages | **₹0** (free plan me 20,000 files) |
| GitHub repo + Actions | **₹0** |
| IndexNow | **₹0**, koi limit nahi |
| Bing URL Submission API | **₹0** (10,000 URL/din tak) |
| Google Search Console API | **₹0** |
| Telegram bot | **₹0** |
| Oracle VM | aapka PAYG — ye scripts ~30 MB RAM lete hain |

**Kul: ₹0/mahina.**

---

# Setup — step by step

## Step 1 · GitHub repo banayein (10 min)

1. GitHub par naya repo: `sabhisaab` (private ya public, dono chalega)
2. Apne computer se abhi wala folder push karein:
```bash
cd SabHisaab
git init && git branch -M main
git add -A && git commit -m "Sab Hisaab v8"
git remote add origin git@github.com:AAPKA-USERNAME/sabhisaab.git
git push -u origin main
```
3. `.github/workflows/audit.yml` aur `scripts/` folder bhi isi repo me daal dein

## Step 2 · Cloudflare Pages ko repo se jodein (5 min)

Cloudflare Dashboard → Workers & Pages → apna Pages project → **Settings → Builds & deployments → Connect to Git** → repo chunein.

- Build command: **khaali chhod dein**
- Build output directory: **`/`**

Ab se `git push` = deploy. Drag-and-drop hamesha ke liye band. Sirf badli hui file jaati hai, isliye 1 GB repo par bhi push 2 second ka hota hai.

## Step 3 · VM par setup (10 min)

```bash
# ye poora folder VM par bhejein (ya GitHub se clone karein)
scp -r sabhisaab-auto/ ubuntu@AAPKA-VM-IP:/tmp/
ssh ubuntu@AAPKA-VM-IP
sudo mkdir -p /opt/sabhisaab && sudo chown -R $USER:$USER /opt/sabhisaab
cp -r /tmp/sabhisaab-auto/* /opt/sabhisaab/
cd /opt/sabhisaab && bash setup.sh
```

`setup.sh` khud ye karega: **2GB swap** (957MB RAM ke liye zaroori), Python venv, packages, folders, cron file.

Phir apni site clone karein:
```bash
git clone git@github.com:AAPKA-USERNAME/sabhisaab.git /opt/sabhisaab/site
```

## Step 4 · IndexNow key (5 min) — Bing yahin se turant index karega

1. Bing Webmaster Tools → **URL Submission → IndexNow** → key generate karein (32 character)
2. Us key ke naam se file banayein, andar wahi key likhein:
```bash
KEY=aapki32characterkeyyahan
echo -n "$KEY" > /opt/sabhisaab/site/$KEY.txt
```
3. `config.json` me `indexnow_key` bharein
4. Commit + push. Check: `https://sabhisaab.com/AAPKI-KEY.txt` khulni chahiye

## Step 5 · Bing API key (2 min)

Bing Webmaster Tools → **Settings → API Access → API Key** → copy karke `config.json` me `bing_api_key`.

## Step 6 · Google Search Console API (15 min) — thoda lamba, par ek hi baar

1. [console.cloud.google.com](https://console.cloud.google.com) → naya project "sabhisaab"
2. **APIs & Services → Library** → *Google Search Console API* → Enable
3. **Credentials → Create Credentials → Service Account** → naam `gsc-bot` → Done
4. Us service account par click → **Keys → Add Key → JSON** → file download
5. File VM par rakhein:
```bash
mkdir -p /opt/sabhisaab/secrets
# JSON ko yahan copy karein:
nano /opt/sabhisaab/secrets/gsc-service-account.json
chmod 600 /opt/sabhisaab/secrets/gsc-service-account.json
```
6. **Sabse zaroori:** JSON me jo `client_email` hai (jaise `gsc-bot@sabhisaab.iam.gserviceaccount.com`) use Search Console me add karein:
   GSC → Settings → **Users and permissions → Add user** → wahi email → permission **Owner**

> Service account ko **Owner** dena zaroori hai, warna URL Inspection API kaam nahi karega.

## Step 7 · Telegram bot (5 min)

1. Telegram me **@BotFather** → `/newbot` → naam dein → token milega
2. Apne bot ko ek message bhejein, phir:
```bash
curl -s "https://api.telegram.org/botAAPKA_TOKEN/getUpdates" | grep -o '"id":[0-9-]*' | head -1
```
   Jo number mila wahi `telegram_chat_id` hai
3. `config.json` me dono bharein

## Step 8 · Test karein

```bash
cd /opt/sabhisaab
./venv/bin/python scripts/audit.py            # ERROR: 0 aana chahiye
./venv/bin/python scripts/indexnow.py https://sabhisaab.com/
./venv/bin/python scripts/gsc.py sitemap
./venv/bin/python scripts/gsc.py report       # Telegram par report aani chahiye
```

Sab theek chale to cron laga dein:
```bash
crontab /opt/sabhisaab/crontab.txt
crontab -l
```

**Bas. Ab system apne aap chalega.**

---

# Rozana ka istemaal

### Naya page publish karna
1. Claude se: *"Topic: PM Kisan samman nidhi calculator. Poora page banao."*
2. File download karein
3. VM par daalein — teen me se koi bhi tarika:
   ```bash
   scp naya-page.html ubuntu@VM-IP:/opt/sabhisaab/incoming/
   ```
   ya mobile se GitHub web editor me paste karke commit
   ya VM par `nano /opt/sabhisaab/incoming/naya-page.html`
4. **Bas.** 10 minute me: audit → deploy → Bing indexed → Telegram par "ho gaya"

Agar audit fail hua to page live nahi jaayega, file `.rejected` ban jaayegi, aur Telegram par exact wajah aa jaayegi. Wo wajah mujhe bhej dijiye, main theek karke dobara de dunga.

### Rozana subah
Telegram par report: *"Aaj ye 9 URL dabaayein"* — har link par tap → GSC khulta hai → **Request Indexing**. 30 second.

---

# Zaroori niyam (roadmap §31 ke saath)

- **Google Indexing API kabhi mat use karna.** Wo JobPosting/BroadcastEvent ke liye hai. Koi bhi tool "Google instant indexing" beche — mana kar dena.
- **IndexNow me wahi URL baar-baar mat bhejna.** Sirf jo sach me badla ho. Bing repeat submission par bharosa ghata deta hai.
- **`audit.py` ka ERROR zero na ho to deploy mat karna.** `publish.py` ye khud rokta hai — us surakshaa ko hataana mat.
- **GSC me REMOVALS kabhi mat chhoona.**
- Images 200 MB se upar jaayein to **Cloudflare R2** par le jaana (10 GB free, egress free), `img.sabhisaab.com` se serve karna.

---

# File kya-kya hai

| File | Kaam |
|---|---|
| `setup.sh` | Ek baar ka VM setup (swap, venv, folders, cron) |
| `config.example.json` | Settings ka template |
| `scripts/lib.py` | Common helpers |
| `scripts/audit.py` | Roadmap §30 ka poora audit — 60+ check |
| `scripts/publish.py` | Main pipeline: ingest → audit → sitemap → push → ping → report |
| `scripts/indexnow.py` | Bing/Yandex/Naver/Seznam instant |
| `scripts/bing_submit.py` | Bing URL Submission API |
| `scripts/gsc.py` | Sitemap resubmit + kaunse page index nahi hue |
| `scripts/notify.py` | Telegram |
| `.github/workflows/audit.yml` | GitHub par bhi audit — kharab code merge hi nahi hoga |
