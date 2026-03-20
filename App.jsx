import { useState, useEffect, useRef, useCallback, Component } from "react";
import { AlertCircle } from "lucide-react";
import { initFirebase, getFirebaseAuth, getFirebaseDb,
  GoogleAuthProvider, ADMIN_EMAIL, doc, setDoc, getDoc,
  serverTimestamp, normalizeEmail,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signOut, onAuthStateChanged, sendPasswordResetEmail
} from "./firebase.js";
import { useCollection, incrementViews, timeAgo, fmtViews } from "./hooks/useFirestore.js";
import AdminPanel from "./admin/AdminPanel.jsx";

// ── Error Boundary ───────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      let errorMsg = "Samahani, kuna tatizo limetokea kwenye mfumo.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error && parsed.error.includes("insufficient permissions")) {
          errorMsg = "Huna ruhusa ya kufanya kitendo hiki. Tafadhali wasiliana na admin.";
        }
      } catch {
        // Not a JSON error
      }
      return (
        <div style={{ padding: 40, textAlign: "center", background: "#05060a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          <AlertCircle size={64} color="#ff4444" style={{ marginBottom: 20 }} />
          <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 28, marginBottom: 12 }}>Opps! Kuna Hitilafu</h2>
          <p style={{ color: "rgba(255,255,255,.6)", maxWidth: 500, lineHeight: 1.6, marginBottom: 24 }}>{errorMsg}</p>
          <div style={{display:"flex",gap:12}}>
            <button onClick={() => window.location.reload()} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "#F5A623", color: "#111", fontWeight: 800, cursor: "pointer" }}>Jaribu Tena</button>
            <button onClick={async () => {
              try {
                const auth = getFirebaseAuth();
                if (auth) await signOut(auth);
                window.location.href = "/";
              } catch {
                window.location.href = "/";
              }
            }} style={{ padding: "12px 24px", borderRadius: 12, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Logout & Home</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Tokens ────────────────────────────────────────────
const G = "#F5A623", G2 = "#FFD17C", CB = "#141823";

// ── Nav ───────────────────────────────────────────────
const NAV = [
  { id:"home",     label:"Home" },
  { id:"tips",     label:"Tech Tips" },
  { id:"habari",   label:"Tech Updates" },
  { id:"deals",    label:"Deals" },
  { id:"courses",  label:"Courses" },
  { id:"duka",     label:"Duka" },
  { id:"websites", label:"Websites" },
  { id:"lab",      label:"⚗️ Prompt Lab" },
];

const TYPED = ["Tech Tips kwa Kiswahili 💡","Courses za Kisasa 🎓","Tanzania Electronics Hub 🛍️","Websites Bora Bure 🌐","AI & ChatGPT Mastery 🤖"];

// ── Static fallbacks (shown when Firestore is empty) ──
const FALLBACK_TIPS = [
  { id:"f1", type:"article", badge:"Android", title:"Android Hacks za kuongeza speed ya simu yako", thumb:"🚀", summary:"Settings ndogo zenye matokeo makubwa kwa battery, storage na performance ya simu yako.", readTime:"5 min", tags:["#android","#speed"], views:0, content:"Ongeza articles halisi kupitia Admin Panel!" },
  { id:"f2", type:"article", badge:"AI", title:"AI Prompts bora kwa biashara na kazi Tanzania", thumb:"🤖", summary:"Andika captions, scripts na ideas kwa kutumia AI kwa Kiswahili haraka.", readTime:"8 min", tags:["#ai","#business"], views:0, content:"Ongeza articles halisi kupitia Admin Panel!" },
  { id:"f3", type:"video", badge:"YouTube", title:"Jinsi ya kutumia ChatGPT kwa biashara yako", thumb:"▶️", channel:"TechKe Tanzania", channelImg:"🎙️", platform:"youtube", embedUrl:"https://www.youtube.com/embed/dQw4w9WgXcQ", views:0, duration:"12:30" },
];
const FALLBACK_UPDATES = [
  { id:"u1", type:"article", badge:"AI", category:"Artificial Intelligence", title:"AI tools mpya zinaingia sokoni", thumb:"🧠", summary:"Productivity, automation na content creation vinaendelea kubadilika kwa kasi.", readTime:"3 min", views:0, source:"TechCrunch" },
  { id:"u2", type:"article", badge:"Android", category:"Mobile Tech", title:"Android market inazidi kuwa strong Afrika", thumb:"📱", summary:"Simu zenye value nzuri zinaendelea kuvutia buyers wengi zaidi Afrika Mashariki.", readTime:"4 min", views:0, source:"GSMArena" },
  { id:"u3", type:"video", badge:"YouTube", title:"AI inabadilisha dunia — Hapa ndipo tulipo", thumb:"🔥", channel:"Fireship", channelImg:"🔥", platform:"youtube", embedUrl:"https://www.youtube.com/embed/dQw4w9WgXcQ", views:0, duration:"8:42" },
];
const FALLBACK_DEALS = [
  { id:"d1", icon:"🎨", name:"Canva Pro", domain:"canva.com", url:"https://canva.com", bg:"linear-gradient(135deg,#00c4cc,#7d2ae8)", badge:"-60%", bt:"gold", meta:"Partner deal · Promo code", desc:"Templates, brand kit na magic tools kwa creators.", oldP:"$15/mo", newP:"$6/mo", save:"Save 60%", code:"STEA60", active:true },
  { id:"d2", icon:"🛡️", name:"NordVPN", domain:"nordvpn.com", url:"https://nordvpn.com", bg:"linear-gradient(135deg,#1a56db,#0e9f6e)", badge:"Best Deal", bt:"blue", meta:"Affiliate + bonus months", desc:"Privacy, streaming access na speed nzuri.", oldP:"$12.99/mo", newP:"$3.19/mo", save:"75% off", code:"SAFE24", active:true },
  { id:"d3", icon:"🎞️", name:"Gamma.app", domain:"gamma.app", url:"https://gamma.app", bg:"linear-gradient(135deg,#6366f1,#8b5cf6)", badge:"Free+Pro", bt:"purple", meta:"Referral link", desc:"Tengeneza presentations kwa AI ndani ya sekunde 30.", ref:true, active:true },
];
const FALLBACK_COURSES = [
  { id:"c1", free:true, emoji:"💻", title:"Computer Basics", desc:"Kwa beginner kabisa.", lessons:["Desktop na file management","Email na internet safety","Basic productivity tools"], price:"Bure · Start now", cta:"Anza Sasa Bure →", accent:"#00C48C", whatsapp:"https://wa.me/8619715852043" },
  { id:"c2", free:false, emoji:"🤖", title:"AI & ChatGPT Mastery", desc:"Content, research, business workflows na monetization.", lessons:["Prompt systems","Business use cases","Client workflows"], price:"TZS 5,000/mwezi · M-Pesa", cta:"Jiunge Leo", whatsapp:"https://wa.me/8619715852043?text=Nataka+kujiunga+na+AI+Course" },
];
const WEBSITES = [
  { icon:"🔍", name:"Perplexity AI", url:"https://perplexity.ai", bg:"linear-gradient(135deg,#1a1a2e,#16213e)", meta:"perplexity.ai", desc:"Mbadala bora wa Google — majibu ya moja kwa moja.", tags:["✅ Bure","AI Search"] },
  { icon:"🎨", name:"Canva", url:"https://canva.com", bg:"linear-gradient(135deg,#00c4cc,#7d2ae8)", meta:"canva.com", desc:"Tengeneza logos, CVs, posters bila ujuzi wa design.", tags:["✅ Bure + Pro","Design"] },
  { icon:"🤖", name:"ChatGPT", url:"https://chatgpt.com", bg:"linear-gradient(135deg,#10a37f,#1a7f64)", meta:"chatgpt.com", desc:"AI inayojibu Kiswahili — inaandika CV, business plan.", tags:["✅ Bure + Plus","AI Assistant"] },
  { icon:"🎞️", name:"Gamma.app", url:"https://gamma.app", bg:"linear-gradient(135deg,#6366f1,#8b5cf6)", meta:"gamma.app", desc:"Tengeneza presentation nzuri kwa AI ndani ya dakika moja.", tags:["✅ Bure","Presentations"] },
  { icon:"📝", name:"Notion", url:"https://notion.so", bg:"linear-gradient(135deg,#2d2d2d,#374151)", meta:"notion.so", desc:"Notes, tasks, databases na wikis kwenye app moja.", tags:["✅ Bure","Productivity"] },
  { icon:"🎯", name:"Figma", url:"https://figma.com", bg:"linear-gradient(135deg,#f24e1e,#ff7262)", meta:"figma.com", desc:"UI design, wireframes na prototypes kwa browser.", tags:["✅ Bure","UI/UX Design"] },
];
const PRODUCTS = [
  { icon:"📱", badge:"Jumia Deal", name:"Samsung Galaxy A35", desc:"Camera, battery na storage zenye value nzuri.", price:"TZS 899,000", old:"TZS 949,000" },
  { icon:"🎧", badge:"#1 Wiki", name:"Wireless Earbuds", desc:"Compact, stylish na nzuri kwa calls na music.", price:"TZS 65,000", old:"TZS 85,000" },
  { icon:"⌚", badge:"New", name:"Smart Watch", desc:"Notifications, fitness na style wa kisasa.", price:"TZS 88,000", old:"TZS 109,000" },
];
const BS = {
  gold:{background:"rgba(245,166,35,.2)",color:G,border:"1px solid rgba(245,166,35,.3)"},
  blue:{background:"rgba(59,130,246,.2)",color:"#93c5fd",border:"1px solid rgba(59,130,246,.3)"},
  red:{background:"rgba(239,68,68,.2)",color:"#fca5a5",border:"1px solid rgba(239,68,68,.3)"},
  purple:{background:"rgba(99,102,241,.2)",color:"#a5b4fc",border:"1px solid rgba(99,102,241,.3)"},
  gray:{background:"rgba(255,255,255,.1)",color:"rgba(255,255,255,.8)",border:"1px solid rgba(255,255,255,.2)"},
};

// ════════════════════════════════════════════════════
// SHARED COMPONENTS
// ════════════════════════════════════════════════════
function LoadingScreen({done}){
  const[hide,setHide]=useState(false);
  useEffect(()=>{if(done)setTimeout(()=>setHide(true),700);},[done]);
  if(hide)return null;
  return(<div style={{position:"fixed",inset:0,zIndex:9999,background:"#05060a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",transition:"opacity .7s",opacity:done?0:1}}>
    <div style={{width:76,height:76,borderRadius:22,marginBottom:26,background:`linear-gradient(135deg,${G},${G2})`,display:"grid",placeItems:"center",animation:"logoPulse 1.5s ease-in-out infinite"}}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>
    </div>
    <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:24,fontWeight:800,letterSpacing:"-.04em",color:"#fff",marginBottom:6}}>SwahiliTech Elite Academy</div>
    <div style={{fontSize:12,color:"rgba(255,255,255,.38)",fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",marginBottom:36}}>STEA · Teknolojia kwa Kiswahili 🇹🇿</div>
    <div style={{width:180,height:3,borderRadius:99,background:"rgba(255,255,255,.07)",overflow:"hidden"}}>
      <div style={{height:"100%",borderRadius:99,background:`linear-gradient(90deg,${G},${G2})`,animation:"loadBar 2s ease-in-out forwards"}}/>
    </div>
  </div>);
}

function StarCanvas(){
  const ref=useRef(null);
  useEffect(()=>{
    const c=ref.current;if(!c)return;const ctx=c.getContext("2d");let stars=[],raf;
    const resize=()=>{c.width=c.offsetWidth;c.height=c.offsetHeight;stars=Array.from({length:160},()=>({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.4+.3,a:Math.random()*.55+.2,s:Math.random()*.17+.04}));};
    const draw=()=>{ctx.clearRect(0,0,c.width,c.height);stars.forEach(s=>{s.y+=s.s;if(s.y>c.height){s.y=-4;s.x=Math.random()*c.width;}ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${s.a})`;ctx.fill();});raf=requestAnimationFrame(draw);};
    resize();draw();window.addEventListener("resize",resize);return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",resize);};
  },[]);
  return <canvas ref={ref} style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.35,pointerEvents:"none"}}/>;
}

function TypedText(){
  const[txt,setTxt]=useState("");const st=useRef({pi:0,ci:0,del:false});
  useEffect(()=>{let t;const tick=()=>{const{pi,ci,del}=st.current;const cur=TYPED[pi];if(!del){setTxt(cur.slice(0,ci+1));st.current.ci++;if(ci+1===cur.length){st.current.del=true;t=setTimeout(tick,1900);}else t=setTimeout(tick,65);}else{setTxt(cur.slice(0,ci-1));st.current.ci--;if(ci-1===0){st.current.del=false;st.current.pi=(pi+1)%TYPED.length;t=setTimeout(tick,320);}else t=setTimeout(tick,38);}};t=setTimeout(tick,1400);return()=>clearTimeout(t);},[]);
  return(<div style={{fontSize:15,fontWeight:700,color:"#FFD17C",minHeight:"1.6em",margin:"4px 0 16px"}}>{txt}<span style={{display:"inline-block",width:2,height:"1em",background:G,marginLeft:2,verticalAlign:"middle",animation:"blink .8s step-end infinite"}}/></div>);
}

function Counter({target}){
  const[v,setV]=useState(0);const ref=useRef(null);
  useEffect(()=>{const el=ref.current;if(!el)return;const obs=new IntersectionObserver(([e])=>{if(!e.isIntersecting)return;obs.disconnect();const t0=performance.now();const step=(now)=>{const p=Math.min((now-t0)/1400,1);setV(Math.floor(p*target));if(p<1)requestAnimationFrame(step);else setV(target);};requestAnimationFrame(step);},{threshold:.4});obs.observe(el);return()=>obs.disconnect();},[target]);
  return <span ref={ref}>{target>=200?v+"K+":v+"+"}</span>;
}

function TiltCard({children,style={}}){
  const ref=useRef(null);
  const apply=useCallback((x,y)=>{const c=ref.current;if(!c)return;const r=c.getBoundingClientRect();const px=(x-r.left)/r.width,py=(y-r.top)/r.height;c.style.transform=`perspective(900px) rotateX(${(0.5-py)*7}deg) rotateY(${(px-0.5)*9}deg) translateY(-6px)`;c.style.boxShadow="0 22px 54px rgba(0,0,0,.4)";c.style.borderColor="rgba(245,166,35,.25)";},[]);
  const reset=useCallback(()=>{if(!ref.current)return;ref.current.style.transform="";ref.current.style.boxShadow="0 12px 36px rgba(0,0,0,.2)";ref.current.style.borderColor="rgba(255,255,255,.08)";},[]);
  return(<div ref={ref} onMouseMove={e=>apply(e.clientX,e.clientY)} onMouseLeave={reset} onTouchStart={e=>{const t=e.touches[0];apply(t.clientX,t.clientY);}} onTouchMove={e=>{const t=e.touches[0];apply(t.clientX,t.clientY);}} onTouchEnd={()=>setTimeout(reset,300)} style={{borderRadius:20,border:"1px solid rgba(255,255,255,.08)",background:CB,overflow:"hidden",transition:"border-color .3s,box-shadow .3s",boxShadow:"0 12px 36px rgba(0,0,0,.2)",transformStyle:"preserve-3d",...style}}>{children}</div>);
}

function Thumb({bg,icon,name,domain,badge,bt}){
  return(<div style={{position:"relative",minHeight:180,background:bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,padding:"36px 20px 20px",overflow:"hidden",borderBottom:"1px solid rgba(255,255,255,.07)"}}>
    <div style={{position:"absolute",inset:0,background:"radial-gradient(circle at 30% 30%,rgba(255,255,255,.12),transparent 60%)",pointerEvents:"none"}}/>
    {badge&&<div style={{position:"absolute",top:10,right:10,padding:"5px 12px",borderRadius:999,fontSize:11,fontWeight:900,zIndex:5,...(BS[bt]||BS.gray)}}>{badge}</div>}
    <div style={{fontSize:46,zIndex:2,filter:"drop-shadow(0 4px 16px rgba(0,0,0,.5))"}}>{icon}</div>
    <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:15,fontWeight:800,color:"rgba(255,255,255,.92)",zIndex:2}}>{name}</div>
    <span style={{fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:99,background:"rgba(255,255,255,.15)",color:"#fff",zIndex:2}}>{domain}</span>
  </div>);
}

function PushBtn({children,onClick,style={}}){
  return(<button onClick={onClick} onMouseEnter={e=>{e.currentTarget.querySelector(".ps").style.transform="translateY(4px)";e.currentTarget.querySelector(".pf").style.transform="translateY(-4px)";}} onMouseLeave={e=>{e.currentTarget.querySelector(".ps").style.transform="translateY(2px)";e.currentTarget.querySelector(".pf").style.transform="translateY(-2px)";}} onMouseDown={e=>{e.currentTarget.querySelector(".ps").style.transform="translateY(0px)";e.currentTarget.querySelector(".pf").style.transform="translateY(0px)";}} onMouseUp={e=>{e.currentTarget.querySelector(".ps").style.transform="translateY(4px)";e.currentTarget.querySelector(".pf").style.transform="translateY(-4px)";}} style={{position:"relative",border:"none",background:"transparent",padding:0,cursor:"pointer",outline:"none",...style}}>
    <span className="ps" style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",borderRadius:16,background:"rgba(0,0,0,.3)",transform:"translateY(2px)",transition:"transform .2s cubic-bezier(.3,.7,.4,1)",display:"block"}}/>
    <span style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",borderRadius:16,background:"linear-gradient(to left,hsl(37,60%,25%),hsl(37,60%,40%),hsl(37,60%,25%))",display:"block"}}/>
    <span className="pf" style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"13px 26px",borderRadius:16,fontSize:15,fontWeight:900,color:"#111",background:`linear-gradient(135deg,${G},${G2})`,transform:"translateY(-2px)",transition:"transform .2s cubic-bezier(.3,.7,.4,1)"}}>{children}</span>
  </button>);
}

function GoldBtn({children,onClick,style={}}){
  return(<button onClick={onClick} style={{border:"none",cursor:"pointer",borderRadius:14,padding:"11px 20px",fontWeight:900,color:"#111",background:`linear-gradient(135deg,${G},${G2})`,fontSize:14,display:"inline-flex",alignItems:"center",gap:8,transition:"transform .2s,box-shadow .2s",...style}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 14px 28px rgba(245,166,35,.3)`;}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>{children}</button>);
}

function CopyBtn({code}){
  const[c,setC]=useState(false);
  return(<button onClick={()=>navigator.clipboard.writeText(code).then(()=>{setC(true);setTimeout(()=>setC(false),2000);})} style={{background:c?G:"rgba(255,255,255,.1)",color:c?"#111":"#fff",border:`1px solid ${c?G:"rgba(255,255,255,.15)"}`,padding:"6px 14px",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",transition:"all .2s"}}>{c?"✅ Copied!":"📋 Copy"}</button>);
}

function SHead({title,hi,copy}){
  return(<div style={{marginBottom:24}}><h2 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:"clamp(28px,3vw,40px)",letterSpacing:"-.04em",margin:"0 0 8px"}}>{title} <span style={{color:G}}>{hi}</span></h2>{copy&&<p style={{margin:0,color:"rgba(255,255,255,.45)",lineHeight:1.8,maxWidth:680,fontSize:15}}>{copy}</p>}</div>);
}

const W=({children})=><div style={{maxWidth:1180,margin:"0 auto",padding:"0 14px"}}>{children}</div>;

// ── Skeleton loader ───────────────────────────────────
function Skeleton(){
  return(<div style={{borderRadius:20,border:"1px solid rgba(255,255,255,.06)",background:CB,overflow:"hidden"}}>
    <div style={{height:140,background:"linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.04) 75%)",backgroundSize:"200% 100%",animation:"shimmer 1.5s infinite"}}/>
    <div style={{padding:18}}><div style={{height:16,borderRadius:8,background:"rgba(255,255,255,.06)",marginBottom:10,width:"70%"}}/><div style={{height:12,borderRadius:8,background:"rgba(255,255,255,.04)",width:"100%",marginBottom:8}}/><div style={{height:12,borderRadius:8,background:"rgba(255,255,255,.04)",width:"60%"}}/></div>
  </div>);
}

// ── Article modal ─────────────────────────────────────
export function getVideoThumb(item){ return item.thumb||"▶️"; }
export function ArticleModal({article,onClose}){
  useEffect(()=>{document.body.style.overflow="hidden";return()=>{document.body.style.overflow="";};});
  return(<div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,zIndex:700,background:"rgba(4,5,9,.88)",backdropFilter:"blur(18px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",overflowY:"auto"}}>
    <div style={{width:"min(780px,100%)",borderRadius:28,border:"1px solid rgba(255,255,255,.12)",background:"rgba(12,14,22,.98)",boxShadow:"0 32px 80px rgba(0,0,0,.55)",overflow:"hidden",position:"relative",maxHeight:"90vh",overflowY:"auto"}}>
      <button onClick={onClose} style={{position:"sticky",top:16,left:"calc(100% - 54px)",display:"block",zIndex:10,width:38,height:38,borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.08)",color:"#fff",cursor:"pointer",fontSize:18,marginLeft:"auto",marginRight:16}}>✕</button>
      <div style={{padding:"0 32px 36px"}}>
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
          <span style={{padding:"5px 12px",borderRadius:999,fontSize:12,fontWeight:800,...BS.gold}}>{article.badge}</span>
          {article.readTime&&<span style={{fontSize:13,color:"rgba(255,255,255,.45)"}}>{article.readTime} read</span>}
          {article.createdAt&&<span style={{fontSize:13,color:"rgba(255,255,255,.35)"}}>{timeAgo(article.createdAt)}</span>}
          <span style={{fontSize:13,color:"rgba(255,255,255,.35)"}}>👁 {fmtViews(article.views)} views</span>
        </div>
        <h1 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:"clamp(22px,3vw,34px)",letterSpacing:"-.04em",margin:"0 0 16px",lineHeight:1.15}}>{article.title}</h1>
        <p style={{color:"rgba(255,255,255,.65)",fontSize:16,lineHeight:1.85,margin:"0 0 24px",borderLeft:`3px solid ${G}`,paddingLeft:16}}>{article.summary}</p>
        <div style={{color:"rgba(255,255,255,.78)",fontSize:15,lineHeight:1.9,whiteSpace:"pre-wrap"}}>{article.content||"Maudhui kamili yanaendelea kuandikwa. Rudi hivi karibuni!"}</div>
        {article.tags&&<div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:24}}>{(Array.isArray(article.tags)?article.tags:[]).map((t,i)=><span key={i} style={{color:G,fontSize:13,fontWeight:800}}>{t}</span>)}</div>}
        {article.source&&<div style={{marginTop:16,fontSize:13,color:"rgba(255,255,255,.35)"}}>Chanzo: {article.source}</div>}
      </div>
    </div>
  </div>);
}

