'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  collection,
  query,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import mammoth from 'mammoth';
import {
  Sparkles,
  Clock,
  CheckCircle2,
  ChevronRight,
  X,
  PlayCircle,
  Target,
  Send,
  AlertTriangle,
  RefreshCcw,
  BookOpen,
  Brain,
  Users,
  MessageSquare,
  Key,
  Lock,
  Zap,
  ShieldCheck,
  ArrowRight,
  Menu,
  LogOut,
  Sun,
  Moon,
  User as UserIcon,
  FileUp,
  FileText,
  Focus,
  Compass,
  Globe,
  Layers,
  Shuffle,
  ClipboardCheck,
  Magnet,
  Lightbulb,
  Package,
  Flag,
} from 'lucide-react';

// --- FIREBASE CONFIG (Buffalo Research Lab) ---
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

const ALL_CATS = [
  'Clarity',
  'Alignment',
  'Inclusivity',
  'Scaffolding',
  'Differentiation',
  'Objectives',
  'Assessments',
  'Engagement',
  'Strategies',
  'Materials',
  'Collaboration',
  'Closure',
];
const CAT_DATA = [
  { id: 1, name: 'Clarity', icon: <Focus size={24} />, color: '#00d2ff' },
  { id: 2, name: 'Alignment', icon: <Compass size={24} />, color: '#ff0055' },
  { id: 3, name: 'Inclusivity', icon: <Globe size={24} />, color: '#00ff88' },
  { id: 4, name: 'Scaffolding', icon: <Layers size={24} />, color: '#ff9900' },
  {
    id: 5,
    name: 'Differentiation',
    icon: <Shuffle size={24} />,
    color: '#bc13fe',
  },
  { id: 6, name: 'Objectives', icon: <Target size={24} />, color: '#ff00ff' },
  {
    id: 7,
    name: 'Assessments',
    icon: <ClipboardCheck size={24} />,
    color: '#0077ff',
  },
  { id: 8, name: 'Engagement', icon: <Magnet size={24} />, color: '#ff3300' },
  {
    id: 9,
    name: 'Strategies',
    icon: <Lightbulb size={24} />,
    color: '#ffee00',
  },
  { id: 10, name: 'Materials', icon: <Package size={24} />, color: '#00ffff' },
  {
    id: 11,
    name: 'Collaboration',
    icon: <Users size={24} />,
    color: '#00ffcc',
  },
  { id: 12, name: 'Closure', icon: <Flag size={24} />, color: '#9d00ff' },
];

