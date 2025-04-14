// src/App.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import JapaneseHolidays from "japanese-holidays";
import * as XLSX from "xlsx";
import { WorkTypeModal } from "./components/WorkTypeModal.tsx";
import { ScheduleModal } from "./components/ScheduleModal.tsx";
import { StorageService, STORAGE_KEYS } from "./services/storage";
import { AttendanceRecord, ScheduleItem } from "./types";
import "./index.css";

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
const getCellBackground = (date: Date) => {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || isJapaneseHoliday(date)) {
    return {
      bg: "bg-red-50",
      text: "text-red-600"
    };
  }
  if (dayOfWeek === 6) {
    return {
      bg: "bg-blue-50",
      text: "text-blue-600"
    };
  }
  return {
    bg: "",
    text: ""
  };
};

// 曜日を取得する関数
const getDayOfWeek = (date: Date): string => {
  return ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
};

// 従業員リスト
const employees = [
  { id: 1, name: "小田　孝" },
  { id: 2, name: "益田　洋史" },
  { id: 3, name: "佐藤　徳保" },
  { id: 4, name: "吉野　広一郎" },
  { id: 5, name: "田口　祐介" },
  { id: 6, name: "江沢　侑也" },
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
  { id: 17, name: "若木　雄太" },
  { id: 18, name: "藤田　向陽" },
  { id: 19, name: "中谷　優衣" },
  { id: 20, name: "濱田　泰陽" },
  { id: 21, name: "佐々木　幹也" },
  { id: 22, name: "前田　愛都" },
  { id: 23, name: "益田　幸枝" },
  { id: 24, name: "井上　真理子" },
  { id: 25, name: "斎藤　綾子" },
  { id: 26, name: "越野　裕太" },
  { id: 27, name: "非常勤（桑原　真尋）" }
];

// 勤務区分リスト
const workTypes = [
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
  { id: "A/p1", label: "A/p1" },
  { id: "A/p2", label: "A/p2" },
  { id: "a1/p", label: "a1/p" },
  { id: "a2/p", label: "a2/p" },
  { id: "a/p1", label: "a/p1" },
  { id: "a/p2", label: "a/p2" },
  { id: "日", label: "日" },
  { id: "遅1", label: "遅1" },
  { id: "遅2", label: "遅2" },
  { id: "早1", label: "早1" },
  { id: "早2", label: "早2" },
  { id: "半1", label: "半1" },
  { id: "半5", label: "半5" },
  { id: "短", label: "短" },
  { id: "短土", label: "短土" },
  { id: "特", label: "特" }
];

