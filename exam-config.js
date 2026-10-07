const EXAMS = {
  "ibps-clerk|Prelims": { examId:"ibps-clerk", exam:"IBPS Clerk / CSA", category:"banking", stage:"Prelims", duration:3600, positive:1, negative:0.25, sections:[
    {id:"english",name:"English Language",count:30,englishOnly:true},{id:"numerical",name:"Numerical Ability",count:35},{id:"reasoning",name:"Reasoning Ability",count:35}] },
  "sbi-clerk|Prelims": { examId:"sbi-clerk", exam:"SBI Clerk", category:"banking", stage:"Prelims", duration:3600, positive:1, negative:0.25, sections:[
    {id:"english",name:"English Language",count:30,englishOnly:true},{id:"numerical",name:"Numerical Ability",count:35},{id:"reasoning",name:"Reasoning Ability",count:35}] },
  "rbi-assistant|Prelims": { examId:"rbi-assistant", exam:"RBI Assistant", category:"banking", stage:"Prelims", duration:3600, positive:1, negative:0.25, sections:[
    {id:"english",name:"English Language",count:30,englishOnly:true},{id:"numerical",name:"Numerical Ability",count:35},{id:"reasoning",name:"Reasoning Ability",count:35}] },
  "ibps-rrb-clerk|Prelims": { examId:"ibps-rrb-clerk", exam:"IBPS RRB Office Assistant", category:"banking", stage:"Prelims", duration:2700, positive:1, negative:0.25, sections:[
    {id:"reasoning",name:"Reasoning Ability",count:40},{id:"numerical",name:"Numerical Ability",count:40}] },
  "sbi-po|Prelims": { examId:"sbi-po", exam:"SBI PO", category:"banking", stage:"Prelims", duration:3600, positive:1, negative:0.25, sections:[
    {id:"english",name:"English Language",count:40,englishOnly:true},{id:"quant",name:"Quantitative Aptitude",count:30},{id:"reasoning",name:"Reasoning Ability",count:30}] },

  "ssc-cgl|Tier-I": { examId:"ssc-cgl", exam:"SSC CGL", category:"ssc", stage:"Tier-I", duration:3600, positive:2, negative:0.5, sections:[
    {id:"reasoning",name:"General Intelligence & Reasoning",count:25},{id:"ga",name:"General Awareness",count:25},{id:"quant",name:"Quantitative Aptitude",count:25},{id:"english",name:"English Comprehension",count:25,englishOnly:true}] },
  "ssc-chsl|Tier-I": { examId:"ssc-chsl", exam:"SSC CHSL", category:"ssc", stage:"Tier-I", duration:3600, positive:2, negative:0.5, sections:[
    {id:"english",name:"English Language",count:25,englishOnly:true},{id:"reasoning",name:"General Intelligence",count:25},{id:"quant",name:"Quantitative Aptitude",count:25},{id:"ga",name:"General Awareness",count:25}] },
  "ssc-cpo|Paper-I": { examId:"ssc-cpo", exam:"SSC CPO", category:"ssc", stage:"Paper-I", duration:7200, positive:1, negative:0.25, sections:[
    {id:"reasoning",name:"General Intelligence & Reasoning",count:50},{id:"gk",name:"General Knowledge & General Awareness",count:50},{id:"quant",name:"Quantitative Aptitude",count:50},{id:"english",name:"English Comprehension",count:50,englishOnly:true}] },
  "ssc-gd|CBE": { examId:"ssc-gd", exam:"SSC GD Constable", category:"ssc", stage:"CBE", duration:3600, positive:2, negative:0.25, sections:[
    {id:"reasoning",name:"General Intelligence & Reasoning",count:20},{id:"gk",name:"General Knowledge & General Awareness",count:20},{id:"math",name:"Elementary Mathematics",count:20},{id:"english-hindi",name:"English / Hindi",count:20}] },

  "rrb-ntpc-graduate|CBT-1": { examId:"rrb-ntpc-graduate", exam:"RRB NTPC Graduate", category:"railways", stage:"CBT-1", duration:5400, positive:1, negative:1/3, sections:[
    {id:"ga",name:"General Awareness",count:40},{id:"math",name:"Mathematics",count:30},{id:"reasoning",name:"General Intelligence & Reasoning",count:30}] },
  "rrb-ntpc-ug|CBT-1": { examId:"rrb-ntpc-ug", exam:"RRB NTPC UG", category:"railways", stage:"CBT-1", duration:5400, positive:1, negative:1/3, sections:[
    {id:"ga",name:"General Awareness",count:40},{id:"math",name:"Mathematics",count:30},{id:"reasoning",name:"General Intelligence & Reasoning",count:30}] },
  "rrb-group-d|CBT": { examId:"rrb-group-d", exam:"RRB Group D", category:"railways", stage:"CBT", duration:5400, positive:1, negative:1/3, sections:[
    {id:"science",name:"General Science",count:25},{id:"math",name:"Mathematics",count:25},{id:"reasoning",name:"General Intelligence & Reasoning",count:30},{id:"ga",name:"General Awareness & Current Affairs",count:20}] },
  "rrb-alp|CBT-1": { examId:"rrb-alp", exam:"RRB ALP", category:"railways", stage:"CBT-1", duration:3600, positive:1, negative:1/3, sections:[
    {id:"math",name:"Mathematics",count:20},{id:"reasoning",name:"Mental Ability",count:25},{id:"science",name:"General Science",count:20},{id:"ga",name:"General Awareness",count:10}] },
  "rrb-technician-3|CBT": { examId:"rrb-technician-3", exam:"RRB Technician Grade III", category:"railways", stage:"CBT", duration:5400, positive:1, negative:1/3, sections:[
    {id:"math",name:"Mathematics",count:25},{id:"reasoning",name:"General Intelligence & Reasoning",count:25},{id:"science",name:"General Science",count:40},{id:"ga",name:"General Awareness",count:10}] },

  "ctet|Paper-I": { examId:"ctet", exam:"CTET", category:"teaching", stage:"Paper-I", duration:9000, positive:1, negative:0, sections:[
    {id:"cdp",name:"Child Development & Pedagogy",count:30},{id:"lang1",name:"Language I",count:30,languageSubject:true},{id:"lang2",name:"Language II",count:30,languageSubject:true},{id:"math",name:"Mathematics",count:30},{id:"evs",name:"Environmental Studies",count:30}] },
  "ctet|Paper-II": { examId:"ctet", exam:"CTET", category:"teaching", stage:"Paper-II", duration:9000, positive:1, negative:0, sections:[
    {id:"cdp",name:"Child Development & Pedagogy",count:30},{id:"lang1",name:"Language I",count:30,languageSubject:true},{id:"lang2",name:"Language II",count:30,languageSubject:true},{id:"subject",name:"Mathematics & Science / Social Studies",count:60}] }
};
const FIVE_OPTION = new Set(['ibps-clerk', 'sbi-clerk', 'rbi-assistant', 'ibps-rrb-clerk', 'sbi-po']);
for (const cfg of Object.values(EXAMS)) cfg.optionCount = FIVE_OPTION.has(cfg.examId) ? 5 : 4;
module.exports={EXAMS};