import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { compare, createTracked, deleteTracked, getConfig, listTracked, refreshTracked, type CompareResponse, type SerpItem, type TrackedKeyword } from './api';
import './styles.css';

type Page = 'compare' | 'tracking';

const quickQueries = ['react state management', 'typescript generics', 'web accessibility'];
const countries = [{ value: 'us', label: 'United States' }, { value: 'fr', label: 'France' }, { value: 'gb', label: 'United Kingdom' }, { value: 'de', label: 'Germany' }, { value: 'ca', label: 'Canada' }];
const languages = [{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }, { value: 'de', label: 'Deutsch' }, { value: 'es', label: 'Español' }];

function App() {
  const [page, setPage] = useState<Page>(window.location.hash === '#tracking' ? 'tracking' : 'compare');
  const [demoMode, setDemoMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { getConfig().then((config) => setDemoMode(config.demoMode)).catch(() => undefined); }, []);
  useEffect(() => {
    const onHash = () => setPage(window.location.hash === '#tracking' ? 'tracking' : 'compare');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(null), 4200); return () => window.clearTimeout(timer); } }, [toast]);

  const navigate = (next: Page) => { window.location.hash = next === 'tracking' ? 'tracking' : ''; setPage(next); };
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="SERP Compare accueil">
        <img src="/logo.png" alt="" className="brand-mark" />
        <span><strong>SERP</strong><small>COMPARE</small></span>
      </a>
      <div className="sidebar-kicker">WORKSPACE</div>
      <nav className="main-nav" aria-label="Navigation principale">
        <button className={page === 'compare' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('compare')}><Icon name="search" /> <span>Compare</span><span className="nav-shortcut">01</span></button>
        <button className={page === 'tracking' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('tracking')}><Icon name="pulse" /> <span>Tracking</span><span className="nav-shortcut">02</span></button>
      </nav>
      <div className="sidebar-bottom">
        <div className="system-card"><span className="status-dot" /><div><small>DATA SOURCE</small><b>{demoMode ? 'Demo engine' : 'SerpApi live'}</b></div></div>
        <div className="sidebar-meta"><span>24H CACHE</span><span>v1.0.0</span></div>
      </div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><i>/</i><strong>{page === 'compare' ? 'Compare' : 'Tracking'}</strong></div><div className="topbar-actions"><span className={demoMode ? 'mode-pill demo' : 'mode-pill'}><span className="tiny-dot" />{demoMode ? 'DEMO MODE' : 'LIVE SERPAPI'}</span><button className="icon-button" aria-label="Aide" onClick={() => setToast('Astuce : commencez par une requête puis ajoutez les domaines à surveiller.')}><Icon name="help" /></button></div></header>
      <div className="page-wrap">{page === 'compare' ? <ComparePage onToast={setToast} /> : <TrackingPage onToast={setToast} />}</div>
    </main>
    {toast && <div className="toast" role="status"><Icon name="check" /><span>{toast}</span><button aria-label="Fermer" onClick={() => setToast(null)}>×</button></div>}
  </div>;
}

