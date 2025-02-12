export const generateCalendarDates = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  const result = [];
  const firstDayOfWeek = firstDay.getDay();
  
  // 前月の日付を追加
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const date = new Date(year, month, -i);
    result.push({ date, isCurrentMonth: false });
  }
  
  // 当月の日付を追加
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const date = new Date(year, month, i);
    result.push({ date, isCurrentMonth: true });
  }
  
  // 翌月の日付を追加
  const remainingDays = 42 - result.length; // 6週間分（42日）になるように調整
  for (let i = 1; i <= remainingDays; i++) {
    const date = new Date(year, month + 1, i);
    result.push({ date, isCurrentMonth: false });
  }
  
  return result;
};
