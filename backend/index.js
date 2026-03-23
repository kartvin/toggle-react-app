const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const cors = require('cors');

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

// Source file extensions to include when reading project files
const SOURCE_EXTENSIONS = new Set([
  '.java', '.js', '.ts', '.jsx', '.tsx', '.yaml', '.yml',
  '.xml', '.properties', '.json', '.html', '.jsp', '.css', '.py', '.rb', '.go'
]);

// Directories to skip when scanning
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'target', 'build', 'dist', '.idea', '.vscode', '__pycache__'
]);

// Recursively read all source files from a directory
function readSourceFiles(dir, baseDir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        results = results.concat(readSourceFiles(fullPath, baseDir));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SOURCE_EXTENSIONS.has(ext)) {
        const relativePath = path.relative(baseDir, fullPath);
        results.push({
          relativePath,
          fullPath,
          content: fs.readFileSync(fullPath, 'utf8')
        });
      }
    }
  }
  return results;
}

// Parse Claude's structured response into file updates
function parseClaudeResponse(responseText, baseDir) {
  const fileRegex = /---FILE_START:\s*(.+?)---\n([\s\S]*?)---FILE_END---/g;
  const updates = [];
  let match;
  while ((match = fileRegex.exec(responseText)) !== null) {
    const relativePath = match[1].trim();
    const content = match[2];
    const fullPath = path.join(baseDir, relativePath);
    updates.push({ relativePath, fullPath, content });
  }
  return updates;
}

// Compute a simple line diff between original and updated content
function computeDiff(originalContent, updatedContent, contextLines = 3) {
  const origLines = originalContent.split('\n');
  const newLines = updatedContent.split('\n');
  const diff = [];

  // Simple LCS-based diff
  const maxLen = Math.max(origLines.length, newLines.length);
  let i = 0, j = 0;
  const changes = [];

  while (i < origLines.length || j < newLines.length) {
    if (i < origLines.length && j < newLines.length && origLines[i] === newLines[j]) {
      changes.push({ type: 'context', line: origLines[i], origLine: i + 1, newLine: j + 1 });
      i++; j++;
    } else {
      // Find next matching line
      let foundOrig = -1, foundNew = -1;
      const searchLimit = 20;
      for (let k = 1; k < searchLimit; k++) {
        if (j + k < newLines.length && i < origLines.length && origLines[i] === newLines[j + k]) {
          foundNew = j + k; break;
        }
        if (i + k < origLines.length && j < newLines.length && origLines[i + k] === newLines[j]) {
          foundOrig = i + k; break;
        }
      }
      if (foundNew > -1) {
        // Lines were added
        while (j < foundNew) {
          changes.push({ type: 'added', line: newLines[j], newLine: j + 1 });
          j++;
        }
      } else if (foundOrig > -1) {
        // Lines were deleted
        while (i < foundOrig) {
          changes.push({ type: 'deleted', line: origLines[i], origLine: i + 1 });
          i++;
        }
      } else {
        // Line was modified
        if (i < origLines.length) {
          changes.push({ type: 'deleted', line: origLines[i], origLine: i + 1 });
          i++;
        }
        if (j < newLines.length) {
          changes.push({ type: 'added', line: newLines[j], newLine: j + 1 });
          j++;
        }
      }
    }
  }

  // Extract only regions with changes + context
  const regions = [];
  let currentRegion = null;
  for (let idx = 0; idx < changes.length; idx++) {
    if (changes[idx].type !== 'context') {
      const start = Math.max(0, idx - contextLines);
      const end = Math.min(changes.length - 1, idx + contextLines);
      if (currentRegion && start <= currentRegion.end + 1) {
        currentRegion.end = end;
      } else {
        if (currentRegion) regions.push(currentRegion);
        currentRegion = { start, end };
      }
    }
  }
  if (currentRegion) regions.push(currentRegion);

  // Build output from regions
  const result = [];
  for (const region of regions) {
    for (let idx = region.start; idx <= region.end; idx++) {
      result.push(changes[idx]);
    }
    result.push({ type: 'separator' });
  }

  return result;
}

