'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useLocalParticipant,
  useTranscriptions,
  useVoiceAssistant,
} from '@livekit/components-react';
import { startSession, type StartSessionResult } from '../../lib/api';
import { Icon } from '../../lib/icons';

function labelFromSlug(slug: string, fallback: string): string {
  if (!slug) return fallback;
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Everything below <LiveKitRoom>. Must be a child component: the LiveKit hooks
 * (useVoiceAssistant, useLocalParticipant, useTranscriptions) read from the room
 * context that <LiveKitRoom> provides, so they cannot run in the parent.
 */
function CallStage({
  repLabel, callTypeLabel, personaLabel, onLeave,
}: { repLabel: string; callTypeLabel: string; personaLabel: string; onLeave: () => void }) {
  const { state: agentState, audioTrack } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const transcriptions = useTranscriptions();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [callEnded, setCallEnded] = useState(false);

  const muted = !isMicrophoneEnabled;
  const agentSpeaking = agentState === 'speaking';
  const repSpeaking = !!localParticipant?.isSpeaking;
  const speaking: 'idle' | 'ai' | 'rep' = agentSpeaking ? 'ai' : repSpeaking ? 'rep' : 'idle';

  // Visualise whoever is talking: the agent's track while it speaks, else the mic.
  const mediaStream = useMemo(() => {
    const track = agentSpeaking
      ? audioTrack?.publication?.track?.mediaStreamTrack
      : localParticipant?.getTrackPublications().find(p => p.kind === 'audio')?.track?.mediaStreamTrack;
    return track ? new MediaStream([track]) : null;
  }, [agentSpeaking, audioTrack, localParticipant, isMicrophoneEnabled]);

  const glRef = useRef<{ gl: WebGLRenderingContext; prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> } | null>(null);
  const energyRef = useRef(0);
  const pitchRef = useRef(0);
  const stateRef = useRef({ speaking: 'idle' as string, muted: false, callEnded: false });
  const audioRef = useRef<{ ctx?: AudioContext; analyser?: AnalyserNode; src?: MediaStreamAudioSourceNode; freq?: Uint8Array; time?: Uint8Array }>({});

  useEffect(() => { stateRef.current = { speaking, muted, callEnded }; }, [speaking, muted, callEnded]);

  // Attach the analyser to whichever stream is currently active.
  useEffect(() => {
    const a = audioRef.current;
    a.src?.disconnect();
    a.src = undefined;
    if (!mediaStream || mediaStream.getAudioTracks().length === 0) return;
    const ctx = a.ctx ?? new AudioContext();
    a.ctx = ctx;
    const analyser = a.analyser ?? ctx.createAnalyser();
    analyser.fftSize = 1024;
    a.analyser = analyser;
    a.freq = new Uint8Array(analyser.frequencyBinCount);
    a.time = new Uint8Array(analyser.fftSize);
    try {
      a.src = ctx.createMediaStreamSource(mediaStream);
      a.src.connect(analyser);
    } catch { /* stream ended between render and attach */ }
    return () => { a.src?.disconnect(); a.src = undefined; };
  }, [mediaStream]);

  useEffect(() => {
    initGL();
    let raf: number;
    const loop = (ts: number) => { raf = requestAnimationFrame(loop); renderFrame(ts); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (callEnded) return;
    const timer = setInterval(() => setElapsedMs(ms => ms + 1000), 1000);
    return () => clearInterval(timer);
  }, [callEnded]);

  useEffect(() => { if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight; }, [transcriptions]);

  function readAudio() {
    const a = audioRef.current;
    if (a.analyser && a.time && a.freq) {
      a.analyser.getByteTimeDomainData(a.time);
      let sum = 0;
      for (let i = 0; i < a.time.length; i++) { const v = (a.time[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / a.time.length);
      a.analyser.getByteFrequencyData(a.freq);
      let maxV = 0, maxI = 0;
      for (let i = 0; i < a.freq.length; i++) { if (a.freq[i] > maxV) { maxV = a.freq[i]; maxI = i; } }
      return { energy: Math.min(1, rms * 3.2), pitch: maxI / a.freq.length };
    }
    const isSpeaking = stateRef.current.speaking !== 'idle';
    const base = isSpeaking ? 0.45 : 0.06;
    const wob = Math.sin(performance.now() * 0.006) * 0.15 + Math.sin(performance.now() * 0.021) * 0.1;
    return { energy: Math.max(0, base + wob), pitch: 0.3 + 0.2 * Math.sin(performance.now() * 0.0013) };
  }

  async function toggleMute() {
    if (!localParticipant) return;
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }

  function endCall() {
    if (callEnded) return;
    setCallEnded(true);
    onLeave();
  }

  function initGL() {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
      glRef.current?.gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return;
    const vsSrc = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos,0.,1.); }`;
    const fsSrc = `precision highp float;
      uniform vec2 uResolution; uniform float uTime; uniform float uEnergy; uniform float uPitch; uniform float uState;
      mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
      float map(vec3 p, float spd){
        p.xz *= rot(uTime*0.03*spd);
        vec3 q = p*2.;
        return length(p)*log(length(p)+1.) + sin(q.x+sin(q.z+sin(q.y)))*0.5 - 1.;
      }
      void main(){
        vec2 res = uResolution;
        vec2 p = (gl_FragCoord.xy - 0.5*res)/min(res.x,res.y);
        vec3 cl = vec3(0.);
        float d = 2.5;
        float amp = 0.55 + 1.6*uEnergy;
        float spd = 0.7 + 0.6*uPitch;
        for(int i=0;i<6;i++){
          vec3 p3d = vec3(0,0,5.) + normalize(vec3(p,-1.))*d;
          float rz = map(p3d, spd)/amp;
          float f = clamp((rz - map(p3d+.1, spd)/amp)*0.5, -.1, 1.);
          vec3 baseColor;
          if(uState > 1.5){ baseColor = vec3(0.05,0.3,0.12) + vec3(2.0,5.0,1.6)*f; }
          else if(uState > 0.5){ baseColor = vec3(0.05,0.18,0.5) + vec3(3.6,2.2,5.5)*f; }
          else { baseColor = vec3(0.08,0.28,0.38) + vec3(4.2,2.6,3.4)*f; }
          cl = cl*baseColor + smoothstep(2.5,.0,rz)*.7*baseColor;
          d += min(rz, 1.);
        }
        vec2 center = res*0.5;
        float dist = distance(gl_FragCoord.xy, center);
        float radius = min(res.x,res.y)*0.5;
        float breathe = 0.5+0.5*sin(uTime*0.5);
        float innerR = radius*(0.05 + 0.35*breathe);
        float outerR = radius*(0.4 + 0.55*breathe);
        float centerDim = smoothstep(innerR, outerR, dist);
        vec4 fragColor = vec4(cl,1.0);
        fragColor.rgb = mix(fragColor.rgb*0.3, fragColor.rgb, centerDim);
        if(dist > radius){ fragColor = vec4(0.0); }
        gl_FragColor = fragColor;
      }`;
    const compile = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {
      res: gl.getUniformLocation(prog, 'uResolution'), time: gl.getUniformLocation(prog, 'uTime'),
      energy: gl.getUniformLocation(prog, 'uEnergy'), pitch: gl.getUniformLocation(prog, 'uPitch'), state: gl.getUniformLocation(prog, 'uState'),
    };
    glRef.current = { gl, prog, u };
    window.addEventListener('resize', resize); resize();
  }

  function renderFrame(ts: number) {
    const ref = glRef.current; if (!ref) return;
    const { gl, prog, u } = ref;
    let energy = 0, pitch = 0.3;
    // Muting silences the rep's own contribution, never the agent's voice.
    const silenced = stateRef.current.muted && stateRef.current.speaking !== 'ai';
    if (!silenced) { const a = readAudio(); energy = a.energy; pitch = a.pitch; }
    energyRef.current += (energy - energyRef.current) * 0.15;
    pitchRef.current += (pitch - pitchRef.current) * 0.1;
    gl.useProgram(prog);
    gl.uniform2f(u.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u.time, ts * 0.00025);
    gl.uniform1f(u.energy, stateRef.current.callEnded ? 0.02 : energyRef.current);
    gl.uniform1f(u.pitch, pitchRef.current);
    const stNum = stateRef.current.speaking === 'ai' ? 1 : stateRef.current.speaking === 'rep' ? 2 : 0;
    gl.uniform1f(u.state, stateRef.current.callEnded ? 0 : stNum);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const mins = Math.floor(elapsedMs / 60000), secs = Math.floor((elapsedMs % 60000) / 1000);
  const elapsedText = `${mins}:${String(secs).padStart(2, '0')}`;
  const statusText = callEnded ? 'Call ended'
    : agentState === 'connecting' || agentState === 'disconnected' ? 'Waiting for the prospect…'
    : agentSpeaking ? 'Prospect speaking'
    : agentState === 'thinking' ? 'Prospect thinking…'
    : repSpeaking ? `${repLabel} speaking` : 'Listening…';
  const AI_COLOR = '#3b82f6';
  const REP_COLOR = 'var(--success)';
  const statusColor = agentSpeaking ? AI_COLOR : repSpeaking ? '#0f9d8f' : 'var(--ink-mute)';
  const dotClass = callEnded ? 'off' : speaking !== 'idle' ? 'on' : 'idle';

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--ink)', overflow: 'hidden' }}>
      {/* Plays the agent's audio. Without this you hear nothing. */}
      <RoomAudioRenderer />

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" className="icon-btn" aria-label="End call and go back" onClick={endCall}>
            <Icon name="chevron-left" size={18} />
          </button>
          <div className="avatar" style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(155deg,var(--deep-1),var(--deep-2))', color: '#fff', fontSize: 15 }}>
            {repLabel.charAt(0)}
          </div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>
              {callTypeLabel}{personaLabel ? ` — ${personaLabel}` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 2 }}>Trainee: {repLabel}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`live-dot ${dotClass}`} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-soft)', minWidth: 150 }}>{statusText}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-mono)', fontSize: 14.5, fontWeight: 600, color: 'var(--ink)', background: 'var(--surface-inset)', border: '1px solid var(--line)', padding: '6px 12px', borderRadius: 8 }}>
            <Icon name="clock" size={14} style={{ color: 'var(--ink-mute)' }} />
            {elapsedText}
          </div>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: '42%', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, background: 'var(--surface)', padding: '32px 24px' }}>
          <canvas ref={canvasRef} style={{ width: 'min(70%,420px)', height: 'min(70%,420px)', aspectRatio: '1/1', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: statusColor }}>{statusText}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-mute)' }}>The orb responds to live voice energy.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" className="btn btn-danger" onClick={endCall} disabled={callEnded}>
                <Icon name="phone-off" size={16} /> End Call
              </button>
              <button type="button" className={`btn ${muted ? 'btn-danger' : 'btn-ghost'}`} onClick={toggleMute} aria-pressed={muted}>
                <Icon name={muted ? 'mic-off' : 'mic'} size={16} /> {muted ? 'Unmute' : 'Mute'}
              </button>
              {/* Browsers block autoplay until a gesture; this unblocks sound. */}
              <StartAudio label="Enable sound" className="btn btn-ghost" />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--line)', minWidth: 0, background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 24px', borderBottom: '1px solid var(--line)', flexShrink: 0, background: 'var(--surface)' }}>
            <span className="live-dot idle" />
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.6px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Live Transcript</span>
          </div>
          <div ref={transcriptRef} className="scroll-y" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {transcriptions.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-mute)', textAlign: 'center', marginTop: 24 }}>Waiting for the conversation to begin…</div>
            )}
            {transcriptions.map((t, i) => {
              const isLocal = t.participantInfo.identity === localParticipant?.identity;
              return (
                <div key={t.streamInfo.id ?? i} className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '82%', alignSelf: isLocal ? 'flex-end' : 'flex-start' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: isLocal ? REP_COLOR : AI_COLOR }}>{isLocal ? repLabel : personaLabel || 'Prospect'}</span>
                  <div style={{ background: 'var(--surface)', border: `1px solid ${isLocal ? '#c9ece1' : '#d5e3fb'}`, borderLeft: `3px solid ${isLocal ? '#0f9d8f' : AI_COLOR}`, padding: '10px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink)', boxShadow: 'var(--shadow-xs)' }}>{t.text}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleplayInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [session, setSession] = useState<StartSessionResult | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  // Starting a session is not idempotent — each POST creates a LiveKit room AND
  // dispatches an agent worker job. React StrictMode runs effects twice in dev,
  // which would spawn two rooms and two agents per call, so guard the request.
  const startedRef = useRef(false);

  const repSlug = searchParams.get('rep_slug') ?? '';
  const callTypeSlug = searchParams.get('call_type') ?? '';
  const personaSlug = searchParams.get('persona_slug') ?? '';
  const difficulty = searchParams.get('difficulty') ?? '';
  const repLabel = labelFromSlug(repSlug, 'Trainee');
  const callTypeLabel = labelFromSlug(callTypeSlug, 'Roleplay Call');
  const personaLabel = labelFromSlug(personaSlug, '');

  useEffect(() => {
    if (!repSlug || !callTypeSlug || !personaSlug || !difficulty) {
      setSessionError('Missing call setup — go back and select a rep, call type, persona, and difficulty.');
      setSessionLoading(false);
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    setSessionLoading(true);
    setSessionError(null);
    // Deliberately NO `cancelled` flag. Under StrictMode the first effect's
    // cleanup runs before the request resolves, so a cancelled-guard would
    // discard the only response we ever get (the ref guard stops the second run
    // from issuing another) — the room would be created but never joined.
    startSession({ rep_slug: repSlug, call_type: callTypeSlug, persona_slug: personaSlug, difficulty })
      .then(result => setSession(result))
      .catch((e: unknown) => setSessionError(e instanceof Error ? e.message : 'Failed to start session'))
      .finally(() => setSessionLoading(false));
  }, [repSlug, callTypeSlug, personaSlug, difficulty]);

  if (sessionLoading) {
    return (
      <div style={centerScreenStyle}>
        <div className="live-dot on" style={{ marginBottom: 14 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-soft)' }}>Connecting call…</div>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div style={centerScreenStyle}>
        <div className="empty-icon" style={{ marginBottom: 16 }}>
          <Icon name="phone-off" size={26} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--brand-ink)', marginBottom: 8 }}>Couldn&apos;t start the call</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-mute)', maxWidth: 360, textAlign: 'center', marginBottom: 18 }}>{sessionError ?? 'Unknown error starting the session.'}</div>
        <button type="button" className="btn btn-dark" onClick={() => router.push('/')}>
          <Icon name="chevron-left" size={15} /> Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <LiveKitRoom serverUrl={session.livekit_url} token={session.token} connect audio video={false}>
      <CallStage
        repLabel={repLabel}
        callTypeLabel={callTypeLabel}
        personaLabel={personaLabel}
        onLeave={() => router.push('/?tab=analytics')}
      />
    </LiveKitRoom>
  );
}

const centerScreenStyle: React.CSSProperties = { height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)' };

export default function Roleplay() {
  return (
    <Suspense fallback={null}>
      <RoleplayInner />
    </Suspense>
  );
}
