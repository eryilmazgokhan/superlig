// Screen 4: fixtures, match simulation, table, season end.
// Rounds advance through a shared Firebase counter (room `round`) so a friend-vs-friend
// week only moves on once both sides confirm; see requestAdvance/onLeaguePoll below.
var _scorers={};             // key "<teamId>|<player name>" -> {name,type,teamId,goals}
var _assists={};             // key "<teamId>|<player name>" -> {name,type,teamId,assists}
var _lastActive={};          // last poll's active-players map (used when a button is clicked)
var _lastSimReq=null;        // last poll's room.simReq, or null
var _myPendingReqRound=null; // round number I already sent a simReq for (avoid duplicate writes)
var _autoAll=false;          // "Tumunu simule et" keeps auto-advancing free rounds until it hits a gate
// Real player records (data.js) indexed by name, once -- used to turn a drafted squad's
// name list (synced through Firebase) back into {n,t,c} records for the roster below.
var PLAYERS_BY_NAME=(function(){var m={};PLAYERS.forEach(function(p){m[p.n]=p;});return m;})();

function buildLeague(players, seed){
  _rng=mulberry32(seed||1);
  var humanTeams={};
  Object.keys(players).forEach(function(pid){
    var p=players[pid];
    if(p.teamId)humanTeams[p.teamId]={nick:p.nick,pw:p.squadPw||TS[p.teamId].pw,isMe:pid===ME.id,pid:pid,squad:p.squad||[]};
  });
  _league=TEAMS.map(function(t){
    var h=humanTeams[t.id];
    return{id:t.id,name:t.name,s:t.s,c1:t.c1,c2:t.c2,pw:h?h.pw:t.pw,
      isMe:h?h.isMe:false,isHuman:!!h,nick:h?h.nick:null,pid:h?h.pid:null,
      roster:[], // actual matchday squad, filled in below -- not the native-club listing in PLAYERS
      P:0,W:0,D:0,L:0,GF:0,GA:0,Pts:0};
  });
  // Every human's actual drafted 11 becomes their team's roster (what scorers/assists draw from).
  // Walked in fixed TEAMS order (identical on every client) so that if two humans both happened
  // to draft the same real player -- their candidate pools are independent, nothing stops it --
  // he ends up credited to only whichever team comes first in that order, never both.
  var claimed={};
  _league.forEach(function(team){
    var h=humanTeams[team.id];if(!h)return;
    team.roster=h.squad.map(function(n){return PLAYERS_BY_NAME[n];}).filter(function(p){
      if(!p||claimed[p.n])return false;
      claimed[p.n]=true;return true;
    });
  });
  // Whoever wasn't drafted by a human is dealt out, deterministically (same seed, same order on
  // every client), across the AI clubs -- so a player who got drafted onto someone's XI can no
  // longer also show up scoring for their native club, and every other real player still ends up
  // on exactly one team's actual roster.
  var remaining=seededShuffle(PLAYERS.filter(function(p){return !claimed[p.n];}));
  var aiTeams=_league.filter(function(t){return !t.isHuman;});
  if(aiTeams.length)remaining.forEach(function(p,i){aiTeams[i%aiTeams.length].roster.push(p);});
  // An AI club's strength now comes from the real CA of the players it actually got dealt,
  // not a fixed per-club number -- so "başta seçilen takım gücü" no longer means anything either.
  aiTeams.forEach(function(t){
    if(!t.roster.length)return;
    var sum=t.roster.reduce(function(s,p){return s+(p.ca||0);},0);
    t.pw=Math.round(sum/t.roster.length);
  });
  _fixtures=makeFixtures(_league.map(function(t){return t.id;}));
  _round=0;_log=[];_scorers={};_assists={};_autoAll=false;_myPendingReqRound=null;
  renderPills();renderTable();renderScorers();renderAssists();renderNextFixture();renderMySquad();G("flog").innerHTML="";
  hideApprovalBanner();
}
// The persistent "Kadron" panel on screen 4, so a player can still see who they actually
// drafted (and who ended up eligible to score for them) while browsing the league.
function renderMySquad(){
  var body=G("mySquadBody");if(!body)return;
  var team=tById(ME.teamId);
  if(!team||!team.roster||!team.roster.length){
    body.innerHTML='<p class="text-[11px] text-dim">Kadro bulunamadi.</p>';
    return;
  }
  body.innerHTML="";
  team.roster.forEach(function(p){
    var row=document.createElement("div");
    row.className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-pitch-900 border border-white/5 text-[11.5px]";
    row.innerHTML='<span class="text-dim font-narrow font-bold w-7 shrink-0">'+esc(p.t)+'</span><span class="flex-1 truncate">'+esc(p.n)+'</span>';
    body.appendChild(row);
  });
}
// Fisher-Yates using the shared seeded RNG (not Math.random) so every client deals the same cards.
function seededShuffle(a){
  var b=a.slice();
  for(var i=b.length-1;i>0;i--){var j=Math.floor(_rng()*(i+1));var t=b[i];b[i]=b[j];b[j]=t;}
  return b;
}
function makeFixtures(ids){
  var teams=ids.slice();if(teams.length%2===1)teams.push(null);
  var n=teams.length,rounds=[],arr=teams.slice();
  for(var r=0;r<n-1;r++){
    var pairs=[];
    for(var i=0;i<n/2;i++){var a=arr[i],b=arr[n-1-i];if(a&&b)pairs.push(_rng()<.5?[a,b]:[b,a]);}
    rounds.push(pairs);
    var fixed=arr[0],rest=arr.slice(1);rest.unshift(rest.pop());arr=[fixed].concat(rest);
  }
  var f=rounds.map(function(r){return r.map(function(p){return{h:p[0],a:p[1]};});});
  var s=rounds.map(function(r){return r.map(function(p){return{h:p[1],a:p[0]};});});
  return f.concat(s);
}
function tById(id){for(var i=0;i<_league.length;i++)if(_league[i].id===id)return _league[i];}
// Goal scorers (and assists) are not simulated per-player, so both human and AI teams draw a
// name from the team's actual roster (see buildLeague: a human's real draft, or an AI club's
// randomly dealt share of the undrafted players), weighted by position. Same roster + same
// _rng sequence on every client, so the top-scorer/assist tables stay identical for everyone.
function scorerWeight(type){
  return type==="ST"?5:type==="AM"?4:(type==="LW"||type==="RW")?3:type==="CM"?2
    :(type==="DM"||type==="LM"||type==="RM")?1.5:(type==="GK")?0:0.5;
}
function assistWeight(type){
  return type==="AM"?5:(type==="LW"||type==="RW")?4:type==="CM"?3:(type==="LM"||type==="RM")?2.5
    :type==="DM"?1.8:type==="ST"?1:(type==="GK")?0:0.6;
}
function clubRoster(teamId){
  var t=tById(teamId);
  return t&&t.roster?t.roster.filter(function(p){return p.t!=="GK";}):[];
}
function weightedPick(roster,weightFn){
  if(!roster.length)return null;
  var weights=roster.map(function(p){return weightFn(p.t);});
  var total=weights.reduce(function(s,w){return s+w;},0);
  if(total<=0)return roster[0];
  var r=_rng()*total,acc=0;
  for(var i=0;i<roster.length;i++){acc+=weights[i];if(r<=acc)return roster[i];}
  return roster[roster.length-1];
}
function pickScorer(teamId){return weightedPick(clubRoster(teamId),scorerWeight);}
// The assister is drawn from the same roster, minus whoever just scored -- most goals get one,
// a few (long shots, headers with no cross) don't.
function pickAssister(teamId,scorer){
  if(_rng()>=0.72)return null;
  var roster=clubRoster(teamId).filter(function(p){return !scorer||p.n!==scorer.n;});
  return weightedPick(roster,assistWeight);
}
function recordScorer(p,teamId){
  if(!p)return;
  var key=teamId+"|"+p.n;
  if(!_scorers[key])_scorers[key]={name:p.n,type:p.t,teamId:teamId,goals:0};
  _scorers[key].goals++;
}
function recordAssist(p,teamId){
  if(!p)return;
  var key=teamId+"|"+p.n;
  if(!_assists[key])_assists[key]={name:p.n,type:p.t,teamId:teamId,assists:0};
  _assists[key].assists++;
}
function simMatch(hId,aId){
  var h=tById(hId),a=tById(aId),d=h.pw-a.pw;
  var gh=poisson(Math.max(.4,1.4+d/14),_rng),ga=poisson(Math.max(.4,1.1-d/14),_rng);
  h.P++;a.P++;h.GF+=gh;h.GA+=ga;a.GF+=ga;a.GA+=gh;
  if(gh>ga){h.W++;a.L++;h.Pts+=3;}else if(gh<ga){a.W++;h.L++;a.Pts+=3;}else{h.D++;a.D++;h.Pts++;a.Pts++;}
  var goals=[],i;
  for(i=0;i<gh;i++)goals.push(makeGoalEvent(hId));
  for(i=0;i<ga;i++)goals.push(makeGoalEvent(aId));
  goals.sort(function(x,y){return x.min-y.min;});
  goals.forEach(function(g){recordScorer(g.scorer,g.team);if(g.assist)recordAssist(g.assist,g.team);});
  return{h:hId,a:aId,gh:gh,ga:ga,goals:goals};
}
function makeGoalEvent(teamId){
  var scorer=pickScorer(teamId);
  return {team:teamId,min:1+Math.floor(_rng()*90),scorer:scorer,assist:pickAssister(teamId,scorer)};
}
function sorted(){return _league.slice().sort(function(a,b){return b.Pts-a.Pts||(b.GF-b.GA)-(a.GF-a.GA)||b.GF-a.GF;});}
function renderPills(){
  var total=_fixtures.length;
  var pill='px-3 py-[5px] rounded-full bg-pitch-800 border border-gold/20 text-xs text-mist';
  G("lgpills").innerHTML='<div class="'+pill+'">Hafta <b class="text-gold-light">'+Math.min(_round+1,total)+'</b>/'+total+'</div>'
    +'<div class="'+pill+'">Takim: <b class="text-gold-light">'+(TS[ME.teamId]?TS[ME.teamId].name:"?")+'</b></div>';
}
function renderTable(){
  var tb=G("tbody");if(!tb)return;tb.innerHTML="";
  sorted().forEach(function(t){
    var tr=document.createElement("tr");
    tr.className=t.isMe?"row-me":t.isHuman?"row-human":"";
    var lbl=t.name+(t.isHuman&&t.nick?" ("+esc(t.nick)+")":"");
    tr.innerHTML='<td><div class="flex items-center gap-[5px]"><span class="crest w-4 h-4 text-[6px] font-narrow" style="background:linear-gradient(135deg,'+t.c1+','+t.c2+');color:'+contrast(t.c1)+';">'+t.s+'</span>'+lbl+'</div></td>'
      +'<td class="text-center">'+t.P+'</td><td class="text-center">'+t.W+'</td><td class="text-center">'+t.D+'</td><td class="text-center">'+t.L+'</td>'
      +'<td class="text-center">'+t.GF+'</td><td class="text-center">'+t.GA+'</td><td class="text-center">'+(t.GF-t.GA)+'</td>'
      +'<td class="text-center"><b>'+t.Pts+'</b></td>';
    tb.appendChild(tr);
  });
}
function topScorers(){
  return Object.keys(_scorers).map(function(k){return _scorers[k];}).sort(function(a,b){return b.goals-a.goals;}).slice(0,15);
}
function topAssists(){
  return Object.keys(_assists).map(function(k){return _assists[k];}).sort(function(a,b){return b.assists-a.assists;}).slice(0,15);
}
function renderStatTable(bodyId,list,statKey,emptyMsg){
  var tb=G(bodyId);if(!tb)return;tb.innerHTML="";
  if(!list.length){
    tb.innerHTML='<tr><td colspan="3" class="text-center text-dim py-3">'+emptyMsg+'</td></tr>';
    return;
  }
  list.forEach(function(p,i){
    var t=TS[p.teamId]||{c1:"#333",c2:"#666",s:"?",name:"?"};
    var tr=document.createElement("tr");
    tr.innerHTML='<td class="text-center text-dim">'+(i+1)+'</td>'
      +'<td><div class="flex items-center gap-[5px]"><span class="crest w-4 h-4 text-[6px] font-narrow" style="background:linear-gradient(135deg,'+t.c1+','+t.c2+');color:'+contrast(t.c1)+';">'+t.s+'</span>'+esc(p.name)+'</div></td>'
      +'<td class="text-center"><b class="text-gold-light">'+p[statKey]+'</b></td>';
    tb.appendChild(tr);
  });
}
function renderScorers(){renderStatTable("scorerBody",topScorers(),"goals","Henuz gol yok.");}
function renderAssists(){renderStatTable("assistBody",topAssists(),"assists","Henuz asist yok.");}
function showTab(which){
  G("standingsWrap").classList.toggle("hidden",which!=="standings");
  G("scorersWrap").classList.toggle("hidden",which!=="scorers");
  G("assistsWrap").classList.toggle("hidden",which!=="assists");
  G("tabStandings").className="btn btn-sm"+(which==="standings"?"":" btn-ghost");
  G("tabScorers").className="btn btn-sm"+(which==="scorers"?"":" btn-ghost");
  G("tabAssists").className="btn btn-sm"+(which==="assists"?"":" btn-ghost");
}
// The fixture I personally play in a given round, or null (bye week / already over).
function myFixture(round){
  if(round>=_fixtures.length)return null;
  var meTeam=null;
  for(var i=0;i<_league.length;i++)if(_league[i].isMe){meTeam=_league[i];break;}
  if(!meTeam)return null;
  var list=_fixtures[round];
  for(var i=0;i<list.length;i++){if(list[i].h===meTeam.id||list[i].a===meTeam.id)return list[i];}
  return null;
}
// Shown above "Sonraki hafta" at all times, so the matchup is visible before the button is even pressed.
function renderNextFixture(){
  var el=G("nextFixture");if(!el)return;
  var m=myFixture(_round);
  if(!m){el.innerHTML="";return;}
  var h=tById(m.h),a=tById(m.a);
  var vsHuman=h.isHuman&&a.isHuman;
  el.innerHTML="Sonraki hafta: <b class=\"text-gold-light\">"+esc(h.name)+"</b> - <b class=\"text-gold-light\">"+esc(a.name)+"</b>"
    +(vsHuman?' <span class="text-dim">(arkadas maci - onay gerekir)</span>':"");
}

