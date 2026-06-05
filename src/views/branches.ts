import * as vscode from 'vscode';
import { GitService } from '../git/service';
import { Branch } from '../git/types';

const PINNED_KEY = 'git-ide.pinnedBranches';

// Folder item (Star / Branches)
export class BranchFolder extends vscode.TreeItem {
  constructor(label: string, icon: string, public readonly folderType: 'pinned' | 'local' | 'remote') {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = 'folder';
  }
}

// Branch item
export class BranchItem extends vscode.TreeItem {
  constructor(
    public readonly branch: Branch,
    public readonly pinned: boolean = false
  ) {
    super(branch.name, vscode.TreeItemCollapsibleState.None);

    this.tooltip = this.getTooltip();
    this.description = this.getDescription();
    this.contextValue = pinned ? 'pinnedBranch' : 'branch';

    if (branch.current) {
      this.iconPath = new vscode.ThemeIcon('git-branch', new vscode.ThemeColor('charts.green'));
    } else if (pinned) {
      this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
    } else if (branch.remote) {
      this.iconPath = new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.blue'));
    } else {
      this.iconPath = new vscode.ThemeIcon('git-branch');
    }
  }

  private getTooltip(): string {
    const parts = [this.branch.name];
    if (this.branch.current) parts.push('(current)');
    if (this.pinned) parts.push('📌 Pinned');
    if (this.branch.upstream) parts.push(`→ ${this.branch.upstream}`);
    if (this.branch.ahead) parts.push(`${this.branch.ahead} ahead`);
    if (this.branch.behind) parts.push(`${this.branch.behind} behind`);
    return parts.join('\n');
  }

  private getDescription(): string {
    const parts: string[] = [];
    if (this.branch.ahead) parts.push(`↑${this.branch.ahead}`);
    if (this.branch.behind) parts.push(`↓${this.branch.behind}`);
    return parts.join(' ');
  }
}

type TreeItem = BranchFolder | BranchItem;

export class BranchesProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private git: GitService;
  private state: vscode.Memento;
  private allBranches: Branch[] = [];

  constructor(state: vscode.Memento) {
    this.git = new GitService();
    this.state = state;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  private getPinnedBranches(): string[] {
    return this.state.get<string[]>(PINNED_KEY, []);
  }

  private async savePinnedBranches(pinned: string[]): Promise<void> {
    await this.state.update(PINNED_KEY, pinned);
  }

  async togglePin(item: BranchItem): Promise<void> {
    const pinned = this.getPinnedBranches();
    const index = pinned.indexOf(item.branch.name);

    if (index >= 0) {
      pinned.splice(index, 1);
    } else {
      pinned.push(item.branch.name);
    }

    await this.savePinnedBranches(pinned);
    this.refresh();
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    // Root level: show folders
    if (!element) {
      try {
        this.allBranches = await this.git.getBranches();
      } catch (error: any) {
        vscode.window.showErrorMessage(`Git: ${error.message}`);
        return [];
      }

      const pinnedNames = this.getPinnedBranches();
      const hasPinned = pinnedNames.length > 0;

      const folders: TreeItem[] = [];

      if (hasPinned) {
        folders.push(new BranchFolder('★ Star', 'star-full', 'pinned'));
      }
      folders.push(new BranchFolder('Branches', 'git-branch', 'local'));

      const remote = this.allBranches.filter(b => b.remote);
      if (remote.length > 0) {
        folders.push(new BranchFolder('Remote', 'cloud', 'remote'));
      }

      return folders;
    }

    // Children of folders
    if (element instanceof BranchFolder) {
      const pinnedNames = this.getPinnedBranches();

      if (element.folderType === 'pinned') {
        // Show pinned branches
        const pinnedBranches = this.allBranches.filter(b => !b.remote && pinnedNames.includes(b.name));
        pinnedBranches.sort((a, b) => a.name.localeCompare(b.name));
        return pinnedBranches.map(b => new BranchItem(b, true));
      }

      if (element.folderType === 'local') {
        // Show local branches (excluding pinned)
        const local = this.allBranches.filter(b => !b.remote && !pinnedNames.includes(b.name));
        local.sort((a, b) => {
          if (a.current) return -1;
          if (b.current) return 1;
          return a.name.localeCompare(b.name);
        });
        return local.map(b => new BranchItem(b, false));
      }

      if (element.folderType === 'remote') {
        // Show remote branches
        const remote = this.allBranches.filter(b => b.remote);
        remote.sort((a, b) => a.name.localeCompare(b.name));
        return remote.map(b => new BranchItem(b, false));
      }
    }

    return [];
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

  async fetch(): Promise<void> {
    try {
      await this.git.fetch();
      this.refresh();
      vscode.window.showInformationMessage('Fetched all branches');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Fetch failed: ${error.message}`);
    }
  }

  async pullCurrent(): Promise<void> {
    try {
      const branch = await this.git.getCurrentBranch();
      await this.git.pullBranch(branch);
      this.refresh();
      vscode.window.showInformationMessage(`Pulled ${branch}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Pull failed: ${error.message}`);
    }
  }

  async pushBranch(item: BranchItem): Promise<void> {
    try {
      await this.git.pushBranch(item.branch.name);
      this.refresh();
      vscode.window.showInformationMessage(`Pushed ${item.branch.name}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Push failed: ${error.message}`);
    }
  }

  async fetchBranch(item: BranchItem): Promise<void> {
    try {
      await this.git.fetchBranch(item.branch.name);
      this.refresh();
      vscode.window.showInformationMessage(`Fetched ${item.branch.name}`);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Fetch failed: ${error.message}`);
    }
  }
}
