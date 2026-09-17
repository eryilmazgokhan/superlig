// Config, shared state, helpers, Firebase REST wrapper, polling and the phase router.
var DB = "https://superlig-oyunu-default-rtdb.europe-west1.firebasedatabase.app";
var STALE_MS = 30000;     // a player not seen for this long counts as gone (closed tab, crash)
var HEARTBEAT_EVERY = 5;  // polls between heartbeat writes (poll runs every 2 s)

// ─── STATE ───
var ME = { id:"p_"+Math.random().toString(36).slice(2,11), nick:"", teamId:null };
var ROOM = null;
var pollTimer = null, pollCount = 0;
var lastPhase = null;
var loc = { fkey:"4-4-2", slots:[], assigned:[], focusIdx:-1, cache:{}, pool:[], chem:false };
var _league=[], _fixtures=[], _round=0, _log=[], _rng=Math.random;
var _leagueStartSent=false; // guards the building->league write below from firing on every 2s poll

// Session survives a reload in the same tab, so the player rejoins instead of leaving a ghost behind.
function saveSession(){try{sessionStorage.setItem("sl",JSON.stringify({id:ME.id,nick:ME.nick,room:ROOM}));}catch(e){}}
function loadSession(){try{return JSON.parse(sessionStorage.getItem("sl"));}catch(e){return null;}}
function clearSession(){try{sessionStorage.removeItem("sl");}catch(e){}}

// ─── UTILS ───
function rnd(n){return Math.floor(Math.random()*n);}
function pick(a){return a[rnd(a.length)];}
function shuffled(a){var b=a.slice();for(var i=b.length-1;i>0;i--){var j=rnd(i+1);var t=b[i];b[i]=b[j];b[j]=t;}return b;}
function poisson(lam,r){r=r||Math.random;var L=Math.exp(-lam),k=0,p=1;do{k++;p*=r();}while(p>L);return k-1;}
// Seeded RNG: every client simulates the identical season from the room's seed.
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// Escape user-entered text (nicknames) before putting it into innerHTML.
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function contrast(hex){var c=hex.replace("#","");var r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);return(0.299*r+0.587*g+0.114*b)>150?"#111":"#fff";}
function cs(t){return "background:linear-gradient(135deg,"+t.c1+","+t.c2+");color:"+contrast(t.c1)+";";}
function G(id){return document.getElementById(id);}
function genCode(){var c="ABCDEFGHJKLMNPQRSTUVWXYZ";var s="";for(var i=0;i<4;i++)s+=c[rnd(c.length)];return s;}
function banner(msg,err){
  var b=G("banner");b.innerHTML=msg;
  b.className="block px-3.5 py-2 text-[13px] text-center border-b "+(err?"bg-[#3b1a1a] border-danger/20 text-danger":"bg-pitch-700 border-gold/15 text-mist");
}
function hideBanner(){G("banner").className="hidden";}
function setStep(n){
  ["s0","s1","s2","s3","s4"].forEach(function(id,i){
    var el=G(id);if(el)el.classList.toggle("hidden",i!==n);
  });
  var ds=G("sdots").children;
  for(var i=0;i<ds.length;i++)ds[i].className="w-[7px] h-[7px] rounded-full "+(i<n?"bg-gold":i===n?"bg-ink":"bg-white/15");
  window.scrollTo(0,0);
}
// Players with a recent heartbeat. Ghosts are ignored for lists, "everyone picked" and "everyone ready".
function activePlayers(players){
  var out={},now=Date.now();
  Object.keys(players||{}).forEach(function(pid){
    var p=players[pid];if(!p)return;
    if(pid===ME.id||now-(p.seen||p.ts||0)<STALE_MS)out[pid]=p;
  });
  return out;
}
// The stored host while active, otherwise the earliest-joined active player, so a game never gets stuck.
function effectiveHost(data,active){
  if(active[data.host])return data.host;
  var ids=Object.keys(active).sort(function(a,b){return(active[a].ts||0)-(active[b].ts||0);});
  return ids[0]||null;
}

