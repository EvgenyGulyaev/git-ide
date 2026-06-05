import * as vscode from 'vscode';
import { GitService } from '../git/service';
import { ChangedFile } from '../git/types';

export class CommitPanel {
  public static currentPanel: CommitPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private git: GitService;
  private files: ChangedFile[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    this.git = new GitService();
    this.update();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'stage':
            await this.git.stageFile(message.path);
            await this.update();
            break;
          case 'unstage':
            await this.git.unstageFile(message.path);
            await this.update();
            break;
          case 'stageAll':
            await this.git.stageAll();
            await this.update();
            break;
          case 'unstageAll':
            await this.git.unstageAll();
            await this.update();
            break;
          case 'commit':
            await this.git.commit(message.message);
            vscode.window.showInformationMessage('Changes committed');
            await this.update();
            break;
          case 'amend':
            await this.git.amendCommit(message.message || undefined);
            vscode.window.showInformationMessage('Commit amended');
            await this.update();
            break;
          case 'refresh':
            await this.update();
            break;
        }
      },
      null,
      this.disposables
    );
  }

  static async show(): Promise<void> {
    const column = vscode.ViewColumn.One;

    if (CommitPanel.currentPanel) {
      CommitPanel.currentPanel.panel.reveal(column);
      await CommitPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'git-ide-commit',
      'Git Commit',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    CommitPanel.currentPanel = new CommitPanel(panel);
  }

  private async update(): Promise<void> {
    this.files = await this.git.getChangedFiles();
    const lastMessage = await this.git.getLastCommitMessage();
    this.panel.webview.html = this.getHtml(this.files, lastMessage);
  }

  private getHtml(files: ChangedFile[], lastMessage: string): string {
    const staged = files.filter(f => f.staged);
    const unstaged = files.filter(f => !f.staged);

    const statusIcon = (status: string) => {
      switch (status) {
        case 'added': return '🟢';
        case 'modified': return '🟡';
        case 'deleted': return '🔴';
        case 'renamed': return '🔵';
        case 'untracked': return '⚪';
        default: return '🟡';
      }
    };

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
    .section { margin-bottom: 16px; }
    .section-title { font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .file-list { margin-left: 8px; }
    .file-item { display: flex; align-items: center; padding: 4px 0; gap: 8px; cursor: pointer; }
    .file-item:hover { background: var(--vscode-list-hoverBackground); }
    .file-path { flex: 1; }
    .file-status { font-size: 12px; opacity: 0.7; }
    textarea {
      width: 100%; min-height: 80px; resize: vertical;
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border); padding: 8px;
      font-family: var(--vscode-font-family);
    }
    .buttons { display: flex; gap: 8px; margin-top: 8px; }
    button {
      padding: 6px 16px; cursor: pointer;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 2px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .empty { opacity: 0.5; font-style: italic; }
  </style>
</head>
<body>
  <div class="section">
    <div class="section-title">
      Staged (${staged.length})
      <button class="secondary" onclick="unstageAll()">Unstage All</button>
    </div>
    <div class="file-list">
      ${staged.length === 0 ? '<div class="empty">No staged files</div>' :
        staged.map(f => `
          <div class="file-item" onclick="unstage('${f.path}')">
            <span>${statusIcon(f.status)}</span>
            <span class="file-path">${f.path}</span>
            <span class="file-status">${f.status}</span>
          </div>
        `).join('')}
    </div>
  </div>

  <div class="section">
    <div class="section-title">
      Changes (${unstaged.length})
      <button class="secondary" onclick="stageAll()">Stage All</button>
    </div>
    <div class="file-list">
      ${unstaged.length === 0 ? '<div class="empty">No unstaged changes</div>' :
        unstaged.map(f => `
          <div class="file-item" onclick="stage('${f.path}')">
            <span>${statusIcon(f.status)}</span>
            <span class="file-path">${f.path}</span>
            <span class="file-status">${f.status}</span>
          </div>
        `).join('')}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Commit Message</div>
    <textarea id="message" placeholder="Commit message..."></textarea>
    <div class="buttons">
      <button onclick="commit()" ${staged.length === 0 ? 'disabled' : ''}>Commit</button>
      <button onclick="amend()" class="secondary">Amend Last</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function stage(path) { vscode.postMessage({ command: 'stage', path }); }
    function unstage(path) { vscode.postMessage({ command: 'unstage', path }); }
    function stageAll() { vscode.postMessage({ command: 'stageAll' }); }
    function unstageAll() { vscode.postMessage({ command: 'unstageAll' }); }

    function commit() {
      const msg = document.getElementById('message').value.trim();
      if (msg) vscode.postMessage({ command: 'commit', message: msg });
    }

    function amend() {
      const msg = document.getElementById('message').value.trim();
      vscode.postMessage({ command: 'amend', message: msg || undefined });
    }
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    CommitPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
