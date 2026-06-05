import * as vscode from 'vscode';
import { GitService } from '../git/service';

export class GitCodeLensProvider implements vscode.CodeLensProvider {
  private git: GitService;
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor() {
    this.git = new GitService();
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    if (document.uri.scheme !== 'file') return [];

    const lenses: vscode.CodeLens[] = [];

    try {
      const filePath = document.uri.fsPath;
      const blame = await this.git.getBlame(filePath);

      // Group consecutive lines by same author
      let currentAuthor = '';
      let startLine = 0;

      for (let i = 0; i < blame.length; i++) {
        const line = blame[i];
        if (line.author !== currentAuthor) {
          if (currentAuthor && i > 0) {
            // Add code lens for previous group
            const range = new vscode.Range(startLine, 0, startLine, 0);
            lenses.push(new vscode.CodeLens(range, {
              title: `${currentAuthor} (${i - startLine} lines)`,
              command: '',
              arguments: [],
            }));
          }
          currentAuthor = line.author;
          startLine = i;
        }
      }

      // Last group
      if (currentAuthor) {
        const range = new vscode.Range(startLine, 0, startLine, 0);
        lenses.push(new vscode.CodeLens(range, {
          title: `${currentAuthor} (${blame.length - startLine} lines)`,
          command: '',
          arguments: [],
        }));
      }

      // Add "Stage Selection" lens if there are changes
      const diff = await this.git.getDiff(filePath);
      if (diff.trim()) {
        const firstLine = new vscode.Range(0, 0, 0, 0);
        lenses.push(new vscode.CodeLens(firstLine, {
          title: '$(git-pull-request) Stage Changes',
          command: 'git-ide.stageFile',
          arguments: [filePath],
        }));
      }
    } catch {
      // File not in git
    }

    return lenses;
  }
}
