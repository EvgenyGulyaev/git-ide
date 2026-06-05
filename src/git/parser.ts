import { Branch, Commit, BlameLine, StashEntry, DiffResult, DiffHunk, ChangedFile, GitGraphEntry } from './types';

const SHORT_HASH_LENGTH = 7;

export function parseBranches(raw: string): Branch[] {
  const branches: Branch[] = [];
  const lines = raw.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const current = line.startsWith('*');
    const clean = line.replace(/^\*?\s+/, '');

    // Skip HEAD pointer
    if (clean.startsWith('HEAD')) continue;

    const isRemote = clean.startsWith('remotes/');
    const name = isRemote ? clean.replace('remotes/', '') : clean;

    branches.push({
      name,
      current,
      remote: isRemote,
    });
  }

  return branches;
}

export function parseCommits(raw: string): Commit[] {
  if (!raw.trim()) return [];

  const commits: Commit[] = [];
  const entries = raw.split('\x00').filter(e => e.trim());

  for (const entry of entries) {
    const parts = entry.split('\n');
    if (parts.length < 4) continue;

    const [hash, author, authorEmail, dateStr, ...messageParts] = parts;
    const message = messageParts.join('\n').trim();
    const parents = hash.includes(' ') ? hash.split(' ').slice(1) : [];

    commits.push({
      hash: hash.split(' ')[0],
      shortHash: hash.split(' ')[0].substring(0, SHORT_HASH_LENGTH),
      message: message.split('\n')[0], // first line only
      author,
      authorEmail,
      date: new Date(parseInt(dateStr) * 1000),
      parents,
    });
  }

  return commits;
}

export function parseBlame(raw: string): BlameLine[] {
  const lines: BlameLine[] = [];
  const entries = raw.split('\n\n').filter(e => e.trim());

  for (const entry of entries) {
    const parts = entry.split('\n');
    const headerLine = parts[0];
    const contentLine = parts.find(l => l.startsWith('\t'));

    if (!headerLine || !contentLine) continue;

    const [hash, , , lineNum] = headerLine.split(' ');
    const authorMatch = headerLine.match(/author (.+)/);
    const dateMatch = headerLine.match(/author-time (\d+)/);

    lines.push({
      hash: hash.substring(0, SHORT_HASH_LENGTH),
      author: authorMatch ? authorMatch[1] : 'Unknown',
      date: dateMatch ? new Date(parseInt(dateMatch[1]) * 1000) : new Date(),
      line: parseInt(lineNum) || 0,
      content: contentLine.substring(1), // remove leading tab
    });
  }

  return lines;
}

export function parseStash(raw: string): StashEntry[] {
  if (!raw.trim()) return [];

  return raw.split('\n').filter(l => l.trim()).map(line => {
    const match = line.match(/^stash@\{(\d+)\}:\s+(.+?):\s+(.+)$/);
    if (!match) {
      return { index: 0, message: line, branch: '' };
    }
    return {
      index: parseInt(match[1]),
      message: match[3],
      branch: match[2],
    };
  });
}

export function parseDiff(raw: string): DiffResult {
  const hunks: DiffHunk[] = [];
  const lines = raw.split('\n');

  let oldPath = '';
  let newPath = '';
  let currentHunk: DiffHunk | null = null;

  for (const line of lines) {
    if (line.startsWith('--- a/')) {
      oldPath = line.substring(6);
    } else if (line.startsWith('+++ b/')) {
      newPath = line.substring(6);
    } else if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        if (currentHunk) hunks.push(currentHunk);
        currentHunk = {
          oldStart: parseInt(match[1]),
          oldLines: parseInt(match[2] || '1'),
          newStart: parseInt(match[3]),
          newLines: parseInt(match[4] || '1'),
          content: '',
        };
      }
    } else if (currentHunk) {
      currentHunk.content += line + '\n';
    }
  }

  if (currentHunk) hunks.push(currentHunk);

  return { hunks, oldPath, newPath };
}

export function parseChangedFiles(raw: string): ChangedFile[] {
  if (!raw.trim()) return [];

  return raw.split('\n').filter(l => l.trim()).map(line => {
    const statusChar = line[0];
    const rest = line.substring(2).trim();

    let status: ChangedFile['status'];
    let path = rest;
    let oldPath: string | undefined;

    switch (statusChar) {
      case 'A': status = 'added'; break;
      case 'M': status = 'modified'; break;
      case 'D': status = 'deleted'; break;
      case 'R': {
        status = 'renamed';
        const parts = rest.split(' -> ');
        oldPath = parts[0];
        path = parts[1] || parts[0];
        break;
      }
      case 'C': status = 'copied'; break;
      case '?': status = 'untracked'; break;
      default: status = 'modified';
    }

    return { path, status, staged: statusChar !== '?' && statusChar !== ' ', oldPath };
  });
}

export function parseGraphLog(raw: string): GitGraphEntry[] {
  if (!raw.trim()) return [];

  const entries: GitGraphEntry[] = [];
  const lines = raw.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const parts = line.split('\x00');
    if (parts.length < 6) continue;

    const [hashRefs, author, dateStr, , message, parentHashes] = parts;
    const [hash, ...refs] = hashRefs.split(' ');
    const parents = parentHashes ? parentHashes.split(' ') : [];

    entries.push({
      hash,
      shortHash: hash.substring(0, SHORT_HASH_LENGTH),
      author,
      date: new Date(parseInt(dateStr) * 1000),
      message,
      parents,
      refs,
      lanes: [],
    });
  }

  return entries;
}

export function parseConflictMarkers(content: string): { ours: string; theirs: string } | null {
  const oursMatch = content.match(/<<<<<<<[^\n]*\n([\s\S]*?)=======/);
  const theirsMatch = content.match(/=======\n([\s\S]*?)>>>>>>>/);

  if (!oursMatch || !theirsMatch) return null;

  return {
    ours: oursMatch[1],
    theirs: theirsMatch[1],
  };
}
