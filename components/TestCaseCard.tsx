import React, { useState } from 'react';
import { TestCase, ClickUpResult } from '../types';
import { CheckIcon } from './icons/CheckIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import Input from './Input';
import TextArea from './TextArea';
import Select from './Select';
import { PencilIcon } from './icons/PencilIcon';
import { CheckIconSmall } from './icons/CheckIconSmall';
import GherkinViewer from './GherkinViewer';

interface TestCaseCardProps {
  testCase: TestCase;
  result?: ClickUpResult;
  index: number;
  onUpdate: (index: number, updatedTestCase: TestCase) => void;
}

const TestCaseCard: React.FC<TestCaseCardProps> = ({ testCase, result, index, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  
  const getStatusIndicator = () => {
    if (!result) return null;

    if (result.success) {
      return (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <CheckIcon className="w-5 h-5 flex-shrink-0" />
          <span>Success: Task created (ID: {result.clickUpId})</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <XCircleIcon className="w-5 h-5 flex-shrink-0" />
          <span className="truncate" title={result.message}>Error: {result.message}</span>
        </div>
      );
    }
  };

  return (
    <div className={`bg-slate-900/70 p-4 rounded-lg border ${result ? (result.success ? 'border-green-600/50' : 'border-red-600/50') : 'border-slate-700'} transition-all`}>
      <div className="flex justify-between items-start gap-4">
        <Input
            value={testCase.title}
            onChange={(e) => onUpdate(index, { ...testCase, title: e.target.value })}
            className="font-bold text-lg text-slate-100 !bg-transparent border-0 focus:!ring-0 p-0 flex-grow"
            aria-label="Test Case Title"
        />
        <Select
          className="flex-shrink-0 bg-slate-700 text-slate-300 text-xs font-semibold px-2.5 py-1 rounded-full capitalize border-slate-600 w-auto"
          value={testCase.priority}
          onChange={(e) => onUpdate(index, { ...testCase, priority: e.target.value as TestCase['priority'] })}
          aria-label="Test Case Priority"
        >
          <option value="Urgent">Urgent</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </Select>
      </div>
      
      {isEditing ? (
        <TextArea
          className="mt-3 bg-slate-950 p-3 rounded-md text-slate-300 text-sm whitespace-pre-wrap font-mono w-full"
          value={testCase.description}
          onChange={(e) => onUpdate(index, { ...testCase, description: e.target.value })}
          rows={10}
          aria-label="Test Case Description"
          autoFocus
        />
      ) : (
        <GherkinViewer gherkinText={testCase.description} />
      )}

      <div className="mt-2 flex justify-between items-center min-h-[30px]">
          <div className="flex-grow pr-4">
              {getStatusIndicator()}
          </div>
          <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors text-sm"
              aria-label={isEditing ? 'Save changes' : 'Edit test case'}
          >
              {isEditing ? (
                  <>
                      <CheckIconSmall className="w-4 h-4" />
                      Save
                  </>
              ) : (
                  <>
                      <PencilIcon className="w-4 h-4" />
                      Edit
                  </>
              )}
          </button>
      </div>
    </div>
  );
};

export default TestCaseCard;
