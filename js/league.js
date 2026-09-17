// Screen 4: fixtures, match simulation, table, season end.
function buildLeague(players, seed){
  _rng=mulberry32(seed||1);
  var humanTeams={};
  Object.keys(players).forEach(function(pid){
    var p=players[pid];
    if(p.teamId)humanTeams[p.teamId]={nick:p.nick,pw:p.squadPw||TS[p.teamId].pw,isMe:pid===ME.id};
  });
  _league=TEAMS.map(function(t){
    var h=humanTeams[t.id];
    var pw=h?h.pw:t.pw+(Math.floor(_rng()*7)-3);
    return{id:t.id,name:t.name,s:t.s,c1:t.c1,c2:t.c2,pw:pw,
      isMe:h?h.isMe:false,isHuman:!!h,nick:h?h.nick:null,
      P:0,W:0,D:0,L:0,GF:0,GA:0,Pts:0};
  });
  _fixtures=makeFixtures(_league.map(function(t){return t.id;}));
  _round=0;_log=[];
  renderPills();renderTable();G("flog").innerHTML="";
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
function simMatch(hId,aId){
  var h=tById(hId),a=tById(aId),d=h.pw-a.pw;
  var gh=poisson(Math.max(.4,1.4+d/14),_rng),ga=poisson(Math.max(.4,1.1-d/14),_rng);
  h.P++;a.P++;h.GF+=gh;h.GA+=ga;a.GF+=ga;a.GA+=gh;
  if(gh>ga){h.W++;a.L++;h.Pts+=3;}else if(gh<ga){a.W++;h.L++;a.Pts+=3;}else{h.D++;a.D++;h.Pts++;a.Pts++;}
  return{h:hId,a:aId,gh:gh,ga:ga};
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
function simRound(){
  if(_round>=_fixtures.length)return false;
  var matches=_fixtures[_round];
  var res=matches.map(function(m){return simMatch(m.h,m.a);});
  _log.push({r:_round+1,res:res});_round++;
  renderPills();renderTable();renderRound(_log[_log.length-1]);
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
function onEnd(){
  G("nextBtn").disabled=true;G("allBtn").disabled=true;
  var table=sorted(),champ=table[0],myRank=0;
  for(var i=0;i<table.length;i++)if(table[i].isMe){myRank=i+1;break;}
  var c=G("champ");
  var h2='<h2 class="text-xl text-gold-light mb-2">', p='<p class="text-mist text-[13px] leading-relaxed mb-[18px]">';
  if(champ.isMe){
    c.innerHTML='<span class="block text-[50px] mb-3">&#127942;</span>'+h2+'Sampiyonluk senin!</h2>'
      +p+(TS[ME.teamId]?TS[ME.teamId].name:"Takimin")+' sezonu <b>'+champ.Pts+'</b> puanla lider tamamladi!</p>'
      +'<button class="btn btn-pri" onclick="location.reload()">Yeni sezon</button>';
  } else {
    var lbl=champ.isHuman?esc(champ.nick)+" ("+champ.name+")":champ.name;
    c.innerHTML='<span class="block text-[50px] mb-3">&#9917;</span>'+h2+'Sezon tamamlandi</h2>'
      +p+myRank+". oldun. Sampiyon: <b>"+lbl+"</b> ("+champ.Pts+" puan).</p>"
      +'<button class="btn btn-pri" onclick="location.reload()">Tekrar dene</button>';
  }
  G("ov").classList.replace("hidden","flex");
  if(ROOM)dbDelete("rooms/"+ROOM);
}
