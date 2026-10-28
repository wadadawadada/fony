(function () {
  var chat = document.getElementById("chat");
  var handle = document.getElementById("chatResizeHandle");
  if (!chat || !handle) return;

  var panel = chat.parentElement;
  var KEY = "chatHeight";
  var MIN = 120;
  var GAP = 30;
  var MIN_SCALE = 0.4;
  var startY = 0;
  var startH = 0;

  var shrinkable = [
    panel.querySelector(".screen-and-diods"),
    panel.querySelector(".player-controls")
  ].filter(Boolean);

  function outer(el) {
    var st = getComputedStyle(el);
    return el.offsetHeight + parseFloat(st.marginTop) + parseFloat(st.marginBottom);
  }

  // layout numbers measured with the player block at full size
  function measure() {
    shrinkable.forEach(function (el) { el.style.zoom = ""; });
    var cs = getComputedStyle(panel);
    var inner = panel.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var fixed = GAP;
    var natural = 0;
    Array.prototype.forEach.call(panel.children, function (el) {
      if (el === chat || getComputedStyle(el).display === "none") return;
      var pos = getComputedStyle(el).position;
      if (pos === "absolute" || pos === "fixed") return;
      if (shrinkable.indexOf(el) !== -1) natural += outer(el);
      else fixed += outer(el);
    });
    return { inner: inner, fixed: fixed, natural: natural };
  }

  function apply(h) {
    var m = measure();
    var maxH = Math.max(MIN, m.inner - m.fixed - m.natural * MIN_SCALE);
    h = Math.min(Math.max(h, MIN), maxH);
    chat.style.flex = "0 0 auto";
    chat.style.height = h + "px";
    chat.style.marginTop = "auto";

    var scale = m.natural ? (m.inner - m.fixed - h) / m.natural : 1;
    scale = Math.min(1, Math.max(MIN_SCALE, scale));
    shrinkable.forEach(function (el) { el.style.zoom = scale < 1 ? scale : ""; });
  }

  function reset() {
    chat.style.flex = "";
    chat.style.height = "";
    chat.style.marginTop = "";
    shrinkable.forEach(function (el) { el.style.zoom = ""; });
  }

  function onMove(e) {
    apply(startH + (startY - e.clientY));
  }

  function onUp() {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.body.classList.remove("chat-resizing");
    try { localStorage.setItem(KEY, parseInt(chat.style.height, 10)); } catch (e) {}
  }

  handle.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    startY = e.clientY;
    startH = chat.getBoundingClientRect().height;
    document.body.classList.add("chat-resizing");
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });

  function restore() {
    if (window.innerWidth <= 1024) { reset(); return; }
    var saved = 0;
    try { saved = parseInt(localStorage.getItem(KEY), 10); } catch (e) {}
    if (saved) apply(saved);
  }

  restore();
  window.addEventListener("resize", restore);
})();