function ComparePage({ onToast }: { onToast: (message: string) => void }) {
  const [query, setQuery] = useState('react state management');
  const [gl, setGl] = useState('us');
  const [hl, setHl] = useState('en');
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runCompare = async (refresh = false) => {
    if (query.trim().length < 2) { setError('Saisissez au moins 2 caractères pour lancer la comparaison.'); return; }
    setLoading(true); setError(null);
    try { setData(await compare(query, gl, hl, refresh)); if (refresh) onToast('Les résultats ont été rafraîchis depuis la source.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Impossible de charger les résultats.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => void runCompare()); }, []);
  return <>
    <section className="hero-row"><div><div className="eyebrow"><span className="eyebrow-line" /> SEARCH VISIBILITY INTELLIGENCE</div><h1>See where you <em>stand.</em></h1><p className="hero-copy">Comparez la réalité de votre visibilité entre les deux moteurs de recherche les plus utilisés.</p></div><div className="hero-orbit" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span className="orbit-core" /></div></section>
    <section className="query-panel"><div className="query-label"><span className="panel-number">01</span><div><b>COMPARE A QUERY</b><small>See how search engines rank the same intent.</small></div></div><div className="query-form"><label className="query-input"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void runCompare(); }} placeholder="Enter a search query..." aria-label="Requête" /></label><Select label="Country" value={gl} options={countries} onChange={setGl} /><Select label="Language" value={hl} options={languages} onChange={setHl} /><button className="primary-button" onClick={() => void runCompare()} disabled={loading}>{loading ? <Spinner /> : <><span>Run comparison</span><Icon name="arrow" /></>}</button></div><div className="quick-row"><span>QUICK START</span>{quickQueries.map((item) => <button key={item} onClick={() => { setQuery(item); void runCompare(); }}>{item}</button>)}</div></section>
    {error && <div className="error-banner" role="alert"><Icon name="alert" /><div><b>Comparison unavailable</b><span>{error}</span></div><button onClick={() => void runCompare()}>Try again</button></div>}
    {loading && !data ? <LoadingComparison /> : data ? <ComparisonResults data={data} onRefresh={() => void runCompare(true)} /> : null}
  </>;
}

function ComparisonResults({ data, onRefresh }: { data: CompareResponse; onRefresh: () => void }) {
  const shared = useMemo(() => new Set(data.sharedDomains), [data.sharedDomains]);
  return <section className="results-section">
    <div className="section-head"><div><div className="eyebrow"><span className="eyebrow-line" /> LIVE COMPARISON</div><h2>Results for <span className="query-token">“{data.query}”</span></h2></div><div className="section-actions"><span className="freshness"><span className="tiny-dot" /> {data.cached ? `Cached ${formatAge(data.cacheAgeSeconds)}` : 'Just updated'}</span><button className="secondary-button" onClick={onRefresh}><Icon name="refresh" /> Refresh</button></div></div>
    <div className="stats-grid"><StatCard label="Overlap score" value={`${data.overlapPercentage}%`} detail={`${data.overlapCount} of 10 domains in common`} accent="cyan" icon="overlap" /><StatCard label="Google top 10" value="10" detail="Organic results analyzed" accent="violet" icon="google" /><StatCard label="Bing top 10" value="10" detail="Organic results analyzed" accent="blue" icon="bing" /><StatCard label="Data freshness" value={formatAge(data.cacheAgeSeconds)} detail={`Updated ${new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`} accent="amber" icon="clock" /></div>
    <div className="engine-grid"><EngineTable engine="google" results={data.engines.google.results} shared={shared} /><EngineTable engine="bing" results={data.engines.bing.results} shared={shared} /></div>
    <div className="shared-strip"><div className="shared-title"><span className="shared-icon"><Icon name="link" /></span><div><b>Shared domains</b><span>Appearing on both search engines</span></div></div><div className="shared-domains">{data.sharedDomains.length ? data.sharedDomains.map((domain) => <span key={domain} className="domain-chip">{domain}</span>) : <span className="muted">No shared domains in the top 10.</span>}</div></div>
  </section>;
}

function EngineTable({ engine, results, shared }: { engine: 'google' | 'bing'; results: SerpItem[]; shared: Set<string> }) {
  const isGoogle = engine === 'google';
  return <article className={`engine-card ${engine}`}><div className="engine-head"><div className="engine-name"><span className={`engine-logo ${engine}`}>{isGoogle ? 'G' : 'b'}</span><div><b>{isGoogle ? 'Google' : 'Bing'}</b><span>Organic results</span></div></div><span className="result-count">TOP 10 <Icon name="external" /></span></div><div className="result-list">{results.map((result) => <div className={shared.has(result.domain) ? 'result-row shared' : 'result-row'} key={`${engine}-${result.position}-${result.link}`}><span className="rank">{String(result.position).padStart(2, '0')}</span><div className="result-main"><a href={result.link} target="_blank" rel="noreferrer">{result.title}</a><span className="result-domain">{result.domain}</span>{result.snippet && <p>{result.snippet}</p>}</div>{shared.has(result.domain) && <span className="shared-badge"><Icon name="link" /> SHARED</span>}</div>)}</div></article>;
}

function TrackingPage({ onToast }: { onToast: (message: string) => void }) {
  const [tracked, setTracked] = useState<TrackedKeyword[]>([]);
  const [query, setQuery] = useState(''); const [domain, setDomain] = useState(''); const [gl, setGl] = useState('us'); const [hl, setHl] = useState('en');
  const [selected, setSelected] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = async () => { setLoading(true); try { const result = await listTracked(); setTracked(result.tracked); if (!selected && result.tracked[0]) setSelected(result.tracked[0].id); } catch (err) { setError(err instanceof Error ? err.message : 'Impossible de charger les suivis.'); } finally { setLoading(false); } };
  useEffect(() => { queueMicrotask(() => void load()); }, []);
  const add = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { const result = await createTracked({ query, domain, gl, hl }); setTracked((items) => [result.tracked, ...items]); setSelected(result.tracked.id); setQuery(''); setDomain(''); onToast('Nouveau suivi ajouté.'); } catch (err) { setError(err instanceof Error ? err.message : 'Impossible de créer le suivi.'); } finally { setSaving(false); } };
  const refresh = async (item: TrackedKeyword) => { try { const result = await refreshTracked(item.id); setTracked((items) => items.map((entry) => entry.id === item.id ? result.tracked : entry)); onToast(`Position de ${item.domain} mise à jour.`); } catch (err) { setError(err instanceof Error ? err.message : 'Impossible de rafraîchir ce suivi.'); } };
  const remove = async (item: TrackedKeyword) => { if (!window.confirm(`Supprimer le suivi de ${item.domain} ?`)) return; try { await deleteTracked(item.id); setTracked((items) => items.filter((entry) => entry.id !== item.id)); if (selected === item.id) setSelected(null); onToast('Suivi supprimé.'); } catch (err) { setError(err instanceof Error ? err.message : 'Impossible de supprimer ce suivi.'); } };
  const current = tracked.find((item) => item.id === selected) ?? null;
  return <>
    <section className="hero-row tracking-hero"><div><div className="eyebrow"><span className="eyebrow-line" /> RANK TRACKING</div><h1>Watch your <em>momentum.</em></h1><p className="hero-copy">Enregistrez les positions qui comptent et repérez les mouvements avant qu’ils ne deviennent des surprises.</p></div><div className="trend-art" aria-hidden="true"><span /><span /><span /><span /><span /></div></section>
    <div className="tracking-layout"><section className="tracking-list-panel"><div className="section-head compact"><div><div className="eyebrow"><span className="eyebrow-line" /> MONITORED KEYWORDS</div><h2>Your watchlist <span className="count-badge">{tracked.length}</span></h2></div></div>{loading ? <LoadingList /> : tracked.length === 0 ? <div className="empty-state"><span className="empty-icon"><Icon name="pulse" /></span><b>No tracked keywords yet</b><p>Add your first query and domain to start collecting ranking history.</p></div> : <div className="tracking-list">{tracked.map((item) => <button className={item.id === selected ? 'tracking-item active' : 'tracking-item'} key={item.id} onClick={() => setSelected(item.id)}><div className="tracking-item-top"><span className="tracking-query">{item.query}</span><span className="tracking-menu">•••</span></div><span className="tracking-domain">{item.domain}</span><div className="tracking-positions"><PositionPill label="G" position={latest(item)?.googlePosition ?? null} color="violet" /><PositionPill label="b" position={latest(item)?.bingPosition ?? null} color="blue" /><span className="snapshot-count">{item.snapshots.length} snapshots</span></div></button>)}</div>}</section>
    <section className="tracking-detail"><div className="detail-top"><div><span className="eyebrow"><span className="eyebrow-line" /> ADD TO WATCHLIST</span><h2>Track a domain</h2></div></div><form className="track-form" onSubmit={add}><label><span>QUERY</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. react state management" /></label><label><span>DOMAIN</span><input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="e.g. react.dev" /></label><div className="form-row"><Select label="Country" value={gl} options={countries} onChange={setGl} /><Select label="Language" value={hl} options={languages} onChange={setHl} /><button className="primary-button" disabled={saving}>{saving ? <Spinner /> : <><span>Add tracking</span><Icon name="plus" /></>}</button></div></form>{error && <div className="inline-error" role="alert"><Icon name="alert" />{error}</div>}{current ? <HistoryCard item={current} onRefresh={() => void refresh(current)} onDelete={() => void remove(current)} /> : <div className="detail-placeholder"><Icon name="chart" /><p>Select a tracked keyword to see its history.</p></div>}</section></div>
  </>;
}

