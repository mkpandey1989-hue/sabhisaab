/* Sab Hisaab — "App jaisa install karein" button (v1)
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

  // Pehle se app-mode me chal raha hai? To button ki zaroorat nahi.
  var standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (standalone) return;

  // User ne pehle band kiya tha? 14 din tak dobara na dikhao.
  try {
    var dismissed = localStorage.getItem('sh_a2hs_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed, 10) < 14 * 24 * 60 * 60 * 1000) return;
  } catch (e) {}

  var deferredPrompt = null;

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
