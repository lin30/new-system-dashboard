const EXPECTED_NAV=["总览","周报","关注标的","新机会","研究进展","系统状态"];
const EXPECTED_MODULES=["formal_weekly","candidate_weekly","watchlist","opportunities","system_health"];

const $=(s)=>document.querySelector(s);
const esc=(v)=>String(v??"—").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const badge=(a)=>a?'<span class="badge '+esc(a)+'">'+esc(a)+'</span>':"";
const fmtTime=(s)=>{if(!s)return"—";try{return new Date(s).toLocaleString("zh-CN",{hour12:false})}catch{return s}};
const moduleData=(p,n)=>p.modules?.[n]?.data||{};
const moduleStatus=(p,n)=>p.modules?.[n]?.status||"unknown";

let CURRENT_PAYLOAD=null;
let SECURITY_INDEX=new Map();

const MODULE_LABELS={
  formal_weekly:"FORMAL 正式卡片",
  candidate_weekly:"周报变化",
  watchlist:"关注标的",
  opportunities:"当前条件与新机会",
  system_health:"系统状态"
};
const GATE_LABELS={
  G1_compute_accelerator:"算力芯片/加速器",
  G4_data_movement:"数据传输/互联",
  G5_board_package_manufacturing:"PCB/封装制造",
  G6_power_delivery:"电源/供配电",
  G7_thermal_site:"液冷/数据中心基础设施",
  G8_specified_equipment_material:"专用设备/材料"
};
const FIELD_LABELS={
  authority:"身份",current_role:"当前角色",current_state:"当前状态",
  weekly_change:"周变化",continuity:"连续性",next_trigger:"下一触发",
  blocker:"阻断",blockers:"阻断项",stable_case_count:"稳定Case数",
  thesis_invalidated:"Thesis失效",fresh_trigger:"新触发",ttl_days:"TTL(天)",
  observed_at:"观察时间",case_key:"Case",
  gate_id:"研究Gate",evidence_label:"证据标签",evidence_state:"证据状态",
  capture_quality_rank:"质量档",binding_order_verified:"绑定订单验证",
  payer_supported:"Payer支持"
};