const App: React.FC = () => {
  // 状態管理
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [scheduleData, setScheduleData] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [pendingChanges, setPendingChanges] = useState<boolean>(false);

  // トースト通知
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error" | "info" | "warning";
  }>({
    show: false,
    message: "",
    type: "info"
  });

  // モーダル状態
  const [workTypeModalOpen, setWorkTypeModalOpen] = useState<boolean>(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState<boolean>(false);
  const [selectedCell, setSelectedCell] = useState<{
    employeeId: number;
    date: Date;
    currentWorkType: string | null;
  } | null>(null);
  
  const [selectedSchedule, setSelectedSchedule] = useState<{
    date: Date;
    schedule?: ScheduleItem;
  } | null>(null);

  // 月の日数を計算
  const daysInMonth = useMemo(() => {
    return new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    ).getDate();
  }, [currentDate]);

  // 日付の配列を生成
  const datesArray = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => 
      new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1)
    );
  }, [currentDate, daysInMonth]);
  
  // 従業員のフィルタリング
  const filteredEmployees = useMemo(() => {
    if (!selectedEmployee) return employees;
    return employees.filter(emp => emp.id.toString() === selectedEmployee);
  }, [selectedEmployee]);

  // トースト通知を表示する関数
  const showToast = useCallback((message: string, type: "success" | "error" | "info" | "warning" = "info") => {
    setToast({
      show: true,
      message,
      type
    });
    
    // 3秒後に非表示
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3000);
  }, []);

  // 勤務区分を取得する関数
  const getEmployeeWorkType = useCallback((employeeId: number, date: Date): string | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    const record = attendanceData.find(
      r => r.employeeId === employeeId.toString() && r.date === dateStr
    );
    return record ? record.workType : null;
  }, [attendanceData]);

  // 特定の日付の予定を取得する関数
  const getSchedulesForDate = useCallback((date: Date, employeeId?: number): ScheduleItem[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    
    if (employeeId) {
      // 特定従業員の予定のみフィルタリング
      return scheduleData.filter(schedule => 
        schedule.date === dateStr && 
        (!schedule.employeeId || // 全員向け予定
          schedule.employeeId === employeeId.toString() ||
          (schedule.employeeIds && 
          (schedule.employeeIds.includes(employeeId.toString()) || 
           schedule.employeeIds.length === 0)) // 空配列は全員向け
        )
      );
    } else {
      // すべての予定を取得
      return scheduleData.filter(schedule => schedule.date === dateStr);
    }
  }, [scheduleData]);

  // セルクリック時の処理
  const handleCellClick = useCallback((employeeId: number, date: Date) => {
    const currentWorkType = getEmployeeWorkType(employeeId, date);
    setSelectedCell({ employeeId, date, currentWorkType });
    setWorkTypeModalOpen(true);
  }, [getEmployeeWorkType]);

  // 予定をクリックした時の処理
  const handleScheduleClick = useCallback((e: React.MouseEvent, date: Date, schedule?: ScheduleItem) => {
    e.stopPropagation(); // セルクリックイベントを止める
    setSelectedSchedule({ date, schedule });
    setScheduleModalOpen(true);
  }, []);

  // 勤務区分選択後の処理
  const handleWorkTypeSelect = useCallback(async (workType: string) => {
    if (!selectedCell) return;
    
    try {
      setIsSyncing(true);
      setSyncProgress(10);
      
      const dateStr = format(selectedCell.date, "yyyy-MM-dd");
      const employeeName = employees.find(emp => emp.id === selectedCell.employeeId)?.name;
      
      // 既存のレコードを削除
      const newData = attendanceData.filter(record => 
        !(record.employeeId === selectedCell.employeeId.toString() && record.date === dateStr)
      );
      
      // 勤務区分が空でなければ新しいレコードを追加
      if (workType) {
        newData.push({
          employeeId: selectedCell.employeeId.toString(),
          date: dateStr,
          workType,
          employeeName
        });
      }
      
      setSyncProgress(30);
      
      // 状態を更新
      setAttendanceData(newData);
      
      // データを保存
      setSyncProgress(50);
      const success = await StorageService.saveData(STORAGE_KEYS.ATTENDANCE_DATA, newData);
      
      setSyncProgress(100);
      setIsSyncing(false);
      
      if (success) {
        // オンライン状態に応じてフラグ設定
        setPendingChanges(!navigator.onLine && !isOffline);
        showToast("勤務区分を更新しました", "success");
      } else {
        showToast("更新はローカルに保存されました。後で同期してください", "info");
        setPendingChanges(true);
      }
    } catch (error) {
      console.error('勤務区分の更新に失敗しました:', error);
      setIsSyncing(false);
      showToast("勤務区分の更新に失敗しました", "error");
    }
  }, [selectedCell, attendanceData, employees, showToast, isOffline]);

