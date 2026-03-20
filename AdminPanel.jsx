import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  getFirebaseDb, collection, addDoc, updateDoc, deleteDoc,
  getDocs, doc, serverTimestamp, query, orderBy,
} from "../firebase.js";
import { timeAgo, fmtViews } from "../hooks/useFirestore.js";

const G = "#F5A623", G2 = "#FFD17C";

// ── Shared UI ─────────────────────────────────────────
const Btn = ({ children, onClick, color = G, textColor = "#111", disabled, style = {} }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ border:"none", cursor:disabled?"not-allowed":"pointer", borderRadius:12,
      padding:"10px 18px", fontWeight:800, fontSize:13, color:textColor,
      background:color, opacity:disabled?.6:1, transition:"all .2s",
      display:"inline-flex", alignItems:"center", gap:8, ...style }}
    onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.opacity=".85"; }}
    onMouseLeave={e=>{ e.currentTarget.style.opacity="1"; }}>
    {children}
  </button>
);

const Field = ({ label, children }) => (
  <div style={{ display:"grid", gap:6 }}>
    <label style={{ fontSize:12, fontWeight:800, color:"rgba(255,255,255,.5)", textTransform:"uppercase", letterSpacing:".06em" }}>{label}</label>
    {children}
  </div>
);

const Input = (props) => (
  <input {...props} style={{ height:46, borderRadius:12, border:"1px solid rgba(255,255,255,.1)",
    background:"rgba(255,255,255,.05)", color:"#fff", padding:"0 14px", outline:"none",
    fontFamily:"inherit", fontSize:14, width:"100%", ...props.style }}
    onFocus={e=>e.target.style.borderColor=G}
    onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.1)"}/>
);

const Textarea = (props) => (
  <textarea {...props} style={{ borderRadius:12, border:"1px solid rgba(255,255,255,.1)",
    background:"rgba(255,255,255,.05)", color:"#fff", padding:"12px 14px", outline:"none",
    fontFamily:"inherit", fontSize:14, width:"100%", resize:"vertical", minHeight:100,
    ...props.style }}
    onFocus={e=>e.target.style.borderColor=G}
    onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.1)"}/>
);

const Select = ({ children, ...props }) => (
  <select {...props} style={{ height:46, borderRadius:12, border:"1px solid rgba(255,255,255,.1)",
    background:"#1a1d2e", color:"#fff", padding:"0 14px", outline:"none",
    fontFamily:"inherit", fontSize:14, width:"100%", cursor:"pointer", ...props.style }}>
    {children}
  </select>
);

