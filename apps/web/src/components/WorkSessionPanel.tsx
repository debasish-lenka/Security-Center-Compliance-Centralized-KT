import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ExternalLink, FileText, Loader2, MonitorUp, Play, Square, StopCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { workApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatDateTimeIST } from '@/lib/utils';

// Screenshots are taken only when the picture changes (not on a timer), at most one every 30 seconds,
// and once every 10 minutes at the least as a sign of life. A JPEG of about 100-150 KB each.
const LOOK_EVERY_MS = 3000;
const MIN_GAP_MS = 30_000;
const SIGN_OF_LIFE_MS = 10 * 60_000;
const CHANGED_PIXELS = 0.08;

const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
const errText = (e: any, fallback: string) => e?.response?.data?.error?.message ?? fallback;

interface WorkLink { label: string; url: string }

const EVIDENCE: Record<string, { label: string; cls: string; hint: string }> = {
  FULL: { label: 'Full evidence', cls: 'bg-dbi-success/20 text-dbi-success', hint: 'The whole screen was shared the whole time and pictures were taken' },
  PARTIAL: { label: 'Partial evidence', cls: 'bg-dbi-warning/20 text-dbi-warning', hint: 'Sharing was interrupted, only a window or tab was shared, or no picture was taken' },
  NONE: { label: 'No evidence', cls: 'bg-dbi-critical/20 text-dbi-critical', hint: 'The screen was never shared' },
};
const ToolBadge = ({ s }: { s: { toolCheck: string | null; ocrSeen: number; ocrChecked: number } }) => {
  const n = `${s.ocrSeen} of ${s.ocrChecked} screenshots`;
  if (s.toolCheck === 'SEEN') return <Badge title={`The tool was seen on ${n}`} className="bg-dbi-success/20 text-dbi-success">Tool seen ({s.ocrSeen}/{s.ocrChecked})</Badge>;
  if (s.toolCheck === 'LOW') return <Badge title={`The tool was seen on only ${n}`} className="bg-dbi-warning/20 text-dbi-warning">Rarely seen ({s.ocrSeen}/{s.ocrChecked})</Badge>;
  if (s.toolCheck === 'NOT_SEEN') return <Badge title={`The tool was not seen on any of ${s.ocrChecked} screenshots`} className="bg-dbi-critical/20 text-dbi-critical">Tool NOT seen (0/{s.ocrChecked})</Badge>;
  if (s.toolCheck === 'NO_LINK') return <Badge variant="secondary" title="No tool address is set for this project, so the screenshots cannot be checked">No tool set</Badge>;
  return <Badge variant="secondary" title="Screenshots are read at night">Not checked yet</Badge>;
};
const EvidenceBadge = ({ level }: { level: string }) => { const e = EVIDENCE[level] ?? EVIDENCE.NONE; return <Badge title={e.hint} className={e.cls}>{e.label}</Badge>; };

