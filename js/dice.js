// Random-station dice button: hover/click "throw" animation with randomized pips.
const SVG_NS = "http://www.w3.org/2000/svg";
const ANCHOR_Y = 6.32935;
const DIE_DELAYS = [0, 70, 140]; // ms, must match .dice-btn.is-rolling .die animation-delay in CSS
const DIE_ROLL_DURATION = 750; // ms, must match .dice-btn.is-rolling .die animation-duration in CSS
const ROLL_DURATION = Math.max(...DIE_DELAYS) + DIE_ROLL_DURATION + 100;
const BOUNCE_DURATION = 700;

// Relative dot layouts (offsets from a die's own top-face anchor), reused
// verbatim from the three hand-drawn dice faces in the original artwork so
// every rolled combination stays pixel-accurate to the source design.
const TEMPLATES = [
  [
    { role: "main", m: [-0.866025, 0.5, 0, 1], rx: 4.9681, ry: 10.26895, r: 0.933536 },
    { role: "main", m: [-0.866025, 0.5, 0, 1], rx: 7.3019, ry: 11.43565, r: 0.933536 },
    { role: "main", m: [-0.866025, 0.5, 0, 1], rx: 2.6342, ry: 9.10195, r: 0.933536 },
    { role: "main", m: [-0.866025, 0.5, 0, 1], rx: 7.0685, ry: 6.76805, r: 0.933536 },
    { role: "main", m: [-0.866025, 0.5, 0, 1], rx: 2.6342, ry: 14.23635, r: 0.933536 },
    { role: "accent", m: [0.866025, 0.5, 0, 1], rx: -5.2841, ry: 9.56855, r: 1.4003 },
    { role: "top", m: [0.866025, 0.5, -0.866025, 0.5], rx: -4.8341, ry: 3.73415, r: 0.933536 },
    { role: "top", m: [0.866025, 0.5, -0.866025, 0.5], rx: 0.0669, ry: 3.73415, r: 0.933536 },
    { role: "top", m: [0.866025, 0.5, -0.866025, 0.5], rx: 4.7347, ry: 3.73415, r: 0.933536 },
  ],
  [
    { role: "main", m: [0.866025, 0.5, 0, 1], rx: -2.4834, ry: 14.46985, r: 0.933536 },
    { role: "main", m: [0.866025, 0.5, 0, 1], rx: -7.6178, ry: 11.43565, r: 0.933536 },
    { role: "main", m: [0.866025, 0.5, 0, 1], rx: -2.4834, ry: 11.90255, r: 0.933536 },
    { role: "main", m: [0.866025, 0.5, 0, 1], rx: -7.6178, ry: 8.86855, r: 0.933536 },
    { role: "main", m: [0.866025, 0.5, 0, 1], rx: -2.25, ry: 9.33535, r: 0.933536 },
    { role: "main", m: [0.866025, 0.5, 0, 1], rx: -7.3844, ry: 6.30125, r: 0.933536 },
    { role: "accent", m: [0.866025, -0.5, 0, 1], rx: 0.9632, ry: 10.17495, r: 0.933535 },
    { role: "accent", m: [0.866025, -0.5, 0, 1], rx: 5.6851, ry: 7.23475, r: 0.933535 },
    { role: "accent", m: [0.866025, -0.5, 0, 1], rx: 1.4841, ry: 14.93655, r: 0.933535 },
    { role: "accent", m: [0.866025, -0.5, 0, 1], rx: 5.4517, ry: 12.60265, r: 0.933535 },
    { role: "top", m: [0.866025, 0.5, -0.866025, 0.5], rx: -3.9005, ry: 3.73415, r: 0.933536 },
    { role: "top", m: [0.866025, 0.5, -0.866025, 0.5], rx: 3.5678, ry: 3.73415, r: 0.933536 },
  ],
  [
    { role: "main", m: [0.866025, 0.5, 0, 1], rx: -5.0507, ry: 10.26895, r: 0.933536 },
    { role: "main", m: [0.866025, 0.5, 0, 1], rx: -7.3846, ry: 11.43565, r: 0.933536 },
    { role: "main", m: [0.866025, 0.5, 0, 1], rx: -2.7169, ry: 9.10195, r: 0.933536 },
    { role: "main", m: [0.866025, 0.5, 0, 1], rx: -7.1512, ry: 6.76805, r: 0.933536 },
    { role: "main", m: [0.866025, 0.5, 0, 1], rx: -2.7169, ry: 14.23635, r: 0.933536 },
    { role: "accent", m: [0.866025, -0.5, 0, 1], rx: 0.9631, ry: 10.17505, r: 0.933535 },
    { role: "accent", m: [0.866025, -0.5, 0, 1], rx: 3.1177, ry: 11.43565, r: 0.933535 },
    { role: "accent", m: [0.866025, -0.5, 0, 1], rx: 5.4516, ry: 12.60265, r: 0.933535 },
    { role: "top", m: [0.866025, 0.5, -0.866025, 0.5], rx: 0.0212, ry: 3.03393, r: 1.40032 },
  ],
];