function HistoryCard({ item, onRefresh, onDelete }: { item: TrackedKeyword; onRefresh: () => void; onDelete: () => void }) {
  const current = latest(item); const max = item.snapshots.length ? Math.max(10, ...item.snapshots.flatMap((s) => [s.googlePosition ?? 11, s.bingPosition ?? 11])) : 10;
  return <div className="history-card"><div className="history-head"><div><span className="history-domain">{item.domain}</span><b>{item.query}</b><small>{item.gl.toUpperCase()} · {item.hl.toUpperCase()} · added {new Date(item.createdAt).toLocaleDateString()}</small></div><div className="history-actions"><button className="secondary-button" onClick={onRefresh}><Icon name="refresh" /> Refresh rank</button><a className="icon-button" href={`/api/tracked/${item.id}/export.csv`} aria-label="Exporter CSV"><Icon name="download" /></a><button className="icon-button danger" onClick={onDelete} aria-label="Supprimer"><Icon name="trash" /></button></div></div><div className="history-stats"><div><span>GOOGLE</span><strong className="violet-text">{formatPosition(current?.googlePosition ?? null)}</strong><small>latest position</small></div><div><span>BING</span><strong className="blue-text">{formatPosition(current?.bingPosition ?? null)}</strong><small>latest position</small></div><div><span>SNAPSHOTS</span><strong>{item.snapshots.length}</strong><small>checks recorded</small></div></div><RankChart snapshots={item.snapshots} max={max} /><div className="chart-legend"><span><i className="legend-line violet" /> Google</span><span><i className="legend-line blue" /> Bing</span><span className="chart-note">Lower position is better</span></div></div>;
}

