import * as vscode from 'vscode';
import { GitService } from '../git/service';

export class DiffViewerPanel {
  public static currentPanel: DiffViewerPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private git: GitService;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.git = new GitService();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'stageHunk':
            try {
              await this.git.stageHunk(message.filePath, message.hunk);
              vscode.window.showInformationMessage('Hunk staged');
            } catch (error: any) {
              vscode.window.showErrorMessage(`Stage hunk failed: ${error.message}`);
            }
            break;
          case 'openFile':
            const doc = await vscode.workspace.openTextDocument(message.path);
            await vscode.window.showTextDocument(doc);
            break;
        }
      },
      null,
      this.disposables
    );
  }

  static async showFileDiff(filePath: string): Promise<void> {
    const column = vscode.ViewColumn.Two;

    if (DiffViewerPanel.currentPanel) {
      DiffViewerPanel.currentPanel.panel.reveal(column);
      await DiffViewerPanel.currentPanel.updateFile(filePath);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'git-ide-diff',
      `Diff: ${filePath.split('/').pop()}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    DiffViewerPanel.currentPanel = new DiffViewerPanel(panel);
    await DiffViewerPanel.currentPanel.updateFile(filePath);
  }

  static async showCommitDiff(hash: string): Promise<void> {
    const column = vscode.ViewColumn.Two;

    if (DiffViewerPanel.currentPanel) {
      DiffViewerPanel.currentPanel.panel.reveal(column);
      await DiffViewerPanel.currentPanel.updateCommit(hash);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'git-ide-diff',
      `Diff: ${hash.substring(0, 7)}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    DiffViewerPanel.currentPanel = new DiffViewerPanel(panel);
    await DiffViewerPanel.currentPanel.updateCommit(hash);
  }

  private async updateFile(filePath: string): Promise<void> {
    const [stagedDiff, unstagedDiff] = await Promise.all([
      this.git.getStagedDiff(filePath),
      this.git.getDiff(filePath),
    ]);

    this.panel.title = `Diff: ${filePath.split('/').pop()}`;
    this.panel.webview.html = this.getHtml(filePath, stagedDiff, unstagedDiff);
  }

  private async updateCommit(hash: string): Promise<void> {
    const raw = await this.git.getCommitDiff(hash);
    const diffText = this.formatDiff(raw);
    this.panel.title = `Diff: ${hash.substring(0, 7)}`;
    this.panel.webview.html = this.getHtml(hash, '', diffText);
  }

  private formatDiff(diff: { hunks: any[]; oldPath: string; newPath: string }): string {
    const lines = [`--- a/${diff.oldPath}`, `+++ b/${diff.newPath}`];
    for (const hunk of diff.hunks) {
      lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
      lines.push(hunk.content);
    }
    return lines.join('\n');
  }

  private getHtml(title: string, stagedDiff: string, unstagedDiff: string): string {
    const renderDiff = (diff: string, label: string) => {
      if (!diff.trim()) return '';

      const lines = diff.split('\n');
      let html = `<div class="diff-section"><h3>${label}</h3><div class="diff-content">`;

      for (const line of lines) {
        let cls = 'diff-line';
        if (line.startsWith('+') && !line.startsWith('+++')) cls += ' added';
        else if (line.startsWith('-') && !line.startsWith('---')) cls += ' removed';
        else if (line.startsWith('@@')) cls += ' hunk-header';

        html += `<div class="${cls}">${this.escapeHtml(line)}</div>`;
      }

      html += '</div></div>';
      return html;
    };

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: monospace; padding: 10px; color: var(--vscode-foreground); font-size: 13px; }
    h2 { margin: 0 0 16px; font-size: 16px; }
    h3 { margin: 16px 0 8px; font-size: 14px; opacity: 0.8; }
    .diff-content { border: 1px solid var(--vscode-panel-border); border-radius: 4px; overflow: hidden; }
    .diff-line { padding: 2px 12px; white-space: pre; min-height: 18px; }
    .diff-line.added { background: var(--vscode-diffEditor-insertedTextBackground, rgba(72, 191, 84, 0.15)); }
    .diff-line.removed { background: var(--vscode-diffEditor-removedTextBackground, rgba(255, 0, 0, 0.15)); }
    .diff-line.hunk-header { background: var(--vscode-diffEditor-unchangedCodeBackground, rgba(100, 100, 255, 0.1)); color: var(--vscode-textLink-foreground); }
    .empty { opacity: 0.5; font-style: italic; padding: 12px; }
  </style>
</head>
<body>
  <h2>${this.escapeHtml(title)}</h2>
  ${stagedDiff ? renderDiff(stagedDiff, 'Staged Changes') : ''}
  ${unstagedDiff ? renderDiff(unstagedDiff, 'Unstaged Changes') : ''}
  ${!stagedDiff && !unstagedDiff ? '<div class="empty">No changes</div>' : ''}
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private dispose(): void {
    DiffViewerPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
