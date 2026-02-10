export default function SearchBar({ value, onChange }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <label htmlFor="bus-search" className="mb-2 block text-sm font-medium text-slate-700">
        Search route
      </label>
      <input
        id="bus-search"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by route number (e.g. 333, B1, M30)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}
