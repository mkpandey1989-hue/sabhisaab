/* Sab Hisaab — "App jaisa install karein" button + footer social links (v3, 29 Oct 2026: footer me hamesha "📲 App / Home screen" button)
   Har page par bas ye ek line <body> ke end se pehle daalein:
   <script src="/install-app.js" defer></script>

   Kya karta hai:
   1. Service worker register karta hai (offline support + installability)
   2. Android/Chrome par jab site installable hoti hai to ek chhota
      floating "📲 App banayein" button dikhata hai
   3. iPhone/Safari par Share → "Add to Home Screen" ka hint dikhata hai
   4. Agar app pehle se installed hai to kuch nahi dikhata */

(function () {
  'use strict';

  // 1) Service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }


  // 0) Footer me hamare social channel (v2, 28 Oct 2026) - ek jagah se, saare page par
  try {
    var SOCIAL = [["Suno Natak", [["YouTube", "https://www.youtube.com/@sunonatak"], ["Facebook", "https://www.facebook.com/sunonatak"], ["Instagram", "https://www.instagram.com/sunonatak"], ["Threads", "https://www.threads.net/@sunonatak"]]], ["Sab Hisaab Money", [["YouTube", "https://www.youtube.com/@sabhisaabmoney"], ["Facebook", "https://www.facebook.com/sabhisaabmoney"], ["Instagram", "https://www.instagram.com/sabhisaabmoney"], ["Threads", "https://www.threads.net/@sabhisaabmoney"]]], ["Labh Lo Deals", [["YouTube", "https://www.youtube.com/@labhlodeals"], ["Facebook", "https://www.facebook.com/labhlodeals"], ["Instagram", "https://www.instagram.com/labhlodeals"], ["Threads", "https://www.threads.net/@labhlodeals"]]], ["Pahadi Hisaab", [["YouTube", "https://www.youtube.com/@pahadihisaab"], ["Facebook", "https://www.facebook.com/pahadihisaab"], ["Instagram", "https://www.instagram.com/pahadihisaab"], ["Threads", "https://www.threads.net/@pahadihisaab"]]], ["WhatsApp", [["Sab Hisaab", "https://whatsapp.com/channel/0029Vb8rHA5EFeXmREHFHk3n"]]], ["Telegram", [["t.me/sabhisaab", "https://t.me/sabhisaab"]]], ["Pinterest", [["sabhisaabcom", "https://www.pinterest.com/sabhisaabcom/"]]]];
    var footer = document.querySelector('footer');
    if (footer && !document.getElementById('shSocial') && !document.getElementById('shSocialStatic')) {
      var box = document.createElement('div');
      box.id = 'shSocial';
      box.style.cssText = 'max-width:1100px;margin:10px auto 0;padding:10px 16px;font-size:.85rem;line-height:1.9;text-align:center';
      var head = document.createElement('b');
      head.textContent = 'Hamare channel: ';
      box.appendChild(head);
      SOCIAL.forEach(function (b) {
        var s = document.createElement('span');
        s.style.cssText = 'display:inline-block;margin:0 8px';
        s.appendChild(document.createTextNode(b[0] + ' '));
        b[1].forEach(function (x) {
          var a = document.createElement('a');
          a.href = x[1]; a.textContent = x[0]; a.target = '_blank'; a.rel = 'noopener';
          a.style.cssText = 'margin:0 3px';
          s.appendChild(a);
        });
        box.appendChild(s);
      });
      var all = document.createElement('a');
      all.href = '/links'; all.textContent = 'Saare link';
      all.style.cssText = 'margin-left:8px;font-weight:600';
      box.appendChild(all);
      footer.appendChild(box);
    }
  } catch (e) {}

  // v3: footer me HAMESHA ek "📲 App / Home screen par" button (✕ dabane ya Chrome ke prompt na dene par bhi)
  var _early = null;
  window.addEventListener('beforeinstallprompt', function (e) { _early = e; });
  try {
    var ft = document.querySelector('footer');
    var isApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (ft && !isApp && !document.getElementById('shInstallFoot')) {
      var fb = document.createElement('div');
      fb.id = 'shInstallFoot';
      fb.style.cssText = 'text-align:center;margin:12px auto 4px';
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = '📲 Sab Hisaab ko Home screen par lagayein (app jaisa)';
      b.style.cssText = 'background:#0F766E;color:#fff;border:none;border-radius:100px;padding:9px 16px;font-weight:600;cursor:pointer;font-size:.88rem';
      b.addEventListener('click', function () {
        var ev = deferredPrompt || _early;
        if (ev && ev.prompt) { ev.prompt(); return; }
        var ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        alert(ios ? 'Safari me neeche Share (⬆️) dabayein → "Add to Home Screen".'
                  : 'Browser ke menu (⋮) me "Add to Home screen" / "Install app" dabayein.');
      });
      fb.appendChild(b);
      ft.appendChild(fb);
    }
  } catch (e) {}

  // Pehle se app-mode me chal raha hai? To button ki zaroorat nahi.
  var standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (standalone) return;

  // User ne pehle band kiya tha? 14 din tak dobara na dikhao.
  try {
    var dismissed = localStorage.getItem('sh_a2hs_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed, 10) < 3 * 24 * 60 * 60 * 1000) return;   // v3: 14 -> 3 din
  } catch (e) {}

  var deferredPrompt = _early || null;

  function makeBtn(label) {
    var wrap = document.createElement('div');
    wrap.id = 'shInstallBar';
    wrap.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:9999;' +
      'display:flex;align-items:center;gap:10px;background:#0F766E;color:#fff;' +
      'padding:10px 14px 10px 16px;border-radius:100px;box-shadow:0 8px 24px rgba(0,0,0,.22);' +
      'font-family:Inter,system-ui,sans-serif;font-size:.9rem;font-weight:600;max-width:92vw';
    var txt = document.createElement('span');
    txt.textContent = label;
    var close = document.createElement('button');
    close.setAttribute('aria-label', 'Band karein');
    close.textContent = '✕';
    close.style.cssText =
      'background:rgba(255,255,255,.18);border:none;color:#fff;width:26px;height:26px;' +
      'border-radius:50%;cursor:pointer;font-size:.8rem;flex:0 0 auto';
    close.addEventListener('click', function (ev) {
      ev.stopPropagation();
      try { localStorage.setItem('sh_a2hs_dismissed', String(Date.now())); } catch (e) {}
      wrap.remove();
    });
    wrap.appendChild(txt);
    wrap.appendChild(close);
    document.body.appendChild(wrap);
    return wrap;
  }

  // 2) Android / Chrome / Edge — asli install prompt
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var bar = makeBtn('📲 Sab Hisaab app jaisa install karein');
    bar.style.cursor = 'pointer';
    bar.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        bar.remove();
      });
    });
  });

  window.addEventListener('appinstalled', function () {
    var bar = document.getElementById('shInstallBar');
    if (bar) bar.remove();
  });

  // 3) iPhone / iPad Safari — beforeinstallprompt support nahi hai, hint dikhao
  var ua = navigator.userAgent;
  var isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
  var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  if (isIOS && isSafari) {
    setTimeout(function () {
      if (document.getElementById('shInstallBar')) return;
      makeBtn('📲 App banayein: Share (⬆️) → "Add to Home Screen"');
    }, 2500);
  }
})();