// ─── ROUND ADVANCE (shared, approval-gated for friend-vs-friend weeks) ───
// requiredPids: the human pids that must consent before `fixtures` (one round) can be
// simulated -- only when a fixture pits two active human players against each other.
function requiredPids(fixtures,active){
  var set={};
  fixtures.forEach(function(m){
    var h=tById(m.h),a=tById(m.a);
    if(h.isHuman&&a.isHuman&&h.pid&&a.pid&&active[h.pid]&&active[a.pid]){set[h.pid]=true;set[a.pid]=true;}
  });
  return Object.keys(set);
}
function writeRound(n,cb){
  dbUpdate("rooms/"+ROOM,{round:n},function(err){
    if(err){banner("Hafta senkronize edilemedi, tekrar deneniyor...",true);}
    if(cb)cb(err);
  });
}
// Whether to narrate a resolved friend-vs-friend request: either side could have asked for it
// (the narrate toggle in the approval panel, answered by both, not decided upfront by whoever clicked first).
function narrateFor(req,active,round){
  if(!req||req.round!==round)return false;
  var required=requiredPids(_fixtures[round]||[],active);
  var votes=req.narrateVotes||{};
  return required.some(function(pid){return !!votes[pid];});
}
// User-facing "Sonraki hafta": free rounds simulate immediately, a friend matchup sends a request instead.
// The upcoming fixture is always visible beforehand via renderNextFixture(); this only decides
// how the click is handled once the matchup is known.
function requestAdvance(){
  if(_round>=_fixtures.length)return false;
  if(_lastSimReq&&_lastSimReq.round===_round)return true; // a request for this round is already in flight
  var required=requiredPids(_fixtures[_round],_lastActive||{});
  if(!required.length){writeRound(_round+1);advanceRound(false);return true;}
  var approvals={};approvals[ME.id]=true;
  _myPendingReqRound=_round;
  var req={round:_round,by:ME.id,approvals:approvals};
  dbUpdate("rooms/"+ROOM,{simReq:req},function(err){
    if(err){_myPendingReqRound=null;banner("Istek gonderilemedi. Firebase kurallari guncel olmayabilir; tekrar dene.",true);}
  });
  showApprovalPrompt(req,_lastActive||{}); // optimistic: don't wait a poll cycle to see my own panel
  return true;
}
// "Tumunu simule et": keep auto-advancing free rounds; pause (and wait) at the first friend matchup.
function tryFree(){
  if(!_autoAll)return;
  while(_round<_fixtures.length){
    var required=requiredPids(_fixtures[_round],_lastActive||{});
    if(required.length){requestAdvance();return;}
    writeRound(_round+1);advanceRound(false);
  }
  _autoAll=false;
}
function handleSimRequest(req,active){
  var required=requiredPids(_fixtures[_round],active);
  var approvals=req.approvals||{};
  var allApproved=required.every(function(pid){return approvals[pid];});
  if(allApproved){writeRound(_round+1);advanceRound(narrateFor(req,active,_round));return;}
  if(required.indexOf(ME.id)>=0)showApprovalPrompt(req,active);
  else hideApprovalBanner();
}
// Called every poll while phase==="league": catches this client up to the shared round
// counter and drives the approval banner.
function onLeaguePoll(data,active){
  _lastActive=active;
  _lastSimReq=data.simReq||null;
  var remoteRound=data.round||0;
  while(_round<remoteRound&&_round<_fixtures.length){
    advanceRound(narrateFor(_lastSimReq,active,_round));
  }
  if(_lastSimReq&&_lastSimReq.round===_round)handleSimRequest(_lastSimReq,active);
  else hideApprovalBanner();
  if(_autoAll)tryFree();
}
function nickFor(pid){
  for(var i=0;i<_league.length;i++)if(_league[i].pid===pid)return _league[i].nick||_league[i].name;
  return "Rakip";
}
// Shown to BOTH sides of a friend matchup at once: the requester waiting for approval, and the
// other player deciding whether to approve -- either one can also toggle "yaziyla anlat" here,
// so the narration choice is a shared decision rather than something set before the request exists.
function showApprovalPrompt(req,active){
  var el=G("simApproval");if(!el)return;
  el.classList.remove("hidden");
  var approvals=req.approvals||{};
  var votes=req.narrateVotes||{};
  var m=_fixtures[req.round]&&_fixtures[req.round].filter(function(x){
    var h=tById(x.h),a=tById(x.a);return h.isHuman&&a.isHuman;
  })[0];
  var fixtureLbl=m?esc(tById(m.h).name)+" - "+esc(tById(m.a).name):"";
  var head='<p class="text-sm text-mist mb-2">Bu hafta: <b class="text-gold-light">'+fixtureLbl+'</b></p>';
  var narrRow='<label class="flex items-center gap-2 text-xs text-mist mb-2"><input type="checkbox" id="narrVoteCk"'+(votes[ME.id]?" checked":"")+'> Bu haftayi yaziyla anlat</label>';
  if(approvals[ME.id]){
    el.innerHTML=head+narrRow+'<p class="text-sm text-mist mb-2">'
      +(req.by===ME.id?"Onay bekleniyor, karsi taraf onaylayinca hafta ilerleyecek.":"Onayladin, hafta ilerleyecek.")
      +'</p><button class="btn btn-sm btn-ghost" id="cancelSimBtn">Istegi iptal et</button>';
    G("cancelSimBtn").onclick=rejectSim;
  } else {
    el.innerHTML=head+narrRow+'<p class="text-sm text-mist mb-2"><b class="text-gold-light">'+esc(nickFor(req.by))+'</b> haftayi simule etmek istiyor. Onayliyor musun?</p>'
      +'<div class="flex gap-2"><button class="btn btn-sm btn-pri" id="apprSimBtn">Onayla</button><button class="btn btn-sm btn-ghost" id="rejSimBtn">Reddet</button></div>';
    G("apprSimBtn").onclick=approveSim;
    G("rejSimBtn").onclick=rejectSim;
  }
  G("narrVoteCk").onchange=function(){voteNarrate(this.checked);};
}
function hideApprovalBanner(){var el=G("simApproval");if(el){el.classList.add("hidden");el.innerHTML="";}}
function approveSim(){
  var o={};o[ME.id]=true;
  dbUpdate("rooms/"+ROOM+"/simReq/approvals",o,function(err){
    if(err)banner("Onay gonderilemedi. Firebase kurallari guncel olmayabilir; tekrar dene.",true);
  });
}
function voteNarrate(want){
  var o={};o[ME.id]=!!want;
  dbUpdate("rooms/"+ROOM+"/simReq/narrateVotes",o,function(err){
    if(err)banner("Anlatim tercihi kaydedilemedi. Firebase kurallari guncel olmayabilir; tekrar dene.",true);
  });
}
function rejectSim(){_autoAll=false;dbDelete("rooms/"+ROOM+"/simReq");hideApprovalBanner();banner("Simulasyon istegi iptal edildi/reddedildi.");}