function securityLink(x,label){
  const sid=x?.security_id||x?.ticker;
  const name=label||x?.stock_name||x?.name||sid||"—";
  if(!sid) return esc(name);
  return '<button class="stock-link" type="button" data-security-id="'+esc(sid)+'">'+esc(name)+'</button>';
}
function buildSecurityIndex(p){
  const index=new Map();
  function walk(v,moduleName,path){
    if(Array.isArray(v)){v.forEach((x,i)=>walk(x,moduleName,path+"["+i+"]"));return}
    if(!v||typeof v!=="object") return;
    const sid=v.security_id||v.ticker;
    const name=v.stock_name||v.name;
    if(sid&&name){
      if(!index.has(sid)) index.set(sid,{security_id:sid,stock_name:name,contexts:[]});
      index.get(sid).contexts.push({
        module:moduleName,
        module_label:MODULE_LABELS[moduleName]||moduleName,
        path,
        data:v,
        module_status:p.modules?.[moduleName]?.status||"unknown",
        source_refs:p.modules?.[moduleName]?.source_refs||[]
      });
    }
    Object.entries(v).forEach(([k,x])=>walk(x,moduleName,path?path+"."+k:k));
  }
  Object.entries(p.modules||{}).forEach(([moduleName,module])=>walk(module?.data,moduleName,"data"));
  return index;
}
function valueText(key,v){
  if(v===null||v===undefined||v==="") return "—";
  if(key==="gate_id") return (GATE_LABELS[v]||v)+" · "+v;
  if(key==="observed_at") return fmtTime(v);
  if(Array.isArray(v)) return v.join("、")||"—";
  if(typeof v==="boolean") return v?"是":"否";
  if(typeof v==="object") return JSON.stringify(v);
  return String(v);
}
function unique(values){
  return [...new Set(values.filter(v=>v!==null&&v!==undefined&&v!==""))];
}
function contextAuthority(ctx){
  if(ctx.module==="formal_weekly") return "FORMAL";
  if(ctx.module==="candidate_weekly") return "CANDIDATE";
  if(ctx.module==="opportunities") return ctx.data?.authority||"NOMINATION";
  return ctx.data?.authority||null;
}
function authoritySet(item){
  return new Set(item.contexts.map(contextAuthority).filter(Boolean));
}
function highestAuthority(item){
  const set=authoritySet(item);
  for(const a of ["FORMAL","CANDIDATE","CONTINUITY","NOMINATION"]){
    if(set.has(a)) return a;
  }
  return "NOMINATION";
}
function humanSummary(item){
  const set=authoritySet(item);
  const changes=unique(item.contexts.filter(x=>x.module==="candidate_weekly").map(x=>x.data.weekly_change));
  const gates=unique(item.contexts.filter(x=>x.module==="opportunities").map(x=>GATE_LABELS[x.data.gate_id]||x.data.gate_id));
  const states=unique(item.contexts.filter(x=>x.module==="watchlist").map(x=>x.data.current_state));
  const top=highestAuthority(item);
  let s="当前最高身份为 "+top+"。";
  if(top==="FORMAL") s+=" 已进入正式研究基线；其他模块记录只作为并列上下文，不覆盖 FORMAL。";
  else if(top==="CANDIDATE") s+=" 已进入周报候选变化层，但尚未成为 FORMAL。";
  else if(top==="CONTINUITY") s+=" 历史已验证判断继续保留，当前没有更高层级的新采用。";
  else s+=" 当前仍处于 P3 研究提名层，尚未进入 CANDIDATE / FORMAL。";
  if(changes.length) s+=" 本周变化："+changes.join("、")+"。";
  if(states.length) s+=" 当前台账状态："+states.join("、")+"。";
  if(gates.length) s+=" 研究方向："+gates.join("、")+"。";
  return s;
}
function systemPosition(item){
  const set=authoritySet(item);
  return ["NOMINATION","CONTINUITY","CANDIDATE","FORMAL"].map(a=>
    '<div class="stage '+(set.has(a)?"active ":"")+a+'">'+
      '<span class="stage-dot"></span><span>'+a+'</span>'+
    '</div>'
  ).join('<span class="stage-arrow">→</span>');
}
function humanContextLine(ctx){
  const d=ctx.data||{};
  if(ctx.module==="formal_weekly") return "正式卡片 / 正式研究基线";
  if(ctx.module==="candidate_weekly"){
    return "周报变化："+(d.weekly_change||"已进入候选变化记录")+(d.case_key?" · "+d.case_key:"");
  }
  if(ctx.module==="watchlist"){
    return [
      d.current_role,
      d.current_state,
      d.weekly_change||d.continuity
    ].filter(Boolean).join(" · ")||"关注台账记录";
  }
  if(ctx.module==="opportunities"){
    return [
      GATE_LABELS[d.gate_id]||d.gate_id,
      d.evidence_label,
      d.evidence_state,
      d.binding_order_verified===true?"订单绑定已验证":"订单绑定未验证"
    ].filter(Boolean).join(" · ");
  }
  return "系统记录";
}
function nextChecks(item){
  const checks=[];
  item.contexts.forEach(ctx=>{
    const d=ctx.data||{};
    if(d.next_trigger) checks.push(d.next_trigger);
    if(d.blocker) checks.push("解除阻断："+d.blocker);
    if(Array.isArray(d.blockers)) d.blockers.forEach(x=>checks.push("解除阻断："+x));
    if(ctx.module==="opportunities"){
      if(d.evidence_state==="pending_evidence") checks.push("补强 P3 证据并等待新的 fresh trigger");
      if(d.binding_order_verified===false) checks.push("验证公司与订单/需求的绑定关系");
    }
    if(ctx.module==="candidate_weekly" && d.weekly_change){
      checks.push("验证本周 "+d.weekly_change+" 是否被后续正式周报采用");
    }
  });
  if(!checks.length) checks.push("等待新的正式证据、周报变化或研究触发");
  return unique(checks);
}
function researchReasonHtml(item){
  const nominations=item.contexts.filter(x=>x.module==="opportunities");
  if(!nominations.length) return '<div class="empty-state">本批没有新机会记录。</div>';
  if(nominations.some(ctx=>ctx.data.authority==="CONTINUITY")){
    return '<div class="research-list">'+nominations.map(ctx=>'<div class="research-item"><strong>'+esc(ctx.data.current_state||"同案研究复核")+'</strong><div class="small muted">'+esc((ctx.data.blockers||[]).join("；")||"原依据与经济时钟继续保留")+'</div></div>').join("")+'</div>';
  }
  return '<div class="research-list">'+nominations.map(ctx=>{
    const d=ctx.data;
    const stateClass=d.evidence_state==="confirmed"?"good":"muted";
    return '<div class="research-item">'+
      '<div class="row between"><strong>'+esc(GATE_LABELS[d.gate_id]||d.gate_id)+'</strong><span class="'+stateClass+'">'+esc(d.evidence_state||"—")+'</span></div>'+
      '<div class="small muted">'+esc(d.gate_id||"—")+'</div>'+
      '<div class="detail-grid compact">'+
        '<div class="detail-key">证据类型</div><div class="detail-value">'+esc(d.evidence_label||"—")+'</div>'+
        '<div class="detail-key">质量档</div><div class="detail-value">'+esc(d.capture_quality_rank??"—")+'</div>'+
        '<div class="detail-key">订单绑定</div><div class="detail-value">'+esc(d.binding_order_verified?"已验证":"未验证")+'</div>'+
        '<div class="detail-key">观察时间</div><div class="detail-value">'+esc(fmtTime(d.observed_at))+'</div>'+
      '</div>'+
    '</div>';
  }).join("")+'</div>';
}
function contextTimelineHtml(item){
  const order={formal_weekly:1,candidate_weekly:2,watchlist:3,opportunities:4};
  return [...item.contexts].sort((a,b)=>(order[a.module]||9)-(order[b.module]||9)).map(ctx=>
    '<div class="timeline-row">'+
      '<div class="timeline-label">'+esc(ctx.module_label)+'</div>'+
      '<div class="timeline-content">'+esc(humanContextLine(ctx))+'</div>'+
    '</div>'
  ).join("");
}
function technicalDetailsHtml(item){
  return '<details class="technical-details"><summary>查看技术字段与来源</summary>'+
    item.contexts.map(ctx=>
      '<section class="tech-context">'+
        '<div class="row between"><strong>'+esc(ctx.module_label)+'</strong><span class="small muted">'+esc(ctx.module_status)+'</span></div>'+
        '<div class="detail-grid">'+Object.entries(ctx.data||{}).filter(([k])=>!["security_id","ticker","stock_name","name"].includes(k)).map(([k,v])=>
          '<div class="detail-key">'+esc(FIELD_LABELS[k]||k)+'</div><div class="detail-value codeish">'+esc(valueText(k,v))+'</div>'
        ).join("")+'</div>'+
        (ctx.source_refs.length?'<div class="source-box"><strong>来源</strong><div>'+ctx.source_refs.map(esc).join("<br>")+'</div></div>':"")+
      '</section>'
    ).join("")+
  '</details>';
}
function ensureDrawer(){
  if(document.querySelector("#securityDrawer")) return;
  const wrap=document.createElement("div");
  wrap.id="securityDrawer";
  wrap.className="drawer-overlay";
  wrap.innerHTML='<aside class="drawer" role="dialog" aria-modal="true" aria-label="标的详情">'+
    '<div class="drawer-head"><div><div class="eyebrow">NEW SYSTEM · SECURITY DETAIL</div><h2 id="drawerTitle">标的详情</h2><div id="drawerCode" class="meta"></div></div>'+
    '<button id="drawerClose" class="drawer-close" type="button" aria-label="关闭">×</button></div>'+
    '<div id="drawerBody" class="drawer-body"></div></aside>';
  document.body.appendChild(wrap);
  wrap.addEventListener("click",e=>{if(e.target===wrap) closeDrawer()});
  wrap.querySelector("#drawerClose").onclick=closeDrawer;
}
function closeDrawer(){
  const d=document.querySelector("#securityDrawer");
  if(d)d.classList.remove("open");
  document.body.classList.remove("drawer-open");
}
function showSecurity(sid){
  const item=SECURITY_INDEX.get(sid);
  if(!item)return;
  ensureDrawer();
  const d=document.querySelector("#securityDrawer");
  const top=highestAuthority(item);
  const checks=nextChecks(item);
  d.querySelector("#drawerTitle").textContent=item.stock_name;
  d.querySelector("#drawerCode").textContent=sid+" · 当前快照中共 "+item.contexts.length+" 条关联记录";
  d.querySelector("#drawerBody").innerHTML=
    '<section class="drawer-hero">'+
      '<div class="row between"><div>'+badge(top)+'</div><div class="small muted">'+item.contexts.length+' 条跨模块记录</div></div>'+
      '<p class="drawer-summary">'+esc(humanSummary(item))+'</p>'+
    '</section>'+
    '<section class="drawer-section"><h3>系统位置</h3><div class="stage-flow">'+systemPosition(item)+'</div></section>'+
    '<section class="drawer-section"><h3>为什么它在这里</h3>'+researchReasonHtml(item)+'</section>'+
    '<section class="drawer-section"><h3>跨模块记录</h3><div class="timeline">'+contextTimelineHtml(item)+'</div></section>'+
    '<section class="drawer-section"><h3>下一验证点</h3><ul class="check-list">'+checks.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></section>'+
    technicalDetailsHtml(item);
  d.classList.add("open");
  document.body.classList.add("drawer-open");
}
function setupSecuritySearch(){
  const input=document.querySelector("#securitySearch");
  const box=document.querySelector("#securitySearchResults");
  if(!input||!box)return;
  const render=()=>{
    const q=input.value.trim().toLowerCase();
    if(!q){box.hidden=true;box.innerHTML="";return}
    const results=[...SECURITY_INDEX.values()].filter(x=>
      x.stock_name.toLowerCase().includes(q) ||
      x.security_id.toLowerCase().includes(q) ||
      x.security_id.split(":").pop().includes(q)
    ).slice(0,10);
    box.innerHTML=results.length?results.map(x=>
      '<button type="button" data-security-id="'+esc(x.security_id)+'">'+
        '<strong>'+esc(x.stock_name)+'</strong><span>'+esc(x.security_id.split(":").pop())+'</span>'+
      '</button>'
    ).join(""):'<div class="search-empty">没有匹配标的</div>';
    box.hidden=false;
  };
  input.addEventListener("input",render);
  input.addEventListener("focus",render);
  document.addEventListener("click",e=>{
    if(!e.target.closest(".security-search")) box.hidden=true;
  });
}
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-security-id]");
  if(el){
    e.preventDefault();
    showSecurity(el.dataset.securityId);
    const box=document.querySelector("#securitySearchResults");
    if(box) box.hidden=true;
  }
});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDrawer()});

