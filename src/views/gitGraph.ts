import * as vscode from 'vscode';
import { GitService } from '../git/service';

export class GitGraphPanel {
  public static currentPanel: GitGraphPanel | undefined;
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
          case 'checkout':
            await this.git.checkoutBranch(message.branch);
            vscode.window.showInformationMessage(`Switched to ${message.branch}`);
            await this.update();
            break;
          case 'showDiff':
            const { DiffViewerPanel } = await import('./diff');
            await DiffViewerPanel.showCommitDiff(message.hash);
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

    if (GitGraphPanel.currentPanel) {
      GitGraphPanel.currentPanel.panel.reveal(column);
      await GitGraphPanel.currentPanel.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'git-ide-graph',
      'Git Graph',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    GitGraphPanel.currentPanel = new GitGraphPanel(panel);
    await GitGraphPanel.currentPanel.update();
  }

  private async update(): Promise<void> {
    const entries = await this.git.getGraphLog(100);
    const branches = await this.git.getBranches();

    this.panel.webview.html = this.getHtml(entries, branches.map(b => b.name));
  }

  private getHtml(entries: any[], branches: string[]): string {
    const commits = entries.map((e, i) => ({
      ...e,
      index: i,
      dateStr: this.formatDate(e.date),
      refsStr: e.refs.join(', '),
    }));

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 0; color: var(--vscode-foreground); overflow-x: hidden; }
    .graph-container { display: flex; height: 100vh; }
    .graph-lanes { width: 120px; flex-shrink: 0; background: var(--vscode-editor-background); overflow: hidden; }
    .commit-list { flex: 1; overflow: auto; }
    .commit-row {
      display: flex; align-items: center; padding: 4px 12px; height: 28px;
      border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer;
    }
    .commit-row:hover { background: var(--vscode-list-hoverBackground); }
    .commit-dot { width: 10px; height: 10px; border-radius: 50%; margin-right: 12px; flex-shrink: 0; }
    .commit-msg { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
    .commit-hash { font-family: monospace; font-size: 12px; opacity: 0.6; margin-left: 8px; width: 60px; }
    .commit-author { font-size: 12px; opacity: 0.6; width: 120px; overflow: hidden; text-overflow: ellipsis; }
    .commit-date { font-size: 12px; opacity: 0.5; width: 80px; text-align: right; }
    .ref-badge {
      display: inline-block; padding: 1px 6px; margin-left: 6px; font-size: 11px;
      border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    }
    .ref-badge.head { background: var(--vscode-terminal-ansiGreen); color: #000; }
    .ref-badge.remote { background: var(--vscode-terminal-ansiBlue); color: #fff; }
    .empty { padding: 40px; text-align: center; opacity: 0.5; }
    svg.graph-svg { width: 120px; height: 100%; }
  </style>
</head>
<body>
  <div class="graph-container">
    <div class="graph-lanes">
      <svg class="graph-svg" viewBox="0 0 120 ${entries.length * 28}" xmlns="http://www.w3.org/2000/svg">
        ${this.renderGraphLines(entries)}
      </svg>
    </div>
    <div class="commit-list">
      ${commits.length === 0 ? '<div class="empty">No commits</div>' :
        commits.map(c => `
          <div class="commit-row" onclick="showDiff('${c.hash}')">
            <div class="commit-dot" style="background: ${this.getCommitColor(c.index)}"></div>
            <span class="commit-msg">
              ${this.escapeHtml(c.message)}
              ${c.refsStr ? c.refsStr.split(', ').map((r: string) => {
                const cls = r === 'HEAD' ? 'head' : r.includes('/') ? 'remote' : '';
                return `<span class="ref-badge ${cls}">${this.escapeHtml(r)}</span>`;
              }).join('') : ''}
            </span>
            <span class="commit-hash">${c.shortHash}</span>
            <span class="commit-author">${this.escapeHtml(c.author)}</span>
            <span class="commit-date">${c.dateStr}</span>
          </div>
        `).join('')}
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function showDiff(hash) { vscode.postMessage({ command: 'showDiff', hash }); }
    function checkout(branch) { vscode.postMessage({ command: 'checkout', branch }); }
  </script>
</body>
</html>`;
  }

  private renderGraphLines(entries: any[]): string {
    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#795548'];
    let svg = '';

    for (let i = 0; i < entries.length; i++) {
      const y = i * 28 + 14;
      const color = this.getCommitColor(i);
      const nextY = (i + 1) * 28 + 14;

      // Main node
      svg += `<circle cx="20" cy="${y}" r="4" fill="${color}" />`;

      // Connection line to next
      if (i < entries.length - 1) {
        svg += `<line x1="20" y1="${y}" x2="20" y2="${nextY}" stroke="${color}" stroke-width="2" />`;
      }

      // Branch lines for parents
      const entry = entries[i];
      if (entry.parents && entry.parents.length > 1) {
        // Merge commit - draw branch lines
        svg += `<line x1="20" y1="${y}" x2="50" y2="${nextY}" stroke="${colors[(i + 1) % colors.length]}" stroke-width="2" />`;
      }
    }

    return svg;
  }

  private getCommitColor(index: number): string {
    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#795548'];
    return colors[index % colors.length];
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private dispose(): void {
    GitGraphPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
