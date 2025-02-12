// src/components/ConfirmModal.tsx
import React from 'react';
import Modal from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message: string;
  title?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  message,
  title = '確認'
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      showCloseButton={false}
    >
      <div className="space-y-4">
        <p className="text-gray-700">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600"
          >
            OK
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;