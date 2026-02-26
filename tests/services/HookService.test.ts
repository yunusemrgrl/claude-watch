import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { HookService } from '../../src/services/HookService.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'claudedash-hookservice-'));
}

describe('HookService', () => {
  let claudeDir: string;
  let planDir: string;
  let svc: HookService;

  beforeEach(() => {
    claudeDir = makeTmpDir();
    planDir = makeTmpDir();
    svc = new HookService(claudeDir, planDir);
  });

  describe('ring buffer', () => {
    it('starts empty', () => {
      expect(svc.getEvents()).toHaveLength(0);
    });

    it('push adds events and returns them newest-first', () => {
      svc.push({ event: 'PostToolUse', tool: 'Read' });
      svc.push({ event: 'PostToolUse', tool: 'Write' });
      const events = svc.getEvents();
      expect(events).toHaveLength(2);
      expect(events[0].tool).toBe('Write'); // newest first
      expect(events[1].tool).toBe('Read');
    });

    it('caps ring buffer at 100 events', () => {
      for (let i = 0; i < 110; i++) {
        svc.push({ event: 'PostToolUse', tool: `tool-${i}` });
      }
      expect(svc.getEvents()).toHaveLength(100);
    });

    it('normalizes empty tool string to undefined', () => {
      const ev = svc.push({ event: 'PostToolUse', tool: '' });
      expect(ev.tool).toBeUndefined();
    });

    it('sets type to "hook"', () => {
      const ev = svc.push({ event: 'Stop' });
      expect(ev.type).toBe('hook');
    });

    it('defaults event to "unknown" when missing', () => {
      const ev = svc.push({});
      expect(ev.event).toBe('unknown');
    });
  });

  describe('getAutoCommit', () => {
    it('returns false when config.json does not exist', () => {
      expect(svc.getAutoCommit()).toBe(false);
    });

    it('returns false when autoCommit is not set', () => {
      writeFileSync(join(planDir, 'config.json'), JSON.stringify({ foo: 'bar' }));
      expect(svc.getAutoCommit()).toBe(false);
    });

    it('returns true when autoCommit is true in config.json', () => {
      writeFileSync(join(planDir, 'config.json'), JSON.stringify({ autoCommit: true }));
      expect(svc.getAutoCommit()).toBe(true);
    });

    it('returns false when planDir is undefined', () => {
      const noplan = new HookService(claudeDir, undefined);
      expect(noplan.getAutoCommit()).toBe(false);
    });
  });

  describe('getHooksInstalled', () => {
    it('returns false when settings.json does not exist', () => {
      expect(svc.getHooksInstalled()).toBe(false);
    });

    it('returns false when hooks section is missing', () => {
      writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({}));
      expect(svc.getHooksInstalled()).toBe(false);
    });

    it('returns true when PostToolUse hook references claudedash', () => {
      const settings = {
        hooks: {
          PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'curl localhost:4317/hook' }] }],
        },
      };
      writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(settings));
      expect(svc.getHooksInstalled()).toBe(true);
    });

    it('returns true when Stop hook references /hook', () => {
      const settings = {
        hooks: {
          Stop: [{ type: 'command', command: 'curl -X POST http://localhost:4317/hook' }],
        },
      };
      writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(settings));
      expect(svc.getHooksInstalled()).toBe(true);
    });

    it('returns false when hooks do not reference claudedash or /hook', () => {
      const settings = {
        hooks: {
          PostToolUse: [{ type: 'command', command: 'echo hello' }],
        },
      };
      writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(settings));
      expect(svc.getHooksInstalled()).toBe(false);
    });
  });

  describe('handlePostCompact', () => {
    it('appends restore note to CLAUDE.md when compact-state.json exists', () => {
      const state = {
        compactedAt: '2026-02-26T12:00:00Z',
        sessionId: 'abc123',
        summary: { done: 10, ready: 3, blocked: 2, failed: 0, total: 15 },
        readyTasks: ['S1-T1'],
      };
      writeFileSync(join(planDir, 'compact-state.json'), JSON.stringify(state));
      writeFileSync(join(planDir, 'CLAUDE.md'), '# Instructions\n');

      const ev = svc.push({ event: 'PostCompact' });
      svc.handlePostCompact(ev);

      const { readFileSync } = require('fs');
      const content = readFileSync(join(planDir, 'CLAUDE.md'), 'utf-8') as string;
      expect(content).toContain('compact-restore');
      expect(content).toContain('10 DONE');
      expect(content).toContain('3 READY');
    });

    it('is a no-op when compact-state.json is missing', () => {
      const ev = svc.push({ event: 'PostCompact' });
      // Should not throw
      expect(() => svc.handlePostCompact(ev)).not.toThrow();
    });

    it('is a no-op when planDir is undefined', () => {
      const noplan = new HookService(claudeDir, undefined);
      mkdirSync(join(claudeDir, '.claudedash'), { recursive: true });
      const ev = noplan.push({ event: 'PostCompact' });
      expect(() => noplan.handlePostCompact(ev)).not.toThrow();
    });
  });
});
