import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { AutoSubmitForm } from "@/components/ui/AutoSubmitForm";
import {
  DATE_OPTIONS,
  SORT_OPTIONS,
  VIDEO_STATUS_OPTIONS,
  type SortOption,
  type VideoStatusFilter,
} from "@/lib/queries/videos";

export type FilterBarProps = {
  action: string;
  channels: { channel_id: string; title: string; video_count: number }[];
  topics: { topic: string; count: number }[];
  categories: string[];
  values: {
    q: string;
    channel: string;
    topic: string;
    category: string;
    date: string;
    status: string;
    sort: string;
    minRelevance: string;
  };
};

export function FilterBar({ action, channels, topics, categories, values }: FilterBarProps) {
  return (
    <AutoSubmitForm action={action} className="filter-panel" ariaLabel="Filtry videí">
      <div className="filter-row filter-row-primary">
        <div className="filter-field">
          <div className="filter-input-wrap">
            <span className="filter-input-icon" aria-hidden="true">
              <Icon name="search" size={15} />
            </span>
            <input
              id="filter-q"
              name="q"
              className="input"
              type="search"
              aria-label="Hledat v názvech, popisech a shrnutích"
              defaultValue={values.q}
              placeholder="Hledat v názvech, popisech a shrnutích…"
            />
          </div>
        </div>

        <select
          id="filter-channel"
          name="channel"
          className="select"
          aria-label="Kanál"
          defaultValue={values.channel}
        >
          <option value="">Všechny kanály</option>
          {channels.map((channel) => (
            <option key={channel.channel_id} value={channel.channel_id}>
              {channel.title} ({channel.video_count})
            </option>
          ))}
        </select>

        <select
          id="filter-topic"
          name="topic"
          className="select"
          aria-label="Téma"
          defaultValue={values.topic}
        >
          <option value="">Všechna témata</option>
          {topics.map((topic) => (
            <option key={topic.topic} value={topic.topic}>
              {topic.topic} ({topic.count})
            </option>
          ))}
        </select>

        <select
          id="filter-category"
          name="category"
          className="select"
          aria-label="Kategorie"
          defaultValue={values.category}
        >
          <option value="">Všechny kategorie</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <button type="submit" className="btn btn-primary">
          <Icon name="filter" size={15} />
          Filtrovat
        </button>
      </div>

      <div className="filter-row filter-row-secondary">
        <select
          id="filter-status"
          name="status"
          className="select"
          aria-label="Stav zpracování"
          defaultValue={values.status}
        >
          {VIDEO_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select id="filter-date" name="date" className="select" aria-label="Datum" defaultValue={values.date}>
          {DATE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <input
          id="filter-relevance"
          name="minRelevance"
          className="input"
          type="number"
          min={0}
          max={100}
          step={5}
          aria-label="Minimální relevance"
          defaultValue={values.minRelevance}
          placeholder="Relevance ≥ 0"
        />

        <select id="filter-sort" name="sort" className="select" aria-label="Řazení" defaultValue={values.sort}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>


      </div>
    </AutoSubmitForm>
  );
}
export function Pagination({
  action,
  params,
  page,
  pages,
}: {
  action: string;
  params: Record<string, string>;
  page: number;
  pages: number;
}) {
  if (pages <= 1) return null;

  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    const qs = search.toString();
    return qs ? `${action}?${qs}` : action;
  };

  return (
    <nav className="pagination" aria-label="Stránkování">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn btn-sm">
          <Icon name="chevronLeft" size={15} /> Předchozí
        </Link>
      ) : (
        <span className="btn btn-sm" aria-disabled="true" style={{ opacity: 0.4 }}>
          <Icon name="chevronLeft" size={15} /> Předchozí
        </span>
      )}
      <span className="tiny muted">
        Strana {page} z {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="btn btn-sm">
          Další <Icon name="chevronRight" size={15} />
        </Link>
      ) : (
        <span className="btn btn-sm" aria-disabled="true" style={{ opacity: 0.4 }}>
          Další <Icon name="chevronRight" size={15} />
        </span>
      )}
    </nav>
  );
}

export function parseSort(value: string | undefined): SortOption {
  const found = SORT_OPTIONS.find((option) => option.value === value);
  return found ? found.value : "newest";
}

export function parseStatus(value: string | undefined): VideoStatusFilter {
  const found = VIDEO_STATUS_OPTIONS.find((option) => option.value === value);
  return found ? found.value : "ALL";
}