// ── Image Upload Component ────────────────────────────
function ImageUpload({ value, onChange, label="Thumbnail Image" }) {
  const [preview, setPreview] = useState(value||"");
  const [uploading, setUploading] = useState(false);
  const inputRef = React.useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    if(file.size > 5 * 1024 * 1024) { alert("Picha lazima iwe chini ya 5MB"); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setPreview(dataUrl);
      onChange(dataUrl);
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const clear = () => { setPreview(""); onChange(""); if(inputRef.current) inputRef.current.value=""; };

  return (
    <Field label={label}>
      <div style={{display:"grid",gap:10}}>
        {preview ? (
          <div style={{position:"relative",borderRadius:14,overflow:"hidden",border:"1px solid rgba(255,255,255,.1)"}}>
            <img src={preview} alt="preview" style={{width:"100%",height:180,objectFit:"cover",display:"block"}}/>
            <button onClick={clear} style={{position:"absolute",top:8,right:8,width:32,height:32,borderRadius:8,border:"none",background:"rgba(239,68,68,.85)",color:"#fff",cursor:"pointer",fontWeight:800,fontSize:14}}>✕</button>
          </div>
        ) : (
          <div onClick={()=>inputRef.current?.click()} style={{height:120,borderRadius:14,border:"2px dashed rgba(255,255,255,.15)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",background:"rgba(255,255,255,.03)",transition:"border-color .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(245,166,35,.4)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,.15)"}>
            <span style={{fontSize:28}}>{uploading?"⏳":"🖼️"}</span>
            <span style={{fontSize:13,color:"rgba(255,255,255,.45)",fontWeight:700}}>{uploading?"Inapakia...":"Click kupakia picha (max 5MB)"}</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
        <div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,.3)"}}>au weka URL moja kwa moja:</div>
        <input value={preview.startsWith("data:") ? "" : preview} onChange={e=>{setPreview(e.target.value);onChange(e.target.value);}} placeholder="https://example.com/picha.jpg" style={{height:42,borderRadius:11,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.05)",color:"#fff",padding:"0 14px",outline:"none",fontFamily:"inherit",fontSize:13}} onFocus={e=>e.target.style.borderColor="#F5A623"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.1)"}/>
      </div>
    </Field>
  );
}


function Toast({ msg, type }) {
  if (!msg) return null;
  return (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, padding:"14px 20px",
      borderRadius:14, fontWeight:700, fontSize:14,
      background:type==="error"?"rgba(239,68,68,.95)":"rgba(0,196,140,.95)",
      color:"#fff", boxShadow:"0 12px 32px rgba(0,0,0,.4)",
      animation:"slideUp .3s ease" }}>
      {type==="error"?"❌":"✅"} {msg}
    </div>
  );
}

// ── Stats Card ────────────────────────────────────────
function StatCard({ icon, label, value, color = G }) {
  return (
    <div style={{ borderRadius:18, border:"1px solid rgba(255,255,255,.08)", background:"#141823",
      padding:"20px 24px", display:"flex", alignItems:"center", gap:16 }}>
      <div style={{ width:52, height:52, borderRadius:14, display:"grid", placeItems:"center",
        background:`${color}18`, fontSize:26 }}>{icon}</div>
      <div>
        <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:28, fontWeight:800,
          color, lineHeight:1 }}>{value}</div>
        <div style={{ fontSize:13, color:"rgba(255,255,255,.45)", marginTop:4 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Confirm Delete Dialog ─────────────────────────────
function ConfirmDialog({ msg, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:800, background:"rgba(4,5,9,.85)",
      backdropFilter:"blur(10px)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:"min(420px,90%)", borderRadius:22, border:"1px solid rgba(255,255,255,.12)",
        background:"rgba(16,18,28,.98)", padding:28, boxShadow:"0 24px 60px rgba(0,0,0,.5)" }}>
        <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>⚠️ Confirm Delete</div>
        <p style={{ color:"rgba(255,255,255,.6)", fontSize:14, lineHeight:1.7, margin:"0 0 24px" }}>{msg}</p>
        <div style={{ display:"flex", gap:10 }}>
          <Btn onClick={onConfirm} color="rgba(239,68,68,.9)" textColor="#fff">🗑️ Futa</Btn>
          <Btn onClick={onCancel} color="rgba(255,255,255,.08)" textColor="#fff">Acha</Btn>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// TIPS MANAGER
// ══════════════════════════════════════════════════════
function TipsManager() {
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({ type:"article", badge:"Android", title:"", summary:"", content:"", thumb:"📱", tags:"", readTime:"5 min", platform:"youtube", embedUrl:"", channel:"", channelImg:"🎙️", duration:"" });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast,   setToast]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [tab,     setTab]     = useState("article");

  const db = getFirebaseDb();
  const toast_ = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const loadDocs = useCallback(async () => {
    if (!db) return;
    const snap = await getDocs(query(collection(db,"tips"), orderBy("createdAt","desc")));
    setDocs(snap.docs.map(d=>({id:d.id,...d.data()})));
  }, [db]);

  useEffect(() => {
    const t = setTimeout(loadDocs, 0);
    return () => clearTimeout(t);
  }, [loadDocs]);

  const save = async () => {
    if (!form.title.trim()) { toast_("Weka title kwanza","error"); return; }
    setLoading(true);
    try {
      const data = { ...form, tags: form.tags.split(",").map(t=>t.trim()).filter(Boolean), views:0, createdAt: serverTimestamp() };
      if (editing) { await updateDoc(doc(db,"tips",editing), {...data, createdAt:undefined}); toast_("Imesahihishwa!"); }
      else          { await addDoc(collection(db,"tips"), data); toast_("Imewekwa live!"); }
      setForm({ type:"article", badge:"Android", title:"", summary:"", content:"", thumb:"📱", tags:"", readTime:"5 min", platform:"youtube", embedUrl:"", channel:"", channelImg:"🎙️", duration:"" });
      setEditing(null); loadDocs();
    } catch(e) { toast_(e.message,"error"); }
    setLoading(false);
  };

  const del = async (id) => {
    setConfirm({ msg:"Una uhakika unataka kufuta post hii? Haiwezi kurejeshwa.", onConfirm: async()=>{ await deleteDoc(doc(db,"tips",id)); setConfirm(null); loadDocs(); toast_("Imefutwa"); }, onCancel:()=>setConfirm(null) });
  };

  const edit = (item) => { setEditing(item.id); setForm({...item, tags:(item.tags||[]).join(", ")}); setTab(item.type||"article"); window.scrollTo({top:0,behavior:"smooth"}); };

  return (
    <div>
      {toast   && <Toast msg={toast.msg} type={toast.type}/>}
      {confirm && <ConfirmDialog {...confirm}/>}

      {/* Form */}
      <div style={{ borderRadius:20, border:"1px solid rgba(255,255,255,.08)", background:"#141823", padding:24, marginBottom:28 }}>
        <h3 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:20, margin:"0 0 20px" }}>
          {editing ? "✏️ Hariri Post" : "➕ Ongeza Post Mpya"}
        </h3>

        {/* Type tabs */}
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          {["article","video"].map(t=>(
            <button key={t} onClick={()=>{setTab(t);setForm(f=>({...f,type:t}));}}
              style={{ border:"none", borderRadius:10, padding:"9px 18px", cursor:"pointer", fontWeight:800, fontSize:13,
                background:tab===t?`linear-gradient(135deg,${G},${G2})`:"rgba(255,255,255,.06)", color:tab===t?"#111":"rgba(255,255,255,.6)" }}>
              {t==="article"?"📝 Article":"🎬 Video"}
            </button>
          ))}
        </div>

        <div style={{ display:"grid", gap:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <Field label="Badge (Android / AI / PC etc)">
              <Input value={form.badge} onChange={e=>setForm(f=>({...f,badge:e.target.value}))} placeholder="Android"/>
            </Field>
            <Field label="Emoji / Thumb">
              <Input value={form.thumb} onChange={e=>setForm(f=>({...f,thumb:e.target.value}))} placeholder="📱"/>
            </Field>
          </div>
          <ImageUpload value={form.thumbImg||""} onChange={v=>setForm(f=>({...f,thumbImg:v}))} label="Thumbnail Image (optional)"/>

          <Field label="Title *">
            <Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Andika title ya post hapa..."/>
          </Field>

          <Field label="Summary (maelezo mafupi)">
            <Textarea value={form.summary} onChange={e=>setForm(f=>({...f,summary:e.target.value}))} placeholder="Maelezo mafupi yanayoonekana kwenye card..." style={{minHeight:70}}/>
          </Field>

          {tab==="article" && <>
            <Field label="Content kamili (maudhui yote ya article)">
              <Textarea value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder="Andika content yote ya article hapa. Unaweza kutumia line breaks..." style={{minHeight:180}}/>
            </Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <Field label="Read time">
                <Input value={form.readTime} onChange={e=>setForm(f=>({...f,readTime:e.target.value}))} placeholder="5 min"/>
              </Field>
              <Field label="Tags (tenganisha kwa comma)">
                <Input value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="#android, #speed, #tips"/>
              </Field>
            </div>
          </>}

          {tab==="video" && <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <Field label="Platform">
                <Select value={form.platform} onChange={e=>setForm(f=>({...f,platform:e.target.value}))}>
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                </Select>
              </Field>
              <Field label="Duration (e.g. 12:30)">
                <Input value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))} placeholder="12:30"/>
              </Field>
            </div>
            <Field label="YouTube/TikTok Embed URL">
              <Input value={form.embedUrl} onChange={e=>setForm(f=>({...f,embedUrl:e.target.value}))} placeholder="https://www.youtube.com/embed/VIDEO_ID"/>
            </Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <Field label="Channel Name">
                <Input value={form.channel} onChange={e=>setForm(f=>({...f,channel:e.target.value}))} placeholder="TechKe Tanzania"/>
              </Field>
              <Field label="Channel Emoji/Icon">
                <Input value={form.channelImg} onChange={e=>setForm(f=>({...f,channelImg:e.target.value}))} placeholder="🎙️"/>
              </Field>
            </div>
          </>}

          <div style={{ display:"flex", gap:10 }}>
            <Btn onClick={save} disabled={loading}>{loading?"Inahifadhi...":editing?"💾 Hifadhi Mabadiliko":"🚀 Weka Live"}</Btn>
            {editing && <Btn onClick={()=>{setEditing(null);setForm({type:"article",badge:"Android",title:"",summary:"",content:"",thumb:"📱",tags:"",readTime:"5 min",platform:"youtube",embedUrl:"",channel:"",channelImg:"🎙️",duration:""});}} color="rgba(255,255,255,.08)" textColor="#fff">✕ Acha</Btn>}
          </div>
        </div>
      </div>

      {/* Posts list */}
      <div style={{ display:"grid", gap:12 }}>
        {docs.length===0 && <div style={{ textAlign:"center", padding:40, color:"rgba(255,255,255,.35)", fontSize:15 }}>Hakuna posts bado. Ongeza ya kwanza! 👆</div>}
        {docs.map(item=>(
          <div key={item.id} style={{ borderRadius:16, border:"1px solid rgba(255,255,255,.07)", background:"#1a1d2e", padding:"16px 20px", display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ fontSize:32, flexShrink:0 }}>{item.thumb||"📝"}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4, flexWrap:"wrap" }}>
                <span style={{ fontSize:11, fontWeight:800, padding:"3px 8px", borderRadius:6, background:"rgba(245,166,35,.15)", color:G }}>{item.badge}</span>
                <span style={{ fontSize:11, padding:"3px 8px", borderRadius:6, background:"rgba(255,255,255,.06)", color:"rgba(255,255,255,.5)" }}>{item.type==="video"?"🎬 Video":"📝 Article"}</span>
                <span style={{ fontSize:12, color:"rgba(255,255,255,.35)" }}>{timeAgo(item.createdAt)}</span>
              </div>
              <div style={{ fontWeight:800, fontSize:15, marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.title}</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,.4)" }}>👁 {fmtViews(item.views)} views</div>
            </div>
            <div style={{ display:"flex", gap:8, flexShrink:0 }}>
              <Btn onClick={()=>edit(item)} color="rgba(245,166,35,.12)" textColor={G} style={{padding:"8px 14px"}}>✏️ Hariri</Btn>
              <Btn onClick={()=>del(item.id)} color="rgba(239,68,68,.12)" textColor="#fca5a5" style={{padding:"8px 14px"}}>🗑️</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// UPDATES MANAGER
// ══════════════════════════════════════════════════════
function UpdatesManager() {
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({ type:"article", badge:"AI", category:"Artificial Intelligence", title:"", summary:"", content:"", thumb:"🧠", source:"", platform:"youtube", embedUrl:"", channel:"", channelImg:"🔥", duration:"" });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast,   setToast]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [tab,     setTab]     = useState("article");

  const db = getFirebaseDb();
  const toast_ = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const loadDocs = useCallback(async () => {
    if (!db) return;
    const snap = await getDocs(query(collection(db,"updates"), orderBy("createdAt","desc")));
    setDocs(snap.docs.map(d=>({id:d.id,...d.data()})));
  }, [db]);

  useEffect(() => {
    const t = setTimeout(loadDocs, 0);
    return () => clearTimeout(t);
  }, [loadDocs]);

  const save = async () => {
    if (!form.title.trim()) { toast_("Weka title kwanza","error"); return; }
    setLoading(true);
    try {
      const data = { ...form, views:0, createdAt: serverTimestamp() };
      if (editing) { await updateDoc(doc(db,"updates",editing), {...data,createdAt:undefined}); toast_("Imesahihishwa!"); }
      else          { await addDoc(collection(db,"updates"), data); toast_("Imewekwa live!"); }
      setForm({ type:"article", badge:"AI", category:"Artificial Intelligence", title:"", summary:"", content:"", thumb:"🧠", source:"", platform:"youtube", embedUrl:"", channel:"", channelImg:"🔥", duration:"" });
      setEditing(null); loadDocs();
    } catch(e) { toast_(e.message,"error"); }
    setLoading(false);
  };

  const del = async (id) => {
    setConfirm({ msg:"Una uhakika unataka kufuta habari hii?", onConfirm:async()=>{ await deleteDoc(doc(db,"updates",id)); setConfirm(null); loadDocs(); toast_("Imefutwa"); }, onCancel:()=>setConfirm(null) });
  };

  const edit = (item) => { setEditing(item.id); setForm({...item}); setTab(item.type||"article"); window.scrollTo({top:0,behavior:"smooth"}); };

  return (
    <div>
      {toast   && <Toast msg={toast.msg} type={toast.type}/>}
      {confirm && <ConfirmDialog {...confirm}/>}

      <div style={{ borderRadius:20, border:"1px solid rgba(255,255,255,.08)", background:"#141823", padding:24, marginBottom:28 }}>
        <h3 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:20, margin:"0 0 20px" }}>
          {editing ? "✏️ Hariri Habari" : "➕ Ongeza Habari Mpya"}
        </h3>
        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          {["article","video"].map(t=>(
            <button key={t} onClick={()=>{setTab(t);setForm(f=>({...f,type:t}));}}
              style={{ border:"none", borderRadius:10, padding:"9px 18px", cursor:"pointer", fontWeight:800, fontSize:13,
                background:tab===t?`linear-gradient(135deg,${G},${G2})`:"rgba(255,255,255,.06)", color:tab===t?"#111":"rgba(255,255,255,.6)" }}>
              {t==="article"?"📰 Article/Habari":"🎬 Video"}
            </button>
          ))}
        </div>

        <div style={{ display:"grid", gap:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
            <Field label="Badge (AI / Android / Africa etc)">
              <Input value={form.badge} onChange={e=>setForm(f=>({...f,badge:e.target.value}))} placeholder="AI"/>
            </Field>
            <Field label="Category">
              <Input value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} placeholder="Artificial Intelligence"/>
            </Field>
            <Field label="Thumb Emoji (au weka URL chini)">
              <Input value={form.thumb} onChange={e=>setForm(f=>({...f,thumb:e.target.value}))} placeholder="🧠"/>
            </Field>
          </div>
          <Field label="Thumb Image URL (optional — badala ya emoji)">
          <ImageUpload value={form.thumbImg||""} onChange={v=>setForm(f=>({...f,thumbImg:v}))} label="Thumbnail Image (optional)"/>

          <Field label="Title *">
            <Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Habari title..."/>
          </Field>
          <Field label="Summary">
            <Textarea value={form.summary} onChange={e=>setForm(f=>({...f,summary:e.target.value}))} placeholder="Maelezo mafupi ya habari..." style={{minHeight:70}}/>
          </Field>

          {tab==="article" && <>
            <Field label="Content kamili">
              <Textarea value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder="Maelezo yote ya habari hii..." style={{minHeight:180}}/>
            </Field>
            <Field label="Source (TechCrunch, GSMArena etc)">
              <Input value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))} placeholder="TechCrunch"/>
            </Field>
          </>}

          {tab==="video" && <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <Field label="Platform">
                <Select value={form.platform} onChange={e=>setForm(f=>({...f,platform:e.target.value}))}>
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                </Select>
              </Field>
              <Field label="Duration">
                <Input value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))} placeholder="8:42"/>
              </Field>
            </div>
            <Field label="Embed URL">
              <Input value={form.embedUrl} onChange={e=>setForm(f=>({...f,embedUrl:e.target.value}))} placeholder="https://www.youtube.com/embed/VIDEO_ID"/>
            </Field>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <Field label="Channel Name">
                <Input value={form.channel} onChange={e=>setForm(f=>({...f,channel:e.target.value}))} placeholder="Fireship"/>
              </Field>
              <Field label="Channel Emoji">
                <Input value={form.channelImg} onChange={e=>setForm(f=>({...f,channelImg:e.target.value}))} placeholder="🔥"/>
              </Field>
            </div>
          </>}

          <div style={{ display:"flex", gap:10 }}>
            <Btn onClick={save} disabled={loading}>{loading?"Inahifadhi...":editing?"💾 Hifadhi":"🚀 Weka Live"}</Btn>
            {editing && <Btn onClick={()=>{setEditing(null);setForm({type:"article",badge:"AI",category:"Artificial Intelligence",title:"",summary:"",content:"",thumb:"🧠",source:"",platform:"youtube",embedUrl:"",channel:"",channelImg:"🔥",duration:""});}} color="rgba(255,255,255,.08)" textColor="#fff">✕ Acha</Btn>}
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gap:12 }}>
        {docs.length===0 && <div style={{ textAlign:"center", padding:40, color:"rgba(255,255,255,.35)", fontSize:15 }}>Hakuna habari bado. Ongeza ya kwanza! 👆</div>}
        {docs.map(item=>(
          <div key={item.id} style={{ borderRadius:16, border:"1px solid rgba(255,255,255,.07)", background:"#1a1d2e", padding:"16px 20px", display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ fontSize:30, flexShrink:0 }}>{item.thumb}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                <span style={{ fontSize:11, fontWeight:800, padding:"3px 8px", borderRadius:6, background:"rgba(245,166,35,.15)", color:G }}>{item.badge}</span>
                <span style={{ fontSize:11, color:"rgba(255,255,255,.35)" }}>{timeAgo(item.createdAt)}</span>
              </div>
              <div style={{ fontWeight:800, fontSize:15, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.title}</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,.4)" }}>👁 {fmtViews(item.views)} views {item.source?`· via ${item.source}`:""}</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn onClick={()=>edit(item)} color="rgba(245,166,35,.12)" textColor={G} style={{padding:"8px 14px"}}>✏️</Btn>
              <Btn onClick={()=>del(item.id)} color="rgba(239,68,68,.12)" textColor="#fca5a5" style={{padding:"8px 14px"}}>🗑️</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// DEALS MANAGER
// ══════════════════════════════════════════════════════
function DealsManager() {
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({ icon:"🎨", name:"", domain:"", url:"", bg:"linear-gradient(135deg,#00c4cc,#7d2ae8)", badge:"", bt:"gold", meta:"", desc:"", oldP:"", newP:"", save:"", code:"", ref:false, active:true });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast,   setToast]   = useState(null);
  const [confirm, setConfirm] = useState(null);

  const db = getFirebaseDb();
  const toast_ = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const loadDocs = useCallback(async () => {
    if (!db) return;
    const snap = await getDocs(query(collection(db,"deals"), orderBy("createdAt","desc")));
    setDocs(snap.docs.map(d=>({id:d.id,...d.data()})));
  }, [db]);

  useEffect(() => {
    const t = setTimeout(loadDocs, 0);
    return () => clearTimeout(t);
  }, [loadDocs]);

  const save = async () => {
    if (!form.name.trim()||!form.url.trim()) { toast_("Weka jina na URL kwanza","error"); return; }
    setLoading(true);
    try {
      const data = { ...form, createdAt: serverTimestamp() };
      if (editing) { await updateDoc(doc(db,"deals",editing), {...data,createdAt:undefined}); toast_("Imesahihishwa!"); }
      else          { await addDoc(collection(db,"deals"), data); toast_("Deal imewekwa live!"); }
      setForm({ icon:"🎨", name:"", domain:"", url:"", bg:"linear-gradient(135deg,#00c4cc,#7d2ae8)", badge:"", bt:"gold", meta:"", desc:"", oldP:"", newP:"", save:"", code:"", ref:false, active:true });
      setEditing(null); loadDocs();
    } catch(e) { toast_(e.message,"error"); }
    setLoading(false);
  };

  const del = async (id) => {
    setConfirm({
      msg: "Una uhakika unataka kufuta deal hii? Hatua hii haiwezi kurejeshwa.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "deals", id));
          setConfirm(null);
          loadDocs();
          toast_("Deal imefutwa");
        } catch (e) {
          toast_(e.message, "error");
        }
      },
      onCancel: () => setConfirm(null)
    });
  };

  const toggle = async (item) => {
    await updateDoc(doc(db,"deals",item.id), { active:!item.active });
    loadDocs();
  };

  return (
    <div>
      {toast   && <Toast msg={toast.msg} type={toast.type}/>}
      {confirm && <ConfirmDialog {...confirm}/>}

      <div style={{ borderRadius:20, border:"1px solid rgba(255,255,255,.08)", background:"#141823", padding:24, marginBottom:28 }}>
        <h3 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:20, margin:"0 0 20px" }}>
          {editing?"✏️ Hariri Deal":"➕ Ongeza Deal Mpya"}
        </h3>
        <div style={{ display:"grid", gap:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"60px 1fr 1fr", gap:16 }}>
            <Field label="Icon"><Input value={form.icon} onChange={e=>setForm(f=>({...f,icon:e.target.value}))} placeholder="🎨"/></Field>
            <Field label="Jina la Deal *"><Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Canva Pro"/></Field>
            <Field label="Domain"><Input value={form.domain} onChange={e=>setForm(f=>({...f,domain:e.target.value}))} placeholder="canva.com"/></Field>
          </div>
          <Field label="URL ya Affiliate Link *"><Input value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))} placeholder="https://canva.com/affiliates/..."/></Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <Field label="Badge Text"><Input value={form.badge} onChange={e=>setForm(f=>({...f,badge:e.target.value}))} placeholder="-60%"/></Field>
            <Field label="Badge Color">
              <Select value={form.bt} onChange={e=>setForm(f=>({...f,bt:e.target.value}))}>
                <option value="gold">Gold</option><option value="blue">Blue</option>
                <option value="red">Red</option><option value="purple">Purple</option><option value="gray">Gray</option>
              </Select>
            </Field>
          </div>
          <Field label="Meta (Partner deal · Promo code)"><Input value={form.meta} onChange={e=>setForm(f=>({...f,meta:e.target.value}))} placeholder="Partner deal · Promo code"/></Field>
          <Field label="Maelezo"><Textarea value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="Maelezo ya deal hii..." style={{minHeight:80}}/></Field>

          {/* Referral toggle */}
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontSize:14, fontWeight:700 }}>
              <input type="checkbox" checked={form.ref} onChange={e=>setForm(f=>({...f,ref:e.target.checked}))} style={{ width:18, height:18, accentColor:G }}/>
              Referral link tu (hakuna promo code)
            </label>
          </div>

          {!form.ref && <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              <Field label="Bei ya zamani"><Input value={form.oldP} onChange={e=>setForm(f=>({...f,oldP:e.target.value}))} placeholder="$15/mo"/></Field>
              <Field label="Bei mpya"><Input value={form.newP} onChange={e=>setForm(f=>({...f,newP:e.target.value}))} placeholder="$6/mo"/></Field>
              <Field label="Save text"><Input value={form.save} onChange={e=>setForm(f=>({...f,save:e.target.value}))} placeholder="Save 60%"/></Field>
            </div>
            <Field label="Promo Code (optional)"><Input value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value}))} placeholder="STEA60"/></Field>
          </>}

          <Field label="Background Gradient">
            <Input value={form.bg} onChange={e=>setForm(f=>({...f,bg:e.target.value}))} placeholder="linear-gradient(135deg,#00c4cc,#7d2ae8)"/>
          </Field>

          <Btn onClick={save} disabled={loading}>{loading?"Inahifadhi...":editing?"💾 Hifadhi":"🚀 Weka Live"}</Btn>
        </div>
      </div>

      <div style={{ display:"grid", gap:12 }}>
        {docs.length===0 && <div style={{ textAlign:"center", padding:40, color:"rgba(255,255,255,.35)" }}>Hakuna deals bado. Ongeza ya kwanza! 👆</div>}
        {docs.map(item=>(
          <div key={item.id} style={{ borderRadius:16, border:`1px solid ${item.active?"rgba(255,255,255,.07)":"rgba(239,68,68,.2)"}`, background:item.active?"#1a1d2e":"rgba(239,68,68,.05)", padding:"14px 18px", display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ fontSize:28 }}>{item.icon}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:800, fontSize:15 }}>{item.name}</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,.4)" }}>{item.domain} · {item.code?"Code: "+item.code:"Referral"}</div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button onClick={()=>toggle(item)} style={{ border:`1px solid ${item.active?"rgba(0,196,140,.3)":"rgba(239,68,68,.3)"}`, borderRadius:10, padding:"6px 12px", background:item.active?"rgba(0,196,140,.1)":"rgba(239,68,68,.1)", color:item.active?"#67f0c1":"#fca5a5", cursor:"pointer", fontWeight:700, fontSize:12 }}>
                {item.active?"✅ Live":"⏸ Paused"}
              </button>
              <Btn onClick={()=>{setEditing(item.id);setForm({...item});window.scrollTo({top:0,behavior:"smooth"});}} color="rgba(245,166,35,.12)" textColor={G} style={{padding:"8px 14px"}}>✏️</Btn>
              <Btn onClick={()=>del(item.id)} color="rgba(239,68,68,.12)" textColor="#fca5a5" style={{padding:"8px 14px"}}>🗑️</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// COURSES MANAGER
