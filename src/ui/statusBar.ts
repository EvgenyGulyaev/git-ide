import * as vscode from 'vscode';
import { GitService } from '../git/service';

export class StatusBar {
  private item: vscode.StatusBarItem;
  private git: GitService;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.git = new GitService();
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'git-ide.branchSwitcher';
    this.disposables.push(this.item);
  }

  async update(): Promise<void> {
    try {
      const branch = await this.git.getCurrentBranch();
      const { ahead, behind } = await this.git.getAheadBehind();

      let text = `$(git-branch) ${branch}`;
      if (ahead > 0) text += ` $(arrow-up)${ahead}`;
      if (behind > 0) text += ` $(arrow-down)${behind}`;

      this.item.text = text;
      this.item.tooltip = `Branch: ${branch}`;
      this.item.show();
    } catch {
      this.item.hide();
    }
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
