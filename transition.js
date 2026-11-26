(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('jasta-page-enter');

  var curtain = null;
  var navigating = false;

  function makeCurtain() {
    if (curtain) return curtain;
    curtain = document.createElement('div');
    curtain.className = 'jasta-curtain';
    curtain.setAttribute('aria-hidden', 'true');
    curtain.innerHTML = '<span class="jasta-curtain__mark">Нить не порвётся</span>';
    document.body.appendChild(curtain);
    return curtain;
  }

  function isInternal(a) {
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return false;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return false;
    try {
      var u = new URL(a.href, location.href);
      return u.origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var target = e.target instanceof Element ? e.target : (e.target && e.target.parentElement);
    var a = target && target.closest ? target.closest('a') : null;
    if (!isInternal(a)) return;
    e.preventDefault();
    if (navigating) return;
    navigating = true;
    var el = makeCurtain();
    requestAnimationFrame(function () { el.classList.add('is-active'); });
    window.setTimeout(function () { location.assign(a.href); }, 380);
  }

  function enter() {
    document.body.classList.add('jasta-ready');
    if (curtain) window.setTimeout(function () { curtain.classList.remove('is-active'); }, 120);
  }

  document.addEventListener('click', onClick, true);
  window.addEventListener('pageshow', function (e) { if (e.persisted) enter(); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enter);
  } else {
    enter();
  }
})();
