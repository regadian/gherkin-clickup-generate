
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

  // State for ClickUp Integration
  const [clickUpToken, setClickUpToken] = useState('');
  const [clickUpListId, setClickUpListId] = useState('');
  const [appsScriptUrl, setAppsScriptUrl] = useState('https://script.google.com/macros/s/AKfycbylpkRlS2Fjiulm9uUzqZPrTf_a3D4wmfLwRB7DFCr85otnsvID1IMhgzrYbe1m5HULvw/exec');
  const [isCreatingInClickUp, setIsCreatingInClickUp] = useState(false);
  const [clickUpResults, setClickUpResults] = useState<ClickUpResult[]>([]);

  // State for Title Formatting
  const [platform, setPlatform] = useState('');
  const [packageName, setPackageName] = useState('');
  const [featureMenu, setFeatureMenu] = useState('');
  
  // State for ClickUp Fields
  const [clickUpTag, setClickUpTag] = useState('');
  const [clickUpType, setClickUpType] = useState('Test Case');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(Array.from(files));
  };
  
  const processFiles = (files: File[]) => {
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) { // Increased to 10MB per file
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
      reader.onerror = () => {
        setError(`Failed to read file ${file.name}`);
      };
      reader.readAsDataURL(file);
    });

    // Reset input so the same file can be selected again if removed
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
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

  const handleGenerate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!prompt && attachments.length === 0) || !geminiApiKey) {
      setError('Please provide a feature description (text or images) and your Gemini API Key.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setTestCases([]);
    setClickUpResults([]);

    try {
      const generatedTestCases = await generateTestCases(prompt, geminiApiKey, attachments);
      setTestCases(generatedTestCases);
    } catch (err) {
      if (err instanceof Error) {
        setError(`An error occurred: ${err.message}`);
      } else {
        setError('An unknown error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [prompt, geminiApiKey, attachments]);

  const handleCreateInClickUp = async () => {
    if (!clickUpToken || !clickUpListId || !appsScriptUrl) {
      setError('Please provide ClickUp Token, List ID, and the Google Apps Script URL.');
      return;
    }
    setIsCreatingInClickUp(true);
    setError(null);
    setClickUpResults([]);

    const results = await Promise.all(
      testCases.map(tc => {
        const dynamicTitle = `[${platform || 'N/A'}][${packageName || 'N/A'}][${featureMenu || 'N/A'}] ${tc.title}`;
        const taskData = { ...tc, title: dynamicTitle };
        
        const tags = [];
        if (clickUpTag) tags.push(clickUpTag);

        return createClickUpTask(
          taskData, 
          clickUpToken, 
          clickUpListId, 
          appsScriptUrl, 
          tags, 
          clickUpType
        );
      })
    );
    
    setClickUpResults(results);
    setIsCreatingInClickUp(false);

    if (results.some(r => !r.success)) {
        const firstError = results.find(r => !r.success)?.message;
        setError(`Some tasks failed to create. First error: ${firstError}`);
    }
  };

  const handleTestCaseUpdate = (index: number, updatedTestCase: TestCase) => {
    setTestCases(currentTestCases => 
      currentTestCases.map((tc, i) => (i === index ? updatedTestCase : tc))
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-gray-200 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
            AI Test Case Generator for ClickUp
          </h1>
          <p className="mt-4 text-lg text-slate-400">
            Generate Gherkin-style test cases from text and multiple images.
          </p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
            <form onSubmit={handleGenerate}>
              <div className="space-y-6">
                <div>
                  <label htmlFor="gemini-key" className="block text-sm font-medium text-slate-300 mb-2">
                    Google Gemini API Key
                  </label>
                  <Input
                    id="gemini-key"
                    type="password"
                    placeholder="Enter your Gemini API Key here"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    disabled={isLoading}
                  />
                   <p className="mt-2 text-xs text-slate-500">
                    Get your key from Google AI Studio.
                  </p>
                </div>
                 <div>
                  <label htmlFor="prompt" className="block text-sm font-medium text-slate-300 mb-2">
                    Feature Description
                  </label>
                  <TextArea
                    id="prompt"
                    placeholder='e.g., "Login flow with social media support". Paste screenshots directly here.'
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onPaste={handlePaste}
                    disabled={isLoading}
                    rows={6}
                  />
                </div>
                 <div>
                    <label htmlFor="file-upload" className="block text-sm font-medium text-slate-300 mb-2">
                      Attach Files (Multiple images allowed)
                    </label>
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-4">
                        <label htmlFor="file-upload" className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-2 px-4 rounded-md transition-colors duration-200 inline-block">
                            Choose Files
                        </label>
                        <input
                            id="file-upload"
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileChange}
                            accept="image/*,text/plain,.md"
                            disabled={isLoading}
                            multiple
                        />
                        <span className="text-sm text-slate-400">
                          {attachments.length} file(s) selected
                        </span>
                      </div>
                      
                      {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                          {attachments.map((att, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800 py-1 px-3 rounded-full border border-slate-600 group">
                                <span className="truncate max-w-[150px]">{att.name}</span>
                                <button
                                    type="button"
                                    onClick={() => removeAttachment(idx)}
                                    className="text-slate-500 hover:text-red-400 transition-colors font-bold"
                                    aria-label="Remove file"
                                >
                                    &times;
                                </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
              </div>
              <div className="mt-8">
                <Button type="submit" disabled={isLoading || (!prompt && attachments.length === 0) || !geminiApiKey} className="w-full">
                  {isLoading ? 'Generating Test Cases...' : 'Generate Test Cases'}
                </Button>
              </div>
            </form>
          </div>

          <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700 flex flex-col">
            <h2 className="text-2xl font-bold text-slate-200 mb-4">Results</h2>
            
            {isLoading && <Loader />}
            {error && <div className="mb-4 bg-red-900/50 text-red-300 p-4 rounded-md border border-red-700 text-sm">{error}</div>}

            {testCases.length > 0 && (
              <div className="space-y-4 bg-slate-900/50 p-4 rounded-md border border-slate-700 mb-6">
                <h3 className="font-bold text-lg text-slate-200">ClickUp Task Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Platform</label>
                        <Input placeholder="e.g., Web" value={platform} onChange={e => setPlatform(e.target.value)} disabled={isCreatingInClickUp}/>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Package</label>
                        <Input placeholder="e.g., Auth" value={packageName} onChange={e => setPackageName(e.target.value)} disabled={isCreatingInClickUp}/>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Feature</label>
                        <Input placeholder="e.g., Login" value={featureMenu} onChange={e => setFeatureMenu(e.target.value)} disabled={isCreatingInClickUp}/>
                      </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 mt-4">
                  <Button onClick={handleCreateInClickUp} disabled={isCreatingInClickUp || !clickUpToken || !clickUpListId || !appsScriptUrl} className="flex-1">
                      {isCreatingInClickUp ? 'Creating Tasks...' : 'Create Tasks in ClickUp'}
                  </Button>
                </div>
              </div>
            )}
            
            <div className="flex-grow">
                {!isLoading && testCases.length > 0 && (
                <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-2">
                    {testCases.map((tc, index) => (
                      <TestCaseCard
                        key={index}
                        testCase={tc}
                        result={clickUpResults[index]}
                        index={index}
                        onUpdate={handleTestCaseUpdate}
                      />
                    ))}
                </div>
                )}

                {!isLoading && testCases.length === 0 && (
                    <div className="flex items-center justify-center h-full text-slate-500 rounded-lg border-2 border-dashed border-slate-700">
                        <p>Generated test cases will appear here.</p>
                    </div>
                )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
