/* Живой фон главной. Тот же граф, что и на карте, без внешних библиотек. */
(function () {
  'use strict';

  var data = window.LANDING_GRAPH || { nodes: [], links: [] };
  var nodesAll = (data.nodes || []).filter(function (n) { return n.id && n.label; });
  var linksAll = (data.links || []).filter(function (l) {
    return l.source && l.target && l.source !== l.target;
  });
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TAU = Math.PI * 2;

  function hash(text) {
    var h = 2166136261;
    text = String(text);
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  }

  function rgba(hex, alpha) {
    var h = String(hex || '#d4af37').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return 'rgba(226,168,120,' + alpha + ')';
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function setup(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, rect.width);
    var h = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function pointFor(n, w, h, time, small) {
    var angle = hash(n.id) * TAU;
    var spread = hash(n.id + '|');
    var radius = (0.16 + 0.84 * Math.sqrt(spread)) * Math.min(w, h) * (small ? 0.46 : 0.42);
    var drift = reduced ? 0 : Math.sin(time * 0.00024 + angle * 3) * (small ? 1 : 4);
    var cx = small ? w * 0.5 : w * 0.62;
    var cy = small ? h * 0.5 : h * 0.48;
    return [
      cx + Math.cos(angle) * radius + drift,
      cy + Math.sin(angle) * radius * (small ? 0.82 : 0.72) + drift * 0.6
    ];
  }

  function draw(canvas, time, small) {
    var s = setup(canvas);
    if (!s.ctx) return;
    var ctx = s.ctx;
    ctx.clearRect(0, 0, s.w, s.h);

    var nodes = nodesAll.slice(0, small ? 30 : 96);
    var ids = {};
    nodes.forEach(function (n) { ids[n.id] = n; });
    var degree = {};
    nodes.forEach(function (n) { degree[n.id] = 0; });

    ctx.lineWidth = small ? 0.7 : 0.8;
    linksAll.forEach(function (l) {
      var a = ids[l.source];
      var b = ids[l.target];
      if (!a || !b) return;
      degree[l.source]++;
      degree[l.target]++;
      var pa = pointFor(a, s.w, s.h, time, small);
      var pb = pointFor(b, s.w, s.h, time, small);
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.strokeStyle = rgba(a.color, l.kind === 'между' ? 0.19 : 0.1);
      ctx.setLineDash(l.kind === 'упоминание' ? [2, 4] : []);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    nodes.forEach(function (n) {
      var p = pointFor(n, s.w, s.h, time, small);
      var voice = n.id === 'голос:index.html';
      var r = small ? 1.5 : 1.7 + Math.min(3, degree[n.id] * 0.14);
      if (voice) r = small ? 2.6 : 5.2;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, TAU);
      ctx.fillStyle = rgba(n.color, voice ? 0.95 : 0.72);
      if (voice && !small) {
        ctx.shadowColor = rgba(n.color, 0.7);
        ctx.shadowBlur = 18 + Math.sin(time * 0.002) * 5;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  var hero = document.getElementById('landing-graph');
  var mini = document.querySelector('[data-mini="graph"]');

  if (mini) draw(mini, 0, true);

  if (hero) {
    var raf = 0;
    var last = 0;
    function frame(time) {
      if (document.hidden) { raf = 0; return; }
      if (time - last > 33) {
        draw(hero, time, false);
        last = time;
      }
      raf = window.requestAnimationFrame(frame);
    }
    function start() {
      if (reduced || raf) return;
      raf = window.requestAnimationFrame(frame);
    }
    function stop() {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    }
    draw(hero, 0, false);
    start();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
    window.addEventListener('resize', function () {
      draw(hero, performance.now(), false);
      if (mini) draw(mini, 0, true);
    }, { passive: true });
  }

  var revealItems = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window && !reduced) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16 });
    revealItems.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealItems.forEach(function (el) { el.classList.add('is-visible'); });
  }

  var counters = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
  function countUp(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (reduced) { el.textContent = target.toLocaleString('ru-RU'); return; }
    var start = performance.now();
    var duration = 900;
    function step(now) {
      var p = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('ru-RU');
      if (p < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window) {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          countUp(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { countObserver.observe(el); });
  } else {
    counters.forEach(countUp);
  }

  var cursor = document.getElementById('landing-cursor');
  if (cursor && !reduced && window.matchMedia('(pointer: fine)').matches) {
    var cx = -100, cy = -100, pending = false;
    function moveCursor() {
      cursor.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
      pending = false;
    }
    window.addEventListener('pointermove', function (event) {
      cx = event.clientX;
      cy = event.clientY;
      cursor.style.opacity = '1';
      if (!pending) {
        pending = true;
        window.requestAnimationFrame(moveCursor);
      }
      var hot = event.target && event.target.closest && event.target.closest('a, button');
      cursor.classList.toggle('is-hot', !!hot);
    }, { passive: true });
    document.addEventListener('pointerleave', function () { cursor.style.opacity = '0'; });
  }
})();
