import * as vscode from 'vscode';
import { GitService } from '../git/service';

export class GitHoverProvider implements vscode.HoverProvider {
  private git: GitService;

  constructor() {
    this.git = new GitService();
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    const filePath = document.uri.fsPath;

    try {
      const blame = await this.git.getBlame(filePath);
      const lineBlame = blame[position.line];

      if (!lineBlame) return;

      const content = new vscode.MarkdownString();
      content.isTrusted = true;

      content.appendMarkdown(`**${lineBlame.author}**\n\n`);
      content.appendMarkdown(`Commit: \`${lineBlame.hash}\`\n\n`);
      content.appendMarkdown(`Date: ${lineBlame.date.toLocaleString()}\n\n`);
      content.appendMarkdown(`[View Diff](command:git-ide.showLineDiff?${encodeURIComponent(JSON.stringify([filePath, position.line]))})`);

      return new vscode.Hover(content);
    } catch {
      return undefined;
    }
  }
}
