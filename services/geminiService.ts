
import { GoogleGenAI, Type } from "@google/genai";
import { TestCase, AutomationCode } from "../types";

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

const automationCodeSchema = {
    type: Type.OBJECT,
    properties: {
        page_object_code: {
            type: Type.STRING,
            description: "The complete JavaScript code for the Page Object file. It should include the class definition, locators, and methods based on the user's examples."
        },
        step_definition_code: {
            type: Type.STRING,
            description: "The complete JavaScript code for the Step Definition file. It should include imports for Cucumber and the Page Object, and implement the Gherkin steps."
        },
    },
    required: ['page_object_code', 'step_definition_code'],
};


export async function generateTestCases(
    featureDescription: string, 
    apiKey: string,
    attachment: { data: string; mimeType: string } | null
): Promise<TestCase[]> {
  if (!apiKey) {
    throw new Error("Google Gemini API Key was not provided. Please enter it in the input field.");
  }
  
  const ai = new GoogleGenAI({ apiKey: apiKey });

  const contentParts: any[] = [];

  const instructions = "Generate a comprehensive set of test cases for the following feature, using Gherkin syntax. Analyze the provided text and/or attached file (e.g., a mockup image or requirements doc).";

  if (featureDescription) {
    contentParts.push({ text: `${instructions}\n\nFeature Description:\n${featureDescription}`});
  } else {
    contentParts.push({ text: instructions });
  }

  if (attachment) {
      contentParts.push({
          inlineData: {
              mimeType: attachment.mimeType,
              data: attachment.data,
          }
      });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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
    if (!gherkinScenarios) {
        throw new Error("No Gherkin scenarios provided to generate automation code.");
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });

    const prompt = `
**GHERKIN SCENARIOS:**
${gherkinScenarios}

---

**EXAMPLE PAGE OBJECT CODE (\`/pages/ExamplePage.js\`):**
\`\`\`javascript
${context.pageObject || '// No example provided. Please create a standard Page Object class.'}
\`\`\`

---

**EXAMPLE STEP DEFINITION CODE (\`/features/step-definitions/example.steps.js\`):**
\`\`\`javascript
${context.stepDefinition || '// No example provided. Please create standard Cucumber step definitions.'}
\`\`\`

---

**EXAMPLE HELPER/UTILITY CODE (Optional - \`/utils/PlaywrightHelper.js\`):**
\`\`\`javascript
${context.helper || '// No helper code provided.'}
\`\`\`

---

**INSTRUCTIONS:**
1.  Analyze the Gherkin scenarios to identify necessary actions and verifications.
2.  Create new methods in a page object class that correspond to these actions (e.g., \`clickLoginButton()\`, \`enterUsername(username)\`). Use a descriptive name for the page object class based on the feature.
3.  Define locators for the elements mentioned in the scenarios within the page object.
4.  Create new step definitions that implement the Gherkin steps.
5.  Inside the step definitions, import and use the page object to call the action methods, following the pattern in the examples.
6.  Ensure the generated code matches the style of the provided examples (e.g., async/await usage, ESM imports, class structure).
7.  Return ONLY the generated code in the specified JSON format. Do not add any explanations.
    `;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: { parts: [{ text: prompt }] },
        config: {
          systemInstruction: "You are an expert Senior Automation Engineer specializing in Playwright, Cucumber.js, and the Page Object Model (POM) with JavaScript ESM. Your task is to generate automation code based on the provided Gherkin scenarios and example code. Strictly adhere to the coding style, patterns, and structure found in the examples. Generate two distinct code blocks: one for the step definitions and one for the page object methods. The page object file should contain locators and methods for interacting with page elements. The step definition file should import and use the page object.",
          responseMimeType: 'application/json',
          responseSchema: automationCodeSchema,
        },
    });

    try {
        const jsonString = response.text.trim();
        const parsed = JSON.parse(jsonString);
        if (parsed.page_object_code && parsed.step_definition_code) {
            return {
                pageObject: parsed.page_object_code,
                stepDefinition: parsed.step_definition_code,
            };
        }
        throw new Error("Invalid JSON structure received from API for automation code.");
    } catch (error) {
        console.error("Failed to parse Gemini response for automation code:", response.text);
        throw new Error("Could not parse the generated automation code. The API might have returned an unexpected format.");
    }
}
