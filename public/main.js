/* Двойное Рождество — приглашение
   Без сборки и без зависимостей: работает и с диска, и на любом хостинге. */
(function () {
  'use strict';

  // Скрипт загрузился — аварийный показ контента (из <head>) больше не нужен.
  if (window.__rv) { clearTimeout(window.__rv); }

  var doc = document;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- Праздник: время по Минску (UTC+3 круглый год) ---------- */
  var HOUR = 3600000;
  var T1 = Date.UTC(2026, 10, 10, 16, 0, 0); // 10 ноября 2026, 19:00 Минск
  var T2 = Date.UTC(2026, 10, 11, 16, 0, 0); // 11 ноября 2026, 19:00 Минск

  /* ---------- Подсказка ---------- */
  var toastEl = $('#toast');
  var toastTimer = 0;
  function toast(text) {
    if (!toastEl) { return; }
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 4600);
  }

  /* ---------- Буфер обмена ---------- */
  function legacyCopy(text) {
    var ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    doc.body.appendChild(ta);
    ta.select();
    try { ta.setSelectionRange(0, text.length); } catch (e) { /* ignore */ }
    var ok = false;
    try { ok = doc.execCommand('copy'); } catch (e2) { ok = false; }
    doc.body.removeChild(ta);
    return ok;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  /* ---------- Звёзды на первом экране ---------- */
  (function stars() {
    var sky = $('#stars');
    if (!sky) { return; }
    var n = window.innerWidth < 700 ? 48 : 96;
    var frag = doc.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var s = doc.createElement('i');
      var bright = Math.random() < 0.12;
      var size = bright ? 2.4 + Math.random() * 1.2 : 1 + Math.random() * 1.3;
      s.style.left = (Math.random() * 100).toFixed(2) + '%';
      s.style.top = (Math.pow(Math.random(), 1.5) * 82).toFixed(2) + '%';
      s.style.width = s.style.height = size.toFixed(2) + 'px';
      s.style.setProperty('--d', (3 + Math.random() * 5).toFixed(2) + 's');
      s.style.setProperty('--l', (-Math.random() * 8).toFixed(2) + 's');
      if (bright) { s.className = 'b'; }
      frag.appendChild(s);
    }
    sky.appendChild(frag);
  })();

  /* ---------- Мираж: святые места проступают в небе первого экрана ---------- */
  (function mirage() {
    var box = $('#mirage');
    if (!box) { return; }
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.saveData) { return; } // экономия трафика: фон не грузим
    var BASE = 'assets/mirage/', VER = '?v=2';
    var scenes = $$('.mirage__s', box);
    var count = reduceMotion ? 1 : scenes.length;
    var idx = 0;

    // Сцены подгружаются по очереди после загрузки страницы: сначала первая, остальные — по мере готовности.
    function loadNext() {
      if (idx >= count) { return; }
      var el = scenes[idx++];
      var name = el.getAttribute('data-n');
      var left = 2;
      function done() {
        left -= 1;
        if (left > 0) { return; }
        el.children[0].style.backgroundImage = 'url(' + BASE + name + '-haze.webp' + VER + ')';
        el.children[1].style.backgroundImage = 'url(' + BASE + name + '.webp' + VER + ')';
        if (idx === 1) { box.classList.add('is-on'); }
        loadNext();
      }
      [name + '-haze.webp', name + '.webp'].forEach(function (file) {
        var img = new Image();
        img.onload = img.onerror = done;
        img.src = BASE + file + VER;
      });
    }

    function start() { setTimeout(loadNext, 250); }
    if (doc.readyState === 'complete') { start(); } else { window.addEventListener('load', start); }

    // Пока первый экран не виден, анимацию ставим на паузу.
    var hero = $('.hero');
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        box.classList.toggle('is-paused', !entries[0].isIntersecting);
      }).observe(hero);
    }
  })();

  /* ---------- Верхняя панель ---------- */
  (function nav() {
    var bar = $('.nav');
    if (!bar) { return; }
    var busy = false;
    function update() {
      busy = false;
      bar.classList.toggle('is-scrolled', (window.pageYOffset || doc.documentElement.scrollTop) > 24);
    }
    window.addEventListener('scroll', function () {
      if (!busy) { busy = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  })();

  /* ---------- Появление блоков при прокрутке ---------- */
  (function reveal() {
    var items = $$('.reveal');
    function showAll() { items.forEach(function (el) { el.classList.add('is-in'); }); }
    if (reduceMotion || !('IntersectionObserver' in window)) { showAll(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
    items.forEach(function (el) { io.observe(el); });
    window.addEventListener('beforeprint', showAll);
  })();

  /* ---------- Обратный отсчёт ---------- */
  (function countdown() {
    var el = $('#countdown');
    if (!el) { return; }
    var last = '';
    function plural(n, f) {
      var a = Math.abs(n) % 100, b = a % 10;
      if (a > 10 && a < 20) { return f[2]; }
      if (b > 1 && b < 5) { return f[1]; }
      if (b === 1) { return f[0]; }
      return f[2];
    }
    function until(name, ms) {
      var m = Math.max(0, Math.floor(ms / 60000));
      var d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
      var parts = [];
      if (d) { parts.push('<b>' + d + '</b> ' + plural(d, ['день', 'дня', 'дней'])); }
      if (d || h) { parts.push('<b>' + h + '</b> ' + plural(h, ['час', 'часа', 'часов'])); }
      parts.push('<b>' + mm + '</b> ' + plural(mm, ['минута', 'минуты', 'минут']));
      return 'До ' + name + ' — ' + parts.join(' ');
    }
    function tick() {
      var now = Date.now(), html;
      if (now < T1) { html = until('Рождества Баба', T1 - now); }
      else if (now < T1 + 4 * HOUR) { html = 'Рождество Баба — праздник уже начался. Присоединяйтесь!'; }
      else if (now < T2) { html = until('Рождества Бахауллы', T2 - now); }
      else if (now < T2 + 4 * HOUR) { html = 'Рождество Бахауллы — праздник уже начался. Присоединяйтесь!'; }
      else { html = 'Двойное Рождество прошло. Спасибо всем, кто был с нами!'; }
      if (html !== last) { el.innerHTML = html; last = html; }
    }
    tick();
    setInterval(tick, 15000);
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) { tick(); } });
  })();

  /* ---------- Календарь (.ics) ---------- */
  (function calendar() {
    var btn = $('#ics-btn');
    if (!btn) { return; }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function stamp(ts) {
      var d = new Date(ts);
      return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
        pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
    }
    function esc(s) {
      return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    }
    function bytes(ch) {
      var c = ch.codePointAt(0);
      return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    }
    function fold(line) { // строки .ics не длиннее 75 байт (UTF-8)
      var out = [], cur = '', size = 0;
      Array.from(line).forEach(function (ch) {
        var b = bytes(ch);
        if (size + b > 74) { out.push(cur); cur = ' ' + ch; size = 1 + b; }
        else { cur += ch; size += b; }
      });
      out.push(cur);
      return out.join('\r\n');
    }
    function build() {
      var now = stamp(Date.now());
      var place = 'Минск, пр. Независимости, 12-30';
      var about = 'Молитвы, истории, беседа и творчество. Двери открыты для всех. ' +
        'Вопросы: +375 29 833-96-52 (Сергей). Instagram: @dabro_razam';
      var list = [
        { id: 'bab', start: T1, name: 'Рождество Баба — Двойное Рождество' },
        { id: 'bahaullah', start: T2, name: 'Рождество Бахауллы — Двойное Рождество' }
      ];
      var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dabro Razam//Twin Holy Days 2026//RU',
        'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + esc('Двойное Рождество')];
      list.forEach(function (ev) {
        L.push('BEGIN:VEVENT',
          'UID:twin-holy-days-2026-' + ev.id + '@dabro-razam',
          'DTSTAMP:' + now,
          'DTSTART:' + stamp(ev.start),
          'DTEND:' + stamp(ev.start + 3 * HOUR),
          'SUMMARY:' + esc(ev.name),
          'LOCATION:' + esc(place),
          'DESCRIPTION:' + esc(about),
          'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('Через 2 часа — Двойное Рождество'),
          'TRIGGER:-PT2H', 'END:VALARM',
          'END:VEVENT');
      });
      L.push('END:VCALENDAR');
      return L.map(fold).join('\r\n') + '\r\n';
    }
    btn.addEventListener('click', function () {
      var blob = new Blob([build()], { type: 'text/calendar;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = doc.createElement('a');
      a.href = url;
      a.download = 'Dvoynoe-Rozhdestvo-2026.ics';
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      toast('Файл календаря скачан — откройте его, и оба вечера появятся в вашем календаре.');
    });
  })();

  /* ---------- Отклик: заявка уходит на сервер и приходит организатору в Telegram ---------- */
  (function rsvp() {
    var form = $('#rsvp-form');
    if (!form) { return; }

    var nameIn = $('#f-name'), nameField = $('#name-field'), nameErr = $('#f-name-err');
    var phoneIn = $('#f-phone'), phoneField = $('#phone-field'), phoneErr = $('#f-phone-err');
    var cntOut = $('#cnt'), minus = $('#cnt-minus'), plus = $('#cnt-plus');
    var kids = $('#f-kids'), first = $('#f-first'), note = $('#f-note'), trap = $('#f-website');
    var btn = $('#send-btn'), btnLabel = $('#send-label');
    var box = $('#form-status'), boxText = $('#form-status-text'), boxAlt = $('#form-status-alt');

    var LABEL_IDLE = 'Отправить заявку';
    var LABEL_BUSY = 'Отправка...';
    var TIMEOUT_MS = 20000;
    var count = 1;
    var sending = false;

    // Адрес сервера. По умолчанию — тот же сайт (/api/lead). Если страница лежит отдельно от сервера,
    // адрес сервера вписывается в <meta name="api-base" content="https://..."> в index.html.
    var meta = $('meta[name="api-base"]');
    var API_BASE = ((meta && meta.getAttribute('content')) || '').replace(/\/+$/, '');
    var API_URL = API_BASE + '/api/lead';

    // Страница и сервер на разных адресах: заранее «будим» сервер — бесплатные хостинги засыпают.
    if (API_BASE && window.fetch) {
      fetch(API_BASE + '/api/health').then(function (r) { return r.text(); }).catch(function () { /* не страшно */ });
    }

    var LETTER = (function () {
      try { return new RegExp('\\p{L}', 'u'); } catch (e) { return /[A-Za-z\u0400-\u04FF]/; }
    })();

    /* --- проверка полей (те же правила, что и на сервере) --- */
    function tidy(s) { return s.replace(/\s+/g, ' ').trim(); }

    function nameProblem(v) {
      v = tidy(v);
      if (v.length < 2) { return 'Подпишитесь, пожалуйста — так мы будем знать, кого ждать.'; }
      if (!LETTER.test(v)) { return 'В имени должны быть буквы.'; }
      return '';
    }

    function phoneProblem(v) {
      v = tidy(v);
      var digits = v.replace(/\D/g, '');
      if (!v) { return 'Укажите телефон — так мы сможем вам ответить.'; }
      if (!/^\+?[\d\s().-]+$/.test(v)) { return 'В телефоне допустимы только цифры, пробелы и знаки + - ( ).'; }
      if (digits.length < 10) { return 'В номере должно быть не меньше 10 цифр, например +375 29 123-45-67.'; }
      if (digits.length > 15) { return 'В номере слишком много цифр.'; }
      return '';
    }

    function setError(field, input, out, text) {
      field.classList.toggle('is-bad', !!text);
      out.hidden = !text;
      out.textContent = text || '';
      if (text) { input.setAttribute('aria-invalid', 'true'); } else { input.removeAttribute('aria-invalid'); }
    }

    function validate() {
      var nErr = nameProblem(nameIn.value), pErr = phoneProblem(phoneIn.value);
      setError(nameField, nameIn, nameErr, nErr);
      setError(phoneField, phoneIn, phoneErr, pErr);
      if (nErr) { nameIn.focus(); return false; }
      if (pErr) { phoneIn.focus(); return false; }
      return true;
    }

    /* --- что увидит организатор в поле «Сообщение» --- */
    function dayText(v) {
      if (v === 'd10') { return '10 ноября (Рождество Баба), в 19:00'; }
      if (v === 'd11') { return '11 ноября (Рождество Бахауллы), в 19:00'; }
      return 'оба вечера — 10 и 11 ноября, в 19:00';
    }

    function compose() {
      var checked = form.querySelector('input[name="days"]:checked');
      var bring = $$('input[name="bring"]:checked', form).map(function (i) { return i.value; });
      var extra = note.value.trim();
      var lines = ['Когда: ' + dayText(checked ? checked.value : 'both')];
      lines.push('Гостей: ' + count + (kids.checked ? ' (с детьми)' : ''));
      if (first.checked) { lines.push('Впервые на празднике бахаи: да'); }
      if (bring.length) { lines.push('Принесу: ' + bring.join(', ')); }
      if (extra) { lines.push('Комментарий: ' + extra); }
      return lines.join('\n');
    }

    function minCount() { return kids.checked ? 2 : 1; }
    function setCount(n) {
      count = Math.max(minCount(), Math.min(20, n));
      cntOut.textContent = String(count);
    }

    /* --- состояние кнопки и сообщения под ней --- */
    function setBusy(on) {
      sending = on;
      btn.disabled = on;
      btn.classList.toggle('is-busy', on);
      btn.setAttribute('aria-busy', on ? 'true' : 'false');
      btnLabel.textContent = on ? LABEL_BUSY : LABEL_IDLE;
    }

    function showStatus(kind, text, withContacts) {
      box.className = 'rform__status rform__status--' + kind;
      box.setAttribute('role', kind === 'err' ? 'alert' : 'status');
      boxText.textContent = text;
      boxAlt.hidden = !withContacts;
      box.hidden = false;
      if (box.scrollIntoView) { box.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); }
    }

    function onSuccess(who) {
      form.reset();
      count = 1;
      cntOut.textContent = '1';
      setError(nameField, nameIn, nameErr, '');
      setError(phoneField, phoneIn, phoneErr, '');
      showStatus('ok', 'Спасибо, ' + who + '! Заявка отправлена — мы будем рады видеть вас. Если планы изменятся, просто дайте знать.', false);
    }

    function onFailure(r) {
      var text;
      if (r.status === 400 && r.data && r.data.fields) {
        setError(nameField, nameIn, nameErr, r.data.fields.name || '');
        setError(phoneField, phoneIn, phoneErr, r.data.fields.phone || '');
        if (r.data.fields.name) { nameIn.focus(); } else if (r.data.fields.phone) { phoneIn.focus(); }
      }
      if (r.status === 0) {
        text = r.aborted
          ? 'Сервер слишком долго не отвечает. Попробуйте ещё раз.'
          : 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
      } else if (r.status === 404 || r.status === 405 || r.status === 501) {
        text = 'Приём заявок на этой странице пока не подключён.';
      } else if (r.data && typeof r.data.error === 'string' && r.data.error) {
        text = r.data.error;
      } else {
        text = 'Не удалось отправить заявку. Попробуйте ещё раз через минуту.';
      }
      showStatus('err', text, r.status === 0 || r.status >= 500 || r.status === 404 || r.status === 405);
    }

    function readResponse(res) {
      return res.text().then(function (t) {
        var data = null;
        try { data = JSON.parse(t); } catch (e) { data = null; }
        return { status: res.status, ok: res.ok, data: data };
      });
    }

    /* --- отправка --- */
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) { return; }
      box.hidden = true;
      if (!validate()) { return; }
      if (!window.fetch) {
        showStatus('err', 'Этот браузер не умеет отправлять заявки. Пожалуйста, обновите его.', true);
        return;
      }

      var who = tidy(nameIn.value);
      var payload = { name: who, phone: tidy(phoneIn.value), message: compose(), website: trap.value };
      var hadFocus = doc.activeElement === btn;
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) { ctrl.abort(); } }, TIMEOUT_MS);
      setBusy(true);

      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(readResponse).then(function (r) {
        if (r.ok && r.data && r.data.ok === true) { onSuccess(who); } else { onFailure(r); }
      }).catch(function (err) {
        onFailure({ status: 0, data: null, aborted: !!(err && err.name === 'AbortError') });
      }).then(function () {
        clearTimeout(timer);
        setBusy(false);
        if (hadFocus) { btn.focus(); }
      });
    });

    /* --- мелочи интерфейса --- */
    minus.addEventListener('click', function () { setCount(count - 1); });
    plus.addEventListener('click', function () { setCount(count + 1); });
    kids.addEventListener('change', function () { setCount(count); });

    nameIn.addEventListener('input', function () {
      if (nameField.classList.contains('is-bad') && !nameProblem(nameIn.value)) { setError(nameField, nameIn, nameErr, ''); }
    });
    phoneIn.addEventListener('input', function () {
      if (phoneField.classList.contains('is-bad') && !phoneProblem(phoneIn.value)) { setError(phoneField, phoneIn, phoneErr, ''); }
    });
    phoneIn.addEventListener('blur', function () {
      if (phoneIn.value.trim()) { setError(phoneField, phoneIn, phoneErr, phoneProblem(phoneIn.value)); }
    });
  })();

  /* ---------- Поделиться ---------- */
  (function share() {
    var btn = $('#share-btn');
    if (!btn) { return; }
    btn.addEventListener('click', function () {
      var data = {
        title: 'Двойное Рождество · 10 и 11 ноября · Минск',
        text: 'Приглашаю на Двойное Рождество — праздник рождения Баба и Бахауллы. 10 и 11 ноября, 19:00, Минск. Молитвы, истории, беседа и творчество.',
        url: window.location.href.split('#')[0]
      };
      if (navigator.share) {
        navigator.share(data).catch(function () { /* пользователь передумал */ });
        return;
      }
      copyText(data.text + ' ' + data.url).then(function (ok) {
        toast(ok ? 'Приглашение скопировано — отправьте его другу.' : 'Скопируйте адрес страницы из строки браузера.');
      });
    });
  })();
})();
