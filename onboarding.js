/* Ncap · onboarding.js — мини-тур для новых пользователей.
 * Подсвечивает реальные элементы интерфейса и коротко объясняет, что где.
 * Логику app.js не трогает. Повторный запуск: startTour() или кнопка в настройках. */
(() => {
  const KEY = 'ncapTourDone';
  const STEPS = [
    { t: 'Добро пожаловать в Ncap', d: 'Это дневник сделок: он считает прибыль, показывает календарь и портфель. Покажу главное за полминуты.' },
    { el: '.hero', t: 'Прибыль за месяц', d: 'Главная цифра экрана. Зелёный цвет означает плюс, красный минус. Процент рядом можно нажать.' },
    { el: '#calendar', pad: 4, t: 'Календарь сделок', d: 'В каждом дне итог по сделкам. Нажмите на день: увидите его сделки или добавите новую.' },
    { el: '.fab', pad: 6, t: 'Добавить сделку', d: 'Кнопка «+» создаёт сделку на выбранный в календаре день. Нужны тикер, вход, выход и результат. Стоп, тейк и комментарий по желанию.' },
    { el: '#portfolioNav', pad: 4, t: 'Портфель', d: 'Позиции, кэш и структура счёта. Показывает данные брокера, если подключена синхронизация.' },
    { el: '#analysisNav', pad: 4, t: 'Анализ сделки', d: 'Калькулятор риска и чек-лист сетапа с графиком: оцените сделку до входа.' },
    { el: '#settingsNav', pad: 4, t: 'Настройки и Т-Инвестиции', d: 'Здесь тема оформления и подключение брокера: сделки будут попадать в дневник сами. Используйте токен только для чтения.' },
    { el: '#privacyBtn', pad: 6, t: 'Скрыть баланс', d: 'Нажмите, чтобы спрятать суммы, например перед тем как показать экран другому человеку.' },
    { t: 'Готово!', d: 'Начните с кнопки «+». Это обучение всегда можно повторить в настройках.' }
  ];

  const css = `
.tour-ov{position:fixed;inset:0;z-index:1000}
.tour-spot{position:fixed;z-index:1001;pointer-events:none;box-shadow:0 0 0 9999px rgba(4,8,6,.74);border:2px solid var(--accent)}
.tour-spot.mv{transition:left .3s,top .3s,width .3s,height .3s,border-radius .3s}
.tour-card{position:fixed;z-index:1002;width:min(340px,calc(100vw - 24px));box-sizing:border-box;padding:18px;border-radius:20px;background:var(--surface);color:var(--text);border:1px solid var(--line);box-shadow:0 18px 50px rgba(0,0,0,.45)}
.tour-card.mv{transition:left .3s,top .3s}
.tour-card.center{left:50%!important;top:50%!important;transform:translate(-50%,-50%)}
.tour-card b{display:block;font-size:17px;margin-bottom:6px}
.tour-card p{font-size:14px;line-height:1.5;color:var(--muted);margin:0 0 14px}
.tour-row{display:flex;align-items:center;gap:8px}
.tour-dots{display:flex;gap:5px;margin-bottom:14px}
.tour-dots i{width:6px;height:6px;border-radius:50%;background:var(--line);background:color-mix(in srgb,var(--muted) 35%,transparent)}
.tour-dots i.on{background:var(--accent);width:16px;border-radius:3px}
.tour-card button{font:inherit;font-size:14px;border:0;border-radius:12px;padding:9px 14px;cursor:pointer;background:var(--surface-2);color:var(--text)}
.tour-card button.pri{background:var(--accent);color:var(--on-accent);font-weight:600;flex:1;white-space:nowrap}
.tour-card button.skip{background:none;color:var(--muted);padding:9px 6px}
.tour-replay{display:block;margin:18px auto 120px;font:inherit;font-size:14px;border:1px solid var(--line);border-radius:14px;padding:11px 18px;background:var(--surface);color:var(--text);cursor:pointer}
@media (prefers-reduced-motion:reduce){.tour-spot.mv,.tour-card.mv{transition:none}}`;

  let ov, spot, card, i = 0, lastKey = '', mvT, raf;
  const q = s => document.querySelector(s);
  const done = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const mark = () => { try { localStorage.setItem(KEY, '1'); } catch (e) {} };

  function close() {
    mark();
    cancelAnimationFrame(raf); clearTimeout(mvT);
    [ov, spot, card].forEach(n => n && n.remove());
    ov = spot = card = null;
    removeEventListener('resize', reposition);
    removeEventListener('keydown', onKey);
  }

  function render() {
    const s = STEPS[i], last = i === STEPS.length - 1;
    card.innerHTML =
      `<b>${s.t}</b><p>${s.d}</p>` +
      `<div class="tour-dots">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div><div class="tour-row">` +
      (last ? '' : '<button class="skip" data-a="skip">Пропустить</button>') +
      (i > 0 && !last ? '<button data-a="back">Назад</button>' : '') +
      `<button class="pri" data-a="next">${last ? 'Начать' : 'Далее'}</button></div>`;
  }

  function reposition() {
    if (!card) return;
    const s = STEPS[i], el = s.el && q(s.el), r = el && el.getBoundingClientRect();
    const key = i + ':' + (r ? [r.left, r.top, r.width, r.height].map(Math.round).join() : '-') + innerWidth + 'x' + innerHeight;
    if (key === lastKey) return;                      // ничего не сдвинулось, пересчёт не нужен
    lastKey = key;
    if (!r || !r.width) {                              // шаг без цели: затемнение и карточка по центру
      Object.assign(spot.style, { left: '50%', top: '50%', width: '0px', height: '0px', borderColor: 'transparent' });
      card.classList.add('center');
      return;
    }
    card.classList.remove('center');
    const pad = s.pad || 8, br = parseFloat(getComputedStyle(el).borderRadius) || 0;
    Object.assign(spot.style, {
      left: r.left - pad + 'px', top: r.top - pad + 'px',
      width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px',
      borderRadius: Math.min(26, Math.max(br, 12) + pad) + 'px', borderColor: ''
    });
    const ch = card.offsetHeight, cw = card.offsetWidth, vh = innerHeight, gap = 14;
    const below = vh - r.bottom - pad, above = r.top - pad;
    let top = below >= ch + gap ? r.bottom + pad + gap : above >= ch + gap ? r.top - pad - gap - ch : vh - ch - 12;
    top = Math.max(12, Math.min(top, vh - ch - 12));
    const left = Math.max(12, Math.min(r.left + r.width / 2 - cw / 2, innerWidth - cw - 12));
    card.style.left = left + 'px'; card.style.top = top + 'px';
  }

  function show(n) {
    i = Math.max(0, Math.min(n, STEPS.length - 1));
    const el = STEPS[i].el && q(STEPS[i].el);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    lastKey = '';
    spot.classList.add('mv'); card.classList.add('mv'); clearTimeout(mvT);
    mvT = setTimeout(() => { spot && spot.classList.remove('mv'); card && card.classList.remove('mv'); }, 400);
    render();
    requestAnimationFrame(reposition);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') show(i - 1);
  }
  const next = () => (i >= STEPS.length - 1 ? close() : show(i + 1));

  window.startTour = function () {
    if (ov) return;
    if (typeof window.showHome === 'function' && q('#homePage') && q('#homePage').classList.contains('hidden')) window.showHome();
    ov = document.createElement('div'); ov.className = 'tour-ov';
    spot = document.createElement('div'); spot.className = 'tour-spot';
    card = document.createElement('div'); card.className = 'tour-card';
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-live', 'polite');
    document.body.append(ov, spot, card);
    card.addEventListener('click', e => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'next') next(); else if (a === 'back') show(i - 1); else if (a === 'skip') close();
    });
    addEventListener('resize', reposition);
    addEventListener('keydown', onKey);
    setTimeout(() => show(0), 50);
    const follow = () => { if (!card) return; reposition(); raf = requestAnimationFrame(follow); };  // подсветка следит за элементом, даже если он ещё анимируется
    raf = requestAnimationFrame(follow);
  };

  const st = document.createElement('style'); st.textContent = css; document.head.append(st);

  /* кнопка «показать обучение» внизу настроек */
  const sp = q('#settingsPage');
  if (sp) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tour-replay'; b.textContent = 'Показать обучение заново';
    b.onclick = () => { if (typeof window.showHome === 'function') window.showHome(); setTimeout(window.startTour, 350); };
    sp.append(b);
  }

  /* автозапуск при первом входе: ждём, пока скроется экран входа и откроется главная */
  if (!done()) {
    let tries = 0;
    const t = setInterval(() => {
      const a = q('#authPage'), h = q('#homePage');
      if (a && h && a.classList.contains('hidden') && !h.classList.contains('hidden')) {
        clearInterval(t); setTimeout(() => { if (!done()) window.startTour(); }, 900);
      } else if (++tries > 60) clearInterval(t);
    }, 500);
  }
})();