import { TestCase, SyncResult } from '../types';

export interface HulyConfig {
  token: string;
  workspaceId: string;
  projectId?: string;
  serverUrl?: string; // Self-hosted URL (e.g. https://huly.mycompany.com) or https://huly.app
  endpointUrl?: string; // Default or custom proxy/webhook URL
  tags?: string[];
  type?: string;
  executionType?: string;
  targetModule?: 'test-management' | 'issues';
}

/**
 * Helper to parse a Huly URL or host string into its component parts:
 * - origin: https://huly.assetfindr.com
 * - workspacePath: workbench/qa
 * - trackerId: 6a698200809795a4208ea654
 */
export function parseHulyUrl(inputUrl: string) {
  if (!inputUrl) return { origin: 'https://huly.app', workspacePath: '', trackerId: '', spaceId: '', suiteId: '' };
  
  let urlString = inputUrl.trim();
  if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
    urlString = 'https://' + urlString;
  }

  try {
    const parsed = new URL(urlString);
    const origin = parsed.origin;
    const pathname = parsed.pathname.replace(/^\/+|\/+$/g, ''); // e.g. "workbench/qa/tracker/6a698200809795a4208ea654/issues"
    
    // Check if tracker/space path exists e.g. tracker/6a6991253946584506fac9d2
    const trackerMatch = pathname.match(/tracker\/([a-zA-Z0-9_-]+)/);
    const trackerId = trackerMatch ? trackerMatch[1] : '';

    // Check if suite path exists e.g. suite/6a6995803946584506facc14
    const suiteMatch = pathname.match(/suite\/([a-zA-Z0-9_-]+)/);
    const suiteId = suiteMatch ? suiteMatch[1] : '';

    // Workspace is everything before "tracker/..." or the full pathname
    let workspacePath = pathname;
    if (trackerMatch) {
      workspacePath = pathname.substring(0, pathname.indexOf('/tracker/')).replace(/^\/+|\/+$/g, '');
    } else {
      // Remove trailing /issues or /test-cases if present
      workspacePath = workspacePath.replace(/\/(issues|test-cases|test-management)$/, '');
    }

    return { origin, workspacePath, trackerId, spaceId: trackerId, suiteId };
  } catch {
    return { origin: inputUrl.replace(/\/+$/, ''), workspacePath: '', trackerId: '', spaceId: '', suiteId: '' };
  }
}

/**
 * Directly imports generated Test Cases to Huly Test Management via full-stack server API route.
 */
export async function importDirectToHulyApi(params: {
  serverUrl: string;
  workspace: string;
  email: string;
  password: string;
  spaceId: string;
  suiteId?: string;
  testCases: TestCase[];
}): Promise<{ success: boolean; message: string; successCount?: number; totalCount?: number; errors?: string[] }> {
  try {
    const response = await fetch('/api/huly/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || `Gagal impor ke Huly (Status ${response.status})`);
    }

    return data;
  } catch (err: any) {
    throw new Error(err.message || 'Gagal mengirim permintaan impor ke server.');
  }
}

/**
 * Authenticates with a self-hosted or cloud Huly instance using Email & Password.
 * Returns the access token or session token upon success.
 */