export function WorkSessionPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const stateQ = useQuery({ queryKey: ['work-state', projectId], queryFn: async () => (await workApi.state(projectId)).data.data, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true, refetchInterval: (q) => (q.state.data?.active ? 15_000 : false) }); // counters follow the running session
  const sessionsQ = useQuery({ queryKey: ['work-sessions', projectId], queryFn: async () => (await workApi.sessions(projectId)).data.data, refetchInterval: 20_000 }); // the table follows running sessions
  const state = stateQ.data;
  const active = state?.active ?? null;
  const activeId: string | null = active?.id ?? null;

  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [shareProblem, setShareProblem] = useState<string | null>(null); // why sharing did not start; stays until the next try

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const prevRef = useRef<Uint8ClampedArray | null>(null);
  const lastShotRef = useRef(0);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = activeId;
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['work-state', projectId] });
    qc.invalidateQueries({ queryKey: ['work-sessions', projectId] });
  }, [qc, projectId]);

  const sendEvent = useCallback((text: string) => {
    const sid = sessionRef.current;
    if (sid) workApi.event(projectId, sid, text).catch(() => undefined);
  }, [projectId]);

  // ---- pictures ----
  const post = useCallback(async (canvas: HTMLCanvasElement, reason: 'CHANGE' | 'MANUAL' | 'HEARTBEAT' | 'NOTE' | 'STOP') => {
    const sid = sessionRef.current;
    if (!sid) return;
    const image = canvas.toDataURL('image/jpeg', 0.6).replace(/^data:image\/jpeg;base64,/, '');
    try {
      const r = await workApi.shot(projectId, sid, image, reason);
      lastShotRef.current = Date.now();
      if (!r.data?.data?.duplicate) qc.invalidateQueries({ queryKey: ['work-state', projectId] });
    } catch (e: any) {
      if (reason === 'MANUAL') toast({ title: 'Screenshot not saved', description: errText(e, 'Try again'), variant: 'destructive' });
    }
  }, [projectId, qc]);

  const frame = useCallback((reason: 'CHANGE' | 'MANUAL' | 'HEARTBEAT' | 'NOTE' | 'STOP') => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return false;
    const w = Math.min(1280, v.videoWidth);
    const c = document.createElement('canvas');
    c.width = w; c.height = Math.round((v.videoHeight / v.videoWidth) * w);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    void post(c, reason);
    return true;
  }, [post]);

  const look = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const small = document.createElement('canvas');
    small.width = 64; small.height = 36;
    const ctx = small.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, 64, 36);
    const px = ctx.getImageData(0, 0, 64, 36).data;
    const prev = prevRef.current;
    prevRef.current = px;
    const sinceLast = Date.now() - lastShotRef.current;
    if (!prev) { frame('CHANGE'); return; } // the first picture of a share
    let changed = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (Math.abs(px[i] - prev[i]) + Math.abs(px[i + 1] - prev[i + 1]) + Math.abs(px[i + 2] - prev[i + 2]) > 60) changed++;
    }
    if (changed / (px.length / 4) > CHANGED_PIXELS && sinceLast >= MIN_GAP_MS) frame('CHANGE');
    else if (sinceLast >= SIGN_OF_LIFE_MS) frame('HEARTBEAT');
  }, [frame]);

  const postShare = useCallback((st: 'STARTED' | 'STOPPED' | 'DENIED' | 'REJECTED', surface?: string) => {
    const sid = sessionRef.current;
    if (sid) workApi.share(projectId, sid, st, surface ?? null).then(() => refresh()).catch(() => undefined); // the evidence badge changes at once
  }, [projectId, refresh]);

  const endShare = useCallback((announce: boolean) => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    streamRef.current = null;
    prevRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSharing(false);
    if (announce) postShare('STOPPED');
  }, [postShare]);

  // Ask the browser for the screen. Only the whole screen is asked for; what the person really chose is checked afterwards.
  const askScreen = useCallback(async (): Promise<{ stream: MediaStream; surface: string } | null> => {
    setShareProblem(null);
    if (!navigator.mediaDevices?.getDisplayMedia) { toast({ title: 'Screen sharing is not available in this browser', variant: 'destructive' }); return null; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 2, displaySurface: 'monitor' }, audio: false,
        monitorTypeSurfaces: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'exclude',
      } as any);
      const surface = (stream.getVideoTracks()[0].getSettings() as any).displaySurface ?? 'monitor'; // a browser that does not say: taken as the whole screen
      return { stream, surface };
    } catch (e: any) {
      const why = e?.name === 'NotAllowedError' ? 'The sharing dialog was cancelled or the browser did not allow it.' : e?.name === 'NotFoundError' ? 'There is no screen to share.' : `The browser said: ${e?.name ?? 'unknown error'}.`;
      setShareProblem(`Screen sharing did not start. ${why}`);
      toast({ title: 'Screen sharing did not start', description: why, variant: 'destructive' });
      return null;
    }
  }, []);

  const notWholeScreen = () => {
    setShareProblem('Share the whole screen. A single window or browser tab is not accepted. In the sharing dialog choose "Entire screen" and press Share.');
    toast({ title: 'Share the whole screen', description: 'A single window or browser tab is not accepted. In the sharing dialog choose "Entire screen" and press Share.', variant: 'destructive' });
  };

  // run the capture on a stream that was already accepted
  const attach = useCallback(async (stream: MediaStream) => {
    streamRef.current = stream;
    const v = videoRef.current!;
    v.srcObject = stream;
    await v.play();
    stream.getVideoTracks()[0].onended = () => endShare(true); // the person stopped sharing from the browser bar
    prevRef.current = null;
    lastShotRef.current = 0;
    setSharing(true);
    timerRef.current = window.setInterval(look, LOOK_EVERY_MS);
  }, [endShare, look]);

  // share (again) while a session is running
  const startShare = useCallback(async (requireWhole: boolean) => {
    const got = await askScreen();
    if (!got) { postShare('DENIED'); return false; }
    if (requireWhole && got.surface !== 'monitor') {
      got.stream.getTracks().forEach((t) => t.stop());
      postShare('REJECTED');
      notWholeScreen();
      return false;
    }
    await attach(got.stream);
    postShare('STARTED', got.surface);
    setShareProblem(null);
    return true;
  }, [askScreen, attach, postShare]);

  // when the running session's counts change, the table below follows at once (not on its own timer)
  const liveShots = active?.shots ?? -1;
  const liveNotes = active?.notes ?? -1;
  useEffect(() => { if (liveShots >= 0) qc.invalidateQueries({ queryKey: ['work-sessions', projectId] }); }, [liveShots, liveNotes, projectId, qc]);

  // a sign of life every minute while a session is open; the clock for the running time
  useEffect(() => {
    if (!activeId) return;
    const beat = window.setInterval(() => workApi.heartbeat(projectId, activeId).catch(() => refresh()), 60_000);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { window.clearInterval(beat); window.clearInterval(tick); };
  }, [activeId, projectId, refresh]);

  // leaving the page ends the sharing, and that is written down
  useEffect(() => () => { if (streamRef.current) endShare(true); }, [endShare]);
  // a session that ended elsewhere (closed as idle) stops the sharing too
  useEffect(() => { if (!activeId && streamRef.current) endShare(false); }, [activeId, endShare]);

  // ---- actions ----
  const start = async (link?: WorkLink) => {
    if (link) window.open(link.url, '_blank', 'noopener'); // inside the click, so the browser lets it open
    setBusy('start');
    try {
      const must = !!state?.requireShare;
      let got: { stream: MediaStream; surface: string } | null = null;
      if (must) {
        // no work without the screen: ask first, and only the whole screen is accepted
        got = await askScreen();
        if (!got) return;
        if (got.surface !== 'monitor') { got.stream.getTracks().forEach((t) => t.stop()); notWholeScreen(); return; }
      }
      const r = await workApi.start(projectId, { linkUrl: link?.url ?? null, linkLabel: link?.label ?? null, surface: got?.surface ?? null });
      sessionRef.current = r.data.data.id; // events and pictures need the id before the page has re-drawn
      await stateQ.refetch(); // show "Running" now, not after the screen-share dialog is answered
      setBusy(null);
      if (got) { await attach(got.stream); setShareProblem(null); } else await startShare(false);
      refresh();
    } catch (e: any) {
      toast({ title: 'Could not start', description: errText(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const stop = async () => {
    if (!activeId) return;
    setBusy('stop');
    try {
      if (streamRef.current) { frame('STOP'); await new Promise((r) => setTimeout(r, 600)); endShare(false); }
      await workApi.stop(projectId, activeId);
      toast({ title: 'Work stopped', description: 'Generate the KT when you are ready.' });
      refresh();
    } catch (e: any) {
      toast({ title: 'Could not stop', description: errText(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const saveNote = async () => {
    if (!activeId || !note.trim()) return;
    setBusy('note');
    try {
      await workApi.note(projectId, activeId, note.trim());
      setNote('');
      if (streamRef.current) frame('NOTE');
      refresh();
    } catch (e: any) {
      toast({ title: 'Note not saved', description: errText(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const openLink = (l: WorkLink) => { window.open(l.url, '_blank', 'noopener'); sendEvent(`Opened ${l.label} (${l.url})`); };

  const addPicture = async (file: File) => {
    if (!activeId) return;
    try {
      const bmp = await createImageBitmap(file);
      const w = Math.min(1280, bmp.width);
      const c = document.createElement('canvas');
      c.width = w; c.height = Math.round((bmp.height / bmp.width) * w);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      await post(c, 'MANUAL');
      refresh();
    } catch { toast({ title: 'That file is not a picture', variant: 'destructive' }); }
  };

  const generate = async () => {
    setBusy('kt');
    try {
      const r = await workApi.generateKt(projectId);
      const d = r.data.data;
      toast({ title: `Work KT version ${d.version} saved`, description: `${d.name} is in the Document Vault.` });
      qc.invalidateQueries({ queryKey: ['documents'] });
      refresh();
    } catch (e: any) {
      toast({ title: 'Could not generate the KT', description: errText(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  if (stateQ.isLoading) return <div className="h-40 animate-pulse rounded-lg bg-dbi-elevated" />;
  if (stateQ.isError || !state) return <p className="text-sm text-dbi-textSecondary">The work log could not be loaded.</p>;

  const links: WorkLink[] = state.links ?? [];
  const elapsed = active ? Math.max(0, Math.round((now - new Date(active.startedAt).getTime()) / 60000)) : 0;
  const pending = state.pending;
  const team = sessionsQ.data;

  return (
    <div className="space-y-4">
      <video ref={videoRef} muted playsInline className="hidden" data-testid="capture-video" />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Work on this project</CardTitle>
          {active ? <Badge className="bg-dbi-success/20 text-dbi-success">Running · {mins(elapsed)}</Badge> : <Badge variant="secondary">Not working</Badge>}
        </CardHeader>
        <CardContent className="space-y-4">
          {!active && (
            <>
              <p className="text-sm text-dbi-textSecondary">
                Start from the tool you work in. Your notes and screenshots are recorded while the work is running, and become the project's KT document.
                {state.requireShare
                  ? ' Screen sharing is required: you will be asked to share your whole screen, and a screenshot of the whole screen is saved whenever it changes, so close anything private before you start.'
                  : ' You will be asked to share your screen (optional); the screen is captured only when it changes.'}
              </p>
              {shareProblem && <p role="alert" className="rounded-md border border-dbi-critical/40 bg-dbi-critical/10 p-2 text-sm text-dbi-critical">{shareProblem}</p>}
              <div className="flex flex-wrap gap-2">
                {links.map((l) => (
                  <Button key={l.url} onClick={() => start(l)} disabled={busy !== null}>
                    {busy === 'start' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Start work in {l.label}
                  </Button>
                ))}
                <Button variant={links.length ? 'outline' : 'default'} onClick={() => start()} disabled={busy !== null}>
                  {busy === 'start' && !links.length ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Start work{links.length ? ' without a tool' : ''}
                </Button>
              </div>
              {links.length === 0 && <p className="text-xs text-dbi-textSecondary">No work link was set for this project. The project owner can add the tools in Edit Project.</p>}
            </>
          )}

          {active && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm text-dbi-textSecondary">
                Started {formatDateTimeIST(active.startedAt)}{active.linkLabel ? ` in ${active.linkLabel}` : ''}
                <Badge variant="secondary">{active.notes} note{active.notes === 1 ? '' : 's'}</Badge>
                <Badge variant="secondary">{active.shots} screenshot{active.shots === 1 ? '' : 's'}</Badge>
                {sharing
                  ? <Badge className="bg-dbi-success/20 text-dbi-success">Screen is being shared</Badge>
                  : <Badge className="bg-dbi-warning/20 text-dbi-warning">Screen is not shared</Badge>}
              </div>
              {shareProblem && <p role="alert" className="rounded-md border border-dbi-critical/40 bg-dbi-critical/10 p-2 text-sm text-dbi-critical">{shareProblem}</p>}
              {!sharing && (
                <p className="rounded-md border border-dbi-warning/40 bg-dbi-warning/10 p-2 text-sm text-dbi-warning">
                  Your screen is not being shared, so this work has {active.evidence === 'NONE' ? 'no' : 'only partial'} screen evidence. Press "Share screen" and choose the whole screen.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {links.map((l) => (
                  <Button key={l.url} variant="outline" size="sm" onClick={() => openLink(l)}><ExternalLink className="mr-1 h-4 w-4" />Open {l.label}</Button>
                ))}
                {!sharing
                  ? <Button size="sm" variant="outline" onClick={() => void startShare(!!state?.requireShare)}><MonitorUp className="mr-1 h-4 w-4" />Share screen</Button>
                  : <Button size="sm" variant="outline" onClick={() => endShare(true)}><StopCircle className="mr-1 h-4 w-4" />Stop sharing</Button>}
                <Button size="sm" variant="outline" onClick={() => (sharing ? frame('MANUAL') : fileRef.current?.click())}><Camera className="mr-1 h-4 w-4" />Add screenshot</Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="shot-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addPicture(f); }} />
                <Button size="sm" variant="destructive" onClick={stop} disabled={busy !== null}>
                  {busy === 'stop' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Square className="mr-1 h-4 w-4" />}Stop work
                </Button>
              </div>
              <div>
                <Textarea aria-label="Work note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do? Write it here (for example: checked the 12 site health scores in the dashboard)" rows={3} maxLength={5000} />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" onClick={saveNote} disabled={!note.trim() || busy !== null}>Save note</Button>
                </div>
              </div>
              {active.notesList?.length > 0 && (
                <ul className="space-y-2">
                  {active.notesList.map((n: any) => (
                    <li key={n.id} className="rounded-md border border-dbi-border p-2 text-sm">
                      <span className="text-xs text-dbi-textSecondary">{formatDateTimeIST(n.createdAt)}</span>
                      <p className="whitespace-pre-wrap text-dbi-textPrimary">{n.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Work KT</CardTitle>
          <Button onClick={generate} disabled={busy !== null || !!active || pending.sessions === 0}>
            {busy === 'kt' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Generate KT
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-dbi-textSecondary">
          {active
            ? 'Stop the running work first, then generate the KT.'
            : pending.sessions === 0
              ? 'Nothing new to put in a KT. Start work, write notes, stop, then generate.'
              : `${pending.sessions} finished session${pending.sessions === 1 ? '' : 's'} with ${pending.notes} note${pending.notes === 1 ? '' : 's'} and ${pending.shots} screenshot${pending.shots === 1 ? '' : 's'} will become the next version of your Work KT in the Document Vault.`}
          <p className="mt-1 text-xs">Every time you generate, the same document gets a new version (v1, v2, v3...), named with the project.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{team?.canSeeAll ? 'Work sessions of the team' : 'My work sessions'}</CardTitle></CardHeader>
        <CardContent>
          {!team || team.items.length === 0 ? (
            <p className="text-sm text-dbi-textSecondary">No work has been recorded on this project yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dbi-border text-left text-xs text-dbi-textSecondary">
                    <th className="py-2 pr-3">Person</th><th className="pr-3">Started</th><th className="pr-3">Length</th><th className="pr-3">Tool</th><th className="pr-3">Notes</th><th className="pr-3">Pictures</th><th className="pr-3">Evidence</th><th className="pr-3">Tool on screen</th><th className="pr-3">Status</th><th />
                  </tr>
                </thead>
                <tbody>
                  {team.items.map((s: any) => (
                    <tr key={s.id} className="border-b border-dbi-border/60">
                      <td className="py-2 pr-3 text-dbi-textPrimary">{s.userName ?? ''}</td>
                      <td className="pr-3">{formatDateTimeIST(s.startedAt)}</td>
                      <td className="pr-3">{mins(s.minutes)}</td>
                      <td className="pr-3">{s.linkLabel ?? '-'}</td>
                      <td className="pr-3">{s.notes}</td>
                      <td className="pr-3">{s.shots}</td>
                      <td className="pr-3"><EvidenceBadge level={s.evidence} /></td>
                      <td className="pr-3"><ToolBadge s={s} /></td>
                      <td className="pr-3">
                        {!s.endedAt ? <Badge className="bg-dbi-success/20 text-dbi-success">Running</Badge>
                          : s.endReason === 'IDLE' ? <Badge className="bg-dbi-warning/20 text-dbi-warning">Ended idle</Badge>
                            : <Badge variant="secondary">Stopped</Badge>}
                        {s.inKt && <Badge variant="secondary" className="ml-1">In KT</Badge>}
                      </td>
                      <td><Button variant="ghost" size="sm" onClick={() => setOpenSession(s.id)}>View</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-dbi-textSecondary"><b>Evidence</b>: how well the screen backs the session (Full = the whole screen was shared the whole time; Partial = sharing was cut or only a window was shared; No evidence = never shared). <b>Tool on screen</b>: how many screenshots show the tool's web address, read at night (a hint, not proof). The numbers in brackets are screenshots that show it / screenshots read.</p>
          <p className="mt-2 text-xs text-dbi-textSecondary">Screenshots are deleted after the retention period; the notes and the generated KT stay. Documents made here are in the <Link className="underline" to={`/documents?projectId=${projectId}`}>Document Vault</Link>.</p>
        </CardContent>
      </Card>

      <SessionDialog projectId={projectId} sessionId={openSession} onClose={() => setOpenSession(null)} />
    </div>
  );
}

function SessionDialog({ projectId, sessionId, onClose }: { projectId: string; sessionId: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['work-session', projectId, sessionId], enabled: !!sessionId, queryFn: async () => (await workApi.session(projectId, sessionId!)).data.data });
  const s = q.data;
  return (
    <Dialog open={!!sessionId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{s ? `${s.userName ?? 'Work session'} - ${formatDateTimeIST(s.startedAt)}` : 'Work session'}</DialogTitle>
          <DialogDescription>{s ? `${mins(s.minutes)}${s.linkLabel ? ` in ${s.linkLabel}` : ''}. Everything recorded in this session, in order.` : 'Loading...'}</DialogDescription>
          {s && <div className="flex flex-wrap gap-2"><EvidenceBadge level={s.evidence} /><ToolBadge s={s} /></div>}
        </DialogHeader>
        {q.isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin" />}
        {s && (
          <ul className="space-y-3">
            {s.entries.map((e: any) => (
              <li key={e.id} className="rounded-md border border-dbi-border p-2 text-sm">
                <p className="text-xs text-dbi-textSecondary">{formatDateTimeIST(e.createdAt)} · {e.kind === 'SHOT' ? `Screenshot${e.reason ? ` (${String(e.reason).toLowerCase()})` : ''}` : e.kind === 'NOTE' ? 'Note' : 'Event'}</p>
                {e.kind === 'SHOT'
                  ? e.previewUrl
                    ? <a href={e.previewUrl} target="_blank" rel="noreferrer"><img src={e.previewUrl} alt="Screenshot" className="mt-1 max-h-64 rounded border border-dbi-border" /></a>
                    : <p className="text-dbi-textSecondary">The picture was deleted after the retention period.</p>
                  : <p className={`whitespace-pre-wrap ${e.kind === 'EVENT' && /stopped|not allowed|ended/i.test(e.text ?? '') ? 'text-dbi-warning' : 'text-dbi-textPrimary'}`}>{e.text}</p>}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
