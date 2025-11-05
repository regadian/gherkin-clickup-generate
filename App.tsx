
import React, { useState, useCallback, useRef } from 'react';
import { TestCase, ClickUpResult } from './types';
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
  const [attachment, setAttachment] = useState<{ name: string; data: string; mimeType: string } | null>(null);
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
  const [clickUpType, setClickUpType] = useState('Test Case'); // Default to 'Test Case'

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }
    processFile(file);
  };
  
  const processFile = (file: File) => {
    if (file.size > 4 * 1024 * 1024) { // ~4MB limit for Gemini Flash
      setError('File size cannot exceed 4MB.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      // result is a data URL: "data:image/jpeg;base64,...."
      const base64String = (reader.result as string).split(',')[1];
      setAttachment({
        name: file.name,
        data: base64String,
        mimeType: file.type,
      });
      setError(null); // Clear previous errors
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
    };
    reader.readAsDataURL(file);
  }

  const removeAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    let imageFile: File | null = null;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        imageFile = items[i].getAsFile();
        break;
      }
    }

    if (imageFile) {
      e.preventDefault(); // Prevent pasting file path or other text
      processFile(imageFile);
    }
    // If no image is found, do nothing and let the default text paste happen.
  };

  const handleGenerate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!prompt && !attachment) || !geminiApiKey) {
      setError('Please provide a feature description (text or file) and your Gemini API Key.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setTestCases([]);
    setClickUpResults([]);

    try {
      const generatedTestCases = await generateTestCases(prompt, geminiApiKey, attachment);
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
  }, [prompt, geminiApiKey, attachment]);

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
        setError(`Some tasks failed to create. Please check the details. First error: ${firstError}`);
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
            Generate Gherkin-style test cases and create them directly in ClickUp.
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
                    Get your key from Google AI Studio. It will not be stored.
                  </p>
                </div>
                 <div>
                  <label htmlFor="prompt" className="block text-sm font-medium text-slate-300 mb-2">
                    Feature Description
                  </label>
                  <TextArea
                    id="prompt"
                    placeholder='e.g., "Create test cases for a user login feature with Gherkin style". You can also attach a file or paste a screenshot directly into this area.'
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onPaste={handlePaste}
                    disabled={isLoading}
                    rows={6}
                  />
                </div>
                 <div>
                    <label htmlFor="file-upload" className="block text-sm font-medium text-slate-300 mb-2">
                      Attach File (Optional)
                    </label>
                    <div className="flex items-center gap-4">
                      <label htmlFor="file-upload" className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-2 px-4 rounded-md transition-colors duration-200 inline-block">
                          Choose File
                      </label>
                      <input
                          id="file-upload"
                          type="file"
                          ref={fileInputRef}
                          className="hidden"
                          onChange={handleFileChange}
                          accept="image/*,text/plain,.md"
                          disabled={isLoading}
                      />
                      {attachment && (
                        <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-900/50 py-1 px-3 rounded-full">
                            <span className="truncate max-w-xs">{attachment.name}</span>
                            <button
                                type="button"
                                onClick={removeAttachment}
                                className="text-red-500 hover:text-red-400 font-bold text-lg leading-none"
                                aria-label="Remove attached file"
                            >
                                &times;
                            </button>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                        Attach an image (mockup, screenshot) or a text file. Max 4MB.
                    </p>
                  </div>
              </div>
              <div className="mt-8">
                <Button type="submit" disabled={isLoading || (!prompt && !attachment) || !geminiApiKey} className="w-full">
                  {isLoading ? 'Generating...' : 'Generate Test Cases'}
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
                           <label htmlFor="platform" className="block text-xs font-medium text-slate-400 mb-1">Platform</label>
                           <Input id="platform" type="text" placeholder="e.g., Web" value={platform} onChange={e => setPlatform(e.target.value)} disabled={isCreatingInClickUp}/>
                        </div>
                        <div>
                           <label htmlFor="package" className="block text-xs font-medium text-slate-400 mb-1">Package (for Title)</label>
                           <Input id="package" type="text" placeholder="e.g., Authentication" value={packageName} onChange={e => setPackageName(e.target.value)} disabled={isCreatingInClickUp}/>
                        </div>
                        <div>
                           <label htmlFor="feature-menu" className="block text-xs font-medium text-slate-400 mb-1">Feature/Menu</label>
                           <Input id="feature-menu" type="text" placeholder="e.g., Login" value={featureMenu} onChange={e => setFeatureMenu(e.target.value)} disabled={isCreatingInClickUp}/>
                        </div>
                        <div>
                           <label htmlFor="clickup-tag" className="block text-xs font-medium text-slate-400 mb-1">Tag</label>
                            <Select id="clickup-tag" value={clickUpTag} onChange={e => setClickUpTag(e.target.value)} disabled={isCreatingInClickUp}>
                                <option value="">None</option>
                                <option value="To Automate">To Automate</option>
                                <option value="Manual">Manual</option>
                            </Select>
                        </div>
                        <div>
                            <label htmlFor="clickup-type" className="block text-xs font-medium text-slate-400 mb-1">Type (Custom Field)</label>
                            <Select id="clickup-type" value={clickUpType} onChange={e => setClickUpType(e.target.value)} disabled={isCreatingInClickUp}>
                                <option value="Test Case">Test Case</option>
                                <option value="Deprecated">Deprecated</option>
                            </Select>
                        </div>
                   </div>
                  <hr className="border-slate-700 my-4" />
                   <div>
                        <label htmlFor="app-script-url" className="block text-xs font-medium text-slate-400 mb-1">Google Apps Script Web App URL</label>
                        <Input id="app-script-url" type="url" placeholder="https://script.google.com/macros/s/..." value={appsScriptUrl} onChange={e => setAppsScriptUrl(e.target.value)} disabled={isCreatingInClickUp}/>
                   </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label htmlFor="clickup-token" className="block text-xs font-medium text-slate-400 mb-1">ClickUp API Token</label>
                        <Input id="clickup-token" type="password" placeholder="Your Personal API Token" value={clickUpToken} onChange={e => setClickUpToken(e.target.value)} disabled={isCreatingInClickUp}/>
                     </div>
                     <div>
                        <label htmlFor="clickup-list" className="block text-xs font-medium text-slate-400 mb-1">ClickUp List ID</label>
                        <Input id="clickup-list" type="text" placeholder="e.g., 9012345678" value={clickUpListId} onChange={e => setClickUpListId(e.target.value)} disabled={isCreatingInClickUp}/>
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