'use strict';
// The toolchain comes from the Studio lockfile. Candidate text is only ever read by the parser.
const fs = require('node:fs');
const zlib = require('node:zlib');
const declaration = /^lib\.(?:es5|es20[0-9]{2}(?:\.[a-z.0-9]+)?|decorators(?:\.legacy)?)\.d\.ts$/;

async function main() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 4 * 1024 * 1024) throw Error('limit');
    chunks.push(chunk);
  }
  const payload=JSON.parse(zlib.gunzipSync(Buffer.concat(chunks),{maxOutputLength:16*1024*1024}).toString('utf8'));
  const files=new Map(Object.entries(payload.libraries).filter(([name])=>declaration.test(name)));
  fs.writeFileSync('/tmp/trusted-typescript.cjs',payload.compiler,{flag:'wx'});
  const ts=require('/tmp/trusted-typescript.cjs');
  const name='/input.ts';
  const text=payload.source;
  const pre=ts.preProcessFile(text,true,true);
  const parsed=ts.createSourceFile(name,text,ts.ScriptTarget.ES2022);
  if (parsed.checkJsDirective?.enabled === false || parsed.commentDirectives?.length || pre.isLibFile) {
    return {version:ts.version,status:'not_run',reason:'directives',count:0,diagnostics:[]};
  }
  if (pre.referencedFiles.length || pre.importedFiles.length || pre.typeReferenceDirectives.length || pre.libReferenceDirectives.length) {
    return {version:ts.version,status:'not_run',reason:'dependencies',count:0,diagnostics:[]};
  }
  const contents = path => path===name?text:(path.startsWith('/lib/')?files.get(path.slice(5)):undefined);
  const options={strict:true,noEmit:true,skipLibCheck:true,types:[],lib:['lib.es2022.d.ts'],target:ts.ScriptTarget.ES2022,
    module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler};
  const host={
    getSourceFile:(path,version)=>{const s=contents(path);return s===undefined?undefined:ts.createSourceFile(path,s,version);},
    getDefaultLibFileName:()=>'/lib/lib.es2022.d.ts',getDefaultLibLocation:()=>'/lib',
    getCurrentDirectory:()=>'/',getDirectories:()=>[],getCanonicalFileName:p=>p,
    useCaseSensitiveFileNames:()=>true,getNewLine:()=>'\n',fileExists:path=>contents(path)!==undefined,readFile:contents,
    writeFile:()=>{throw Error('unexpected_emit');}
  };
  const program=ts.createProgram([name],options,host);
  const diagnostics=ts.getPreEmitDiagnostics(program);
  return {version:ts.version,status:diagnostics.length?'failed':'passed',reason:'checked',count:diagnostics.length,
    diagnostics:diagnostics.slice(0,12).map(d=>{
      if (!d.file || d.file.fileName!==name || d.start===undefined) return {code:d.code,line:null,column:null};
      const pos=d.file.getLineAndCharacterOfPosition(d.start);return {code:d.code,line:pos.line+1,column:pos.character+1};
    })};
}
main().then(result=>process.stdout.write(JSON.stringify(result)),()=>{process.stderr.write('compiler_unavailable\n');process.exitCode=1;});
