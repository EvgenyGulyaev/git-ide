import * as vscode from 'vscode';
import { GitService } from './git/service';
import { BranchesProvider } from './views/branches';
import { CommitsProvider } from './views/commits';
import { FileHistoryProvider, LineHistoryProvider } from './views/fileHistory';
import { DiffViewerPanel } from './views/diff';
import { GitGraphPanel } from './views/gitGraph';
import { StatusBar } from './ui/statusBar';
import { BranchSwitcher } from './ui/branchSwitcher';
import { CommitPanel } from './ui/commit';
import { MergeResolverPanel } from './ui/merge';
import { BlameDecorationProvider } from './providers/decoration';
import { InlineDiffProvider } from './providers/inlineDiff';
import { GitHoverProvider } from './providers/hover';
import { GitCodeLensProvider } from './providers/codeLens';
import { Logger } from './utils/logger';

let git: GitService;

export function activate(context: vscode.ExtensionContext) {
  Logger.info('Git IDE activating...');

  vscode.commands.executeCommand('setContext', 'git-ide:enabled', true);

  try {
    git = new GitService();
  } catch (error: any) {
    Logger.error('Failed to initialize Git service', error);
    vscode.window.showWarningMessage('Git IDE: No git repository found');
    return;
  }

  // Phase 1: Core providers
  const branchesProvider = new BranchesProvider();
  const commitsProvider = new CommitsProvider();
  const statusBar = new StatusBar();
  const branchSwitcher = new BranchSwitcher(branchesProvider);
  const blameProvider = new BlameDecorationProvider();
  const inlineDiffProvider = new InlineDiffProvider();

  // Phase 4: File/Line history
  const fileHistoryProvider = new FileHistoryProvider();
  const lineHistoryProvider = new LineHistoryProvider();

  // Register tree views
  const branchesView = vscode.window.createTreeView('git-ide.branches', {
    treeDataProvider: branchesProvider,
  });

  const commitsView = vscode.window.createTreeView('git-ide.commits', {
    treeDataProvider: commitsProvider,
  });

  const fileHistoryView = vscode.window.createTreeView('git-ide.fileHistory', {
    treeDataProvider: fileHistoryProvider,
  });

  const lineHistoryView = vscode.window.createTreeView('git-ide.lineHistory', {
    treeDataProvider: lineHistoryProvider,
  });

  // Register providers
  const hoverProvider = vscode.languages.registerHoverProvider('*', new GitHoverProvider());
  const codeLensProvider = vscode.languages.registerCodeLensProvider('*', new GitCodeLensProvider());

  // Register all commands
  const commands = [
    // Phase 1: Branches
    vscode.commands.registerCommand('git-ide.refreshBranches', () => branchesProvider.refresh()),
    vscode.commands.registerCommand('git-ide.checkoutBranch', (item) => branchesProvider.checkoutBranch(item)),
    vscode.commands.registerCommand('git-ide.createBranch', () => branchesProvider.createBranch()),
    vscode.commands.registerCommand('git-ide.deleteBranch', (item) => branchesProvider.deleteBranch(item)),
    vscode.commands.registerCommand('git-ide.branchSwitcher', () => branchSwitcher.show()),

    // Phase 1: Git operations
    vscode.commands.registerCommand('git-ide.pull', async () => {
      try {
        await git.pull();
        statusBar.update();
        branchesProvider.refresh();
        vscode.window.showInformationMessage('Pull completed');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Pull failed: ${error.message}`);
      }
    }),
    vscode.commands.registerCommand('git-ide.push', async () => {
      try {
        await git.push();
        statusBar.update();
        vscode.window.showInformationMessage('Push completed');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Push failed: ${error.message}`);
      }
    }),
    vscode.commands.registerCommand('git-ide.stash', async () => {
      try {
        await git.stash();
        vscode.window.showInformationMessage('Changes stashed');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Stash failed: ${error.message}`);
      }
    }),
    vscode.commands.registerCommand('git-ide.stashPop', async () => {
      try {
        await git.stashPop();
        vscode.window.showInformationMessage('Stash popped');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Stash pop failed: ${error.message}`);
      }
    }),

    // Phase 1: Blame & Hover
    vscode.commands.registerCommand('git-ide.toggleBlame', () => blameProvider.toggle()),
    vscode.commands.registerCommand('git-ide.showCommitDiff', (item) => {
      if (item?.commit?.hash) {
        DiffViewerPanel.showCommitDiff(item.commit.hash);
      } else {
        commitsProvider.showDiff(item);
      }
    }),

    // Phase 2: Commit UI
    vscode.commands.registerCommand('git-ide.openCommitPanel', () => CommitPanel.show()),
    vscode.commands.registerCommand('git-ide.stageFile', async (filePath: string) => {
      try {
        await git.stageFile(filePath);
        vscode.window.showInformationMessage(`Staged ${filePath}`);
      } catch (error: any) {
        vscode.window.showErrorMessage(`Stage failed: ${error.message}`);
      }
    }),

    // Phase 3: Diff & Merge
    vscode.commands.registerCommand('git-ide.openDiffViewer', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await DiffViewerPanel.showFileDiff(editor.document.uri.fsPath);
      }
    }),
    vscode.commands.registerCommand('git-ide.openMergeResolver', () => MergeResolverPanel.show()),
    vscode.commands.registerCommand('git-ide.toggleInlineDiff', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        inlineDiffProvider.updateDecorations(editor);
      }
    }),

    // Phase 4: History & Graph
    vscode.commands.registerCommand('git-ide.showFileHistory', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        fileHistoryProvider.setFile(editor.document.uri.fsPath);
      }
    }),
    vscode.commands.registerCommand('git-ide.showLineHistory', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        lineHistoryProvider.setContext(
          editor.document.uri.fsPath,
          editor.selection.active.line + 1
        );
      }
    }),
    vscode.commands.registerCommand('git-ide.openGitGraph', () => GitGraphPanel.show()),

    // Phase 4: Rebase
    vscode.commands.registerCommand('git-ide.rebaseAbort', async () => {
      try {
        await git.rebaseAbort();
        vscode.window.showInformationMessage('Rebase aborted');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Rebase abort failed: ${error.message}`);
      }
    }),
    vscode.commands.registerCommand('git-ide.rebaseContinue', async () => {
      try {
        await git.rebaseContinue();
        vscode.window.showInformationMessage('Rebase continued');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Rebase continue failed: ${error.message}`);
      }
    }),
  ];

  // Event listeners
  const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      blameProvider.updateDecorations(editor);
      inlineDiffProvider.updateDecorations(editor);
    }
  });

  const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('git-ide')) {
      branchesProvider.refresh();
      commitsProvider.refresh();
    }
  });

  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,index,refs/**}');
  fileWatcher.onDidChange(() => {
    branchesProvider.refresh();
    commitsProvider.refresh();
    fileHistoryProvider.refresh();
    statusBar.update();
  });

  statusBar.update();

  context.subscriptions.push(
    branchesView,
    commitsView,
    fileHistoryView,
    lineHistoryView,
    hoverProvider,
    codeLensProvider,
    statusBar,
    blameProvider,
    inlineDiffProvider,
    fileWatcher,
    onDidChangeActiveEditor,
    onDidChangeConfiguration,
    ...commands
  );

  Logger.info('Git IDE activated — all phases loaded');
}

export function deactivate() {
  Logger.info('Git IDE deactivated');
  Logger.dispose();
  vscode.commands.executeCommand('setContext', 'git-ide:enabled', false);
}
