"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import styles from "./ContentFreshnessLesson.module.css";

type Kind = "stage" | "decision" | "terminal";
type Route = "forward" | "branch" | "return";
type Artifact = { id:string; label:string; title:string; body:string; visibility:{kind:"always"} };
type SimState = { id:string; label:string };
type SimAction = { id:string; label:string; allowedFrom:string[]; to:string; successFeedback:string; blockedFeedback:string };
type Rect = { left:number; top:number; right:number; bottom:number; width:number; height:number };
type Drawn = { id:string; path:string; x?:number; y?:number };

export interface ContentFreshnessLessonContent {
  schemaVersion:number; id:string; title:string; category:string; summary:string; description:string; safetyNotice:string;
  diagramLabel:string; textAlternativeLabel:string; textAlternative:string; walkthroughHeading:string; evidenceHeading:string;
  practiceHeading:string; practiceInstructions:string; feedbackHeading:string; retryLabel:string; resetLabel:string;
  retryAnnouncement:string; resetAnnouncement:string; attemptsLabel:string; completionLabel:string; pendingCompletion:string;
  earnedCompletion:string; sourcesHeading:string; sourcesIntroduction:string; takeawaysHeading:string; takeaways:string[];
  nodes:Array<{id:string;label:string;kind:Kind;heading:string;description:string;artifactIds:string[]}>;
  edges:Array<{id:string;from:string;to:string;label:string;route:Route}>;
  artifacts:Artifact[];
  practiceGroups:Array<{id:string;title:string;prompt:string;choiceIds:string[];solutionTitle:string;solution:string}>;
  choices:Array<{id:string;groupId:string;label:string;correct:boolean;feedback:string}>;
  simulator:{heading:string;instructions:string;initialState:string;completionState:string;stateLabel:string;resetLabel:string;resetAnnouncement:string;idleFeedback:string;completedLabel:string;states:SimState[];actions:SimAction[]};
  sources:Array<{title:string;publisher:string;url:string;verification:string;use:string}>;
}

export interface ContentFreshnessLessonProps { data:ContentFreshnessLessonContent }

const cx=(r:Rect)=>r.left+r.width/2;
const cy=(r:Rect)=>r.top+r.height/2;
const between=(a:number,b:number,f=.5)=>a+(b-a)*f;
function box(el:HTMLElement, host:HTMLElement):Rect {
  const a=el.getBoundingClientRect(), b=host.getBoundingClientRect();
  return {left:a.left-b.left,top:a.top-b.top,right:a.right-b.left,bottom:a.bottom-b.top,width:a.width,height:a.height};
}

