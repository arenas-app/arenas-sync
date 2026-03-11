#!/usr/bin/env node
// ARENAS — Sync matches from API-Football to Supabase
// Runs automatically via GitHub Actions every 5 min (11h-00h30)

const API_KEY = process.env.API_SPORTS_KEY;
const API_BASE = 'https://v3.football.api-sports.io';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const LEAGUES = [
  { id: 61, name: 'Ligue 1', sport: 'football', emoji: '⚽' },
  { id: 62, name: 'Ligue 2', sport: 'football', emoji: '⚽' },
  { id: 63, name: 'National 1', sport: 'football', emoji: '⚽' },
  { id: 2, name: 'Champions League', sport: 'football', emoji: '⚽' },
  { id: 3, name: 'Europa League', sport: 'football', emoji: '⚽' },
  { id: 848, name: 'Conference League', sport: 'football', emoji: '⚽' },
];
const SEASON = 2025;

const delay = (ms) => new Promise(r => setTimeout(r, ms));

let requestCount = 0;

async function apiFootball(endpoint) {
  await delay(300);
  requestCount++;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'x-apisports-key': API_KEY }
  });
  const data = await res.json();
  const remaining = res.headers.get('x-ratelimit-requests-remaining');
  if (remaining) process.stdout.write(`  [${remaining} req left] `);
  if (data.errors && Object.keys(data.errors).length > 0) {
    console.log('❌ API Error:', data.errors);
    return [];
  }
  return data.response || [];
}

async function supabaseUpsert(matches) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?on_conflict=api_id,sport`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(matches)
  });
  if (!res.ok) {
    const err = await res.text();
    console.log(`❌ Supabase error: ${err}`);
    return false;
  }
  return true;
}

function formatMatch(fixture, league) {
  const f = fixture.fixture;
  const t = fixture.teams;
  const g = fixture.goals;
  const v = f.venue;
  return {
    api_id: f.id,
    league_id: league.id,
    league_name: league.name,
    sport: league.sport,
    sport_emoji: league.emoji,
    home_team: t.home.name,
    away_team: t.away.name,
    home_team_logo: t.home.logo,
    away_team_logo: t.away.logo,
    home_team_id: t.home.id,
    away_team_id: t.away.id,
    home_score: g.home,
    away_score: g.away,
    venue: v?.name || null,
    city: v?.city || null,
    match_date: f.date,
    status: f.status?.short || 'NS',
  };
}

async function syncLeague(league) {
  console.log(`\n🏆 ${league.name} (id: ${league.id})`);

  console.log('  📅 Prochains matchs...');
  const next = await apiFootball(`/fixtures?league=${league.id}&season=${SEASON}&next=20`);
  console.log(`${next.length} trouvés`);

  console.log('  📊 Derniers résultats...');
  const last = await apiFootball(`/fixtures?league=${league.id}&season=${SEASON}&last=10`);
  console.log(`${last.length} trouvés`);

  const matches = [
    ...next.map(f => formatMatch(f, league)),
    ...last.map(f => formatMatch(f, league)),
  ];

  if (matches.length === 0) {
    console.log('  ⚠️  Aucun match trouvé');
    return 0;
  }

  console.log(`  💾 Sauvegarde de ${matches.length} matchs...`);
  const ok = await supabaseUpsert(matches);
  if (ok) console.log(`  ✅ ${matches.length} matchs synchronisés !`);

  return matches.length;
}

async function syncEvents() {
  console.log('\n⚽ Sync des événements (derniers matchs terminés)...');

  for (const league of LEAGUES) {
    const finished = await apiFootball(`/fixtures?league=${league.id}&season=${SEASON}&last=5`);

    for (const f of finished) {
      if (f.fixture.status.short !== 'FT') continue;
      const fid = f.fixture.id;

      const events = await apiFootball(`/fixtures/events?fixture=${fid}`);
      const stats = await apiFootball(`/fixtures/statistics?fixture=${fid}`);

      const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?api_id=eq.${fid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          events: events || [],
          statistics: stats || [],
        })
      });

      if (res.ok) {
        console.log(`  ✅ ${f.teams.home.name} vs ${f.teams.away.name}`);
      }
    }
  }
}

async function syncLineups() {
  console.log('\n👥 Sync des compositions (matchs imminents)...');

  const now = new Date();
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?status=eq.NS&lineups=is.null&match_date=gte.${now.toISOString()}&match_date=lte.${in2h.toISOString()}&select=id,api_id,home_team,away_team&limit=20`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  const matches = await res.json();
  if (!matches || matches.length === 0) { console.log('  Aucun match imminent'); return; }

  for (const m of matches) {
    const lineupsData = await apiFootball(`/fixtures/lineups?fixture=${m.api_id}`);

    if (lineupsData.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.${m.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ lineups: lineupsData })
      });
      console.log(`  ✅ Compos: ${m.home_team} vs ${m.away_team}`);
    }
  }
}

async function main() {
  console.log('🏟️  ARENAS — Sync des matchs\n');
  console.log(`📅 ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR')}`);

  let total = 0;
  for (const league of LEAGUES) {
    total += await syncLeague(league);
  }

  await syncEvents();
  await syncLineups();

  console.log('\n' + '='.repeat(50));
  console.log(`🎉 Terminé ! ${total} matchs synchronisés.`);
  console.log(`📊 ${requestCount} requêtes API utilisées.`);
  console.log('='.repeat(50));
}

main().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });
