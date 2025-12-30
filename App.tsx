
import React, { useState, useCallback, useRef } from 'react';
import { TestCase, ClickUpResult, Attachment } from './types';
import { generateTestCases } from './services/geminiService';
import { createClickUpTask } from './services/clickupService';
import TextArea from './components/TextArea';
import Input from './components/Input';
import Button from './components/Button';
import Loader from './components/Loader';
import TestCaseCard from './components/TestCaseCard';
import Select from './components/Select';

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ClickUp Integration State
  const [clickUpToken, setClickUpToken] = useState('');
  const [clickUpListId, setClickUpListId] = useState('');
  const [appsScriptUrl, setAppsScriptUrl] = useState('https://script.google.com/macros/s/AKfycbylpkRlS2Fjiulm9uUzqZPrTf_a3D4wmfLwRB7DFCr85otnsvID1IMhgzrYbe1m5HULvw/exec');
  const [isCreatingInClickUp, setIsCreatingInClickUp] = useState(false);
  const [clickUpResults, setClickUpResults] = useState<ClickUpResult[]>([]);
  
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
  }

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
    setTestCases([]);
    try {
      const generated = await generateTestCases(prompt, geminiApiKey, attachments);
      setTestCases(generated);
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateInClickUp = async () => {
    if (!clickUpToken || !clickUpListId || !appsScriptUrl) {
      setError('Missing ClickUp configuration (Token, List ID, or Proxy URL).');
      return;
    }
    setIsCreatingInClickUp(true);
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
    setClickUpResults(results);
    setIsCreatingInClickUp(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-gray-200 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="text-center">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">
            QA Assistant
          </h1>
          <p className="text-slate-400 mt-2 tracking-wide">Generate test cases and sync them with ClickUp instantly.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Section 1: AI Input */}
          <section className="space-y-6 bg-slate-800 p-6 rounded-xl border border-slate-700 h-fit shadow-xl">
            <h2 className="text-xl font-bold border-b border-slate-700 pb-3 text-indigo-400 flex items-center gap-2">
              <span className="bg-indigo-500/20 text-indigo-400 w-7 h-7 rounded-full flex items-center justify-center text-sm">1</span>
              AI Generation
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Gemini API Key</label>
                <Input type="password" value={geminiApiKey} onChange={e => setGeminiApiKey(e.target.value)} placeholder="Paste your API Key here" />
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

          {/* Section 2: ClickUp Config */}
          <section className="space-y-6 bg-slate-800 p-6 rounded-xl border border-slate-700 h-fit shadow-xl">
            <h2 className="text-xl font-bold border-b border-slate-700 pb-3 text-emerald-400 flex items-center gap-2">
              <span className="bg-emerald-500/20 text-emerald-400 w-7 h-7 rounded-full flex items-center justify-center text-sm">2</span>
              ClickUp Settings
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">API Token</label>
                <Input type="password" value={clickUpToken} onChange={e => setClickUpToken(e.target.value)} placeholder="pk_..." />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">List ID</label>
                <Input value={clickUpListId} onChange={e => setClickUpListId(e.target.value)} placeholder="Example: 901200123" />
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Platform</label>
                  <Input value={platform} onChange={e => setPlatform(e.target.value)} placeholder="Web/App" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Package</label>
                  <Input value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="Auth/Core" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Feature Menu</label>
                  <Input value={featureMenu} onChange={e => setFeatureMenu(e.target.value)} placeholder="Login Page" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Task Tag</label>
                  <Input value={clickUpTag} onChange={e => setClickUpTag(e.target.value)} placeholder="Sprint-1" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Proxy URL (Apps Script)</label>
                <Input value={appsScriptUrl} onChange={e => setAppsScriptUrl(e.target.value)} placeholder="https://script.google.com/..." />
              </div>

              {testCases.length > 0 && (
                <Button onClick={handleCreateInClickUp} disabled={isCreatingInClickUp} className="!bg-emerald-600 hover:!bg-emerald-700 shadow-lg shadow-emerald-500/20">
                  {isCreatingInClickUp ? 'Creating...' : `Sync ${testCases.length} Tasks to ClickUp`}
                </Button>
              )}
            </div>
          </section>

          {/* Section 3: Output */}
          <section className="bg-slate-800 p-6 rounded-xl border border-slate-700 lg:col-span-1 shadow-xl flex flex-col h-[85vh]">
            <div className="flex justify-between items-center border-b border-slate-700 pb-3 mb-4">
               <h2 className="text-xl font-bold text-indigo-400 flex items-center gap-2">
                 <span className="bg-indigo-500/20 text-indigo-400 w-7 h-7 rounded-full flex items-center justify-center text-sm">3</span>
                 Review Results
               </h2>
            </div>

            {error && <div className="mb-4 text-[11px] p-3 bg-red-900/30 border border-red-700 text-red-300 rounded leading-relaxed">{error}</div>}
            
            <div className="flex-grow space-y-4 overflow-y-auto pr-2 custom-scrollbar">
              {testCases.map((tc, idx) => (
                <TestCaseCard
                  key={idx}
                  index={idx}
                  testCase={tc}
                  result={clickUpResults[idx]}
                  onUpdate={(i, updated) => {
                    const newCases = [...testCases];
                    newCases[i] = updated;
                    setTestCases(newCases);
                  }}
                />
              ))}

              {testCases.length === 0 && !isLoading && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-3">
                  <div className="w-16 h-16 border-2 border-dashed border-slate-700 rounded-full flex items-center justify-center text-3xl opacity-30">✨</div>
                  <p className="text-sm">Enter details and generate test cases.<br/>They will appear here for review.</p>
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
