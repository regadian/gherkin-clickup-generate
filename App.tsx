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
    <div className="min-h-screen bg-slate-900 text-gray-200 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-indigo-400 text-xs font-semibold">
            ✨ AI QA Test Case Generator & Task Sync
          </div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-emerald-400 to-sky-400">
            QA Assistant
          </h1>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            Generate Gherkin test cases with Gemini AI, edit in Cards or Excel Table view, and push directly into <strong className="text-indigo-300 font-semibold">Huly</strong> or <strong className="text-emerald-300 font-semibold">ClickUp</strong>.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Section 1: AI Generation */}
          <section className="space-y-6 bg-slate-800 p-6 rounded-xl border border-slate-700 h-fit shadow-xl">
            <h2 className="text-xl font-bold border-b border-slate-700 pb-3 text-indigo-400 flex items-center gap-2">
              <span className="bg-indigo-500/20 text-indigo-400 w-7 h-7 rounded-full flex items-center justify-center text-sm">1</span>
              AI Generation
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Gemini API Key</label>
                <Input type="password" value={geminiApiKey} onChange={e => setGeminiApiKey(e.target.value)} placeholder="Paste your API Key (AIzaSy... / AQ...)" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Feature Details</label>
                <TextArea value={prompt} onChange={e => setPrompt(e.target.value)} onPaste={handlePaste} placeholder="Describe your feature flow or paste images..." rows={6} />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-400">Attachments ({attachments.length})</label>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple className="hidden" accept="image/*" />
                <div className="flex flex-wrap gap-2">
                   <Button variant="secondary" onClick={() => fileInputRef.current?.click()} className="!bg-slate-700 !py-2 !text-xs !w-auto !px-4 hover:!bg-slate-600">
                      + Add Screenshots
                   </Button>
                   {attachments.length > 0 && (
                     <button onClick={() => setAttachments([])} className="text-xs text-red-400 hover:text-red-300">Clear all</button>
                   )}
                </div>
                {attachments.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-1.5">
                    {attachments.map((a, i) => (
                      <div key={i} className="bg-slate-900/80 px-3 py-1.5 rounded text-[10px] flex items-center justify-between border border-slate-700 group">
                        <span className="truncate max-w-[180px]">{a.name}</span>
                        <button onClick={() => removeAttachment(i)} className="text-slate-500 group-hover:text-red-400 transition-colors font-bold">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={handleGenerate} disabled={isLoading || !geminiApiKey} className="shadow-lg shadow-indigo-500/20">
                {isLoading ? 'Processing...' : 'Generate Test Cases'}
              </Button>
            </div>
          </section>

          {/* Section 2: Destination Settings (Huly / ClickUp) */}
          <section className="space-y-6 bg-slate-800 p-6 rounded-xl border border-slate-700 h-fit shadow-xl">
            <div className="border-b border-slate-700 pb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                <span className="bg-emerald-500/20 text-emerald-400 w-7 h-7 rounded-full flex items-center justify-center text-sm">2</span>
                Destination Settings
              </h2>

              {/* Target Switcher */}
              <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setIntegrationTarget('huly')}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                    integrationTarget === 'huly'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  HULY 🚀
                </button>
                <button
                  type="button"
                  onClick={() => setIntegrationTarget('clickup')}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                    integrationTarget === 'clickup'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ClickUp
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Common Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Platform</label>
                  <Input value={platform} onChange={e => setPlatform(e.target.value)} placeholder="Web / iOS / Android" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Package</label>
                  <Input value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="Auth / Core" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Feature Menu</label>
                  <Input value={featureMenu} onChange={e => setFeatureMenu(e.target.value)} placeholder="Login Page" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Tag / Sprint</label>
                  <Input value={clickUpTag} onChange={e => setClickUpTag(e.target.value)} placeholder="Sprint-1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Task Type</label>
                  <Select value={clickUpType} onChange={e => setClickUpType(e.target.value)}>
                    <option value="Test Case">Test Case</option>
                    <option value="Bug">Bug</option>
                    <option value="Task">Task</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Execution Type</label>
                  <Select value={executionType} onChange={e => setExecutionType(e.target.value)}>
                    <option value="Manual">Manual</option>
                    <option value="To Automate">To Automate</option>
                  </Select>
                </div>
              </div>

              {/* Target-Specific Form Fields */}
              {integrationTarget === 'huly' ? (
                <div className="space-y-3 pt-2 border-t border-slate-700/60">
                  <div className="bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-500/20 text-[11px] text-indigo-300 leading-relaxed">
                    <strong>Huly Destination</strong> — Self-Hosted & Cloud supported! Direct export into Huly Test Management or Issues Tracker.
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Huly Server / Host URL</label>
                    <Input
                      value={hulyServerUrl}
                      onChange={e => handleServerUrlChange(e.target.value)}
                      placeholder="https://huly.app or https://huly.assetfindr.com/workbench/qa"
                    />
                    <p className="mt-1 text-[10px] text-slate-400 leading-tight">
                      💡 <strong>Self-hosted tip:</strong> Anda dapat paste URL penuh Huly Anda (misal: <code className="text-indigo-300 font-mono">https://huly.assetfindr.com/workbench/qa/tracker/6a698200809795a4208ea654/issues</code>), maka Host Server, Workspace, dan Tracker ID akan otomatis terurai.
                    </p>
                  </div>

                  {/* Auth Mode Toggle */}
                  <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-700 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                      <span>INTEGRATION METHOD</span>
                      <div className="flex bg-slate-800 p-0.5 rounded border border-slate-700">
                        <button
                          type="button"
                          onClick={() => setHulyAuthMode('credentials')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            hulyAuthMode === 'credentials' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400'
                          }`}
                        >
                          🚀 Direct API Client (@hcengineering)
                        </button>
                        <button
                          type="button"
                          onClick={() => setHulyAuthMode('token')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            hulyAuthMode === 'token' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400'
                          }`}
                        >
                          🎫 REST Token / Webhook
                        </button>
                      </div>
                    </div>

                    {hulyAuthMode === 'credentials' ? (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="email"
                            value={hulyEmail}
                            onChange={e => setHulyEmail(e.target.value)}
                            placeholder="Email (contoh: rega@assetfindr.com)"
                          />
                          <Input
                            type="password"
                            value={hulyPassword}
                            onChange={e => setHulyPassword(e.target.value)}
                            placeholder="Password Huly Anda"
                          />
                        </div>
                        <p className="text-[10px] text-emerald-300 leading-tight bg-emerald-950/40 p-2 rounded border border-emerald-500/20">
                          ✨ <strong>Direct Sync Active:</strong> Menggunakan library resmi <code className="font-mono text-emerald-200">@hcengineering/api-client</code>. Setelah Anda mengisi Email, Password, Workspace, dan Space ID di bawah, klik tombol <strong>Create Test Cases</strong> maka semua test case akan diunggah otomatis langsung ke Huly Test Management tanpa perlu menembak REST/Webhook atau menjalankan script manual!
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 pt-1">
                        <Input
                          type="password"
                          value={hulyToken}
                          onChange={e => setHulyToken(e.target.value)}
                          placeholder="Paste Huly Personal API Token / Access Key"
                        />
                        <p className="text-[10px] text-slate-400 leading-tight">
                          💡 <strong>Opsi Token / Webhook:</strong> Gunakan opsi ini jika Anda ingin menggunakan Personal Token atau Webhook endpoint custom.
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Huly Sub-Module Destination</label>
                    <Select value={hulyTargetModule} onChange={e => setHulyTargetModule(e.target.value as any)}>
                      <option value="test-management">🧪 Test Management (Test Cases Repository)</option>
                      <option value="issues">📋 Issues & Tasks Tracker</option>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Workspace ID (contoh: qa)</label>
                      <Input value={hulyWorkspaceId} onChange={e => setHulyWorkspaceId(e.target.value)} placeholder="qa atau workbench/qa" />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Space ID / Project ID</label>
                      <Input value={hulyProjectId} onChange={e => setHulyProjectId(e.target.value)} placeholder="6a6991253946584506fac9d2" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Test Suite ID (Optional)</label>
                    <Input value={hulySuiteId} onChange={e => setHulySuiteId(e.target.value)} placeholder="6a6995803946584506facc14" />
                    <p className="mt-0.5 text-[10px] text-slate-400">Kosongkan jika ingin langsung dibuat di root Space ID.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Custom Endpoint / Webhook (Optional)</label>
                    <Input value={hulyEndpointUrl} onChange={e => setHulyEndpointUrl(e.target.value)} placeholder={`${hulyServerUrl.replace(/\/+$/, '')}/v1/issues`} />
                  </div>

                  {testCases.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <Button
                        onClick={handleCreateInHuly}
                        disabled={isSyncing}
                        className="!bg-indigo-600 hover:!bg-indigo-500 shadow-lg shadow-indigo-600/20"
                      >
                        {isSyncing
                          ? 'Creating in Huly...'
                          : `Create ${testCases.length} Test Cases in ${hulyTargetModule === 'test-management' ? 'Huly Test Management 🧪' : 'Huly Tracker 📋'}`}
                      </Button>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleDownloadHulyScript}
                          className="py-2 px-3 bg-emerald-700/80 hover:bg-emerald-600 text-emerald-100 rounded-lg text-xs font-bold border border-emerald-500/40 transition-colors flex items-center justify-center gap-1.5 shadow-md"
                          title="Unduh script Node.js import-huly.js untuk mengimpor semua test case sekaligus tanpa copy-paste!"
                        >
                          ⚡ Download import-huly.js
                        </button>

                        <button
                          type="button"
                          onClick={handleCopyHulyScript}
                          className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-lg text-xs font-bold border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                        >
                          📜 Copy Node Script
                        </button>

                        <button
                          type="button"
                          onClick={handleDownloadCsv}
                          className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                        >
                          📄 Download CSV
                        </button>

                        <button
                          type="button"
                          onClick={handleCopyHulyMarkdown}
                          className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                        >
                          📋 Copy Markdown
                        </button>
                      </div>

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
                        className="w-full py-2 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 rounded-lg text-xs font-semibold border border-indigo-600 flex items-center justify-center gap-1 transition-colors"
                        title="Open direct Huly Test Management page"
                      >
                        {hulyTargetModule === 'test-management' ? 'Open Huly Test Management ↗' : 'Open Huly Issues ↗'}
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-2 border-t border-slate-700/60">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">API Token</label>
                    <Input type="password" value={clickUpToken} onChange={e => setClickUpToken(e.target.value)} placeholder="pk_..." />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">List ID</label>
                    <Input value={clickUpListId} onChange={e => setClickUpListId(e.target.value)} placeholder="Example: 901200123" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Proxy URL (Apps Script)</label>
                    <Input value={appsScriptUrl} onChange={e => setAppsScriptUrl(e.target.value)} placeholder="https://script.google.com/..." />
                  </div>

                  {testCases.length > 0 && (
                    <Button
                      onClick={handleCreateInClickUp}
                      disabled={isSyncing}
                      className="!bg-emerald-600 hover:!bg-emerald-700 shadow-lg shadow-emerald-500/20"
                    >
                      {isSyncing ? 'Syncing...' : `Sync ${testCases.length} Tasks to ClickUp`}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Section 3: Output & Review */}
          <section className={`bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl flex flex-col ${viewMode === 'table' ? 'lg:col-span-3 min-h-[600px]' : 'lg:col-span-1 h-[85vh]'}`}>
            <div className="flex justify-between items-center border-b border-slate-700 pb-3 mb-4">
               <h2 className="text-xl font-bold text-indigo-400 flex items-center gap-2">
                 <span className="bg-indigo-500/20 text-indigo-400 w-7 h-7 rounded-full flex items-center justify-center text-sm">3</span>
                 {viewMode === 'table' ? 'Review Mode (Excel Table View)' : 'Review Results'}
               </h2>

               <div className="flex items-center gap-2">
                 <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                    <button 
                      onClick={() => setViewMode('card')}
                      className={`px-3 py-1 rounded text-[10px] font-bold transition-colors ${viewMode === 'card' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      CARDS
                    </button>
                    <button 
                      onClick={() => setViewMode('table')}
                      className={`px-3 py-1 rounded text-[10px] font-bold transition-colors ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      EXCEL TABLE 📊
                    </button>
                 </div>
               </div>
            </div>

            {error && <div className="mb-4 text-[11px] p-3 bg-red-900/30 border border-red-700 text-red-300 rounded leading-relaxed">{error}</div>}
            {successMessage && <div className="mb-4 text-[11px] p-3 bg-emerald-900/30 border border-emerald-700 text-emerald-300 rounded leading-relaxed">{successMessage}</div>}
            
            <div className="flex-grow space-y-4 overflow-y-auto pr-2 custom-scrollbar">
              {viewMode === 'card' ? (
                <>
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
                </>
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

              {testCases.length === 0 && !isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-3 py-12">
                  <div className="w-16 h-16 border-2 border-dashed border-slate-700 rounded-full flex items-center justify-center text-3xl opacity-30">✨</div>
                  <p className="text-sm">
                    Enter feature details and click "Generate Test Cases".<br/>
                    Or use <strong className="text-indigo-400 font-semibold">Table Mode</strong> to copy/paste rows directly from Excel!
                  </p>
                </div>
              )}
              {isLoading && <Loader />}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default App;
