(() => {
  'use strict';
  const $=id=>document.getElementById(id),dialog=$('rank-dialog');
  let round=null,completed=null,account=null,authMode='login',song='total',afterAuth=false,busy=false,boardSeq=0;
  let checkedNotice=null,pendingNotice=null;
  async function syncAccountNotice(){
    const player=account?.nickname;
    if(!player||checkedNotice===player||pendingNotice===player)return;
    pendingNotice=player;
    try{
      const receipt=await api('notice/claim',{release:$('release-note').dataset.release});
      if(account?.nickname!==player||typeof receipt.first!=='boolean')return;
      checkedNotice=player;
      window.dispatchEvent(new CustomEvent('account-release-receipt',{detail:receipt}));
    }catch{/* A notice-service interruption must not interrupt score uploads. Retry on the next account action. */}
    finally{if(pendingNotice===player)pendingNotice=null;}
  }
  const message=t=>{$('rank-message').textContent=t||'';};
  const resultMessage=t=>{$('rank-result-status').hidden=!t;$('rank-result-status').textContent=t||'';};
  const time=t=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(t);
  async function api(route,data){
    if(window.RankCloudTransport)return window.RankCloudTransport(route,data);
    const response=await fetch('/api/'+route,{credentials:'same-origin',cache:'no-store',...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'服务器暂时不可用。');return result;
  }
  function accountView(){ $('rank-account-label').textContent=account?`已登录 · ${account.nickname}`:'游客 · 登录不是游玩必需条件';$('rank-login-button').hidden=!!account;$('rank-logout').hidden=!account;$('rank-rename').hidden=!account; }
  async function getAccount(){try{account=(await api('me')).account;}catch{account=null;}accountView();return account;}
  function showDialog(){if(!dialog.open)dialog.showModal();}
  function auth(mode='login'){
    authMode=mode;dialog.dataset.view='auth';$('rank-dialog-title').textContent=mode==='login'?'登录账号':mode==='rename'?'更改昵称':'创建账号';$('rank-board-view').hidden=true;$('rank-auth-view').hidden=false;
    for(const id of ['rank-name-hint','rank-secret-hint','rank-confirm-wrap'])$(id).hidden=mode!=='register';
    $('rank-login-tab').setAttribute('aria-pressed',String(mode==='login'));$('rank-register-tab').setAttribute('aria-pressed',String(mode==='register'));
    $('rank-name-hint').hidden=mode==='login';$('rank-login-tab').hidden=$('rank-register-tab').hidden=mode==='rename';$('rank-confirm').required=mode==='register';$('rank-password').autocomplete=mode==='register'?'new-password':'current-password';$('rank-auth-submit').textContent=mode==='login'?'登录':mode==='rename'?'确认更改':'注册';message('');showDialog();$('rank-name').focus();
  }
  async function board(){
    ++boardSeq;const seq=boardSeq;dialog.dataset.view='board';$('rank-dialog-title').textContent='全球排行';$('rank-board-view').hidden=false;$('rank-auth-view').hidden=true;message('正在读取排行榜…');showDialog();
    for(const button of document.querySelectorAll('[data-rank-song]'))button.setAttribute('aria-pressed',String(button.dataset.rankSong===song));
    $('rank-rows').replaceChildren();$('rank-my-place').textContent='';$('rank-next').textContent='';
    try{const data=await api('leaderboard?song='+encodeURIComponent(song));if(seq!==boardSeq)return;const rows=$('rank-rows');for(const r of data.rows){const tr=document.createElement('tr');for(const value of [r.rank,r.nickname,r.score.toLocaleString('zh-CN'),r.accuracy.toFixed(2)+'%',r.combo,r.misses]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}rows.append(tr);}
      $('rank-history').hidden=!account||!data.hasScoreHistory;
      if($('rank-history').hidden)$('rank-history').open=false;
      if(!data.rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='暂无有效成绩';tr.append(td);rows.append(tr);}
      $('rank-next').textContent=`上次更新 ${time(data.updated)} · 下次更新 ${time(data.next)}（北京时间）`;$('rank-my-place').textContent=data.me?`我的排名：第 ${data.me.rank} 名`:'暂未上榜';message('仅标准模式 · 每30分钟更新');
    }catch(e){if(seq===boardSeq)message(e.message||'排行榜暂时无法连接。');}
  }
  async function submit(){
    if(!completed||busy)return;const current=completed;busy=true;$('rank-submit').disabled=true;message('正在核验成绩…');resultMessage('正在核验成绩…');
    try{const ticket=await current.ticket;if(!ticket)throw Error('该局没有联网验证凭证，本地成绩已保存。');
      const data=await api('submit',{id:ticket.id,events:current.events,result:current.result});if(completed!==current)return;
      const status=`${data.best?'成绩已验证，个人最佳已保存':'成绩已验证，本次未刷新最佳'}。下次更新 ${time(data.next)}。`;
      resultMessage(status);message(status);$('rank-submit').hidden=true;completed=null;afterAuth=false;if(dialog.open)await board();
    }catch(e){if(completed===current){resultMessage(e.message);message(e.message);$('rank-submit').disabled=false;}}
    finally{busy=false;}
  }
  async function showHistory(){
    const select=$('rank-score-select');
    select.replaceChildren();$('rank-appeal-submit').disabled=true;
    try{
      const {scores}=await api('history');
      for(const score of scores){
        const opt=document.createElement('option');opt.value=score.id;
        const state=score.appeal==='pending'?' · 复核中':score.appeal==='resolved'?' · 已复核':score.withdrawn?' · 已撤榜':'';
        opt.textContent='关卡 '+score.song+' · '+score.score+' 分 · '+new Date(score.submitted).toLocaleString()+state;
        opt.dataset.appealed=String(Boolean(score.appeal));select.append(opt);
      }
      if(!scores.length){const opt=document.createElement('option');opt.textContent='暂无云成绩';opt.value='';select.append(opt)}
      select.onchange();
    }catch(e){message(e.message)}
  }
  $('rank-score-select').onchange=()=>{const opt=$('rank-score-select').selectedOptions[0];$('rank-appeal-submit').disabled=!opt?.value||opt.dataset.appealed==='true'};
  $('rank-history').ontoggle=()=>{if($('rank-history').open)void showHistory()};
  $('rank-appeal-submit').onclick=async()=>{
    const reason=$('rank-appeal-reason').value.trim();if(!reason){message('请填写申诉理由。');return}
    $('rank-appeal-submit').disabled=true;
    try{await api('appeal',{scoreId:Number($('rank-score-select').value),reason});$('rank-appeal-reason').value='';message('已提交复核。');await showHistory()}
    catch(e){message(e.message);$('rank-score-select').onchange()}
  };
  window.RankLocal={
    begin(track,eligible){round=null;completed=null;$('rank-submit').hidden=true;$('rank-submit').disabled=false;resultMessage('');if(!eligible)return;
      const ticket=api('round/start',{song:track,difficulty:'standard',version:window.RANK_VERSIONS[track]}).then(t=>t.version===window.RANK_VERSIONS[track]?t:null).catch(()=>null);round={track,ticket,events:[]};},
    record(t,lane,kind){if(round){if(round.events.length>=12000){round=null;return;}round.events.push([t,lane,kind]);}},
    finish(eligible,result){if(!eligible||!round){round=null;return;}completed={...round,result};round=null;$('rank-submit').hidden=false;$('rank-submit').disabled=false;},
    abandon(){round=null;completed=null;afterAuth=false;}
  };
  $('rank-open').onclick=async()=>{afterAuth=false;showDialog();await getAccount();await board();void syncAccountNotice();};
  $('rank-submit').onclick=async()=>{if(!completed||busy)return;afterAuth=true;await getAccount();if(account){await submit();void syncAccountNotice();}else auth('login');};
  $('rank-close').onclick=()=>dialog.close();$('rank-back').onclick=()=>{if(afterAuth){dialog.close();afterAuth=false;}else void board();};
  $('rank-login-button').onclick=()=>{afterAuth=false;auth('login');};$('rank-login-tab').onclick=()=>auth('login');$('rank-register-tab').onclick=()=>auth('register');
  $('rank-rename').onclick=()=>{if(!account)return;if(Date.now()<account.nextRename){message('改名冷却期至 '+new Date(account.nextRename).toLocaleDateString('zh-CN')+'。');return;}afterAuth=false;auth('rename');};
  $('rank-logout').onclick=async()=>{try{await api('logout',{});account=null;checkedNotice=null;accountView();await board();}catch(e){message(e.message);}};
  $('rank-refresh').onclick=()=>void board();for(const b of document.querySelectorAll('[data-rank-song]'))b.onclick=()=>{song=b.dataset.rankSong;void board();};
  $('rank-auth-view').onsubmit=async e=>{e.preventDefault();if(busy)return;const fields={nickname:$('rank-name').value,secret:$('rank-secret').value,password:$('rank-password').value};
    if(authMode==='register'&&fields.password!==$('rank-confirm').value){message('两次输入的密码不同。');return;}
    busy=true;$('rank-auth-submit').disabled=true;message('正在验证…');try{account=(await api(authMode,fields)).account;accountView();$('rank-secret').value=$('rank-password').value=$('rank-confirm').value='';message('登录成功。');busy=false;if(afterAuth)await submit();else await board();void syncAccountNotice();}catch(e){message(e.message);}finally{busy=false;$('rank-auth-submit').disabled=false;}
  };
  dialog.addEventListener('close',()=>{$('rank-secret').value=$('rank-password').value=$('rank-confirm').value='';afterAuth=false;++boardSeq;});
})();
