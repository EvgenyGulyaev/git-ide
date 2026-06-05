# Git IDE

IDE-like Git experience for VSCode — branches, commits, blame, diff in one place.

## Features

### Phase 1 (MVP)
- **Branches sidebar** — tree view with checkout, create, delete
- **Commits sidebar** — commit history with click → diff
- **Status bar** — current branch with ahead/behind indicators
- **Commands** — pull, push, stash, stash pop
- **Gutter blame** — author + date for each line
- **Hover** — commit info on line hover

### Usage

1. Open a Git repository in VSCode
2. Git IDE activity bar icon appears automatically
3. Use sidebar views for branches and commits
4. Toggle blame via command palette: `Git IDE: Toggle Git Blame`

### Commands

| Command | Description |
|---------|-------------|
| `Git IDE: Refresh Branches` | Refresh branch list |
| `Git IDE: Create Branch` | Create new branch |
| `Git IDE: Pull` | Git pull |
| `Git IDE: Push` | Git push |
| `Git IDE: Stash Changes` | Stash current changes |
| `Git IDE: Pop Stash` | Pop latest stash |
| `Git IDE: Toggle Git Blame` | Toggle blame annotations |
| `Git IDE: Switch Branch` | Quick pick branch switcher |

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `git-ide.blame.enabled` | `false` | Enable blame on startup |
| `git-ide.blame.dateFormat` | `YYYY-MM-DD` | Date format for blame |
| `git-ide.commits.limit` | `100` | Max commits to show |

## Development

```bash
npm install
npm run build    # one-time build
npm run watch    # watch mode
```

Press F5 to launch Extension Development Host.
