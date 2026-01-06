let currentSkin = { left: null, right: null };

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const asciiArtVariants = [
  `_.~"(_.~"(_.~"(_.~"(_.~"(`,
  `(^_^) [o_o] (^.^) (".") ($.$) `,
  `_.~"~._.~"~._.~"~._.~"~._`,
  `*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~*~`,
  `-=- -=- -=- -=- -=- -=- -=- -=-`,
  `-=-=-=- -=-=-=- -=-=-=- -=-=-=-`,
  `<$><$><$><$><$><$><$><$><$><$>`,
  `₿ ₿ ₿ ₿ ₿ ₿ ₿ ₿ ₿ ₿ ₿ ₿ ₿ ₿ `,
  `FONY FONY FONY FONY FONY FONY FONY FONY `,
  `* * * * * * * * * * * * * * * `,
];

function createAsciiArtSvgPattern() {
  const art = randomChoice(asciiArtVariants);
  const repeats = 8; 
  const repeatedArt = art.repeat(repeats);
  const fontSize = 14 + Math.floor(randomBetween(0, 14));
  const color = randomChoice([
    "#00F2B8", "#5587e4", "#d68255", "#ec7b2a", "#C36C8B", "#55cbd8", "#eee", "#171C2B"
  ]);
  const charWidth = fontSize * 1; 
  const svgWidth = repeatedArt.length * charWidth;
  const svgHeight = fontSize * 1.5;
  const svg = `
<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="
      font-family: monospace;
      font-size: ${fontSize}px;
      color: ${color};
      white-space: nowrap;
      line-height: 1;
      opacity: 0.25;
      width: 100%;
      height: 100%;
      overflow: visible;
    ">
      <pre style="margin:0; padding:0;">${repeatedArt}</pre>
    </div>
  </foreignObject>
</svg>
`;
  return encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
}

function generateGradientColors(isDark, panel) {
  const brandColors = [
    "rgba(0,242,184,1)",
    "rgba(23,28,43,1)",
    "rgba(85,135,228,1)",
    "rgba(214,130,85,1)",
    "rgba(236,123,42,1)",
    "rgba(195,108,139,1)",
    "rgba(85,203,216,1)",
    "rgba(255,255,255,1)"
  ];
  function pickTwoColors(arr) {
    const copy = [...arr];
    const first = copy.splice(Math.floor(Math.random() * copy.length), 1)[0];
    const second = copy[Math.floor(Math.random() * copy.length)];
    return [first, second];
  }
  if (isDark) {
    if (panel === 'right') {
      const rightPanelColorsDark = [
        "rgba(0,242,184,0.18)",
        "rgba(85,135,228,0.26)",
        "rgba(214,130,85,0.14)",
        "rgba(23,28,43,0.18)",
        "rgba(195,108,139,0.13)"
      ];
      return pickTwoColors(rightPanelColorsDark);
    }
    return [
      `rgba(23,28,43,0.95)`,
      `rgba(85,203,216,0.22)`
    ];
  } else {
    if (panel === 'right') {
      const rightPanelColorsLight = [
        "rgba(85,135,228,0.85)",
        "rgba(214,130,85,0.75)",
        "rgba(195,108,139,0.8)",
        "rgba(85,203,216,0.8)",
        "rgba(236,123,42,0.8)"
      ];
      return pickTwoColors(rightPanelColorsLight);
    }
    return [
      `rgba(255,255,255,0.93)`,
      `rgba(85,203,216,0.19)`
    ];
  }
}

