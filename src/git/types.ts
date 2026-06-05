export interface Branch {
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

export interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: Date;
  parents: string[];
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface DiffResult {
  hunks: DiffHunk[];
  oldPath: string;
  newPath: string;
}

export interface BlameLine {
  hash: string;
  author: string;
  date: Date;
  line: number;
  content: string;
}

export interface StashEntry {
  index: number;
  message: string;
  branch: string;
}

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked';
  staged: boolean;
  oldPath?: string;
}

export interface ConflictFile {
  path: string;
  ours: string;
  theirs: string;
}

export interface GitGraphEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: Date;
  message: string;
  parents: string[];
  refs: string[];
  lanes: number[];
}
