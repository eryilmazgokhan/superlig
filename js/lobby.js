// Screens 0-1: room create/join, lobby list, team selection, player pool.
// ─── POOL ───
function buildPool(){
  var pool=[];var id=1;
  PLAYERS.forEach(function(p){
    var t=TS[p.c];if(!t)return;
    var types=[p.t].concat(p.alt||[]);
    pool.push({id:"p"+(id++),name:p.n,type:p.t,types:types,pw:p.ca,trait:pick(TRAITS),club:p.c});
  });
  loc.pool=pool;
}
function applyChemBonus(){
  if(loc.chem||!ME.teamId)return;
  var myS=TS[ME.teamId]?TS[ME.teamId].s:null;
  if(myS)loc.pool.forEach(function(p){if(p.club===myS){p.pw=Math.min(99,Math.round(p.pw*1.01));}});
  loc.chem=true;
}

// ─── LOBBY ───
function createRoom(){
  var nick=G("nickInp").value.trim();
  if(!nick){banner("Kullanici adini gir.",true);return;}
  ME.nick=nick;
  var code=genCode();ROOM=code;
  var now=Date.now();
  var pdata={};pdata[ME.id]={nick:ME.nick,teamId:null,ready:false,ts:now,seen:now};
  dbSet("rooms/"+code,{players:pdata,phase:"lobby",host:ME.id,created:now,seed:rnd(2147483647)},function(err){
    if(err){banner("Baglanti hatasi: "+err.message,true);ROOM=null;return;}
    saveSession();
    showLobby(code);
    startPoll();
  });
}

function joinRoom(){
  var nick=G("nickInp").value.trim();
  var code=G("codeInp").value.trim().toUpperCase();
  if(!nick){banner("Kullanici adini gir.",true);return;}
  if(code.length!==4){banner("4 harfli oda kodunu gir.",true);return;}
  ME.nick=nick;ROOM=code;
  dbGet("rooms/"+code, function(err, data){
    if(err||!data){banner("Bu kod ile oda bulunamadi.",true);ROOM=null;return;}
    if(data.phase!=="lobby"&&data.phase!=="selecting"){banner("Bu oda oyuna baslamis.",true);ROOM=null;return;}
    var now=Date.now();
    dbUpdate("rooms/"+code+"/players/"+ME.id,{nick:ME.nick,teamId:null,ready:false,ts:now,seen:now},function(e){
      if(e){banner("Katilim hatasi.",true);ROOM=null;return;}
      saveSession();
      hideBanner();
      showLobby(code);
      startPoll();
    });
  });
}

// After a reload: if this tab was in a room that is still running, pick up where we left off.
function rejoin(sess){
  dbGet("rooms/"+sess.room, function(err, data){
    var me=data&&data.players&&data.players[sess.id];
    if(err||!me||data.phase==="league"){clearSession();return;}
    ME.id=sess.id;ME.nick=sess.nick;ME.teamId=me.teamId||null;ROOM=sess.room;
    G("nickInp").value=ME.nick;
    showLobby(ROOM);
    startPoll();
  });
}

function showLobby(code){
  G("lobbyWait").classList.remove("hidden");
  G("lobCode").textContent=code;
  G("rcd").textContent=code;
  G("rcdisp").classList.remove("hidden");
  G("createBtn").disabled=true;
  G("joinBtn").disabled=true;
}

function renderLobbyPlayers(players, hostId){
  var el=G("lobPlayers");if(!el)return;
  el.innerHTML="";
  var count=Object.keys(players).length;
  Object.keys(players).forEach(function(pid){
    var p=players[pid];
    var isHost=pid===hostId;
    var isMe=pid===ME.id;
    var div=document.createElement("div");
    div.className="flex items-center justify-between px-3 py-2.5 mb-1.5 rounded-lg bg-pitch-900 border border-gold/10";
    div.innerHTML='<div><div class="text-sm font-semibold">'+esc(p.nick)+(isMe?" (sen)":"")+'</div>'
      +'<div class="text-[11px] text-mist mt-0.5">'+(p.teamId&&TS[p.teamId]?TS[p.teamId].name:"Bekliyor...")+'</div></div>'
      +'<span class="text-[11px] px-2.5 py-[3px] rounded-full '+(isHost?"bg-indigo-400/15 text-sky-300":"bg-white/5 text-dim")+'">'+(isHost?"Host":"Bekliyor")+'</span>';
    el.appendChild(div);
  });
  var sb=G("startBtn");
  if(sb){
    var isHost=hostId===ME.id;
    sb.disabled=(!isHost||count<2);
    sb.textContent=isHost?"Takim secimini baslat":"Host baslatacak...";
  }
}

// ─── TEAM SELECT ───
function renderTeams(players){
  var g=G("teamGrid");if(!g)return;
  var taken={};
  Object.keys(players).forEach(function(pid){
    var p=players[pid];
    if(p.teamId&&pid!==ME.id)taken[p.teamId]=p.nick;
  });
  g.innerHTML="";
  TEAMS.forEach(function(t){
    var isTaken=!!taken[t.id];
    var isMine=ME.teamId===t.id;
    var btn=document.createElement("button");
    btn.className="tc";
    if(isTaken)btn.setAttribute("disabled","");
    btn.innerHTML='<div class="crest w-9 h-9 text-[10px]" style="'+cs(t)+'">'+t.s+'</div>'
      +'<div class="font-narrow text-sm font-bold leading-tight">'+t.name+'</div>'
      +(isTaken?'<div class="text-[10px] text-danger mt-0.5">'+esc(taken[t.id])+' secti</div>':"")
      +(isMine?'<div class="text-[10px] text-ok mt-0.5">Senin secimin &#10003;</div>':"");
    if(!isTaken){
      (function(team){btn.onclick=function(){selectTeam(team);};})(t);
    }
    g.appendChild(btn);
  });
}

function selectTeam(t){
  ME.teamId=t.id;
  dbUpdate("rooms/"+ROOM+"/players/"+ME.id,{teamId:t.id},function(err){
    if(err){banner("Secim kaydedilemedi.",true);return;}
    banner("Secildi: "+t.name+". Diger oyuncular secince taktige gecilir.");
  });
}