function createSeamlessWaveGrid(isDark, width, height, waveScale = 1, amplitude = 20, smoothness = 21) {
  const linesCountBase = 15;
  const pointsCountBase = 60;
  const strokeColor = isDark ? "rgba(0,255,255,0.25)" : "rgba(0,150,255,0.22)";
  const strokeWidth = 1;
  const horizontalScale = waveScale;
  const verticalSpacingScale = waveScale;
  const linesCount = linesCountBase;
  const pointsCount = pointsCountBase;
  const scaledHeight = height * verticalSpacingScale;
  function generateWaveOffsets() {
    let offsets = [];
    for (let i = 0; i < pointsCount; i++) {
      offsets.push(randomBetween(-amplitude, amplitude));
    }
    offsets[pointsCount - 1] = offsets[0];
    return offsets;
  }
  let paths = [];
  let firstLineOffsets = null;
  for (let i = 0; i < linesCount; i++) {
    let pathPoints = [];
    const baseYOffset = (scaledHeight / (linesCount - 1)) * i;
    const waveOffsets = generateWaveOffsets();
    if (i === 0) {
      firstLineOffsets = waveOffsets;
    } else if (i === linesCount - 1 && firstLineOffsets) {
      for (let k = 0; k < pointsCount; k++) {
        waveOffsets[k] = firstLineOffsets[k];
      }
    }
    for (let j = 0; j < pointsCount; j++) {
      const x = (width / (pointsCount - 1)) * j * horizontalScale;
      const baseY = baseYOffset;
      let offset;
      if (smoothness >= 1) {
        if (j === pointsCount - 1) {
          offset = waveOffsets[j];
        } else {
          const t = Math.random();
          offset = waveOffsets[j] * (1 - t) + waveOffsets[j + 1] * t;
        }
      } else if (smoothness <= 0) {
        offset = waveOffsets[j];
      } else {
        if (j === pointsCount - 1) {
          offset = waveOffsets[j];
        } else {
          const t = Math.random();
          const interp = waveOffsets[j] * (1 - t) + waveOffsets[j + 1] * t;
          offset = interp * smoothness + waveOffsets[j] * (1 - smoothness);
        }
      }
      const y = baseY + offset * waveScale;
      pathPoints.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    paths.push(`<polyline points="${pathPoints.join(" ")}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`);
  }
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width * horizontalScale} ${scaledHeight}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      ${paths.join("\n")}
    </svg>
  `;
}

function createSeamlessSvgPattern(isDark, panel) {
  const shapes = [];
  const colorsLight = [
    "rgba(0,242,184,0.12)",
    "rgba(85,135,228,0.10)",
    "rgba(236,123,42,0.13)",
    "rgba(214,130,85,0.10)",
    "rgba(195,108,139,0.09)",
    "rgba(85,203,216,0.10)",
    "rgba(255,255,255,0.10)"
  ];
  const colorsDark = [
    "rgba(0,242,184,0.23)",
    "rgba(85,135,228,0.13)",
    "rgba(236,123,42,0.15)",
    "rgba(23,28,43,0.18)",
    "rgba(214,130,85,0.14)",
    "rgba(195,108,139,0.13)",
    "rgba(85,203,216,0.13)"
  ];
  const colors = isDark ? colorsDark : colorsLight;
  const width = 320;
  const height = 320;
  const bigShapes = Math.random() < 0.4;
  const numShapes = bigShapes ? Math.floor(randomBetween(4, 8)) : Math.floor(randomBetween(16, 28));
  const pixelMode = Math.random() < 0.25;
  const lineGridMode = Math.random() < 0.3;
  if (lineGridMode) {
    const waveScale = randomBetween(1, 7);
    const amplitude = randomBetween(3, 10);
    const smoothness = randomBetween(0, 441);
    const svgGrid = createSeamlessWaveGrid(isDark, width, height, waveScale, amplitude, smoothness);
    return encodeURIComponent(svgGrid).replace(/'/g, "%27").replace(/"/g, "%22");
  } else if (pixelMode) {
    for (let i = 0; i < Math.floor(randomBetween(50, 120)); i++) {
      let x = randomBetween(0, width);
      let y = randomBetween(0, height);
      const pixelSize = bigShapes ? randomBetween(8, 36) : randomBetween(2, 9);
      const pixelColor = randomChoice(colors);
      const duplicates = [
        { dx: 0, dy: 0 },
        { dx: -width, dy: 0 },
        { dx: width, dy: 0 },
        { dx: 0, dy: -height },
        { dx: 0, dy: height },
        { dx: -width, dy: -height },
        { dx: width, dy: -height },
        { dx: -width, dy: height },
        { dx: width, dy: height },
      ];
      duplicates.forEach(({ dx, dy }) => {
        const nx = x + dx;
        const ny = y + dy;
        if (Math.random() < 0.6) {
          shapes.push(`<rect x="${nx}" y="${ny}" width="${pixelSize}" height="${pixelSize}" fill="${pixelColor}" rx="1" ry="1"/>`);
        } else {
          shapes.push(`<circle cx="${nx + pixelSize / 2}" cy="${ny + pixelSize / 2}" r="${pixelSize / 2}" fill="${pixelColor}"/>`);
        }
      });
    }
  } else {
    for (let i = 0; i < numShapes; i++) {
      const shapeType = randomChoice(["circle", "cross", "square", "triangle"]);
      const color = randomChoice(colors);
      const strokeWidth = randomBetween(0.7, 2).toFixed(2);
      const cx = randomBetween(20, width - 20);
      const cy = randomBetween(20, height - 20);
      const size = bigShapes ? randomBetween(50, 300) : randomBetween(10, 60);
      const duplicates = [
        { dx: 0, dy: 0 },
        { dx: -width, dy: 0 },
        { dx: width, dy: 0 },
        { dx: 0, dy: -height },
        { dx: 0, dy: height },
        { dx: -width, dy: -height },
        { dx: width, dy: -height },
        { dx: -width, dy: height },
        { dx: width, dy: height },
      ];
      duplicates.forEach(({ dx, dy }) => {
        const nx = cx + dx;
        const ny = cy + dy;
        let shape = "";
        switch (shapeType) {
          case "circle":
            shape = `<circle cx="${nx}" cy="${ny}" r="${size / 2}" stroke="${color}" stroke-width="${strokeWidth}" fill="none"/>`;
            break;
          case "cross":
            const offset = size / 2;
            shape = `
              <line x1="${nx - offset}" y1="${ny - offset}" x2="${nx + offset}" y2="${ny + offset}" stroke="${color}" stroke-width="${strokeWidth}" />
              <line x1="${nx - offset}" y1="${ny + offset}" x2="${nx + offset}" y2="${ny - offset}" stroke="${color}" stroke-width="${strokeWidth}" />
            `;
            break;
          case "square":
            const half = size / 2;
            shape = `<rect x="${nx - half}" y="${ny - half}" width="${size}" height="${size}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" />`;
            break;
          case "triangle":
            const heightTri = size * Math.sqrt(3) / 2;
            const points = [
              `${nx},${ny - (2 / 3) * heightTri}`,
              `${nx - size / 2},${ny + heightTri / 3}`,
              `${nx + size / 2},${ny + heightTri / 3}`
            ].join(" ");
            shape = `<polygon points="${points}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" />`;
            break;
        }
        shapes.push(shape);
      });
    }
  }
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" fill="none" preserveAspectRatio="xMidYMid meet" >
      ${shapes.join("\n")}
    </svg>`;
  return encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
}

