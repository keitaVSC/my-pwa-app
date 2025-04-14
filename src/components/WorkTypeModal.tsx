// src/components/WorkTypeModal.tsx
import React, { useState } from 'react';
import { format } from 'date-fns';

interface WorkTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: { id: number; name: string } | undefined;
  date: Date;
  currentWorkType: string;
  workTypes: { id: string; label: string }[];
  onSelect: (workType: string) => void;
}

export const WorkTypeModal: React.FC<WorkTypeModalProps> = ({
  isOpen,
  onClose,
  employee,
  date,
  currentWorkType,
  workTypes,
  onSelect
}) => {
  const [selectedWorkType, setSelectedWorkType] = useState(currentWorkType);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onSelect(selectedWorkType);
    onClose();
  };

  const handleDelete = () => {
    onSelect('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">勤務区分の選択</h2>
        
        <div className="mb-4">
          <p className="font-medium">
            {employee?.name || "従業員"} - {format(date, "yyyy年MM月dd日")}
          </p>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            勤務区分
          </label>
          <select
            value={selectedWorkType}
            onChange={(e) => setSelectedWorkType(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
            style={{ WebkitAppearance: 'menulist', appearance: 'menulist' }}
          >
            <option value="">選択なし</option>
            {workTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex justify-end space-x-2">
          {currentWorkType && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              削除
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};