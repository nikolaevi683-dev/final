/* Ncap · bonds.js — вкладка «Облигации» внутри «Анализа»: подбор по правилам, расчёт доходности, список отслеживаемых.
 * Данные: открытый API Мосбиржи (iss.moex.com). Логику app.js не меняет. Не инвестиционная рекомендация. */
(() => {
  const $ = id => document.getElementById(id), page = $('analysisPage');
  if (!page) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const TAX = 0.13, KEY = 'ncapBondWatch', DAY = 864e5;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rub = v => Math.round(v).toLocaleString('ru-RU') + ' ₽';
  const pct = v => (v * 100).toFixed(1).replace('.', ',') + '%';
  const dt = d => d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short', year: 'numeric'}).replace(' г.', '');

  const st = document.createElement('style'); st.textContent = `
#analysisPage>.an-mode{margin:6px 0 14px}
#anBonds .bd-intro{margin:0 4px 14px;font-size:13px;line-height:1.5;color:var(--muted)}
#anBonds .bd-seg{display:flex;gap:6px;background:var(--surface);padding:5px;border-radius:999px;margin-bottom:10px}
#anBonds .bd-seg button{flex:1;height:40px;border-radius:999px;font-size:14px;font-weight:600;color:var(--muted);background:none}
#anBonds .bd-seg button.active{background:var(--text);color:var(--bg)}
#anBonds .bd-chips{display:flex;gap:8px;overflow-x:auto;margin-bottom:12px;scrollbar-width:none}
#anBonds .bd-chips::-webkit-scrollbar{display:none}
#anBonds .bd-chips button{flex:none;height:36px;padding:0 16px;border-radius:999px;background:var(--surface);color:var(--muted);font-size:13px;font-weight:600}
#anBonds .bd-chips button.active{background:var(--accent);color:var(--on-accent)}
#anBonds .bd-hero{background:linear-gradient(150deg,color-mix(in srgb,var(--profit) 16%,var(--surface)),var(--surface) 72%);border:1px solid var(--line);border-radius:28px;padding:20px;margin-bottom:12px}
#anBonds .bd-hero small{display:block;color:var(--muted);font-size:13px}
#anBonds .bd-hero strong{display:block;font-size:36px;letter-spacing:-.03em;margin:6px 0 16px;color:var(--profit)}
#anBonds .bd-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
#anBonds .bd-stats div{background:color-mix(in srgb,var(--bg) 40%,var(--surface-2));border-radius:16px;padding:10px 12px;min-width:0}
#anBonds .bd-stats span{display:block;font-size:11px;color:var(--muted)}
#anBonds .bd-stats b{display:block;font-size:14px;margin-top:3px;font-weight:600;white-space:nowrap}
#anBonds .bd-sum{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;padding:8px 8px 8px 14px;border-radius:16px;background:color-mix(in srgb,var(--bg) 40%,var(--surface-2))}
#anBonds .bd-sum span{font-size:13px;color:var(--muted)}
#anBonds .bd-sum input{width:120px;height:40px;border-radius:12px;background:var(--surface-2);text-align:right;font-size:15px;font-weight:600;padding:0 12px}
#anBonds .bd-card{background:var(--surface);border-radius:22px;overflow:hidden}
#anBonds .bd-item+.bd-item{border-top:1px solid var(--line)}
#anBonds .bd-row{display:flex;align-items:center;gap:4px;padding:12px 6px 12px 14px}
#anBonds .bd-main{flex:1;min-width:0;display:flex;align-items:center;gap:12px;text-align:left;background:none;color:var(--text);padding:0}
#anBonds .bd-ring{--c:var(--muted);flex:none;position:relative;width:44px;height:44px;border-radius:50%;background:conic-gradient(var(--c) calc(var(--p)*1%),var(--surface-2) 0);display:flex;align-items:center;justify-content:center}
#anBonds .bd-ring::before{content:"";position:absolute;inset:4px;border-radius:50%;background:var(--surface)}
#anBonds .bd-ring b{position:relative;font-size:13px;font-weight:700}
#anBonds .bd-ring.low{--c:var(--profit)}#anBonds .bd-ring.mid{--c:var(--warn)}#anBonds .bd-ring.high{--c:var(--loss)}
#anBonds .bd-mid{min-width:0;flex:1}
#anBonds .bd-mid b{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#anBonds .bd-mid span{display:block;font-size:12px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#anBonds .bd-y{flex:none;text-align:right}
#anBonds .bd-y b{display:block;font-size:17px;font-weight:600;color:var(--profit)}
#anBonds .bd-y small{display:block;font-size:11px;color:var(--muted);margin-top:3px}
#anBonds .bd-star{flex:none;width:34px;height:40px;background:none;font-size:20px;line-height:1;color:var(--muted)}
#anBonds .bd-star.on{color:var(--warn)}
#anBonds .bd-badge{display:inline-block;margin-right:6px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
#anBonds .bd-badge.low{color:var(--profit);background:color-mix(in srgb,var(--profit) 14%,transparent)}
#anBonds .bd-badge.mid{color:var(--warn);background:color-mix(in srgb,var(--warn) 15%,transparent)}
#anBonds .bd-badge.high{color:var(--loss);background:color-mix(in srgb,var(--loss) 14%,transparent)}
#anBonds .bd-det{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s ease}
#anBonds .bd-item.open .bd-det{grid-template-rows:1fr}
#anBonds .bd-det>div{overflow:hidden;min-height:0}
#anBonds .bd-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:2px 14px 10px}
#anBonds .bd-grid div{background:var(--surface-2);border-radius:14px;padding:10px 12px;min-width:0}
#anBonds .bd-grid div.hl{background:color-mix(in srgb,var(--profit) 14%,var(--surface-2))}
#anBonds .bd-grid div.hl b{color:var(--profit)}
#anBonds .bd-grid span{display:block;font-size:11px;color:var(--muted)}
#anBonds .bd-grid b{display:block;font-size:14px;margin-top:3px;font-weight:600}
#anBonds .bd-warn{margin:0 16px 14px;font-size:12px;line-height:1.45;color:var(--muted)}
#anBonds .bd-more,#anBonds .bd-reload{display:block;margin:14px auto 0;padding:11px 20px;border-radius:14px;background:var(--surface);color:var(--text);font-size:13px;font-weight:600}
#anBonds .bd-empty{padding:32px 20px;text-align:center;color:var(--muted);font-size:14px;line-height:1.5;background:var(--surface);border-radius:24px}
#anBonds .bd-note{margin:16px 4px 120px;font-size:12px;line-height:1.5;color:var(--muted);text-align:center}
@media (prefers-reduced-motion:reduce){#anBonds .bd-det{transition:none}}`;
  document.head.append(st);

  /* переключатель «Сделка / Облигации»: прежнее содержимое страницы кладём в обёртку, id не меняются */
  const wrap = document.createElement('div'); wrap.id = 'anTradeView';
  while (page.firstChild) wrap.append(page.firstChild);
  const seg = document.createElement('div'); seg.className = 'an-seg an-mode';
  seg.innerHTML = '<button data-m="trade" class="active">Сделка</button><button data-m="bonds">Облигации</button>';
  const bv = document.createElement('div'); bv.id = 'anBonds'; bv.className = 'hidden';
  page.append(seg, wrap, bv);

  const S = { data: null, loading: false, err: '', preset: 'balance', term: 'any', watchOnly: false, limit: 20, open: null, sum: 100000, at: null,
              watch: new Set((() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } })()) };
  const saveWatch = () => { try { localStorage.setItem(KEY, JSON.stringify([...S.watch])); } catch (e) {} };
  const PRESETS = [['balance', 'Баланс'], ['ofz', 'Надёжные'], ['high', 'Доходные']];
  const TERMS = [['any', 'Любой срок'], ['short', 'До года'], ['mid', '1–3 года'], ['long', 'Больше 3 лет']];

  /* ---------- данные Мосбиржи ---------- */
  const url = b => `https://iss.moex.com/iss/engines/stock/markets/bonds/boards/${b}/securities.json?iss.meta=off&iss.only=securities,marketdata`;
  const tbl = (j, k) => { const t = j[k] || {columns: [], data: []}; return t.data.map(r => { const o = {}; t.columns.forEach((c, i) => o[c] = r[i]); return o; }); };

  /* доходность к погашению (или к оферте): корень уравнения «приведённый денежный поток = цена покупки» */
  const solve = (fl, price) => {
    let lo = -0.5, hi = 3;
    for (let i = 0; i < 80; i++) {
      const m = (lo + hi) / 2, v = fl.reduce((s, x) => s + x.c / Math.pow(1 + m, x.t), 0);
      v > price ? lo = m : hi = m;
    }
    return (lo + hi) / 2;
  };

  function calc(sec, md, kind, now) {
    const face = +sec.FACEVALUE, cpn = +sec.COUPONVALUE, per = +sec.COUPONPERIOD, px = +(md.LAST || sec.PREVPRICE || 0);
    if (!(face > 0 && cpn > 0 && per >= 28 && per <= 370 && px > 0 && sec.NEXTCOUPON && sec.MATDATE)) return null;   // плавающий или нулевой купон не считаем
    if (sec.INITIALFACEVALUE && face < sec.INITIALFACEVALUE * 0.999) return null;                                    // амортизация: расчёт был бы неточным
    const offer = sec.BUYBACKDATE && new Date(sec.BUYBACKDATE) > now ? new Date(sec.BUYBACKDATE) : null;
    const end = offer || new Date(sec.MATDATE), years = (end - now) / DAY / 365;
    if (!(years > 0.05)) return null;
    const dirty = face * px / 100 + (+sec.ACCRUEDINT || 0), clean = face * px / 100;
    const cf = [], cfn = [];
    for (let d = new Date(sec.NEXTCOUPON), n = 0; d <= end && n < 300; d = new Date(+d + per * DAY), n++) {
      const t = (d - now) / DAY / 365; cf.push({t, c: cpn}); cfn.push({t, c: cpn * (1 - TAX)});
    }
    if (!cf.length) return null;
    const t = years, net = face - TAX * Math.max(0, face - clean);
    cf.push({t, c: face}); cfn.push({t, c: net});
    const y = solve(cf, dirty), yn = solve(cfn, dirty);
    if (!(y > -0.2 && y < 0.6)) return null;
    return { id: sec.SECID, name: sec.SHORTNAME || sec.SECID, kind, px, face, cpn, per, years, end, offer: !!offer, y, yn, dirty,
             cpnPct: +sec.COUPONPERCENT || cpn * 365 / per / face * 100, val: +md.VALTODAY || 0,
             level: +sec.LISTLEVEL || (kind === 'ofz' ? 1 : 3), qual: +sec.ISQUALIFIEDINVESTORS === 1,
             profit: cfn.reduce((s, x) => s + x.c, 0) - dirty, cpnYear: cpn * 365 / per };
  }

  function enrich(list) {
    const ofz = list.filter(b => b.kind === 'ofz');
    const med = ofz.length ? ofz.map(b => b.y).sort((a, b) => a - b)[ofz.length >> 1] : 0;
    list.forEach(b => {
      const near = ofz.reduce((m, o) => (!m || Math.abs(o.years - b.years) < Math.abs(m.years - b.years)) ? o : m, null);
      b.spread = b.kind === 'ofz' ? 0 : b.y - (near ? near.y : med);
      const sp = b.spread * 100;
      const lv = b.kind === 'ofz' ? 1 : b.level === 1 ? .9 : b.level === 2 ? .55 : .2;
      const liq = clamp((Math.log10(Math.max(b.val, 1e5)) - 5) / 2.5, 0, 1);
      const term = b.years >= .5 && b.years <= 3 ? 1 : b.years < .5 ? .3 : .6;
      b.score = Math.round(40 * clamp(sp / 6, 0, 1) + 25 * lv + 20 * liq + 15 * term - (b.px < 80 ? 15 : 0));
      b.risk = b.kind === 'ofz' ? 'low' : (b.level >= 3 || b.px < 80 || sp >= 7) ? 'high' : 'mid';
    });
  }

  async function load(force) {
    if (S.loading || (S.data && !force)) return;
    S.loading = true; S.err = ''; render();
    try {
      const [o, c] = await Promise.all([fetch(url('TQOB')).then(r => r.json()), fetch(url('TQCB')).then(r => r.json())]);
      const now = new Date(), out = [];
      [[o, 'ofz'], [c, 'corp']].forEach(([j, kind]) => {
        const md = new Map(tbl(j, 'marketdata').map(m => [m.SECID, m]));
        tbl(j, 'securities').forEach(s => { const b = calc(s, md.get(s.SECID) || {}, kind, now); if (b) out.push(b); });
      });
      if (!out.length) throw new Error('empty');
      enrich(out); S.data = out; S.at = new Date();
    } catch (e) {
      console.error('bonds load:', e);
      S.err = 'Не удалось загрузить данные Мосбиржи. Проверьте интернет и попробуйте ещё раз.';
    } finally { S.loading = false; render(); }
  }

  /* ---------- отбор ---------- */
  function pick() {
    let l = S.data.filter(b => S.watch.has(b.id) || (b.val >= 3e5 && !b.qual));
    if (S.watchOnly) return l.filter(b => S.watch.has(b.id)).sort((a, b) => b.score - a.score);
    l = l.filter(b => S.preset === 'ofz' ? b.kind === 'ofz'
      : S.preset === 'high' ? b.kind === 'corp' && b.level <= 2 && b.px >= 70
      : (b.kind === 'ofz' || b.level <= 1) && b.risk !== 'high');
    l = l.filter(b => S.term === 'short' ? b.years <= 1 : S.term === 'mid' ? b.years > 1 && b.years <= 3 : S.term === 'long' ? b.years > 3 : true);
    return l.sort((a, b) => S.preset === 'balance' ? b.score - a.score : b.yn - a.yn);
  }

  /* ---------- отрисовка ---------- */
  const RISK = {low: 'Низкий риск', mid: 'Умеренный', high: 'Повышенный'};
  function item(b) {
    const n = Math.floor(S.sum / b.dirty), on = S.watch.has(b.id);
    const warn = [b.kind === 'corp' ? 'Рейтинга эмитента в данных биржи нет, проверьте компанию отдельно.' : '',
                  b.px < 80 ? 'Цена сильно ниже номинала: рынок видит повышенный риск.' : '',
                  b.offer ? 'Расчёт до даты оферты, цена выкупа принята равной номиналу.' : ''].filter(Boolean).join(' ');
    const yrs = b.years < 1 ? Math.round(b.years * 12) + ' мес.' : b.years.toFixed(1).replace('.', ',') + ' г.';
    return `<div class="bd-item${S.open === b.id ? ' open' : ''}">
      <div class="bd-row"><button class="bd-main" data-open="${esc(b.id)}"><div class="bd-ring ${b.risk}" style="--p:${b.score}"><b>${b.score}</b></div>
        <div class="bd-mid"><b>${esc(b.name)}</b><span>до ${dt(b.end)}${b.offer ? ' (оферта)' : ''} · ${b.px.toFixed(1).replace('.', ',')}%</span><span><i class="bd-badge ${b.risk}">${RISK[b.risk]}</i>купон ${b.cpnPct.toFixed(1).replace('.', ',')}%</span></div>
        <div class="bd-y"><b>${pct(b.yn)}</b><small>до налога ${pct(b.y)}</small></div></button>
        <button class="bd-star${on ? ' on' : ''}" data-star="${esc(b.id)}" aria-label="Отслеживать">${on ? '★' : '☆'}</button></div>
      <div class="bd-det"><div><div class="bd-grid">
        <div><span>Срок</span><b>${yrs}</b></div>
        <div><span>${b.kind === 'ofz' ? 'Тип' : 'Выше ОФЗ на'}</span><b>${b.kind === 'ofz' ? 'ОФЗ' : (b.spread * 100).toFixed(1).replace('.', ',') + ' п.п.'}</b></div>
        <div><span>Цена за 1 шт. с НКД</span><b>${rub(b.dirty)}</b></div>
        <div><span>На ${rub(S.sum)} хватит</span><b>${n} шт.</b></div>
        <div><span>Купоны в год (после налога)</span><b>${rub(n * b.cpnYear * (1 - TAX))}</b></div>
        <div class="hl"><span>Прибыль к погашению</span><b>${n ? '+' + rub(n * b.profit) : '—'}</b></div></div>
      ${warn ? `<p class="bd-warn">${esc(warn)}</p>` : ''}</div></div></div>`;
  }

  function render() {
    let h = `<p class="bd-intro">Подбор по понятным правилам: доходность к погашению после налога 13% в сравнении с ОФЗ. Кольцо слева — оценка бумаги от 0 до 100. Это список кандидатов для изучения, а не совет купить.</p>
      <div class="bd-seg">${PRESETS.map(([k, t]) => `<button data-p="${k}" class="${S.preset === k && !S.watchOnly ? 'active' : ''}">${t}</button>`).join('')}</div>
      <div class="bd-chips"><button data-w="1" class="${S.watchOnly ? 'active' : ''}">★ Мои${S.watch.size ? ' · ' + S.watch.size : ''}</button>${TERMS.map(([k, t]) => `<button data-t="${k}" class="${S.term === k && !S.watchOnly ? 'active' : ''}">${t}</button>`).join('')}</div>`;
    if (S.loading && !S.data) h += '<div class="bd-empty">Загружаю данные Мосбиржи…</div>';
    else if (S.err && !S.data) h += `<div class="bd-empty">${esc(S.err)}</div><button class="bd-reload" data-reload="1">Повторить</button>`;
    else if (S.data) {
      const l = pick();
      if (l.length) {
        const best = Math.max(...l.map(b => b.yn)), avg = l.reduce((s, b) => s + b.yn, 0) / l.length;
        const of = S.data.filter(b => b.kind === 'ofz').map(b => b.yn).sort((a, b) => a - b), om = of.length ? of[of.length >> 1] : 0;
        h += `<section class="bd-hero"><small>Лучшая доходность после налога</small><strong>${pct(best)}</strong>
          <div class="bd-stats"><div><span>Найдено</span><b>${l.length}</b></div><div><span>В среднем</span><b>${pct(avg)}</b></div><div><span>ОФЗ для сравнения</span><b>${of.length ? pct(om) : '—'}</b></div></div>
          <label class="bd-sum"><span>Сумма вложения, ₽</span><input id="bdSum" type="text" inputmode="numeric" value="${S.sum.toLocaleString('ru-RU')}"></label></section>
          <div class="bd-card">${l.slice(0, S.limit).map(item).join('')}</div>` + (l.length > S.limit ? `<button class="bd-more" data-more="1">Показать ещё (${l.length - S.limit})</button>` : '');
      } else h += `<div class="bd-empty">${S.watchOnly ? 'Нажмите ☆ у облигации, чтобы следить за ней.' : 'Под выбранные условия ничего не нашлось. Попробуйте другой срок или набор.'}</div>`;
      h += `<button class="bd-reload" data-reload="1">Обновить данные</button><p class="bd-note">Данные Мосбиржи, обновлено ${S.at ? S.at.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) : ''}. Доходность посчитана по расписанию купонов при неизменной ставке; налог 13% учтён на купоны и на разницу цены. Инструмент для расчёта, не инвестиционная рекомендация.</p>`;
    }
    const keep = document.activeElement && document.activeElement.id === 'bdSum';
    bv.innerHTML = h;
    if (keep) { const i = $('bdSum'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  /* ---------- события ---------- */
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    wrap.classList.toggle('hidden', b.dataset.m === 'bonds'); bv.classList.toggle('hidden', b.dataset.m !== 'bonds');
    if (b.dataset.m === 'bonds') { render(); load(false); }
  });
  bv.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.star) { S.watch.has(d.star) ? S.watch.delete(d.star) : S.watch.add(d.star); saveWatch(); render(); return; }
    if (d.open) { const el = b.closest('.bd-item'); S.open = S.open === d.open ? null : d.open; bv.querySelectorAll('.bd-item').forEach(x => x.classList.toggle('open', x === el && S.open === d.open)); return; }
    if (d.p) { S.preset = d.p; S.watchOnly = false; S.limit = 20; }
    else if (d.t) { S.term = d.t; S.watchOnly = false; S.limit = 20; }
    else if (d.w) S.watchOnly = !S.watchOnly;
    else if (d.more) S.limit += 20;
    else if (d.reload) { load(true); return; }
    render();
  });
  bv.addEventListener('input', e => {
    if (e.target.id !== 'bdSum') return;
    const v = parseInt(e.target.value.replace(/\D/g, ''), 10);
    S.sum = v > 0 ? v : 0; render();
  });
})();