// ─── FIREBASE REST ───
function req(method,path,val,cb){
  var opt={method:method};
  if(val!==undefined){opt.body=JSON.stringify(val);opt.headers={"Content-Type":"application/json"};}
  fetch(DB+"/"+path+".json",opt)
    .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return method==="DELETE"?null:r.json();})
    .then(function(d){if(cb)cb(null,d);})
    .catch(function(e){if(cb)cb(e,null);});
}
function dbGet(path,cb){req("GET",path,undefined,cb);}
function dbSet(path,val,cb){req("PUT",path,val,cb);}
function dbUpdate(path,val,cb){req("PATCH",path,val,cb);}
function dbDelete(path,cb){req("DELETE",path,undefined,cb);}

// ─── POLLING / PHASE ROUTER ───
function startPoll(){
  if(pollTimer)clearInterval(pollTimer);
  pollCount=0;
  pollTimer=setInterval(poll,2000);
  poll();
}
function stopPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}

function poll(){
  if(!ROOM)return;
  if(pollCount++%HEARTBEAT_EVERY===0)dbUpdate("rooms/"+ROOM+"/players/"+ME.id,{seen:Date.now()});
  dbGet("rooms/"+ROOM, function(err, data){
    if(err||!data)return;
    onRoomUpdate(data);
  });
}

// Room phases: lobby -> selecting -> building -> league.
// "building" covers tactics and squad, which are local steps; only `ready` is shared.
function onRoomUpdate(data){
  var active=activePlayers(data.players);
  var host=effectiveHost(data,active);
  var iAmHost=host===ME.id;
  var phase=data.phase||"lobby";
  var ids=Object.keys(active);

  if(phase!==lastPhase){
    lastPhase=phase;
    onPhaseChange(phase, data, active);
  }

  if(phase==="lobby"){
    renderLobbyPlayers(active, host);
  } else if(phase==="selecting"){
    renderTeams(active);
    var allPicked=ids.length>=2&&ids.every(function(pid){return !!active[pid].teamId;});
    if(allPicked&&iAmHost)dbUpdate("rooms/"+ROOM,{phase:"building"});
  } else if(phase==="building"){
    renderReadyChips(active);
    var allReady=ids.length>=2&&ids.every(function(pid){return active[pid].ready;});
    // Two writes on purpose: "phase" is the critical transition and must never be
    // blocked by "round" (a newer field older, not-yet-redeployed Firebase rules
    // may still reject). If the combined write fails, retry phase alone.
    if(allReady&&iAmHost&&!_leagueStartSent){
      _leagueStartSent=true;
      dbUpdate("rooms/"+ROOM,{phase:"league",round:0},function(err){
        if(!err)return;
        _leagueStartSent=false;
        dbUpdate("rooms/"+ROOM,{phase:"league"},function(err2){
          if(err2){_leagueStartSent=false;return;} // will retry on next poll
          dbUpdate("rooms/"+ROOM,{round:0}); // best-effort; ignore failure
        });
      });
    }
  } else if(phase==="league"){
    if(typeof onLeaguePoll==="function")onLeaguePoll(data,active);
  }
}

function onPhaseChange(phase, data, active){
  if(phase==="selecting"){
    if(!loc.pool.length)buildPool();
    renderTeams(active);
    setStep(1);
    banner(ME.teamId?"Diger oyuncular takim seciyor...":"Takimini sec! Ayni takimi iki kisi secemez.");
  } else if(phase==="building"){
    if(!loc.pool.length)buildPool();
    applyChemBonus();
    buildFormation(loc.fkey);
    renderNodes();
    var me=active[ME.id];
    if(me&&me.ready){ // rejoined after reload with squad already submitted
      renderSquad();setStep(3);
      G("readyBtn").disabled=true;G("readyBtn").textContent="Diger oyuncular bekleniyor...";
      banner("Kadron kayitli. Diger oyuncular tamamlayana kadar bekle.");
    } else {
      setStep(2);hideBanner();
    }
  } else if(phase==="league"){
    // Polling keeps running through the league: rounds now advance via a shared
    // Firebase counter (see league.js) so friend-vs-friend weeks stay in sync.
    var done={};
    Object.keys(data.players||{}).forEach(function(pid){var p=data.players[pid];if(p&&p.teamId&&p.ready)done[pid]=p;});
    buildLeague(done, data.seed);
    setStep(4);
    hideBanner();
  }
}
