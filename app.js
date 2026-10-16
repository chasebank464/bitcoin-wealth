const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
let currentUser = null;
let authMode = "register";
let siteConfig = { walletAddress:"", tawkPropertyId:"", tawkWidgetId:"default" };
let tawkLoaded = false;

const money = value => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(Number(value || 0));
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(url, options={}) {
  const res = await fetch(url, {credentials:"same-origin", headers:{"Content-Type":"application/json", ...(options.headers||{})}, ...options});
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function toast(message) {
  const el=$("#toast"); el.textContent=message; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2600);
}
function showPage(name) {
  $$(".page").forEach(p=>p.classList.remove("active"));
  const map={home:"#homePage",auth:"#authPage",dashboard:"#dashboardPage",invest:"#investPage"};
  $(map[name]||"#homePage").classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
  $("#nav").classList.remove("open");
}
function showAuth(mode) {
  authMode=mode;
  $("#authTitle").textContent=mode==="register"?"Create your account":"Welcome back";
  $("#authSubtitle").textContent=mode==="register"?"Your personal dashboard starts here.":"Log in to view your account.";
  $("#nameField").classList.toggle("hidden",mode!=="register");
  $("#fullName").required=mode==="register";
  $("#password").autocomplete=mode==="register"?"new-password":"current-password";
  $("#password").placeholder=mode==="register"?"At least 10 characters":"Your password";
  $("#password").minLength=mode==="register"?10:1;
  $("#authSubmit").textContent=mode==="register"?"Create account":"Log in";
  $("#authSwitch").innerHTML=mode==="register"?'Already registered? <button type="button" class="text-button" data-action="login">Log in</button>':'New here? <button type="button" class="text-button" data-action="register">Create account</button>';
  $("#authError").textContent="";
  $("#authForm").reset();
  showPage("auth");
}
function drawChart() {
  const svg=$("#heroChart"); if(!svg) return;
  const points=[]; let val=110;
  for(let i=0;i<54;i++){val+= (Math.random()-.47)*17;val=Math.max(25,Math.min(190,val));points.push([i*600/53,val]);}
  const line=points.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const area=line+` L 600 220 L 0 220 Z`;
  svg.innerHTML=`<defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f4b942" stop-opacity=".3"/><stop offset="100%" stop-color="#f4b942" stop-opacity="0"/></linearGradient></defs>
  <g stroke="#2a3040" stroke-width="1" stroke-dasharray="4 7"><path d="M0 45H600 M0 95H600 M0 145H600 M0 195H600"/></g>
  <path d="${area}" fill="url(#chartFill)"/><path d="${line}" fill="none" stroke="#f4b942" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const price=67000+(Math.random()-.5)*1800;
  $("#btcPrice").textContent=money(price);
  const change=((Math.random()-.42)*3).toFixed(2);
  $("#btcChange").innerHTML=`${Number(change)>=0?"+":""}${change}% <span>simulated movement</span>`;
  $("#btcChange").style.color=Number(change)>=0?"var(--green)":"var(--red)";
}
async function loadConfig() {
  try {siteConfig=await api("/api/config"); updateWallet(); loadTawk();} catch {}
}
function loadTawk() {
  if(tawkLoaded || !siteConfig.tawkPropertyId) return;
  tawkLoaded=true;
  const property=encodeURIComponent(siteConfig.tawkPropertyId);
  const widget=encodeURIComponent(siteConfig.tawkWidgetId||"default");
  const script=document.createElement("script");
  script.async=true; script.src=`https://embed.tawk.to/${property}/${widget}`;
  script.charset="UTF-8"; script.setAttribute("crossorigin","*");
  document.body.appendChild(script);
}
function updateWallet() {
  $("#walletAddressDisplay").textContent=siteConfig.walletAddress || "The administrator has not added a wallet address yet.";
}
function renderTransactions(transactions=[]) {
  const el=$("#transactions");
  if(!transactions.length){el.innerHTML='<p class="empty">No transaction records yet.</p>';return;}
  el.innerHTML=transactions.map(t=>`<div class="transaction-row">
    <div class="transaction-info"><b>${escapeHtml(t.kind.toUpperCase())} · ${escapeHtml(t.description)}</b><span>${escapeHtml(t.createdAt)} · ${escapeHtml(t.status)}</span></div>
    <div class="transaction-amount ${t.kind==="credit"?"credit":"debit"}">${t.kind==="credit"?"+":"−"}${money(t.amount)}</div>
  </div>`).join("");
}
function renderDashboard(data) {
  currentUser=data.user;
  $("#dashName").textContent=data.user.fullName.split(" ")[0];
  $("#dashInvestment").textContent=money(data.user.investment);
  $("#dashEarnings").textContent=money(data.user.earnings);
  $("#dashBalance").textContent=money(data.user.balance);
  renderTransactions(data.transactions||[]);
  $("#adminPanel").classList.toggle("hidden",data.user.role!=="admin");
  showPage("dashboard");
  if(data.user.role==="admin") loadAdmin();
}
async function loadMe() {
  const data=await api("/api/me");
  renderDashboard(data);
}
document.addEventListener("click", async e=>{
  const actionEl=e.target.closest("[data-action]");
  if(actionEl){
    const action=actionEl.dataset.action;
    if(action==="register"||action==="login"){showAuth(action);return;}
    if(action==="invest"){await loadConfig();updateWallet();showPage("invest");return;}
    if(action==="dashboard"){try{await loadMe();}catch{showPage("home");}return;}
    if(action==="logout"){try{await api("/api/logout",{method:"POST"});currentUser=null;toast("You have logged out.");showPage("home");}catch(err){toast(err.message);}return;}
  }
  const pageEl=e.target.closest("[data-page]");
  if(pageEl){e.preventDefault();showPage(pageEl.dataset.page);}
  const tab=e.target.closest("[data-tab]");
  if(tab){$$("[data-tab]").forEach(t=>t.classList.toggle("active",t===tab));["users","settings","audit"].forEach(n=>$("#admin"+n[0].toUpperCase()+n.slice(1)).classList.toggle("hidden",tab.dataset.tab!==n));if(tab.dataset.tab==="settings")loadSettings();if(tab.dataset.tab==="audit")loadAudit();}
});
$("#authForm").addEventListener("submit",async e=>{
  e.preventDefault();$("#authError").textContent="";
  const payload={email:$("#email").value.trim(),password:$("#password").value};
  if(authMode==="register")payload.fullName=$("#fullName").value.trim();
  try{
    const data=await api(authMode==="register"?"/api/register":"/api/login",{method:"POST",body:JSON.stringify(payload)});
    renderDashboard(data);toast(authMode==="register"?"Account created.":"Welcome back.");
  }catch(err){$("#authError").textContent=err.message;}
});
async function loadAdmin(){
  try{
    const {users}=await api("/api/admin/users");
    const el=$("#userCards");
    const normalUsers=users.filter(u=>u.role==="user");
    if(!normalUsers.length){el.innerHTML='<p class="empty">No registered users yet.</p>';return;}
    el.innerHTML=normalUsers.map(u=>`<article class="user-card" data-user-id="${u.id}">
      <div class="user-card-head"><div><b>${escapeHtml(u.fullName)}</b><span>${escapeHtml(u.email)} · Joined ${escapeHtml(u.createdAt)}</span></div><span>Account #${u.id}</span></div>
      <div class="user-edit-grid">
        <div class="field"><label>Investment (USD)</label><input type="number" min="0" step=".01" data-field="investment" value="${u.investment}"></div>
        <div class="field"><label>Earnings (USD)</label><input type="number" min="0" step=".01" data-field="earnings" value="${u.earnings}"></div>
        <div class="field"><label>Balance (USD)</label><input type="number" min="0" step=".01" data-field="balance" value="${u.balance}"></div>
      </div>
      <div class="user-card-actions"><button class="btn btn-gold small-btn" data-admin-action="save">Save figures</button></div>
      <div class="user-edit-grid" style="margin-top:16px">
        <div class="field"><label>Record type</label><select data-field="kind"><option value="credit">Credit</option><option value="debit">Debit</option></select></div>
        <div class="field"><label>Amount (USD)</label><input type="number" min=".01" step=".01" data-field="txAmount" placeholder="0.00"></div>
        <div class="field"><label>Description</label><input data-field="description" maxlength="240" placeholder="e.g. Manual adjustment"></div>
      </div>
      <div class="user-card-actions"><button class="btn btn-outline small-btn" data-admin-action="transaction">Add credit/debit record</button></div>
      <p class="tiny">Manual records are labelled as administrator-entered and are not independently verified.</p>
    </article>`).join("");
  }catch(err){$("#userCards").innerHTML=`<p class="form-error">${escapeHtml(err.message)}</p>`;}
}
$("#userCards").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-admin-action]");if(!btn)return;
  const card=btn.closest("[data-user-id]");const id=card.dataset.userId;
  btn.disabled=true;
  try{
    if(btn.dataset.adminAction==="save"){
      const payload={};
      ["investment","earnings","balance"].forEach(k=>payload[k]=card.querySelector(`[data-field="${k}"]`).value);
      await api(`/api/admin/users/${id}`,{method:"PATCH",body:JSON.stringify(payload)});
      toast("Account figures updated.");await loadAdmin();
    }else{
      const payload={kind:card.querySelector('[data-field="kind"]').value,amount:card.querySelector('[data-field="txAmount"]').value,description:card.querySelector('[data-field="description"]').value};
      await api(`/api/admin/users/${id}/transactions`,{method:"POST",body:JSON.stringify(payload)});
      toast("Manual transaction record added.");await loadAdmin();
    }
  }catch(err){toast(err.message);}finally{btn.disabled=false;}
});
async function loadSettings(){
  try{const data=await api("/api/admin/settings");$("#walletAddress").value=data.walletAddress||"";$("#tawkPropertyId").value=data.tawkPropertyId||"";$("#tawkWidgetId").value=data.tawkWidgetId||"default";}catch(err){toast(err.message);}
}
$("#settingsForm").addEventListener("submit",async e=>{
  e.preventDefault();$("#settingsMessage").textContent="";
  try{
    const data={walletAddress:$("#walletAddress").value.trim(),tawkPropertyId:$("#tawkPropertyId").value.trim(),tawkWidgetId:$("#tawkWidgetId").value.trim()||"default"};
    await api("/api/admin/settings",{method:"PUT",body:JSON.stringify(data)});
    siteConfig=await api("/api/config");updateWallet();$("#settingsMessage").textContent="Settings saved. Reload the page to activate a newly configured chat widget.";toast("Site settings saved.");
  }catch(err){$("#settingsMessage").textContent=err.message;}
});
async function loadAudit(){
  try{const {logs}=await api("/api/admin/audit");$("#auditList").innerHTML=logs.length?logs.map(l=>`<div class="audit-row"><b>${escapeHtml(l.action)}</b><span>${escapeHtml(l.created_at)} · Admin: ${escapeHtml(l.admin_name||"Unknown")}${l.target_name?" · User: "+escapeHtml(l.target_name):""}</span><code>${escapeHtml(l.details)}</code></div>`).join(""):'<p class="empty">No audit entries yet.</p>';}catch(err){$("#auditList").innerHTML=`<p class="form-error">${escapeHtml(err.message)}</p>`;}
}
$("#copyWallet").addEventListener("click",async()=>{
  if(!siteConfig.walletAddress){$("#copyMessage").textContent="The administrator has not configured an address yet.";return;}
  try{await navigator.clipboard.writeText(siteConfig.walletAddress);$("#copyMessage").textContent="Address copied. Verify it before sending."; }catch{$("#copyMessage").textContent="Copy is unavailable here. Select and copy the address manually.";}
});
$("#menuToggle").addEventListener("click",()=>$("#nav").classList.toggle("open"));
$("#year").textContent=new Date().getFullYear();
drawChart();setInterval(drawChart,6500);loadConfig();
(async()=>{try{await loadMe();}catch{showPage("home");}})();
