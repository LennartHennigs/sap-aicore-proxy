import { sapAiCore } from '@ai-foundry/sap-aicore-provider';
import { generateText } from 'ai';

const userMessage = 'What is a Fact Sheet according to LeanIX?';
const { text: assistantMessage } = await generateText({
  model: sapAiCore('sap-aicore/gpt-4.1'),
  prompt: userMessage
});

console.log('='.repeat(60));
console.log('| 🧑 User      |', userMessage);
console.log('-'.repeat(60));
console.log('| 🤖 Assistant |', assistantMessage);
console.log('='.repeat(60));
