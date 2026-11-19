const fs = require('node:fs');
const WebSocket = require('ws');
(async () => {
 const response = await fetch('http://127.0.0.1:3000/api/login', {method:'POST', headers:{'Content-Type':'application/json','x-scada-request':'1'}, body:fs.readFileSync('.local/admin-access.json','utf8')});
 if (!response.ok) throw Error('Login failed: '+response.status);
 const ws = new WebSocket('ws://127.0.0.1:3000/api/live', {headers:{cookie:response.headers.get('set-cookie').split(';')[0]}});
 const timer = setTimeout(()=>{ws.terminate();process.exitCode=1;},10000);
 ws.once('message', data=>{const s=JSON.parse(data); console.log(JSON.stringify({gateway:s.gatewayConnected,devices:s.devices,samples:s.samples},null,2));clearTimeout(timer);ws.close();});
})().catch(e=>{console.error(e.message);process.exitCode=1;});
