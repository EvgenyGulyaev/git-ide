import * as vscode from 'vscode';
import { GitService } from '../git/service';
import { Commit } from '../git/types';

export class CommitItem extends vscode.TreeItem {
  constructor(public readonly commit: Commit) {
    super(commit.shortHash, vscode.TreeItemCollapsibleState.None);

    this.label = commit.message;
    this.description = `${commit.shortHash} • ${commit.author}`;
    this.tooltip = this.getTooltip();
    this.contextValue = 'commit';

    this.iconPath = new vscode.ThemeIcon('git-commit');
  }

  private getTooltip(): string {
    return [
      `Hash: ${this.commit.hash}`,
      `Author: ${this.commit.author}`,
      `Date: ${this.commit.date.toLocaleString()}`,
      '',
      this.commit.message,
    ].join('\n');
  }
}

export class CommitsProvider implements vscode.TreeDataProvider<CommitItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<CommitItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private git: GitService;

  constructor() {
    this.git = new GitService();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CommitItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<CommitItem[]> {
    try {
      const config = vscode.workspace.getConfiguration('git-ide');
      const limit = config.get<number>('commits.limit', 100);
      const commits = await this.git.getCommits(limit);
      return commits.map(c => new CommitItem(c));
    } catch (error: any) {
      vscode.window.showErrorMessage(`Git: ${error.message}`);
      return [];
    }
  }

  async showDiff(item: CommitItem): Promise<void> {
    try {
      const diff = await this.git.getCommitDiff(item.commit.hash);
      // Open diff in a new editor
      const doc = await vscode.workspace.openTextDocument({
        content: this.formatDiff(diff),
        language: 'diff',
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to show diff: ${error.message}`);
    }
  }

  private formatDiff(diff: { hunks: any[]; oldPath: string; newPath: string }): string {
    const lines = [`--- a/${diff.oldPath}`, `+++ b/${diff.newPath}`];
    for (const hunk of diff.hunks) {
      lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
      lines.push(hunk.content);
    }
    return lines.join('\n');
  }
}
