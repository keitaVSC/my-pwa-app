// src/App.tsx
import React, { useState } from "react";
import { format } from "date-fns";
import * as XLSX from "xlsx";

// Components
import Modal from './components/Modal';

// Types
interface Employee {
  id: number;
  name: string;
}

interface WorkType {
  id: string;
  label: string;
}

interface AttendanceRecord {
  employeeId: string;
  date: string;
  workType: string;
  employeeName?: string;
}

interface DailySummary {
  [workType: string]: number;
}

type View = "calendar" | "table";

// Initial Data
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
const AttendanceApp: React.FC = () => {
  // State
  const [currentView, setCurrentView] = useState<View>("calendar");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [showWorkTypeModal, setShowWorkTypeModal] = useState(false);
  const [showAttendanceDetailModal, setShowAttendanceDetailModal] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    employeeId: number;
    date: Date;
  } | null>(null);

  const [selectedDateDetails, setSelectedDateDetails] = useState<{
    date: Date;
    records: AttendanceRecord[];
  } | null>(null);

  // Calendar Helper Functions
  const generateCalendarDates = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const dates = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      const prevDate = new Date(year, month, -i);
      dates.unshift({ date: prevDate, isCurrentMonth: false });
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      dates.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    const remainingDays = 42 - dates.length;
    for (let i = 1; i <= remainingDays; i++) {
      dates.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return dates;
  };

  // 日次集計を計算する関数
  const calculateDailySummary = (date: Date): DailySummary => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const records = attendanceData.filter(record => record.date === dateStr);
    
    return records.reduce((acc, record) => {
      acc[record.workType] = (acc[record.workType] || 0) + 1;
      return acc;
    }, {} as DailySummary);
  };

  // テーブルビューコンポーネント（エクセル方式）
  const TableView = () => {
    const daysInMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    ).getDate();

    const dates = Array.from({ length: daysInMonth }, (_, i) => 
      new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1)
    );

    return (
      <div className="flex flex-col h-full">
        <div className="mb-4">
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
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="border p-2 sticky left-0 bg-white z-20">従業員名</th>
                {dates.map(date => (
                  <th key={date.getTime()} className="border p-2 min-w-[100px]">
                    <div>{format(date, 'd')}</div>
                    <div className="text-xs">
                      {Object.entries(calculateDailySummary(date)).map(([type, count]) => (
                        <div key={type}>
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
                .map(employee => (
                <tr key={employee.id}>
                  <td className="border p-2 sticky left-0 bg-white">{employee.name}</td>
                  {dates.map(date => {
                    const record = attendanceData.find(
                      r => r.employeeId === employee.id.toString() &&
                      r.date === format(date, 'yyyy-MM-dd')
                    );
                    
                    return (
                      <td
                        key={`${employee.id}-${date.getTime()}`}
                        className="border p-2 cursor-pointer hover:bg-gray-50"
                        onClick={() => {
                          setSelectedCell({ employeeId: employee.id, date });
                          setShowWorkTypeModal(true);
                        }}
                      >
                        {record && workTypes.find(w => w.id === record.workType)?.label}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };
  // カレンダービューコンポーネント
  const CalendarView = () => {
    return (
      <div className="p-4">
        <div className="grid grid-cols-7 gap-1">
          {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
            <div key={day} className="text-center font-bold p-2">
              {day}
            </div>
          ))}
          {generateCalendarDates(currentDate.getFullYear(), currentDate.getMonth()).map(({ date, isCurrentMonth }) => {
            const dailySummary = calculateDailySummary(date);
            return (
              <div
                key={date.toISOString()}
                onClick={() => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const records = attendanceData.filter(record => record.date === dateStr);
                  setSelectedDateDetails({ date, records });
                  setShowAttendanceDetailModal(true);
                }}
                className={`p-2 border min-h-24 cursor-pointer hover:bg-gray-50 ${
                  isCurrentMonth ? "bg-white" : "bg-gray-50"
                } ${date.getDay() === 0 ? "text-red-500" : ""} ${date.getDay() === 6 ? "text-blue-500" : ""}`}
              >
                <div className="font-bold">{date.getDate()}</div>
                <div className="text-xs space-y-1 mt-1">
                  {Object.entries(dailySummary).map(([type, count]) => {
                    const workTypeLabel = workTypes.find(w => w.id === type)?.label || type;
                    return (
                      <div key={type} className="bg-gray-50 p-1 rounded text-gray-600">
                        {workTypeLabel}: {count}名
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 勤務登録モーダル
  const WorkTypeSelectionModal = () => {
    const [selectedWorkType, setSelectedWorkType] = useState('');

    const handleSubmit = () => {
      if (!selectedCell || !selectedWorkType) return;

      const dateStr = format(selectedCell.date, 'yyyy-MM-dd');
      const newAttendanceData = attendanceData.filter(
        record => !(record.employeeId === selectedCell.employeeId.toString() && record.date === dateStr)
      );

      const newRecord: AttendanceRecord = {
        employeeId: selectedCell.employeeId.toString(),
        date: dateStr,
        workType: selectedWorkType,
        employeeName: employees.find(emp => emp.id === selectedCell.employeeId)?.name
      };

      setAttendanceData([...newAttendanceData, newRecord]);
      setShowWorkTypeModal(false);
      setSelectedCell(null);
      setSelectedWorkType('');
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
              {employees.find(emp => emp.id === selectedCell.employeeId)?.name}さん
              {format(selectedCell.date, 'M月d日')}の勤務区分を選択してください
            </p>
            <select
              value={selectedWorkType}
              onChange={(e) => setSelectedWorkType(e.target.value)}
              className="w-full p-2 border rounded mb-4"
            >
              <option value="">選択してください</option>
              {workTypes.map(type => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
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
        title={`${format(selectedDateDetails.date, 'M月d日')}の勤務状況`}
      >
        <div className="space-y-4">
          {Object.entries(calculateDailySummary(selectedDateDetails.date)).map(([type, count]) => {
            const workTypeLabel = workTypes.find(w => w.id === type)?.label || type;
            const records = selectedDateDetails.records.filter(r => r.workType === type);
            
            return (
              <div key={type} className="border-b pb-2">
                <div className="font-bold">{workTypeLabel}: {count}名</div>
                <div className="text-sm text-gray-600">
                  {records.map(record => (
                    <div key={record.employeeId}>{record.employeeName}</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    );
  };

  // エクセルエクスポート機能
  const exportToExcel = () => {
    const data = attendanceData.map(record => ({
      従業員名: employees.find(emp => emp.id.toString() === record.employeeId)?.name,
      日付: record.date,
      勤務区分: workTypes.find(w => w.id === record.workType)?.label
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "勤務記録");
    XLSX.writeFile(wb, `勤務記録_${format(currentDate, 'yyyy年M月')}.xlsx`);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-4">
          <button
            onClick={() => setCurrentView("calendar")}
            className={`px-4 py-2 rounded ${
              currentView === "calendar" ? "bg-blue-500 text-white" : "bg-gray-200"
            }`}
          >
            全体カレンダー
          </button>
          <button
            onClick={() => setCurrentView("table")}
            className={`px-4 py-2 rounded ${
              currentView === "table" ? "bg-blue-500 text-white" : "bg-gray-200"
            }`}
          >
            勤務表
          </button>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
            className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
          >
            前月
          </button>
          <span className="font-bold">
            {format(currentDate, 'yyyy年M月')}
          </span>
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
            className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
          >
            次月
          </button>
          <button
            onClick={exportToExcel}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            エクセルエクスポート
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        {currentView === "calendar" && <CalendarView />}
        {currentView === "table" && <TableView />}
      </div>

      <WorkTypeSelectionModal />
      <AttendanceDetailModal />
    </div>
  );
};

export default AttendanceApp;