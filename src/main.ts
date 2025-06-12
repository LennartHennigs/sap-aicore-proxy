import { AzureOpenAI } from 'openai';
import { SapAiCoreHelper } from './lib/sap-ai-core-helper.js';

const sapAiCoreHelper = new SapAiCoreHelper();
const deploymentUrl = await sapAiCoreHelper.getModelDeploymentUrl('gpt-4.1');
const tokenProvider = sapAiCoreHelper.accessTokenProvider;
const extraHeaders = sapAiCoreHelper.getRequestHeaders();

const client = new AzureOpenAI({
  azureADTokenProvider: tokenProvider,
  baseURL: deploymentUrl,
  apiVersion: '2025-04-01-preview',
  defaultHeaders: extraHeaders
});

const userMessage = 'Describe in a single paragraph a Fact Sheet according to the LeanIX definition.';
const completion = await client.chat.completions.create({
  model: 'gpt-4.1',
  messages: [{ role: 'user', content: userMessage }]
});

const assistantMessage = completion.choices[0]?.message.content ?? '';
if (!assistantMessage) {
  throw new Error('No content received from the AI model.');
}

console.log('='.repeat(60));
console.log('| 🧑 User      |', userMessage);
console.log('-'.repeat(60));
console.log('| 🤖 Assistant |', assistantMessage);
console.log('='.repeat(60));
