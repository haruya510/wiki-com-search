# wiki-com-search

React component to search Japanese Wikipedia and display company facts, using Wikidata as a fallback source.

## Install in another React site

Once published to npm:

```bash
npm install wiki-com-search
```

Import the component and its CSS:

```tsx
import { WikiComSearch } from "wiki-com-search";
import "wiki-com-search/style.css";

export default function App() {
  return <WikiComSearch title="企業検索" onResult={(company) => console.log(company)} />;
}
```

You can also use the data functions without the UI:

```ts
import { searchCompanies, getCompany } from "wiki-com-search";

const candidates = await searchCompanies("任天堂");
const company = await getCompany(candidates[0].title);
console.log(company.fields);
```

## Included features

- Japanese Wikipedia full-text search and candidate selection
- Basic company infobox parsing
- Wikidata fallback for founding date, headquarters address, employee count and official website
- Result copy and source labels
- Customizable heading, placeholder, class name, and `onResult` callback
- Responsive styling; no UI framework dependency

## Development

```bash
npm install
npm run typecheck
npm run build
```

## Data and limitations

This package queries Wikipedia and Wikidata directly from the browser using their public APIs. Internet access is required, and a host site’s Content Security Policy must allow requests to `ja.wikipedia.org` and `www.wikidata.org`. Data may be missing or stale, and Wikipedia infobox markup varies by article. Verify important business facts against primary sources.

Wikipedia text is available under CC BY-SA; Wikidata structured data is generally CC0. Follow the attribution and reuse terms applicable to each source and to any media assets.

## Publishing

Before publishing, ensure the npm package name is available, run the typecheck/build, and review the license and package metadata. Publishing to npm and creating a GitHub repository are separate steps.