// ── Video modal ───────────────────────────────────────
export function VideoModal({video,onClose}){
  useEffect(()=>{document.body.style.overflow="hidden";return()=>{document.body.style.overflow="";};});
  return(<div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,zIndex:700,background:"rgba(4,5,9,.92)",backdropFilter:"blur(20px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
    <div style={{width:"min(860px,100%)",borderRadius:24,overflow:"hidden",border:"1px solid rgba(255,255,255,.12)",boxShadow:"0 32px 80px rgba(0,0,0,.6)",position:"relative"}}>
      <button onClick={onClose} style={{position:"absolute",right:12,top:12,zIndex:10,width:36,height:36,borderRadius:10,border:"none",background:"rgba(0,0,0,.7)",color:"#fff",cursor:"pointer",fontSize:18}}>✕</button>
      <div style={{position:"relative",paddingTop:"56.25%",background:"#000"}}>
        <iframe src={(video.embedUrl||"")+"?autoplay=1"} style={{position:"absolute",inset:0,width:"100%",height:"100%",border:"none"}} allow="autoplay;encrypted-media" allowFullScreen title={video.title}/>
      </div>
      <div style={{padding:"18px 20px",background:"rgba(12,14,22,.98)"}}>
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}><span style={{fontSize:26}}>{video.channelImg||"🎬"}</span><div><div style={{fontWeight:800,fontSize:15}}>{video.channel}</div><div style={{fontSize:12,color:"rgba(255,255,255,.45)"}}>👁 {fmtViews(video.views)} views</div></div></div>
        <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:18,letterSpacing:"-.03em",margin:0}}>{video.title}</h3>
      </div>
    </div>
  </div>);
}

