import * as vscode from 'vscode';
import { GitService } from '../git/service';
import { BranchesProvider } from '../views/branches';

export class BranchSwitcher {
  private git: GitService;
  private branchesProvider: BranchesProvider;

  constructor(branchesProvider: BranchesProvider) {
    this.git = new GitService();
    this.branchesProvider = branchesProvider;
  }

  async show(): Promise<void> {
    try {
      const branches = await this.git.getBranches();
      const current = branches.find(b => b.current);

      const items = branches
        .filter(b => !b.remote)
        .map(b => ({
          label: b.current ? `$(check) ${b.name}` : `$(git-branch) ${b.name}`,
          description: b.current ? '(current)' : '',
          branch: b,
        }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select branch to checkout',
        matchOnDescription: true,
      });

      if (selected && !selected.branch.current) {
        await this.git.checkoutBranch(selected.branch.name);
        this.branchesProvider.refresh();
        vscode.window.showInformationMessage(`Switched to ${selected.branch.name}`);
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Branch switch failed: ${error.message}`);
    }
  }
}
