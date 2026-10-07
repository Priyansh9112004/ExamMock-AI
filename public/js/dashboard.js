if(guard()){nav("dashboard");loadDashboard();}
function dpct(v){return `${Number(v||0).toFixed(1)}%`}
async function loadDashboard(){
 const u=auth.user()||{};
 hello.textContent=`Welcome back, ${u.name||u.userId||"Student"}`;
 heroText.textContent=`Ready for your next mock, ${u.name||"Student"}?`;
 try{
  const d=await api("/api/performance"),s=d.stats||{};
  tests.textContent=Number(s.tests||0);
  acc.textContent=dpct(s.averageAccuracy);
  best.textContent=dpct(s.bestScorePercent);
  score.textContent=`${Number(s.totalScore||0).toFixed(1)} / ${Number(s.totalMax||0).toFixed(1)}`;
  const r=Array.isArray(s.recent)?s.recent.slice(0,5):[];
  recent.innerHTML=r.length?r.map(x=>`<div class="recentRow"><div><b>${esc(x.examName||"Mock Test")} • ${esc(x.stage||"")}</b><div class="muted">${x.testType==="sectional"?`Sectional • ${esc(x.section||"")}`:"Full Mock"} • ${x.language==="HINDI"?"हिन्दी":"English"}</div></div><div><b>${Number(x.score||0).toFixed(1)} / ${Number(x.maxScore||0).toFixed(1)}</b><div class="muted">Accuracy ${dpct(x.accuracy)}</div></div></div>`).join(""):'<div class="empty">No completed mocks yet. Start your first mock.</div>';
  const w=Array.isArray(s.weakTopics)?s.weakTopics.slice(0,5):[];
  weak.innerHTML=w.length?w.map(x=>`<div class="weakRow"><div class="weakRowHead"><div><b>${esc(x.topic||"Topic")}</b>${x.subtopic?`<div class="muted">${esc(x.subtopic)}</div>`:""}</div><div><b>${dpct(x.accuracy)}</b><div class="muted">${x.wrong||0} wrong</div></div></div><div class="miniBar"><i style="width:${Math.max(0,Math.min(100,Number(x.accuracy||0)))}%"></i></div></div>`).join(""):'<div class="empty">Weak-topic analysis will appear after completed mocks.</div>';
 }catch(e){
  recent.innerHTML=`<div class="empty">${esc(e.message||"Could not load dashboard.")}</div>`;
  weak.innerHTML='<div class="empty">Performance data is unavailable.</div>';
 }
}