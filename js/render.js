// V14 — FG-001: isolated decorative sprites, never part of the simulation.
const tetsuNature = Object.fromEntries(Object.entries({"lotus":"assets/nature/loto.webp","crystals":"assets/nature/cristales.webp","branch":"assets/nature/rama-sakura.webp","petal0":"assets/nature/petalo-1.webp","petal1":"assets/nature/petalo-2.webp","petal2":"assets/nature/petalo-3.webp","petal3":"assets/nature/petalo-4.webp","petal4":"assets/nature/petalo-5.webp"}).map(([key,src])=>{const image=AssetHealth.image(src);return [key,image];}));
const natureMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let natureTime=0;
const naturePetals=Array.from({length:14},(_,i)=>({x:((i*0.61803398875+.13)%1),y:((i*0.41421356237+.19)%1),speed:12+(i%5)*4,drift:9+(i%4)*4,phase:i*2.39996,size:7+(i%4)*2,spin:(i%2?1:-1)*(.18+(i%3)*.12),key:'petal'+i%5}));
function drawNatureSprite(key,x,y,w,alpha=1,angle=0){
 const img=tetsuNature[key];if(!img||!img.complete||!img.naturalWidth)return;
 const h=w*img.naturalHeight/img.naturalWidth;
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=alpha;ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();
}
function drawTetsuNature(){
 const reduced=natureMotion.matches,t=reduced?0:natureTime,mobile=width<height;
 const size=Math.min(width*.19,height*.20,185), branchW=Math.min(width*.28,height*.26,230);
 drawNatureSprite('branch',branchW*.12,height*.15,branchW,.63,reduced?0:Math.sin(t*.55)*.025);
 drawNatureSprite('crystals',size*.26,height-size*.25,size,.85);
 const lotusW=Math.min(width*.13,height*.12,91);
 drawNatureSprite('lotus',width*(mobile?.17:.21)+Math.sin(t*.45)*3,height*.79+Math.sin(t*.9)*2,lotusW,.76,Math.sin(t*.4)*.025);
 if(reduced)return;
 const count=mobile?9:14;
 for(let i=0;i<count;i++){
  const p=naturePetals[i],span=height+40;
  const y=((p.y*span+t*p.speed)%span)-20;
  const x=p.x*width+Math.sin(t*.48+p.phase)*p.drift;
  drawNatureSprite(p.key,x,y,p.size,.40+.12*Math.sin(t*.8+p.phase),p.phase+t*p.spin);
 }
}

// V15 — FX-001: additive texture effects, cosmetic only.
const astralFX=Object.fromEntries(Object.entries({"wave":"assets/fx/onda-cian.webp","gold":"assets/fx/explosion-dorada.webp","star":"assets/fx/destello.webp","vortex":"assets/fx/remolino-magenta.webp","shards":"assets/fx/fragmentos.webp","seal":"assets/fx/sello-ceremonial.webp"}).map(([key,src])=>{const image=AssetHealth.image(src);return [key,image];}));
const astralBursts=[];
function addAstralFX(key,x,y,size,alpha,duration,priority=0){
 if(natureMotion.matches)return;
 const cap=width<height?8:12;
 if(astralBursts.length>=cap){const index=astralBursts.findIndex(f=>f.priority<=priority);if(index<0)return;astralBursts.splice(index,1);}
 astralBursts.push({key,x,y,size,alpha,duration,age:0,priority});
}
function updateAstralFX(dt){
 if(natureMotion.matches){astralBursts.length=0;return;}
 for(let i=astralBursts.length-1;i>=0;i--){const f=astralBursts[i];f.age+=dt;if(f.age>=f.duration)astralBursts.splice(i,1);}
}
function drawAstralFX(){
 if(natureMotion.matches||!astralBursts.length)return;
 ctx.save();ctx.globalCompositeOperation='lighter';
 for(const f of astralBursts){
  const img=astralFX[f.key];if(!img.complete||!img.naturalWidth)continue;
  const t=Math.min(1,f.age/f.duration),rise=Math.min(1,(t+.08)*5),fade=(1-t)*(1-t);
  const d=f.size*(.55+.65*(1-Math.pow(1-t,2)));
  ctx.save();ctx.translate(f.x,f.y);ctx.rotate((f.key==='vortex'?-.8:.35)*t);
  ctx.globalAlpha=f.alpha*rise*fade;ctx.drawImage(img,-d/2,-d/2,d,d);ctx.restore();
 }
 ctx.restore();
}

