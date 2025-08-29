export default function(container, onSelect, canResume) {
  container.innerHTML = "";

  const style = document.createElement('style');
  style.textContent = `
    #fonyStartMenu {
      width: 100%;
      height: 100%;
      min-height: 350px;
      min-width: 300px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #181f2b;
      color: #00f2b8;
      font-family: monospace, monospace;
      font-size: 22px;
      padding: 36px 0 0 0;
      border-radius: 18px;
      user-select: none;
    }
    .fonyTitle {
      font-size: 44px;
      font-weight: bold;
      letter-spacing: 4px;
      margin-bottom: 38px;
      color: #00f2b8;
      text-shadow: 0 3px 24px #00f2b86e;
      text-align: center;
    }
    .fonyMenuBtn {
      margin: 20px 0;
      background: #0e1433;
      color: #00f2b8;
      border: 2px solid #00f2b8;
      border-radius: 12px;
      font-family: inherit;
      font-size: 22px;
      padding: 10px 40px;
      cursor: pointer;
      transition: background .15s;
      box-shadow: 0 0 8px #000a;
      outline: none;
      width: 220px;
      text-align: center;
    }
    .fonyMenuBtn:active,
    .fonyMenuBtn:focus {
      background: #00f2b8;
      color: #181f2b;
    }
    .fonyExitBtn {
      margin-top: 60px;
      font-size: 18px;
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      text-align: center;
      opacity: .85;
      letter-spacing: 2px;
      outline: none;
      transition: color .2s;
    }
    .fonyExitBtn:hover {
      color: #fff;
    }
  `;
  container.appendChild(style);

  const menu = document.createElement("div");
  menu.id = "fonyStartMenu";

  menu.innerHTML = `
    <div class="fonyTitle">FONY GAME</div>
    <button class="fonyMenuBtn" id="newBtn">NEW GAME</button>
    <button class="fonyMenuBtn" id="resumeBtn" ${canResume ? "" : "style='opacity:.45;pointer-events:none;'"}>RESUME</button>
    <button class="fonyExitBtn" id="exitBtn">EXIT</button>
  `;

  container.appendChild(menu);

  menu.querySelector("#newBtn").onclick = () => { style.remove(); onSelect("new"); };
  menu.querySelector("#resumeBtn").onclick = () => { if(canResume){ style.remove(); onSelect("resume"); } };
  menu.querySelector("#exitBtn").onclick = () => { style.remove(); onSelect("exit"); };
}
