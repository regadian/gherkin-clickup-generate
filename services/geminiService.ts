
import { GoogleGenAI, Type } from "@google/genai";
import { TestCase } from "../types";

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
        // Simple validation to ensure objects have the correct shape.
        return parsed.test_cases.filter((tc: any) => tc.title && tc.description && tc.priority);
    }
    throw new Error("Invalid JSON structure received from API.");
  } catch (error) {
    console.error("Failed to parse Gemini response:", response.text);
    throw new Error("Could not parse the generated test cases. The API might have returned an unexpected format.");
  }
}
