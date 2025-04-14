// src/components/WorkTypeModal.tsx
import React from "react";
import { format } from "date-fns";

interface WorkType {
  id: string;
  label: string;
}

interface Employee {
  id: number;
  name: string;
}

interface WorkTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null | undefined;
  date: Date;
  currentWorkType: string;
  workTypes: WorkType[];
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
  if (!isOpen || !employee) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">勤務区分の選択</h3>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        
        <div className="mb-4">
          <p className="text-sm sm:text-base">
            <span className="font-medium">{employee.name}</span> - 
            <span className="ml-1">{format(date, "yyyy年M月d日")}</span>
          </p>
        </div>
        
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
          {workTypes.map(type => (
            <button
              key={type.id}
              className={`
                p-3 border rounded text-sm sm:text-base
                ${type.id === currentWorkType 
                  ? 'bg-blue-100 border-blue-500' 
                  : 'hover:bg-gray-100'}
                min-h-[44px]
              `}
              onClick={() => {
                onSelect(type.id);
                onClose();
              }}
            >
              {type.label}
            </button>
          ))}
        </div>
        
        <div className="flex justify-between pt-4 border-t">
          <button
            onClick={() => {
              onSelect("");  // 空文字で削除
              onClose();
            }}
            className="px-4 py-2 text-red-500 hover:text-red-700 min-h-[44px]"
          >
            削除
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 min-h-[44px]"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};