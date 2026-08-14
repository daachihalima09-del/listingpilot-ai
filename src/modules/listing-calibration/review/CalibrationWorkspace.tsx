'use client';

import { AlertTriangle, CheckCircle2, FlaskConical, Library, Play, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CraftRuleAdjustmentProposal, ListingCalibrationReport, NeovixGoldFixture, ProposalStatus } from '../domain/contracts.ts';

type Tab = 'FIXTURES' | 'REPORTS' | 'PROPOSALS';
interface Props {
  readonly workspaceId: string;
  readonly canManage: boolean;
  readonly initialFixtures: readonly NeovixGoldFixture[];
  readonly initialReports: readonly ListingCalibrationReport[];
  readonly initialProposals: readonly CraftRuleAdjustmentProposal[];
  readonly openFixtureId?: string;
}

const button = 'rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45';
const statusTone: Record<string, string> = { APPROVED: 'text-emerald-200 bg-emerald-400/10', EXCELLENT_MATCH: 'text-emerald-200 bg-emerald-400/10', GOOD_MATCH: 'text-sky-200 bg-sky-400/10', UNDER_REVIEW: 'text-amber-200 bg-amber-400/10', READY_FOR_REVIEW: 'text-amber-200 bg-amber-400/10', NEEDS_CALIBRATION: 'text-amber-200 bg-amber-400/10', POOR_MATCH: 'text-rose-200 bg-rose-400/10', BLOCKED: 'text-rose-200 bg-rose-400/10', REJECTED: 'text-rose-200 bg-rose-400/10' };
function Badge({ value }: { value: string }) { return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[value] ?? 'bg-white/10 text-slate-300'}`}>{value.replaceAll('_', ' ')}</span>; }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? 'The calibration request failed.');
  return body as T;
}

export function CalibrationWorkspace({ workspaceId, canManage, initialFixtures, initialReports, initialProposals, openFixtureId }: Props) {
  const [tab, setTab] = useState<Tab>('FIXTURES');
  const [fixtures, setFixtures] = useState([...initialFixtures]);
  const [reports, setReports] = useState([...initialReports]);
  const [proposals, setProposals] = useState([...initialProposals]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState(openFixtureId ?? initialFixtures[0]?.fixtureId ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(fixtures.map(({ category }) => category))].sort(), [fixtures]);
  const visibleFixtures = fixtures.filter((item) => (statusFilter === 'ALL' || item.approvalStatus === statusFilter) && (categoryFilter === 'ALL' || item.category === categoryFilter));
  const selected = fixtures.find(({ fixtureId }) => fixtureId === selectedId) ?? null;

  const transition = async (fixture: NeovixGoldFixture, action: string) => {
    setBusy(fixture.fixtureId); setNotice(null);
    try {
      const result = await request<{ fixture: NeovixGoldFixture }>(`/api/listing-calibration/fixtures/${fixture.fixtureId}`, { method: 'PATCH', body: JSON.stringify({ workspaceId, expectedVersion: fixture.version, action }) });
      setFixtures((items) => items.map((item) => item.fixtureId === result.fixture.fixtureId ? result.fixture : item));
      setNotice('Gold Fixture status updated.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The fixture could not be updated.'); }
    finally { setBusy(null); }
  };
  const runCalibration = async (fixture: NeovixGoldFixture) => {
    setBusy(`run:${fixture.fixtureId}`); setNotice(null);
    try {
      const result = await request<{ report: ListingCalibrationReport }>('/api/listing-calibration/reports', { method: 'POST', body: JSON.stringify({ workspaceId, fixtureId: fixture.fixtureId }) });
      setReports((items) => [result.report, ...items]); setTab('REPORTS'); setNotice('Calibration completed locally.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Calibration could not run.'); }
    finally { setBusy(null); }
  };
  const reviewProposal = async (proposal: CraftRuleAdjustmentProposal, status: Extract<ProposalStatus, 'APPROVED' | 'REJECTED' | 'DEFERRED'>) => {
    setBusy(proposal.proposalId); setNotice(null);
    try {
      const result = await request<{ proposal: CraftRuleAdjustmentProposal }>(`/api/listing-calibration/proposals/${proposal.proposalId}`, { method: 'PATCH', body: JSON.stringify({ workspaceId, expectedVersion: proposal.version, status }) });
      setProposals((items) => items.map((item) => item.proposalId === result.proposal.proposalId ? result.proposal : item));
      setNotice('Proposal decision recorded. No NEOVIX rules were changed.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The proposal could not be reviewed.'); }
    finally { setBusy(null); }
  };
  const saveFixture = async (fixture: NeovixGoldFixture) => {
    setBusy(fixture.fixtureId); setNotice(null);
    try {
      const result = await request<{ fixture: NeovixGoldFixture }>(`/api/listing-calibration/fixtures/${fixture.fixtureId}`, { method: 'PATCH', body: JSON.stringify({ workspaceId, expectedVersion: fixture.version, fixture }) });
      setFixtures((items) => items.map((item) => item.fixtureId === result.fixture.fixtureId ? result.fixture : item)); setNotice('Gold Fixture changes saved.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The fixture could not be saved.'); }
    finally { setBusy(null); }
  };
  const duplicateFixture = async (fixture: NeovixGoldFixture) => {
    setBusy(fixture.fixtureId); setNotice(null);
    try {
      const result = await request<{ fixture: NeovixGoldFixture }>(`/api/listing-calibration/fixtures/${fixture.fixtureId}`, { method: 'POST', body: JSON.stringify({ workspaceId }) });
      setFixtures((items) => [result.fixture, ...items]); setSelectedId(result.fixture.fixtureId); setNotice('A separate draft copy was created.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The fixture could not be duplicated.'); }
    finally { setBusy(null); }
  };

  return <div className="rounded-[2rem] border border-white/10 bg-[#081423]/95 p-5 shadow-2xl sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6"><div><p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">NEOVIX Gold Standard</p><h1 className="mt-2 text-3xl font-semibold text-white">Listing calibration</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">Compare approved reference listings with generated drafts and review evidence before any future Craft Pack change.</p></div><span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300"><ShieldCheck className="h-4 w-4 text-emerald-300" />{canManage ? 'Owner controls' : 'View only'}</span></div>
    {notice ? <div role="status" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{notice}</div> : null}
    <div role="tablist" aria-label="Calibration sections" className="mt-6 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-[#07111f] p-1">{([['FIXTURES','Gold Fixtures'],['REPORTS','Calibration Reports'],['PROPOSALS','Rule Proposals']] as const).map(([id,label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === id ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:bg-white/5'}`}>{label}</button>)}</div>

    {tab === 'FIXTURES' ? <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.85fr)]"><div><div className="mb-4 flex flex-wrap gap-2"><select aria-label="Filter fixtures by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm"><option value="ALL">All statuses</option>{['DRAFT','UNDER_REVIEW','APPROVED','REJECTED','DEPRECATED'].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter fixtures by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm"><option value="ALL">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>{visibleFixtures.length ? <div className="space-y-3">{visibleFixtures.map((fixture) => <button key={fixture.fixtureId} type="button" onClick={() => setSelectedId(fixture.fixtureId)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === fixture.fixtureId ? 'border-amber-300/30 bg-amber-300/5' : 'border-white/10 bg-white/[0.025] hover:bg-white/5'}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-white">{fixture.name}</strong><Badge value={fixture.approvalStatus} /></div><p className="mt-2 text-xs text-slate-400">{fixture.category} · {fixture.productIdentity.brand ?? 'Unknown brand'} {fixture.productIdentity.model ?? ''}</p><p className="mt-1 text-xs text-slate-500">NEOVIX v{fixture.craftPackVersion} · Last score {fixture.metadata.lastCalibrationScore ?? 'Not run'}</p></button>)}</div> : <Empty icon={<Library />} title="No Gold Fixtures match these filters" body="Save an approved NEOVIX draft, then add it from the Review Workspace." />}</div>
      <div>{selected ? <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-white">{selected.name}</h2><Badge value={selected.approvalStatus} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500">Category</dt><dd className="mt-1 text-slate-200">{selected.category}</dd></div><div><dt className="text-slate-500">Version</dt><dd className="mt-1 text-slate-200">{selected.version}</dd></div><div><dt className="text-slate-500">Expected title</dt><dd className="mt-1 text-slate-200">{selected.expectedTitle.value}</dd></div><div><dt className="text-slate-500">Specifications</dt><dd className="mt-1 text-slate-200">{selected.expectedSpecifications.length}</dd></div></dl><div className="mt-5 flex flex-wrap gap-2">{canManage ? <button className={button} disabled={busy === selected.fixtureId} onClick={() => duplicateFixture(selected)}>Duplicate safely</button> : null}{canManage && selected.approvalStatus === 'DRAFT' ? <button className={button} disabled={busy === selected.fixtureId} onClick={() => transition(selected,'SUBMIT')}>Submit for review</button> : null}{canManage && selected.approvalStatus === 'UNDER_REVIEW' ? <><button className={button} disabled={busy === selected.fixtureId} onClick={() => transition(selected,'APPROVE')}>Approve</button><button className={button} disabled={busy === selected.fixtureId} onClick={() => transition(selected,'REJECT')}>Reject</button></> : null}{canManage && selected.approvalStatus === 'REJECTED' ? <button className={button} onClick={() => transition(selected,'RETURN_TO_DRAFT')}>Return to draft</button> : null}{canManage && selected.approvalStatus === 'APPROVED' ? <><button className={button} disabled={Boolean(busy)} onClick={() => runCalibration(selected)}><Play className="mr-1 inline h-3 w-3" />Run calibration</button><button className={button} onClick={() => transition(selected,'DEPRECATE')}>Deprecate</button></> : null}</div><p className="mt-4 text-xs text-slate-500">Calibration is deterministic and never regenerates or publishes content.</p>{canManage && selected.approvalStatus === 'DRAFT' ? <FixtureEditor key={`${selected.fixtureId}:${selected.version}`} fixture={selected} disabled={busy === selected.fixtureId} onSave={saveFixture} /> : null}</section> : null}</div></div> : null}

    {tab === 'REPORTS' ? <div className="mt-5 space-y-4">{reports.length ? reports.map((report) => <section key={report.reportId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-end gap-3"><strong className="text-4xl text-white">{report.overallScore}</strong><span className="pb-1 text-xs text-slate-500">/ 100</span></div><Badge value={report.status} /></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[['Title',report.sectionScores.titleScore.score],['Specifications',report.sectionScores.specificationScore.score],['Overview',report.sectionScores.overviewScore.score],['Features',report.sectionScores.featureScore.score],['Identity',report.sectionScores.identityScore.score],['Duplication',report.sectionScores.duplicationScore.score],['Wording',report.sectionScores.wordingScore.score]].map(([label,score]) => <div key={String(label)} className="rounded-xl bg-[#07111f] p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-white">{score}</p></div>)}</div>{report.findings.length ? <div className="mt-4 space-y-2">{report.findings.slice(0,8).map((finding) => <div key={finding.findingId} className="flex gap-3 rounded-xl border border-white/10 p-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><p className="text-sm text-slate-200">{finding.message}</p><p className="mt-1 text-xs text-slate-500">{finding.section} · {finding.severity}</p></div></div>)}</div> : <p className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4" />No important mismatches.</p>}</section>) : <Empty icon={<FlaskConical />} title="No calibration reports yet" body="Approve a Gold Fixture, then run its first local comparison." />}</div> : null}

    {tab === 'PROPOSALS' ? <div className="mt-5 space-y-4">{proposals.length ? proposals.map((proposal) => <section key={proposal.proposalId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-[0.15em] text-amber-300">What ListingPilot noticed</p><h2 className="mt-1 text-lg font-semibold text-white">{proposal.reason}</h2></div><Badge value={proposal.status} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Info label="Current NEOVIX rule" value={String(proposal.currentValue ?? 'Current pack behavior')} /><Info label="Suggested change" value={String(proposal.proposedValue)} /><Info label="Approved fixtures supporting it" value={String(proposal.supportingFixtureIds.length)} /><Info label="Contradicting fixtures" value={String(proposal.contradictingFixtureIds.length)} /><Info label="Confidence" value={`${Math.round(proposal.confidence * 100)}%`} /><Info label="Potential risk" value={proposal.risk} /></div>{canManage && ['DRAFT','READY_FOR_REVIEW'].includes(proposal.status) ? <div className="mt-5 flex flex-wrap gap-2"><button className={button} disabled={busy === proposal.proposalId} onClick={() => reviewProposal(proposal,'APPROVED')}>Approve evidence</button><button className={button} disabled={busy === proposal.proposalId} onClick={() => reviewProposal(proposal,'REJECTED')}>Reject</button><button className={button} disabled={busy === proposal.proposalId} onClick={() => reviewProposal(proposal,'DEFERRED')}>Defer</button></div> : null}<p className="mt-4 text-xs text-slate-500">Approval records this decision only. It does not modify NEOVIX Craft Pack code.</p></section>) : <Empty icon={<FlaskConical />} title="No rule proposals" body="Repeated evidence across at least three approved fixtures is required before a proposal appears." />}</div> : null}
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-[#07111f] p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm text-slate-200">{value}</p></div>; }
function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) { return <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-slate-400">{icon}</div><h2 className="mt-3 font-semibold text-white">{title}</h2><p className="mt-1 text-sm text-slate-500">{body}</p></div>; }

function FixtureEditor({ fixture, disabled, onSave }: { fixture: NeovixGoldFixture; disabled: boolean; onSave: (fixture: NeovixGoldFixture) => void }) {
  const [name, setName] = useState(fixture.name); const [category, setCategory] = useState(fixture.category); const [description, setDescription] = useState(fixture.description);
  const [title, setTitle] = useState(fixture.expectedTitle.value); const [overview, setOverview] = useState(fixture.expectedOverview.value);
  const [specifications, setSpecifications] = useState(fixture.expectedSpecifications.map(({ label, value }) => `${label}: ${value}`).join('\n'));
  const [features, setFeatures] = useState(fixture.expectedFeatures.map(({ value }) => value).join('\n')); const input = 'mt-1 w-full rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-300/40';
  const save = () => {
    const specLines = specifications.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    const featureLines = features.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    onSave({ ...fixture, name: name.trim(), category: category.trim(), description: description.trim(), expectedTitle: { ...fixture.expectedTitle, value: title.trim() }, expectedOverview: { ...fixture.expectedOverview, value: overview.trim() }, expectedSpecifications: specLines.map((line, index) => { const split = line.indexOf(':'); return { label: split > 0 ? line.slice(0, split).trim() : fixture.expectedSpecifications[index]?.label ?? 'Specification', value: split > 0 ? line.slice(split + 1).trim() : line, factIds: fixture.expectedSpecifications[index]?.factIds ?? [] }; }), expectedFeatures: featureLines.map((value, index) => ({ value, factIds: fixture.expectedFeatures[index]?.factIds ?? [] })) });
  };
  return <div className="mt-5 space-y-3 border-t border-white/10 pt-5"><h3 className="text-sm font-semibold text-amber-100">Edit draft fixture</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">Fixture name<input className={input} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="text-xs text-slate-400">Category<input className={input} value={category} onChange={(event) => setCategory(event.target.value)} /></label></div><label className="block text-xs text-slate-400">Description<textarea className={input} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></label><label className="block text-xs text-slate-400">Expected title<textarea className={input} rows={2} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="block text-xs text-slate-400">Expected overview<textarea className={input} rows={4} value={overview} onChange={(event) => setOverview(event.target.value)} /></label><label className="block text-xs text-slate-400">Specifications — one Label: Value per line<textarea className={input} rows={5} value={specifications} onChange={(event) => setSpecifications(event.target.value)} /></label><label className="block text-xs text-slate-400">Features — one per line<textarea className={input} rows={5} value={features} onChange={(event) => setFeatures(event.target.value)} /></label><button type="button" className="rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50" disabled={disabled || name.trim().length < 2 || !category.trim()} onClick={save}>Save fixture changes</button></div>;
}
