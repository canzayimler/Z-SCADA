const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const cli=fs.readdirSync(process.env.LOCALAPPDATA+'/npm-cache/_npx',{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>process.env.LOCALAPPDATA+'/npm-cache/_npx/'+d.name+'/node_modules/@playwright/cli/playwright-cli.js').find(fs.existsSync);
const code=fs.readFileSync(process.argv[2],'utf8');const r=spawnSync(process.execPath,[cli,'-s=scada-review','run-code',code],{encoding:'utf8',windowsHide:true});console.log(r.stdout);console.error(r.stderr);process.exitCode=r.status||0;
