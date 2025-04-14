export interface Employee {
  id: number;
  name: string;
}

export interface WorkType {
  id: string;
  label: string;
}

export interface AttendanceRecord {
  employeeId: string;
  date: string;
  workType: string;
  employeeName?: string;
}

export interface DailySummary {
  [workType: string]: number;
}

// src/types/index.ts に追加
export interface ScheduleItem {
  id: string;
  employeeId: string;  // 後方互換性のために維持
  employeeIds?: string[]; // 複数従業員対応
  date: string;
  title: string;
  details?: string;
  color?: string;
}

