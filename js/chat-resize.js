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
  var currentH = 0;

  var shrinkable = [
    panel.querySelector(".diods-row"),
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
    var total = 0;
    Array.prototype.forEach.call(panel.children, function (el) {
      if (el === chat || getComputedStyle(el).display === "none") return;
      var pos = getComputedStyle(el).position;
      if (pos === "absolute" || pos === "fixed") return;
      total += outer(el);
    });
    var natural = 0;
    shrinkable.forEach(function (el) { natural += outer(el); });
    var fixed = GAP + total - natural;
    return { inner: inner, fixed: fixed, natural: natural };
  }

  function apply(h) {
    var m = measure();
    var maxH = Math.max(MIN, m.inner - m.fixed - m.natural * MIN_SCALE);
    h = Math.min(Math.max(h, MIN), maxH);
    // size via a CSS variable + body class instead of #chat's inline style,
    // because the collapse code in chat.js reacts to every style change on #chat
    document.documentElement.style.setProperty("--chat-h", h + "px");
    document.body.classList.add("chat-sized");
    currentH = h;

    var scale = m.natural ? (m.inner - m.fixed - h) / m.natural : 1;
    scale = Math.min(1, Math.max(MIN_SCALE, scale));
    shrinkable.forEach(function (el) { el.style.zoom = scale < 1 ? scale : ""; });
  }

  function reset() {
    document.body.classList.remove("chat-sized");
    shrinkable.forEach(function (el) { el.style.zoom = ""; });
  }

  function onMove(e) {
    apply(startH + (startY - e.clientY));
  }

  function onUp() {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.body.classList.remove("chat-resizing");
    try { localStorage.setItem(KEY, Math.round(currentH)); } catch (e) {}
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
    if (chat.style.display === "none") return;
    var saved = currentH;
    if (!saved) {
      try { saved = parseInt(localStorage.getItem(KEY), 10); } catch (e) {}
    }
    if (saved) apply(saved);
  }

  // collapsing the console hides #chat; give the player block its full size back
  var lastDisplay = chat.style.display;
  new MutationObserver(function () {
    if (chat.style.display === lastDisplay) return;
    lastDisplay = chat.style.display;
    if (lastDisplay === "none") {
      shrinkable.forEach(function (el) { el.style.zoom = ""; });
    } else {
      // the player block's margins animate (0.3s) while the console reopens, so
      // measure again once things have settled
      restore();
      requestAnimationFrame(restore);
      setTimeout(restore, 350);
    }
  }).observe(chat, { attributes: true, attributeFilter: ["style"] });

  restore();
  window.addEventListener("resize", restore);
})();
