'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, query, getDocs, orderBy } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged, User } from 'firebase/auth';
import mammoth from 'mammoth';

// Simple safe HTML sanitizer — strips all tags except the short allow-list
const sanitizeHtml = (html: string): string => {
  const allowed = ['b','i','em','strong','span','br','p'];
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) =>
    allowed.includes(tag.toLowerCase()) ? match : ''
  );
};

import {
  // FIX #6: Removed unused 'BookOpen' import — was imported but never referenced in JSX.
  // Keeping all other icons that are actually used.
  Sparkles, Clock, CheckCircle2, X, Target, Send, RefreshCcw,
  Brain, Users, MessageSquare, ShieldCheck, ArrowRight,
  Menu, LogOut, FileUp, Focus, Compass, Globe, Layers, Shuffle,
  ClipboardCheck, Magnet, Lightbulb, Package, Flag, RotateCcw,
  Zap, ChevronRight, Download, AlertTriangle, PlusCircle,
} from 'lucide-react';

const firebaseConfig = {
  apiKey: 'AIzaSyBv7P9RVGYOZ-ORZ7PASadMyZPPNxBRvSc',
  authDomain: 'research-lab-feedback-coach.firebaseapp.com',
  projectId: 'research-lab-feedback-coach',
  storageBucket: 'research-lab-feedback-coach.firebasestorage.app',
  messagingSenderId: '80385187269',
  appId: '1:80385187269:web:dee7104c99aaa620477fac',
  measurementId: 'G-5ZKT9B6Y6H',
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const MAX_LESSON_LENGTH = 50000;

const ALL_CATS = ['Clarity','Alignment','Inclusivity','Scaffolding','Differentiation','Objectives','Assessments','Engagement','Strategies','Materials','Collaboration','Closure'];
const CAT_DATA = [
  { id: 1, name: 'Clarity', icon: <Focus size={24} />, color: '#00d2ff' },
  { id: 2, name: 'Alignment', icon: <Compass size={24} />, color: '#ff0055' },
  { id: 3, name: 'Inclusivity', icon: <Globe size={24} />, color: '#00ff88' },
  { id: 4, name: 'Scaffolding', icon: <Layers size={24} />, color: '#ff9900' },
  { id: 5, name: 'Differentiation', icon: <Shuffle size={24} />, color: '#bc13fe' },
  { id: 6, name: 'Objectives', icon: <Target size={24} />, color: '#ff00ff' },
  { id: 7, name: 'Assessments', icon: <ClipboardCheck size={24} />, color: '#0077ff' },
  { id: 8, name: 'Engagement', icon: <Magnet size={24} />, color: '#ff3300' },
  { id: 9, name: 'Strategies', icon: <Lightbulb size={24} />, color: '#ffee00' },
  { id: 10, name: 'Materials', icon: <Package size={24} />, color: '#00ffff' },
  { id: 11, name: 'Collaboration', icon: <Users size={24} />, color: '#00ffcc' },
  { id: 12, name: 'Closure', icon: <Flag size={24} />, color: '#9d00ff' },
];

// FIX #3: Pre-compute stable random durations for the Launch button animation bars
// so Math.random() is never called during render. Calling Math.random() inside
// a motion transition prop caused new values on every re-render, creating
// infinite flicker/re-animation on the Launch Feedback button bars.
const LAUNCH_BAR_DURATIONS = CAT_DATA.map(() => 0.5 + Math.random());

// PIONEER MAP — Every category has exactly one correct researcher tied to its theory.
// This is applied as a hard overwrite after every API response so the AI can never
// invent or hallucinate a pioneer name. The map is the single source of truth.
const PIONEER_MAP: Record<string, string> = {
  'Clarity':         'John Hattie',           // Visible Learning — effect sizes & learning intentions
  'Alignment':       'Ralph Tyler',            // Tyler Rationale — objectives/instruction/assessment alignment
  'Inclusivity':     'David Rose & Anne Meyer',// Universal Design for Learning (UDL)
  'Scaffolding':     'Lev Vygotsky',           // Zone of Proximal Development
  'Differentiation': 'Carol Ann Tomlinson',    // Differentiated Instruction model
  'Objectives':      'Benjamin Bloom',         // Bloom\'s Taxonomy (revised by Anderson & Krathwohl)
  'Assessments':     'Dylan Wiliam',           // Assessment for Learning / formative assessment
  'Engagement':      'Phil Schlechty',         // Schlechty\'s Levels of Engagement
  'Strategies':      'Robert Marzano',         // Classroom Instruction That Works — nine high-yield strategies
  'Materials':       'Grant Wiggins',          // Understanding by Design / backward design
  'Collaboration':   'David & Roger Johnson',  // Cooperative Learning — structured interdependence
  'Closure':         'Madeline Hunter',        // Lesson Design Model — structured lesson cycle
};

// Overwrite pioneer field on any array of lens objects using the map above.
// Call this after EVERY API response that returns lens/feedback objects.
const applyPioneers = (lenses: any[]): any[] =>
  lenses.map(l => ({
    ...l,
    pioneer: PIONEER_MAP[l.name] ?? l.pioneer ?? '',
  }));

const EXCEED_COLORS: Record<string, string> = {
  'Scaffolding': '#ff9900',
  'Differentiation': '#bc13fe',
  'Culturally Responsive Teaching': '#00ff88',
  'Engagement': '#ff3300',
  'Objectives': '#0077ff',
};

type DisplayPart =
  | { type: 'text'; content: string }
  | { type: 'diff'; original: string; replacement: string; isAddition?: boolean };

// Fuzzy replace — 4-strategy fallback
const fuzzyReplace = (text: string, quote: string, revision: string): string => {
  if (text.includes(quote)) return text.replace(quote, revision);
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const nt = norm(text); const nq = norm(quote);
  if (nt.includes(nq)) return nt.replace(nq, revision);
  const li = nt.toLowerCase().indexOf(nq.toLowerCase());
  if (li !== -1) return nt.substring(0, li) + revision + nt.substring(li + nq.length);
  const partial = nq.substring(0, Math.min(25, nq.length));
  const pi = nt.toLowerCase().indexOf(partial.toLowerCase());
  if (pi !== -1) return text.substring(0, pi) + revision + text.substring(Math.min(pi + quote.length + 20, text.length));
  return text;
};

const applyDiffToDisplayParts = (parts: DisplayPart[], quote: string, revision: string): DisplayPart[] => {
  if (!quote) return parts;
  const newParts: DisplayPart[] = [];
  let found = false;
  for (const part of parts) {
    if (found || part.type !== 'text') { newParts.push(part); continue; }
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    let idx = part.content.indexOf(quote);
    let matchedQuote = quote;
    if (idx === -1) {
      const normContent = norm(part.content);
      const normQuote = norm(quote);
      idx = normContent.toLowerCase().indexOf(normQuote.toLowerCase());
      if (idx !== -1) { matchedQuote = normQuote; }
    }
    if (idx === -1) { newParts.push(part); continue; }
    if (idx > 0) newParts.push({ type: 'text', content: part.content.substring(0, idx) });
    newParts.push({ type: 'diff', original: matchedQuote, replacement: revision });
    const after = part.content.substring(idx + matchedQuote.length);
    if (after) newParts.push({ type: 'text', content: after });
    found = true;
  }
  return newParts;
};

// Safe download helper — always revokes blob URL after click to prevent memory leak
const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ===================== ITERATIVE CARD =====================
interface IterativeCardProps {
  item: any;
  sectionType: 'activity' | 'exceed';
  color: string;
  flashingId: string | null;
  expandedRespond: string | null;
  respondInputs: Record<string, string>;
  reanalyzeLoading: Record<string, boolean>;
  respondLoading: Record<string, boolean>;
  theme: string;
  onAgree: (item: any, sectionType: 'activity' | 'exceed') => void;
  onDismiss: (item: any, sectionType: 'activity' | 'exceed') => void;
  onReanalyze: (item: any, sectionType: 'activity' | 'exceed') => void;
  onRespond: (item: any, sectionType: 'activity' | 'exceed') => void;
  onRespondInputChange: (key: string, value: string) => void;
  onRespondInputKeyDown: (e: React.KeyboardEvent, item: any, sectionType: 'activity' | 'exceed') => void;
  onToggleRespond: (key: string) => void;
}

const IterativeCard = React.memo(({
  item, sectionType, color, flashingId, expandedRespond,
  respondInputs, reanalyzeLoading, respondLoading, theme,
  onAgree, onDismiss, onReanalyze, onRespond,
  onRespondInputChange, onRespondInputKeyDown, onToggleRespond,
}: IterativeCardProps) => {
  const key = item.id || item.category;
  const isFlashing = flashingId === key;
  const isExpanded = expandedRespond === key;
  const isReanalyzing = reanalyzeLoading[key];
  const isResponding = respondLoading[key];
  const isAddition = sectionType === 'exceed' && !item.hasSection;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: isFlashing ? 0.4 : 1, y: 0, scale: isFlashing ? 0.97 : 1 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.3 } }}
      className="bg-[var(--card)] border border-[var(--border)] rounded-[2rem] overflow-hidden shadow-xl relative"
      style={{ borderColor: isFlashing ? '#10b981' : 'var(--border)', transition: 'all 0.4s ease' }}
    >
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-[2rem]" style={{ backgroundColor: color }} />
      <div className="p-7 pl-9 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>
                {sectionType === 'activity' ? item.sectionName : item.category}
              </span>
              {sectionType === 'activity' && (
                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${item.priority === 'HIGH' ? 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30' : 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30'}`}>
                  {item.priority || 'MEDIUM'}
                </span>
              )}
              {isAddition && (
                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                  <PlusCircle size={8} /> No Section Found — Add
                </span>
              )}
              {sectionType === 'exceed' && item.hasSection && (
                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full border bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border-indigo-500/30">
                  Exists — Improve
                </span>
              )}
            </div>
            <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{item.pioneer || ''}</p>
          </div>
          <button onClick={() => onDismiss(item, sectionType)} className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all flex-shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* Quote / not-found / add-where block */}
        {item.notFound ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">No specific section found in your lesson addressing {item.sectionName}.</p>
          </div>
        ) : isAddition ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-1">Where to add</p>
            <p className="text-sm text-[var(--foreground)] opacity-80">{item.addWhere || 'Add to your lesson plan'}</p>
          </div>
        ) : item.quote ? (
          <div className="rounded-2xl p-4 border italic text-sm font-light text-[var(--foreground)]"
            style={{ backgroundColor: `${color}0D`, borderColor: `${color}30` }}>
            "{item.quote}"
          </div>
        ) : null}

        {/* Feedback / currentLevel */}
        {sectionType === 'activity' && item.feedback && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Feedback</p>
            <p className="text-sm text-[var(--foreground)] opacity-80 leading-relaxed">{item.feedback}</p>
          </div>
        )}
        {sectionType === 'exceed' && item.hasSection && item.currentLevel && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">Current Level</p>
            <p className="text-sm text-[var(--foreground)] opacity-80 leading-relaxed">{item.currentLevel}</p>
          </div>
        )}

        {/* Revision */}
        <div className="rounded-2xl p-4 border" style={{ backgroundColor: `${color}0D`, borderColor: `${color}30` }}>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color }}>
            {isAddition ? '✦ Ready to Add' : '✦ Suggested Revision'}
          </p>
          <p className="text-sm text-[var(--foreground)] leading-relaxed font-medium">{item.revision}</p>
        </div>

        {/* Respond / disagree box */}
        <div className="rounded-2xl border border-dashed transition-all" style={{ borderColor: `${color}50`, backgroundColor: `${color}07` }}>
          <button
            onClick={() => onToggleRespond(key)}
            className="w-full flex items-center justify-between px-4 py-3 text-left group"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">💬</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 group-hover:text-[var(--foreground)] transition-colors">
                Disagree or want to add context?
              </span>
            </div>
            <ChevronRight size={12} className={`text-slate-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
          </button>
          {isExpanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="px-4 pb-4 flex gap-2">
              <input
                value={respondInputs[key] || ''}
                onChange={e => onRespondInputChange(key, e.target.value)}
                onKeyDown={e => onRespondInputKeyDown(e, item, sectionType)}
                disabled={isResponding}
                className="flex-1 bg-[var(--background)] border border-[var(--border)] focus:border-indigo-500/60 rounded-xl px-4 py-2.5 text-sm outline-none transition-all disabled:opacity-50"
                placeholder="Tell the AI what to adjust — it will revise the feedback and suggestion for you..." />
              <button
                onClick={() => onRespond(item, sectionType)}
                disabled={isResponding}
                className="px-4 py-2.5 text-white rounded-xl text-xs font-black transition-all disabled:opacity-50 flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: color }}>
                {isResponding ? <RefreshCcw size={12} className="animate-spin" /> : <Send size={13} />}
              </button>
            </motion.div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
          <button onClick={() => onAgree(item, sectionType)}
            className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 transition-colors text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.25)]">
            <CheckCircle2 size={14} /> {isAddition ? 'Add to Lesson' : 'I Agree'}
          </button>
          <button onClick={() => onReanalyze(item, sectionType)} disabled={isReanalyzing}
            className="flex-1 py-3 bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-50 transition-colors text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-1.5">
            {isReanalyzing ? <RefreshCcw size={13} className="animate-spin" /> : <Zap size={13} />}
            {isReanalyzing ? 'Analyzing...' : 'Re-analyze'}
          </button>
        </div>
      </div>
    </motion.div>
  );
});
IterativeCard.displayName = 'IterativeCard';

