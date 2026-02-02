/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */


import * as fs from 'fs';

export interface PdfExtractionResult {
  text: string;
  method: 'pdfjs' | 'pdf-parse' | 'fallback';
  success: boolean;
  error?: string;
}

/**
 * PDF text extraction with multiple fallback methods
 * Tries pdfjs-dist first, then pdf-parse, and provides graceful degradation
 */
export class PdfJsTextExtractor {
  private pdfjsLib: any = null;

  /**
   * Lazy load pdfjs-dist to avoid initialization issues
   */
  private async loadPdfJs() {
    if (!this.pdfjsLib) {
      try {
        // Use legacy ES module build for Node.js compatibility
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        this.pdfjsLib = pdfjs;
      } catch (error) {
        console.error('[PDF] Failed to load pdfjs-dist:', error);
        return null;
      }
    }
    return this.pdfjsLib;
  }

  /**
   * Extract text using pdfjs-dist
   */
  private async extractWithPdfJs(dataBuffer: Buffer): Promise<string | null> {
    try {
      const pdfjs = await this.loadPdfJs();
      if (!pdfjs) return null;
      
      const typedArray = new Uint8Array(dataBuffer);

      // Load PDF document without worker (Node.js compatibility)
      const loadingTask = pdfjs.getDocument({
        data: typedArray,
        verbosity: 0,
        useSystemFonts: true,
        disableWorker: true,
      });
      
      const pdf = await loadingTask.promise;
      const textParts: string[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        textParts.push(pageText);
      }

      await pdf.cleanup();
      await pdf.destroy();

      const fullText = textParts.join('\n\n');
      return fullText.trim() || null;
    } catch (error) {
      console.error('[PDF] pdfjs-dist extraction failed:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Extract text using pdf-parse as fallback
   */
  private async extractWithPdfParse(dataBuffer: Buffer): Promise<string | null> {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(dataBuffer, {
        max: 0, // No page limit
      });
      return data.text?.trim() || null;
    } catch (error) {
      console.error('[PDF] pdf-parse extraction failed:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Extract text from PDF file with multiple fallback methods
   * Never throws - always returns a result (success or graceful fallback)
   */
  async extractText(filePath: string): Promise<string> {
    const result = await this.extractTextWithDetails(filePath);
    if (!result.success) {
      // For backward compatibility, throw if extraction completely failed
      throw new Error(result.error || 'Failed to extract text from PDF');
    }
    return result.text;
  }

  /**
   * Extract text from PDF with detailed result including method used
   */
  async extractTextWithDetails(filePath: string): Promise<PdfExtractionResult> {
    const filename = filePath.split('/').pop() || 'unknown.pdf';
    
    let dataBuffer: Buffer;
    try {
      dataBuffer = fs.readFileSync(filePath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[PDF] Cannot read file ${filename}:`, errorMsg);
      return {
        text: '',
        method: 'fallback',
        success: false,
        error: `Cannot read file: ${errorMsg}`
      };
    }

    console.log(`[PDF] Extracting text from: ${filename} (${dataBuffer.length} bytes)`);

    // Method 1: Try pdfjs-dist first
    console.log('[PDF] Trying pdfjs-dist...');
    const pdfjsText = await this.extractWithPdfJs(dataBuffer);
    if (pdfjsText && pdfjsText.length > 10) {
      console.log(`[PDF] ✅ pdfjs-dist succeeded: ${pdfjsText.length} chars`);
      return { text: pdfjsText, method: 'pdfjs', success: true };
    }
    console.log('[PDF] pdfjs-dist returned empty or failed, trying fallback...');

    // Method 2: Try pdf-parse as fallback
    console.log('[PDF] Trying pdf-parse...');
    const pdfParseText = await this.extractWithPdfParse(dataBuffer);
    if (pdfParseText && pdfParseText.length > 10) {
      console.log(`[PDF] ✅ pdf-parse succeeded: ${pdfParseText.length} chars`);
      return { text: pdfParseText, method: 'pdf-parse', success: true };
    }
    console.log('[PDF] pdf-parse returned empty or failed');

    // Both methods failed - return failure result
    console.error(`[PDF] ❌ All extraction methods failed for: ${filename}`);
    return {
      text: '',
      method: 'fallback',
      success: false,
      error: 'All PDF extraction methods failed. The PDF may be image-only (scanned), encrypted, or in an unsupported format.'
    };
  }
}
