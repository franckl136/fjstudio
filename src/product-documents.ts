import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DomainError, isProjectId, type ProjectId } from './contracts.ts';
import { readLabSnapshot, type LabSource } from './product-lab-source.ts';

type CanonicalSource = LabSource & { id: string };
const install = fileURLToPath(new URL('../',import.meta.url));
const builtin = (id:string, entry:string, project:ProjectId):CanonicalSource =>
  ({id,entry,project,key:'studio-sample',ref:'HEAD',directory:install});
const invalid = () => new DomainError(409,'document_configuration','Vérifiez les sources documentaires autorisées sur ce poste.');

function documents(project:ProjectId) {
  const list:CanonicalSource[]=[];
  if (['a','b'].includes(project)) list.push(builtin('project','docs/projects/'+project+'.md',project));
  if (project==='a') list.push(builtin('architecture','docs/01-architecture-et-donnees.md',project));
  let configured: unknown;
  try { configured=JSON.parse(process.env.STUDIO_DOCUMENTS_JSON??'[]'); } catch { throw invalid(); }
  if (!Array.isArray(configured) || configured.length>64) throw invalid();
  for (const item of configured) {
    if (!item || !isProjectId(item.project) || !isProjectId(item.id) || typeof item.directory!=='string' ||
        !isAbsolute(item.directory) || item.directory.replaceAll(String.fromCharCode(92),'/').startsWith('//') ||
        typeof item.entry!=='string' || item.entry.length>115 || !/^(?:[a-zA-Z0-9_-]+\/){0,12}[a-zA-Z0-9_.-]+\.md$/.test(item.entry) ||
        typeof item.ref!=='string' || !(item.ref==='HEAD'||/^refs\/heads\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(item.ref))) throw invalid();
    if (item.project!==project) continue;
    if (list.some(source=>source.id===item.id)) throw invalid();
    list.push({...item,key:'canonical-document'});
  }
  return list;
}
export function documentOptions(project:ProjectId) {
  return documents(project).map(({id,entry})=>({id,entry}));
}
export async function canonicalDocument(project:ProjectId,id:unknown) {
  const source=documents(project).find(item=>item.id===id);
  if (!source) throw new DomainError(404,'document','Document absent du catalogue de ce projet.');
  return readLabSnapshot(source);
}