// ── Article Card ──────────────────────────────────────
function ArticleCard({item,onRead,collection:col}){
  const handleRead=()=>{
    if(item.id&&!item.id.startsWith("f")&&!item.id.startsWith("u"))incrementViews(col,item.id);
    onRead(item);
  };
  return(<TiltCard>
    {item.thumbImg&&<div style={{height:190,overflow:"hidden",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
      <img src={item.thumbImg} alt={item.title} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={e=>{e.target.parentElement.style.display="none";}}/>
    </div>}
    <div style={{padding:"14px 18px 10px",display:"flex",alignItems:"center",gap:12,background:"linear-gradient(135deg,rgba(245,166,35,.1),rgba(255,255,255,.02)),linear-gradient(180deg,#1e2030,#161820)",minHeight:item.thumbImg?50:90}}>
      <div style={{fontSize:item.thumbImg?32:48,flexShrink:0,filter:"drop-shadow(0 4px 12px rgba(0,0,0,.5))"}}>{item.thumb||"📝"}</div>
      <div>
        <span style={{display:"inline-block",padding:"4px 10px",borderRadius:999,fontSize:11,fontWeight:800,...BS.gold}}>{item.badge}</span>
        <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginTop:4}}>{item.readTime||"5 min"} read</div>
      </div>
    </div>
    <div style={{padding:18}}>
      <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:18,margin:"0 0 9px",letterSpacing:"-.03em",lineHeight:1.25}}>{item.title}</h3>
      <p style={{color:"rgba(255,255,255,.62)",fontSize:14,lineHeight:1.75,margin:"0 0 12px"}}>{item.summary}</p>
      <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:14}}>
        <span style={{fontSize:12,color:"rgba(255,255,255,.35)"}}>👁 {fmtViews(item.views)}</span>
        {item.createdAt&&<span style={{fontSize:12,color:"rgba(255,255,255,.35)"}}>{timeAgo(item.createdAt)}</span>}
      </div>
      {(item.tags||[]).length>0&&<div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>{(item.tags||[]).map((t,i)=><span key={i} style={{color:G,fontSize:12,fontWeight:800}}>{t}</span>)}</div>}
      <GoldBtn onClick={handleRead} style={{fontSize:13,padding:"9px 16px"}}>📖 Soma Zaidi →</GoldBtn>
    </div>
  </TiltCard>);
}

// ── Video Card ────────────────────────────────────────
function VideoCard({item,onPlay,collection:col}){
  const handlePlay=()=>{
    if(item.id&&!item.id.startsWith("f")&&!item.id.startsWith("u"))incrementViews(col,item.id);
    onPlay(item);
  };
  return(<TiltCard>
    <div onClick={handlePlay} style={{position:"relative",paddingTop:"56%",background:"linear-gradient(135deg,rgba(245,166,35,.12),rgba(255,255,255,.02)),linear-gradient(180deg,#1e2030,#161820)",cursor:"pointer",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{width:60,height:60,borderRadius:"50%",background:"rgba(245,166,35,.92)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#111",fontWeight:900,boxShadow:`0 0 0 10px rgba(245,166,35,.18)`}}>▶</div>
      </div>
      <div style={{position:"absolute",top:10,left:10,padding:"4px 10px",borderRadius:999,fontSize:11,fontWeight:800,...(item.platform==="youtube"?BS.red:BS.purple)}}>{item.platform==="youtube"?"▶ YouTube":"♪ TikTok"}</div>
      <div style={{position:"absolute",bottom:10,right:10,padding:"4px 8px",borderRadius:8,fontSize:11,fontWeight:700,background:"rgba(0,0,0,.7)",color:"#fff"}}>{item.duration}</div>
    </div>
    <div style={{padding:16}}>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}><span style={{fontSize:22}}>{item.channelImg||"🎬"}</span><div><div style={{fontWeight:800,fontSize:13}}>{item.channel}</div><div style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>👁 {fmtViews(item.views)} views</div></div></div>
      <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:16,margin:"0 0 12px",letterSpacing:"-.02em",lineHeight:1.3}}>{item.title}</h3>
      <GoldBtn onClick={handlePlay} style={{fontSize:12,padding:"8px 14px",width:"100%",justifyContent:"center"}}>▶ Tazama Sasa</GoldBtn>
    </div>
  </TiltCard>);
}

// ════════════════════════════════════════════════════
// AUTH MODAL
// ════════════════════════════════════════════════════
function AuthModal({onClose,onUser}){
  const[tog,setTog]=useState(false);
  const[mode,setMode]=useState("login");
  const[name,setName]=useState(""),[ email,setEmail]=useState(""),[ pw,setPw]=useState(""),[ pw2,setPw2]=useState("");
  const[err,setErr]=useState(""),[ loading,setLoading]=useState(false);

  const switchTo=(m)=>{if(m==="register"){setTog(true);setTimeout(()=>setMode("register"),80);}else if(m==="login"){setTog(false);setTimeout(()=>setMode("login"),80);}else setMode("forgot");setErr("");};

  const saveUser=async(user,displayName,provider)=>{
    const db=getFirebaseDb();if(!db)return;
    try{
      const r=doc(db,"users",user.uid);
      const s=await getDoc(r);
      let role = (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ? "admin" : (s.exists() ? s.data().role || "user" : "user");
      if(!s.exists()) await setDoc(r,{uid:user.uid,name:displayName||user.displayName||"",email:user.email,role,provider,createdAt:serverTimestamp()});
      onUser({...user,role});
    } catch(err){
      console.error("Error saving user:", err);
      onUser({...user,role: (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ? "admin" : "user"});
    }
  };

  const doGoogle=async()=>{
    const auth=getFirebaseAuth();
    if(!auth){setErr("⚠️ Firebase haijasanidiwa.");return;}
    setLoading(true);setErr("");
    try{
      const res=await signInWithPopup(auth,new GoogleAuthProvider());
      await saveUser(res.user,res.user.displayName,"google");
      onClose();
    }catch(e){
      let msg = e.message.replace("Firebase:","").trim();
      if (msg.includes("auth/popup-blocked")) msg = "⚠️ Popup imezuiwa na browser. Tafadhali ruhusu popups.";
      if (msg.includes("auth/unauthorized-domain")) msg = "⚠️ Domain hii haijaruhusiwa kwenye Firebase Auth.";
      setErr(msg);
    }finally{setLoading(false);}};
  const doEmail=async()=>{
    const auth=getFirebaseAuth();
    if(!auth){setErr("⚠️ Firebase haijasanidiwa.");return;}
    if(!email||!pw){setErr("Jaza email na password.");return;}
    setLoading(true);setErr("");
    const normalizedEmail = normalizeEmail(email);
    try{
      if(mode==="login"){
        console.log("Attempting login for:", normalizedEmail);
        const res=await signInWithEmailAndPassword(auth,normalizedEmail,pw);
        console.log("Login successful:", res.user.uid);
        await saveUser(res.user,res.user.displayName||name,"email");
      }else{
        if(pw!==pw2){setErr("Passwords hazifanani.");setLoading(false);return;}
        if(pw.length<6){setErr("Password lazima iwe herufi 6+.");setLoading(false);return;}
        console.log("Attempting registration for:", normalizedEmail);
        const res=await createUserWithEmailAndPassword(auth,normalizedEmail,pw);
        console.log("Registration successful:", res.user.uid);
        await saveUser(res.user,name,"email");
      }
      onClose();
    }catch(e){
      console.error("Auth error:", e);
      let msg = e.message.replace("Firebase:","").trim();
      if (msg.includes("auth/user-not-found")) msg = "⚠️ Akaunti hii haipo. Tafadhali jisajili.";
      if (msg.includes("auth/wrong-password")) msg = "⚠️ Password si sahihi.";
      if (msg.includes("auth/invalid-credential")) msg = "⚠️ Email au Password si sahihi. Kama huna account, tafadhali jisajili (Register) kwanza.";
      if (msg.includes("auth/email-already-in-use")) msg = "⚠️ Email hii tayari inatumika.";
      if (msg.includes("auth/invalid-email")) msg = "⚠️ Email si sahihi.";
      if (msg.includes("auth/operation-not-allowed")) msg = "⚠️ Email/Password login haijaruhusiwa kwenye Firebase Console. Tafadhali wasiliana na Admin.";
      setErr(msg);
    }finally{setLoading(false);}};
  const doForgot=async()=>{const auth=getFirebaseAuth();if(!auth){setErr("⚠️ Firebase haijasanidiwa.");return;}if(!email){setErr("Weka email yako kwanza.");return;}setLoading(true);try{await sendPasswordResetEmail(auth,email);setErr("✅ Reset link imetumwa!");}catch(e){setErr(e.message.replace("Firebase:","").trim());}finally{setLoading(false);}};

  const inp=(props)=>(<input {...props} style={{height:50,borderRadius:14,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.05)",color:"#fff",padding:"0 16px",outline:"none",fontFamily:"inherit",fontSize:14,width:"100%",...(props.style||{})}} onFocus={e=>e.target.style.borderColor=G} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.1)"}/>);

  return(<div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,zIndex:600,background:"rgba(4,5,9,.84)",backdropFilter:"blur(18px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
    <div style={{width:"min(900px,100%)",borderRadius:28,border:"1px solid rgba(255,255,255,.12)",background:"rgba(12,14,22,.98)",boxShadow:"0 32px 80px rgba(0,0,0,.55)",overflow:"hidden",position:"relative",minHeight:520,display:"grid",gridTemplateColumns:"1fr 1fr"}}>
      <button onClick={onClose} style={{position:"absolute",right:16,top:16,zIndex:20,width:38,height:38,borderRadius:12,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.06)",color:"#fff",cursor:"pointer",fontSize:18}}>✕</button>
      <div style={{padding:"36px",display:"flex",flexDirection:"column",justifyContent:"center",position:"relative",zIndex:3}}>
        {mode!=="forgot"&&(<div style={{display:"inline-flex",gap:6,padding:5,borderRadius:999,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",marginBottom:24,alignSelf:"flex-start"}}>{["login","register"].map(m=>(<button key={m} onClick={()=>switchTo(m)} style={{border:"none",borderRadius:999,padding:"9px 18px",cursor:"pointer",fontWeight:800,fontSize:13,transition:"all .22s",background:mode===m?`linear-gradient(135deg,${G},${G2})`:"transparent",color:mode===m?"#111":"rgba(255,255,255,.6)"}}>{m==="login"?"Login":"Register"}</button>))}</div>)}
        <div style={{display:"grid",gap:11}}>
          <h2 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:34,letterSpacing:"-.05em",margin:0}}>{mode==="login"?"Ingia":mode==="register"?"Jisajili":"Forgot Password"}</h2>
          <p style={{color:"rgba(255,255,255,.5)",lineHeight:1.8,margin:0,fontSize:14}}>{mode==="login"?"Karibu tena kwenye STEA.":mode==="register"?"Anza safari yako ya tech.":"Tutakutumia reset link."}</p>
          {mode!=="forgot"&&<button onClick={doGoogle} disabled={loading} style={{height:50,borderRadius:14,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.05)",color:"#fff",fontWeight:800,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}><span style={{fontSize:20}}>🔐</span> Endelea kwa Google</button>}
          {mode==="register"&&inp({value:name,onChange:e=>setName(e.target.value),placeholder:"Jina kamili"})}
          {inp({value:email,onChange:e=>setEmail(e.target.value),placeholder:"Email address",type:"email"})}
          {mode!=="forgot"&&inp({value:pw,onChange:e=>setPw(e.target.value),placeholder:"Password",type:"password"})}
          {mode==="register"&&inp({value:pw2,onChange:e=>setPw2(e.target.value),placeholder:"Confirm password",type:"password"})}
          {err&&<div style={{fontSize:13,padding:"10px 14px",borderRadius:10,background:err.startsWith("✅")?"rgba(0,196,140,.1)":"rgba(239,68,68,.1)",color:err.startsWith("✅")?"#67f0c1":"#fca5a5",border:`1px solid ${err.startsWith("✅")?"rgba(0,196,140,.2)":"rgba(239,68,68,.2)"}`}}>{err}</div>}
          <button onClick={mode==="forgot"?doForgot:doEmail} disabled={loading} style={{height:50,borderRadius:14,border:"none",background:`linear-gradient(135deg,${G},${G2})`,color:"#111",fontWeight:900,cursor:"pointer",fontSize:15,opacity:loading?.7:1}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>{loading?"Subiri...":(mode==="login"?"Ingia Sasa →":mode==="register"?"Fungua Account →":"Tuma Reset Link")}</button>
          <div style={{fontSize:13}}>{mode==="login"&&<button onClick={()=>switchTo("forgot")} style={{background:"none",border:"none",color:G,cursor:"pointer",fontWeight:700,padding:0}}>Forgot password?</button>}{mode==="forgot"&&<button onClick={()=>switchTo("login")} style={{background:"none",border:"none",color:G,cursor:"pointer",fontWeight:700,padding:0}}>← Rudi login</button>}</div>
        </div>
      </div>
      <div style={{position:"relative",overflow:"hidden",background:"linear-gradient(135deg,#0d1019,#090b12)"}}>
        <div style={{position:"absolute",right:"-5%",top:"-8%",height:"130%",width:"115%",background:`linear-gradient(135deg,${G},${G2})`,transformOrigin:"bottom right",transition:"transform 1.4s cubic-bezier(.4,0,.2,1)",transform:tog?"rotate(0deg) skewY(0deg)":"rotate(10deg) skewY(38deg)"}}/>
        <div style={{position:"absolute",left:"22%",top:"98%",height:"120%",width:"110%",background:"rgba(12,14,22,.98)",borderTop:`3px solid ${G}`,transformOrigin:"bottom left",transition:"transform 1.4s cubic-bezier(.4,0,.2,1) .5s",transform:tog?"rotate(-10deg) skewY(-38deg)":"rotate(0deg) skewY(0deg)"}}/>
        <div style={{position:"relative",zIndex:2,height:"100%",display:"flex",flexDirection:"column",justifyContent:"center",padding:"38px",color:"#111"}}>
          <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:48,lineHeight:.9,letterSpacing:"-.06em",fontWeight:800,marginBottom:16}}>{tog?"KARIBU\nSTEA":"KARIBU\nTENA"}</div>
          <p style={{maxWidth:250,lineHeight:1.8,fontSize:14,margin:"0 0 18px"}}>{tog?"Anza safari yako ya tech. Platform ya kwanza ya tech kwa Watanzania.":"Ingia uendelee kujifunza na kupata deals."}</p>
          <div style={{fontSize:13,fontWeight:700}}>✉️ swahilitecheliteacademy@gmail.com</div>
        </div>
      </div>
      <style>{`@media(max-width:640px){.auth-grid{grid-template-columns:1fr!important}.auth-grid > div:last-child{display:none!important}}`}</style>
    </div>
  </div>);
}

// ── User Chip ─────────────────────────────────────────
function UserChip({user,onLogout,onAdmin}){
  const[open,setOpen]=useState(false);const ref=useRef(null);
  useEffect(()=>{const fn=(e)=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("click",fn);return()=>document.removeEventListener("click",fn);},[]);
  const ini=(user.displayName||user.email||"S")[0].toUpperCase();
  return(<div ref={ref} style={{position:"relative"}}>
    <button onClick={()=>setOpen(v=>!v)} style={{width:42,height:42,borderRadius:14,border:`2px solid ${G}`,background:`linear-gradient(135deg,${G},${G2})`,color:"#111",fontWeight:900,fontSize:16,cursor:"pointer",display:"grid",placeItems:"center",flexShrink:0}}>{ini}</button>
    {open&&(<div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:230,borderRadius:18,border:"1px solid rgba(255,255,255,.12)",background:"rgba(14,16,26,.98)",boxShadow:"0 24px 60px rgba(0,0,0,.45)",padding:12,zIndex:500}}>
      <div style={{padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,.04)",marginBottom:10}}>
        <div style={{fontWeight:800,fontSize:14,marginBottom:3}}>{user.displayName||"STEA User"}</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.4)",wordBreak:"break-all"}}>{user.email}</div>
        {user.role==="admin"&&<span style={{display:"inline-block",marginTop:6,fontSize:10,fontWeight:900,padding:"3px 9px",borderRadius:99,background:"rgba(245,166,35,.15)",color:G,border:"1px solid rgba(245,166,35,.28)"}}>⚡ ADMIN</span>}
      </div>
      {user.role==="admin"&&<button onClick={()=>{onAdmin();setOpen(false);}} style={{width:"100%",marginBottom:8,padding:"10px 14px",borderRadius:12,border:"none",background:"rgba(245,166,35,.1)",color:G,fontWeight:800,cursor:"pointer",textAlign:"left",fontSize:14}}>⚙️ Admin Dashboard</button>}
      <button onClick={()=>{onLogout();setOpen(false);}} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:"none",background:"rgba(239,68,68,.1)",color:"#fca5a5",fontWeight:800,cursor:"pointer",textAlign:"left",fontSize:14}}>🚪 Logout</button>
    </div>)}
  </div>);
}

// ════════════════════════════════════════════════════
// LIVE DATA PAGES
// ════════════════════════════════════════════════════
function TipsPage(){
  const{docs,loading}=useCollection("tips");
  const[art,setArt]=useState(null);
  const[vid,setVid]=useState(null);

  const articles=(docs.length>0?docs:FALLBACK_TIPS).filter(d=>d.type==="article"||!d.type);
  const videos  =(docs.length>0?docs:FALLBACK_TIPS).filter(d=>d.type==="video");

  return(<section style={{padding:"26px 0"}}><W>
    {art&&<ArticleModal article={art} onClose={()=>setArt(null)}/>}
    {vid&&<VideoModal   video={vid}   onClose={()=>setVid(null)}/>}
    <SHead title="Tech" hi="Tips" copy="Articles na videos za Android, iPhone, PC na AI kwa matumizi ya kila siku."/>
    <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:20,letterSpacing:"-.03em",margin:"0 0 16px"}}>📝 Articles <span style={{color:G}}>& Guides</span></h3>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:22,marginBottom:40}}>
      {loading?[1,2,3].map(i=><Skeleton key={i}/>):articles.map(item=><ArticleCard key={item.id} item={item} onRead={setArt} collection="tips"/>)}
    </div>
    {videos.length>0&&<>
      <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:20,letterSpacing:"-.03em",margin:"0 0 16px"}}>🎬 Videos <span style={{color:G}}>za Tech</span></h3>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:22}}>
        {videos.map(item=><VideoCard key={item.id} item={item} onPlay={setVid} collection="tips"/>)}
      </div>
    </>}
  </W></section>);
}