let cachedVeilKey = '', cachedVeil = null;
function drawZenBackground(){
  // Static landscape is rendered by CSS, never regenerated per frame.
  const key = `${width}:${cy}:${trackHeight}`;
  if (key !== cachedVeilKey){
    cachedVeilKey=key;
    cachedVeil=ctx.createLinearGradient(0,cy-trackHeight*2,0,cy+trackHeight*2);
    cachedVeil.addColorStop(0,'#03091800');cachedVeil.addColorStop(.36,'#030918a6');cachedVeil.addColorStop(.64,'#030918a6');cachedVeil.addColorStop(1,'#03091800');
  }
  ctx.fillStyle=cachedVeil;ctx.fillRect(0,cy-trackHeight*2,width,trackHeight*4);
}
// V18: cached conduit geometry and visual-only resonance.
const CONDUIT_COLORS=['#39eaff','#ff40cb','#ffd078'];
function emitLanePulse(lane,x,color,strength=1){
  if(natureMotion.matches)return;
  if(lanePulses.length>=8)lanePulses.shift();
  lanePulses.push({lane,u:Math.max(0,Math.min(1,(x-cx)/(2*trackHalfSpan)+.5)),color,strength,age:0});
}
function updateLanePulses(dt){
  if(natureMotion.matches){lanePulses.length=0;return;}
  for(let i=lanePulses.length-1;i>=0;i--){lanePulses[i].age+=dt;if(lanePulses[i].age>=.68)lanePulses.splice(i,1);}
}
function getConduitGeometry(lane){
  const key=state.milestoneIndex+':'+lane;
  let geometry=routeCache.get(key);if(geometry)return geometry;
  const points=Array.from({length:111},(_,i)=>evalLaneAt(i/110,lane));
  const track=Math.max(10,slotRadius*1.45),center=new Path2D(),edgeA=new Path2D(),edgeB=new Path2D();
  let length=0;
  for(let i=0;i<points.length;i++){
    const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    const d=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/d,ny=(b.x-a.x)/d;
    const op=i?'lineTo':'moveTo',offset=track*.36;
    center[op](p.x,p.y);edgeA[op](p.x+nx*offset,p.y+ny*offset);edgeB[op](p.x-nx*offset,p.y-ny*offset);
    if(i)length+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y);
  }
  geometry={center,edgeA,edgeB,track,length};routeCache.set(key,geometry);return geometry;
}
function drawRoadwayLane(laneIndex,env){
  const g=getConduitGeometry(laneIndex),t=g.track;
  const color=state.centerLevel!==null?'#ffcf73':CONDUIT_COLORS[laneIndex%3];
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  const stroke=(path,c,w,a=1)=>{ctx.strokeStyle=c;ctx.lineWidth=w;ctx.globalAlpha=a;ctx.stroke(path);};
  stroke(g.center,'#020713',t+9,.82);stroke(g.center,color,t+12,.11);stroke(g.center,color,t+6,.22);
  stroke(g.center,'#a9702c',t+2,.95);stroke(g.center,'#101729',t-1,.98);stroke(g.center,color,t*.71,.18);
  stroke(g.edgeA,color,Math.max(1.5,t*.105),.9);stroke(g.edgeB,color,Math.max(1.5,t*.105),.85);stroke(g.edgeB,'#fff5d6',Math.max(.65,t*.035),.82);
  if(!natureMotion.matches){
    const repeats=Math.max(4,Math.round(g.length/(t*1.7))),period=g.length/repeats,dir=laneIndex%2?-1:1;
    ctx.setLineDash([period*.36,period*.64]);ctx.lineDashOffset=-state.trackPhase*dir*g.length;
    stroke(g.center,color,Math.max(3,t*.29),.65);stroke(g.center,'#fff7c6',Math.max(1,t*.085),.95);ctx.setLineDash([]);
    for(const p of lanePulses){
      if(p.lane!==laneIndex)continue;
      const progress=p.age/.68,alpha=Math.min(.9,p.strength)*(1-progress);
      for(const sign of [-1,1]){
        const head=p.u+sign*progress*.72,trail=new Path2D();let started=false;
        if(head<-.15||head>1.15)continue;
        for(let j=0;j<=8;j++){
          const u=head-sign*(.025+progress*.09)*j/8;if(u<0||u>1)continue;
          const v=evalLaneAt(u,laneIndex);if(!started){trail.moveTo(v.x,v.y);started=true;}else trail.lineTo(v.x,v.y);
        }
        if(started){stroke(trail,p.color,t*.60,alpha*.45);stroke(trail,'#fff5df',Math.max(1,t*.15),alpha);}
      }
    }
  }
  ctx.restore();
}

