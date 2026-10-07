const db=require('./database').db;
console.log('question_bank columns:');
console.table(db.prepare('PRAGMA table_info(question_bank)').all().map(x=>({name:x.name,type:x.type})));
console.log('Grouped rows:',db.prepare(`SELECT COUNT(*) c FROM question_bank WHERE group_id<>''`).get().c);
console.log('4-option rows:',db.prepare(`SELECT COUNT(*) c FROM question_bank WHERE json_array_length(options_json)=4`).get().c);
console.log('5-option rows:',db.prepare(`SELECT COUNT(*) c FROM question_bank WHERE json_array_length(options_json)=5`).get().c);