function validate(p){
  const errors=[];
  if(p.system_id!=="NEW_SYSTEM") errors.push("system_id 不是 NEW_SYSTEM");
  if(p.data_boundary!=="isolated") errors.push("data_boundary 不是 isolated");
  if(p.external_evidence_sharing!==false) errors.push("external_evidence_sharing 必须为 false");
  for(const key of ["trade_permission","execution_permission","broker_connection","paper_action_enabled"]){
    if(p.permissions?.[key]!==false) errors.push(key+" 必须为 false");
  }
  if(p.not_an_order!==true) errors.push("只读研究标记缺失");
  const keys=Object.keys(p.modules||{}).sort();
  const expected=[...EXPECTED_MODULES].sort();
  if(JSON.stringify(keys)!==JSON.stringify(expected)) errors.push("modules 不符合 NEW-only 合同");
  if((p.navigation||[]).join("|")!==EXPECTED_NAV.join("|")) errors.push("导航合同不匹配");
  return errors;
}
function card(title,body,span=4,extra=""){return '<section class="card span-'+span+' '+extra+'"><h3>'+title+'</h3>'+body+'</section>'}
function kv(k,v){return '<div><div class="kpi">'+esc(v)+'</div><div class="label">'+esc(k)+'</div></div>'}

function overview(p){
  const f=moduleData(p,"formal_weekly"), c=moduleData(p,"candidate_weekly"), w=moduleData(p,"watchlist"), o=moduleData(p,"opportunities");
  const items=w.items||[];
  const cont=items.filter(x=>x.authority==="CONTINUITY");
  return '<div class="grid">'+
    card("正式基线",'<div class="row between">'+kv(f.as_of||"FORMAL",f.formal_cards?.length||0)+badge("FORMAL")+'</div><div class="divider"></div><div class="small muted">正式卡片：</div><div class="pill-list">'+(f.formal_cards||[]).map(x=>'<span class="pill">'+securityLink(x)+'</span>').join("")+'</div>',4)+
    card(p.modules.candidate_weekly.status==="verified"?"最新候选":"历史候选（本批未供应）",'<div class="row between">'+kv(c.as_of||"CANDIDATE",c.case_denominator||0)+badge("CANDIDATE")+'</div><div class="divider"></div><div class="pill-list"><span class="pill">UPGRADE '+esc(c.continuity?.upgrade||0)+'</span><span class="pill">DOWNGRADE '+esc(c.continuity?.downgrade||0)+'</span><span class="pill">NO_CHANGE '+esc(c.continuity?.no_change||0)+'</span></div>',4)+
    card("当前条件与新机会",'<div class="row between">'+kv(o.case_denominator_n!==undefined?"本批复核":p.modules.opportunities.status==="verified"?"研究提名":"历史提名（未更新）",o.reviewed_case_n??o.nomination_count??"未供应")+badge(o.authority||"NOMINATION")+'</div><div class="divider"></div><div class="small muted">Fast Lane accepted：'+esc(o.fast_lane_acceptance?.accepted_n??"未供应")+'</div>',4)+
    card("连续性对象",'<div class="pill-list">'+cont.map(x=>'<span class="pill">'+securityLink(x,x.stock_name+" "+(x.security_id||"").split(":").pop())+'</span>').join("")+'</div>',6)+
    card("系统边界",'<div class="row"><span class="badge SYSTEM">ISOLATED</span><span class="good">不共享外部证据</span></div><div class="divider"></div><div class="small muted">来源为同一正式周报与已验证日常输出；外部监控模块独立。</div>',6)+
  '</div>';
}
function weekly(p){
  const f=moduleData(p,"formal_weekly"), c=moduleData(p,"candidate_weekly");
  if(f.case_denominator!==undefined){
    const names={observe:"观察",wait_evidence:"等待证据",wait_market:"等待行情"};
    const counts=Object.entries(f.status_counts||{}).map(([k,v])=>'<span class="pill">'+esc(names[k]||k)+' '+esc(v)+'</span>').join("");
    return '<div class="grid">'+
      card("当前正式周报",kv("周次",f.as_of)+kv("Case 分母",f.case_denominator)+kv("正式研究卡",f.card_n)+'<div class="divider"></div><div class="pill-list">'+counts+'</div>',12)+
      card("正式卡片",'<div class="pill-list">'+(f.formal_cards||[]).map(x=>'<span class="pill">'+securityLink(x,x.security_id.split(":").pop()+" "+x.stock_name)+'</span>').join("")+'</div>',6)+
      card("候选记录",esc(c.as_of||"未供应")+'<div class="small muted">'+esc(p.modules.candidate_weekly.status==="verified"?"独立候选，等待实际采用":"本批没有新候选供应，保留其原来源时间；不当作本周更新。")+'</div>',6)+
    '</div>';
  }
  const changed=c.known_changed_securities||[];
  const signals=c.evidence_signal_counts||{};
  const outcomes=c.deep_research_outcome_counts||{};
  let changeRows=changed.map(x=>'<tr><td>'+securityLink(x)+'</td><td>'+esc((x.security_id||"").split(":").pop())+'</td><td>'+esc(x.weekly_change)+'</td><td>'+esc(x.case_key)+'</td></tr>').join("");
  if(c.upgrade_detail_materialized===false) changeRows+='<tr><td colspan="4"><div class="notice">2 个 UPGRADE 已确认，但对象尚未结构化抽取；页面不会猜测。</div></td></tr>';
  return '<div class="grid">'+
    card("本周结论",'<div class="row"><span class="badge FORMAL">'+esc(f.as_of||"—")+' FORMAL</span><span>→</span><span class="badge CANDIDATE">'+esc(c.as_of||"—")+' CANDIDATE</span></div><div class="divider"></div><div class="small">1380-case 连续性：'+esc(c.continuity?.upgrade||0)+' 升级 / '+esc(c.continuity?.downgrade||0)+' 降级 / '+esc(c.continuity?.no_change||0)+' 无变化。</div>',12)+
    card("变化对象",'<table><thead><tr><th>标的</th><th>代码</th><th>变化</th><th>Case</th></tr></thead><tbody>'+changeRows+'</tbody></table>',8)+
    card("深度研究",kv("队列",c.deep_research_queue_n||0)+'<div class="divider"></div><div class="pill-list"><span class="pill">watch '+esc(outcomes.watch||0)+'</span><span class="pill">wait disclosure '+esc(outcomes.wait_disclosure||0)+'</span></div>',4)+
    card("证据信号",'<div class="pill-list">'+Object.entries(signals).map(([k,v])=>'<span class="pill">'+esc(k)+' · '+esc(v)+'</span>').join("")+'</div>',6)+
    card("正式卡片",'<div class="pill-list">'+(f.formal_cards||[]).map(x=>'<span class="pill">'+securityLink(x,x.stock_name+" "+(x.security_id||"").split(":").pop())+'</span>').join("")+'</div>',6)+
  '</div>';
}
function watchlist(p){
  const items=moduleData(p,"watchlist").items||[];
  return '<section class="card"><h2>NEW 系统关注标的</h2><table><thead><tr><th>标的</th><th>身份</th><th>当前角色</th><th>状态</th><th>周变化/连续性</th><th>下一触发</th></tr></thead><tbody>'+
    items.map(x=>'<tr><td>'+securityLink(x) + '<div class="small muted">'+esc((x.security_id||"").split(":").pop())+'</div></td><td>'+badge(x.authority)+'</td><td>'+esc(x.current_role)+'</td><td>'+esc(x.current_state)+'</td><td>'+esc(x.weekly_change||x.continuity)+'</td><td>'+esc(x.next_trigger||x.blocker)+'</td></tr>').join("")+
  '</tbody></table></section>';
}
function opportunities(p){
  const o=moduleData(p,"opportunities"), fl=o.fast_lane_acceptance||{};
  if(o.case_denominator_n!==undefined){
    const rows=(o.items||[]).map(x=>'<tr><td>'+securityLink(x,x.security_id.split(":").pop()+" "+x.stock_name)+'</td><td>'+badge(x.authority)+'</td><td>'+esc(x.current_state)+'</td><td>'+esc((x.blockers||[]).join("；")||"见同案来源")+'</td></tr>').join("");
    return '<div class="grid">'+
      card("本批条件复核",kv("复核",o.reviewed_case_n)+kv("完整保留",o.case_denominator_n)+'<div class="small muted">其余 '+esc(o.not_reviewed_case_n)+' 案未在本批重新复核；不是无机会。</div>',6)+
      card("价格条件",kv("当前价格有效",o.price_current_n)+kv("条件复核",o.conditional_review_n)+'<div class="small muted">只作研究与人工复核，四权限保持关闭。</div>',6)+
      card("同案连续跟踪",'<div class="table-scroll"><table><thead><tr><th>标的</th><th>身份</th><th>当前状态</th><th>阻断与下一步</th></tr></thead><tbody>'+rows+'</tbody></table></div>',12)+
      card("当轮新机会复核",o.fast_status==="evaluated"?kv("提名",o.fast_nomination_n)+kv("完成案例复核",o.fast_compiled_case_n):'<div class="small muted">本轮快线输入未供应或受阻，不代表没有机会。</div>',12)+
      card("新机会对象",'<div class="pill-list">'+(o.fast_rows||[]).map(x=>'<span class="pill">'+securityLink(x,x.security_id.split(":").pop()+" "+x.stock_name)+' '+badge(x.authority)+' '+esc(x.expires_at&&Date.parse(x.expires_at)<=Date.now()?"已过期，等待新触发":x.permitted_review_action||x.reason||"待核验")+'</span>').join("")+'</div>',12)+

      card("来源时间",esc(fmtTime(p.modules.opportunities.source_cutoff||o.as_of))+'<div class="small muted">正式周报及其原始时钟独立保留。</div>',12)+
    '</div>';
  }
  const rows=o.nomination_records||[];
  const tableRows=rows.map((x,i)=>'<tr>'+
    '<td>'+(i+1)+'</td>'+
    '<td>'+securityLink(x)+'<div class="small muted">'+esc((x.security_id||"").split(":").pop())+'</div></td>'+
    '<td>'+esc(GATE_LABELS[x.gate_id]||x.gate_id)+'<div class="small muted">'+esc(x.gate_id)+'</div></td>'+
    '<td><span class="pill">'+esc(x.evidence_label)+'</span><div class="small muted">'+esc(x.evidence_state)+'</div></td>'+
    '<td>'+esc(x.capture_quality_rank)+'</td>'+
    '<td>'+esc(fmtTime(x.observed_at))+'</td>'+
    '</tr>').join("");
  return '<div class="grid">'+
    card("Nomination",'<div class="row between">'+kv("提名记录",o.nomination_record_count||o.nomination_count||0)+badge("NOMINATION")+'</div><div class="divider"></div><div class="small muted">唯一公司 '+esc(o.unique_company_count||"—")+' 家；同一公司命中多个 gate 时保留多条记录。</div>',4)+
    card("Fresh Trigger",kv("新触发",o.fresh_trigger_n||0)+'<div class="small muted">TTL '+esc(o.ttl_days||"—")+' 天</div>',4)+
    card("Fast Lane",kv("Accepted",fl.accepted_n??0)+'<div class="divider"></div><div class="small muted">'+esc(fl.note||"—")+'</div>',4)+
    card("P3 新候选 · 全部记录",'<div class="table-scroll"><table><thead><tr><th>#</th><th>公司</th><th>研究 Gate</th><th>证据状态</th><th>质量档</th><th>观察时间</th></tr></thead><tbody>'+tableRows+'</tbody></table></div><div class="small muted" style="margin-top:10px">'+esc(o.nomination_semantics||"")+'</div>',12)+
    card("主要阻断",'<div class="pill-list">'+(o.main_blockers||[]).map(x=>'<span class="pill">'+esc(x)+'</span>').join("")+'</div>',12)+
  '</div>';
}
function progress(p){
  const c=moduleData(p,"candidate_weekly"), h=moduleData(p,"system_health");
  return '<div class="grid">'+
    ["p2b","p2c","p3","p4"].map(k=>card(k.toUpperCase(),kv("状态",h[k]||"—"),3)).join("")+
    card("Candidate Coverage",'<div class="row">'+kv("Case",c.case_denominator||0)+kv("增量覆盖",c.report_attack_incremental_coverage?.captured_n||0)+'</div>',6)+
    card("Evidence Maturity",'<div class="pill-list">'+Object.entries(c.evidence_maturity_counts||{}).map(([k,v])=>'<span class="pill">'+esc(k)+' · '+esc(v)+'</span>').join("")+'</div>',6)+
  '</div>';
}
function health(p){
  const h=moduleData(p,"system_health");
  const freshness=Object.entries(p.modules).map(([name,m])=>'<tr><td>'+esc(MODULE_LABELS[name]||name)+'</td><td>'+esc(({verified:"本批已验证",partial:"本批覆盖不全",unavailable:"本批未供应",stale:"来源过期"})[m.status]||m.status)+'</td><td>'+esc(fmtTime(m.previous_snapshot_source_cutoff||m.source_cutoff||p.source_cutoff))+'</td><td>'+esc(m.data_from_previous_snapshot?"保留原数据":"本批来源")+'</td></tr>').join("");
  return '<div class="grid">'+
    card("模块来源与供给",'<table><thead><tr><th>模块</th><th>供给状态</th><th>原来源时间</th><th>说明</th></tr></thead><tbody>'+freshness+'</tbody></table>',12)+
    card("边界校验",'<div class="row"><span class="badge SYSTEM">'+esc(h.data_boundary||p.data_boundary)+'</span><span class="good">external_evidence_sharing = false</span></div><div class="divider"></div><div class="small muted">外部监控源 attached：'+esc(h.external_monitor_sources_attached)+'</div>',6)+
    card("自然运行观察",esc(h.natural_p7_status==="not_verified"?"尚未完成自然交付验收":h.natural_p7_status||"未供应")+'<div class="small muted">正式采用、页面更新与自然交付分别验收。</div>',6)+
    card("保护状态",'<div class="pill-list"><span class="pill">formal unchanged '+esc(h.formal_current_unchanged)+'</span><span class="pill">trade_permission false</span></div>',6)+
    card("禁止模块",'<div class="pill-list">'+(h.forbidden_external_modules||[]).map(x=>'<span class="pill">'+esc(x)+'</span>').join("")+'</div>',12)+
  '</div>';
}
const renderers={"总览":overview,"周报":weekly,"关注标的":watchlist,"新机会":opportunities,"研究进展":progress,"系统状态":health};

