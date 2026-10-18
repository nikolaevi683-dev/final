/* Humble · ui.js (этап 1): только оформление. Бизнес-логику app.js не трогает. */
(() => {
  const ORDER = {authPage:-1,homePage:0,portfolioPage:1,analysisPage:3,settingsPage:4,allTradesPage:10,tradeDetails:11,tradePage:12};
  const pages = Object.keys(ORDER).map(id => document.getElementById(id)).filter(Boolean);
  const current = () => (pages.find(e => !e.classList.contains('hidden')) || {}).id;
  let cur = current();

  const nav = document.querySelector('.bottom-nav'), ind = document.createElement('span');
  ind.className = 'nav-ind'; nav.prepend(ind);
  const place = () => {                       // индикатор встаёт под активную вкладку
    const a = nav.querySelector('.nav-button.active');
    nav.classList.toggle('no-active', !a);
    if (a && a.offsetWidth) { ind.style.width = a.offsetWidth + 'px'; ind.style.transform = 'translateX(' + a.offsetLeft + 'px)'; }
  };
  const onPage = () => {                      // направление перехода: вперёд (вправо) или назад (влево)
    const n = current();
    if (n && n !== cur) {
      document.getElementById(n).dataset.dir = ORDER[n] >= (ORDER[cur] ?? ORDER[n]) ? 'fwd' : 'back';
      cur = n;
    }
    requestAnimationFrame(place);
  };
  const po = new MutationObserver(onPage);
  pages.forEach(p => po.observe(p, {attributes: true, attributeFilter: ['class']}));
  new MutationObserver(place).observe(nav, {subtree: true, attributes: true, attributeFilter: ['class']});
  addEventListener('resize', place);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
  place();

  const fab = document.querySelector('.fab');           // кольцо-пульс вокруг «+»
  if (fab) { const r = document.createElement('span'); r.className = 'fab-ring'; fab.prepend(r); }

  const root = document.documentElement; let t, light = root.classList.contains('light-theme');
  new MutationObserver(() => {                    // реагируем только на реальную смену темы, не на собственный класс
    const now = root.classList.contains('light-theme');
    if (now === light) return;
    light = now;
    root.classList.add('theme-anim'); clearTimeout(t);
    t = setTimeout(() => root.classList.remove('theme-anim'), 350);
  }).observe(root, {attributes: true, attributeFilter: ['class']});
})();
/* ===== Humble · Calm: живые детали (логику app.js не трогает) ===== */
(() => {
  const $ = id => document.getElementById(id), body = document.body, root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* приветствие по времени суток */
  const greet = () => {
    const h = new Date().getHours(), el = $('greetHello'), d = $('greetDate');
    if (el) el.textContent = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
    if (d) d.textContent = new Date().toLocaleDateString('ru-RU', {weekday: 'long', day: 'numeric', month: 'long'});
  };
  greet(); setInterval(greet, 6e4);

  /* числа плавно «досчитываются»; знак задаёт цвет */
  const IDS = ['monthPnl','profileTodayPnl','profileTotalPnl','pfTotal','periodPnl','detailsPnl','profileTrades','profileWins','profileLosses'];
  const RE = /\d[\d\s\u00a0.,]*/;
  const tone = (el, txt) => {
    if (!el.matches('.hero strong,#periodPnl,#detailsPnl')) return;
    const v = parseFloat(txt.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0, neg = /[-−–]/.test(txt.split(/\d/)[0]);
    el.classList.toggle('pos', !neg && v > 0); el.classList.toggle('neg', neg && v > 0);
  };
  IDS.map($).filter(Boolean).forEach(el => {
    let busy = false, last = el.textContent, raf;
    const mo = new MutationObserver(() => {
      if (busy) return;
      const to = el.textContent; tone(el, to);
      if (to === last) return; last = to;
      const m = to.match(RE); if (!m || still) return;
      const dec = (m[0].trim().split(/[.,]/)[1] || '').length, end = parseFloat(m[0].replace(/[\s\u00a0]/g, '').replace(',', '.'));
      if (!isFinite(end)) return;
      const t0 = performance.now(), dur = 700; cancelAnimationFrame(raf);
      const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = to.replace(RE, (end * e).toLocaleString('ru-RU', {minimumFractionDigits: dec, maximumFractionDigits: dec}) + (/\s$/.test(m[0]) ? ' ' : ''));
        mo.takeRecords(); /* свои записи не должны перезапускать анимацию */
        if (k < 1) raf = requestAnimationFrame(step); else { el.textContent = to; mo.takeRecords(); }
      };
      raf = requestAnimationFrame(step);
    });
    mo.observe(el, {childList: true, characterData: true, subtree: true});
  });

  /* календарь: индекс для волны появления */
  const cal = $('calendar');
  if (cal) new MutationObserver(() => [...cal.children].forEach((c, i) => c.style.setProperty('--i', i))).observe(cal, {childList: true});

  /* прокрутка: шапка уплотняется, фон слегка смещается */
  let tick = false;
  addEventListener('scroll', () => {
    if (tick) return; tick = true;
    requestAnimationFrame(() => { body.classList.toggle('scrolled', scrollY > 16); root.style.setProperty('--sy', Math.min(scrollY, 600) * .08); tick = false; });
  }, {passive: true});

  /* волна под пальцем + лёгкий отклик вибрацией */
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('.save-button,.add-button,.edit-button,.an-go,.update-rates-button,.period-button,.direction-button,.nav-button,.fab');
    if (!b) return;
    if (navigator.vibrate && b.matches('.nav-button,.fab')) navigator.vibrate(8);
    if (still || b.matches('.nav-button,.fab')) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, i = document.createElement('span');
    i.className = 'btn-ripple'; i.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(i); setTimeout(() => i.remove(), 650);
  }, {passive: true});

  /* свайп между главными вкладками: Главная ⇄ Портфель ⇄ Итоги */
  const TABS = [['homePage', 'showHome'], ['portfolioPage', 'showPortfolio'], ['analysisPage', 'showAnalysis']];
  let x0 = null, y0 = 0;
  addEventListener('touchstart', e => {
    const t = e.target; x0 = t.closest('input,textarea,select,iframe,.an-chart,.profit-chart,.modal') ? null : e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, {passive: true});
  addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const i = TABS.findIndex(([id]) => { const p = $(id); return p && !p.classList.contains('hidden'); });
    const n = TABS[i + (dx < 0 ? 1 : -1)];
    if (i >= 0 && n && typeof window[n[1]] === 'function') window[n[1]]();
  }, {passive: true});

  /* кнопка сохранения «занята», пока идёт запрос */
  const sb = $('saveTradeButton');
  if (sb) new MutationObserver(() => sb.classList.toggle('busy', sb.disabled)).observe(sb, {attributes: true, attributeFilter: ['disabled']});
})();

