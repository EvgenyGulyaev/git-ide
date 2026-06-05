import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../git/service';
import { ChangedFile } from '../git/types';

export class ChangesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'git-ide.changes';
  private _view?: vscode.WebviewView;
  private git: GitService;
  private files: ChangedFile[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;
  private _onDidChangeFiles = new vscode.EventEmitter<number>();
  readonly onDidChangeFiles = this._onDidChangeFiles.event;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.git = new GitService();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();

    // Refresh when view becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.refresh();
      }
    });

    // Refresh on initial show
    this.refresh();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'stage':
          await this.git.stageFile(message.path);
          await this.refresh();
          break;
        case 'unstage':
          await this.git.unstageFile(message.path);
          await this.refresh();
          break;
        case 'stageAll':
          await this.git.stageAll();
          await this.refresh();
          break;
        case 'unstageAll':
          await this.git.unstageAll();
          await this.refresh();
          break;
        case 'commit':
          await this.doCommit(message.message, false, false);
          break;
        case 'commitPush':
          await this.doCommit(message.message, false, true);
          break;
        case 'openFile':
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (workspaceFolder) {
            const fullPath = path.join(workspaceFolder.uri.fsPath, message.path);
            const uri = vscode.Uri.file(fullPath);
            await vscode.commands.executeCommand('vscode.open', uri);
          }
          break;
        case 'getLastMessage':
          const lastMsg = await this.git.getLastCommitMessage();
          if (this._view) {
            this._view.webview.postMessage({ command: 'setLastMessage', message: lastMsg });
          }
          break;
      }
    });
  }

  refresh(): void {
    // Debounce: wait 300ms before updating
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => this.doRefresh(), 300);
  }

  private async doRefresh(): Promise<void> {
    try {
      this.files = await this.git.getChangedFiles();
    } catch {
      this.files = [];
    }
    this._onDidChangeFiles.fire(this.files.length);
    if (this._view) {
      this._view.webview.html = this.getHtml();
    }
  }

  getFileCount(): number {
    return this.files.length;
  }

  private async doCommit(message: string, _amend: boolean, push: boolean): Promise<void> {
    if (!message.trim()) {
      vscode.window.showWarningMessage('Enter commit message');
      return;
    }

    try {
      await this.git.commit(message.trim());
      vscode.window.showInformationMessage('Changes committed');

      if (push) {
        try {
          await this.git.push();
          vscode.window.showInformationMessage('Pushed to remote');
        } catch (error: any) {
          vscode.window.showErrorMessage(`Push failed: ${error.message}`);
        }
      }

      await this.refresh();
    } catch (error: any) {
      vscode.window.showErrorMessage(`Commit failed: ${error.message}`);
    }
  }

  private getHtml(): string {
    const staged = this.files.filter(f => f.staged);
    const unstaged = this.files.filter(f => !f.staged && f.status !== 'untracked');
    const untracked = this.files.filter(f => f.status === 'untracked');

    const statusIcon = (f: ChangedFile) => {
      if (f.staged) return '🟢';
      switch (f.status) {
        case 'untracked': return '🔴';
        case 'added': return '🔴';
        case 'deleted': return '🗑️';
        case 'modified': return '🔵';
        case 'renamed': return '🔵';
        default: return '🔵';
      }
    };

    const renderFile = (f: ChangedFile) => `
      <div class="file-item">
        <input type="checkbox" ${f.staged ? 'checked' : ''} onchange="toggleStaging('${f.path}', this.checked)" />
        <span class="file-icon">${statusIcon(f)}</span>
        <span class="file-path" onclick="openFile('${f.path}')">${f.path}</span>
        <span class="file-status">${f.status}</span>
      </div>
    `;

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: 12px;
      color: var(--vscode-foreground);
      padding: 0;
      margin: 0;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      background: var(--vscode-sideBarSectionHeader-background, rgba(0,0,0,0.1));
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .section-header button {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 14px;
      padding: 0 4px;
      opacity: 0.7;
    }
    .section-header button:hover { opacity: 1; }
    .file-item {
      display: flex;
      align-items: center;
      padding: 3px 8px;
      gap: 6px;
      cursor: default;
    }
    .file-item:hover { background: var(--vscode-list-hoverBackground); }
    .file-item input[type="checkbox"] {
      margin: 0;
      cursor: pointer;
    }
    .file-icon { font-size: 11px; }
    .file-path {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }
    .file-path:hover { text-decoration: underline; }
    .file-status { font-size: 10px; opacity: 0.6; }
    .commit-area {
      border-top: 1px solid var(--vscode-panel-border);
      padding: 8px;
    }
    .commit-area textarea {
      width: 100%;
      min-height: 50px;
      resize: vertical;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 6px 8px;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      box-sizing: border-box;
      margin-bottom: 6px;
    }
    .commit-area textarea:focus {
      border-color: var(--vscode-focusBorder);
      outline: none;
    }
    .commit-options {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .commit-options label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      cursor: pointer;
    }
    .commit-buttons {
      display: flex;
      gap: 6px;
    }
    button {
      flex: 1;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 12px;
      border: none;
      border-radius: 3px;
      font-family: var(--vscode-font-family);
    }
    .commit-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .commit-btn:hover { background: var(--vscode-button-hoverBackground); }
    .push-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .push-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-secondaryBackground)); }
    .empty {
      padding: 20px;
      text-align: center;
      opacity: 0.5;
      font-style: italic;
    }
  </style>