const bambooGateSprite = AssetHealth.image('assets/nature/bambu-portal.webp');
function drawBambooGates(laneCount, foreground) {
  if (!bambooGateSprite.complete || !bambooGateSprite.naturalWidth) return;
  const ratio = bambooGateSprite.naturalWidth / bambooGateSprite.naturalHeight;

  ctx.save();
  ctx.globalAlpha = foreground ? .96 : .82;
  for (let lane = 0; lane < laneCount; lane++) {
    for (const end of [0, 1]) {
      const point = evalLaneAt(end, lane);
      const outward = end === 0 ? -1 : 1;
      const height = slotRadius * (foreground ? 1.72 : 2.35);
      const width = height * ratio;
      const offset = slotRadius * (foreground ? .47 : .87);
      ctx.save();
      ctx.translate(point.x + outward * offset, point.y + slotRadius * (foreground ? .68 : -.29));
      ctx.scale(outward * (foreground ? -1 : 1), 1);
      ctx.drawImage(bambooGateSprite, -width / 2, -height / 2, width, height);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawEmptySocket(pos,lane){
  const r=slotRadius,color=state.centerLevel!==null?THEME.gold:CONDUIT_COLORS[lane%3];
  ctx.save();ctx.translate(pos.x,pos.y);
  ctx.beginPath();ctx.arc(0,0,r*.88,0,Math.PI*2);ctx.fillStyle='#061324dc';ctx.fill();ctx.lineWidth=Math.max(1,r*.08);ctx.strokeStyle=color;ctx.globalAlpha=.76;ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,r*.65,0,Math.PI*2);ctx.lineWidth=1;ctx.strokeStyle='#d8f6ff';ctx.globalAlpha=.42;ctx.stroke();
  ctx.globalAlpha=.95;ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,Math.max(2,r*.13),0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawFallbackLauncherPlatform(x,y){
 const r=slotRadius*1.9;ctx.save();ctx.translate(x,y+slotRadius*.95);
 for(const [scale,c,w] of [[1.17,'#ff36cd33',5],[1,'#ffc96d',3],[.87,'#3eeaff',2],[.68,'#86faff',2]]){ctx.beginPath();ctx.ellipse(0,0,r*scale,r*.34*scale,0,0,Math.PI*2);if(scale===1){ctx.fillStyle='#06172b';ctx.fill();}ctx.strokeStyle=c;ctx.lineWidth=w;ctx.stroke();}ctx.restore();
}
// V12: Tetsu PLATFORM-001. Visual only; the launch origin is unchanged.
const tetsuLauncherPlatform = AssetHealth.image('assets/objects/plataforma.webp');
function drawLauncherPlatform(x,y){
 const img=tetsuLauncherPlatform;
 if(!img.complete || !img.naturalWidth){drawFallbackLauncherPlatform(x,y);return;}
 const aspect=img.naturalWidth/img.naturalHeight;
 const top=y+slotRadius*.34+launcherKick();
 const footerTop=getFooterY()-17;
 const w=Math.min(slotRadius*6.6,Math.max(1,footerTop-top-3)*aspect,width*.38);
 const h=w/aspect;
 ctx.save();
 ctx.drawImage(img,x-w/2,top,w,h);
 // A restrained, animated energy ring on the platform surface.
 ctx.globalAlpha=REDUCED_MOTION?.42:.34+.14*Math.sin(state.tick*.10);
 ctx.strokeStyle=getPieceColor(state.nextPiece);
 ctx.lineWidth=1.2;
 ctx.beginPath();ctx.ellipse(x,top+h*.40,w*.255,h*.17,0,0,Math.PI*2);ctx.stroke();
 ctx.restore();
}
function drawMetalRing(radius,color){
 ctx.beginPath();ctx.arc(0,0,radius*.94,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle='#ffd17a';ctx.stroke();
 ctx.beginPath();ctx.arc(0,0,radius*.79,0,Math.PI*2);ctx.lineWidth=1;ctx.strokeStyle=color;ctx.stroke();
 ctx.strokeStyle='#fff2bd';ctx.lineWidth=1.5;for(let j=0;j<4;j++){const a=j*Math.PI/2+.3;ctx.beginPath();ctx.arc(0,0,radius*.94,a,a+.35);ctx.stroke();}
}
const MAKIWARA_STAGES = [
  {name: 'base', combo: 0, color: '#ffd091'},
  {name: 'jade', combo: 2, color: '#a1f998'},
  {name: 'resonante', combo: 4, color: '#dd9dff'},
  {name: 'ascua', combo: 6, color: '#ff925c'},
  {name: 'elemental', combo: 8, color: '#63edff'}
].map(stage => ({
  ...stage,
  sprite: AssetHealth.image(`assets/objects/makiwara-${stage.name}.webp`)
}));

function drawMakiwaraClock(combo, stage, nextStage) {
  const radius = coreTargetRadius * 1.24;
  const marks = MAKIWARA_STAGES.at(-1).combo;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < marks; i++) {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / marks;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(x * radius, y * radius);
    ctx.lineTo(x * (radius + 5), y * (radius + 5));
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#071125';
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = i < combo ? stage.color : '#687687';
    ctx.stroke();
  }
  if (nextStage) {
    ctx.font = `900 ${Math.max(9, Math.round(coreTargetRadius * .32))}px ${THEME.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeStyle = '#071125';
    ctx.lineWidth = 3;
    const label = `×${combo} / ×${nextStage.combo}`;
    ctx.strokeText(label, 0, -radius - 8);
    ctx.fillStyle = '#ffefd3';
    ctx.fillText(label, 0, -radius - 8);
  }
  ctx.restore();
}

function drawMakiwara() {
  const combo = state.bestCombo;
  const stageIndex = MAKIWARA_STAGES.findLastIndex(stage => combo >= stage.combo);
  const stage = MAKIWARA_STAGES[stageIndex];
  const coreActive = state.centerLevel !== null;
  const elemental = stageIndex === MAKIWARA_STAGES.length - 1;
  const {sprite} = stage;
  drawMakiwaraClock(combo, stage, MAKIWARA_STAGES[stageIndex + 1]);
  if (!sprite.complete || !sprite.naturalWidth) return;

  const pulse = REDUCED_MOTION ? 1 : 1 + Math.sin(state.tick * .09) * .07;
  const height = coreTargetRadius * 2.15 * Math.min(1.25, state.coreScaleAnim) * pulse;
  const width = height * sprite.naturalWidth / sprite.naturalHeight;
  if (elemental || coreActive) {
    ctx.shadowColor = elemental ? stage.color : THEME.gold;
    ctx.shadowBlur = 12 * pulse;
  }
  ctx.drawImage(sprite, -width / 2, -height * .36, width, height);
  ctx.shadowBlur = 0;
  if (coreActive) {
    ctx.font = `900 ${Math.max(11, Math.round(coreTargetRadius * .50))}px ${THEME.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#071125';
    ctx.lineWidth = 3;
    ctx.strokeText(String(state.centerLevel), 0, 0);
    ctx.fillStyle = '#fff9dc';
    ctx.fillText(String(state.centerLevel), 0, 0);
  }
}

function drawBerkanCenter() {
  ctx.save();
  ctx.translate(cx, cy);
  drawMakiwara();
  ctx.restore();
}

// OBJ-001: Tetsu fruit medallions, independent of gameplay collision geometry.
const tetsuFruitSprites = Object.fromEntries(Object.entries({"cherry":"assets/fruit/cereza.webp","lemon":"assets/fruit/limon.webp","berry":"assets/fruit/fresa.webp","orange":"assets/fruit/naranja.webp"}).map(([key,src]) => {
  const image = AssetHealth.image(src); return [key,image];
}));
function drawFruitOrb(x, y, radius, piece, scale = 1) {
  const fruit = piece.fruit || FRUITS[0];
  const sprite = tetsuFruitSprites[fruit.id];
  if (sprite && sprite.complete && sprite.naturalWidth) {
    const pulse = 1 + Math.sin(state.tick * 0.16) * 0.04;
    const r = radius * scale * pulse;
    ctx.drawImage(sprite, x-r, y-r, r*2, r*2);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + Math.sin(state.tick * 0.16) * 0.08;
  ctx.scale(scale * pulse, scale * pulse);

  ctx.shadowColor = fruit.color;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 52, 0.94)';
  ctx.fill();
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = fruit.color;
  ctx.stroke();

  ctx.shadowBlur = 0;
  drawMetalRing(radius,fruit.color);
  ctx.font = `${Math.max(13, Math.round(radius * 0.94))}px ${THEME.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Dedicated glyphs, independent of platform emoji fonts.
  const r=radius*.34;
  ctx.fillStyle=fruit.color;ctx.strokeStyle='#ffe9c1';ctx.lineWidth=1;
  if(fruit.id==='cherry'){
    ctx.beginPath();ctx.arc(-r*.72,r*.35,r*.82,0,Math.PI*2);ctx.arc(r*.9,r*.6,r*.82,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#7bf0a4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-r*.72,-r*.35);ctx.quadraticCurveTo(-r*.7,-r*1.8,r*.3,-r*1.6);ctx.lineTo(r*.9,-r*.1);ctx.stroke();
  }else if(fruit.id==='berry'){
    ctx.beginPath();ctx.moveTo(0,r*1.4);ctx.bezierCurveTo(-r*2,-r*.3,-r*1.6,-r*1.5,0,-r*.9);ctx.bezierCurveTo(r*1.6,-r*1.5,r*2,-r*.3,0,r*1.4);ctx.fill();ctx.fillStyle='#fff0ba';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc((i%2?-.45:.35)*r,(i*.36-.65)*r,Math.max(.6,r*.09),0,Math.PI*2);ctx.fill();}
  }else{ctx.beginPath();ctx.ellipse(0,0,fruit.id==='lemon'?r*1.17:r*1.25,r*1.05,fruit.id==='lemon'?-.45:0,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#7bf0a4';ctx.beginPath();ctx.ellipse(r*.45,-r*1.04,r*.62,r*.23,-.6,0,Math.PI*2);ctx.fill();

  ctx.restore();
}

function drawSkullOrb(x, y, radius, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + Math.sin(state.tick * 0.15) * 0.06;
  ctx.scale(scale * pulse, scale * pulse);

  ctx.shadowColor = THEME.sakura;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(0, -radius * 0.12, radius * 0.78, Math.PI * 0.82, Math.PI * 2.18);
  ctx.lineTo(radius * 0.42, radius * 0.68);
  ctx.lineTo(-radius * 0.42, radius * 0.68);
  ctx.closePath();
  ctx.fillStyle = '#090f24';
  ctx.fill();
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = THEME.sakura;
  ctx.beginPath();
  ctx.arc(-radius * 0.28, -radius * 0.12, radius * 0.18, 0, Math.PI * 2);
  ctx.arc(radius * 0.28, -radius * 0.12, radius * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.18, radius * 0.42);
  ctx.lineTo(-radius * 0.18, radius * 0.66);
  ctx.moveTo(0, radius * 0.42);
  ctx.lineTo(0, radius * 0.66);
  ctx.moveTo(radius * 0.18, radius * 0.42);
  ctx.lineTo(radius * 0.18, radius * 0.66);
  ctx.stroke();

  ctx.restore();
}

function drawSuperballNode(x, y, radius, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + Math.sin(state.tick * 0.18) * 0.1;
  ctx.scale(scale * pulse, scale * pulse);

  ctx.shadowColor = THEME.superball;
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(76, 15, 112, 0.94)';
  ctx.fill();
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = THEME.superball;
  ctx.stroke();

  ctx.shadowBlur = 0;
  drawMetalRing(radius,THEME.superball);
  ctx.fillStyle = '#fff0f8';
  ctx.font = `900 ${Math.max(11, Math.round(radius * 0.74))}px ${THEME.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', 0, 1);

  ctx.restore();
}

function drawBombOrb(x, y, radius, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + Math.sin(state.tick * 0.16) * 0.08;
  ctx.scale(scale * pulse, scale * pulse);

  ctx.shadowColor = THEME.bomb;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(42, 12, 16, 0.95)';
  ctx.fill();
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = THEME.bomb;
  ctx.stroke();

  ctx.shadowBlur = 0;
  drawMetalRing(radius,THEME.bomb);
  ctx.strokeStyle = '#ffe600';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.quadraticCurveTo(radius * 0.45, -radius * 1.4, radius * 0.65, -radius * 1.05);
  ctx.stroke();

  const sparkR = 2.6 + Math.sin(state.tick * 0.4) * 1.2;
  ctx.beginPath();
  ctx.arc(radius * 0.65, -radius * 1.05, sparkR, 0, Math.PI * 2);
  ctx.fillStyle = '#fff3b0';
  ctx.fill();

  ctx.fillStyle = '#ffd6a5';
  ctx.font = `900 ${Math.max(10, Math.round(radius * 0.72))}px ${THEME.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 0, 1);

  ctx.restore();
}

function drawHealOrb(x, y, radius, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + Math.sin(state.tick * 0.14) * 0.08;
  ctx.scale(scale * pulse, scale * pulse);

  ctx.shadowColor = THEME.emerald;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 255, 136, 0.28)';
  ctx.fill();
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = THEME.emerald;
  ctx.stroke();

  ctx.shadowBlur = 0;
  drawMetalRing(radius,THEME.emerald);
  ctx.fillStyle = '#d1fae5';
  const barW = Math.max(3, radius * 0.24);
  const barL = radius * 0.9;
  ctx.fillRect(-barL / 2, -barW / 2, barL, barW);
  ctx.fillRect(-barW / 2, -barL / 2, barW, barL);

  ctx.restore();
}

// GEO-001: original Tetsu assets, cleaned and normalized to the existing draw radius.
const tetsuGemSprites = ["assets/gems/nivel-01.webp", "assets/gems/nivel-02.webp", "assets/gems/nivel-03.webp", "assets/gems/nivel-04.webp", "assets/gems/nivel-05.webp", "assets/gems/nivel-06.webp", "assets/gems/nivel-07.webp", "assets/gems/nivel-08.webp", "assets/gems/nivel-09.webp", "assets/gems/nivel-10.webp", "assets/gems/nivel-11.webp", "assets/gems/nivel-12.webp"].map(src => { return AssetHealth.image(src); });
function drawTetsuGem(x,y,radius,piece,rotation,scale) {
  if (piece.kind !== 'normal' || !Number.isInteger(piece.level) || piece.level < 1 || piece.level > tetsuGemSprites.length) return false;
  const image = tetsuGemSprites[piece.level - 1];
  if (!image.complete || !image.naturalWidth) return false;
  ctx.save();
  ctx.translate(x,y); ctx.scale(scale,scale);
  ctx.rotate(rotation);
  ctx.drawImage(image,-radius,-radius,radius*2,radius*2);
  ctx.rotate(-rotation);
  const label = String(piece.level);
  const fontSize = Math.max(10,Math.round(radius * (label.length > 1 ? .82 : .98)));
  ctx.font = `900 ${fontSize}px ${THEME.font}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2,fontSize*.19); ctx.strokeStyle = '#071323';
  ctx.strokeText(label,0,1); ctx.fillStyle = '#ffffff'; ctx.fillText(label,0,1);
  ctx.restore(); return true;
}

const tetsuSpecialSprites = Object.fromEntries(Object.entries({"skull":"assets/special/calavera.webp","bomb":"assets/special/bomba.webp","superball":"assets/special/superbola.webp","heal":"assets/special/vitalidad.webp","accel":"assets/special/aceleracion.webp","slow":"assets/special/ralentizacion.webp"}).map(([key,src])=>{
  const image = AssetHealth.image(src); return [key,image];
}));
function drawTetsuSpecial(x,y,radius,piece,scale) {
  const key = piece.isSkull ? 'skull' : piece.isSuperballNode ? 'superball' : piece.isBomb ? 'bomb' : piece.kind;
  const sprite = tetsuSpecialSprites[key];
  if (!sprite || !sprite.complete || !sprite.naturalWidth) return false;
  const r = radius * scale * (1 + (REDUCED_MOTION ? 0 : Math.sin(state.tick * .15) * .035));
  ctx.drawImage(sprite,x-r,y-r,r*2,r*2);
  return true;
}

function drawPiece(x, y, radius, piece, rotation = 0, scale = 1, overrideColor = null) {
  if (!piece) return;
  if (drawTetsuSpecial(x,y,radius,piece,scale)) return;
  if (piece.isSkull) {
    drawSkullOrb(x, y, radius * 0.92, scale);
    return;
  }
  if (piece.isSuperballNode) {
    drawSuperballNode(x, y, radius * 0.9, scale);
    return;
  }
  if (piece.isBomb) {
    drawBombOrb(x, y, radius * 0.88, scale);
    return;
  }
  if (piece.kind === 'fruit') {
    drawFruitOrb(x, y, radius, piece, scale);
    return;
  }
  if (piece.kind === 'heal') {
    drawHealOrb(x, y, radius * 0.88, scale);
    return;
  }

  if (drawTetsuGem(x,y,radius,piece,rotation,scale)) return;

  const shape = SHAPES[(Math.max(1, piece.level) - 1) % SHAPES.length];
  const color = overrideColor || getPieceColor(piece);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);

  ctx.beginPath();
  if (shape.star) {
    const spikes = shape.sides;
    const outerR = radius;
    const innerR = radius * 0.52;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i * Math.PI) / spikes - Math.PI / 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  } else {
    const sides = shape.sides;
    for (let i = 0; i < sides; i++) {
      const a = (i * Math.PI * 2) / sides - Math.PI / 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
      else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
  }
  ctx.closePath();

  ctx.shadowColor = color;
  ctx.shadowBlur = 0;
  const face=ctx.createLinearGradient(0,-radius,0,radius);face.addColorStop(0,color);face.addColorStop(.30,'#173149');face.addColorStop(.55,'#071327');face.addColorStop(1,'#14213c');ctx.fillStyle=face;
  ctx.fill();
  ctx.strokeStyle = color;ctx.lineWidth=5;ctx.globalAlpha=.22;ctx.stroke();ctx.globalAlpha=1;ctx.lineWidth=2.5;ctx.stroke();ctx.strokeStyle="#e8fcff";ctx.globalAlpha=.53;ctx.lineWidth=.7;ctx.stroke();ctx.globalAlpha=1;

  ctx.shadowBlur = 0;
  ctx.rotate(-rotation);
  ctx.fillStyle = '#ffffff';
  const label = getPieceLabel(piece);
  const fontSize = label.length > 1 ? Math.max(9, Math.round(radius * 0.45)) : Math.max(11, Math.round(radius * 0.64));
  ctx.font = `900 ${fontSize}px ${THEME.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 1);

  ctx.restore();
}

function drawDirectionalReticle(x,y,color,piece,active){
  drawPrediction(x,y,color,piece);
  ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.lineWidth=2;
  const r=slotRadius*1.45+8;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();
  if (!state.replayActive && aimStartedAt !== null) {
    const remaining = Math.max(0, 1 - (state.simFrame - aimStartedAt) / AIM_LIMIT_STEPS);
    ctx.strokeStyle = remaining <= .25 ? '#ff657a' : '#ffdc92';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + remaining * Math.PI * 2);
    ctx.stroke();
  }
  ctx.rotate(state.aimAngle);ctx.fillStyle='#ffcf73';ctx.beginPath();ctx.moveTo(0,-r-12);ctx.lineTo(-5,-r-2);ctx.lineTo(5,-r-2);ctx.closePath();ctx.fill();ctx.restore();
}


const tetsuFrame = AssetHealth.image('assets/ui/marco-universal.webp');
function drawTetsuPanel(x,y,w,h,highlight=false){
  ctx.save();
  ctx.fillStyle=highlight?'#123b50f2':'#071326ed';
  ctx.beginPath();ctx.roundRect(x+2,y+2,w-4,h-4,6);ctx.fill();
  if(tetsuFrame.complete && tetsuFrame.naturalWidth===560){
    const sy=[0,95,114,209],sx=[0,220,340,560];
    const dh=Math.min(12,h*.28),dw=Math.min(28,w*.29);
    const dx=[x,x+dw,x+w-dw,x+w],dy=[y,y+dh,y+h-dh,y+h];
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){
      if(i===1&&j===1)continue;
      ctx.drawImage(tetsuFrame,sx[i],sy[j],sx[i+1]-sx[i],sy[j+1]-sy[j],dx[i],dy[j],dx[i+1]-dx[i],dy[j+1]-dy[j]);
    }
  }else{ctx.strokeStyle='#ffd078';ctx.lineWidth=1.5;ctx.stroke();}
  ctx.restore();
}

// V36: optional per-stage CPU profiling. Disabled outside F3: no timestamps,
// frame buffers or additional drawing operations during normal play.
function markRenderStage(stage) {
  const now = performance.now();
  perf.renderStages[stage] = (perf.renderStages[stage] || 0) + now - perf.renderStageStart;
  perf.renderStageStart = now;
}

function draw() {
  if (perf.visible) perf.renderStageStart = performance.now();
  ctx.clearRect(0, 0, width, height);
  ctx.save();

  drawTetsuNature();
  drawZenBackground();
  if (perf.visible) markRenderStage('scene');

  if (!REDUCED_MOTION && state.shake > 0.4 && !state.isAiming && !state.projectile) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }

  const env = ZEN_ENVIRONMENTS[state.envIndex % ZEN_ENVIRONMENTS.length];
  const laneCount = state.routeParams ? state.routeParams.laneCount : 2;
  for (let l = 0; l < laneCount; l++) {
    drawRoadwayLane(l, env);
  }
  drawBambooGates(laneCount, false);
  if (perf.visible) markRenderStage('conduits');

  drawAstralFX();
  drawCoreCeremony();
  drawBerkanCenter();

  const launchY = getLaunchY();
  drawLauncherPlatform(cx,launchY);
  if (!state.projectile && !state.gameOver && !state.chain && state.hitStop===0) {
    drawDirectionalReticle(cx, launchY, getPieceColor(state.nextPiece), state.nextPiece, state.isAiming || keyState.left || keyState.right);
  }

  if (perf.visible) markRenderStage('core');

  drawShotTrail();
  drawImpactRings();
  for (let i = 0; i < NUM_SLOTS; i++) {
    const pos = getSlotWorldPos(i);
    const slot = state.slots[i];

    if (!slot) {
      drawEmptySocket(pos,getSlotLane(i));
    } else {
      drawAnimatedBoardPiece(i,pos,slot);
    }
  }

  drawBambooGates(laneCount, true);

  if (state.projectile) {
    const p=state.projectile;
    drawPiece(p.x,p.y,slotRadius*.88,p,0,1);
  }

  if (state.reboundProj) {
    ctx.globalAlpha = state.reboundProj.life;
    drawPiece(state.reboundProj.x, state.reboundProj.y, slotRadius * 0.88, state.reboundProj, state.reboundProj.rot, 0.9);
    ctx.globalAlpha = 1;
  }

  for (let sw of state.shockwaves) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, sw.life * 0.82);
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = sw.lineWidth;
    ctx.stroke();
    ctx.restore();
  }

  for (let sb of state.starbursts) {
    ctx.save();
    ctx.translate(sb.x, sb.y);
    ctx.rotate(sb.rot);
    ctx.globalAlpha = Math.max(0, sb.life * 0.9);
    ctx.strokeStyle = sb.color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (let r = 0; r < sb.rays; r++) {
      const a = (r * Math.PI * 2) / sb.rays;
      const inner = slotRadius * 0.55;
      const outer = sb.outerR * (r % 2 === 0 ? 1 : 0.72);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (let pt of state.particles) {
    ctx.globalAlpha = pt.life;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (let ft of state.floatingTexts) {
    ctx.globalAlpha = ft.life;
    ctx.fillStyle = ft.color;
    ctx.font = `900 ${ft.big ? 17 : 14}px ${THEME.font}`;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;
  if (perf.visible) markRenderStage('pieces');

  if (!state.projectile && !state.chain) {
    const activeScale = (state.isAiming ? 1.15 : 1) + state.swapAnim * 0.14;
    drawPiece(cx, launchY, slotRadius * 1.18, state.nextPiece, 0, activeScale);
  }

  const r = swapBoxRect;
  const swapScale = 1 + state.swapAnim * 0.08;
  ctx.save();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.scale(swapScale, swapScale);
  ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));

  drawTetsuPanel(r.x,r.y,r.w,r.h,state.swapAnim>0);

  const previewCenterX = r.x + r.w / 2;
  ctx.fillStyle = THEME.muted;
  ctx.font = `900 10px ${THEME.font}`;
  ctx.textAlign = 'center';
  ctx.fillText(state.pendingAmmo?'SIGUIENTE':'ALTERNAR · C', previewCenterX, r.y + 17,r.w-18);
  drawPiece(previewCenterX, r.y + r.h*.65, Math.min(slotRadius*.78,r.h*.23), state.upcomingPiece, 0, 1);
  ctx.restore();

  let statusText = state.shotCount===0 ? 'ARRASTRA Y SUELTA · A/D + ESPACIO' : 'APUNTA · FUSIONA · RESUENA';
  let statusColor = '#ffffff';
  if (state.tempoTimer > 0 && state.tempoMult > 1) {
    statusText = `RÁFAGA · FUSIONES +40% · ${(state.tempoTimer/60).toFixed(1)} s`;
    statusColor = THEME.accel;
  } else if (state.tempoTimer > 0 && state.tempoMult < 1) {
    statusText = `CALMA · ${(state.tempoTimer/60).toFixed(1)} s`;
    statusColor = THEME.slow;
  } else if (state.nextPiece.kind === 'supercharger') {
    statusText = 'SUPERCHARGER · ASCIENDE UNA FIGURA DE NIVEL';
    statusColor = THEME.supercharger;
  } else if (state.nextPiece.kind === 'heal') {
    statusText = 'ESFERA DE VITALIDAD · RECUPERA +1 VIDA';
    statusColor = THEME.emerald;
  } else if (state.centerLevel !== null) {
    statusText = 'BERKAN NV.10 LISTO · CUELA EL TIRO POR UN HUECO';
    statusColor = THEME.gold;
  }

  const footerY=getFooterY();const footerW=Math.min(width-14,520);
  drawTetsuPanel(cx-footerW/2,footerY-17,footerW,34);
  ctx.fillStyle = statusColor;
  ctx.font = `800 10px ${THEME.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline="middle";ctx.fillText(statusText, cx, footerY, footerW-36);

  ctx.restore();
  if (perf.visible) markRenderStage('hud');
}

// V19 — cosmetic feedback. No changes to collision, scoring or simulation time.
const impactFX={clock:0,kick:0,trail:[],rings:[],merges:new Map(),core:null};
function resetImpactFX(){impactFX.clock=0;impactFX.kick=0;impactFX.trail.length=0;impactFX.rings.length=0;impactFX.merges.clear();impactFX.core=null;}
function launcherKick(){return natureMotion.matches?0:slotRadius*.28*Math.sin(Math.PI*Math.min(1,impactFX.kick/.18));}
function startShotFX(p){if(natureMotion.matches)return;impactFX.kick=.18;impactFX.trail.length=0;trackShotFX(p);addImpactRing(p.x,p.y,getPieceColor(p),slotRadius*1.25,.17,.5);}
function trackShotFX(p){if(natureMotion.matches)return;const tr=impactFX.trail,last=tr[tr.length-1];if(last&&Math.hypot(last.x-p.x,last.y-p.y)<1)return;tr.push({x:p.x,y:p.y,t:impactFX.clock,color:getPieceColor(p)});if(tr.length>14)tr.shift();}
function addImpactRing(x,y,color,radius,duration,alpha){if(natureMotion.matches)return;const rings=impactFX.rings;if(rings.length>=10)rings.shift();rings.push({x,y,color,radius,duration,alpha,age:0});}
function finishShotFX(p,hit,rejected,scored){if(natureMotion.matches||hit.type==='miss')return;const col=rejected?THEME.danger:getPieceColor(p);addImpactRing(p.x,p.y,col,slotRadius*(scored?2.4:1.65),.25,.7);}
function startMergeFX(index,level,color){if(natureMotion.matches)return;impactFX.merges.set(index,{age:0,level,piece:state.slots[index]});const p=getSlotWorldPos(index);addImpactRing(p.x,p.y,color,slotRadius*(level>=7?3:2),.32,.65);}
function startCoreFX(){if(natureMotion.matches)return;impactFX.core={age:0,x:cx,y:cy};}
function updateImpactFX(dt){if(natureMotion.matches){resetImpactFX();return;}const f=impactFX;f.clock+=dt;f.kick=Math.max(0,f.kick-dt);while(f.trail.length&&f.clock-f.trail[0].t>.18)f.trail.shift();for(let i=f.rings.length-1;i>=0;i--){const r=f.rings[i];r.age+=dt;if(r.age>=r.duration)f.rings.splice(i,1);}for(const [i,m] of f.merges){m.age+=dt;if(m.age>=.38||state.slots[i]!==m.piece)f.merges.delete(i);}if(f.core&&(f.core.age+=dt)>=.95)f.core=null;}
function drawShotTrail(){if(natureMotion.matches)return;const tr=impactFX.trail;if(tr.length<2)return;ctx.save();ctx.lineCap='round';for(let i=1;i<tr.length;i++){const a=tr[i-1],b=tr[i],fade=Math.max(0,1-(impactFX.clock-b.t)/.18)*i/tr.length;if(!fade)continue;ctx.strokeStyle=b.color;ctx.globalAlpha=.5*fade;ctx.lineWidth=slotRadius*.58*fade;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.strokeStyle='#fff';ctx.globalAlpha=.72*fade;ctx.lineWidth=Math.max(.7,slotRadius*.13*fade);ctx.stroke();}ctx.restore();}
function drawImpactRings(){if(natureMotion.matches)return;ctx.save();for(const r of impactFX.rings){const t=r.age/r.duration;ctx.globalAlpha=r.alpha*(1-t);ctx.strokeStyle=r.color;ctx.lineWidth=1+2*(1-t);ctx.beginPath();ctx.arc(r.x,r.y,r.radius*(.3+.7*(1-(1-t)**2)),0,Math.PI*2);ctx.stroke();}ctx.restore();}
function drawAnimatedBoardPiece(i,pos,slot){const m=impactFX.merges.get(i);const scale=Math.min(1.22,slot.scaleAnim||1);if(natureMotion.matches||!m||m.piece!==slot){drawPiece(pos.x,pos.y,slotRadius*1.04,slot,0,scale);return;}const t=Math.min(1,m.age/.38),wave=Math.sin(t*Math.PI*3)*(1-t)*Math.min(.17,.08+m.level*.009);ctx.save();ctx.translate(pos.x,pos.y);ctx.scale(1-wave,1+wave);drawPiece(0,0,slotRadius*1.04,slot,0,Math.min(scale,1.12));ctx.restore();}
function drawCoreCeremony(){const f=impactFX.core;if(natureMotion.matches||!f)return;const t=f.age/.95,r=Math.min(width,height)*(.12+.30*t);ctx.save();ctx.translate(f.x,f.y);ctx.strokeStyle=THEME.gold;ctx.globalAlpha=.7*(1-t);ctx.lineWidth=2;for(let i=0;i<2;i++){ctx.beginPath();ctx.arc(0,0,r*(1-i*.22),0,Math.PI*2);ctx.stroke();}ctx.rotate(t*.65);for(let i=0;i<10;i++){const a=i*Math.PI/5;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.76,Math.sin(a)*r*.76);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);ctx.stroke();}ctx.restore();}

