#!/usr/bin/env python3
"""Telegram par report. Har URL ke saath GSC ka seedha inspect link —
kholte hi 'Request Indexing' button saamne hota hai (1 tap)."""
import sys, os, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import cfg, log

def send(text, disable_preview=True):
    C = cfg()
    if not C.get("telegram_enabled"):
        print(text); return True
    url = "https://api.telegram.org/bot%s/sendMessage" % C["telegram_token"]
    ok = True
    for i in range(0, len(text), 3800):                 # Telegram ki 4096 char limit
        try:
            r = requests.post(url, timeout=25, data={
                "chat_id": C["telegram_chat_id"], "text": text[i:i + 3800],
                "parse_mode": "HTML", "disable_web_page_preview": disable_preview})
            ok = ok and r.status_code == 200
            if r.status_code != 200: log("Telegram: %s" % r.text[:150])
        except Exception as e:
            log("Telegram FAIL: %s" % e); ok = False
    return ok

if __name__ == "__main__":
    send(sys.stdin.read())
