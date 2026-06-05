import * as vscode from 'vscode';
import { GitService } from '../git/service';

export class MergeResolverPanel {
  public static currentPanel: MergeResolverPanel | undefined;
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
          case 'resolveOurs':
            await this.resolve(message.path, 'ours');
            break;
          case 'resolveTheirs':
            await this.resolve(message.path, 'theirs');
            break;
          case 'openFile':
            const doc = await vscode.workspace.openTextDocument(message.path);
            await vscode.window.showTextDocument(doc);
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

    if (MergeResolverPanel.currentPanel) {
      MergeResolverPanel.currentPanel.panel.reveal(column);
      await MergeResolverPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'git-ide-merge',
      'Merge Conflicts',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    MergeResolverPanel.currentPanel = new MergeResolverPanel(panel);
    await MergeResolverPanel.currentPanel.update();
  }

  private async update(): Promise<void> {
    const conflicts = await this.git.getConflicts();
    this.panel.webview.html = this.getHtml(conflicts);
  }

  private async resolve(filePath: string, side: 'ours' | 'theirs'): Promise<void> {
    try {
      await this.git.resolveConflict(filePath, side);
      vscode.window.showInformationMessage(`Resolved ${filePath} using ${side}`);
      await this.update();
    } catch (error: any) {
      vscode.window.showErrorMessage(`Resolve failed: ${error.message}`);
    }
  }

  private getHtml(conflicts: string[]): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
    h2 { margin: 0 0 16px; }
    .conflict-item {
      display: flex; align-items: center; padding: 8px; margin: 4px 0;
      background: var(--vscode-editor-background); border-radius: 4px;
      border-left: 3px solid var(--vscode-gitDecoration-conflictingResourceForeground, orange);
    }
    .file-path { flex: 1; margin-left: 8px; }
    .buttons { display: flex; gap: 4px; }
    button {
      padding: 4px 12px; cursor: pointer; font-size: 12px;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 2px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.ours { background: var(--vscode-diffEditor-insertedTextBackground); }
    button.theirs { background: var(--vscode-diffEditor-removedTextBackground); }
    .empty { opacity: 0.5; font-style: italic; padding: 20px; text-align: center; }
    .count { font-size: 14px; opacity: 0.7; }
  </style>
</head>
<body>
  <h2>Merge Conflicts <span class="count">(${conflicts.length})</span></h2>
  ${conflicts.length === 0 ? '<div class="empty">No conflicts — merge is clean ✅</div>' :
    conflicts.map(f => `
      <div class="conflict-item">
        <span>⚡</span>
        <span class="file-path">${f}</span>
        <div class="buttons">
          <button class="ours" onclick="resolveOurs('${f}')">Ours</button>
          <button class="theirs" onclick="resolveTheirs('${f}')">Theirs</button>
          <button onclick="openFile('${f}')">Edit</button>
        </div>
      </div>
    `).join('')}

  <script>
    const vscode = acquireVsCodeApi();
    function resolveOurs(path) { vscode.postMessage({ command: 'resolveOurs', path }); }
    function resolveTheirs(path) { vscode.postMessage({ command: 'resolveTheirs', path }); }
    function openFile(path) { vscode.postMessage({ command: 'openFile', path }); }
  </script>
</body>
</html>`;
  }

  private dispose(): void {
    MergeResolverPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
