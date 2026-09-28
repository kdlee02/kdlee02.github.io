import { getPermalink, getBlogPermalink, getAsset } from './utils/permalinks';

export const GITHUB_URL = 'https://github.com/kdlee02';
export const LINKEDIN_URL = 'https://www.linkedin.com/in/kdlee02'; // TODO: replace with your profile URL

export const headerData = {
  links: [
    { text: 'Home', href: getPermalink('/') },
    { text: 'Projects', href: getPermalink('/projects') },
    { text: 'Engineering', href: getBlogPermalink() },
    { text: 'About', href: getPermalink('/about') },
  ],
  actions: [{ text: 'GitHub', href: GITHUB_URL, target: '_blank' }],
};

export const footerData = {
  links: [
    {
      title: 'Site',
      links: [
        { text: 'Projects', href: getPermalink('/projects') },
        { text: 'Engineering', href: getBlogPermalink() },
        { text: 'About', href: getPermalink('/about') },
      ],
    },
    {
      title: 'Topics',
      links: [
        { text: 'RAG', href: getPermalink('rag', 'category') },
        { text: 'AI Agents', href: getPermalink('ai-agents', 'category') },
        { text: 'MCP', href: getPermalink('mcp', 'category') },
        { text: 'AI Evaluation', href: getPermalink('ai-evaluation', 'category') },
        { text: 'AI Product Engineering', href: getPermalink('ai-product-engineering', 'category') },
      ],
    },
  ],
  secondaryLinks: [],
  socialLinks: [
    { ariaLabel: 'RSS', icon: 'tabler:rss', href: getAsset('/rss.xml') },
    { ariaLabel: 'GitHub', icon: 'tabler:brand-github', href: GITHUB_URL },
    { ariaLabel: 'LinkedIn', icon: 'tabler:brand-linkedin', href: LINKEDIN_URL },
  ],
  footNote: '',
};
