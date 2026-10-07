require('dotenv').config();
const express=require('express'),path=require('path');
const {routes,requireAuth}=require('./auth');
const {EXAMS}=require('./exam-config');
const db=require('./database');
const {buildInstantPaper}=require('./bank-engine');
const app=express(),PORT=Number(process.env.PORT||3000);
app.use(express.json({limit:'3mb'}));app.use(express.static(path.join(__dirname,'public')));routes(app);
function cleanPaper(row,attemptId){return{attemptId,paperId:row.id,examId:row.exam_id,exam:row.exam_name,stage:row.stage,testType:row.test_type,section:row.section,language:row.language,questions:JSON.parse(row.questions_json)}}
app.get('/api/health',(req,res)=>res.json({ok:true,mode:'INSTANT_QUESTION_BANK',authMode:'USER_ID_OR_EMAIL_PASSWORD'}));
app.get('/api/exams',(req,res)=>res.json({ok:true,exams:Object.values(EXAMS)}));
app.get('/api/question-bank/counts',requireAuth,(req,res)=>res.json({ok:true,counts:db.bankCounts()}));
app.post('/api/start-mock',requireAuth,(req,res)=>{try{
 const p={examId:req.body.examId,stage:req.body.stage,testType:req.body.testType==='sectional'?'sectional':'full',
 section:req.body.testType==='sectional'?String(req.body.section||''):'',
 language:String(req.body.language||'ENGLISH').toUpperCase()==='HINDI'?'HINDI':'ENGLISH'};
 const row=buildInstantPaper(req.auth.sub,p),attemptId=db.startAttempt(req.auth.sub,row.id);
 res.json({ok:true,paper:cleanPaper(row,attemptId)});
}catch(e){res.status(e.code==='BANK_INSUFFICIENT'?503:400).json({ok:false,code:e.code||'START_FAILED',error:e.message})}});
app.post('/api/submit-result',requireAuth,(req,res)=>{try{const r=db.submitAttempt(req.auth.sub,Number(req.body.attemptId),req.body);res.json({ok:true,attemptId:r.id})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/history',requireAuth,(req,res)=>res.json({ok:true,attempts:db.history(req.auth.sub)}));
app.get('/api/attempt/:id',requireAuth,(req,res)=>{const a=db.attemptDetail(req.auth.sub,Number(req.params.id));if(!a)return res.status(404).json({ok:false,error:'Attempt not found'});res.json({ok:true,attempt:a})});
app.post('/api/attempt/:id/retry',requireAuth,(req,res)=>{const old=db.attemptDetail(req.auth.sub,Number(req.params.id));if(!old)return res.status(404).json({ok:false,error:'Attempt not found'});const row=db.paperById(old.paper_id),attemptId=db.startAttempt(req.auth.sub,row.id);res.json({ok:true,paper:cleanPaper(row,attemptId)})});
app.get('/api/performance',requireAuth,(req,res)=>res.json({ok:true,stats:db.stats(req.auth.sub)}));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.htm')));
app.listen(PORT,()=>{console.log('\n========================================\n ExamMock AI Backend Running');console.log(' Mode: INSTANT QUESTION BANK');console.log(` Website: http://localhost:${PORT}`);console.log(' AI generation worker: DISABLED');console.log('========================================\n')});
