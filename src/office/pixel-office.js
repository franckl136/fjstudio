// All room furniture uses the same 2:1 tile grid and height scale. Render once at native resolution.
const mapWidth=760, mapHeight=412;
const origin=[337,60];
const rooms={
  desks:{offset:[0,0],door:[8.1,6.1],aisle:5.7,color:'#729789',label:'BUREAU',tag:[149,42]},
  control:{offset:[9,0],door:[1.1,6.0],aisle:5.7,color:'#788ea3',label:'CONTRÔLE',tag:[609,92]},
  coffee:{offset:[0,7],door:[8.25,1.05],aisle:4.25,color:'#b77e5e',label:'CAFÉ',tag:[27,114]},
  meeting:{offset:[9,7],door:[1.05,1.1],aisle:5.65,color:'#9b797e',label:'RÉUNION',tag:[589,342]},
};
const project=([x,y])=>[origin[0]+(x-y)*22,origin[1]+(x+y)*10];
const world=(area,x,y)=>[rooms[area].offset[0]+x,rooms[area].offset[1]+y];
const tiles=(x,y,z=0)=>[Math.round(167+(x-y)*22),Math.round(53+(x+y)*10-z)];
const ink='#354340',brass='#dba95e', wood=['#d8a467','#ae7246','#855538'], oak=['#edc989','#bc905b','#9b744b'];
const teal=['#79ab95','#4e8675','#396958'], coral=['#dc8965','#b76550','#8f5144'];
const iron=['#647877','#405557','#34454b'], linen=['#f6e7bb','#dcca9d','#c3af8b'];
const atlas=new Image();
const wallArt=new Image();
const wallCells={desks:[0,0],control:[1,0],coffee:[0,1],meeting:[1,1]};
const cells={
  counter:[3,4,138,137],sofa:[147,19,138,122],plant:[301,3,118,138],desk:[435,8,138,133],
  chair:[26,147,92,138],meeting:[147,179,138,106],console:[292,147,135,138],bookcase:[452,147,103,138],
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
// Project the illustrated elevation onto a wall plane, leaving the door and floor geometry intact.
function mural(p,area,x,y,w,h=44,axis='x',crop=[0,1]) {
  if(!wallArt.naturalWidth)return false;
  const [col,row]=wallCells[area],cell=wallArt.naturalWidth/2;
  const [left,top]=tiles(x,axis==='y'?y+w:y,h+3);
  const [right,bottom]=tiles(axis==='x'?x+w:x,y,h+3);
  const ctx=p.ctx;
  ctx.save();ctx.translate(left,top);ctx.transform(right-left,bottom-top,0,h,0,0);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(wallArt,(col+crop[0])*cell+2,row*cell+2,(crop[1]-crop[0])*cell-4,cell-4,0,0,1,1);
  ctx.restore();return true;
}
function shell(p,scheme) {
  const {box,tile,line}=p;
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
}
function walls(p,area,scheme) {
  for (const axis of ['x','y']) {
    const length=axis==='x'?9:7;
    const interior=axis==='x'?rooms[area].offset[1]>0:rooms[area].offset[0]>0;
    const start=interior && area==='meeting'?2.1:0;
    const end=interior && area!=='meeting'?length-1.9:length;
    const f=facade(p,axis,0,0), width=end-start;
    // A knee wall opens the front suite to the café and leaves the doorway in sight.
    if(area==='meeting' && axis==='y'){
      f.panel(start,0,width,8,scheme.side);f.panel(start,1,width,2,scheme.trim);
      f.panel(start,7,width,2,oak[0]);p.tile(0,0,.12,1.9,.2,brass);
      continue;
    }
    f.panel(start,0,width,48,axis==='x'?scheme.wall:scheme.side);
    for(let row=0;row<6;row++){
      const z=8*row; f.stroke(start,z,end,z,scheme.mortar);
      for(let n=start+.03+(row%2)*.65;n<end;n+=1.3)f.stroke(n,z,n,z+7,scheme.mortar);
    }
    f.panel(start,0,width,4,scheme.trim);f.panel(start,4,width,1,oak[0]);
    f.panel(start,44,width,4,scheme.trim);f.stroke(start,48,end,48,brass);
    for(const u of [start,end-.09]){f.panel(u,4,.09,40,wood[1]);f.stroke(u,4,u,44,oak[0]);}
    if(interior) {
      const gap=start?0:end;
      if(axis==='x')p.tile(gap,0,1.9,.12,.2,brass);
      else p.tile(0,gap,.12,1.9,.2,brass);
    }
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
const cafe={sky:'#d3d7bf',grid:'#cbd0b9',shadow:'#acb49d',floor:['#c29162','#c79969','#c89867','#bf9061'],wood:true,seam:'#ac8058',grain:'#d5a87a',wall:'#e2c9a0',side:'#d6b78e',mortar:'#d1b68d',trim:'#537164'};
const bureau={...cafe,floor:['#ddc698','#e0cb9f','#d9bd94','#d9c195'],seam:'#c5ad84',grain:'#ead8af',sky:'#d6dfd4',grid:'#c5d1c6',shadow:'#acbcae',wall:'#c3d7c7',side:'#adc8b7',mortar:'#b3c8b6',trim:'#527363'};
const conference={...cafe,floor:['#d7c7a2','#d9c9aa','#d1c2a2','#d5c6a8'],seam:'#c0b398',grain:'#e6dabe',sky:'#e0d8c5',grid:'#d1c9b4',shadow:'#bfb39b',wall:'#d9b19a',side:'#ce9e87',mortar:'#c49e87',trim:'#7f6555'};
const operations={...cafe,wood:false,sky:'#cad7cf',grid:'#bbcabc',shadow:'#99b0a6',wall:'#76918b',side:'#6b827f',mortar:'#6b8580',trim:'#354f4d',
  floor:['#92a4a4','#8ea09e','#9baca9','#98aaa6'],grain:'#b2bfba',seam:'#a4b19f'};

function drawCafe(p) {

  if(!mural(p,'coffee',.13,0,6.8)){
    cityWindow(p,'x',3.28,0,3.44);notice(p,'x',.55,0,2.75,'chalk');
  }
  mural(p,'coffee',0,3.4,3.45,43,'y',[0,.36]);
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
  // A tiled breakfast nook and little café menu occupy the street-facing corner.
  rug(p,1.12,4.74,2.62,1.65,'#547c70','#ceb184');
  table(p,1.74,5.20,.78,.64,10);cup(p,2.02,5.41,13);books(p,1.80,5.30,13);
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

  if(!mural(p,'desks',0,.32,4.34,44,'y',[0,.55]))cityWindow(p,'y',0,.65,4.05);
  notice(p,'x',.65,0,2.56,'pin');if(!mural(p,'desks',3.55,0,5.31))cityWindow(p,'x',4.18,0,4.18);
  rug(p,1.05,1.05,6.9,3.25,'#9aaf90','#cad2ad');
  workstation(p,2.65,1.23,67,true);officeChair(p,2.75,2.1,true);
  workstation(p,6.65,1.50,66,true);officeChair(p,6.25,2.25,true);
  if(!furniture(p,'bookcase',.71,4.92,36,47))plant(p,.71,4.92,1.2);
  if(!furniture(p,'plant',8.64,1.03,32,40))plant(p,8.64,1.03);
  table(p,6.8,4.65,1.55,.88,9);books(p,7,4.92,12);cup(p,7.85,5.05,12);
  // Flat file cabinet with half-open drawers and a drafting lamp.
  p.box(.48,5.62,1.6,.68,0,14,['#a2b7a4','#718e80','#4b6d62']);
  const drawers=facade(p,'x',.48,6.30);
  for(const level of [2,6,10]){drawers.panel(.05,level,1.49,2.8,'#8da594');drawers.panel(.61,level+.8,.36,.7,brass);}
  books(p,.65,5.8,14);const [lx,ly]=tiles(1.72,5.91,14);
  p.rect(lx-4,ly-1,8,2,iron[2]);p.line([lx,ly],[lx,ly-8],brass);
  p.line([lx,ly-8],[lx-5,ly-12],brass);p.rect(lx-8,ly-13,6,3,teal[2]);p.rect(lx-8,ly-10,6,1,'#ffe0a5');
  pendant(p,3.25,.87,45);
}
function drawMeeting(p,occupied) {
  if(!mural(p,'meeting',2.15,0,6.66))dashboard(p,'x',2.15,0,4.65,'plan',occupied);
  rug(p,2.0,1.5,5.42,3.65,'#77988b','#d9c297');
  if(!furniture(p,'bookcase',7.19,.88,33,45))plant(p,7.19,.88);
  if(!furniture(p,'plant',8.12,.91,34,43))plant(p,8.12,.91);
  officeChair(p,3.30,2.42);officeChair(p,4.58,2.14);officeChair(p,6.16,2.24);
  if(!furniture(p,'meeting',4.98,3.58,91,48,true)) {table(p,3.5,2.68,3.7,1.8,12);books(p,4.62,3.3,15);}
  officeChair(p,4.59,4.37,true);officeChair(p,6.05,4.34,true);
  if(!furniture(p,'plant',.66,6.32,33,42))plant(p,.66,6.32);
  // Low presentation credenza with a folded floor plan and sample swatches.
  p.box(6.35,5.65,1.7,.65,0,10,wood);
  p.tile(6.50,5.73,.78,.49,10.2,'#efe3bf');
  p.line(tiles(6.62,5.84,10.4),tiles(6.98,5.84,10.4),'#76998b');
  for(let n=0;n<3;n++)p.tile(7.39+n*.18,5.83,.16,.29,10.4,['#c5806e','#70a29a','#d7a657'][n]);
  pendant(p,5.70,2.37,53);
}
function drawControl(p,occupied) {
  if(!mural(p,'control',0,.27,3.78,44,'y',[.53,1]))dashboard(p,'y',0,.7,3.6,'status',occupied);
  if(!mural(p,'control',.18,0,4.72))dashboard(p,'x',.80,0,3.58,'status',occupied);
  cityWindow(p,'x',5.18,0,2.95);
  const duct=facade(p,'y',0,4.02);for(let n=0;n<5;n++)duct.panel(n*.18,25,.1,8,'#526d69');
  rug(p,1.01,.91,5.8,3.02,'#6d8d80','#a4b7a1');
  for(const [x,y,flip] of [[2.35,1.44,true],[5.79,1.40,true]]) {
    if(!furniture(p,'console',x,y,56,49,flip)) {
      p.box(x-1,y-.5,2,1,0,13,iron);p.box(x-.90,y-.4,1.8,.16,13,15,teal);
    }
    officeChair(p,x+.07,y+.93,flip);
  }
  if(!furniture(p,'bookcase',.73,3.84,31,41))plant(p,.73,3.84);
  if(!furniture(p,'plant',8.39,.83,31,39))plant(p,8.39,.83);
  p.box(7.82,4.18,.77,.85,0,19,iron);
  // Cable trays and twin equipment bays under the rack establish a technical service edge.
  for(const x of [6.55,7.12]){
    p.box(x,5.65,.50,.61,0,14,iron);const bay=facade(p,'x',x,6.26);
    for(let u=0;u<3;u++){bay.panel(.05,3+u*3,.40,1.7,'#253f40');bay.panel(.09,3.3+u*3,.055,.75,'#c9c684');}
  }
  const rack=facade(p,'x',7.82,5.03);for(let j=0;j<4;j++){rack.panel(.05,2+j*4,.66,2,'#263c3d');rack.panel(.56,2+j*4,.06,1,'#bfad72');}
}

const roomDraw={desks:[bureau,drawBureau],coffee:[cafe,drawCafe],control:[operations,drawControl],meeting:[conference,drawMeeting]};

function paintFloor(studio) {
  const canvas=studio.querySelector('[data-floor-art]'),p=painter(canvas);
  if(!p)return false;
  const ctx=p.ctx;
  ctx.setTransform(canvas.width/mapWidth,0,0,canvas.height/mapHeight,0,0);
  const wash=ctx.createLinearGradient(0,0,mapWidth,mapHeight);
  wash.addColorStop(0,'#233e40');wash.addColorStop(.58,'#344d4c');wash.addColorStop(1,'#263d41');
  ctx.fillStyle=wash;ctx.fillRect(0,0,mapWidth,mapHeight);
  for(let y=7;y<mapHeight;y+=12)for(let x=6+(y%2)*8;x<mapWidth;x+=16)p.rect(x,y,1,1,'#49605b');
  function inRoom(area,draw){
    const [x,y]=project(rooms[area].offset);
    ctx.save();ctx.translate(x-167,y-53);draw();ctx.restore();
  }
  // A stepped evening plinth frames the workshop and gives its open floor plan depth.
  const outline=[[0,0],[18,0],[18,14],[0,14]].map(project);
  for(const [dy,tint] of [[13,'#1b3336'],[11,'#375355'],[8,'#a18762']]){
    p.poly(outline.map(([x,y])=>[x,y+dy]),tint);
  }
  for(const [area,[scheme]] of Object.entries(roomDraw))inRoom(area,()=>shell(p,scheme));
  for(const [area,[scheme,draw]] of Object.entries(roomDraw))inRoom(area,()=>{
    walls(p,area,scheme);
    // Brass threshold and inlaid floor lights mark the shared passage in each suite.
    const [dx,dy]=rooms[area].door;
    p.tile(dx-.35,dy-.45,.7,.9,.3,scheme.trim);
    for(let i=0;i<3;i++)p.tile(dx-.25+i*.19,dy-.30,.09,.56,.4,'#dfbd82');
    draw(p,Number(studio.querySelector('[data-count="'+area+'"]').textContent)>0);
  });
  canvas.dataset.walls=wallArt.naturalWidth?'illustrated':'geometry';
  canvas.dataset.texture=atlas.naturalWidth?'atlas':'geometry';
  studio.querySelector('.pixel-floor').classList.add('pixel-ready');
  return true;
}

// Draw the same resident at rest and in both phases of a walking stride.
const complexions=[['#f1c19a','#cb8d71'],['#dca47c','#ad7254'],['#ad795e','#86523e'],['#85583f','#654132']];
const jackets=[['#df9961','#ae6347'],['#6caa9b','#427d72'],['#a694c1','#74638c'],['#739abe','#4b708f'],['#ca7780','#a25266'],['#a3ae77','#798655']];
const hairColors=['#48352f','#392f39','#815239','#bb8d57','#6e5950','#323c40'];
function identity(member) {
  let value=2166136261;
  for(const letter of member)value=Math.imul(value^letter.charCodeAt(0),16777619);
  return value>>>0;
}
function portrait(canvas,seed,step=0,pose='idle',beat=0) {
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const [skin,shade]=complexions[(seed>>>4)%complexions.length], [coat,seam]=jackets[(seed>>>9)%jackets.length];
  const hair=hairColors[(seed>>>17)%hairColors.length],style=(seed>>>12)%6;
  const edge='#383639',pants=(seed&1)?'#45556a':'#525852',sole='#e7dec0';
  const r=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
  ctx.clearRect(0,0,24,33);
  const left=step===1?-1:step===2?1:0,right=-left;
  function shoe(x,y){
    r(x,y,5,3,edge);r(x+1,y+1,6,3,edge);r(x+2,y+1,3,1,'#8b9188');
    r(x+1,y+2,5,1,'#657176');r(x+2,y+3,5,1,sole);
  }
  r(6+left,24,5,5,edge);r(7+left,24,4,4,pants);shoe(5+left,28-(step===2?1:0));
  r(12+right,24,5,5,edge);r(13+right,25,3,3,pants);shoe(12+right,28-(step===1?1:0));
  ctx.save();if(step)ctx.translate(0,-1);
  r(5,16,12,9,edge);r(4,17,14,5,edge);r(6,17,10,7,coat);r(6,22,10,2,seam);
  r(10,17,3,6,'#eddeb9');r(9,17,1,6,seam);r(14,20,2,1,seam);
  r(3-left,18,4,6,edge);r(4-left,18,2,4,seam);r(4-left,22,3,2,skin);
  r(16+left,18,4,6,edge);r(16+left,18,3,4,coat);r(17+left,22,2,2,skin);
  r(9,14,6,3,shade);r(10,15,4,2,skin);
  // A broad head, a stepped hairline and asymmetric features give a three-quarter silhouette.
  r(5,3,12,12,edge);r(3,5,16,7,edge);r(6,12,12,3,edge);r(8,14,8,1,edge);
  r(5,5,12,7,shade);r(7,5,11,7,skin);r(9,11,8,3,skin);
  r(4,9,3,3,skin);r(6,10,1,2,shade);r(12,8,2,2,'#fff0cd');r(16,8,2,2,'#fff0cd');
  r(13,8,1,2,edge);r(17,8,1,2,edge);r(16,10,2,1,shade);r(13,12,3,1,'#9a6050');
  r(4,4,4,5,hair);r(5,2,11,4,hair);r(7,1,7,2,hair);r(8,5,4,2,hair);
  const glint=['#665146','#685251','#aa7452','#dbc090','#927967','#526165'][(seed>>>17)%6];
  r(7,3,4,1,glint);r(5,5,2,1,glint);r(11,7,3,1,hair);r(16,7,2,1,hair);
  r(7,11,2,1,shade);r(14,13,2,1,shade);r(6,18,2,1,'#e5c295');
  if((seed>>>7)%3===0){r(7,12,2,1,hair);r(9,13,2,1,hair);r(11,14,5,1,hair);}
  if((seed>>>10)%3===1){r(7,17,2,4,seam);r(8,18,4,1,seam);r(8,20,5,1,seam);}
  if(!step && pose==='break'){
    r(15,19,5,3,shade);r(17,18,4,3,'#ece4bf');r(20,18,2,2,'#b6a888');r(17,18,3,1,'#805944');
  }
  if(style===0){r(3,2,4,4,hair);r(5,0,4,3,hair);r(10,0,4,2,hair);r(14,2,4,3,hair);r(4,7,2,3,hair);}
  if(style===1){r(5,1,9,3,seam);r(4,3,12,3,coat);r(6,5,14,1,seam);}
  if(style===2){r(2,5,4,8,hair);r(3,11,3,5,hair);r(6,2,10,3,hair);r(4,11,2,1,coat);}
  if(style===3){r(7,0,8,4,hair);r(12,1,6,2,hair);r(12,8,7,1,edge);r(12,9,1,2,edge);r(16,9,1,2,edge);}
  if(style===4){r(5,1,10,4,coat);r(4,4,14,2,seam);r(9,0,4,2,sole);}
  if(style===5){r(3,0,6,4,hair);r(8,2,7,4,hair);r(6,10,1,2,'#e5bc6a');}
  const outfit=(seed>>>16)%4;
  if(outfit===0){ // Zip hoodie with a folded collar, drawstrings and pouch.
    r(7,16,3,1,seam);r(13,16,3,1,seam);r(8,17,2,2,coat);r(13,17,2,2,coat);
    r(9,18,1,2,sole);r(13,18,1,2,sole);r(10,21,4,2,seam);
  }else if(outfit===1){ // Short denim jacket over a pale tee.
    r(7,17,3,1,sole);r(9,18,1,1,sole);r(13,17,2,1,sole);
    r(7,20,2,1,seam);r(14,20,2,1,seam);r(7,23,9,1,seam);
  }else if(outfit===2){
    r(7,18,9,2,coat);r(7,20,9,2,sole);r(7,22,9,1,coat);
  }else{ // Messenger strap and satchel.
    for(let k=0;k<6;k++)r(14-k,17+k,2,2,'#75503f');
    r(5,22,6,4,edge);r(6,22,5,3,'#ab7951');r(7,23,1,1,brass);
  }
  // Offset eyes, a stepped nose and a lower lip keep the face readable at game scale.
  r(12,8,2,2,'#fff1d3');r(13,8,1,2,edge);r(16,8,2,2,'#fff1d3');r(17,8,1,2,edge);
  r(17,10,2,1,shade);r(12,12,2,1,shade);r(14,12,2,1,'#8d5747');
  if(style===3){r(11,8,1,2,edge);r(11,10,3,1,edge);r(15,8,1,2,edge);r(16,10,2,1,edge);}
  if(style===0){r(6,2,2,1,glint);r(10,1,2,1,glint);r(4,5,2,1,glint);}
  if(style===2){r(3,6,1,7,glint);r(4,11,2,1,coat);}
  if(!step){
    const hand=beat%2;
    if(pose==='read'){
      r(9,19,12,6,edge);r(10,19,5,5,'#f4dfaf');r(16,20,4,4,'#d6bd93');r(15,19,1,6,brass);
      r(17,21,2,1,'#a48b70');r(9,23,2,2,skin);
    } else if(pose==='work' || pose==='screen' || pose==='intervention'){
      r(9,22,13,3,edge);r(10,22,11,1,'#adc5b9');
      r(6,20+hand,6,2,coat);r(11,20+hand,3,2,skin);
      r(15,21-hand,5,2,skin);
      if(pose==='intervention'){r(4,8,2,6,ink);r(5,13,4,1,ink);}
    } else if(pose==='think'){r(15,15,3,5,seam);r(15,14,3,3,skin);}
    else if(pose==='talk'||pose==='meeting'){
      r(16,17,3,5,coat);r(18,16-hand,3,4,skin);r(14,12,2,hand+1,edge);
    } else if(pose==='idle' && beat===3){r(12,9,2,1,shade);r(16,9,2,1,shade);}
    if((seed>>>2)%5===2){r(4,8,2,3,'#c7a66c');r(4,11,2,2,edge);}
  }
  ctx.restore();
}

// Ground footprints in room-local tiles. Circulation is tested on the same grid used by the furniture.
const footprints={
  desks:[[1.4,.45,3.8,1.95],[5.3,.5,7.7,2.05],[6.7,4.55,8.45,5.65],[0,4.25,1.1,5.2],[.35,5.5,2.24,6.45]],
  coffee:[[.18,.25,3.15,2.1],[4.9,.3,7.7,1.6],[5.25,2,7,2.95],[0,5.5,1.1,6.55],[0,3.2,1.2,3.95],[1.56,5.04,2.67,6.00]],
  meeting:[[3.35,2.5,6.9,4.25],[6.6,.25,8.75,1.25],[0,5.85,1.05,6.8],[6.2,5.5,8.2,6.42]],
  control:[[1,.55,3.55,2.15],[4.45,.5,6.95,2.1],[7.65,4,8.75,5.25],[0,3.15,1.2,4.05],[6.4,5.5,7.8,6.4]]
};
const gridW=35,gridH=27;
const tilesets=new Map();
function navGrid(area){
  if(tilesets.has(area))return tilesets.get(area);
  const grid=[];
  for(let y=0;y<gridH;y++)for(let x=0;x<gridW;x++){
    const px=(x+1)/4,py=(y+1)/4;
    grid.push(!footprints[area].some(([l,t,r,b])=>px>=l && px<=r && py>=t && py<=b));
  }
  tilesets.set(area,grid);return grid;
}
function navCell(area,point){
  const grid=navGrid(area),[ox,oy]=rooms[area].offset;
  const x=point[0]-ox,y=point[1]-oy;
  const rounded=(Math.round(y*4)-1)*gridW+Math.round(x*4)-1;
  if(x>=.25 && x<=8.75 && y>=.25 && y<=6.75 && grid[rounded])return rounded;
  let best=0,dist=Infinity;
  for(let k=0;k<grid.length;k++)if(grid[k]){
    const dx=(k%gridW+1)/4-x,dy=(Math.floor(k/gridW)+1)/4-y,d=dx*dx+dy*dy;
    if(d<dist){dist=d;best=k;if(d===0)break;}
  }
  return best;
}
function navPoint(area,k){return world(area,(k%gridW+1)/4,(Math.floor(k/gridW)+1)/4);}
function roomPath(area,from,to){
  const grid=navGrid(area),start=navCell(area,from),end=navCell(area,to);
  const prev=new Int16Array(grid.length).fill(-1),queue=[start];prev[start]=start;
  for(let i=0;i<queue.length && prev[end]===-1;i++){
    const k=queue[i],x=k%gridW;
    for(const next of [x>0?k-1:-1,x+1<gridW?k+1:-1,k-gridW,k+gridW]){
      if(grid[next] && prev[next]===-1){prev[next]=k;queue.push(next);}
    }
  }
  if(prev[end]===-1)return [];
  const back=[end];while(back.at(-1)!==start)back.push(prev[back.at(-1)]);
  back.reverse();
  return back.filter((k,i)=>i===0||i===back.length-1||k-back[i-1]!==back[i+1]-k).map(k=>navPoint(area,k));
}

const capacity=new Map();
function seatPoint(area,seat) {
  const front={desks:[[2.8,2.8],[6.3,2.9]],control:[[2.5,2.8],[6,2.8]],meeting:[[3.2,4.2],[6.4,4.7]]};
  if(front[area]?.[seat])return world(area,...front[area][seat]);
  let index=seat-(front[area]?.length??0);
  const count=capacity.get(area)??0;
  if(area==='coffee' && count<=4){
    const cafeSeats=[[1.92,4.1],[3.94,3.46],[6.1,2.98],[6.95,5.84]];
    if(cafeSeats[index])return world(area,...cafeSeats[index]);
  }
  if(area==='coffee' && index<18){
    const aroundTables=[8,9,4,5,13,14,0,1,7,6,16,17,2,3,10,11,12,15];
    index=aroundTables[index];
  }
  const columns=Math.max(6,Math.ceil(Math.sqrt(count*1.65)));
  const rows=Math.max(3,Math.ceil(Math.max(count,seat+1)/columns));
  const column=index%columns,row=Math.floor(index/columns);
  const x=1.02+column*6.95/(columns-1)+(row%2)*.22;
  const firstRow=area==='coffee'?2.85:3.75;
  return world(area,x,firstRow+row*(6.55-firstRow)/(rows-1));
}
function pathBetween(from,to) {
  if(from.area===to.area)return roomPath(from.area,from.point,to.point);
  const exit=world(from.area,...rooms[from.area].door),entry=world(to.area,...rooms[to.area].door);
  return [...roomPath(from.area,from.point,exit),[9,7],...roomPath(to.area,entry,to.point)];
}
const actors=new Map();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let frame=0,lastPaint=0;
function place(actor,point) {
  const [x,y]=project(point);
  actor.el.style.left=x/mapWidth*100+'%';actor.el.style.top=y/mapHeight*100+'%';
  actor.el.style.zIndex=String(Math.round(y));
}
function stopAt(actor,target) {
  actor.location=target;actor.steps=[];actor.queue=[];actor.point=target.point;
  place(actor,target.point);delete actor.el.dataset.walking;delete actor.el.dataset.trace;
  actor.figure.classList.toggle('facing-left',(actor.seed&2)!==0);
  portrait(actor.figure,actor.seed,0,actor.pose);
}
function travel(actor,target) {
  const last=actor.queue.at(-1)??actor.leg??actor.location;
  if(last.area===target.area && last.seat===target.seat && last.point[0]===target.point[0] && last.point[1]===target.point[1])return;
  if(reduced.matches || document.hidden){stopAt(actor,target);actor.leg=null;return;}
  actor.queue.push(target);
  if(!frame)frame=requestAnimationFrame(tick);
}
function tick(now) {
  frame=0;
  if(document.hidden || reduced.matches)return;
  // High-refresh screens should not multiply layout work for a crowded floor.
  const cadence=actors.size>40?1000/30:1000/60;
  if(now-lastPaint<cadence-.5){frame=requestAnimationFrame(tick);return;}
  lastPaint=now;
  for(const actor of actors.values()){
    if(!actor.leg && actor.queue.length){
      actor.leg=actor.queue.shift();actor.steps=pathBetween(actor.location,actor.leg);
      actor.clock=now;actor.el.dataset.walking='';
      actor.el.toggleAttribute('data-trace',Boolean(actor.leg.trace));
    }
    if(!actor.leg)continue;
    let distance=Math.min(100,now-actor.clock)*.010;
    actor.clock=now;
    while(actor.steps.length){
      const dest=actor.steps[0],dx=dest[0]-actor.point[0],dy=dest[1]-actor.point[1],length=Math.hypot(dx,dy);
      if(length>.02)actor.figure.classList.toggle('facing-left',dx-dy<0);
      if(length>distance){actor.point=[actor.point[0]+dx*distance/length,actor.point[1]+dy*distance/length];break;}
      actor.point=dest;distance-=length;actor.steps.shift();
    }
    place(actor,actor.point);
    const phase=1+(Math.floor(now/140)%2);
    if(actor.phase!==phase){portrait(actor.figure,actor.seed,phase);actor.phase=phase;}
    if(!actor.steps.length){
      actor.location=actor.leg;actor.leg=null;delete actor.el.dataset.walking;delete actor.el.dataset.trace;
      actor.phase=0;actor.figure.classList.toggle('facing-left',(actor.seed&2)!==0);
      portrait(actor.figure,actor.seed,0,actor.pose);
    }
    if((actor.leg||actor.queue.length)&&!frame)frame=requestAnimationFrame(tick);
  }
}
const placements=new Map();
function target(area,seat,trace=false) {
  const count=capacity.get(area)??0;
  let layout=placements.get(area);
  if(!layout||layout.count!==count){layout={count,cells:[],used:new Set()};placements.set(area,layout);}
  for(let i=layout.cells.length;i<=seat;i++){
    const ideal=seatPoint(area,i);let k=navCell(area,ideal);
    if(layout.used.has(k)){
      let best=Infinity;
      for(const [j,free] of navGrid(area).entries())if(free && !layout.used.has(j)){
        const candidate=navPoint(area,j),distance=(candidate[0]-ideal[0])**2+(candidate[1]-ideal[1])**2;
        if(distance<best){best=distance;k=j;}
      }
    }
    layout.cells.push(navPoint(area,k));layout.used.add(k);
  }
  return {area,seat,trace,point:layout.cells[seat]};
}
function mount(studio,passages=new Map()) {
  const ambient=studio.dataset.sceneMode==='ambient';
  const present=new Set(studio.querySelectorAll(ambient?'.loft-simulation .pixel-person':'.loft-people .pixel-person,.loft-playback .pixel-person'));
  for(const [el,actor] of actors)if(!present.has(el)){actor.figure.remove();actors.delete(el);}
  capacity.clear();
  for(const el of present)if(!el.closest('.loft-playback'))capacity.set(el.dataset.area,(capacity.get(el.dataset.area)??0)+1);
  // Keep existing seats while their occupants remain in the room.
  const seats=new Map();
  for(const [el,actor] of actors)if(actor.area===el.dataset.area && !el.closest('.loft-playback')){
    if(!seats.has(actor.area))seats.set(actor.area,new Set());seats.get(actor.area).add(actor.seat);
  }
  for(const el of present){
    const area=el.dataset.area;
    if(!rooms[area])continue;
    el.classList.toggle('crowded',(capacity.get(area)??0)>9);
    let actor=actors.get(el),seat=actor?.seat;
    if(!actor || actor.area!==area){
      if(!seats.has(area))seats.set(area,new Set());
      const used=seats.get(area);
      seat=0;while(used.has(seat))seat++;
      if(!el.closest('.loft-playback'))used.add(seat);
    }
    if(!actor){
      const figure=document.createElement('canvas');figure.width=24;figure.height=33;
      figure.className='pixel-figure';figure.setAttribute('aria-hidden','true');el.prepend(figure);
      actor={el,figure,seed:identity(el.dataset.member??'studio'),area,seat,pose:el.dataset.pose||'idle',leg:null,phase:0};
      actors.set(el,actor);stopAt(actor,target(area,seat));
    }else{
      if(actor.pose!==(el.dataset.pose||'idle')){
        actor.pose=el.dataset.pose||'idle';if(!actor.leg)portrait(actor.figure,actor.seed,0,actor.pose);
      }
      for(const stop of passages.get(el.dataset.member)??[])travel(actor,target(stop.area,0,true));
      travel(actor,target(area,seat));actor.area=area;actor.seat=seat;
    }
  }
}
const studio=document.querySelector('.pixel-loft');
if(studio && paintFloor(studio)){
  const floor=studio.querySelector('.pixel-floor'),campus=floor.parentElement;
  let zoom=1,panX=0,panY=0;
  const tools=document.createElement('div');
  tools.className='camera-tools';tools.setAttribute('role','group');tools.setAttribute('aria-label','Caméra du loft');
  tools.innerHTML='<button type="button" data-zoom="out" aria-label="Réduire le zoom">−</button><output aria-label="Zoom">100 %</output><button type="button" data-zoom="in" aria-label="Augmenter le zoom">+</button><button type="button" data-zoom="reset">Recentrer</button>';
  campus.before(tools);
  function applyZoom(){
    floor.style.setProperty('--scene-zoom',zoom);
    floor.style.setProperty('--scene-pan-x',panX+'px');floor.style.setProperty('--scene-pan-y',panY+'px');
    tools.querySelector('output').textContent=Math.round(zoom*100)+' %';
    tools.querySelector('[data-zoom=in]').disabled=zoom>=2;
    tools.querySelector('[data-zoom=out]').disabled=zoom<=1;
    campus.classList.toggle('can-pan',zoom>1 || studio.dataset.focus!=='plan');
  }
  function resetZoom(){zoom=1;panX=panY=0;applyZoom();}
  tools.addEventListener('click',event=>{
    const action=event.target.closest('[data-zoom]')?.dataset.zoom;
    if(action==='reset'){resetZoom();return;}
    if(!action)return;
    zoom=Math.max(1,Math.min(2,zoom+(action==='in'?.25:-.25)));
    if(zoom===1)panX=panY=0;
    applyZoom();
  });
  function pan(x,y){
    const extent=zoom*(studio.dataset.focus==='plan'?1:1.83)-1;
    const limitX=campus.clientWidth*extent*.5,limitY=campus.clientHeight*extent*.5;
    panX=Math.max(-limitX,Math.min(limitX,x));panY=Math.max(-limitY,Math.min(limitY,y));applyZoom();
  }
  campus.tabIndex=0;campus.setAttribute('role','group');
  campus.setAttribute('aria-label','Plan du loft. Après un zoom, déplacer la caméra avec les flèches.');
  let drag;
  campus.addEventListener('pointerdown',event=>{
    if(!campus.classList.contains('can-pan')||event.target.closest('a,button')||event.button!==0)return;
    drag={x:event.clientX-panX,y:event.clientY-panY};campus.setPointerCapture(event.pointerId);
  });
  campus.addEventListener('pointermove',event=>{if(drag)pan(event.clientX-drag.x,event.clientY-drag.y);});
  campus.addEventListener('lostpointercapture',()=>{drag=null;});
  campus.addEventListener('keydown',event=>{
    if(event.target!==campus||!campus.classList.contains('can-pan'))return;
    const delta={ArrowLeft:[45,0],ArrowRight:[-45,0],ArrowUp:[0,45],ArrowDown:[0,-45]}[event.key];
    if(delta){event.preventDefault();pan(panX+delta[0],panY+delta[1]);}
  });

  const decorative=document.createElement('div');decorative.className='scene-lights';decorative.setAttribute('aria-hidden','true');
  for(const [area,x,y,lift,kind] of [['coffee',1.7,1.5,51,'steam'],['desks',2.65,1.23,34,'signal'],['control',7.98,4.85,13,'signal'],['meeting',5.70,2.37,50,'lamp']]){
    const [cx,cy]=project(world(area,x,y));
    const light=document.createElement('i');light.className='light-'+kind;
    light.style.left=cx/mapWidth*100+'%';light.style.top=(cy-lift)/mapHeight*100+'%';decorative.append(light);
  }
  floor.prepend(decorative);
  const roomPins=document.createElement('div');roomPins.className='room-pins';
  for(const [area,room] of Object.entries(rooms)){
    const pin=document.createElement('button');pin.type='button';pin.dataset.roomPin=area;
    pin.setAttribute('aria-label','Centrer sur '+room.label.toLowerCase());pin.title=pin.getAttribute('aria-label');
    pin.style.left=room.tag[0]/mapWidth*100+'%';pin.style.top=room.tag[1]/mapHeight*100+'%';
    pin.textContent=room.label;pin.style.setProperty('--pin-color',room.color);
    pin.addEventListener('click',()=>studio.querySelector('[data-camera="'+area+'"]')?.click());
    roomPins.append(pin);
  }
  floor.append(roomPins);
  const posts=document.createElement('div');posts.className='station-pins';
  const inspector=document.createElement('section');inspector.className='station-inspection';inspector.hidden=true;
  inspector.setAttribute('aria-label','Inspection du poste');
  const heading=document.createElement('h3'),assignment=document.createElement('p'),close=document.createElement('button');
  heading.tabIndex=-1;close.type='button';close.textContent='Fermer';
  inspector.append(heading,assignment,close);campus.after(inspector);
  let inspected=null,inspectionStamp='';
  function dismissPost(){
    if(inspected)inspected.setAttribute('aria-expanded','false');
    inspector.hidden=true;inspected=null;inspectionStamp='';
  }
  function renderPost(){
    if(!inspected)return;
    const room=inspected.dataset.stationRoom,seat=Number(inspected.dataset.stationSeat);
    const actor=Array.from(actors.values()).find(a=>a.area===room && a.seat===seat && a.el.closest('.loft-people'));
    const link=actor?.el,stamp=[inspected.id,link?.dataset.profileLink,link?.title].join('|');
    if(stamp===inspectionStamp)return;
    inspectionStamp=stamp;heading.textContent=inspected.getAttribute('aria-label');
    assignment.replaceChildren();
    if(link?.dataset.profileLink){
      const open=document.createElement('a');
      open.href='#'+link.dataset.profileLink;open.dataset.profileLink=link.dataset.profileLink;
      open.textContent=link.title;assignment.append('Personnage à cet emplacement du loft · ',open);
    }else assignment.textContent='Emplacement libre dans le loft.';
  }
  const stations=[['desks',2.65,1.23],['desks',6.65,1.5],['control',2.35,1.44],['control',5.79,1.4]];
  for(const [index,[room,x,y]] of stations.entries()){
    const seat=index%2,pin=document.createElement('button'),[px,py]=project(world(room,x,y));
    pin.id='repere-'+room+'-'+seat;pin.type='button';pin.className='station-pin';
    pin.dataset.stationRoom=room;pin.dataset.stationSeat=String(seat);
    const name=(room==='desks'?'Bureau de travail':'Console de contrôle')+' '+(seat+1);
    pin.setAttribute('aria-label',name);pin.setAttribute('aria-expanded','false');
    pin.title=name;pin.textContent=String(seat+1);
    pin.style.left=px/mapWidth*100+'%';pin.style.top=(py-14)/mapHeight*100+'%';
    pin.addEventListener('click',()=>{
      dismissPost();inspected=pin;pin.setAttribute('aria-expanded','true');inspector.hidden=false;renderPost();heading.focus();
    });
    posts.append(pin);
  }
  close.addEventListener('click',()=>{const pin=inspected;dismissPost();pin?.focus();});
  floor.append(posts);
  const simulation=document.createElement('div');simulation.className='loft-simulation';simulation.setAttribute('aria-hidden','true');
  floor.append(simulation);
  const routines=[
    [['desks','work'],['coffee','break'],['meeting','talk'],['control','screen']],
    [['control','intervention'],['meeting','meeting'],['coffee','read'],['desks','think']],
    [['coffee','break'],['desks','work'],['control','screen'],['meeting','meeting']],
    [['meeting','read'],['control','screen'],['desks','think'],['coffee','break']]
  ];
  let beat=0,step=0,clock=0;
  function advanceRoutine(){
    routines.forEach((routine,i)=>{
      let el=simulation.children[i];
      if(!el){el=document.createElement('i');el.className='loft-person pixel-person';
        el.dataset.simulation='';el.dataset.member='simulation/'+i;simulation.append(el);}
      const [area,pose]=routine[step%routine.length];el.dataset.area=area;el.dataset.pose=pose;
    });
    for(const tab of studio.querySelectorAll('.room-tabs a[data-name]')){
      let n=tab.querySelector('.sim-count');
      if(!n){n=document.createElement('span');n.className='sim-count';tab.append(n);}
      n.textContent=String(simulation.querySelectorAll('[data-area="'+tab.dataset.camera+'"]').length);
    }
  }
  function ambientMode(){return studio.dataset.sceneMode==='ambient';}
  function pulse(){
    if(document.hidden || reduced.matches)return;
    beat++;
    if(ambientMode() && beat%20===0){step++;advanceRoutine();mount(studio);camera();}
    const residents=[...actors.values()].filter(a=>!a.leg && a.el.dataset.area && (studio.dataset.focus==='plan'||a.area===studio.dataset.focus));
    const limit=Number(studio.dataset.animationLimit)||24;
    for(let i=0;i<Math.min(residents.length,limit);i++){
      const a=residents[(i+beat*limit)%residents.length];
      portrait(a.figure,a.seed,0,a.pose,(beat+(a.seed%4))%4);
    }
  }
  function schedule(){
    clearInterval(clock);
    studio.classList.toggle('scene-paused',document.hidden || reduced.matches);
    if(!document.hidden && !reduced.matches)clock=setInterval(pulse,actors.size>40?850:550);
  }
  function setMode(mode){
    studio.dataset.sceneMode=mode;
    const ambient=ambientMode();
    dismissPost();posts.hidden=ambient;
    if(ambient)advanceRoutine();else simulation.replaceChildren();
    for(const control of studio.querySelectorAll('button[data-mode]')){
      control.hidden=false;control.setAttribute('aria-pressed',String(control.dataset.mode===mode));
    }
    for(const count of studio.querySelectorAll('[data-ambient-count]'))count.textContent=String(ambient?routines.length:0);
    studio.querySelector('.loft-people').inert=ambient;
    mount(studio);camera();schedule();
  }
  studio.addEventListener('click',event=>{
    const mode=event.target.closest('button[data-mode]')?.dataset.mode;
    if(mode==='real'||mode==='ambient')setMode(mode);
  });
  function camera() {
    const tabs=Array.from(studio.querySelectorAll('[data-camera]'));
    const url=new URL(location.href);
    const current=tabs.find(link=>new URL(link.href).searchParams.get('salle')===url.searchParams.get('salle'))??tabs[0];
    const changed=studio.dataset.focus!==current.dataset.camera;
    studio.dataset.focus=current.dataset.camera;
    if(changed){dismissPost();resetZoom();}
    for(const pin of posts.children)pin.hidden=current.dataset.camera!=='plan' && current.dataset.camera!==pin.dataset.stationRoom;
    for(const link of tabs){
      if(link===current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    }
    const scope=document.querySelector('.scope-filter');
    if(scope){
      let field=scope.elements.namedItem('salle');
      if(url.searchParams.has('salle')){
        if(!field){field=document.createElement('input');field.type='hidden';field.name='salle';scope.append(field);}
        field.value=url.searchParams.get('salle');
      }else if(field)field.remove();
    }
    const count=ambientMode()?routines.length:studio.querySelector('.loft-people').children.length;
    const caption=studio.querySelector('[data-room-caption]');
    caption.textContent=ambientMode() && current.dataset.name?current.dataset.name+' · '+(current.querySelector('.sim-count')?.textContent??'0')+' figurant · Simulation':current.dataset.name?current.dataset.name+' · '+current.dataset.purpose:ambientMode()?count+' figurants · Simulation':count+' sur scène · Activité réelle';
    if(changed)studio.dispatchEvent(new CustomEvent('office-camera',{detail:{room:current.dataset.camera}}));
    for(const el of studio.querySelectorAll('.loft-people .pixel-person'))el.inert=current.dataset.camera!=='plan' && el.dataset.area!==current.dataset.camera;
    for(const link of document.querySelectorAll('.office-controls a,.loft-presence a,.sidebar [data-project-id],.sidebar [data-mobile-project]')){
      if(link.pathname!=='/office' || link.getAttribute('href').startsWith('#'))continue;
      const to=new URL(link.href);
      if(url.searchParams.has('salle'))to.searchParams.set('salle',url.searchParams.get('salle'));else to.searchParams.delete('salle');
      link.href=to.href;
    }
  }
  studio.querySelector('.room-tabs').addEventListener('click',event=>{
    const link=event.target.closest('a[data-camera]');
    if(!link||event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();if(location.href!==link.href)history.pushState(null,'',link.href);camera();
  });
  studio.addEventListener('click',event=>{
    const back=event.target.closest('[data-return-agent]');if(!back)return;
    const avatar=document.getElementById('visuel-'+back.dataset.returnAgent);
    if(!avatar)return;
    if(ambientMode())setMode('real');
    studio.querySelector('[data-camera="'+avatar.dataset.area+'"]')?.click();avatar.focus();
  });
  window.addEventListener('popstate',camera);
  setMode('real');applyZoom();
  wallArt.onload=()=>paintFloor(studio);wallArt.src='/office-assets/loft-walls.webp';
  atlas.onload=()=>paintFloor(studio);atlas.src='/office-assets/pixel-atlas.webp';
  studio.addEventListener('loft-repaint',e=>{mount(studio,e.detail);camera();renderPost();});
  studio.addEventListener('loft-occupancy',()=>paintFloor(studio));
  function settle(){for(const actor of actors.values()){actor.leg=null;stopAt(actor,target(actor.area,actor.seat));}}
  reduced.addEventListener('change',()=>{if(reduced.matches)settle();schedule();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;settle();}schedule();});
}
