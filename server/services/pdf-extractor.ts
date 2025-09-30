import * as fs from 'fs';

/**
 * PDF text extraction using Mozilla's PDF.js library
 * Reliable, pure JavaScript solution that works in Node.js without native dependencies
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
        console.error('Failed to load pdfjs-dist:', error);
        throw new Error('PDF.js library failed to initialize');
      }
    }
    return this.pdfjsLib;
  }

  /**
   * Extract text from PDF file
   */
  async extractText(filePath: string): Promise<string> {
    try {
      const pdfjs = await this.loadPdfJs();
      
      // Read PDF file
      const dataBuffer = fs.readFileSync(filePath);
      const typedArray = new Uint8Array(dataBuffer);

      // Load PDF document without worker (Node.js compatibility)
      const loadingTask = pdfjs.getDocument({
        data: typedArray,
        verbosity: 0, // Suppress console logs
        useSystemFonts: true,
        disableWorker: true, // Disable worker for Node.js compatibility
      });
      
      const pdf = await loadingTask.promise;
      const textParts: string[] = [];

      // Extract text from each page
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Combine text items from the page
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        
        textParts.push(pageText);
      }

      // Cleanup
      await pdf.cleanup();
      await pdf.destroy();

      const fullText = textParts.join('\n\n');
      
      if (!fullText.trim()) {
        throw new Error('No readable text content found in PDF');
      }

      return fullText;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('PDF extraction error:', errorMessage);
      throw new Error(`Failed to extract text from PDF: ${errorMessage}`);
    }
  }
}