function renderNav(p){
  const nav=$("#nav");
  nav.innerHTML="";
  EXPECTED_NAV.forEach((name,i)=>{
    const b=document.createElement("button");b.textContent=name;
    if(i===0)b.classList.add("active");
    b.onclick=()=>{document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#app").innerHTML=renderers[name](p)};
    nav.appendChild(b);
  });
}
function fail(errors){
  $("#app").innerHTML='<section class="fail"><h2>FAIL_CLOSED</h2><p>NEW 系统数据合同校验失败，页面拒绝展示可能被污染的数据。</p><ul>'+errors.map(e=>'<li>'+esc(e)+'</li>').join("")+'</ul></section>';
}
async function boot(){
  try{
    const res=await fetch("./dashboard/current.json?ts="+Date.now(),{cache:"no-store"});
    if(!res.ok)throw new Error("HTTP "+res.status);
    const p=await res.json();
    const errors=validate(p);
    if(errors.length){fail(errors);return}
    CURRENT_PAYLOAD=p;
    SECURITY_INDEX=buildSecurityIndex(p);
    setupSecuritySearch();
    $("#snapshotMeta").textContent="来源 "+fmtTime(p.source_cutoff)+" · 展示生成 "+fmtTime(p.generated_at)+" · "+(p.overall_status==="healthy"?"完整":"部分模块未供应，保留原数据")+" · "+SECURITY_INDEX.size+" 家标的";
    $("#snapshotHash").textContent="snapshot "+String(p.snapshot_sha256||"").slice(0,12);
    renderNav(p);$("#app").innerHTML=overview(p);
  }catch(e){fail(["无法读取 dashboard/current.json："+e.message])}
}
boot();
