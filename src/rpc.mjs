import {dispatch} from './backend.mjs';
try{
  let size=0;const chunks=[];
  for await(const chunk of process.stdin){size+=chunk.length;if(size>16384)throw Error('请求过大');chunks.push(chunk);}
  let request;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('请求格式无效');}
  if(request.version!==1||typeof request.method!=='string')throw Error('请求协议无效');
  const result=await dispatch(request.method,request.params??{});
  process.stdout.write(JSON.stringify({version:1,ok:true,result}));
}catch(error){process.stdout.write(JSON.stringify({version:1,ok:false,error:{code:'instance_health_failed',message:error.message}}));process.exitCode=1;}
