import * as vscode from 'vscode';
import { GitService } from './git/service';
import { BranchesProvider } from './views/branches';
import { CommitsProvider } from './views/commits';
import { ChangesViewProvider } from './views/changes';
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

let git: GitService | undefined;

function tryCreateGitService(): GitService | undefined {
  try {
    return new GitService();
  } catch {
    return undefined;
  }
}

export function activate(context: vscode.ExtensionContext) {
  Logger.info('Git IDE activating...');

  vscode.commands.executeCommand('setContext', 'git-ide:enabled', true);

  git = tryCreateGitService();

  // Phase 1: Core providers
  const branchesProvider = new BranchesProvider(context.workspaceState);
  const commitsProvider = new CommitsProvider();
  const statusBar = new StatusBar();
  const branchSwitcher = new BranchSwitcher(branchesProvider);
  const blameProvider = new BlameDecorationProvider();
  const inlineDiffProvider = new InlineDiffProvider();

  // Phase 4: File/Line history
  const fileHistoryProvider = new FileHistoryProvider();
  const lineHistoryProvider = new LineHistoryProvider();

  // Changes webview (files + commit UI)
  const changesViewProvider = new ChangesViewProvider(context.extensionUri);
  const changesView = vscode.window.registerWebviewViewProvider(
    ChangesViewProvider.viewType,
    changesViewProvider,
  );

  // Badge for changed files count
  const changesBadge = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  changesBadge.text = '$(git-changes)';
  changesBadge.tooltip = 'Changed files';
  changesBadge.hide();

  changesViewProvider.onDidChangeFiles((count) => {
    if (count > 0) {
      changesBadge.text = `$(git-changes) ${count}`;
      changesBadge.show();
    } else {
      changesBadge.hide();
    }
  });

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

  // Helper to ensure git service exists
  function getGit(): GitService {
    if (!git) {
      git = tryCreateGitService();
      if (!git) throw new Error('No git repository found');
    }
    return git;
  }

  // Register all commands
  const commands = [
    // Changes
    vscode.commands.registerCommand('git-ide.refreshChanges', () => changesViewProvider.refresh()),

    // Branches
    vscode.commands.registerCommand('git-ide.refreshBranches', () => branchesProvider.refresh()),
    vscode.commands.registerCommand('git-ide.checkoutBranch', (item) => branchesProvider.checkoutBranch(item)),
    vscode.commands.registerCommand('git-ide.createBranch', () => branchesProvider.createBranch()),
    vscode.commands.registerCommand('git-ide.deleteBranch', (item) => branchesProvider.deleteBranch(item)),
    vscode.commands.registerCommand('git-ide.branchSwitcher', () => branchSwitcher.show()),
    vscode.commands.registerCommand('git-ide.fetch', () => branchesProvider.fetch()),
    vscode.commands.registerCommand('git-ide.pullCurrent', () => branchesProvider.pullCurrent()),
    vscode.commands.registerCommand('git-ide.togglePinBranch', (item) => {
      branchesProvider.togglePin(item);
    }),
    vscode.commands.registerCommand('git-ide.unpinBranch', (item) => branchesProvider.togglePin(item)),

    // Git operations
    vscode.commands.registerCommand('git-ide.pull', async () => {
      try {
        await getGit().pull();
        statusBar.update();
        branchesProvider.refresh();
        vscode.window.showInformationMessage('Pull completed');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Pull failed: ${error.message}`);
      }
    }),
    vscode.commands.registerCommand('git-ide.push', async () => {
      try {
        await getGit().push();
        statusBar.update();
        vscode.window.showInformationMessage('Push completed');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Push failed: ${error.message}`);
      }
    }),
    vscode.commands.registerCommand('git-ide.stash', async () => {
      try {
        await getGit().stash();
        vscode.window.showInformationMessage('Changes stashed');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Stash failed: ${error.message}`);
      }
    }),
    vscode.commands.registerCommand('git-ide.stashPop', async () => {
      try {
        await getGit().stashPop();
        vscode.window.showInformationMessage('Stash popped');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Stash pop failed: ${error.message}`);
      }
    }),

    // Blame
    vscode.commands.registerCommand('git-ide.toggleBlame', () => blameProvider.toggle()),
    vscode.commands.registerCommand('git-ide.showCommitDiff', (itemOrCommit) => {
      // Handle both commit object directly and item with commit property
      const hash = itemOrCommit?.hash || itemOrCommit?.commit?.hash;
      if (hash) {
        DiffViewerPanel.showCommitDiff(hash);
      }
    }),

    // Commit UI
    vscode.commands.registerCommand('git-ide.openCommitPanel', () => CommitPanel.show()),

    // Diff & Merge
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

    // History & Graph
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

    // Rebase
    vscode.commands.registerCommand('git-ide.rebaseAbort', async () => {
      try {
        await getGit().rebaseAbort();
        vscode.window.showInformationMessage('Rebase aborted');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Rebase abort failed: ${error.message}`);
      }
    }),
    vscode.commands.registerCommand('git-ide.rebaseContinue', async () => {
      try {
        await getGit().rebaseContinue();
        vscode.window.showInformationMessage('Rebase continued');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Rebase continue failed: ${error.message}`);
      }
    }),
  ];

  // Event listeners
  const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
    if (editor) {
      blameProvider.updateDecorations(editor);
      await inlineDiffProvider.updateDecorations(editor);
      fileHistoryProvider.setFile(editor.document.uri.fsPath);
      lineHistoryProvider.setContext(editor.document.uri.fsPath, editor.selection.active.line + 1);
    }
  });

  // Update line history when cursor moves
  const onDidChangeSelection = vscode.window.onDidChangeTextEditorSelection((e) => {
    lineHistoryProvider.setContext(e.textEditor.document.uri.fsPath, e.selections[0].active.line + 1);
  });

  // Also update inline diff when files change
  const onDidChangeDocument = vscode.workspace.onDidChangeTextDocument(async (e) => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === e.document) {
      await inlineDiffProvider.updateDecorations(editor);
    }
  });

  const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('git-ide')) {
      branchesProvider.refresh();
      commitsProvider.refresh();
      changesViewProvider.refresh();
    }
  });

  // Watch for git changes
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,index,refs/**}');
  fileWatcher.onDidChange(() => {
    branchesProvider.refresh();
    commitsProvider.refresh();
    changesViewProvider.refresh();
    fileHistoryProvider.refresh();
    statusBar.update();
  });

  // Also watch for any file changes to refresh changes view
  const workspaceWatcher = vscode.workspace.onDidSaveTextDocument(() => {
    changesViewProvider.refresh();
  });

  statusBar.update();

  // Update inline diff for current editor on activation
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    inlineDiffProvider.updateDecorations(activeEditor);
  }

  context.subscriptions.push(
    changesView,
    changesBadge,
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
    workspaceWatcher,
    onDidChangeActiveEditor,
    onDidChangeSelection,
    onDidChangeDocument,
    onDidChangeConfiguration,
    ...commands
  );

  Logger.info('Git IDE activated');
}

export function deactivate() {
  Logger.info('Git IDE deactivated');
  Logger.dispose();
  vscode.commands.executeCommand('setContext', 'git-ide:enabled', false);
}
