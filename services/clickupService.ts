import { TestCase, ClickUpResult } from '../types';

function mapPriorityToClickUp(priority: string): number {
  switch (priority.toLowerCase()) {
    case 'urgent':
      return 1;
    case 'high':
      return 2;
    case 'medium':
      return 3;
    case 'low':
      return 4;
    default:
      return 3; // Default to Normal priority
  }
}

export async function createClickUpTask(
  testCase: TestCase, 
  token: string, 
  listId: string, 
  appsScriptUrl: string
): Promise<ClickUpResult> {

  const body = {
    token,
    listId,
    testCase: {
        name: testCase.title,
        description: testCase.description, // Removed the ```gherkin``` wrapper
        priority: mapPriorityToClickUp(testCase.priority),
    }
  };

  try {
    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // Required by Apps Script for POST
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Proxy Error: Failed to communicate with Google Apps Script (Status: ${response.status})`);
    }

    const result = await response.json();

    if (!result.success) {
        throw new Error(`ClickUp API Error via Proxy: ${result.message}`);
    }
    
    return {
      success: true,
      message: `Task created successfully with ID: ${result.clickUpId}`,
      clickUpId: result.clickUpId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    
    return {
      success: false,
      message: errorMessage,
    };
  }
}