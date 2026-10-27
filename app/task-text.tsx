'use client';
import {useRef,useState} from 'react';
export function LinkedText({text}:{text:string}) {
 return <span className="linked-text">{text.split(/((?:https?:\/\/|www\.)[^\s<>]+)/gi).map((part,i)=>{
  if(!/^(https?:\/\/|www\.)/i.test(part))return part;
  const url=part.replace(/[.,;!?)\]}]+$/,'');const tail=part.slice(url.length);
  return <span key={i}><a href={/^www\./i.test(url)?`https://${url}`:url} target="_blank" rel="noopener noreferrer">{url}</a>{tail}</span>;
 })}</span>;
}
export function MentionField({value,onChange,people,disabled=false,rows=3,placeholder,label,preview=true}:{value:string,onChange:(s:string)=>void,people:{name:string;owner:string;id?:string;username?:string}[],disabled?:boolean,rows?:number,placeholder?:string,label?:string,preview?:boolean}) {
 const ref=useRef<HTMLTextAreaElement>(null);const [range,setRange]=useState<{start:number;end:number;query:string}|null>(null);const [index,setIndex]=useState(0);
 const choices=people.filter(p=>p.name.toLowerCase().includes(range?.query.toLowerCase()||'')||p.owner.toLowerCase().includes(range?.query.toLowerCase()||'')).slice(0,8);
 const inspect=(text:string,pos:number)=>{const match=text.slice(0,pos).match(/(?:^|\s)@([^@\n\[\]]*)$/);setRange(match?{start:pos-match[1].length-1,end:pos,query:match[1]}:null);setIndex(0);};
 const choose=(p:{name:string;owner:string;id?:string;username?:string})=>{if(!range)return;const insert=p.username?`@${p.username} `:`@[${p.owner}] `;onChange(value.slice(0,range.start)+insert+value.slice(range.end));setRange(null);requestAnimationFrame(()=>{ref.current?.focus();ref.current?.setSelectionRange(range.start+insert.length,range.start+insert.length);});};
 return <div className="mention-field"><textarea aria-label={label} ref={ref} value={value} rows={rows} disabled={disabled} placeholder={placeholder} maxLength={4000} onChange={e=>{onChange(e.target.value);inspect(e.target.value,e.target.selectionStart);}} onClick={e=>inspect(value,e.currentTarget.selectionStart)} onBlur={()=>setRange(null)} onKeyDown={e=>{if(!range||!choices.length)return;if(e.key==='Escape'){e.stopPropagation();setRange(null);}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setIndex((index+(e.key==='ArrowDown'?1:choices.length-1))%choices.length);}if(e.key==='Enter'){e.preventDefault();choose(choices[index]||choices[0]);}}} aria-autocomplete="list" aria-haspopup="listbox"/>{range&&choices.length>0&&<div className="mention-menu" role="listbox" aria-label="Tag a teammate">{choices.map((p,i)=><button role="option" aria-selected={index===i} type="button" key={p.id||p.owner} onMouseDown={e=>{e.preventDefault();choose(p);}}>{p.name}<small>{p.username?`@${p.username}`:p.owner}</small></button>)}</div>}{preview&&value&&<div className="text-preview"><LinkedText text={value}/></div>}</div>;
}