function RankChart({ snapshots, max }: { snapshots: TrackedKeyword['snapshots']; max: number }) {
  const width = 680; const height = 180; const pad = { left: 30, right: 16, top: 15, bottom: 28 }; const innerW = width - pad.left - pad.right; const innerH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (snapshots.length <= 1 ? innerW / 2 : (index / (snapshots.length - 1)) * innerW);
  const y = (position: number | null) => position == null ? null : pad.top + ((position - 1) / Math.max(1, max - 1)) * innerH;
  const path = (key: 'googlePosition' | 'bingPosition') => snapshots.map((snap, index) => { const yy = y(snap[key]); return yy == null ? null : `${index === 0 || y(snapshots[index - 1]?.[key]) == null ? 'M' : 'L'} ${x(index)} ${yy}`; }).filter(Boolean).join(' ');
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Graphique de l’historique des positions"><defs><linearGradient id="gridFade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".09" /><stop offset="1" stopColor="#ffffff" stopOpacity=".02" /></linearGradient></defs>{[1, Math.ceil(max / 2), max].map((tick) => <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={y(tick)!} y2={y(tick)!} stroke="url(#gridFade)" strokeDasharray="3 5" /><text x="4" y={y(tick)! + 4} fill="#70839a" fontSize="10">{tick}</text></g>)}{snapshots.length > 0 && <><path d={path('googlePosition')} fill="none" stroke="#9a8cff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> <path d={path('bingPosition')} fill="none" stroke="#74a8ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />{snapshots.map((snap, index) => <g key={snap.id}>{snap.googlePosition && <circle cx={x(index)} cy={y(snap.googlePosition)!} r="3.5" fill="#101d2e" stroke="#9a8cff" strokeWidth="2" />}{snap.bingPosition && <circle cx={x(index)} cy={y(snap.bingPosition)!} r="3.5" fill="#101d2e" stroke="#74a8ff" strokeWidth="2" />}</g>)}</>}{snapshots.map((snap, index) => <text key={`date-${snap.id}`} x={x(index)} y={height - 6} textAnchor="middle" fill="#70839a" fontSize="9">{new Date(snap.checkedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</text>)}</svg>{snapshots.length === 0 && <div className="chart-empty">Refresh the tracking to record your first position.</div>}</div>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) { return <label className="select-wrap"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><Icon name="chevron" /></label>; }
function StatCard({ label, value, detail, accent, icon }: { label: string; value: string; detail: string; accent: string; icon: string }) { return <div className={`stat-card ${accent}`}><div className="stat-icon"><Icon name={icon} /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function PositionPill({ label, position, color }: { label: string; position: number | null; color: string }) { return <span className={`position-pill ${color}`}><b>{label}</b>{formatPosition(position)}</span>; }
function latest(item: TrackedKeyword) { return item.snapshots[item.snapshots.length - 1]; }
function formatPosition(position: number | null) { return position == null ? '—' : `#${position}`; }
function formatAge(seconds: number) { if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function Spinner() { return <span className="spinner" aria-label="Loading" />; }
function LoadingComparison() { return <div className="loading-state"><div className="loading-bar wide" /><div className="loading-bar" /><div className="loading-grid"><div /><div /></div></div>; }
function LoadingList() { return <div className="loading-list"><div /><div /><div /></div>; }
function Icon({ name }: { name: string }) { const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }; const paths: Record<string, React.ReactNode> = { search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>, pulse: <><path d="M3 12h4l2.2-7 4.1 14 2.1-7H21" /></>, help: <><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.7 1.8c-1.2.9-1.7 1.3-1.7 2.7" /><path d="M12 17h.01" /></>, check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>, arrow: <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>, refresh: <><path d="M20 11a8 8 0 0 0-14.8-3.8L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.8 3.8L20 15" /><path d="M20 20v-5h-5" /></>, overlap: <><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></>, google: <><path d="M12 4a8 8 0 1 0 7.7 10.2" /><path d="M20 5v5h-5" /></>, bing: <><path d="M7 4v12l7 4" /><path d="m14 9 5 3-5 3" /></>, clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>, link: <><path d="M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7.1-7.1L10 5" /><path d="M14 11a5 5 0 0 0-7.1-.1l-1.4 1.4a5 5 0 0 0 7.1 7.1L14 19" /></>, external: <><path d="M14 5h5v5" /><path d="m19 5-8 8" /><path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" /></>, chevron: <path d="m8 10 4 4 4-4" />, plus: <><path d="M12 5v14M5 12h14" /></>, chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 3-4 3 2 5-7" /></>, download: <><path d="M12 4v11" /><path d="m8 11 4 4 4-4" /><path d="M5 20h14" /></>, trash: <><path d="M4 7h16" /><path d="M10 11v5M14 11v5" /><path d="m9 7 .7-2h4.6l.7 2M7 7l.7 13h8.6L17 7" /></>, alert: <><path d="M12 4 3 20h18L12 4Z" /><path d="M12 9v5M12 17h.01" /></> }; return <svg {...common}>{paths[name]}</svg>; }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