export default function PedagogicalLabSaaS() {
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [history, setHistory] = useState<any[]>([]);
  const [step, setStep] = useState<'input' | 'dashboard' | 'iterative'>(
    'input'
  );
  const [loading, setLoading] = useState(false);
  const [lessonText, setLessonText] = useState('');
  const [selectedLens, setSelectedLens] = useState<any | null>(null);
  const [drawerTab, setDrawerTab] = useState<'mentoring' | 'quiz'>('mentoring');
  const [config, setConfig] = useState({
    tone: 'Coaching-style',
    grade: '6–8',
    subject: 'ELA',
    profile: 'General',
    mode: 'Full report',
    minutes: 45,
  });
  const [lenses, setLenses] = useState<any[]>([]);
  const [customSelection, setCustomSelection] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<
    { role: 'user' | 'assistant'; content: string }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizResult, setQuizResult] = useState<number | null>(null);
  const [prizeLoading, setPrizeLoading] = useState(false);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materializerInput, setMaterializerInput] = useState('');
  const [gameLoading, setGameLoading] = useState(false);
  const [iepInput, setIepInput] = useState('');
  const [iepLoading, setIepLoading] = useState(false);
  const [iterativeFeedbacks, setIterativeFeedbacks] = useState<any[]>([]);
  // const[isListening, setIsListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // const isLiveRef = useRef(false);
  const chatLoadingRef = useRef(false);
  const chatHistoryRef = useRef<typeof chatHistory>([]);
  // const recognitionRef = useRef(null);

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        loadHistory(u.uid);
      } else {
        setUser(null);
      }
    });
  }, [theme]);

  const loadHistory = async (uid: string) => {
    const q = query(
      collection(db, 'users', uid, 'reports'),
      orderBy('timestamp', 'desc')
    );
    const querySnapshot = await getDocs(q);
    setHistory(
      querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    );
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (
        error?.code === 'auth/popup-blocked' ||
        error?.code === 'auth/cancelled-popup-request'
      ) {
        await signInWithRedirect(auth, provider);
        return;
      }

      console.error('Login Error:', error);
      alert(`Login Error: ${error.message}`);
    }
  };

  const login = async () => {
    if (user) return user;
    await handleLogin();
    return auth.currentUser;
  };

  const toggleCustom = (cat: string) => {
    setCustomSelection((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const startAnalysis = async () => {
    let currentUser = user || (await login());
    if (!currentUser || !lessonText) return;
    if (config.mode === 'Custom selection' && customSelection.length === 0)
      return alert('Select categories.');

    if (config.mode === 'Iterative feedback') {
      setLoading(true);
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'iterative-init',
            lessonText,
            config,
            userApiKey: localStorage.getItem('openai_key'),
          }),
        });
        const data = await res.json();
        setIterativeFeedbacks(data.feedbacks || []);
        setStep('iterative');
      } catch (e: any) {
        alert('Iterative Feedback Error: ' + e.message);
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonText,
          config,
          selectedLenses: customSelection,
          userApiKey: localStorage.getItem('openai_key'),
        }),
      });
      const data = await res.json();
      if (data.feedback) {
        const reportId = Date.now().toString();
        const processed = data.feedback.map((f: any) => ({
          ...f,
          status: 'locked',
          quizScore: null,
        }));
        await setDoc(doc(db, 'users', currentUser.uid, 'reports', reportId), {
          lenses: processed,
          config,
          lessonText,
          timestamp: Date.now(),
          title: lessonText.substring(0, 30) + '...',
        });
        setLenses(processed);
        setStep('dashboard');
        loadHistory(currentUser.uid);
      } else {
        alert(
          data.error ||
            "Generation timed out. Try 'Focused report' or fewer Custom categories."
        );
      }
    } catch (e: any) {
      alert('Network Error: Timed out. Please try again or use Focused mode.');
    }
    setLoading(false);
  };

  const handleFollowUp = async (autoText?: string) => {
    const text = typeof autoText === 'string' ? autoText : chatInput;
    if (!text || !text.trim()) return;

    setChatLoading(true);
    chatLoadingRef.current = true;

    const newMessage = { role: 'user' as const, content: text };
    setChatHistory((prev) => [...prev, newMessage]);
    setChatInput('');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'chat',
          userMessage: newMessage.content,
          chatHistory: chatHistoryRef.current,
          config,
          lessonText,
          lensContext: selectedLens,
          userApiKey: localStorage.getItem('openai_key'),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant' as const, content: data.reply },
      ]);

      chatLoadingRef.current = false;
    } catch (e: any) {
      alert('Chat error: ' + (e.message || 'Failed to reach Mentor'));
      chatLoadingRef.current = false;
    }
    setChatLoading(false);
  };

  const submitQuiz = async () => {
    let score = 0;
    selectedLens.quiz.forEach((q: any, i: number) => {
      if (quizAnswers[i] === q.correct) score++;
    });
    const newStatus = score === 5 ? 'green' : score >= 3 ? 'amber' : 'red';
    const updated = lenses.map((l: any) =>
      l.id === selectedLens.id
        ? { ...l, status: newStatus, quizScore: score }
        : l
    );
    setLenses(updated);
    setQuizResult(score);
  };

  const generatePrize = async () => {
    setPrizeLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'prize',
          lessonText,
          config,
          userApiKey: localStorage.getItem('openai_key'),
        }),
      });
      const data = await res.json();
      const tableHtml =
        `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Elite Lesson Plan</title></head><body><h1>Elite Lesson Plan</h1><table border="1" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif;">` +
        Object.entries(data)
          .map(
            ([k, v]) =>
              `<tr><td style="padding: 10px; font-weight: bold; background-color: #f3f4f6; width: 25%; vertical-align: top;">${k}</td><td style="padding: 10px; vertical-align: top;">${String(
                v
              ).replace(/\n/g, '<br/>')}</td></tr>`
          )
          .join('') +
        `</table></body></html>`;
      const blob = new Blob([tableHtml], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Elite_Lesson_Plan.doc';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('Prize generation failed');
    }
    setPrizeLoading(false);
  };

  const generateMaterializer = async () => {
    setMaterialLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'materializer',
          lessonText,
          config,
          userMessage: materializerInput,
          userApiKey: localStorage.getItem('openai_key'),
        }),
      });
      const data = await res.json();
      const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Student Handout</title></head><body style="font-family: Arial, sans-serif; padding: 20px;">${data.html}</body></html>`;
      const blob = new Blob([htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Student_Handout.doc';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('Materializer generation failed');
    }
    setMaterialLoading(false);
  };

  const generateGamifier = async () => {
    setGameLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'gamifier',
          lessonText,
          config,
          userApiKey: localStorage.getItem('openai_key'),
        }),
      });
      const data = await res.json();
      const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Kahoot_Ready_Quiz.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('Gamifier generation failed');
    }
    setGameLoading(false);
  };

  const generateIEP = async () => {
    if (!iepInput.trim()) return alert('Enter a student profile first.');
    setIepLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'iep',
          lessonText,
          config,
          userMessage: iepInput,
          userApiKey: localStorage.getItem('openai_key'),
        }),
      });
      const data = await res.json();
      const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>IEP Scaffold</title></head><body style="font-family: Arial, sans-serif; padding: 20px;">${data.html}</body></html>`;
      const blob = new Blob([htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'IEP_Accommodation.doc';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('IEP generation failed');
    }
    setIepLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = await mammoth.extractRawText({
          arrayBuffer: event.target?.result as ArrayBuffer,
        });
        setLessonText(result.value);
      } catch {
        alert('Error reading .docx file');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const mastery =
    lenses.length > 0
      ? (lenses.filter((l: any) => l.status === 'green').length /
          lenses.length) *
        100
      : 0;

  return (
    <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)] transition-all duration-300">
      {/* SIDEBAR */}
      <motion.aside
        animate={{ width: sidebarOpen ? 300 : 0, opacity: sidebarOpen ? 1 : 0 }}
        className="glass-sidebar h-full overflow-hidden flex flex-col z-[60]"
      >
        <div className="p-6 flex flex-col h-full text-white text-left">
          <button
            onClick={() => setStep('input')}
            className="w-full border border-white/10 rounded-xl p-4 flex items-center gap-3 hover:bg-white/5 mb-8 font-bold text-sm shadow-lg"
          >
            <RefreshCcw size={16} /> New Session
          </button>
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <span className="text-[10px] font-black uppercase tracking-widest px-2 opacity-50 block mb-4">
              History
            </span>
            {history.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setLenses(item.lenses);
                  setConfig(item.config);
                  setLessonText(item.lessonText);
                  setStep('dashboard');
                }}
                className="w-full text-left p-3 rounded-lg hover:bg-white/5 text-xs truncate transition-all opacity-70 hover:opacity-100"
              >
                {item.title}
              </button>
            ))}
          </div>
          <div className="pt-6 border-t border-white/5 space-y-4">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-full flex items-center gap-3 p-3 text-xs font-bold hover:bg-white/5 rounded-lg text-white"
            >
              Theme Toggle
            </button>
            {user && (
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                <img
                  src={user.photoURL ?? ''}
                  className="w-8 h-8 rounded-full"
                />
                <span className="text-xs font-bold truncate max-w-[120px]">
                  {user.displayName}
                </span>
                <button
                  onClick={() => signOut(auth).then(() => setStep('input'))}
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="p-6 flex justify-between items-center z-40 bg-[var(--background)]">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-[var(--border)] hover:text-indigo-400 shadow-sm"
          >
            <Menu size={20} />
          </button>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 font-serif italic text-2xl tracking-tighter">
              <Sparkles className="text-indigo-500" size={24} />
              AI Micro-Feedback Coach
            </div>
            <div className="w-64 h-1 bg-black/5 dark:bg-white/5 rounded-full mt-2 overflow-hidden border border-[var(--border)]">
              <motion.div
                className="h-full bg-emerald-500"
                style={{ width: `${mastery}%` }}
              />
            </div>
          </div>
          <div className="w-12 h-12" />
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-12 scrollbar-hide flex flex-col items-center text-center">
          <AnimatePresence mode="wait">
            {step === 'input' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-16 w-full flex flex-col items-center"
              >
                <div className="text-center space-y-6">
                  <h2 className="text-6xl md:text-8xl font-serif italic text-[var(--foreground)] leading-[0.8] tracking-tighter">
                    Instant <br />{' '}
                    <span className="font-sans font-black not-italic text-indigo-50 uppercase drop-shadow-[0_0_30px_rgba(99,102,241,0.5)]">
                      Mentorship.
                    </span>
                  </h2>
                  <p className="text-indigo-400 font-black text-xs uppercase tracking-[0.6em]">
                    Research-Grounded Coaching for Everyday Lessons
                  </p>
                </div>

                {/* DESCRIPTION BOX */}
                <div className="relative group max-w-4xl w-full">
                  <div className="absolute -inset-1 bg-indigo-500/10 rounded-3xl blur-xl opacity-70"></div>
                  <div className="relative bg-[var(--card)] border border-[var(--border)] p-10 rounded-3xl shadow-2xl space-y-8 text-center">
                    <p className="text-[var(--foreground)] text-lg font-light italic opacity-80 leading-relaxed">
                      Paste a lesson plan. The coach returns supportive feedback
                      where each paragraph:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 text-left max-w-3xl mx-auto">
                      <DescriptionItem text="Names appropriate approach + pioneer in the first sentence." />
                      <DescriptionItem text="Adapts to grade level, subject area, and learner profile." />
                      <DescriptionItem text="Attends to class time and your specific phase breakdown." />
                      <DescriptionItem text="May repeat approaches with explicit pedagogical rationale." />
                      <div className="md:col-span-2 pt-4 border-t border-[var(--border)] text-center">
                        <DescriptionItem
                          text="Concludes with a precise 'Concrete example:' for the class window."
                          highlight
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 w-full max-w-5xl mx-auto pt-8">
                  {CAT_DATA.map((cat) => (
                    <VividLensTile key={cat.id} cat={cat} />
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full">
                  <FeatureFlipCard
                    icon={<Brain size={24} />}
                    title="Theory Aware"
                    desc="Deep Pedagogy: Every insight is hard-wired into proven research."
                    glow="turquoise"
                  />
                  <FeatureFlipCard
                    icon={<Clock size={24} />}
                    title="Time Budgeted"
                    desc="Clock-Sync: Routines engineered to fit your exact minutes."
                    glow="yellow"
                  />
                  <FeatureFlipCard
                    icon={<ShieldCheck size={24} />}
                    title="Mastery Certified"
                    desc="Evidence-Based: Verify growth through mastery check-ins."
                    glow="emerald"
                  />
                </div>

                {/* MISSION CONTROL CENTER */}
                <div className="w-full max-w-[1400px] px-4">
                  <div className="flex flex-row gap-2 justify-center items-stretch w-full">
                    <MenuTile
                      label="Tone"
                      value={config.tone}
                      options={[
                        'Coaching-style',
                        'Supportive',
                        'Warm',
                        'Direct',
                      ]}
                      onChange={(v) => setConfig({ ...config, tone: v })}
                    />
                    <MenuTile
                      label="Grade"
                      value={config.grade}
                      options={['K–2', '3–5', '6–8', '9–12']}
                      onChange={(v) => setConfig({ ...config, grade: v })}
                    />
                    <MenuTile
                      label="Subject"
                      value={config.subject}
                      options={['ELA', 'Math', 'Science', 'Social', 'Arts']}
                      onChange={(v) => setConfig({ ...config, subject: v })}
                    />
                    <MenuTile
                      label="Learners"
                      value={config.profile}
                      options={['General', 'ELL', 'Special Ed', 'Honors']}
                      onChange={(v) => setConfig({ ...config, profile: v })}
                    />
                    <MenuTile
                      label="Mode"
                      value={config.mode}
                      options={[
                        'Full report',
                        'Focused report',
                        'Custom selection',
                        'Iterative feedback',
                      ]}
                      onChange={(v) => setConfig({ ...config, mode: v })}
                    />

                    <div className="bg-[var(--card)] border border-indigo-500/10 rounded-2xl p-5 flex-1 flex flex-col items-center justify-center shadow-xl group transition-all hover:border-indigo-500/40 min-w-[150px] text-center">
                      <span className="text-[9px] font-black uppercase text-slate-400 mb-3 tracking-widest text-center leading-none uppercase">
                        Minutes
                      </span>
                      <div className="flex items-center justify-center gap-1.5 w-full text-center">
                        <Clock size={12} className="text-indigo-500 shrink-0" />
                        <input
                          type="number"
                          value={config.minutes}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              minutes: Number(e.target.value),
                            })
                          }
                          className="bg-transparent text-[var(--foreground)] font-black w-10 text-center outline-none text-sm tracking-tighter"
                        />
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                          Min
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CUSTOM SELECTION CHECKLIST */}
                {config.mode === 'Custom selection' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="w-full max-w-6xl pb-8"
                  >
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {ALL_CATS.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => toggleCustom(cat)}
                          className={`p-4 rounded-xl border-2 transition-all font-black uppercase text-[10px] tracking-widest ${
                            customSelection.includes(cat)
                              ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl'
                              : 'bg-[var(--card)] border-[var(--border)] text-slate-500 hover:border-indigo-500/30'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* EDITOR */}
                <div
                  className={`bg-[var(--card)] border rounded-[3rem] p-3 shadow-3xl relative overflow-hidden group transition-all duration-1000 w-full max-w-6xl mx-auto ${
                    lessonText
                      ? 'animate-liquid-border'
                      : 'border-[var(--border)]'
                  }`}
                >
                  <div className="absolute top-6 right-8 z-10 flex gap-4">
                    <input
                      type="file"
                      accept=".docx"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 bg-black/5 dark:bg:white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-slate-500 hover:text-indigo-500"
                    >
                      <FileUp size={14} /> Upload .docx
                    </button>
                  </div>
                  <textarea
                    value={lessonText}
                    onChange={(e) => setLessonText(e.target.value)}
                    className="w-full h-[400px] bg-transparent border-none p-12 text-2xl text-[var(--foreground)] resize-none outline-none font-light leading-relaxed text-center placeholder:text-slate-300"
                    placeholder="Paste your lesson plan here or upload a .docx..."
                  />
                  <div className="p-4 pt-0 flex justify-center">
                    <motion.button
                      onClick={startAnalysis}
                      disabled={loading}
                      whileHover={{ scale: 1.005 }}
                      className="relative w-full h-28 bg-[#050508] border border-white/10 text-white rounded-2xl font-black text-2xl uppercase tracking-[0.3em] overflow-hidden shadow-2xl flex items-center justify-center text-center"
                    >
                      <div className="absolute inset-0 bg-gradient-to-l from-transparent via-white/[0.05] to-transparent translate-x-full group-hover:animate-shimmer-reverse" />
                      <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-20 group-hover:opacity-100 transition-opacity duration-700">
                        {CAT_DATA.map((c, i) => (
                          <motion.div
                            key={i}
                            className="w-[2px] h-8 rounded-full"
                            style={{ backgroundColor: c.color }}
                            animate={{
                              scaleY: [1, 2.2, 1],
                              opacity: [0.2, 1, 0.2],
                            }}
                            transition={{
                              duration: 0.5 + Math.random(),
                              repeat: Infinity,
                              delay: i * 0.1,
                            }}
                          />
                        ))}
                      </div>
                      <span className="relative z-10 flex items-center gap-4 justify-center w-full font-sans tracking-[0.4em]">
                        {loading ? 'Catalyzing Data...' : 'Launch Feedback'}
                        {!loading && (
                          <ArrowRight className="group-hover:translate-x-2 transition-transform" />
                        )}
                      </span>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'iterative' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-8 h-[75vh]"
              >
                <div className="w-full lg:w-1/2 flex flex-col gap-4 h-full">
                  <h3 className="text-3xl font-serif italic tracking-tighter text-indigo-400 text-left">
                    Lesson Document
                  </h3>
                  <div className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-[2rem] p-8 overflow-y-auto whitespace-pre-wrap text-[var(--foreground)] text-lg leading-relaxed shadow-xl text-left">
                    {lessonText}
                  </div>
                </div>

                <div className="w-full lg:w-1/2 flex flex-col gap-4 h-full">
                  <h3 className="text-3xl font-serif italic tracking-tighter text-emerald-400 text-left">
                    Contextual Iterative Feedback
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-6 pr-2 scrollbar-hide text-left">
                    {iterativeFeedbacks.map((fb, idx) => (
                      <div
                        key={fb.id || idx}
                        className="bg-[var(--card)] border border-[var(--border)] rounded-[2rem] p-8 space-y-6 shadow-xl relative overflow-hidden group"
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-[#bc13fe]"></div>

                        <div className="bg-indigo-500/10 p-5 rounded-2xl border border-indigo-500/20 italic opacity-90 text-xl font-light">
                          "{fb.quote}"
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                          <div>
                            <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest block mb-2 flex items-center gap-2">
                              <BookOpen size={12} /> Theory: {fb.theory} (
                              {fb.pioneer})
                            </span>
                            <p className="text-sm opacity-80">{fb.pedagogy}</p>
                          </div>
                          <div>
                            <span className="text-[10px] font-black uppercase text-[#00d2ff] tracking-widest block mb-2 flex items-center gap-2">
                              <Target size={12} /> Alignment
                            </span>
                            <p className="text-sm opacity-80">{fb.alignment}</p>
                          </div>
                          <div className="bg-[#bc13fe]/10 p-5 rounded-2xl border border-[#bc13fe]/20">
                            <span className="text-[10px] font-black uppercase text-[#bc13fe] tracking-widest block mb-2 flex items-center gap-2">
                              <Sparkles size={12} /> Suggested Revision
                            </span>
                            <p className="text-lg text-[var(--foreground)]">
                              {fb.revision}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-4 pt-6 border-t border-[var(--border)]">
                          <button
                            onClick={() => {
                              setLessonText((prev) =>
                                prev.replace(fb.quote, fb.revision)
                              );
                              setIterativeFeedbacks((prev) =>
                                prev.filter((f) => f.id !== fb.id)
                              );
                            }}
                            className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 transition-colors text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                          >
                            <CheckCircle2 size={18} /> I Agree (Replace Text)
                          </button>

                          <div className="flex gap-3">
                            <input
                              id={`chat-${fb.id}`}
                              className="flex-1 bg-black/5 dark:bg-white/5 border border-[var(--border)] focus:border-indigo-500/50 rounded-2xl px-6 text-sm outline-none transition-all"
                              placeholder="Respond (e.g., 'Yes, but adjust for ELL...')"
                            />
                            <button
                              onClick={async (e) => {
                                const btn =
                                  e.currentTarget as HTMLButtonElement;
                                const inputEl = document.getElementById(
                                  `chat-${fb.id}`
                                ) as HTMLInputElement;
                                const val = inputEl.value;
                                if (!val) return;
                                btn.disabled = true;
                                btn.innerText = 'WAIT';
                                try {
                                  const res = await fetch('/api/analyze', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      type: 'iterative-respond',
                                      lessonText,
                                      fb,
                                      userMessage: val,
                                      config,
                                    }),
                                  });
                                  const data = await res.json();
                                  setIterativeFeedbacks((prev) =>
                                    prev.map((f) =>
                                      f.id === fb.id ? data.feedback : f
                                    )
                                  );
                                  inputEl.value = '';
                                } catch {
                                  alert('Error updating feedback');
                                }
                                btn.disabled = false;
                                btn.innerText = 'RESPOND';
                              }}
                              className="px-6 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center"
                            >
                              RESPOND
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {iterativeFeedbacks.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-emerald-500/10 border border-emerald-500/20 rounded-[3rem] space-y-6">
                        <CheckCircle2 size={64} className="text-emerald-500" />
                        <h4 className="text-3xl font-black uppercase tracking-widest text-emerald-500">
                          All Feedback Resolved
                        </h4>
                        <button
                          onClick={() => setStep('input')}
                          className="px-8 py-4 bg-[var(--card)] border border-[var(--border)] rounded-2xl text-xs font-black uppercase tracking-widest hover:border-emerald-500/50 transition-all"
                        >
                          Return to Dashboard
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'dashboard' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-16 w-full flex flex-col items-center"
              >
                <h3 className="text-7xl font-black text-[var(--foreground)] tracking-tighter uppercase font-serif italic underline decoration-indigo-500/60 decoration-8 underline-offset-[20px] text-center">
                  The Blueprint.
                </h3>
                {mastery === 100 && (
                  <div className="flex flex-col md:flex-row gap-6 items-center justify-center w-full z-50 flex-wrap">
                    <motion.button
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      onClick={generatePrize}
                      disabled={prizeLoading}
                      className="py-6 px-12 bg-emerald-500 text-white rounded-[2rem] font-black text-2xl shadow-[0_0_40px_rgba(16,185,129,0.5)] animate-pulse uppercase tracking-widest disabled:opacity-50"
                    >
                      {prizeLoading
                        ? 'Forging Elite Doc...'
                        : 'Claim Ultimate Prize: Elite Lesson Plan'}
                    </motion.button>
                    <div className="flex flex-col gap-3 items-center w-full md:w-auto">
                      <input
                        disabled={materialLoading}
                        value={materializerInput}
                        onChange={(e) => setMaterializerInput(e.target.value)}
                        className="w-full bg-black/5 dark:bg-white/5 border border-[#00d2ff]/30 text-[var(--foreground)] rounded-2xl p-4 text-center placeholder:text-[#00d2ff]/60 outline-none focus:border-[#00d2ff] transition-all"
                        placeholder="Custom Instructions (e.g. Gallery Walk, Cut & Paste)..."
                      />
                      <motion.button
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        onClick={generateMaterializer}
                        disabled={materialLoading}
                        className="w-full py-6 px-12 bg-[#00d2ff] text-white rounded-[2rem] font-black text-2xl shadow-[0_0_40px_rgba(0,210,255,0.5)] animate-pulse uppercase tracking-widest disabled:opacity-50"
                      >
                        {materialLoading
                          ? 'Materializing...'
                          : 'The Materializer: Generate Handout'}
                      </motion.button>
                    </div>
                    <motion.button
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      onClick={generateGamifier}
                      disabled={gameLoading}
                      className="py-6 px-12 bg-[#bc13fe] text-white rounded-[2rem] font-black text-2xl shadow-[0_0_40px_rgba(188,19,254,0.5)] animate-pulse uppercase tracking-widest disabled:opacity-50"
                    >
                      {gameLoading
                        ? 'Compiling...'
                        : 'The Gamifier: Export Quiz (.CSV)'}
                    </motion.button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 pt-10 mx-auto w-full text-left">
                  {lenses.map((lens) => (
                    <DashboardCard
                      key={lens.id}
                      lens={lens}
                      onClick={() => {
                        setSelectedLens(lens);
                        setDrawerTab('mentoring');
                        setQuizResult(null);
                        setQuizAnswers({});
                        setChatHistory([]);
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* INTERACTIVE SIDE DRAWER */}
      <AnimatePresence>
        {selectedLens && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLens(null)}
              className="fixed inset-0 bg-black/90 backdrop-blur-md z-[70]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30 }}
              className="fixed right-0 top-0 h-full w-full max-w-[850px] bg-[var(--card)] border-l border-[var(--border)] z-[80] flex flex-col shadow-2xl text-left overflow-hidden"
            >
              <div className="p-12 border-b border-[var(--border)] bg-black/5 dark:bg-white/[0.02]">
                <div className="flex justify-between items-center mb-8">
                  <span className="text-xs text-indigo-500 font-black uppercase tracking-[0.5em]">
                    {selectedLens.pioneer}
                  </span>
                  <button
                    onClick={() => setSelectedLens(null)}
                    className="p-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl"
                  >
                    <X size={28} />
                  </button>
                </div>
                <h2 className="text-5xl font-black text-[var(--foreground)] mb-10 uppercase tracking-tighter leading-none font-serif italic">
                  {selectedLens.name}
                </h2>
                <div className="flex gap-4">
                  <TabBtn
                    active={drawerTab === 'mentoring'}
                    onClick={() => setDrawerTab('mentoring')}
                    icon={<MessageSquare size={16} />}
                    label="Elite Coaching"
                  />
                  <TabBtn
                    active={drawerTab === 'quiz'}
                    onClick={() => setDrawerTab('quiz')}
                    icon={<Brain size={16} />}
                    label="Mastery Quiz"
                  />
                </div>
              </div>

              <div className="flex-1 p-12 overflow-y-auto space-y-12 pb-40">
                {drawerTab === 'mentoring' ? (
                  <div className="space-y-12">
                    <div className="space-y-12 bg-black/5 dark:bg:white/[0.01] p-10 rounded-[3rem] border border-[var(--border)] text-left">
                      <section>
                        <h5 className="text-indigo-400 uppercase text-[10px] font-black mb-4">
                          I. THE THEORY
                        </h5>
                        <p className="text-2xl font-light leading-relaxed">
                          {selectedLens.theory}
                        </p>
                      </section>
                      <section className="pt-10 border-t border-[var(--border)]">
                        <h5 className="text-indigo-400 uppercase text-[10px] font-black mb-4">
                          II. LESSON FEEDBACK
                        </h5>
                        <p className="text-2xl font-light leading-relaxed">
                          {selectedLens.lessonFeedback}
                        </p>
                      </section>
                      <section className="pt-10 border-t border-[var(--border)]">
                        <h5 className="text-indigo-400 uppercase text-[10px] font-black mb-4">
                          III. THE UPGRADE
                        </h5>
                        <p className="text-2xl font-light leading-relaxed">
                          {selectedLens.upgrade}
                        </p>
                      </section>
                    </div>
                    <div className="p-10 bg-indigo-500/5 rounded-[2rem] border border-indigo-500/20 text-indigo-400 italic text-2xl shadow-inner ring-1 ring-white/5">
                      <span className="block text-[11px] font-black text-emerald-500 uppercase mb-4 tracking-[0.5em]">
                        IV. INSTRUCTIONAL ROUTINE
                      </span>
                      {selectedLens.example}
                    </div>
                    {selectedLens.name === 'Differentiation' && (
                      <div className="p-10 bg-[#bc13fe]/10 rounded-[2rem] border border-[#bc13fe]/30 text-[var(--foreground)] shadow-inner ring-1 ring-white/5 mt-8">
                        <span className="block text-[11px] font-black text-[#bc13fe] uppercase mb-4 tracking-[0.5em]">
                          IEP / Persona Shapeshifter
                        </span>
                        <p className="text-sm opacity-80 mb-6">
                          Describe a specific student profile (e.g., "ADHD,
                          struggles with multi-step directions"). Generate an
                          instant, tailored micro-scaffold downloaded as a .doc.
                        </p>
                        <div className="flex gap-4">
                          <input
                            disabled={iepLoading}
                            value={iepInput}
                            onChange={(e) => setIepInput(e.target.value)}
                            className="flex-1 bg-black/5 dark:bg-white/5 border border-[var(--border)] rounded-2xl p-6 text-xl disabled:opacity-50"
                            placeholder="Student profile..."
                          />
                          <button
                            disabled={iepLoading}
                            onClick={generateIEP}
                            className="p-6 bg-[#bc13fe] rounded-2xl text-white font-bold text-sm tracking-widest uppercase disabled:opacity-50 shadow-lg"
                          >
                            {iepLoading
                              ? 'Forging...'
                              : 'Download IEP Scaffold'}
                          </button>
                        </div>
                      </div>
                    )}
                    {/* FOLLOW UP CHAT */}
                    <div className="space-y-8 pt-12 border-t border-[var(--border)]">
                      <h4 className="font-black uppercase text-[10px] tracking-widest opacity-60">
                        ASK THE MENTOR (SEQUENCING)
                      </h4>
                      <div className="space-y-6">
                        {chatHistory.map((m, i) => (
                          <div
                            key={i}
                            className={`p-8 rounded-3xl text-xl leading-relaxed whitespace-pre-wrap ${
                              m.role === 'user'
                                ? 'bg-black/5 dark:bg-white/5 ml-12 border border-[var(--border)]'
                                : 'bg-indigo-500/10 mr-12 text-indigo-100 border border-indigo-500/20 shadow-lg'
                            }`}
                          >
                            <span className="block text-[9px] font-black uppercase tracking-widest mb-3 opacity-40">
                              {m.role === 'user' ? 'TEACHER' : 'MENTOR'}
                            </span>
                            <span
                              dangerouslySetInnerHTML={{ __html: m.content }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-4">
                        <input
                          disabled={chatLoading}
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          className="flex-1 bg-black/5 dark:bg:white/5 border border-[var(--border)] rounded-2xl p-6 text-xl disabled:opacity-50"
                          placeholder={
                            chatLoading
                              ? 'Mentor is typing...'
                              : 'Ask a clarification...'
                          }
                          onKeyDown={(e) =>
                            e.key === 'Enter' && handleFollowUp()
                          }
                        />
                        <button
                          disabled={chatLoading}
                          onClick={() => handleFollowUp()}
                          className="p-6 bg-indigo-600 rounded-2xl text-white disabled:opacity-50"
                        >
                          {chatLoading ? (
                            <RefreshCcw className="animate-spin" />
                          ) : (
                            <Send />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-12">
                    {selectedLens.quiz.map((q: any, i: number) => (
                      <div
                        key={i}
                        className="bg-black/5 dark:bg:white/[0.01] p-10 rounded-[3rem] border border-[var(--border)] space-y-6 shadow-md"
                      >
                        <p className="text-[var(--foreground)] text-xl font-bold">
                          {i + 1}. {q.question}
                        </p>
                        <div className="grid gap-3">
                          {q.options.map((opt: string) => (
                            <button
                              key={opt}
                              onClick={() =>
                                setQuizAnswers({ ...quizAnswers, [i]: opt })
                              }
                              className={`p-5 rounded-2xl text-left transition-all border ${
                                quizAnswers[i] === opt
                                  ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl'
                                  : 'bg-black/5 dark:bg-black/40 border-[var(--border)] opacity-60'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {quizResult === null ? (
                      <button
                        onClick={submitQuiz}
                        className="w-full py-10 bg-indigo-600 text-white rounded-[3rem] font-black text-2xl shadow-xl"
                      >
                        CERTIFY MASTERY
                      </button>
                    ) : (
                      <div className="text-center p-20 border-8 border-indigo-500 rounded-[5rem] shadow-xl">
                        <h4 className="text-9xl font-black mb-4 leading-none">
                          {quizResult}/5
                        </h4>
                        <p className="text-3xl font-black opacity-60 uppercase tracking-widest">
                          {quizResult === 5
                            ? 'Mastery Unlocked'
                            : 'Mastery Denied'}
                        </p>
                        <button
                          onClick={() => setQuizResult(null)}
                          className="mt-12 text-indigo-500 font-black uppercase underline decoration-2 underline-offset-8"
                        >
                          Retry Session
                        </button>
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
function MenuTile({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 flex flex-col items-center justify-center shadow-md group transition-all hover:border-indigo-500/40 flex-1 min-w-[150px] text-center">
      <span className="text-[9px] font-black uppercase text-slate-400 mb-3 tracking-widest text-center leading-none uppercase">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-[var(--foreground)] font-bold text-[11px] outline-none cursor-pointer appearance-none border-none p-0 text-center w-full focus:ring-0 uppercase text-center"
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-[#0a0a0c] text-center">
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
        active
          ? 'bg-indigo-600 text-white shadow-2xl scale-105'
          : 'bg-black/5 dark:bg:white/5 text-slate-500'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function VividLensTile({ cat }: { cat: any }) {
  return (
    <motion.div
      whileHover={{
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: cat.color,
        boxShadow: `0 0 50px ${cat.color}88`,
      }}
      className="bg-black/5 dark:bg:white/[0.02] border border-[var(--border)] rounded-xl p-6 flex flex-col items-center justify-center gap-3 transition-all h-32 flex-shrink-0 text-center"
    >
      <div
        style={{ color: cat.color }}
        className="drop-shadow-[0_0_10px_currentColor]"
      >
        {cat.icon}
      </div>
      <span className="text-[10px] font-black uppercase text-center opacity-70">
        {cat.name}
      </span>
    </motion.div>
  );
}

function FeatureFlipCard({
  icon,
  title,
  desc,
  glow,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  glow: 'turquoise' | 'yellow' | 'emerald';
}) {
  const glows: Record<string, string> = {
    turquoise:
      'shadow-[0_0_60px_rgba(0,242,255,0.3)] border-[#00f2ff]/40 dark:shadow-[0_0_60px_rgba(0,242,255,0.4)]',
    yellow:
      'shadow-[0_0_60px_rgba(255,255,0,0.4)] border-[#ffff00]/50 dark:shadow-[0_0_60px_rgba(255,255,0,0.6)]',
    emerald:
      'shadow-[0_0_60px_rgba(0,255,136,0.3)] border-[#00ff88]/40 dark:shadow-[0_0_60px_rgba(0,255,136,0.4)]',
  };
  const colors: Record<string, string> = {
    turquoise: 'text-[#00f2ff]',
    yellow: 'text-[#d9d900] dark:text-[#ffff00]',
    emerald: 'text-[#00cc6a] dark:text-[#00ff88]',
  };

  return (
    <div className="perspective-1000 h-64 w-full cursor-pointer group">
      <motion.div
        whileHover={{ rotateY: 180 }}
        transition={{ duration: 0.6 }}
        className="relative w-full h-full preserve-3d"
      >
        <div
          className={`absolute inset-0 backface-hidden bg-[var(--card)] border-2 p-8 rounded-[2.5rem] flex flex-col items-center justify-center gap-6 ${glows[glow]} transition-all duration-500`}
        >
          <div
            className={`p-4 bg-black/5 dark:bg:white/5 rounded-2xl ${colors[glow]} drop-shadow-[0_0_15px_currentColor]`}
          >
            {icon}
          </div>
          <h5 className="font-black text-xl uppercase tracking-tighter text-center">
            {title}
          </h5>
        </div>
        <div
          className={`absolute inset-0 backface-hidden rotate-y-180 bg-[var(--card)] border-2 p-8 rounded-[2.5rem] flex items-center justify-center text-center ${glows[glow]}`}
        >
          <p className="text-sm font-bold leading-relaxed text-[var(--foreground)] opacity-90 px-4 text-center">
            {desc}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function DashboardCard({ lens, onClick }: { lens: any; onClick: () => void }) {
  return (
    <div
      className="p-10 rounded-[4rem] border border-[var(--border)] transition-all cursor-pointer h-[380px] flex flex-col items-center justify-between shadow-2xl bg-[var(--card)] hover:border-indigo-50/10 dark:hover:border-indigo-500/30"
      onClick={onClick}
    >
      <div className="flex flex-col items-center gap-6 w-full text-center">
        <div
          className={`w-6 h-6 rounded-full ${
            lens.status === 'green'
              ? 'bg-emerald-400'
              : 'bg-slate-300 dark:bg-slate-800'
          }`}
        />
        <div className="w-16 h-16 rounded-2xl bg-black/5 dark:bg:white/5 flex items-center justify-center text-indigo-500 shadow-inner">
          <BookOpen size={28} />
        </div>
      </div>
      <div className="text-center">
        <h4 className="text-3xl font-black mb-4 uppercase tracking-tighter text-center">
          {lens.name}
        </h4>
        <span className="text-[10px] text-indigo-500 font-black uppercase italic block text-center">
          {lens.pioneer}
        </span>
      </div>
    </div>
  );
}

function DescriptionItem({
  text,
  highlight,
}: {
  text: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 text-left">
      <div
        className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
          highlight
            ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_emerald]'
            : 'bg-indigo-500'
        }`}
      />
      <p
        className={`text-sm ${
          highlight
            ? 'text-[var(--foreground)] font-bold'
            : 'text-slate-500 dark:text-slate-400'
        } leading-relaxed text-left`}
      >
        {text}
      </p>
    </div>
  );
}
