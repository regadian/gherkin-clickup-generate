import React from 'react';

interface GherkinViewerProps {
  gherkinText: string;
}

const GherkinViewer: React.FC<GherkinViewerProps> = ({ gherkinText }) => {
  if (!gherkinText) {
    return (
      <div className="mt-3 bg-slate-950 p-3 rounded-md text-slate-500 text-sm font-mono w-full min-h-[242px] flex items-center justify-center">
        No description provided.
      </div>
    );
  }

  const keywords = ['Feature', 'Background', 'Rule', 'Scenario Outline', 'Scenario', 'Given', 'When', 'Then', 'And', 'But', 'Examples'];
  const keywordRegex = new RegExp(`^\\s*(${keywords.join('|')})`, 'i');

  const lines = gherkinText.split('\\n');

  return (
    <div className="mt-3 bg-slate-950 p-3 rounded-md text-slate-300 text-sm whitespace-pre-wrap font-mono w-full min-h-[242px] overflow-auto">
        {lines.map((line, index) => {
            const trimmedLine = line.trim();
            const match = trimmedLine.match(keywordRegex);
            
            if (match) {
                const keyword = match[1];
                // Use original line to preserve indentation before the keyword
                const keywordIndex = line.toLowerCase().indexOf(keyword.toLowerCase());
                const indent = line.substring(0, keywordIndex);
                const restOfLine = line.substring(keywordIndex + keyword.length);
                
                return (
                    <div key={index}>
                        {indent}
                        <span className="text-cyan-400 font-semibold">{keyword}</span>
                        <span className="text-slate-300">{restOfLine}</span>
                    </div>
                );
            }
            // Handle table rows
            if (trimmedLine.startsWith('|')) {
              return <div key={index} className="text-amber-400">{line}</div>;
            }
            // Handle comments
            if (trimmedLine.startsWith('#')) {
              return <div key={index} className="text-slate-500">{line}</div>;
            }
            // Render other lines, preserving their original indentation
            return <div key={index}>{line}</div>;
        })}
    </div>
  );
};

export default GherkinViewer;