function UpdatesPage(){
  const{docs,loading}=useCollection("updates");
  const[art,setArt]=useState(null);
  const[vid,setVid]=useState(null);

  const articles=(docs.length>0?docs:FALLBACK_UPDATES).filter(d=>d.type==="article"||!d.type);
  const videos  =(docs.length>0?docs:FALLBACK_UPDATES).filter(d=>d.type==="video");

  return(<section style={{padding:"26px 0"}}><W>
    {art&&<ArticleModal article={art} onClose={()=>setArt(null)}/>}
    {vid&&<VideoModal   video={vid}   onClose={()=>setVid(null)}/>}
    <SHead title="Latest Tech Updates" hi="Around The World" copy="Habari mpya za AI, Android, Africa Tech na trends za tech world."/>
    <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:20,letterSpacing:"-.03em",margin:"0 0 16px"}}>📰 Tech <span style={{color:G}}>News</span></h3>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:22,marginBottom:40}}>
      {loading?[1,2,3].map(i=><Skeleton key={i}/>):articles.map(item=>(
        <TiltCard key={item.id}>
          <div style={{padding:"16px 18px 10px",background:"linear-gradient(135deg,rgba(245,166,35,.08),rgba(255,255,255,.02)),linear-gradient(180deg,#1e2030,#161820)",display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{fontSize:42,filter:"drop-shadow(0 4px 12px rgba(0,0,0,.5))"}}>{item.thumb}</div>
            <div><span style={{display:"inline-block",padding:"4px 10px",borderRadius:999,fontSize:11,fontWeight:800,...BS.gold}}>{item.badge}</span><div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:4}}>{item.category}</div></div>
          </div>
          <div style={{padding:18}}>
            <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:17,margin:"0 0 9px",letterSpacing:"-.03em",lineHeight:1.25}}>{item.title}</h3>
            <p style={{color:"rgba(255,255,255,.62)",fontSize:14,lineHeight:1.75,margin:"0 0 12px"}}>{item.summary}</p>
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:14}}>
              <span style={{color:G,fontSize:12,fontWeight:800}}>👁 {fmtViews(item.views)}</span>
              {item.createdAt&&<span style={{color:"#75c5ff",fontSize:12,fontWeight:800}}>{timeAgo(item.createdAt)}</span>}
              {item.source&&<span style={{color:"rgba(255,255,255,.35)",fontSize:12}}>via {item.source}</span>}
            </div>
            <GoldBtn onClick={()=>{if(item.id&&!item.id.startsWith("u"))incrementViews("updates",item.id);setArt(item);}} style={{fontSize:13,padding:"9px 16px"}}>📖 Soma Zaidi →</GoldBtn>
          </div>
        </TiltCard>
      ))}
    </div>
    {videos.length>0&&<>
      <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:20,letterSpacing:"-.03em",margin:"0 0 16px"}}>🎬 Tech <span style={{color:G}}>Videos</span></h3>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:22}}>
        {videos.map(item=><VideoCard key={item.id} item={item} onPlay={setVid} collection="updates"/>)}
      </div>
    </>}
  </W></section>);
}

function DealsPage(){
  const{docs,loading}=useCollection("deals","createdAt");
  const deals=(docs.filter(d=>d.active!==false).length>0?docs.filter(d=>d.active!==false):FALLBACK_DEALS);

  return(<section style={{padding:"26px 0"}}><W>
    <SHead title="Premium" hi="Deals" copy="Discounts, promo codes na referral deals — napata commission, wewe unapata bei nzuri."/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:24}}>
      {loading?[1,2,3].map(i=><Skeleton key={i}/>):deals.map((d,i)=>(
        <TiltCard key={d.id||i}>
          <Thumb bg={d.bg} icon={d.icon} name={d.name} domain={d.domain} badge={d.badge} bt={d.bt}/>
          <div style={{padding:"18px 18px 20px",display:"flex",gap:14,alignItems:"flex-start"}}>
            <div style={{fontSize:30,flexShrink:0,marginTop:3}}>{d.icon}</div>
            <div style={{flex:1}}>
              <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:19,margin:"0 0 4px",letterSpacing:"-.03em"}}>{d.name}</h3>
              <div style={{fontSize:12,color:"rgba(255,255,255,.4)",marginBottom:8}}>{d.meta}</div>
              <p style={{color:"rgba(255,255,255,.68)",fontSize:14,lineHeight:1.7,margin:0}}>{d.desc}</p>
              {d.oldP&&<div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",margin:"10px 0 12px"}}><span style={{color:"rgba(255,255,255,.42)",textDecoration:"line-through",fontSize:14,fontWeight:700}}>{d.oldP}</span><span style={{color:G,fontSize:20,fontWeight:900}}>{d.newP}</span><span style={{padding:"5px 10px",borderRadius:999,fontSize:11,fontWeight:900,background:"rgba(245,166,35,.12)",color:G,border:"1px solid rgba(245,166,35,.18)"}}>{d.save}</span></div>}
              {d.code&&<div style={{marginTop:12,padding:"12px 14px",borderRadius:13,border:"1px dashed rgba(245,166,35,.3)",background:"rgba(245,166,35,.07)"}}><div style={{fontSize:10,fontWeight:800,letterSpacing:".1em",textTransform:"uppercase",color:"rgba(255,255,255,.38)",marginBottom:6}}>🎫 Promo Code</div><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}><strong style={{fontSize:18,fontWeight:900,color:G,letterSpacing:".06em"}}>{d.code}</strong><CopyBtn code={d.code}/></div></div>}
              {d.ref&&<div style={{background:"rgba(86,183,255,.07)",border:"1px solid rgba(86,183,255,.2)",borderRadius:12,padding:"11px 13px",marginTop:10,display:"flex",alignItems:"flex-start",gap:9}}><span style={{fontSize:18,flexShrink:0}}>🔗</span><div style={{fontSize:12,color:"rgba(255,255,255,.5)",lineHeight:1.55}}><strong style={{display:"block",color:"#56b7ff",fontSize:13,marginBottom:2}}>Referral Link — Hakuna Promo Code</strong>Bonyeza usajili kupitia link yangu napata commission bila gharama kwako.</div></div>}
              <div style={{marginTop:14}}><GoldBtn onClick={()=>window.open(d.url,"_blank")}>{d.icon} Pata Deal →</GoldBtn></div>
            </div>
          </div>
        </TiltCard>
      ))}
    </div>
  </W></section>);
}

