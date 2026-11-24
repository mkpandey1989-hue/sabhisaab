/* Sab Hisaab services kit v3.8.1 - har kaam ka sawal-form, file/photo/voice bhejna (photo apne aap chhoti), sahayak.
   Pages: /services-list aur gupt page /q. Koi bahari library nahi. */
(function () {
  var K = window.SVCKIT = {};
  function api() { var b = [window.SVC_API || '/api']; if (window.SVC_API2) b.push(window.SVC_API2); return b; }
  function call(path, opt, ms) {
    var b = api(), i = 0;
    return new Promise(function (ok, no) {
      (function go() {
        var c = window.AbortController ? new AbortController() : null, t = setTimeout(function () { c && c.abort(); }, ms || 15000);
        fetch(b[i] + path, Object.assign({ signal: c ? c.signal : undefined }, opt || {})).then(function (r) {
          clearTimeout(t);
          return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || 'galti'); e.hard = r.status < 500; throw e; } return j; });
        }).then(ok).catch(function (e) { clearTimeout(t); if (!e.hard && ++i < b.length) return go(); no(e); });
      })();
    });
  }
  K.call = call;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  K.kind = function (itemId) { var I = window.SVC_INTAKE; return (I && I.by && I.by[itemId]) || 'any'; };
  /* sawal-form: el mein us kaam ke sawal; values() se {key: text} */
  K.fields = function (el, kind) {
    var I = window.SVC_INTAKE; if (!I || !el) return;
    var s = I.spec[kind] || I.spec.any, h = '<div class="kit-q"><b>' + esc(s.title) + '</b> <small>(jitna pata ho utna — baaki baat karke)</small>';
    s.ask.forEach(function (a) {
      if (a[2] === 'f') return;
      h += '<label class="kit-l">' + esc(a[1]) + (a[3] ? ' <small>' + esc(a[3]) + '</small>' : '') + '</label>' +
        (a[2] === 'a' ? '<textarea data-k="' + a[0] + '" rows="2" maxlength="1500"></textarea>' : '<input data-k="' + a[0] + '" maxlength="300">');
    });
    if (s.ready && s.ready.length) h += '<div class="kit-r">Taiyaar rakhiye: ' + s.ready.map(esc).join(' · ') + '</div>';
    h += '<div class="kit-n">🔒 ' + esc(I.never) + '</div></div>';
    el.innerHTML = h;
  };
  K.values = function (el) {
    var o = {}; if (!el) return o;
    [].forEach.call(el.querySelectorAll('[data-k]'), function (x) { if (x.value.trim()) o[x.getAttribute('data-k')] = x.value.trim(); });
    return o;
  };
  /* photo ko 1600px / ~85% JPEG - 8 MB seema ke andar, net par tez */
  function shrink(f) {
    return new Promise(function (ok) {
      if (!/^image\/(jpe?g|png|webp)$/i.test(f.type) || f.size < 900000 || !window.createImageBitmap) return ok(f);
      createImageBitmap(f).then(function (bm) {
        var m = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = document.createElement('canvas');
        c.width = Math.round(bm.width * m); c.height = Math.round(bm.height * m);
        c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
        c.toBlob(function (b) { ok(b && b.size < f.size ? new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f); }, 'image/jpeg', .85);
      }).catch(function () { ok(f); });
    });
  }
  K.shrink = shrink;
  /* files ek-ek karke; onStep(i, n, msg) */
  K.upload = function (id, k, files, onStep) {
    var list = [].slice.call(files || []), i = 0, res = { ok: 0, bad: [] };
    return new Promise(function (done) {
      (function next() {
        if (i >= list.length) return done(res);
        var f = list[i]; onStep && onStep(i, list.length, f.name);
        shrink(f).then(function (g) {
          if (g.size > 8 * 1024 * 1024) { res.bad.push(f.name + ' (8 MB se badi)'); i++; return next(); }
          var fd = new FormData(); fd.append('id', id); fd.append('k', k); fd.append('file', g, g.name || f.name);
          call('/q/file', { method: 'POST', body: fd }, 60000).then(function () { res.ok++; i++; next(); })
            .catch(function (e) { res.bad.push(f.name + ' (' + e.message + ')'); i++; next(); });
        });
      })();
    });
  };
  K.fileInput = function (multiple) {
    var I = window.SVC_INTAKE || {}, t = (I.files && I.files.types) || 'image/*,application/pdf,audio/*';
    return '<label class="kit-l">📎 Photo / PDF / Word / voice note (10 tak) <small>photo kheench kar bhi</small></label>' +
      '<input type="file" class="kit-f" ' + (multiple === false ? '' : 'multiple') + ' accept="' + t + '">';
  };
  /* sahayak (help) - pehle FAQ, phir seemit AI; har jawab ke saath WhatsApp */
  K.help = function (mount, waText) {
    if (!mount) return;
    mount.innerHTML = '<div class="kit-h"><b>🙋 Koi dikkat? Poochiye</b><div class="kit-hl"></div>' +
      '<div class="kit-hr"><input placeholder="Jaise: file kaise bhejun? payment kaise?" maxlength="300"><button type="button">Poochein</button></div>' +
      '<div class="kit-chips"><button type="button">Rate kitna?</button><button type="button">File kaise bhejun?</button><button type="button">Payment kaise?</button><button type="button">OTP doge?</button></div>' +
      '<a class="kit-wa" target="_blank" rel="noopener" href="https://wa.me/' + (window.SVC_WA || '919917436371') + '?text=' + encodeURIComponent(waText || 'Namaste, mujhe madad chahiye') + '">WhatsApp par poochiye</a></div>';
    var box = mount.querySelector('.kit-hl'), inp = mount.querySelector('input'), btn = mount.querySelector('.kit-hr button');
    function ask(q) {
      if (!q) return; box.innerHTML += '<p class="kit-me">' + esc(q) + '</p><p class="kit-bot">…</p>'; inp.value = '';
      call('/help', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: q }) }, 12000)
        .then(function (j) { box.lastChild.textContent = j.a; }).catch(function () { box.lastChild.textContent = 'Abhi jawab nahi aa paya - WhatsApp par poochiye 🙏'; });
    }
    btn.onclick = function () { ask(inp.value.trim()); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); ask(inp.value.trim()); } };
    [].forEach.call(mount.querySelectorAll('.kit-chips button'), function (b) { b.onclick = function () { ask(b.textContent); }; });
  };
  var css = '.kit-q{background:#F8FAFB;border:1px solid #E3E9EC;border-radius:12px;padding:12px;margin:8px 0}.kit-q textarea,.kit-q input,.kit-f{width:100%;padding:10px 12px;border:1px solid #E3E9EC;border-radius:10px;font:inherit;font-size:16px;margin:2px 0 8px;box-sizing:border-box;background:#fff}' +
    '.kit-l{display:block;font-size:.85rem;font-weight:600;margin-top:4px}.kit-l small,.kit-q small{font-weight:400;color:#64748B}.kit-r{font-size:.8rem;color:#115E59;background:#ECFDF5;border-radius:8px;padding:6px 8px;margin:4px 0}' +
    '.kit-n{font-size:.75rem;color:#92400E;background:#FEF3C7;border-radius:8px;padding:6px 8px;margin-top:6px}.kit-h{background:#fff;border:1px solid #E3E9EC;border-radius:14px;padding:12px;margin:12px 0}' +
    '.kit-hl p{margin:6px 0;padding:8px 10px;border-radius:10px;font-size:.9rem}.kit-me{background:#E0F2FE;margin-left:20%!important}.kit-bot{background:#F1F5F9;margin-right:10%!important}' +
    '.kit-hr{display:flex;gap:6px;margin-top:6px}.kit-hr input{flex:1;min-width:0;padding:10px;border:1px solid #E3E9EC;border-radius:10px;font:inherit;font-size:16px}.kit-hr button,.kit-chips button{border:none;background:#0F766E;color:#fff;border-radius:10px;padding:8px 12px;font:inherit;cursor:pointer}' +
    '.kit-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.kit-chips button{background:#ECFDF5;color:#115E59;font-size:.8rem;padding:5px 10px}.kit-wa{display:inline-block;margin-top:8px;color:#15803D;font-weight:600;font-size:.88rem}';
  var st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);
})();
