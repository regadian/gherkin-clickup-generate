import React from 'react';
import { TestCase, ClickUpResult } from '../types';
import { CheckIcon } from './icons/CheckIcon';
import { XCircleIcon } from './icons/XCircleIcon';

interface TestCaseCardProps {
  testCase: TestCase;
  result?: ClickUpResult;
}

const TestCaseCard: React.FC<TestCaseCardProps> = ({ testCase, result }) => {
  const getStatusIndicator = () => {
    if (!result) return null;

    if (result.success) {
      return (
        <div className="flex items-center gap-2 text-green-400 text-sm mt-2">
          <CheckIcon className="w-5 h-5" />
          <span>Success: Task created (ID: {result.clickUpId})</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center gap-2 text-red-400 text-sm mt-2">
          <XCircleIcon className="w-5 h-5" />
          <span className="truncate" title={result.message}>Error: {result.message}</span>
        </div>
      );
    }
  };

  return (
    <div className={`bg-slate-900/70 p-4 rounded-lg border ${result ? (result.success ? 'border-green-600/50' : 'border-red-600/50') : 'border-slate-700'} transition-all`}>
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-lg text-slate-100 pr-4">{testCase.title}</h3>
        <span className="flex-shrink-0 bg-slate-700 text-slate-300 text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize">
          {testCase.priority.toLowerCase()}
        </span>
      </div>
      <pre className="mt-3 bg-slate-950 p-3 rounded-md text-slate-300 text-sm whitespace-pre-wrap font-mono overflow-x-auto">
        <code>{testCase.description}</code>
      </pre>
      {getStatusIndicator()}
    </div>
  );
};

export default TestCaseCard;