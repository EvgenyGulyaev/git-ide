import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Branch, Commit, BlameLine, StashEntry, DiffResult, ChangedFile, GitGraphEntry } from './types';
import { parseBranches, parseCommits, parseBlame, parseStash, parseDiff, parseChangedFiles, parseGraphLog } from './parser';

const execAsync = promisify(exec);

export class GitService {
  private cwd: string;

  constructor() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }
    this.cwd = workspaceFolder.uri.fsPath;
  }

  private async exec(args: string[]): Promise<string> {
    try {
      // Quote arguments that contain spaces
      const quoted = args.map(arg => {
        if (arg.includes(' ') || arg.includes('"') || arg.includes("'")) {
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      });
      const { stdout } = await execAsync(`git ${quoted.join(' ')}`, {
        cwd: this.cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    } catch (error: any) {
      if (error.stderr?.includes('not a git repository')) {
        throw new Error('Not a git repository');
      }
      throw error;
    }
  }

  async getBranches(): Promise<Branch[]> {
    const raw = await this.exec(['branch', '-vv', '--no-color']);
    return this.parseBranchesWithTracking(raw);
  }

  private parseBranchesWithTracking(raw: string): Branch[] {
    const branches: Branch[] = [];
    const lines = raw.split('\n').filter(l => l.trim());

    for (const line of lines) {
      const current = line.startsWith('*');
      const clean = line.replace(/^\*?\s+/, '');

      // Parse: branch-name [remote-branch: ahead N, behind M] commit message
      const match = clean.match(/^(\S+)\s+(\S+)\s+(?:\[(.+?)\]\s+)?(.+)$/);
      if (!match) continue;

      const [, name, hash, tracking, message] = match;

      let upstream: string | undefined;
      let ahead = 0;
      let behind = 0;

      if (tracking) {
        const trackingMatch = tracking.match(/^([^:]+)(?::\s*ahead\s*(\d+))?(?:,\s*behind\s*(\d+))?$/);
        if (trackingMatch) {
          upstream = trackingMatch[1];
          ahead = parseInt(trackingMatch[2] || '0');
          behind = parseInt(trackingMatch[3] || '0');
        }
      }

      const isRemote = name.startsWith('remotes/');

      branches.push({
        name: isRemote ? name.replace('remotes/', '') : name,
        current,
        remote: isRemote,
        upstream,
        ahead,
        behind,
      });
    }

    return branches;
  }

  async fetch(): Promise<void> {
    await this.exec(['fetch', '--all', '--prune']);
  }

  async pullBranch(branch: string): Promise<void> {
    await this.exec(['pull', 'origin', branch]);
  }

  async getCurrentBranch(): Promise<string> {
    const raw = await this.exec(['branch', '--show-current']);
    return raw.trim();
  }

  async checkoutBranch(name: string): Promise<void> {
    await this.exec(['checkout', name]);
  }

  async createBranch(name: string): Promise<void> {
    await this.exec(['checkout', '-b', name]);
  }

  async deleteBranch(name: string, force = false): Promise<void> {
    const flag = force ? '-D' : '-d';
    await this.exec(['branch', flag, name]);
  }

  async getCommits(limit = 100): Promise<Commit[]> {
    const format = '%H%n%an%n%ae%n%at%n%s%n';
    const raw = await this.exec([
      'log',
      `--format=${format}`,
      `-${limit}`,
      '--no-color',
    ]);
    return parseCommits(raw);
  }

  async getFileCommits(filePath: string, limit = 50): Promise<Commit[]> {
    const format = '%H%n%an%n%ae%n%at%n%s%n';
    const raw = await this.exec([
      'log',
      `--format=${format}`,
      `-${limit}`,
      '--no-color',
      '--',
      filePath,
    ]);
    return parseCommits(raw);
  }

  async getBlame(filePath: string): Promise<BlameLine[]> {
    const raw = await this.exec([
      'blame',
      '--porcelain',
      '--no-color',
      filePath,
    ]);
    return parseBlame(raw);
  }

  async getDiff(filePath?: string): Promise<string> {
    const args = ['diff', '--no-color'];
    if (filePath) args.push('--', filePath);
    return this.exec(args);
  }

  async getStagedDiff(filePath?: string): Promise<string> {
    const args = ['diff', '--cached', '--no-color'];
    if (filePath) args.push('--', filePath);
    return this.exec(args);
  }

  async getCommitDiff(hash: string): Promise<DiffResult> {
    const raw = await this.exec(['show', '--no-color', '--format=', hash]);
    return parseDiff(raw);
  }

  async pull(): Promise<string> {
    return this.exec(['pull']);
  }

  async push(): Promise<string> {
    return this.exec(['push']);
  }

  async stash(message?: string): Promise<void> {
    const args = ['stash'];
    if (message) args.push('push', '-m', message);
    await this.exec(args);
  }

  async stashPop(): Promise<void> {
    await this.exec(['stash', 'pop']);
  }

  async getStashList(): Promise<StashEntry[]> {
    const raw = await this.exec(['stash', 'list', '--no-color']);
    return parseStash(raw);
  }

  async getStatus(): Promise<string> {
    return this.exec(['status', '--porcelain', '--no-color']);
  }

  async getAheadBehind(): Promise<{ ahead: number; behind: number }> {
    try {
      const raw = await this.exec([
        'rev-list',
        '--left-right',
        '--count',
        'HEAD...@{upstream}',
      ]);
      const [ahead, behind] = raw.trim().split('\t').map(Number);
      return { ahead, behind };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  // Phase 2: Commit operations

  async getChangedFiles(): Promise<ChangedFile[]> {
    // Get staged files
    const stagedRaw = await this.exec(['diff', '--cached', '--name-status', '--no-color']);
    const staged = parseChangedFiles(stagedRaw).map(f => ({ ...f, staged: true }));

    // Get unstaged files
    const unstagedRaw = await this.exec(['diff', '--name-status', '--no-color']);
    const unstaged = parseChangedFiles(unstagedRaw).map(f => ({ ...f, staged: false }));

    // Get untracked files
    const untrackedRaw = await this.exec(['ls-files', '--others', '--exclude-standard']);
    const untracked: ChangedFile[] = untrackedRaw.split('\n').filter(l => l.trim()).map(f => ({
      path: f.trim(),
      status: 'untracked' as const,
      staged: false,
    }));

    return [...staged, ...unstaged, ...untracked];
  }

  async stageFile(filePath: string): Promise<void> {
    await this.exec(['add', filePath]);
  }

  async unstageFile(filePath: string): Promise<void> {
    await this.exec(['reset', 'HEAD', '--', filePath]);
  }

  async stageAll(): Promise<void> {
    await this.exec(['add', '-A']);
  }

  async unstageAll(): Promise<void> {
    await this.exec(['reset', 'HEAD']);
  }

  async commit(message: string): Promise<void> {
    await this.exec(['commit', '-m', message]);
  }

  async amendCommit(message?: string): Promise<void> {
    const args = ['commit', '--amend'];
    if (message) args.push('-m', message);
    else args.push('--no-edit');
    await this.exec(args);
  }

  async getLastCommitMessage(): Promise<string> {
    return this.exec(['log', '-1', '--format=%B', '--no-color']);
  }

  // Phase 3: Diff & Merge

  async getFileContent(filePath: string, ref?: string): Promise<string> {
    const args = ref ? ['show', `${ref}:${filePath}`] : ['show', `HEAD:${filePath}`];
    try {
      return await this.exec(args);
    } catch {
      return '';
    }
  }

  async getWorkingFileContent(filePath: string): Promise<string> {
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.join(this.cwd, filePath);
    try {
      return fs.readFileSync(fullPath, 'utf8');
    } catch {
      return '';
    }
  }

  async getConflicts(): Promise<string[]> {
    const raw = await this.exec(['diff', '--name-only', '--diff-filter=U', '--no-color']);
    return raw.split('\n').filter(l => l.trim());
  }

  async resolveConflict(filePath: string, resolution: 'ours' | 'theirs'): Promise<void> {
    await this.exec(['checkout', `--${resolution}`, filePath]);
    await this.exec(['add', filePath]);
  }

  async stageHunk(filePath: string, hunkContent: string): Promise<void> {
    // Apply a single hunk via git apply
    const diff = `--- a/${filePath}\n+++ b/${filePath}\n${hunkContent}`;
    const { exec: execCb } = require('child_process');
    const { promisify } = require('util');
    const execP = promisify(execCb);

    await execP(`git apply --cached`, {
      cwd: this.cwd,
      input: diff,
    });
  }

  // Phase 4: Advanced

  async getGraphLog(limit = 200): Promise<GitGraphEntry[]> {
    const format = '%H %D%n%an%n%at%n%e%n%s%n%P';
    const raw = await this.exec([
      'log',
      `--format=${format}`,
      `-${limit}`,
      '--all',
      '--no-color',
    ]);
    return parseGraphLog(raw);
  }

  async getLineBlame(filePath: string, line: number): Promise<BlameLine | null> {
    const blame = await this.getBlame(filePath);
    return blame[line] || null;
  }

  async rebaseInteractive(branch: string): Promise<void> {
    // Opens editor for interactive rebase — use with caution
    await this.exec(['rebase', '-i', branch]);
  }

  async rebaseAbort(): Promise<void> {
    await this.exec(['rebase', '--abort']);
  }

  async rebaseContinue(): Promise<void> {
    await this.exec(['rebase', '--continue']);
  }

  async isRebasing(): Promise<boolean> {
    const fs = require('fs');
    const path = require('path');
    const rebaseDir = path.join(this.cwd, '.git', 'rebase-merge');
    return fs.existsSync(rebaseDir);
  }
}
