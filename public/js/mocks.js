nav("mocks");let exams=[],selected=null,activeCategory="all";
const labels={all:"All",banking:"Banking",ssc:"SSC",railways:"Railways",teaching:"Teaching"};
async function init(){
  const d=await api("/api/exams");
  exams=d.exams||[];
  renderFilters();
  const hash=location.hash.replace("#","");
  if(labels[hash])activeCategory=hash;
  render();

  try {
    if (localStorage.getItem("auth_token")) {
      const activeRes = await api("/api/active-attempt");
      if (activeRes && activeRes.active) {
        showResumeBanner(activeRes.active);
      }
    }
  } catch {}
}

function showResumeBanner(active) {
  let b = document.getElementById("resumeBanner");
  if (!b) {
    b = document.createElement("div");
    b.id = "resumeBanner";
    b.className = "card";
    b.style.cssText = "background:linear-gradient(135deg,#eff6ff 0%,#e0e7ff 100%);border:2px solid #3b82f6;margin-bottom:24px;padding:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-radius:14px";
    examGrid.parentNode.insertBefore(b, examGrid);
  }
  b.innerHTML = `
    <div>
      <span class="badge" style="background:#2563eb;color:#fff;font-size:11px;padding:3px 8px;border-radius:999px;font-weight:800">IN PROGRESS</span>
      <h3 style="margin:6px 0 2px;color:#0f2744">${esc(active.exam || active.examName)} • ${esc(active.stage)}</h3>
      <p class="muted" style="margin:0;font-size:13px">You have an ongoing unsolved test saved in PostgreSQL.</p>
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn primary" onclick='resumeTest(${JSON.stringify(active).replace(/'/g, "&apos;")})'>▶ Resume Test</button>
    </div>
  `;
}

function resumeTest(active) {
  localStorage.setItem("activePaper", JSON.stringify(active));
  location.href = "test.htm";
}
function category(x){return x.category||({"ibps-clerk":"banking","ssc-cgl":"ssc","ssc-chsl":"ssc","rrb-ntpc-graduate":"railways","rrb-ntpc-ug":"railways","rrb-group-d":"railways","ctet":"teaching"}[x.examId]||"exam")}
function renderFilters(){filters.innerHTML=Object.entries(labels).map(([k,v])=>`<button class="btn ${activeCategory===k?"active":""}" onclick="setCategory('${k}')">${v}</button>`).join("")}
function setCategory(k){activeCategory=k;location.hash=k==="all"?"":k;renderFilters();render()}
function render(){const list=activeCategory==="all"?exams:exams.filter(x=>category(x)===activeCategory);examGrid.innerHTML=list.map(x=>`<div class="card examcard"><span class="eyebrow">${esc(category(x).toUpperCase())}</span><h3>${esc(x.exam)}</h3><div class="exammeta"><span class="tag">${esc(x.stage)}</span><span class="tag">${x.sections.reduce((s,a)=>s+Number(a.count||0),0)} questions</span><span class="tag">${Math.round(Number(x.duration||0)/60)} min</span></div><button class="btn primary" onclick='choose(${JSON.stringify(x.examId)},${JSON.stringify(x.stage)})'>Configure Mock</button></div>`).join("")||'<div class="empty">No exams in this category yet.</div>'}
function choose(id,st){selected=exams.find(x=>x.examId===id&&x.stage===st);if(!selected)return;setup.classList.remove("hidden");setupTitle.textContent=`${selected.exam} • ${selected.stage}`;stage.innerHTML=`<option>${esc(selected.stage)}</option>`;section.innerHTML=selected.sections.map(s=>`<option>${esc(s.name)}</option>`).join("");sync();setup.scrollIntoView({behavior:"smooth"})}
function sync(){sectionField.classList.toggle("hidden",testType.value!=="sectional")}testType.onchange=sync;
startBtn.onclick=async()=>{if(!guard()||!selected)return;startBtn.disabled=true;const mode=typeof mockMode!=='undefined'?mockMode.value:'bank';msg("Allocating unseen ready paper...","ok");try{const d=await api("/api/start-mock",{method:"POST",body:JSON.stringify({examId:selected.examId,stage:selected.stage,testType:testType.value,section:testType.value==="sectional"?section.value:"",language:language.value,mode:mode})});localStorage.setItem("activePaper",JSON.stringify(d.paper));location.href="test.htm"}catch(e){msg(e.message,"err");startBtn.disabled=false}};
function msg(t,k){setupMsg.textContent=t;setupMsg.className=`msg show ${k}`}init().catch(e=>examGrid.innerHTML=`<div class="empty">${esc(e.message)}</div>`);