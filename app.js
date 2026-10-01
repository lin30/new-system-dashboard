"use strict";
const EXPECTED_NAV=["总览","周报","关注标的","新机会","研究进展","系统状态"];
const EXPECTED_MODULES=["formal_weekly","candidate_weekly","watchlist","opportunities","system_health"];
const PERMISSIONS=["trade_permission","execution_permission","broker_connection","paper_action_enabled"];
const MODULE_LABELS={formal_weekly:"正式周报",candidate_weekly:"候选周报",watchlist:"关注标的",opportunities:"机会扫描",system_health:"系统状态"};
const STATUS_LABELS={verified:"已核验",partial:"部分覆盖",stale:"历史保留",unavailable:"未供应",unknown:"未确认"};
const AUTHORITY_LABELS={FORMAL:"正式研究",CANDIDATE:"研究候选",CONTINUITY:"连续跟踪",NOMINATION:"研究提名",HISTORICAL:"历史记录",SYSTEM:"系统记录"};
const GATE_LABELS={G1_compute_accelerator:"算力芯片",G4_data_movement:"数据传输与互联",G5_board_package_manufacturing:"PCB与封装制造",G6_power_delivery:"电源与供配电",G7_thermal_site:"液冷与数据中心",G8_specified_equipment_material:"专用设备与材料"};
const $=s=>document.querySelector(s);
const esc=v=>String(v??"未提供").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const moduleData=(p,n)=>p.modules?.[n]?.data||{};
const fmtTime=v=>{if(!v)return"未提供";const d=new Date(v);return Number.isNaN(d.valueOf())?"未提供":d.toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false});};
const fmtDate=v=>{if(!v)return"未提供";const d=new Date(v);return Number.isNaN(d.valueOf())?"未提供":d.toLocaleDateString("zh-CN",{timeZone:"Asia/Shanghai"});};
const badge=a=>'<span class="badge '+esc(a)+'">'+esc(AUTHORITY_LABELS[a]||a)+'</span>';
const unique=xs=>[...new Set(xs.filter(Boolean))];
let CURRENT_PAYLOAD=null;
let SECURITY_INDEX=new Map();
let HISTORY_PAYLOAD=null;
let DRAWER_RETURN_FOCUS=null;

