/**
 * DuplicateModal.jsx
 *
 * Drop-in modal shown when a duplicate file is detected during upload.
 * Parent component passes:
 *   - duplicateFile: the existing File record from the server
 *   - newFileName:   the name of the file the user is trying to upload
 *   - onRename:      () => void  — user chooses to rename & upload anyway
 *   - onReplace:     () => void  — user wants to replace existing file
 *   - onCancel:      () => void  — user cancels upload
 */
export default function DuplicateModal({ duplicateFile, newFileName, onRename, onReplace, onCancel }) {
  if (!duplicateFile) return null

  return (
    <div className="modal-overlay">
      <div className="bg-white rounded-lg p-8 max-w-md w-full animate-in zoom-in-95 duration-200">

                <div className="flex items-center justify-center w-16 h-16 rounded-lg bg-amber-50 mx-auto mb-5">
          <i className="fas fa-triangle-exclamation text-amber-500 text-2xl"></i>
        </div>

                <h3 className="text-xl font-bold text-gray-900 text-center mb-1">Duplicate File Detected</h3>
        <p className="text-sm text-gray-500 text-center mb-6">
          A file with the same content already exists in your storage.
        </p>

                <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">You're uploading</p>
            <p className="text-sm font-semibold text-gray-800 break-all">{newFileName}</p>
          </div>
          <div className="border-t border-gray-200 pt-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Existing file</p>
            <p className="text-sm font-semibold text-gray-800 break-all">{duplicateFile.original_name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {duplicateFile.file_size_display} · Uploaded {new Date(duplicateFile.uploaded_at).toLocaleDateString()}
            </p>
          </div>
        </div>

                <div className="space-y-2.5">
          <button
            onClick={onRename}
            className="w-full py-3.5 bg-brand-600 text-white rounded-lg font-bold text-sm hover:bg-brand-700 transition-all  flex items-center justify-center gap-2"
          >
            <i className="fas fa-pen-to-square"></i> Rename & Upload
          </button>
          <button
            onClick={onReplace}
            className="w-full py-3.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg font-bold text-sm hover:bg-orange-100 transition-all flex items-center justify-center gap-2"
          >
            <i className="fas fa-arrow-rotate-right"></i> Replace Existing
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3.5 bg-gray-100 text-gray-600 rounded-lg font-bold text-sm hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
          >
            <i className="fas fa-xmark"></i> Cancel Upload
          </button>
        </div>
      </div>
    </div>
  )
}