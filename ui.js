/* Humble · ui.js (этап 1): только оформление. Бизнес-логику app.js не трогает. */
(() => {
  const ORDER = {authPage:-1,homePage:0,portfolioPage:1,profilePage:3,settingsPage:4,analysisPage:5,allTradesPage:10,tradeDetails:11,tradePage:12};
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