(function () {
  "use strict";

  var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  var ICON_VOL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var ICON_MUTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" + s : s);
  }

  var players = [];

  function init(root) {
    var el = root.querySelector(".player");
    if (!el || el.dataset.ready === "1") return;
    el.dataset.ready = "1";

    var src = el.getAttribute("data-src");
    if (!src) return;

    var btnPlay = el.querySelector(".pl-play");
    var bar = el.querySelector(".pl-bar");
    var fill = el.querySelector(".pl-fill");
    var tCur = el.querySelector(".pl-time");
    var tDur = el.querySelector(".pl-dur");
    var btnVol = el.querySelector(".pl-vol");
    var volRange = el.querySelector(".pl-vol-range");

    var audio = new Audio();
    audio.preload = "none";
    audio.src = src;
    var lastVol = 1;

    var item = { audio: audio, btnPlay: btnPlay };
    players.push(item);

    function setPlayIcon(playing) {
      btnPlay.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      btnPlay.setAttribute("aria-label", playing ? "Пауза" : "Играть");
    }

    function syncVolIcon() {
      btnVol.innerHTML = (audio.muted || audio.volume === 0) ? ICON_MUTE : ICON_VOL;
    }

    btnPlay.addEventListener("click", function () {
      if (audio.paused) {
        players.forEach(function (p) {
          if (p !== item && !p.audio.paused) p.audio.pause();
        });
        audio.play();
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("play", function () { setPlayIcon(true); });
    audio.addEventListener("pause", function () { setPlayIcon(false); });
    audio.addEventListener("ended", function () { setPlayIcon(false); });
    audio.addEventListener("loadedmetadata", function () {
      tDur.textContent = fmt(audio.duration);
    });
    audio.addEventListener("timeupdate", function () {
      var d = audio.duration || 0;
      var p = d ? (audio.currentTime / d) * 100 : 0;
      fill.style.width = p + "%";
      tCur.textContent = fmt(audio.currentTime);
    });

    function seekFromEvent(ev) {
      var r = bar.getBoundingClientRect();
      var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      var ratio = Math.min(1, Math.max(0, x / r.width));
      if (isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = ratio * audio.duration;
        fill.style.width = (ratio * 100) + "%";
      }
    }

    var dragging = false;
    bar.addEventListener("pointerdown", function (ev) {
      dragging = true;
      bar.setPointerCapture && bar.setPointerCapture(ev.pointerId);
      seekFromEvent(ev);
    });
    bar.addEventListener("pointermove", function (ev) {
      if (dragging) seekFromEvent(ev);
    });
    bar.addEventListener("pointerup", function () { dragging = false; });
    bar.addEventListener("pointercancel", function () { dragging = false; });

    bar.addEventListener("keydown", function (ev) {
      var d = audio.duration || 0;
      if (!d) return;
      if (ev.key === "ArrowRight") { audio.currentTime = Math.min(d, audio.currentTime + 5); ev.preventDefault(); }
      if (ev.key === "ArrowLeft") { audio.currentTime = Math.max(0, audio.currentTime - 5); ev.preventDefault(); }
    });

    btnVol.addEventListener("click", function () {
      if (audio.muted || audio.volume === 0) {
        audio.muted = false;
        audio.volume = lastVol || 1;
        volRange.value = audio.volume;
      } else {
        lastVol = audio.volume || 1;
        audio.muted = true;
      }
      syncVolIcon();
    });

    volRange.addEventListener("input", function () {
      var v = parseFloat(volRange.value);
      audio.muted = false;
      audio.volume = v;
      if (v > 0) lastVol = v;
      syncVolIcon();
    });

    setPlayIcon(false);
    syncVolIcon();
    volRange.value = "1";
  }

  function initAll() {
    document.querySelectorAll(".player").forEach(function (el) {
      init(el.parentElement || document);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
