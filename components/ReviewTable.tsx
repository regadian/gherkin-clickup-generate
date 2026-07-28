import React, { useState } from 'react';
import { TestCase } from '../types';
import * as XLSX from 'xlsx';

interface ReviewTableProps {
  testCases: TestCase[];
  platform: string;
  packageName: string;
  featureMenu: string;
  clickUpTag: string;
  onUpdate: (index: number, updated: TestCase) => void;
  onSetTestCases?: (testCases: TestCase[]) => void;
  onAddTestCase?: () => void;
  onDeleteTestCase?: (index: number) => void;
}

/**
 * Helper to normalize literal '\n' string sequences into real linebreaks
 */
export function normalizeNewlines(val: string): string {
  if (!val) return '';
  return val.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}

/**
 * Format string for TSV / Excel paste.
 * Quotes multiline values and escapes internal quotes.
 */
function formatTSVField(val: string): string {
  if (!val) return '';
  const cleanVal = normalizeNewlines(val);
  if (cleanVal.includes('\n') || cleanVal.includes('\r') || cleanVal.includes('\t') || cleanVal.includes('"')) {
    return `"${cleanVal.replace(/"/g, '""')}"`;
  }
  return cleanVal;
}

/**
 * Parse TSV text copied from Excel or Google Sheets.
 */
function parseTSVFromExcel(tsvText: string): TestCase[] {
  if (!tsvText.trim()) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < tsvText.length; i++) {
    const char = tsvText[i];
    const nextChar = tsvText[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === '\t') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++; // skip \n
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];

  // Determine if row 0 is header
  let startIdx = 0;
  const firstRowLower = rows[0].map(c => c.toLowerCase());
  if (
    firstRowLower.some(
      c => c.includes('task name') || c.includes('title') || c.includes('description') || c.includes('priority')
    )
  ) {
    startIdx = 1;
  }

  const parsedCases: TestCase[] = [];
  for (let r = startIdx; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0 || (row.length === 1 && !row[0])) continue;

    // Col 0: Task Name
    let title = row[0] || 'New Test Case';
    // Remove prefixed tags if present e.g. [Web][Auth][Menu]
    title = title.replace(/^(\[[^\]]+\]\s*)+/, '').trim() || title;

    // Col 1: Description (normalize literal \n)
    const description = normalizeNewlines(row[1] || '');

    // Col 2: Priority
    const priorityStr = (row[2] || 'Medium').toLowerCase();
    let priority: TestCase['priority'] = 'Medium';
    if (priorityStr.includes('urgent')) priority = 'Urgent';
    else if (priorityStr.includes('high')) priority = 'High';
    else if (priorityStr.includes('low')) priority = 'Low';
    else priority = 'Medium';

    parsedCases.push({
      title,
      description,
      priority,
    });
  }

  return parsedCases;
}

