
import { GoogleGenAI, Type } from "@google/genai";
import { TestCase, AutomationCode, Attachment } from "../types";

const testCaseSchema = {
  type: Type.OBJECT,
  properties: {
    test_cases: {
      type: Type.ARRAY,
      description: 'An array of test case objects.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'A concise, descriptive title for the test case. Do NOT add any prefix like "TC-XXX".'
          },
          description: {
            type: Type.STRING,
            description: "The full test case in Gherkin format. IMPORTANT: You MUST use an explicit newline character ('\\n') to separate each keyword (Feature, Scenario, Given, When, Then, And). CRITICAL: Do NOT include colons (:) after the keywords. For example: 'Feature ...\\nScenario ...\\nGiven a user...\\nWhen the user...\\nThen the user...'.",
          },
          priority: {
            type: Type.STRING,
            description: 'The priority of the test case. Must be one of: "Urgent", "High", "Medium", "Low".',
          },
        },
        required: ['title', 'description', 'priority'],
      },
    },
  },
  required: ['test_cases'],
};

export async function generateTestCases(
    featureDescription: string, 
    apiKey: string,
    attachments: Attachment[]
): Promise<TestCase[]> {
  if (!apiKey) {
    throw new Error("Google Gemini API Key was not provided. Please enter it in the input field.");
  }
  
  const ai = new GoogleGenAI({ apiKey: apiKey });

  const contentParts: any[] = [];

  const instructions = "Generate a comprehensive set of test cases for the following feature, using Gherkin syntax. Analyze the provided text and/or attached files (e.g., mockup images, screenshots, or requirements docs). Consider all provided images to understand the flow.";

  if (featureDescription) {
    contentParts.push({ text: `${instructions}\n\nFeature Description:\n${featureDescription}`});
  } else {
    contentParts.push({ text: instructions });
  }

  // Add all attachments to the prompt
  if (attachments && attachments.length > 0) {
    attachments.forEach(att => {
      contentParts.push({
          inlineData: {
              mimeType: att.mimeType,
              data: att.data,
          }
      });
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: contentParts },
    config: {
      systemInstruction: "You are an expert QA engineer specializing in writing clear, concise, and comprehensive test cases in Gherkin format. Your goal is to generate a list of test cases based on a user's feature description and any attached files. Respond ONLY with the JSON object defined in the schema, adhering strictly to the format and constraints.",
      responseMimeType: 'application/json',
      responseSchema: testCaseSchema,
    },
  });

  try {
    const jsonString = response.text.trim();
    const parsed = JSON.parse(jsonString);
    if (parsed.test_cases && Array.isArray(parsed.test_cases)) {
        return parsed.test_cases.filter((tc: any) => tc.title && tc.description && tc.priority);
    }
    throw new Error("Invalid JSON structure received from API.");
  } catch (error) {
    console.error("Failed to parse Gemini response:", response.text);
    throw new Error("Could not parse the generated test cases. The API might have returned an unexpected format.");
  }
}

export async function generateAutomationCode(
    gherkinScenarios: string,
    apiKey: string,
    context: { pageObject: string; stepDefinition: string; helper: string; }
): Promise<AutomationCode> {
    if (!apiKey) {
        throw new Error("Google Gemini API Key was not provided. Please enter it in the input field.");
    }
    
    const ai = new GoogleGenAI({ apiKey: apiKey });

    const prompt = `
**GHERKIN SCENARIOS:**
${gherkinScenarios}

---

**EXAMPLE PAGE OBJECT CODE:**
${context.pageObject || '// No example provided.'}

---

**EXAMPLE STEP DEFINITION CODE:**
${context.stepDefinition || '// No example provided.'}

---

**INSTRUCTIONS:**
Generate Playwright automation code matching these patterns.
    `;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: { parts: [{ text: prompt }] },
        config: {
          systemInstruction: "You are an expert Senior Automation Engineer. Respond in JSON with page_object_code and step_definition_code.",
          responseMimeType: "application/json",
        },
    });

    return JSON.parse(response.text);
}
