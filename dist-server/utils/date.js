export function formatDate(ts, format = 'ISO') {
    if (!ts)
        return '';
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (format === 'ISO')
        return `${y}-${m}-${day}`;
    return `${m}/${day}/${y}`;
}
export default formatDate;
