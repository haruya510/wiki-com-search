import React, { FormEvent, useState } from "react";

export type CompanyField = {
  label: string;
  value: string;
  source: "Wikipedia" | "Wikidata" | "";
  href?: string;
};

export type CompanyEntity = {
  title: string;
  wikiUrl: string;
  qid?: string;
  fields: CompanyField[];
};

export type SearchResult = {
  title: string;
  description?: string;
  pageUrl: string;
};

const WIKI = "https://ja.wikipedia.org/w/api.php";
const WD = "https://www.wikidata.org/w/api.php";
const enc = encodeURIComponent;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`リクエストに失敗しました (HTTP ${response.status})`);
  return response.json() as Promise<T>;
}

export async function searchCompanies(query: string): Promise<SearchResult[]> {
  const q = query.normalize("NFKC").trim();
  if (!q) return [];
  const url = `${WIKI}?action=query&list=search&srsearch=${enc(q)}&srnamespace=0&srlimit=8&srprop=snippet&format=json&origin=*`;
  const data = await getJson<any>(url);
  return (data.query?.search ?? []).map((item: any) => ({
    title: item.title,
    description: String(item.snippet ?? "").replace(/<[^>]*>/g, ""),
    pageUrl: `https://ja.wikipedia.org/wiki/${enc(String(item.title).replace(/ /g, "_"))}`
  }));
}

export async function getCompany(title: string): Promise<CompanyEntity> {
  const pageUrl = `${WIKI}?action=query&titles=${enc(title)}&redirects=1&prop=revisions|pageprops&rvprop=content|timestamp&rvslots=main&ppprop=wikibase_item&format=json&formatversion=2&origin=*`;
  const pageData = await getJson<any>(pageUrl);
  const page = pageData.query?.pages?.[0];
  if (!page || page.missing) throw new Error("Wikipediaページが見つかりませんでした。");
  const wikitext = page.revisions?.[0]?.slots?.main?.content ?? "";
  const qid = page.pageprops?.wikibase_item as string | undefined;
  const infobox = parseInfobox(wikitext);
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const raw = infobox[key];
      if (raw) {
        const cleaned = cleanWikiText(raw);
        if (cleaned) return cleaned;
      }
    }
    return "";
  };

  let wd: any = {};
  if (qid) {
    try {
      const wdData = await getJson<any>(`${WD}?action=wbgetentities&ids=${enc(qid)}&props=claims&format=json&origin=*`);
      const claims = wdData.entities?.[qid]?.claims ?? {};
      const value = (property: string) => claims[property]?.find((x: any) => x.rank === "preferred") ?? claims[property]?.[0];
      const date = value("P571")?.mainsnak?.datavalue?.value;
      const website = value("P856")?.mainsnak?.datavalue?.value;
      const employees = value("P1128")?.mainsnak?.datavalue?.value?.amount;
      const street = value("P6375")?.mainsnak?.datavalue?.value?.text;
      wd = {
        founded: date?.time ? date.time.match(/^[+-](\d{4})-(\d{2})-(\d{2})/)?.slice(1).join("-") : "",
        website: typeof website === "string" ? safeUrl(website) : "",
        employees: employees ? `${Number(employees).toLocaleString("ja-JP")}人` : "",
        address: street ?? ""
      };
    } catch {
      // Wikipedia data remains usable when Wikidata is unavailable.
    }
  }

  const websiteFromWiki = safeUrl((get("ウェブサイト", "公式サイト", "URL", "url", "HP").match(/https?:\/\/[^\s|}\]]+/) ?? [])[0] ?? "");
  const values: Array<[string, string, string, string?]> = [
    ["設立年月日", get("設立", "設立日", "創業") || wd.founded, get("設立", "設立日", "創業") ? "Wikipedia" : wd.founded ? "Wikidata" : ""],
    ["本社所在地住所", get("本社所在地") || wd.address, get("本社所在地") ? "Wikipedia" : wd.address ? "Wikidata" : ""],
    ["資本金", get("資本金"), get("資本金") ? "Wikipedia" : ""],
    ["代表者", get("代表者"), get("代表者") ? "Wikipedia" : ""],
    ["従業員数", get("従業員数") || wd.employees, get("従業員数") ? "Wikipedia" : wd.employees ? "Wikidata" : ""],
    ["売上高", get("売上高"), get("売上高") ? "Wikipedia" : ""],
    ["証券コード", get("証券コード"), get("証券コード") ? "Wikipedia" : ""],
    ["事業内容", get("事業内容"), get("事業内容") ? "Wikipedia" : ""],
    ["企業HP", wd.website || websiteFromWiki || "", wd.website ? "Wikidata" : websiteFromWiki ? "Wikipedia" : "", wd.website || websiteFromWiki || undefined]
  ];
  return {
    title: page.title,
    wikiUrl: `https://ja.wikipedia.org/wiki/${enc(String(page.title).replace(/ /g, "_"))}`,
    qid,
    fields: values.map(([label, value, source, href]) => ({ label, value, source: source as CompanyField["source"], href }))
  };
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function cleanWikiText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref\b[^>]*\/>/gi, "")
    .replace(/<ref\b[\s\S]*?<\/ref>/gi, "")
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/'{2,}/g, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .trim();
}

