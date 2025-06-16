import { Agent, MCPServerStdio, run, setTraceProcessors } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions';
import { sapAiCore } from '@ai-foundry/sap-aicore-provider';
import { processor } from './lib/tracing.js';

setTraceProcessors([processor]);

// Run the MCP server in a Docker container
// Make sure you have Docker installed and running on your machine
// Pull the latest Playwright MCP image before running this script
// const mcpServer = new MCPServerStdio({
//   name: 'Playwright MCP, via docker',
//   fullCommand: `docker run -i --rm --init --pull=always mcr.microsoft.com/playwright/mcp`
// });

// MCP using npx
const mcpServer = new MCPServerStdio({
  name: 'Playwright MCP, via npx',
  fullCommand: `npx @playwright/mcp@latest --isolated`
});

try {
  await mcpServer.connect();

  const agent = new Agent({
    name: 'Browser Agent',
    instructions: 'Use the tools to search for information and answer the question using the browser tools.',
    model: aisdk(sapAiCore('sap-aicore/gpt-4.1')),
    mcpServers: [mcpServer]
  });

  const goal =
    'Go directly to the url https://coffee-cart.app/ and buy a Cappuccino and an Espresso Macchiato on my Name Peter Grasmeier and use my email: peter.grasmeier@example.com and write a review of what we bought and price.';

  const result = await run(agent, goal);
  console.log(result.finalOutput);
} catch (error) {
  console.error('Error running agent:', error);
} finally {
  await mcpServer.close();
}
