const EXPECTED_NAV=["总览","周报","关注标的","新机会","研究进展","系统状态"];
const EXPECTED_MODULES=["formal_weekly","candidate_weekly","watchlist","opportunities","system_health"];

const $=(s)=>document.querySelector(s);
const esc=(v)=>String(v??"—").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const badge=(a)=>a?'<span class="badge '+esc(a)+'">'+esc(a)+'</span>':"";
const fmtTime=(s)=>{if(!s)return"—";try{return new Date(s).toLocaleString("zh-CN",{hour12:false})}catch{return s}};
const moduleData=(p,n)=>p.modules?.[n]?.data||{};
const moduleStatus=(p,n)=>p.modules?.[n]?.status||"unknown";

function validate(p){
  const errors=[];
  if(p.system_id!=="NEW_SYSTEM") errors.push("system_id 不是 NEW_SYSTEM");
  if(p.data_boundary!=="isolated") errors.push("data_boundary 不是 isolated");
  if(p.external_evidence_sharing!==false) errors.push("external_evidence_sharing 必须为 false");
  if(p.permissions?.trade_permission!==false) errors.push("trade_permission 必须为 false");
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
    card("正式基线",'<div class="row between">'+kv(f.as_of||"FORMAL",f.formal_cards?.length||0)+badge("FORMAL")+'</div><div class="divider"></div><div class="small muted">正式卡片：'+esc((f.formal_cards||[]).map(x=>x.stock_name).join("、")||"—")+'</div>',4)+
    card("最新候选",'<div class="row between">'+kv(c.as_of||"CANDIDATE",c.case_denominator||0)+badge("CANDIDATE")+'</div><div class="divider"></div><div class="pill-list"><span class="pill">UPGRADE '+esc(c.continuity?.upgrade||0)+'</span><span class="pill">DOWNGRADE '+esc(c.continuity?.downgrade||0)+'</span><span class="pill">NO_CHANGE '+esc(c.continuity?.no_change||0)+'</span></div>',4)+
    card("新机会漏斗",'<div class="row between">'+kv("NOMINATION",o.nomination_count||0)+badge("NOMINATION")+'</div><div class="divider"></div><div class="small muted">Fast Lane accepted：'+esc(o.fast_lane_acceptance?.accepted_n??0)+'</div>',4)+
    card("连续性对象",'<div class="pill-list">'+cont.map(x=>'<span class="pill">'+esc(x.stock_name)+' '+esc((x.security_id||"").split(":").pop())+'</span>').join("")+'</div>',6)+
    card("系统边界",'<div class="row"><span class="badge SYSTEM">ISOLATED</span><span class="good">不共享外部证据</span></div><div class="divider"></div><div class="small muted">数据仅来自 dashboard-data；外部云端监控模块禁止进入。</div>',6)+
  '</div>';
}
function weekly(p){
  const f=moduleData(p,"formal_weekly"), c=moduleData(p,"candidate_weekly");
  const changed=c.known_changed_securities||[];
  const signals=c.evidence_signal_counts||{};
  const outcomes=c.deep_research_outcome_counts||{};
  let changeRows=changed.map(x=>'<tr><td>'+esc(x.stock_name)+'</td><td>'+esc((x.security_id||"").split(":").pop())+'</td><td>'+esc(x.weekly_change)+'</td><td>'+esc(x.case_key)+'</td></tr>').join("");
  if(c.upgrade_detail_materialized===false) changeRows+='<tr><td colspan="4"><div class="notice">2 个 UPGRADE 已确认，但对象尚未结构化抽取；页面不会猜测。</div></td></tr>';
  return '<div class="grid">'+
    card("本周结论",'<div class="row"><span class="badge FORMAL">'+esc(f.as_of||"—")+' FORMAL</span><span>→</span><span class="badge CANDIDATE">'+esc(c.as_of||"—")+' CANDIDATE</span></div><div class="divider"></div><div class="small">1380-case 连续性：'+esc(c.continuity?.upgrade||0)+' 升级 / '+esc(c.continuity?.downgrade||0)+' 降级 / '+esc(c.continuity?.no_change||0)+' 无变化。</div>',12)+
    card("变化对象",'<table><thead><tr><th>标的</th><th>代码</th><th>变化</th><th>Case</th></tr></thead><tbody>'+changeRows+'</tbody></table>',8)+
    card("深度研究",kv("队列",c.deep_research_queue_n||0)+'<div class="divider"></div><div class="pill-list"><span class="pill">watch '+esc(outcomes.watch||0)+'</span><span class="pill">wait disclosure '+esc(outcomes.wait_disclosure||0)+'</span></div>',4)+
    card("证据信号",'<div class="pill-list">'+Object.entries(signals).map(([k,v])=>'<span class="pill">'+esc(k)+' · '+esc(v)+'</span>').join("")+'</div>',6)+
    card("正式卡片",'<div class="pill-list">'+(f.formal_cards||[]).map(x=>'<span class="pill">'+esc(x.stock_name)+' '+esc((x.security_id||"").split(":").pop())+'</span>').join("")+'</div>',6)+
  '</div>';
}
function watchlist(p){
  const items=moduleData(p,"watchlist").items||[];
  return '<section class="card"><h2>NEW 系统关注标的</h2><table><thead><tr><th>标的</th><th>身份</th><th>当前角色</th><th>状态</th><th>周变化/连续性</th><th>下一触发</th></tr></thead><tbody>'+
    items.map(x=>'<tr><td><strong>'+esc(x.stock_name)+'</strong><div class="small muted">'+esc((x.security_id||"").split(":").pop())+'</div></td><td>'+badge(x.authority)+'</td><td>'+esc(x.current_role)+'</td><td>'+esc(x.current_state)+'</td><td>'+esc(x.weekly_change||x.continuity)+'</td><td>'+esc(x.next_trigger||x.blocker)+'</td></tr>').join("")+
  '</tbody></table></section>';
}
function opportunities(p){
  const o=moduleData(p,"opportunities"), fl=o.fast_lane_acceptance||{};
  const rows=o.nomination_records||[];
  const gateLabel={
    G1_compute_accelerator:"算力芯片/加速器",
    G4_data_movement:"数据传输/互联",
    G5_board_package_manufacturing:"PCB/封装制造",
    G6_power_delivery:"电源/供配电",
    G7_thermal_site:"液冷/数据中心基础设施",
    G8_specified_equipment_material:"专用设备/材料"
  };
  const tableRows=rows.map((x,i)=>'<tr>'+
    '<td>'+(i+1)+'</td>'+
    '<td><strong>'+esc(x.stock_name)+'</strong><div class="small muted">'+esc((x.security_id||"").split(":").pop())+'</div></td>'+
    '<td>'+esc(gateLabel[x.gate_id]||x.gate_id)+'<div class="small muted">'+esc(x.gate_id)+'</div></td>'+
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
  return '<div class="grid">'+
    card("边界校验",'<div class="row"><span class="badge SYSTEM">'+esc(h.data_boundary||p.data_boundary)+'</span><span class="good">external_evidence_sharing = false</span></div><div class="divider"></div><div class="small muted">外部监控源 attached：'+esc(h.external_monitor_sources_attached)+'</div>',6)+
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
    $("#snapshotMeta").textContent="快照 "+fmtTime(p.generated_at)+" · "+(p.overall_status||"—");
    $("#snapshotHash").textContent="snapshot "+String(p.snapshot_sha256||"").slice(0,12);
    renderNav(p);$("#app").innerHTML=overview(p);
  }catch(e){fail(["无法读取 dashboard/current.json："+e.message])}
}
boot();