function CoursesPage(){
  const{docs,loading}=useCollection("courses","createdAt");
  const courses=docs.length>0?docs:FALLBACK_COURSES;

  return(<section style={{padding:"26px 0"}}><W>
    <SHead title="Kozi za" hi="Kisasa" copy="Mwanzo mpaka practical mastery kwa beginner, creator na mtu anayejenga career."/>
    <div style={{display:"grid",gap:20}}>
      {loading?[1,2].map(i=><Skeleton key={i}/>):courses.map((c,i)=>(
        <TiltCard key={c.id||i} style={{display:"grid",gridTemplateColumns:"clamp(170px,22%,250px) 1fr",minHeight:220}}>
          <div style={{position:"relative",padding:20,display:"flex",alignItems:"flex-end",borderRight:"1px solid rgba(255,255,255,.07)",background:c.free?"radial-gradient(circle at top right,rgba(255,255,255,.1),transparent 24%),linear-gradient(135deg,rgba(0,196,140,.22),rgba(255,255,255,.04))":"radial-gradient(circle at top right,rgba(255,255,255,.1),transparent 24%),linear-gradient(135deg,rgba(245,166,35,.22),rgba(255,255,255,.04))"}}>
            <div style={{position:"absolute",left:14,top:14,padding:"6px 12px",borderRadius:999,fontSize:11,fontWeight:900,border:"1px solid rgba(255,255,255,.08)",background:c.free?"rgba(0,196,140,.14)":"rgba(245,166,35,.14)",color:c.free?"#00C48C":G}}>{c.free?"🆓 BURE":"⭐ PAID"}</div>
            <div><div style={{fontSize:50}}>{c.emoji}</div><div style={{marginTop:8,fontSize:12,color:"rgba(255,255,255,.75)",fontWeight:700}}>{c.free?"Anza bila gharama.":"Lipa kwa M-Pesa."}</div></div>
          </div>
          <div style={{padding:20,display:"flex",flexDirection:"column",gap:11}}>
            <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:21,margin:0,letterSpacing:"-.03em"}}>{c.title}</h3>
            <p style={{color:"rgba(255,255,255,.68)",fontSize:14,lineHeight:1.75,margin:0}}>{c.desc}</p>
            <div style={{display:"grid",gap:7}}>
              {(c.lessons||[]).map((l,j)=>(<div key={j} style={{display:"flex",gap:9,alignItems:"center",padding:"8px 11px",borderRadius:11,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",color:"rgba(255,255,255,.68)",fontSize:14}}><span style={{width:22,height:22,borderRadius:999,display:"grid",placeItems:"center",background:"rgba(245,166,35,.13)",color:G,fontSize:11,fontWeight:900,flexShrink:0}}>{j+1}</span>{l}</div>))}
            </div>
            <div style={{marginTop:"auto",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{fontSize:14,color:"rgba(255,255,255,.65)",fontWeight:700}}><strong style={{color:G}}>{c.price}</strong></div>
              <GoldBtn onClick={()=>{ if(c.whatsapp)window.open(c.whatsapp,"_blank"); }} style={c.accent?{background:`linear-gradient(135deg,${c.accent},#63f0c1)`,borderRadius:12}:{borderRadius:12}}>{c.cta||"Jiunge Leo"}</GoldBtn>
            </div>
          </div>
        </TiltCard>
      ))}
    </div>
  </W></section>);
}

function DukaPage(){
  const { docs, loading } = useCollection("products", "createdAt");
  const products = docs.length > 0 ? docs : PRODUCTS;

  return(<section style={{padding:"26px 0"}}><W>
    <SHead title="Electronics" hi="Duka" copy="Curated affiliate products na verified deals kwa buyers wa Tanzania."/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:22}}>
      {loading ? [1,2,3].map(i=><Skeleton key={i}/>) : products.map((p,i)=>(<TiltCard key={p.id||i}>
        <div style={{paddingTop:"52%",position:"relative",background:"linear-gradient(135deg,rgba(245,166,35,.15),rgba(255,255,255,.03)),linear-gradient(180deg,#252538,#171720)"}}>
          <div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",fontSize:52}}>{p.icon}</div>
          {p.badge && <div style={{position:"absolute",top:14,left:14,borderRadius:999,padding:"6px 11px",border:"1px solid rgba(255,255,255,.08)",background:"rgba(14,14,22,.75)",color:G,fontSize:11,fontWeight:800}}>{p.badge}</div>}
        </div>
        <div style={{padding:18}}>
          <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:20,margin:"0 0 9px",letterSpacing:"-.03em"}}>{p.name}</h3>
          <p style={{color:"rgba(255,255,255,.68)",fontSize:14,lineHeight:1.75,margin:"0 0 13px"}}>{p.description || p.desc}</p>
          <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:14}}>
            <span style={{color:G,fontSize:16,fontWeight:800}}>{p.price}</span>
            {(p.oldPrice || p.old) && <span style={{color:"rgba(255,255,255,.42)",textDecoration:"line-through",fontSize:13}}>{p.oldPrice || p.old}</span>}
          </div>
          <GoldBtn onClick={() => p.url && window.open(p.url, "_blank")}>Agiza Sasa →</GoldBtn>
        </div>
      </TiltCard>))}
    </div>
  </W></section>);
}

function WebsitesPage(){
  const { docs, loading } = useCollection("websites", "createdAt");
  const websites = docs.length > 0 ? docs : WEBSITES;

  return(<section style={{padding:"26px 0"}}><W>
    <SHead title="Websites za" hi="Kijanja" copy="Sites zinazookoa pesa, muda na nguvu — nimezijaribu zote."/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:22}}>
      {loading ? [1,2,3].map(i=><Skeleton key={i}/>) : websites.map((w,i)=>(<TiltCard key={w.id||i}>
        <Thumb bg={w.bg} icon={w.icon} name={w.name} domain={w.meta}/>
        <div style={{padding:18,display:"flex",gap:13,alignItems:"flex-start"}}>
          <div style={{width:48,height:48,borderRadius:13,display:"grid",placeItems:"center",background:"rgba(245,166,35,.12)",color:G,fontSize:22,flexShrink:0}}>{w.icon}</div>
          <div style={{minWidth:0}}>
            <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:18,margin:"0 0 3px",letterSpacing:"-.03em"}}>{w.name}</h3>
            <div style={{fontSize:12,color:"rgba(255,255,255,.4)",margin:"0 0 7px"}}>{w.meta}</div>
            <p style={{color:"rgba(255,255,255,.68)",fontSize:14,lineHeight:1.7,margin:"0 0 9px"}}>{w.description || w.desc}</p>
            <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
              {(w.tags || []).map((t,j)=><span key={j} style={{color:j===0?G:"#75c5ff",fontSize:12,fontWeight:800}}>{t}</span>)}
            </div>
            <GoldBtn onClick={()=>window.open(w.url,"_blank")} style={{fontSize:13,padding:"8px 14px"}}>{w.icon} Tembelea →</GoldBtn>
          </div>
        </div>
      </TiltCard>))}
    </div>
  </W></section>);
}

// ── Robotic Hand Hero Component ───────────────────────
function RoboticHand(){
  return(<>
    <style>{`
      @keyframes robotEnter {
        0%   { opacity:0; transform:translateX(160px) translateY(80px) rotate(-22deg) scale(0.55); filter:drop-shadow(0 0 80px rgba(138,43,226,.9)); }
        60%  { opacity:.9; transform:translateX(-12px) translateY(-10px) rotate(4deg) scale(1.05); filter:drop-shadow(0 0 50px rgba(138,43,226,.55)); }
        80%  { opacity:.78; transform:translateX(6px) translateY(5px) rotate(-1.5deg) scale(0.97); }
        100% { opacity:.75; transform:translateX(0) translateY(0) rotate(0) scale(1); filter:drop-shadow(0 0 28px rgba(138,43,226,.3)); }
      }
      .rh-wrap { animation: robotEnter 1.8s cubic-bezier(.34,1.56,.64,1) 0.2s both; }
      @keyframes robotFloat {
        0%,100% { transform:translateY(0); }
        50% { transform:translateY(-14px); }
      }
      .rh-inner { animation: robotFloat 5s ease-in-out 2.2s infinite; }
    `}</style>
    <div className="rh-wrap" style={{
      position:"absolute",
      right:"-2%",
      bottom:"-5%",
      width:"clamp(260px,42%,520px)",
      height:"clamp(300px,52%,600px)",
      pointerEvents:"none",
      zIndex:1,
    }}>
    <div className="rh-inner" style={{width:"100%",height:"100%"}}>
      <svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",objectFit:"contain"}}>
        <defs>
          <linearGradient id="rh1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c3aed"/>
            <stop offset="50%" stopColor="#4f46e5"/>
            <stop offset="100%" stopColor="#06b6d4"/>
          </linearGradient>
          <linearGradient id="rh2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6"/>
            <stop offset="100%" stopColor="#06b6d4"/>
          </linearGradient>
          <linearGradient id="rh3" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1e1b4b"/>
            <stop offset="100%" stopColor="#312e81"/>
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <radialGradient id="joint" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee"/>
            <stop offset="100%" stopColor="#0891b2"/>
          </radialGradient>
        </defs>

        {/* Forearm */}
        <path d="M160 500 Q140 420 150 360 Q155 330 200 320 Q245 330 250 360 Q260 420 240 500Z"
          fill="url(#rh3)" stroke="url(#rh2)" strokeWidth="2"/>
        <path d="M165 480 Q155 420 160 370" stroke="url(#rh2)" strokeWidth="1.5" fill="none" opacity=".6"/>
        <path d="M235 480 Q245 420 240 370" stroke="url(#rh2)" strokeWidth="1.5" fill="none" opacity=".6"/>

        {/* Wrist joint */}
        <ellipse cx="200" cy="320" rx="52" ry="22" fill="url(#rh1)" filter="url(#glow)"/>
        <ellipse cx="200" cy="318" rx="42" ry="16" fill="url(#rh3)" stroke="url(#rh2)" strokeWidth="1.5"/>
        {[160,180,200,220,240].map((x,i)=>(
          <circle key={i} cx={x} cy="318" r="4" fill="url(#joint)" opacity=".9"/>
        ))}

        {/* Palm */}
        <path d="M148 260 Q145 300 148 320 L252 320 Q255 300 252 260 Q248 240 200 236 Q152 240 148 260Z"
          fill="url(#rh3)" stroke="url(#rh2)" strokeWidth="2"/>
        <path d="M155 265 Q155 310 158 318 M245 265 Q245 310 242 318"
          stroke="url(#rh2)" strokeWidth="1" fill="none" opacity=".5"/>

        {/* Knuckle joints */}
        {[163,188,200,213,237].map((x,i)=>(
          <g key={i}>
            <ellipse cx={x} cy="260" rx="10" ry="8" fill="url(#rh1)" opacity=".9"/>
            <ellipse cx={x} cy="259" rx="7" ry="5" fill="url(#rh3)"/>
            <circle cx={x} cy="259" r="2.5" fill="url(#joint)"/>
          </g>
        ))}

        {/* Finger 1 — pinky (curled) */}
        <path d="M148 260 Q135 240 130 220 Q128 205 138 200 Q148 198 152 215 Q155 235 155 258"
          fill="url(#rh3)" stroke="url(#rh2)" strokeWidth="2"/>
        <ellipse cx="139" cy="200" rx="9" ry="7" fill="url(#rh1)" opacity=".85"/>

        {/* Finger 2 — ring */}
        <path d="M163 258 Q158 225 158 195 Q159 175 170 170 Q181 168 183 188 Q184 215 180 258"
          fill="url(#rh3)" stroke="url(#rh2)" strokeWidth="2"/>
        <ellipse cx="171" cy="170" rx="10" ry="8" fill="url(#rh1)" opacity=".85"/>
        <ellipse cx="166" cy="215" rx="8" ry="6" fill="url(#rh1)" opacity=".7"/>

        {/* Finger 3 — middle (tallest) */}
        <path d="M188 257 Q185 215 185 175 Q186 150 200 146 Q214 148 215 175 Q215 215 212 257"
          fill="url(#rh3)" stroke="url(#rh2)" strokeWidth="2"/>
        <ellipse cx="200" cy="146" rx="11" ry="9" fill="url(#rh1)" filter="url(#glow)"/>
        <ellipse cx="200" cy="205" rx="9" ry="7" fill="url(#rh1)" opacity=".7"/>
        <circle cx="200" cy="146" r="4" fill="url(#joint)"/>

        {/* Finger 4 — index */}
        <path d="M213 257 Q216 220 218 188 Q220 165 232 162 Q243 162 244 185 Q244 218 238 258"
          fill="url(#rh3)" stroke="url(#rh2)" strokeWidth="2"/>
        <ellipse cx="233" cy="162" rx="10" ry="8" fill="url(#rh1)" opacity=".85"/>
        <ellipse cx="228" cy="215" rx="8" ry="6" fill="url(#rh1)" opacity=".7"/>

        {/* Finger 5 — thumb */}
        <path d="M252 268 Q275 255 288 238 Q298 224 292 212 Q284 202 272 210 Q260 222 255 248"
          fill="url(#rh3)" stroke="url(#rh2)" strokeWidth="2"/>
        <ellipse cx="291" cy="211" rx="9" ry="8" fill="url(#rh1)" opacity=".85"/>

        {/* Glow dots on fingertips */}
        {[[139,200],[171,170],[200,146],[233,162],[291,211]].map(([x,y],i)=>(
          <circle key={i} cx={x} cy={y} r="3" fill="#22d3ee" opacity=".9" filter="url(#glow)"/>
        ))}

        {/* Ambient glow underneath */}
        <ellipse cx="200" cy="490" rx="80" ry="12" fill="#7c3aed" opacity=".25"/>
      </svg>
    </div>
    </div>
  </>);
}