// ══════════════════════════════════════════════════════
function CoursesManager() {
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({ emoji:"💻", title:"", desc:"", free:true, price:"Bure · Start now", cta:"Anza Sasa →", lessons:"", whatsapp:"https://wa.me/8619715852043", accent:"" });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast,   setToast]   = useState(null);
  const [confirm, setConfirm] = useState(null);

  const db = getFirebaseDb();
  const toast_ = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const loadDocs = useCallback(async () => {
    if (!db) return;
    const snap = await getDocs(query(collection(db,"courses"), orderBy("createdAt","desc")));
    setDocs(snap.docs.map(d=>({id:d.id,...d.data()})));
  }, [db]);

  useEffect(() => {
    const t = setTimeout(loadDocs, 0);
    return () => clearTimeout(t);
  }, [loadDocs]);

  const save = async () => {
    if (!form.title.trim()) { toast_("Weka title kwanza","error"); return; }
    setLoading(true);
    try {
      const data = { ...form, lessons: form.lessons.split("\n").map(l=>l.trim()).filter(Boolean), createdAt: serverTimestamp() };
      if (editing) { await updateDoc(doc(db,"courses",editing), {...data,createdAt:undefined}); toast_("Imesahihishwa!"); }
      else          { await addDoc(collection(db,"courses"), data); toast_("Kozi imewekwa live!"); }
      setForm({ emoji:"💻", title:"", desc:"", free:true, price:"Bure · Start now", cta:"Anza Sasa →", lessons:"", whatsapp:"https://wa.me/8619715852043", accent:"" });
      setEditing(null); loadDocs();
    } catch(e) { toast_(e.message,"error"); }
    setLoading(false);
  };

  const del = async (id) => {
    setConfirm({
      msg: "Una uhakika unataka kufuta kozi hii? Wanafunzi waliojiunga wataathirika.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "courses", id));
          setConfirm(null);
          loadDocs();
          toast_("Kozi imefutwa");
        } catch (e) {
          toast_(e.message, "error");
        }
      },
      onCancel: () => setConfirm(null)
    });
  };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type}/>}
      {confirm && <ConfirmDialog {...confirm}/>}
      <div style={{ borderRadius:20, border:"1px solid rgba(255,255,255,.08)", background:"#141823", padding:24, marginBottom:28 }}>
        <h3 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:20, margin:"0 0 20px" }}>
          {editing?"✏️ Hariri Kozi":"➕ Ongeza Kozi Mpya"}
        </h3>
        <div style={{ display:"grid", gap:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"80px 1fr", gap:16 }}>
            <Field label="Emoji"><Input value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))} placeholder="💻"/></Field>
            <Field label="Title *"><Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Web Development"/></Field>
          </div>
          <Field label="Maelezo"><Textarea value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="Maelezo ya kozi..." style={{minHeight:80}}/></Field>

          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontSize:14, fontWeight:700 }}>
              <input type="checkbox" checked={form.free} onChange={e=>setForm(f=>({...f,free:e.target.checked,price:e.target.checked?"Bure · Start now":"TZS 5,000/mwezi · M-Pesa"}))} style={{ width:18, height:18, accentColor:G }}/>
              Kozi ya bure
            </label>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <Field label="Price text"><Input value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="TZS 5,000/mwezi · M-Pesa"/></Field>
            <Field label="CTA Button text"><Input value={form.cta} onChange={e=>setForm(f=>({...f,cta:e.target.value}))} placeholder="Jiunge Leo"/></Field>
          </div>

          <Field label="WhatsApp Link (mtu akibonyeza CTA)">
            <Input value={form.whatsapp} onChange={e=>setForm(f=>({...f,whatsapp:e.target.value}))} placeholder="https://wa.me/8619715852043?text=Nataka+kujiunga+na+kozi..."/>
          </Field>

          <Field label="Lessons (kila lesson kwenye line mpya)">
            <Textarea value={form.lessons} onChange={e=>setForm(f=>({...f,lessons:e.target.value}))} placeholder={"HTML + CSS foundation\nResponsive layouts\nGitHub Pages deployment"} style={{minHeight:120}}/>
          </Field>

          <Btn onClick={save} disabled={loading}>{loading?"Inahifadhi...":editing?"💾 Hifadhi":"🚀 Weka Live"}</Btn>
        </div>
      </div>

      <div style={{ display:"grid", gap:12 }}>
        {docs.length===0 && <div style={{ textAlign:"center", padding:40, color:"rgba(255,255,255,.35)" }}>Hakuna kozi bado. Ongeza ya kwanza! 👆</div>}
        {docs.map(item=>(
          <div key={item.id} style={{ borderRadius:16, border:"1px solid rgba(255,255,255,.07)", background:"#1a1d2e", padding:"14px 18px", display:"flex", gap:12, alignItems:"center" }}>
            <div style={{ fontSize:32 }}>{item.emoji}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:15, marginBottom:2 }}>{item.title}</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,.4)" }}>{item.free?"🆓 Bure":"⭐ Paid"} · {item.price} · {(item.lessons||[]).length} lessons</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn onClick={()=>{setEditing(item.id);setForm({...item,lessons:(item.lessons||[]).join("\n")});window.scrollTo({top:0,behavior:"smooth"});}} color="rgba(245,166,35,.12)" textColor={G} style={{padding:"8px 14px"}}>✏️</Btn>
              <Btn onClick={()=>del(item.id)} color="rgba(239,68,68,.12)" textColor="#fca5a5" style={{padding:"8px 14px"}}>🗑️</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// PRODUCTS MANAGER