function createRandomPattern(isDark) {
  const rnd = Math.random();
  if (rnd < 0.33) {
    const waveScale = randomBetween(1, 7);
    const amplitude = randomBetween(3, 10);
    const smoothness = randomBetween(0, 441);
    const svgGrid = createSeamlessWaveGrid(isDark, 320, 320, waveScale, amplitude, smoothness);
    return encodeURIComponent(svgGrid).replace(/'/g, "%27").replace(/"/g, "%22");
  } else if (rnd < 0.66) {
    return createSeamlessSvgPattern(isDark, 'left');
  } else {
    return createAsciiArtSvgPattern();
  }
}

function generateLeftPanelStyle(isDark) {
  const [c1, c2] = generateGradientColors(isDark, 'left');
  const angle = 180;
  const patternDataUrl = `url("data:image/svg+xml,${createRandomPattern(isDark)}")`;
  return `
    linear-gradient(${angle}deg, ${c1}, ${c2}),
    radial-gradient(circle at 22% 28%, rgba(0, 242, 184, ${isDark ? 0.12 : 0.09}), transparent 74%),
    radial-gradient(circle at 82% 78%, rgba(85, 135, 228, ${isDark ? 0.08 : 0.13}), transparent 62%),
    ${patternDataUrl}
  `;
}

function generateRightPanelStyle(isDark) {
  const [c1, c2] = generateGradientColors(isDark, 'right');
  const angle = 180;
  return `
    linear-gradient(${angle}deg, ${c1}, ${c2}),
    radial-gradient(circle at 54% 60%, rgba(214, 130, 85, ${isDark ? 0.09 : 0.22}), transparent 80%),
    radial-gradient(circle at 85% 15%, rgba(236, 123, 42, ${isDark ? 0.11 : 0.12}), transparent 64%)
  `;
}

function applySkinStyles(leftStyle, rightStyle, isDark) {
  const leftPanel = document.querySelector(".left-panel");
  const rightPanel = document.querySelector(".right-panel");
  if (!leftPanel || !rightPanel) return;
  leftPanel.style.background = leftStyle.trim();
  leftPanel.style.color = isDark ? "#eee" : "#222";
  leftPanel.style.transition = "background 1s ease";
  leftPanel.style.backgroundColor = isDark ? "#171C2B" : "#fff";
  rightPanel.style.background = rightStyle.trim();
  rightPanel.style.color = isDark ? "#eee" : "#222";
  rightPanel.style.transition = "background 1s ease";
  rightPanel.style.backgroundColor = isDark ? "#232840" : "#f2f2f2";
  currentSkin.left = leftStyle;
  currentSkin.right = rightStyle;
}

function saveSkinToStorage() {
  localStorage.setItem("savedSkin", JSON.stringify(currentSkin));
  localStorage.setItem("skinTheme", document.body.classList.contains('dark') ? "dark" : "light");
}

function loadSkinFromStorage() {
  try {
    const saved = localStorage.getItem("savedSkin");
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function clearSavedSkin() {
  localStorage.removeItem("savedSkin");
  localStorage.removeItem("skinTheme");
}

function applyDefaultThemePanels() {
  const leftPanel = document.querySelector(".left-panel");
  const rightPanel = document.querySelector(".right-panel");
  const container = document.querySelector(".container");
  if (!leftPanel || !rightPanel || !container) return;
  const isDark = document.body.classList.contains("dark");
  if (isDark) {
    leftPanel.style.backgroundColor = "#171C2B";
    rightPanel.style.background = "linear-gradient(135deg, hsl(165, 94%, 30%) 0%, hsl(165, 94%, 49%) 50%, hsl(165, 94%, 70%) 100%)";
    leftPanel.style.color = "#eee";
    rightPanel.style.color = "#eee";
  } else {
    leftPanel.style.backgroundColor = "#f2f2f2";
    rightPanel.style.background = "linear-gradient(135deg, #5587e4 0%, #d68255 20%, #ec7b2a 40%, #4b85ea 60%, #C36C8B 80%, #55cbd8 100%)";
    leftPanel.style.color = "#222";
    rightPanel.style.color = "#222";
  }
  container.style.background = "";
  currentSkin = { left: null, right: null };
  saveSkinToStorage();
}

export async function handleSkinsCommand(addMessage) {
  const isDark = document.body.classList.contains("dark");
  const leftStyle = generateLeftPanelStyle(isDark);
  const rightStyle = generateRightPanelStyle(isDark);
  applySkinStyles(leftStyle, rightStyle, isDark);
  const existingContainer = document.getElementById("skinButtonsContainer");
  if (existingContainer) existingContainer.remove();
  const buttons = `
    <div id="skinButtonsContainer" style="display: flex; align-items: center; gap: 8px;">
      <button id="saveSkinBtn" style="cursor:pointer; background:none; border:none; color:#00F2B8; text-decoration:underline; padding:0;">save current skin</button>
      <span style="color:#00F2B8;">|</span>
      <button id="generateNewSkinBtn" style="cursor:pointer; background:none; border:none; color:#00F2B8; text-decoration:underline; padding:0;">generate new</button>
      <span style="color:#00F2B8;">|</span>
      <button id="resetSkinBtn" style="cursor:pointer; background:none; border:none; color:#00F2B8; text-decoration:underline; padding:0;">reset</button>
    </div>
  `;
  addMessage("bot", "Skin updated.<br><br>" + buttons);
  setTimeout(() => {
    const saveEl = document.getElementById("saveSkinBtn");
    if (saveEl) {
      saveEl.onclick = (e) => {
        e.preventDefault();
        saveSkinToStorage();
        addMessage("bot", "Skin saved!");
      };
    }
    const generateEl = document.getElementById("generateNewSkinBtn");
    if (generateEl) {
      generateEl.onclick = (e) => {
        e.preventDefault();
        handleSkinsCommand(addMessage);
      };
    }
    const resetEl = document.getElementById("resetSkinBtn");
    if (resetEl) {
      resetEl.onclick = (e) => {
        e.preventDefault();
        applyDefaultThemePanels();
        addMessage("bot", "Skin reset to default!");
      };
    }
  }, 100);
}

export function reapplySkin() {
  const skin = loadSkinFromStorage();
  if (skin && skin.left && skin.right) {
    const isDark = document.body.classList.contains("dark");
    applySkinStyles(skin.left, skin.right, isDark);
  }
}

export function loadSkinAndThemeFromStorage() {
  try {
    const skin = localStorage.getItem("savedSkin");
    const theme = localStorage.getItem("skinTheme");
    if (!skin || !theme) return null;
    return { skin: JSON.parse(skin), theme };
  } catch {
    return null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const skin = loadSkinFromStorage();
  if (skin && skin.left && skin.right) {
    const isDark = document.body.classList.contains("dark");
    applySkinStyles(skin.left, skin.right, isDark);
  }
});

document.addEventListener("themeChanged", () => {
  const skin = loadSkinFromStorage();
  if (skin && skin.left && skin.right) {
    const isDark = document.body.classList.contains("dark");
    applySkinStyles(skin.left, skin.right, isDark);
  } else {
    applyDefaultThemePanels();
  }
});

function clearSkinStyles() {
  const leftPanel = document.querySelector(".left-panel");
  const rightPanel = document.querySelector(".right-panel");
  if (leftPanel) {
    leftPanel.style.background = "";
    leftPanel.style.backgroundColor = "";
    leftPanel.style.color = "";
    leftPanel.style.transition = "";
  }
  if (rightPanel) {
    rightPanel.style.background = "";
    rightPanel.style.backgroundColor = "";
    rightPanel.style.color = "";
    rightPanel.style.transition = "";
  }
  localStorage.removeItem("savedSkin");
  localStorage.removeItem("skinTheme");
  currentSkin.left = null;
  currentSkin.right = null;
}

export { clearSkinStyles };
