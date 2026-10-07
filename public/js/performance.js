if(guard()){nav("performance");loadPerformance();}
function pct(v){return `${Number(v||0).toFixed(1)}%`}
function topicHtml(list,weak=false){
 if(!Array.isArray(list)||!list.length)return '<div class="empty">Complete mocks with topic-tagged questions to see this analysis.</div>';
 return list.map(x=>`<div class="topicRow"><div class="topicHead"><div><b>${esc(x.topic||"Topic")}</b>${x.subtopic?`<div class="muted">${esc(x.subtopic)}</div>`:""}</div><div><b>${pct(x.accuracy)}</b><div class="muted">${x.correct||0} correct • ${x.wrong||0} wrong</div></div></div><div class="bar"><i style="width:${Math.max(0,Math.min(100,Number(x.accuracy||0)))}%"></i></div></div>`).join("");
}
async function loadPerformance(){
 try{
  const d=await api("/api/performance"),s=d.stats||{};
  tests.textContent=Number(s.tests||0);
  acc.textContent=pct(s.averageAccuracy);
  best.textContent=pct(s.bestScorePercent);
  agg.textContent=pct(s.totalMax?Number(s.totalScore||0)/Number(s.totalMax)*100:0);
  correct.textContent=Number(s.correct||0);wrong.textContent=Number(s.wrong||0);unattempted.textContent=Number(s.unattempted||0);
  avgTime.textContent=fmtTime(Number(s.averageTimeSeconds||0));
  weakTopics.innerHTML=topicHtml(s.weakTopics,true);strongTopics.innerHTML=topicHtml(s.strongTopics);
  const sections=Array.isArray(s.sections)?s.sections:[];
  sectionRows.innerHTML=sections.length?sections.map(x=>`<tr><td><b>${esc(x.section||"Questions")}</b></td><td>${x.total||0}</td><td>${x.correct||0}</td><td>${x.wrong||0}</td><td>${x.unattempted||0}</td><td>${pct(x.accuracy)}</td><td>${Number(x.score||0).toFixed(2)}</td></tr>`).join(""):'<tr><td colspan="7" class="muted">Complete a mock to see section analysis.</td></tr>';
  const r=Array.isArray(s.recent)?s.recent:[];
  recent.innerHTML=r.length?r.map(x=>`<div class="recentItem"><div><b>${esc(x.examName||"Mock Test")} • ${esc(x.stage||"")}</b><div class="muted">${x.testType==="sectional"?`Sectional • ${esc(x.section||"")}`:"Full Mock"} • ${x.language==="HINDI"?"हिन्दी":"English"}</div></div><div><b>${Number(x.score||0).toFixed(2)} / ${Number(x.maxScore||0).toFixed(2)}</b><div class="muted">Accuracy ${pct(x.accuracy)}</div></div></div>`).join(""):'<div class="empty">Complete a mock to see analysis.</div>';
 }catch(e){recent.innerHTML=`<div class="empty">${esc(e.message||"Could not load performance.")}</div>`;}
}