// ══════════════════════════════════════════════════════
function ProductsManager() {
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({ name: "", description: "", price: "", oldPrice: "", icon: "🎧", badge: "", url: "", category: "Electronics" });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const db = getFirebaseDb();
  const toast_ = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const loadDocs = useCallback(async () => {
    if (!db) return;
    const snap = await getDocs(query(collection(db, "products"), orderBy("createdAt", "desc")));
    setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, [db]);

  useEffect(() => {
    const t = setTimeout(loadDocs, 0);
    return () => clearTimeout(t);
  }, [loadDocs]);

  const save = async () => {
    if (!form.name.trim() || !form.price.trim() || !form.url.trim()) { toast_("Weka jina, bei na URL", "error"); return; }
    setLoading(true);
    try {
      const data = { ...form, createdAt: serverTimestamp() };
      if (editing) { await updateDoc(doc(db, "products", editing), { ...data, createdAt: undefined }); toast_("Imesahihishwa!"); }
      else { await addDoc(collection(db, "products"), data); toast_("Bidhaa imewekwa live!"); }
      setForm({ name: "", description: "", price: "", oldPrice: "", icon: "🎧", badge: "", url: "", category: "Electronics" });
      setEditing(null); loadDocs();
    } catch (e) { toast_(e.message, "error"); }
    setLoading(false);
  };

  const del = async (id) => {
    setConfirm({
      msg: "Una uhakika unataka kufuta bidhaa hii?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "products", id));
          setConfirm(null);
          loadDocs();
          toast_("Bidhaa imefutwa");
        } catch (e) {
          toast_(e.message, "error");
        }
      },
      onCancel: () => setConfirm(null)
    });
  };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {confirm && <ConfirmDialog {...confirm} />}
      <div style={{ borderRadius: 20, border: "1px solid rgba(255,255,255,.08)", background: "#141823", padding: 24, marginBottom: 28 }}>
        <h3 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 20, margin: "0 0 20px" }}>
          {editing ? "✏️ Hariri Bidhaa" : "➕ Ongeza Bidhaa Mpya"}
        </h3>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 16 }}>
            <Field label="Icon"><Input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="🎧" /></Field>
            <Field label="Jina la Bidhaa *"><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Sony WH-1000XM4" /></Field>
            <Field label="Category"><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Electronics" /></Field>
          </div>
          <Field label="Maelezo"><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Maelezo ya bidhaa..." style={{ minHeight: 80 }} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Field label="Bei ya Sasa *"><Input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="TZS 850,000" /></Field>
            <Field label="Bei ya Zamani"><Input value={form.oldPrice} onChange={e => setForm(f => ({ ...f, oldPrice: e.target.value }))} placeholder="TZS 950,000" /></Field>
            <Field label="Badge (e.g. New)"><Input value={form.badge} onChange={e => setForm(f => ({ ...f, badge: e.target.value }))} placeholder="HOT" /></Field>
          </div>
          <Field label="Affiliate URL *"><Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://amazon.com/..." /></Field>
          <Btn onClick={save} disabled={loading}>{loading ? "Inahifadhi..." : editing ? "💾 Hifadhi" : "🚀 Weka Live"}</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {docs.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,.35)" }}>Hakuna bidhaa bado. Ongeza ya kwanza! 👆</div>}
        {docs.map(item => (
          <div key={item.id} style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,.07)", background: "#1a1d2e", padding: "14px 18px", display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ fontSize: 32 }}>{item.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{item.name}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)" }}>{item.category} · {item.price}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => { setEditing(item.id); setForm({ ...item }); window.scrollTo({ top: 0, behavior: "smooth" }); }} color="rgba(245,166,35,.12)" textColor={G} style={{ padding: "8px 14px" }}>✏️</Btn>
              <Btn onClick={() => del(item.id)} color="rgba(239,68,68,.12)" textColor="#fca5a5" style={{ padding: "8px 14px" }}>🗑️</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// WEBSITES MANAGER
// ══════════════════════════════════════════════════════
function WebsitesManager() {
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({ name: "", url: "", description: "", icon: "🌐", bg: "linear-gradient(135deg,#667eea,#764ba2)", meta: "Free Tool", tags: "" });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const db = getFirebaseDb();
  const toast_ = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const loadDocs = useCallback(async () => {
    if (!db) return;
    const snap = await getDocs(query(collection(db, "websites"), orderBy("createdAt", "desc")));
    setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, [db]);

  useEffect(() => {
    const t = setTimeout(loadDocs, 0);
    return () => clearTimeout(t);
  }, [loadDocs]);

  const save = async () => {
    if (!form.name.trim() || !form.url.trim()) { toast_("Weka jina na URL", "error"); return; }
    setLoading(true);
    try {
      const data = { ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean), createdAt: serverTimestamp() };
      if (editing) { await updateDoc(doc(db, "websites", editing), { ...data, createdAt: undefined }); toast_("Imesahihishwa!"); }
      else { await addDoc(collection(db, "websites"), data); toast_("Website imewekwa live!"); }
      setForm({ name: "", url: "", description: "", icon: "🌐", bg: "linear-gradient(135deg,#667eea,#764ba2)", meta: "Free Tool", tags: "" });
      setEditing(null); loadDocs();
    } catch (e) { toast_(e.message, "error"); }
    setLoading(false);
  };

  const del = async (id) => {
    setConfirm({
      msg: "Una uhakika unataka kufuta website hii?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "websites", id));
          setConfirm(null);
          loadDocs();
          toast_("Website imefutwa");
        } catch (e) {
          toast_(e.message, "error");
        }
      },
      onCancel: () => setConfirm(null)
    });
  };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {confirm && <ConfirmDialog {...confirm} />}
      <div style={{ borderRadius: 20, border: "1px solid rgba(255,255,255,.08)", background: "#141823", padding: 24, marginBottom: 28 }}>
        <h3 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 20, margin: "0 0 20px" }}>
          {editing ? "✏️ Hariri Website" : "➕ Ongeza Website Mpya"}
        </h3>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 16 }}>
            <Field label="Icon"><Input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="🌐" /></Field>
            <Field label="Jina la Website *"><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Remove.bg" /></Field>
          </div>
          <Field label="URL *"><Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://remove.bg" /></Field>
          <Field label="Maelezo"><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Maelezo mafupi..." style={{ minHeight: 80 }} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Meta Info"><Input value={form.meta} onChange={e => setForm(f => ({ ...f, meta: e.target.value }))} placeholder="Free AI Tool" /></Field>
            <Field label="Tags (comma separated)"><Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="AI, Design, Tools" /></Field>
          </div>
          <Field label="Background Gradient"><Input value={form.bg} onChange={e => setForm(f => ({ ...f, bg: e.target.value }))} placeholder="linear-gradient(135deg,#667eea,#764ba2)" /></Field>
          <Btn onClick={save} disabled={loading}>{loading ? "Inahifadhi..." : editing ? "💾 Hifadhi" : "🚀 Weka Live"}</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {docs.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,.35)" }}>Hakuna websites bado. Ongeza ya kwanza! 👆</div>}
        {docs.map(item => (
          <div key={item.id} style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,.07)", background: "#1a1d2e", padding: "14px 18px", display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ fontSize: 32 }}>{item.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{item.name}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)" }}>{item.url}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => { setEditing(item.id); setForm({ ...item, tags: (item.tags || []).join(", ") }); window.scrollTo({ top: 0, behavior: "smooth" }); }} color="rgba(245,166,35,.12)" textColor={G} style={{ padding: "8px 14px" }}>✏️</Btn>
              <Btn onClick={() => del(item.id)} color="rgba(239,68,68,.12)" textColor="#fca5a5" style={{ padding: "8px 14px" }}>🗑️</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// USERS MANAGER
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// PROMPT LAB MANAGER
// ══════════════════════════════════════════════════════
function PromptLabManager() {
  const [docs, setDocs] = useState([]);
  const [form, setForm] = useState({
    category:"📱 Social Media", emoji:"📸", title:"", prompt:"", tags:"",
    guide:"", active:true,
  });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const db = getFirebaseDb();
  const G = "#F5A623", G2 = "#FFD17C";
  const toast_ = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const CATEGORIES = ["📱 Social Media","🤖 AI Business","📝 Content Creation","💰 Affiliate Marketing","🎓 Learning","📧 Professional"];

  useEffect(()=>{ loadDocs(); },[]);
  const loadDocs = async () => {
    if(!db) return;
    const snap = await getDocs(query(collection(db,"prompts"), orderBy("createdAt","desc")));
    setDocs(snap.docs.map(d=>({id:d.id,...d.data()})));
  };

  const save = async () => {
    if(!form.title.trim()||!form.prompt.trim()){ toast_("Weka title na prompt kwanza","error"); return; }
    setLoading(true);
    try {
      const data = {
        ...form,
        tags: form.tags.split(",").map(t=>t.trim()).filter(Boolean),
        guide: form.guide.split("
").map(g=>g.trim()).filter(Boolean),
        createdAt: serverTimestamp(),
      };
      if(editing){ await updateDoc(doc(db,"prompts",editing), {...data,createdAt:undefined}); toast_("Imesahihishwa!"); }
      else { await addDoc(collection(db,"prompts"), data); toast_("Prompt imewekwa live!"); }
      setForm({ category:"📱 Social Media", emoji:"📸", title:"", prompt:"", tags:"", guide:"", active:true });
      setEditing(null); loadDocs();
    } catch(e){ toast_(e.message,"error"); }
    setLoading(false);
  };

  const del = async (id) => {
    if(!confirm("Futa prompt hii?")) return;
    await deleteDoc(doc(db,"prompts",id)); loadDocs(); toast_("Imefutwa");
  };

  return (
    <div>
      {toast && <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,padding:"13px 18px",borderRadius:13,fontWeight:700,fontSize:14,background:toast.type==="error"?"rgba(239,68,68,.95)":"rgba(0,196,140,.95)",color:"#fff"}}>{toast.type==="error"?"❌":"✅"} {toast.msg}</div>}

      {/* Form */}
      <div style={{borderRadius:20,border:"1px solid rgba(255,255,255,.08)",background:"#141823",padding:24,marginBottom:28}}>
        <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:20,margin:"0 0 20px"}}>{editing?"✏️ Hariri Prompt":"➕ Ongeza Prompt Mpya"}</h3>
        <div style={{display:"grid",gap:16}}>

          <div style={{display:"grid",gridTemplateColumns:"60px 1fr 1fr",gap:16}}>
            <Field label="Emoji"><Input value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))} placeholder="📸"/></Field>
            <Field label="Title *"><Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Caption ya Instagram..."/></Field>
            <Field label="Category">
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{height:46,borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"#1a1d2e",color:"#fff",padding:"0 14px",outline:"none",fontFamily:"inherit",fontSize:14,width:"100%",cursor:"pointer"}}>
                {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Prompt (ndiyo maudhui ya kukopisha) *">
            <Textarea value={form.prompt} onChange={e=>setForm(f=>({...f,prompt:e.target.value}))} placeholder="Niandikia caption ya Instagram kwa biashara ya [AINA YA BIASHARA]..." style={{minHeight:140,fontFamily:"monospace",fontSize:13}}/>
          </Field>

          <Field label="Tags (tenganisha kwa comma)">
            <Input value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="Instagram, Caption, Kiswahili"/>
          </Field>

          <Field label="Step-by-step Guide (kila hatua kwenye line mpya)">
            <Textarea value={form.guide} onChange={e=>setForm(f=>({...f,guide:e.target.value}))} placeholder={"Badilisha [AINA YA BIASHARA] na biashara yako
Nakili prompt → Weka kwenye ChatGPT
Edit matokeo kulingana na brand yako"} style={{minHeight:120}}/>
          </Field>

          <div style={{display:"flex",gap:10}}>
            <Btn onClick={save} disabled={loading}>{loading?"Inahifadhi...":editing?"💾 Hifadhi":"🚀 Weka Live"}</Btn>
            {editing && <Btn onClick={()=>{setEditing(null);setForm({category:"📱 Social Media",emoji:"📸",title:"",prompt:"",tags:"",guide:"",active:true});}} color="rgba(255,255,255,.08)" textColor="#fff">✕ Acha</Btn>}
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{display:"grid",gap:10}}>
        {docs.length===0 && <div style={{textAlign:"center",padding:40,color:"rgba(255,255,255,.35)"}}>Hakuna prompts bado. Ongeza ya kwanza! 👆</div>}
        {docs.map(item=>(
          <div key={item.id} style={{borderRadius:16,border:"1px solid rgba(255,255,255,.07)",background:"#1a1d2e",padding:"14px 18px",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{fontSize:28,flexShrink:0}}>{item.emoji||"⚗️"}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:800,fontSize:14,marginBottom:2}}>{item.title}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.4)"}}>{item.category} · {(item.tags||[]).join(", ")}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.3)",marginTop:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:400}}>{item.prompt?.slice(0,80)}...</div>
            </div>
            <div style={{display:"flex",gap:8,flexShrink:0}}>
              <Btn onClick={()=>{setEditing(item.id);setForm({...item,tags:(item.tags||[]).join(", "),guide:(item.guide||[]).join("
")});window.scrollTo({top:0,behavior:"smooth"});}} color="rgba(245,166,35,.12)" textColor="#F5A623" style={{padding:"8px 14px"}}>✏️</Btn>
              <Btn onClick={()=>del(item.id)} color="rgba(239,68,68,.12)" textColor="#fca5a5" style={{padding:"8px 14px"}}>🗑️</Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function UsersManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const db = getFirebaseDb();

  const toast_ = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const loadUsers = useCallback(async () => {
    if (!db) return;
    try {
      const snap = await getDocs(collection(db, "users"));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading users:", err);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const setRole = async (uid, role) => {
    try {
      await updateDoc(doc(db, "users", uid), { role });
      setUsers(u => u.map(x => x.id === uid ? { ...x, role } : x));
      toast_(`Role imebadilishwa kuwa ${role}`);
    } catch (e) {
      toast_(e.message, "error");
    }
  };

  const delUser = async (uid) => {
    setConfirm({
      msg: "Una uhakika unataka kufuta user huyu? Data zake zote zitafutwa Firestore (lakini account yake ya Auth itabaki mpaka uifute manual).",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "users", uid));
          setConfirm(null);
          loadUsers();
          toast_("User amefutwa Firestore");
        } catch (e) {
          toast_(e.message, "error");
        }
      },
      onCancel: () => setConfirm(null)
    });
  };

  const filtered = users.filter(u =>
    (u.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {confirm && <ConfirmDialog {...confirm} />}

      <div style={{ marginBottom: 24, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tafuta user kwa jina au email..."
            style={{ paddingLeft: 44 }}
          />
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: .4 }}>🔍</span>
        </div>
        <div style={{ padding: "0 16px", height: 46, borderRadius: 12, background: "rgba(255,255,255,.05)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, border: "1px solid rgba(255,255,255,.1)" }}>
          {users.length} Users
        </div>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,.4)" }}>Inapakia users...</div> :
        filtered.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,.35)" }}>Hakuna users waliopatikana.</div> :
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map(u => (
              <div key={u.id} style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,.07)", background: "#1a1d2e", padding: "14px 18px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: u.role === "admin" ? `linear-gradient(135deg,${G},${G2})` : "rgba(255,255,255,.05)", display: "grid", placeItems: "center", color: u.role === "admin" ? "#111" : "rgba(255,255,255,.4)", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>
                  {(u.name || u.email || "U")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{u.name || "No name"}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)", wordBreak: "break-all" }}>{u.email}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.3)", marginTop: 2 }}>via {u.provider || "email"} · {timeAgo(u.createdAt)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {u.role === "admin" ? <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 8, background: "rgba(245,166,35,.15)", color: G }}>⚡ Admin</span>
                    : <Btn onClick={() => setRole(u.id, "admin")} color="rgba(245,166,35,.1)" textColor={G} style={{ padding: "6px 12px", fontSize: 12 }}>Make Admin</Btn>}
                  {u.role === "admin" && u.email !== "isayamasika100@gmail.com" &&
                    <Btn onClick={() => setRole(u.id, "user")} color="rgba(255,255,255,.06)" textColor="rgba(255,255,255,.6)" style={{ padding: "6px 12px", fontSize: 12 }}>Remove Admin</Btn>}
                  {u.email !== "isayamasika100@gmail.com" &&
                    <Btn onClick={() => delUser(u.id)} color="rgba(239,68,68,.1)" textColor="#fca5a5" style={{ padding: "10px", borderRadius: 10 }}>🗑️</Btn>
                  }
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

// ══════════════════════════════════════════════════════
// MAIN ADMIN PANEL
// ══════════════════════════════════════════════════════
export default function AdminPanel({ user, onBack }) {
  const [section, setSection] = useState("overview");
  const [counts,  setCounts]  = useState({ tips:0, updates:0, deals:0, courses:0, users:0, products:0, websites:0 });

  const db = getFirebaseDb();

  useEffect(() => {
    if (!db) return;
    const cols = ["tips","updates","deals","courses","users","products","websites"];
    Promise.all(cols.map(c=>getDocs(collection(db,c)))).then(snaps=>{
      const [tips,updates,deals,courses,users,products,websites] = snaps.map(s=>s.size);
      setCounts({tips,updates,deals,courses,users,products,websites});
    }).catch(err => {
      console.error("Error loading counts:", err);
    });
  }, [db, section]);

  const SECTIONS = [
    { id:"overview", icon:"📊", label:"Overview" },
    { id:"tips",     icon:"💡", label:"Tech Tips" },
    { id:"updates",  icon:"📰", label:"Tech Updates" },
    { id:"deals",    icon:"🏷️", label:"Deals" },
    { id:"courses",  icon:"🎓", label:"Courses" },
    { id:"products", icon:"🛒", label:"Duka" },
    { id:"websites", icon:"🌐", label:"Websites" },
    { id:"lab",      icon:"⚗️", label:"Prompt Lab" },
    { id:"users",    icon:"👥", label:"Users" },
  ];

  return (
    <div style={{ minHeight:"100vh", display:"grid", gridTemplateColumns:"240px 1fr", background:"#0a0b0f" }}>

      {/* Sidebar */}
      <div style={{ borderRight:"1px solid rgba(255,255,255,.06)", padding:"24px 16px", position:"sticky", top:0, height:"100vh", overflowY:"auto" }}>
        <div style={{ marginBottom:28 }}>
          <div style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:20, fontWeight:800, marginBottom:4 }}>⚡ Admin Panel</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,.35)" }}>SwahiliTech Elite Academy</div>
        </div>

        <div style={{ display:"grid", gap:4 }}>
          {SECTIONS.map(s=>(
            <button key={s.id} onClick={()=>setSection(s.id)}
              style={{ border:"none", borderRadius:12, padding:"11px 14px", textAlign:"left", cursor:"pointer", fontWeight:700, fontSize:14,
                background:section===s.id?`linear-gradient(135deg,${G},${G2})`:"transparent",
                color:section===s.id?"#111":"rgba(255,255,255,.65)",
                display:"flex", alignItems:"center", gap:10, transition:"all .2s" }}>
              <span style={{ fontSize:18 }}>{s.icon}</span> {s.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop:"auto", paddingTop:24 }}>
          <button onClick={onBack} style={{ border:"1px solid rgba(255,255,255,.08)", borderRadius:12, padding:"10px 14px", background:"transparent", color:"rgba(255,255,255,.5)", cursor:"pointer", fontWeight:700, fontSize:13, width:"100%", display:"flex", alignItems:"center", gap:8 }}>
            ← Rudi Website
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ padding:"28px 32px", overflowY:"auto" }}>

        {section==="overview" && (
          <div>
            <div style={{ marginBottom:28 }}>
              <h1 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:32, margin:"0 0 6px" }}>
                Karibu, <span style={{ color:G }}>{user?.displayName||"Admin"}</span> 👋
              </h1>
              <p style={{ color:"rgba(255,255,255,.45)", fontSize:15, margin:0 }}>
                Hapa unaweza kumanage content yote ya STEA — posts, deals, courses na users.
              </p>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:16, marginBottom:32 }}>
              <StatCard icon="💡" label="Tech Tips Posts" value={counts.tips}/>
              <StatCard icon="📰" label="Tech Updates" value={counts.updates} color="#56b7ff"/>
              <StatCard icon="🏷️" label="Active Deals" value={counts.deals} color="#a5b4fc"/>
              <StatCard icon="🎓" label="Courses" value={counts.courses} color="#67f0c1"/>
              <StatCard icon="🛒" label="Duka Products" value={counts.products} color="#fbbf24"/>
              <StatCard icon="🌐" label="Websites" value={counts.websites} color="#818cf8"/>
              <StatCard icon="👥" label="Users" value={counts.users} color="#ff85cf"/>
            </div>

            {/* Quick guide */}
            <div style={{ borderRadius:20, border:"1px solid rgba(245,166,35,.2)", background:"rgba(245,166,35,.06)", padding:24 }}>
              <h3 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:20, margin:"0 0 16px", color:G }}>📋 Mwongozo wa Haraka</h3>
              <div style={{ display:"grid", gap:12 }}>
                {[
                  { step:"1", title:"Ongeza Tech Tips", desc:"Nenda Tech Tips → ongeza articles za kweli kwa Kiswahili + videos za YouTube/TikTok" },
                  { step:"2", title:"Weka Habari za Tech Updates", desc:"Nenda Tech Updates → weka habari mpya za ulimwengu wa tech kila siku" },
                  { step:"3", title:"Update Deals na links za kweli", desc:"Nenda Deals → badilisha URL za dummy na affiliate links zako za kweli" },
                  { step:"4", title:"Weka WhatsApp links kwa Courses", desc:"Nenda Courses → kila kozi iweke WhatsApp link ili watu wakuwasiliane nawe" },
                ].map(g=>(
                  <div key={g.step} style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:`linear-gradient(135deg,${G},${G2})`, display:"grid", placeItems:"center", color:"#111", fontWeight:900, fontSize:13, flexShrink:0 }}>{g.step}</div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:14, marginBottom:3 }}>{g.title}</div>
                      <div style={{ fontSize:13, color:"rgba(255,255,255,.5)", lineHeight:1.6 }}>{g.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {section==="tips"    && <><h2 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:28, margin:"0 0 24px" }}>💡 Manage <span style={{color:G}}>Tech Tips</span></h2><TipsManager/></>}
        {section==="updates" && <><h2 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:28, margin:"0 0 24px" }}>📰 Manage <span style={{color:G}}>Tech Updates</span></h2><UpdatesManager/></>}
        {section==="deals"   && <><h2 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:28, margin:"0 0 24px" }}>🏷️ Manage <span style={{color:G}}>Deals</span></h2><DealsManager/></>}
        {section==="courses" && <><h2 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:28, margin:"0 0 24px" }}>🎓 Manage <span style={{color:G}}>Courses</span></h2><CoursesManager/></>}
        {section==="products" && <><h2 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:28, margin:"0 0 24px" }}>🛒 Manage <span style={{color:G}}>Duka Products</span></h2><ProductsManager/></>}
        {section==="websites" && <><h2 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:28, margin:"0 0 24px" }}>🌐 Manage <span style={{color:G}}>Websites</span></h2><WebsitesManager/></>}
        {section==="lab"     && <><h2 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:28, margin:"0 0 24px" }}>⚗️ Manage <span style={{color:G}}>Prompt Lab</span></h2><PromptLabManager/></>}
        {section==="users"   && <><h2 style={{ fontFamily:"'Bricolage Grotesque',sans-serif", fontSize:28, margin:"0 0 24px" }}>👥 Manage <span style={{color:G}}>Users</span></h2><UsersManager/></>}
      </div>

      <style>{`@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}
