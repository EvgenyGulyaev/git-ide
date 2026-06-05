import * as vscode from 'vscode';
import { GitService } from '../git/service';

export class CommitInputProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'git-ide.commitInput';
  private _view?: vscode.WebviewView;
  private git: GitService;
  private lastMessage = '';

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.git = new GitService();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'commit':
          await this.doCommit(message.message, false);
          break;
        case 'amend':
          await this.doCommit(message.message, true);
          break;
        case 'refresh':
          this.lastMessage = message.message || '';
          break;
      }
    });
  }

  private async doCommit(message: string, amend: boolean): Promise<void> {
    if (!message.trim() && !amend) {
      vscode.window.showWarningMessage('Enter commit message');
      return;
    }

    try {
      if (amend) {
        await this.git.amendCommit(message.trim() || undefined);
        vscode.window.showInformationMessage('Commit amended');
      } else {
        await this.git.commit(message.trim());
        vscode.window.showInformationMessage('Changes committed');
      }

      // Clear message
      this.lastMessage = '';
      if (this._view) {
        this._view.webview.html = this.getHtml();
      }

      // Refresh changes view
      vscode.commands.executeCommand('git-ide.refreshChanges');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Commit failed: ${error.message}`);
    }
  }

  refresh(): void {
    if (this._view) {
      this._view.webview.html = this.getHtml();
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 8px;
      color: var(--vscode-foreground);
    }
    textarea {
      width: 100%;
      min-height: 60px;
      resize: vertical;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 6px 8px;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      box-sizing: border-box;
    }
    textarea:focus {
      border-color: var(--vscode-focusBorder);
      outline: none;
    }
    .buttons {
      display: flex;
      gap: 6px;
      margin-top: 6px;
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
    .commit-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .amend-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .amend-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-secondaryBackground));
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
  </style>
</head>
<body>
  <textarea id="message" placeholder="Commit message...">${this.lastMessage}</textarea>
  <div class="buttons">
    <button class="commit-btn" onclick="commit()">Commit</button>
    <button class="amend-btn" onclick="amend()">Amend</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const textarea = document.getElementById('message');

    // Save message on change
    textarea.addEventListener('input', () => {
      vscode.postMessage({ command: 'refresh', message: textarea.value });
    });

    function commit() {
      const msg = textarea.value.trim();
      if (msg) vscode.postMessage({ command: 'commit', message: msg });
    }

    function amend() {
      vscode.postMessage({ command: 'amend', message: textarea.value.trim() });
    }

    // Ctrl+Enter to commit
    textarea.addEventListener('keydown', (e) => {
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
