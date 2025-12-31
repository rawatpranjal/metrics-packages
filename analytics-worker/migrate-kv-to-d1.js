/**
 * Migration script: KV -> D1
 * Run with: npx wrangler dev --local then visit /migrate
 * Or deploy and visit: https://tech-econ-analytics.rawat-pranjal010.workers.dev/migrate?key=YOUR_SECRET
 */

// Add this route to index.js temporarily, or run standalone

export async function migrateKVtoD1(env) {
  if (!env.ANALYTICS_EVENTS || !env.DB) {
    return { error: 'Both KV and D1 must be configured' };
  }

  const stats = {
    keysProcessed: 0,
    eventsInserted: 0,
    clicksUpserted: 0,
    searchesUpserted: 0,
    pagesUpserted: 0,
    dailyUpserted: 0,
    errors: []
  };

  try {
    // Fetch all event keys from KV
    let cursor = null;
    const allEvents = [];

    do {
      const list = await env.ANALYTICS_EVENTS.list({ prefix: 'events:', cursor, limit: 100 });

      for (const key of list.keys) {
        try {
          const data = await env.ANALYTICS_EVENTS.get(key.name);
          if (data) {
            const events = JSON.parse(data);
            allEvents.push(...events);
            stats.keysProcessed++;
          }
        } catch (e) {
          stats.errors.push(`Key ${key.name}: ${e.message}`);
        }
      }

      cursor = list.list_complete ? null : list.cursor;
    } while (cursor);

    console.log(`Fetched ${allEvents.length} events from ${stats.keysProcessed} keys`);

    // Aggregation maps
    const clicks = {};      // name:section -> {name, section, category, count}
    const searches = {};    // query -> count
    const pages = {};       // path -> count
    const daily = {};       // date -> {pageviews, sessions, clicks, searches}
    const hourly = {};      // bucket -> {pageviews, clicks}
    const countries = {};   // country -> count
    const sessions = new Set();

    // Process events
    for (const event of allEvents) {
      const timestamp = event.ts || event._received || Date.now();
      const date = new Date(timestamp).toISOString().split('T')[0];
      const hourBucket = new Date(timestamp).toISOString().slice(0, 13).replace('T', '-');
      const country = event._country || 'unknown';

      // Track sessions
      if (event.sid) {
        sessions.add(event.sid);
      }

      // Initialize daily
      if (!daily[date]) {
        daily[date] = { pageviews: 0, sessions: new Set(), clicks: 0, searches: 0 };
      }
      if (event.sid) {
        daily[date].sessions.add(event.sid);
      }

      // Initialize hourly
      if (!hourly[hourBucket]) {
        hourly[hourBucket] = { pageviews: 0, clicks: 0 };
      }

      // Country tracking
      if (country !== 'unknown' && event.sid) {
        countries[country] = countries[country] || new Set();
        countries[country].add(event.sid);
      }

      switch (event.t) {
        case 'pageview':
          daily[date].pageviews++;
          hourly[hourBucket].pageviews++;
          if (event.d?.path || event.p) {
            const path = event.d?.path || event.p;
            pages[path] = (pages[path] || 0) + 1;
          }
          break;

        case 'click':
          daily[date].clicks++;
          hourly[hourBucket].clicks++;
          if (event.d?.type === 'card' && event.d?.name) {
            const key = `${event.d.name}|||${event.d.section || 'other'}`;
            if (!clicks[key]) {
              clicks[key] = {
                name: event.d.name,
                section: event.d.section || 'other',
                category: event.d.category || null,
                count: 0
              };
            }
            clicks[key].count++;
          }
          break;

        case 'search':
          daily[date].searches++;
          if (event.d?.q) {
            const query = event.d.q.toLowerCase().trim();
            searches[query] = (searches[query] || 0) + 1;
          }
          break;
      }
    }

    // Insert into D1
    const batch = [];

    // Insert daily stats
    for (const [date, data] of Object.entries(daily)) {
      batch.push(env.DB.prepare(`
        INSERT INTO daily_stats (date, pageviews, unique_sessions, clicks, searches, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(date) DO UPDATE SET
          pageviews = pageviews + excluded.pageviews,
          unique_sessions = excluded.unique_sessions,
          clicks = clicks + excluded.clicks,
          searches = searches + excluded.searches,
          updated_at = datetime('now')
      `).bind(date, data.pageviews, data.sessions.size, data.clicks, data.searches));
      stats.dailyUpserted++;
    }

    // Insert clicks
    for (const click of Object.values(clicks)) {
      batch.push(env.DB.prepare(`
        INSERT INTO content_clicks (name, section, category, click_count, last_clicked)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(name, section) DO UPDATE SET
          click_count = click_count + excluded.click_count,
          last_clicked = datetime('now')
      `).bind(click.name, click.section, click.category, click.count));
      stats.clicksUpserted++;
    }

    // Insert searches
    for (const [query, count] of Object.entries(searches)) {
      batch.push(env.DB.prepare(`
        INSERT INTO search_queries (query, search_count, last_searched)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(query) DO UPDATE SET
          search_count = search_count + excluded.search_count,
          last_searched = datetime('now')
      `).bind(query, count));
      stats.searchesUpserted++;
    }

    // Insert pages
    for (const [path, count] of Object.entries(pages)) {
      batch.push(env.DB.prepare(`
        INSERT INTO page_views (path, view_count, last_viewed)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(path) DO UPDATE SET
          view_count = view_count + excluded.view_count,
          last_viewed = datetime('now')
      `).bind(path, count));
      stats.pagesUpserted++;
    }

    // Insert hourly
    for (const [bucket, data] of Object.entries(hourly)) {
      batch.push(env.DB.prepare(`
        INSERT INTO hourly_stats (hour_bucket, pageviews, clicks, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(hour_bucket) DO UPDATE SET
          pageviews = pageviews + excluded.pageviews,
          clicks = clicks + excluded.clicks,
          updated_at = datetime('now')
      `).bind(bucket, data.pageviews, data.clicks));
    }

    // Insert countries
    for (const [country, sessionSet] of Object.entries(countries)) {
      batch.push(env.DB.prepare(`
        INSERT INTO country_stats (country, session_count, last_seen)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(country) DO UPDATE SET
          session_count = session_count + excluded.session_count,
          last_seen = datetime('now')
      `).bind(country, sessionSet.size));
    }

    // Execute in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      const chunk = batch.slice(i, i + BATCH_SIZE);
      await env.DB.batch(chunk);
    }

    // Clear stats cache
    await env.DB.prepare("DELETE FROM cache_meta WHERE key = 'stats'").run();

    stats.totalEvents = allEvents.length;
    stats.totalSessions = sessions.size;
    stats.success = true;

    return stats;

  } catch (err) {
    stats.error = err.message;
    stats.success = false;
    return stats;
  }
}

// Export for testing
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/migrate') {
      console.log('Starting migration...');
      const result = await migrateKVtoD1(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Visit /migrate to run migration');
  }
};
