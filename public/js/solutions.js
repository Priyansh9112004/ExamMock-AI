nav("tests");
let a=JSON.parse(localStorage.getItem("reviewAttempt")||"null"),idx=0;
if(!a){location.href="my-tests.htm";throw Error("No attempt");}
let answers=a.answers||[],questions=a.questions||[];
try{if(typeof a.answers_json==="string")answers=JSON.parse(a.answers_json||"[]");}catch{}
try{if(typeof a.questions_json==="string")questions=JSON.parse(a.questions_json||"[]");}catch{}
title.textContent=`${a.exam||a.examName||a.exam_name||"Mock Test"} Solutions`;
meta.textContent=`${a.stage||""} • ${a.testType==="sectional"?(a.section||"Sectional Test"):"Full Mock"} • ${a.language==="HINDI"?"हिन्दी":"English"}`;
function resultClass(x){return !x.isAttempted?"unattempted":x.isCorrect?"correct":"wrong";}
function render(){
 if(!answers.length){solutionCard.innerHTML='<p class="muted">Detailed answer data is not available for this attempt.</p>';solPalette.innerHTML="";return;}
 const x=answers[idx]||{},q=questions[x.questionIndex??idx]||{},opts=x.options||q.options||[];
 const selected=x.selectedAnswer,correct=x.correctAnswer??q.answer,state=resultClass(x);
 const label=state==="correct"?"CORRECT":state==="wrong"?"WRONG":"UNATTEMPTED";
 solutionCard.innerHTML=`<div class="solutionTop"><b>Question ${idx+1} of ${answers.length}</b><span class="badge ${state}">${label}</span></div>
 ${x.section?`<div class="muted" style="margin-top:8px">${esc(x.section)}${x.topic?` • ${esc(x.topic)}`:""}</div>`:""}
 <div class="solQuestion">${esc(x.question||q.question||"")}</div>
 ${opts.map((o,n)=>{let c="";if(n===correct&&n===selected)c="selectedCorrect";else if(n===correct)c="correct";else if(n===selected)c="selectedWrong";let tag="";if(n===correct)tag+="Correct Answer";if(n===selected)tag+=(tag?" • ":"")+"Your Answer";return `<div class="solOption ${c}"><b>${String.fromCharCode(65+n)}.</b><div>${esc(o)}</div>${tag?`<span class="answerLabels">${tag}</span>`:""}</div>`}).join("")}
 <div class="solutionBox"><b>Detailed Solution</b><p>${esc(x.solution||q.solution||"Solution not available.")}</p>${(x.shortTrick||q.shortTrick)?`<div class="trick"><b>Short Trick / Faster Method</b><p>${esc(x.shortTrick||q.shortTrick)}</p></div>`:""}</div>`;
 solPalette.innerHTML=answers.map((z,n)=>`<button class="${resultClass(z)} ${n===idx?"current":""}" onclick="idx=${n};render()">${n+1}</button>`).join("");
 prevSolution.disabled=idx===0;nextSolution.disabled=idx===answers.length-1;
}
function move(d){idx=Math.max(0,Math.min(answers.length-1,idx+d));render();window.scrollTo({top:0,behavior:"smooth"});}
render();