// The actual deterministic simulation + render step. Every client calls this once per
// round, either right after seeing full approval or while catching up to the shared counter.
function advanceRound(narrate){
  if(_round>=_fixtures.length)return false;
  _myPendingReqRound=null;
  var matches=_fixtures[_round];
  var res=matches.map(function(m){return simMatch(m.h,m.a);});
  _log.push({r:_round+1,res:res});_round++;
  renderPills();renderTable();renderScorers();renderAssists();renderNextFixture();renderRound(_log[_log.length-1]);
  maybeShowNarration(matches,res,narrate);
  if(_round>=_fixtures.length)onEnd();
  return true;
}
function renderRound(entry){
  var box=document.createElement("div");box.className="mb-2.5 rounded-lg border border-gold/20 overflow-hidden";
  var h=document.createElement("div");h.className="px-3 py-[7px] bg-pitch-700 text-[11px] text-gold-light font-bold font-narrow";h.textContent="Hafta "+entry.r;box.appendChild(h);
  entry.res.forEach(function(r){
    var hm=tById(r.h),am=tById(r.a);
    var row=document.createElement("div");
    row.className="flex items-center gap-[3px] px-2.5 py-1.5 text-[11.5px] border-t border-white/5"+((hm.isMe||am.isMe)?" bg-gold/5":"");
    row.innerHTML='<div class="flex-1 flex items-center gap-1 min-w-0"><span class="crest w-4 h-4 text-[6px]" style="background:linear-gradient(135deg,'+hm.c1+','+hm.c2+');color:'+contrast(hm.c1)+';">'+hm.s+'</span><span class="truncate">'+hm.name+'</span></div>'
      +'<div class="font-narrow text-[13px] font-bold text-gold-light min-w-[42px] text-center shrink-0">'+r.gh+'-'+r.ga+'</div>'
      +'<div class="flex-1 flex items-center justify-end gap-1 min-w-0"><span class="truncate">'+am.name+'</span><span class="crest w-4 h-4 text-[6px]" style="background:linear-gradient(135deg,'+am.c1+','+am.c2+');color:'+contrast(am.c1)+';">'+am.s+'</span></div>';
    box.appendChild(row);
  });
  G("flog").insertBefore(box,G("flog").firstChild);
}

