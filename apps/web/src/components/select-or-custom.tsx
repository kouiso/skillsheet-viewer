'use client';

interface SelectOrCustomProps {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  placeholder?: string;
}

export function SelectOrCustom({ value, options, onChange, placeholder }: SelectOrCustomProps) {
  const isCustom = value !== '' && !options.includes(value);
  const selectValue = isCustom ? '__custom__' : value;

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === '__custom__') {
      onChange('');
    } else {
      onChange(v);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={isCustom ? '__custom__' : selectValue}
        onChange={handleSelectChange}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">{placeholder ?? '選択してください'}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value="__custom__">その他</option>
      </select>
      {(selectValue === '__custom__' || isCustom) && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="自由入力"
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}
    </div>
  );
}
