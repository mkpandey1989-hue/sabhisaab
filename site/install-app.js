/* Sab Hisaab — "App jaisa install karein" button + footer social links (v4, 29 Oct 2026: page ki video link + footer me hamesha "📲 App / Home screen" button)
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

  // v4 (29 Oct 2026): is page ke vishay ki hamari YouTube video (bot roz /videos.json likhta hai). Sirf link - speed par asar nahi.
  try {
    var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    if (path !== '/' && window.fetch) {
      fetch('/videos.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (m) {
        var x = m && m[path];
        var main = document.querySelector('main') || document.querySelector('footer');
        if (!x || !x.v || !main || document.getElementById('shVideo')) return;
        var box = document.createElement('div');
        box.id = 'shVideo';
        box.style.cssText = 'margin:22px 0;padding:14px 16px;border:1px solid #CFE3DF;border-radius:12px;background:#F2FAF8;font-size:.92rem;line-height:1.6';
        var b = document.createElement('b'); b.textContent = '📺 Is hisaab ki video: ';
        var a = document.createElement('a');
        a.href = 'https://www.youtube.com/shorts/' + encodeURIComponent(x.v);
        a.target = '_blank'; a.rel = 'noopener'; a.textContent = x.t || 'YouTube par dekhein';
        box.appendChild(b); box.appendChild(a);
        if (x.c) { var c = document.createElement('div'); c.style.cssText = 'font-size:.82rem;color:#4F5D64'; c.textContent = 'Channel: ' + x.c + ' · Kahaniyan/udaharan kalpanik, hisaab asli'; box.appendChild(c); }
        if (main.tagName === 'MAIN') main.appendChild(box); else main.parentNode.insertBefore(box, main);
      }).catch(function () {});
    }
  } catch (e) {}

  // v5 (9 Nov 2026): 'Aaj ka sawal' - bot /jawab.json likhta hai (sirf naye sawal + code; jawab nahi, taaki jigyasa bani rahe).
  // Homepage par #shJawabList mein 3 sawal; tool/guide page ke neeche ek chhota dabba. Niyam/parichay page par nahi. Koi data bahar nahi jaata.
  try {
    var jp = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    var skipJ = /^\/(jawab|privacy|terms|contact|about|author|links|404|disclaimer|services|editorial-policy)$/.test(jp);
    if (!skipJ && window.fetch) {
      fetch('/jawab.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (m) {
        var items = (m && m.items) || [];
        if (!items.length) return;
        function link(x) {
          var a = document.createElement('a');
          a.href = '/jawab#c' + encodeURIComponent(x.a || x.c);
          a.textContent = x.q;
          return a;
        }
        var list = document.getElementById('shJawabList');
        if (list) {
          list.innerHTML = '';
          items.slice(0, 3).forEach(function (x) {
            var li = document.createElement('li');
            li.appendChild(link(x));
            var s = document.createElement('span');
            s.style.cssText = 'color:#4F5D64;font-size:.82rem';
            s.textContent = ' · ' + (x.b || '') + ' · code #' + x.c;
            li.appendChild(s);
            list.appendChild(li);
          });
          return;
        }
        if (jp === '/' || document.getElementById('shJawab')) return;
        var main = document.querySelector('main') || document.querySelector('footer');
        if (!main) return;
        var x = items[0];
        var box = document.createElement('div');
        box.id = 'shJawab';
        box.style.cssText = 'margin:22px 0;padding:14px 16px;border:1px solid #E8DDB5;border-radius:12px;background:#FFFBEA;font-size:.92rem;line-height:1.6';
        var b = document.createElement('b'); b.textContent = '🧩 Aaj ka sawal (' + (x.b || 'Sab Hisaab') + '): ';
        box.appendChild(b);
        box.appendChild(document.createTextNode(x.q + ' '));
        var go = link(x); go.textContent = 'Sahi jawab aur wajah dekhein →';
        box.appendChild(go);
        var t = document.createElement('div');
        t.style.cssText = 'font-size:.82rem;color:#4F5D64;margin-top:4px';
        t.appendChild(document.createTextNode('Roz naye sawal: '));
        var tg = document.createElement('a'); tg.href = 'https://t.me/sabhisaab'; tg.rel = 'noopener'; tg.textContent = 'Telegram';
        var wa = document.createElement('a'); wa.href = 'https://whatsapp.com/channel/0029Vb8rHA5EFeXmREHFHk3n'; wa.rel = 'noopener'; wa.textContent = 'WhatsApp channel';
        t.appendChild(tg); t.appendChild(document.createTextNode(' · ')); t.appendChild(wa);
        box.appendChild(t);
        if (main.tagName === 'MAIN') main.appendChild(box); else main.parentNode.insertBefore(box, main);
      }).catch(function () {});
    }
  } catch (e) {}


  // v2.9.2: notification - sirf button dabane par (koi popup nahi). OneSignal subscription unke paas, hamare paas kuch nahi.
  try { var bt0 = document.getElementById('shJawabList') || document.getElementById('jwStreak');
    if (bt0 && !document.getElementById('shPush')) { var pb = document.createElement('button'); pb.id = 'shPush';
      pb.type = 'button'; pb.textContent = '🔔 Roz ka naya sawal notification par'; pb.style.cssText = 'margin:8px 0;padding:8px 14px;border-radius:999px;border:1px solid #0F766E;background:#fff;color:#0F766E;cursor:pointer;font-size:.9rem';
      bt0.parentNode.insertBefore(pb, bt0.nextSibling);
      pb.addEventListener('click', function () { var s = document.createElement('script');
        s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'; s.defer = true;
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        OneSignalDeferred.push(function (OS) { OS.init({ appId: '7f1f483a-3d96-4e27-b0e6-1c787ad8c0e1' }).then(function () {
          return OS.Notifications.requestPermission(); }).then(function () { pb.textContent = '✅ Notification chalu (band: browser setting)'; }); });
        document.head.appendChild(s); }); } } catch (e) {}

  // Pehle se app-mode me chal raha hai? To button ki zaroorat nahi.
  var standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (standalone) return;

  // User ne pehle band kiya tha? 3 din tak dobara na dikhao.
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
