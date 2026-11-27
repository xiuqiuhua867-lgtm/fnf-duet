(() => {
  'use strict';
  const isStagedPage=location.hostname==='xiuqiuhua867-lgtm.github.io';
  const isLocalPreview=['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('rank')==='cloud';
  if(!isStagedPage&&!isLocalPreview)return;
  const endpoint='https://careful-guppy-d2gqm66r44b4167fa-1539698355.ap-shanghai.app.tcloudbase.com/fnf-rank-three-v1';
  const newSecret=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  async function proof(secret){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));
    return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  }
  const guest=newSecret();
  let session;
  window.RankCloudTransport=async(route,data)=>{
    const [action,query]=route.split('?');
    const secret=newSecret();
    const res=await fetch(endpoint,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({action,
        data:data??Object.fromEntries(new URLSearchParams(query)),session,guest,issueProof:await proof(secret)})});
    const result=await res.json();
    if(!res.ok)throw Object.assign(Error(result.error||'云成绩服务暂时不可用。'),{status:res.status});
    if(result.sessionIssued)session=secret;
    if(action==='logout')session=undefined;
    if(action==='leaderboard')result.hasScoreHistory=true;
    return result;
  };
})();