/* ===== Calm · продолжение ===== */
(() => {
  const $ = id => document.getElementById(id);
  const mirror = (from, to) => {
    const a = $(from), b = $(to); if (!a || !b) return;
    const sync = () => { if (b.textContent !== a.textContent) b.textContent = a.textContent; };
    new MutationObserver(sync).observe(a, {childList: true, characterData: true, subtree: true}); sync();
  };
  mirror('profileTrades', 'chipTrades'); mirror('profileWinRate', 'chipWr');

  /* «Месяц»: сумма профита по видимому месяцу берётся из ячеек календаря */
  const cal = $('calendar'), mo = $('chipMonth');
  const month = () => {
    if (!cal || !mo) return;
    let sum = 0, any = false;
    cal.querySelectorAll('.calendar-pnl').forEach(e => {
      const t = e.textContent.trim(); if (!t) return;
      const v = parseFloat(t.replace(/[^\d.,kKкК-]/g, '').replace(',', '.')) * (/[kKкК]/.test(t) ? 1000 : 1);
      if (isFinite(v)) { sum += /[-−]/.test(t) && v > 0 ? -v : v; any = true; }
    });
    mo.textContent = any ? (sum > 0 ? '+' : '') + Math.round(sum).toLocaleString('ru-RU') : '—';
    mo.style.color = sum > 0 ? 'var(--profit)' : sum < 0 ? 'var(--loss)' : '';
  };
  if (cal) new MutationObserver(month).observe(cal, {childList: true, subtree: true, characterData: true}); month();

  /* форма: допполя раскрываются сами при редактировании; обязательные подсвечиваются, когда заполнены */
  const tp = $('tradePage'), more = $('moreFields');
  const fill = () => { if (more) more.open = ['stopLoss', 'takeProfit', 'comment'].some(i => $(i) && $(i).value); };
  if (tp) new MutationObserver(() => { if (!tp.classList.contains('hidden')) setTimeout(fill, 0); else if (more) more.open = false; })
    .observe(tp, {attributes: true, attributeFilter: ['class']});
  ['symbol', 'entry', 'exit', 'pnl'].forEach(i => { const e = $(i); if (e) e.addEventListener('input', () => e.classList.toggle('field-ok', !!e.value.trim())); });
})();
/* ===== переключатель валюты в шапке портфеля ===== */
(() => {
  window.syncCur = () => {
    const c = (typeof currentCurrency !== 'undefined' && currentCurrency) || (document.getElementById('currencySelect') || {}).value || 'RUB';
    document.querySelectorAll('#curSeg button').forEach(b => b.classList.toggle('active', b.dataset.cur === c));
  };
  const pp = document.getElementById('portfolioPage');
  if (pp) new MutationObserver(() => { if (!pp.classList.contains('hidden')) syncCur(); }).observe(pp, {attributes: true, attributeFilter: ['class']});
  syncCur();
})();