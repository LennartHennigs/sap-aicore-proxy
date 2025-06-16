import { Agent, run, setTraceProcessors, tool } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions';
import { sapAiCore } from '@ai-foundry/sap-aicore-provider';
import { processor } from './lib/tracing.js';
import z from 'zod';

setTraceProcessors([processor]);

const getWeatherTool = tool({
  name: 'get_weather',
  description: 'Get the weather for a given city',
  parameters: z.object({ city: z.string() }),
  async execute({ city }) {
    return `The weather in ${city} is sunny`;
  }
});

try {
  const agent = new Agent({
    name: 'Weather agent',
    instructions: 'You provide weather information.',
    tools: [getWeatherTool],
    model: aisdk(sapAiCore('sap-aicore/gpt-4.1'))
  });

  const result = await run(agent, 'Hello what is the weather in Bonn and Ljubljana?');
  console.log(result.finalOutput);
} catch (error) {
  console.error('Error running agent:', error);
}
