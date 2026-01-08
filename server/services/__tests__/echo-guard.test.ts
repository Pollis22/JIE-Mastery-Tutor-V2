/**
 * Echo Guard Service Tests
 * 
 * Tests for the echo similarity filter that prevents tutor self-response
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  normalizeText,
  jaccardSimilarity,
  levenshteinRatio,
  calculateSimilarity,
  createEchoGuardState,
  recordTutorUtterance,
  markPlaybackStart,
  markPlaybackEnd,
  checkForEcho,
  shouldAllowBargeIn,
  isEchoTailGuardActive,
  type EchoGuardState,
  type EchoGuardConfig,
} from '../echo-guard';

describe('Echo Guard Service', () => {
  const testConfig: EchoGuardConfig = {
    enabled: true,
    echoTailGuardMs: 700,
    echoSimilarityThreshold: 0.85,
    echoWindowMs: 2500,
    maxTutorUtterances: 3,
    debugMode: false,
  };

  describe('normalizeText', () => {
    it('should lowercase text', () => {
      expect(normalizeText('Hello World')).toBe('hello world');
    });

    it('should strip punctuation', () => {
      expect(normalizeText("Hello, world! How are you?")).toBe('hello world how are you');
    });

    it('should collapse whitespace', () => {
      expect(normalizeText('hello   world')).toBe('hello world');
    });

    it('should trim whitespace', () => {
      expect(normalizeText('  hello world  ')).toBe('hello world');
    });
  });

  describe('jaccardSimilarity', () => {
    it('should return 1 for identical texts', () => {
      expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
    });

    it('should return 0 for completely different texts', () => {
      expect(jaccardSimilarity('hello world', 'foo bar baz')).toBe(0);
    });

    it('should return partial similarity for overlapping texts', () => {
      const similarity = jaccardSimilarity('hello world', 'hello there');
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe('levenshteinRatio', () => {
    it('should return 1 for identical strings', () => {
      expect(levenshteinRatio('hello', 'hello')).toBe(1);
    });

    it('should return 0 for completely different strings', () => {
      const ratio = levenshteinRatio('abc', 'xyz');
      expect(ratio).toBe(0);
    });

    it('should return high similarity for similar strings', () => {
      const ratio = levenshteinRatio('hello', 'hallo');
      expect(ratio).toBeGreaterThan(0.7);
    });
  });

  describe('Echo Filtering', () => {
    let state: EchoGuardState;

    beforeEach(() => {
      state = createEchoGuardState();
    });

    it('Case A: should filter transcript identical to tutor within 1s', () => {
      const tutorText = "Two plus two equals four. Can you try the next one?";
      
      recordTutorUtterance(state, tutorText, testConfig);
      markPlaybackStart(state, testConfig);
      markPlaybackEnd(state, testConfig);
      
      const echoCheck = checkForEcho(state, tutorText, testConfig);
      expect(echoCheck.isEcho).toBe(true);
      expect(echoCheck.similarity).toBeGreaterThanOrEqual(0.85);
    });

    it('Case B: should pass transcript different from tutor within 1s', () => {
      const tutorText = "Two plus two equals four. Can you try the next one?";
      const studentText = "I think the answer is five.";
      
      recordTutorUtterance(state, tutorText, testConfig);
      markPlaybackStart(state, testConfig);
      markPlaybackEnd(state, testConfig);
      
      const echoCheck = checkForEcho(state, studentText, testConfig);
      expect(echoCheck.isEcho).toBe(false);
    });

    it('Case C: should pass identical phrase after echo window expires', async () => {
      const tutorText = "Two plus two equals four.";
      
      recordTutorUtterance(state, tutorText, testConfig);
      markPlaybackStart(state, testConfig);
      markPlaybackEnd(state, testConfig);
      
      // Simulate time passing beyond echo window
      state.lastTutorUtterances[0].ttsPlaybackEndMs = Date.now() - 5000;
      
      const echoCheck = checkForEcho(state, tutorText, testConfig);
      expect(echoCheck.isEcho).toBe(false);
      expect(echoCheck.reason).toBe('no_match');
    });

    it('should filter partial matches with high similarity', () => {
      const tutorText = "The answer is four. Great job!";
      const echoText = "the answer is four great job"; // Missing punctuation
      
      recordTutorUtterance(state, tutorText, testConfig);
      markPlaybackStart(state, testConfig);
      markPlaybackEnd(state, testConfig);
      
      const echoCheck = checkForEcho(state, echoText, testConfig);
      expect(echoCheck.isEcho).toBe(true);
    });

    it('should not filter when echo guard is disabled', () => {
      const disabledConfig: EchoGuardConfig = { ...testConfig, enabled: false };
      const tutorText = "Two plus two equals four.";
      
      recordTutorUtterance(state, tutorText, disabledConfig);
      markPlaybackStart(state, disabledConfig);
      markPlaybackEnd(state, disabledConfig);
      
      const echoCheck = checkForEcho(state, tutorText, disabledConfig);
      expect(echoCheck.isEcho).toBe(false);
      expect(echoCheck.reason).toBe('echo_guard_disabled');
    });

    it('should filter echo DURING active playback (before markPlaybackEnd)', () => {
      const tutorText = "Two plus two equals four. Can you try the next one?";
      
      recordTutorUtterance(state, tutorText, testConfig);
      markPlaybackStart(state, testConfig);
      // NOTE: markPlaybackEnd NOT called yet - simulating echo during playback
      
      // Verify tutor is actively playing
      expect(state.tutorPlaybackActive).toBe(true);
      expect(state.lastTutorUtterances[0].ttsPlaybackEndMs).toBe(0);
      
      const echoCheck = checkForEcho(state, tutorText, testConfig);
      expect(echoCheck.isEcho).toBe(true);
      expect(echoCheck.similarity).toBeGreaterThanOrEqual(0.85);
      expect(echoCheck.deltaMs).toBe(0); // During playback
    });

    it('should pass different text DURING active playback (real barge-in)', () => {
      const tutorText = "Two plus two equals four.";
      const studentText = "Wait, I have a question!";
      
      recordTutorUtterance(state, tutorText, testConfig);
      markPlaybackStart(state, testConfig);
      // NOTE: markPlaybackEnd NOT called yet
      
      const echoCheck = checkForEcho(state, studentText, testConfig);
      expect(echoCheck.isEcho).toBe(false);
    });
  });

  describe('Echo Tail Guard', () => {
    let state: EchoGuardState;

    beforeEach(() => {
      state = createEchoGuardState();
    });

    it('should activate echo tail guard after playback ends', () => {
      markPlaybackStart(state, testConfig);
      expect(state.tutorPlaybackActive).toBe(true);
      
      markPlaybackEnd(state, testConfig);
      expect(state.tutorPlaybackActive).toBe(false);
      expect(state.echoTailGuardActive).toBe(true);
    });

    it('should block barge-in during echo tail guard window', () => {
      markPlaybackStart(state, testConfig);
      markPlaybackEnd(state, testConfig);
      
      const result = shouldAllowBargeIn(state, testConfig);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('echo_tail_guard_active');
    });

    it('should allow barge-in after echo tail guard expires', () => {
      markPlaybackStart(state, testConfig);
      markPlaybackEnd(state, testConfig);
      
      // Simulate guard expiration
      state.echoTailGuardEndMs = Date.now() - 100;
      
      const result = shouldAllowBargeIn(state, testConfig);
      expect(result.allowed).toBe(true);
    });

    it('should allow barge-in when guard is disabled', () => {
      const disabledConfig: EchoGuardConfig = { ...testConfig, enabled: false };
      
      markPlaybackStart(state, disabledConfig);
      markPlaybackEnd(state, disabledConfig);
      
      const result = shouldAllowBargeIn(state, disabledConfig);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('echo_guard_disabled');
    });
  });

  describe('Rolling Buffer', () => {
    let state: EchoGuardState;

    beforeEach(() => {
      state = createEchoGuardState();
    });

    it('should maintain up to maxTutorUtterances', () => {
      recordTutorUtterance(state, 'First utterance', testConfig);
      recordTutorUtterance(state, 'Second utterance', testConfig);
      recordTutorUtterance(state, 'Third utterance', testConfig);
      recordTutorUtterance(state, 'Fourth utterance', testConfig);
      
      expect(state.lastTutorUtterances.length).toBe(3);
      expect(state.lastTutorUtterances[0].text).toBe('Fourth utterance');
    });

    it('should not record empty utterances', () => {
      recordTutorUtterance(state, '', testConfig);
      recordTutorUtterance(state, '   ', testConfig);
      
      expect(state.lastTutorUtterances.length).toBe(0);
    });
  });
});
