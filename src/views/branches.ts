import * as vscode from 'vscode';
import { GitService } from '../git/service';
import { Branch } from '../git/types';

export class BranchItem extends vscode.TreeItem {
  constructor(
    public readonly branch: Branch,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(branch.name, collapsibleState);

    this.tooltip = this.getTooltip();
    this.description = this.getDescription();
    this.contextValue = 'branch';

    if (branch.current) {
      this.iconPath = new vscode.ThemeIcon('git-branch', new vscode.ThemeColor('charts.green'));
      this.label = `$(check) ${branch.name}`;
    } else {
      this.iconPath = new vscode.ThemeIcon('git-branch');
    }
  }

  private getTooltip(): string {
    const parts = [this.branch.name];
    if (this.branch.current) parts.push('(current)');
    if (this.branch.upstream) parts.push(`→ ${this.branch.upstream}`);
    if (this.branch.ahead) parts.push(`${this.branch.ahead} ahead`);
    if (this.branch.behind) parts.push(`${this.branch.behind} behind`);
    return parts.join(' ');
  }

  private getDescription(): string {
    const parts: string[] = [];
    if (this.branch.ahead) parts.push(`↑${this.branch.ahead}`);
    if (this.branch.behind) parts.push(`↓${this.branch.behind}`);
    return parts.join(' ');
  }
}

export class BranchesProvider implements vscode.TreeDataProvider<BranchItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BranchItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private git: GitService;

  constructor() {
    this.git = new GitService();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BranchItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BranchItem): Promise<BranchItem[]> {
    if (element) return [];

    try {
      const branches = await this.git.getBranches();

      // Separate local and remote branches
      const local = branches.filter(b => !b.remote);
      const remote = branches.filter(b => b.remote);

      // Sort: current first, then alphabetical
      local.sort((a, b) => {
        if (a.current) return -1;
        if (b.current) return 1;
        return a.name.localeCompare(b.name);
      });

      // Return local branches (remote could be a subtree later)
      return local.map(b => new BranchItem(b, vscode.TreeItemCollapsibleState.None));
    } catch (error: any) {
      vscode.window.showErrorMessage(`Git: ${error.message}`);
      return [];
    }
  }

  async checkoutBranch(item: BranchItem): Promise<void> {
    try {
      await this.git.checkoutBranch(item.branch.name);
      this.refresh();
      vscode.window.showInformationMessage(`Switched to ${item.branch.name}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Checkout failed: ${error.message}`);
    }
  }

  async createBranch(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter new branch name',
      placeHolder: 'feature/my-branch',
    });

    if (!name) return;

    try {
      await this.git.createBranch(name);
      this.refresh();
      vscode.window.showInformationMessage(`Created and switched to ${name}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Create branch failed: ${error.message}`);
    }
  }

  async deleteBranch(item: BranchItem): Promise<void> {
    if (item.branch.current) {
      vscode.window.showWarningMessage('Cannot delete current branch');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Delete branch ${item.branch.name}?`,
      'Delete',
      'Cancel'
    );

    if (confirm !== 'Delete') return;

    try {
      await this.git.deleteBranch(item.branch.name);
      this.refresh();
      vscode.window.showInformationMessage(`Deleted branch ${item.branch.name}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Delete failed: ${error.message}`);
    }
  }
}
