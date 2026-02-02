import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Paperclip, Image } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onFileUpload: (file: File) => void;
  disabled?: boolean;
}

export const ChatInput = ({
  onSendMessage,
  onFileUpload,
  disabled = false
}: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    
    // Check if pasted content contains files (images)
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          console.log('📋 Image pasted from clipboard:', file.name);
          onFileUpload(file);
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      console.log('📂 File dropped:', files[0].name);
      onFileUpload(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileUpload(files[0]);
      // Reset input
      e.target.value = '';
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
  };

  return (
    <div className="relative w-full mt-4">
      <div
        className={`flex items-end gap-2 p-3 bg-white dark:bg-gray-800 border-2 rounded-xl transition-all relative ${
          isDragging 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 border-dashed' 
            : disabled
            ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed opacity-60'
            : 'border-gray-200 dark:border-gray-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-testid="chat-input-container"
      >
        {/* File Input (hidden) */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.webp,.bmp,.xlsx,.xls,.csv"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="file-input"
        />

        {/* Attach File Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          title="Attach file or image"
          data-testid="button-attach-file"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            disabled 
              ? "Session ended - start a new session to chat" 
              : "Type a message, paste text or images, or drag & drop files..."
          }
          disabled={disabled}
          className="flex-1 min-h-[40px] max-h-[150px] px-3 py-2 bg-transparent border-none outline-none resize-none font-inherit text-sm leading-relaxed disabled:cursor-not-allowed placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100"
          rows={1}
          data-testid="input-chat-message"
        />

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={disabled || !message.trim()}
          className="flex-shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-blue-600 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500"
          title="Send message"
          data-testid="button-send-message"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>

      {/* Drop Zone Overlay */}
      {isDragging && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-500/10 border-2 border-blue-500 border-dashed rounded-xl pointer-events-none z-10">
          <Image className="w-12 h-12 mb-2 text-blue-600 dark:text-blue-400" />
          <p className="text-lg font-medium text-blue-600 dark:text-blue-400">Drop file here</p>
          <p className="text-sm text-blue-600/70 dark:text-blue-400/70">PDF, Word, Images, Excel, CSV, PowerPoint</p>
        </div>
      )}

      {/* Helper Text */}
      <p className="mt-2 text-xs text-center text-gray-500 dark:text-gray-400">
        💡 Tip: You can type, paste images (Ctrl+V), or drag & drop files to share with your tutor
      </p>
    </div>
  );
};
