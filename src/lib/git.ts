import type { Worktree } from './tipos'

/** O nome de uma worktree na interface: a branch, ou o commit quando ela está sem branch. */
export const rotuloDaWorktree = (w: Worktree) => w.branch ?? `HEAD ${w.head}`
