'use client';
import {useState} from 'react';
import type {DeliverableComment} from '../lib/stage-four';
import {userTimestamp,type UserTimezone} from '../lib/timezones';
import {LinkedText} from './task-text';

export function DeliverableComments({comments,canComment,timezone,onPost}:{comments:DeliverableComment[];canComment:boolean;timezone:UserTimezone;onPost:(text:string,parentId:string|null)=>Promise<void>}) {
 const [text,setText]=useState(''),[reply,setReply]=useState<DeliverableComment|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const render=(parentId:string|null):React.ReactNode=>comments.filter(c=>c.parentId===parentId).map(c=><article className="deliverable-comment" key={c.id}><header><strong>{c.authorName}</strong><time dateTime={c.at}>{userTimestamp(c.at,timezone)}</time></header><p><LinkedText text={c.text}/></p>{canComment&&<button type="button" className="text-button" onClick={()=>setReply(c)}>Reply to {c.authorName}</button>}<div className="comment-replies">{render(c.id)}</div></article>);
 return <section className="deliverable-comments" aria-label="Deliverable comments"><h3>Comments ({comments.length})</h3>{comments.length?render(null):<p className="small-note">No comments yet.</p>}{canComment&&<div className="comment-composer">{reply&&<p>Replying to {reply.authorName} <button type="button" className="text-button" onClick={()=>setReply(null)}>Cancel reply</button></p>}<label>{reply?'Your reply':'Add a comment'}<textarea maxLength={4000} rows={3} value={text} disabled={busy} onChange={e=>setText(e.target.value)}/></label>{error&&<p role="alert" className="alert error">{error}</p>}<button type="button" className="button secondary" disabled={busy||!text.trim()} onClick={async()=>{setBusy(true);setError('');try{await onPost(text,reply?.id||null);setText('');setReply(null);}catch(e){setError(e instanceof Error?e.message:'Could not post comment.');}finally{setBusy(false);}}}>{busy?'Posting…':reply?'Post reply':'Post comment'}</button></div>}</section>;
}
