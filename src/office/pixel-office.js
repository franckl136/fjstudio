// All room furniture uses the same 2:1 tile grid and height scale. Render once at native resolution.
const W=400,H=228;
const tiles=(x,y,z=0)=>[Math.round(167+(x-y)*22),Math.round(53+(x+y)*10-z)];
const ink='#354340',brass='#dba95e', wood=['#d8a467','#ae7246','#855538'], oak=['#edc989','#bc905b','#9b744b'];
const teal=['#79ab95','#4e8675','#396958'], coral=['#dc8965','#b76550','#8f5144'];
const iron=['#647877','#405557','#34454b'], linen=['#f6e7bb','#dcca9d','#c3af8b'];
const atlas=new Image();
const cells={
  counter:[3,4,138,137],sofa:[147,19,138,122],plant:[301,3,118,138],desk:[435,8,138,133],
  chair:[26,147,92,138],meeting:[147,179,138,106],console:[292,147,135,138],bookcase:[452,147,103,138],
  amber:[35,291,74,138],green:[187,291,57,138],wine:[325,291,70,138],denim:[467,291,73,138],
};
function sprite(ctx,name,x,y,w,h,flip=false) {
  if(!atlas.complete||!atlas.naturalWidth) return false;
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(Math.round(x),Math.round(y));
  if(flip) ctx.scale(-1,1);
  ctx.drawImage(atlas,...cells[name],Math.round(-w/2),-Math.round(h),Math.round(w),Math.round(h));ctx.restore();
  return true;
}
function furniture(p,name,x,y,w,h,flip=false) {
  const [cx,cy]=tiles(x,y);
  p.poly([[cx-w*.36,cy-3],[cx-w*.1,cy+h*.04],[cx+w*.39,cy-h*.08],[cx+w*.1,cy-h*.16]],'#5f553c29');
  return sprite(p.ctx,name,cx,cy,w,h,flip);
}