function parseInfobox(wikitext: string): Record<string, string> {
  const match = /\{\{\s*基礎情報/.exec(wikitext);
  if (!match) return {};
  let depth = 0;
  let end = -1;
  for (let i = match.index; i < wikitext.length - 1; i++) {
    if (wikitext.startsWith("{{", i)) { depth++; i++; }
    else if (wikitext.startsWith("}}", i)) {
      depth--; i++;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) return {};
  const body = wikitext.slice(match.index + 2, end - 2);
  const parts: string[] = [];
  let current = "", nestedTemplates = 0, nestedLinks = 0;
  for (let i = 0; i < body.length; i++) {
    const pair = body.slice(i, i + 2);
    if (pair === "{{") { nestedTemplates++; current += pair; i++; continue; }
    if (pair === "}}") { nestedTemplates--; current += pair; i++; continue; }
    if (pair === "[[") { nestedLinks++; current += pair; i++; continue; }
    if (pair === "]]") { nestedLinks--; current += pair; i++; continue; }
    if (body[i] === "|" && nestedTemplates <= 0 && nestedLinks <= 0) {
      parts.push(current); current = ""; continue;
    }
    current += body[i];
  }
  parts.push(current);
  const result: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key && !(key in result)) result[key] = part.slice(eq + 1).trim();
  }
  return result;
}

export type WikiComSearchProps = {
  title?: string;
  placeholder?: string;
  className?: string;
  onResult?: (entity: CompanyEntity) => void;
};

export function WikiComSearch({
  title = "企業情報検索",
  placeholder = "企業名を入力（例: 任天堂、トヨタ自動車）",
  className = "",
  onResult
}: WikiComSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [entity, setEntity] = useState<CompanyEntity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true); setError(""); setEntity(null);
    try {
      const found = await searchCompanies(query);
      setResults(found);
      if (!found.length) setError("候補が見つかりませんでした。別の表記でお試しください。");
      else {
        const first = await getCompany(found[0].title);
        setEntity(first);
        onResult?.(first);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "検索に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function choose(title: string) {
    setBusy(true); setError("");
    try {
      const result = await getCompany(title);
      setEntity(result); onResult?.(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "情報を取得できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return <section className={`wcs ${className}`}>
    <h2 className="wcs-title">{title}</h2>
    <form className="wcs-search" onSubmit={submit}>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} aria-label="企業名" />
      <button type="submit" disabled={busy || !query.trim()}>{busy ? "検索中…" : "検索"}</button>
    </form>
    {error && <p className="wcs-error" role="alert">{error}</p>}
    {results.length > 0 && <div className="wcs-candidates">
      <h3>候補ページ</h3>
      {results.map(result => <button key={result.title} type="button" onClick={() => choose(result.title)} className="wcs-candidate">
        <span><strong>{result.title}</strong>{result.description && <small>{result.description}</small>}</span>
        <span aria-hidden="true">↗</span>
      </button>)}
    </div>}
    {entity && <article className="wcs-result">
      <header><h3>{entity.title}</h3><a href={entity.wikiUrl} target="_blank" rel="noreferrer">Wikipedia ↗</a></header>
      <dl>{entity.fields.map(field => <div className="wcs-field" key={field.label}>
        <dt>{field.label}</dt><dd>{field.value ? (field.href ? <a href={field.href} target="_blank" rel="noreferrer">{field.value}</a> : field.value) : "—"}
          {field.source && <small>{field.source}</small>}</dd>
      </div>)}</dl>
      <button type="button" className="wcs-copy" onClick={() => navigator.clipboard?.writeText([entity.title, ...entity.fields.map(f => `${f.label}: ${f.value || "—"}`), entity.wikiUrl].join("\n"))}>結果をコピー</button>
    </article>}
    <p className="wcs-attribution">データ: Wikipedia / Wikidata</p>
  </section>;
}

export default WikiComSearch;
