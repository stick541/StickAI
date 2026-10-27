/** Brand + search-engine details in one place. */
export const BRAND = "StickAI";
export const COMPANY = "Stick";
export const TAGLINE = "Made by Stick";
export const DESCRIPTION = "Made by Stick. StickAI is an AI assistant for chat, images and your everyday tools.";

/** Public web address, no trailing slash. Set VITE_SITE_URL before building (see .env.example). */
export const SITE_URL = ((import.meta.env["VITE_SITE_URL"] as string | undefined) ?? "").replace(/\/$/, "");
export const abs = (path: string) => `${SITE_URL}${path}`;

const VERIFY = import.meta.env["VITE_GOOGLE_SITE_VERIFICATION"] as string | undefined;

/** What Google reads to show "StickAI" with "Made by Stick". */
export function structuredData() {
  const company = { "@type": "Organization", "@id": `${SITE_URL}/#company`, name: COMPANY, ...(SITE_URL && { url: `${SITE_URL}/` }), logo: abs("/stick-logo.png") };
  return {
    "@context": "https://schema.org",
    "@graph": [
      company,
      { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: BRAND, alternateName: ["Stick AI", "Stickai"], ...(SITE_URL && { url: `${SITE_URL}/` }), description: DESCRIPTION, publisher: { "@id": `${SITE_URL}/#company` } },
      { "@type": "WebApplication", name: BRAND, applicationCategory: "UtilitiesApplication", operatingSystem: "Any", description: DESCRIPTION, ...(SITE_URL && { url: `${SITE_URL}/` }), image: abs("/og-image.png"), creator: { "@id": `${SITE_URL}/#company` }, publisher: { "@id": `${SITE_URL}/#company` } },
    ],
  };
}

export function seo() {
  return {
    meta: [
      { title: BRAND },
      { name: "description", content: DESCRIPTION },
      { name: "application-name", content: BRAND },
      { name: "author", content: COMPANY },
      { property: "og:site_name", content: BRAND },
      { property: "og:title", content: `${BRAND} — ${TAGLINE}` },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:image", content: abs("/og-image.png") },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      ...(SITE_URL ? [{ property: "og:url", content: `${SITE_URL}/` }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: `${BRAND} — ${TAGLINE}` },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: abs("/og-image.png") },
      ...(VERIFY ? [{ name: "google-site-verification", content: VERIFY }] : []),
    ],
    links: [...(SITE_URL ? [{ rel: "canonical", href: `${SITE_URL}/` }] : [])],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(structuredData()) }],
  };
}
