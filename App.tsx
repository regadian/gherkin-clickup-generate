import React, { useState, useRef } from 'react';
import { TestCase, ClickUpResult, SyncResult, Attachment, IntegrationTarget } from './types';
import { generateTestCases } from './services/geminiService';
import { createClickUpTask } from './services/clickupService';
import {
  createHulyTask,
  formatTestCasesForHulyMarkdown,
  loginHuly,
  parseHulyUrl,
  generateHulyNodeScript,
  generateTestCasesCsv,
  importDirectToHulyApi,
} from './services/hulyService';
import TextArea from './components/TextArea';
import Input from './components/Input';
import Button from './components/Button';
import Loader from './components/Loader';
import TestCaseCard from './components/TestCaseCard';
import Select from './components/Select';
import ReviewTable from './components/ReviewTable';
import {
  Sparkles,
  Settings2,
  Send,
  Download,
  Copy,
  ExternalLink,
  Key,
  Layers,
  FileSpreadsheet,
  FileText,
  Zap,
  CheckCircle2,
  Info,
  Server,
  FolderKanban,
  Table,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Trash2,
  Lock,
  Mail,
  ShieldCheck,
  Tag
} from 'lucide-react';

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Target Platform Selector
  const [integrationTarget, setIntegrationTarget] = useState<IntegrationTarget>('huly');

  // Huly Integration State
  const [hulyAuthMode, setHulyAuthMode] = useState<'credentials' | 'token'>('credentials');
  const [hulyServerUrl, setHulyServerUrl] = useState('https://huly.app');
  const [hulyEmail, setHulyEmail] = useState('');
  const [hulyPassword, setHulyPassword] = useState('');
  const [hulyToken, setHulyToken] = useState('');
  const [hulyWorkspaceId, setHulyWorkspaceId] = useState('');
  const [hulyProjectId, setHulyProjectId] = useState('');
  const [hulySuiteId, setHulySuiteId] = useState('');
  const [hulyEndpointUrl, setHulyEndpointUrl] = useState('');
  const [hulyTargetModule, setHulyTargetModule] = useState<'test-management' | 'issues'>('test-management');
  const [isHulyLoggingIn, setIsHulyLoggingIn] = useState(false);
  const [showAdvancedHulyOptions, setShowAdvancedHulyOptions] = useState(false);

  // ClickUp Integration State
  const [clickUpToken, setClickUpToken] = useState('');
  const [clickUpListId, setClickUpListId] = useState('');
  const [appsScriptUrl, setAppsScriptUrl] = useState('https://script.google.com/macros/s/AKfycbylpkRlS2Fjiulm9uUzqZPrTf_a3D4wmfLwRB7DFCr85otnsvID1IMhgzrYbe1m5HULvw/exec');

  // Common Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<(ClickUpResult | SyncResult)[]>([]);

  // Formatting & Tagging State
  const [platform, setPlatform] = useState('');
  const [packageName, setPackageName] = useState('');
  const [featureMenu, setFeatureMenu] = useState('');
  const [clickUpTag, setClickUpTag] = useState('');
  const [clickUpType, setClickUpType] = useState('Test Case');
  const [executionType, setExecutionType] = useState('Manual');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(Array.from(files));
  };

  const processFiles = (files: File[]) => {
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        setError(`File ${file.name} is too large. Max 10MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setAttachments(prev => [...prev, {
          name: file.name,
          data: base64String,
          mimeType: file.type,
        }]);
        setError(null);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      processFiles(pastedFiles);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!prompt && attachments.length === 0) || !geminiApiKey) {
      setError('Please provide feature description and Gemini API Key.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setTestCases([]);
    setSyncResults([]);
    try {
      const generated = await generateTestCases(prompt, geminiApiKey, attachments);
      setTestCases(generated);
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Sync to ClickUp
  const handleCreateInClickUp = async () => {
    if (!clickUpToken || !clickUpListId || !appsScriptUrl) {
      setError('Missing ClickUp configuration (Token, List ID, or Proxy URL).');
      return;
    }
    setIsSyncing(true);
    setError(null);
    try {
      const results = await Promise.all(
        testCases.map(tc => {
          const title = `[${platform || 'N/A'}][${packageName || 'N/A'}][${featureMenu || 'N/A'}] ${tc.title}`;
          return createClickUpTask(
            { ...tc, title },
            clickUpToken,
            clickUpListId,
            appsScriptUrl,
            clickUpTag ? [clickUpTag] : [],
            clickUpType,
            executionType
          );
        })
      );
      setSyncResults(results);
      setSuccessMessage(`Finished syncing ${testCases.length} tasks to ClickUp!`);
    } catch (err: any) {
      setError(err.message || 'Error syncing to ClickUp');
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle changes to Server URL and auto-parse workspace, space, and suite IDs if pasted
  const handleServerUrlChange = (val: string) => {
    setHulyServerUrl(val);
    const parsed = parseHulyUrl(val);
    if (parsed.workspacePath) {
      setHulyWorkspaceId(parsed.workspacePath);
    }
    if (parsed.spaceId) {
      setHulyProjectId(parsed.spaceId);
    }
    if (parsed.suiteId) {
      setHulySuiteId(parsed.suiteId);
    }
  };

  // Login to Self-Hosted or Cloud Huly using Email & Password
  const handleHulyLogin = async () => {
    if (!hulyEmail || !hulyPassword) {
      setError('Silakan isi Email dan Password Huly Anda.');
      return;
    }
    setIsHulyLoggingIn(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await loginHuly(hulyServerUrl, hulyEmail, hulyPassword);
      setHulyToken(res.token);
      if (res.workspaceId) {
        setHulyWorkspaceId(res.workspaceId);
      }
      if (res.projectId && !hulyProjectId) {
        setHulyProjectId(res.projectId);
      }
      const { origin } = parseHulyUrl(hulyServerUrl);
      setSuccessMessage(`Berhasil login ke Huly (${origin})! Token otentikasi & Workspace telah terdeteksi.`);
    } catch (err: any) {
      setError(err.message || 'Gagal login ke Huly.');
    } finally {
      setIsHulyLoggingIn(false);
    }
  };

  // Sync to Huly (Direct @hcengineering/api-client or standard REST/Webhook)
  const handleCreateInHuly = async () => {
    if (testCases.length === 0) {
      setError('Belum ada test case yang dibuat. Silakan generate test case terlebih dahulu.');
      return;
    }

    // Direct Huly API Client Connection Mode
    if (hulyAuthMode === 'credentials' || (hulyEmail && hulyPassword)) {
      if (!hulyEmail || !hulyPassword) {
        setError('Silakan lengkapi Email dan Password Huly.');
        return;
      }
      if (!hulyWorkspaceId) {
        setError('Silakan isi Workspace ID Huly (contoh: qa atau workbench/qa).');
        return;
      }
      if (!hulyProjectId) {
        setError('Silakan isi Space ID / Project ID Huly (contoh: 6a6991253946584506fac9d2).');
        return;
      }

      setIsSyncing(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const { origin } = parseHulyUrl(hulyServerUrl);
        const formattedTestCases = testCases.map(tc => ({
          ...tc,
          title: `[${platform || 'N/A'}][${packageName || 'N/A'}][${featureMenu || 'N/A'}] ${tc.title}`
        }));

        const res = await importDirectToHulyApi({
          serverUrl: origin,
          workspace: hulyWorkspaceId,
          email: hulyEmail,
          password: hulyPassword,
          spaceId: hulyProjectId,
          suiteId: hulySuiteId,
          testCases: formattedTestCases,
        });

        setSuccessMessage(`🎉 ${res.message}`);
      } catch (err: any) {
        setError(err.message || 'Gagal mengimpor langsung ke Huly.');
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    // Fallback Rest API Mode
    if (!hulyWorkspaceId && !hulyEndpointUrl) {
      setError('Missing Huly Workspace ID or Endpoint URL.');
      return;
    }
    setIsSyncing(true);
    setError(null);
    try {
      const results = await Promise.all(
        testCases.map(tc => {
          const title = `[${platform || 'N/A'}][${packageName || 'N/A'}][${featureMenu || 'N/A'}] ${tc.title}`;
          return createHulyTask(
            { ...tc, title },
            {
              token: hulyToken,
              workspaceId: hulyWorkspaceId,
              projectId: hulyProjectId,
              serverUrl: hulyServerUrl,
              endpointUrl: hulyEndpointUrl,
              tags: clickUpTag ? [clickUpTag] : [],
              type: clickUpType,
              executionType,
              targetModule: hulyTargetModule,
            }
          );
        })
      );
      setSyncResults(results);
      const destinationName = hulyTargetModule === 'test-management' ? 'Huly Test Management' : 'Huly Tracker';
      setSuccessMessage(`Finished creating ${testCases.length} tasks in ${destinationName}!`);
    } catch (err: any) {
      setError(err.message || 'Error creating tasks in Huly');
    } finally {
      setIsSyncing(false);
    }
  };

  // Copy Markdown for Huly
  const handleCopyHulyMarkdown = async () => {
    if (testCases.length === 0) return;
    const md = formatTestCasesForHulyMarkdown(testCases, {
      platform,
      packageName,
      featureMenu,
      tag: clickUpTag,
    });
    try {
      await navigator.clipboard.writeText(md);
      setSuccessMessage('Huly-formatted Markdown copied to clipboard! Ready to paste into Huly.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch {
      setError('Failed to copy Markdown.');
    }
  };

  // Download Node.js Importer Script
  const handleDownloadHulyScript = () => {
    if (testCases.length === 0) return;
    const script = generateHulyNodeScript(testCases, {
      serverUrl: hulyServerUrl,
      workspaceId: hulyWorkspaceId,
      email: hulyEmail,
      password: hulyPassword,
      projectId: hulyProjectId,
    });
    const blob = new Blob([script], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-huly.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSuccessMessage('Berhasil mengunduh "import-huly.js"! Jalankan "node import-huly.js" di terminal.');
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  // Copy Node.js Importer Script
  const handleCopyHulyScript = async () => {
    if (testCases.length === 0) return;
    const script = generateHulyNodeScript(testCases, {
      serverUrl: hulyServerUrl,
      workspaceId: hulyWorkspaceId,
      email: hulyEmail,
      password: hulyPassword,
      projectId: hulyProjectId,
    });
    try {
      await navigator.clipboard.writeText(script);
      setSuccessMessage('Node.js Importer Script tersalin ke clipboard! Siap ditempel & dijalankan.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch {
      setError('Gagal menyalin script.');
    }
  };

  // Download CSV
  const handleDownloadCsv = () => {
    if (testCases.length === 0) return;
    const csvContent = generateTestCasesCsv(testCases);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'testcases.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSuccessMessage('Berhasil mengunduh "testcases.csv"!');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 font-sans antialiased">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative z-10">
            <div className="space-y-1.5 text-center md:text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-300 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> AI QA Test Case Generator & Direct Huly Sync
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-emerald-300 to-sky-300">
                QA Assistant Studio
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm max-w-xl">
                Generate Gherkin test cases with Gemini AI and publish directly to <strong className="text-indigo-300 font-semibold">Huly Test Management</strong> or <strong className="text-emerald-300 font-semibold">ClickUp</strong>.
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setIntegrationTarget('huly')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  integrationTarget === 'huly'
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-600/25 ring-1 ring-indigo-400/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5" /> HULY Integration
              </button>
              <button
                type="button"
                onClick={() => setIntegrationTarget('clickup')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  integrationTarget === 'clickup'
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/25 ring-1 ring-emerald-400/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FolderKanban className="w-3.5 h-3.5" /> ClickUp
              </button>
            </div>
          </div>
        </header>

        {/* Global Notifications */}
        {error && (
          <div className="p-4 bg-red-950/50 border border-red-500/30 text-red-200 rounded-xl text-xs sm:text-sm flex items-start gap-3 shadow-lg">
            <Info className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 font-bold">&times;</button>
          </div>
        )}

        {successMessage && (
          <div className="p-4 bg-emerald-950/50 border border-emerald-500/30 text-emerald-200 rounded-xl text-xs sm:text-sm flex items-start gap-3 shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{successMessage}</div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200 font-bold">&times;</button>
          </div>
        )}

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Section 1: AI Generation (4 columns) */}
          <section className="lg:col-span-4 bg-slate-900/80 p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-5 shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-indigo-400 flex items-center gap-2">
                  <span className="bg-indigo-500/20 text-indigo-400 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black border border-indigo-500/30">1</span>
                  AI Prompt & Specs
                </h2>
                <Sparkles className="w-4 h-4 text-indigo-400 opacity-80" />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-400" /> Gemini API Key
                </label>
                <Input
                  type="password"
                  value={geminiApiKey}
                  onChange={e => setGeminiApiKey(e.target.value)}
                  placeholder="Paste your Gemini API Key (AIzaSy...)"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" /> Feature Requirements
                </label>
                <TextArea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="Describe your feature flow, user stories, or paste screenshot images directly here..."
                  rows={6}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-indigo-400" /> Attachments ({attachments.length})
                  </label>
                  {attachments.length > 0 && (
                    <button onClick={() => setAttachments([])} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>

                <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" accept="image/*" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold border border-dashed border-slate-700 transition-all flex items-center justify-center gap-2 hover:border-indigo-500/50"
                >
                  + Add Screenshot Attachments
                </button>

                {attachments.length > 0 && (
                  <div className="mt-3 space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                    {attachments.map((a, i) => (
                      <div key={i} className="bg-slate-950/80 px-3 py-1.5 rounded-lg text-xs flex items-center justify-between border border-slate-800 group">
                        <span className="truncate max-w-[200px] text-slate-300">{a.name}</span>
                        <button onClick={() => removeAttachment(i)} className="text-slate-500 hover:text-red-400 font-bold p-1">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2">
              <Button
                onClick={handleGenerate}
                disabled={isLoading || !geminiApiKey}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all"
              >
                {isLoading ? (
                  <>
                    <Loader /> Processing Gemini AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Generate Gherkin Test Cases
                  </>
                )}
              </Button>
            </div>
          </section>

          {/* Section 2: Integration Configuration (8 columns) */}
          <section className="lg:col-span-8 bg-slate-900/80 p-5 sm:p-6 rounded-2xl border border-slate-800 space-y-5 shadow-xl">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-emerald-400 flex items-center gap-2">
                <span className="bg-emerald-500/20 text-emerald-400 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black border border-emerald-500/30">2</span>
                {integrationTarget === 'huly' ? 'Huly Workspace Setup & Actions' : 'ClickUp Configuration'}
              </h2>
              <span className="text-xs px-2.5 py-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-full font-semibold">
                {integrationTarget === 'huly' ? 'Huly Direct Sync' : 'ClickUp Integration'}
              </span>
            </div>

            {/* Common Metadata Fields */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <Tag className="w-3.5 h-3.5 text-indigo-400" /> Target Metadata & Classification
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Platform</label>
                  <Input value={platform} onChange={e => setPlatform(e.target.value)} placeholder="e.g. Web / Android" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Package / Module</label>
                  <Input value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="e.g. Auth / Asset" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Feature Menu</label>
                  <Input value={featureMenu} onChange={e => setFeatureMenu(e.target.value)} placeholder="e.g. Login Page" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Sprint / Tag</label>
                  <Input value={clickUpTag} onChange={e => setClickUpTag(e.target.value)} placeholder="e.g. Sprint-1" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Task Type</label>
                  <Select value={clickUpType} onChange={e => setClickUpType(e.target.value)}>
                    <option value="Test Case">Test Case</option>
                    <option value="Bug">Bug</option>
                    <option value="Task">Task</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Execution Mode</label>
                  <Select value={executionType} onChange={e => setExecutionType(e.target.value)}>
                    <option value="Manual">Manual</option>
                    <option value="To Automate">To Automate</option>
                  </Select>
                </div>
              </div>
            </div>

            {/* Target-Specific Form Fields */}
            {integrationTarget === 'huly' ? (
              <div className="space-y-4">
                {/* Huly Host URL & Sub-module */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-7">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-indigo-400" /> Huly Server / Host URL
                    </label>
                    <Input
                      value={hulyServerUrl}
                      onChange={e => handleServerUrlChange(e.target.value)}
                      placeholder="https://huly.app or https://huly.assetfindr.com"
                    />
                  </div>

                  <div className="sm:col-span-5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" /> Huly Target Module
                    </label>
                    <Select value={hulyTargetModule} onChange={e => setHulyTargetModule(e.target.value as any)}>
                      <option value="test-management">🧪 Test Management Repository</option>
                      <option value="issues">📋 Issues & Tasks Tracker</option>
                    </Select>
                  </div>
                </div>

                {/* Huly Integration Method Box */}
                <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Authentication & Sync Method
                    </span>

                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setHulyAuthMode('credentials')}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                          hulyAuthMode === 'credentials'
                            ? 'bg-indigo-600 text-white shadow ring-1 ring-indigo-400/30'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        🚀 Direct API Client (@hcengineering)
                      </button>
                      <button
                        type="button"
                        onClick={() => setHulyAuthMode('token')}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                          hulyAuthMode === 'token'
                            ? 'bg-indigo-600 text-white shadow ring-1 ring-indigo-400/30'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        🎫 REST Token
                      </button>
                    </div>
                  </div>

                  {hulyAuthMode === 'credentials' ? (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-indigo-400" /> Huly Account Email
                          </label>
                          <Input
                            type="email"
                            value={hulyEmail}
                            onChange={e => setHulyEmail(e.target.value)}
                            placeholder="e.g. rega@assetfindr.com"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                            <Lock className="w-3 h-3 text-indigo-400" /> Huly Password
                          </label>
                          <Input
                            type="password"
                            value={hulyPassword}
                            onChange={e => setHulyPassword(e.target.value)}
                            placeholder="Your Huly password"
                          />
                        </div>
                      </div>

                      <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/20 rounded-lg text-[11px] text-emerald-300 leading-relaxed flex items-start gap-2">
                        <Zap className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>Direct Sync Active:</strong> Multi-tenant WebSocket client connection enabled via <code className="font-mono text-emerald-200 bg-emerald-950 px-1 py-0.5 rounded">@hcengineering/api-client</code>. Creates Gherkin Test Cases directly inside your Huly Test Suite.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <label className="block text-[11px] font-semibold text-slate-400">Personal Access Token</label>
                      <Input
                        type="password"
                        value={hulyToken}
                        onChange={e => setHulyToken(e.target.value)}
                        placeholder="Paste Huly Personal API Token / Key"
                      />
                    </div>
                  )}
                </div>

                {/* Workspace ID & Space / Project IDs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Workspace ID</label>
                    <Input
                      value={hulyWorkspaceId}
                      onChange={e => setHulyWorkspaceId(e.target.value)}
                      placeholder="e.g. qa"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Space ID / Project ID</label>
                    <Input
                      value={hulyProjectId}
                      onChange={e => setHulyProjectId(e.target.value)}
                      placeholder="e.g. 6a6991253946584506fac9d2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Test Suite ID (Optional)</label>
                    <Input
                      value={hulySuiteId}
                      onChange={e => setHulySuiteId(e.target.value)}
                      placeholder="e.g. 6a6995803946584506facc14"
                    />
                  </div>
                </div>

                {/* Advanced Options Collapsible */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedHulyOptions(!showAdvancedHulyOptions)}
                    className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                  >
                    {showAdvancedHulyOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {showAdvancedHulyOptions ? 'Hide Advanced Options' : 'Show Custom Endpoint / Webhook Options'}
                  </button>

                  {showAdvancedHulyOptions && (
                    <div className="mt-2.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Custom Webhook / REST Endpoint</label>
                      <Input
                        value={hulyEndpointUrl}
                        onChange={e => setHulyEndpointUrl(e.target.value)}
                        placeholder={`${hulyServerUrl.replace(/\/+$/, '')}/v1/issues`}
                      />
                    </div>
                  )}
                </div>

                {/* Export & Sync Actions Panel */}
                <div className="pt-2 border-t border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                    <button
                      type="button"
                      onClick={handleCreateInHuly}
                      disabled={isSyncing || testCases.length === 0}
                      className="flex-1 py-3 px-5 bg-gradient-to-r from-indigo-600 via-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      {isSyncing ? (
                        <>
                          <Loader /> Importing to Huly...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          {testCases.length === 0
                            ? 'Sync to Huly Test Management'
                            : `Upload ${testCases.length} Test Cases to ${hulyTargetModule === 'test-management' ? 'Huly Test Suite 🧪' : 'Huly Tracker 📋'}`}
                        </>
                      )}
                    </button>

                    <a
                      href={
                        hulyWorkspaceId
                          ? hulyTargetModule === 'test-management'
                            ? hulyProjectId
                              ? `${hulyServerUrl.replace(/\/+$/, '')}/workspace/${hulyWorkspaceId}/project/${hulyProjectId}/test-cases`
                              : `${hulyServerUrl.replace(/\/+$/, '')}/workspace/${hulyWorkspaceId}/test-management`
                            : hulyProjectId
                              ? `${hulyServerUrl.replace(/\/+$/, '')}/workspace/${hulyWorkspaceId}/project/${hulyProjectId}/issues`
                              : `${hulyServerUrl.replace(/\/+$/, '')}/workspace/${hulyWorkspaceId}/issues`
                          : hulyServerUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="py-3 px-4 bg-slate-800/80 hover:bg-slate-800 text-indigo-300 rounded-xl text-xs font-bold border border-slate-700 transition-colors flex items-center justify-center gap-2 shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Huly Page ↗
                    </a>
                  </div>

                  {/* Secondary Tools Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleDownloadHulyScript}
                      disabled={testCases.length === 0}
                      className="py-2.5 px-3 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 rounded-lg text-xs font-bold border border-emerald-500/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      title="Download import-huly.js Node.js script"
                    >
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      import-huly.js
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyHulyScript}
                      disabled={testCases.length === 0}
                      className="py-2.5 px-3 bg-slate-800/80 hover:bg-slate-800 text-indigo-300 rounded-lg text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Script
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadCsv}
                      disabled={testCases.length === 0}
                      className="py-2.5 px-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Download CSV
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyHulyMarkdown}
                      disabled={testCases.length === 0}
                      className="py-2.5 px-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Markdown
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">ClickUp API Token</label>
                    <Input type="password" value={clickUpToken} onChange={e => setClickUpToken(e.target.value)} placeholder="pk_..." />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">List ID</label>
                    <Input value={clickUpListId} onChange={e => setClickUpListId(e.target.value)} placeholder="e.g. 901200123" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Apps Script Proxy URL</label>
                  <Input value={appsScriptUrl} onChange={e => setAppsScriptUrl(e.target.value)} placeholder="https://script.google.com/..." />
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleCreateInClickUp}
                    disabled={isSyncing || testCases.length === 0}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    {isSyncing ? <Loader /> : <Send className="w-4 h-4" />}
                    {isSyncing ? 'Syncing to ClickUp...' : `Sync ${testCases.length} Tasks to ClickUp`}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Section 3: Review Results & Table View */}
          <section className="lg:col-span-12 bg-slate-900/80 p-5 sm:p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="bg-indigo-500/20 text-indigo-400 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black border border-indigo-500/30">3</span>
                <h2 className="text-base sm:text-lg font-bold text-indigo-300">
                  {viewMode === 'table' ? 'Excel Table Review & Editor' : 'Generated Test Cases Cards'}
                </h2>
                {testCases.length > 0 && (
                  <span className="px-2.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full text-xs font-semibold">
                    {testCases.length} Test Cases
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setViewMode('card')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                      viewMode === 'card'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> CARDS
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                      viewMode === 'table'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" /> EXCEL TABLE
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-[250px]">
              {testCases.length === 0 && !isLoading ? (
                <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 space-y-3 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                  <Sparkles className="w-10 h-10 text-slate-600" />
                  <div className="text-sm font-medium">Belum ada test case. Silakan masukkan Gemini API Key & Prompt lalu klik "Generate Gherkin Test Cases".</div>
                </div>
              ) : viewMode === 'card' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {testCases.map((tc, idx) => (
                    <TestCaseCard
                      key={idx}
                      index={idx}
                      testCase={tc}
                      result={syncResults[idx]}
                      onUpdate={(i, updated) => {
                        const newCases = [...testCases];
                        newCases[i] = updated;
                        setTestCases(newCases);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <ReviewTable
                  testCases={testCases}
                  platform={platform}
                  packageName={packageName}
                  featureMenu={featureMenu}
                  clickUpTag={clickUpTag}
                  onUpdate={(i, updated) => {
                    const newCases = [...testCases];
                    newCases[i] = updated;
                    setTestCases(newCases);
                  }}
                  onSetTestCases={(cases) => setTestCases(cases)}
                  onAddTestCase={() => {
                    setTestCases(prev => [
                      ...prev,
                      { title: 'New Test Case', description: 'Given ...\nWhen ...\nThen ...', priority: 'Medium' }
                    ]);
                  }}
                  onDeleteTestCase={(index) => {
                    setTestCases(prev => prev.filter((_, i) => i !== index));
                  }}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default App;
