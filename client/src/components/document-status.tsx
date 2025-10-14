import { useState, useEffect } from 'react';
import { FileText, Loader, CheckCircle } from 'lucide-react';

interface Document {
  id: string;
  title?: string;
  originalName?: string;
  processingStatus?: string;
}

interface DocumentStatusProps {
  documents: Document[];
  isProcessing: boolean;
}

export function DocumentStatus({ documents, isProcessing }: DocumentStatusProps) {
  const [processingMessage, setProcessingMessage] = useState('');
  const [dots, setDots] = useState('');

  // Animate dots while processing
  useEffect(() => {
    if (!isProcessing) {
      setProcessingMessage('');
      setDots('');
      return;
    }

    const messages = [
      'Reading your documents',
      'Understanding the content',
      'Preparing to help with your materials',
    ];

    let messageIndex = 0;
    let dotCount = 0;

    // Cycle through messages
    const messageInterval = setInterval(() => {
      setProcessingMessage(messages[messageIndex]);
      messageIndex = (messageIndex + 1) % messages.length;
    }, 2500);

    // Animate dots
    const dotInterval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      setDots('.'.repeat(dotCount));
    }, 500);

    // Set initial message
    setProcessingMessage(messages[0]);

    return () => {
      clearInterval(messageInterval);
      clearInterval(dotInterval);
    };
  }, [isProcessing]);

  if (!documents || documents.length === 0) return null;

  return (
    <div className="document-status-indicator bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
      {isProcessing ? (
        <div className="processing-state flex items-center gap-3">
          <div className="spinner">
            <Loader className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
          <div className="processing-text flex-1">
            <div className="font-medium text-gray-900 dark:text-white">
              {processingMessage}{dots}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              This may take a few seconds...
            </p>
          </div>
        </div>
      ) : (
        <div className="ready-state flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <div className="ready-text">
            <span className="font-medium text-gray-900 dark:text-white">
              {documents.length} document{documents.length !== 1 ? 's' : ''} ready
            </span>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {documents.map((doc, idx) => (
                <div key={doc.id} className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  <span>{doc.title || doc.originalName || `Document ${idx + 1}`}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}