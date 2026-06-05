import * as vscode from 'vscode';
import { GitService } from '../git/service';
import { BlameLine } from '../git/types';

export class BlameDecorationProvider {
  private decorationType: vscode.TextEditorDecorationType;
  private git: GitService;
  private active = false;
  private cache = new Map<string, BlameLine[]>();

  constructor() {
    this.git = new GitService();
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 3em',
      },
    });
  }

  async toggle(): Promise<void> {
    this.active = !this.active;

    if (this.active) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await this.updateDecorations(editor);
      }
    } else {
      // Clear decorations
      vscode.window.visibleTextEditors.forEach(editor => {
        editor.setDecorations(this.decorationType, []);
      });
      this.cache.clear();
    }
  }

  async updateDecorations(editor: vscode.TextEditor): Promise<void> {
    if (!this.active) return;

    const document = editor.document;
    if (document.uri.scheme !== 'file') return;

    const filePath = document.uri.fsPath;
    let blameLines = this.cache.get(filePath);

    if (!blameLines) {
      try {
        blameLines = await this.git.getBlame(filePath);
        this.cache.set(filePath, blameLines);
      } catch {
        return;
      }
    }

    const config = vscode.workspace.getConfiguration('git-ide');
    const dateFormat = config.get<string>('blame.dateFormat', 'YYYY-MM-DD');

    const decorations: vscode.DecorationOptions[] = blameLines.map(line => {
      const date = this.formatDate(line.date, dateFormat);
      return {
        range: new vscode.Range(line.line - 1, 0, line.line - 1, 0),
        renderOptions: {
          after: {
            contentText: `${line.author} ${date} ${line.hash}`,
          },
        },
      };
    });

    editor.setDecorations(this.decorationType, decorations);
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  private formatDate(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day);
  }

  dispose(): void {
    this.decorationType.dispose();
    this.cache.clear();
  }
}
