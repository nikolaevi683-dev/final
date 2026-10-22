/* strategy.js: «Основание импульса → разворотный уровень → цель» на трёх ТФ.
 * Детерминированная реализация промпта. Работает в браузере, Node и Deno.
 *
 * Свеча: {t:мс, o, h, l, c, v}. Массивы HTF/MTF/LTF только из ЗАКРЫТЫХ свечей,
 * по возрастанию времени. Импульс вниз считается зеркально (цены * -1).
 *
 *   const r = Strategy.analyze({symbol, htf, mtf, ltf, balance, pointValue,
 *                               openSide, spreadCost, blackout}, {shortAllowed:true});
 *   r.action: ENTER_LONG | ENTER_SHORT | EXIT_ALL | NO_TRADE
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Strategy = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULTS = {
    atrN: 14, volN: 20, pivotN: 5, mtfPivotN: 3,
    bufferMult: 0.3,            // буфер = 0.3 × ATR(MTF)
    minRR: 1.5, riskPct: 0.5, shortAllowed: true,
    lookback: 250,              // HTF-свечей для поиска импульса
    impulseMinAtr: 5,           // импульс >= 5 × ATR(HTF)
    supportMode: "launch",      // "launch": основание последней ступени импульса; "origin": абсолютный лой импульса
    launchMaxFrac: 0.4,         // основание ищем в нижних 40% импульса
    supportClusterAtr: 1.0, levelClusterAtr: 0.5,
    targetMinTouches: 2, reversalMinTouches: 3,
    minZoneAtr: 0.3,            // минимальная ширина зоны, в ATR(HTF)
    rangeMinBars: 8, rangeMaxAtr: 3,
    breakoutVol: 1.3, probeVol: 1.5,
    retestMaxMtf: 12, s1BreakMaxHtf: 10, probeMaxBars: 3,
    minBars: { htf: 300, mtf: 200, ltf: 100 },
    maxCostShare: 0.10,
  };

  // ---------- базовые функции ----------
  const last = a => a[a.length - 1];
  const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);

  function atr(c, n) {
    if (c.length < 2) return NaN;
    const tr = [];
    for (let i = 1; i < c.length; i++) {
      const pc = c[i - 1].c;
      tr.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - pc), Math.abs(c[i].l - pc)));
    }
    if (tr.length <= n) return mean(tr);
    let a = mean(tr.slice(0, n));
    for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
    return a;
  }
  // средний объём за n свечей ДО свечи idx
  const volAvg = (c, idx, n) => mean(c.slice(Math.max(0, idx - n), idx).map(x => x.v));

  function pivots(c, n) {
    const highs = [], lows = [];
    for (let i = n; i < c.length - n; i++) {
      let isH = true, isL = true;
      for (let k = 1; k <= n; k++) {
        if (!(c[i].h > c[i - k].h && c[i].h >= c[i + k].h)) isH = false;
        if (!(c[i].l < c[i - k].l && c[i].l <= c[i + k].l)) isL = false;
      }
      if (isH) highs.push({ i, price: c[i].h });
      if (isL) lows.push({ i, price: c[i].l });
    }
    return { highs, lows };
  }

  // кластеры: соседние цены ближе tol, ширина кластера не больше 2×tol
  function cluster(items, tol) {
    const s = items.slice().sort((a, b) => a.price - b.price), out = [];
    let cur = null;
    for (const it of s) {
      if (cur && it.price - cur.items[cur.items.length - 1].price <= tol && it.price - cur.lo <= 2 * tol) {
        cur.items.push(it); cur.hi = it.price;
      } else { cur = { lo: it.price, hi: it.price, items: [it] }; out.push(cur); }
    }
    return out.map(c => ({
      lo: c.lo, hi: c.hi, touches: c.items.length, items: c.items,
      mean: mean(c.items.map(x => x.price)), lastI: Math.max(...c.items.map(x => x.i)),
    }));
  }
  function widen(z, minW) {
    const lo = z.lo, hi = z.hi;
    if (hi - lo >= minW) return { lo, hi };
    const m = (lo + hi) / 2;
    return { lo: m - minW / 2, hi: m + minW / 2 };
  }
  const mirror = c => c.map(x => ({ t: x.t, o: -x.o, h: -x.l, l: -x.h, c: -x.c, v: x.v }));

  function bestImpulse(H, atrH, o) {
    const pv = pivots(H, o.pivotN);
    let best = null;
    for (const lo of pv.lows) for (const hi of pv.highs) {
      if (hi.i <= lo.i) continue;
      const size = hi.price - lo.price;
      if (size >= o.impulseMinAtr * atrH && (!best || size > best.size)) best = { low: lo, high: hi, size };
    }
    return { imp: best, pv };
  }

  // ---------- диапазон на LTF ----------
  function rangeAt(L, end, atrL, o) {
    if (end < o.rangeMinBars - 1) return null;
    let hi = -Infinity, lo = Infinity, start = end;
    for (let i = end; i >= 0; i--) {
      const nh = Math.max(hi, L[i].h), nl = Math.min(lo, L[i].l);
      if (nh - nl >= o.rangeMaxAtr * atrL) break;
      hi = nh; lo = nl; start = i;
    }
    return end - start + 1 >= o.rangeMinBars ? { low: lo, high: hi, from: start, to: end } : null;
  }
  function rangesSeparate(L, atrL, o, maxN, scan) {
    const out = []; let end = L.length - 1; const stop = Math.max(0, L.length - scan);
    while (end > stop && out.length < maxN) {
      const r = rangeAt(L, end, atrL, o);
      if (r) { out.push(r); end = r.from - 1; } else end--;
    }
    return out;
  }

  // ---------- тренд-линия коррекции на MTF ----------
  function trendline(M, imp, H, buf, o) {
    const from = Math.max(0, M.length - 150);
    const hs = pivots(M, o.mtfPivotN).highs.filter(p => p.i >= from && M[p.i].t >= H[imp.high.i].t);
    if (hs.length < 2) return null;
    const lastI = M.length - 1;
    const mk = (a, b) => {
      const slope = (b.price - a.price) / (b.i - a.i), at = i => b.price + slope * (i - b.i);
      for (let k = a.i + 1; k <= b.i; k++) if (M[k].c > at(k) + buf) return null;      // линия не должна быть пробита между точками
      let brokenAt = -1;
      for (let k = b.i + 1; k < M.length; k++) if (M[k].c > at(k)) { brokenAt = k; break; }
      let retested = false;
      if (brokenAt >= 0) for (let j = brokenAt + 1; j < M.length; j++) if (M[j].l <= at(j) + buf && M[j].c >= at(j)) { retested = true; break; }
      return { a, b, at, brokenAt, retested };
    };
    const pairs = [];
    for (let x = 1; x < hs.length; x++) {
      const b = hs[x]; let a = null;
      for (let k = x - 1; k >= 0; k--) if (b.i - hs[k].i >= 3 && hs[k].price > b.price) { a = hs[k]; break; }
      if (a) { const m = mk(a, b); if (m) pairs.push(m); }
    }
    if (!pairs.length) return null;
    // линия замораживается на первой пробитой и не провалившейся: новые пивоты после пробоя её не меняют
    let pick = null;
    for (const m of pairs) {
      if (m.brokenAt < 0) continue;
      const minBefore = Math.min(...M.slice(m.b.i, m.brokenAt + 1).map(x => x.l));
      const failed = M.slice(m.brokenAt).some(x => x.c < minBefore);
      if (!failed) { pick = m; break; }
    }
    if (!pick) pick = last(pairs);
    const { a, b, at, brokenAt, retested } = pick;
    return {
      p1: [M[a.i].t, a.price], p2: [M[b.i].t, b.price], value: at(lastI),
      broken: brokenAt >= 0, retested, above: M[lastI].c > at(lastI),
      ok: brokenAt >= 0 && retested && M[lastI].c > at(lastI),
    };
  }

  // ---------- ядро: считаем «как импульс вверх» ----------
  function build(H0, M, L, o, input) {
    const H = H0.slice(-o.lookback);
    const atrH = atr(H0, o.atrN), atrM = atr(M, o.atrN), atrL = atr(L, o.atrN);
    const buf = o.bufferMult * atrM;
    const { imp, pv } = bestImpulse(H, atrH, o);
    if (!imp) return { fail: "Нет главного импульса >= " + o.impulseMinAtr + "×ATR(HTF) за " + o.lookback + " свечей" };
    const R = imp.size, minW = o.minZoneAtr * atrH;

    // SUPPORT
    let sup = null;
    if (o.supportMode === "launch") {
      const cl = cluster(pv.lows.filter(p => p.i >= imp.low.i && p.i < imp.high.i && p.price <= imp.low.price + o.launchMaxFrac * R),
        o.supportClusterAtr * atrH).filter(c => c.touches >= 2);
      cl.sort((a, b) => b.touches - a.touches || b.mean - a.mean);
      sup = cl[0] || null;
    }
    if (!sup) {
      const cl = cluster(pv.lows.filter(p => p.price <= imp.low.price + atrH), o.supportClusterAtr * atrH)
        .filter(c => c.items.some(x => x.i === imp.low.i));
      sup = cl[0] || { lo: imp.low.price, hi: imp.low.price, touches: 1, mean: imp.low.price };
    }
    const support = Object.assign(widen(sup, minW), { touches: sup.touches });

    // TARGET: самый высокий кластер хаёв с >= N касаний (прошлая реакция у вершины), иначе вершина импульса
    const hiCl = cluster(pv.highs.filter(p => p.i >= imp.low.i && p.price >= imp.low.price + 0.5 * R), o.levelClusterAtr * atrH);
    let tgt = hiCl.filter(c => c.touches >= o.targetMinTouches).sort((a, b) => b.mean - a.mean)[0];
    if (!tgt) tgt = hiCl.find(c => c.items.some(x => x.i === imp.high.i)) || { lo: imp.high.price, hi: imp.high.price, touches: 1, mean: imp.high.price };
    const target = Object.assign(widen(tgt, minW), { touches: tgt.touches });
    if (target.lo <= support.hi) return { fail: "Цель не выше поддержки" };

    // REVERSAL: кластер хаёв с макс. числом касаний (>= N) в средней части диапазона
    const D = target.lo - support.hi;
    const lastCorr = pv.highs.filter(p => p.i > imp.high.i).pop() || imp.high;
    const revCl = cluster(pv.highs.filter(p => p.i >= imp.low.i && p.price >= support.hi + 0.25 * D && p.price <= target.lo - 0.25 * D),
      o.levelClusterAtr * atrH).filter(c => c.touches >= o.reversalMinTouches);
    revCl.sort((a, b) => b.touches - a.touches || Math.abs(a.mean - lastCorr.price) - Math.abs(b.mean - lastCorr.price));
    if (!revCl.length) return { fail: "Нет кластера REVERSAL (>= " + o.reversalMinTouches + " касаний) в средней части диапазона", partial: { support, target } };
    const reversal = Object.assign(widen(revCl[0], minW), { touches: revCl[0].touches });

    // LADDER: хаи между ценой и целью, без зоны REVERSAL
    const price = last(L).c;
    const lad = cluster(pv.highs.filter(p => p.i >= imp.low.i && p.price > price && p.price < target.lo), o.levelClusterAtr * atrH)
      .map(c => Object.assign(widen(c, minW), { touches: c.touches }))
      .filter(z => !(z.hi >= reversal.lo - buf && z.lo <= reversal.hi + buf));
    const ladder = lad.sort((a, b) => a.lo - b.lo);

    const tl = trendline(M, imp, H, buf, o);

    // ----- состояние сценария -----
    const lastH = last(H0);
    const invalid = lastH.c < support.lo - buf;
    let confirmed = false, pendingRetest = false;
    if (!invalid) {
      let k = -1;
      for (let i = H0.length - 1; i >= 1; i--) {
        if (H0[i].c > reversal.hi + buf) k = i; else break;
      }
      if (k >= 0) {
        for (let j = k + 1; j < H0.length; j++) if (H0[j].l <= reversal.hi + buf && H0[j].c >= reversal.lo) { confirmed = true; break; }
        pendingRetest = !confirmed;
      }
    }
    let status = invalid ? "INVALIDATED" : confirmed ? "CONFIRMED" : price <= support.hi + 1.5 * atrH ? "NEAR_SUPPORT" : "WATCH";

    const ranges0 = [];
    for (let s = 0; s <= 3; s++) { const r = rangeAt(L, L.length - 1 - s, atrL, o); if (r) { ranges0.push(r); } }
    const rangeA = [1, 2, 3].map(s => rangeAt(L, L.length - 1 - s, atrL, o)).filter(Boolean);
    const rangeB = rangesSeparate(L, atrL, o, 3, 200);

    const ctx = { H0, M, L, o, input, atrH, atrM, atrL, buf, support, reversal, target, ladder, tl, price, status, pv, imp, pendingRetest };
    const cands = [];
    const add = c => { if (c) cands.push(c); };

    // ----- лонговые сетапы (в мире «импульс вверх») -----
    if (status !== "INVALIDATED") {
      if (status === "WATCH" || status === "CONFIRMED" || status === "NEAR_SUPPORT") {
        const mtfOk = !!(tl && tl.ok);
        for (const r of rangeA) add(setupA(ctx, r, mtfOk));
        for (const r of rangeB) add(setupB(ctx, r, mtfOk));
      }
      if (status === "NEAR_SUPPORT") add(setupC(ctx));
    } else {
      add(setupS1(ctx));
    }
    // контртренд (риск × 0.5)
    if (status !== "INVALIDATED") {
      const bActive = cands.some(c => c.setup === "B" && c.valid);
      if (!bActive) for (const r of rangeB) add(setupS2(ctx, r));
      add(setupS3(ctx));
    }
    return { ctx, status, pendingRetest, cands, ranges: ranges0[0] || null, tl };
  }

  // ---------- сетапы ----------
  function targetsLong(ctx, entry) {
    const zs = ctx.ladder.concat([ctx.reversal, ctx.target]).filter(z => z.lo > entry).sort((a, b) => a.lo - b.lo);
    return zs.map(z => z.lo);
  }
  function targetsShort(ctx, entry) {
    const zs = ctx.ladder.concat([ctx.reversal, ctx.support]).filter(z => z.hi < entry).sort((a, b) => b.hi - a.hi);
    return zs.map(z => z.hi);
  }
  function mk(setup, side, entry, stop, targets, riskMult, checks, why) {
    const risk = Math.abs(entry - stop);
    const rr = targets.length && risk > 0 ? Math.abs(targets[0] - entry) / risk : null;
    return { setup, side, entry, stop, targets, riskMult, checks, why, rr, valid: Object.values(checks).every(Boolean) };
  }

  function setupA(ctx, r, mtfOk) {
    const { L, o, buf, atrL, support } = ctx, n = L.length - 1;
    let j0 = -1;
    for (let j = r.to + 1; j <= n; j++) if (L[j].l < r.low) { j0 = j; break; }
    if (j0 < 0) return null;
    let rf = -1;
    for (let k = j0; k <= n; k++) if (L[k].c > r.low) { rf = k; break; }
    const seg = L.slice(j0, n + 1), ext = Math.min(...seg.map(x => x.l));
    const checks = {
      "прокол RANGE_LOW": true,
      "возврат закрытием на последней свече (<= 3 свечи)": rf === n && n - j0 <= o.probeMaxBars,
      "прокол не глубже SUPPORT − буфер": ext >= support.lo - buf,
      "объём >= 1.5×": Math.max(...seg.map(x => x.v)) >= o.probeVol * volAvg(L, j0, o.volN),
      "MTF: пробой линии + ретест": mtfOk,
    };
    const entry = L[n].c, stop = ext - 0.3 * atrL;
    return mk("A", "L", entry, stop, targetsLong(ctx, entry), 1, checks, "Прокол-возврат диапазона LTF");
  }

  function setupB(ctx, r, mtfOk) {
    const { M, L, o, buf, atrL } = ctx, n = L.length - 1, m = M.length - 1;
    const mtfMs = M.length > 1 ? M[m].t - M[m - 1].t : 0;
    let b = -1;
    for (let k = m; k >= Math.max(1, m - o.retestMaxMtf + 1); k--) {
      if (M[k].t <= L[r.to].t) break;
      if (M[k].c > r.high + buf && M[k - 1].c <= r.high + buf) { b = k; break; }
    }
    if (b < 0) return null;
    const tBreak = M[b].t + mtfMs;
    let q = -1;
    for (let i = 0; i < L.length; i++) if (L[i].t >= tBreak && L[i].l <= r.high + 0.3 * atrL) { q = i; break; }
    if (q < 0 || q >= n) return null;
    const rmin = Math.min(...L.slice(q, n).map(x => x.l)), lb = L[n];
    const checks = {
      "MTF закрытие выше RANGE_HIGH + буфер": true,
      "объём пробоя >= 1.3×": M[b].v >= o.breakoutVol * volAvg(M, b, o.volN),
      "ретест сверху, свеча подтверждения закрыта выше уровня": lb.c > r.high && lb.c > lb.o,
      "минимум ретеста не обновлён": lb.l >= rmin,
      "ретест в пределах 12 MTF-свечей": true,
      "MTF: пробой линии + ретест": mtfOk,
    };
    const entry = lb.c, stop = rmin - 0.3 * atrL;
    return mk("B", "L", entry, stop, targetsLong(ctx, entry), 1, checks, "Пробой-ретест диапазона");
  }

  function setupC(ctx) {
    const { H0, o, support, atrH } = ctx, n = H0.length - 1, b = H0[n], p = H0[n - 1];
    const rng = b.h - b.l || 1, wick = Math.min(b.o, b.c) - b.l;
    const engulf = p.c < p.o && b.c > b.o && b.c > p.o && b.o < p.c;
    const checks = {
      "HTF-свеча зашла в зону SUPPORT": b.l <= support.hi,
      "HTF-закрытие выше зоны SUPPORT": b.c > support.hi,
      "объём >= 1.5× / поглощение / нижняя тень >= 50%": b.v >= o.probeVol * volAvg(H0, n, o.volN) || engulf || wick / rng >= 0.5,
      "цена всё ещё выше зоны": ctx.price > support.hi,
    };
    const entry = ctx.price, stop = b.l - 0.5 * atrH;
    return mk("C", "L", entry, stop, targetsLong(ctx, entry), 1.5, checks, "Прокол SUPPORT и возврат");
  }

  function setupS1(ctx) {
    const { H0, M, L, o, buf, atrM, support, atrH, pv } = ctx, n = H0.length - 1;
    let b = -1;
    for (let k = n; k >= Math.max(1, n - o.s1BreakMaxHtf + 1); k--) {
      if (H0[k].c < support.lo - buf && H0[k - 1].c >= support.lo - buf) { b = k; break; }
    }
    if (b < 0) return null;
    const mtfMs = H0[n].t - H0[n - 1].t;
    const tb = H0[b].t + mtfMs, ln = L.length - 1;
    const after = L.map((x, i) => i).filter(i => L[i].t >= tb);
    const touch = after.filter(i => L[i].h >= support.lo - buf);
    const q0 = touch[0], lb = L[ln];
    const reclaimed = M.some(x => x.t >= tb && x.c > support.hi);
    const checks = {
      "HTF закрытие ниже SUPPORT − буфер": true,
      "объём пробоя >= 1.5×": H0[b].v >= o.probeVol * volAvg(H0, b, o.volN),
      "возврат к зоне снизу": q0 !== undefined,
      "без закрепления выше зоны на MTF": !reclaimed,
      "LTF свеча закрылась вниз, ниже зоны": lb.c < lb.o && lb.c < support.lo,
    };
    const retestHigh = q0 !== undefined ? Math.max(...L.slice(q0).map(x => x.h)) : lb.h;
    const entry = lb.c, stop = retestHigh + 0.3 * atrM;
    let tg = cluster(pv.lows.filter(p => p.price < support.lo - buf), o.levelClusterAtr * atrH).sort((a, b) => b.hi - a.hi).map(c => c.lo).filter(p => p < entry);
    if (!tg.length) { const w = support.hi - support.lo; tg = [1, 2, 3].map(k => support.lo - k * w); }
    return mk("S1", "S", entry, stop, tg, 1, checks, "Пробой SUPPORT с ретестом снизу");
  }

  function setupS2(ctx, r) {
    const { L, M, o, atrL, tl } = ctx, n = L.length - 1;
    let j0 = -1;
    for (let j = r.to + 1; j <= n; j++) if (L[j].c > r.high) { j0 = j; break; }
    if (j0 < 0) return null;
    let rf = -1;
    for (let k = j0; k <= n; k++) if (L[k].c < r.high) { rf = k; break; }
    const seg = L.slice(j0, n + 1);
    const checks = {
      "закрытие выше RANGE_HIGH с возвратом под него на последней свече": rf === n && n - j0 <= o.probeMaxBars,
      "цена ниже трендовой линии коррекции": !!tl && !tl.above,
      "объём >= 1.5×": Math.max(...seg.map(x => x.v)) >= o.probeVol * volAvg(L, j0, o.volN),
    };
    const entry = L[n].c, stop = Math.max(...seg.map(x => x.h)) + 0.3 * atrL;
    const tg = [(r.low + r.high) / 2, r.low, ctx.support.hi].filter(p => p < entry);
    return mk("S2", "S", entry, stop, tg, 0.5, checks, "Ложный пробой RANGE_HIGH");
  }

  function setupS3(ctx) {
    const { H0, o, reversal, atrH } = ctx, n = H0.length - 1, p = H0[n - 1], b = H0[n];
    const rng = p.h - p.l || 1, uw = p.h - Math.max(p.o, p.c);
    const checks = {
      "прокол выше REVERSAL": p.h > reversal.hi,
      "HTF-закрытие проколотой свечи ниже REVERSAL": p.c < reversal.hi,
      "следующая свеча закрылась ниже минимума проколотой": b.c < p.l,
      "объём >= 1.5× / верхняя тень >= 50%": p.v >= o.probeVol * volAvg(H0, n - 1, o.volN) || uw / rng >= 0.5,
    };
    const entry = ctx.price, stop = p.h + 0.5 * atrH;
    return mk("S3", "S", entry, stop, targetsShort(ctx, entry), 0.5, checks, "Ложный пробой REVERSAL (провал разворота)");
  }

  // ---------- план фиксации ----------
  function exitPlan(c, ctx, status) {
    const t = c.targets.slice(0, 6);
    if (c.side === "S") {
      const pct = [40, 35, 25];
      return t.slice(0, 3).map((p, i) => ({ price: p, closePct: i === 2 || t.length < 3 && i === t.length - 1 ? 100 - pct.slice(0, i).reduce((a, b) => a + b, 0) : pct[i], note: i === 2 ? "остаток: трейлинг по хаям HTF" : "" }));
    }
    // лонг: 30% на первой зоне, 10% на REVERSAL, остаток 15% к TARGET (только CONFIRMED), остальное поровну по ступеням
    const rows = t.map(p => ({ price: p, kind: p === ctx.reversal.lo ? "reversal" : p === ctx.target.lo ? "target" : "ladder" }));
    const mid = rows.filter((r, i) => i > 0 && r.kind === "ladder");
    rows.forEach((r, i) => { r.closePct = i === 0 && r.kind === "ladder" ? 30 : r.kind === "reversal" ? 10 : 0; });
    const each = mid.length ? Math.min(25, Math.floor(45 / mid.length)) : 0;
    mid.forEach(r => { r.closePct = each; });
    const sum = rows.reduce((s, r) => s + r.closePct, 0);
    const tg = rows.find(r => r.kind === "target");
    if (tg) tg.closePct = status === "CONFIRMED" ? 100 - sum : 0;
    return rows.map(r => ({ price: r.price, closePct: r.closePct, note: r.kind === "target" ? "только в CONFIRMED, трейлинг по минимумам 2 HTF-свечей" : r.kind === "reversal" ? "после закрепления выше — стоп под REVERSAL − 0.5×ATR(HTF)" : "" }));
  }

  // ---------- публичный анализ ----------
  function analyze(input, userOpts) {
    const o = Object.assign({}, DEFAULTS, userOpts || {});
    o.minBars = Object.assign({}, DEFAULTS.minBars, (userOpts || {}).minBars || {});
    const { htf, mtf, ltf } = input;
    const out = {
      timestamp: new Date().toISOString(), symbol: input.symbol || null, scenario_status: "NO_SCENARIO", mode: "NEUTRAL",
      impulse_dir: null, levels: null, action: "NO_TRADE", setup: null, entry: null, stop: null, targets: [], plan: [],
      position_size: null, risk_pct: null, rr_to_first_target: null, reason: "", conditions_checklist: {}, candidates: [],
    };
    const miss = [];
    if (!htf || htf.length < o.minBars.htf) miss.push("HTF >= " + o.minBars.htf + " свечей");
    if (!mtf || mtf.length < o.minBars.mtf) miss.push("MTF >= " + o.minBars.mtf + " свечей");
    if (!ltf || ltf.length < o.minBars.ltf) miss.push("LTF >= " + o.minBars.ltf + " свечей");
    if (miss.length) { out.reason = "Не хватает данных: " + miss.join(", "); return out; }

    const aH = atr(htf, o.atrN);
    const up = bestImpulse(htf.slice(-o.lookback), aH, o).imp;
    const dn = bestImpulse(mirror(htf.slice(-o.lookback)), aH, o).imp;
    if (!up && !dn) { out.reason = "Нет главного импульса >= " + o.impulseMinAtr + "×ATR(HTF)"; return out; }
    const flip = !!dn && (!up || dn.size > up.size);
    const fx = p => (flip ? -p : p), fz = z => (flip ? { lo: -z.hi, hi: -z.lo, touches: z.touches } : { lo: z.lo, hi: z.hi, touches: z.touches });
    const H = flip ? mirror(htf) : htf, M = flip ? mirror(mtf) : mtf, L = flip ? mirror(ltf) : ltf;
    out.impulse_dir = flip ? "down" : "up";

    const res = build(H, M, L, o, input);
    if (res.fail) {
      out.reason = res.fail;
      if (res.partial) out.levels = { support: fz(res.partial.support), target: fz(res.partial.target) };
      return out;
    }
    const { ctx } = res;
    out.scenario_status = res.status;
    const finalSide = s => (s === "L") !== flip ? "long" : "short";   // сторона в реальном мире
    const baseSide = flip ? "short" : "long";
    out.mode = res.status === "INVALIDATED" ? (o.shortAllowed || baseSide === "short" ? (baseSide === "long" ? "SHORT_MODE" : "LONG_MODE") : "NEUTRAL")
      : (baseSide === "long" ? "LONG_MODE" : "SHORT_MODE");
    out.levels = {
      support: fz(ctx.support), reversal: fz(ctx.reversal), target: fz(ctx.target),
      ladder: ctx.ladder.map(fz),
      trendline: res.tl ? { p1: [res.tl.p1[0], fx(res.tl.p1[1])], p2: [res.tl.p2[0], fx(res.tl.p2[1])], value: fx(res.tl.value), broken: res.tl.broken, retested: res.tl.retested } : null,
      range: res.ranges ? [fx(flip ? res.ranges.high : res.ranges.low), fx(flip ? res.ranges.low : res.ranges.high)].sort((a, b) => a - b) : null,
    };
    out.pending_retest = !!res.pendingRetest;

    // выбор сигнала
    const notes = [];
    const all = res.cands.map(c => {
      const side = finalSide(c.side);
      const tg = c.targets.map(fx);
      const e = fx(c.entry), s = fx(c.stop);
      const cost = input.spreadCost || 0;
      const gate = {
        "сторона разрешена": side === "long" || o.shortAllowed,
        "нет блокировки по новостям": !input.blackout,
        "есть цель": tg.length > 0,
        ["RR >= " + o.minRR]: c.rr !== null && c.rr >= o.minRR,
        "издержки <= 10% потенциала": !tg.length || cost <= o.maxCostShare * Math.abs(tg[0] - e),
      };
      return { setup: c.setup, side, entry: e, stop: s, targets: tg, rr: c.rr, riskMult: c.riskMult, why: c.why,
        checks: Object.assign({}, c.checks, gate), valid: c.valid && Object.values(gate).every(Boolean), _c: c };
    });
    out.candidates = all.map(c => ({ setup: c.setup, side: c.side, valid: c.valid, rr: c.rr, checks: c.checks }));
    const pick = all.filter(c => c.valid).sort((a, b) => (b.rr || 0) - (a.rr || 0))[0];

    const openOpp = input.openSide && ((res.status === "INVALIDATED" && input.openSide === baseSide) );
    if (openOpp) { out.action = "EXIT_ALL"; out.reason = "Сценарий INVALIDATED: закрытие HTF ниже SUPPORT − буфер. Закрыть позиции по сценарию."; return out; }

    if (!pick) {
      const near = all.filter(c => c.checks && Object.values(c.checks).some(Boolean)).sort((a, b) => Object.values(b.checks).filter(Boolean).length - Object.values(a.checks).filter(Boolean).length)[0];
      out.reason = "Сигнала нет. Статус: " + res.status + (res.pendingRetest ? " (пробой REVERSAL, ждём ретест)" : "") +
        (near ? ". Ближайший сетап " + near.setup + " не выполнил: " + Object.keys(near.checks).filter(k => !near.checks[k]).join("; ") : "");
      return out;
    }
    out.action = pick.side === "long" ? "ENTER_LONG" : "ENTER_SHORT";
    out.setup = pick.setup; out.entry = pick.entry; out.stop = pick.stop; out.targets = pick.targets;
    out.rr_to_first_target = Math.round(pick.rr * 100) / 100;
    out.risk_pct = Math.round(o.riskPct * pick.riskMult * 100) / 100;
    if (input.balance) {
      const pvx = input.pointValue || 1;
      out.position_size = Math.floor(input.balance * out.risk_pct / 100 / (Math.abs(pick.entry - pick.stop) * pvx));
    }
    out.conditions_checklist = pick.checks;
    out.reason = pick.why + ", статус " + res.status;
    out.plan = exitPlan({ side: pick.side === "long" ? "L" : "S", setup: pick.setup, targets: pick.targets }, flip
      ? { reversal: { lo: out.levels.reversal.hi }, target: { lo: out.levels.target.hi } } : { reversal: { lo: out.levels.reversal.lo }, target: { lo: out.levels.target.lo } }, res.status);
    return out;
  }

  // ---------- совместимость с экраном «Анализ сделки» (формат anAnalysis) ----------
  function toLegacy(r, price) {
    if (!r) return null;
    const px = price != null ? price : r.entry;
    const lv = r.levels;
    if (!lv || !lv.support) {
      const none = { bar: false, vol: false, desc: r.reason || "Сценарий не найден" };
      return { price: px, trend: "flat", phase: "range", trendDetail: r.reason || "Сценарий не найден",
        levels: [], profile: null, fib: null, zones: [], plans: { long: null, short: null },
        confirm: { long: none, short: none }, checks: {}, strategy: r };
    }
    const levels = [];
    const push = (z, kind) => z && levels.push({ price: (z.lo + z.hi) / 2, kind, touches: z.touches || 1 });
    push(lv.support, "support"); push(lv.reversal, "resist"); push(lv.target, "resist");
    (lv.ladder || []).forEach(z => push(z, "resist"));
    const st = r.scenario_status, tl = lv.trendline;
    const trend = st === "CONFIRMED" ? (r.impulse_dir === "up" ? "up" : "down") : st === "INVALIDATED" ? (r.impulse_dir === "up" ? "down" : "up") : "flat";
    const phase = st === "CONFIRMED" ? "impulse" : "pullback";
    const side = r.action === "ENTER_LONG" ? "long" : r.action === "ENTER_SHORT" ? "short" : null;
    const plan = r.entry != null ? { entry: r.entry, stop: r.stop, take: r.targets[0], takeNote: "по плану фиксации: " + r.targets.join(" → "),
      inZone: true, zone: { lo: Math.min(r.entry, r.stop), hi: Math.max(r.entry, r.stop), factors: [], count: 0, labels: [r.setup] } } : null;
    const cl = r.conditions_checklist || {};
    const volOk = Object.keys(cl).some(k => /объём/.test(k) && cl[k]);
    const checks = {
      s_impulse: true,
      s_reversal: !!lv.reversal,
      s_support: st === "NEAR_SUPPORT" || !!lv.range,
      s_mtf: !!(tl && tl.broken && tl.retested),
      s_ladder: (lv.ladder || []).length > 0,
      s_state: st === "NEAR_SUPPORT" || st === "CONFIRMED",
      c_bar: !!r.setup,
      c_vol: !!r.setup && volOk,
    };
    const cf = s => side === s
      ? { bar: true, vol: volOk, desc: "Сетап " + r.setup + ": " + r.reason + (volOk ? ", объём подтверждает" : ", объём не подтверждает") }
      : { bar: false, vol: false, desc: side ? "Сигнал есть только в другую сторону (" + side + ")" : (r.reason || "Сигнала входа нет") };
    return {
      price: px, trend, phase,
      trendDetail: "Сценарий " + st + ", импульс " + r.impulse_dir + ", режим " + r.mode,
      levels, profile: null, fib: null, zones: [],
      plans: { long: side === "long" ? plan : null, short: side === "short" ? plan : null },
      confirm: { long: cf("long"), short: cf("short") },
      checks, strategy: r,
    };
  }

  // сводка для экрана: процент соответствия стратегии и список выполненных условий
  const ITEMS = [
    ["s_impulse", "Найден главный импульс", 20], ["s_reversal", "Найден уровень REVERSAL", 15],
    ["s_support", "Цена у SUPPORT или границы диапазона", 15], ["s_mtf", "MTF: пробой линии коррекции и ретест", 15],
    ["s_ladder", "Есть лесенка целей", 5], ["s_state", "Сценарий активен", 5],
    ["c_bar", "Сработал сетап входа (A / B / C / S1-S3)", 15], ["c_vol", "Объём на проколе или пробое подтверждает", 10],
  ];
  function summarize(r) {
    const A = toLegacy(r, null), K = (A && A.checks) || {};
    const items = ITEMS.map(([k, label, w]) => ({ k, label, w, ok: !!K[k] }));
    let match = items.reduce((s, i) => s + (i.ok ? i.w : 0), 0);
    if (r.scenario_status === "INVALIDATED") match = Math.min(match, 20);
    return {
      status: r.scenario_status, reason: r.reason || "", impulse_dir: r.impulse_dir, mode: r.mode, setup: r.setup,
      action: r.action, entry: r.entry, stop: r.stop, targets: r.targets || [], rr: r.rr_to_first_target,
      levels: r.levels || null, match, items,
    };
  }

  return { analyze, toLegacy, summarize, DEFAULTS, _internals: { atr, pivots, cluster, bestImpulse, rangeAt, trendline } };
});