// ─── TEXT NARRATION (friend-vs-friend matches only, opt-in per request) ───
var _narrQueue=[],_narrIdx=0,_narrScore=[0,0],_narrTeams=null;
function maybeShowNarration(matches,res,narrate){
  if(!narrate)return;
  var mine=null;
  for(var i=0;i<matches.length;i++){if(matches[i].h===ME.teamId||matches[i].a===ME.teamId){mine=res[i];break;}}
  if(!mine)return;
  var hT=tById(mine.h),aT=tById(mine.a);
  if(!(hT.isHuman&&aT.isHuman))return;
  _narrTeams={h:hT,a:aT};
  _narrQueue=mine.goals.slice();_narrIdx=0;_narrScore=[0,0];
  G("mcast").classList.replace("hidden","flex");
  renderNarrStep();
}
function renderNarrStep(){
  var box=G("mcastBody");if(!box)return;
  if(_narrIdx>0){
    var g=_narrQueue[_narrIdx-1];
    if(g.team===_narrTeams.h.id)_narrScore[0]++;else _narrScore[1]++;
    var line=document.createElement("p");
    line.className="text-sm leading-relaxed mb-1.5";
    line.innerHTML="<b class=\"text-gold-light\">"+g.min+"'</b> GOL! "+esc(g.scorer?g.scorer.n:"?")+" ("+(g.team===_narrTeams.h.id?_narrTeams.h.name:_narrTeams.a.name)+")"+(g.assist?" &mdash; asist: "+esc(g.assist.n):"")+" &mdash; "+_narrScore[0]+"-"+_narrScore[1];
    box.appendChild(line);
    box.scrollTop=box.scrollHeight;
  }
  var done=_narrIdx>=_narrQueue.length;
  G("mcastNext").classList.toggle("hidden",done);
  if(done){
    var end=document.createElement("p");
    end.className="text-sm font-bold text-gold-light mt-2";
    end.textContent="Mac sonucu: "+_narrTeams.h.name+" "+_narrScore[0]+"-"+_narrScore[1]+" "+_narrTeams.a.name;
    box.appendChild(end);
  }
}
function narrNext(){_narrIdx++;renderNarrStep();}
function closeNarration(){G("mcast").classList.replace("flex","hidden");G("mcastBody").innerHTML="";}

