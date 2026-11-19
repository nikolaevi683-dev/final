/* Ncap · coupons.js — экран «Купоны по облигациям».
 * Кнопка появляется на странице «Портфель». Данные берутся из Edge Function get-tinkoff-coupons.
 * Логику app.js не меняет: только использует его функции (pfMoney, functionsUrl, db, showPortfolio...). */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => (typeof pfEsc === 'function' ? pfEsc(s)
    : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));

  const css = `
#couponsPage .cp-seg{display:flex;gap:6px;background:var(--surface);padding:5px;border-radius:999px;margin:0 0 14px}
#couponsPage .cp-seg button{flex:1;height:38px;border-radius:999px;font-size:13px;font-weight:600;color:var(--muted);background:none}
#couponsPage .cp-seg button.active{background:var(--text);color:var(--bg)}
#couponsPage .cp-chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:12px;scrollbar-width:none}
#couponsPage .cp-chips::-webkit-scrollbar{display:none}
#couponsPage .cp-chips button{flex:none;height:38px;padding:0 16px;border-radius:999px;background:var(--surface);color:var(--muted);font-size:13px;font-weight:600}
#couponsPage .cp-chips button.active{background:var(--accent);color:var(--on-accent)}
#couponsPage .cp-custom{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
#couponsPage .cp-custom input{height:48px;font-size:14px}
#couponsPage .cp-hero{background:var(--surface);border-radius:28px;padding:20px 20px 18px;margin-bottom:6px}
#couponsPage .cp-hero small{display:block;color:var(--muted);font-size:13px}
#couponsPage .cp-hero strong{display:block;font-size:34px;letter-spacing:-.03em;margin:6px 0 14px;color:var(--profit)}
#couponsPage .cp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
#couponsPage .cp-stats div{background:var(--surface-2);border-radius:16px;padding:10px 12px}
#couponsPage .cp-stats span{display:block;font-size:11px;color:var(--muted)}
#couponsPage .cp-stats b{display:block;font-size:14px;margin-top:3px;font-weight:600}
#couponsPage .cp-sec{display:flex;justify-content:space-between;align-items:baseline;margin:24px 4px 8px}
#couponsPage .cp-sec h3{font-size:14px;font-weight:600}
#couponsPage .cp-sec span{font-size:13px;color:var(--muted)}
#couponsPage .cp-row{display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--surface);border-radius:20px;padding:14px 16px;margin-top:6px}
#couponsPage .cp-row>div:first-child{min-width:0}
#couponsPage .cp-row b{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#couponsPage .cp-row span{display:block;font-size:12px;color:var(--muted);margin-top:3px}
#couponsPage .cp-row .cp-amt{font-weight:600;font-size:14px;white-space:nowrap;text-align:right}
#couponsPage .cp-row .cp-amt small{display:block;font-size:11px;color:var(--muted);font-weight:400;margin-top:3px}
#couponsPage .cp-up{color:var(--profit)}
#couponsPage .cp-note{font-size:12px;color:var(--muted);text-align:center;margin:18px 0 120px}
#couponsPage .cp-empty{padding:28px 0;text-align:center;color:var(--muted);font-size:14px}
html.privacy #couponsPage .cp-amt,html.privacy #couponsPage .cp-hero strong,html.privacy #couponsPage .cp-stats b{filter:blur(8px)}`;

  const st = document.createElement('style'); st.textContent = css; document.head.append(st);

  /* ---------- состояние ---------- */
  const S = { data: null, loading: false, tab: 'received', period: 'month', from: '', to: '' };
  const PERIODS = [['month', 'Месяц'], ['quarter', 'Квартал'], ['year', 'Год'], ['all', 'Всё время'], ['custom', 'Свой период']];

  /* ---------- вспомогательное ---------- */
  const money = (v, cur, signed) => typeof pfMoney === 'function'
    ? pfMoney(v, cur, signed)
    : (signed && v > 0 ? '+' : '') + Number(v).toLocaleString('ru-RU', {maximumFractionDigits: 2}) + ' ' + cur;
  const sumIn = (items, cur) => items.reduce((s, x) => s + (typeof pfToRub === 'function' ? (pfToRub(x.amount, x.currency) ?? 0) : x.amount), 0);
  // суммы разных валют приводим к рублям по курсам приложения, а показываем через pfRub (в выбранной валюте)
  const total = items => sumIn(items);
  const fmtRub = (rub, signed) => typeof pfRub === 'function' ? pfRub(rub, signed) : Math.round(rub).toLocaleString('ru-RU') + ' ₽';
  const day = iso => new Date(iso).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long'});
  const monthKey = iso => { const d = new Date(iso); return d.getFullYear() * 12 + d.getMonth(); };
  const monthTitle = iso => {
    const t = new Date(iso).toLocaleDateString('ru-RU', {month: 'long', year: 'numeric'}).replace(' г.', '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  function range() {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    if (S.period === 'month') return [new Date(y, m, 1), new Date(y, m + 1, 0, 23, 59, 59)];
    if (S.period === 'quarter') { const q = Math.floor(m / 3) * 3; return [new Date(y, q, 1), new Date(y, q + 3, 0, 23, 59, 59)]; }
    if (S.period === 'year') return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59)];
    if (S.period === 'custom') {
      const a = S.from ? new Date(S.from + 'T00:00:00') : new Date(2000, 0, 1);
      const b = S.to ? new Date(S.to + 'T23:59:59') : new Date(2100, 0, 1);
      return [a, b];
    }
    return [new Date(2000, 0, 1), new Date(2100, 0, 1)];
  }

  /* ---------- страница ---------- */
  const page = document.createElement('div');
  page.id = 'couponsPage'; page.className = 'hidden';
  page.innerHTML = `
    <button class="back-button" id="cpBack"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg> Назад</button>
    <h1>Купоны</h1>
    <p class="subtitle">Выплаты по облигациям: что получено и что ждать</p>
    <div class="cp-seg" id="cpTabs">
      <button data-t="received" class="active">Получено</button>
      <button data-t="upcoming">Ожидается</button>
    </div>
    <div id="cpFilters"></div>
    <p id="cpStatus" class="auth-status hidden"></p>
    <div id="cpBody"></div>`;
  const pp = $('portfolioPage');
  (pp || document.body).after(page);

  /* кнопка на странице портфеля */
  if (pp) {
    const btn = document.createElement('button');
    btn.className = 'all-trades-button'; btn.id = 'cpOpen'; btn.type = 'button';
    btn.innerHTML = '<div><span>Облигации</span><strong>Купоны</strong></div><span class="all-trades-arrow">→</span>';
    const anchor = pp.querySelector('.all-trades-button');
    const tiles = document.createElement('div'); tiles.className = 'pf-tiles';
    anchor ? (anchor.before(tiles), tiles.append(anchor, btn)) : (tiles.append(btn), pp.prepend(tiles));
    btn.onclick = openCoupons;
  }

  function status(msg, err) {
    const el = $('cpStatus');
    el.textContent = msg || ''; el.classList.toggle('hidden', !msg); el.classList.toggle('error', !!err);
  }

  /* ---------- загрузка ---------- */
  async function load(force) {
    if (S.loading || (S.data && !force)) return;
    S.loading = true; status(''); render();
    try {
      const { data: { session } } = await db.auth.getSession();
      if (!session) { status('Нет активной сессии', true); return; }
      const res = await fetch(functionsUrl('get-tinkoff-coupons'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({})
      });
      let r = {}; try { r = await res.json(); } catch (e) {}
      if (!res.ok) {
        status(r.code === 'no_token' ? 'Подключите T-Invest API в настройках, чтобы увидеть купоны' : (r.error || 'Не удалось загрузить купоны'), true);
        return;
      }
      S.data = r;
    } catch (e) {
      console.error('coupons load:', e);
      status('Ошибка сети. Попробуйте ещё раз.', true);
    } finally { S.loading = false; render(); }
  }

  /* ---------- отрисовка ---------- */
  function renderFilters() {
    const el = $('cpFilters');
    if (S.tab !== 'received') { el.innerHTML = ''; return; }
    el.innerHTML =
      `<div class="cp-chips">${PERIODS.map(([k, t]) => `<button data-p="${k}" class="${S.period === k ? 'active' : ''}">${t}</button>`).join('')}</div>` +
      (S.period === 'custom'
        ? `<div class="cp-custom"><input type="date" id="cpFrom" value="${S.from}" max="${ymd(new Date())}" aria-label="С даты"><input type="date" id="cpTo" value="${S.to}" aria-label="По дату"></div>` : '');
  }

  function row(left, sub, right, rightSub) {
    return `<div class="cp-row"><div><b>${left}</b><span>${sub}</span></div><div class="cp-amt">${right}${rightSub ? `<small>${rightSub}</small>` : ''}</div></div>`;
  }

  // временная диагностика: что реально пришло от брокера
  function dbg() {
    const d = S.data && S.data.debug; if (!d) return '';
    const rows = (d.perAccount || []).map(a =>
      `Счёт …${esc(a.account)}: купонов/налога в истории ${a.filtered}, операций за 45 дней ${a.recentTotal}<br>` +
      `типы: ${esc(Object.entries(a.recentTypes || {}).map(([k, v]) => k.replace('OPERATION_TYPE_', '') + ' ' + v).join(', ') || '—')}`).join('<br>');
    return `<p class="cp-note" style="text-align:left;margin-bottom:0">Диагностика. Всего получено записей: ${S.data.received.length}. Счетов: ${(d.accounts || []).length}.<br>${rows}</p>`;
  }

  function renderReceived() {
    const [a, b] = range();
    const all = S.data.received.filter(x => { const t = new Date(x.date); return t >= a && t <= b; });
    const coupons = all.filter(x => x.kind === 'coupon'), taxes = all.filter(x => x.kind === 'tax');
    if (!all.length) return `<div class="cp-empty">За выбранный период купонов нет</div>` + dbg();

    const gross = total(coupons), tax = total(taxes), net = gross + tax;
    let h = `<section class="cp-hero"><small>Получено за период (после налога)</small><strong>${fmtRub(net)}</strong>
      <div class="cp-stats">
        <div><span>Купоны</span><b>${fmtRub(gross)}</b></div>
        <div><span>Налог</span><b>${fmtRub(tax)}</b></div>
        <div><span>Выплат</span><b>${coupons.length}</b></div>
      </div></section>`;

    // по облигациям
    const byBond = new Map();
    coupons.forEach(x => {
      const k = x.name || x.figi, o = byBond.get(k) || { sum: 0, n: 0 };
      o.sum += (typeof pfToRub === 'function' ? pfToRub(x.amount, x.currency) ?? 0 : x.amount); o.n++; byBond.set(k, o);
    });
    h += `<div class="cp-sec"><h3>По облигациям</h3><span>${byBond.size}</span></div>`;
    h += [...byBond.entries()].sort((x, y) => y[1].sum - x[1].sum)
      .map(([k, o]) => row(esc(k), `${o.n} ${plural(o.n, 'выплата', 'выплаты', 'выплат')}`, `<span class="cp-up" style="display:inline;margin:0">${fmtRub(o.sum, true)}</span>`)).join('');

    // по месяцам
    const months = new Map();
    coupons.sort((x, y) => new Date(y.date) - new Date(x.date)).forEach(x => {
      const k = monthKey(x.date); if (!months.has(k)) months.set(k, []); months.get(k).push(x);
    });
    months.forEach(items => {
      h += `<div class="cp-sec"><h3>${monthTitle(items[0].date)}</h3><span>${fmtRub(total(items), true)}</span></div>`;
      h += items.map(x => row(esc(x.name || x.figi), day(x.date), `<span class="cp-up" style="display:inline;margin:0">${money(x.amount, x.currency, true)}</span>`)).join('');
    });
    return h;
  }

  function renderUpcoming() {
    const list = S.data.upcoming || [];
    if (!list.length) return `<div class="cp-empty">Ближайших выплат нет: в портфеле нет облигаций с купонами</div>`;
    const now = Date.now(), in30 = now + 30 * 864e5;
    const s30 = total(list.filter(x => new Date(x.date) <= in30)), sAll = total(list);
    let h = `<section class="cp-hero"><small>Ожидается в ближайшие 30 дней (до налога)</small><strong>${fmtRub(s30)}</strong>
      <div class="cp-stats">
        <div><span>За 12 мес.</span><b>${fmtRub(sAll)}</b></div>
        <div><span>Выплат</span><b>${list.length}</b></div>
        <div><span>Ближайшая</span><b>${new Date(list[0].date).toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'})}</b></div>
      </div></section>`;
    const months = new Map();
    list.forEach(x => { const k = monthKey(x.date); if (!months.has(k)) months.set(k, []); months.get(k).push(x); });
    months.forEach(items => {
      h += `<div class="cp-sec"><h3>${monthTitle(items[0].date)}</h3><span>${fmtRub(total(items), true)}</span></div>`;
      h += items.map(x => row(esc(x.name || x.figi), `${day(x.date)} · ${fmtQty(x.quantity)} шт.`,
        `<span class="cp-up" style="display:inline;margin:0">${money(x.amount, x.currency, true)}</span>`,
        `${money(x.perBond, x.currency)} за 1 шт.`)).join('');
    });
    return h + `<p class="cp-note">Суммы ориентировочные, налог не учтён. Даты и размер купона могут измениться.</p>`;
  }

  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const m = n % 10; return n > 10 && n < 20 ? c : m > 1 && m < 5 ? b : m === 1 ? a : c; };
  const fmtQty = q => Number(q).toLocaleString('ru-RU', {maximumFractionDigits: 0});

  function render() {
    renderFilters();
    document.querySelectorAll('#cpTabs button').forEach(b => b.classList.toggle('active', b.dataset.t === S.tab));
    const body = $('cpBody');
    if (S.loading && !S.data) { body.innerHTML = '<div class="cp-empty">Загружаю купоны…</div>'; return; }
    if (!S.data) { body.innerHTML = ''; return; }
    body.innerHTML = (S.tab === 'received' ? renderReceived() : renderUpcoming()) +
      `<p class="cp-note" style="margin-top:${S.tab === 'received' ? 18 : 0}px"><button id="cpRefresh" style="color:var(--accent);font-size:13px">Обновить данные</button></p>`;
  }

  /* ---------- события ---------- */
  page.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'cpBack') { closeCoupons(); return; }
    if (t.id === 'cpRefresh') { load(true); return; }
    if (t.dataset.t) { S.tab = t.dataset.t; render(); return; }
    if (t.dataset.p) {
      S.period = t.dataset.p;
      if (S.period === 'custom' && !S.from) { const d = new Date(); S.to = ymd(d); d.setMonth(d.getMonth() - 1); S.from = ymd(d); }
      render();
    }
  });
  page.addEventListener('change', e => {
    if (e.target.id === 'cpFrom') { S.from = e.target.value; render(); }
    if (e.target.id === 'cpTo') { S.to = e.target.value; render(); }
  });

  /* ---------- навигация ---------- */
  function openCoupons() {
    if (pp) pp.classList.add('hidden');
    page.classList.remove('hidden');
    scrollTo(0, 0);
    render(); load(false);
  }
  function closeCoupons() {
    page.classList.add('hidden');
    if (typeof window.showPortfolio === 'function') window.showPortfolio();
  }
  const hideCoupons = () => page.classList.add('hidden');
  window.openCoupons = openCoupons;

  // любая другая навигация приложения сначала закрывает экран купонов
  ['showHome', 'showPortfolio', 'showAnalysis', 'showSettings', 'openAllTrades'].forEach(name => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () { hideCoupons(); return orig.apply(this, arguments); };
  });

  // смена валюты в приложении: перерисовываем суммы
  const origCur = window.setCurrency;
  if (typeof origCur === 'function') {
    window.setCurrency = function () {
      const r = origCur.apply(this, arguments);
      if (!page.classList.contains('hidden')) render();
      return r;
    };
  }
})();