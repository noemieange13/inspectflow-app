"use client";

import { useState, useRef } from "react";
import { Upload, File, CheckCircle, AlertCircle } from "lucide-react";

interface FileUploadDebugProps {
  onFileSelected: (file: File | null) => void;
  accept?: string;
  label: string;
  currentFile?: File | null;
}

export default function FileUploadDebug({ 
  onFileSelected, 
  accept = "image/*,.pdf", 
  label,
  currentFile 
}: FileUploadDebugProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      setError("Aucun fichier sélectionné");
      onFileSelected(null);
      return;
    }

    const file = files[0];
    console.log("=== DEBUG FICHIER ===");
    console.log("Nom:", file.name);
    console.log("Type:", file.type);
    console.log("Taille:", file.size, "bytes");
    console.log("Dernière modification:", new Date(file.lastModified));
    console.log("===================");

    // Validation
    if (file.size > 50 * 1024 * 1024) { // 50MB max
      setError("Fichier trop volumineux (max 50MB)");
      onFileSelected(null);
      return;
    }

    const validTypes = accept.split(',').map(type => type.trim());
    const isValidType = validTypes.some(type => {
      if (type.startsWith('.')) {
        return file.name.toLowerCase().endsWith(type.toLowerCase());
      }
      if (type.includes('*')) {
        const baseType = type.split('*')[0];
        return file.type.startsWith(baseType);
      }
      return file.type === type;
    });

    if (!isValidType) {
      setError(`Type de fichier non valide. Acceptés: ${accept}`);
      onFileSelected(null);
      return;
    }

    setError(null);
    onFileSelected(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const clearFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onFileSelected(null);
    setError(null);
  };

  return (
    <div className="w-full">
      <div
        className={`
          border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}
          ${currentFile ? 'border-green-500 bg-green-50' : ''}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
        
        <div className="flex flex-col items-center gap-3">
          {currentFile ? (
            <>
              <CheckCircle className="w-12 h-12 text-green-600" />
              <div>
                <p className="font-medium text-gray-900">{currentFile.name}</p>
                <p className="text-sm text-gray-600">
                  {(currentFile.size / 1024 / 1024).toFixed(2)} MB • {currentFile.type}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={openFileDialog}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  Changer de fichier
                </button>
                <button
                  type="button"
                  onClick={clearFile}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  Supprimer
                </button>
              </div>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-gray-400" />
              <div>
                <p className="font-medium text-gray-900">{label}</p>
                <p className="text-sm text-gray-600">
                  Glissez-déposez un fichier ou cliquez pour sélectionner
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Formats acceptés: {accept}
                </p>
              </div>
              <button
                type="button"
                onClick={openFileDialog}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Choisir un fichier
              </button>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
