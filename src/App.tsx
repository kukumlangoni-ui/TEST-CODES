/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  serverTimestamp,
  doc,
  setDoc,
  getDocFromServer,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { db, auth } from './firebase';
import { 
  Bolt, 
  Search, 
  Bell, 
  Menu, 
  X, 
  Moon, 
  Sun, 
  ChevronUp, 
  ArrowRight, 
  Smartphone, 
  Cpu, 
  Monitor, 
  Heart, 
  Bookmark, 
  Copy, 
  Mail,
  MessageSquare,
  Trash2,
  Edit3,
  Plus,
  Save,
  Undo,
  LayoutDashboard,
  ShieldCheck,
  ChevronDown,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Toaster, toast } from 'sonner';
import ChatWidget from './ChatWidget';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Types ---
interface TechTip {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  views: number;
  createdAt: any;
}

interface Deal {
  id: string;
  title: string;
  description: string;
  oldPrice: string;
  newPrice: string;
  savePercent: string;
  promoCode?: string;
  link: string;
  category: string;
  icon: string;
  bgClass: string;
}

interface Course {
  id: string;
  title: string;
  description: string;
  price: string;
  type: 'free' | 'paid';
  lessons: string[];
  emoji: string;
}

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error?.message?.includes('Firestore Error')) {
        setHasError(true);
        try {
          const info = JSON.parse(event.error.message);
          setErrorMsg(`Database error: ${info.error}`);
        } catch {
          setErrorMsg('An unexpected database error occurred.');
        }
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07080d] p-4 text-center">
        <div className="bg-[#141823] border border-red-500/30 p-8 rounded-3xl max-w-md">
          <h2 className="text-2xl font-bold text-red-500 mb-4">Something went wrong</h2>
          <p className="text-gray-400 mb-6">{errorMsg}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-gold px-6 py-3 rounded-xl font-bold text-black"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [activePage, setActivePage] = useState('home');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newsletterEmail, setNewsletterEmail] = useState('');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Data states
  const [tips, setTips] = useState<TechTip[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Hero Animation states
  const [isHeroAnimComplete, setIsHeroAnimComplete] = useState(false);
  const [showTitle, setShowTitle] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Sync user to firestore
        const userRef = doc(db, 'users', u.uid);
        const userData: any = {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName || fullName,
          photoURL: u.photoURL,
          lastLogin: serverTimestamp()
        };
        
        if (u.email === 'swahilitecheliteacademy@gmail.com') {
          userData.role = 'admin';
        }

        setDoc(userRef, userData, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${u.uid}`));
      }
    });

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    return () => unsubscribe();
  }, [fullName]);

  useEffect(() => {
    const handleScroll = () => {
      const top = document.documentElement.scrollTop || document.body.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const pct = height > 0 ? (top / height) * 100 : 0;
      setScrollProgress(pct);
      setShowBackToTop(top > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch tips
  useEffect(() => {
    const q = query(collection(db, 'tips'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TechTip));
      setTips(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tips'));
    return () => unsub();
  }, []);

  // Fetch deals
  useEffect(() => {
    const q = query(collection(db, 'deals'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Deal));
      setDeals(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'deals'));
    return () => unsub();
  }, []);

  // Fetch courses
  useEffect(() => {
    const q = query(collection(db, 'courses'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
      setCourses(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'courses'));
    return () => unsub();
  }, []);

  // Fetch prompts
  useEffect(() => {
    const q = query(collection(db, 'prompts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPrompts(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'prompts'));
    return () => unsub();
  }, []);

  // Fetch settings and update favicon
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'settings'), (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        if (data.faviconUrl) {
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = data.faviconUrl;
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'settings'));
    return () => unsub();
  }, []);

  // Hero Animation Timers
  useEffect(() => {
    const timer1 = setTimeout(() => setIsHeroAnimComplete(true), 4000);
    const timer2 = setTimeout(() => setShowTitle(true), 4500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const seedData = async () => {
    if (user?.email !== 'swahilitecheliteacademy@gmail.com') return;
    
    try {
      // Seed Courses
      const initialCourses = [
        { title: 'Computer Basics', type: 'free', emoji: '💻', lessons: ['Desktop na file management', 'Email, browser na internet safety', 'Basic productivity tools'], price: 'Bure', description: 'Jifunze misingi ya kutumia kompyuta kwa ufasaha na usalama.', createdAt: serverTimestamp() },
        { title: 'AI & ChatGPT Mastery', type: 'paid', emoji: '🤖', lessons: ['Prompt systems', 'Business use cases', 'Client workflows'], price: 'TZS 5,000/mwezi', description: 'Tumia nguvu ya AI kurahisisha kazi zako na kuongeza kipato.', createdAt: serverTimestamp() },
        { title: 'Web Development', type: 'paid', emoji: '🌐', lessons: ['HTML + CSS foundation', 'Responsive layouts', 'GitHub Pages deployment'], price: 'TZS 5,000/mwezi', description: 'Jifunze kutengeneza websites za kisasa kuanzia mwanzo.', createdAt: serverTimestamp() },
        { title: 'Graphic Design for Beginners', type: 'paid', emoji: '🎨', lessons: ['Canva Mastery', 'Color Theory', 'Layout Design'], price: 'TZS 5,000/mwezi', description: 'Tengeneza graphics za kuvutia kwa ajili ya biashara na mitandao ya kijamii.', createdAt: serverTimestamp() },
        { title: 'Digital Marketing', type: 'free', emoji: '📈', lessons: ['Social Media Growth', 'Content Strategy', 'Personal Branding'], price: 'Bure', description: 'Jifunze jinsi ya kukuza brand yako na kufikia wateja wengi mtandaoni.', createdAt: serverTimestamp() }
      ];

      for (const course of initialCourses) {
        await addDoc(collection(db, 'courses'), course);
      }

      // Seed Deals
      const initialDeals = [
        { title: 'Canva Pro Deal', oldPrice: '$15/mo', newPrice: '$6/mo', savePercent: '60%', promoCode: 'STACA60', link: 'https://canva.com', category: 'Design', icon: '🎨', bgClass: 'bg-gradient-to-br from-[#00c4cc] to-[#7d2ae8]', createdAt: serverTimestamp() },
        { title: 'NordVPN Premium', oldPrice: '$12.99/mo', newPrice: '$3.19/mo', savePercent: '75%', promoCode: 'SAFE24', link: 'https://nordvpn.com', category: 'Security', icon: '🛡️', bgClass: 'bg-gradient-to-br from-[#1a56db] to-[#0e9f6e]', createdAt: serverTimestamp() },
        { title: 'YouTube Premium', oldPrice: '$13.99/mo', newPrice: '$9.99/mo', savePercent: '30%', promoCode: 'SWAHILI30', link: 'https://youtube.com', category: 'Entertainment', icon: '▶️', bgClass: 'bg-gradient-to-br from-[#ff0000] to-[#cc0000]', createdAt: serverTimestamp() }
      ];

      for (const deal of initialDeals) {
        await addDoc(collection(db, 'deals'), deal);
      }

      alert('Data imepandishwa kikamilifu!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'seed');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setIsAuthOpen(false);
    } catch (error) {
      console.error(error);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      setIsAuthOpen(false);
    } catch (error) {
      console.error(error);
    }
  };

  const handleNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail) return;
    try {
      await addDoc(collection(db, 'newsletter'), {
        email: newsletterEmail,
        createdAt: serverTimestamp()
      });
      alert('Asante! Umejiunga na newsletter.');
      setNewsletterEmail('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'newsletter');
    }
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'tips', label: 'Tech Tips', icon: '💡' },
    { id: 'habari', label: 'Updates', icon: '📰' },
    { id: 'deals', label: 'Deals', icon: '🏷️' },
    { id: 'courses', label: 'Courses', icon: '🎓' },
    { id: 'marketplace', label: 'Duka', icon: '🛍️' },
    { id: 'kijanja', label: 'Websites', icon: '🌐' },
    { id: 'prompts', label: 'Prompt Lab', icon: '🧪' },
    ...(user?.email === 'swahilitecheliteacademy@gmail.com' ? [{ id: 'admin', label: 'Admin', icon: '🔐' }] : [])
  ];

  return (
    <ErrorBoundary>
      <Toaster theme="dark" position="bottom-right" />
      <div className={cn(
        "min-h-screen transition-colors duration-300 overflow-x-hidden",
        theme === 'dark' ? "bg-[#07080d] text-white" : "bg-[#f8f4ea] text-[#111]"
      )}
      style={theme === 'dark' ? {
        background: `
          radial-gradient(circle at 14% 12%, rgba(245,166,35,.12), transparent 18%),
          radial-gradient(circle at 84% 22%, rgba(86,183,255,.12), transparent 20%),
          radial-gradient(circle at 76% 78%, rgba(143,97,255,.1), transparent 18%),
          linear-gradient(180deg,#05060a 0%, #080a11 100%)
        `
      } : {
        background: 'linear-gradient(180deg,#f8f4ea 0%,#efe7d7 100%)'
      }}>
        
        {/* Scroll Progress */}
        <div 
          className="fixed left-0 top-0 h-[3px] z-[250] bg-gradient-to-r from-gold via-[#ffd17c] to-gold shadow-[0_0_14px_rgba(245,166,35,0.7)]"
          style={{ width: `${scrollProgress}%` }}
        />

        {/* Ticker */}
        <div className="bg-gradient-to-r from-gold to-[#ffd17c] text-[#111] py-2.5 overflow-hidden whitespace-nowrap text-[13px] font-extrabold">
          <div className="inline-flex gap-[34px] min-w-full animate-[ticker_24s_linear_infinite]">
            {[...Array(2)].map((_, i) => (
              <React.Fragment key={i}>
                <span>🔥 Tech Tips mpya kila siku</span>
                <span>🤖 AI & ChatGPT kwa Kiswahili</span>
                <span>📱 Android, iPhone na PC Hacks</span>
                <span>🛍️ Jumia affiliate deals za Tanzania</span>
                <span>🎓 Kozi za teknolojia kwa M-Pesa</span>
                <span>🌍 SwahiliTech Elite Academy</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Topbar */}
        <header className="sticky top-0 z-[120] border-b border-white/5 backdrop-blur-lg bg-[#080a10]/70">
          <div className="max-w-[1180px] mx-auto px-[14px] flex items-center justify-between min-h-[82px] gap-[14px]">
            <a href="#" onClick={() => setActivePage('home')} className="flex items-center gap-3 shrink-0">
              <div className="w-[54px] h-[54px] rounded-[18px] grid place-items-center bg-gradient-to-br from-gold to-[#ffd17c] text-[#111] shadow-[0_16px_36px_rgba(245,166,35,0.25)]">
                <Bolt size={28} strokeWidth={2.2} />
              </div>
              <div className="hidden sm:block">
                <strong className="block text-xl font-extrabold tracking-tight leading-none">STEA</strong>
                <span className="block mt-1 text-xs text-white/45">Tanzania's Tech Platform</span>
              </div>
            </a>

            <nav className="hidden lg:flex flex-1 justify-center min-w-0">
              <div className="flex gap-2 items-center p-2 border border-white/10 bg-white/5 rounded-full overflow-auto no-scrollbar">
                {navItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setActivePage(item.id)}
                    className={cn(
                      "px-[14px] py-[11px] rounded-full text-[13px] font-extrabold cursor-pointer whitespace-nowrap transition-all",
                      activePage === item.id 
                        ? "bg-gradient-to-br from-gold to-[#ffd17c] text-[#111] shadow-[0_10px_22px_rgba(245,166,35,0.18)]"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </nav>

            <div className="flex items-center gap-2.5">
              <button onClick={() => setIsSearchOpen(true)} className="w-11 h-11 rounded-[16px] border border-white/10 bg-white/5 text-white/70 flex items-center justify-center hover:-translate-y-0.5 hover:bg-white/10 hover:text-white transition-all">
                <Search size={20} />
              </button>
              <button onClick={toggleTheme} className="w-11 h-11 rounded-[16px] border border-white/10 bg-white/5 text-white/70 flex items-center justify-center hover:-translate-y-0.5 hover:bg-white/10 hover:text-white transition-all">
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <div className="relative">
                <button onClick={() => setIsNotifOpen(!isNotifOpen)} className="w-11 h-11 rounded-[16px] border border-white/10 bg-white/5 text-white/70 flex items-center justify-center hover:-translate-y-0.5 hover:bg-white/10 hover:text-white transition-all">
                  <Bell size={20} />
                </button>
                <AnimatePresence>
                  {isNotifOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 top-[calc(100%+10px)] w-[min(360px,calc(100vw-28px))] rounded-[22px] border border-white/10 bg-[#10121c]/98 shadow-2xl p-[14px] z-[160]"
                    >
                      <div className="p-3 rounded-[14px] border border-white/5 bg-white/5 mb-2.5">
                        <div className="font-extrabold mb-1">Deal mpya imeingia</div>
                        <div className="text-[13px] text-white/70 leading-relaxed">Canva Pro 60% off na promo code mpya imeongezwa.</div>
                      </div>
                      <div className="p-3 rounded-[14px] border border-white/5 bg-white/5">
                        <div className="font-extrabold mb-1">Kozi mpya iko active</div>
                        <div className="text-[13px] text-white/70 leading-relaxed">AI & ChatGPT Mastery iko tayari kwa enrollment ya M-Pesa.</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              {user ? (
                <button onClick={() => signOut(auth)} className="hidden sm:flex px-[18px] h-11 items-center font-extrabold text-[#111] bg-gradient-to-br from-gold to-[#ffd17c] rounded-[16px] shadow-[0_12px_24px_rgba(245,166,35,0.18)]">
                  Logout
                </button>
              ) : (
                <button onClick={() => setIsAuthOpen(true)} className="hidden sm:flex px-[18px] h-11 items-center font-extrabold text-[#111] bg-gradient-to-br from-gold to-[#ffd17c] rounded-[16px] shadow-[0_12px_24px_rgba(245,166,35,0.18)]">
                  Ingia
                </button>
              )}

              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden w-11 h-11 rounded-[16px] border border-white/10 bg-white/5 text-white/70 flex items-center justify-center hover:-translate-y-0.5 hover:bg-white/10 hover:text-white transition-all">
                <Menu size={20} />
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="lg:hidden absolute left-0 right-0 top-[calc(100%+8px)] mx-[14px] rounded-[24px] border border-white/10 bg-[#0d1019]/98 shadow-2xl p-[14px] overflow-hidden"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {navItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { setActivePage(item.id); setIsMobileMenuOpen(false); }}
                      className={cn(
                        "p-[14px] rounded-[16px] text-left font-extrabold transition-all",
                        activePage === item.id 
                          ? "bg-gradient-to-br from-gold to-[#ffd17c] text-[#111]"
                          : "bg-white/5 text-white/70 hover:bg-white/10"
                      )}
                    >
                      {item.icon} {item.label}
                    </button>
                  ))}
                  {!user && (
                    <button onClick={() => { setIsAuthOpen(true); setIsMobileMenuOpen(false); }} className="p-[14px] rounded-[16px] text-left font-extrabold bg-gradient-to-br from-gold to-[#ffd17c] text-[#111]">
                      🔐 Ingia / Jisajili
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* Search Overlay */}
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[180] bg-[#040509]/78 backdrop-blur-xl flex items-start justify-center pt-[90px] px-4"
              onClick={() => setIsSearchOpen(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, y: -20 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-[760px] rounded-[28px] border border-white/10 bg-[#10121c]/97 shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-[18px]">
                  <input 
                    autoFocus
                    className="w-full h-14 rounded-[18px] border border-white/10 bg-white/5 text-white px-4 outline-none focus:border-gold/50 transition-all"
                    placeholder="Search tech tips, updates, deals, courses, duka..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="p-[18px] pt-0 grid gap-2.5">
                  {navItems.filter(i => i.id !== 'home').map(item => (
                    <button 
                      key={item.id}
                      onClick={() => { setActivePage(item.id); setIsSearchOpen(false); }}
                      className="text-left p-3.5 rounded-[16px] border border-white/5 bg-white/5 hover:bg-white/10 transition-all"
                    >
                      <strong className="block mb-1">{item.label}</strong>
                      <span className="text-[13px] text-white/70">Explore our latest {item.label.toLowerCase()} collection</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Auth Overlay */}
        <AnimatePresence>
          {isAuthOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[180] bg-[#040509]/78 backdrop-blur-xl flex items-center justify-center p-4"
              onClick={() => setIsAuthOpen(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-[980px] rounded-[28px] border border-white/10 bg-[#10121c]/97 shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 min-h-[580px] relative">
                  <button onClick={() => setIsAuthOpen(false)} className="absolute right-4 top-4 z-[3] w-[42px] h-[42px] rounded-[14px] border border-white/10 bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-all">
                    <X size={20} />
                  </button>
                  
                  <div className="p-[30px] flex flex-col justify-center">
                    <div className="inline-flex gap-2 p-1.5 rounded-full bg-white/5 border border-white/10 mb-[18px] self-start">
                      <button 
                        onClick={() => setAuthMode('login')}
                        className={cn("px-4 py-2.5 rounded-full font-extrabold transition-all", authMode === 'login' ? "bg-gradient-to-br from-gold to-[#ffd17c] text-[#111]" : "text-white/70")}
                      >
                        Login
                      </button>
                      <button 
                        onClick={() => setAuthMode('register')}
                        className={cn("px-4 py-2.5 rounded-full font-extrabold transition-all", authMode === 'register' ? "bg-gradient-to-br from-gold to-[#ffd17c] text-[#111]" : "text-white/70")}
                      >
                        Register
                      </button>
                    </div>

                    <h2 className="text-[46px] font-extrabold tracking-tighter leading-tight mb-2">
                      {authMode === 'login' ? 'Ingia' : 'Jisajili'}
                    </h2>
                    <p className="text-white/70 leading-relaxed mb-6">
                      {authMode === 'login' ? 'Karibu tena kwenye SwahiliTech Elite Academy (STEA).' : 'Anza safari yako ya tech kwa dakika chache tu.'}
                    </p>

                    <form onSubmit={handleEmailAuth} className="grid gap-3">
                      <button 
                        type="button"
                        onClick={handleGoogleLogin}
                        className="h-[54px] rounded-[16px] border border-white/10 bg-white/5 text-white font-extrabold flex items-center justify-center gap-2.5 hover:bg-white/10 transition-all"
                      >
                        ✨ Endelea kwa Google
                      </button>
                      
                      <div className="relative flex items-center py-2">
                        <div className="flex-grow border-t border-white/10"></div>
                        <span className="flex-shrink mx-4 text-white/30 text-xs uppercase tracking-widest">au tumia email</span>
                        <div className="flex-grow border-t border-white/10"></div>
                      </div>

                      {authMode === 'register' && (
                        <input 
                          className="h-14 rounded-[16px] border border-white/10 bg-white/5 text-white px-4 outline-none focus:border-gold/50 transition-all"
                          placeholder="Jina kamili"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                        />
                      )}
                      <input 
                        className="h-14 rounded-[16px] border border-white/10 bg-white/5 text-white px-4 outline-none focus:border-gold/50 transition-all"
                        placeholder="Email address"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                      />
                      <input 
                        className="h-14 rounded-[16px] border border-white/10 bg-white/5 text-white px-4 outline-none focus:border-gold/50 transition-all"
                        placeholder="Password"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                      />
                      <button className="h-[54px] rounded-[16px] bg-gradient-to-br from-gold to-[#ffd17c] text-[#111] font-extrabold flex items-center justify-center hover:shadow-lg hover:-translate-y-0.5 transition-all">
                        {authMode === 'login' ? 'Ingia Sasa' : 'Create Account'}
                      </button>
                    </form>
                  </div>

                  <div className="hidden md:block relative overflow-hidden bg-gradient-to-br from-[#151a2a] to-[#0b0d14]">
                    <div className="absolute inset-y-[-16%] right-[-10%] w-[70%] h-[140%] skew-x-[-14deg] bg-gradient-to-br from-gold to-[#ffd17c] opacity-95" />
                    <div className="relative z-[2] h-full flex flex-col justify-center p-[34px] text-[#111]">
                      <h2 className="text-[54px] font-extrabold leading-[0.95] tracking-tighter mb-4">KARIBU<br />KWETU</h2>
                      <p className="max-w-[320px] leading-relaxed font-medium">
                        Access ya tech tips, courses, deals, websites, saved content na updates kwenye muonekano wa premium unaovutia kutumia.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="max-w-[1180px] mx-auto px-[14px] py-6">
          <AnimatePresence mode="wait">
            {activePage === 'home' && (
              <motion.div 
                key="home"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="rounded-[24px] border border-dashed border-gold/20 bg-gold/5 p-4 text-center text-white/70">
                  Adsense Placeholder — nafasi ya matangazo ya Google Ads
                </div>

                <div className="relative overflow-hidden rounded-[34px] border border-white/10 min-h-[calc(100vh-200px)] p-8 sm:p-12 bg-gradient-to-br from-[#0d1019] via-[#090b12] to-[#0f1320] shadow-2xl flex flex-col justify-center">
                  {/* Robotic Hand Animation */}
                  <motion.div
                    initial={{ x: '-50%', y: '-50%', left: '50%', top: '50%', scale: 1.5, opacity: 0, rotate: -15 }}
                    animate={{ 
                      x: isHeroAnimComplete ? '0%' : '-50%', 
                      y: isHeroAnimComplete ? '0%' : '-50%',
                      left: isHeroAnimComplete ? 'auto' : '50%',
                      top: isHeroAnimComplete ? '0%' : '50%',
                      right: isHeroAnimComplete ? '0%' : 'auto',
                      opacity: 1,
                      scale: isHeroAnimComplete ? 1 : 1.5,
                      rotate: isHeroAnimComplete ? 0 : -15
                    }}
                    transition={{ 
                      duration: isHeroAnimComplete ? 1.5 : 4, 
                      ease: isHeroAnimComplete ? "easeInOut" : "easeOut", 
                      delay: isHeroAnimComplete ? 0 : 0.2 
                    }}
                    className="absolute z-[1] h-full w-full md:w-1/2 right-0 pointer-events-none flex items-center justify-end md:justify-end justify-center"
                  >
                    <img src="https://images.unsplash.com/photo-1614729939124-032f0b56c9ce?auto=format&fit=crop&q=80&w=800" alt="Robotic Hand" className="object-contain w-full h-full opacity-60 mix-blend-screen" />
                  </motion.div>

                  <div className="relative z-[2] max-w-3xl">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: showTitle ? 1 : 0, y: showTitle ? 0 : 20 }}
                      transition={{ duration: 1 }}
                    >
                      <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 border border-gold/20 bg-gold/10 text-gold text-[11px] font-black uppercase tracking-widest">
                        🚀 SwahiliTech Elite Academy · Learn · Build · Grow
                      </div>
                      <h1 className="text-[clamp(48px,8vw,110px)] font-extrabold leading-[0.9] tracking-tighter my-6">
                        <span className="block">SwahiliTech Elite</span>
                        <span className="block bg-gradient-to-r from-gold to-[#ffd17c] bg-clip-text text-transparent">Academy</span>
                      </h1>
                      <div className="text-[clamp(24px,4vw,48px)] font-extrabold leading-tight tracking-tight text-white/90 mb-6">
                        Tunaunganisha Watanzania na Dunia ya Teknolojia
                      </div>
                      <p className="text-white/70 text-lg leading-relaxed max-w-2xl mb-8">
                        SwahiliTech Elite Academy (STEA) inaleta tech tips, updates, deals, vifaa vya electronic, websites za kijanja na kozi za kisasa kwa lugha rahisi ya Kiswahili.
                      </p>
                      <div className="flex flex-wrap gap-4">
                        <button onClick={() => setActivePage('tips')} className="px-8 py-4 rounded-[18px] bg-gradient-to-br from-gold to-[#ffd17c] text-[#111] font-black flex items-center gap-2.5 hover:-translate-y-1 transition-all shadow-[0_18px_34px_rgba(245,166,35,0.22)]">
                          ⚡ Explore Content <ArrowRight size={20} />
                        </button>
                        <a href="https://wa.me/8619715852043" target="_blank" rel="noopener noreferrer" className="px-8 py-4 rounded-[18px] border border-white/10 bg-white/5 text-white font-black hover:-translate-y-1 transition-all flex items-center gap-2">
                          <MessageSquare size={20} /> WhatsApp
                        </a>
                      </div>
                    </motion.div>

                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: showTitle ? 1 : 0 }}
                      transition={{ duration: 1, delay: 0.5 }}
                      className="mt-12 grid grid-cols-2 sm:grid-cols-4 rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden max-w-3xl"
                    >
                      {[
                        { val: '200K+', label: 'Monthly Readers' },
                        { val: '1200+', label: 'Articles' },
                        { val: '45+', label: 'TZ Creators' },
                        { val: '24/7', label: 'Live Updates' }
                      ].map((stat, i) => (
                        <div key={i} className="p-6 text-center border-r border-white/10 last:border-0">
                          <div className="text-3xl font-extrabold text-gold mb-1">{stat.val}</div>
                          <div className="text-[11px] text-white/45 font-bold uppercase tracking-wider">{stat.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activePage === 'tips' && (
              <motion.div 
                key="tips"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-extrabold tracking-tight">Tech <span className="text-gold">Tips</span></h2>
                    <p className="text-white/45 mt-2 max-w-2xl">Mbinu za Android, iPhone, PC na AI kwa matumizi ya kila siku kwa style ya premium.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    { title: 'Android Hacks za kuongeza speed', cat: 'Android', icon: Smartphone, tags: ['#android', '#speed', '#storage'] },
                    { title: 'AI prompts za biashara na kazi', cat: 'AI', icon: Cpu, tags: ['#ai', '#business', '#content'] },
                    { title: 'PC tricks kwa productivity', cat: 'PC', icon: Monitor, tags: ['#pc', '#workflow', '#productivity'] }
                  ].map((tip, i) => (
                    <article key={i} className="group relative rounded-[24px] border border-white/5 bg-[#141823] overflow-hidden hover:border-gold/30 hover:-translate-y-2 transition-all duration-300 shadow-xl">
                      <div className="aspect-video bg-gradient-to-br from-[#252538] to-[#171720] flex items-center justify-center text-gold/20">
                        <tip.icon size={64} strokeWidth={1} />
                        <div className="absolute top-4 right-4 px-3 py-1 rounded-full border border-white/10 bg-[#111118]/70 text-gold text-[11px] font-extrabold">
                          {tip.cat}
                        </div>
                      </div>
                      <div className="p-6">
                        <h3 className="text-2xl font-extrabold tracking-tight leading-tight mb-3 group-hover:text-gold transition-colors">{tip.title}</h3>
                        <p className="text-white/70 text-sm leading-relaxed mb-4">Settings ndogo zenye matokeo makubwa kwa battery, storage na performance.</p>
                        <div className="flex gap-2 mb-6">
                          {tip.tags.map(t => <span key={t} className="text-xs font-bold text-gold/70">{t}</span>)}
                        </div>
                        <div className="flex gap-2">
                          <button className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white/70 text-xs font-extrabold hover:bg-white/10 hover:text-white transition-all">Read</button>
                          <button className="p-2.5 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:text-red-400 transition-all"><Heart size={16} /></button>
                          <button className="p-2.5 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:text-gold transition-all"><Bookmark size={16} /></button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </motion.div>
            )}

            {activePage === 'prompts' && (
              <motion.div 
                key="prompts"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-extrabold tracking-tight mb-2">Prompt & Workflow Lab 🧪</h2>
                    <p className="text-white/60">Instagram Lesson Resources & Step-by-Step Guides</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {prompts.map(prompt => (
                    <div key={prompt.id} className="rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col gap-4">
                      {prompt.imageUrl && (
                        <div className="relative aspect-video rounded-xl overflow-hidden cursor-pointer" onClick={() => setLightboxImage(prompt.imageUrl)}>
                          <img src={prompt.imageUrl} alt={prompt.title} className="object-cover w-full h-full hover:scale-105 transition-transform" />
                        </div>
                      )}
                      <h3 className="text-xl font-bold">{prompt.title}</h3>
                      <p className="text-sm text-white/70">{prompt.description}</p>
                      
                      <div className="bg-black/50 p-4 rounded-xl border border-white/5 relative group">
                        <p className="text-sm font-mono text-gold/90 line-clamp-3">{prompt.promptText}</p>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(prompt.promptText);
                            toast.success('Prompt copied successfully!');
                          }}
                          className="absolute top-2 right-2 p-2 bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gold hover:text-black"
                        >
                          <Copy size={16} />
                        </button>
                      </div>

                      {prompt.guide && (
                        <details className="group border border-white/10 rounded-xl">
                          <summary className="p-4 font-semibold cursor-pointer list-none flex justify-between items-center">
                            Step-by-Step Guide
                            <ChevronDown size={16} className="group-open:rotate-180 transition-transform" />
                          </summary>
                          <div className="p-4 pt-0 text-sm text-white/70 whitespace-pre-wrap border-t border-white/10">
                            {prompt.guide}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activePage === 'deals' && (
              <motion.div 
                key="deals"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-extrabold tracking-tight">Premium <span className="text-gold">Deals</span></h2>
                    <p className="text-white/45 mt-2 max-w-2xl">Discounts, referral offers, promo codes na hidden deals — napata commission, wewe unapata bei nzuri.</p>
                  </div>
                  {user?.email === 'swahilitecheliteacademy@gmail.com' && deals.length === 0 && (
                    <button onClick={seedData} className="px-4 py-2 rounded-lg bg-gold text-black font-bold text-xs">Seed Initial Data</button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {deals.map((deal) => (
                    <article key={deal.id} className="group relative rounded-[24px] border border-white/5 bg-[#141823] overflow-hidden hover:border-gold/30 hover:-translate-y-2 transition-all duration-300 shadow-xl">
                      <div className={cn("h-[200px] relative flex flex-col items-center justify-center gap-2", deal.bgClass)}>
                        <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-[#67a0f0] text-[10px] font-black flex items-center gap-1">
                          <ShieldCheck size={12} /> Verified by STEA
                        </div>
                        <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[#67f0c1] text-[11px] font-black">-{deal.savePercent}</div>
                        <div className="text-5xl drop-shadow-lg">{deal.icon}</div>
                        <div className="font-extrabold text-white/90 text-lg drop-shadow-md">{deal.title.split(' ')[0]}</div>
                      </div>
                      <div className="p-6">
                        <h3 className="text-2xl font-extrabold tracking-tight leading-tight mb-4">{deal.title}</h3>
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-white/45 line-through font-bold">{deal.oldPrice}</span>
                          <span className="text-gold text-2xl font-black">{deal.newPrice}</span>
                          <span className="px-2 py-1 rounded-full bg-gold/10 border border-gold/20 text-gold text-[10px] font-black">Save {deal.savePercent}</span>
                        </div>
                        {deal.promoCode && (
                          <div className="p-3 rounded-xl border border-dashed border-gold/30 bg-gold/5 mb-6">
                            <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">🎫 Promo Code</div>
                            <div className="flex items-center justify-between">
                              <strong className="text-xl text-gold tracking-widest">{deal.promoCode}</strong>
                              <button onClick={() => {
                                navigator.clipboard.writeText(deal.promoCode!);
                                toast.success('Code copied!');
                              }} className="p-2 rounded-lg bg-white/10 text-white hover:bg-gold hover:text-black transition-all"><Copy size={16} /></button>
                            </div>
                          </div>
                        )}
                        <a href={deal.link} target="_blank" rel="noopener noreferrer" className="block w-full py-3.5 rounded-xl bg-gradient-to-br from-gold to-[#ffd17c] text-[#111] font-black text-center hover:shadow-lg transition-all">Pata Deal</a>
                      </div>
                    </article>
                  ))}
                </div>
              </motion.div>
            )}

            {activePage === 'courses' && (
              <motion.div 
                key="courses"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-extrabold tracking-tight">Kozi za <span className="text-gold">Kisasa</span></h2>
                    <p className="text-white/45 mt-2 max-w-2xl">Mwanzo mpaka practical mastery kwa beginner, creator na mtu anayejenga career kwenye technology.</p>
                  </div>
                  {user?.email === 'swahilitecheliteacademy@gmail.com' && courses.length === 0 && (
                    <button onClick={seedData} className="px-4 py-2 rounded-lg bg-gold text-black font-bold text-xs">Seed Initial Data</button>
                  )}
                </div>

                <div className="grid gap-6">
                  {courses.map((course) => (
                    <article key={course.id} className="group relative flex flex-col md:flex-row rounded-[24px] border border-white/5 bg-[#141823] overflow-hidden hover:border-gold/30 transition-all duration-300 shadow-xl">
                      <div className={cn(
                        "md:w-[280px] p-8 flex flex-col justify-between items-center text-center border-b md:border-b-0 md:border-r border-white/5",
                        course.type === 'free' ? "bg-gradient-to-br from-emerald-500/20 to-white/5" : "bg-gradient-to-br from-gold/20 to-white/5"
                      )}>
                        <div className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black border",
                          course.type === 'free' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-gold/10 border-gold/20 text-gold"
                        )}>
                          {course.type === 'free' ? '🆓 BURE' : '⭐ PAID'}
                        </div>
                        <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-[#67a0f0] text-[10px] font-black flex items-center gap-1">
                          <ShieldCheck size={12} /> Verified by STEA
                        </div>
                        <div className="text-7xl my-6 drop-shadow-xl">{course.emoji}</div>
                        <div className="text-sm text-white/80 font-bold">Anza tech journey yako leo.</div>
                      </div>
                      <div className="flex-1 p-8 flex flex-col">
                        <h3 className="text-3xl font-extrabold tracking-tight mb-2">{course.title}</h3>
                        <p className="text-white/50 text-sm mb-6">{course.description}</p>
                        <div className="space-y-2 mb-8">
                          {course.lessons.map((l, j) => (
                            <div key={j} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 text-white/70 text-sm">
                              <span className="w-6 h-6 rounded-full bg-gold/10 text-gold text-[10px] font-black flex items-center justify-center shrink-0">{j+1}</span>
                              {l}
                            </div>
                          ))}
                        </div>
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-4">
                          <div className="text-sm font-bold text-white/70">Price: <span className="text-gold">{course.price}</span></div>
                          <button className={cn(
                            "px-8 py-3 rounded-xl font-black transition-all",
                            course.type === 'free' ? "bg-gradient-to-r from-emerald-500 to-emerald-400 text-black" : "bg-gradient-to-r from-gold to-[#ffd17c] text-black"
                          )}>
                            {course.type === 'free' ? 'Anza Sasa Bure →' : 'Jiunge Leo'}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </motion.div>
            )}

            {['habari', 'marketplace', 'kijanja'].includes(activePage) && (
              <motion.div 
                key={activePage}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4"
              >
                <div className="text-6xl mb-4">🚧</div>
                <h2 className="text-4xl font-extrabold tracking-tight">Inakuja Hivi Karibuni</h2>
                <p className="text-white/50 max-w-md">
                  Tunaandaa content nzuri kwa ajili ya section hii. Endelea kufuatilia SwahiliTech Elite Academy kwa updates zaidi.
                </p>
                <button onClick={() => setActivePage('home')} className="mt-8 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors font-bold">
                  Rudi Mwanzo
                </button>
              </motion.div>
            )}

            {activePage === 'admin' && user?.email === 'swahilitecheliteacademy@gmail.com' && (
              <motion.div 
                key="admin"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-extrabold tracking-tight">Admin <span className="text-gold">Dashboard</span></h2>
                    <p className="text-white/45 mt-2 max-w-2xl">Manage your tech tips, deals, and courses with ease.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Tips Management */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold flex items-center gap-2"><Bolt className="text-gold" /> Tips</h3>
                      <button onClick={() => {
                        const title = prompt('Tip Title:');
                        const cat = prompt('Category:');
                        const tags = prompt('Tags (comma separated):');
                        if (title && cat) {
                          addDoc(collection(db, 'tips'), {
                            title,
                            category: cat,
                            tags: tags?.split(',').map(t => t.trim()) || [],
                            views: 0,
                            createdAt: serverTimestamp()
                          }).then(() => alert('Tip added!'))
                            .catch(err => handleFirestoreError(err, OperationType.CREATE, 'tips'));
                        }
                      }} className="p-2 rounded-lg bg-gold/10 text-gold hover:bg-gold hover:text-black transition-all"><Plus size={18} /></button>
                    </div>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                      {tips.map(tip => (
                        <div key={tip.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between group">
                          <div className="min-w-0">
                            <div className="font-bold truncate">{tip.title}</div>
                            <div className="text-xs text-white/40">{tip.category}</div>
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => {
                              if (confirm('Delete this tip?')) {
                                deleteDoc(doc(db, 'tips', tip.id))
                                  .catch(err => handleFirestoreError(err, OperationType.DELETE, `tips/${tip.id}`));
                              }
                            }} className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Deals Management */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold flex items-center gap-2"><Copy className="text-gold" /> Deals</h3>
                      <button onClick={() => {
                        const title = prompt('Deal Title:');
                        const oldPrice = prompt('Old Price:');
                        const newPrice = prompt('New Price:');
                        const save = prompt('Save %:');
                        const code = prompt('Promo Code:');
                        const link = prompt('Link:');
                        const cat = prompt('Category:');
                        if (title && newPrice) {
                          addDoc(collection(db, 'deals'), {
                            title,
                            oldPrice,
                            newPrice,
                            savePercent: save,
                            promoCode: code,
                            link,
                            category: cat,
                            icon: '🎁',
                            bgClass: 'bg-gradient-to-br from-gold/20 to-white/5',
                            createdAt: serverTimestamp()
                          }).then(() => alert('Deal added!'))
                            .catch(err => handleFirestoreError(err, OperationType.CREATE, 'deals'));
                        }
                      }} className="p-2 rounded-lg bg-gold/10 text-gold hover:bg-gold hover:text-black transition-all"><Plus size={18} /></button>
                    </div>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                      {deals.map(deal => (
                        <div key={deal.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between group">
                          <div className="min-w-0">
                            <div className="font-bold truncate">{deal.title}</div>
                            <div className="text-xs text-white/40">{deal.newPrice}</div>
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => {
                              if (confirm('Delete this deal?')) {
                                deleteDoc(doc(db, 'deals', deal.id))
                                  .catch(err => handleFirestoreError(err, OperationType.DELETE, `deals/${deal.id}`));
                              }
                            }} className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Courses Management */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold flex items-center gap-2"><Mail className="text-gold" /> Courses</h3>
                      <button onClick={() => {
                        const title = prompt('Course Title:');
                        const price = prompt('Price:');
                        const type = prompt('Type (free/paid):') as 'free' | 'paid';
                        const emoji = prompt('Emoji:');
                        const lessons = prompt('Lessons (comma separated):');
                        if (title && price) {
                          addDoc(collection(db, 'courses'), {
                            title,
                            price,
                            type: type || 'free',
                            emoji: emoji || '🎓',
                            lessons: lessons?.split(',').map(l => l.trim()) || [],
                            description: '',
                            createdAt: serverTimestamp()
                          }).then(() => alert('Course added!'))
                            .catch(err => handleFirestoreError(err, OperationType.CREATE, 'courses'));
                        }
                      }} className="p-2 rounded-lg bg-gold/10 text-gold hover:bg-gold hover:text-black transition-all"><Plus size={18} /></button>
                    </div>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                      {courses.map(course => (
                        <div key={course.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between group">
                          <div className="min-w-0">
                            <div className="font-bold truncate">{course.title}</div>
                            <div className="text-xs text-white/40">{course.price}</div>
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => {
                              if (confirm('Delete this course?')) {
                                deleteDoc(doc(db, 'courses', course.id))
                                  .catch(err => handleFirestoreError(err, OperationType.DELETE, `courses/${course.id}`));
                              }
                            }} className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Newsletter */}
        <section className="max-w-[1180px] mx-auto px-[14px] my-12">
          <div className="p-8 sm:p-12 rounded-[34px] border border-white/10 bg-gradient-to-b from-[#151823] to-[#10131c] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gold/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-[2] max-w-2xl">
              <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">Jiunge na Newsletter</h3>
              <p className="text-white/70 mb-8">Pata tech tips, deals na updates kila wiki moja kwa moja kwenye email yako.</p>
              <form onSubmit={handleNewsletter} className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={20} />
                  <input 
                    className="w-full h-14 rounded-[18px] border border-white/10 bg-white/5 text-white pl-12 pr-4 outline-none focus:border-gold/50 transition-all"
                    placeholder="Email yako"
                    type="email"
                    value={newsletterEmail}
                    onChange={e => setNewsletterEmail(e.target.value)}
                  />
                </div>
                <button className="h-14 px-8 rounded-[18px] bg-gradient-to-br from-gold to-[#ffd17c] text-[#111] font-black hover:shadow-lg transition-all">
                  Subscribe
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-12 border-t border-white/5 text-center text-white/45 text-sm">
          <div className="max-w-[1180px] mx-auto px-[14px]">
            <div className="flex flex-col md:flex-row justify-center items-center gap-6 mb-8 text-white/70">
              <a href="mailto:swahilitecheliteacademy@gmail.com" className="flex items-center gap-2 hover:text-gold transition-colors">
                <Mail size={18} />
                <span>swahilitecheliteacademy@gmail.com</span>
              </a>
              <a href="https://wa.me/8619715852043" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-gold transition-colors">
                <MessageSquare size={18} />
                <span>WhatsApp: +86 197 1585 2043</span>
              </a>
            </div>
            <div className="flex justify-center gap-6 mb-6">
              {['Twitter', 'Instagram', 'YouTube', 'Telegram'].map(s => (
                <a key={s} href="#" className="hover:text-gold transition-colors">{s}</a>
              ))}
            </div>
            <p>SwahiliTech Elite Academy © 2026 · STEA · Teknolojia kwa Kiswahili</p>
          </div>
        </footer>

        {/* Back to Top */}
        <AnimatePresence>
          {showBackToTop && (
            <motion.button 
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="fixed right-6 bottom-6 w-12 h-12 rounded-full bg-[#10121c]/90 border border-gold/30 text-gold flex items-center justify-center shadow-2xl z-[120] hover:bg-gold hover:text-black transition-all"
            >
              <ChevronUp size={24} />
            </motion.button>
          )}
        </AnimatePresence>

        {lightboxImage && (
          <div className="fixed inset-0 z-[999] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
            <img src={lightboxImage} alt="Fullscreen" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
            <button className="absolute top-6 right-6 text-white/70 hover:text-gold p-2 bg-black/50 rounded-full transition-colors">
              <X size={32} />
            </button>
          </div>
        )}

        <ChatWidget />

      </div>
    </ErrorBoundary>
  );
}

// Add ticker animation to global CSS
const style = document.createElement('style');
style.textContent = `
  @keyframes ticker {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`;
document.head.appendChild(style);
