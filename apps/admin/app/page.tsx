'use client';

/**
 * De beheerdersconsole (sprint 4): quarantainewachtrij, herstellen,
 * verwijderen en gebruiker blokkeren — precies de vier handelingen uit
 * ADR 0008, niets meer.
 *
 * De console draait op een gewoon moderatoraccount (e-mail + wachtwoord,
 * profiles.trust_level >= 3). Alles loopt via RLS en de RPC's; er is géén
 * service_role-key in deze code en dat moet zo blijven (docs/07).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import {
  errorText,
  parseApiError,
  FLAG_REASON_NL,
  type FlagReason,
  type LitterSize,
  type ReportKind,
} from '@civiceye/shared';

interface QueueRij {
  report_id: string;
  kind: ReportKind;
  size: LitterSize | null;
  lat: number;
  lng: number;
  note: string | null;
  status: string;
  flag_count: number;
  photo_count: number;
  created_by: string;
  created_at: string;
  flags: { reason: FlagReason; detail: string | null; created_at: string }[];
}

const SIZE_NL: Record<string, string> = {
  piece: 'papiertje',
  bag: 'afvalzak',
  heap: 'afvalhoop',
};

function uurGeleden(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

export default function Console() {
  // Zonder configuratie meteen zeggen wát er ontbreekt, in plaats van een
  // kapotte loginpagina.
  const supabase = useMemo<SupabaseClient | null>(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  const [sessie, setSessie] = useState<Session | null>(null);
  const [klaarMetLaden, setKlaarMetLaden] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSessie(data.session);
      setKlaarMetLaden(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_gebeurtenis, nieuweSessie) => {
      setSessie(nieuweSessie);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  if (!supabase) {
    return (
      <Kader>
        <h1>Configuratie ontbreekt</h1>
        <p>
          Kopieer <code>.env.example</code> naar <code>.env.local</code> en vul
          <code> NEXT_PUBLIC_SUPABASE_URL</code> en <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in.
        </p>
      </Kader>
    );
  }
  if (!klaarMetLaden) return <Kader>…</Kader>;
  if (!sessie) return <Login supabase={supabase} />;
  return <Wachtrij supabase={supabase} email={sessie.user.email ?? ''} />;
}

function Login({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const aanmelden = async () => {
    setBezig(true);
    setFout(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord });
    if (error) setFout('Aanmelden mislukt. Controleer e-mail en wachtwoord.');
    setBezig(false);
  };

  return (
    <Kader>
      <h1>CivicEye — moderatie</h1>
      <p style={{ color: '#5b6b7a' }}>
        Meld aan met een moderatoraccount. Accounts maak je in het Supabase-dashboard
        (Authentication → Users) en promoveer je met{' '}
        <code>update profiles set trust_level = 3 where id = &lt;uuid&gt;</code>.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void aanmelden();
        }}
        style={{ display: 'grid', gap: 8, maxWidth: 360 }}
      >
        <input
          style={veld}
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
        <input
          style={veld}
          type="password"
          placeholder="Wachtwoord"
          value={wachtwoord}
          onChange={(e) => setWachtwoord(e.target.value)}
          autoComplete="current-password"
        />
        <button style={primair} disabled={bezig} type="submit">
          {bezig ? 'Bezig…' : 'Aanmelden'}
        </button>
        {fout ? <p style={{ color: '#c0392b' }}>{fout}</p> : null}
      </form>
    </Kader>
  );
}

function Wachtrij({ supabase, email }: { supabase: SupabaseClient; email: string }) {
  const [rijen, setRijen] = useState<QueueRij[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezigMet, setBezigMet] = useState<string | null>(null);

  const laad = useCallback(async () => {
    const { data, error } = await supabase.rpc('moderation_queue');
    if (error) {
      const parsed = parseApiError(error);
      setFout(
        parsed.code === 'forbidden'
          ? 'Dit account is geen moderator (trust_level < 3).'
          : errorText(parsed.code, parsed.detail),
      );
      setRijen([]);
      return;
    }
    setFout(null);
    setRijen((data ?? []) as QueueRij[]);
  }, [supabase]);

  useEffect(() => {
    void laad();
  }, [laad]);

  const handel = async (
    rij: QueueRij,
    actie: 'restore' | 'remove' | 'block',
    bevestiging: string,
  ) => {
    if (!window.confirm(bevestiging)) return;
    setBezigMet(rij.report_id);
    try {
      if (actie === 'block') {
        const { error } = await supabase.rpc('block_user', {
          p_user_id: rij.created_by,
          p_days: 30,
          p_reason: 'via console',
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('moderate_report', {
          p_report_id: rij.report_id,
          p_action: actie,
          p_reason: 'via console',
        });
        if (error) throw error;
      }
      await laad();
    } catch (e) {
      const parsed = parseApiError(e);
      setFout(errorText(parsed.code, parsed.detail));
    } finally {
      setBezigMet(null);
    }
  };

  return (
    <Kader breed>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Quarantainewachtrij</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <span style={{ color: '#5b6b7a', fontSize: 13 }}>{email}</span>
          <button style={secundair} onClick={() => void laad()}>
            Vernieuwen
          </button>
          <button style={secundair} onClick={() => void supabase.auth.signOut()}>
            Afmelden
          </button>
        </div>
      </header>

      {fout ? <p style={{ color: '#c0392b' }}>{fout}</p> : null}
      {rijen === null ? <p>Laden…</p> : null}
      {rijen !== null && rijen.length === 0 && !fout ? (
        <p style={{ color: '#1a7f4b' }}>De wachtrij is leeg. Niets te doen.</p>
      ) : null}

      {(rijen ?? []).map((rij) => {
        const uren = uurGeleden(rij.created_at);
        // Reactietermijnen uit ADR 0008: 24 u bij private_person, 72 u overig.
        const privacy = rij.flags.some((f) => f.reason === 'private_person');
        const teLaat = uren > (privacy ? 24 : 72);
        return (
          <article key={rij.report_id} style={kaart}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>
                {SIZE_NL[rij.size ?? ''] ?? rij.kind} · {uren} u in quarantaine
                {privacy ? ' · privacyklacht' : ''}
              </strong>
              <span style={{ color: teLaat ? '#c0392b' : '#5b6b7a', fontWeight: 600 }}>
                {teLaat ? 'over de reactietermijn' : 'binnen de termijn'}
              </span>
            </div>
            {rij.note ? <p style={{ margin: '4px 0' }}>“{rij.note}”</p> : null}
            <p style={{ margin: '4px 0', color: '#5b6b7a', fontSize: 13 }}>
              {rij.flag_count} rapport(en)
              {rij.flags.length > 0
                ? ': ' +
                  rij.flags
                    .map((f) => FLAG_REASON_NL[f.reason] + (f.detail ? ` — “${f.detail}”` : ''))
                    .join(' · ')
                : ' (automatische quarantaine, bv. fotoscan)'}
              {rij.photo_count > 0 ? ` · ${rij.photo_count} foto` : ''}
            </p>
            <p style={{ margin: '4px 0', fontSize: 13 }}>
              <a
                href={`https://www.openstreetmap.org/?mlat=${rij.lat}&mlon=${rij.lng}#map=18/${rij.lat}/${rij.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                {rij.lat.toFixed(5)}, {rij.lng.toFixed(5)} op de kaart
              </a>
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                style={primair}
                disabled={bezigMet === rij.report_id}
                onClick={() => void handel(rij, 'restore', 'Melding herstellen naar de kaart?')}
              >
                Herstellen
              </button>
              <button
                style={gevaar}
                disabled={bezigMet === rij.report_id}
                onClick={() =>
                  void handel(rij, 'remove', 'Melding definitief verbergen? (blijft in de audit)')
                }
              >
                Verwijderen
              </button>
              <button
                style={secundair}
                disabled={bezigMet === rij.report_id}
                onClick={() =>
                  void handel(rij, 'block', 'Deze melder 30 dagen blokkeren? Doe dit alleen bij herhaald misbruik.')
                }
              >
                Melder blokkeren (30 d)
              </button>
            </div>
          </article>
        );
      })}
    </Kader>
  );
}

function Kader({ children, breed = false }: { children: React.ReactNode; breed?: boolean }) {
  return (
    <main style={{ maxWidth: breed ? 860 : 560, margin: '0 auto', padding: 24 }}>{children}</main>
  );
}

const veld: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #dfe3e7',
  fontSize: 15,
};
const knopBasis: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 999,
  border: '1px solid #dfe3e7',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};
const primair: React.CSSProperties = {
  ...knopBasis,
  background: '#1a7f4b',
  borderColor: '#1a7f4b',
  color: '#fff',
};
const secundair: React.CSSProperties = { ...knopBasis, background: '#fff', color: '#14181c' };
const gevaar: React.CSSProperties = {
  ...knopBasis,
  background: '#fff',
  color: '#c0392b',
  borderColor: '#c0392b',
};
const kaart: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dfe3e7',
  borderRadius: 12,
  padding: 16,
  marginTop: 12,
};
