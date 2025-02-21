// src/App.tsx

import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import JapaneseHolidays from "japanese-holidays";
import Modal from "./components/Modal";
import ConfirmModal from "./components/ConfirmModal";
import SuccessModal from "./components/SuccessModal";
import ErrorBoundary from "./components/ErrorBoundary";
import { StorageService, STORAGE_KEYS } from "./services/storage";

// Japanese-holidaysの型定義
declare module "japanese-holidays" {
  export function isHoliday(date: Date): string | undefined;
}

//=====================================================================
// Part 1: ヘルパー関数（祝日関連の処理）
//=====================================================================

// 祝日判定関数
const isJapaneseHoliday = (date: Date): boolean => {
  return JapaneseHolidays.isHoliday(date) !== undefined;
};

// 祝日名を取得する関数
const getHolidayName = (date: Date): string | null => {
  const holiday = JapaneseHolidays.isHoliday(date);
  return holiday || null;
};

// 背景色判定関数
const getCellBackgroundColor = (date: Date) => {
  if (date.getDay() === 0 || isJapaneseHoliday(date)) {
    return {
      bg: "bg-red-50",
      hover: "hover:bg-red-100",
      text: "text-red-500",
    };
  }
  if (date.getDay() === 6) {
    return {
      bg: "bg-blue-50",
      hover: "hover:bg-blue-100",
      text: "text-blue-500",
    };
  }
  return {
    bg: "",
    hover: "hover:bg-gray-50",
    text: "",
  };
};

//=====================================================================
// Part 2: 型定義
//=====================================================================

// 従業員
interface Employee {
  id: number;
  name: string;
}

// 勤務区分
interface WorkType {
  id: string;
  label: string;
}

// 勤務記録
interface AttendanceRecord {
  employeeId: string;
  date: string;
  workType: string;
  employeeName?: string;
}

// 予定
interface ScheduleItem {
  id: string;
  employeeId: string;
  date: string;
  title: string;
  details?: string;
  color?: string;
}

// 日次集計
interface DailySummary {
  [workType: string]: number;
}

// 表示モード
type View = "calendar" | "table";

//=====================================================================
// Part 3: 初期データ
//=====================================================================

// 従業員リスト
const employees: Employee[] = [
  { id: 1, name: "小田　孝" },
  { id: 2, name: "益田　洋史" },
  { id: 3, name: "益田　幸枝" },
  { id: 4, name: "佐藤　徳保" },
  { id: 5, name: "吉野　広一郎" },
  { id: 6, name: "田口　祐介" },
  { id: 7, name: "吉田　結" },
  { id: 8, name: "山田　慧太" },
  { id: 9, name: "上村　沙奈恵" },
  { id: 10, name: "濱村　大和" },
  { id: 11, name: "岡　出海" },
  { id: 12, name: "赤神　龍誠" },
  { id: 13, name: "佐取　侑平" },
  { id: 14, name: "池島　凌太" },
  { id: 15, name: "木村　汐里" },
  { id: 16, name: "今井　淳貴" },
  { id: 17, name: "藤田　向陽" },
  { id: 18, name: "若木　雄太" },
  { id: 19, name: "中谷　優衣" },
  { id: 20, name: "濱田　泰陽" },
  { id: 21, name: "新人C" },
  { id: 22, name: "新人D" },
  { id: 23, name: "井上　真理子" },
  { id: 24, name: "斎藤さん" },
];

// 勤務区分リスト
const workTypes: WorkType[] = [
  { id: "休", label: "休" },
  { id: "A", label: "A" },
  { id: "P", label: "P" },
  { id: "年", label: "年" },
  { id: "a", label: "a" },
  { id: "p", label: "p" },
  { id: "Ap", label: "Ap" },
  { id: "Fビ", label: "Fビ" },
  { id: "a1", label: "a1" },
  { id: "a2", label: "a2" },
  { id: "a3", label: "a3" },
  { id: "p1", label: "p1" },
  { id: "p2", label: "p2" },
  { id: "p3", label: "p3" },
  { id: "a1/P", label: "a1/P" },
  { id: "a2/P", label: "a2/P" },
  { id: "a3/P", label: "a3/P" },
  { id: "A/p1", label: "A/p1" },
  { id: "A/p2", label: "A/p2" },
  { id: "A/p3", label: "A/p3" },
  { id: "遅1", label: "遅1" },
  { id: "遅2", label: "遅2" },
  { id: "早1", label: "早1" },
  { id: "早2", label: "早2" },
  { id: "半1", label: "半1" },
  { id: "半5", label: "半5" },
  { id: "短", label: "短" },
  { id: "短土", label: "短土" },
];

