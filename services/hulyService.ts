import { TestCase, SyncResult } from '../types';

export interface HulyConfig {
  token: string;
  workspaceId: string;
  projectId?: string;
  endpointUrl?: string; // Default or custom proxy/webhook URL
  tags?: string[];
  type?: string;
  executionType?: string;
}

function mapPriorityToHuly(priority: string): string {
  switch (priority.toLowerCase()) {
    case 'urgent':
      return 'urgent';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

export async function createHulyTask(
  testCase: TestCase,
  config: HulyConfig
): Promise<SyncResult> {
  const {
    token,
    workspaceId,
    projectId,
    endpointUrl = 'https://api.huly.app/v1/issues',
    tags = [],
    type = 'Test Case',
    executionType = 'Manual',
  } = config;

  const payload = {
    workspaceId,
    projectId: projectId || undefined,
    title: testCase.title,
    description: testCase.description,
    priority: mapPriorityToHuly(testCase.priority),
    tags,
    type,
    executionType,
  };

  try {
    // Determine if user is using a custom proxy/webhook or direct API
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Huly API Error (Status ${response.status}): ${errText || response.statusText}`);
    }

    const resData = await response.json().catch(() => ({}));

    const taskId = resData.id || resData.issueId || resData.key || 'Created';

    return {
      success: true,
      message: `Huly task created successfully (${taskId})`,
      id: taskId,
      url: resData.url || (workspaceId ? `https://huly.app/workspace/${workspaceId}` : undefined),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create task in Huly';
    return {
      success: false,
      message: errorMessage,
    };
  }
}

/**
 * Generates markdown text formatted specifically for pasting or quick import into Huly.
 */
export function formatTestCasesForHulyMarkdown(
  testCases: TestCase[],
  meta: { platform?: string; packageName?: string; featureMenu?: string; tag?: string }
): string {
  const header = `# Test Cases for ${meta.featureMenu || 'Feature'}\n**Platform:** ${meta.platform || 'N/A'} | **Package:** ${meta.packageName || 'N/A'} | **Tag:** ${meta.tag || 'N/A'}\n\n---\n\n`;

  const body = testCases
    .map((tc, idx) => {
      return `### ${idx + 1}. [${meta.platform || 'N/A'}][${meta.packageName || 'N/A'}][${meta.featureMenu || 'N/A'}] ${tc.title}
**Priority:** ${tc.priority} | **Tag:** ${meta.tag || 'None'}

\`\`\`gherkin
${tc.description}
\`\`\`
`;
    })
    .join('\n---\n\n');

  return header + body;
}