function moduleIsCurrent(p,name){
  const m=p.modules?.[name];
  if(!m||m.status!=="verified"||m.data_from_previous_snapshot===true)return false;
  const week=m.data?.as_of,formalWeek=moduleData(p,"formal_weekly").as_of;
  return !(week&&formalWeek&&/^\d{4}-W\d{2}$/.test(week)&&week<formalWeek);
}
function moduleClock(p,name){
  const m=p.modules?.[name]||{};
  return m.data_from_previous_snapshot===true?m.previous_snapshot_source_cutoff:m.source_cutoff||p.source_cutoff;
}
function securityLink(x,label){
  const sid=x?.security_id;
  return sid?'<button type="button" class="stock-link" data-security-id="'+esc(sid)+'">'+esc(label||sid.split(":").pop()+" "+x.stock_name)+'</button>':esc(label||x?.stock_name);
}
function buildSecurityIndex(p,history=null){
  const index=new Map();
  function add(source,historical){
    Object.entries(source.modules||{}).forEach(([name,m])=>{
      const rows=name==="formal_weekly"?m.data?.formal_cards:name==="watchlist"?m.data?.items:name==="candidate_weekly"?m.data?.known_changed_securities:name==="opportunities"?m.data?.nomination_records||m.data?.items:[];
      (rows||[]).forEach(row=>{
        if(!row.security_id||!row.stock_name)return;
        if(!index.has(row.security_id))index.set(row.security_id,{security_id:row.security_id,stock_name:row.stock_name,contexts:[]});
        index.get(row.security_id).contexts.push({module:name,data:row,is_historical:historical||!moduleIsCurrent(source,name),module_status:m.status,source_cutoff:moduleClock(source,name),source_week:m.data?.as_of,source_refs:m.source_refs||[]});
      });
    });
  }
  add(p,false);
  if(history)add(history,true);
  return index;
}
function highestAuthority(item){
  const current=item.contexts.filter(x=>!x.is_historical);
  for(const a of ["FORMAL","CANDIDATE","CONTINUITY","NOMINATION"]){
    if(current.some(x=>(x.module==="formal_weekly"?"FORMAL":x.module==="candidate_weekly"?"CANDIDATE":x.data.authority||"NOMINATION")===a))return a;
  }
  return "HISTORICAL";
}
function humanSummary(item){
  const formal=item.contexts.find(x=>x.module==="formal_weekly"&&!x.is_historical);
  if(formal)return formal.data.research?.summary||"正式研究已采用；该版本尚未提供公司研究摘要。";
  const current=item.contexts.filter(x=>!x.is_historical);
  if(!current.length)return "仅有历史保留记录，当前研究条件尚未重新验证。";
  return current.map(x=>x.data.current_state||x.data.current_role||"研究候选尚未正式采用").join("；");
}
function nextChecks(item){
  const formal=item.contexts.find(x=>x.module==="formal_weekly"&&!x.is_historical);
  const r=formal?.data.research;
  if(r)return unique([r.next_trigger,r.review_at?"复核日期："+fmtDate(r.review_at):null]);
  return unique(item.contexts.filter(x=>!x.is_historical).map(x=>x.data.next_trigger||x.data.blocker)).concat(currentFallback(item));
}
function currentFallback(item){
  return item.contexts.some(x=>!x.is_historical)?[]:["等待新的有效证据；历史提名不激活当前结论"];
}
function section(title,body,cls=""){return '<section class="panel '+cls+'"><h2>'+esc(title)+'</h2>'+body+'</section>';}
function note(text){return '<div class="notice">'+esc(text)+'</div>';}
function stat(label,value){return '<div class="stat"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>';}
function sourcesHtml(sources){
  const allowed=new Set(["static.cninfo.com.cn","www.cninfo.com.cn","www.szse.cn","www.sse.com.cn","static.sse.com.cn","www.bse.cn","www.bjse.cn"]);
  return (sources||[]).map(s=>{
    let url;
    try{url=new URL(s.url);}catch{return "";}
    if(url.protocol!=="https:"||!allowed.has(url.hostname)||url.username||url.password||url.search||url.hash||!url.pathname.toLowerCase().endsWith(".pdf"))return "";
    const pages=(s.pages||[]).filter(x=>Number.isInteger(x)&&x>0);
    const link=s.url+(pages.length?"#page="+pages[0]:"");
    return '<a class="source-link" target="_blank" rel="noopener noreferrer" href="'+esc(link)+'">'+esc(s.title)+' <span aria-hidden="true">↗</span></a><div class="small muted">'+esc(s.publisher||"官方披露")+' · 发布 '+esc(fmtDate(s.published_at))+(pages.length?' · 第'+esc(pages.join("、"))+'页':'')+'</div>';
  }).join("");
}
function researchCardHtml(card){
  const r=card.research||{};
  return '<div class="research-detail">'+
    section("研究判断",'<p class="lead">'+esc(r.summary||"本版本尚未提供公司研究摘要。")+'</p><div class="small muted">公司报告期 '+esc(r.report_period||"未提供")+' · 研究业务 '+esc(r.economic_output||"未提供")+'</div>')+
    section("公司兑现与赚钱机制",'<p>'+esc(r.operating_facts||"经营事实未供应，不能据此确认公司兑现。")+'</p><p class="muted">'+esc(r.comparability||"可比判断见原正式报告。")+'</p>'+note("业务经营事实与算力专属收入分别核验；公司披露不能替代独立付款方证据。")+
      '<p class="small">'+(r.payer_independence==="supported"?"原正式报告记载独立需求支持，证据范围仍以原报告为准。":"独立付款方需求证据尚未成立；公司捕获链仍需补强。")+'</p>'+
      (r.company_context?'<details><summary>公司整体经营上下文</summary><p>'+esc(r.company_context)+'</p></details>':""))+
    section("价格、预期与当前限制",'<p>'+esc(r.price_note||"本投影未提供当前价格结论。")+'</p><div class="detail-pair"><span>估值与情景</span><strong>未提供可用估值结论</strong></div><p class="risk">'+esc(r.limitations||"具体限制尚未供应。")+'</p>')+
    section("下一复核与失效条件",'<div class="detail-pair"><span>下一复核事项</span><strong>'+esc(r.next_trigger||"未提供具体触发条件")+'</strong></div><div class="detail-pair"><span>复核日期</span><strong>'+esc(fmtDate(r.review_at))+'</strong></div><div class="detail-pair"><span>本期条件有效至</span><strong>'+esc(fmtDate(r.valid_until))+'</strong></div><h3>失效条件</h3><p>'+esc(r.invalidation||"未供应，需回到正式报告复核。")+'</p><p class="small muted">'+esc(r.use_this_week||"仅作研究与人工复核。")+'</p>')+
    section("原始证据",sourcesHtml(r.sources)||note("本版本未提供可点击原文，保留来源缺口；不生成猜测链接。"))+
  '</div>';
}
function formalCardsHtml(p){
  return '<div class="research-cards">'+(moduleData(p,"formal_weekly").formal_cards||[]).map((c,i)=>{
    const r=c.research||{};
    const w=(moduleData(p,"watchlist").items||[]).find(x=>x.case_key===c.case_key);
    return '<article class="research-card"><div class="card-top"><span class="research-order">0'+(i+1)+'</span><span class="state-label">'+esc(w?.current_state||"待复核")+'</span></div><h3>'+securityLink(c)+'</h3><div class="small muted">'+esc(r.economic_output||"研究内容未供应")+' · '+esc(r.report_period||"报告期未提供")+'</div><p>'+esc(r.summary||"本版本未提供研究摘要。")+'</p><div class="card-foot"><div><span class="small muted">下一复核</span><strong>'+esc(fmtDate(r.review_at))+'</strong></div><button type="button" class="detail-button" data-security-id="'+esc(c.security_id)+'">阅读研究 <span aria-hidden="true">↗</span></button></div></article>';
  }).join("")+'</div>';
}
function freshnessNotice(p){
  const old=["candidate_weekly","opportunities"].filter(n=>!moduleIsCurrent(p,n));
  return old.length?note(old.map(n=>MODULE_LABELS[n]).join("、")+"未提供本期更新，沿用历史记录；其变化不覆盖本期正式研究。"):"";
}
function overview(p){
  if(!moduleIsCurrent(p,"formal_weekly"))return section("正式周报未供应",note("本期正式研究无法确认，停止呈现当前结论。历史版本可在周报页查阅。"));
  const cards=moduleData(p,"formal_weekly").formal_cards||[];
  const watches=moduleData(p,"watchlist").items||[];
  const wait=watches.filter(x=>x.current_state==="等待行情").length;
  const title=cards.length&&wait===cards.length?"先补齐价格条件，再复核研究结论":"本期正式研究与待验证条件";
  const f=moduleData(p,"formal_weekly");
  return '<section class="decision-hero"><div class="hero-copy"><div class="eyebrow">本期研究重点 · '+esc(f.as_of)+'</div><h2>'+title+'</h2><p>'+esc(cards.length)+'张正式研究卡保留公司事实、限制与失效条件。研究优先级沿用正式周报顺序，进入详情核对证据。</p><div class="hero-actions"><button type="button" class="primary-button" data-page="周报">阅读本期周报 <span aria-hidden="true">→</span></button><span>研究依据截止 '+esc(fmtTime(moduleClock(p,"formal_weekly")))+'</span></div></div><div class="hero-aside">'+stat("正式研究卡",cards.length)+stat("等待行情",wait)+'<span class="small">供研究与人工复核</span></div></section>'+
    freshnessNotice(p)+
    '<div class="section-heading"><div><span class="eyebrow">沿用正式报告阅读顺序</span><h2>本期先读</h2></div><button type="button" class="text-button" data-page="关注标的">查看全部复核条件 →</button></div>'+formalCardsHtml(p)+
    '<div class="two-column">'+section("下一复核事件",'<ul class="event-list">'+cards.map(c=>'<li><div>'+securityLink(c)+'<span class="small muted">'+esc(c.research?.next_trigger||"具体触发尚未提供")+'</span></div><time>'+esc(fmtDate(c.research?.review_at))+'</time></li>').join("")+'</ul>')+
    section("机会扫描与覆盖",moduleIsCurrent(p,"opportunities")?'<p>本期机会记录已供应；覆盖范围与状态请查看新机会页。</p>':note("当期机会扫描未供应，不能据此判断当前没有机会。"))+'</div>'+
    '<details class="coverage-fold"><summary>覆盖范围与研究边界</summary><p>'+esc(f.case_denominator??"未提供")+'个研究案件；'+esc(cards.length)+'张正式卡。案件数量不能换算为股票推荐数或全市场覆盖。</p><p>正式研究、历史候选和研究提名保留各自身份与时间。四项权限全部关闭。</p></details>';
}
function renderResearchMarkdown(text){
  const lines=String(text||"").split("\n");
  let html="",i=0;
  const cells=line=>line.trim().replace(/^\||\|$/g,"").split("|").map(x=>x.trim());
  while(i<lines.length){
    const line=lines[i].trim();
    if(!line){i++;continue;}
    if(line.startsWith("|")&&i+1<lines.length&&/^\|?[\s:|-]+\|?$/.test(lines[i+1].trim())){
      const headers=cells(line);i+=2;const rows=[];
      while(i<lines.length&&lines[i].trim().startsWith("|"))rows.push(cells(lines[i++]));
      html+='<div class="table-scroll"><table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join("")+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';continue;
    }
    if(line.startsWith("### ")){html+='<h3>'+esc(line.slice(4))+'</h3>';i++;continue;}
    if(line.startsWith("- ")){const items=[];while(i<lines.length&&lines[i].trim().startsWith("- "))items.push(lines[i++].trim().slice(2));html+='<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>';continue;}
    html+='<p>'+esc(line)+'</p>';i++;
  }
  return html;
}
function historicalCandidates(p){
  const m=p.modules.candidate_weekly,c=m.data||{};
  const label=moduleIsCurrent(p,"candidate_weekly")?"本期候选（尚未正式采用）":"历史候选";
  return '<details class="history-fold"><summary>'+label+' · '+esc(c.as_of||"周次未提供")+'</summary><p class="muted">原依据截止 '+esc(fmtTime(moduleClock(p,"candidate_weekly")))+'。候选变化不等同于本期正式研究变化。</p><div class="stats-strip">'+stat("候选升级",c.continuity?.upgrade??"未供应")+stat("候选降级",c.continuity?.downgrade??"未供应")+stat("未变化案件",c.continuity?.no_change??"未供应")+'</div><ul>'+(c.known_changed_securities||[]).map(x=>'<li>'+securityLink(x)+' · '+esc(x.weekly_change)+'（候选记录）</li>').join("")+'</ul>'+note(c.upgrade_detail_note||"未提供的候选细节不补写。")+'</details>';
}
function weekly(p){
  const f=moduleData(p,"formal_weekly");
  if(!moduleIsCurrent(p,"formal_weekly"))return section("历史正式周报",note("本期正式周报未供应，以下内容只保留其原研究时间。")+"<p>"+esc(f.as_of)+" · "+esc(fmtTime(moduleClock(p,"formal_weekly")))+"</p>"+(f.research_sections||[]).map(x=>"<details><summary>"+esc(x.title)+"</summary>"+renderResearchMarkdown(x.markdown)+"</details>").join(""));
  return '<div class="page-heading"><div class="eyebrow">正式报告的公开研究投影</div><h2>'+esc(f.as_of)+' 本期周报</h2><p>研究依据截止 '+esc(fmtTime(moduleClock(p,"formal_weekly")))+'；网页生成时间单独显示，不刷新证据时钟。</p></div>'+freshnessNotice(p)+formalCardsHtml(p)+
    section("本期研究正文",(f.research_sections||[]).map(s=>'<details class="report-section"'+(s.title==="本周做什么"?' open':"")+'><summary>'+esc(s.title)+'</summary>'+renderResearchMarkdown(s.markdown)+'</details>').join("")||note("本版本未提供周报正文。"))+historicalCandidates(p);
}
function watchlist(p){
  const items=moduleData(p,"watchlist").items||[];
  return '<div class="page-heading"><div class="eyebrow">继续跟踪同一研究对象</div><h2>关注标的与复核条件</h2><p>先看下一条件与失效点，研究身份保留在详情中。</p></div>'+section("本期正式研究",'<div class="table-scroll"><table><thead><tr><th>公司与业务</th><th>当前状态</th><th>下一复核事项</th><th>复核日期</th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+securityLink(x)+'</td><td><span class="state-label">'+esc(x.current_state)+'</span></td><td>'+esc(x.next_trigger||"具体条件未提供")+'</td><td>'+esc(fmtDate(x.next_review))+'</td></tr>').join("")+'</tbody></table></div>');
}
function opportunities(p){
  const o=moduleData(p,"opportunities"),current=moduleIsCurrent(p,"opportunities");
  const rows=o.nomination_records||o.items||[];
  const warning=current?"仅展示本批实际供应的记录；覆盖不足不能推断全市场无机会。":"当期机会扫描未供应，不能据此判断当前没有机会。以下历史提名保留原观察时间。";
  return '<div class="page-heading"><div class="eyebrow">机会发现与历史线索分开阅读</div><h2>新机会</h2></div>'+note(warning)+
    section(current?"本期提名与覆盖":"历史提名",'<p class="muted">来源截止 '+esc(fmtTime(moduleClock(p,"opportunities")))+'</p><div class="stats-strip">'+stat("提名记录",o.nomination_record_count??o.nomination_count??"未供应")+stat("不同公司",o.unique_company_count??"未供应")+'</div><p>同一公司可以命中多个研究方向，记录数量不等于公司数量。</p>')+
    '<details class="history-fold"'+(current?" open":"")+'><summary>'+(current?"查看本批研究记录":"查看全部历史提名")+' · '+rows.length+'条</summary><div class="table-scroll"><table><thead><tr><th>公司</th><th>研究方向</th><th>证据状态</th><th>原观察时间</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+securityLink(x)+'</td><td>'+esc(GATE_LABELS[x.gate_id]||x.current_state||"未提供")+'</td><td>'+esc(x.evidence_state==="confirmed"?"原记录已确认":"待补证")+'</td><td>'+esc(fmtTime(x.observed_at))+'</td></tr>').join("")+'</tbody></table></div></details>';
}
function progress(p){
  const f=moduleData(p,"formal_weekly"),c=moduleData(p,"candidate_weekly");
  const tasks=(f.research_sections||[]).find(s=>s.title==="本周补证任务");
  return '<div class="page-heading"><div class="eyebrow">研究仍缺什么、下一步验证什么</div><h2>研究进展</h2></div>'+section("本期补证任务",tasks?renderResearchMarkdown(tasks.markdown):note("本期具体补证任务未供应。"))+
    section("正式研究的已知限制",'<ul class="event-list">'+(f.formal_cards||[]).map(x=>'<li><div>'+securityLink(x)+'<span>'+esc(x.research?.limitations||"限制明细未供应")+'</span></div></li>').join("")+'</ul>')+
    '<details class="history-fold"><summary>历史候选覆盖与成熟度</summary><p>原来源 '+esc(fmtTime(moduleClock(p,"candidate_weekly")))+'；历史来源统计不代表本期新增进展。</p><p>'+esc(c.case_denominator??"未供应")+'个案件；兑现记录 '+esc(c.evidence_maturity_counts?.realized??"未供应")+'；召回线索 '+esc(c.evidence_maturity_counts?.recall_only??"未供应")+'。</p></details>';
}
function health(p){
  return '<div class="page-heading"><div class="eyebrow">更新范围与有效时间</div><h2>数据状态</h2><p>网页生成 '+esc(fmtTime(p.generated_at))+'。研究结论以各模块的原始依据时间为准。</p></div>'+
    section("各模块新鲜度",'<div class="table-scroll"><table><thead><tr><th>模块</th><th>状态</th><th>依据截止</th><th>阅读范围</th></tr></thead><tbody>'+EXPECTED_MODULES.map(n=>'<tr><td>'+MODULE_LABELS[n]+'</td><td>'+esc(STATUS_LABELS[p.modules[n].status]||"未确认")+'</td><td>'+esc(fmtTime(moduleClock(p,n)))+'</td><td>'+esc(moduleIsCurrent(p,n)?"本期供应":"历史保留或未供应，不作为本期新增结论")+'</td></tr>').join("")+'</tbody></table></div>')+
    section("研究与权限边界",'<p>正式周报为研究来源；四项权限全部关闭，无自动交易与券商连接。</p><p>自然交付与经济有效性仍未验证。</p><details><summary>技术血缘与隔离状态</summary><p class="codeish">'+esc(p.snapshot_sha256)+'</p><p>外部证据共享：关闭；仅使用NEW系统研究投影。</p></details>');
}
const renderers={"总览":overview,"周报":weekly,"关注标的":watchlist,"新机会":opportunities,"研究进展":progress,"系统状态":health};

function validate(p){
  const errors=[];
  if(p.schema_version!=="dashboard_snapshot.v1"||p.system_id!=="NEW_SYSTEM"||p.data_boundary!=="isolated"||p.external_evidence_sharing!==false||p.not_an_order!==true)errors.push("研究数据边界不一致");
  function walk(v){
    if(!v||typeof v!=="object")return;
    if(v.permissions&&PERMISSIONS.some(k=>v.permissions[k]!==false))errors.push("研究权限必须全部关闭");
    Object.values(v).forEach(walk);
  }
  if(!p.permissions)errors.push("缺少研究权限声明");walk(p);
  if(JSON.stringify(Object.keys(p.modules||{}).sort())!==JSON.stringify([...EXPECTED_MODULES].sort()))errors.push("研究模块不一致");
  if((p.navigation||[]).join("|")!==EXPECTED_NAV.join("|"))errors.push("导航不一致");
  return unique(errors);
}
function selectPage(name){
  if(!renderers[name])return;
  $("#app").innerHTML=renderers[name](CURRENT_PAYLOAD);
  document.querySelectorAll("#nav button").forEach(b=>{b.classList.toggle("active",b.textContent===name);if(b.textContent===name)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
  closeDrawer(false);
}
function renderNav(){
  $("#nav").innerHTML=EXPECTED_NAV.map((name,i)=>'<button type="button" data-page="'+name+'"'+(i===0?' class="active" aria-current="page"':"")+'>'+name+'</button>').join("");
}
function closeDrawer(restore=true){
  const drawer=$("#securityDrawer");
  if(!drawer||drawer.hidden)return;
  drawer.hidden=true;
  document.body.classList.remove("drawer-open");
  document.querySelectorAll("body > header,body > nav,body > main,body > footer").forEach(x=>x.inert=false);
  if(restore&&DRAWER_RETURN_FOCUS?.isConnected)DRAWER_RETURN_FOCUS.focus();
}
function ensureDrawer(){
  if($("#securityDrawer"))return;
  const wrap=document.createElement("div");wrap.id="securityDrawer";wrap.className="drawer-overlay";wrap.hidden=true;
  wrap.innerHTML='<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle"><div class="drawer-head"><div><div class="eyebrow">公司研究 · '+esc(moduleData(CURRENT_PAYLOAD,"formal_weekly").as_of)+'</div><h2 id="drawerTitle"></h2><div id="drawerCode" class="small muted"></div></div><button id="drawerClose" type="button" aria-label="关闭研究详情">×</button></div><div id="drawerBody" class="drawer-body"></div></aside>';
  document.body.appendChild(wrap);
  wrap.addEventListener("click",e=>{if(e.target===wrap)closeDrawer();});
  $("#drawerClose").onclick=()=>closeDrawer();
}
function showSecurity(sid){
  const item=SECURITY_INDEX.get(sid);if(!item)return;
  DRAWER_RETURN_FOCUS=document.activeElement;
  ensureDrawer();
  const formal=item.contexts.find(x=>x.module==="formal_weekly"&&!x.is_historical);
  $("#drawerTitle").textContent=item.stock_name;
  $("#drawerCode").textContent=sid.split(":").pop()+" · "+(AUTHORITY_LABELS[highestAuthority(item)]||"研究记录")+" · 依据 "+fmtTime(formal?.source_cutoff||item.contexts[0].source_cutoff);
  const historical=item.contexts.filter(x=>x.is_historical);
  $("#drawerBody").innerHTML=(formal?researchCardHtml(formal.data):section("研究范围",'<p>'+esc(humanSummary(item))+'</p>'+note("没有本期正式研究卡；旧线索仅作历史保留。")))+
    (historical.length?'<details class="history-fold"><summary>历史记录与原始时间</summary>'+historical.map(x=>'<p>'+esc(MODULE_LABELS[x.module])+' · '+esc(x.source_week||"原记录")+' · '+esc(fmtTime(x.source_cutoff))+' · '+esc(x.data.weekly_change||x.data.current_state||"研究提名")+'</p>').join("")+'</details>':"")+
    '<details class="technical-details"><summary>技术身份与血缘</summary>'+item.contexts.map(x=>'<p class="codeish">'+esc(x.data.case_key||sid)+'<br>'+x.source_refs.map(esc).join("<br>")+'</p>').join("")+'</details>';
  $("#securityDrawer").hidden=false;
  document.body.classList.add("drawer-open");
  document.querySelectorAll("body > header,body > nav,body > main,body > footer").forEach(x=>x.inert=true);
  $("#drawerClose").focus();
}
function setupSecuritySearch(){
  const input=$("#securitySearch"),box=$("#securitySearchResults");
  input.addEventListener("input",()=>{
    const q=input.value.trim().toLowerCase();
    if(!q){box.hidden=true;box.innerHTML="";return;}
    const rows=[...SECURITY_INDEX.values()].filter(x=>(x.stock_name+" "+x.security_id).toLowerCase().includes(q)).slice(0,10);
    box.innerHTML=rows.length?rows.map(x=>'<button type="button" data-security-id="'+esc(x.security_id)+'"><strong>'+esc(x.security_id.split(":").pop()+" "+x.stock_name)+'</strong><span>'+esc(AUTHORITY_LABELS[highestAuthority(x)])+'</span></button>').join(""):'<div class="search-empty">没有匹配的研究对象</div>';
    box.hidden=false;
  });
  input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const button=box.querySelector("button");if(button){showSecurity(button.dataset.securityId);box.hidden=true;}}if(e.key==="ArrowDown"){e.preventDefault();box.querySelector("button")?.focus();}});
}
document.addEventListener("click",e=>{
  const stock=e.target.closest("[data-security-id]"),page=e.target.closest("[data-page]");
  if(stock){showSecurity(stock.dataset.securityId);$("#securitySearchResults").hidden=true;}
  else if(page)selectPage(page.dataset.page);
  else if(!e.target.closest(".security-search")){const box=$("#securitySearchResults");if(box)box.hidden=true;}
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){closeDrawer();const box=$("#securitySearchResults");if(box)box.hidden=true;}
  if(e.key==="Tab"&&$("#securityDrawer")&&!$("#securityDrawer").hidden){
    const items=[...$("#securityDrawer").querySelectorAll("button,a,summary")].filter(x=>x.getClientRects().length);
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
function fail(errors){$("#app").innerHTML=section("研究数据暂不可用",'<p>数据校验未通过，当前结论停止展示。</p><ul>'+errors.map(e=>'<li>'+esc(e)+'</li>').join("")+'</ul>');}
async function boot(){
  try{
    const res=await fetch("./dashboard/current.json?ts="+Date.now(),{cache:"no-store"});if(!res.ok)throw new Error("数据读取失败");
    const p=await res.json(),errors=validate(p);if(errors.length){fail(errors);return;}
    CURRENT_PAYLOAD=p;
    try{const hr=await fetch("./dashboard/history/2026-09-22.json",{cache:"no-cache"});if(hr.ok){const h=await hr.json();if(validate(h).length===0)HISTORY_PAYLOAD=h;}}catch{/* Current research remains readable when archive is unavailable. */}
    SECURITY_INDEX=buildSecurityIndex(p,HISTORY_PAYLOAD);
    setupSecuritySearch();
    $("#snapshotMeta").textContent=moduleIsCurrent(p,"formal_weekly")?moduleData(p,"formal_weekly").as_of+" · 本期"+(moduleData(p,"formal_weekly").formal_cards||[]).length+"张正式研究卡":"本期正式周报未供应";
    $("#snapshotHash").textContent="网页生成 "+fmtTime(p.generated_at);
    renderNav();selectPage("总览");
  }catch(e){fail([e.message]);}
}
boot();