// 予定の保存処理
const handleScheduleSave = useCallback(async (scheduleFormData: { 
  title: string; 
  employeeIds: string[]; 
  details?: string; 
  color?: string;
}) => {
  if (!selectedSchedule) return;
  
  try {
    setIsSyncing(true);
    setSyncProgress(10);
    
    const dateStr = format(selectedSchedule.date, "yyyy-MM-dd");
    const isUpdate = !!selectedSchedule.schedule;
    
    // 修正: 既存のスケジュールデータのコピーを作成
    let newSchedules = [...scheduleData];
    
    // 更新の場合
    if (isUpdate && selectedSchedule.schedule) {
      newSchedules = newSchedules.map(item => 
        item.id === selectedSchedule.schedule?.id 
          ? { 
              ...item, 
              title: scheduleFormData.title, 
              employeeIds: scheduleFormData.employeeIds,
              employeeId: scheduleFormData.employeeIds[0] || "", // 後方互換性のため
              details: scheduleFormData.details,
              color: scheduleFormData.color
            }
          : item
      );
    } else {
      // 新規作成の場合
      newSchedules.push({
        id: Date.now().toString(),
        date: dateStr,
        title: scheduleFormData.title,
        employeeIds: scheduleFormData.employeeIds,
        employeeId: scheduleFormData.employeeIds[0] || "", // 後方互換性のため
        details: scheduleFormData.details,
        color: scheduleFormData.color
      });
    }
      
      setSyncProgress(40);
      
      // 状態を更新
      setScheduleData(newSchedules);
      
      // データを保存
      setSyncProgress(70);
      const success = await StorageService.saveData(STORAGE_KEYS.SCHEDULE_DATA, newSchedules);
      
      setSyncProgress(100);
      setIsSyncing(false);
      
      if (success) {
        setPendingChanges(!navigator.onLine && !isOffline);
        showToast(isUpdate ? "予定を更新しました" : "予定を追加しました", "success");
      } else {
        showToast("更新はローカルに保存されました。後で同期してください", "info");
        setPendingChanges(true);
      }
    } catch (error) {
      console.error('予定の保存に失敗しました:', error);
      setIsSyncing(false);
      showToast("予定の保存に失敗しました", "error");
    }
  }, [selectedSchedule, scheduleData, showToast, isOffline]);

  // 予定の削除処理
  const handleScheduleDelete = useCallback(async (scheduleId: string) => {
    try {
      setIsSyncing(true);
      setSyncProgress(10);
      
      // 予定を削除
      const newSchedules = scheduleData.filter(item => item.id !== scheduleId);
      
      setSyncProgress(40);
      
      // 状態を更新
      setScheduleData(newSchedules);
      
      // データを保存
      setSyncProgress(70);
      const success = await StorageService.saveData(STORAGE_KEYS.SCHEDULE_DATA, newSchedules);
      
      setSyncProgress(100);
      setIsSyncing(false);
      
      if (success) {
        setPendingChanges(!navigator.onLine && !isOffline);
        showToast("予定を削除しました", "success");
      } else {
        showToast("削除はローカルに保存されました。後で同期してください", "info");
        setPendingChanges(true);
      }
    } catch (error) {
      console.error('予定の削除に失敗しました:', error);
      setIsSyncing(false);
      showToast("予定の削除に失敗しました", "error");
    }
  }, [scheduleData, showToast, isOffline]);

  // 前月へ移動
  const goToPreviousMonth = useCallback(() => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() - 1);
      return newDate;
    });
  }, []);

  // 翌月へ移動
  const goToNextMonth = useCallback(() => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + 1);
      return newDate;
    });
  }, []);

  // データ同期処理
  const syncData = useCallback(async () => {
    if (isOffline) {
      showToast("オフラインのため同期できません", "warning");
      return;
    }
    
    try {
      setIsSyncing(true);
      setSyncProgress(0);
      
      // 勤怠データを同期
      setSyncProgress(10);
      const attendanceSuccess = await StorageService.saveData(
        STORAGE_KEYS.ATTENDANCE_DATA, 
        attendanceData,
        (_stage, progress) => setSyncProgress(10 + progress * 0.4)
      );
      
      // 予定データを同期
      setSyncProgress(50);
      const scheduleSuccess = await StorageService.saveData(
        STORAGE_KEYS.SCHEDULE_DATA, 
        scheduleData,
        (_stage, progress) => setSyncProgress(50 + progress * 0.5)
      );
      
      setSyncProgress(100);
      setIsSyncing(false);
      
      if (attendanceSuccess && scheduleSuccess) {
        setPendingChanges(false);
        showToast("データを同期しました", "success");
      } else {
        showToast("同期に一部失敗しました", "warning");
      }
    } catch (error) {
      console.error('同期エラー:', error);
      setIsSyncing(false);
      showToast("同期に失敗しました", "error");
    }
  }, [attendanceData, scheduleData, isOffline, showToast]);

  // エクスポート処理
  const exportData = useCallback(() => {
    try {
      // 勤怠データをエクスポート用に整形
      const exportData = attendanceData
        .filter(record => record.date.startsWith(format(currentDate, "yyyy-MM")))
        .map(record => ({
          従業員名: employees.find(emp => emp.id.toString() === record.employeeId)?.name || "",
          日付: record.date,
          勤務区分: workTypes.find(type => type.id === record.workType)?.label || record.workType
        }));
      
      if (exportData.length === 0) {
        showToast("エクスポートするデータがありません", "warning");
        return;
      }
      
      // Excel作成
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "勤務記録");
      
      // ファイル保存
      XLSX.writeFile(wb, `勤務記録_${format(currentDate, "yyyy年MM月")}.xlsx`);
      
      showToast("エクスポートが完了しました", "success");
    } catch (error) {
      console.error('エクスポートエラー:', error);
      showToast("エクスポートに失敗しました", "error");
    }
  }, [attendanceData, currentDate, showToast]);

  // オンライン/オフライン状態の監視
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      if (attendanceData.length > 0 || scheduleData.length > 0) {
        setPendingChanges(true);
        showToast("オンラインに戻りました。同期ボタンからデータを同期できます", "info");
      }
    };
    
    const handleOffline = () => {
      setIsOffline(true);
      showToast("オフライン状態になりました。データはローカルに保存されます", "warning");
    };
    
    // 初期オフライン状態をチェック
    setIsOffline(!navigator.onLine);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [attendanceData.length, scheduleData.length, showToast]);

  // 初期データ読み込み
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // 並列でデータを読み込む
        const [attendance, schedule] = await Promise.all([
          StorageService.getDataAsync<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE_DATA, []),
          StorageService.getDataAsync<ScheduleItem[]>(STORAGE_KEYS.SCHEDULE_DATA, [])
        ]);
        
        setAttendanceData(attendance);
        setScheduleData(schedule);
        
        // オンライン状態で既存データがある場合、同期フラグを立てる
        if (navigator.onLine && (attendance.length > 0 || schedule.length > 0)) {
          setPendingChanges(true);
        }
      } catch (error) {
        console.error('データ読み込みエラー:', error);
        showToast("データの読み込みに失敗しました", "error");
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [showToast]);

  // レンダリング
  return (
    <div className="container mx-auto p-2 sm:p-4 bg-white min-h-screen">
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          {/* ヘッダー: 年月選択と従業員フィルター */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4">
            <div className="flex items-center space-x-2">
              <button 
                onClick={goToPreviousMonth}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded touch-action-manipulation"
              >
                前月
              </button>
              <h2 className="text-xl font-bold">{format(currentDate, "yyyy年M月")}</h2>
              <button 
                onClick={goToNextMonth}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded touch-action-manipulation"
              >
                次月
              </button>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <select 
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="p-2 border rounded w-full sm:w-64 text-base" // iOSのフォントサイズ問題対策
                style={{ WebkitAppearance: 'menulist', appearance: 'menulist' }} // iOS対策
              >
                <option value="">全従業員を表示</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id.toString()}>{emp.name}</option>
                ))}
              </select>
              <div className="flex space-x-2 w-full sm:w-auto">
                <button 
                  onClick={syncData}
                  disabled={isOffline || !pendingChanges || isSyncing}
                  className={`px-4 py-2 rounded text-white flex-1 sm:flex-none
                    ${(isOffline || !pendingChanges) ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'}
                    touch-action-manipulation min-h-[44px]`}
                >
                  {isSyncing ? '同期中...' : 'データを同期'}
                </button>
                <button 
                  onClick={exportData}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 flex-1 sm:flex-none touch-action-manipulation min-h-[44px]"
                >
                  エクスポート
                </button>
              </div>
            </div>
          </div>
          
          {/* 同期プログレスバー */}
          {isSyncing && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 dark:bg-gray-700">
              <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${syncProgress}%` }}></div>
            </div>
          )}
          
          {/* メインテーブル */}
          <div className="overflow-x-auto border rounded shadow relative">
            <table className="min-w-full border-collapse attendance-table">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 border p-2 bg-white z-20 min-w-[120px]">従業員名</th>
                  {datesArray.map(date => {
                    const dayOfWeek = getDayOfWeek(date);
                    const { bg, text } = getCellBackground(date);
                    const holidayName = getHolidayName(date);
                    
                    return (
                      <th 
                        key={date.getTime()} 
                        className={`border p-2 ${bg} ${text} whitespace-nowrap min-w-[70px]`}
                      >
                        <div className="flex flex-col items-center">
                          <div className="text-base">{date.getDate()}</div>
                          <div className="text-xs">{dayOfWeek}</div>
                          {holidayName && (
                            <div className="text-xs text-red-500 truncate max-w-[60px]">{holidayName}</div>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map(employee => (
                  <tr key={employee.id}>
                    <td className="sticky left-0 border p-2 bg-white font-medium z-10 min-h-[60px]">
                      {employee.name}
                    </td>
                    {datesArray.map(date => {
                      const workType = getEmployeeWorkType(employee.id, date);
                      const { bg } = getCellBackground(date);
                      const schedules = getSchedulesForDate(date, employee.id);
                      
                      return (
                        <td 
                          key={`${employee.id}-${date.getTime()}`} 
                          className={`border p-1 text-center cursor-pointer hover:bg-gray-100 ${bg} min-h-[60px] relative`}
                          onClick={() => handleCellClick(employee.id, date)}
                        >
                          {/* 勤務区分 */}
                          <div className={`text-base ${workType ? 'font-bold' : ''} min-h-[24px]`}>
                            {workType || ""}
                          </div>
                          
                          {/* 予定表示 */}
                          <div className="mt-1">
                            {schedules.slice(0, 2).map(schedule => (
                              <div 
                                key={schedule.id}
                                onClick={(e) => handleScheduleClick(e, date, schedule)}
                                className="text-xs px-1 py-0.5 mb-1 rounded truncate text-white"
                                style={{ backgroundColor: schedule.color || '#4A90E2' }}
                              >
                                {schedule.title}
                              </div>
                            ))}
                            {schedules.length > 2 && (
                              <div className="text-xs text-gray-600 truncate">
                                他 {schedules.length - 2} 件
                              </div>
                            )}
                          </div>
                          
                          {/* 予定追加ボタン */}
                          <div className="absolute top-0 right-0 p-0.5">
                            <button
                              onClick={(e) => handleScheduleClick(e, date)}
                              className="text-gray-400 hover:text-blue-500 bg-white/50 hover:bg-white/80 rounded-full w-5 h-5 flex items-center justify-center"
                            >
                              +
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 勤務区分選択モーダル */}
      {workTypeModalOpen && selectedCell && (
        <WorkTypeModal 
          isOpen={workTypeModalOpen}
          onClose={() => setWorkTypeModalOpen(false)}
          employee={employees.find(e => e.id === selectedCell.employeeId)}
          date={selectedCell.date}
          currentWorkType={selectedCell.currentWorkType || ""}
          workTypes={workTypes}
          onSelect={handleWorkTypeSelect}
        />
      )}

      {/* 予定編集モーダル */}
      {scheduleModalOpen && selectedSchedule && (
        <ScheduleModal
          isOpen={scheduleModalOpen}
          onClose={() => setScheduleModalOpen(false)}
          date={selectedSchedule.date}
          schedule={selectedSchedule.schedule}
          employees={employees}
          onSave={handleScheduleSave}
          onDelete={selectedSchedule.schedule ? handleScheduleDelete : undefined}
        />
      )}

      {/* トースト通知 */}
      {toast.show && (
        <div className={`
          fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg text-white z-50
          ${toast.type === 'success' ? 'bg-green-500' : 
            toast.type === 'error' ? 'bg-red-500' : 
            toast.type === 'warning' ? 'bg-yellow-500' : 
            'bg-blue-500'}
        `}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default App;