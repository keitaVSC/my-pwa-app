// src/components/SuccessModal.tsx
import React from 'react';
import Modal from './Modal';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
}

const SuccessModal: React.FC<SuccessModalProps> = ({
  isOpen,
  onClose,
  message
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="登録完了"
      showCloseButton={false}
    >
      <div className="space-y-4">
        <p className="text-gray-700">{message}</p>
        <button
          onClick={onClose}
          className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition-colors"
        >
          OK
        </button>
      </div>
    </Modal>
  );
};

export default SuccessModal;