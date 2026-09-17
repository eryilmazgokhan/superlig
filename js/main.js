// Wires buttons to handlers. Must load last.
try {
G("createBtn").onclick = createRoom;
G("joinBtn").onclick = joinRoom;
G("codeInp").addEventListener("input",function(){this.value=this.value.toUpperCase();});
G("startBtn").onclick = function(){dbUpdate("rooms/"+ROOM,{phase:"selecting"});};
G("cpyBtn").onclick = function(){
  var t=G("lobCode").textContent;
  if(navigator.clipboard){navigator.clipboard.writeText(t);}
  else{var ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);}
  G("cpyBtn").textContent="Kopyalandi!";
  setTimeout(function(){G("cpyBtn").textContent="Kopyala";},2000);
};
G("toSqBtn").onclick = function(){renderSquad();setStep(3);};
G("readyBtn").onclick = markReady;
G("nextBtn").onclick = requestAdvance;
G("allBtn").onclick = function(){_autoAll=true;tryFree();};
G("tabStandings").onclick = function(){showTab("standings");};
G("tabScorers").onclick = function(){showTab("scorers");};
G("showChampBtn").onclick = openChampOverlay;
G("mcastNext").onclick = narrNext;
G("mcastClose").onclick = closeNarration;
setStep(0);
var sess=loadSession();
if(sess&&sess.room)rejoin(sess);
} catch(e) {
  document.body.innerHTML = '<div style="padding:20px;background:#0b1f17;color:#f0c94a;min-height:100vh;font-family:sans-serif;">'
    + '<h2>Hata</h2><pre style="color:#e57373;margin-top:10px;font-size:12px;white-space:pre-wrap;">' + e.stack + '</pre></div>';
}
