/* Sab Hisaab services kit v3.8.7 - har kaam ka sawal-form, file/photo/voice bhejna (photo apne aap chhoti), sahayak.
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

  /* v3.8.7 (owner: "adhura number / kuch bhi likh de / placeholder backspace se mitana pad raha") -
     har field ke upar saaf label, placeholder halka "jaise: ..." (asli likha hua na lage), mobile 10 ank jaanch + apne aap +91/0/space hatao,
     bekaar likhawat (aaaa, 12345, asdf) par pyaar se bata do. Browser ki angrezi popup nahi - Hindi mein wahi field ke neeche. */
  K.phone = function (v, optional) {
    var d = String(v || '').replace(/\D/g, '');
    if (!d) return optional ? { ok: true, num: '' } : { ok: false, msg: 'Mobile number likhiye (10 ank)' };
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    else if (d.length === 11 && d[0] === '0') d = d.slice(1);
    if (d.length < 10) return { ok: false, msg: 'Number adhura hai — ' + d.length + ' ank likhe, 10 chahiye' };
    if (d.length > 10) return { ok: false, msg: 'Number mein ' + d.length + ' ank hain — sirf 10 ank ka mobile likhiye' };
    if (!/^[6-9]/.test(d)) return { ok: false, msg: 'Mobile number 6, 7, 8 ya 9 se shuru hota hai' };
    if (/^(\d)\1{9}$/.test(d)) return { ok: false, msg: 'Apna asli mobile number likhiye — isi par baat hogi' };
    return { ok: true, num: d };
  };
  K.junk = function (t, min) {
    t = String(t || '').trim();
    var L = t.match(/[A-Za-zऀ-ॿ]/g) || [], u = {};
    L.forEach(function (c) { u[c.toLowerCase()] = 1; });
    if (L.length < (min || 3) || Object.keys(u).length < 3) return true;
    if (/^(.)\1+$/.test(t.replace(/\s/g, ''))) return true;
    if (/^(asdf|qwer|zxcv|abcd|hjkl|test|xyz|hello|hi|hii|ok|aaa)+$/i.test(t.replace(/[\s\W]/g, ''))) return true;
    return false;
  };
  function wrap(f, lab, hint) {
    var w = document.createElement('div'); w.className = 'kit-w';
    f.parentNode.insertBefore(w, f);
    if (lab) { var l = document.createElement('label'); l.className = 'kit-lab'; l.textContent = lab; if (f.id) l.htmlFor = f.id; w.appendChild(l); }
    w.appendChild(f);
    var e = document.createElement('div'); e.className = 'kit-err'; e.setAttribute('role', 'alert'); w.appendChild(e);
    if (hint != null) f.placeholder = hint;
    return e;
  }
  /* opt = {f: {name: [label|null, hint, rule]}, labels: true/false}; rule: 'name'|'phone'|'phone?'|'msg'|'id'|'l4'|'' */
  K.enhance = function (form, opt) {
    if (!form || form.getAttribute('data-kit')) return; form.setAttribute('data-kit', '1');
    form.noValidate = true; form.classList.add('kit-x');
    var F = (opt && opt.f) || {}, list = [];
    Object.keys(F).forEach(function (n) {
      var f = form.querySelector('[name="' + n + '"]') || document.getElementById(n); if (!f) return;
      var c = F[n], err = (opt.labels === false) ? (function () { var e = document.createElement('div'); e.className = 'kit-err'; f.insertAdjacentElement('afterend', e); if (c[1] != null) f.placeholder = c[1]; return e; })() : wrap(f, c[0], c[1]);
      var r = c[2] || '';
      if (r.indexOf('phone') === 0) { f.type = 'tel'; f.setAttribute('inputmode', 'tel'); f.setAttribute('autocomplete', 'tel-national'); f.maxLength = 16; }
      if (r === 'name') { f.setAttribute('autocomplete', 'name'); f.setAttribute('autocapitalize', 'words'); }
      if (r === 'l4') { f.setAttribute('inputmode', 'numeric'); f.maxLength = 4; }
      if (r === 'id') { f.setAttribute('autocapitalize', 'characters'); f.setAttribute('autocomplete', 'off'); f.setAttribute('spellcheck', 'false'); }
      var it = { f: f, r: r, err: err, touched: false };
      function chk(show) {
        var v = f.value, m = '';
        if (r === 'name') { if (K.junk(v, 2) && !(/[A-Za-zऀ-ॿ]{2,}/.test(v) && v.trim().length >= 2 && !/\d/.test(v))) m = 'Apna naam likhiye (jaise: Ramesh Kumar)'; else if (/\d/.test(v)) m = 'Naam mein ank nahi — sirf naam likhiye'; }
        else if (r === 'phone' || r === 'phone?') { var p = K.phone(v, r === 'phone?'); if (!p.ok) m = p.msg; else it.num = p.num; }
        else if (r === 'msg') { if (!v.trim()) m = 'Kya kaam hai, 1-2 line mein likhiye'; else if (K.junk(v, 4)) m = 'Thoda saaf likhiye — jaise: "naukri ke liye resume chahiye" ya "PM Kisan form bharna hai"'; }
        else if (r === 'id') { f.value = v.toUpperCase().replace(/\s/g, ''); if (!/^SH[A-Z0-9]{3,}$/.test(f.value)) m = 'Kaam number SH se shuru hota hai (jaise SH261124AB3X) — sandesh/page par likha hai'; }
        else if (r === 'l4') { f.value = v.replace(/\D/g, '').slice(0, 4); if (f.value.length !== 4) m = 'Mobile ke aakhri 4 ank likhiye'; }
        else if (r === 'email') { if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim())) m = 'Sahi email likhiye (jaise: naam@gmail.com)'; }
        else if (r === 'need' && !v.trim()) m = 'Ye chunein / bhariye';
        if (show) { err.textContent = m; f.classList.toggle('kit-bad', !!m); f.classList.toggle('kit-ok', !m && !!v.trim()); f.setAttribute('aria-invalid', m ? 'true' : 'false'); }
        return !m;
      }
      it.chk = chk;
      f.addEventListener('blur', function () { if (f.value.trim()) { it.touched = true; chk(true); if ((r === 'phone' || r === 'phone?') && it.num) f.value = it.num; } });
      f.addEventListener('input', function () { if (it.touched || f.classList.contains('kit-bad')) chk(true); });
      list.push(it);
    });
    var cons = form.querySelector('input[name="consent"]');
    form.kitCheck = function () {
      var bad = null;
      list.forEach(function (it) { it.touched = true; if (!it.chk(true) && !bad) bad = it.f; if ((it.r === 'phone' || it.r === 'phone?') && it.num) it.f.value = it.num; });
      if (cons && !cons.checked) {
        var ce = form.querySelector('.kit-cerr'); if (!ce) { ce = document.createElement('div'); ce.className = 'kit-err kit-cerr'; cons.parentNode.insertAdjacentElement('afterend', ce); }
        ce.textContent = 'Aage badhne ke liye sahmati par ✔ lagaiye'; if (!bad) bad = cons;
        cons.onchange = function () { if (cons.checked) ce.textContent = ''; };
      }
      if (bad) { try { bad.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} setTimeout(function () { bad.focus(); }, 250); return false; }
      return true;
    };
    document.addEventListener('submit', function (e) { if (e.target === form && !form.kitCheck()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  };
  var css = '.kit-q{background:#F8FAFB;border:1px solid #E3E9EC;border-radius:12px;padding:12px;margin:8px 0}.kit-q textarea,.kit-q input,.kit-f{width:100%;padding:10px 12px;border:1px solid #E3E9EC;border-radius:10px;font:inherit;font-size:16px;margin:2px 0 8px;box-sizing:border-box;background:#fff}' +
    '.kit-l{display:block;font-size:.85rem;font-weight:600;margin-top:4px}.kit-l small,.kit-q small{font-weight:400;color:#64748B}.kit-r{font-size:.8rem;color:#115E59;background:#ECFDF5;border-radius:8px;padding:6px 8px;margin:4px 0}' +
    '.kit-n{font-size:.75rem;color:#92400E;background:#FEF3C7;border-radius:8px;padding:6px 8px;margin-top:6px}.kit-h{background:#fff;border:1px solid #E3E9EC;border-radius:14px;padding:12px;margin:12px 0}' +
    '.kit-hl p{margin:6px 0;padding:8px 10px;border-radius:10px;font-size:.9rem}.kit-me{background:#E0F2FE;margin-left:20%!important}.kit-bot{background:#F1F5F9;margin-right:10%!important}' +
    '.kit-hr{display:flex;gap:6px;margin-top:6px}.kit-hr input{flex:1;min-width:0;padding:10px;border:1px solid #E3E9EC;border-radius:10px;font:inherit;font-size:16px}.kit-hr button,.kit-chips button{border:none;background:#0F766E;color:#fff;border-radius:10px;padding:8px 12px;font:inherit;cursor:pointer}' +
    '.kit-x ::placeholder,.kit-q ::placeholder,.kit-h ::placeholder,.findb ::placeholder{color:#A3AEB6;opacity:1;font-style:italic;font-weight:400}.kit-w{min-width:0}.kit-lab{display:block;font-size:.84rem;font-weight:700;color:#334155;margin:4px 0 4px}' +
    '.kit-err{color:#B91C1C;font-size:.82rem;margin:-4px 0 8px;min-height:0}.kit-err:empty{display:none}.kit-bad{border-color:#DC2626!important;background:#FEF2F2!important}.kit-ok{border-color:#16A34A!important}' +
    '.kit-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.kit-chips button{background:#ECFDF5;color:#115E59;font-size:.8rem;padding:5px 10px}.kit-wa{display:inline-block;margin-top:8px;color:#15803D;font-weight:600;font-size:.88rem}';
  var st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);
})();