//=====================================================================
// Part 4: メインコンポーネント
//=====================================================================
const AttendanceApp: React.FC = () => {
  //---------------------------------------------------------------
  // 状態管理
  //---------------------------------------------------------------
  // 表示関連
  const [currentView, setCurrentView] = useState<View>(() => {
    return StorageService.getData<View>(STORAGE_KEYS.CURRENT_VIEW, "calendar");
  });
  
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const savedDateStr = StorageService.getData<string>(STORAGE_KEYS.CURRENT_DATE, "");
    return savedDateStr ? new Date(savedDateStr) : new Date();
  });
  
  const [selectedEmployee, setSelectedEmployee] = useState<string>(() => {
    return StorageService.getData<string>(STORAGE_KEYS.SELECTED_EMPLOYEE, "");
  });

  // データ関連
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>(() => {
    return StorageService.getData<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE_DATA, []);
  });
  
  const [scheduleData, setScheduleData] = useState<ScheduleItem[]>(() => {
    return StorageService.getData<ScheduleItem[]>(STORAGE_KEYS.SCHEDULE_DATA, []);
  });

  // モーダル関連
  const [showWorkTypeModal, setShowWorkTypeModal] = useState(false);
  const [showAttendanceDetailModal, setShowAttendanceDetailModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalMessage, setConfirmModalMessage] = useState("");
  const [confirmModalAction, setConfirmModalAction] = useState<() => void>(() => {});
  const [successMessage, setSuccessMessage] = useState("");

  // セル・日付選択関連
  const [selectedCell, setSelectedCell] = useState<{
    employeeId: number;
    date: Date;
  } | null>(null);
  
  const [selectedDateDetails, setSelectedDateDetails] = useState<{
    date: Date;
    records: AttendanceRecord[];
  } | null>(null);
  
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<Date | null>(null);
  const [selectedScheduleItem, setSelectedScheduleItem] = useState<ScheduleItem | null>(null);

  // 管理者モード関連
  const [isAdminMode, setIsAdminMode] = useState<boolean>(() => {
    return StorageService.getData<boolean>(STORAGE_KEYS.ADMIN_MODE, false);
  });
  
  const [isBulkEditMode, setIsBulkEditMode] = useState<boolean>(false);
  const [selectedCells, setSelectedCells] = useState<{
    employeeId: number;
    date: Date;
  }[]>([]);

  // トースト通知
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({
    show: false,
    message: "",
    type: "info",
  });

  //---------------------------------------------------------------
  // 副作用（useEffect）
  //---------------------------------------------------------------
  // コンポーネントマウント時の処理
  useEffect(() => {
    console.log("App component mounted");
  }, []);

  // 状態変更時のLocalStorage保存
  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.CURRENT_VIEW, currentView);
  }, [currentView]);

  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.CURRENT_DATE, currentDate.toISOString());
  }, [currentDate]);

  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.SELECTED_EMPLOYEE, selectedEmployee);
  }, [selectedEmployee]);

  useEffect(() => {
    if (attendanceData.length > 0) {
      StorageService.saveData(STORAGE_KEYS.ATTENDANCE_DATA, attendanceData);
    }
  }, [attendanceData]);

  useEffect(() => {
    if (scheduleData.length > 0) {
      StorageService.saveData(STORAGE_KEYS.SCHEDULE_DATA, scheduleData);
    }
  }, [scheduleData]);

  useEffect(() => {
    StorageService.saveData(STORAGE_KEYS.ADMIN_MODE, isAdminMode);
  }, [isAdminMode]);

  // トースト通知の自動非表示
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast({ ...toast, show: false });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  //---------------------------------------------------------------
  // ヘルパー関数
  //---------------------------------------------------------------
  // カレンダー日付生成
  const generateCalendarDates = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const dates = [];

    // 前月の日付を追加
    for (let i = 0; i < firstDay.getDay(); i++) {
      const prevDate = new Date(year, month, -i);
      dates.unshift({ date: prevDate, isCurrentMonth: false });
    }

    // 当月の日付を追加
    for (let i = 1; i <= lastDay.getDate(); i++) {
      dates.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    // 翌月の日付を追加（6週間分になるように）
    const remainingDays = 42 - dates.length;
    for (let i = 1; i <= remainingDays; i++) {
      dates.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return dates;
  };

  // 日次集計を計算
  const calculateDailySummary = (date: Date): DailySummary => {
    const dateStr = format(date, "yyyy-MM-dd");
    const records = attendanceData.filter((record) => record.date === dateStr);

    return records.reduce((acc, record) => {
      acc[record.workType] = (acc[record.workType] || 0) + 1;
      return acc;
    }, {} as DailySummary);
  };

  // 特定の日付の予定を取得
  const getScheduleForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return scheduleData.filter(schedule => schedule.date === dateStr);
  };

  // トースト通知を表示
  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({
      show: true,
      message,
      type,
    });
  };

  // 確認モーダルを表示
  const showConfirm = (message: string, action: () => void) => {
    setConfirmModalMessage(message);
    setConfirmModalAction(() => action);
    setShowConfirmModal(true);
  };

  // 成功モーダルを表示
  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setShowSuccessModal(true);
  };

  //---------------------------------------------------------------
  // データ操作関数
  //---------------------------------------------------------------
  // 勤務データをエクスポート
  const exportToExcel = () => {
    const data = attendanceData.map((record) => ({
      従業員名: employees.find((emp) => emp.id.toString() === record.employeeId)?.name,
      日付: record.date,
      勤務区分: workTypes.find((w) => w.id === record.workType)?.label,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "勤務記録");
    XLSX.writeFile(wb, `勤務記録_${format(currentDate, "yyyy年M月")}.xlsx`);
    
    showToast("エクセルファイルのエクスポートが完了しました", "success");
  };

  // 予定データをエクスポート
  const exportScheduleToExcel = () => {
    const data = scheduleData.map((schedule) => ({
      従業員名: schedule.employeeId 
        ? employees.find((emp) => emp.id.toString() === schedule.employeeId)?.name
        : "全員",
      日付: schedule.date,
      タイトル: schedule.title,
      詳細: schedule.details || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "予定");
    XLSX.writeFile(wb, `予定_${format(currentDate, "yyyy年M月")}.xlsx`);
    
    showToast("予定のエクスポートが完了しました", "success");
  };

  // データのリセット
  const resetAllData = () => {
    showConfirm("全てのデータをリセットしますか？この操作は元に戻せません。", () => {
      setAttendanceData([]);
      setScheduleData([]);
      StorageService.saveData(STORAGE_KEYS.ATTENDANCE_DATA, []);
      StorageService.saveData(STORAGE_KEYS.SCHEDULE_DATA, []);
      showSuccess("全てのデータをリセットしました");
    });
  };

  //---------------------------------------------------------------
  // サブコンポーネント
  //---------------------------------------------------------------
  // TableViewコンポーネント
  const TableView = React.memo(() => {
    const daysInMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    ).getDate();

    const dates = Array.from({ length: daysInMonth }, (_, i) => 
      new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1)
    );
    
    // セルの選択・非選択を切り替える
    const toggleCellSelection = (employeeId: number, date: Date) => {
      if (!isBulkEditMode) return;
      
      const cellIndex = selectedCells.findIndex(
        cell => cell.employeeId === employeeId && cell.date.getTime() === date.getTime()
      );
      
      if (cellIndex !== -1) {
        // すでに選択されている場合は削除
        setSelectedCells(prev => prev.filter((_, i) => i !== cellIndex));
      } else {
        // 選択されていない場合は追加
        setSelectedCells(prev => [...prev, { employeeId, date }]);
      }
    };
    
    // セルが選択されているかを確認
    const isCellSelected = (employeeId: number, date: Date) => {
      return selectedCells.some(
        cell => cell.employeeId === employeeId && cell.date.getTime() === date.getTime()
      );
    };
    
    // 特定の日付の予定を取得
    const getEmployeeScheduleForDate = (employeeId: number, date: Date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      return scheduleData.filter(
        schedule => 
          schedule.date === dateStr && 
          (schedule.employeeId === employeeId.toString() || schedule.employeeId === "")
      );
    };

    return (
      <div className="flex flex-col h-full">
        <div className="mb-4 flex justify-between items-center">
          <div className="flex gap-2 items-center">
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="w-64 p-2 border rounded"
            >
              <option value="">全従業員を表示</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id.toString()}>
                  {emp.name}
                </option>
              ))}
            </select>
            
            {isAdminMode && (
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => {
                    setIsBulkEditMode(!isBulkEditMode);
                    if (!isBulkEditMode) {
                      setSelectedCells([]);
                    }
                  }}
                  className={`px-3 py-1 rounded ${
                    isBulkEditMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
                  }`}
                >
                  {isBulkEditMode ? '一括編集中' : '一括編集'}
                </button>
                
                {isBulkEditMode && selectedCells.length > 0 && (
                  <button
                    onClick={() => setSelectedCells([])}
                    className="px-3 py-1 rounded bg-gray-200"
                  >
                    選択解除 ({selectedCells.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="overflow-auto max-w-full attendance-table-container">
          <table className="border-collapse attendance-table">
            <thead>
              <tr>
                <th className="border p-2 min-w-[100px] max-w-[120px]">
                  従業員名
                </th>
                {dates.map(date => (
                  <th 
                    key={date.getTime()} 
                    className={`
                      border p-2 min-w-[80px] max-w-[90px]
                      ${getCellBackgroundColor(date).bg}
                    `}
                  >
                    <div className={`${getCellBackgroundColor(date).text} text-base truncate`}>
                      {format(date, 'd')}
                      <span className="block text-xs">
                        {['日', '月', '火', '水', '木', '金', '土'][date.getDay()]}
                        {isJapaneseHoliday(date) && (
                          <span className="block truncate text-xs">
                            {getHolidayName(date)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="text-xs">
                      {Object.entries(calculateDailySummary(date)).map(([type, count]) => (
                        <div key={type} className="truncate">
                          {workTypes.find(w => w.id === type)?.label}: {count}
                        </div>
                      ))}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees
                .filter(emp => !selectedEmployee || emp.id.toString() === selectedEmployee)
                .map(employee => {
                  return (
                    <tr key={employee.id}>
                      <td className="border p-2 whitespace-nowrap">{employee.name}</td>
                      {dates.map(date => {
                        const record = attendanceData.find(
                          r => r.employeeId === employee.id.toString() &&
                          r.date === format(date, 'yyyy-MM-dd')
                        );
                        
                        const schedules = getEmployeeScheduleForDate(employee.id, date);
                        const isSelected = isCellSelected(employee.id, date);
                        
                        return (
                          <td
                            key={`${employee.id}-${date.getTime()}`}
                            className={`
                              border p-2 cursor-pointer text-center relative
                              ${getCellBackgroundColor(date).bg}
                              ${getCellBackgroundColor(date).hover}
                              ${isBulkEditMode && isSelected ? 'bg-blue-100 border-2 border-blue-500' : ''}
                            `}
                            onClick={() => {
                              if (isBulkEditMode) {
                                toggleCellSelection(employee.id, date);
                              } else {
                                setSelectedCell({ employeeId: employee.id, date });
                                setShowWorkTypeModal(true);
                              }
                            }}
                          >
                            <div className="min-h-[40px] flex flex-col items-center justify-center">
                              {/* 勤務区分 */}
                              <div className="font-medium">
                                {record && workTypes.find(w => w.id === record.workType)?.label}
                              </div>
                              
                              {/* 予定表示 */}
                              {schedules.length > 0 && (
                                <div className="w-full mt-1">
                                  {schedules.slice(0, 2).map(schedule => (
                                    <div 
                                      key={schedule.id}
                                      className="text-xs px-1 py-0.5 rounded truncate text-white"
                                      style={{ backgroundColor: schedule.color || '#4A90E2' }}
                                      title={schedule.title}
                                    >
                                      {schedule.title}
                                    </div>
                                  ))}
                                  {schedules.length > 2 && (
                                    <div className="text-xs text-gray-500 truncate">
                                      +{schedules.length - 2}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    );
  });

  // CalendarViewコンポーネント
  const CalendarView = React.memo(() => {
    return (
      <div className="p-4">
        <div className="calendar-grid">
          {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
            <div key={day} className="calendar-header">
              {day}
            </div>
          ))}
          {generateCalendarDates(
            currentDate.getFullYear(),
            currentDate.getMonth()
          ).map(({ date, isCurrentMonth }) => {
            const dailySummary = calculateDailySummary(date);
            const schedules = getScheduleForDate(date);
            
            return (
              <div
                key={date.toISOString()}
                className={`calendar-cell ${
                  isCurrentMonth
                    ? "calendar-cell-current"
                    : "calendar-cell-other"
                } ${getCellBackgroundColor(date).text}`}
              >
                <div className="flex justify-between items-start">
                  <div className="font-bold">
                    {date.getDate()}
                    {isJapaneseHoliday(date) && (
                      <span className="ml-1 text-xs">{getHolidayName(date)}</span>
                    )}
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedScheduleDate(date);
                      setSelectedScheduleItem(null);
                      setShowScheduleModal(true);
                    }}
                    className="text-gray-500 hover:text-blue-500 p-1"
                    title="予定を追加"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>
                
                {/* 勤務区分の集計 */}
                <div className="text-xs space-y-1 mt-1">
                  {Object.entries(dailySummary).map(([type, count]) => {
                    const workTypeLabel =
                      workTypes.find((w) => w.id === type)?.label || type;
                    return (
                      <div
                        key={type}
                        className="bg-gray-50 p-1 rounded text-gray-600"
                      >
                        {workTypeLabel}: {count}名
                      </div>
                    );
                  })}
                </div>
                
                {/* 予定の表示 */}
                <div className="text-xs space-y-1 mt-2">
                  {schedules.map((schedule) => {
                    const employeeName = schedule.employeeId 
                      ? employees.find(e => e.id.toString() === schedule.employeeId)?.name 
                      : "全員";
                    
                    return (
                      <div
                        key={schedule.id}
                        className="p-1 rounded text-white truncate cursor-pointer"
                        style={{ backgroundColor: schedule.color || '#4A90E2' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedScheduleDate(date);
                          setSelectedScheduleItem(schedule);
                          setShowScheduleModal(true);
                        }}
                        title={`${schedule.title}${schedule.details ? ` - ${schedule.details}` : ''} (${employeeName})`}
                      >
                        {schedule.title}
                      </div>
                    );
                  })}
                </div>
                
                {/* 勤務詳細を見るためのクリックイベント */}
                <div 
                  className="absolute inset-0 cursor-pointer"
                  onClick={() => {
                    const dateStr = format(date, "yyyy-MM-dd");
                    const records = attendanceData.filter(
                      (record) => record.date === dateStr
                    );
                    setSelectedDateDetails({ date, records });
                    setShowAttendanceDetailModal(true);
                  }}
                ></div>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  //---------------------------------------------------------------
  // モーダルコンポーネント
  //---------------------------------------------------------------
  // 勤務登録モーダル
  const WorkTypeSelectionModal = () => {
    const [selectedWorkType, setSelectedWorkType] = useState("");

    useEffect(() => {
      if (showWorkTypeModal && selectedCell) {
        // 既存の勤務データがあれば選択状態にする
        const dateStr = format(selectedCell.date, "yyyy-MM-dd");
        const existingRecord = attendanceData.find(
          record => record.employeeId === selectedCell.employeeId.toString() && record.date === dateStr
        );
        
        if (existingRecord) {
          setSelectedWorkType(existingRecord.workType);
        } else {
          setSelectedWorkType("");
        }
      }
    }, [showWorkTypeModal, selectedCell]);

    const handleSubmit = () => {
      if (!selectedCell || !selectedWorkType) return;

      const dateStr = format(selectedCell.date, "yyyy-MM-dd");
      const newAttendanceData = attendanceData.filter(
        (record) =>
          !(
            record.employeeId === selectedCell.employeeId.toString() &&
            record.date === dateStr
          )
      );

      const newRecord: AttendanceRecord = {
        employeeId: selectedCell.employeeId.toString(),
        date: dateStr,
        workType: selectedWorkType,
        employeeName: employees.find(
          (emp) => emp.id === selectedCell.employeeId
        )?.name,
      };
      setAttendanceData([...newAttendanceData, newRecord]);
      setShowWorkTypeModal(false);
      setSelectedCell(null);
      setSelectedWorkType("");
      
      showToast(`${employees.find(emp => emp.id === selectedCell.employeeId)?.name}さんの勤務区分を登録しました`, "success");
    };

    const handleDelete = () => {
      if (!selectedCell) return;
      
      const dateStr = format(selectedCell.date, "yyyy-MM-dd");
      const newAttendanceData = attendanceData.filter(
        record => !(record.employeeId === selectedCell.employeeId.toString() && record.date === dateStr)
      );
      
      setAttendanceData(newAttendanceData);
      setShowWorkTypeModal(false);
      setSelectedCell(null);
      
      showToast("勤務区分を削除しました", "info");
    };

    return (
      <Modal
        isOpen={showWorkTypeModal}
        onClose={() => setShowWorkTypeModal(false)}
        title="勤務区分の選択"
      >
        {selectedCell && (
          <div className="p-4">
            <h3 className="text-lg font-bold mb-4">勤務区分の登録</h3>
            <p className="mb-4">
              {
                employees.find((emp) => emp.id === selectedCell.employeeId)
                  ?.name
              }
              さん
              {format(selectedCell.date, "M月d日")}の勤務区分を選択してください
            </p>
            <select
              value={selectedWorkType}
              onChange={(e) => setSelectedWorkType(e.target.value)}
              className="w-full p-2 border rounded mb-4"
            >
              <option value="">選択してください</option>
              {workTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              {selectedWorkType && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  削除
                </button>
              )}
              <button
                onClick={() => setShowWorkTypeModal(false)}
                className="px-4 py-2 bg-gray-200 rounded"
              >
                キャンセル
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-500 text-white rounded"
                disabled={!selectedWorkType}
              >
                登録
              </button>
            </div>
          </div>
        )}
      </Modal>
    );
  };

  // 日付詳細モーダル
  const AttendanceDetailModal = () => {
    if (!selectedDateDetails) return null;

    return (
      <Modal
        isOpen={showAttendanceDetailModal}
        onClose={() => setShowAttendanceDetailModal(false)}
        title={`${format(selectedDateDetails.date, "M月d日")}の勤務状況`}
      >
        <div className="space-y-4 p-4">
          {Object.entries(calculateDailySummary(selectedDateDetails.date)).length > 0 ? (
            Object.entries(calculateDailySummary(selectedDateDetails.date)).map(
              ([type, count]) => {
                const workTypeLabel =
                  workTypes.find((w) => w.id === type)?.label || type;
                const records = selectedDateDetails.records.filter(
                  (r) => r.workType === type
                );

                return (
                  <div key={type} className="border-b pb-2">
                    <div className="font-bold">
                      {workTypeLabel}: {count}名
                    </div>
                    <div className="text-sm text-gray-600">
                      {records.map((record) => (
                        <div key={record.employeeId} className="flex justify-between">
                          <span>{record.employeeName}</span>
                          {isAdminMode && (
                            <button
                              onClick={() => {
                                const emp = employees.find(e => e.id.toString() === record.employeeId);
                                if (emp) {
                                  setSelectedCell({
                                    employeeId: emp.id,
                                    date: selectedDateDetails.date
                                  });
                                  setShowAttendanceDetailModal(false);
                                  setShowWorkTypeModal(true);
                                }
                              }}
                              className="text-blue-500 hover:underline"
                            >
                              編集
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
            )
          ) : (
            <div className="text-gray-500 text-center py-4">
              この日の勤務記録はありません
            </div>
          )}
          
          {/* 予定の表示 */}
          <div className="mt-4">
            <h3 className="font-bold border-b pb-1 mb-2">予定</h3>
            {getScheduleForDate(selectedDateDetails.date).length > 0 ? (
              getScheduleForDate(selectedDateDetails.date).map(schedule => {
                const employeeName = schedule.employeeId 
                  ? employees.find(e => e.id.toString() === schedule.employeeId)?.name 
                  : "全員";
                
                return (
                  <div key={schedule.id} className="mb-2 p-2 rounded" style={{ backgroundColor: `${schedule.color}20` }}>
                    <div className="font-medium flex justify-between">
                      <span>{schedule.title}</span>
                      <span className="text-sm text-gray-600">{employeeName}</span>
                    </div>
                    {schedule.details && (
                      <div className="text-sm text-gray-600 mt-1">{schedule.details}</div>
                    )}
                    {isAdminMode && (
                      <div className="mt-2 text-right">
                        <button
                          onClick={() => {
                            setSelectedScheduleDate(selectedDateDetails.date);
                            setSelectedScheduleItem(schedule);
                            setShowAttendanceDetailModal(false);
                            setShowScheduleModal(true);
                          }}
                          className="text-blue-500 hover:underline text-sm"
                        >
                          編集
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-gray-500 text-center py-2">
                この日の予定はありません
              </div>
            )}
            
            <div className="text-center mt-4">
              <button
                onClick={() => {
                  setSelectedScheduleDate(selectedDateDetails.date);
                  setSelectedScheduleItem(null);
                  setShowAttendanceDetailModal(false);
                  setShowScheduleModal(true);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                新しい予定を追加
              </button>
            </div>
          </div>
        </div>
      </Modal>
    );
  };

  // 予定追加モーダル
  const ScheduleModal = () => {
    const [title, setTitle] = useState("");
    const [details, setDetails] = useState("");
    const [color, setColor] = useState("#4A90E2"); // デフォルト色
    const [empId, setEmpId] = useState(selectedEmployee || "");
    
    // 編集モードの場合は既存の値をセット
    useEffect(() => {
      if (selectedScheduleItem) {
        setTitle(selectedScheduleItem.title);
        setDetails(selectedScheduleItem.details || "");
        setColor(selectedScheduleItem.color || "#4A90E2");
        setEmpId(selectedScheduleItem.employeeId);
      } else {
        setTitle("");
        setDetails("");
        setColor("#4A90E2");
        setEmpId(selectedEmployee || "");
      }
    }, [selectedScheduleItem, selectedEmployee]);

    const handleSubmit = () => {
      if (!title.trim() || !selectedScheduleDate) return;
      
      const dateStr = format(selectedScheduleDate, "yyyy-MM-dd");
      
      if (selectedScheduleItem) {
        // 既存の予定を更新
        const newScheduleData = scheduleData.map(item => 
          item.id === selectedScheduleItem.id 
            ? { ...item, title, details, color, employeeId: empId }
            : item
        );
        setScheduleData(newScheduleData);
        showToast("予定を更新しました", "success");
      } else {
        // 新規予定を追加
        const newScheduleItem: ScheduleItem = {
          id: Date.now().toString(),
          employeeId: empId,
          date: dateStr,
          title,
          details,
          color
        };
        setScheduleData([...scheduleData, newScheduleItem]);
        showToast("新しい予定を追加しました", "success");
      }
      
      closeScheduleModal();
    };
    
    const handleDelete = () => {
      if (selectedScheduleItem) {
        showConfirm("この予定を削除しますか？", () => {
          const newScheduleData = scheduleData.filter(item => item.id !== selectedScheduleItem.id);
          setScheduleData(newScheduleData);
          closeScheduleModal();
          showToast("予定を削除しました", "info");
        });
      }
    };
    
    const closeScheduleModal = () => {
      setShowScheduleModal(false);
      setSelectedScheduleDate(null);
      setSelectedScheduleItem(null);
    };
    
    return (
      <Modal
        isOpen={showScheduleModal}
        onClose={closeScheduleModal}
        title={selectedScheduleItem ? "予定の編集" : "予定の追加"}
      >
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">対象日</label>
            <div className="p-2 border rounded bg-gray-50">
              {selectedScheduleDate && format(selectedScheduleDate, "yyyy年M月d日")}
              {selectedScheduleDate && isJapaneseHoliday(selectedScheduleDate) && (
                <span className="ml-2 text-red-500 text-sm">
                  {getHolidayName(selectedScheduleDate)}
                </span>
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">従業員</label>
            <select
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="">全員共通</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id.toString()}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">タイトル <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="予定のタイトル"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">詳細</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full p-2 border rounded"
              rows={3}
              placeholder="予定の詳細（任意）"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="p-1 border rounded"
              />
              <span className="text-sm">{color}</span>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            {selectedScheduleItem && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                削除
              </button>
            )}
            <button
              onClick={closeScheduleModal}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              disabled={!title.trim()}
            >
              {selectedScheduleItem ? "更新" : "追加"}
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  // 一括編集用のモーダル
  const BulkEditModal = () => {
    const [selectedWorkType, setSelectedWorkType] = useState("");

    const handleSubmit = () => {
      if (!selectedWorkType || selectedCells.length === 0) return;

      const newAttendanceData = [...attendanceData];

      selectedCells.forEach(cell => {
        const dateStr = format(cell.date, "yyyy-MM-dd");
        
        // 既存のレコードを除外
        const recordIndex = newAttendanceData.findIndex(
          record => record.employeeId === cell.employeeId.toString() && record.date === dateStr
        );
        
        if (recordIndex !== -1) {
          newAttendanceData.splice(recordIndex, 1);
        }

        // 新しいレコードを追加
        const newRecord: AttendanceRecord = {
          employeeId: cell.employeeId.toString(),
          date: dateStr,
          workType: selectedWorkType,
          employeeName: employees.find(emp => emp.id === cell.employeeId)?.name,
        };
        
        newAttendanceData.push(newRecord);
      });

      setAttendanceData(newAttendanceData);
      setIsBulkEditMode(false);
      setSelectedCells([]);
      setSelectedWorkType("");
      
      showToast(`${selectedCells.length}件の勤務区分を一括更新しました`, "success");
    };

    return (
      <Modal
        isOpen={isBulkEditMode && selectedCells.length > 0}
        onClose={() => {
          setIsBulkEditMode(false);
          setSelectedCells([]);
        }}
        title="勤務区分の一括編集"
      >
        <div className="p-4">
          <h3 className="text-lg font-bold mb-4">勤務区分の一括登録</h3>
          <p className="mb-4">
            選択された {selectedCells.length} 件のセルに適用する勤務区分を選択してください。
          </p>
          
          <div className="max-h-40 overflow-y-auto mb-4 border p-2 rounded">
            {selectedCells.map((cell, index) => {
              const emp = employees.find(e => e.id === cell.employeeId);
              return (
                <div key={index} className="text-sm">
                  {emp?.name} / {format(cell.date, "M月d日")}
                </div>
              );
            })}
          </div>
          
          <select
            value={selectedWorkType}
            onChange={(e) => setSelectedWorkType(e.target.value)}
            className="w-full p-2 border rounded mb-4"
          >
            <option value="">選択してください</option>
            {workTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setIsBulkEditMode(false);
                setSelectedCells([]);
              }}
              className="px-4 py-2 bg-gray-200 rounded"
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-500 text-white rounded"
              disabled={!selectedWorkType}
            >
              一括適用
            </button>
          </div>
        </div>
      </Modal>
    );
  };

  // 管理者設定トグル
  const AdminToggle = () => {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-white p-2 rounded-full shadow-lg">
          <button
            onClick={() => setIsAdminMode(!isAdminMode)}
            className={`p-3 rounded-full ${isAdminMode ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            title={isAdminMode ? '管理者モード：オン' : '管理者モード：オフ'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </button>
        </div>
      </div>
    );
  };

  //---------------------------------------------------------------
  // メインレンダリング
  //---------------------------------------------------------------
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100">
        <div className="container mx-auto p-4 max-w-full">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div className="flex gap-2 items-center flex-wrap">
              <button
                onClick={() => setCurrentView("calendar")}
                className={`px-4 py-2 rounded ${
                  currentView === "calendar"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200"
                }`}
              >
                全体カレンダー
              </button>
              <button
                onClick={() => setCurrentView("table")}
                className={`px-4 py-2 rounded ${
                  currentView === "table"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200"
                }`}
              >
                勤務表
              </button>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <button
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() - 1
                    )
                  )
                }
                className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
              >
                前月
              </button>
              <span className="font-bold">
                {format(currentDate, "yyyy年M月")}
              </span>
              <button
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() + 1
                    )
                  )
                }
                className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
              >
                次月
              </button>
              <div className="relative group">
                <button
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  エクスポート
                </button>
                <div className="absolute right-0 mt-1 w-48 bg-white rounded shadow-lg hidden group-hover:block z-50">
                  <button
                    onClick={exportToExcel}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                  >
                    勤務データをエクスポート
                  </button>
                  <button
                    onClick={exportScheduleToExcel}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                  >
                    予定データをエクスポート
                  </button>
                </div>
              </div>
              {isAdminMode && (
                <button
                  onClick={resetAllData}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  データリセット
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            {currentView === "calendar" && <CalendarView />}
            {currentView === "table" && <TableView />}
          </div>

          {/* トースト通知 */}
          {toast.show && (
            <div className={`toast ${toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}>
              {toast.message}
            </div>
          )}

          {/* モーダル */}
          <WorkTypeSelectionModal />
          <AttendanceDetailModal />
          <ScheduleModal />
          {isBulkEditMode && selectedCells.length > 0 && <BulkEditModal />}
          <ConfirmModal
            isOpen={showConfirmModal}
            onClose={() => setShowConfirmModal(false)}
            onConfirm={confirmModalAction}
            message={confirmModalMessage}
          />
          <SuccessModal
            isOpen={showSuccessModal}
            onClose={() => setShowSuccessModal(false)}
            message={successMessage}
          />
          <AdminToggle />
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default AttendanceApp;