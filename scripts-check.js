const {execFileSync}=require('child_process'); const fs=require('fs'); const path=require('path');
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(d,x.name)):[path.join(d,x.name)])}
const files=walk(__dirname).filter(f=>f.endsWith('.js')&&!f.includes('node_modules'));for(const f of files){execFileSync(process.execPath,['--check',f],{stdio:'inherit'})}console.log(`Syntax OK: ${files.length} JS files`);
