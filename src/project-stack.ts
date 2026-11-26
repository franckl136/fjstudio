import type {Pool} from 'pg';
import {DomainError,type Operator} from './contracts.ts';
import {assertProject,transaction} from './database.ts';
import {linkedRepositoryDirectory} from './repositories.ts';
import {localBytes,moduleRoots} from './local-project-files.ts';

const technologies:Record<string,string>={next:'Next.js',expo:'Expo','react-native':'React Native','@supabase/supabase-js':'Supabase','@prisma/client':'Prisma','@notionhq/client':'Notion',pg:'PostgreSQL'};
const checks=['test','typecheck','lint','test:rls','test:browser','test:hydration','scoring:examples','pricing:examples'];
export type Stack={tools:string[];storage:string[];checks:{name:string;file:string}[];files:string[];status:'read'|'unlinked'|'unavailable'|'partial'};
export async function projectStack(pool:Pool,actor:Operator,project:string):Promise<Stack>{
  assertProject(actor,project);
  try {
    const root=await transaction(pool,c=>linkedRepositoryDirectory(c,actor,project),true);
    return inspectStack(root);
  } catch(error) {
    if(error instanceof DomainError && error.code==='repository_configuration')
      return {tools:[],storage:[],checks:[],files:[],status:'unavailable'};
    throw error;
  }
}

export async function inspectStack(root:string|null,eligible?:(paths:string[])=>Promise<Set<string>>):Promise<Stack>{
  const result:Stack={tools:[],storage:[],checks:[],files:[],status:'read'};
  try{
    if(!root)return {...result,status:'unlinked'};
    const manifests=(await moduleRoots(root)).map(prefix=>prefix+'package.json');
    const allowed=eligible?await eligible([...manifests,'requirements.txt','app.py']):undefined;
    const read=(file:string,limit:number)=>allowed&&!allowed.has(file)?null:localBytes(root,file,limit);
    for(const file of manifests){
      const bytes=await read(file,192000);
      if(!bytes)continue;
      let manifest;
      try{manifest=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}catch{result.status='partial';continue;}
      if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)){result.status='partial';continue;}
      result.files.push(file);
      const deps={...manifest.dependencies,...manifest.devDependencies};
      for(const [key,title] of Object.entries(technologies))if(Object.hasOwn(deps,key)&&!result.tools.includes(title))result.tools.push(title);
      for(const name of checks)if(typeof manifest.scripts?.[name]==='string')result.checks.push({name,file});
    }
    const requirements=await read('requirements.txt',48000);
    if(requirements){
      const modules=requirements.toString('utf8').toLowerCase().split(/\r?\n/).map(line=>line.trim().split(/[\s<>=!~\[#;]/)[0]);
      result.files.push('requirements.txt');
      for(const [key,title] of [['streamlit','Streamlit'],['pandas','pandas'],['plotly','Plotly']])if(modules.includes(key))result.tools.push(title);
      if(modules.includes('pandas')){
        const app=(await read('app.py',384000))?.toString('utf8');
        if(app){
          result.files.push('app.py');
          if(/\b(?:pd|pandas)\.(?:read_excel|ExcelFile)\(/.test(app))result.storage.push('Import de classeurs Excel');
          if(/\.to_csv\(/.test(app))result.storage.push('Export CSV');
          if(/\b(?:pd|pandas)\.to_pickle\(/.test(app)&&/\b(?:pd|pandas)\.read_pickle\(/.test(app))result.storage.push('Sauvegarde et reprise de sessions locales');
        }
      }
    }
    if(result.tools.includes('Notion'))result.storage.push('Intégration Notion déclarée');
  }catch{result.status='unavailable';}
  return result;
}

export function resumeBrief(name:string,stack:Stack){
  const has=(value:string)=>stack.tools.includes(value);
  const subject=has('Notion')?'le parcours éditorial Notion':has('Expo')?'le parcours mobile et la synchronisation':has('Streamlit')?'les imports et la reprise des sessions':
    has('Prisma')?'les changements du modèle Prisma':stack.checks.some(c=>c.name==='scoring:examples')?'le classement et les tarifs':has('Supabase')?'le parcours de saisie et de conservation des données':'les contrôles du projet';
  const objective='Préparer la recette de '+name;
  const scope='Examiner '+subject+' dans '+name+'.';
  const lines=[...stack.tools.map(tool=>'Technologie déclarée · '+tool),...stack.storage,...stack.checks.slice(0,14).map(c=>c.file+' · script '+c.name)];
  const document=['# Périmètre',scope,'# Indices dans le dossier local',...lines,'# Parcours à vérifier','Décrire le point de départ, les étapes et le comportement attendu.','# Exécution','Compléter avec le résultat et la référence au compte rendu.'].join('\n');
  return {objective,scope,document,criteria:['Résultat observé :','Preuve consultable :'],constraints:'Revue documentaire locale. Consigner séparément les contrôles effectivement exécutés.'};
}
