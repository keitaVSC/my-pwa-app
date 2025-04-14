// src/components/ScheduleModal.tsx
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ScheduleItem } from '../types';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  schedule?: ScheduleItem;
  employees: { id: number; name: string }[];
  onSave: (data: { 
    title: string; 
    employeeIds: string[]; 
    details?: string; 
    color?: string 
  }) => void;
  onDelete?: (id: string) => void;
}

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  onClose,
  date,
  schedule,
  employees,
  onSave,
  onDelete
}) => {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [isAllEmployees, setIsAllEmployees] = useState(true);
  const [color, setColor] = useState('#4A90E2');
  
  // 編集時に値を設定
  useEffect(() => {
    if (schedule) {
      setTitle(schedule.title || '');
      setDetails(schedule.details || '');
      setColor(schedule.color || '#4A90E2');
      
      // 既存の従業員設定を取得
      if (schedule.employeeIds && schedule.employeeIds.length > 0) {
        setEmployeeIds(schedule.employeeIds);
        setIsAllEmployees(false);
      } else if (schedule.employeeId && schedule.employeeId !== '') {
        setEmployeeIds([schedule.employeeId]);
        setIsAllEmployees(false);
      } else {
        setEmployeeIds([]);
        setIsAllEmployees(true);
      }
    } else {
      // 新規作成時のデフォルト値
      setTitle('');
      setDetails('');
      setEmployeeIds([]);
      setIsAllEmployees(true);
      setColor('#4A90E2');
    }
  }, [schedule]);
  
  if (!isOpen) return null;
  
  // 従業員選択の切り替え
  const toggleEmployee = (id: string) => {
    if (employeeIds.includes(id)) {
      setEmployeeIds(prev => prev.filter(empId => empId !== id));
    } else {
      setEmployeeIds(prev => [...prev, id]);
    }
  };
  
  // 保存処理
  const handleSave = () => {
    if (!title.trim()) return;
    
    onSave({
      title: title.trim(),
      employeeIds: isAllEmployees ? [] : employeeIds,
      details: details.trim() || undefined,
      color
    });
    
    onClose();
  };
  
  // 削除処理
  const handleDelete = () => {
    if (schedule && onDelete) {
      onDelete(schedule.id);
      onClose();
    }
  };
  
  // カラープリセット
  const colorPresets = [
    '#4A90E2', // 青
    '#E2574A', // 赤
    '#50E3C2', // 緑
    '#F5A623', // オレンジ
    '#BD10E0'  // 紫
  ];
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">
          {schedule ? '予定の編集' : '予定の追加'}
        </h2>
        
        <div className="mb-4">
          <p className="font-medium">
            {format(date, "yyyy年MM月dd日")}
          </p>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            タイトル
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
            placeholder="予定のタイトル"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            対象者
          </label>
          <div className="mb-2">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={isAllEmployees}
                onChange={() => setIsAllEmployees(!isAllEmployees)}
                className="mr-2"
              />
              <span>全員</span>
            </label>
          </div>
          
          {!isAllEmployees && (
            <div className="max-h-40 overflow-y-auto border rounded p-2">
              {employees.map(emp => (
                <div key={emp.id} className="flex items-center mb-1">
                  <input
                    type="checkbox"
                    id={`emp-${emp.id}`}
                    checked={employeeIds.includes(emp.id.toString())}
                    onChange={() => toggleEmployee(emp.id.toString())}
                    className="mr-2"
                  />
                  <label htmlFor={`emp-${emp.id}`}>{emp.name}</label>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            詳細 (任意)
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded"
            rows={3}
            placeholder="予定の詳細"
          ></textarea>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            色
          </label>
          <div className="flex space-x-2 mb-2">
            {colorPresets.map(presetColor => (
              <button
                key={presetColor}
                type="button"
                onClick={() => setColor(presetColor)}
                className={`w-8 h-8 rounded-full ${
                  color === presetColor ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                }`}
                style={{ backgroundColor: presetColor }}
              ></button>
            ))}
          </div>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="p-1 border rounded"
          />
        </div>
        
        <div className="flex justify-end space-x-2">
          {schedule && onDelete && (
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
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            disabled={!title.trim() || (!isAllEmployees && employeeIds.length === 0)}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};