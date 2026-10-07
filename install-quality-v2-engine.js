// Adds getBankCandidates() to the current database.js without touching schema/data.
// Run once: node install-quality-v2-engine.js
const fs=require('fs'),path=require('path');
const file=path.join(__dirname,'database.js');
let s=fs.readFileSync(file,'utf8');
if(s.includes('function getBankCandidates(')){
 console.log('database.js already has Quality v2 candidate selector.'); process.exit(0);
}
const marker='function pickBankQuestions(userId,{examId,stage,sectionId,sectionName,language,count}){';
const at=s.indexOf(marker);
if(at<0)throw Error('Could not find pickBankQuestions() in database.js. No changes made.');
const fn=`function getBankCandidates(userId,{examId,stage,sectionId,language}){
 const seenRows=db.prepare(\`SELECT p.questions_json FROM attempts a JOIN papers p ON p.id=a.paper_id WHERE a.user_id=?\`).all(userId);
 const seen=new Set();
 for(const r of seenRows){try{for(const q of JSON.parse(r.questions_json)||[])seen.add(String(q.id||q.question||'').trim().toLowerCase())}catch{}}
 const lang=String(language||'ENGLISH').toUpperCase();
 const rows=db.prepare(\`SELECT * FROM question_bank WHERE active=1 AND section_id=? AND language=?
  AND (exam_id='' OR exam_id=?) AND (stage='' OR stage=?) ORDER BY RANDOM()\`).all(sectionId,lang,examId,stage);
 const mapped=rows.map(r=>({id:r.id,sectionId:r.section_id,section:r.section_name,topic:r.topic,subtopic:r.subtopic,
  difficulty:String(r.difficulty||'MEDIUM').toUpperCase(),question:r.question,options:JSON.parse(r.options_json),answer:r.answer,
  solution:r.solution,shortTrick:r.short_trick}));
 const fresh=mapped.filter(r=>!seen.has(String(r.id||r.question||'').trim().toLowerCase()));
 const old=mapped.filter(r=>!fresh.includes(r));
 return [...fresh,...old];
}

`;
s=s.slice(0,at)+fn+s.slice(at);
const old='module.exports={db,createUser,getUserByIdentifier,getUserById,savePaper,readyCount,allocatePaper,paperById,startAttempt,submitAttempt,history,attemptDetail,stats,getState,setState,getGenerationCheckpoint,saveGenerationCheckpoint,clearGenerationCheckpoint,importQuestions,bankCounts,pickBankQuestions};';
if(!s.includes(old))throw Error('Could not find database.js export line. No changes written.');
s=s.replace(old,old.replace('pickBankQuestions','getBankCandidates,pickBankQuestions'));
fs.copyFileSync(file,file+'.quality-v2-backup');
fs.writeFileSync(file,s);
console.log('Installed Quality v2 selector into database.js');
console.log('Backup: database.js.quality-v2-backup');
