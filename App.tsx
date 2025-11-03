import React, { useState, useCallback } from 'react';
import { TestCase, ClickUpResult } from './types';
import { generateTestCases } from './services/geminiService';
import { createClickUpTask } from './services/clickupService';
import TextArea from './components/TextArea';
import Input from './components/Input';
import Button from './components/Button';
import Loader from './components/Loader';
import TestCaseCard from './components/TestCaseCard';

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);

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

  const handleGenerate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt) {
      setError('Please fill in the feature description.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setTestCases([]);
    setClickUpResults([]);

    try {
      const generatedTestCases = await generateTestCases(prompt);
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
  }, [prompt]);

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
        return createClickUpTask(taskData, clickUpToken, clickUpListId, appsScriptUrl);
      })
    );
    
    setClickUpResults(results);
    setIsCreatingInClickUp(false);

    if (results.some(r => !r.success)) {
        const firstError = results.find(r => !r.success)?.message;
        setError(`Some tasks failed to create. Please check the details. First error: ${firstError}`);
    }
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
                  <label htmlFor="prompt" className="block text-sm font-medium text-slate-300 mb-2">
                    Feature Description
                  </label>
                  <TextArea
                    id="prompt"
                    placeholder='e.g., "Create test cases for a user login feature with Gherkin style"'
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isLoading}
                    rows={8}
                  />
                </div>
              </div>
              <div className="mt-8">
                <Button type="submit" disabled={isLoading || !prompt} className="w-full">
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
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                           <label htmlFor="platform" className="block text-xs font-medium text-slate-400 mb-1">Platform</label>
                           <Input id="platform" type="text" placeholder="e.g., Web" value={platform} onChange={e => setPlatform(e.target.value)} disabled={isCreatingInClickUp}/>
                        </div>
                        <div>
                           <label htmlFor="package" className="block text-xs font-medium text-slate-400 mb-1">Package</label>
                           <Input id="package" type="text" placeholder="e.g., Authentication" value={packageName} onChange={e => setPackageName(e.target.value)} disabled={isCreatingInClickUp}/>
                        </div>
                        <div>
                           <label htmlFor="feature-menu" className="block text-xs font-medium text-slate-400 mb-1">Feature/Menu</label>
                           <Input id="feature-menu" type="text" placeholder="e.g., Login" value={featureMenu} onChange={e => setFeatureMenu(e.target.value)} disabled={isCreatingInClickUp}/>
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
                      <TestCaseCard key={index} testCase={tc} result={clickUpResults[index]} />
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