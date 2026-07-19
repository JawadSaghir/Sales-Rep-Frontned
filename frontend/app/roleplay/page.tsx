'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { startSession, type StartSessionResult } from '../../lib/api';

type Msg = { name: string; text: string; time: string; align: string; nameColor: string; bg: string; border: string };

function labelFromSlug(slug: string, fallback: string): string {
  if (!slug) return fallback;
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function RoleplayInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [messages] = useState<Msg[]>([]);
  const [speaking, setSpeaking] = useState<'idle' | 'ai' | 'rep'>('idle');
  const [muted, setMuted] = useState(false);
  const [callStarted, setCallStarted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);

  const [session, setSession] = useState<StartSessionResult | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const repSlug = searchParams.get('rep_slug') ?? '';
  const callTypeSlug = searchParams.get('call_type') ?? '';
  const personaSlug = searchParams.get('persona_slug') ?? '';
  const difficulty = searchParams.get('difficulty') ?? '';
  const repLabel = labelFromSlug(repSlug, 'Trainee');
  const callTypeLabel = labelFromSlug(callTypeSlug, 'Roleplay Call');
  const personaLabel = labelFromSlug(personaSlug, '');

  const glRef = useRef<{ gl: WebGLRenderingContext; prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> } | null>(null);
  const energyRef = useRef(0);
  const pitchRef = useRef(0);
  const stateRef = useRef({ speaking: 'idle' as string, muted: false, callEnded: false });
  const audioRef = useRef<{ analyser?: AnalyserNode; freq?: Uint8Array; time?: Uint8Array; hasMic: boolean }>({ hasMic: false });

  useEffect(() => { stateRef.current = { speaking, muted, callEnded }; }, [speaking, muted, callEnded]);

  useEffect(() => {
    initGL();
    initAudio();
    let raf: number;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      renderFrame(ts);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!repSlug || !callTypeSlug || !personaSlug || !difficulty) {
      setSessionError('Missing call setup — go back and select a rep, call type, persona, and difficulty.');
      setSessionLoading(false);
      return;
    }
    let cancelled = false;
    setSessionLoading(true);
    setSessionError(null);
    startSession({ rep_slug: repSlug, call_type: callTypeSlug, persona_slug: personaSlug, difficulty })
      .then(result => {
        if (cancelled) return;
        setSession(result);
        setElapsedMs(0);
        setCallStarted(true);
        setCallEnded(false);
        setSpeaking('idle');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSessionError(e instanceof Error ? e.message : 'Failed to start session');
      })
      .finally(() => {
        if (!cancelled) setSessionLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repSlug, callTypeSlug, personaSlug, difficulty]);

  useEffect(() => {
    if (!callStarted || callEnded) return;
    const timer = setInterval(() => setElapsedMs(ms => ms + 1000), 1000);
    return () => clearInterval(timer);
  }, [callStarted, callEnded]);

  useEffect(() => { if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight; }, [messages]);

  async function initAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      audioRef.current = { analyser, freq: new Uint8Array(analyser.frequencyBinCount), time: new Uint8Array(analyser.fftSize), hasMic: true };
    } catch { audioRef.current.hasMic = false; }
  }

  function readAudio() {
    const a = audioRef.current;
    if (a.hasMic && a.analyser && a.time && a.freq) {
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
    return { energy: Math.max(0, base + wob + (isSpeaking ? Math.random() * 0.18 : Math.random() * 0.03)), pitch: 0.3 + 0.2 * Math.sin(performance.now() * 0.0013) };
  }

  function endCall() {
    if (!callStarted || callEnded) return;
    setCallEnded(true); setSpeaking('idle');
    router.push('/?tab=analytics');
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
    if (!stateRef.current.muted) { const a = readAudio(); energy = a.energy; pitch = a.pitch; }
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
  const speakingLabel = sessionLoading ? 'Connecting…' : callEnded ? 'Call ended' : speaking === 'ai' ? 'AI Coach speaking' : speaking === 'rep' ? `${repLabel} speaking` : 'Listening…';
  const speakingLabelColor = speaking === 'ai' ? '#7fb0ff' : speaking === 'rep' ? '#5fd0a8' : '#8a94a6';
  const disabled = !callStarted || callEnded;

  if (sessionLoading) {
    return (
      <div style={centerScreenStyle}>
        <div style={{ fontSize: 14, color: '#5b6270' }}>Connecting call…</div>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div style={centerScreenStyle}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#c0392b', marginBottom: 8 }}>Couldn't start the call</div>
        <div style={{ fontSize: 12.5, color: '#6b7280', maxWidth: 360, textAlign: 'center', marginBottom: 18 }}>{sessionError ?? 'Unknown error starting the session.'}</div>
        <button onClick={() => router.push('/')} style={{ background: '#14161b', border: 'none', color: '#fff', padding: '11px 22px', borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Back to dashboard</button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: '#fff', color: '#1a1d24', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px', borderBottom: '1px solid #e6e8ec', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, border: '1px solid #dde1e8', background: '#fff', cursor: 'pointer' }}>‹</button>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(160deg,#eef1f6,#e3e7ee)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #dde1e8', fontSize: 16, fontWeight: 600, color: '#7fb0ff' }}>{repLabel.charAt(0)}</div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: '#14161b' }}>{callTypeLabel}{personaLabel ? ` — ${personaLabel}` : ''}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Trainee: {repLabel}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: callEnded ? '#8a94a6' : speaking !== 'idle' ? '#5fd0a8' : '#f5c95d' }} />
            <span style={{ fontSize: 12.5, color: '#5b6270', minWidth: 118 }}>{callEnded ? 'Call ended' : speaking === 'ai' ? 'AI Coach speaking' : speaking === 'rep' ? 'Rep speaking' : 'Listening'}</span>
          </div>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 15, color: '#14161b', background: '#f3f4f7', border: '1px solid #dde1e8', padding: '6px 12px', borderRadius: 8 }}>{elapsedText}</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: '42%', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, background: '#fff', borderRight: '1px solid #e6e8ec', padding: '32px 24px' }}>
          <canvas ref={canvasRef} style={{ width: 'min(70%,420px)', height: 'min(70%,420px)', aspectRatio: '1/1', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: speakingLabelColor }}>{speakingLabel}</div>
              <div style={{ fontSize: 11.5, color: '#8a94a6' }}>Orb responds to live voice energy</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={endCall} disabled={disabled} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#e14b4b', border: '1px solid #e14b4b', color: '#fff', padding: '11px 20px', borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>End Call</button>
              <button onClick={() => setMuted(m => !m)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: muted ? '#fdeaea' : '#f3f4f7', border: '1px solid #dde1e8', color: muted ? '#c93636' : '#3b3f47', padding: '11px 16px', borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{muted ? 'Unmute' : 'Mute'}</button>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e6e8ec', minWidth: 0 }}>
          <div style={{ padding: '14px 24px', borderBottom: '1px solid #e6e8ec', fontSize: 11.5, fontWeight: 600, letterSpacing: '.6px', color: '#6b7280', textTransform: 'uppercase', flexShrink: 0 }}>Live Transcript</div>
          <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.length === 0 && (
              <div style={{ fontSize: 12.5, color: '#8a94a6', textAlign: 'center', marginTop: 24 }}>Waiting for the conversation to begin…</div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '82%', alignSelf: msg.align as any }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: msg.nameColor }}>{msg.name}</span>
                  <span style={{ fontSize: 10.5, color: '#9aa2b0', fontFamily: 'ui-monospace,monospace' }}>{msg.time}</span>
                </div>
                <div style={{ background: msg.bg, border: `1px solid ${msg.border}`, padding: '10px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.5, color: '#22252c' }}>{msg.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {callEnded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '16px 28px', borderTop: '1px solid #e6e8ec', flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, color: '#6b7280', marginRight: 'auto' }}>Call ended · {elapsedText} total</span>
        </div>
      )}
    </div>
  );
}

const centerScreenStyle: React.CSSProperties = { height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff' };

export default function Roleplay() {
  return (
    <Suspense fallback={null}>
      <RoleplayInner />
    </Suspense>
  );
}