// ── Hero title fade-in ────────────────────────────────
function HeroTitle(){
  return(<>
    <style>{`
      @keyframes titleIn {
        from { opacity:0; transform:translateY(28px); }
        to   { opacity:1; transform:translateY(0); }
      }
      .hero-title { animation: titleIn 1s ease 0.5s both; }
    `}</style>
    <h1 className="hero-title" style={{
      fontFamily:"'Bricolage Grotesque',sans-serif",
      fontSize:"clamp(46px,7vw,106px)",
      lineHeight:.88,
      letterSpacing:"-.07em",
      margin:"0 0 14px",
    }}>
      <span style={{display:"block"}}>SwahiliTech</span>
      <span style={{display:"block",background:"linear-gradient(135deg,#F5A623,#FFD17C)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Elite Academy</span>
    </h1>
  </>);
}

// ── Prompt Lab Data ───────────────────────────────────
const PROMPT_LAB_DATA = [
  {
    id:"p1",
    category:"📱 Social Media",
    emoji:"📸",
    title:"Caption ya Instagram Inayovutia",
    prompt:"Niandikia caption ya Instagram kwa biashara ya [AINA YA BIASHARA] inayouza [BIDHAA]. Itumie emoji, hashtags 5 na CTA nzuri. Lugha: Kiswahili. Toni: friendly na professional.",
    guide:[
      "Badilisha [AINA YA BIASHARA] na biashara yako — mfano: 'duka la nguo'",
      "Badilisha [BIDHAA] na bidhaa unayouza — mfano: 'madresi ya shule'",
      "Nakili prompt → Weka kwenye ChatGPT au Gemini",
      "Edit kidogo matokeo kulingana na brand yako",
    ],
    tags:["Instagram","Caption","Kiswahili"],
  },
  {
    id:"p2",
    category:"🤖 AI Business",
    emoji:"💼",
    title:"Business Plan ya Haraka",
    prompt:"Nitengenezee business plan fupi kwa biashara ya [AINA YA BIASHARA] Tanzania. Nijumuishie: muhtasari, wateja walengwa, mapato yanayotarajiwa, changamoto na mkakati wa masoko. Lugha rahisi ya Kiswahili.",
    guide:[
      "Badilisha [AINA YA BIASHARA] na idea yako ya biashara",
      "Tumia ChatGPT-4 kwa matokeo bora zaidi",
      "Omba mabadiliko kama unahitaji — 'Ongeza sehemu ya...'",
      "Print au save kama PDF kwa investors",
    ],
    tags:["Business","Planning","AI"],
  },
  {
    id:"p3",
    category:"📝 Content Creation",
    emoji:"✍️",
    title:"Script ya Video ya TikTok/Reels",
    prompt:"Niandikia script ya video ya sekunde 60 kuhusu [MADA] kwa vijana wa Tanzania. Anze na hook inayovutia, toa value 3 muhimu, malizia na CTA. Lugha: Kiswahili cha kawaida. Format: [Hook] [Point 1] [Point 2] [Point 3] [CTA]",
    guide:[
      "Badilisha [MADA] — mfano: 'jinsi ya kutumia AI kupata pesa'",
      "Hook ni muhimu — sekunde 3 za kwanza ziamue kila kitu",
      "Rekodi kwa phone yako, edit na CapCut",
      "Post wakati mzuri: 7pm-9pm Tanzania time",
    ],
    tags:["TikTok","Reels","Script"],
  },
  {
    id:"p4",
    category:"💰 Affiliate Marketing",
    emoji:"🔗",
    title:"Post ya Affiliate Deal",
    prompt:"Niandikia post ya WhatsApp/Telegram kuhusu deal ya [BIDHAA/HUDUMA] ambayo ina discount ya [DISCOUNT]. Jumuisha: bei ya zamani, bei mpya, promo code '[CODE]', na sababu 3 za kununua sasa. Lugha: Kiswahili. Iwe ya kushawishi lakini ya kweli.",
    guide:[
      "Badilisha [BIDHAA/HUDUMA], [DISCOUNT] na [CODE] na details halisi",
      "Ongeza urgency — 'Offer inaisha [TAREHE]'",
      "Tuma kwenye WhatsApp groups zako",
      "Track clicks kwa bit.ly au link shortener",
    ],
    tags:["Affiliate","WhatsApp","Marketing"],
  },
  {
    id:"p5",
    category:"🎓 Learning",
    emoji:"📚",
    title:"Muhtasari wa Kujifunza",
    prompt:"Nielezeee [MADA/CONCEPT] kwa lugha rahisi kama ninaelezea mtu wa miaka 15 Tanzania. Tumia: mfano wa kawaida wa maisha ya Tanzania, hatua 5 za kuelewa, na quiz ya maswali 3 mwishowe. Jibu kwa Kiswahili.",
    guide:[
      "Tumia hii kujifunza topics ngumu — coding, finance, AI",
      "Omba mifano zaidi kama hauelewi",
      "Fanya quiz ili ujipime",
      "Save muhtasari kwenye Notion au notes yako",
    ],
    tags:["Learning","Study","Education"],
  },
  {
    id:"p6",
    category:"📧 Professional",
    emoji:"📨",
    title:"Barua Pepe ya Professional",
    prompt:"Niandikia barua pepe ya professional kwa [MPOKEAJI/KAMPUNI] nikitaka [LENGO - mfano: partnership, kazi, meeting]. Niwe confident lakini humble. Jumuisha: utambulisho wangu, sababu ninawasiliana, ombi wazi, na shukrani. Lugha: Kiingereza (professional).",
    guide:[
      "Badilisha [MPOKEAJI/KAMPUNI] na jina la mtu/kampuni",
      "Badilisha [LENGO] na unachotaka — 'nafasi ya kazi', 'collaboration'",
      "Soma mara 2 kabla kutuma — angalia spelling",
      "Follow up baada ya siku 3-5 kama hakuna jibu",
    ],
    tags:["Email","Professional","Career"],
  },
];

// ── Prompt Lab Page ───────────────────────────────────
function PromptLabPage(){
  const [copied, setCopied] = useState(null);
  const [openGuide, setOpenGuide] = useState(null);
  const [filter, setFilter] = useState("All");
  const { docs: liveDocs, loading } = useCollection("prompts");

  const categories = ["All", "📱 Social Media", "🤖 AI Business", "📝 Content Creation", "💰 Affiliate Marketing", "🎓 Learning", "📧 Professional"];

  // Use live Firestore data if available, otherwise use fallback
  const allPrompts = liveDocs.length > 0 ? liveDocs : PROMPT_LAB_DATA;
  const filtered = filter === "All" ? allPrompts : allPrompts.filter(p=>p.category===filter);

  const copyPrompt = (id, text) => {
    navigator.clipboard.writeText(text).then(()=>{
      setCopied(id);
      setTimeout(()=>setCopied(null), 2500);
    });
  };

  return(
    <section style={{padding:"26px 0"}}>
      <W>
        {/* Lightbox */}
        {lightbox && (
          <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,zIndex:800,background:"rgba(0,0,0,.92)",backdropFilter:"blur(20px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{position:"relative",maxWidth:900,width:"100%"}}>
              <button onClick={()=>setLightbox(null)} style={{position:"absolute",top:-44,right:0,border:"none",background:"rgba(255,255,255,.1)",color:"#fff",borderRadius:10,padding:"8px 16px",cursor:"pointer",fontWeight:700}}>✕ Funga</button>
              <img src={lightbox} alt="Preview" style={{width:"100%",borderRadius:20,boxShadow:"0 32px 80px rgba(0,0,0,.6)"}}/>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{marginBottom:32}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,borderRadius:999,padding:"8px 16px",border:"1px solid rgba(138,43,226,.3)",background:"rgba(138,43,226,.1)",color:"#a78bfa",fontSize:11,fontWeight:900,textTransform:"uppercase",letterSpacing:".12em",marginBottom:16}}>
            ⚗️ PROMPT & WORKFLOW LAB
          </div>
          <h2 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:"clamp(28px,3vw,44px)",letterSpacing:"-.04em",margin:"0 0 10px"}}>
            Prompts Bora <span style={{color:"#F5A623"}}>za Kazi</span>
          </h2>
          <p style={{color:"rgba(255,255,255,.5)",fontSize:15,lineHeight:1.8,maxWidth:640,margin:0}}>
            Copy prompts zilizoundwa maalum kwa Watanzania — kwa biashara, content creation, kujifunza na zaidi. Kila prompt ina step-by-step guide.
          </p>
        </div>

        {/* Category Filter */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:28,overflowX:"auto",paddingBottom:4}}>
          {categories.map(c=>(
            <button key={c} onClick={()=>setFilter(c)}
              style={{border:`1px solid ${filter===c?"rgba(245,166,35,.5)":"rgba(255,255,255,.1)"}`,borderRadius:999,padding:"8px 16px",background:filter===c?"rgba(245,166,35,.15)":"rgba(255,255,255,.04)",color:filter===c?"#F5A623":"rgba(255,255,255,.6)",fontWeight:700,fontSize:13,cursor:"pointer",whiteSpace:"nowrap",transition:"all .2s"}}>
              {c}
            </button>
          ))}
        </div>

        {/* Prompt Cards Grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:22}}>
          {filtered.map(item=>(
            <div key={item.id} style={{borderRadius:22,border:"1px solid rgba(255,255,255,.08)",background:"#141823",overflow:"hidden",transition:"border-color .25s,transform .25s",boxShadow:"0 8px 32px rgba(0,0,0,.2)"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(138,43,226,.35)";e.currentTarget.style.transform="translateY(-4px)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.08)";e.currentTarget.style.transform="";}}>

              {/* Card header */}
              <div style={{padding:"18px 20px 14px",background:"linear-gradient(135deg,rgba(138,43,226,.12),rgba(6,182,212,.08))",borderBottom:"1px solid rgba(255,255,255,.06)",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:48,height:48,borderRadius:14,background:"linear-gradient(135deg,rgba(138,43,226,.3),rgba(6,182,212,.2))",display:"grid",placeItems:"center",fontSize:24,flexShrink:0}}>{item.emoji}</div>
                <div>
                  <div style={{fontSize:11,fontWeight:800,color:"#a78bfa",letterSpacing:".06em",textTransform:"uppercase",marginBottom:3}}>{item.category}</div>
                  <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:16,fontWeight:800,letterSpacing:"-.02em"}}>{item.title}</div>
                </div>
              </div>

              {/* Prompt text */}
              <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
                <div style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>📋 Prompt</div>
                <p style={{color:"rgba(255,255,255,.7)",fontSize:13,lineHeight:1.75,margin:"0 0 14px",fontFamily:"monospace",background:"rgba(255,255,255,.04)",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(255,255,255,.06)"}}>
                  {item.prompt}
                </p>

                {/* Copy button */}
                <button onClick={()=>copyPrompt(item.id, item.prompt)}
                  style={{width:"100%",height:44,borderRadius:12,border:"none",background:copied===item.id?"linear-gradient(135deg,#10b981,#059669)":"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:900,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .2s"}}>
                  {copied===item.id ? "✅ Imenakiliwa!" : "📋 Copy Prompt"}
                </button>
              </div>

              {/* Tags */}
              <div style={{padding:"12px 20px",display:"flex",gap:8,flexWrap:"wrap",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
                {item.tags.map((t,i)=>(
                  <span key={i} style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:99,background:"rgba(138,43,226,.12)",color:"#a78bfa",border:"1px solid rgba(138,43,226,.2)"}}>{t}</span>
                ))}
              </div>

              {/* Step-by-step accordion */}
              <div style={{padding:"0"}}>
                <button onClick={()=>setOpenGuide(openGuide===item.id?null:item.id)}
                  style={{width:"100%",padding:"14px 20px",border:"none",background:"transparent",color:"rgba(255,255,255,.6)",fontWeight:800,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"color .2s"}}
                  onMouseEnter={e=>e.currentTarget.style.color="#F5A623"}
                  onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.6)"}>
                  <span>📖 Jinsi ya Kutumia</span>
                  <span style={{transition:"transform .25s",transform:openGuide===item.id?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
                </button>
                {openGuide===item.id && (
                  <div style={{padding:"0 20px 20px",borderTop:"1px solid rgba(255,255,255,.06)"}}>
                    <div style={{display:"grid",gap:8,marginTop:14}}>
                      {item.guide.map((step,i)=>(
                        <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                          <span style={{width:24,height:24,borderRadius:8,background:"linear-gradient(135deg,#F5A623,#FFD17C)",display:"grid",placeItems:"center",color:"#111",fontWeight:900,fontSize:11,flexShrink:0,marginTop:1}}>{i+1}</span>
                          <span style={{fontSize:13,color:"rgba(255,255,255,.65)",lineHeight:1.65}}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div style={{marginTop:48,borderRadius:24,border:"1px solid rgba(138,43,226,.2)",background:"linear-gradient(135deg,rgba(138,43,226,.08),rgba(6,182,212,.05))",padding:"32px 28px",display:"flex",gap:24,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:260}}>
            <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:24,margin:"0 0 8px",letterSpacing:"-.03em"}}>Unataka Prompts Zaidi? 🚀</h3>
            <p style={{color:"rgba(255,255,255,.5)",fontSize:15,margin:0,lineHeight:1.7}}>Jiunge na STEA community — tunatuma prompts mpya na workflow guides kila wiki bure.</p>
          </div>
          <a href="https://wa.me/8619715852043?text=Nataka+prompts+zaidi+za+STEA" target="_blank" rel="noreferrer"
            style={{display:"inline-flex",alignItems:"center",gap:10,padding:"14px 24px",borderRadius:16,background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",fontWeight:900,fontSize:15,textDecoration:"none",flexShrink:0}}>
            💬 Jiunge WhatsApp →
          </a>
        </div>
      </W>
    </section>
  );
}

function HomePage({goPage}){
  const { docs: tips, loading: tipsLoading } = useCollection("tips", "createdAt");
  const { docs: updates, loading: updatesLoading } = useCollection("updates", "createdAt");

  const [art, setArt] = useState(null);
  const [vid, setVid] = useState(null);

  const featuredTips = tips.length > 0 ? tips.slice(0, 3) : FALLBACK_TIPS.slice(0, 3);
  const featuredUpdates = updates.length > 0 ? updates.slice(0, 3) : FALLBACK_UPDATES.slice(0, 3);

  return(<section style={{padding:"22px 0 16px"}}><W>
    {art && <ArticleModal article={art} onClose={() => setArt(null)} />}
    {vid && <VideoModal video={vid} onClose={() => setVid(null)} />}

    <div style={{marginBottom:16,borderRadius:20,border:"1px dashed rgba(245,166,35,.22)",background:"rgba(245,166,35,.06)",padding:"13px 18px",textAlign:"center",color:"rgba(255,255,255,.55)",fontSize:14}}>📢 Nafasi ya Google AdSense — matangazo kwa mapato ya STEA</div>
    <div style={{position:"relative",overflow:"hidden",borderRadius:30,border:"1px solid rgba(255,255,255,.07)",padding:"clamp(30px,5vw,62px) clamp(20px,4vw,52px) clamp(36px,5vw,54px)",background:"radial-gradient(circle at 18% 22%,rgba(245,166,35,.15),transparent 22%),radial-gradient(circle at 78% 28%,rgba(91,200,255,.17),transparent 24%),linear-gradient(135deg,#0d1019,#090b12,#0f1320)",boxShadow:"0 28px 80px rgba(0,0,0,.4)"}}>
      <StarCanvas/>
      <div style={{position:"relative",zIndex:2,maxWidth:680}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:8,borderRadius:999,padding:"8px 16px",border:"1px solid rgba(245,166,35,.22)",background:"rgba(245,166,35,.08)",color:G,fontSize:11,fontWeight:900,textTransform:"uppercase",letterSpacing:".12em",marginBottom:18}}>🚀 STEA · Learn · Build · Grow · Tanzania</div>
        <h1 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:"clamp(46px,7vw,106px)",lineHeight:.88,letterSpacing:"-.07em",margin:"0 0 14px"}}><span style={{display:"block"}}>SwahiliTech</span><span style={{display:"block",background:"linear-gradient(135deg,#F5A623,#FFD17C)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Elite Academy</span></h1>
        <div style={{fontSize:"clamp(15px,2vw,28px)",fontWeight:800,letterSpacing:"-.03em",color:"rgba(255,255,255,.86)",margin:"0 0 6px"}}>Teknolojia kwa Kiswahili 🇹🇿</div>
        <TypedText/>
        <p style={{maxWidth:560,lineHeight:1.9,color:"rgba(255,255,255,.65)",fontSize:15,margin:0}}>STEA inaleta tech tips, updates, deals, electronics, websites za kijanja na kozi za kisasa kwa lugha rahisi ya Kiswahili — platform ya kwanza ya tech kwa Watanzania.</p>
        <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:28,alignItems:"center"}}>
          <PushBtn onClick={()=>goPage("tips")}>⚡ Explore Content →</PushBtn>
          <button onClick={()=>goPage("courses")} style={{border:"1px solid rgba(255,255,255,.14)",cursor:"pointer",borderRadius:18,padding:"14px 26px",fontWeight:900,fontSize:15,color:"#fff",background:"rgba(255,255,255,.05)"}}>🎓 Angalia Kozi</button>
        </div>
        <div style={{marginTop:38,display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderRadius:24,overflow:"hidden",border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.05)",backdropFilter:"blur(10px)",maxWidth:620}}>
          {[{v:<Counter target={200}/>,l:"Monthly Readers"},{v:<Counter target={1200}/>,l:"Articles"},{v:<Counter target={45}/>,l:"TZ Creators"},{v:"24/7",l:"Live Updates"}].map((st,i)=>(<div key={i} style={{padding:"18px 10px",textAlign:"center",borderRight:i<3?"1px solid rgba(255,255,255,.08)":"none"}}><div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:"clamp(20px,2.6vw,32px)",color:G,marginBottom:5,fontWeight:800}}>{st.v}</div><div style={{fontSize:11,color:"rgba(255,255,255,.42)",fontWeight:700,lineHeight:1.3}}>{st.l}</div></div>))}
        </div>
      </div>
    </div>

    {/* Featured Tech Tips */}
    <div style={{marginTop:64}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:24,gap:16,flexWrap:"wrap"}}>
        <SHead title="Featured" hi="Tech Tips" copy="Maujanja ya Android, AI na PC kwa Kiswahili."/>
        <button onClick={()=>goPage("tips")} style={{border:"none",background:"transparent",color:G,fontWeight:800,fontSize:14,cursor:"pointer",padding:"10px 0"}}>View All Tips →</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:22}}>
        {tipsLoading ? [1,2,3].map(i=><Skeleton key={i}/>) : featuredTips.map(item => (
          item.type === "video" ? 
            <VideoCard key={item.id} item={item} onPlay={setVid} collection="tips"/> :
            <ArticleCard key={item.id} item={item} onRead={setArt} collection="tips"/>
        ))}
      </div>
    </div>

    {/* Featured Tech Updates */}
    <div style={{marginTop:64}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:24,gap:16,flexWrap:"wrap"}}>
        <SHead title="Latest" hi="Tech Updates" copy="Habari mpya za tech kutoka kila pembe ya dunia."/>
        <button onClick={()=>goPage("habari")} style={{border:"none",background:"transparent",color:G,fontWeight:800,fontSize:14,cursor:"pointer",padding:"10px 0"}}>View All News →</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:22}}>
        {updatesLoading ? [1,2,3].map(i=><Skeleton key={i}/>) : featuredUpdates.map(item => (
          <TiltCard key={item.id}>
            <div style={{padding:"16px 18px 10px",background:"linear-gradient(135deg,rgba(245,166,35,.08),rgba(255,255,255,.02)),linear-gradient(180deg,#1e2030,#161820)",display:"flex",gap:12,alignItems:"flex-start"}}>
              <div style={{fontSize:42,filter:"drop-shadow(0 4px 12px rgba(0,0,0,.5))"}}>{item.thumb}</div>
              <div><span style={{display:"inline-block",padding:"4px 10px",borderRadius:999,fontSize:11,fontWeight:800,...BS.gold}}>{item.badge}</span><div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:4}}>{item.category}</div></div>
            </div>
            <div style={{padding:18}}>
              <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:17,margin:"0 0 9px",letterSpacing:"-.03em",lineHeight:1.25}}>{item.title}</h3>
              <p style={{color:"rgba(255,255,255,.62)",fontSize:14,lineHeight:1.75,margin:"0 0 12px"}}>{item.summary}</p>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:14}}>
                <span style={{color:G,fontSize:12,fontWeight:800}}>👁 {fmtViews(item.views)}</span>
                {item.createdAt && <span style={{color:"#75c5ff",fontSize:12,fontWeight:800}}>{timeAgo(item.createdAt)}</span>}
              </div>
              <GoldBtn onClick={()=>{if(item.id&&!item.id.startsWith("u"))incrementViews("updates",item.id);setArt(item);}} style={{fontSize:13,padding:"9px 16px"}}>📖 Soma Zaidi →</GoldBtn>
            </div>
          </TiltCard>
        ))}
      </div>
    </div>

    <div style={{marginTop:64,display:"flex",gap:12,flexWrap:"wrap"}}>
      <a href="mailto:swahilitecheliteacademy@gmail.com" style={{display:"inline-flex",alignItems:"center",gap:7,padding:"8px 15px",borderRadius:11,border:"1px solid rgba(245,166,35,.2)",background:"rgba(245,166,35,.07)",color:G,fontSize:13,fontWeight:700,textDecoration:"none"}}>✉️ swahilitecheliteacademy@gmail.com</a>
      <a href="https://wa.me/8619715852043" target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:7,padding:"8px 15px",borderRadius:11,border:"1px solid rgba(37,211,102,.2)",background:"rgba(37,211,102,.07)",color:"#25d366",fontSize:13,fontWeight:700,textDecoration:"none"}}>💬 WhatsApp STEA</a>
    </div>
  </W></section>);
}

