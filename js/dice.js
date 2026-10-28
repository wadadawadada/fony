// Random-station button: a single die that "rolls" to a new face on click.
// The click itself (picking a random station) is handled in main.js.
const SVG_PIP_LAYOUTS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
const ROLL_MS = 650;
const FLICKER_MS = 110;

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("randomBtn");
  if (!root) return;
  const pips = Array.from(root.querySelectorAll(".pip"));
  // start on a random face from 2 to 6 (a lone pip reads as an empty button)
  let value = 2 + Math.floor(Math.random() * 5);
  let timers = [];

  function show(v) {
    value = v;
    const on = SVG_PIP_LAYOUTS[v];
    pips.forEach((pip, i) => pip.classList.toggle("off", !on.includes(i)));
  }

  function other() {
    let v;
    do { v = 1 + Math.floor(Math.random() * 6); } while (v === value);
    return v;
  }

  function roll() {
    timers.forEach(clearTimeout);
    timers = [];
    root.classList.remove("is-rolling");
    void root.offsetWidth; // restart the CSS animation on rapid clicks
    root.classList.add("is-rolling");
    // flicker through faces while the die spins, then settle
    for (let t = FLICKER_MS; t < ROLL_MS - FLICKER_MS; t += FLICKER_MS) {
      timers.push(setTimeout(() => show(other()), t));
    }
    timers.push(setTimeout(() => root.classList.remove("is-rolling"), ROLL_MS));
  }

  show(value);
  root.addEventListener("click", roll);
});