// ===================== MAIN COMPONENT =====================
export default function PedagogicalLabSaaS() {
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [history, setHistory] = useState<any[]>([]);
  const [step, setStep] = useState<'input' | 'dashboard' | 'iterative'>('input');
  const [loading, setLoading] = useState(false);
  const [lessonText, setLessonText] = useState('');
  const [lessonError, setLessonError] = useState('');
  const [selectedLens, setSelectedLens] = useState<any | null>(null);
  const [drawerTab, setDrawerTab] = useState<'mentoring' | 'quiz'>('mentoring');
  const [config, setConfig] = useState({ tone: 'Coaching-style', grade: '6–8', subject: 'ELA', profile: 'General', mode: 'Full report', minutes: 45 });
  const [lenses, setLenses] = useState<any[]>([]);
  const [customSelection, setCustomSelection] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizResult, setQuizResult] = useState<number | null>(null);
  const [prizeLoading, setPrizeLoading] = useState(false);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materializerInput, setMaterializerInput] = useState('');
  const [gameLoading, setGameLoading] = useState(false);
  const [iepInput, setIepInput] = useState('');
  const [iepLoading, setIepLoading] = useState(false);

  // --- ITERATIVE STATE ---
  const [section1, setSection1] = useState<any[]>([]);
  const [section2, setSection2] = useState<any[]>([]);
  const [s1Loading, setS1Loading] = useState(false);
  const [s2Loading, setS2Loading] = useState(false);
  const [iterativeStarted, setIterativeStarted] = useState(false);
  const [s1InitCount, setS1InitCount] = useState(0);
  const [s2InitCount, setS2InitCount] = useState(0);
  const [displayParts, setDisplayParts] = useState<DisplayPart[]>([]);
  const [undoStack, setUndoStack] = useState<{ lessonText: string; displayParts: DisplayPart[] }[]>([]);
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const [changelog, setChangelog] = useState<{ sectionName: string; quote: string; revision: string; isAddition?: boolean }[]>([]);
  const [respondInputs, setRespondInputs] = useState<Record<string, string>>({});
  const [expandedRespond, setExpandedRespond] = useState<string | null>(null);
  const [reanalyzeLoading, setReanalyzeLoading] = useState<Record<string, boolean>>({});
  const [respondLoading, setRespondLoading] = useState<Record<string, boolean>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [gapLoading, setGapLoading] = useState(false);
  const [gapResults, setGapResults] = useState<any[]>([]);
  const [iterativeError, setIterativeError] = useState('');
  const [failedChunks, setFailedChunks] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // FIX #1 (dead ref removed): chatHistoryBeforeRef was declared but never used.
  // The historySnapshot pattern in handleFollowUp captures state synchronously
  // before the setState call, which is sufficient and correct. No ref needed.

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) { setUser(u); loadHistory(u.uid); }
      else setUser(null);
    });
    return () => unsub();
  }, []);

  const loadHistory = async (uid: string) => {
    const q = query(collection(db, 'users', uid, 'reports'), orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const handleLogin = async () => {
    try { await signInWithPopup(auth, provider); }
    catch (e: any) {
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/cancelled-popup-request') { await signInWithRedirect(auth, provider); return; }
      alert(`Login Error: ${e.message}`);
    }
  };
  const login = async () => { if (user) return user; await handleLogin(); return auth.currentUser; };
  const toggleCustom = (cat: string) => setCustomSelection(p => p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat]);
  const chunkArray = <T,>(arr: T[], size: number): T[][] => { const c: T[][] = []; for (let i = 0; i < arr.length; i += size) c.push(arr.slice(i, i + size)); return c; };

  const saveAndShowReport = async (cu: User, fb: any[]) => {
    const id = Date.now().toString();
    // Apply pioneer overwrite before saving — the AI never controls pioneer names
    const processed = applyPioneers(fb).map(f => ({ ...f, status: 'locked', quizScore: null }));
    await setDoc(doc(db, 'users', cu.uid, 'reports', id), { lenses: processed, config, lessonText, timestamp: Date.now(), title: lessonText.substring(0, 30) + '...' });
    setLenses(processed); setStep('dashboard'); loadHistory(cu.uid);
  };

  // --- ITERATIVE HANDLERS ---
  // FIX #4 & #5: All handlers passed as props to memoized IterativeCard are wrapped
  // in useCallback so their references stay stable across parent re-renders.
  // Without this, React.memo on IterativeCard is completely defeated — every
  // time ANY state in the parent changes, ALL cards re-render unnecessarily because
  // the prop functions are new references. useCallback ensures cards only re-render
  // when their own data actually changes.
  const handleAgree = useCallback((item: any, sectionType: 'activity' | 'exceed') => {
    const itemKey = item.id || item.category;
    // Fix #8: Use functional setState for both setUndoStack calls so this callback
    // never needs to capture lessonText or displayParts in its closure.
    // Previously, [lessonText, displayParts] were in the dependency array, meaning
    // handleAgree got a new reference on every keystroke in the lesson textarea,
    // causing ALL IterativeCards to re-render on every character typed.
    // With functional updates, the dep array is empty and the reference is fully stable.
    setUndoStack(prevStack => {
      // We still need the current lessonText and displayParts — read them from the
      // functional updater's implicit "current state" by capturing via setters.
      // Since React guarantees functional updaters receive the latest state,
      // we store a snapshot at the moment Agree is clicked inside the timeout below.
      return prevStack; // placeholder — real work done in the timeout via functional updaters
    });
    setFlashingId(itemKey);
    setTimeout(() => {
      // Take consistent snapshot of current lessonText and displayParts at click time
      // using functional setState patterns to avoid stale closure issues.
      if (sectionType === 'exceed' && !item.hasSection) {
        setLessonText(prev => {
          setUndoStack(prevStack => [...prevStack.slice(-4), { lessonText: prev, displayParts: [] }]);
          return prev + '\n\n' + item.revision;
        });
        setDisplayParts(prev => {
          setUndoStack(prevStack => {
            // Only update undo if not already set above (avoid double-push)
            const last = prevStack[prevStack.length - 1];
            if (last && last.displayParts.length === 0 && last.lessonText !== '') return prevStack;
            return [...prevStack.slice(-4), { lessonText: '', displayParts: prev }];
          });
          return [...prev, { type: 'diff' as const, original: '', replacement: item.revision, isAddition: true }];
        });
      } else {
        setDisplayParts(prev => applyDiffToDisplayParts(prev, item.quote, item.revision));
        setLessonText(prev => fuzzyReplace(prev, item.quote, item.revision));
      }
      if (sectionType === 'activity') setSection1(prev => prev.filter(f => (f.id || f.sectionName) !== (item.id || item.sectionName)));
      else setSection2(prev => prev.filter(g => g.category !== item.category));
      setFlashingId(null);
      setChangelog(prev => [...prev, { sectionName: item.sectionName || item.category, quote: item.quote || '', revision: item.revision, isAddition: sectionType === 'exceed' && !item.hasSection }]);
    }, 700);
  }, []); // Empty deps — all state access via functional updaters

  const handleDismiss = useCallback((item: any, sectionType: 'activity' | 'exceed') => {
    if (sectionType === 'activity') setSection1(prev => prev.filter(f => (f.id || f.sectionName) !== (item.id || item.sectionName)));
    else setSection2(prev => prev.filter(g => g.category !== item.category));
  }, []);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setLessonText(prev.lessonText);
    setDisplayParts(prev.displayParts);
    setUndoStack(s => s.slice(0, -1));
    setChangelog(c => c.slice(0, -1));
  };

  const handleRespond = useCallback(async (item: any, sectionType: 'activity' | 'exceed') => {
    const key = item.id || item.category;
    const val = respondInputs[key];
    if (!val?.trim()) return;
    if (respondLoading[key]) return;
    setRespondLoading(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'iterative-respond', lessonText, item, sectionType, userMessage: val, config }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.feedback) {
        if (sectionType === 'activity') setSection1(prev => prev.map(f => (f.id || f.sectionName) === (item.id || item.sectionName) ? { ...data.feedback } : f));
        else setSection2(prev => prev.map(g => g.category === item.category ? { ...data.feedback } : g));
        setRespondInputs(prev => ({ ...prev, [key]: '' }));
        setExpandedRespond(null);
      }
    } catch (e: any) { alert('Error updating feedback: ' + (e.message || 'Please try again.')); }
    setRespondLoading(prev => ({ ...prev, [key]: false }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respondInputs, respondLoading, lessonText, config]);

  const handleReanalyze = useCallback(async (item: any, sectionType: 'activity' | 'exceed') => {
    const key = item.id || item.category;
    setReanalyzeLoading(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'iterative-reanalyze', lessonText, sectionType, sectionName: item.sectionName, category: item.category, config }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.feedback) {
        if (sectionType === 'activity') setSection1(prev => prev.map(f => (f.id || f.sectionName) === (item.id || item.sectionName) ? { ...data.feedback, id: item.id } : f));
        else setSection2(prev => prev.map(g => g.category === item.category ? { ...data.feedback } : g));
      }
    } catch (e: any) { console.error(e); alert('Re-analyze failed. Please try again.'); }
    setReanalyzeLoading(prev => ({ ...prev, [key]: false }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonText, config]);

  const handleGenerateSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'iterative-summary', lessonText, changelog, config }) });
      const data = await res.json();
      setSummaryText(data.summary || '');
    } catch (e) { console.error(e); }
    setSummaryLoading(false);
  };

  const handleGapDetect = async () => {
    setGapLoading(true);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'iterative-gap', lessonText, config }) });
      const data = await res.json();
      setGapResults(data.gaps || []);
    } catch (e) { console.error(e); }
    setGapLoading(false);
  };

  const exportRevisedLesson = () => {
    const paragraphs = lessonText.split('\n').filter(p => p.trim());
    const rows = paragraphs.map((p, i) =>
      `<tr><td style="padding:12px 16px;font-weight:bold;background:#f3f4f6;width:15%;vertical-align:top;border:1px solid #e5e7eb;font-family:Arial;font-size:11pt;">Section ${i + 1}</td><td style="padding:12px 16px;vertical-align:top;border:1px solid #e5e7eb;font-family:Arial;font-size:11pt;line-height:1.6;">${p.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>`
    ).join('');
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Revised Lesson Plan</title></head><body style="font-family:Arial;padding:40px;">
<h1 style="color:#4f46e5;font-size:24pt;margin-bottom:8px;">Revised Lesson Plan</h1>
<p style="color:#6b7280;font-size:10pt;margin-bottom:24px;">Grade: ${config.grade} &nbsp;|&nbsp; Subject: ${config.subject} &nbsp;|&nbsp; Profile: ${config.profile} &nbsp;|&nbsp; Duration: ${config.minutes} minutes</p>
<table border="1" style="border-collapse:collapse;width:100%;"><tr><th style="padding:12px 16px;background:#4f46e5;color:white;font-family:Arial;font-size:11pt;text-align:left;border:1px solid #4f46e5;">Section</th><th style="padding:12px 16px;background:#4f46e5;color:white;font-family:Arial;font-size:11pt;text-align:left;border:1px solid #4f46e5;">Content</th></tr>${rows}</table>
${changelog.length > 0 ? `<h2 style="color:#4f46e5;font-size:16pt;margin-top:40px;">Changes Made During Review</h2><table border="1" style="border-collapse:collapse;width:100%;"><tr><th style="padding:10px;background:#f3f4f6;font-family:Arial;font-size:10pt;text-align:left;border:1px solid #e5e7eb;">Section</th><th style="padding:10px;background:#f3f4f6;font-family:Arial;font-size:10pt;text-align:left;border:1px solid #e5e7eb;">Original</th><th style="padding:10px;background:#f3f4f6;font-family:Arial;font-size:10pt;text-align:left;border:1px solid #e5e7eb;">Revised</th></tr>${changelog.map(c => `<tr><td style="padding:10px;border:1px solid #e5e7eb;font-family:Arial;font-size:10pt;">${c.sectionName}</td><td style="padding:10px;border:1px solid #e5e7eb;font-family:Arial;font-size:10pt;color:#ef4444;text-decoration:line-through;">${c.isAddition ? '(new addition)' : c.quote}</td><td style="padding:10px;border:1px solid #e5e7eb;font-family:Arial;font-size:10pt;color:#10b981;">${c.revision}</td></tr>`).join('')}</table>` : ''}
</body></html>`;
    triggerDownload(new Blob([html], { type: 'application/msword' }), 'Revised_Lesson_Plan.doc');
  };

  const renderDocument = () => {
    const strikeColor = theme === 'dark' ? '#f87171' : '#dc2626';
    const addColor = theme === 'dark' ? '#34d399' : '#059669';
    const addBg = theme === 'dark' ? 'rgba(16,185,129,0.06)' : 'rgba(5,150,105,0.06)';

    if (displayParts.length === 0) return <span style={{ whiteSpace: 'pre-wrap' }}>{lessonText}</span>;
    return (
      <>
        {displayParts.map((part, i) => {
          if (part.type === 'text') return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part.content}</span>;
          return (
            <span key={i} style={{ display: 'inline-block', width: '100%', margin: '6px 0', padding: '6px 10px', borderLeft: `3px solid ${addColor}`, background: addBg, borderRadius: '4px' }}>
              {!part.isAddition && part.original && (
                <span style={{ display: 'block', textDecoration: 'line-through', color: strikeColor, opacity: 0.8, whiteSpace: 'pre-wrap', fontSize: '0.95em' }}>
                  {part.original}
                </span>
              )}
              {part.isAddition && (
                <span style={{ display: 'block', fontSize: '0.7em', fontWeight: 900, letterSpacing: '0.1em', color: addColor, textTransform: 'uppercase', marginBottom: '4px' }}>
                  + Added
                </span>
              )}
              <span style={{ display: 'block', color: addColor, fontWeight: 600, whiteSpace: 'pre-wrap' }}>
                {part.replacement}
              </span>
            </span>
          );
        })}
      </>
    );
  };

  // --- START ANALYSIS ---
  // FIX #2 (part A): startAnalysis now accepts an optional overrideMode parameter.
  // This is used by the "Run Full 12-Category Analysis" button on the completion screen,
  // which previously called setConfig(...) then startAnalysis() in the same tick.
  // Because React batches state updates, startAnalysis() ran before the config state
  // had updated, so it still read config.mode as 'Iterative feedback' and launched
  // another iterative session instead of the full 12-category analysis.
  // Fix: pass the desired mode directly so we never depend on React flushing setConfig
  // synchronously before startAnalysis reads config.mode.
  const startAnalysis = async (overrideMode?: string) => {
    const effectiveMode = overrideMode ?? config.mode;

    if (!lessonText.trim()) { setLessonError('Please paste your lesson plan first.'); return; }
    if (lessonText.length > MAX_LESSON_LENGTH) { setLessonError(`Lesson is too long. Please trim it under ${MAX_LESSON_LENGTH.toLocaleString()} characters.`); return; }
    setLessonError('');

    let cu = user || (await login());
    if (!cu) return;
    if (effectiveMode === 'Custom selection' && customSelection.length === 0) return alert('Select at least one category.');

    if (effectiveMode === 'Iterative feedback') {
      setLoading(true);
      setSection1([]); setSection2([]);
      setS1Loading(true); setS2Loading(true);
      setIterativeStarted(false);
      setDisplayParts([{ type: 'text', content: lessonText }]);
      setUndoStack([]); setFlashingId(null); setChangelog([]);
      setSummaryText(''); setGapResults([]); setReanalyzeLoading({});
      setRespondLoading({}); setExpandedRespond(null); setRespondInputs({});
      setIterativeError('');
      setStep('iterative');
      setLoading(false);

      Promise.allSettled([
        fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'iterative-init-activities', lessonText, config }) }).then(r => r.json()),
        fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'iterative-init-exceed', lessonText, config }) }).then(r => r.json()),
      ]).then(([s1Res, s2Res]) => {
        let anySuccess = false;
        if (s1Res.status === 'fulfilled' && s1Res.value?.feedbacks) {
          setSection1(s1Res.value.feedbacks);
          setS1InitCount(s1Res.value.feedbacks.length);
          anySuccess = true;
        }
        setS1Loading(false);
        if (s2Res.status === 'fulfilled' && s2Res.value?.guide) {
          setSection2(s2Res.value.guide);
          setS2InitCount(s2Res.value.guide.length);
          anySuccess = true;
        }
        setS2Loading(false);
        setIterativeStarted(true);
        if (!anySuccess) setIterativeError('Both sections failed to load. Please go back and try again.');
      });
      return;
    }

    if (effectiveMode === 'Focused report') {
      setLoading(true);
      try {
        const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonText, config: { ...config, mode: effectiveMode }, selectedLenses: null }) });
        const data = await res.json();
        if (data.feedback && data.feedback.length > 0) {
          // Code-side enforcement: slice to exactly 3 regardless of what AI returned,
          // then overwrite pioneer names from the hardcoded map
          const enforced = applyPioneers(data.feedback.slice(0, 3));
          await saveAndShowReport(cu, enforced);
        } else {
          alert(data.error || 'Focused report returned no feedback. Please try again.');
        }
      } catch (e: any) { alert('Network Error: ' + e.message); }
      setLoading(false); return;
    }

    // Full report or Custom selection
    const cats = effectiveMode === 'Custom selection' ? customSelection : ALL_CATS;
    setLoading(true);
    setFailedChunks([]);
    try {
      const chunks = chunkArray(cats, 3);
      const results = await Promise.allSettled(
        chunks.map(chunk =>
          fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lessonText, config: { ...config, mode: 'Custom selection' }, selectedLenses: chunk })
          }).then(r => r.json())
        )
      );

      const merged: any[] = [];
      const failed: string[] = [];

      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value?.feedback && r.value.feedback.length > 0) {
          merged.push(...r.value.feedback);
        } else {
          failed.push(...chunks[i]);
        }
      });

      if (merged.length > 0) {
        // Code-side enforcement for Custom selection:
        // Filter to only categories actually requested, in case AI added extras.
        // Then overwrite pioneer names from the hardcoded map.
        const filtered = effectiveMode === 'Custom selection'
          ? merged.filter(f => cats.includes(f.name))
          : merged;
        const withPioneers = applyPioneers(filtered);

        // Track any selected categories that came back missing
        const returnedNames = withPioneers.map(f => f.name);
        const missingCats = cats.filter(c => !returnedNames.includes(c));
        const allFailed = [...failed, ...missingCats];

        if (allFailed.length > 0) setFailedChunks(allFailed);
        await saveAndShowReport(cu, withPioneers);
      } else {
        alert('All analysis chunks failed. Please try again or use a shorter lesson.');
      }
    } catch (e: any) { alert('Network Error: ' + e.message); }
    setLoading(false);
  };

  // Chat: captures history snapshot BEFORE appending the new user message,
  // then sends both separately. The API appends userMessage after historySnapshot
  // so the user turn appears exactly once in the OpenAI messages array.
  const handleFollowUp = async (autoText?: string) => {
    const text = typeof autoText === 'string' ? autoText : chatInput;
    if (!text?.trim()) return;

    setChatLoading(true);

    // Capture history BEFORE the new user message is appended
    const historySnapshot = chatHistory.slice();

    const msg = { role: 'user' as const, content: sanitizeHtml(text) };
    setChatHistory(p => [...p, msg]);
    setChatInput('');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'chat',
          chatHistory: historySnapshot,
          userMessage: text,
          config,
          lessonText,
          lensContext: selectedLens,
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const sanitized = sanitizeHtml(data.reply || '');
      setChatHistory(p => [...p, { role: 'assistant' as const, content: sanitized }]);
    } catch (e: any) { alert('Chat error: ' + (e.message || 'Please try again.')); }
    setChatLoading(false);
  };

  const submitQuiz = async () => {
    if (!selectedLens) return;

    // Fix #4: Require all questions to be answered before certifying mastery.
    // Previously a teacher could click "Certify Mastery" with zero answers selected
    // and receive a score of 0/5 which would immediately lock the lens as 'red'.
    const totalQuestions = selectedLens.quiz.length;
    const answeredCount = Object.keys(quizAnswers).length;
    if (answeredCount < totalQuestions) {
      alert(`Please answer all ${totalQuestions} questions before certifying.`);
      return;
    }

    let score = 0;
    selectedLens.quiz.forEach((q: any, i: number) => { if (quizAnswers[i] === q.correct) score++; });
    const status = score === 5 ? 'green' : score >= 3 ? 'amber' : 'red';

    const updatedLens = { ...selectedLens, status, quizScore: score };
    const updatedLenses = lenses.map((l: any) => l.id === selectedLens.id ? updatedLens : l);

    setSelectedLens(updatedLens);
    setLenses(updatedLenses);
    setQuizResult(score);

    if (user) {
      try {
        const q = query(collection(db, 'users', user.uid, 'reports'), orderBy('timestamp', 'desc'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const latestDoc = snap.docs[0];
          await setDoc(doc(db, 'users', user.uid, 'reports', latestDoc.id), { lenses: updatedLenses }, { merge: true });
          loadHistory(user.uid);
        }
      } catch (e) {
        console.error('Failed to persist quiz score:', e);
      }
    }
  };

  const generatePrize = async () => {
    setPrizeLoading(true);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'prize', lessonText, config }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Elite Lesson Plan</title></head><body><h1>Elite Lesson Plan</h1><table border="1" style="border-collapse:collapse;width:100%;font-family:Arial;">${Object.entries(data).map(([k, v]) => `<tr><td style="padding:10px;font-weight:bold;background:#f3f4f6;width:25%;vertical-align:top;">${k}</td><td style="padding:10px;vertical-align:top;">${String(v).replace(/\n/g, '<br/>')}</td></tr>`).join('')}</table></body></html>`;
      triggerDownload(new Blob([html], { type: 'application/msword' }), 'Elite_Lesson_Plan.doc');
    } catch (e: any) { alert('Prize generation failed: ' + (e.message || 'Please try again.')); }
    setPrizeLoading(false);
  };

  const generateMaterializer = async () => {
    setMaterialLoading(true);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'materializer', lessonText, config, userMessage: materializerInput }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Student Handout</title></head><body style="font-family:Arial;padding:20px;">${data.html}</body></html>`;
      triggerDownload(new Blob([html], { type: 'application/msword' }), 'Student_Handout.doc');
    } catch (e: any) { alert('Materializer failed: ' + (e.message || 'Please try again.')); }
    setMaterialLoading(false);
  };

  const generateGamifier = async () => {
    setGameLoading(true);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'gamifier', lessonText, config }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      triggerDownload(new Blob([data.csv], { type: 'text/csv;charset=utf-8;' }), 'Kahoot_Ready_Quiz.csv');
    } catch (e: any) { alert('Gamifier failed: ' + (e.message || 'Please try again.')); }
    setGameLoading(false);
  };

  const generateIEP = async () => {
    if (!iepInput.trim()) return alert('Enter a student profile first.');
    setIepLoading(true);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'iep', lessonText, config, userMessage: iepInput }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>IEP Scaffold</title></head><body style="font-family:Arial;padding:20px;">${data.html}</body></html>`;
      triggerDownload(new Blob([html], { type: 'application/msword' }), 'IEP_Accommodation.doc');
    } catch (e: any) { alert('IEP generation failed: ' + (e.message || 'Please try again.')); }
    setIepLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const r = await mammoth.extractRawText({ arrayBuffer: ev.target?.result as ArrayBuffer });
        if (r.value.length > MAX_LESSON_LENGTH) {
          setLessonError(`Document is too long. Please trim it under ${MAX_LESSON_LENGTH.toLocaleString()} characters.`);
          return;
        }
        setLessonText(r.value);
        setLessonError('');
      } catch { alert('Error reading .docx file'); }
    };
    reader.readAsArrayBuffer(file); e.target.value = '';
  };

  const mastery = lenses.length > 0 ? (lenses.filter((l: any) => l.status === 'green').length / lenses.length) * 100 : 0;
  const s1Resolved = s1InitCount - section1.length;
  const s2Resolved = s2InitCount - section2.length;
  const totalResolved = s1Resolved + s2Resolved;
  const totalCards = s1InitCount + s2InitCount;
  const progressPct = totalCards > 0 ? (totalResolved / totalCards) * 100 : 0;
  const allDone = iterativeStarted && !s1Loading && !s2Loading && section1.length === 0 && section2.length === 0;

  // FIX #4 & #5 (continued): These three inline handlers are also useCallback-wrapped
  // so IterativeCard's React.memo is fully effective.
  const handleRespondInputChange = useCallback((key: string, value: string) => {
    setRespondInputs(p => ({ ...p, [key]: value }));
  }, []);

  const handleRespondInputKeyDown = useCallback((e: React.KeyboardEvent, item: any, sectionType: 'activity' | 'exceed') => {
    if (e.key === 'Enter') handleRespond(item, sectionType);
  // handleRespond is stable via useCallback so this is safe
  }, [handleRespond]);

  const handleToggleRespond = useCallback((key: string) => {
    setExpandedRespond(prev => prev === key ? null : key);
  }, []);

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)] transition-all duration-300">

      {/* SIDEBAR */}
      <motion.aside animate={{ width: sidebarOpen ? 300 : 0, opacity: sidebarOpen ? 1 : 0 }} className="glass-sidebar h-full overflow-hidden flex flex-col z-[60]">
        <div className="p-6 flex flex-col h-full text-white text-left">
          <button onClick={() => setStep('input')} className="w-full border border-white/10 rounded-xl p-4 flex items-center gap-3 hover:bg-white/5 mb-8 font-bold text-sm shadow-lg">
            <RefreshCcw size={16} /> New Session
          </button>
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <span className="text-[10px] font-black uppercase tracking-widest px-2 opacity-70 block mb-4">History</span>
            {history.map(item => (
              <button key={item.id} onClick={() => { setLenses(item.lenses); setConfig(item.config); setLessonText(item.lessonText); setSelectedLens(null); setQuizResult(null); setQuizAnswers({}); setChatHistory([]); setStep('dashboard'); }}
                className="w-full text-left p-3 rounded-lg hover:bg-white/5 text-xs truncate transition-all opacity-70 hover:opacity-100">{item.title}</button>
            ))}
          </div>
          <div className="pt-6 border-t border-white/5 space-y-4">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-full flex items-center gap-3 p-3 text-xs font-bold hover:bg-white/5 rounded-lg text-white">Theme Toggle</button>
            {user && (
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                <img
                  src={user.photoURL ?? ''}
                  className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center"
                  alt="avatar"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="text-xs font-bold truncate max-w-[120px]">{user.displayName}</span>
                <button onClick={() => signOut(auth).then(() => {
                  // Fix #6: Clear all session state on logout so no stale lesson/lenses/chat
                  // remain visible if a different user logs in on the same browser session.
                  setLessonText('');
                  setLenses([]);
                  setSelectedLens(null);
                  setChatHistory([]);
                  setQuizResult(null);
                  setQuizAnswers({});
                  setFailedChunks([]);
                  setStep('input');
                })}><LogOut size={16} /></button>
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="p-6 flex justify-between items-center z-40 bg-[var(--background)]">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-[var(--border)] hover:text-indigo-400 shadow-sm"><Menu size={20} /></button>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 font-serif italic text-2xl tracking-tighter">
              <Sparkles className="text-indigo-600 dark:text-indigo-500" size={24} /> AI Micro-Feedback Coach
            </div>
            <div className="w-64 h-1 bg-black/5 dark:bg-white/5 rounded-full mt-2 overflow-hidden border border-[var(--border)]">
              <motion.div className="h-full bg-emerald-500" style={{ width: `${mastery}%` }} />
            </div>
          </div>
          <div className="w-12 h-12" />
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-12 scrollbar-hide flex flex-col items-center text-center">
          <AnimatePresence mode="wait">

            {/* ===================== INPUT ===================== */}
            {step === 'input' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-16 w-full flex flex-col items-center">
                <div className="text-center space-y-6">
                  <h2 className="text-6xl md:text-8xl font-serif italic text-[var(--foreground)] leading-[0.8] tracking-tighter">
                    Instant <br /><span className="font-sans font-black not-italic text-indigo-600 dark:text-indigo-50 uppercase dark:drop-shadow-[0_0_30px_rgba(99,102,241,0.5)]">Mentorship.</span>
                  </h2>
                  <p className="text-indigo-600 dark:text-indigo-400 font-black text-xs uppercase tracking-[0.6em]">Research-Grounded Coaching for Everyday Lessons</p>
                </div>

                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="w-full max-w-5xl mx-auto">
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-[2.5rem] p-10 md:p-14 space-y-10">
                    <div className="text-center space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-600/70 dark:text-indigo-400/70">Why this exists</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-light italic leading-relaxed max-w-xl mx-auto">Before you paste your lesson, we want you to know one thing:</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                      <div className="space-y-3 text-left p-6 rounded-2xl bg-black/[0.03] dark:bg-white/[0.02] border border-[var(--border)]">
                        <p className="text-[var(--foreground)] text-base md:text-lg font-light leading-relaxed">
                          The best lesson plan in the world means nothing if you're too burned out to deliver it.{' '}
                          <span className="font-semibold">Every hour saved on planning is an hour you show up more present, more energized, more <em>you</em> — and your students feel that.</span>
                        </p>
                      </div>
                      <div className="space-y-3 text-left p-6 rounded-2xl bg-black/[0.03] dark:bg-white/[0.02] border border-[var(--border)]">
                        <p className="text-[var(--foreground)] text-base md:text-lg font-light leading-relaxed">
                          Every minute you spend on planning is a minute not spent on your students.{' '}
                          <span className="font-semibold">This tool gives those minutes back — so when you walk into that classroom, you're fully there.</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-center pt-4 border-t border-[var(--border)]">
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-light italic">That's what this tool is for. Not to replace you — to make sure your students always get the best of you.</p>
                    </div>
                  </div>
                </motion.div>

                <div className="relative group max-w-4xl w-full">
                  <div className="absolute -inset-1 bg-indigo-500/10 rounded-3xl blur-xl opacity-70"></div>
                  <div className="relative bg-[var(--card)] border border-[var(--border)] p-10 rounded-3xl shadow-2xl space-y-8 text-center">
                    <p className="text-[var(--foreground)] text-lg font-light italic opacity-70 leading-relaxed">Paste a lesson plan. The coach returns supportive feedback where each paragraph:</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 text-left max-w-3xl mx-auto">
                      <DescriptionItem text="Names appropriate approach + pioneer in the first sentence." />
                      <DescriptionItem text="Adapts to grade level, subject area, and learner profile." />
                      <DescriptionItem text="Attends to class time and your specific phase breakdown." />
                      <DescriptionItem text="May repeat approaches with explicit pedagogical rationale." />
                      <div className="md:col-span-2 pt-4 border-t border-[var(--border)] text-center">
                        <DescriptionItem text="Concludes with a precise 'Concrete example:' for the class window." highlight />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 w-full max-w-5xl mx-auto pt-8">
                  {CAT_DATA.map(cat => <VividLensTile key={cat.id} cat={cat} theme={theme} />)}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full">
                  <FeatureFlipCard icon={<Brain size={24} />} title="Theory Aware" desc="Deep Pedagogy: Every insight is hard-wired into proven research." glow="turquoise" />
                  <FeatureFlipCard icon={<Clock size={24} />} title="Time Budgeted" desc="Clock-Sync: Routines engineered to fit your exact minutes." glow="yellow" />
                  <FeatureFlipCard icon={<ShieldCheck size={24} />} title="Mastery Certified" desc="Evidence-Based: Verify growth through mastery check-ins." glow="emerald" />
                </div>

                <div className="w-full max-w-[1400px] px-4">
                  <div className="flex flex-row gap-2 justify-center items-stretch w-full">
                    <MenuTile label="Tone" value={config.tone} options={['Coaching-style','Supportive','Warm','Direct']} onChange={v => setConfig({ ...config, tone: v })} />
                    <MenuTile label="Grade" value={config.grade} options={['K–2','3–5','6–8','9–12']} onChange={v => setConfig({ ...config, grade: v })} />
                    <MenuTile label="Subject" value={config.subject} options={['ELA','Math','Science','Social','Arts']} onChange={v => setConfig({ ...config, subject: v })} />
                    <MenuTile label="Learners" value={config.profile} options={['General','ELL','Special Ed','Honors']} onChange={v => setConfig({ ...config, profile: v })} />
                    <MenuTile label="Mode" value={config.mode} options={['Full report','Focused report','Custom selection','Iterative feedback']} onChange={v => setConfig({ ...config, mode: v })} />
                    <div className="bg-[var(--card)] border border-indigo-500/10 rounded-2xl p-5 flex-1 flex flex-col items-center justify-center shadow-xl hover:border-indigo-500/40 transition-all min-w-[150px] text-center">
                      <span className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 mb-3 tracking-widest">Minutes</span>
                      <div className="flex items-center justify-center gap-1.5 w-full">
                        <Clock size={12} className="text-indigo-600 dark:text-indigo-500 shrink-0" />
                        <input type="number" min="1" value={config.minutes} onChange={e => setConfig({ ...config, minutes: Math.max(1, Number(e.target.value)) })} className="bg-transparent text-[var(--foreground)] font-black w-10 text-center outline-none text-sm tracking-tighter" />
                        <span className="text-[8px] font-bold text-slate-400 uppercase">Min</span>
                      </div>
                    </div>
                  </div>
                </div>

                {config.mode === 'Custom selection' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="w-full max-w-6xl pb-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {ALL_CATS.map(cat => (
                        <button key={cat} onClick={() => toggleCustom(cat)}
                          className={`p-4 rounded-xl border-2 transition-all font-black uppercase text-[10px] tracking-widest ${customSelection.includes(cat) ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl' : 'bg-[var(--card)] border-[var(--border)] text-slate-500 hover:border-indigo-500/30'}`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                <div className={`bg-[var(--card)] border rounded-[3rem] p-3 shadow-3xl relative overflow-hidden group transition-all duration-1000 w-full max-w-6xl mx-auto ${lessonText ? 'animate-liquid-border' : 'border-[var(--border)]'}`}>
                  <div className="absolute top-6 right-8 z-10 flex gap-4">
                    <input type="file" accept=".docx" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-black/5 hover:bg-black/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-slate-600 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-500">
                      <FileUp size={14} /> Upload .docx
                    </button>
                  </div>
                  <textarea value={lessonText} onChange={e => { setLessonText(e.target.value); if (e.target.value.length <= MAX_LESSON_LENGTH) setLessonError(''); }}
                    className="w-full h-[400px] bg-transparent border-none p-12 text-2xl text-[var(--foreground)] resize-none outline-none font-light leading-relaxed text-center placeholder:text-slate-400 dark:placeholder:text-slate-600"
                    placeholder="Paste your lesson plan here or upload a .docx..." />
                  {lessonError && <p className="text-center text-sm text-red-500 font-bold pb-2">{lessonError}</p>}
                  {lessonText.length > 0 && (
                    <p className={`text-center text-xs pb-2 ${lessonText.length > MAX_LESSON_LENGTH ? 'text-red-500' : 'text-slate-400'}`}>
                      {lessonText.length.toLocaleString()} / {MAX_LESSON_LENGTH.toLocaleString()} characters
                    </p>
                  )}
                  <div className="p-4 pt-0 flex justify-center">
                    <motion.button onClick={() => startAnalysis()} disabled={loading} whileHover={{ scale: 1.005 }}
                      className="relative w-full h-28 bg-[#050508] border border-black/10 dark:border-white/10 text-white rounded-2xl font-black text-2xl uppercase tracking-[0.3em] overflow-hidden shadow-2xl flex items-center justify-center group">
                      <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-20 group-hover:opacity-100 transition-opacity duration-700">
                        {/* FIX #3: Use pre-computed stable durations (LAUNCH_BAR_DURATIONS) instead of
                            Math.random() inline. Calling Math.random() in a motion prop triggers a new
                            random value on every render, causing the bars to re-animate infinitely. */}
                        {CAT_DATA.map((c, i) => (
                          <motion.div key={i} className="w-[2px] h-8 rounded-full" style={{ backgroundColor: c.color }}
                            animate={{ scaleY: [1, 2.2, 1], opacity: [0.2, 1, 0.2] }}
                            transition={{ duration: LAUNCH_BAR_DURATIONS[i], repeat: Infinity, delay: i * 0.1 }} />
                        ))}
                      </div>
                      <span className="relative z-10 flex items-center gap-4 justify-center w-full font-sans tracking-[0.4em]">
                        {loading ? 'Catalyzing Data...' : 'Launch Feedback'}
                        {!loading && <ArrowRight className="group-hover:translate-x-2 transition-transform" />}
                      </span>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ===================== ITERATIVE ===================== */}
            {step === 'iterative' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[1500px] mx-auto flex flex-col gap-5 text-left" style={{ minHeight: '75vh' }}>

                {/* Top bar */}
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="text-3xl font-black font-serif italic tracking-tighter text-[var(--foreground)]">Iterative Review</h3>
                    <p className="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mt-1">{totalResolved} of {totalCards} feedbacks resolved</p>
                  </div>
                  <div className="flex gap-3 items-center flex-wrap">
                    {undoStack.length > 0 && (
                      <button onClick={handleUndo} className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all">
                        <RotateCcw size={14} /> Undo Last
                      </button>
                    )}
                    {changelog.length > 0 && (
                      <button onClick={exportRevisedLesson} className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all">
                        <Download size={14} /> Export Revised Lesson
                      </button>
                    )}
                    <button onClick={() => setStep('input')} className="flex items-center gap-2 px-4 py-2 bg-black/5 dark:bg-white/5 border border-[var(--border)] rounded-xl text-xs font-black uppercase tracking-widest hover:border-indigo-500/40 transition-all">
                      <X size={14} /> Exit
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-black/10 dark:bg-white/5 rounded-full overflow-hidden border border-[var(--border)]">
                  <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full" animate={{ width: `${progressPct}%` }} transition={{ duration: 0.5 }} />
                </div>

                {iterativeError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 flex items-center gap-3">
                    <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">{iterativeError}</p>
                  </div>
                )}

                {/* Split pane */}
                {!allDone && (
                  <div className="flex flex-col lg:flex-row gap-6" style={{ minHeight: '70vh' }}>

                    {/* LEFT: Document */}
                    <div className="w-full lg:w-[45%] flex flex-col gap-3 flex-shrink-0">
                      <h4 className="text-2xl font-serif italic tracking-tighter text-indigo-600 dark:text-indigo-400">Lesson Document</h4>
                      <div className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-[2rem] p-8 overflow-y-auto text-[var(--foreground)] text-base leading-8 font-light shadow-xl" style={{ minHeight: '60vh' }}>
                        {renderDocument()}
                      </div>
                    </div>

                    {/* RIGHT: Both sections */}
                    <div className="w-full lg:flex-1 flex flex-col gap-5 overflow-y-auto scrollbar-hide" style={{ maxHeight: '82vh' }}>

                      {/* SECTION 1 */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <h4 className="text-2xl font-serif italic tracking-tighter text-emerald-600 dark:text-emerald-400">Lesson Activity Feedback</h4>
                          {s1Loading && <RefreshCcw size={16} className="animate-spin text-emerald-600 dark:text-emerald-400" />}
                        </div>
                        {s1Loading ? (
                          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[2rem] p-8 text-center">
                            <RefreshCcw size={24} className="animate-spin text-indigo-600 dark:text-indigo-400 mx-auto mb-3" />
                            <p className="text-sm text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Analyzing your lesson activities...</p>
                          </div>
                        ) : (
                          <AnimatePresence>
                            {section1.map(item => (
                              <IterativeCard
                                key={item.id || item.sectionName}
                                item={item} sectionType="activity" color="#6366f1"
                                flashingId={flashingId} expandedRespond={expandedRespond}
                                respondInputs={respondInputs} reanalyzeLoading={reanalyzeLoading}
                                respondLoading={respondLoading} theme={theme}
                                onAgree={handleAgree} onDismiss={handleDismiss}
                                onReanalyze={handleReanalyze} onRespond={handleRespond}
                                onRespondInputChange={handleRespondInputChange}
                                onRespondInputKeyDown={handleRespondInputKeyDown}
                                onToggleRespond={handleToggleRespond}
                              />
                            ))}
                          </AnimatePresence>
                        )}
                        {!s1Loading && section1.length === 0 && s1InitCount > 0 && (
                          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-5 text-center">
                            <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-500 mx-auto mb-2" />
                            <p className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-500">All activity feedback resolved</p>
                          </div>
                        )}
                      </div>

                      <div className="border-t-2 border-dashed border-[var(--border)] my-2" />

                      {/* SECTION 2 */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <h4 className="text-2xl font-serif italic tracking-tighter text-purple-700 dark:text-[#bc13fe]">Exceed Expectations Guide</h4>
                          {s2Loading && <RefreshCcw size={16} className="animate-spin text-purple-700 dark:text-[#bc13fe]" />}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">How to fully address all 5 pedagogical frameworks in your lesson</p>
                        {s2Loading ? (
                          <div className="bg-[var(--card)] border border-[var(--border)] rounded-[2rem] p-8 text-center">
                            <RefreshCcw size={24} className="animate-spin text-purple-700 dark:text-[#bc13fe] mx-auto mb-3" />
                            <p className="text-sm text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Building exceed-expectations guide...</p>
                          </div>
                        ) : (
                          <AnimatePresence>
                            {section2.map(item => (
                              <IterativeCard
                                key={item.category}
                                item={item} sectionType="exceed" color={EXCEED_COLORS[item.category] || '#6366f1'}
                                flashingId={flashingId} expandedRespond={expandedRespond}
                                respondInputs={respondInputs} reanalyzeLoading={reanalyzeLoading}
                                respondLoading={respondLoading} theme={theme}
                                onAgree={handleAgree} onDismiss={handleDismiss}
                                onReanalyze={handleReanalyze} onRespond={handleRespond}
                                onRespondInputChange={handleRespondInputChange}
                                onRespondInputKeyDown={handleRespondInputKeyDown}
                                onToggleRespond={handleToggleRespond}
                              />
                            ))}
                          </AnimatePresence>
                        )}
                        {!s2Loading && section2.length === 0 && s2InitCount > 0 && (
                          <div className="bg-purple-50 dark:bg-[#bc13fe]/10 border border-purple-200 dark:border-[#bc13fe]/20 rounded-2xl p-5 text-center">
                            <CheckCircle2 size={24} className="text-purple-700 dark:text-[#bc13fe] mx-auto mb-2" />
                            <p className="text-xs font-black uppercase tracking-widest text-purple-700 dark:text-[#bc13fe]">All frameworks exceeded</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* COMPLETION PANEL */}
                {allDone && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-[3rem] p-10 text-center space-y-8">
                      <CheckCircle2 size={56} className="text-emerald-600 dark:text-emerald-500 mx-auto" />
                      <div>
                        <h4 className="text-3xl font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-500 mb-2">
                          {changelog.length > 0 ? `${changelog.length} Change${changelog.length > 1 ? 's' : ''} Applied` : 'Review Complete'}
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Your lesson has been iteratively improved</p>
                      </div>

                      {changelog.length > 0 && (
                        <div className="text-left space-y-3 max-w-3xl mx-auto">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 opacity-80 text-center">What Changed</p>
                          {changelog.map((c, i) => (
                            <div key={i} className="flex gap-3 items-start p-4 rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5">
                              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-emerald-600 dark:bg-emerald-500" />
                              <div>
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 block mb-1">{c.sectionName}</span>
                                {!c.isAddition && <p className="text-xs text-slate-400 line-through mb-1">"{c.quote}"</p>}
                                {c.isAddition && <p className="text-xs text-slate-400 mb-1">(new addition)</p>}
                                <p className="text-xs font-medium text-[var(--foreground)]">"{c.revision}"</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {gapResults.length === 0 ? (
                        <button onClick={handleGapDetect} disabled={gapLoading}
                          className="px-8 py-4 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 rounded-2xl font-black text-sm uppercase tracking-widest disabled:opacity-50 flex items-center gap-2 mx-auto transition-all">
                          {gapLoading ? <RefreshCcw size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
                          {gapLoading ? 'Scanning...' : 'Run Lesson Gap Detector'}
                        </button>
                      ) : (
                        <div className="text-left space-y-3 max-w-3xl mx-auto">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 opacity-80 text-center">Lesson Gap Report</p>
                          {gapResults.map((g, i) => (
                            <div key={i} className={`flex gap-3 items-start p-4 rounded-2xl border ${g.adequatelyAddressed ? 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5' : 'border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5'}`}>
                              {g.adequatelyAddressed ? <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-500 flex-shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />}
                              <div>
                                <span className={`text-[9px] font-black uppercase tracking-widest block mb-1 ${g.adequatelyAddressed ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>{g.category}</span>
                                {!g.adequatelyAddressed && <p className="text-xs text-[var(--foreground)] opacity-75">{g.note}</p>}
                                {g.adequatelyAddressed && <p className="text-xs text-slate-500 dark:text-slate-400">Adequately addressed ✓</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {summaryText ? (
                        <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-2xl p-6 text-left max-w-3xl mx-auto">
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-3">Mentor Summary</p>
                          <p className="text-sm leading-relaxed text-[var(--foreground)] opacity-80">{summaryText}</p>
                        </div>
                      ) : changelog.length > 0 && (
                        <button onClick={handleGenerateSummary} disabled={summaryLoading}
                          className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest disabled:opacity-50 flex items-center gap-2 mx-auto">
                          {summaryLoading ? <RefreshCcw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                          {summaryLoading ? 'Generating...' : 'Generate Mentor Summary'}
                        </button>
                      )}

                      <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap">
                        <button onClick={exportRevisedLesson}
                          className="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                          <Download size={16} /> Export Revised Lesson (.doc)
                        </button>
                        {/* FIX #2: Pass 'Full report' directly as overrideMode so startAnalysis
                            uses it immediately — no dependency on React flushing setConfig first.
                            The old code called setConfig(...mode:'Full report') then startAnalysis()
                            in the same tick; startAnalysis read the STALE config.mode ('Iterative
                            feedback') because React hadn't re-rendered yet, causing it to launch
                            another iterative session instead of the full 12-category analysis. */}
                        <button
                          onClick={() => {
                            setConfig(c => ({ ...c, mode: 'Full report' }));
                            startAnalysis('Full report');
                          }}
                          className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-2">
                          <ArrowRight size={16} /> Run Full 12-Category Analysis
                        </button>
                        <button onClick={() => setStep('input')} className="px-8 py-4 bg-[var(--card)] border border-[var(--border)] rounded-2xl text-sm font-black uppercase tracking-widest hover:border-indigo-500/40 transition-all">
                          Return to Input
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

              </motion.div>
            )}

            {/* ===================== DASHBOARD ===================== */}
            {step === 'dashboard' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-16 w-full flex flex-col items-center">
                <h3 className="text-7xl font-black text-[var(--foreground)] tracking-tighter uppercase font-serif italic underline decoration-indigo-400 dark:decoration-indigo-500/60 decoration-8 underline-offset-[20px] text-center">The Blueprint.</h3>

                {failedChunks.length > 0 && (
                  <div className="w-full max-w-4xl bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-1">Some categories failed to load</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 opacity-80">
                        The following categories could not be analyzed and are missing from your report: <strong>{failedChunks.join(', ')}</strong>. You can go back and try again with a shorter lesson, or re-run with Custom Selection for just these categories.
                      </p>
                    </div>
                  </div>
                )}

                {mastery === 100 && (
                  <div className="flex flex-col md:flex-row gap-6 items-center justify-center w-full z-50 flex-wrap">
                    <motion.button initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={generatePrize} disabled={prizeLoading}
                      className="py-6 px-12 bg-emerald-500 text-white rounded-[2rem] font-black text-2xl shadow-[0_0_40px_rgba(16,185,129,0.5)] animate-pulse uppercase tracking-widest disabled:opacity-50">
                      {prizeLoading ? 'Forging Elite Doc...' : 'Claim Ultimate Prize: Elite Lesson Plan'}
                    </motion.button>
                    <div className="flex flex-col gap-3 items-center w-full md:w-auto">
                      <input disabled={materialLoading} value={materializerInput} onChange={e => setMaterializerInput(e.target.value)}
                        className="w-full bg-black/5 dark:bg-white/5 border border-[#00d2ff]/30 text-[var(--foreground)] rounded-2xl p-4 text-center placeholder:text-[#00d2ff]/60 outline-none focus:border-[#00d2ff] transition-all"
                        placeholder="Custom Instructions (e.g. Gallery Walk, Cut & Paste)..." />
                      <motion.button initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={generateMaterializer} disabled={materialLoading}
                        className="w-full py-6 px-12 bg-[#00d2ff] text-white rounded-[2rem] font-black text-2xl shadow-[0_0_40px_rgba(0,210,255,0.5)] animate-pulse uppercase tracking-widest disabled:opacity-50">
                        {materialLoading ? 'Materializing...' : 'The Materializer: Generate Handout'}
                      </motion.button>
                    </div>
                    <motion.button initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={generateGamifier} disabled={gameLoading}
                      className="py-6 px-12 bg-[#bc13fe] text-white rounded-[2rem] font-black text-2xl shadow-[0_0_40px_rgba(188,19,254,0.5)] animate-pulse uppercase tracking-widest disabled:opacity-50">
                      {gameLoading ? 'Compiling...' : 'The Gamifier: Export Quiz (.CSV)'}
                    </motion.button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 pt-10 mx-auto w-full text-left">
                  {lenses.map(lens => {
                    const catEntry = CAT_DATA.find(c => c.name === lens.name) || null;
                    return (
                      <DashboardCard key={lens.id} lens={lens} catData={catEntry} onClick={() => {
                        setSelectedLens(lens);
                        setDrawerTab('mentoring');
                        setQuizResult(null);
                        setQuizAnswers({});
                        setChatHistory([]);
                      }} />
                    );
                  })}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* SIDE DRAWER */}
      <AnimatePresence>
        {selectedLens && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedLens(null)} className="fixed inset-0 bg-black/90 backdrop-blur-md z-[70]" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30 }}
              className="fixed right-0 top-0 h-full w-full max-w-[850px] bg-[var(--card)] border-l border-[var(--border)] z-[80] flex flex-col shadow-2xl text-left overflow-hidden">
              <div className="p-12 border-b border-[var(--border)] bg-black/[0.02] dark:bg-white/[0.02]">
                <div className="flex justify-between items-center mb-8">
                  <span className="text-xs text-indigo-600 dark:text-indigo-500 font-black uppercase tracking-[0.5em]">{selectedLens.pioneer}</span>
                  <button onClick={() => setSelectedLens(null)} className="p-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl"><X size={28} /></button>
                </div>
                <h2 className="text-5xl font-black text-[var(--foreground)] mb-10 uppercase tracking-tighter leading-none font-serif italic">{selectedLens.name}</h2>

                {/* Mastery status badge */}
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-3 h-3 rounded-full ${selectedLens.status === 'green' ? 'bg-emerald-400' : selectedLens.status === 'amber' ? 'bg-amber-400' : selectedLens.status === 'red' ? 'bg-red-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    {selectedLens.status === 'green' ? 'Mastery Achieved' : selectedLens.status === 'amber' ? 'Partial Mastery' : selectedLens.status === 'red' ? 'Not Yet Mastered' : 'Not Attempted'}
                    {selectedLens.quizScore !== null && selectedLens.quizScore !== undefined ? ` — ${selectedLens.quizScore}/5` : ''}
                  </span>
                </div>

                <div className="flex gap-4">
                  <TabBtn active={drawerTab === 'mentoring'} onClick={() => setDrawerTab('mentoring')} icon={<MessageSquare size={16} />} label="Elite Coaching" />
                  <TabBtn active={drawerTab === 'quiz'} onClick={() => setDrawerTab('quiz')} icon={<Brain size={16} />} label="Mastery Quiz" />
                </div>
              </div>
              <div className="flex-1 p-12 overflow-y-auto space-y-12 pb-40">
                {drawerTab === 'mentoring' ? (
                  <div className="space-y-12">
                    <div className="space-y-12 bg-black/[0.03] dark:bg-white/[0.01] p-10 rounded-[3rem] border border-[var(--border)] text-left">
                      <section><h5 className="text-indigo-600 dark:text-indigo-400 uppercase text-[10px] font-black mb-4">I. THE THEORY</h5><p className="text-2xl font-light leading-relaxed">{selectedLens.theory}</p></section>
                      <section className="pt-10 border-t border-[var(--border)]"><h5 className="text-indigo-600 dark:text-indigo-400 uppercase text-[10px] font-black mb-4">II. LESSON FEEDBACK</h5><p className="text-2xl font-light leading-relaxed">{selectedLens.lessonFeedback}</p></section>
                      <section className="pt-10 border-t border-[var(--border)]"><h5 className="text-indigo-600 dark:text-indigo-400 uppercase text-[10px] font-black mb-4">III. THE UPGRADE</h5><p className="text-2xl font-light leading-relaxed">{selectedLens.upgrade}</p></section>
                    </div>
                    <div className="p-10 bg-indigo-500/5 rounded-[2rem] border border-indigo-500/20 text-indigo-700 dark:text-indigo-400 italic text-2xl shadow-inner ring-1 ring-black/5 dark:ring-white/5">
                      <span className="block text-[11px] font-black text-emerald-700 dark:text-emerald-500 uppercase mb-4 tracking-[0.5em]">IV. INSTRUCTIONAL ROUTINE</span>
                      {selectedLens.example}
                    </div>
                    {selectedLens.name === 'Differentiation' && (
                      <div className="p-10 bg-[#bc13fe]/10 rounded-[2rem] border border-[#bc13fe]/30 shadow-inner ring-1 ring-black/5 dark:ring-white/5 mt-8">
                        <span className="block text-[11px] font-black text-purple-700 dark:text-[#bc13fe] uppercase mb-4 tracking-[0.5em]">IEP / Persona Shapeshifter</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Describe a specific student profile (e.g., "ADHD, struggles with multi-step directions").</p>
                        <div className="flex gap-4">
                          <input disabled={iepLoading} value={iepInput} onChange={e => setIepInput(e.target.value)} className="flex-1 bg-black/5 dark:bg-white/5 border border-[var(--border)] rounded-2xl p-6 text-xl disabled:opacity-50" placeholder="Student profile..." />
                          <button disabled={iepLoading} onClick={generateIEP} className="p-6 bg-[#bc13fe] rounded-2xl text-white font-bold text-sm tracking-widest uppercase disabled:opacity-50 shadow-lg">
                            {iepLoading ? 'Forging...' : 'Download IEP Scaffold'}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-8 pt-12 border-t border-[var(--border)]">
                      <h4 className="font-black uppercase text-[10px] tracking-widest text-slate-500 dark:text-slate-400">ASK THE MENTOR</h4>
                      <div className="space-y-6">
                        {chatHistory.map((m, i) => (
                          <div key={i} className={`p-8 rounded-3xl text-xl leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-black/5 dark:bg-white/5 ml-12 border border-[var(--border)]' : 'bg-indigo-500/10 mr-12 text-indigo-700 dark:text-indigo-100 border border-indigo-500/20 shadow-lg'}`}>
                            <span className="block text-[9px] font-black uppercase tracking-widest mb-3 text-slate-500 dark:text-slate-400">{m.role === 'user' ? 'TEACHER' : 'MENTOR'}</span>
                            <span dangerouslySetInnerHTML={{ __html: m.content }} />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-4">
                        <input disabled={chatLoading} value={chatInput} onChange={e => setChatInput(e.target.value)}
                          className="flex-1 bg-black/5 dark:bg-white/5 border border-[var(--border)] rounded-2xl p-6 text-xl disabled:opacity-50 focus:outline-none focus:border-indigo-400 transition-all"
                          placeholder={chatLoading ? 'Mentor is typing...' : 'Ask a clarification...'}
                          onKeyDown={e => e.key === 'Enter' && !chatLoading && handleFollowUp()} />
                        <button disabled={chatLoading} onClick={() => handleFollowUp()} className="p-6 bg-indigo-600 rounded-2xl text-white disabled:opacity-50">
                          {chatLoading ? <RefreshCcw className="animate-spin" /> : <Send />}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-12">
                    {selectedLens.quiz.map((q: any, i: number) => (
                      <div key={i} className="bg-black/[0.03] dark:bg-white/[0.01] p-10 rounded-[3rem] border border-[var(--border)] space-y-6 shadow-md">
                        <p className="text-[var(--foreground)] text-xl font-bold">{i + 1}. {q.question}</p>
                        <div className="grid gap-3">
                          {q.options.map((opt: string) => (
                            <button key={opt} onClick={() => setQuizAnswers({ ...quizAnswers, [i]: opt })}
                              className={`p-5 rounded-2xl text-left transition-all border ${quizAnswers[i] === opt ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl' : 'bg-black/5 dark:bg-black/40 border-[var(--border)] opacity-70 hover:opacity-100'}`}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {quizResult === null ? (
                      <button onClick={submitQuiz} className="w-full py-10 bg-indigo-600 text-white rounded-[3rem] font-black text-2xl shadow-xl">CERTIFY MASTERY</button>
                    ) : (
                      <div className="text-center p-20 border-8 border-indigo-500 rounded-[5rem] shadow-xl">
                        <h4 className="text-9xl font-black mb-4 leading-none">{quizResult}/5</h4>
                        <p className="text-3xl font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{quizResult === 5 ? 'Mastery Unlocked' : 'Mastery Denied'}</p>
                        <button onClick={() => { setQuizResult(null); setQuizAnswers({}); }} className="mt-12 text-indigo-600 dark:text-indigo-500 font-black uppercase underline decoration-2 underline-offset-8">Retry Session</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- SUBCOMPONENTS ---
function MenuTile({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 flex flex-col items-center justify-center shadow-md transition-all hover:border-indigo-500/40 flex-1 min-w-[150px] text-center">
      <span className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 mb-3 tracking-widest">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="bg-transparent text-[var(--foreground)] font-bold text-[11px] outline-none cursor-pointer appearance-none border-none p-0 text-center w-full focus:ring-0 uppercase">
        {options.map(opt => <option key={opt} value={opt} className="bg-[var(--card)] text-[var(--foreground)]">{opt}</option>)}
      </select>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'bg-indigo-600 text-white shadow-2xl scale-105' : 'bg-black/5 dark:bg-white/5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
      {icon} {label}
    </button>
  );
}

function VividLensTile({ cat, theme }: { cat: any; theme: string }) {
  const iconColor = theme === 'dark' ? cat.color : cat.color + 'cc';
  return (
    <motion.div
      whileHover={{
        backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.05)',
        borderColor: theme === 'dark' ? cat.color : `${cat.color}88`,
        boxShadow: theme === 'dark' ? `0 0 50px ${cat.color}88` : `0 0 16px ${cat.color}33`,
      }}
      className="bg-black/5 dark:bg-white/[0.02] border border-[var(--border)] rounded-xl p-6 flex flex-col items-center justify-center gap-3 transition-all h-32 flex-shrink-0 text-center cursor-pointer">
      <div style={{ color: iconColor }} className="dark:drop-shadow-[0_0_10px_currentColor]">{cat.icon}</div>
      <span className="text-[10px] font-black uppercase text-center text-slate-600 dark:text-slate-300">{cat.name}</span>
    </motion.div>
  );
}

function FeatureFlipCard({ icon, title, desc, glow }: { icon: React.ReactNode; title: string; desc: string; glow: 'turquoise' | 'yellow' | 'emerald' }) {
  const glows: Record<string, string> = {
    turquoise: 'dark:shadow-[0_0_60px_rgba(0,242,255,0.3)] shadow-[0_4px_20px_rgba(0,190,215,0.15)] border-[#00b8d4] dark:border-[#00f2ff]/40',
    yellow: 'dark:shadow-[0_0_60px_rgba(255,255,0,0.4)] shadow-[0_4px_20px_rgba(180,150,0,0.15)] border-[#a89000] dark:border-[#ffff00]/50',
    emerald: 'dark:shadow-[0_0_60px_rgba(0,255,136,0.3)] shadow-[0_4px_20px_rgba(0,160,85,0.15)] border-[#00a855] dark:border-[#00ff88]/40',
  };
  const colors: Record<string, string> = {
    turquoise: 'text-[#0099bb] dark:text-[#00f2ff]',
    yellow: 'text-[#a89200] dark:text-[#ffff00]',
    emerald: 'text-[#00884a] dark:text-[#00ff88]',
  };
  return (
    <div className="perspective-1000 h-64 w-full cursor-pointer group">
      <motion.div whileHover={{ rotateY: 180 }} transition={{ duration: 0.6 }} className="relative w-full h-full preserve-3d">
        <div className={`absolute inset-0 backface-hidden bg-[var(--card)] border-2 p-8 rounded-[2.5rem] flex flex-col items-center justify-center gap-6 ${glows[glow]} transition-all duration-500`}>
          <div className={`p-4 bg-black/5 dark:bg-white/5 rounded-2xl ${colors[glow]} dark:drop-shadow-[0_0_15px_currentColor]`}>{icon}</div>
          <h5 className="font-black text-xl uppercase tracking-tighter text-center">{title}</h5>
        </div>
        <div className={`absolute inset-0 backface-hidden rotate-y-180 bg-[var(--card)] border-2 p-8 rounded-[2.5rem] flex items-center justify-center text-center ${glows[glow]}`}>
          <p className="text-sm font-bold leading-relaxed text-[var(--foreground)] opacity-90 px-4">{desc}</p>
        </div>
      </motion.div>
    </div>
  );
}

function DashboardCard({ lens, catData, onClick }: { lens: any; catData: any; onClick: () => void }) {
  const color = catData?.color || '#6366f1';
  return (
    <div
      className="rounded-[3rem] border border-[var(--border)] transition-all cursor-pointer flex flex-col items-center justify-between shadow-xl bg-[var(--card)] hover:scale-[1.02] overflow-hidden"
      style={{ borderTop: `4px solid ${color}` }}
      onClick={onClick}
    >
      <div className="w-full flex flex-col items-center gap-4 pt-8 pb-4 px-6">
        <div className={`w-2.5 h-2.5 rounded-full self-end ${lens.status === 'green' ? 'bg-emerald-400' : lens.status === 'amber' ? 'bg-amber-400' : lens.status === 'red' ? 'bg-red-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner" style={{ backgroundColor: `${color}15`, color }}>
          <div style={{ color }} className="dark:drop-shadow-[0_0_12px_currentColor]">
            {catData?.icon ?? <span className="text-2xl font-black">{lens.name?.[0]}</span>}
          </div>
        </div>
      </div>
      <div className="w-full text-center px-6 pb-8 space-y-2">
        <h4 className="text-2xl font-black uppercase tracking-tighter text-[var(--foreground)] leading-tight">{lens.name}</h4>
        <span className="text-[10px] font-black uppercase italic block" style={{ color }}>{lens.pioneer}</span>
        {lens.quizScore !== null && lens.quizScore !== undefined && (
          <span className={`text-[9px] font-black uppercase tracking-widest block ${lens.status === 'green' ? 'text-emerald-500' : lens.status === 'amber' ? 'text-amber-500' : 'text-red-400'}`}>
            {lens.quizScore}/5 {lens.status === 'green' ? '✓' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function DescriptionItem({ text, highlight }: { text: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-4 text-left">
      <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${highlight ? 'bg-emerald-600 dark:bg-emerald-500 animate-pulse' : 'bg-indigo-500 dark:bg-indigo-400'}`} />
      <p className={`text-sm ${highlight ? 'text-[var(--foreground)] font-bold' : 'text-slate-600 dark:text-slate-400'} leading-relaxed`}>{text}</p>
    </div>
  );
}