// ════════════════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════════════════


export default function App(){
  const[page,setPage]=useState("home");
  const[loaded,setLoaded]=useState(false);
  const[user,setUser]=useState(null);
  const[authOpen,setAuthOpen]=useState(false);
  const[adminOpen,setAdminOpen]=useState(false);
  const[mobileOpen,setMobileOpen]=useState(false);
  const[searchOpen,setSearchOpen]=useState(false);
  const[notifOpen,setNotifOpen]=useState(false);
  const[searchQ,setSearchQ]=useState("");
  const[scrollPct,setScrollPct]=useState(0);
  const[showTop,setShowTop]=useState(false);
  const[newsEmail,setNewsEmail]=useState("");

  useEffect(()=>{
    initFirebase();
    const t=setTimeout(()=>setLoaded(true),2200);
    const unsub=onAuthStateChanged(getFirebaseAuth(), async (u)=>{
      if(u) {
        const db = getFirebaseDb();
        let role = "user";
        if (u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          role = "admin";
        } else if (db) {
          try {
            const s = await getDoc(doc(db, "users", u.uid));
            if (s.exists()) role = s.data().role || "user";
          } catch (e) {
            console.error("Error fetching user role:", e);
          }
        }
        setUser({ ...u, role });
      } else {
        setUser(null);
      }
    });
    return()=>{clearTimeout(t);unsub();};
  }, []);

  useEffect(()=>{
    const fn=()=>{
      const h=document.documentElement.scrollHeight-window.innerHeight;
      setScrollPct(h>0?(window.scrollY/h)*100:0);
      setShowTop(window.scrollY>400);
    };
    window.addEventListener("scroll",fn);
    return ()=>window.removeEventListener("scroll",fn);
  },[]);

  useEffect(()=>{
    console.log("Current User State:", user);
  }, [user]);

  const goPage=(p)=>{setPage(p);window.scrollTo(0,0);setMobileOpen(false);};
  const handleLogout=async()=>{
    try {
      await signOut(getFirebaseAuth());
      setUser(null);
      setPage("home");
      setAdminOpen(false);
      setAuthOpen(false);
    } catch (e) {
      console.error("Logout error:", e);
    }
  };

  const PAGES = {
    home: <HomePage goPage={goPage}/>,
    tips: <TipsPage/>,
    habari: <UpdatesPage/>,
    deals: <DealsPage/>,
    courses: <CoursesPage/>,
    duka: <DukaPage/>,
    websites: <WebsitesPage/>,
    lab: <PromptLabPage/>,
  };

  return (
    <ErrorBoundary>
      {adminOpen ? (
        <div style={{fontFamily:"'Instrument Sans',system-ui,sans-serif",color:"#fff",minHeight:"100vh",background:"#0a0b0f"}}>
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=Instrument+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}input::placeholder{color:rgba(255,255,255,.28)}textarea::placeholder{color:rgba(255,255,255,.28)}`}</style>
          <AdminPanel user={user} onBack={()=>setAdminOpen(false)}/>
        </div>
      ) : (
        <div style={{fontFamily:"'Instrument Sans',system-ui,sans-serif",color:"#fff",minHeight:"100vh",overflowX:"hidden",background:"radial-gradient(circle at 14% 12%,rgba(245,166,35,.12),transparent 18%),radial-gradient(circle at 84% 22%,rgba(86,183,255,.12),transparent 20%),linear-gradient(180deg,#05060a,#080a11)"}}>
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&family=Instrument+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}@keyframes blink{50%{opacity:0}}@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes logoPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,166,35,.45)}50%{box-shadow:0 0 0 18px rgba(245,166,35,0)}}@keyframes loadBar{0%{width:0%}60%{width:65%}100%{width:100%}}@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(245,166,35,.28);border-radius:3px}input::placeholder{color:rgba(255,255,255,.28)}a{text-decoration:none;color:inherit}nav::-webkit-scrollbar{display:none}@media(max-width:900px){#desktopNav{display:none!important}}@media(min-width:901px){#hamburger{display:none!important}}`}</style>

          <LoadingScreen done={loaded}/>
          <div style={{position:"fixed",left:0,top:0,height:3,width:`${scrollPct}%`,zIndex:400,background:`linear-gradient(90deg,${G},${G2})`,boxShadow:`0 0 12px rgba(245,166,35,.6)`,transition:"width .1s",pointerEvents:"none"}}/>

          {/* Ticker */}
          <div style={{background:`linear-gradient(90deg,${G},${G2})`,color:"#111",padding:"9px 0",overflow:"hidden",whiteSpace:"nowrap",fontSize:13,fontWeight:800,userSelect:"none"}}>
            <div style={{display:"inline-flex",gap:32,animation:"ticker 26s linear infinite"}}>
              {["🔥 Tech Tips mpya kila siku","🤖 AI & ChatGPT kwa Kiswahili","📱 Android, iPhone na PC Hacks","🛍️ Deals za Tanzania","🎓 Kozi za STEA kwa M-Pesa","⚡ SwahiliTech Elite Academy — STEA","🔥 Tech Tips mpya kila siku","🤖 AI & ChatGPT kwa Kiswahili","📱 Android, iPhone na PC Hacks","🛍️ Deals za Tanzania","🎓 Kozi za STEA kwa M-Pesa","⚡ SwahiliTech Elite Academy — STEA"].map((t,i)=><span key={i}>{t}</span>)}
            </div>
          </div>

          {/* Topbar */}
          <div style={{position:"sticky",top:0,zIndex:300,backdropFilter:"blur(20px)",background:"rgba(7,8,13,.78)",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
            <div style={{maxWidth:1180,margin:"0 auto",padding:"0 14px",minHeight:76,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,position:"relative"}}>
              <div onClick={()=>goPage("home")} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",flexShrink:0,userSelect:"none"}}>
                <div style={{width:46,height:46,borderRadius:14,display:"grid",placeItems:"center",background:`linear-gradient(135deg,${G},${G2})`,color:"#111",boxShadow:"0 10px 24px rgba(245,166,35,.25)",flexShrink:0}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg></div>
                <div><strong style={{display:"block",fontSize:18,lineHeight:1,letterSpacing:"-.04em",fontWeight:800}}>STEA</strong><span style={{display:"block",marginTop:3,color:"rgba(255,255,255,.38)",fontSize:10,letterSpacing:".03em"}}>Tanzania&apos;s Tech Platform</span></div>
              </div>

              <nav id="desktopNav" style={{flex:1,display:"flex",justifyContent:"center",minWidth:0}}>
                <div style={{display:"flex",gap:3,alignItems:"center",padding:"5px",border:"1px solid rgba(255,255,255,.07)",background:"rgba(255,255,255,.04)",borderRadius:999,overflow:"auto",scrollbarWidth:"none"}}>
                  {NAV.map(n=>(<button key={n.id} onClick={()=>goPage(n.id)} style={{border:"none",background:page===n.id?`linear-gradient(135deg,${G},${G2})`:"transparent",color:page===n.id?"#111":"rgba(255,255,255,.68)",padding:"9px 12px",borderRadius:999,fontSize:13,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap",transition:"all .2s",boxShadow:page===n.id?"0 6px 16px rgba(245,166,35,.18)":"none"}}>{n.label}</button>))}
                </div>
              </nav>

              <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                <button onClick={()=>setSearchOpen(true)} style={{width:40,height:40,borderRadius:12,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.65)",cursor:"pointer",fontSize:19,display:"grid",placeItems:"center",flexShrink:0}}>⌕</button>
                <div style={{position:"relative",flexShrink:0}}>
                  <button onClick={()=>setNotifOpen(v=>!v)} style={{width:40,height:40,borderRadius:12,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.65)",cursor:"pointer",fontSize:17,display:"grid",placeItems:"center"}}>🔔</button>
                  {notifOpen&&(<div style={{position:"absolute",right:0,top:"calc(100% + 10px)",width:290,borderRadius:18,border:"1px solid rgba(255,255,255,.12)",background:"rgba(14,16,26,.98)",boxShadow:"0 24px 60px rgba(0,0,0,.45)",padding:12,zIndex:500}}>
                    {[{t:"Deal mpya imeingia",b:"Angalia deals zetu mpya."},{t:"Kozi mpya iko active",b:"AI & ChatGPT Mastery iko tayari."},{t:"Habari mpya za tech",b:"Angalia Tech Updates za leo."}].map((n,i)=>(<div key={i} style={{padding:"11px 12px",borderRadius:12,border:"1px solid rgba(255,255,255,.06)",background:"rgba(255,255,255,.04)",marginTop:i>0?8:0}}><div style={{fontWeight:800,marginBottom:3,fontSize:14}}>{n.t}</div><div style={{fontSize:13,color:"rgba(255,255,255,.55)",lineHeight:1.55}}>{n.b}</div></div>))}
                  </div>)}
                </div>
                {user?<UserChip user={user} onLogout={handleLogout} onAdmin={()=>setAdminOpen(true)}/>:<button onClick={()=>setAuthOpen(true)} style={{height:40,padding:"0 16px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${G},${G2})`,color:"#111",fontWeight:900,cursor:"pointer",fontSize:13,whiteSpace:"nowrap",flexShrink:0}}>Ingia</button>}
                <button id="hamburger" onClick={()=>setMobileOpen(v=>!v)} style={{width:40,height:40,borderRadius:12,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.04)",color:"rgba(255,255,255,.65)",cursor:"pointer",fontSize:18,display:"grid",placeItems:"center",flexShrink:0}}>{mobileOpen?"✕":"☰"}</button>
              </div>

              {mobileOpen&&(<div style={{position:"absolute",left:0,right:0,top:"calc(100% + 6px)",borderRadius:20,border:"1px solid rgba(255,255,255,.12)",background:"rgba(12,14,22,.98)",boxShadow:"0 24px 60px rgba(0,0,0,.5)",padding:14,zIndex:400}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                  {NAV.map(n=>(<button key={n.id} onClick={()=>goPage(n.id)} style={{border:"1px solid rgba(255,255,255,.08)",background:page===n.id?`linear-gradient(135deg,${G},${G2})`:"rgba(255,255,255,.04)",color:page===n.id?"#111":"rgba(255,255,255,.68)",borderRadius:13,padding:"12px 14px",textAlign:"left",fontWeight:800,cursor:"pointer",fontSize:14}}>{n.label}</button>))}
                </div>
              </div>)}
            </div>
          </div>

          {/* Search */}
          {searchOpen&&(<div onClick={e=>{if(e.target===e.currentTarget)setSearchOpen(false);}} style={{position:"fixed",inset:0,zIndex:600,background:"rgba(4,5,9,.84)",backdropFilter:"blur(18px)",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"88px 16px 20px"}}>
            <div style={{width:"min(680px,100%)",borderRadius:24,border:"1px solid rgba(255,255,255,.12)",background:"rgba(12,14,22,.97)",boxShadow:"0 32px 80px rgba(0,0,0,.55)",overflow:"hidden"}}>
              <div style={{padding:16}}><input autoFocus value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search STEA — tips, deals, courses, websites..." style={{width:"100%",height:52,borderRadius:14,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.05)",color:"#fff",padding:"0 16px",outline:"none",fontSize:15,fontFamily:"inherit"}}/></div>
              <div style={{padding:"0 16px 16px",display:"grid",gap:7}}>
                {NAV.filter(n=>!searchQ||n.label.toLowerCase().includes(searchQ.toLowerCase())).map(n=>(<div key={n.id} onClick={()=>goPage(n.id)} style={{border:"1px solid rgba(255,255,255,.06)",background:"rgba(255,255,255,.04)",borderRadius:13,padding:"12px 16px",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.08)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.04)"}><strong style={{display:"block",marginBottom:3,fontSize:15}}>{n.label}</strong><span style={{fontSize:13,color:"rgba(255,255,255,.45)"}}>STEA — {n.label} section</span></div>))}
              </div>
            </div>
          </div>)}

          {authOpen&&<AuthModal onClose={()=>setAuthOpen(false)} onUser={(u)=>{setUser(u);setAuthOpen(false);}}/>}

          <main>{PAGES[page]||PAGES.home}</main>

          {/* Newsletter */}
          <div style={{maxWidth:1180,margin:"0 auto",padding:"0 14px 44px"}}>
            <div style={{padding:28,borderRadius:22,border:"1px solid rgba(255,255,255,.1)",background:"linear-gradient(180deg,#151823,#10131c)"}}>
              <h3 style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:26,margin:"0 0 8px"}}>Jiunge na Newsletter ya STEA</h3>
              <p style={{color:"rgba(255,255,255,.55)",margin:"0 0 16px",fontSize:15}}>Pata tech tips, deals na updates kila wiki bila malipo.</p>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <input value={newsEmail} onChange={e=>setNewsEmail(e.target.value)} type="email" placeholder="Email yako" style={{flex:1,minWidth:200,height:48,borderRadius:13,border:"1px solid rgba(255,255,255,.1)",background:"rgba(255,255,255,.05)",color:"#fff",padding:"0 14px",outline:"none",fontFamily:"inherit",fontSize:14}}/>
                <GoldBtn onClick={()=>{if(!newsEmail.includes("@")){alert("Weka email sahihi kwanza");return;}alert("✅ Asante! Umejiunga na STEA Newsletter.");setNewsEmail("");}}>Subscribe</GoldBtn>
              </div>
            </div>
          </div>

          <footer style={{padding:"20px 14px 64px",textAlign:"center",color:"rgba(255,255,255,.38)",fontSize:14,borderTop:"1px solid rgba(255,255,255,.06)"}}>
            <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontSize:18,color:"rgba(255,255,255,.65)",fontWeight:800,marginBottom:8}}>SwahiliTech Elite Academy — <span style={{color:G}}>STEA</span></div>
            <div style={{marginBottom:10}}>Teknolojia kwa Kiswahili 🇹🇿 · © 2026 STEA</div>
            <div style={{display:"flex",gap:18,justifyContent:"center",flexWrap:"wrap"}}>
              <a href="mailto:swahilitecheliteacademy@gmail.com" style={{color:G,fontWeight:700}}>✉️ swahilitecheliteacademy@gmail.com</a>
              <a href="https://wa.me/8619715852043" target="_blank" rel="noreferrer" style={{color:"#25d366",fontWeight:700}}>💬 WhatsApp STEA</a>
            </div>
          </footer>

          {showTop&&<button onClick={()=>window.scrollTo({top:0,behavior:"smooth"})} style={{position:"fixed",right:18,bottom:82,zIndex:200,width:46,height:46,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid rgba(245,166,35,.3)",background:"rgba(12,14,24,.92)",color:G,cursor:"pointer",fontSize:20,boxShadow:"0 8px 24px rgba(0,0,0,.35)"}}>↑</button>}
          
          {/* Floating WhatsApp Button */}
          <a href="https://wa.me/8619715852043?text=Habari+STEA,+nina+swali..." target="_blank" rel="noreferrer" 
            style={{position:"fixed",right:18,bottom:18,zIndex:200,width:54,height:54,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"#25D366",color:"#fff",fontSize:28,boxShadow:"0 12px 32px rgba(37,211,102,.4)",transition:"transform .3s"}}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1) rotate(8deg)"}
            onMouseLeave={e=>e.currentTarget.style.transform="scale(1) rotate(0deg)"}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
          </a>
        </div>
      )}
    </ErrorBoundary>
  );
}
