import { Agent, run, setTracingDisabled, tool } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions';
import { sapAiCore } from '@ai-foundry/sap-aicore-provider';
import z from 'zod';

// ⚠️ WARNING: Tracing is ENABLED by default! OpenAI Agents will send telemetry data unless you explicitly disable it below.
setTracingDisabled(true);

const model = aisdk(sapAiCore('sap-aicore/gpt-4.1'));

const getWeatherTool = tool({
  name: 'get_weather',
  description: 'Get the weather for a given city',
  parameters: z.object({ city: z.string() }),
  async execute({ city }) {
    return `The weather in ${city} is sunny`;
  }
});

const agent = new Agent({
  name: 'Weather agent',
  instructions: 'You provide weather information.',
  tools: [getWeatherTool],
  model
});

try {
  const result = await run(agent, 'Hello what is the weather in San Francisco and oakland?');
  console.log(result.finalOutput);
} catch (error) {
  console.error('Error running agent:', error);
}
