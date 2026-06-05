import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../git/service';
import { Commit } from '../git/types';

function toRelativePath(absolutePath: string): string {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return absolutePath;
  return path.relative(workspaceFolder.uri.fsPath, absolutePath);
}

export class FileHistoryItem extends vscode.TreeItem {
  constructor(
    public readonly commit: Commit,
    public readonly filePath: string
  ) {
    super(commit.message, vscode.TreeItemCollapsibleState.None);

    this.description = `${commit.shortHash} • ${this.formatDate(commit.date)}`;
    this.tooltip = `${commit.author} - ${commit.message}\n${commit.hash}`;
    this.contextValue = 'fileHistoryCommit';

    this.iconPath = new vscode.ThemeIcon('history');
    this.command = {
      command: 'git-ide.showCommitDiff',
      title: 'Show Diff',
      arguments: [commit],
    };
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return date.toLocaleDateString();
  }
}

export class FileHistoryProvider implements vscode.TreeDataProvider<FileHistoryItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileHistoryItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private git: GitService;
  private filePath: string | undefined;

  constructor() {
    this.git = new GitService();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setFile(filePath: string): void {
    this.filePath = filePath;
    this.refresh();
  }

  getTreeItem(element: FileHistoryItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<FileHistoryItem[]> {
    if (!this.filePath) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.filePath = editor.document.uri.fsPath;
      } else {
        return [];
      }
    }

    try {
      const relativePath = toRelativePath(this.filePath);
      const commits = await this.git.getFileCommits(relativePath);
      return commits.map(c => new FileHistoryItem(c, this.filePath!));
    } catch {
      return [];
    }
  }
}

// Line History - shows history for specific line
export class LineHistoryItem extends vscode.TreeItem {
  constructor(
    public readonly commit: Commit,
    public readonly filePath: string,
    public readonly line: number
  ) {
    super(commit.message, vscode.TreeItemCollapsibleState.None);

    this.description = `${commit.shortHash} • ${commit.author}`;
    this.tooltip = `${commit.author} - ${commit.message}`;
    this.contextValue = 'lineHistoryCommit';

    this.iconPath = new vscode.ThemeIcon('git-commit');
  }
}

export class LineHistoryProvider implements vscode.TreeDataProvider<LineHistoryItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<LineHistoryItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private git: GitService;
  private filePath: string | undefined;
  private line: number | undefined;

  constructor() {
    this.git = new GitService();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setContext(filePath: string, line: number): void {
    this.filePath = filePath;
    this.line = line;
    this.refresh();
  }

  getTreeItem(element: LineHistoryItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<LineHistoryItem[]> {
    // Auto-detect from active editor if not explicitly set
    if (!this.filePath || !this.line) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.filePath = editor.document.uri.fsPath;
        this.line = editor.selection.active.line + 1;
      } else {
        return [];
      }
    }

    try {
      const relativePath = toRelativePath(this.filePath);
      const format = '%H%n%an%n%ae%n%at%n%s%n';
      const args = [
        'log',
        `--format=${format}`,
        '-50',
        '--no-color',
        `-L${this.line},${this.line}:${relativePath}`,
      ];

      const raw = await this.git['exec'](args);
      const commits = this.parseLineLog(raw);
      return commits.map(c => new LineHistoryItem(c, this.filePath!, this.line!));
    } catch {
      return [];
    }
  }

  private parseLineLog(raw: string): Commit[] {
    // Parse the -L output which has commit blocks
    const blocks = raw.split(/^commit /m).filter(b => b.trim());
    const commits: Commit[] = [];

    for (const block of blocks) {
      const lines = block.split('\n');
      const hashLine = lines[0];
      if (!hashLine) continue;

      const hash = hashLine.split(' ')[0];
      const authorLine = lines.find(l => l.startsWith('Author:'));
      const dateLine = lines.find(l => l.startsWith('Date:'));

      if (!authorLine || !dateLine) continue;

      const author = authorLine.replace('Author:', '').trim();
      const dateStr = dateLine.replace('Date:', '').trim();

      // Find message (after the date, before the diff marker)
      const dateIdx = lines.indexOf(dateLine);
      const messageLines = lines.slice(dateIdx + 1).filter(l => !l.startsWith('@@') && !l.startsWith('-') && !l.startsWith('+'));
      const message = messageLines.join(' ').trim();

      commits.push({
        hash,
        shortHash: hash.substring(0, 7),
        message: message || 'No message',
        author: author.split('<')[0].trim(),
        authorEmail: '',
        date: new Date(dateStr),
        parents: [],
      });
    }

    return commits;
  }
}
