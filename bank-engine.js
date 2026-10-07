const crypto=require('crypto');
const {EXAMS}=require('./exam-config'); const db=require('./database');

function shuffle(a){return [...a].sort(()=>Math.random()-.5)}
function groupedUnits(rows){
 const units=[], groups=new Map();
 for(const q of rows){
  if(q.groupId){
   if(!groups.has(q.groupId))groups.set(q.groupId,[]);
   groups.get(q.groupId).push(q);
  }else units.push([q]);
 }
 for(const g of groups.values())units.push(g.sort((a,b)=>a.groupOrder-b.groupOrder));
 return shuffle(units);
}
function choose(rows,count){
 if(rows.length<count)return null;
 const units=groupedUnits(rows), picked=[], used=new Set();
 // Prefer complete multi-question sets, then singles. Never split a set.
 units.sort((a,b)=>(b.length>1)-(a.length>1));
 for(const unit of units){
  if(unit.some(q=>used.has(q.id)))continue;
  if(picked.length+unit.length>count)continue;
  picked.push(...unit); unit.forEach(q=>used.add(q.id));
  if(picked.length===count)break;
 }
 if(picked.length<count){
  for(const q of rows){
   if(!used.has(q.id) && picked.length<count){picked.push(q);used.add(q.id)}
  }
 }
 return picked.length===count?picked:null;
}
function buildInstantPaper(userId,p){
 const cfg=EXAMS[`${p.examId}|${p.stage}`]; if(!cfg)throw Error('Unsupported exam/stage.');
 let sections=cfg.sections;
 if(p.testType==='sectional'){sections=sections.filter(s=>s.id===p.section||s.name===p.section);if(!sections.length)throw Error('Invalid section.')}
 const questions=[],shortages=[];
 for(const sec of sections){
  const qLanguage=sec.englishOnly?'ENGLISH':p.language;
  const candidates=db.getBankCandidates(userId,{examId:p.examId,stage:p.stage,sectionId:sec.id,language:qLanguage});
  const picked=choose(candidates,sec.count);
  if(!picked){shortages.push(`${sec.name}: need ${sec.count} ${qLanguage} questions`);continue}
  questions.push(...picked.map(q=>({...q,positive:cfg.positive,negative:cfg.negative})));
 }
 if(shortages.length){const e=Error(`Question bank is not ready. ${shortages.join(' | ')}`);e.code='BANK_INSUFFICIENT';throw e}
 const paper={id:crypto.randomUUID(),examId:p.examId,examName:cfg.exam,stage:p.stage,testType:p.testType,
 section:p.testType==='sectional'?p.section:'',language:p.language,questions};
 db.savePaper(paper); return db.paperById(paper.id);
}
module.exports={buildInstantPaper};
