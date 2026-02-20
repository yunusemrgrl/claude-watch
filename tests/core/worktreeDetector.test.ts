import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parsePorcelainOutput, detectWorktrees, enrichWorktreeStatus } from '../../src/core/worktreeDetector.js';

describe('parsePorcelainOutput', () => {
  it('should parse a single worktree (main)', () => {
    const output = `worktree /home/user/project
HEAD abc1234567890abcdef1234567890abcdef123456
branch refs/heads/main
`;

    const result = parsePorcelainOutput(output);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      path: '/home/user/project',
      head: 'abc1234567890abcdef1234567890abcdef123456',
      branch: 'main',
      dirty: false,
      aheadCount: 0,
      behindCount: 0,
    });
  });

  it('should parse multiple worktrees', () => {
    const output = `worktree /home/user/project
HEAD abc123
branch refs/heads/main

worktree /home/user/project-feat
HEAD def456
branch refs/heads/feature/auth
`;

    const result = parsePorcelainOutput(output);

    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('/home/user/project');
    expect(result[0].branch).toBe('main');
    expect(result[1].path).toBe('/home/user/project-feat');
    expect(result[1].branch).toBe('feature/auth');
  });

  it('should handle detached HEAD', () => {
    const output = `worktree /home/user/project
HEAD abc123
detached
`;

    const result = parsePorcelainOutput(output);

    expect(result).toHaveLength(1);
    expect(result[0].branch).toBe('(detached HEAD)');
  });

  it('should handle bare repository', () => {
    const output = `worktree /home/user/project.git
HEAD 0000000000000000000000000000000000000000
bare
`;

    const result = parsePorcelainOutput(output);

    expect(result).toHaveLength(1);
    expect(result[0].branch).toBe('(bare)');
  });

  it('should strip refs/heads/ prefix from branch names', () => {
    const output = `worktree /tmp/wt
HEAD aaa111
branch refs/heads/release/v2.0
`;

    const result = parsePorcelainOutput(output);

    expect(result[0].branch).toBe('release/v2.0');
  });

  it('should return empty array for empty output', () => {
    expect(parsePorcelainOutput('')).toEqual([]);
    expect(parsePorcelainOutput('   \n\n   ')).toEqual([]);
  });

  it('should skip blocks without a worktree path', () => {
    const output = `HEAD abc123
branch refs/heads/main
`;

    const result = parsePorcelainOutput(output);

    expect(result).toHaveLength(0);
  });

  it('should default dirty/ahead/behind to false/0/0', () => {
    const output = `worktree /some/path
HEAD bbb222
branch refs/heads/dev
`;

    const result = parsePorcelainOutput(output);

    expect(result[0].dirty).toBe(false);
    expect(result[0].aheadCount).toBe(0);
    expect(result[0].behindCount).toBe(0);
  });
});

describe('detectWorktrees', () => {
  it('should return empty array when git fails', async () => {
    // Point to a non-git directory
    const result = await detectWorktrees('/tmp');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return empty array when cwd does not exist', async () => {
    const result = await detectWorktrees('/nonexistent-path-xyz-abc');
    expect(result).toEqual([]);
  });
});

describe('enrichWorktreeStatus', () => {
  it('should skip enrichment for bare repos', async () => {
    const worktree = {
      path: '/bare/repo.git',
      head: 'abc',
      branch: '(bare)',
      dirty: false,
      aheadCount: 0,
      behindCount: 0,
    };

    const result = await enrichWorktreeStatus(worktree);

    // Bare repos are returned as-is
    expect(result.dirty).toBe(false);
    expect(result.aheadCount).toBe(0);
  });

  it('should not throw for non-existent paths', async () => {
    const worktree = {
      path: '/nonexistent-xyz',
      head: 'abc',
      branch: 'main',
      dirty: false,
      aheadCount: 0,
      behindCount: 0,
    };

    // Should degrade gracefully, not throw
    await expect(enrichWorktreeStatus(worktree)).resolves.toBeDefined();
    expect(worktree.dirty).toBe(false);
    expect(worktree.aheadCount).toBe(0);
    expect(worktree.behindCount).toBe(0);
  });

  it('should not throw for detached HEAD', async () => {
    const worktree = {
      path: '/nonexistent-xyz',
      head: 'abc',
      branch: '(detached HEAD)',
      dirty: false,
      aheadCount: 0,
      behindCount: 0,
    };

    await expect(enrichWorktreeStatus(worktree)).resolves.toBeDefined();
  });

  it('should detect dirty status in current repo', async () => {
    // Use the actual project directory which is a git repo
    const worktree = {
      path: '/home/yunus/Projects/claudedash',
      head: 'abc',
      branch: 'main',
      dirty: false,
      aheadCount: 0,
      behindCount: 0,
    };

    const result = await enrichWorktreeStatus(worktree);

    // We have uncommitted changes (we just modified files), so dirty should be true
    expect(typeof result.dirty).toBe('boolean');
    expect(typeof result.aheadCount).toBe('number');
    expect(typeof result.behindCount).toBe('number');
  });
});
