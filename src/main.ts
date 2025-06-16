import { Agent, MCPServerStdio, run, setTraceProcessors } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions';
import { sapAiCore } from '@ai-foundry/sap-aicore-provider';
import { processor } from './tracing.js';

setTraceProcessors([processor]);

const GITHUB_TOOLSETS = 'repos,issues,pull_requests';
const GITHUB_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
if (!GITHUB_TOKEN) {
  throw new Error('Please set the GITHUB_PERSONAL_ACCESS_TOKEN environment variable.');
}
const mcpServer = new MCPServerStdio({
  name: 'Github MCP Server, via docker',
  fullCommand: `docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_TOKEN} -e GITHUB_TOOLSETS=${GITHUB_TOOLSETS} mcp/github-mcp-server`
});
try {
  await mcpServer.connect();

  const model = aisdk(sapAiCore('sap-aicore/gpt-4.1'));
  const agent = new Agent({
    name: 'Coding agent',
    instructions: 'You provide answer questions related to code in git repositories.',
    mcpServers: [mcpServer],
    model
  });
  const result = await run(
    agent,
    'Describe the repository "leanix/ai-inventory-builder" in GitHub, use the README.md file as a reference.'
  );
  console.log(result.finalOutput);
} catch (error) {
  console.error('Error running agent:', error);
} finally {
  await mcpServer.close();
}
