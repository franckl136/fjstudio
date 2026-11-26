// Canvas is an alternate view of the same FK records as the accessible table below it.
const section=document.querySelector('[data-schema-graph]');
if(section) {
  const {nodes,edges}=JSON.parse(section.dataset.schemaGraph);
  const canvas=section.querySelector('canvas'),ctx=canvas.getContext('2d');
  if(ctx) init();
  function init() {
    const form=section.querySelector('[data-graph-tools]'),focus=form.elements.focus,search=form.elements.search,direction=form.elements.direction;
    const picks=section.querySelector('.dbx-picks'),locations=new Map();
    const width=218,height=82;
    let zoom=1,pan={x:20,y:20},drag=null,visible=[],links=[],compact=canvas.clientWidth<550;
    form.addEventListener('submit',e=>e.preventDefault());
    function filter() {
      const q=search.value.toLocaleLowerCase(),id=focus.value===''?null:Number(focus.value);
      const chosen=new Set(Array.from(picks.querySelectorAll(':checked'),box=>Number(box.value)));
      const around=new Set([id]);
      if(id!==null) for(const edge of edges) {
        if(edge.from===id&&direction.value!=='in')around.add(edge.to);
        if(edge.to===id&&direction.value!=='out')around.add(edge.from);
      }
      visible=nodes.filter(n=>(!q||(n.schema+'.'+n.name).toLocaleLowerCase().includes(q))&&(id===null||around.has(n.i))&&(!chosen.size||chosen.has(n.i)));
      const ids=new Set(visible.map(n=>n.i));
      links=edges.filter(edge=>ids.has(edge.from)&&ids.has(edge.to));
      const cols=compact?1:Math.max(1,Math.min(8,Math.ceil(Math.sqrt(visible.length*1.4))));
      locations.clear();
      visible.forEach((n,i)=>locations.set(n.i,{x:(i%cols)*285,y:Math.floor(i/cols)*146}));
      fit();
    }
    function changeZoom(scale,at) {
      const prev=zoom;zoom=Math.max(.08,Math.min(3.5,scale));
      pan={x:at.x-(at.x-pan.x)*zoom/prev,y:at.y-(at.y-pan.y)*zoom/prev};draw();
    }
    function fit() {
      if(!locations.size){draw();return;}
      const pts=[...locations.values()],xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys);
      const w=Math.max(...xs)-minX+width,h=Math.max(...ys)-minY+height;
      const rect=canvas.getBoundingClientRect();
      zoom=Math.max(.08,Math.min(1.4,(rect.width-40)/w,(rect.height-38)/h));
      pan={x:(rect.width-w*zoom)/2-minX*zoom,y:(rect.height-h*zoom)/2-minY*zoom};draw();
    }
    function draw() {
      const box=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
      const w=Math.round(box.width*ratio),h=Math.round(box.height*ratio);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#edf1e7';ctx.fillRect(0,0,box.width,box.height);
      if(!visible.length){ctx.font='15px system-ui';ctx.fillStyle='#2b4134';ctx.fillText('Aucune table dans cette sélection.',20,35);return;}
      ctx.translate(pan.x,pan.y);ctx.scale(zoom,zoom);ctx.lineWidth=2;
      for(const edge of links) {
        const a=locations.get(edge.from),b=locations.get(edge.to),right=a.x<=b.x;
        if(edge.from!==edge.to&&Math.abs(a.x-b.x)<width*.65){
          const sign=a.y<b.y?1:-1,x=a.x+width/2,to=b.x+width/2,y=a.y+(sign===1?height:0),ty=b.y+(sign===1?0:height);
          ctx.strokeStyle='#698775';ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x,y+sign*24,to,ty-sign*24,to,ty);ctx.stroke();
          ctx.fillStyle='#45664f';ctx.beginPath();ctx.moveTo(to,ty);ctx.lineTo(to-4,ty-sign*8);ctx.lineTo(to+4,ty-sign*8);ctx.fill();
          if(zoom>.52){ctx.font='11px system-ui';ctx.fillText(edge.count,x+6,y+sign*13);}continue;
        }
        const x=a.x+(right?width:0),to=b.x+(right?0:width),y=a.y+height/2,ty=b.y+height/2;
        const via=right?1:-1;
        ctx.strokeStyle='#698775';ctx.beginPath();ctx.moveTo(x,y);
        if(edge.from===edge.to){ctx.bezierCurveTo(x+55,y-75,x-68,y-85,x-68,a.y);}
        else{ctx.bezierCurveTo(x+via*47,y,to-via*47,ty,to,ty);}
        ctx.stroke();
        if(edge.from!==edge.to){ctx.fillStyle='#45664f';ctx.beginPath();ctx.moveTo(to,ty);ctx.lineTo(to-via*9,ty-4);ctx.lineTo(to-via*9,ty+4);ctx.fill();}
        if(zoom>.52){ctx.font='11px system-ui';ctx.fillStyle='#324c3c';ctx.fillText(edge.count,right?x+4:x-27,y-4);}
      }
      for(const n of visible) {
        const p=locations.get(n.i),selected=String(n.i)===focus.value;
        ctx.fillStyle='#fffaf0';ctx.strokeStyle=selected?'#a76627':'#849b87';ctx.fillRect(p.x,p.y,width,height);ctx.strokeRect(p.x,p.y,width,height);
        ctx.fillStyle=selected?'#8a532e':'#214a3b';ctx.fillRect(p.x,p.y,width,30);
        ctx.save();ctx.beginPath();ctx.rect(p.x+5,p.y,width-10,height);ctx.clip();ctx.fillStyle='white';ctx.font='600 13px system-ui';ctx.fillText(n.name,p.x+8,p.y+20);
        ctx.fillStyle='#345240';ctx.font='11px system-ui';ctx.fillText(n.schema,p.x+8,p.y+44);
        ctx.fillText(n.keys.slice(0,2).join(' · ')||'Aucune clé relevée',p.x+8,p.y+66);ctx.restore();
      }
    }
    const coord=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    function hit(point) {
      const x=(point.x-pan.x)/zoom,y=(point.y-pan.y)/zoom;
      return visible.findLast(n=>{const p=locations.get(n.i);return x>=p.x&&x<=p.x+width&&y>=p.y&&y<=p.y+height;});
    }
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=coord(e);drag={p,node:hit(p),pointer:e.pointerId};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!drag||drag.pointer!==e.pointerId)return;const p=coord(e),dx=p.x-drag.p.x,dy=p.y-drag.p.y;
      const t=drag.node?locations.get(drag.node.i):pan;t.x+=dx/(drag.node?zoom:1);t.y+=dy/(drag.node?zoom:1);drag.p=p;draw();});
    for(const evt of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(evt,()=>{drag=null;});
    canvas.addEventListener('dblclick',e=>{const n=hit(coord(e));if(n)location.assign(n.url);});
    canvas.addEventListener('wheel',e=>{e.preventDefault();changeZoom(zoom*(e.deltaY<0?1.15:1/1.15),coord(e));},{passive:false});
    form.addEventListener('input',filter);picks.addEventListener('change',filter);
    for(const b of form.querySelectorAll('[data-zoom]'))b.addEventListener('click',()=>changeZoom(zoom*(b.dataset.zoom==='in'?1.3:1/1.3),{x:canvas.clientWidth/2,y:canvas.clientHeight/2}));
    form.querySelector('[data-fit]').addEventListener('click',fit);
    form.querySelector('[data-export]').addEventListener('click',()=>{const a=document.createElement('a');a.download='studio-relations.png';a.href=canvas.toDataURL('image/png');a.click();});
    filter();new ResizeObserver(()=>{
      const next=canvas.clientWidth<550;
      if(next!==compact){compact=next;filter();}else fit();
    }).observe(canvas);
  }
}
