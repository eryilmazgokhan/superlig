// Screen 2: formation buttons and draggable pitch nodes.
function buildFormation(key){
  loc.fkey=key;
  loc.slots=FORMATIONS[key].map(function(s){return{p:s.p,x:s.x,y:s.y,isGK:s.p==="GK"};});
  loc.assigned=new Array(loc.slots.length).fill(null);
  loc.cache={};
  var el=G("fbts");if(!el)return;
  el.innerHTML="";
  Object.keys(FORMATIONS).forEach(function(k){
    var b=document.createElement("button");
    b.className="px-3.5 py-2.5 rounded-lg border font-narrow text-sm "+(k===key?"border-gold text-gold-light bg-pitch-700":"border-gold/25 text-mist bg-pitch-800");
    b.textContent=k;
    b.onclick=function(){buildFormation(k);renderNodes();};
    el.appendChild(b);
  });
}
function roleForPos(x,y){
  if(y>=70){if(x<=28)return"LB";if(x>=72)return"RB";return"CB";}
  if(y>=58)return"DM";
  if(y>=44){if(x<=22)return"LM";if(x>=78)return"RM";return"CM";}
  if(y>=30)return"AM";
  if(x<=28)return"LW";if(x>=72)return"RW";return"ST";
}
function renderNodes(){
  var pitch=G("pitch");if(!pitch)return;
  var old=pitch.querySelectorAll(".node");
  for(var i=0;i<old.length;i++)old[i].parentNode.removeChild(old[i]);
  loc.slots.forEach(function(s){
    var n=document.createElement("div");
    n.className="node";n.style.left=s.x+"%";n.style.top=s.y+"%";n.textContent=s.p;
    makeDrag(n,pitch,s);pitch.appendChild(n);
  });
}
function makeDrag(node,wrap,slot){
  function place(cx,cy){
    var r=wrap.getBoundingClientRect();
    var x=Math.max(5,Math.min(95,((cx-r.left)/r.width)*100));
    var y=Math.max(4,Math.min(94,((cy-r.top)/r.height)*100));
    slot.x=x;slot.y=y;
    if(!slot.isGK)slot.p=roleForPos(x,y);
    node.style.left=x+"%";node.style.top=y+"%";node.textContent=slot.p;
  }
  if(window.PointerEvent){
    node.addEventListener("pointerdown",function(e){
      try{node.setPointerCapture(e.pointerId);}catch(ex){}
      function mv(ev){place(ev.clientX,ev.clientY);}
      function up(){try{node.releasePointerCapture(e.pointerId);}catch(ex){}node.removeEventListener("pointermove",mv);node.removeEventListener("pointerup",up);}
      node.addEventListener("pointermove",mv);node.addEventListener("pointerup",up);
    });
  } else {
    node.addEventListener("touchstart",function(){
      function mv(ev){ev.preventDefault();var t=ev.touches[0];if(t)place(t.clientX,t.clientY);}
      function up(){node.removeEventListener("touchmove",mv);node.removeEventListener("touchend",up);}
      node.addEventListener("touchmove",mv,{passive:false});node.addEventListener("touchend",up);
    });
  }
}
