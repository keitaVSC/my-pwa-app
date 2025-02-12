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
