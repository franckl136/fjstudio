import { posix } from 'node:path';
import { e } from './views.ts';
import { helpDocs, type HelpDoc } from './academy-help.ts';

function renderInline(source:string,sourceFile:string,project?:string) {
  return source.split(/(\x60[^\x60]+\x60|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).map(part=>{
    if(part.startsWith('\x60')&&part.endsWith('\x60')) return '<code>'+e(part.slice(1,-1))+'</code>';
    if(part.startsWith('**')&&part.endsWith('**')) return '<strong>'+e(part.slice(2,-2))+'</strong>';
    const link=/^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if(link) {
      const file=posix.join(posix.dirname(sourceFile),link[2]);
      const doc=helpDocs().find(d=>d.file===file);
      const scope=project?'?project='+encodeURIComponent(project):'';
      return doc?'<a href="/academy/docs/'+e(doc.id)+scope+'">'+e(link[1])+'</a>':e(link[1]);
    }
    return e(part);
  }).join('');
}
export function documentBody(doc:HelpDoc,project?:string) {
  const inline=(text:string)=>renderInline(text,doc.file,project);
  const lines=doc.paragraphs.join('\n\n').split(/\r?\n/);
  const result:string[]=[];
  for(let i=0;i<lines.length;){
    const line=lines[i++];
    if(!line.trim()||line.startsWith('# ')) continue;
    if(line.startsWith('\x60\x60\x60')) {
      const code:string[]=[];
      while(i<lines.length&&!lines[i].startsWith('\x60\x60\x60'))code.push(lines[i++]);
      if(i<lines.length)i++;
      result.push('<pre><code>'+e(code.join('\n'))+'</code></pre>');continue;
    }
    const heading=/^(#{2,6}) (.+)$/.exec(line);
    if(heading) {
      const level=Math.min(heading[1].length,4);
      result.push('<h'+level+'>'+inline(heading[2])+'</h'+level+'>');continue;
    }
    if(line.startsWith('|')) {
      const rows=[line];
      while(i<lines.length&&lines[i].startsWith('|'))rows.push(lines[i++]);
      const cells=(r:string)=>r.trim().replace(/^\||\|$/g,'').split('|').map(c=>inline(c.trim()));
      const body=rows.slice(1).filter(r=>!/^\s*\|[\s|:-]+\|\s*$/.test(r));
      result.push('<div class="table-wrap"><table><thead><tr>'+cells(line).map(v=>'<th scope="col">'+v+'</th>').join('')+'</tr></thead><tbody>'+
        body.map(row=>'<tr>'+cells(row).map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue;
    }
    const list=/^[-*] /.test(line)?'ul':/^\d+\. /.test(line)?'ol':'';
    if(list) {
      const prefix=list==='ul'?/^[-*] /:/^\d+\. /,items=[line];
      while(i<lines.length&&prefix.test(lines[i]))items.push(lines[i++]);
      result.push('<'+list+'>'+items.map(v=>'<li>'+inline(v.replace(prefix,''))+'</li>').join('')+'</'+list+'>');continue;
    }
    const paragraph=[line];
    while(i<lines.length && lines[i].trim() && !/^(?:#|[-*] |\d+\. |\||\x60\x60\x60)/.test(lines[i]))paragraph.push(lines[i++]);
    result.push('<p>'+inline(paragraph.join(' '))+'</p>');
  }
  return result.join('');
}
