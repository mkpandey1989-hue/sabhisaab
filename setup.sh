#!/usr/bin/env bash
# Sab Hisaab — Oracle VM ek-baar ka setup. Ubuntu/Oracle Linux dono par chalega.
set -e
BASE=/opt/sabhisaab
echo "==> 1/7  Swap (957MB RAM ke liye zaroori)"
if ! swapon --show | grep -q swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
  echo "    2GB swap ban gaya"
else echo "    swap pehle se hai"; fi

echo "==> 2/7  Packages"
if command -v apt >/dev/null; then sudo apt update -qq && sudo apt install -y -qq python3-pip python3-venv git curl
else sudo dnf install -y -q python3-pip git curl; fi

echo "==> 3/7  Folder"
sudo mkdir -p $BASE/{incoming,secrets,backup}
sudo chown -R $USER:$USER $BASE
cd $BASE

echo "==> 4/7  Python venv (RAM bachane ke liye alag)"
python3 -m venv $BASE/venv
$BASE/venv/bin/pip install -q --upgrade pip
$BASE/venv/bin/pip install -q requests google-auth google-auth-httplib2 google-api-python-client
echo "    ho gaya"

echo "==> 5/7  Git repo"
if [ ! -d "$BASE/site/.git" ]; then
  echo "    ABHI KARNA HAI: apna GitHub repo yahan clone karein —"
  echo "    git clone git@github.com:USERNAME/sabhisaab.git $BASE/site"
else echo "    repo pehle se hai"; fi

echo "==> 6/7  Config"
[ -f $BASE/config.json ] || cp $BASE/config.example.json $BASE/config.json
echo "    $BASE/config.json ko edit karke keys bharein"

echo "==> 7/7  Cron"
cat <<'CRON' > $BASE/crontab.txt
# --- Sab Hisaab automation ---
# Har 10 min: incoming/ me naya page ho to audit -> deploy -> IndexNow -> Telegram
*/10 * * * * cd /opt/sabhisaab && ./venv/bin/python scripts/publish.py >> cron.log 2>&1
# Roz 6:30 AM IST: GSC report (kaunse page index nahi hue) Telegram par
0 1 * * * cd /opt/sabhisaab && ./venv/bin/python scripts/gsc.py report >> cron.log 2>&1
# Har Sunday 7 AM IST: poora audit report
30 1 * * 0 cd /opt/sabhisaab && ./venv/bin/python scripts/audit.py > audit.txt 2>&1; ./venv/bin/python scripts/notify.py < audit.txt
# Roz raat: site ka backup (7 din rakhta hai)
0 20 * * * cd /opt/sabhisaab && tar czf backup/site-$(date +\%F).tgz site --exclude=.git && find backup -name '*.tgz' -mtime +7 -delete
CRON
echo "    crontab.txt ban gaya. Lagane ke liye:  crontab $BASE/crontab.txt"
echo
echo "SETUP KHATAM. Ab README.md ke Step 3 se aage badhein."
