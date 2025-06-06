let currentSkin = { left: null, right: null };

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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

function createSeamlessWaveGrid(isDark, width, height, waveScale = 1, amplitude = 20, smoothness = 1) {
  const linesCountBase = 15;
  const pointsCountBase = 60;
  const strokeColor = isDark ? "rgba(0,255,255,0.15)" : "rgba(0,150,255,0.12)";
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
  const width = 300;
  const height = 300;

  const bigShapes = Math.random() < 0.4;
  const numShapes = bigShapes ? Math.floor(randomBetween(4, 8)) : Math.floor(randomBetween(16, 28));
  const pixelMode = Math.random() < 0.25;
  const lineGridMode = Math.random() < 0.3;

  if (lineGridMode) {
    const waveScale = randomBetween(1, 7);
    const amplitude = randomBetween(10, 40);
    const smoothness = randomBetween(0, 1);
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

function generateLeftPanelStyle(isDark) {
  const [c1, c2] = generateGradientColors(isDark, 'left');
  const angle = 180;
  const patternDataUrl = `url("data:image/svg+xml,${createSeamlessSvgPattern(isDark, 'left')}")`;
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

export async function handleSkinsCommand(addMessage) {
  addMessage("bot", "🎨 Generating new complex backgrounds...");
  const isDark = document.body.classList.contains("dark");
  const leftStyle = generateLeftPanelStyle(isDark);
  const rightStyle = generateRightPanelStyle(isDark);
  applySkinStyles(leftStyle, rightStyle, isDark);
  addMessage("bot", "✅ Background updated with lines, shapes and gradients.");
}

export function reapplySkin() {
  if (!currentSkin.left || !currentSkin.right) return;
  const isDark = document.body.classList.contains("dark");
  applySkinStyles(currentSkin.left, currentSkin.right, isDark);
}
