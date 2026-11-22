// Builds the NFT itself: ONE self-contained, square (1:1) HTML player in the FONY style with a playlist.
// The cover fills the whole square; audio and cover are referenced by IPFS CID (with a gateway fallback).

const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.filebase.io/ipfs/", "https://ipfs.io/ipfs/", "https://w3s.link/ipfs/"]

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

// data goes through JSON inside a <script>, so "</script>" and friends cannot break out
const safeJson = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")

const cid = (u) => String(u || "").replace(/^ipfs:\/\//, "")

// release: { title, artist, coverCid|null, tracks: [{ title, artist, audioCid }] }
// previewCover / track.previewAudio (blob URLs) are for the studio preview only
export function buildPlayerHtml(release) {
  const data = {
    title: release.title || "Untitled",
    artist: release.artist || "",
    cover: cid(release.coverCid),
    coverUrl: release.previewCover || "",
    gateways: GATEWAYS,
    tracks: (release.tracks || []).map(t => ({
      title: t.title || "Untitled",
      artist: t.artist || "",
      audio: cid(t.audioCid),
      audioUrl: t.previewAudio || ""
    }))
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%;background:#0b0f1c;color:#fff;font-family:Ruda,system-ui,-apple-system,Segoe UI,sans-serif;overflow:hidden}
#fillbg{position:fixed;inset:-8%;background:#0b0f1c center/cover;filter:blur(34px) brightness(.55) saturate(1.3)}
#stage{position:relative;width:min(100vw,100vh);aspect-ratio:1;margin:0 auto;top:50%;transform:translateY(-50%);overflow:hidden;container-type:size;background:#0e1220}
#art{position:absolute;inset:0;background:#0e1220 center/cover;animation:breathe 32s ease-in-out infinite;will-change:transform}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.16)}}
@media (prefers-reduced-motion:reduce){#art{animation:none}}
#scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,11,22,.72) 0,rgba(8,11,22,.05) 34%,rgba(8,11,22,.1) 52%,rgba(8,11,22,.92) 100%)}
header{position:absolute;left:0;right:0;top:0;padding:5cqmin 5.5cqmin 0;display:flex;align-items:flex-start;gap:3cqmin}
.head{flex:1;min-width:0}
#artist{font-size:2.5cqmin;letter-spacing:.9cqmin;text-transform:uppercase;color:#00F2B8;margin-bottom:1cqmin;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
h1{font-size:6.4cqmin;line-height:1.05;font-weight:800;letter-spacing:-.1cqmin;text-shadow:0 .4cqmin 3cqmin rgba(0,0,0,.6);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
#lb.on,#mlb.on{color:#00F2B8}
.sp{flex:none;width:9cqmin;height:9cqmin}
.dock{position:absolute;left:4cqmin;right:4cqmin;bottom:4cqmin;padding:3.4cqmin 4cqmin 3.6cqmin;border-radius:5cqmin;background:rgba(12,17,32,.55);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);border:.25cqmin solid rgba(255,255,255,.14);box-shadow:0 2cqmin 6cqmin rgba(0,0,0,.45)}
.now{display:flex;align-items:center;gap:2.4cqmin;margin-bottom:2.6cqmin;min-height:4.4cqmin}
#cur{flex:1;min-width:0;font-size:3.1cqmin;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cur small{color:#9aa6c4;font-weight:400;margin-right:1.4cqmin}
.seek{display:flex;align-items:center;gap:2cqmin;margin-bottom:3cqmin}
#bar{flex:1;height:1.5cqmin;border-radius:1cqmin;background:rgba(255,255,255,.2);cursor:pointer;position:relative}
#bar::before{content:"";position:absolute;inset:-2cqmin 0}
#fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:1cqmin;background:linear-gradient(90deg,#00F2B8,#7fffe0);box-shadow:0 0 2cqmin rgba(0,242,184,.7)}
#fill::after{content:"";position:absolute;right:-1cqmin;top:50%;width:2.6cqmin;height:2.6cqmin;margin-top:-1.3cqmin;border-radius:50%;background:#fff;box-shadow:0 0 1.6cqmin rgba(0,242,184,.9)}
.tm{flex:none;font-size:2.3cqmin;color:#c3cde6;font-variant-numeric:tabular-nums;min-width:7.2cqmin}
.tm.r{text-align:right}
.ctl{display:flex;align-items:center;justify-content:center;gap:5.5cqmin}
.btn{border-radius:50%;border:0;background:none;color:#fff;cursor:pointer;display:grid;place-items:center;transition:transform .15s,background .2s,color .2s}
.btn:hover{color:#00F2B8}.btn:active{transform:scale(.9)}
.btn svg{fill:currentColor}
.sk{width:9cqmin;height:9cqmin}.sk svg{width:5.4cqmin;height:5.4cqmin}
#play{width:13.5cqmin;height:13.5cqmin;background:#00F2B8;color:#0b0f1c;box-shadow:0 0 5cqmin rgba(0,242,184,.55)}
#play:hover{background:#5ff7d6;color:#0b0f1c}#play svg{width:6cqmin;height:6cqmin}
#drawer{position:absolute;left:4cqmin;right:4cqmin;top:19cqmin;bottom:4cqmin;padding:2cqmin 0 0;border-radius:5cqmin;background:rgba(8,11,22,.82);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:.25cqmin solid rgba(0,242,184,.35);opacity:0;pointer-events:none;transform:translateY(3cqmin);transition:opacity .25s,transform .25s;display:flex;flex-direction:column}
#drawer.open{opacity:1;pointer-events:auto;transform:none}
#list{list-style:none;flex:1;min-height:0;overflow-y:auto;padding:0 2cqmin 2cqmin;scrollbar-width:none}
#list::-webkit-scrollbar{display:none}
#list li{display:flex;align-items:center;gap:2.4cqmin;padding:2.1cqmin 2.4cqmin;border-radius:3cqmin;cursor:pointer;font-size:3cqmin}
#list li:hover{background:rgba(255,255,255,.07)}
#list li.on{background:rgba(0,242,184,.16);color:#00F2B8}
#list .n{flex:none;width:4cqmin;text-align:right;color:#7f8bab;font-variant-numeric:tabular-nums}
#list li.on .n{color:#00F2B8}
#list .tt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#list .ta{flex:none;color:#7f8bab;font-size:2.3cqmin;max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#drawer h2{font-size:2.3cqmin;letter-spacing:.9cqmin;text-transform:uppercase;color:#7f8bab;font-weight:400;padding:1cqmin 4.4cqmin 1.6cqmin}
#msg{position:absolute;left:4cqmin;right:4cqmin;bottom:39cqmin;text-align:center;font-size:2.1cqmin;color:#ffb4a8;text-shadow:0 0 1.5cqmin rgba(0,0,0,.9)}
.single #lb,.single .sp,.single #mlb,.single #prev,.single #next,.single #drawer{display:none}
.single .ctl{gap:0}
.dock{transition:opacity .3s,transform .3s}
#drawer{bottom:40cqmin}
#mini{position:absolute;left:4cqmin;right:4cqmin;bottom:4cqmin;display:flex;align-items:center;gap:2.2cqmin;padding:1.8cqmin 2cqmin 1.8cqmin 1.8cqmin;border-radius:7cqmin;background:rgba(12,17,32,.55);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);border:.25cqmin solid rgba(255,255,255,.14);box-shadow:0 2cqmin 6cqmin rgba(0,0,0,.4);opacity:0;pointer-events:none;transform:translateY(3cqmin);transition:opacity .3s,transform .3s}
.mini #mini{opacity:1;pointer-events:auto;transform:none}
.mini .dock{opacity:0;pointer-events:none;transform:translateY(3cqmin)}
.mini #drawer{bottom:17cqmin}
.mini #msg{bottom:17cqmin}
#mplay{flex:none;width:9.5cqmin;height:9.5cqmin;background:#00F2B8;color:#0b0f1c;box-shadow:0 0 3cqmin rgba(0,242,184,.5)}
#mplay:hover{background:#5ff7d6;color:#0b0f1c}#mplay svg{width:4.4cqmin;height:4.4cqmin}
.mtxt{flex:1;min-width:0;display:flex;flex-direction:column;gap:1.4cqmin}
#mcur{font-size:2.8cqmin;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#mcur small{color:#9aa6c4;font-weight:400;margin-right:1.2cqmin}
#mbar{height:.9cqmin;border-radius:1cqmin;background:rgba(255,255,255,.2);position:relative;cursor:pointer}
#mbar::before{content:"";position:absolute;inset:-2cqmin 0}
#mfill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:1cqmin;background:#00F2B8}
#mini .sk{width:7.5cqmin;height:7.5cqmin}#mini .sk svg{width:4.4cqmin;height:4.4cqmin}
#min svg{width:5.4cqmin;height:5.4cqmin}
.brand{position:absolute;left:50%;bottom:1cqmin;transform:translateX(-50%);font-size:2.1cqmin;font-weight:800;letter-spacing:1.1cqmin;padding-left:1.1cqmin;color:rgba(255,255,255,.55);text-decoration:none;line-height:1;transition:color .2s}
.brand:hover{color:#00F2B8}
</style>
</head>
<body>
<div id="fillbg"></div>
<div id="stage">
<div id="art"></div><div id="scrim"></div>
<header>
<div class="head"><div id="artist"></div><h1 id="title"></h1></div>
</header>
<a class="brand" href="https://fony.fun" target="_blank" rel="noopener noreferrer" title="FONY — fony.fun">FONY</a>
<div class="dock">
<div class="now"><div id="cur"></div><button class="btn sk" id="min" aria-label="Minimize the player"><svg viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
<div class="seek"><span class="tm" id="t1">0:00</span><div id="bar" role="slider" aria-label="Seek"><div id="fill"></div></div><span class="tm r" id="t2">0:00</span></div>
<div class="ctl">
<button class="btn sk" id="lb" aria-label="Show the playlist"><svg viewBox="0 0 24 24"><path d="M4 6h12v2.4H4zM4 11h12v2.4H4zM4 16h8v2.4H4zM18 9v6.6a2.6 2.6 0 1 0 1.8 2.5V11l3-.8V7.8z"/></svg></button>
<button class="btn sk" id="prev" aria-label="Previous track"><svg viewBox="0 0 24 24"><path d="M6 5h2.5v14H6zM20 5v14L9.5 12z"/></svg></button>
<button class="btn" id="play" aria-label="Play"><svg viewBox="0 0 24 24" id="ico"><path d="M7 4.5v15l13-7.5z"/></svg></button>
<button class="btn sk" id="next" aria-label="Next track"><svg viewBox="0 0 24 24"><path d="M15.5 5H18v14h-2.5zM4 5l10.5 7L4 19z"/></svg></button>
<span class="sp"></span>
</div>
</div>
<div id="mini">
<button class="btn" id="mplay" aria-label="Play"><svg viewBox="0 0 24 24" id="mico"><path d="M7 4.5v15l13-7.5z"/></svg></button>
<div class="mtxt"><div id="mcur"></div><div id="mbar" role="slider" aria-label="Seek"><div id="mfill"></div></div></div>
<button class="btn sk" id="mlb" aria-label="Show the playlist"><svg viewBox="0 0 24 24"><path d="M4 6h12v2.4H4zM4 11h12v2.4H4zM4 16h8v2.4H4zM18 9v6.6a2.6 2.6 0 1 0 1.8 2.5V11l3-.8V7.8z"/></svg></button>
<button class="btn sk" id="mexp" aria-label="Open the player"><svg viewBox="0 0 24 24"><path d="M6 14.5l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
</div>
<div id="drawer"><h2>Playlist</h2><ol id="list"></ol></div>
<div id="msg"></div>
</div>
<audio id="a" preload="metadata"></audio>
<script>
var D=${safeJson(data)};
var $=function(i){return document.getElementById(i)};
var a=$("a"),idx=0,gi=0,T=D.tracks,st=$("stage");
function src(i,g){var t=T[i];return t.audioUrl||D.gateways[g]+t.audio}
function cov(g){return D.coverUrl||D.gateways[g]+D.cover}
$("title").textContent=D.title;$("artist").textContent=D.artist||"FONY";
if(D.cover||D.coverUrl){var c='url("'+cov(0)+'")';$("art").style.backgroundImage=c;$("fillbg").style.backgroundImage=c}
function fmt(s){if(!isFinite(s))return"0:00";s=Math.floor(s);return Math.floor(s/60)+":"+("0"+(s%60)).slice(-2)}
var list=$("list");
T.forEach(function(t,i){var li=document.createElement("li");li.innerHTML='<span class="n"></span><span class="tt"></span><span class="ta"></span>';li.children[0].textContent=i+1;li.children[1].textContent=t.title;li.children[2].textContent=t.artist&&t.artist!==D.artist?t.artist:"";li.onclick=function(){load(i,true);setList(false)};list.appendChild(li)});
function load(i,play){
 if(!T.length)return;idx=(i+T.length)%T.length;gi=0;$("msg").textContent="";
 a.src=src(idx,0);$("cur").innerHTML="<small></small><span></span>";$("cur").children[0].textContent=(idx+1)+"/"+T.length;$("cur").children[1].textContent=T[idx].title;$("mcur").innerHTML="<small></small><span></span>";$("mcur").children[0].textContent=(idx+1)+"/"+T.length;$("mcur").children[1].textContent=T[idx].title;
 [].forEach.call(list.children,function(li,k){li.classList.toggle("on",k===idx)});
 if(play)a.play().catch(function(){});
 try{if("mediaSession"in navigator)navigator.mediaSession.metadata=new MediaMetadata({title:T[idx].title,artist:T[idx].artist||D.artist,album:D.title})}catch(e){}
}
a.addEventListener("error",function(){
 if(gi<D.gateways.length-1&&!T[idx].audioUrl){gi++;var t=a.currentTime,w=!a.paused;a.src=src(idx,gi);a.currentTime=t;if(w)a.play().catch(function(){})}
 else $("msg").textContent="This track could not be loaded from IPFS right now."});
function ui(){var p=!a.paused,d=p?'<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>':'<path d="M7 4.5v15l13-7.5z"/>';$("ico").innerHTML=d;$("mico").innerHTML=d;$("play").setAttribute("aria-label",p?"Pause":"Play");$("mplay").setAttribute("aria-label",p?"Pause":"Play");st.classList.toggle("playing",p)}
function toggle(){a.paused?a.play().catch(function(){}):a.pause()}
$("play").onclick=toggle;$("mplay").onclick=toggle;
$("next").onclick=function(){load(idx+1,!a.paused)};
$("prev").onclick=function(){if(a.currentTime>3)a.currentTime=0;else load(idx-1,!a.paused)};
function setList(o){$("drawer").classList.toggle("open",o);$("lb").classList.toggle("on",o);$("mlb").classList.toggle("on",o)}
function toggleList(){setList(!$("drawer").classList.contains("open"))}
$("lb").onclick=toggleList;$("mlb").onclick=toggleList;
$("min").onclick=function(){st.classList.add("mini")};
$("mexp").onclick=function(){st.classList.remove("mini")};
a.onplay=a.onpause=ui;
a.onended=function(){if(idx<T.length-1)load(idx+1,true);else{load(0,false);ui()}};
a.ontimeupdate=a.onloadedmetadata=function(){var pc=(a.duration?a.currentTime/a.duration*100:0)+"%";$("fill").style.width=pc;$("mfill").style.width=pc;$("t1").textContent=fmt(a.currentTime);$("t2").textContent=fmt(a.duration)};
function seek(e){if(!a.duration)return;var r=this.getBoundingClientRect();a.currentTime=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*a.duration}
$("bar").onclick=seek;$("mbar").onclick=seek;
document.addEventListener("keydown",function(e){if(e.code==="Space"){e.preventDefault();$("play").click()}else if(T.length>1&&e.code==="ArrowRight")$("next").click();else if(T.length>1&&e.code==="ArrowLeft")$("prev").click()});
if(T.length<2)st.classList.add("single");
st.classList.add("mini");
load(0,false);
</script>
</body>
</html>`
}
