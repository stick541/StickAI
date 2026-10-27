/**
 * Plugin registry for StickAI.
 *
 * Each plugin has a logo (served from /public/plugins), a short description and a
 * list of `tools` the model may call once the plugin is connected. The tool shape
 * follows the common JSON-schema function-calling format, so when you wire up a real
 * model in `ai.ts` you can pass `toolsFor(connectedIds)` straight to your API.
 */
export type PluginCategory = "Productivity" | "Communication" | "Developer" | "Travel" | "Music & events" | "Business" | "Design";

export interface PluginTool {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, { type: string; description: string }>; required?: string[] };
}

export interface Plugin {
  id: string;
  name: string;
  category: PluginCategory;
  logo: string;
  tagline: string;
  description: string;
  /** Words in a user message that suggest this plugin is relevant (used by the preview reply). */
  keywords: RegExp;
  /** Set when the server can really connect this plugin (OAuth). Others run in preview. */
  oauth?: "google" | "slack";
  examples: string[];
  tools: PluginTool[];
}

const q = (description: string) => ({ type: "string", description });

export const PLUGINS: Plugin[] = [
  {
    id: "outlook", name: "Outlook", category: "Productivity", logo: "/plugins/outlook.svg",
    tagline: "Email and calendar",
    description: "Read, search and draft email, and check or create calendar events.",
    keywords: /\b(email|inbox|outlook|calendar|meeting|schedule)\b/i,
    examples: ["Summarize my unread emails", "Draft a reply to my last email", "What's on my calendar tomorrow?"],
    tools: [
      { name: "outlook_search_mail", description: "Search the user's mailbox.", parameters: { type: "object", properties: { query: q("Search text"), limit: { type: "number", description: "Max results" } }, required: ["query"] } },
      { name: "outlook_draft_email", description: "Create an email draft.", parameters: { type: "object", properties: { to: q("Recipient email"), subject: q("Subject"), body: q("Body text") }, required: ["to", "subject", "body"] } },
      { name: "outlook_list_events", description: "List calendar events in a date range.", parameters: { type: "object", properties: { from: q("ISO start date"), to: q("ISO end date") }, required: ["from", "to"] } },
    ],
  },
  {
    id: "granola", name: "Granola", category: "Productivity", logo: "/plugins/granola.svg",
    tagline: "Meeting notes",
    description: "Find and summarize your meeting notes and pull out action items.",
    keywords: /\b(notes?|meeting|action items?|granola|transcript)\b/i,
    examples: ["Summarize my last meeting", "List action items from this week's calls"],
    tools: [
      { name: "granola_search_notes", description: "Search meeting notes.", parameters: { type: "object", properties: { query: q("Search text") }, required: ["query"] } },
      { name: "granola_get_note", description: "Get one meeting note by id.", parameters: { type: "object", properties: { id: q("Note id") }, required: ["id"] } },
    ],
  },
  {
    id: "canva", name: "Canva", category: "Design", logo: "/plugins/canva.svg",
    tagline: "Design and presentations",
    description: "Create designs, social posts and slide decks, and edit existing ones.",
    keywords: /\b(design|poster|logo|canva|presentation|slides?|flyer|instagram post)\b/i,
    examples: ["Make an Instagram post for my bakery", "Create a 5-slide pitch deck"],
    tools: [
      { name: "canva_create_design", description: "Create a new design from a prompt.", parameters: { type: "object", properties: { type: q("poster | presentation | social_post | logo"), prompt: q("What the design should show") }, required: ["type", "prompt"] } },
      { name: "canva_list_designs", description: "List the user's recent designs.", parameters: { type: "object", properties: { query: q("Optional search text") } } },
    ],
  },
  {
    id: "hubspot", name: "HubSpot", category: "Business", logo: "/plugins/hubspot.svg",
    tagline: "CRM",
    description: "Look up contacts, companies and deals, and log notes or follow-ups.",
    keywords: /\b(crm|hubspot|contact|lead|deal|pipeline|customer)\b/i,
    examples: ["Show my open deals", "Find the contact for Acme Corp"],
    tools: [
      { name: "hubspot_search_contacts", description: "Search CRM contacts.", parameters: { type: "object", properties: { query: q("Name, email or company") }, required: ["query"] } },
      { name: "hubspot_list_deals", description: "List deals, optionally by stage.", parameters: { type: "object", properties: { stage: q("Deal stage") } } },
      { name: "hubspot_add_note", description: "Add a note to a contact.", parameters: { type: "object", properties: { contact_id: q("Contact id"), note: q("Note text") }, required: ["contact_id", "note"] } },
    ],
  },
  {
    id: "gusto", name: "Gusto", category: "Business", logo: "/plugins/gusto.svg",
    tagline: "Payroll and HR",
    description: "Check payroll runs, time off and team details.",
    keywords: /\b(payroll|gusto|paycheck|time off|pto|employees?|hr)\b/i,
    examples: ["When is the next payroll run?", "Who is out this week?"],
    tools: [
      { name: "gusto_next_payroll", description: "Get the next payroll run.", parameters: { type: "object", properties: {} } },
      { name: "gusto_time_off", description: "List approved time off in a date range.", parameters: { type: "object", properties: { from: q("ISO start date"), to: q("ISO end date") }, required: ["from", "to"] } },
    ],
  },
  {
    id: "expedia", name: "Expedia", category: "Travel", logo: "/plugins/expedia.svg",
    tagline: "Flights, hotels, cars",
    description: "Search flights, hotels and rental cars and compare options.",
    keywords: /\b(flight|hotel|rental car|expedia|vacation|trip|book)\b/i,
    examples: ["Find flights to Denver next Friday", "Hotels in Orlando under $150"],
    tools: [
      { name: "expedia_search_flights", description: "Search flights.", parameters: { type: "object", properties: { from: q("Origin airport or city"), to: q("Destination"), date: q("Departure date (ISO)") }, required: ["from", "to", "date"] } },
      { name: "expedia_search_hotels", description: "Search hotels.", parameters: { type: "object", properties: { city: q("City"), checkin: q("Check-in (ISO)"), checkout: q("Check-out (ISO)") }, required: ["city", "checkin", "checkout"] } },
    ],
  },
  {
    id: "trip-com", name: "Trip.com", category: "Travel", logo: "/plugins/trip-com.svg",
    tagline: "Trains, flights, stays",
    description: "Compare flights, trains and hotels, especially for international trips.",
    keywords: /\b(train|flight|hotel|trip\.?com|itinerary|abroad|international)\b/i,
    examples: ["Train options from Paris to Amsterdam", "Cheap hotels in Tokyo"],
    tools: [
      { name: "tripcom_search_transport", description: "Search flights or trains.", parameters: { type: "object", properties: { mode: q("flight | train"), from: q("Origin"), to: q("Destination"), date: q("Date (ISO)") }, required: ["mode", "from", "to", "date"] } },
      { name: "tripcom_search_hotels", description: "Search hotels.", parameters: { type: "object", properties: { city: q("City"), checkin: q("Check-in (ISO)"), checkout: q("Check-out (ISO)") }, required: ["city", "checkin", "checkout"] } },
    ],
  },
  {
    id: "wikiloc", name: "Wikiloc", category: "Travel", logo: "/plugins/wikiloc.svg",
    tagline: "Hiking and outdoor trails",
    description: "Discover hiking, cycling and running routes with distance and elevation.",
    keywords: /\b(hike|hiking|trail|route|cycling|trek|wikiloc|run)\b/i,
    examples: ["Easy hikes near me", "Best 20 km cycling routes nearby"],
    tools: [
      { name: "wikiloc_search_trails", description: "Search trails by place and activity.", parameters: { type: "object", properties: { location: q("Place name"), activity: q("hiking | cycling | running"), max_km: { type: "number", description: "Max distance in km" } }, required: ["location"] } },
    ],
  },
  {
    id: "ticketmaster", name: "Ticketmaster", category: "Music & events", logo: "/plugins/ticketmaster.svg",
    tagline: "Live events",
    description: "Find concerts, sports and shows and check dates and venues.",
    keywords: /\b(concert|tickets?|show|event|game|ticketmaster|tour)\b/i,
    examples: ["Concerts this month near me", "When does the tour hit Miami?"],
    tools: [
      { name: "ticketmaster_search_events", description: "Search upcoming events.", parameters: { type: "object", properties: { keyword: q("Artist, team or event"), city: q("City"), from: q("ISO start date") }, required: ["keyword"] } },
    ],
  },
  {
    id: "apple-music", name: "Apple Music", category: "Music & events", logo: "/plugins/apple-music.svg",
    tagline: "Music and playlists",
    description: "Search songs and albums and build playlists.",
    keywords: /\b(song|album|playlist|music|artist|apple music)\b/i,
    examples: ["Make a chill study playlist", "Songs like this artist"],
    tools: [
      { name: "applemusic_search", description: "Search the catalog.", parameters: { type: "object", properties: { query: q("Song, album or artist"), type: q("songs | albums | artists") }, required: ["query"] } },
      { name: "applemusic_create_playlist", description: "Create a playlist.", parameters: { type: "object", properties: { name: q("Playlist name"), track_ids: q("Comma-separated track ids") }, required: ["name"] } },
    ],
  },
  {
    id: "shazam", name: "Shazam", category: "Music & events", logo: "/plugins/shazam.svg",
    tagline: "Name that song",
    description: "Identify a song from a short audio clip or a few lyrics you remember.",
    keywords: /\b(shazam|what song|identify (this )?song|name that song)\b/i,
    examples: ["What song has the lyric about a midnight train?", "Identify this clip"],
    tools: [
      { name: "shazam_identify", description: "Identify a song from audio (base64) or remembered lyrics.", parameters: { type: "object", properties: { audio_base64: q("Short audio clip, base64"), lyrics: q("Remembered lyrics") } } },
    ],
  },
  {
    oauth: "google",
    id: "gmail", name: "Gmail", category: "Communication", logo: "/plugins/gmail.svg",
    tagline: "Email",
    description: "Read, search and draft Gmail messages.",
    keywords: /\b(gmail|email|inbox|mail)\b/i,
    examples: ["Summarize my unread Gmail", "Draft a reply to my last email"],
    tools: [
      { name: "gmail_search", description: "Search the user's Gmail.", parameters: { type: "object", properties: { query: q("Search text") }, required: ["query"] } },
      { name: "gmail_draft", description: "Create an email draft.", parameters: { type: "object", properties: { to: q("Recipient"), subject: q("Subject"), body: q("Body") }, required: ["to", "subject", "body"] } },
    ],
  },
  {
    oauth: "google",
    id: "google-calendar", name: "Google Calendar", category: "Productivity", logo: "/plugins/google-calendar.svg",
    tagline: "Events and scheduling",
    description: "View and create calendar events and find free time.",
    keywords: /\b(calendar|schedule|meeting|event|free time|appointment)\b/i,
    examples: ["What's on my calendar tomorrow?", "Find a free hour this week"],
    tools: [
      { name: "gcal_list_events", description: "List events in a date range.", parameters: { type: "object", properties: { from: q("ISO start"), to: q("ISO end") }, required: ["from", "to"] } },
      { name: "gcal_create_event", description: "Create a calendar event.", parameters: { type: "object", properties: { title: q("Title"), start: q("ISO start"), end: q("ISO end") }, required: ["title", "start", "end"] } },
    ],
  },
  {
    oauth: "google",
    id: "google-drive", name: "Google Drive", category: "Productivity", logo: "/plugins/google-drive.svg",
    tagline: "Files and docs",
    description: "Find and read files in your Drive.",
    keywords: /\b(drive|google doc|spreadsheet|my files?|document)\b/i,
    examples: ["Find my budget spreadsheet", "Summarize the doc I edited yesterday"],
    tools: [
      { name: "gdrive_search", description: "Search Drive files.", parameters: { type: "object", properties: { query: q("Search text") }, required: ["query"] } },
      { name: "gdrive_read", description: "Read a file's contents.", parameters: { type: "object", properties: { file_id: q("File id") }, required: ["file_id"] } },
    ],
  },
  {
    oauth: "slack",
    id: "slack", name: "Slack", category: "Communication", logo: "/plugins/slack.svg",
    tagline: "Team chat",
    description: "Search channels and messages and post updates.",
    keywords: /\b(slack|channel|dm|team chat|standup)\b/i,
    examples: ["What did I miss in #general?", "Post my standup update"],
    tools: [
      { name: "slack_search", description: "Search messages.", parameters: { type: "object", properties: { query: q("Search text") }, required: ["query"] } },
      { name: "slack_post", description: "Post a message to a channel.", parameters: { type: "object", properties: { channel: q("Channel name"), text: q("Message") }, required: ["channel", "text"] } },
    ],
  },
  {
    id: "zoom", name: "Zoom", category: "Communication", logo: "/plugins/zoom.svg",
    tagline: "Video meetings",
    description: "Schedule meetings and get recordings and summaries.",
    keywords: /\b(zoom|video call|recording|webinar)\b/i,
    examples: ["Schedule a Zoom for Friday 2pm", "Summarize my last Zoom"],
    tools: [
      { name: "zoom_create_meeting", description: "Create a meeting.", parameters: { type: "object", properties: { topic: q("Topic"), start: q("ISO start") }, required: ["topic", "start"] } },
      { name: "zoom_list_recordings", description: "List recent recordings.", parameters: { type: "object", properties: {  } } },
    ],
  },
  {
    id: "notion", name: "Notion", category: "Productivity", logo: "/plugins/notion.svg",
    tagline: "Notes and wikis",
    description: "Search pages and databases and add notes.",
    keywords: /\b(notion|wiki|page|database|knowledge base)\b/i,
    examples: ["Find my project plan in Notion", "Add a to-do to my tasks page"],
    tools: [
      { name: "notion_search", description: "Search pages.", parameters: { type: "object", properties: { query: q("Search text") }, required: ["query"] } },
      { name: "notion_create_page", description: "Create a page.", parameters: { type: "object", properties: { title: q("Title"), content: q("Markdown content") }, required: ["title"] } },
    ],
  },
  {
    id: "github", name: "GitHub", category: "Developer", logo: "/plugins/github.svg",
    tagline: "Code and issues",
    description: "Browse repos, issues and pull requests.",
    keywords: /\b(github|repo|pull request|pr|issue|commit|branch)\b/i,
    examples: ["List my open pull requests", "Create an issue for this bug"],
    tools: [
      { name: "github_search_issues", description: "Search issues and PRs.", parameters: { type: "object", properties: { repo: q("owner/name"), query: q("Search text") }, required: ["repo", "query"] } },
      { name: "github_create_issue", description: "Create an issue.", parameters: { type: "object", properties: { repo: q("owner/name"), title: q("Title"), body: q("Body") }, required: ["repo", "title"] } },
    ],
  },
  {
    id: "figma", name: "Figma", category: "Design", logo: "/plugins/figma.svg",
    tagline: "Design files",
    description: "Look up Figma files and frames and read design details.",
    keywords: /\b(figma|wireframe|mockup|prototype|ui design)\b/i,
    examples: ["Show my latest Figma files", "Describe the homepage frame"],
    tools: [
      { name: "figma_list_files", description: "List recent files.", parameters: { type: "object", properties: {  } } },
      { name: "figma_get_frame", description: "Get a frame's details.", parameters: { type: "object", properties: { file_id: q("File id"), frame: q("Frame name") }, required: ["file_id"] } },
    ],
  },
  {
    id: "spotify", name: "Spotify", category: "Music & events", logo: "/plugins/spotify.svg",
    tagline: "Music and podcasts",
    description: "Search music, build playlists and see what you've been playing.",
    keywords: /\b(spotify|playlist|podcast|song|album)\b/i,
    examples: ["Make a workout playlist", "What have I been listening to?"],
    tools: [
      { name: "spotify_search", description: "Search tracks, albums or artists.", parameters: { type: "object", properties: { query: q("Search text") }, required: ["query"] } },
      { name: "spotify_create_playlist", description: "Create a playlist.", parameters: { type: "object", properties: { name: q("Playlist name"), track_ids: q("Comma-separated track ids") }, required: ["name"] } },
    ],
  },
  {
    id: "stripe", name: "Stripe", category: "Business", logo: "/plugins/stripe.svg",
    tagline: "Payments",
    description: "Check payments, customers and payouts.",
    keywords: /\b(stripe|payment|payout|invoice|refund|revenue)\b/i,
    examples: ["How much revenue came in this week?", "Find the last payment from Sam"],
    tools: [
      { name: "stripe_list_payments", description: "List recent payments.", parameters: { type: "object", properties: { limit: q("Max results") } } },
      { name: "stripe_find_customer", description: "Find a customer.", parameters: { type: "object", properties: { query: q("Name or email") }, required: ["query"] } },
    ],
  },
  {
    id: "shopify", name: "Shopify", category: "Business", logo: "/plugins/shopify.svg",
    tagline: "Online store",
    description: "Check orders, products and inventory.",
    keywords: /\b(shopify|store|orders?|inventory|product listing)\b/i,
    examples: ["How many orders today?", "Which products are low on stock?"],
    tools: [
      { name: "shopify_list_orders", description: "List recent orders.", parameters: { type: "object", properties: { status: q("open | closed") } } },
      { name: "shopify_low_stock", description: "List products low on stock.", parameters: { type: "object", properties: { threshold: q("Stock level") } } },
    ],
  },
];

export const PLUGIN_CATEGORIES = ["All", ...Array.from(new Set(PLUGINS.map((p) => p.category)))] as const;

export const getPlugin = (id: string) => PLUGINS.find((p) => p.id === id);

/** Tool definitions for the connected plugins — hand these to your model API. */
export function toolsFor(ids: string[]): PluginTool[] {
  return PLUGINS.filter((p) => ids.includes(p.id)).flatMap((p) => p.tools);
}

/** Which plugin owns a tool name (used to label tool use in chat). */
export const pluginForTool = (tool: string) => PLUGINS.find((p) => p.tools.some((t) => t.name === tool));
