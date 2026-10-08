// Fixed probe targets. The browser cannot add or change URLs; a new instance means a new plugin revision.
// /healthz is the unauthenticated World endpoint used by the central Infrastructure health check.
export const instances=[
  {id:'capital',name:'Capital',endpoints:[
    {id:'public',label:'公网',url:'https://capital.unitedrobotics.app/healthz'},
    {id:'tailnet',label:'Tailnet',url:'https://capital.queue-musical.ts.net/healthz'},
  ]},
  {id:'yes',name:'Yes Education',endpoints:[
    {id:'public',label:'公网',url:'https://yes.unitedrobotics.app/healthz'},
    {id:'tailnet',label:'Tailnet',url:'https://yes.queue-musical.ts.net/healthz'},
  ]},
  {id:'beauty',name:'Beauty（SkinSpirit）',endpoints:[
    {id:'tailnet',label:'Tailnet',url:'https://skinspirit.queue-musical.ts.net/healthz'},
  ]},
];

const timeoutMs=8000;

// up: World answered /healthz with {ok:true}.
// gated: Cloudflare Access answered first; this says nothing about the origin, so it never counts as healthy.
// down: reached something that is not a healthy World (5xx, tunnel error, wrong body).
// unreachable: DNS, TLS, connection or timeout failure.
export async function probe(endpoint,fetchImpl=fetch,now=()=>performance.now()){
  const started=now();
  const result={id:endpoint.id,label:endpoint.label,url:endpoint.url};
  let response;
  try{
    response=await fetchImpl(endpoint.url,{redirect:'manual',cache:'no-store',headers:{accept:'application/json'},signal:AbortSignal.timeout(timeoutMs)});
  }catch(error){
    const cause=error?.cause?.code??error?.name??'error';
    return {...result,state:'unreachable',latencyMs:Math.round(now()-started),detail:cause==='TimeoutError'?`${timeoutMs/1000} 秒超时`:String(cause)};
  }
  const latencyMs=Math.round(now()-started),httpStatus=response.status;
  const location=response.headers.get('location')??'';
  if(/cloudflareaccess\.com/i.test(location)||(httpStatus>=300&&httpStatus<400&&response.headers.has('cf-access-domain'))||(httpStatus===403&&response.headers.has('cf-access-aud')))
    return {...result,state:'gated',httpStatus,latencyMs,detail:'Cloudflare Access 拦截，无法确认源站'};
  let body=null;
  try{body=JSON.parse((await response.text()).slice(0,4096));}catch{}
  if(httpStatus===200&&body?.ok===true){
    const revision=response.headers.get('x-world-application-revision');
    return {...result,state:'up',httpStatus,latencyMs,revision:/^[a-f0-9]{40}$/.test(revision??'')?revision:null};
  }
  return {...result,state:'down',httpStatus,latencyMs,detail:httpStatus===200?'响应不是 World 健康检查':`HTTP ${httpStatus}`};
}

export function summarize(endpoints){
  const up=endpoints.filter(e=>e.state==='up').length;
  if(up===endpoints.length)return 'healthy';
  if(up>0)return 'degraded';
  if(endpoints.every(e=>e.state==='gated'))return 'unknown';
  return 'down';
}

export async function dispatch(method,input,options={}){
  if(method!=='health.check')throw Error('不支持的操作');
  if(input&&(typeof input!=='object'||Array.isArray(input)||Object.keys(input).length))throw Error('请求参数无效');
  const fetchImpl=options.fetch??fetch;
  const checked=await Promise.all(instances.map(async instance=>{
    const endpoints=await Promise.all(instance.endpoints.map(endpoint=>probe(endpoint,fetchImpl,options.now)));
    return {id:instance.id,name:instance.name,status:summarize(endpoints),endpoints};
  }));
  return {checkedAt:new Date().toISOString(),instances:checked};
}
