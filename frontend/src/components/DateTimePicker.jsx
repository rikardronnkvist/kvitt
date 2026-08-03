import { useRef } from 'react';
import { Calendar } from 'lucide-react';

export default function DateTimePicker({ value, onChange }) {
  const dateRef = useRef(null);
  const textRef = useRef(null);

  const dateValue = value?.slice(0, 10) || '';
  const timeValue = value?.slice(11, 16) || '';

  function handleDateChange(newDate) {
    const sanitized = newDate.split('T')[0];
    onChange(sanitized + 'T' + (timeValue || '00:00'));
    dateRef.current?.blur();
  }

  function openDatePicker() {
    try { dateRef.current?.showPicker(); } catch { dateRef.current?.click(); }
  }

  function handleTimeChange(newTime) {
    onChange((dateValue || '') + 'T' + newTime);
  }

  // Normalizes loose input: "1234"→"12:34", "345"→"03:45", "3:45"→"03:45"
  function formatTimeOnBlur(raw) {
    const digits = raw.replace(/\D/g, '');
    let h, m;
    if (raw.includes(':')) {
      const [left, right] = raw.split(':');
      h = left.replace(/\D/g, '').padStart(2, '0');
      m = (right || '').replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
    } else if (digits.length <= 2) {
      h = digits.padStart(2, '0');
      m = '00';
    } else if (digits.length === 3) {
      h = digits.slice(0, 1).padStart(2, '0');
      m = digits.slice(1);
    } else {
      h = digits.slice(0, 2);
      m = digits.slice(2, 4);
    }
    const formatted = `${h}:${m}`;
    if (/^\d{2}:\d{2}$/.test(formatted)) handleTimeChange(formatted);
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="relative flex items-center">
        <input
          ref={textRef}
          type="text"
          readOnly
          value={dateValue}
          onClick={openDatePicker}
          style={{ paddingRight: '2.5rem', cursor: 'pointer' }}
          required
        />
        <Calendar size={16} onClick={openDatePicker} style={{ position: 'absolute', right: '0.75rem', cursor: 'pointer', color: 'var(--text-muted)' }} />
        <input
          ref={dateRef}
          type="date"
          value={dateValue}
          onChange={(e) => handleDateChange(e.target.value)}
          onKeyDown={(e) => e.preventDefault()}
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, padding: 0, border: 0, pointerEvents: 'none' }}
        />
      </div>
      <div className="relative flex items-center">
        <input
          type="text"
          inputMode="numeric"
          placeholder="HH:MM"
          pattern="\d{2}:\d{2}"
          value={timeValue}
          onChange={(e) => handleTimeChange(e.target.value)}
          onBlur={(e) => formatTimeOnBlur(e.target.value)}
          required
        />
      </div>
    </div>
  );
}
