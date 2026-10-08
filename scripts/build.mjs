import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {build,transform} from 'esbuild';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/plugin.jsx'],outfile:'dist/plugin.js',bundle:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',minify:true,plugins:[{name:'inline-minified-css',setup(b){b.onLoad({filter:/\.css$/},async({path})=>({contents:(await transform(await readFile(path,'utf8'),{loader:'css',minify:true})).code,loader:'text'}));}}],legalComments:'none'});
await build({entryPoints:['src/rpc.mjs'],outfile:'dist/rpc.mjs',bundle:true,format:'esm',platform:'node',target:'node22'});
await copyFile('src/manifest.json','dist/manifest.json');
