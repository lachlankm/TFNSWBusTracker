export default function SearchBar({ value, onChange }) {
  return (
    <div className="app-search-field">
      <label htmlFor="bus-search" className="app-search-label">
        Search route
      </label>
      <input
        id="bus-search"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by route number (e.g. 333, B1, M30)"
        className="h-input app-search-input"
      />
    </div>
  );
}
