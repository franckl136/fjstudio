import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext,runInContext } from 'node:vm';

// Exercise the same browser engine without graphics or a background timer.
type Room='desks'|'coffee'|'meeting'|'control';
type Point=[number,number];
type Seat={area:Room;seat:number;point:Point};
type Geometry={
  rooms:Record<Room,{offset:Point;door:Point}>;
  footprints:Record<Room,number[][]>;
  capacity:Map<Room,number>;
  target:(area:Room,seat:number)=>Seat;
  pathBetween:(from:Seat,to:Seat)=>Point[];
};
function geometry():Geometry{
  const context=createContext({
    Image:class{},document:{querySelector:()=>null},matchMedia:()=>({matches:false}),
  });
  const code=readFileSync(new URL('../src/office/pixel-office.js',import.meta.url),'utf8');
  return runInContext(code+'\n;({rooms,footprints,capacity,target,pathBetween})',context);
}
test('Navigation du loft · cent places distinctes par pièce et douze passages intersalles sans obstacle',()=>{
  const engine=geometry(),areas=Object.keys(engine.rooms) as Room[];
  const seats=new Map<Room,Seat[]>();
  for(const room of areas){
    engine.capacity.set(room,100);
    const assigned=Array.from({length:100},(_,i)=>engine.target(room,i));
    assert.equal(new Set(assigned.map(s=>s.point.join(','))).size,100,room);
    seats.set(room,assigned);
  }
  const inFootprint=(area:Room,point:Point)=>{
    const [ox,oy]=engine.rooms[area].offset;
    const x=point[0]-ox,y=point[1]-oy;
    return engine.footprints[area].some(([l,t,r,b])=>x>=l && x<=r && y>=t && y<=b);
  };
  for(const source of areas)for(const destination of areas){
    const same=source===destination;
    for(let i=0;i<100;i++){
      const a=seats.get(source)![i],b=seats.get(destination)![(i+31)%100];
      const route=engine.pathBetween(a,b);
      assert.deepEqual(route[0],a.point);
      assert.deepEqual(route.at(-1),b.point);
      const cross=route.findIndex(([x,y])=>x===9 && y===7);
      assert.equal(cross>=0,!same);
      if(!same){
        for(const [room,k] of [[source,cross-1],[destination,cross+1]] as const){
          const {door,offset}=engine.rooms[room],point=route[k];
          assert.ok(Math.hypot(point[0]-offset[0]-door[0],point[1]-offset[1]-door[1])<.18,'passage par le seuil');
        }
      }
      for(let j=1;j<route.length;j++){
        const first=route[j-1],last=route[j];
        const area=same||j<=cross?source:destination;
        const dx=last[0]-first[0],dy=last[1]-first[1];
        const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)*8));
        for(let step=0;step<=steps;step++){
          const p:Point=[first[0]+dx*step/steps,first[1]+dy*step/steps];
          assert.ok(!inFootprint(area,p),area+' · mobilier');
        }
      }
    }
  }
});