function painter(canvas) {
  const ctx=canvas.getContext('2d'); if(!ctx) return null;
  function rect(x,y,w,h,c) {ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function line(a,b,c) {
    let [x,y]=a.map(Math.round);const [endX,endY]=b.map(Math.round);
    const dx=Math.abs(endX-x),dy=-Math.abs(endY-y),sx=x<endX?1:-1,sy=y<endY?1:-1;
    let err=dx+dy;ctx.fillStyle=c;
    for(;;){ctx.fillRect(x,y,1,1);if(x===endX&&y===endY)break;
      const twice=err*2;if(twice>=dy){err+=dy;x+=sx;}if(twice<=dx){err+=dx;y+=sy;}}
  }
  function poly(pts,c) {
    const ys=pts.map(p=>p[1]),min=Math.floor(Math.min(...ys)),max=Math.ceil(Math.max(...ys));
    ctx.fillStyle=c;
    for(let y=min;y<max;y++) {
      const at=y+0.5,edges=[];
      for(let i=0;i<pts.length;i++) {
        const a=pts[i],b=pts[(i+1)%pts.length];
        if((a[1]<=at&&b[1]>at)||(b[1]<=at&&a[1]>at))edges.push(a[0]+(at-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      edges.sort((a,b)=>a-b);
      for(let i=0;i+1<edges.length;i+=2)ctx.fillRect(Math.round(edges[i]),y,Math.round(edges[i+1])-Math.round(edges[i]),1);
    }
  }
  function tile(x,y,w,d,z,c){poly([tiles(x,y,z),tiles(x+w,y,z),tiles(x+w,y+d,z),tiles(x,y+d,z)],c);}
  function box(x,y,w,d,z,h,pal) {
    const far=tiles(x,y,z+h),r=tiles(x+w,y,z+h),front=tiles(x+w,y+d,z+h),l=tiles(x,y+d,z+h);
    poly([l,front,tiles(x+w,y+d,z),tiles(x,y+d,z)],pal[1]);
    poly([front,r,tiles(x+w,y,z),tiles(x+w,y+d,z)],pal[2]);poly([far,r,front,l],pal[0]);
    line(l,front,pal[0]);line(front,r,pal[0]);
  }
  return {ctx,rect,line,poly,tile,box};
}

// A façade is a vertical plane along either wall; its local dimensions are tile lengths and pixel heights.
function facade(p,axis,x,y) {
  const pt=(u,z)=>axis==='x'?tiles(x+u,y,z):tiles(x,y+u,z);
  const panel=(u,z,w,h,color)=>p.poly([pt(u,z),pt(u+w,z),pt(u+w,z+h),pt(u,z+h)],color);
  return {pt,panel,stroke:(u,z,v,h,c)=>p.line(pt(u,z),pt(v,h),c)};
}
function cityWindow(p,axis,x,y,w) {
  const {panel,stroke}=facade(p,axis,x,y);
  panel(0,14,w,30,ink);panel(.09,15,w-.18,28,'#9ec4b7');
  const sky=['#b8c9b5','#e8d5ad','#efc696','#d9aaa0'];
  sky.forEach((c,i)=>panel(.10,16+i*6.5,w-.20,6.5,c));
  const buildings=['#95a6a0','#849793','#a6afa1'];
  for(let i=0;i<Math.floor(w*6)-1;i++) {
    const u=.11+i*.16,h=3+(i*11%9); panel(u,15.4,.165,h,buildings[i%3]);
    if(i%2===0)panel(u+.045,16.6,.034,1,'#fae0a8');
  }
  for(let m=1;m<4;m++){const u=w*m/4;panel(u-.035,15,.07,29,'#435e5b');}
  stroke(.08,30,w-.08,30,'#58726c');stroke(.08,41,w-.08,41,'#e4d8b9');
  panel(-.07,12.5,w+.14,2.5,wood[2]);panel(-.05,14,w+.1,1.6,oak[0]);
}
function notice(p,axis,x,y,w,kind) {
  const f=facade(p,axis,x,y); f.panel(0,16,w,22,wood[2]);f.panel(.07,17,w-.14,20,kind==='chalk'?'#36594e':'#e0bd85');
  if(kind==='chalk') {
    const [cx,cy]=f.pt(.63,28);
    p.rect(cx-4,cy-2,8,5,'#e8dab6');p.rect(cx+4,cy-1,2,3,brass);p.line([cx-4,cy+4],[cx+5,cy+4],brass);
    for(let i=0;i<3;i++)f.stroke(w*.53,29-i*3,w*.89-i*.08,29-i*3,'#b1c7a6');
  }else{
    for(let i=0;i<4;i++){const u=.13+i*(w-.3)/4;f.panel(u,21+i%2*2,.32,8,['#f3dc9c','#cdd9ba','#d29e85','#f3ebcf'][i]);f.stroke(u+.08,25+i%2*2,u+.23,25+i%2*2,'#a08e76');}
  }
}
function shell(p,scheme) {
  const {rect,box,tile,line}=p;
  rect(0,0,W,H,scheme.sky);
  for(let y=5;y<H;y+=9)for(let x=(y%2)*7;x<W;x+=15)rect(x,y,1,1,scheme.grid);
  tile(.58,.32,9.1,7.1,-10,scheme.grid);
  tile(.45,.26,9.1,7.1,-9,scheme.shadow);
  box(0,0,9,7,-9,8,['#c2ab7d','#ad8b60','#89704f']);
  box(0,0,9,7,-2,2,['#edd39d','#e1bb83','#bc925f']);
  const colors=scheme.floor;
  for(let x=0;x<9;x++)for(let y=0;y<7;y++){
    tile(x+.018,y+.018,.965,.96,0,colors[(x*11+y*7)%colors.length]);
    if(scheme.wood){
      for(let k=1;k<4;k++)line(tiles(x,y+k*.25),tiles(x+1,y+k*.25),scheme.seam);
      line(tiles(x+.3,y+.12),tiles(x+.67,y+.12),scheme.grain);
      line(tiles(x+.58,y+.64),tiles(x+.8,y+.64),scheme.grain);
    }else if((x+y)%2===0)line(tiles(x+.15,y+.18),tiles(x+.38,y+.18),scheme.grain);
  }
  for(const axis of ['x','y']){
    const len=axis==='x'?9:7;const f=facade(p,axis,0,0);
    f.panel(0,0,len,48,axis==='x'?scheme.wall:scheme.side);
    for(let row=0;row<6;row++){const z=8*row;f.stroke(0,z,len,z,scheme.mortar);for(let n=.01+(row%2)*.65;n<len;n+=1.3)f.stroke(n,z,n,z+7,scheme.mortar);}
    f.panel(0,0,len,4,scheme.trim);f.panel(0,4,len,1,oak[0]);
    f.panel(0,44,len,4,scheme.trim);f.stroke(0,48,len,48,brass);
    for(const u of [0,len-.09]){f.panel(u,4,.09,40,wood[1]);f.stroke(u,4,u,44,oak[0]);}
  }
}
function rug(p,x,y,w,d,base,edge) {
  p.tile(x,y,w,d,.3,edge);p.tile(x+.1,y+.1,w-.2,d-.2,.4,base);
  for(let i=.22;i<w-.22;i+=.45){p.tile(x+i,y+.14,.14,.14,.5,edge);p.tile(x+i,y+d-.30,.14,.14,.5,edge);}
  for(let j=.35;j<d-.3;j+=.36){p.line(tiles(x,y+j),tiles(x-.1,y+j),edge);p.line(tiles(x+w,y+j),tiles(x+w+.12,y+j),edge);}
}
function plant(p,x,y,scale=1) {
  const [cx,cy]=tiles(x,y),pot=scale*.46;
  p.box(x-pot/2,y-pot/2,pot,pot,0,9*scale,['#b17a55','#bf8054','#926147']);
  p.box(x-pot/2-.04,y-pot/2-.04,pot+.08,pot+.08,7*scale,3*scale,['#736042','#df9e6b','#a87753']);
  const leaf=(dx,dy,len,up,c)=>{
    const a=[cx+dx*scale,cy+dy*scale],b=[a[0]+len*scale,a[1]-up*scale],m=[a[0]+len*.52*scale,a[1]-up*.45*scale];
    p.poly([a,[m[0]-2.7*scale,m[1]-2*scale],b,[m[0]+2.5*scale,m[1]+2*scale]],c);p.line(a,b,'#728d59');
  };
  p.line([cx,cy-9*scale],[cx-1,cy-30*scale],'#637849');
  for(const v of [[0,-12,-11,9,'#4d7654'],[0,-14,12,9,'#61905c'],[-1,-16,-9,14,'#527c53'],[-1,-19,10,14,'#86ab69'],[0,-21,-4,14,'#658d5c'],[0,-10,8,5,'#8aad71']])leaf(...v);
}
function table(p,x,y,w,d,h=13) {
  for(const dx of [.10,w-.2])for(const dy of [.10,d-.2])p.box(x+dx,y+dy,.12,.12,0,h,iron);
  p.box(x,y,w,d,h,3,oak); p.line(tiles(x,y+d,h+3),tiles(x+w,y+d,h+3),'#f3dab0');
}
function cup(p,x,y,z) {
  const [cx,cy]=tiles(x,y,z);p.rect(cx-2,cy-4,4,4,'#f1e3bd');p.rect(cx-1,cy-4,2,1,'#78563f');p.rect(cx+2,cy-3,2,1,brass);p.rect(cx+3,cy-2,1,2,brass);
}
function books(p,x,y,z) {
  for(let i=0;i<3;i++)p.box(x+i*.02,y-i*.024,.52,.33,z+i*1.6,1.5,[['#b57f62','#aa6c56','#8a614e'],linen,teal][i]);
}
function seat(p,x,y,pal,back='y') {
  for(const dx of [.06,.57])for(const dy of [.06,.53])p.box(x+dx,y+dy,.10,.10,0,6,wood);
  p.box(x,y,.72,.65,6,3,pal);
  p.box(x,y,back==='x'?.12:.72,back==='x'?.65:.12,9,8,pal);
}
function sofa(p,x,y) {
  const w=2.3,d=.98;
  p.box(x+.1,y+.1,w-.2,d-.2,0,4,wood);p.box(x,y,w,d,4,6,coral);
  p.box(x,y,w,.20,10,11,coral);
  for(let i=0;i<2;i++){p.box(x+.19+i*.98,y+.23,.94,.64,10,2,coral);p.box(x+.27+i*.97,y+.15,.7,.18,12,5,i?teal:linen);}
  for(const dx of [0,w-.17])p.box(x+dx,y,.18,d,8,7,coral);
}
function coffeeBar(p,x,y) {
  const w=2.8,d=1;
  p.box(x,y,w,d,0,14,teal);
  for(let col=.12;col<2.8;col+=.31)p.line(tiles(x+col,y+d,1),tiles(x+col,y+d,13),'#659781');
  p.box(x-.06,y-.04,w+.12,d+.12,14,2.8,linen);
  p.box(x+.26,y+.23,.94,.47,16.8,8,['#e7bd77','#b6854e','#946944']);
  const f=facade(p,'x',x+.26,y+.71);f.panel(.1,18,.73,5,'#354641');f.panel(.08,22.8,.77,1.3,brass);
  cup(p,x+.7,y+.88,17);cup(p,x+1.23,y+.67,17);cup(p,x+1.91,y+.53,17);
  p.box(x+2.12,y+.22,.42,.35,17,5,iron);
}
function pendant(p,x,y,z) {
  const [a,b]=tiles(x,y,z);p.line([a,b-28],[a,b-7],ink);p.rect(a-1,b-10,3,4,brass);
  p.poly([[a-3,b-7],[a+3,b-7],[a+8,b],[a+7,b+1],[a-7,b+1],[a-8,b]],'#9d714a');
  p.rect(a-7,b,15,2,'#efbc71');p.rect(a-2,b+2,5,2,'#ffe7a1');
}
const cafe={sky:'#d3d7bf',grid:'#cbd0b9',shadow:'#acb49d',floor:['#d8bb88','#dcc292','#ddbd8a','#d3b480'],wood:true,seam:'#c9aa79',grain:'#ead09a',wall:'#e2c9a0',side:'#d6b78e',mortar:'#d1b68d',trim:'#537164'};
const bureau={...cafe,sky:'#d6dfd4',grid:'#c5d1c6',shadow:'#acbcae',wall:'#c3d7c7',side:'#adc8b7',mortar:'#b3c8b6',trim:'#527363'};
const conference={...cafe,sky:'#e0d8c5',grid:'#d1c9b4',shadow:'#bfb39b',wall:'#d9b19a',side:'#ce9e87',mortar:'#c49e87',trim:'#7f6555'};
const operations={...cafe,wood:false,sky:'#cad7cf',grid:'#bbcabc',shadow:'#99b0a6',wall:'#76918b',side:'#6b827f',mortar:'#6b8580',trim:'#354f4d',
  floor:['#adbbac','#aab9aa','#b0beac','#b8c1ac'],grain:'#c8d1bc',seam:'#a4b19f'};

function drawCafe(p) {
  shell(p,cafe);
  cityWindow(p,'x',3.85,0,4.45);notice(p,'x',.55,0,2.75,'chalk');
  const shelf=facade(p,'y',0,.52);shelf.panel(0,25,2.65,2.7,wood[2]);shelf.panel(0,27,2.65,1.4,oak[0]);
  for(let i=0;i<6;i++){const [cx,cy]=shelf.pt(.22+i*.40,29);p.rect(cx-2,cy-5,4,6,['#b37b52','#e7d8b2','#637d6d'][i%3]);p.rect(cx-2,cy-6,4,2,ink);}
  rug(p,4.55,1.25,3.78,2.37,'#ba8072','#ead09d');
  if(!furniture(p,'counter',1.65,1.75,77,60,true))coffeeBar(p,.42,.65);
  if(!furniture(p,'bookcase',.65,3.75,34,48))plant(p,.65,3.75,1.15);
  if(!furniture(p,'sofa',6.65,1.47,72,46,true))sofa(p,5.1,.52);
  if(!furniture(p,'plant',8.60,.80,35,43))plant(p,8.48,.73,1.1);
  table(p,5.4,2.2,1.45,.72,8);books(p,5.58,2.45,11);cup(p,6.4,2.54,11);
  seat(p,1.65,2.6,wood);seat(p,2.65,2.6,wood);
  if(!furniture(p,'plant',.72,6.04,36,45))plant(p,.59,5.88,1.35);
  pendant(p,3.55,1,44);
}
function workstation(p,x,y,width,flip=false) {
  if(!furniture(p,'desk',x,y,width,width*.68,flip)) {
    table(p,x-1.1,y-.45,2.2,.9,13);
    p.box(x-.48,y-.3,.95,.12,16,10,iron);
    facade(p,'x',x-.48,y-.17).panel(.05,18,.84,6,'#8aafaa');
  }
}
function officeChair(p,x,y,flip=false) {
  if(!furniture(p,'chair',x,y,20,25,flip))seat(p,x-.32,y-.3,teal);
}
function dashboard(p,axis,x,y,w,mode,occupied) {
  const f=facade(p,axis,x,y);
  f.panel(0,15,w,28,ink);f.panel(.10,17,w-.2,23,mode==='plan'?'#e8ddb6':'#354e4d');
  const trace=mode==='plan'?'#826d50':'#8ab5a3';
  for(const [a,b,c,d] of [[.20,25,.41,32],[.41,32,.66,24],[.41,32,.80,34]])f.stroke(w*a,b,w*c,d,trace);
  for(const [a,z] of [[.20,25],[.41,32],[.66,24],[.80,34]])f.panel(w*a-.08,z-1.6,.16,3.2,mode==='plan'?'#b78055':'#c9b880');
  f.panel(w-.28,15.4,.12,1,occupied?'#a6db92':'#849390');
}
function drawBureau(p) {
  shell(p,bureau);
  cityWindow(p,'y',0,.65,4.05);notice(p,'x',.65,0,2.56,'pin');cityWindow(p,'x',4.18,0,4.18);
  rug(p,1.05,1.05,6.9,3.25,'#9aaf90','#cad2ad');
  workstation(p,2.65,1.23,67,true);officeChair(p,2.75,2.1,true);
  workstation(p,6.65,1.50,66,true);officeChair(p,6.25,2.25,true);
  if(!furniture(p,'bookcase',.71,4.92,36,47))plant(p,.71,4.92,1.2);
  if(!furniture(p,'plant',8.64,1.03,32,40))plant(p,8.64,1.03);
  table(p,6.8,4.65,1.55,.88,9);books(p,7,4.92,12);cup(p,7.85,5.05,12);
  pendant(p,3.25,.87,45);
}
function drawMeeting(p,occupied) {
  shell(p,conference);cityWindow(p,'y',0,1.08,3.95);dashboard(p,'x',2.15,0,4.65,'plan',occupied);
  rug(p,2.0,1.5,5.42,3.65,'#77988b','#d9c297');
  if(!furniture(p,'bookcase',.82,.94,33,45))plant(p,.82,.94);
  if(!furniture(p,'plant',8.12,.91,34,43))plant(p,8.12,.91);
  officeChair(p,3.30,2.42);officeChair(p,4.58,2.14);officeChair(p,6.16,2.24);
  if(!furniture(p,'meeting',4.98,3.58,91,48,true)) {table(p,3.5,2.68,3.7,1.8,12);books(p,4.62,3.3,15);}
  officeChair(p,4.59,4.37,true);officeChair(p,6.05,4.34,true);
  if(!furniture(p,'plant',.66,6.32,33,42))plant(p,.66,6.32);
  pendant(p,5.70,2.37,53);
}
function drawControl(p,occupied) {
  shell(p,operations);dashboard(p,'y',0,.7,3.6,'status',occupied);dashboard(p,'x',.80,0,3.58,'status',occupied);
  cityWindow(p,'x',5.18,0,2.95);
  const duct=facade(p,'y',0,4.8);for(let n=0;n<7;n++)duct.panel(n*.18,25,.1,8,'#526d69');
  rug(p,1.01,.91,5.8,3.02,'#6d8d80','#a4b7a1');
  for(const [x,y,flip] of [[2.35,1.44,true],[5.79,1.40,true]]) {
    if(!furniture(p,'console',x,y,56,49,flip)) {
      p.box(x-1,y-.5,2,1,0,13,iron);p.box(x-.90,y-.4,1.8,.16,13,15,teal);
    }
    officeChair(p,x+.07,y+.93,flip);
  }
  if(!furniture(p,'bookcase',.73,5.17,31,41))plant(p,.73,5.17);
  if(!furniture(p,'plant',8.39,.83,31,39))plant(p,8.39,.83);
  p.box(7.82,4.18,.77,.85,0,19,iron);
  const rack=facade(p,'x',7.82,5.03);for(let j=0;j<4;j++){rack.panel(.05,2+j*4,.66,2,'#263c3d');rack.panel(.56,2+j*4,.06,1,'#bfad72');}
}
function portrait(canvas,look) {
  const p=painter(canvas); if(!p)return;
  const costumes=['amber','green','wine','denim','amber','green'],costume=costumes[look];
  if(sprite(p.ctx,costume,canvas.width/2,canvas.height-1,(canvas.height-2)*cells[costume][2]/cells[costume][3],canvas.height-2,look>=4))return;
  const {rect,poly,line}=p;
  const variants=[
    ['#81563e','#b37a51','#473d3b','#d49d47','#9d6e35','#3e5457'],
    ['#b27855','#e6b88b','#5e4337','#4e8a78','#3d695d','#876446'],
    ['#965f4d','#cf9674','#9b9c90','#b76f56','#865649','#415d70'],
    ['#ab7254','#e5af7c','#393e41','#59798b','#425d6c','#4a5d6a'],
    ['#8b5748','#b47b60','#5c3e46','#91a878','#667e60','#5a6260'],
    ['#996d51','#d9a678','#7c6657','#d4a05d','#a27744','#455d66']];
  const [shade,skin,hair,shirt,dark,trouser]=variants[look%6];
  // Pixel silhouette, individual shoes and telltale props remain legible at 1×.
  p.ctx.clearRect(0,0,30,40);
  poly([[7,23],[21,23],[20,31],[19,35],[14,35],[14,29],[12,36],[6,36]],ink);
  rect(8,25,5,9,trouser);rect(15,25,5,8,trouser);rect(7,34,6,2,'#444b4a');rect(15,33,5,2,'#444b4a');
  rect(5,36,8,2,'#513f37');rect(14,35,8,2,'#513f37');rect(5,38,8,1,'#ab926e');rect(14,37,8,1,'#ab926e');
  poly([[8,14],[15,12],[20,14],[22,17],[21,25],[17,27],[6,25],[5,21]],ink);
  poly([[9,15],[15,14],[19,16],[20,23],[16,25],[7,24]],shirt);rect(7,17,3,7,dark);rect(10,14,4,2,linen[1]);
  rect(15,15,2,3,shade);rect(18,17,4,5,dark);rect(20,21,3,3,shade);rect(19,21,3,2,skin);rect(5,19,3,4,dark);rect(5,22,3,3,skin);
  poly([[8,4],[11,2],[18,2],[21,5],[21,11],[18,14],[11,14],[8,11]],ink);rect(9,5,11,6,shade);rect(12,5,8,7,skin);rect(15,12,4,2,shade);rect(19,8,3,2,skin);
  rect(8,4,4,7,hair);rect(10,2,9,4,hair);rect(8,3,10,2,hair);rect(18,3,3,2,hair);rect(16,7,1,2,ink);rect(19,7,1,1,ink);
  if(look===0){for(const [x,y] of [[7,2],[10,0],[14,0],[17,1],[6,5],[7,9]])rect(x,y,4,4,hair);rect(10,9,1,2,brass);}
  if(look===1){rect(7,3,4,3,hair);rect(9,1,4,2,hair);rect(16,18,4,4,'#e4c78b');}
  if(look===2||look===3){rect(14,7,7,1,ink);rect(14,8,2,2,'#809395');rect(18,8,2,1,'#a1b6b0');}
  if(look===4){rect(7,7,4,9,hair);rect(6,11,3,5,hair);poly([[12,16],[17,16],[19,23],[10,23]],'#a9b78b');}
  if(look===5){rect(8,2,11,3,'#66857b');rect(10,1,7,2,'#78978a');rect(13,5,9,1,'#405c53');rect(13,11,6,2,hair);}
  line([9,24],[16,25],dark);
}
const roomDraw={coffee:drawCafe,desks:drawBureau,meeting:drawMeeting,control:drawControl};
function paintFloor(canvas) {
  const p=painter(canvas),draw=roomDraw[canvas.dataset.roomArt];
  if(!p||!draw)return;
  draw(p,Number(canvas.dataset.occupants)>0);canvas.closest('.pixel-floor').classList.add('pixel-ready');
  canvas.dataset.texture=atlas.naturalWidth?'atlas':'geometry';
}
function mount(root=document) {
  for(const canvas of root.querySelectorAll('canvas[data-room-art]'))if(!canvas.dataset.drawn){paintFloor(canvas);canvas.dataset.drawn='1';}
  for(const el of root.querySelectorAll('.pixel-person:not([data-drawn])')) {
    const figure=document.createElement('canvas');figure.className='pixel-figure';figure.width=atlas.naturalWidth?60:30;figure.height=atlas.naturalWidth?80:40;figure.setAttribute('aria-hidden','true');
    const look=[...el.classList].find(c=>/^look-[0-5]$/.test(c))??'look-0';portrait(figure,Number(look.slice(-1)));el.prepend(figure);el.dataset.drawn='1';
  }
}
const studio=document.querySelector('.pixel-loft');
if(studio) {
  mount(studio);
  atlas.onload=()=>{
    for(const canvas of studio.querySelectorAll('canvas[data-room-art]'))paintFloor(canvas);
    for(const person of studio.querySelectorAll('.pixel-person[data-drawn]')) {
      const look=[...person.classList].find(c=>/^look-[0-5]$/.test(c))??'look-0';
      const figure=person.querySelector('.pixel-figure');
      figure.width=60;figure.height=80;portrait(figure,Number(look.slice(-1)));
    }
  };
  atlas.src='/office-assets/pixel-atlas.webp';
  studio.addEventListener('loft-repaint',()=>mount(studio));
  studio.addEventListener('loft-occupancy',event=>paintFloor(event.target));
  new MutationObserver(changes=>{if(changes.some(c=>Array.from(c.addedNodes).some(n=>n.nodeType===1&&!n.matches('.pixel-figure'))))mount(studio);}).observe(studio,{childList:true,subtree:true});
}
