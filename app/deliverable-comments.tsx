'use client';
import {useState} from 'react';
import type {CommentChange,DeliverableComment} from '../lib/stage-four';
import {userTimestamp,type UserTimezone} from '../lib/timezones';
import {LinkedText} from './task-text';

export function DeliverableComments({comments,viewerId,canComment,timezone,onChange}:{comments:DeliverableComment[];viewerId:string;canComment:boolean;timezone:UserTimezone;onChange:(change:CommentChange)=>Promise<void>}) {
 const [text,setText]=useState(''),[reply,setReply]=useState<DeliverableComment|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [editing,setEditing]=useState<string|null>(null),[draft,setDraft]=useState('');
 const save=async(change:CommentChange)=>{
  setBusy(true);setError('');
  try{await onChange(change);return true;}
  catch(e){setError(e instanceof Error?e.message:'Could not save comment.');return false;}
  finally{setBusy(false);}
 };
 const disabled=busy||!canComment;
 const render=(parentId:string|null):React.ReactNode=>comments.filter(c=>c.parentId===parentId).map(c=>{
  const own=canComment&&c.authorId===viewerId,hasReplies=comments.some(child=>child.parentId===c.id);
  return <article className="deliverable-comment" key={c.id}>
   <header><strong>{c.authorName}</strong><time dateTime={c.at}>{userTimestamp(c.at,timezone)}</time></header>
   {editing===c.id?<div className="comment-composer">
    <label>Edit your comment<textarea maxLength={4000} rows={3} value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)}/></label>
    <div className="comment-actions"><button type="button" className="button secondary" disabled={disabled||!draft.trim()} onClick={async()=>{if(await save({action:'editComment',commentId:c.id,text:draft}))setEditing(null);}}>{busy?'Updating…':'Update comment'}</button><button type="button" className="text-button" disabled={busy} onClick={()=>setEditing(null)}>Cancel edit</button></div>
   </div>:<p><LinkedText text={c.text}/></p>}
   <div className="comment-actions">
    {canComment&&<button type="button" className="text-button" disabled={busy} onClick={()=>setReply(c)}>Reply to {c.authorName}</button>}
    {own&&editing!==c.id&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setEditing(c.id);setDraft(c.text);setError('');}}>Edit comment</button>}
    {own&&!hasReplies&&<button type="button" className="text-button" disabled={busy} onClick={async()=>{if(await save({action:'deleteComment',commentId:c.id})){if(editing===c.id)setEditing(null);if(reply?.id===c.id)setReply(null);}}}>Delete comment</button>}
   </div>
   {own&&hasReplies&&<p className="small-note">This comment has replies and cannot be deleted.</p>}
   <div className="comment-replies">{render(c.id)}</div>
  </article>;
 });
 return <section className="deliverable-comments" aria-label="Deliverable comments"><h3>Comments ({comments.length})</h3>{comments.length?render(null):<p className="small-note">No comments yet.</p>}{error&&<p role="alert" className="alert error">{error}</p>}{canComment&&<div className="comment-composer">{reply&&<p>Replying to {reply.authorName} <button type="button" className="text-button" disabled={busy} onClick={()=>setReply(null)}>Cancel reply</button></p>}<label>{reply?'Your reply':'Add a comment'}<textarea maxLength={4000} rows={3} value={text} disabled={busy} onChange={e=>setText(e.target.value)}/></label><button type="button" className="button secondary" disabled={busy||!text.trim()} onClick={async()=>{if(await save({action:'comment',text,parentId:reply?.id||null})){setText('');setReply(null);}}}>{busy?'Saving…':reply?'Post reply':'Post comment'}</button></div>}</section>;
}
