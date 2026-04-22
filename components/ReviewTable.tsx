
import React from 'react';
import { TestCase } from '../types';
import * as XLSX from 'xlsx';

interface ReviewTableProps {
  testCases: TestCase[];
  platform: string;
  packageName: string;
  featureMenu: string;
  clickUpTag: string;
  onUpdate: (index: number, updated: TestCase) => void;
}

const ReviewTable: React.FC<ReviewTableProps> = ({ 
  testCases, 
  platform, 
  packageName, 
  featureMenu, 
  clickUpTag,
  onUpdate 
}) => {
  
  const handleExport = () => {
    const data = testCases.map(tc => ({
      'Task Name': `[${platform || 'N/A'}][${packageName || 'N/A'}][${featureMenu || 'N/A'}] ${tc.title}`,
      'Description': tc.description,
      'Priority': tc.priority,
      'Tags': clickUpTag || 'N/A',
      'Package': packageName || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Cases');
    
    // Setting column widths for better readability
    const wscols = [
      { wch: 50 }, // Task Name
      { wch: 80 }, // Description
      { wch: 15 }, // Priority
      { wch: 15 }, // Tags
      { wch: 20 }, // Package
    ];
    worksheet['!cols'] = wscols;

    XLSX.writeFile(workbook, `TestCases_${featureMenu || 'Review'}_${new Date().getTime()}.xlsx`);
  };

  const handleEdit = (index: number, field: keyof TestCase, value: string) => {
    const updated = { ...testCases[index], [field]: value };
    onUpdate(index, updated);
  };

  if (testCases.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-500/20"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export to Excel
        </button>
      </div>
      
      <div className="overflow-x-auto border border-slate-700 rounded-xl bg-slate-900/50">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-slate-800/50 text-slate-400 text-xs font-bold uppercase tracking-wider">
              <th className="px-4 py-3 border-b border-slate-700 w-1/4">Task Name</th>
              <th className="px-4 py-3 border-b border-slate-700 w-2/5">Description</th>
              <th className="px-4 py-3 border-b border-slate-700">Priority</th>
              <th className="px-4 py-3 border-b border-slate-700">Tags</th>
              <th className="px-4 py-3 border-b border-slate-700">Package</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-slate-800">
            {testCases.map((tc, idx) => (
              <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-4 align-top">
                  <input
                    className="bg-transparent border-none focus:ring-0 w-full text-gray-200 outline-none hover:bg-slate-700/30 p-1 rounded"
                    value={tc.title}
                    onChange={(e) => handleEdit(idx, 'title', e.target.value)}
                  />
                  <div className="text-[10px] text-slate-500 mt-1">
                    Full: [{platform || 'N/A'}][{packageName || 'N/A'}][{featureMenu || 'N/A'}] {tc.title}
                  </div>
                </td>
                <td className="px-4 py-4 align-top">
                  <textarea
                    className="bg-transparent border-none focus:ring-0 w-full text-gray-400 outline-none hover:bg-slate-700/30 p-1 rounded text-xs min-h-[100px] resize-y"
                    value={tc.description}
                    onChange={(e) => handleEdit(idx, 'description', e.target.value)}
                  />
                </td>
                <td className="px-4 py-4 align-top">
                  <select
                    className="bg-slate-800/50 border border-slate-700 rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-indigo-500"
                    value={tc.priority}
                    onChange={(e) => handleEdit(idx, 'priority', e.target.value as any)}
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </td>
                <td className="px-4 py-4 align-top">
                   <div className="px-2 py-1 bg-slate-800 text-slate-400 rounded text-[10px] inline-block">
                     {clickUpTag || 'N/A'}
                   </div>
                </td>
                <td className="px-4 py-4 align-top text-slate-400 text-xs">
                  {packageName || 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReviewTable;
