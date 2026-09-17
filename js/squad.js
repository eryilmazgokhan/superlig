// Screen 3: squad slots, candidate picker, ready state.
function renderSquad(){
  var p=G("spitch");if(!p)return;p.innerHTML="";
  loc.slots.forEach(function(s,idx){
    var el=document.createElement("div");el.className="slot";
    el.style.left=s.x+"%";el.style.top=s.y+"%";el.dataset.idx=idx;
    el.onclick=function(){openCands(idx);};p.appendChild(el);
  });
  refreshSlots();updateProg();
}
function refreshSlots(){
  var els=document.querySelectorAll("#spitch .slot");
  for(var i=0;i<els.length;i++){
    var idx=+els[i].dataset.idx,s=loc.slots[idx],pl=loc.assigned[idx];
    els[i].className="slot"+(pl?" slot-filled":"")+(idx===loc.focusIdx?" slot-focus":"");
    if(pl){
      els[i].innerHTML='<div class="text-[7.5px] text-gold font-bold">'+s.p+'</div><div class="text-[8px] truncate max-w-[44px]">'+pl.name.split(" ").pop()+'</div><div class="text-[8px] text-gold-light">'+pl.pw+'</div>';
    } else {
      els[i].innerHTML='<div class="text-[7.5px] text-gold font-bold">'+s.p+'</div><div>sec</div>';
    }
  }
}
function updateProg(){
  var f=loc.assigned.filter(Boolean).length,t=loc.slots.length;
  var sp=G("sqprog");if(sp)sp.innerHTML='Kadro: <b class="text-gold-light">'+f+'/'+t+'</b>';
  var rb=G("readyBtn");if(rb)rb.disabled=(f<t);
}
function openCands(idx){
  loc.focusIdx=idx;refreshSlots();
  var slot=loc.slots[idx],cur=loc.assigned[idx];
  if(!loc.cache[idx]){
    var types=COMPAT[slot.p]||[slot.p];
    var elig=loc.pool.filter(function(p){return types.indexOf(p.type)>=0;});
    loc.cache[idx]=shuffled(elig).slice(0,5);
  }
  var cands=loc.cache[idx].slice();
  if(cur&&!cands.some(function(p){return p.id===cur.id;}))cands=[cur].concat(cands).slice(0,6);
  var taken={};loc.assigned.forEach(function(p,i){if(p&&i!==idx)taken[p.id]=true;});
  var panel=G("cpanel");if(!panel)return;
  panel.innerHTML='<h3 class="text-[13px] text-gold-light mb-2.5">'+slot.p+' adaylari</h3>';
  cands.forEach(function(p){
    var isTaken=taken[p.id],isCur=cur&&cur.id===p.id,t2=TS[p.club]||{c1:"#333",c2:"#666",name:p.club};
    var row=document.createElement("div");row.className="cand"+(isTaken?" opacity-25":"");
    row.innerHTML='<div class="flex-1 min-w-0"><div class="text-[13px] font-semibold truncate">'+p.name+(isCur?" ✓":"")+'</div>'
      +'<div class="flex items-center gap-1 mt-0.5 text-[10px] text-dim"><span class="crest w-[13px] h-[13px] text-[5px]" style="background:linear-gradient(135deg,'+t2.c1+","+t2.c2+');color:'+contrast(t2.c1)+';">'+p.club+'</span>'+t2.name+'</div></div>'
      +'<div class="font-narrow text-[15px] font-bold text-gold-light min-w-[26px] text-right">'+p.pw+'</div>'
      +(isTaken?"":'<button class="cb">Sec</button>');
    if(!isTaken){
      (function(player){row.querySelector(".cb").onclick=function(){loc.assigned[idx]=player;refreshSlots();updateProg();openCands(idx);};})(p);
    }
    panel.appendChild(row);
  });
}
function renderReadyChips(players){
  var el=G("rchips");if(!el)return;el.innerHTML="";
  Object.keys(players).forEach(function(pid){
    var p=players[pid];
    var chip=document.createElement("span");
    chip.className="px-[11px] py-1 rounded-full text-xs font-semibold border "+(p.ready?"bg-green-700/20 border-green-500 text-ok":"bg-white/5 border-white/15 text-dim");
    chip.textContent=p.nick+(p.ready?" ✓":"...");
    el.appendChild(chip);
  });
}
function markReady(){
  var myPw=Math.round(loc.assigned.reduce(function(s,p){return s+p.pw;},0)/loc.assigned.length)+2;
  dbUpdate("rooms/"+ROOM+"/players/"+ME.id,{ready:true,squadPw:myPw},function(){
    G("readyBtn").disabled=true;
    G("readyBtn").textContent="Diger oyuncular bekleniyor...";
    banner("Hazirsin! Diger oyuncular tamamlayana kadar bekle.");
  });
}
