/* «Пульс Джасты» — фирменная деталь сайта.
 *
 * Это модуль, а не один эффект: он находит на странице все <canvas data-pulse="...">
 * и включает нужный слой. Если такого канваса нет — рисует нижнюю линию сама.
 *
 *   data-pulse="line"   — тонкая кардиограмма внизу экрана + волны за курсором;
 *   data-pulse="heart"  — большая кардиограмма внутри блока (главная, обложки).
 *
 * Правила: не мешает читать (низкая прозрачность, pointer-events: none),
 * уважает prefers-reduced-motion, засыпает в скрытой вкладке, держит 30 кадров/с.
 */
(function () {
  "use strict";

  if (!document.body) return;

  var ACCENT = [226, 168, 120];
  var TRACE_MS = 1700;   // сколько живёт след нижней линии
  var BEAT_MS = 4200;    // период удара нижней линии
  var SCROLL_DIM = 0.35; // насколько гаснет линия при прокрутке
  var reducedMotion = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rgba(alpha) {
    return "rgba(" + ACCENT[0] + "," + ACCENT[1] + "," + ACCENT[2] + "," + alpha + ")";
  }

  /* «тук-тук»: два удара и мягкое послезвучие — ритм нижней линии */
  function beat(now) {
    var ph = (now % BEAT_MS) / BEAT_MS;
    var v = 0;
    v += Math.exp(-Math.pow((ph - 0.16) / 0.020, 2));
    v -= 0.45 * Math.exp(-Math.pow((ph - 0.215) / 0.028, 2));
    v += 0.32 * Math.exp(-Math.pow((ph - 0.44) / 0.045, 2));
    var breath = 0.92 + 0.12 * Math.sin(now / 9000);  // удар то выше, то тише
    return v * breath;
  }

  /* ------------------------------------------------------------------ линия --- */

  function mountLine(canvas) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;

    var W = 0, H = 0, DPR = 1;
    var rings = [];
    var samples = [];
    var lastSpawn = 0, lastX = -1, lastY = -1;
    var raf = null, lastFrame = 0;
    var scrollDim = 0, scrollTimer = null;

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function addSample(now) {
      samples.push({ t: now, v: beat(now) });
      while (samples.length && samples[0].t < now - TRACE_MS) samples.shift();
    }

    function drawTrace(now) {
      if (!samples.length) return;

      var baseY = H - 8;
      var headX = W - 18;
      var span = Math.min(W * 0.9, 860);
      var amp = 7;
      var dim = 1 - scrollDim * SCROLL_DIM;

      ctx.lineWidth = 1.4;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // три отрезка: голова ярче хвоста
      var chunks = 3;
      for (var c = 0; c < chunks; c++) {
        var from = Math.floor(samples.length * c / chunks);
        var to = Math.floor(samples.length * (c + 1) / chunks);
        if (to - from < 2) continue;
        ctx.beginPath();
        for (var i = from; i < to; i++) {
          var s = samples[i];
          var x = headX - ((now - s.t) / TRACE_MS) * span;
          var y = baseY - s.v * amp;
          if (i === from) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba((0.20 + 0.22 * (c + 1)) * dim);
        ctx.stroke();
      }

      // точка на голове — сердце линии
      var lastV = samples[samples.length - 1].v;
      var hy = baseY - lastV * amp;
      var pulse = 0.55 + 0.45 * Math.abs(Math.min(lastV, 1));
      var g = ctx.createRadialGradient(headX, hy, 0, headX, hy, 9);
      g.addColorStop(0, rgba(0.5 * pulse * dim));
      g.addColorStop(1, rgba(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(headX, hy, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawRings(now) {
      for (var i = rings.length - 1; i >= 0; i--) {
        var r = rings[i];
        var age = (now - r.t) / r.life;
        if (age < 0) age = 0;            // кадр может быть «старше» события
        if (age >= 1) { rings.splice(i, 1); continue; }
        var ease = 1 - Math.pow(1 - age, 3);
        var radius = 4 + ease * r.max;
        if (!(radius > 0)) { rings.splice(i, 1); continue; }
        var alpha = (1 - age) * r.a * (1 - scrollDim * SCROLL_DIM);
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(alpha);
        ctx.lineWidth = 1.5 - age * 1.0;
        ctx.stroke();
      }
    }

    function frame(now) {
      raf = null;
      if (now - lastFrame < 32) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastFrame = now;

      try {
        ctx.clearRect(0, 0, W, H);
        drawRings(now);
        if (!reducedMotion) {
          addSample(now);
          drawTrace(now);
        }
      } catch (e) {
        rings.length = 0;                // один сбой не должен убивать пульс
      }
      raf = requestAnimationFrame(frame);
    }

    function ensureLoop() {
      if (raf === null) {
        lastFrame = 0;
        raf = requestAnimationFrame(frame);
      }
    }

    function spawn(x, y, strength) {
      var now = performance.now();
      if (now - lastSpawn < 70) return;
      lastSpawn = now;
      if (rings.length > 26) rings.shift();
      rings.push({ x: x, y: y, t: now, life: 950, max: strength || 62, a: 0.40 });
    }

    function onMove(e) {
      var x = e.clientX, y = e.clientY;
      var dx = x - lastX, dy = y - lastY;
      if (lastX >= 0 && dx * dx + dy * dy < 110) return;
      lastX = x; lastY = y;
      spawn(x, y, 58);
      ensureLoop();
    }

    function onDown(e) {
      lastX = e.clientX; lastY = e.clientY;
      spawn(e.clientX, e.clientY, 96);
      ensureLoop();
    }

    function onScroll() {
      scrollDim = 1;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () { scrollDim = 0; }, 420);
      ensureLoop();
    }

    function onVisibility() {
      if (document.hidden) {
        if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      } else {
        ensureLoop();
      }
    }

    resize();
    window.addEventListener("resize", function () { resize(); ensureLoop(); }, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    if (!reducedMotion) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      ensureLoop();
    }

    return { wake: ensureLoop };
  }

  /* ----------------------------------------------------------------- сердце --- */

  // кардиограмма: маленький зубец, острый пик, провал, широкий подъём
  function gauss(u, c, w) {
    var d = (u - c) / w;
    return Math.exp(-d * d);
  }

  function ecg(p) {
    var v = 0;
    v += 0.12 * gauss(p, 0.20, 0.026);   // P — лёгкий вдох
    v -= 0.12 * gauss(p, 0.352, 0.012);  // Q
    v += 1.00 * gauss(p, 0.40, 0.020);   // R — сам удар
    v -= 0.30 * gauss(p, 0.442, 0.018);  // S
    v += 0.24 * gauss(p, 0.61, 0.042);   // T — послезвучие
    return v;
  }

  var HEART_MS = 1800;       // один удар — спокойный ритм
  var HEART_PERIOD_PX = 210; // сколько места занимает один удар

  function mountHeart(canvas) {
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;

    var W = 0, H = 0, DPR = 1;
    var raf = null, lastFrame = 0, start = 0;

    function measure() {
      var rect = canvas.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function paint(now) {
      var baseY = H / 2;
      var amp = Math.min(H * 0.34, H / 2 - 12);
      if (amp < 4) amp = 4;

      var shift = ((now - start) / HEART_MS) * HEART_PERIOD_PX;
      var step = 2;

      ctx.clearRect(0, 0, W, H);

      // дыхание фона: очень мягкое свечение в центре
      var breathe = 0.5 + 0.5 * Math.sin((now - start) / 2600);
      var glow = ctx.createRadialGradient(W / 2, baseY, 0, W / 2, baseY, Math.max(W * 0.34, 110));
      glow.addColorStop(0, rgba(0.022 + 0.016 * breathe));
      glow.addColorStop(1, rgba(0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // сама линия: рисуем один раз, гаснет к краям через градиент
      ctx.beginPath();
      for (var x = 0; x <= W; x += step) {
        var p = ((x + shift) / HEART_PERIOD_PX) % 1;
        if (p < 0) p += 1;
        var y = baseY - ecg(p) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      var fade = ctx.createLinearGradient(0, 0, W, 0);
      fade.addColorStop(0, rgba(0));
      fade.addColorStop(0.12, rgba(0.72));
      fade.addColorStop(0.55, rgba(0.92));
      fade.addColorStop(0.88, rgba(0.72));
      fade.addColorStop(1, rgba(0));
      ctx.strokeStyle = fade;
      ctx.lineWidth = 1.7;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      // тонкий блик под линией, чтобы она «стояла» в воздухе
      var shade = ctx.createLinearGradient(0, baseY - amp * 1.2, 0, baseY + amp * 1.2);
      shade.addColorStop(0, rgba(0));
      shade.addColorStop(0.5, rgba(0.05 * breathe));
      shade.addColorStop(1, rgba(0));
      ctx.fillStyle = shade;
      ctx.fillRect(W * 0.12, baseY - amp * 1.2, W * 0.76, amp * 2.4);
    }

    function frame(now) {
      raf = null;
      if (now - lastFrame < 32) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastFrame = now;
      try {
        paint(now);
      } catch (e) {
        // рисуем статичный кадр, но не умираем
      }
      raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (reducedMotion) {
        if (!start) start = performance.now();
        try { paint(performance.now()); } catch (e) {}
        return;
      }
      if (raf === null) raf = requestAnimationFrame(frame);
    }

    function onVisibility() {
      if (document.hidden) {
        if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      } else {
        wake();
      }
    }

    measure();
    start = performance.now();
    wake();

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { measure(); wake(); });
      ro.observe(canvas);
    } else {
      window.addEventListener("resize", function () { measure(); wake(); }, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);

    return { wake: wake };
  }

  /* -------------------------------------------------------------- автозапуск --- */

  var runners = [];

  function mount(canvas) {
    var mode = canvas.getAttribute("data-pulse") || "line";
    if (mode === "heart") return mountHeart(canvas);
    if (mode === "line") return mountLine(canvas);
    return null;                       // чужие слои (presence) не трогаем
  }

  function boot() {
    var nodes = document.querySelectorAll("canvas[data-pulse]");
    var hasLine = false;

    for (var i = 0; i < nodes.length; i++) {
      var mode = nodes[i].getAttribute("data-pulse") || "line";
      if (mode === "line") hasLine = true;
      var r = mount(nodes[i]);
      if (r) runners.push(r);
    }

    // нижняя линия — общая деталь сайта: если её нет в разметке, добавляем сами
    if (hasLine || document.body.hasAttribute("data-pulse-off")) return;

    var canvas = document.createElement("canvas");
    canvas.id = "jasta-pulse";
    canvas.className = "pulse-line";
    canvas.setAttribute("data-pulse", "line");
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    var runner = mountLine(canvas);
    if (runner) runners.push(runner);
  }

  boot();
})();
