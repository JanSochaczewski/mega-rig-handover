import type { DigestNight } from '../digest/types.js';

function DisplayValue(value: string | number | null) {
  if (value === null) {
    return <span class="mute">—</span>;
  }
  return String(value);
}

export function Digest({ night, digest }: { night: string; digest: DigestNight }) {
  const sortedRows = [...digest.rows].sort((left, right) => left.job.localeCompare(right.job));

  return (
    <>
      <h1>digest</h1>
      <p class="mute">{night}</p>

      {digest.badLines > 0 && <p class="warn">{digest.badLines} malformed {digest.badLines === 1 ? 'line' : 'lines'}</p>}

      {sortedRows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>status</th>
              <th>error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{DisplayValue(row.owner)}</td>
                <td>{row.runs}</td>
                <td>
                  {row.retries >= 3 ? (
                    <span class="warn">{row.retries} (high retry count)</span>
                  ) : row.retries}
                </td>
                <td><span class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</span></td>
                <td>{DisplayValue(row.lastError)}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
