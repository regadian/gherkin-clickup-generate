
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
            description: "The full test case in Gherkin format. IMPORTANT: You MUST use an explicit newline character ('\\n') to separate each keyword (Feature:, Scenario:, Given, When, Then, And).",
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

  const instructions = "Review the provided feature details and attachments. Generate optimized, non-redundant Gherkin test cases following the Senior QA Engineer guidelines.";

  if (featureDescription) {
    contentParts.push({ text: `${instructions}\n\nFeature Details:\n${featureDescription}`});
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
      systemInstruction: `Act as a Senior QA Engineer.

Generate Gherkin test cases based on the provided requirement.

Rules:
- Avoid redundant scenarios.
- Do not repeat identical Given or Preconditions unless necessary.
- Combine similar validations into Scenario Outline when applicable.
- Focus on meaningful business coverage, not duplicate UI actions.
- Use concise and professional QA language.
- Cover:
  - Positive scenarios
  - Negative scenarios
  - Validation scenarios
  - Edge cases
  - Permission/access cases (if relevant)
- Avoid over-detailing simple UI interactions.
- Prioritize maintainability and readability.
- Use clear tags when appropriate:
  @positive
  @negative
  @validation
  @permission
  @edgecase

Format:
Feature:
Background: (only if reusable)
Scenario:
Scenario Outline:

Output must:
- Be structured
- Be non-redundant
- Be optimized for automation readiness
- Follow best practices for scalable QA documentation

Additional Rules:
- Never create multiple scenarios with the same business objective.
- Merge repetitive flows into one scenario.
- Avoid testing the same validation in different wording.
- Prefer parameterization over duplicated scenarios.
- Each scenario must have unique coverage value.

Respond ONLY with a JSON object following the provided schema.`,
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
