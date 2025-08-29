let EMOJI = {
  player: "🤠",
  unknown: "⬜",
  flag: "🚩",
  revealed: "⬛",
  scroll: "📜",
  potion: "🧪",
  sword: "🗡️",
  shield: "🛡️",
  door: "🚪",
  enemy: "👾",
  heart: "❤️"
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random()*arr.length)];
}

export default async function(container, { state, onState, onExit }) {
  container.innerHTML = "";
  container.style.display = "flex";
  container.style.flexDirection = "row";
  container.style.alignItems = "stretch";
  container.style.height = "100%";
  container.style.width = "100%";

  let levelData = await import('./level1.js').then(m => m.default());
  let width = levelData.width;
  let height = levelData.height;
  let objects = [...levelData.objects];
  let player = { ...levelData.player, hp: 3, maxHp: 3, score: 0, inv: [], alive: true, win: false };
  let revealed = [];
  let flagged = [];
  let log = [];
  let running = true;
  let combat = null;

  for(let y=0;y<height;y++) {
    revealed[y]=[];
    flagged[y]=[];
    for(let x=0;x<width;x++) {
      revealed[y][x]=0;
      flagged[y][x]=0;
    }
  }

  const cellSize = Math.floor(Math.min(
    (container.clientWidth*0.66-30) / width,
    (container.clientHeight*0.98-30) / height,
    44
  ));

  const gameWrap = document.createElement('div');
  gameWrap.style.flex = "0 1 66%";
  gameWrap.style.display = "flex";
  gameWrap.style.alignItems = "center";
  gameWrap.style.justifyContent = "center";
  gameWrap.style.height = "100%";
  gameWrap.style.overflow = "auto";
  container.appendChild(gameWrap);

  const sidePanel = document.createElement('div');
  sidePanel.style.flex = "0 1 34%";
  sidePanel.style.display = "flex";
  sidePanel.style.flexDirection = "column";
  sidePanel.style.justifyContent = "flex-start";
  sidePanel.style.padding = "14px 12px 0 16px";
  sidePanel.style.background = "#181f2b";
  sidePanel.style.color = "#00f2b8";
  sidePanel.style.fontFamily = "monospace, monospace";
  sidePanel.style.fontSize = "13px";
  sidePanel.style.height = "100%";
  sidePanel.style.overflow = "auto";
  container.appendChild(sidePanel);

  const fieldDiv = document.createElement('div');
  fieldDiv.style.display = "grid";
  fieldDiv.style.gridTemplateColumns = `repeat(${width},${cellSize}px)`;
  fieldDiv.style.gridTemplateRows = `repeat(${height},${cellSize}px)`;
  fieldDiv.style.background = "#232941";
  fieldDiv.style.gap = "1px";
  fieldDiv.style.boxSizing = "border-box";
  fieldDiv.style.padding = "5px";
  fieldDiv.style.borderRadius = "14px";
  fieldDiv.style.boxShadow = "0 6px 24px #0006";
  fieldDiv.style.overflow = "auto";
  fieldDiv.style.maxWidth = (cellSize*width+12)+"px";
  fieldDiv.style.maxHeight = (cellSize*height+12)+"px";
  gameWrap.appendChild(fieldDiv);

  function objAt(x, y, type) {
    let idx = objects.findIndex(o=>o.x===x&&o.y===y&&(type?o.type===type:true));
    if(idx>=0) return {idx, ...objects[idx]};
    return null;
  }

  function removeObjAt(x, y, type) {
    let idx = objects.findIndex(o=>o.x===x&&o.y===y&&(type?o.type===type:true));
    if(idx>=0) objects.splice(idx,1);
  }

  function showCombat(enemyIdx) {
    combat = {
      enemyHp: 1,
      choices: ["rock", "paper", "scissors"],
      enemyIdx,
      message: "Choose: rock, paper, or scissors!"
    };
    draw();
  }

  function resolveCombat(playerMove) {
    let enemyMove = randomChoice(combat.choices);
    let result = null;
    if(playerMove === enemyMove) result = "draw";
    else if(
      (playerMove==="rock" && enemyMove==="scissors") ||
      (playerMove==="scissors" && enemyMove==="paper") ||
      (playerMove==="paper" && enemyMove==="rock")
    ) result = "win";
    else result = "lose";

    let msg = `You: ${playerMove} vs Enemy: ${enemyMove} — `;
    if(result==="draw") {
      combat.message = msg + "It's a draw! Again!";
      draw();
      setTimeout(()=>{draw();},400);
      return;
    }
    if(result==="win") {
      combat.message = msg + "You win!";
      player.score += 7;
      objects.splice(combat.enemyIdx, 1);
      combat = null;
      log.push("Enemy defeated! +7 score");
    }
    if(result==="lose") {
      combat.message = msg + "You lose!";
      player.hp -= 1;
      log.push("You took damage! -1 hp");
      if(player.hp <= 0) {
        player.hp = 0;
        player.alive = false;
        running = false;
        log.push("You died!");
        setTimeout(()=>restartGame(),800);
      }
      combat = null;
    }
    setTimeout(()=>draw(), 600);
  }

  function restartGame() {
    import('./start.js').then(start=>{
      if(onExit) onExit();
    });
  }

  function draw() {
    fieldDiv.innerHTML = "";
    for(let y=0;y<height;y++) {
      for(let x=0;x<width;x++) {
        let cell = document.createElement('div');
        cell.style.width = cellSize+"px";
        cell.style.height = cellSize+"px";
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        cell.style.fontSize = Math.floor(cellSize*0.74)+"px";
        cell.style.fontFamily = "monospace";
        cell.style.background = revealed[y][x] ? "#252a3c" : "#192030";
        cell.style.cursor = running ? "pointer" : "default";
        cell.style.borderRadius = "7px";
        cell.style.userSelect = "none";
        cell.title = x+","+y;

        let object = objAt(x,y);
        if(player.x===x && player.y===y && player.alive && !player.win && !combat) cell.textContent = EMOJI.player;
        else if(flagged[y][x]) cell.textContent = EMOJI.flag;
        else if(revealed[y][x]) {
          if(object) {
            if(object.type==="enemy") cell.textContent = EMOJI.enemy;
            if(object.type==="scroll") cell.textContent = EMOJI.scroll;
            if(object.type==="potion") cell.textContent = EMOJI.potion;
            if(object.type==="sword") cell.textContent = EMOJI.sword;
            if(object.type==="shield") cell.textContent = EMOJI.shield;
            if(object.type==="heart") cell.textContent = EMOJI.heart;
            if(object.type==="door") cell.textContent = EMOJI.door;
          } else cell.textContent = EMOJI.revealed;
        }
        else cell.textContent = EMOJI.unknown;

        cell.onclick = function(e) {
          if(!running) return;
          if(combat) return;
          // only left click action
          if(e.button !== 0) return;
          // movement: only to opened neighbor cell or opening
          if(Math.abs(player.x-x)+Math.abs(player.y-y)===1) {
            if(revealed[y][x]) {
              player.x = x; player.y = y;
              let object = objAt(x, y);
              if(object && object.type==="enemy") {
                showCombat(objAt(x,y,"enemy").idx);
                return;
              }
              if(object && object.type==="scroll") {
                player.score += 5;
                log.push("Found scroll! +5 score");
                removeObjAt(x, y, "scroll");
              }
              if(object && object.type==="potion") {
                player.hp = Math.min(player.hp+1, player.maxHp);
                log.push("Drank potion! +1 hp");
                removeObjAt(x, y, "potion");
              }
              if(object && object.type==="heart") {
                player.maxHp += 1;
                player.hp += 1;
                log.push("Max HP up! +1");
                removeObjAt(x, y, "heart");
              }
              if(object && object.type==="sword") {
                player.inv.push("🗡️");
                log.push("You found a sword!");
                removeObjAt(x, y, "sword");
              }
              if(object && object.type==="shield") {
                player.inv.push("🛡️");
                log.push("You found a shield!");
                removeObjAt(x, y, "shield");
              }
              if(object && object.type==="door") {
                player.win = true;
                running = false;
                log.push("You win! To restart, reload.");
                draw();
                return;
              }
              draw();
              return;
            }
          }
          // open
          if(!revealed[y][x] && !flagged[y][x]) {
            revealed[y][x] = 1;
            player.score += 1;
            if(objAt(x,y,"enemy")) {
              showCombat(objAt(x,y,"enemy").idx);
              return;
            }
            if(objAt(x,y,"scroll")) {
              player.score += 5;
              log.push("Found scroll! +5 score");
              removeObjAt(x, y, "scroll");
            }
            if(objAt(x,y,"potion")) {
              player.hp = Math.min(player.hp+1, player.maxHp);
              log.push("Drank potion! +1 hp");
              removeObjAt(x, y, "potion");
            }
            if(objAt(x,y,"heart")) {
              player.maxHp += 1;
              player.hp += 1;
              log.push("Max HP up! +1");
              removeObjAt(x, y, "heart");
            }
            if(objAt(x,y,"sword")) {
              player.inv.push("🗡️");
              log.push("You found a sword!");
              removeObjAt(x, y, "sword");
            }
            if(objAt(x,y,"shield")) {
              player.inv.push("🛡️");
              log.push("You found a shield!");
              removeObjAt(x, y, "shield");
            }
            if(objAt(x,y,"door")) {
              player.win = true;
              running = false;
              log.push("You win! To restart, reload.");
              draw();
              return;
            }
            draw();
          }
        }
        fieldDiv.appendChild(cell);
      }
    }

    let stats = `<div style="font-size:18px;letter-spacing:1px;margin-bottom:6px;">
    <b>FONY RPG-MINEROGUE</b></div>
    <div style="margin-bottom:7px;"><b>HP:</b> ${"❤️".repeat(player.hp)} / ${player.maxHp} &nbsp; <b>Score:</b> ${player.score}</div>
    <div style="margin-bottom:8px;">${player.inv.length?"Inventory: "+player.inv.join(" "):""}</div>
    <div style="margin-bottom:10px;"><b>Controls:</b> <span style="color:#fff;">LMB</span> open/move, <span style="color:#fff;">Restart on death: auto</span></div>
    <div style="color:#fff;font-size:12px;margin-bottom:6px;">${log.length ? log.slice(-4).join("<br>") : ""}</div>
    <div style="font-size:13px;opacity:.55;margin-top:12px;">
      ${EMOJI.unknown} unknown &nbsp; ${EMOJI.enemy} enemy &nbsp; ${EMOJI.door} exit
    </div>
    `;

    if(combat) {
      stats += `<div style="font-size:17px;margin-top:14px;">
        <b>Combat!</b> <br>
        <span style="color:#ff8;">${combat.message}</span><br>
        <button style="margin:7px 5px 0 0;font-size:15px;cursor:pointer;" onclick="window.__cbt('rock')">🪨 Rock</button>
        <button style="margin:7px 5px 0 0;font-size:15px;cursor:pointer;" onclick="window.__cbt('paper')">📄 Paper</button>
        <button style="margin:7px 0 0 0;font-size:15px;cursor:pointer;" onclick="window.__cbt('scissors')">✂️ Scissors</button>
      </div>`;
      window.__cbt = (move)=>{
        resolveCombat(move);
      }
    }
    sidePanel.innerHTML = stats;
  }

  draw();

  const obs = new ResizeObserver(()=>{
    draw();
  });
  obs.observe(container);
}
