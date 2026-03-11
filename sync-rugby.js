#!/usr/bin/env node
// ARENAS — Sync rugby matches from API-Rugby to Supabase
// Runs automatically via GitHub Actions every 5 min (11h-00h30)

const API_KEY = process.env.API_SPORTS_KEY;
const API_BASE = 'https://v1.rugby.api-sports.io';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const LEAGUES = [
  { id: 16, name: 'Top 14', sport: 'rugby', emoji: '🏉', filter: 'all' },
  { id: 17, name: 'Pro D2', sport: 'rugby', emoji: '🏉', filter: 'all' },
  { id: 51, name: 'Tournoi des 6 Nations', sport: 'rugby', emoji: '🏉', filter: 'france_only' },
  { id: 54, name: 'Champions Cup', sport: 'rugby', emoji: '🏉', filter: 'french_clubs' },
  { id: 52, name: 'Challenge Cup', sport: 'rugby', emoji: '🏉', filter: 'french_clubs' },
  { id: 79, name: 'Nationale', sport: 'rugby', emoji: '🏉', filter: 'all' },
];

// Current season only — old seasons are already in Supabase
const SEASON = 2025;

const FRANCE_NAMES = ['France', 'france'];
let frenchClubNames = new Set();

const RUGBY_VENUES = {
  'Aviron Bayonnais': { venue: 'Stade Jean-Dauger', city: 'Bayonne' },
  'Bordeaux Begles': { venue: 'Stade Chaban-Delmas', city: 'Bordeaux' },
  'Castres Olympique': { venue: 'Stade Pierre-Fabre', city: 'Castres' },
  'Clermont': { venue: 'Stade Marcel-Michelin', city: 'Clermont-Ferrand' },
  'Lyon': { venue: 'Matmut Stadium', city: 'Lyon' },
  'Montpellier': { venue: 'GGL Stadium', city: 'Montpellier' },
  'Racing 92': { venue: 'Paris La Défense Arena', city: 'Nanterre' },
  'RC Toulonnais': { venue: 'Stade Mayol', city: 'Toulon' },
  'Section Paloise': { venue: 'Stade du Hameau', city: 'Pau' },
  'Stade Francais Paris': { venue: 'Stade Jean-Bouin', city: 'Paris' },
  'Stade Rochelais': { venue: 'Stade Marcel-Deflandre', city: 'La Rochelle' },
  'Stade Toulousain': { venue: 'Stade Ernest-Wallon', city: 'Toulouse' },
  'USA Perpignan': { venue: 'Stade Aimé-Giral', city: 'Perpignan' },
  'Vannes': { venue: 'Stade de la Rabine', city: 'Vannes' },
  'Grenoble FC': { venue: 'Stade des Alpes', city: 'Grenoble' },
  'Montauban': { venue: 'Stade Sapiac', city: 'Montauban' },
  'Agen': { venue: 'Stade Armandie', city: 'Agen' },
  'Angouleme': { venue: 'Stade Chanzy', city: 'Angoulême' },
  'Aurillac': { venue: 'Stade Jean-Alric', city: 'Aurillac' },
  'Beziers': { venue: 'Stade de la Méditerranée', city: 'Béziers' },
  'Biarritz Olympique': { venue: 'Parc des Sports Aguiléra', city: 'Biarritz' },
  'CA Brive': { venue: 'Stade Amédée-Domenech', city: 'Brive-la-Gaillarde' },
  'Chambery': { venue: 'Chambéry Savoie Stadium', city: 'Chambéry' },
  'Colomiers': { venue: 'Stade Michel-Bendichou', city: 'Colomiers' },
  'Mont-de-Marsan': { venue: 'Stade Guy-Boniface', city: 'Mont-de-Marsan' },
  'Nevers': { venue: 'Stade du Pré-Fleuri', city: 'Nevers' },
  'Provence Rugby': { venue: 'Stade Maurice-David', city: 'Aix-en-Provence' },
  'Stade Nicois': { venue: 'Stade des Arboras', city: 'Nice' },
  'US Dax': { venue: 'Stade Maurice-Boyau', city: 'Dax' },
  'US Oyonnax': { venue: 'Stade Charles-Mathon', city: 'Oyonnax' },
  'Valence Romans': { venue: 'Stade Pompidou', city: 'Valence' },
  'Carcassonne': { venue: 'Stade Albert-Domec', city: 'Carcassonne' },
  'Albi': { venue: 'Stadium Municipal', city: 'Albi' },
  'Bressane': { venue: 'Stade Marcel Verchère', city: 'Bourg-en-Bresse' },
  'CS Bourgoin-Jallieu': { venue: 'Stade Pierre-Rajon', city: 'Bourgoin-Jallieu' },
  'Hyeres': { venue: 'Stade Perruc', city: 'Hyères' },
  'Massy': { venue: 'Stade Jacques-Billard', city: 'Massy' },
  'Narbonne': { venue: 'Parc des Sports et de l\'Amitié', city: 'Narbonne' },
  'Niort': { venue: 'Stade Espinassou', city: 'Niort' },
  'Ol. Marcquois': { venue: 'Stadium Lille Métropole', city: 'Villeneuve-d\'Ascq' },
  'Perigourdin': { venue: 'Stade Francis-Rongiéras', city: 'Périgueux' },
  'Rouen Normandie': { venue: 'Stade Mermoz', city: 'Rouen' },
  'Stade Langonnais': { venue: 'Stade Jean-Duhourquet', city: 'Langon' },
  'Suresnes': { venue: 'Stade Jean-Moulin', city: 'Suresnes' },
  'Tarbes Pyrenees': { venue: 'Stade Maurice-Trélut', city: 'Tarbes' },
  'Nissa': { venue: 'Stade des Arboras', city: 'Nice' },
  'Rennes': { venue: 'Stade du Commandant Bougouin', city: 'Rennes' },
  'France': { venue: 'Stade de France', city: 'Saint-Denis' },
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

let requestCount = 0;

async function apiRugby(endpoint) {
  await delay(350);
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

function formatRugbyMatch(game, league) {
  const homeName = game.teams?.home?.name || 'TBD';
  const homeVenue = RUGBY_VENUES[homeName];
  return {
    api_id: game.id,
    league_id: league.id,
    league_name: league.name,
    sport: league.sport,
    sport_emoji: league.emoji,
    home_team: homeName,
    away_team: game.teams?.away?.name || 'TBD',
    home_team_logo: game.teams?.home?.logo || null,
    away_team_logo: game.teams?.away?.logo || null,
    home_team_id: game.teams?.home?.id || null,
    away_team_id: game.teams?.away?.id || null,
    home_score: game.scores?.home ?? null,
    away_score: game.scores?.away ?? null,
    venue: homeVenue?.venue || null,
    city: homeVenue?.city || null,
    match_date: game.date,
    status: game.status?.short || 'NS',
  };
}

function isFrenchTeam(teamName) {
  return FRANCE_NAMES.some(n => teamName.toLowerCase().includes(n.toLowerCase()));
}

function isFrenchClub(teamName) {
  if (frenchClubNames.has(teamName)) return true;
  for (const club of frenchClubNames) {
    if (teamName.includes(club) || club.includes(teamName)) return true;
  }
  return false;
}

function filterMatches(matches, filterType) {
  if (filterType === 'all') return matches;
  if (filterType === 'france_only') {
    return matches.filter(m => isFrenchTeam(m.home_team) || isFrenchTeam(m.away_team));
  }
  if (filterType === 'french_clubs') {
    return matches.filter(m => isFrenchClub(m.home_team) || isFrenchClub(m.away_team));
  }
  return matches;
}

async function collectFrenchClubs() {
  console.log('\n🇫🇷 Collecte des clubs français (Top 14 + Pro D2 + Nationale)...');

  const frenchLeagues = LEAGUES.filter(l => l.filter === 'all');
  for (const league of frenchLeagues) {
    const teams = await apiRugby(`/teams?league=${league.id}&season=${SEASON}`);
    for (const t of teams) {
      if (t.name) frenchClubNames.add(t.name);
      if (t.team?.name) frenchClubNames.add(t.team.name);
    }
    console.log(`  ${league.name}: ${teams.length} équipes`);
  }

  console.log(`  📋 ${frenchClubNames.size} clubs français identifiés`);
}

async function syncLeague(league) {
  console.log(`\n🏆 ${league.name} (id: ${league.id}, filtre: ${league.filter})`);

  const now = new Date();
  const games = await apiRugby(`/games?league=${league.id}&season=${SEASON}`);

  if (games.length === 0) {
    console.log('  ⚠️  Aucun match trouvé');
    return 0;
  }

  const next = games.filter(g => new Date(g.date) >= now).slice(0, 20);
  const last = games
    .filter(g => new Date(g.date) < now && ['FT', 'AET', 'AP'].includes(g.status?.short))
    .slice(-10);

  console.log(`  📅 ${next.length} prochains, 📊 ${last.length} résultats`);

  const allRaw = [...next, ...last];
  const seen = new Set();
  const unique = allRaw.filter(g => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });

  let matches = unique.map(g => formatRugbyMatch(g, league));

  const before = matches.length;
  matches = filterMatches(matches, league.filter);
  if (league.filter !== 'all') {
    console.log(`  🔍 Filtre ${league.filter}: ${before} → ${matches.length} matchs`);
  }

  if (matches.length === 0) {
    console.log('  ⚠️  Aucun match après filtrage');
    return 0;
  }

  console.log(`  💾 Sauvegarde de ${matches.length} matchs...`);
  const ok = await supabaseUpsert(matches);
  if (ok) console.log(`  ✅ ${matches.length} matchs synchronisés !`);

  return matches.length;
}

async function main() {
  console.log('🏉 ARENAS — Sync des matchs rugby\n');
  console.log(`📅 ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR')}`);

  await collectFrenchClubs();

  let total = 0;
  for (const league of LEAGUES) {
    total += await syncLeague(league);
  }

  console.log('\n' + '='.repeat(50));
  console.log(`🎉 Terminé ! ${total} matchs rugby synchronisés.`);
  console.log(`📊 ${requestCount} requêtes API utilisées.`);
  console.log('='.repeat(50));
}

main().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });
