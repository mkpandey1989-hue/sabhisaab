# Sab Hisaab — sabhisaab.com (website code)

Hinglish free calculators ki static website. Hosting: **Cloudflare Pages** (project `sabhisaab`).

## Kaun chalata hai (29 Oct 2026 se)
- Saara kaam **Oracle VM `nifty-a1` par chalne wala ek hi Telegram bot (sabhinet)** karta hai:
  ZIP lena → audit → GitHub par commit → deploy → Google sitemap → sirf badle URL IndexNow → roz GSC/GA4 report.
- Ye repo **sirf code ki copy** hai (AI/developer padh sake). Purana Cloudflare Worker bot aur GitHub cron band.
- Deploy: Cloudflare token VM par ho to bot seedha VM se (`wrangler pages deploy`), warna `deploy.yml` (workflow_dispatch).

## Folder
- `site/` — poori website (yahi deploy hoti hai). URL hamesha bina `.html`.
- `scripts/` — `audit.py` (ERROR 0 ke bina deploy nahi), `calc_test.py` (har calculator chala kar), `ginti_sync.py`, `daily.py`, `watch.py`, `gsc.py`, `indexnow.py`.
- `state/` — roz ki report ki yaad (index status waghairah; koi secret nahi).

## Pakke niyam
- Ek din mein 10 se zyada **naye** page nahi. Publish date backdate nahi. aggregateRating/fake review nahi.
- IndexNow sirf badle URL (din mein max 10, ek URL 14 din mein ek baar). Sitemap delete/resubmit nahi.
- `_redirects` file kabhi nahi. Social link sirf `install-app.js` + `links/about/contact` mein.
- Privacy (`/privacy`) aur bot ka asli kaam hamesha ek jaisa — pehle code, phir policy, dono saath.
