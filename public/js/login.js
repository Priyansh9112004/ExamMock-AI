const u = auth.user();
if (u) {
  if (u.role === 'admin') { location.href = 'admin.htm'; }
  else { location.href = 'dashboard.htm'; }
}

nav();
const setTab=r=>{loginForm.classList.toggle('hidden',r);registerForm.classList.toggle('hidden',!r);loginTab.classList.toggle('active',!r);registerTab.classList.toggle('active',r)};
loginTab.onclick=()=>setTab(false);
registerTab.onclick=()=>setTab(true);
if(location.hash==='#register')setTab(true);
function show(t,k){authMsg.textContent=t;authMsg.className=`msg show ${k}`}

registerBtn.onclick=async()=>{
  registerBtn.disabled=true;
  try{
    const d=await api('/api/auth/register',{method:'POST',body:JSON.stringify({name:regName.value.trim(),userId:regUserId.value.trim(),email:regEmail.value.trim(),password:regPassword.value})});
    auth.set(d.token,d.user);
    location.href='dashboard.htm';
  }catch(e){show(e.message,'err')}finally{registerBtn.disabled=false}
};

loginBtn.onclick=async()=>{
  loginBtn.disabled=true;
  try{
    const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify({identifier:loginIdentifier.value.trim(),password:loginPassword.value})});
    auth.set(d.token,d.user);
    if(d.user && d.user.role === 'admin'){
      location.href='admin.htm';
    }else{
      location.href='dashboard.htm';
    }
  }catch(e){show(e.message,'err')}finally{loginBtn.disabled=false}
};

[loginIdentifier, loginPassword].forEach(el => {
  if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });
});
