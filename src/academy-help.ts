import { existsSync, readFileSync } from 'node:fs';
import { lessons } from './academy-catalog.ts';

const sources=[
  {id:'workspace',title:'Command Center et Agent Office',file:'product-workspace.md'},
  {id:'control',title:'Missions et preuves',file:'control-room.md'},
  {id:'lab',title:'Qualité et preview',file:'product-lab.md'},
  {id:'recovery',title:'Sauvegarder et reprendre',file:'product-recovery.md'},
  {id:'review',title:'Revue des changements Git',file:'product-review.md'},
  {id:'handoff',title:'Échange de documents et de résultats',file:'product-handoff.md'},
  {id:'academy',title:'Utiliser Studio Academy',file:'studio-academy.md'},
  {id:'database',title:'Utiliser Database Explorer',file:'database-explorer.md'},
];
export type HelpDoc={id:string;title:string;file:string;paragraphs:string[]};
let documents:HelpDoc[]|undefined;
export function helpDocs() {
  if(documents) return documents;
  documents=sources.flatMap(src=>{
    const path=new URL('../docs/'+src.file,import.meta.url);
    if(!existsSync(path)) return [];
    const text=readFileSync(path,'utf8').replace(/<details\b[^>]*>[\s\S]*?<\/details>/gi,'');
    const paragraphs=text.split(/\r?\n\s*\r?\n/).map(p=>p.trim()).filter(Boolean);
    return [{...src,paragraphs}];
  });
  return documents;
}
const normalized=(s:string)=>s.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('fr');
export function helpSearch(q:string) {
  const words=normalized(q.trim().slice(0,120)).split(/\s+/).filter(Boolean).slice(0,8);
  if(!words.length) return {lessons:[],docs:[]};
  const matches=(s:string)=>words.every(w=>normalized(s).includes(w));
  const topics=lessons.filter(item=>matches([item.title,item.outcome,item.detail,item.sample].join(' ')));
  const docs=helpDocs().flatMap(doc=>{
    const p=doc.paragraphs.find(t=>matches(doc.title+' '+t));
    return p?[{id:doc.id,title:doc.title,excerpt:p.slice(0,230)}]:[];
  });
  return {lessons:topics.map(({id,title})=>({id,title})),docs};
}
