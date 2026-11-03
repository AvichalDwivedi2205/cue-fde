import assert from 'node:assert/strict';
import {writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readConfig} from '../src/data.mjs';

const entry = resolve(process.argv[2] || 'dist/index.mjs');
const output = resolve(process.argv[3] || fileURLToPath(new URL('../../../../artifacts/demo-revision-2026-10-13/cue-plugin-live-test.json', import.meta.url)));
const client = new Client({name: 'cue-real-issue-test', version: '0.1.0'});
const config = await readConfig();
const transport = new StdioClientTransport({command: process.execPath, args: [entry]});
const receipts = [];
async function call(name, args) {
  const result = await client.callTool({name, arguments: args});
  const raw = JSON.stringify(result);
  assert(!raw.includes(config.secret), 'Credential must never appear in results');
  assert(!raw.includes(config.convexUrl), 'Connection URL must stay private');
  receipts.push({tool: name, arguments: args, result});
  return result;
}
try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(t => t.name).sort(), ['cue_get_fix_status', 'cue_get_issue', 'cue_list_issues']);
  for (const tool of tools.tools) assert.equal(tool.annotations.readOnlyHint, true);
  const list = await call('cue_list_issues', {query: 'upload', limit: 10});
  assert(!list.isError); assert(list.structuredContent.issues.length > 0);
  const issueId = list.structuredContent.issues[0].id;
  assert(list.structuredContent.issues.every(i => i.appId === config.appId));
  const issue = await call('cue_get_issue', {issueId});
  assert(!issue.isError); assert(issue.structuredContent.reports.length > 0);
  assert.match(issue.structuredContent.reports[0].provenance, /Controlled rehearsal/);
  const fix = await call('cue_get_fix_status', {issueId});
  assert(!fix.isError); assert.equal(fix.structuredContent.verifiedFix, true);
  assert.match(fix.structuredContent.run.after, /all 8 independent HTTP regression checks passed/);
  assert.match(fix.structuredContent.run.prUrl, /^https:\/\/github.com\//);
  assert.equal(fix.structuredContent.run.approvalRecorded, true);
  assert.match(issue.structuredContent.issue.url, /\/cue#\/issues\//);
  const denied = await call('cue_get_issue', {issueId: 'jh784d9b78wdv6sc7v5h1pcab58fzzp2'});
  assert.equal(denied.isError, true);
  const deniedRun = await call('cue_get_fix_status', {issueId, runId: 'jn74tkxs39g7w6b1nej4hwz54d8fz2xn'});
  assert.equal(deniedRun.isError, true);
  await mkdir(dirname(output), {recursive: true});
  await writeFile(output, JSON.stringify({passed: true, testedAt: new Date().toISOString(), entry, appId: config.appId, issueId, tools: tools.tools.map(t => ({name: t.name, annotations: t.annotations})), receipts}, null, 2)+'\n');
  console.log(JSON.stringify({passed: true, issueId, appId: config.appId, tools: tools.tools.map(t => t.name), pr: fix.structuredContent.run.prUrl, verifiedFix: true, deniedForeignIssue: true, deniedForeignRun: true, receipt: output}));
} finally {
  await client.close();
}
