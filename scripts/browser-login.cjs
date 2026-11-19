const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const access=JSON.parse(fs.readFileSync('.local/admin-access.json','utf8'));
const code=`async (page) => {await page.getByRole('textbox',{name:'Kullanıcı adı',exact:true}).fill(${JSON.stringify(access.username)});await page.getByRole('textbox',{name:'Parola',exact:true}).fill(${JSON.stringify(access.password)});await page.getByRole('button',{name:'Giriş yap',exact:true}).click();}`;
const cli=fs.readdirSync(process.env.LOCALAPPDATA+'/npm-cache/_npx',{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>process.env.LOCALAPPDATA+'/npm-cache/_npx/'+d.name+'/node_modules/@playwright/cli/playwright-cli.js').find(fs.existsSync);
if(!cli)throw Error('Playwright CLI not located');
const result=spawnSync(process.execPath,[cli,'-s='+(process.argv[2]||'scada'),'run-code',code],{encoding:'utf8',windowsHide:true});
console.log((result.stdout||'').split('### Ran Playwright code')[0]);if(result.status!==0){console.error('Browser sign-in failed');process.exitCode=1;}
