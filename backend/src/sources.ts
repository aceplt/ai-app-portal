export type NewsSource = {
  id: string;
  label: string;
  // In a real implementation, store either an RSS URL or an API endpoint.
  rssUrl?: string;
  // Example: optional keyword filters
  keywords?: string[];
};

// "Top air sites" — replace these with the sources you want.
export const NEWS_SOURCES: NewsSource[] = [
  {
    id: 'techcrunch',
    label: 'TechCrunch',
    rssUrl: 'https://techcrunch.com/feed/'
  },
  {
    id: 'theverge',
    label: 'The Verge',
    rssUrl: 'https://www.theverge.com/rss/index.xml'
  },
  {
    id: 'arstechnica',
    label: 'Ars Technica',
    rssUrl: 'https://feeds.arstechnica.com/arstechnica/index'
  }
];
