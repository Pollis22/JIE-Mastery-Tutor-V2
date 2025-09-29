import { useState, useRef, ChangeEvent } from 'react';
import { Upload, FileText, Trash2, Edit2, Check, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Document {
  id: string;
  title: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  subject?: string;
  grade?: string;
  description?: string;
  keepForFutureSessions: boolean;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  processingError?: string;
  createdAt: string;
}

interface AssignmentsPanelProps {
  userId: string;
  onSelectionChange: (selectedIds: string[]) => void;
}

export function AssignmentsPanel({ userId, onSelectionChange }: AssignmentsPanelProps) {
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMetadata, setUploadMetadata] = useState({
    subject: '',
    grade: '',
    title: '',
    description: '',
    keepForFutureSessions: false
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch user documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', userId],
    queryFn: async () => {
      const response = await apiRequest('/api/documents/list');
      return response.documents as Document[];
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', userId] });
      setUploadMetadata({ subject: '', grade: '', title: '', description: '', keepForFutureSessions: false });
      toast({
        title: 'Document uploaded',
        description: 'Your document is being processed...',
      });
    },
    onError: () => {
      toast({
        title: 'Upload failed',
        description: 'Please try again with a smaller file or different format.',
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      await apiRequest(`/api/documents/${documentId}`, { method: 'DELETE' });
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
      return apiRequest(`/api/documents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', userId] });
    },
  });

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please choose a file smaller than 10MB.',
        variant: 'destructive',
      });
      return;
    }

    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please choose a PDF, Word document, or text file.',
        variant: 'destructive',
      });
      return;
    }

    // Auto-fill title if empty
    if (!uploadMetadata.title) {
      setUploadMetadata(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, '') }));
    }
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setIsUploading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subject', uploadMetadata.subject);
    formData.append('grade', uploadMetadata.grade);
    formData.append('title', uploadMetadata.title || file.name);
    formData.append('description', uploadMetadata.description);
    formData.append('keepForFutureSessions', uploadMetadata.keepForFutureSessions.toString());

    try {
      await uploadMutation.mutateAsync(formData);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectionChange = (documentId: string, selected: boolean) => {
    const newSelection = selected
      ? [...selectedDocuments, documentId]
      : selectedDocuments.filter(id => id !== documentId);
    
    setSelectedDocuments(newSelection);
    onSelectionChange(newSelection);
  };

  const toggleKeepForFutureSessions = (document: Document) => {
    updateMutation.mutate({
      id: document.id,
      updates: { keepForFutureSessions: !document.keepForFutureSessions }
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <Check className="w-4 h-4 text-green-500" />;
      case 'processing': return <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      case 'failed': return <X className="w-4 h-4 text-red-500" />;
      default: return <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />;
    }
  };

  return (
    <div className="assignments-panel bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700" data-testid="assignments-panel">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <FileText className="w-5 h-5" />
        📚 Study Materials
      </h3>

      {/* Upload Section */}
      <div className="upload-section mb-6" data-testid="upload-section">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 dark:text-white mb-3">Upload New Document</h4>
          
          <div className="file-input-group mb-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 dark:text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-medium
                file:bg-blue-50 file:text-blue-700
                dark:file:bg-blue-900 dark:file:text-blue-300
                hover:file:bg-blue-100 dark:hover:file:bg-blue-800"
              data-testid="file-input"
            />
          </div>

          <div className="upload-metadata grid grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              placeholder="Title (optional)"
              value={uploadMetadata.title}
              onChange={(e) => setUploadMetadata(prev => ({ ...prev, title: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              data-testid="input-title"
            />
            <input
              type="text"
              placeholder="Subject (optional)"
              value={uploadMetadata.subject}
              onChange={(e) => setUploadMetadata(prev => ({ ...prev, subject: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              data-testid="input-subject"
            />
            <input
              type="text"
              placeholder="Grade level (optional)"
              value={uploadMetadata.grade}
              onChange={(e) => setUploadMetadata(prev => ({ ...prev, grade: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              data-testid="input-grade"
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="keepForFutureSessions"
                checked={uploadMetadata.keepForFutureSessions}
                onChange={(e) => setUploadMetadata(prev => ({ ...prev, keepForFutureSessions: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600"
                data-testid="checkbox-keep-sessions"
              />
              <label htmlFor="keepForFutureSessions" className="text-sm text-gray-700 dark:text-gray-300">
                Keep for future sessions
              </label>
            </div>
          </div>

          <button
            onClick={handleUpload}
            disabled={!fileInputRef.current?.files?.[0] || isUploading}
            className="upload-btn w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            data-testid="button-upload"
          >
            <Upload className="w-4 h-4" />
            {isUploading ? 'Uploading...' : 'Upload Document'}
          </button>
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
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Use</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Document</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Size</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Status</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Keep</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id} className="border-b border-gray-200 dark:border-gray-700" data-testid={`document-row-${document.id}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedDocuments.includes(document.id)}
                          onChange={(e) => handleSelectionChange(document.id, e.target.checked)}
                          disabled={document.processingStatus !== 'completed'}
                          className="rounded border-gray-300 dark:border-gray-600"
                          data-testid={`checkbox-use-${document.id}`}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-500" />
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">{document.title}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {document.subject && <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs mr-2">{document.subject}</span>}
                              {document.grade && <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">{document.grade}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-gray-500 dark:text-gray-400">{formatFileSize(document.fileSize)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(document.processingStatus)}
                          <span className="text-sm capitalize">{document.processingStatus}</span>
                        </div>
                        {document.processingError && (
                          <div className="text-xs text-red-500 mt-1">{document.processingError}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={document.keepForFutureSessions}
                          onChange={() => toggleKeepForFutureSessions(document)}
                          className="rounded border-gray-300 dark:border-gray-600"
                          data-testid={`checkbox-keep-${document.id}`}
                        />
                      </td>
                      <td className="p-3">
                        <div className="actions flex gap-2">
                          <button
                            onClick={() => deleteMutation.mutate(document.id)}
                            className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                            title="Delete document"
                            data-testid={`button-delete-${document.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Selection Summary */}
            {selectedDocuments.length > 0 && (
              <div className="selection-summary mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                  <Check className="w-4 h-4" />
                  <span className="font-medium">
                    {selectedDocuments.length} document{selectedDocuments.length !== 1 ? 's' : ''} selected for this session
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