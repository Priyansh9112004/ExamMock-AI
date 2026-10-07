nav();
const r=JSON.parse(localStorage.getItem("lastResult")||"null");
if(!r){location.href="my-tests.htm";throw Error("No result");}
title.textContent=`${r.exam||r.examName||"Mock Test"} Result`;
meta.textContent=`${r.stage||""} • ${r.testType==="sectional"?(r.section||"Sectional Test"):"Full Mock"} • ${r.language==="HINDI"?"हिन्दी":"English"}`;
const sc=Number(r.score||0),mx=Number(r.maxScore||0);
score.textContent=`${sc.toFixed(2)} / ${mx.toFixed(2)}`;
scorePercent.textContent=mx?`${(sc/mx*100).toFixed(1)}% of maximum marks`:"";
correct.textContent=Number(r.correct||0);
wrong.textContent=Number(r.wrong||0);
unattempted.textContent=Number(r.unattempted||0);
accuracy.textContent=`${Number(r.accuracy||0).toFixed(1)}%`;
time.textContent=fmtTime(Number(r.totalTimeSeconds||0));
let sections=Array.isArray(r.sections)?r.sections:[];
if(!sections.length&&Array.isArray(r.answers)){
 const map={}; for(const x of r.answers){const n=x.section||"Questions";map[n]??={section:n,total:0,correct:0,wrong:0,unattempted:0,score:0};const s=map[n];s.total++;s.score+=Number(x.marksAwarded||0);if(!x.isAttempted)s.unattempted++;else if(x.isCorrect)s.correct++;else s.wrong++;}
 sections=Object.values(map).map(s=>({...s,accuracy:(s.correct+s.wrong)?s.correct/(s.correct+s.wrong)*100:0}));
}
sectionRows.innerHTML=sections.length?sections.map(s=>`<tr><td><b>${esc(s.section||"Questions")}</b></td><td>${s.total||0}</td><td>${s.correct||0}</td><td>${s.wrong||0}</td><td>${s.unattempted||0}</td><td>${Number(s.accuracy||0).toFixed(1)}%</td><td>${Number(s.score||0).toFixed(2)}</td></tr>`).join(""):`<tr><td colspan="7" class="muted">Section analysis is not available for this attempt.</td></tr>`;
function solutions(){localStorage.setItem("reviewAttempt",JSON.stringify({...r,answers:r.answers||[],questions:r.questions||[]}));location.href="solutions.htm";}