</head>
<body>
  ${staged.length > 0 ? `
    <div class="section-header">
      <span>Staged (${staged.length})</span>
      <button onclick="unstageAll()" title="Unstage All">↩</button>
    </div>
    ${staged.map(renderFile).join('')}
  ` : ''}

  ${unstaged.length > 0 ? `
    <div class="section-header">
      <span>Changes (${unstaged.length})</span>
      <button onclick="stageAll()" title="Stage All">✓</button>
    </div>
    ${unstaged.map(renderFile).join('')}
  ` : ''}

  ${untracked.length > 0 ? `
    <div class="section-header">
      <span>Untracked (${untracked.length})</span>
      <button onclick="stageAll()" title="Stage All">✓</button>
    </div>
    ${untracked.map(renderFile).join('')}
  ` : ''}

  ${this.files.length === 0 ? '<div class="empty">No changes</div>' : ''}

  <div class="commit-area">
    <textarea id="message" placeholder="Commit message..."></textarea>
    <div class="commit-options">
      <label>
        <input type="checkbox" id="amend" onchange="toggleAmend()" /> Amend
      </label>
    </div>
    <div class="commit-buttons">
      <button class="commit-btn" onclick="commit()">Commit</button>
      <button class="push-btn" onclick="commitPush()">Commit & Push</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let lastMessage = '';

    // Listen for messages from extension
    window.addEventListener('message', (event) => {
      if (event.data.command === 'setLastMessage') {
        lastMessage = event.data.message;
        const amend = document.getElementById('amend');
        const textarea = document.getElementById('message');
        if (amend.checked) {
          textarea.value = lastMessage;
        }
      }
    });

    function toggleAmend() {
      const amend = document.getElementById('amend');
      const textarea = document.getElementById('message');
      if (amend.checked) {
        // Request last commit message
        vscode.postMessage({ command: 'getLastMessage' });
      } else {
        textarea.value = '';
      }
    }

    function toggleStaging(path, staged) {
      vscode.postMessage({ command: staged ? 'stage' : 'unstage', path });
    }
    function stageAll() { vscode.postMessage({ command: 'stageAll' }); }
    function unstageAll() { vscode.postMessage({ command: 'unstageAll' }); }
    function openFile(path) { vscode.postMessage({ command: 'openFile', path }); }

    function commit() {
      const msg = document.getElementById('message').value.trim();
      if (msg) vscode.postMessage({ command: 'commit', message: msg });
    }

    function commitPush() {
      const msg = document.getElementById('message').value.trim();
      if (msg) vscode.postMessage({ command: 'commitPush', message: msg });
    }

    // Ctrl+Enter to commit
    document.getElementById('message').addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
    });
  </script>
</body>
</html>`;
  }
}
