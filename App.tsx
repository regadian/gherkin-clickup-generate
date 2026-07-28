import React, { useState, useRef } from 'react';
import { TestCase, ClickUpResult, SyncResult, Attachment, IntegrationTarget } from './types';
import { generateTestCases } from './services/geminiService';
import { createClickUpTask } from './services/clickupService';
import { createHulyTask, formatTestCasesForHulyMarkdown } from './services/hulyService';
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
  const [hulyToken, setHulyToken] = useState('');
  const [hulyWorkspaceId, setHulyWorkspaceId] = useState('');
  const [hulyProjectId, setHulyProjectId] = useState('');
  const [hulyEndpointUrl, setHulyEndpointUrl] = useState('https://api.huly.app/v1/issues');

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

  // Sync to Huly
  const handleCreateInHuly = async () => {
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
              endpointUrl: hulyEndpointUrl || 'https://api.huly.app/v1/issues',
              tags: clickUpTag ? [clickUpTag] : [],
              type: clickUpType,
              executionType,
            }
          );
        })
      );
      setSyncResults(results);
      setSuccessMessage(`Finished creating ${testCases.length} tasks in Huly!`);
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
                    <strong>Huly Issue Tracker</strong> — Push issues directly to Huly API or copy pre-formatted Huly Markdown for quick import!
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Workspace ID / Space</label>
                    <Input value={hulyWorkspaceId} onChange={e => setHulyWorkspaceId(e.target.value)} placeholder="Example: my-team-workspace" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Project ID / Team Key (Optional)</label>
                    <Input value={hulyProjectId} onChange={e => setHulyProjectId(e.target.value)} placeholder="Example: QA" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">API Key / Personal Token</label>
                    <Input type="password" value={hulyToken} onChange={e => setHulyToken(e.target.value)} placeholder="Huly API / Personal Token" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Endpoint / Webhook Proxy URL</label>
                    <Input value={hulyEndpointUrl} onChange={e => setHulyEndpointUrl(e.target.value)} placeholder="https://api.huly.app/v1/issues" />
                  </div>

                  {testCases.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <Button
                        onClick={handleCreateInHuly}
                        disabled={isSyncing}
                        className="!bg-indigo-600 hover:!bg-indigo-500 shadow-lg shadow-indigo-600/20"
                      >
                        {isSyncing ? 'Creating in Huly...' : `Redirect & Create ${testCases.length} Tasks in Huly 🚀`}
                      </Button>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleCopyHulyMarkdown}
                          className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold border border-slate-600 transition-colors"
                        >
                          📋 Copy Huly Markdown
                        </button>

                        <a
                          href="https://huly.app"
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-lg text-xs font-semibold border border-slate-700 flex items-center justify-center gap-1 transition-colors"
                        >
                          Open Huly ↗
                        </a>
                      </div>
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
