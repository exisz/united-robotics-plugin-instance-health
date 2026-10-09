// Fixed probe targets. The browser cannot add or change URLs; a new instance means a new plugin revision.
// Each instance has two services: World (/healthz, the endpoint the central Infrastructure health check uses)
// and its OpenClaw Gateway (/healthz, served by the official Gateway).
export const instances=[
  {id:'capital',name:'Capital',endpoints:[
    {id:'world-public',service:'world',label:'公网',url:'https://capital.unitedrobotics.app/healthz'},
    {id:'world-tailnet',service:'world',label:'Tailnet',url:'https://capital.queue-musical.ts.net/healthz'},
    {id:'openclaw-public',service:'openclaw',label:'公网',url:'https://20487f09-3201-49d5-9de9-06e8ec8db823.unitedrobotics.app/healthz'},
    {id:'openclaw-tailnet',service:'openclaw',label:'Tailnet',url:'https://claw2.queue-musical.ts.net/healthz'},
  ]},
  {id:'yes',name:'Yes Education',endpoints:[
    {id:'world-public',service:'world',label:'公网',url:'https://yes.unitedrobotics.app/healthz'},
    {id:'world-tailnet',service:'world',label:'Tailnet',url:'https://yes.queue-musical.ts.net/healthz'},
    {id:'openclaw-public',service:'openclaw',label:'公网',url:'https://yes-openclaw.unitedrobotics.app/healthz'},
    {id:'openclaw-tailnet',service:'openclaw',label:'Tailnet',url:'https://yes-openclaw.queue-musical.ts.net/healthz'},
  ]},
  // Beauty has no public hostname and no OpenClaw entry of its own yet.
  {id:'beauty',name:'Beauty（SkinSpirit）',endpoints:[
    {id:'world-tailnet',service:'world',label:'Tailnet',url:'https://skinspirit.queue-musical.ts.net/healthz'},
  ]},
];

const timeoutMs=8000;
// Cloudflare Access sits only in front of the public hostnames. The service token is scoped by Access
// to <host>/healthz, and it is never sent to any other host.
const accessHost=/^[a-z0-9-]+\.unitedrobotics\.app$/;

export function accessHeaders(url,env=process.env){
  const id=env.CF_ACCESS_CLIENT_ID,secret=env.CF_ACCESS_CLIENT_SECRET;
  if(!id||!secret||!accessHost.test(new URL(url).hostname))return {};
  return {'cf-access-client-id':id,'cf-access-client-secret':secret};
}

// World answers {"ok":true}; the OpenClaw Gateway answers {"ok":true,"status":"live"}.
const healthyBody=body=>body?.ok===true||['live','ok','ready','healthy'].includes(body?.status);

// up: the service answered /healthz as healthy.
// gated: Cloudflare Access answered first; this says nothing about the origin, so it never counts as healthy.
// down: reached something that is not a healthy service (5xx, tunnel error, wrong body).
// unreachable: DNS, TLS, connection or timeout failure.
export async function probe(endpoint,fetchImpl=fetch,now=()=>performance.now(),env=process.env){
  const started=now();
  const result={id:endpoint.id,service:endpoint.service,label:endpoint.label,url:endpoint.url};
  const access=accessHeaders(endpoint.url,env);
  let response;
  try{
    response=await fetchImpl(endpoint.url,{redirect:'manual',cache:'no-store',headers:{accept:'application/json',...access},signal:AbortSignal.timeout(timeoutMs)});
  }catch(error){
    const cause=error?.cause?.code??error?.name??'error';
    return {...result,state:'unreachable',latencyMs:Math.round(now()-started),detail:cause==='TimeoutError'?`${timeoutMs/1000} 秒超时`:String(cause)};
  }
  const latencyMs=Math.round(now()-started),httpStatus=response.status;
  const location=response.headers.get('location')??'';
  if(/cloudflareaccess\.com/i.test(location)||(httpStatus>=300&&httpStatus<400&&response.headers.has('cf-access-domain'))||(httpStatus===403&&response.headers.has('cf-access-aud')))
    return {...result,state:'gated',httpStatus,latencyMs,detail:access['cf-access-client-id']?'Cloudflare Access 拒绝了服务令牌':'未配置 Cloudflare Access 服务令牌'};
  let body=null;
  try{body=JSON.parse((await response.text()).slice(0,4096));}catch{}
  if(httpStatus===200&&healthyBody(body)){
    const revision=response.headers.get('x-world-application-revision');
    return {...result,state:'up',httpStatus,latencyMs,revision:/^[a-f0-9]{40}$/.test(revision??'')?revision:null};
  }
  return {...result,state:'down',httpStatus,latencyMs,detail:httpStatus===200?'响应不是健康检查结果':`HTTP ${httpStatus}`};
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
  const fetchImpl=options.fetch??fetch,env=options.env??process.env;
  const checked=await Promise.all(instances.map(async instance=>{
    const endpoints=await Promise.all(instance.endpoints.map(endpoint=>probe(endpoint,fetchImpl,options.now,env)));
    const services=Object.fromEntries([...new Set(endpoints.map(e=>e.service))].map(service=>[service,summarize(endpoints.filter(e=>e.service===service))]));
    return {id:instance.id,name:instance.name,status:summarize(endpoints),services,endpoints};
  }));
  return {checkedAt:new Date().toISOString(),instances:checked};
}
