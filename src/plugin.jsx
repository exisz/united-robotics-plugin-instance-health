import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme,Card,Flex,Heading,Text,Badge,Button,Callout,Spinner,Box} from '@radix-ui/themes';
import themeCSS from '@radix-ui/themes/styles.css';
import css from './plugin.css';
export const windows=[{id:'health',title:'实例健康监控'}];
const refreshMs=60000;
const statusView={healthy:{color:'jade',text:'健康'},degraded:{color:'amber',text:'部分异常'},unknown:{color:'gray',text:'无法确认'},down:{color:'red',text:'不健康'}};
const endpointView={up:{color:'jade',text:'正常'},gated:{color:'gray',text:'被拦截'},down:{color:'red',text:'异常'},unreachable:{color:'red',text:'无法连接'}};
const time=iso=>new Date(iso).toLocaleTimeString('zh-CN',{hour12:false});
function accept(value){
  if(!value||typeof value.checkedAt!=='string'||!Array.isArray(value.instances)||value.instances.some(i=>!statusView[i?.status]||!Array.isArray(i.endpoints)||i.endpoints.some(e=>!endpointView[e?.state])))throw Error('服务器返回格式无效');
  return value;
}
function Endpoint({endpoint}){
  const view=endpointView[endpoint.state];
  return <Flex className="ur-health-endpoint" justify="between" align="center" gap="3" wrap="wrap">
    <Box className="ur-health-endpoint-main"><Flex align="center" gap="2"><Text size="2" weight="medium">{endpoint.label}</Text><Badge color={view.color} variant="soft">{view.text}</Badge></Flex>
    <Text as="p" size="1" color="gray" className="ur-health-url">{endpoint.url.replace(/^https:\/\//,'')}</Text></Box>
    <Text size="1" color="gray" className="ur-health-meta">{[endpoint.detail,endpoint.httpStatus&&!endpoint.detail?`HTTP ${endpoint.httpStatus}`:null,typeof endpoint.latencyMs==='number'?`${endpoint.latencyMs} ms`:null,endpoint.revision?`rev ${endpoint.revision.slice(0,7)}`:null].filter(Boolean).join(' · ')}</Text>
  </Flex>;
}
export function HealthPanel({invoke,appearance='light'}){
  const [data,setData]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const live=useRef(true),inflight=useRef(false);
  const check=useCallback(async()=>{
    if(inflight.current)return;inflight.current=true;setBusy(true);
    try{const value=accept(await invoke('health.check',{}));if(live.current){setData(value);setError('');}}
    catch(e){if(live.current)setError(e.message);}
    finally{inflight.current=false;if(live.current)setBusy(false);}
  },[invoke]);
  useEffect(()=>{live.current=true;check();const timer=setInterval(check,refreshMs);return()=>{live.current=false;clearInterval(timer);};},[check]);
  const counts=data?Object.fromEntries(Object.keys(statusView).map(s=>[s,data.instances.filter(i=>i.status===s).length])):null;
  return <Theme accentColor="jade" grayColor="gray" radius="large" appearance={appearance}><Box className="ur-health-shell">
    <Flex justify="between" align="center" gap="3" wrap="wrap"><Box><Text size="1" color="gray">UNITED ROBOTICS · INSTANCES</Text><Heading size="5">实例健康监控</Heading></Box>
      <Flex align="center" gap="2"><Text size="1" color="gray">{data?`上次检查 ${time(data.checkedAt)}`:''}</Text><Button variant="soft" disabled={busy} onClick={check}>{busy?<Spinner size="1"/>:null}立即检查</Button></Flex></Flex>
    {counts&&<Text as="p" size="2" color="gray">{data.instances.length} 个实例：{Object.entries(counts).filter(([,n])=>n).map(([s,n])=>`${statusView[s].text} ${n}`).join('，')}。每分钟自动检查。</Text>}
    {error&&<Callout.Root color="red" role="alert"><Callout.Text>检查失败：{error}{data?'（以下为上一次结果）':''}</Callout.Text></Callout.Root>}
    {!data?<Card><Flex align="center" gap="3">{busy&&<Spinner/>}<Text>{busy?'正在检查所有实例…':'未能取得检查结果，不会把空白视为健康。'}</Text></Flex></Card>:
    <Box className="ur-health-grid">{data.instances.map(instance=>{const view=statusView[instance.status];return <Card key={instance.id} className={`ur-health-card ur-health-${instance.status}`}>
      <Flex justify="between" align="center" gap="2"><Heading size="3">{instance.name}</Heading><Badge size="2" color={view.color}>{view.text}</Badge></Flex>
      <Box className="ur-health-endpoints">{instance.endpoints.map(endpoint=><Endpoint key={endpoint.id} endpoint={endpoint}/>)}</Box>
    </Card>;})}</Box>}
  </Box></Theme>;
}
export function mount(root,context){
  if(context.props?.window&&context.props.window!=='health')throw Error('Unknown window');
  const host=document.createElement('div');
  host.style.cssText='display:block;min-height:100%;background:var(--background,transparent)';
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=themeCSS+'\n'+css;
  const container=document.createElement('div');shadow.append(style,container);root.append(host);
  const reactRoot=createRoot(container);
  const render=()=>{
    const html=document.documentElement;
    const appearance=html.dataset.theme==='dark'||(!html.dataset.theme&&getComputedStyle(html).colorScheme==='dark')?'dark':'light';
    reactRoot.render(<HealthPanel invoke={context.invoke} appearance={appearance}/>);
  };
  const observer=new MutationObserver(render);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']});
  render();
  return()=>{observer.disconnect();reactRoot.unmount();host.remove();};
}
