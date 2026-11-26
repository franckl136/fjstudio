import { lstat,open,opendir,realpath } from 'node:fs/promises';
import { join,relative } from 'node:path';
import { invalid } from './explorer-model.ts';

const allowedName=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,110}$/;
const migrationName=/^(?:V)?[0-9][A-Za-z0-9_.-]*\.sql$/i;
function missing(error:unknown){return (error as NodeJS.ErrnoException)?.code==='ENOENT';}

export async function checked(root:string,path:string) {
  const full=join(root,path);
  try {
    const info=await lstat(full);
    if(info.isSymbolicLink()||relative(full,await realpath(full)) || (!info.isDirectory()&&(!info.isFile()||info.nlink!==1)))
      throw invalid('Une définition utilise un lien ou un type de fichier non pris en charge.');
    return info;
  } catch(error){if(missing(error))return null;throw error;}
}
export async function names(root:string,path:string,directories:boolean) {
  if(!(await checked(root,path))?.isDirectory())return [];
  const result:string[]=[];
  const entries=await opendir(join(root,path));
  let count=0;
  for await(const item of entries){
    if(++count>1000)throw invalid('Répertoire de définitions trop volumineux.');
    if(!allowedName.test(item.name))continue;
    if(directories?item.isDirectory():migrationName.test(item.name) && !/(?:[._-](?:down|rollback)|[._-]seed(?:s)?)\.sql$/i.test(item.name))result.push(item.name);
  }
  return result.sort((a,b)=>a.localeCompare(b,'en',{numeric:true}) || (a<b?-1:a>b?1:0));
}
export async function moduleRoots(root:string) {
  if(relative(root,await realpath(root)))throw invalid('Le dossier relié a changé de destination.');
  const roots=[''];
  for(const parent of ['apps','packages']){
    const children=await names(root,parent,true);
    if(children.length>48)throw invalid('Trop de modules locaux à examiner.');
    roots.push(...children.map(child=>parent+'/'+child+'/'));
  }
  return roots;
}

export async function localBytes(root:string,path:string,limit:number) {
  const full=join(root,path),before=await checked(root,path);
  if(!before)return null;
  if(!before.isFile() || before.size>limit)throw invalid('Fichier absent ou trop volumineux.');
  const file=await open(full,'r');
  try {
    const info=await file.stat();
    if(info.dev!==before.dev || info.ino!==before.ino || info.size!==before.size || info.nlink!==1 || relative(full,await realpath(full)))throw invalid('Fichier modifié pendant la lecture.');
    const data=Buffer.alloc(info.size);
    let offset=0;
    while(offset<data.length){
      const part=await file.read(data,offset,data.length-offset,offset);
      if(!part.bytesRead)break;
      offset+=part.bytesRead;
    }
    const after=await file.stat();
    if(offset!==data.length || after.mtimeMs!==info.mtimeMs || after.size!==info.size)throw invalid('Fichier modifié pendant la lecture.');
    return data;
  }finally{await file.close();}
}
