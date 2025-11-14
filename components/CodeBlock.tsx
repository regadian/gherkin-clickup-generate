import React, { useState } from 'react';
import { ClipboardIcon } from './icons/ClipboardIcon';
import { CheckIconSmall } from './icons/CheckIconSmall';

interface CodeBlockProps {
  code: string;
  language?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = 'javascript' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative bg-slate-950 rounded-md group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 bg-slate-700 text-slate-300 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-200 hover:bg-slate-600"
        aria-label="Copy code to clipboard"
      >
        {copied ? (
          <CheckIconSmall className="w-5 h-5 text-green-400" />
        ) : (
          <ClipboardIcon className="w-5 h-5" />
        )}
      </button>
      <pre className="p-4 text-sm text-slate-300 overflow-x-auto">
        <code className={`language-${language}`}>
          {code}
        </code>
      </pre>
    </div>
  );
};

export default CodeBlock;