const ReviewTable: React.FC<ReviewTableProps> = ({
  testCases,
  platform,
  packageName,
  featureMenu,
  clickUpTag,
  onUpdate,
  onSetTestCases,
  onAddTestCase,
  onDeleteTestCase,
}) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [copiedRowIndex, setCopiedRowIndex] = useState<number | null>(null);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Export to .xlsx file
  const handleExportExcel = () => {
    const data = testCases.map(tc => ({
      'Task Name': `[${platform || 'N/A'}][${packageName || 'N/A'}][${featureMenu || 'N/A'}] ${tc.title}`,
      'Description': normalizeNewlines(tc.description),
      'Priority': tc.priority,
      'Tags': clickUpTag || 'N/A',
      'Package': packageName || 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Cases');

    worksheet['!cols'] = [
      { wch: 50 },
      { wch: 80 },
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
    ];

    XLSX.writeFile(workbook, `TestCases_${featureMenu || 'Review'}_${new Date().getTime()}.xlsx`);
    showNotification('Excel file downloaded successfully!');
  };

  const handleAutoCleanLinebreaks = () => {
    if (onSetTestCases) {
      const cleaned = testCases.map(tc => ({
        ...tc,
        description: normalizeNewlines(tc.description),
      }));
      onSetTestCases(cleaned);
      showNotification('Automated linebreaks fixed! Descriptions formatted into clean multi-line text.');
    }
  };

  // Copy whole table formatted for Excel (TSV)
  const handleCopyTableTSV = async () => {
    const headers = ['Task Name', 'Description', 'Priority', 'Tags', 'Package'];
    const rows = testCases.map(tc => {
      const fullTaskName = `[${platform || 'N/A'}][${packageName || 'N/A'}][${featureMenu || 'N/A'}] ${tc.title}`;
      return [
        formatTSVField(fullTaskName),
        formatTSVField(tc.description),
        formatTSVField(tc.priority),
        formatTSVField(clickUpTag || 'N/A'),
        formatTSVField(packageName || 'N/A'),
      ].join('\t');
    });

    const tsvContent = [headers.join('\t'), ...rows].join('\n');

    try {
      await navigator.clipboard.writeText(tsvContent);
      showNotification('Table copied to clipboard! Paste directly into Excel (Ctrl+V)');
    } catch {
      showNotification('Failed to copy. Please try again.');
    }
  };

  // Copy single row for Excel
  const handleCopyRowTSV = async (idx: number) => {
    const tc = testCases[idx];
    const fullTaskName = `[${platform || 'N/A'}][${packageName || 'N/A'}][${featureMenu || 'N/A'}] ${tc.title}`;
    const rowTSV = [
      formatTSVField(fullTaskName),
      formatTSVField(tc.description),
      formatTSVField(tc.priority),
      formatTSVField(clickUpTag || 'N/A'),
      formatTSVField(packageName || 'N/A'),
    ].join('\t');

    try {
      await navigator.clipboard.writeText(rowTSV);
      setCopiedRowIndex(idx);
      setTimeout(() => setCopiedRowIndex(null), 2000);
      showNotification(`Row #${idx + 1} copied for Excel!`);
    } catch {
      showNotification('Failed to copy row.');
    }
  };

  const handleEdit = (index: number, field: keyof TestCase, value: string) => {
    const cleanValue = field === 'description' ? normalizeNewlines(value) : value;
    const updated = { ...testCases[index], [field]: cleanValue };
    onUpdate(index, updated);
  };

  const handleProcessPastedData = (mode: 'replace' | 'append') => {
    const parsed = parseTSVFromExcel(pastedText);
    if (parsed.length === 0) {
      showNotification('No valid test cases found in pasted data.');
      return;
    }

    if (mode === 'replace' && onSetTestCases) {
      onSetTestCases(parsed);
      showNotification(`Replaced with ${parsed.length} test cases from Excel!`);
    } else if (mode === 'append' && onSetTestCases) {
      onSetTestCases([...testCases, ...parsed]);
      showNotification(`Added ${parsed.length} new test cases from Excel!`);
    }

    setPastedText('');
    setShowPasteModal(false);
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-2 border border-emerald-400 animate-bounce">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/80 p-3 rounded-lg border border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">
            Total: <strong className="text-indigo-400">{testCases.length}</strong> Test Cases
          </span>
          {onAddTestCase && (
            <button
              onClick={onAddTestCase}
              className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-medium transition-colors flex items-center gap-1 border border-slate-600"
              title="Add a blank row"
            >
              + Add Row
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Clean Linebreaks */}
          <button
            onClick={handleAutoCleanLinebreaks}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/80 hover:bg-amber-500 text-white rounded-md text-xs font-semibold transition-colors shadow-md shadow-amber-600/20"
            title="Convert literal \\n into clean multi-line text for Excel & Google Sheets"
          >
            <span>🧹</span>
            Format Linebreaks
          </button>

          {/* Copy Table TSV for Excel */}
          <button
            onClick={handleCopyTableTSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-semibold transition-colors shadow-md shadow-indigo-600/20"
            title="Copy entire table to clipboard for pasting directly into Excel or Google Sheets"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy Table for Excel
          </button>

          {/* Paste from Excel */}
          <button
            onClick={() => setShowPasteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md text-xs font-semibold transition-colors border border-slate-600"
            title="Paste cells copied from Excel or Google Sheets"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Paste from Excel
          </button>

          {/* Export to Excel File */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold transition-colors shadow-md shadow-emerald-600/20"
            title="Download .xlsx file"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export .XLSX
          </button>
        </div>
      </div>

      {/* Main Table */}
      {testCases.length === 0 ? (
        <div className="p-8 text-center text-slate-500 border border-slate-800 rounded-xl bg-slate-900/40 space-y-3">
          <p className="text-sm">No test cases to display in Table Mode.</p>
          <button
            onClick={() => setShowPasteModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
          >
            Paste Rows from Excel
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-700 rounded-xl bg-slate-900/60 shadow-inner">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-800/80 text-slate-400 text-xs font-bold uppercase tracking-wider select-none">
                <th className="px-3 py-3 border-b border-slate-700 w-12 text-center">#</th>
                <th className="px-4 py-3 border-b border-slate-700 w-1/4">Task Name</th>
                <th className="px-4 py-3 border-b border-slate-700 w-2/5">Description</th>
                <th className="px-4 py-3 border-b border-slate-700 w-32">Priority</th>
                <th className="px-4 py-3 border-b border-slate-700 w-28">Tags</th>
                <th className="px-4 py-3 border-b border-slate-700 w-28">Package</th>
                <th className="px-3 py-3 border-b border-slate-700 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-800">
              {testCases.map((tc, idx) => (
                <tr key={idx} className="hover:bg-slate-800/50 transition-colors group">
                  {/* Row Number */}
                  <td className="px-3 py-4 align-top text-center text-xs text-slate-500 font-mono">
                    {idx + 1}
                  </td>

                  {/* Task Name */}
                  <td className="px-4 py-4 align-top">
                    <input
                      className="bg-transparent border border-transparent focus:border-indigo-500 focus:bg-slate-950/80 w-full text-gray-200 outline-none p-1.5 rounded transition-all font-semibold"
                      value={tc.title}
                      onChange={(e) => handleEdit(idx, 'title', e.target.value)}
                      placeholder="Task Title"
                    />
                    <div className="text-[10px] text-slate-500 mt-1 font-mono truncate max-w-[280px]">
                      Prefix: [{platform || 'N/A'}][{packageName || 'N/A'}][{featureMenu || 'N/A'}]
                    </div>
                  </td>

                  {/* Description */}
                  <td className="px-4 py-4 align-top">
                    <textarea
                      className="bg-transparent border border-transparent focus:border-indigo-500 focus:bg-slate-950/80 w-full text-gray-300 outline-none p-1.5 rounded text-xs min-h-[90px] font-mono resize-y leading-relaxed transition-all"
                      value={normalizeNewlines(tc.description)}
                      onChange={(e) => handleEdit(idx, 'description', e.target.value)}
                      placeholder="Gherkin scenario steps..."
                    />
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-4 align-top">
                    <select
                      className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-gray-200 outline-none focus:border-indigo-500 font-medium"
                      value={tc.priority}
                      onChange={(e) => handleEdit(idx, 'priority', e.target.value as any)}
                    >
                      <option value="Urgent">🔴 Urgent</option>
                      <option value="High">🟠 High</option>
                      <option value="Medium">🟡 Medium</option>
                      <option value="Low">🔵 Low</option>
                    </select>
                  </td>

                  {/* Tags */}
                  <td className="px-4 py-4 align-top">
                    <span className="px-2 py-1 bg-slate-800/90 text-slate-300 rounded text-[11px] font-mono inline-block border border-slate-700">
                      {clickUpTag || 'N/A'}
                    </span>
                  </td>

                  {/* Package */}
                  <td className="px-4 py-4 align-top text-slate-300 text-xs font-mono">
                    {packageName || 'N/A'}
                  </td>

                  {/* Row Actions */}
                  <td className="px-3 py-4 align-top text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Copy Single Row for Excel */}
                      <button
                        onClick={() => handleCopyRowTSV(idx)}
                        className={`p-1.5 rounded text-xs transition-colors ${
                          copiedRowIndex === idx
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                        title="Copy this row for Excel"
                      >
                        {copiedRowIndex === idx ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>

                      {/* Delete Row */}
                      {onDeleteTestCase && (
                        <button
                          onClick={() => onDeleteTestCase(idx)}
                          className="p-1.5 bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded text-xs transition-colors"
                          title="Delete test case"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Paste Table Data from Excel
              </h3>
              <button
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-white text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Copy rows from Excel or Google Sheets (columns: <strong>Task Name</strong>, <strong>Description</strong>, <strong>Priority</strong>) and paste them in the box below:
            </p>

            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={`Task Name\tDescription\tPriority\nLogin Valid\tGiven user on login page...\tHigh`}
              rows={8}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono outline-none focus:border-indigo-500"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleProcessPastedData('append')}
                disabled={!pastedText.trim()}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-xs font-semibold disabled:opacity-50"
              >
                + Append Rows
              </button>
              <button
                onClick={() => handleProcessPastedData('replace')}
                disabled={!pastedText.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-semibold disabled:opacity-50"
              >
                Replace Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewTable;
