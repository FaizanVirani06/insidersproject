import { useAuth } from "@/components/auth-provider";
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "@/lib/api";

export function AdminSocialPage() {
  const { user } = useAuth();
  if (user?.role !== "admin") return <div className="text-sm muted">Admin only.</div>;
  const [sp] = useSearchParams();
  const [content, setContent] = React.useState("");
  const [linkUrl, setLinkUrl] = React.useState("");
  const [sourceSignalId, setSourceSignalId] = React.useState(sp.get('signal_id') || "");
  const [preview, setPreview] = React.useState("");
  const [posts, setPosts] = React.useState<any[]>([]);
  const load = () => apiFetch('/admin/social/posts').then(r=>r.ok?r.json():{posts:[]}).then(j=>setPosts(j.posts||[]));
  React.useEffect(()=>{load();},[]);
  const doPreview = async () => { const r = await apiFetch('/admin/social/x/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content,source_signal_id:sourceSignalId})}); const j=await r.json(); setPreview(j.content||""); };
  const doPost = async () => { await apiFetch('/admin/social/x/post',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content,link_url:linkUrl,source_signal_id:sourceSignalId})}); load(); };
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">Admin Social Posting</h1><textarea className="input min-h-[140px] w-full" value={content} onChange={e=>setContent(e.target.value)} /><div className="text-xs muted">{content.length}/280</div><input className="input" placeholder="Optional link URL" value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} /><input className="input" placeholder="Optional signal id" value={sourceSignalId} onChange={e=>setSourceSignalId(e.target.value)} /><div className="flex gap-2"><button className="btn-secondary" onClick={doPreview}>Preview</button><button className="btn-primary" onClick={doPost}>Post to X</button></div>{preview ? <div className="glass-card p-4 whitespace-pre-wrap">{preview}</div> : null}<div className="space-y-2">{posts.map((p:any)=><div key={p.post_id} className="glass-card p-3 text-sm"><div>{p.status} {p.x_tweet_url ? <a className="link" href={p.x_tweet_url}>Open</a>:null}</div><div>{p.content}</div>{p.error_message?<div className="text-red-500">{p.error_message}</div>:null}</div>)}</div></div>;
}
