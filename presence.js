/* «Дыхание на полях» — второй жест «Пульса», для страниц записей.
 *
 * Маленький канвас живёт ВНЕ текстовой колонки, в поле слева. Когда человек
 * перестаёт скроллить, рядом с текущим абзацем начинают дышать две волосяные
 * дуги. Через несколько секунд тишины один раз пишется «фраза-ответ» —
 * контур из трёх слогов. Потом всё растворяется и молчит.
 *
 * Никакого следа за курсором, кликов, звука и сети. ES5, один IIFE.
 *
 * Монтирование: <canvas class="pulse-margin" data-pulse="presence" aria-hidden="true"></canvas>
 * Включается страница атрибутом <body data-presence>. Выключается: <body data-pulse-off>.
 */
(function () {
  "use strict";

  /* Настройки: время в миллисекундах, размеры в CSS-пикселях. */
  var ACCENT = [226, 168, 120]; // тёплый коралл — единственные чернила
  var FPS = 30;                 // предел кадров, не 60
  var DPR_MAX = 2;              // предел плотности пикселей
  var MIN_WIDTH = 900;          // уже этого — на поле места нет, молчим
  var GAP = 10;                 // зазор между краем текста и канвасом
  var TOP_SAFE = 40;            // не залезать под шапку
  var FIRST_DELAY_MS = 3500;    // первая пауза перед дыханием
  var IDLE_MS = 2800;           // тишина после прокрутки
  var ANSWER_DELAY_MS = 3700;   // ещё тишина — и один ответ
  var ANSWER_DRAW_MS = 1800;    // сколько пишется ответ
  var ANSWER_HOLD_MS = 900;     // сколько он стоит
  var COOLDOWN_MS = 12000;      // пауза между ответами
  var BREATH_A_MS = 11300;      // два несовпадающих периода дыхания
  var BREATH_B_MS = 7100;
  var BREATH_ALPHA = 0.20;      // яркость дыхания на пике
  var ANSWER_ALPHA = 0.32;      // яркость ответа на пике
  var LINE_W = 1.1;             // толщина дыхания
  var ANSWER_W = 1.4;           // толщина ответа
  var SHADOW_BLUR = 3;          // смещённая тень, не свечение
  var SHADOW_OFFSET = 0.7;
  var EASE = 0.085;             // проявление
  var FADE_EASE = 0.10;         // растворение после ответа
  var SCROLL_EASE = 0.18;       // быстрое растворение при прокрутке
  var MAX_ERRORS = 5;           // после стольких сбоев — молчать

  var canvas = null, ctx = null;
  var W = 0, H = 0, DPR = 1;
  var column = null, nodes = [], active = null;
  var reduced = false, mql = null;
  var raf = null, lastFrame = 0, idleTimer = null, resizeTimer = null;
  var mode = "off";             // off | breath | answer | fade | static
  var presence = 0, target = 0, fastFade = false;
  var breathStart = 0, answerStart = 0, answerWrite = 0, answerAlpha = 0;
  var cooldownUntil = 0, errors = 0, booted = false;

  function now() {
    return (window.performance && performance.now) ? performance.now() : +new Date();
  }
  function rgba(a) {
    if (a < 0) a = 0;
    if (a > 1) a = 1;
    return "rgba(" + ACCENT[0] + "," + ACCENT[1] + "," + ACCENT[2] + "," + a + ")";
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function gauss(u, c, w) { var d = (u - c) / w; return Math.exp(-d * d); }

  /* Размер. Ноль или нет контекста — тихо ничего не делаем. */
  function measure() {
    if (!canvas) return false;
    var cw = canvas.clientWidth || 0, ch = canvas.clientHeight || 0;
    if (cw < 8 || ch < 8) { W = H = 0; return false; }
    DPR = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    W = cw; H = ch;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    if (!ctx) return false;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return true;
  }

  function hideCanvas() {
    if (canvas) canvas.style.transform = "translate3d(-9999px,-9999px,0)";
  }

  /* Абзацы, среди которых ищем тот, на котором читатель задержался. */
  function collect() {
    nodes = [];
    if (!column) return;
    var list = column.querySelectorAll("[data-pulse-para]");
    if (!list.length) list = column.querySelectorAll("p, h2, blockquote, li");
    for (var i = 0; i < list.length; i++) nodes.push(list[i]);
  }

  function pickActive() {
    var vh = window.innerHeight || 0;
    var aim = vh * 0.45, best = null, bestScore = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      if (r.height < 4 || r.bottom < TOP_SAFE || r.top > vh - 24) continue;
      var score = Math.abs(r.top + r.height / 2 - aim);
      if (r.top > aim || r.bottom < aim) score += vh * 0.25;
      if (score < bestScore) { bestScore = score; best = nodes[i]; }
    }
    return best;
  }

  /* Ставим в поле, никогда поверх букв. */
  function place() {
    if (!canvas || !column || !active || W === 0 || H === 0) { hideCanvas(); return false; }
    var rect = column.getBoundingClientRect();
    var cs = window.getComputedStyle ? getComputedStyle(column) : null;
    var pl = cs ? (parseFloat(cs.paddingLeft) || 0) : 0;
    var pr = cs ? (parseFloat(cs.paddingRight) || 0) : 0;
    var textLeft = rect.left + pl, textRight = rect.right - pr;
    var vw = window.innerWidth || 0, vh = window.innerHeight || 0;

    // сначала слева от текста, потом справа; не влезло — уходим
    var x = textLeft - W - GAP;
    if (x < 4 || x + W > textLeft - 4) {
      x = textRight + GAP;
      if (x + W > vw - 4) { hideCanvas(); return false; }
    }

    var ar = active.getBoundingClientRect();
    var y = clamp(ar.top + ar.height / 2 - H / 2, TOP_SAFE, Math.max(TOP_SAFE, vh - H - 12));
    canvas.style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0)";
    return true;
  }

  /* Дыхание из двух медленных, несовпадающих периодов. */
  function breathValue(t) {
    var a = Math.sin(t / BREATH_A_MS * Math.PI * 2);
    var b = Math.sin(t / BREATH_B_MS * Math.PI * 2 + 1.7);
    return clamp(0.5 + 0.32 * a + 0.18 * b, 0, 1);
  }

  function drawBreath(t, alpha) {
    var b = breathValue(t);
    var mid = H / 2, span = H * 0.62;
    var top = mid - span / 2, bot = mid + span / 2;
    var gapPx = W * 0.30 + b * 2.2;
    var x1 = W / 2 - gapPx / 2, x2 = W / 2 + gapPx / 2;
    var bow = 1.4 + b * 1.9;

    ctx.lineWidth = LINE_W;
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba(alpha);
    ctx.shadowColor = rgba(alpha * 0.22);
    ctx.shadowBlur = SHADOW_BLUR;
    ctx.shadowOffsetX = SHADOW_OFFSET;
    ctx.shadowOffsetY = SHADOW_OFFSET;
    ctx.beginPath();
    ctx.moveTo(x1, top);
    ctx.quadraticCurveTo(x1 - bow, mid, x1, bot);
    ctx.moveTo(x2, top);
    ctx.quadraticCurveTo(x2 + bow, mid, x2, bot);
    ctx.stroke();
  }

  /* Контур фразы: три мягких слога, без пика кардиограммы. */
  function drawAnswer(t, write, alpha) {
    if (write <= 0.001 || alpha <= 0.001) return;
    var ax = W * 0.16, aw = W * 0.68, ay = H / 2;
    var steps = 36, n = Math.max(2, Math.floor(steps * write));

    ctx.lineWidth = ANSWER_W;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = rgba(alpha);
    ctx.shadowColor = rgba(alpha * 0.20);
    ctx.shadowBlur = SHADOW_BLUR;
    ctx.shadowOffsetX = SHADOW_OFFSET;
    ctx.shadowOffsetY = SHADOW_OFFSET;
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var u = i / steps;
      var env = 0.70 * gauss(u, 0.20, 0.09)
              + 1.00 * gauss(u, 0.52, 0.13)
              + 0.55 * gauss(u, 0.80, 0.08);
      var drift = 1.1 * Math.sin(u * 6.283 + t / 9000);
      var x = ax + aw * u, y = ay - env * (H * 0.055) + drift;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function paint(t) {
    if (!ctx || W === 0 || H === 0) return;
    ctx.clearRect(0, 0, W, H);
    var a = BREATH_ALPHA * presence;
    if (a > 0.002) drawBreath(t, a);
    if (answerWrite > 0.001 && answerAlpha > 0.001) {
      drawAnswer(t, answerWrite, ANSWER_ALPHA * answerAlpha * presence);
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  /* Цикл крутится, только пока что-то видно или тает. */
  function stopLoop() {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
  }
  function ensureLoop() {
    if (reduced || document.hidden || raf !== null || !ctx) return;
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  }
  function frame(ts) {
    raf = null;
    try {
      if (document.hidden) return;
      var t = ts || now();
      if (t - lastFrame < 1000 / FPS - 1) { raf = requestAnimationFrame(frame); return; }
      lastFrame = t;

      if (mode === "breath") {
        target = 1;
        if (t - breathStart >= ANSWER_DELAY_MS && t >= cooldownUntil) {
          mode = "answer"; answerStart = t; answerWrite = 0; answerAlpha = 0;
        }
      } else if (mode === "answer") {
        var p = clamp((t - answerStart) / ANSWER_DRAW_MS, 0, 1);
        answerWrite = p;
        answerAlpha = p < 0.18 ? p / 0.18 : 1;
        if (t - answerStart >= ANSWER_DRAW_MS + ANSWER_HOLD_MS) {
          mode = "fade"; target = 0; fastFade = false; cooldownUntil = t + COOLDOWN_MS;
        }
      } else if (mode === "fade") {
        target = 0;
      }

      var ease = mode === "fade" ? (fastFade ? SCROLL_EASE : FADE_EASE) : EASE;
      presence += (target - presence) * ease;

      if (mode === "fade" && presence < 0.012) {
        presence = 0; answerWrite = 0; answerAlpha = 0; mode = "off";
        if (ctx) ctx.clearRect(0, 0, W, H);
        hideCanvas();
        stopLoop();
        return;
      }

      paint(t);
      if (mode !== "off") raf = requestAnimationFrame(frame);
    } catch (e) {
      // один сбой не должен глушить дыхание навсегда
      errors++;
      presence = 0; answerWrite = 0; answerAlpha = 0; target = 0; mode = "off";
      try { if (ctx) ctx.clearRect(0, 0, W, H); } catch (e2) {}
      hideCanvas();
      if (errors >= MAX_ERRORS) teardown();
      else scheduleIdle(IDLE_MS);
    }
  }

  /* Пауза и прокрутка. Прокрутку никогда не перехватываем. */
  function clearIdle() {
    if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; }
  }
  function beginBreath() {
    idleTimer = null;
    if (reduced || document.hidden || !ctx || !measure()) return;
    active = pickActive();
    if (!active || !place()) { mode = "off"; presence = 0; hideCanvas(); return; }
    mode = "breath"; breathStart = now(); answerWrite = 0; answerAlpha = 0; target = 1;
    ensureLoop();
  }
  function scheduleIdle(delay) {
    clearIdle();
    if (reduced || document.hidden) return;
    idleTimer = setTimeout(beginBreath, delay);
  }
  function onScroll() {
    if (reduced) return;
    if (mode === "breath" || mode === "answer" || mode === "fade") {
      mode = "fade"; target = 0; fastFade = true; ensureLoop();
    }
    scheduleIdle(IDLE_MS);
  }
  function onVisibility() {
    if (reduced) return; // статичный кадр остаётся, движения нет
    if (document.hidden) {
      clearIdle(); stopLoop();
      mode = "off"; presence = 0; answerWrite = 0; answerAlpha = 0; target = 0;
      if (ctx) { try { ctx.clearRect(0, 0, W, H); } catch (e) {} }
      hideCanvas();
    } else {
      scheduleIdle(IDLE_MS);
    }
  }
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resizeTimer = null;
      if ((window.innerWidth || 0) < MIN_WIDTH) { reset("off"); return; }
      if (!measure()) { hideCanvas(); return; }
      collect();
      if (reduced) { renderStatic(); return; }
      if (mode !== "off") {
        active = pickActive();
        if (!place()) { mode = "off"; presence = 0; hideCanvas(); }
      }
    }, 150);
  }

  function reset(next) {
    stopLoop(); clearIdle();
    mode = next || "off";
    presence = 0; target = 0; answerWrite = 0; answerAlpha = 0;
    if (ctx) { try { ctx.clearRect(0, 0, W, H); } catch (e) {} }
    hideCanvas();
  }

  /* Уменьшенное движение: один статичный кадр, без анимации. */
  function renderStatic() {
    stopLoop(); clearIdle();
    if (!measure()) { hideCanvas(); return; }
    collect();
    active = pickActive();
    if (!active || !place()) { hideCanvas(); return; }
    presence = 0.55; answerWrite = 0; answerAlpha = 0; mode = "static";
    try { paint(now()); } catch (e) { hideCanvas(); }
  }

  function applyMotionPreference() {
    reduced = !!(mql && mql.matches);
    window.removeEventListener("scroll", onScroll);
    if (reduced) {
      renderStatic();
    } else {
      window.addEventListener("scroll", onScroll, { passive: true });
      mode = "off"; presence = 0; answerWrite = 0; answerAlpha = 0;
      hideCanvas();
      scheduleIdle(FIRST_DELAY_MS);
    }
  }

  function teardown() {
    stopLoop(); clearIdle();
    if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null; }
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    if (mql) {
      if (mql.removeEventListener) mql.removeEventListener("change", applyMotionPreference);
      else if (mql.removeListener) mql.removeListener(applyMotionPreference);
    }
    hideCanvas();
  }

  function boot() {
    if (booted || !document.body) return;
    if (!document.body.hasAttribute("data-presence")) return; // только там, где включено
    if (document.body.hasAttribute("data-pulse-off")) return;
    if ((window.innerWidth || 0) < MIN_WIDTH) return;        // на телефоне молчим

    canvas = document.querySelector('canvas[data-pulse="presence"]');
    column = document.querySelector("[data-pulse-column]") ||
             document.querySelector("main") || document.querySelector("article");
    if (!column) return;

    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "pulse-margin";
      canvas.setAttribute("data-pulse", "presence");
      canvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(canvas);
    }
    canvas.setAttribute("aria-hidden", "true");

    // скрыт на узких экранах через CSS — тогда размеры нулевые, уходим тихо
    if (!canvas.clientWidth) return;

    try { ctx = canvas.getContext("2d"); } catch (e) { ctx = null; }
    if (!ctx) { canvas = null; return; }

    booted = true;
    hideCanvas();
    measure();
    collect();
    if (!window.requestAnimationFrame || !window.cancelAnimationFrame) return;

    mql = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (mql) {
      if (mql.addEventListener) mql.addEventListener("change", applyMotionPreference);
      else if (mql.addListener) mql.addListener(applyMotionPreference);
    }
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    applyMotionPreference();
  }

  try {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  } catch (e) { /* страница не должна зависеть от украшения */ }
})();