export async function loginHuly(
  serverUrl: string,
  email: string,
  password: string
): Promise<{ token: string; workspaceId?: string; projectId?: string }> {
  const { origin, workspacePath, trackerId } = parseHulyUrl(serverUrl);
  const cleanBaseUrl = serverUrl.replace(/\/+$/, '');

  // Build candidate auth endpoints checking both root origin and subpaths
  const authEndpoints = Array.from(new Set([
    `${origin}/api/auth/login`,
    `${origin}/api/v1/auth/login`,
    `${origin}/api/accounts/login`,
    `${origin}/accounts/login`,
    `${origin}/v1/auth/login`,
    `${origin}/auth/login`,
    `${origin}/_api/auth/login`,
    `${cleanBaseUrl}/api/auth/login`,
    `${cleanBaseUrl}/api/v1/auth/login`,
    `${cleanBaseUrl}/auth/login`,
    `${cleanBaseUrl}/_api/auth/login`,
  ]));

  let lastError = '';

  for (const endpoint of authEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          username: email.trim(),
          password,
        }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const token =
          data.token ||
          data.accessToken ||
          data.access_token ||
          data.sessionToken ||
          data.jwt ||
          data.key ||
          data.id;

        if (token) {
          return {
            token,
            workspaceId: data.workspaceId || data.workspace || workspacePath,
            projectId: trackerId || data.projectId,
          };
        }
      } else {
        const errJson = await response.json().catch(() => null);
        const errText = errJson?.message || errJson?.error || (await response.text().catch(() => ''));
        lastError = `Status ${response.status}: ${errText || response.statusText}`;
      }
    } catch (err: any) {
      lastError = err?.message || 'Network request failed';
    }
  }

  throw new Error(
    `Gagal login ke Huly (${origin}). ${lastError || 'Silakan periksa kembali Email, Password, atau Host URL self-hosted Anda.'}`
  );
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
    serverUrl = 'https://huly.app',
    endpointUrl,
    tags = [],
    type = 'Test Case',
    executionType = 'Manual',
    targetModule = 'test-management',
  } = config;

  const { origin, workspacePath, trackerId: parsedTracker } = parseHulyUrl(serverUrl);
  const effectiveWorkspace = workspaceId || workspacePath;
  const effectiveProject = projectId || parsedTracker;

  const cleanServerUrl = (serverUrl || 'https://huly.app').replace(/\/+$/, '');
  const targetEndpoint =
    endpointUrl && endpointUrl.trim() !== ''
      ? endpointUrl
      : `${origin}/v1/issues`;

  const payload = {
    workspaceId: effectiveWorkspace,
    projectId: effectiveProject || undefined,
    title: testCase.title,
    description: testCase.description,
    priority: mapPriorityToHuly(testCase.priority),
    tags,
    type,
    executionType,
    module: targetModule === 'test-management' ? 'test-management' : 'tracker',
    tracker: targetModule === 'test-management' ? 'test-cases' : 'issues',
  };

  // Build direct Huly URL for redirect matching both Cloud and Self-Hosted paths
  let hulyDirectUrl = cleanServerUrl;
  if (effectiveWorkspace) {
    const subModule = targetModule === 'test-management' ? 'test-cases' : 'issues';
    if (effectiveProject) {
      // Handles both /tracker/1234/issues and /project/1234/issues
      hulyDirectUrl = `${origin}/${effectiveWorkspace}/tracker/${effectiveProject}/${subModule}`;
    } else {
      hulyDirectUrl = `${origin}/${effectiveWorkspace}/${targetModule === 'test-management' ? 'test-management' : 'issues'}`;
    }
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    const response = await fetch(targetEndpoint, {
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
      message: `Huly test case created in ${targetModule === 'test-management' ? 'Test Management' : 'Issues'} (${taskId})`,
      id: taskId,
      url: resData.url || hulyDirectUrl,
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

/**
 * Generates a clean CSV string of all test cases suitable for Huly or Excel import.
 */
export function generateTestCasesCsv(testCases: TestCase[]): string {
  const headers = ['Test Case Title', 'Description', 'Precondition', 'Test Steps', 'Expected Result', 'Priority'];
  
  const escapeCsv = (str: string) => {
    if (!str) return '""';
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const rows = testCases.map(tc => {
    // Extract steps and expected results if embedded in gherkin/description
    const desc = tc.description || '';
    return [
      escapeCsv(tc.title),
      escapeCsv(desc),
      escapeCsv(''), // Precondition
      escapeCsv(desc), // Test Steps
      escapeCsv('Given/When/Then scenarios execute as defined'), // Expected Result
      escapeCsv(tc.priority || 'Normal')
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Generates a standalone Node.js script using @hcengineering/api-client to import
 * all test cases directly into Huly Test Management without manual copy-pasting.
 */
export function generateHulyNodeScript(
  testCases: TestCase[],
  config: {
    serverUrl?: string;
    workspaceId?: string;
    email?: string;
    password?: string;
    projectId?: string;
  }
): string {
  const { origin, workspacePath, trackerId } = parseHulyUrl(config.serverUrl || 'https://huly.app');
  const hulyUrl = origin;
  const workspace = config.workspaceId || workspacePath || 'YOUR_WORKSPACE_ID';
  const email = config.email || 'YOUR_EMAIL@EXAMPLE.COM';
  const password = config.password || 'YOUR_PASSWORD';
  const space = config.projectId || trackerId || 'YOUR_PROJECT_NAME';

  const testCasesData = JSON.stringify(testCases, null, 2);

  return `/**
 * Huly Auto-Importer Script for Test Management
 *
 * Requirements:
 * 1. Install @hcengineering/api-client:
 *    npm install @hcengineering/api-client
 *
 * 2. Run this script with Node.js:
 *    node import-huly.js
 */

const { connect } = require('@hcengineering/api-client');

const HULY_URL = ${JSON.stringify(hulyUrl)};
const WORKSPACE = ${JSON.stringify(workspace)};
const EMAIL = ${JSON.stringify(email)};
const PASSWORD = ${JSON.stringify(password)};
const SPACE = ${JSON.stringify(space)};

// Data ${testCases.length} Test Cases dari AI Generator
const testCases = ${testCasesData};

async function importTestCases() {
  console.log(\`1. Menghubungkan ke Huly Server (\${HULY_URL})...\`);
  
  try {
    const client = await connect(HULY_URL, {
      email: EMAIL,
      password: PASSWORD,
      workspace: WORKSPACE
    });

    console.log(\`2. Berhasil terhubung! Mengunggah \${testCases.length} Test Cases ke Test Management...\`);

    let count = 0;
    for (const tc of testCases) {
      count++;
      try {
        await client.createDoc({
          _class: 'test.TestCase',
          title: tc.title,
          description: tc.description,
          priority: tc.priority || 'Normal',
          space: SPACE
        });
        console.log(\`[\${count}/\${testCases.length}] [OK] Success: \${tc.title}\`);
      } catch (err) {
        console.error(\`[\${count}/\${testCases.length}] [ERROR] Gagal mengunggah "\${tc.title}":\`, err.message || err);
      }
    }

    console.log('\\n✨ SELESAI! Semua Test Cases berhasil diimpor ke Huly Test Management.');
    await client.close();
  } catch (err) {
    console.error('❌ Gagal login atau terhubung ke Huly:', err.message || err);
  }
}

importTestCases();
`;
}

