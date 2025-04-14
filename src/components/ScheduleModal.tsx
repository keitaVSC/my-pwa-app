// src/components/ScheduleModal.tsx
import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { ScheduleItem } from "../types";

interface Employee {
  id: number;
  name: string;
}

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  schedule?: ScheduleItem;
  employees: Employee[];
  onSave: (data: { 
    title: string; 
    employeeIds: string[]; 
    details?: string; 
    color?: string;
  }) => void;
  onDelete?: (id: string) => void;
}

// カラーパレット
const colorOptions = [
  { name: "青", value: "#4A90E2" },
  { name: "赤", value: "#E24A4A" },
  { name: "緑", value: "#4AE27A" },
  { name: "オレンジ", value: "#E2A14A" },
  { name: "ピンク", value: "#E24A9E" }
];

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  onClose,
  date,
  schedule,
  employees,
  onSave,
  onDelete
}) => {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [color, setColor] = useState(colorOptions[0].value);
  const [isAllEmployees, setIsAllEmployees] = useState(true);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  
  // 編集モードの場合、初期値を設定
  useEffect(() => {
    if (schedule) {
      setTitle(schedule.title);
      setDetails(schedule.details || "");
      setColor(schedule.color || colorOptions[0].value);
      
      const hasEmployees = schedule.employeeIds && schedule.employeeIds.length > 0 || 
                         (schedule.employeeId && schedule.employeeId !== "");
      
      setIsAllEmployees(!hasEmployees);
      
      if (schedule.employeeIds && schedule.employeeIds.length > 0) {
        setSelectedEmployeeIds(schedule.employeeIds);
      } else if (schedule.employeeId && schedule.employeeId !== "") {
        setSelectedEmployeeIds([schedule.employeeId]);
      } else {
        setSelectedEmployeeIds([]);
      }
    } else {
      // 新規作成時のリセット
      setTitle("");
      setDetails("");
      setColor(colorOptions[0].value);
      setIsAllEmployees(true);
      setSelectedEmployeeIds([]);
    }
  }, [schedule]);
  
  // 従業員選択の切り替え
  const toggleEmployeeSelection = (employeeId: string) => {
    if (selectedEmployeeIds.includes(employeeId)) {
      setSelectedEmployeeIds(prev => prev.filter(id => id !== employeeId));
    } else {
      setSelectedEmployeeIds(prev => [...prev, employeeId]);
    }
  };
  
  // 保存処理
  const handleSave = () => {
    if (!title.trim()) return;
    
    onSave({
      title: title.trim(),
      employeeIds: isAllEmployees ? [] : selectedEmployeeIds,
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
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">{schedule ? "予定の編集" : "予定の追加"}</h3>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-4">
          {/* 日付表示 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
            <div className="p-2 border rounded bg-gray-50">
              {format(date, "yyyy年M月d日")}
            </div>
          </div>
          
          {/* タイトル入力 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 border rounded text-base"
              placeholder="予定のタイトル"
              required
              style={{ minHeight: '44px' }}
            />
          </div>
          
          {/* 対象従業員 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">対象者</label>
            <div className="mb-2">
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id="allEmployees"
                  checked={isAllEmployees}
                  onChange={(e) => setIsAllEmployees(e.target.checked)}
                  className="mr-2 h-5 w-5"
                />
                <label htmlFor="allEmployees" className="font-medium">
                  全員共通
                </label>
              </div>
              
              {!isAllEmployees && (
                <div className="max-h-40 overflow-y-auto border rounded p-2">
                  {employees.map(emp => (
                    <div key={emp.id} className="flex items-center my-1">
                      <input
                        type="checkbox"
                        id={`emp-${emp.id}`}
                        checked={selectedEmployeeIds.includes(emp.id.toString())}
                        onChange={() => toggleEmployeeSelection(emp.id.toString())}
                        className="mr-2 h-5 w-5"
                      />
                      <label 
                        htmlFor={`emp-${emp.id}`} 
                        className="text-sm min-h-[44px] flex items-center"
                      >
                        {emp.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
              
              {!isAllEmployees && selectedEmployeeIds.length === 0 && (
                <p className="text-sm text-red-500 mt-1">※ 少なくとも1人の従業員を選択してください</p>
              )}
            </div>
          </div>
          
          {/* 詳細 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">詳細</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full p-2 border rounded text-base"
              rows={3}
              placeholder="予定の詳細（任意）"
              style={{ minHeight: '44px' }}
            ></textarea>
          </div>
          
          {/* 色選択 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">表示色</label>
            <div className="grid grid-cols-5 gap-2 mb-2">
              {colorOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`w-full h-10 rounded-md ${color === option.value ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                  style={{ backgroundColor: option.value, minHeight: '44px' }}
                  onClick={() => setColor(option.value)}
                  title={option.name}
                  aria-label={`色: ${option.name}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="p-1 border rounded"
                style={{ minHeight: '44px', minWidth: '44px' }}
              />
              <span className="text-sm">カスタム色</span>
            </div>
          </div>
          
          {/* ボタン */}
          <div className="flex justify-between pt-4 border-t">
            {schedule && onDelete && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-red-500 hover:text-red-700 min-h-[44px]"
              >
                削除
              </button>
            )}
            <div className={`flex gap-2 ${schedule && onDelete ? 'ml-auto' : 'w-full justify-end'}`}>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 min-h-[44px]"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={!title.trim() || (!isAllEmployees && selectedEmployeeIds.length === 0)}
                className={`
                  px-4 py-2 rounded text-white min-h-[44px]
                  ${(!title.trim() || (!isAllEmployees && selectedEmployeeIds.length === 0))
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600'}
                `}
              >
                {schedule ? "更新" : "追加"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};