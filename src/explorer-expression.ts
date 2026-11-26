import { parse } from 'libpg-query';
// PostgreSQL's tagged parse tree contains different members for every node type.
export type PgNode=Record<string,any>;
export const names=(nodes:PgNode[]|undefined):string[]=>(nodes??[]).map(n=>n.String?.sval).filter((v):v is string=>typeof v==='string');
export function typeName(n:PgNode|undefined):string {
  if(!n) return 'inconnu';
  const parts=names(n.names);if(parts[0]==='pg_catalog') parts.shift();
  const precision=(n.typmods??[]).map((x:PgNode)=>x.A_Const?.ival?.ival??0).join(',');
  return parts.join('.')+(precision?'('+precision+')':'')+'[]'.repeat(n.arrayBounds?.length??0);
}
export function expression(n:PgNode|undefined,depth=0):string {
  if(!n) return '';
  if(depth>12) return '…';
  const sub=(x:PgNode)=>expression(x,depth+1);
  if(n.A_Const) return n.A_Const.isnull?'NULL':n.A_Const.boolval?String(!!n.A_Const.boolval.boolval):'‹valeur›';
  if(n.ColumnRef) return names(n.ColumnRef.fields).join('.');
  if(n.FuncCall) return names(n.FuncCall.funcname).join('.')+'('+(n.FuncCall.args??[]).map(sub).join(', ')+')';
  if(n.A_Expr) return [sub(n.A_Expr.lexpr),names(n.A_Expr.name).join('.'),sub(n.A_Expr.rexpr)].filter(Boolean).join(' ');
  if(n.BoolExpr) return '('+n.BoolExpr.args.map(sub).join(n.BoolExpr.boolop==='AND_EXPR'?' AND ':n.BoolExpr.boolop==='OR_EXPR'?' OR ':'')+')'+(n.BoolExpr.boolop==='NOT_EXPR'?' [NOT]':'');
  if(n.TypeCast) return sub(n.TypeCast.arg)+'::'+typeName(n.TypeCast.typeName);
  if(n.NullTest) return sub(n.NullTest.arg)+(n.NullTest.nulltesttype==='IS_NOT_NULL'?' IS NOT NULL':' IS NULL');
  if(n.SQLValueFunction) return String(n.SQLValueFunction.op).replace('SVFOP_','');
  return '‹expression '+Object.keys(n)[0]+'›';
}
export async function safeExpression(sql:string|null) {
  if(!sql) return '';
  try {
    const tree=await parse('SELECT '+sql) as PgNode;
    return expression(tree.stmts?.[0]?.stmt?.SelectStmt?.targetList?.[0]?.ResTarget?.val).slice(0,1200);
  } catch {return '‹expression masquée›';}
}
