/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


/**
 * Transcript Correction Service
 * Fixes common misspellings and transcription errors in voice tutoring transcripts
 */

interface TranscriptEntry {
  role: string;
  content: string;
  timestamp: string;
  [key: string]: any;
}

const commonCorrections: Record<string, string> = {
  // Math terms
  'pie': 'pi',
  'pythagorus': 'Pythagoras',
  'pythagorean': 'Pythagorean',
  'hippotenuse': 'hypotenuse',
  'quadradik': 'quadratic',
  'aljeebra': 'algebra',
  'calcoolus': 'calculus',
  'trygonometry': 'trigonometry',
  'geometree': 'geometry',
  'parabola': 'parabola',
  'cosine': 'cosine',
  'sine': 'sine',
  'tangent': 'tangent',
  
  // Science terms
  'mitocondria': 'mitochondria',
  'fotosynthesis': 'photosynthesis',
  'klorofil': 'chlorophyll',
  'cromosomes': 'chromosomes',
  'nucleus': 'nucleus',
  'dna': 'DNA',
  'rna': 'RNA',
  
  // English/Grammar terms
  'grammer': 'grammar',
  'sentance': 'sentence',
  'paragraf': 'paragraph',
  'noun': 'noun',
  'verb': 'verb',
  'adjective': 'adjective',
  
  // Spanish terms (common misspellings)
  'hola': 'hola',
  'buenos dias': 'buenos días',
  'manana': 'mañana',
  
  // Common words
  'definately': 'definitely',
  'seperate': 'separate',
  'occured': 'occurred',
  'recieve': 'receive',
  'wierd': 'weird',
  'alot': 'a lot',
  'untill': 'until',
  'tomarrow': 'tomorrow',
  'thier': 'their',
  'theyre': "they're",
};

/**
 * Correct common transcription errors in text
 */
export function correctTranscript(text: string): string {
  if (!text) return text;
  
  let corrected = text;
  
  // Apply common corrections (case-insensitive, whole words only)
  for (const [wrong, right] of Object.entries(commonCorrections)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    corrected = corrected.replace(regex, (match) => {
      // Preserve original capitalization
      if (match[0] === match[0].toUpperCase()) {
        return right.charAt(0).toUpperCase() + right.slice(1);
      }
      return right;
    });
  }
  
  // Fix common patterns
  corrected = corrected
    // Fix double spaces
    .replace(/\s+/g, ' ')
    // Fix possessives
    .replace(/\bits'/gi, "it's")
    // Trim whitespace
    .trim();
  
  return corrected;
}

/**
 * Correct an entire transcript array
 */
export function correctTranscriptEntries(transcript: TranscriptEntry[]): TranscriptEntry[] {
  if (!Array.isArray(transcript)) return transcript;
  
  return transcript.map(entry => ({
    ...entry,
    content: entry.content ? correctTranscript(entry.content) : entry.content,
  }));
}

/**
 * Add a custom correction to the dictionary
 */
export function addCorrection(wrong: string, right: string): void {
  commonCorrections[wrong.toLowerCase()] = right;
}

/**
 * Get all current corrections (for debugging/admin)
 */
export function getAllCorrections(): Record<string, string> {
  return { ...commonCorrections };
}
