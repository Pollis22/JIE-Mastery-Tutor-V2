import { useState, useRef, ChangeEvent } from 'react';
import { Upload, FileText, Trash2, Edit2, Check, X, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatChicagoDate } from '@/lib/date-utils';

interface Document {
  id: string;
  title: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  subject?: string;
  grade?: string;
  description?: string;
  processingStatus: 'queued' | 'processing' | 'ready' | 'failed';
  processingError?: string;
  retryCount?: number;
  nextRetryAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

interface AssignmentsPanelProps {
  userId: string;
  selectedDocumentIds?: string[];
  onDocumentSelectionChange?: (selectedIds: string[]) => void;
}

function StatusPill({ status, error, retryCount }: { status: Document['processingStatus']; error?: string; retryCount?: number }) {
  const statusConfig = {
    ready: { label: 'Ready', icon: CheckCircle, className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border border-green-300 dark:border-green-700' },
    processing: { label: 'Processing', icon: Loader, className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-700 animate-pulse' },
    queued: { label: retryCount ? `Queued (retry ${retryCount})` : 'Queued', icon: Clock, className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border border-blue-300 dark:border-blue-700' },
    failed: { label: 'Failed', icon: AlertCircle, className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border border-red-300 dark:border-red-700' },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span 
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.className}`}
      title={error || config.label}
      data-testid={`status-${status}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

export function AssignmentsPanel({ 
  userId,
  selectedDocumentIds = [],
  onDocumentSelectionChange 
}: AssignmentsPanelProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Handle document selection toggle
  const toggleDocumentSelection = (documentId: string) => {
    if (!onDocumentSelectionChange) return;
    
    const newSelection = selectedDocumentIds.includes(documentId)
      ? selectedDocumentIds.filter(id => id !== documentId)
      : [...selectedDocumentIds, documentId];
    
    onDocumentSelectionChange(newSelection);
  };

  // Fetch user documents - refetch periodically if there are processing/queued documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', userId],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/documents/list');
      const data = await response.json();
      return data.documents as Document[];
    },
    refetchInterval: (query) => {
      const docs = query.state.data as Document[] | undefined;
      const hasProcessingDocs = docs?.some(d => d.processingStatus === 'queued' || d.processingStatus === 'processing');
      return hasProcessingDocs ? 5000 : false; // Refetch every 5s if documents are processing
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', userId] });
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      toast({
        title: 'Document uploaded',
        description: 'Toggle "Active in Session" to use this document with your tutor.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error.message || 'Please try again with a smaller file or different format.',
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      await apiRequest('DELETE', `/api/documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', userId] });
      toast({
        title: 'Document deleted',
        description: 'Your document has been removed.',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Document> }) => {
      return apiRequest('PUT', `/api/documents/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', userId] });
    },
  });

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Validate file size
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please choose a file smaller than 10MB.',
        variant: 'destructive',
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setSelectedFile(null);
      return;
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/vnd.ms-powerpoint', // .ppt
      'text/plain', // .txt
      'text/csv', // .csv
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/bmp'
    ];
    
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|docx?|pptx?|txt|csv|xlsx?|png|jpe?g|gif|bmp)$/i)) {
      toast({
        title: 'Invalid file type',
        description: 'Please choose a PDF, Word, PowerPoint, Excel, text file, or image (PNG, JPG, GIF).',
        variant: 'destructive',
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setSelectedFile(null);
      return;
    }

    // File is valid, store it
    setSelectedFile(file);
    console.log('📄 File selected:', file.name);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: 'No file selected',
        description: 'Please select a file to upload.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    // Use filename without extension as default title
    const defaultTitle = selectedFile.name.replace(/\.[^/.]+$/, '');
    formData.append('title', defaultTitle);
    
    console.log('📤 Uploading file:', selectedFile.name);

    try {
      await uploadMutation.mutateAsync(formData);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="assignments-panel bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700" data-testid="assignments-panel">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <FileText className="w-5 h-5" />
        📚 Load Your Study Materials
      </h3>

      {/* Upload Section */}
      <div className="upload-section mb-6" data-testid="upload-section">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 dark:text-white mb-3">Upload homework, study guides, or syllabus for targeted instruction</h4>
          
          {/* File Selection and Preview */}
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.bmp"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="file-input"
            />
            
            {!selectedFile ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-red-400 dark:hover:border-red-500 transition-colors"
              >
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-300 font-medium">
                  Click to select a file
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  PDF, Word, PowerPoint, Excel, Text, or Image files (max 10MB)
                </p>
              </div>
            ) : (
              <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
            
            <button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className="upload-btn w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              data-testid="button-upload"
            >
              <Upload className="w-4 h-4" />
              {isUploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </div>
      </div>

      {/* Documents List */}
      <div className="assignments-list" data-testid="assignments-list">
        {isLoading ? (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="empty-state py-8 text-center text-gray-500 dark:text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No documents uploaded yet.</p>
            <p className="text-sm">Upload your assignments, notes, or study materials to get personalized help.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse table-fixed">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                    {onDocumentSelectionChange && (
                      <th className="text-center p-2 font-medium text-gray-900 dark:text-white w-16" title="Toggle to activate document for this tutoring session">Active</th>
                    )}
                    <th className="text-left p-2 font-medium text-gray-900 dark:text-white">Document</th>
                    <th className="text-left p-2 font-medium text-gray-900 dark:text-white w-16">Size</th>
                    <th className="text-left p-2 font-medium text-gray-900 dark:text-white w-20">Status</th>
                    <th className="text-center p-2 font-medium text-gray-900 dark:text-white w-14">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id} className="border-b border-gray-200 dark:border-gray-700" data-testid={`document-row-${document.id}`}>
                      {onDocumentSelectionChange && (
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedDocumentIds.includes(document.id)}
                            onChange={() => toggleDocumentSelection(document.id)}
                            disabled={document.processingStatus !== 'ready'}
                            className="w-4 h-4 text-red-600 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 rounded focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            data-testid={`checkbox-document-${document.id}`}
                          />
                        </td>
                      )}
                      <td className="p-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 dark:text-white truncate" title={document.title}>{document.title}</div>
                            {(document.subject || document.grade) && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {document.subject && <span className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs mr-1">{document.subject}</span>}
                                {document.grade && <span className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">{document.grade}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatFileSize(document.fileSize)}</td>
                      <td className="p-2">
                        <StatusPill 
                          status={document.processingStatus} 
                          error={document.processingError}
                          retryCount={document.retryCount}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => deleteMutation.mutate(document.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Delete document"
                          data-testid={`button-delete-${document.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Info message about document activation */}
            {documents.length > 0 && (
              <div className="info-message mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start gap-2 text-blue-700 dark:text-blue-300">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="text-sm space-y-1">
                    <p><strong>Documents require activation:</strong> Toggle "Active" to use a document in this session.</p>
                    <p className="text-blue-600 dark:text-blue-400">Your tutor will only see activated documents. Documents stay uploaded but inactive until you toggle them on.</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Active documents summary */}
            {onDocumentSelectionChange && selectedDocumentIds.length > 0 && (
              <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg" data-testid="document-selection-summary">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-medium text-sm">
                    {selectedDocumentIds.length} document{selectedDocumentIds.length !== 1 ? 's' : ''} active for this session
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}