export default function ContentFreshnessLesson({data}:ContentFreshnessLessonProps) {
  const uid=useId().replace(/:/g,"");
  const markerId=`${uid}-arrow`, titleId=`${uid}-title`, detailId=`${uid}-detail`, practiceId=`${uid}-practice`, simId=`${uid}-sim`;
  const hostRef=useRef<HTMLDivElement>(null), detailRef=useRef<HTMLHeadingElement>(null);
  const nodeRefs=useRef(new Map<string,HTMLButtonElement>()), feedbackRefs=useRef(new Map<string,HTMLDivElement>());
  const [selectedNode,setSelectedNode]=useState(data.nodes[0]?.id||"");
  const [drawn,setDrawn]=useState<Drawn[]>([]);
  const [attempted,setAttempted]=useState<Record<string,boolean>>({});
  const [solved,setSolved]=useState<Record<string,boolean>>({});
  const [selectedChoices,setSelectedChoices]=useState<Record<string,string>>({});
  const [attempts,setAttempts]=useState(0), [announcement,setAnnouncement]=useState("");
  const [simState,setSimState]=useState(data.simulator.initialState), [simFeedback,setSimFeedback]=useState("");
  const nodes=useMemo(()=>new Map(data.nodes.map(n=>[n.id,n])),[data.nodes]);
  const artifacts=useMemo(()=>new Map(data.artifacts.map(a=>[a.id,a])),[data.artifacts]);
  const choices=useMemo(()=>new Map(data.choices.map(c=>[c.id,c])),[data.choices]);
  const current=nodes.get(selectedNode)||data.nodes[0];
  const complete=data.practiceGroups.length>0&&data.practiceGroups.every(g=>solved[g.id]);

  const measure=useCallback(()=>{
    const host=hostRef.current;
    if(!host) return;
    const rects=new Map<string,Rect>();
    nodeRefs.current.forEach((el,id)=>rects.set(id,box(el,host)));
    const hostBounds=host.getBoundingClientRect();
    const width=hostBounds.width, next:Drawn[]=[];
    type ReturnGeometry={rail:number;departureY:number;labelX:number};
    const returnGeometry=(id:string):ReturnGeometry|undefined=>{
      const S=rects.get("S"), P=rects.get("P"), E=rects.get("E"), H=rects.get("H"), R=rects.get("R"), M=rects.get("M"), B=rects.get("B");
      if(id==="E-P"&&P&&E&&H){
        const rail=P.left-32, departureY=between(E.bottom,H.top,.28);
        return{rail,departureY,labelX:between(cx(E),rail,.5)};
      }
      if(id==="H-P"&&P&&H&&R){
        const rail=P.right+32, departureY=between(H.bottom,R.top,.28);
        return{rail,departureY,labelX:between(cx(H),rail,.5)};
      }
      if(id==="M-S"&&S&&M&&B){
        const rail=S.left-56, departureY=between(M.bottom,B.top,.28);
        return{rail,departureY,labelX:between(cx(M),rail,.5)};
      }
      if(id==="B-S"&&S&&B){
        const rail=S.right+56, departureY=Math.min(hostBounds.height-24,B.bottom+48);
        return{rail,departureY,labelX:between(cx(B),rail,.5)};
      }
      return undefined;
    };
    const labelPoint=(id:string):{x:number;y:number}|undefined=>{
      const E=rects.get("E"), H=rects.get("H"), R=rects.get("R"), M=rects.get("M"), B=rects.get("B");
      const returnRoute=returnGeometry(id);
      if(returnRoute)return{x:returnRoute.labelX,y:returnRoute.departureY};
      if(id==="E-H"&&E&&H)return{x:width/2,y:between(E.bottom,H.top,.72)};
      if(id==="H-R"&&H&&R)return{x:width/2,y:between(H.bottom,R.top,.72)};
      if(id==="M-B"&&M&&B)return{x:width/2,y:between(M.bottom,B.top,.72)};
      return undefined;
    };
    for(const edge of data.edges){
      const from=rects.get(edge.from), to=rects.get(edge.to);
      if(!from||!to) continue;
      let path="";
      if(edge.id==="M-B"){
        const sx=cx(from), sy=from.bottom, ex=cx(to), ey=to.top-8;
        const offset=Math.min(34,Math.max(22,from.width*.14));
        const upper=sy+18, lower=between(sy,to.top,.72);
        path=`M ${sx} ${sy} L ${sx+offset} ${upper} L ${sx+offset} ${lower} L ${ex} ${ey}`;
      } else if(edge.route==="return") {
        const geometry=returnGeometry(edge.id);
        if(!geometry)continue;
        const left=edge.id==="E-P"||edge.id==="M-S";
        const sx=cx(from), sy=from.bottom;
        const ex=(left?to.left:to.right)+(left?-8:8), ey=cy(to);
        path=`M ${sx} ${sy} L ${sx} ${geometry.departureY} L ${geometry.rail} ${geometry.departureY} L ${geometry.rail} ${ey} L ${ex} ${ey}`;
      } else {
        const sx=cx(from), sy=from.bottom, ex=cx(to), ey=to.top-8;
        const turn=between(sy,ey,.5);
        path=`M ${sx} ${sy} L ${sx} ${turn} L ${ex} ${turn} L ${ex} ${ey}`;
      }
      const point=edge.label?labelPoint(edge.id):undefined;
      next.push({id:edge.id,path,x:point?.x,y:point?.y});
    }
    setDrawn(next);
  },[data.edges]);

  useEffect(()=>{
    const host=hostRef.current;
    if(!host) return;
    let frame=0;
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};
    const observer=new ResizeObserver(schedule);
    observer.observe(host,{box:"border-box"});
    nodeRefs.current.forEach(el=>observer.observe(el,{box:"border-box"}));
    window.addEventListener("resize",schedule);
    schedule();
    return()=>{
      window.removeEventListener("resize",schedule);
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  },[measure]);

  function chooseNode(id:string,focusDetail:boolean){
    const node=nodes.get(id); if(!node)return;
    setSelectedNode(id); setAnnouncement(node.heading);
    if(focusDetail)requestAnimationFrame(()=>detailRef.current?.focus());
  }
  function nodeKey(e:KeyboardEvent<HTMLButtonElement>,index:number){
    let n=index;
    if(e.key==="ArrowRight"||e.key==="ArrowDown")n=Math.min(data.nodes.length-1,index+1);
    else if(e.key==="ArrowLeft"||e.key==="ArrowUp")n=Math.max(0,index-1);
    else if(e.key==="Home")n=0;
    else if(e.key==="End")n=data.nodes.length-1;
    else return;
    e.preventDefault(); nodeRefs.current.get(data.nodes[n].id)?.focus();
  }
  function answer(groupId:string,choiceId:string){
    const choice=choices.get(choiceId); if(!choice||choice.groupId!==groupId)return;
    setAttempts(v=>v+1);
    setAttempted(v=>({...v,[groupId]:true}));
    setSolved(v=>({...v,[groupId]:Boolean(v[groupId]||choice.correct)}));
    setSelectedChoices(v=>({...v,[groupId]:choiceId}));
    setAnnouncement(choice.feedback);
    requestAnimationFrame(()=>feedbackRefs.current.get(groupId)?.focus());
  }
  function retry(groupId:string){
    setSelectedChoices(v=>{const next={...v};delete next[groupId];return next;});
    setAnnouncement(data.retryAnnouncement);
  }
  function reset(){
    setAttempted({});setSolved({});setSelectedChoices({});setAttempts(0);setAnnouncement(data.resetAnnouncement);
  }
  function runAction(action:SimAction){
    const feedback=action.allowedFrom.includes(simState)?action.successFeedback:action.blockedFeedback;
    if(action.allowedFrom.includes(simState))setSimState(action.to);
    setSimFeedback(feedback);setAnnouncement(feedback);
  }
  function resetSim(){
    setSimState(data.simulator.initialState);setSimFeedback("");setAnnouncement(data.simulator.resetAnnouncement);
  }

  const visible=(current?.artifactIds||[]).map(id=>artifacts.get(id)).filter((a):a is Artifact=>Boolean(a));
  const stateLabel=data.simulator.states.find(s=>s.id===simState)?.label||simState;

  return <section className={styles.lesson} aria-labelledby={titleId}>
    <p className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</p>
    <header className={styles.panel}><p className={styles.eyebrow}>{data.category}</p><h2 id={titleId}>{data.title}</h2><p>{data.summary}</p><p>{data.description}</p><p className={styles.notice}>{data.safetyNotice}</p></header>
    <div className={styles.status} aria-label={data.completionLabel}><span><strong>{data.attemptsLabel}:</strong> {attempts}</span><span><strong>{data.completionLabel}:</strong> {complete?data.earnedCompletion:data.pendingCompletion}</span></div>
    <div ref={hostRef} className={styles.diagram} role="group" aria-label={data.diagramLabel}>
      <svg className={styles.connectors} aria-hidden="true"><defs><marker id={markerId} markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 Z" className={styles.arrowHead}/></marker></defs>{drawn.map(d=><path key={d.id} d={d.path} className={styles.connector} markerEnd={`url(#${markerId})`}/>)}</svg>
      {data.nodes.map((n,i)=><button key={n.id} ref={el=>{if(el)nodeRefs.current.set(n.id,el);else nodeRefs.current.delete(n.id);}} type="button" className={styles.node} data-node={n.id} data-kind={n.kind} aria-pressed={current?.id===n.id} onClick={()=>chooseNode(n.id,true)} onKeyDown={e=>nodeKey(e,i)}><strong>{n.label}</strong><span>{n.heading}</span></button>)}
      {drawn.map(d=>{const edge=data.edges.find(e=>e.id===d.id);if(!edge?.label||d.x===undefined||d.y===undefined)return null;return <span key={`${d.id}-label`} className={styles.edgeLabel} style={{left:d.x,top:d.y}}>{edge.label.split("|").map((part,i)=><span key={i}>{part}</span>)}</span>;})}
    </div>
    <details className={styles.panel}><summary>{data.textAlternativeLabel}</summary><p>{data.textAlternative}</p></details>
    <article className={styles.panel} aria-labelledby={detailId}><p className={styles.eyebrow}>{data.walkthroughHeading}: {current?.label}</p><h3 id={detailId} ref={detailRef} tabIndex={-1}>{current?.heading}</h3><p>{current?.description}</p><h4>{data.evidenceHeading}</h4><div className={styles.cards}>{visible.map(a=><section className={styles.artifact} key={a.id}><p className={styles.eyebrow}>{a.label}</p><h5>{a.title}</h5><p className={styles.preserve}>{a.body}</p></section>)}</div></article>
    <section className={styles.panel} aria-labelledby={simId}><h3 id={simId}>{data.simulator.heading}</h3><p>{data.simulator.instructions}</p><p className={styles.simState}><strong>{data.simulator.stateLabel}:</strong> {stateLabel}</p><div className={styles.simActions}>{data.simulator.actions.map(a=><button type="button" key={a.id} onClick={()=>runAction(a)}>{a.label}</button>)}</div><div className={styles.simFeedback} aria-live="polite">{simFeedback||data.simulator.idleFeedback}{simState===data.simulator.completionState&&<p><strong>{data.simulator.completedLabel}</strong></p>}</div><button className={styles.resetButton} type="button" onClick={resetSim}>{data.simulator.resetLabel}</button></section>
    <section className={styles.panel} aria-labelledby={practiceId}><h3 id={practiceId}>{data.practiceHeading}</h3><p>{data.practiceInstructions}</p><div className={styles.practiceGrid}>{data.practiceGroups.map(g=>{const chosen=selectedChoices[g.id]?choices.get(selectedChoices[g.id]):undefined;return <section className={styles.practice} key={g.id}><h4>{g.title}</h4><p>{g.prompt}</p><fieldset><legend className={styles.srOnly}>{g.title}</legend>{g.choiceIds.map(id=><button type="button" key={id} onClick={()=>answer(g.id,id)}>{choices.get(id)?.label}</button>)}</fieldset>{attempted[g.id]&&chosen&&<div ref={el=>{if(el)feedbackRefs.current.set(g.id,el);else feedbackRefs.current.delete(g.id);}} className={styles.feedback} tabIndex={-1}><h5>{data.feedbackHeading}</h5><p>{chosen.feedback}</p><h5>{g.solutionTitle}</h5><p>{g.solution}</p>{!chosen.correct&&<button type="button" onClick={()=>retry(g.id)}>{data.retryLabel}</button>}</div>}</section>;})}</div><div className={styles.actions}><button type="button" onClick={reset}>{data.resetLabel}</button></div></section>
    <section className={styles.panel}><h3>{data.takeawaysHeading}</h3><ul>{data.takeaways.map(t=><li key={t}>{t}</li>)}</ul></section>
    <section className={styles.panel}><h3>{data.sourcesHeading}</h3><p>{data.sourcesIntroduction}</p><ul className={styles.sources}>{data.sources.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a><strong>{s.publisher}</strong><span>{s.verification}</span><p>{s.use}</p></li>)}</ul></section>
  </section>;
}

export { ContentFreshnessLesson };