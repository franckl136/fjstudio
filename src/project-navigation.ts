import { AsyncLocalStorage } from 'node:async_hooks';

// Each server-rendered menu uses the address of its own HTTP request.
export const sidebarPreferences=new AsyncLocalStorage<{account:string;statuses:Map<string,string>}>();
export const navigationRequest = new AsyncLocalStorage<string>();
const spaces = new Set(['control','knowledge','quality','lab','database','architecture','automations','repository','settings']);

export const projectSpaces:Record<string,string>={control:'Agent Control Room',knowledge:'Project Intelligence',quality:'Quality Lab',lab:'App Lab'};
export function activeNavigationSpace(hint:string,title:string){
  const parts=new URL(navigationRequest.getStore()??'/','http://localhost').pathname.split('/');
  if(parts[1]==='projects' || parts[1]==='espaces')return (parts[1]==='espaces'?parts[2]:parts[3]) || hint;
  if(['office','workspace','database','academy','activity'].includes(parts[1]))return parts[1];
  return hint || Object.keys(projectSpaces).find(k=>projectSpaces[k]===title) || '';
}
export function globalDestination(space:string){
  if(Object.hasOwn(projectSpaces,space))return '/espaces/'+space;
  return ['office','activity','academy','database'].includes(space)?'/'+space:'/workspace';
}

export function projectDestination(id:string, address=navigationRequest.getStore() ?? '/') {
  const base='/projects/'+encodeURIComponent(id);
  const url=new URL(address,'http://localhost');
  const parts=url.pathname.split('/');
  if(parts[1]==='espaces' && Object.hasOwn(projectSpaces,parts[2]))return base+'/'+parts[2];
  if(parts[1]==='projects' && parts[2]){
    if(spaces.has(parts[3]))return base+'/'+parts[3];
    if(parts[3]==='missions')return base+'#missions';
    return base;
  }
  if(url.pathname==='/database')return base+'/database';
  const academy=/^\/academy(?:\/(?:docs\/)?[a-z0-9-]+)?$/.test(url.pathname);
  if(!academy && !['/workspace','/office','/activity'].includes(url.pathname))return base;
  const params=new URLSearchParams({project:id});
  const keep=(key:string,pattern:RegExp)=>{
    const value=url.searchParams.get(key);
    if(value && pattern.test(value))params.set(key,value);
  };
  if(url.pathname==='/office'){
    keep('salle',/^(bureau|cafe|reunion|controle)$/);
    keep('follow',/^[01]$/);
    keep('liste',/^1$/);
  }
  if(url.pathname==='/activity'){
    keep('type',/^[a-z_-]{1,32}$/);
    keep('days',/^\d{1,3}$/);
  }
  if(academy)keep('q',/^.{1,100}$/u);
  return url.pathname+'?'+params.toString();
}
