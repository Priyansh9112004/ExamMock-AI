const bcrypt=require('bcryptjs'); const jwt=require('jsonwebtoken'); const {createUser,getUserByIdentifier,getUserById}=require('./database');
const secret=()=>process.env.JWT_SECRET||'dev-only-change-me';
function token(user){return jwt.sign({sub:user.id,name:user.name,userId:user.user_id,email:user.email},secret(),{expiresIn:'7d'})}
function requireAuth(req,res,next){try{const raw=req.headers.authorization||'';const t=raw.startsWith('Bearer ')?raw.slice(7):'';if(!t)return res.status(401).json({ok:false,error:'Login required'});req.auth=jwt.verify(t,secret());next()}catch{return res.status(401).json({ok:false,error:'Session expired. Please login again.'})}}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim())}
function validUserId(v){return /^[A-Za-z0-9_]{3,25}$/.test(String(v||'').trim())}
function routes(app){
 app.post('/api/auth/register',async(req,res)=>{try{const name=String(req.body.name||'').trim(),userId=String(req.body.userId||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');if(name.length<2)throw Error('Enter your name');if(!validUserId(userId))throw Error('User ID must be 3-25 characters: letters, numbers or underscore only');if(!validEmail(email))throw Error('Enter a valid email address');if(password.length<8)throw Error('Password must be at least 8 characters');if(getUserByIdentifier(userId)||getUserByIdentifier(email))throw Error('User ID or email is already registered');const hash=await bcrypt.hash(password,12);const user=createUser({name,userId,email,passwordHash:hash});res.json({ok:true,token:token(user),user});}catch(e){res.status(400).json({ok:false,error:e.message})}});
 app.post('/api/auth/login',async(req,res)=>{try{const identifier=String(req.body.identifier||'').trim(),u=getUserByIdentifier(identifier);if(!u||!(await bcrypt.compare(String(req.body.password||''),u.password_hash)))throw Error('Invalid User ID/email or password');const user=getUserById(u.id);res.json({ok:true,token:token(user),user});}catch(e){res.status(400).json({ok:false,error:e.message})}});
 app.get('/api/auth/me',requireAuth,(req,res)=>res.json({ok:true,user:getUserById(req.auth.sub)}));
}
module.exports={routes,requireAuth};
