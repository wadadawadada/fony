document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("cookiesAnswered") === "true") return;

  const css = `
#cookieNotice {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: #171C2B;
  color: #00F2B8;
  padding: 16px;
  font-family: 'Ruda', sans-serif;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 9999;
  box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
}
#cookieNotice button {
  margin-left: 8px;
  padding: 6px 14px;
  background-color: #00F2B8;
  color: #171C2B;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}
`;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const bar = document.createElement("div");
  bar.id = "cookieNotice";
  bar.innerHTML = `
    <span>We use cookies for analytics. Accept?</span>
    <div>
      <button id="cookieAccept">Yes</button>
      <button id="cookieReject">No</button>
    </div>
  `;
  document.body.appendChild(bar);

  document.getElementById("cookieAccept").addEventListener("click", () => {
    localStorage.setItem("cookiesAccepted", "true");
    localStorage.setItem("cookiesAnswered", "true");
    window.analyticsAllowed = true;
    gtag('config', 'G-94X80FV4W3');
    bar.remove();
  });

  document.getElementById("cookieReject").addEventListener("click", () => {
    localStorage.setItem("cookiesAccepted", "false");
    localStorage.setItem("cookiesAnswered", "true");
    bar.remove();
  });
});
