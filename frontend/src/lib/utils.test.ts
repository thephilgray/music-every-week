import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { seededRandom, getTimestampAsNumber, formatCommentDate, copyToClipboard } from './utils';
import { Timestamp } from 'firebase/firestore';

describe('utils library', () => {
  describe('seededRandom', () => {
    it('should generate deterministic pseudo-random numbers between 0 and 1', () => {
      const rand1 = seededRandom('test-seed');
      const rand2 = seededRandom('test-seed');

      const val1 = rand1();
      const val2 = rand2();

      expect(val1).toBeGreaterThanOrEqual(0);
      expect(val1).toBeLessThan(1);
      expect(val1).toBe(val2);
    });

    it('should generate different numbers for different seeds', () => {
      const randA = seededRandom('seed-a');
      const randB = seededRandom('seed-b');

      expect(randA()).not.toBe(randB());
    });

    it('should advance state uniformly on consecutive calls', () => {
      const rand = seededRandom('sequence-seed');
      const first = rand();
      const second = rand();
      expect(first).not.toBe(second);
    });
  });

  describe('getTimestampAsNumber', () => {
    it('should return number directly when input is a number', () => {
      const now = Date.now();
      expect(getTimestampAsNumber(now)).toBe(now);
    });

    it('should return milliseconds when input is a Firestore Timestamp', () => {
      const ts = new Timestamp(1700000000, 500000000);
      expect(getTimestampAsNumber(ts)).toBe(ts.toMillis());
    });

    it('should convert raw object { seconds, nanoseconds } correctly', () => {
      const raw = { seconds: 1700000000, nanoseconds: 0 };
      expect(getTimestampAsNumber(raw)).toBe(1700000000 * 1000);
    });

    it('should convert valid date string to milliseconds', () => {
      const dateStr = '2025-01-01T00:00:00.000Z';
      const expected = new Date(dateStr).getTime();
      expect(getTimestampAsNumber(dateStr)).toBe(expected);
    });

    it('should return 0 when input is undefined or invalid string', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(getTimestampAsNumber(undefined)).toBe(0);
      expect(getTimestampAsNumber('invalid-date-string')).toBe(0);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('formatCommentDate', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Set fixed now: Wednesday, Oct 15, 2025 at 12:00:00 PM
      vi.setSystemTime(new Date(2025, 9, 15, 12, 0, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return empty string when timestamp is 0 or undefined', () => {
      expect(formatCommentDate(0)).toBe('');
      expect(formatCommentDate(undefined as any)).toBe('');
    });

    it('should format as time only if comment is from today', () => {
      // Today at 10:30 AM
      const commentTime = new Date(2025, 9, 15, 10, 30).getTime();
      const formatted = formatCommentDate(commentTime);
      expect(formatted).toMatch(/10:30\s[AP]M/i);
    });

    it('should prefix with Yesterday if comment is from yesterday', () => {
      // Yesterday at 3:15 PM
      const commentTime = new Date(2025, 9, 14, 15, 15).getTime();
      const formatted = formatCommentDate(commentTime);
      expect(formatted).toMatch(/^Yesterday at \d{1,2}:\d{2}\s[AP]M/i);
    });

    it('should format with weekday name if within the last 6 days', () => {
      // 3 days ago (Sunday, Oct 12, 2025 at 9:00 AM)
      const commentTime = new Date(2025, 9, 12, 9, 0).getTime();
      const formatted = formatCommentDate(commentTime);
      expect(formatted).toMatch(/^Sunday at \d{1,2}:\d{2}\s[AP]M/i);
    });

    it('should format with full date if 7 or more days ago', () => {
      // 10 days ago (Oct 5, 2025 at 8:00 AM)
      const commentTime = new Date(2025, 9, 5, 8, 0).getTime();
      const formatted = formatCommentDate(commentTime);
      expect(formatted).toContain('at ');
      expect(formatted).not.toContain('Yesterday');
    });
  });

  describe('copyToClipboard', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should use navigator.clipboard.writeText when available and return true', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const success = await copyToClipboard('Hello world');
      expect(writeTextMock).toHaveBeenCalledWith('Hello world');
      expect(success).toBe(true);
    });

    it('should fallback to execCommand if navigator.clipboard.writeText throws', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard denied'));
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const execCommandMock = vi.fn().mockReturnValue(true);
      Object.assign(document, { execCommand: execCommandMock });

      const success = await copyToClipboard('Fallback copy');
      expect(writeTextMock).toHaveBeenCalled();
      expect(execCommandMock).toHaveBeenCalledWith('copy');
      expect(success).toBe(true);
    });

    it('should return false when clipboard API throws and execCommand is not a function', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard denied'));
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      Object.assign(document, { execCommand: undefined });

      const success = await copyToClipboard('Fallback copy');
      expect(writeTextMock).toHaveBeenCalled();
      expect(success).toBe(false);
    });
  });
});
