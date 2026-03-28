'use strict';

const html = (apiUrl, cognitoDomain, clientId, region) => `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>poi Error Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:16px;max-width:900px;margin:0 auto}
h1{font-size:18px;margin-bottom:12px;color:#fff}
.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
select,button{background:#2a2a4a;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:6px 10px;font-size:13px;cursor:pointer}
button:hover{background:#3a3a5a}
button.primary{background:#5865f2;border-color:#5865f2;color:#fff}
button.primary:hover{background:#4752c4}
.stats{display:flex;gap:16px;margin-bottom:16px;font-size:13px}
.stats span{background:#2a2a4a;padding:6px 12px;border-radius:4px}
.card{background:#2a2a4a;border-radius:6px;padding:12px;margin-bottom:8px}
.card-header{display:flex;justify-content:space-between;font-size:12px;color:#aaa;margin-bottom:4px}
.card-msg{font-size:14px;margin-bottom:4px;word-break:break-word}
.card-stack{font-size:11px;color:#888;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto;display:none;margin-top:8px;padding:8px;background:#1a1a2e;border-radius:4px}
.card-stack.open{display:block}
.tag{font-size:11px;padding:2px 6px;border-radius:3px;margin-left:6px}
.tag-error{background:#d9534f;color:#fff}
.tag-warn{background:#e6a817;color:#000}
.ctx{font-size:11px;color:#888;margin-top:4px}
.toggle{cursor:pointer;color:#5865f2;font-size:12px;user-select:none}
#login-section{text-align:center;padding:40px 0}
#app{display:none}
.more{text-align:center;margin-top:16px}
</style>
</head>
<body>
<h1>poi Error Dashboard</h1>
<div id="login-section">
  <p style="margin-bottom:16px;color:#aaa">エラーログを閲覧するにはログインが必要です</p>
  <button class="primary" onclick="login()">Cognito でログイン</button>
</div>
<div id="app">
  <div class="bar">
    <select id="source"><option value="mobile-app">mobile-app</option><option value="poi-plugin">poi-plugin</option></select>
    <select id="period"><option value="7">過去7日</option><option value="30">過去30日</option><option value="90">過去90日</option><option value="365">過去1年</option></select>
    <button class="primary" onclick="load()">読み込み</button>
    <button onclick="logout()">ログアウト</button>
  </div>
  <div class="stats" id="stats"></div>
  <div id="list"></div>
  <div class="more"><button id="more-btn" onclick="loadMore()" style="display:none">もっと読み込む</button></div>
</div>
<script>
const API='${apiUrl}'.replace(/\\/$/,'');
const COGNITO_DOMAIN='${cognitoDomain}';
const CLIENT_ID='${clientId}';
const REGION='${region}';
const REDIRECT_URI=location.origin+location.pathname;

let jwt=null,cursor=null;

function login(){
  const p=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',scope:'openid email profile',redirect_uri:REDIRECT_URI});
  location.href='https://'+COGNITO_DOMAIN+'.auth.'+REGION+'.amazoncognito.com/oauth2/authorize?'+p;
}
function logout(){jwt=null;sessionStorage.removeItem('jwt');location.reload()}

async function exchangeCode(code){
  const r=await fetch('https://'+COGNITO_DOMAIN+'.auth.'+REGION+'.amazoncognito.com/oauth2/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'authorization_code',client_id:CLIENT_ID,code:code,redirect_uri:REDIRECT_URI})
  });
  const d=await r.json();
  return d.id_token;
}

async function init(){
  const u=new URL(location.href);
  const code=u.searchParams.get('code');
  if(code){
    history.replaceState(null,'',u.pathname);
    jwt=await exchangeCode(code);
    sessionStorage.setItem('jwt',jwt);
  }else{
    jwt=sessionStorage.getItem('jwt');
  }
  if(jwt){
    document.getElementById('login-section').style.display='none';
    document.getElementById('app').style.display='block';
    load();
  }
}

async function load(){
  cursor=null;
  document.getElementById('list').innerHTML='';
  document.getElementById('more-btn').style.display='none';
  await fetchErrors();
}

async function fetchErrors(){
  const src=document.getElementById('source').value;
  const days=parseInt(document.getElementById('period').value);
  const since=new Date(Date.now()-days*86400000).toISOString();
  let url=API+'/errors?source='+src+'&limit=50&since='+encodeURIComponent(since);
  if(cursor) url+='&cursor='+encodeURIComponent(cursor);
  const r=await fetch(url,{headers:{Authorization:'Bearer '+jwt}});
  if(r.status===401){logout();return}
  const d=await r.json();
  render(d.errors||[]);
  cursor=d.cursor||null;
  document.getElementById('more-btn').style.display=cursor?'inline-block':'none';
  if(!document.getElementById('list').dataset.loaded){
    document.getElementById('list').dataset.loaded='1';
    updateStats(src,days,since);
  }
}
function loadMore(){fetchErrors()}

async function updateStats(currentSrc,days,since){
  const sources=['mobile-app','poi-plugin'];
  const counts=[];
  for(const s of sources){
    const url=API+'/errors?source='+s+'&limit=1&since='+encodeURIComponent(since);
    const r=await fetch(url,{headers:{Authorization:'Bearer '+jwt}});
    const d=await r.json();
    counts.push({source:s,count:(d.errors||[]).length+(d.cursor?'+':'')});
  }
  document.getElementById('stats').innerHTML=counts.map(c=>'<span>'+c.source+': '+c.count+'件</span>').join('');
}

function render(errors){
  const list=document.getElementById('list');
  for(const e of errors){
    const d=document.createElement('div');d.className='card';
    const ts=new Date(e.timestamp).toLocaleString('ja-JP');
    const lvl=e.level==='warn'?'tag-warn':'tag-error';
    const ctx=e.context?Object.entries(e.context).map(([k,v])=>k+':'+v).join(' | '):'';
    d.innerHTML=
      '<div class="card-header"><span>'+ts+'</span><span><span class="tag '+lvl+'">'+e.level+'</span></span></div>'+
      '<div class="card-msg">'+esc(e.message)+'</div>'+
      (ctx?'<div class="ctx">'+esc(ctx)+'</div>':'')+
      (e.stack?'<span class="toggle" onclick="this.nextElementSibling.classList.toggle(\\'open\\')">▶ stack</span><div class="card-stack">'+esc(e.stack)+'</div>':'');
    list.appendChild(d);
  }
}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

init();
</script>
</body>
</html>`;

exports.handler = async (event) => {
  const apiUrl = process.env.API_URL || '';
  const cognitoDomain = process.env.COGNITO_DOMAIN || '';
  const clientId = process.env.USER_POOL_CLIENT_ID || '';
  const region = process.env.AWS_REGION || 'ap-northeast-1';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: html(apiUrl, cognitoDomain, clientId, region),
  };
};