// ─── SEASON END ───
function onEnd(){
  stopPoll();
  G("nextBtn").disabled=true;G("allBtn").disabled=true;
  var table=sorted(),champ=table[0],myRank=0;
  for(var i=0;i<table.length;i++)if(table[i].isMe){myRank=i+1;break;}
  var c=G("champ");
  var h2='<h2 class="text-xl text-gold-light mb-2">', p='<p class="text-mist text-[13px] leading-relaxed mb-[18px]">';
  var review='<button class="btn btn-ghost" onclick="closeChampOverlay()">Sonuclari incele</button>';
  if(champ.isMe){
    c.innerHTML='<span class="block text-[50px] mb-3">&#127942;</span>'+h2+'Sampiyonluk senin!</h2>'
      +p+(TS[ME.teamId]?TS[ME.teamId].name:"Takimin")+' sezonu <b>'+champ.Pts+'</b> puanla lider tamamladi!</p>'
      +'<div class="flex flex-wrap gap-2 justify-center"><button class="btn btn-pri" onclick="newSeason()">Yeni sezon</button>'+review+'</div>';
  } else {
    var lbl=champ.isHuman?esc(champ.nick)+" ("+champ.name+")":champ.name;
    c.innerHTML='<span class="block text-[50px] mb-3">&#9917;</span>'+h2+'Sezon tamamlandi</h2>'
      +p+myRank+". oldun. Sampiyon: <b>"+lbl+"</b> ("+champ.Pts+" puan).</p>"
      +'<div class="flex flex-wrap gap-2 justify-center"><button class="btn btn-pri" onclick="newSeason()">Tekrar dene</button>'+review+'</div>';
  }
  G("ov").classList.replace("hidden","flex");
}
// The champion overlay can be dismissed to browse the finished table/gol krallik without
// forcing a new season; a small pill brings it back up.
function closeChampOverlay(){
  G("ov").classList.replace("flex","hidden");
  var sb=G("showChampBtn");if(sb)sb.classList.remove("hidden");
}
function openChampOverlay(){G("ov").classList.replace("hidden","flex");}
function newSeason(){
  if(ROOM)dbDelete("rooms/"+ROOM);
  location.reload();
}
