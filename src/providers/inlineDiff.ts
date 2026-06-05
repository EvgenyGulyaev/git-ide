import * as vscode from 'vscode';
import { GitService } from '../git/service';

export class InlineDiffProvider {
  private git: GitService;
  private addedDecorationType: vscode.TextEditorDecorationType;
  private removedDecorationType: vscode.TextEditorDecorationType;
  private modifiedDecorationType: vscode.TextEditorDecorationType;
  private cache = new Map<string, Set<number>[]>();

  constructor() {
    this.git = new GitService();

    this.addedDecorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      gutterIconPath: new vscode.ThemeIcon('add').id as any,
      gutterIconSize: 'contain',
      overviewRulerColor: 'rgba(72, 191, 84, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      backgroundColor: 'rgba(72, 191, 84, 0.1)',
    });

    this.removedDecorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      gutterIconPath: new vscode.ThemeIcon('remove').id as any,
      gutterIconSize: 'contain',
      overviewRulerColor: 'rgba(255, 0, 0, 0.6)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      backgroundColor: 'rgba(255, 0, 0, 0.08)',
    });

    this.modifiedDecorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      gutterIconPath: new vscode.ThemeIcon('edit').id as any,
      gutterIconSize: 'contain',
      overviewRulerColor: 'rgba(255, 200, 0, 0.6)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  }

  async updateDecorations(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    if (document.uri.scheme !== 'file') return;

    const filePath = document.uri.fsPath;

    try {
      const diff = await this.git.getDiff(filePath);
      const { addedLines, removedLines, modifiedLines } = this.parseDiffLines(diff);

      const addedRanges = Array.from(addedLines).map(line =>
        new vscode.Range(line, 0, line, 0)
      );
      const removedRanges = Array.from(removedLines).map(line =>
        new vscode.Range(line, 0, line, 0)
      );
      const modifiedRanges = Array.from(modifiedLines).map(line =>
        new vscode.Range(line, 0, line, 0)
      );

      editor.setDecorations(this.addedDecorationType, addedRanges);
      editor.setDecorations(this.removedDecorationType, removedRanges);
      editor.setDecorations(this.modifiedDecorationType, modifiedRanges);
    } catch {
      // Not in git repo or file not tracked
    }
  }

  private parseDiffLines(diff: string): {
    addedLines: Set<number>;
    removedLines: Set<number>;
    modifiedLines: Set<number>;
  } {
    const addedLines = new Set<number>();
    const removedLines = new Set<number>();
    const modifiedLines = new Set<number>();

    const lines = diff.split('\n');
    let newLine = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          newLine = parseInt(match[1]) - 1;
        }
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        newLine++;
        addedLines.add(newLine - 1);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        removedLines.add(newLine);
      } else if (!line.startsWith('\\')) {
        newLine++;
      }
    }

    return { addedLines, removedLines, modifiedLines };
  }

  dispose(): void {
    this.addedDecorationType.dispose();
    this.removedDecorationType.dispose();
    this.modifiedDecorationType.dispose();
    this.cache.clear();
  }
}
