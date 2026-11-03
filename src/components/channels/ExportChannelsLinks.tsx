import { Icon } from "@/components/ui/Icon";

function channelsWord(count: number): string {
  if (count === 1) return "kanál";
  if (count >= 2 && count <= 4) return "kanály";
  return "kanálů";
}

/**
 * Plain download links: the browser saves the file itself, so no client
 * JavaScript is needed. `query` mirrors the page search, which keeps the file
 * limited to the channels currently listed.
 */
export function ExportChannelsLinks({ query, count }: { query: string; count: number }) {
  const trimmed = query.trim();
  const suffix = trimmed ? `&q=${encodeURIComponent(trimmed)}` : "";
  const hint = `Stáhnout ${count} ${channelsWord(count)} jako CSV`;

  return (
    <>
      <a
        className="btn"
        href={`/api/export/channels?format=csv${suffix}`}
        download
        title={hint}
        aria-label={hint}
      >
        <Icon name="download" size={16} /> Export CSV
      </a>
      <a
        className="btn btn-ghost"
        href={`/api/export/channels?format=json${suffix}`}
        download
        title={`Stáhnout ${count} ${channelsWord(count)} jako JSON`}
        aria-label={`Stáhnout ${count} ${channelsWord(count)} jako JSON`}
      >
        JSON
      </a>
    </>
  );
}
