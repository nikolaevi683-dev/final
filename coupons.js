/* Ncap · coupons.js — экран «Купоны по облигациям».
 * Кнопка появляется на странице «Портфель». Данные берутся из Edge Function get-tinkoff-coupons.
 * Логику app.js не меняет: только использует его функции (pfMoney, functionsUrl, db, showPortfolio...). */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => (typeof pfEsc === 'function' ? pfEsc(s)
    : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])));

  const css = `
#couponsPage .cp-seg{display:flex;gap:6px;background:var(--surface);padding:5px;border-radius:999px;margin:0 0 10px}
#couponsPage .cp-seg button{flex:1;height:40px;border-radius:999px;font-size:14px;font-weight:600;color:var(--muted);background:none}
#couponsPage .cp-seg button.active{background:var(--text);color:var(--bg)}
#couponsPage .cp-chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;margin-bottom:10px;scrollbar-width:none}
#couponsPage .cp-chips::-webkit-scrollbar{display:none}
#couponsPage .cp-chips button{flex:none;height:36px;padding:0 16px;border-radius:999px;background:var(--surface);color:var(--muted);font-size:13px;font-weight:600}
#couponsPage .cp-chips button.active{background:var(--accent);color:var(--on-accent)}
#couponsPage .cp-custom{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
#couponsPage .cp-custom input{height:48px;font-size:14px}
#couponsPage .cp-hero{background:linear-gradient(150deg,color-mix(in srgb,var(--profit) 16%,var(--surface)),var(--surface) 72%);border:1px solid var(--line);border-radius:28px;padding:20px;margin-bottom:8px}
#couponsPage .cp-hero small{display:block;color:var(--muted);font-size:13px}
#couponsPage .cp-hero strong{display:block;font-size:36px;letter-spacing:-.03em;margin:6px 0 16px;color:var(--profit)}
#couponsPage .cp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
#couponsPage .cp-stats div{background:color-mix(in srgb,var(--bg) 40%,var(--surface-2));border-radius:16px;padding:10px 12px;min-width:0}
#couponsPage .cp-stats span{display:block;font-size:11px;color:var(--muted)}
#couponsPage .cp-stats b{display:block;font-size:14px;margin-top:3px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#couponsPage .cp-chart{background:var(--surface);border-radius:24px;padding:16px 14px 12px;margin-bottom:4px}
#couponsPage .cp-bars{display:flex;align-items:flex-end;gap:6px;height:100px}
#couponsPage .cp-bar{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px}
#couponsPage .cp-bar u{display:block;width:100%;max-width:34px;min-height:4px;border-radius:8px 8px 4px 4px;background:var(--accent);opacity:.7}
#couponsPage .cp-bar.now u{background:var(--profit);opacity:1}
#couponsPage .cp-bar span{font-size:10px;color:var(--muted)}
#couponsPage .cp-sec{display:flex;justify-content:space-between;align-items:baseline;margin:16px 6px 2px}
#couponsPage .cp-sec h3{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
#couponsPage .cp-sec span{font-size:13px;font-weight:600}
#couponsPage .cp-card{background:var(--surface);border-radius:22px;overflow:hidden}
#couponsPage .cp-row{display:flex;align-items:center;gap:12px;padding:13px 16px}
#couponsPage .cp-row+.cp-row{border-top:1px solid var(--line)}
#couponsPage .cp-lead{flex:none;width:42px;height:42px;border-radius:14px;background:var(--surface-2);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
#couponsPage .cp-lead b{font-size:15px;font-weight:600}
#couponsPage .cp-lead span{font-size:10px;color:var(--muted);margin-top:3px;text-transform:uppercase}
#couponsPage .cp-lead.av{font-size:15px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--surface-2))}
#couponsPage .cp-mid{min-width:0;flex:1}
#couponsPage .cp-mid b{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#couponsPage .cp-mid>span{display:block;font-size:12px;color:var(--muted);margin-top:3px}
#couponsPage .cp-share{height:4px;border-radius:99px;background:var(--surface-2);margin-top:8px;overflow:hidden}
#couponsPage .cp-share i{display:block;height:100%;border-radius:inherit;background:var(--profit)}
#couponsPage .cp-amt{flex:none;text-align:right;white-space:nowrap}
#couponsPage .cp-amt .cp-up{font-weight:600;font-size:14px}
#couponsPage .cp-amt small{display:block;font-size:11px;color:var(--muted);margin-top:3px}
#couponsPage .cp-up{color:var(--profit)}
#couponsPage .cp-note{font-size:12px;line-height:1.45;color:var(--muted);text-align:center;margin:18px 0 0}
#couponsPage .cp-refresh{display:block;margin:16px auto 120px;padding:11px 20px;border-radius:14px;background:var(--surface);color:var(--text);font-size:13px;font-weight:600}
#couponsPage .cp-empty{padding:36px 20px;text-align:center;color:var(--muted);font-size:14px;line-height:1.5;background:var(--surface);border-radius:24px}
#couponsPage .cp-acc{background:var(--surface);border-radius:22px;margin-top:8px;overflow:hidden}
#couponsPage .cp-acc-h{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;text-align:left;background:none;color:var(--text)}
#couponsPage .cp-acc-h b{display:block;font-size:15px;font-weight:600}
#couponsPage .cp-acc-h span{display:block;font-size:12px;color:var(--muted);margin-top:3px}
#couponsPage .cp-acc-r{display:flex;align-items:center;gap:12px;flex:none}
#couponsPage .cp-acc-r em{font-style:normal;font-weight:600;font-size:14px;color:var(--profit)}
#couponsPage .cp-chev{width:8px;height:8px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg) translateY(-2px);transition:transform .3s}
#couponsPage .cp-acc.open .cp-chev{transform:rotate(225deg) translateY(-2px)}
#couponsPage .cp-acc-b{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s ease}
#couponsPage .cp-acc.open .cp-acc-b{grid-template-rows:1fr}
#couponsPage .cp-acc-b>div{overflow:hidden;min-height:0}
#couponsPage .cp-acc-b .cp-row{border-top:1px solid var(--line)}
html.privacy #couponsPage .cp-acc-r em{filter:blur(8px)}
@media (prefers-reduced-motion:reduce){#couponsPage .cp-acc-b,#couponsPage .cp-chev{transition:none}}
#couponsPage .cp-hint{margin:-4px 4px 14px;font-size:13px;line-height:1.45;color:var(--muted)}
#couponsPage .cp-cap{margin:0 2px 12px;font-size:12px;font-weight:600;color:var(--muted)}
#couponsPage .cp-chev{width:9px;height:9px}
html.privacy #couponsPage .cp-amt,html.privacy #couponsPage .cp-hero strong,html.privacy #couponsPage .cp-stats b{filter:blur(8px)}`;

  const st = document.createElement('style'); st.textContent = css; document.head.append(st);

  /* ---------- состояние ---------- */
  const S = { r: {period: 'month', from: '', to: ''}, u: {period: 'all', from: '', to: ''}, open: new Set(['bonds']), upInit: false, data: null, loading: false, tab: 'received', period: 'month', from: '', to: '' };
  const P = () => (S.tab === 'received' ? S.r : S.u);
  const UNAME = {month: 'до конца месяца', quarter: 'до конца квартала', year: 'до конца года', all: 'в ближайший год', custom: 'за выбранный период'};
  const PNAME = {month: 'за этот месяц', quarter: 'за этот квартал', year: 'за этот год', all: 'за всё время', custom: 'за выбранный период'};
  const PERIODS = [['month', 'Месяц'], ['quarter', 'Квартал'], ['year', 'Год'], ['all', 'Всё время'], ['custom', 'Свой период']];

  /* ---------- вспомогательное ---------- */
  const money = (v, cur, signed) => typeof pfMoney === 'function'
    ? pfMoney(v, cur, signed)
    : (signed && v > 0 ? '+' : '') + Number(v).toLocaleString('ru-RU', {maximumFractionDigits: 2}) + ' ' + cur;
  const sumIn = (items, cur) => items.reduce((s, x) => s + (typeof pfToRub === 'function' ? (pfToRub(x.amount, x.currency) ?? 0) : x.amount), 0);
  // суммы разных валют приводим к рублям по курсам приложения, а показываем через pfRub (в выбранной валюте)
  const total = items => sumIn(items);
  const fmtRub = (rub, signed) => typeof pfRub === 'function' ? pfRub(rub, signed) : Math.round(rub).toLocaleString('ru-RU') + ' ₽';
  const day = iso => { const d = new Date(iso); return d.toLocaleDateString('ru-RU', d.getFullYear() === new Date().getFullYear() ? {day: 'numeric', month: 'long'} : {day: 'numeric', month: 'long', year: 'numeric'}).replace(' г.', ''); };
  const monthKey = iso => { const d = new Date(iso); return d.getFullYear() * 12 + d.getMonth(); };
  const monthTitle = iso => {
    const t = new Date(iso).toLocaleDateString('ru-RU', {month: 'long', year: 'numeric'}).replace(' г.', '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  function range() {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    if (P().period === 'month') return [new Date(y, m, 1), new Date(y, m + 1, 0, 23, 59, 59)];
    if (P().period === 'quarter') { const q = Math.floor(m / 3) * 3; return [new Date(y, q, 1), new Date(y, q + 3, 0, 23, 59, 59)]; }
    if (P().period === 'year') return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59)];
    if (P().period === 'custom') {
      const a = P().from ? new Date(P().from + 'T00:00:00') : new Date(2000, 0, 1);
      const b = P().to ? new Date(P().to + 'T23:59:59') : new Date(2100, 0, 1);
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
    <p id="cpHint" class="cp-hint"></p>
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
    el.innerHTML =
      `<div class="cp-chips">${PERIODS.map(([k, t]) => `<button data-p="${k}" class="${P().period === k ? 'active' : ''}">${t}</button>`).join('')}</div>` +
      (P().period === 'custom'
        ? `<div class="cp-custom"><input type="date" id="cpFrom" value="${P().from}" ${S.tab === 'received' ? `max="${ymd(new Date())}"` : ''} aria-label="С даты"><input type="date" id="cpTo" value="${P().to}" aria-label="По дату"></div>` : '');
  }

  function row(name, sub, amt, amtSub, lead, share) {
    return `<div class="cp-row">${lead || ''}<div class="cp-mid"><b>${name}</b><span>${sub}</span>${share != null ? `<div class="cp-share"><i style="width:${Math.max(3, Math.min(100, share))}%"></i></div>` : ''}</div><div class="cp-amt"><span class="cp-up">${amt}</span>${amtSub ? `<small>${amtSub}</small>` : ''}</div></div>`;
  }
  const dateLead = iso => { const d = new Date(iso); return `<div class="cp-lead"><b>${d.getDate()}</b><span>${d.toLocaleDateString('ru-RU', {month: 'short'}).replace('.', '')}</span></div>`; };
  const avLead = n => `<div class="cp-lead av">${esc(String(n).trim().charAt(0).toUpperCase())}</div>`;
  const group = (key, title, meta, sum, rows) => `<div class="cp-acc${S.open.has(key) ? ' open' : ''}"><button type="button" class="cp-acc-h" data-acc="${key}" aria-expanded="${S.open.has(key)}"><div><b>${title}</b><span>${meta}</span></div><div class="cp-acc-r"><em>${sum}</em><i class="cp-chev"></i></div></button><div class="cp-acc-b"><div>${rows}</div></div></div>`;
  function bars(months) {
    const ent = [...months.entries()].sort((a, b) => a[0] - b[0]).slice(-12);
    if (ent.length < 2) return '';
    const vals = ent.map(([, it]) => total(it)), max = Math.max(...vals, 1), nowK = monthKey(new Date().toISOString());
    return `<div class="cp-chart"><p class="cp-cap">Выплаты по месяцам</p><div class="cp-bars">` + ent.map(([k, it], i) =>
      `<div class="cp-bar${k === nowK ? ' now' : ''}"><u style="height:${Math.max(5, vals[i] / max * 78)}%"></u><span>${new Date(it[0].date).toLocaleDateString('ru-RU', {month: 'short'}).replace('.', '')}</span></div>`).join('') + `</div></div>`;
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
    if (!all.length) return `<div class="cp-empty">За выбранный период купонов нет.<br>Попробуйте другой период.</div>` + dbg();

    const gross = total(coupons), tax = total(taxes), net = gross + tax;
    let h = `<section class="cp-hero"><small>Пришло на счёт ${PNAME[P().period]} · с учётом налога</small><strong>${fmtRub(net)}</strong>
      <div class="cp-stats">
        <div><span>Начислено</span><b>${fmtRub(gross)}</b></div>
        <div><span>Налог</span><b>${fmtRub(tax)}</b></div>
        <div><span>Выплат</span><b>${coupons.length}</b></div>
      </div></section>`;

    const months = new Map();
    coupons.forEach(x => { const k = monthKey(x.date); if (!months.has(k)) months.set(k, []); months.get(k).push(x); });
    h += bars(months);
    const rows = coupons.slice().sort((x, y) => new Date(y.date) - new Date(x.date))
      .map(x => row(esc(x.name || x.figi), day(x.date), money(x.amount, x.currency, true), '', dateLead(x.date))).join('');
    return h + `<div class="cp-sec"><h3>Выплаты</h3><span>${coupons.length}</span></div><div class="cp-card">${rows}</div>`;
  }

  function renderUpcoming() {
    const full = S.data.upcoming || [];
    if (!full.length) return `<div class="cp-empty">Ближайших выплат нет: в портфеле нет облигаций с купонами</div>`;
    const [a, b] = range();
    const list = full.filter(x => { const t = new Date(x.date); return t >= a && t <= b; });
    if (!list.length) return `<div class="cp-empty">В выбранном периоде выплат нет.<br>Попробуйте другой период.</div>`;
    let h = `<section class="cp-hero"><small>Придёт ${UNAME[P().period]} · до налога</small><strong>${fmtRub(total(list))}</strong>
      <div class="cp-stats">
        <div><span>За 12 мес.</span><b>${fmtRub(total(full))}</b></div>
        <div><span>Выплат</span><b>${list.length}</b></div>
        <div><span>Следующая</span><b>${new Date(list[0].date).toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'})}</b></div>
      </div></section>`;
    const months = new Map();
    list.forEach(x => { const k = monthKey(x.date); if (!months.has(k)) months.set(k, []); months.get(k).push(x); });
    h += bars(months);
    const rows = list.map(x => row(esc(x.name || x.figi), `${fmtQty(x.quantity)} шт. · ${money(x.perBond, x.currency)} за 1`, money(x.amount, x.currency, true), '', dateLead(x.date))).join('');
    return h + `<div class="cp-sec"><h3>Ближайшие выплаты</h3><span>${list.length}</span></div><div class="cp-card">${rows}</div><p class="cp-note">Суммы ориентировочные, налог не учтён. Даты и размер купона могут измениться.</p>`;
  }

  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const m = n % 10; return n > 10 && n < 20 ? c : m > 1 && m < 5 ? b : m === 1 ? a : c; };
  const fmtQty = q => Number(q).toLocaleString('ru-RU', {maximumFractionDigits: 0});

  function render() {
    renderFilters();
    $('cpHint').textContent = S.tab === 'received' ? 'Деньги, которые уже пришли на ваш счёт по купонам облигаций.' : 'Выплаты, которые брокер ещё начислит. Выберите период.';
    document.querySelectorAll('#cpTabs button').forEach(b => b.classList.toggle('active', b.dataset.t === S.tab));
    const body = $('cpBody');
    if (S.loading && !S.data) { body.innerHTML = '<div class="cp-empty">Загружаю купоны…</div>'; return; }
    if (!S.data) { body.innerHTML = ''; return; }
    body.innerHTML = (S.tab === 'received' ? renderReceived() : renderUpcoming()) +
      `<button id="cpRefresh" class="cp-refresh" type="button">Обновить данные</button>`;
  }

  /* ---------- события ---------- */
  page.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.acc) {
      const el = t.closest('.cp-acc'), on = el.classList.toggle('open');
      t.setAttribute('aria-expanded', on); on ? S.open.add(t.dataset.acc) : S.open.delete(t.dataset.acc); return;
    }
    if (t.id === 'cpBack') { closeCoupons(); return; }
    if (t.id === 'cpRefresh') { load(true); return; }
    if (t.dataset.t) { S.tab = t.dataset.t; render(); return; }
    if (t.dataset.p) {
      P().period = t.dataset.p;
      if (P().period === 'custom' && !P().from) { const d = new Date(); if (S.tab === 'upcoming') { P().from = ymd(d); d.setMonth(d.getMonth() + 1); P().to = ymd(d); } else { P().to = ymd(d); d.setMonth(d.getMonth() - 1); P().from = ymd(d); } }
      render();
    }
  });
  page.addEventListener('change', e => {
    if (e.target.id === 'cpFrom') { P().from = e.target.value; render(); }
    if (e.target.id === 'cpTo') { P().to = e.target.value; render(); }
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