function renderDie(dieEl, templateIndex) {
  const dieIndex = dieEl.dataset.die;
  const anchorX = parseFloat(dieEl.dataset.anchorX);
  const dotsGroup = dieEl.querySelector(".dots");
  dotsGroup.textContent = "";
  for (const dot of TEMPLATES[templateIndex]) {
    const circle = document.createElementNS(SVG_NS, "circle");
    const [a, b, c, d] = dot.m;
    circle.setAttribute("cx", dot.r);
    circle.setAttribute("cy", dot.r);
    circle.setAttribute("r", dot.r);
    circle.setAttribute(
      "transform",
      `matrix(${a} ${b} ${c} ${d} ${anchorX + dot.rx} ${ANCHOR_Y + dot.ry})`
    );
    circle.setAttribute("class", `dot dot-${dot.role}`);
    circle.style.fill = `var(--die${dieIndex}-pip-${dot.role})`;
    dotsGroup.appendChild(circle);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("randomBtn");
  if (!root) return;
  const dice = Array.from(root.querySelectorAll(".die"));

  dice.forEach((die) => renderDie(die, Number(die.dataset.die)));

  let swapTimeouts = [];
  let stopTimeout = null;
  let bounceTimeout = null;

  function stopBounce() {
    clearTimeout(bounceTimeout);
    root.classList.remove("is-bouncing");
  }

  function bounceDice() {
    swapTimeouts.forEach(clearTimeout);
    swapTimeouts = [];
    clearTimeout(stopTimeout);
    root.classList.remove("is-rolling");
    stopBounce();
    void root.offsetWidth;
    root.classList.add("is-bouncing");
    bounceTimeout = setTimeout(stopBounce, BOUNCE_DURATION);
  }

  function rollDice() {
    stopBounce();
    swapTimeouts.forEach(clearTimeout);
    swapTimeouts = [];
    clearTimeout(stopTimeout);
    root.classList.remove("is-rolling");
    void root.offsetWidth;
    root.classList.add("is-rolling");

    // Swap each die's pips once, timed to land in the middle of that die's
    // own fade-out dip so the change is hidden instead of flickering.
    dice.forEach((die, i) => {
      const delay = DIE_DELAYS[i] ?? 0;
      const swapAt = delay + DIE_ROLL_DURATION * 0.4;
      swapTimeouts.push(
        setTimeout(() => {
          renderDie(die, Math.floor(Math.random() * TEMPLATES.length));
        }, swapAt)
      );
    });

    stopTimeout = setTimeout(() => {
      root.classList.remove("is-rolling");
    }, ROLL_DURATION);
  }

  root.addEventListener("pointerenter", bounceDice);
  root.addEventListener("click", rollDice);
});