// Endpoint to browse directories on the server filesystem
app.get('/browse', (req, res) => {
  const dirPath = req.query.path || '/';
  const resolved = path.resolve(dirPath);
  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort();
    res.json({ path: resolved, dirs });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Endpoint to receive project directory context and toggle name
app.post('/remove-toggle', async (req, res) => {
  const exec = require('child_process').exec;

  const { directory, toggleName, postCommand } = req.body;
  if (!directory || !toggleName) {
    return res.status(400).json({ error: 'Missing directory or toggleName' });
  }

  // Resolve directory path to absolute
  const absoluteDirectory = path.isAbsolute(directory)
    ? directory
    : path.resolve(directory);

  // Recursively read all source files
  let fileContents;
  try {
    fileContents = readSourceFiles(absoluteDirectory, absoluteDirectory);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read directory: ' + err.message });
  }

  if (fileContents.length === 0) {
    return res.status(400).json({ error: 'No source files found in directory' });
  }

  // Store original content for diff computation
  const originalContentMap = {};
  for (const f of fileContents) {
    originalContentMap[f.relativePath] = f.content;
  }

  // Read Claude prompt template from markdown file
  const claudePrompt = fs.readFileSync(path.join(__dirname, '../claude-refactor-prompt.md'), 'utf8');

  // Build the full prompt: system instructions + variable name + all file contents
  const filesSection = fileContents
    .map(f => `--- ${f.relativePath} ---\n${f.content}`)
    .join('\n\n');

  const prompt = `${claudePrompt}\n\nVariable name to remove: ${toggleName}\nPost-refactor build command: ${postCommand || 'none'}\n\nBelow are all the source files in the project:\n\n${filesSection}`;

  // Call Anthropic API
  const anthropic = new Anthropic();
  let claudeResponse;
  try {
    claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });
  } catch (err) {
    return res.status(500).json({ error: 'Anthropic API error: ' + err.message });
  }

  const responseText = claudeResponse?.content?.[0]?.text ?? '';

  // Check if no changes needed
  if (responseText.trim() === 'NO_CHANGES_NEEDED') {
    return res.json({ success: true, updated: 0, message: 'No references found', responseText });
  }

  // Parse and apply file updates
  const updates = parseClaudeResponse(responseText, absoluteDirectory);
  let updatedCount = 0;
  const changedFiles = [];
  const fileDiffs = [];

  for (const update of updates) {
    try {
      const originalContent = originalContentMap[update.relativePath] || '';
      const diff = computeDiff(originalContent, update.content);
      fileDiffs.push({ file: update.relativePath, diff, fullContent: update.content });
      fs.writeFileSync(update.fullPath, update.content, 'utf8');
      updatedCount++;
      changedFiles.push(update.relativePath);
    } catch (err) {
      changedFiles.push(`FAILED: ${update.relativePath} - ${err.message}`);
    }
  }

  // Extract summary from Claude response
  const summaryMatch = responseText.match(/---SUMMARY_START---(\s*[\s\S]*?)---SUMMARY_END---/);
  const summary = summaryMatch ? summaryMatch[1].trim() : '';

  // Run post-refactor command if provided and files were modified
  if (updatedCount > 0 && postCommand && postCommand.trim()) {
    exec(postCommand.trim(), { cwd: absoluteDirectory }, (error, stdout, stderr) => {
      if (error) {
        return res.json({
          success: false, updated: updatedCount, changedFiles,
          build: 'fail', error: stderr || error.message,
          fileDiffs, summary
        });
      }
      res.json({
        success: true, updated: updatedCount, changedFiles,
        build: 'success', output: stdout,
        fileDiffs, summary
      });
    });
  } else {
    res.json({
      success: true, updated: updatedCount, changedFiles,
      build: 'skipped', fileDiffs, summary
    });
  }
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});
