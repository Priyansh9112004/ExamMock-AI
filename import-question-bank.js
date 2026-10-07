const fs=require('fs'),path=require('path'),db=require('./database');
const file=process.argv[2];if(!file){console.error('Usage: node import-question-bank.js <questions.json>');process.exit(1)}
const raw=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));const items=Array.isArray(raw)?raw:raw.questions;
if(!Array.isArray(items))throw Error('JSON must be an array or {"questions":[...]}');
const r=db.importQuestions(items);console.log(`Imported: ${r.added}`);console.log(`Skipped/duplicate/invalid: ${r.skipped}`);console.table(db.bankCounts());
