const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const live = readFileSync(join(root, 'src/screens/LiveScreen.tsx'), 'utf8');
const exploreHome = readFileSync(join(root, 'src/components/explore/ExploreHomeView.tsx'), 'utf8');
const guidedNavigation = readFileSync(join(root, 'src/components/explore/GuidedNavigationView.tsx'), 'utf8');
const transcript = readFileSync(join(root, 'src/components/explore/TranscriptSheet.tsx'), 'utf8');
const tourPreferences = readFileSync(join(root, 'src/components/explore/TourPreferencesSheet.tsx'), 'utf8');
const history = readFileSync(join(root, 'src/screens/HistoryScreen.tsx'), 'utf8');
const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
const routing = readFileSync(join(root, 'src/context/appIdentity.ts'), 'utf8');
const liveSurface = [live, exploreHome, guidedNavigation, transcript, tourPreferences].join('\n');

assert.match(routing, /return 'Main';/, 'first launch routes to Main/Explore');
assert.match(app, /name="Explore"/, 'Explore tab is present');
assert.match(app, /name="Stories"/, 'Stories tab is present');
assert.match(app, /name="Settings"/, 'Settings tab is present');
assert.doesNotMatch(app, /name="Drive"/, 'Drive is not a bottom tab');

assert.match(live, /visibleExplorationModes = explorationModes\.filter/, 'visible mode selector is filtered');
assert.match(live, /item !== 'drive_discovery'/, 'Drive Discovery is not a visible mode selector item');
assert.match(liveSurface, /stage/, 'Explore screen uses a map-first City Signal stage');
assert.match(liveSurface, /Start your walk/, 'Tour Preferences surface exists');
assert.match(live, /guideProfileOpen/, 'Guide Profile surface exists');
assert.match(liveSurface, /choose up to 3|Choose up to 3 interests/, 'Interest limit guard exists');
assert.match(liveSurface, /No interests selected/, 'Zero-interest fallback exists');
assert.match(liveSurface, /Transcript/, 'Transcript access exists');
assert.match(live, /End tour\?/, 'End Tour confirmation exists');
assert.match(liveSurface, /topChip/, 'Navigating state has top destination chip');
assert.match(live, /Share Route/, 'Share Route action exists');
assert.match(live, /No account required to start/, 'Share Preview guest microcopy exists');
assert.match(live, /invalid_link/, 'Share Preview invalid-link state exists');
assert.match(live, /unsupported_location/, 'Share Preview unsupported-location state exists');

assert.match(history, /Your City Stories|history\.title/, 'Stories title is consumer-facing');
assert.match(history, /Start your first walk/, 'Stories empty state is not blank');
assert.match(history, /MapView/, 'Stories cards use a route thumbnail');

assert.match(settings, /Guide & Interests/, 'Settings has Guide & Interests');
assert.match(settings, /Audio & Text/, 'Settings has Audio & Text');
assert.match(settings, /History & Privacy/, 'Settings has History & Privacy');
assert.match(settings, /About Hey City/, 'Settings has About Hey City');
assert.match(settings, /Switch value disabled/, 'Settings does not expose inert audio controls as active');

console.log('citySignalUiContract tests passed');
