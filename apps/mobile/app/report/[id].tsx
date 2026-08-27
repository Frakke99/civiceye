import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  errorText,
  parseApiError,
  statusTekstNl,
  FLAG_REASONS,
  FLAG_REASON_NL,
  type FlagReason,
} from '@civiceye/shared';
import { fetchReportDetails, flagReport, photoUrl } from '@/api/reports';
import { ensureSession } from '@/auth/session';
import { relativeTimeNl, sizeLabelNl } from '@/map/markers';
import { env } from '@/config/env';
import { theme } from '@/ui/theme';

export default function MeldingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // De meldflow leeft op zijn eigen statische route (app/report/nieuw.tsx);
  // expo-router kiest die vóór deze dynamische, dus hier komen enkel uuid's.
  return <MeldingInhoud id={id} />;
}

function MeldingInhoud({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['report', id],
    queryFn: () => fetchReportDetails(id),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <View style={styles.midden}>
        <ActivityIndicator color={theme.color.accent} />
      </View>
    );
  }

  if (error || !data) {
    const fout = parseApiError(error);
    return (
      <View style={styles.midden}>
        <Text style={styles.tekst}>{errorText(fout.code, fout.detail)}</Text>
      </View>
    );
  }

  const foto = data.photos.find((p) => p.status === 'safe');

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.titel}>{sizeLabelNl(data.size)}</Text>
      <Text style={styles.tekst}>{relativeTimeNl(data.createdAt)}</Text>

      {foto ? (
        <Image
          source={{ uri: photoUrl(env.supabaseUrl, foto.bucket, foto.path) }}
          style={styles.foto}
          resizeMode="cover"
          accessibilityLabel="Foto van de melding"
        />
      ) : (
        <View style={[styles.foto, styles.geenFoto]}>
          <Text style={styles.klein}>
            {data.photos.length > 0 ? 'Foto wordt nog gecontroleerd' : 'Geen foto'}
          </Text>
        </View>
      )}

      {data.note ? <Text style={styles.notitie}>{data.note}</Text> : null}

      <View style={styles.kaart}>
        <Rij label="Locatie" waarde={`${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`} />
        <Rij
          label="GPS-nauwkeurigheid"
          waarde={data.accuracyM === null ? 'onbekend' : `± ${Math.round(data.accuracyM)} m`}
        />
        <Rij label="Status" waarde={statusTekstNl(data.status)} />
        {data.confirmCount > 0 ? (
          <Rij label="Bevestigd door" waarde={`${data.confirmCount} mensen`} />
        ) : null}
        {data.isMine ? <Rij label="Van jou" waarde="ja" /> : null}
      </View>

      {data.status === 'quarantined' && data.isMine ? (
        <Text style={styles.klein}>
          Deze melding wordt nagekeken en staat even niet op de publieke kaart. Jij ziet haar
          nog wel; na het nazicht wordt ze hersteld of verwijderd.
        </Text>
      ) : null}

      {/* Eigen meldingen rapporteer je niet; die kan je in fase 2 opruimen. */}
      {!data.isMine ? <RapporteerSectie reportId={id} /> : null}

      <Text style={styles.klein}>Opruimen markeren komt in een volgende versie.</Text>
    </ScrollView>
  );
}

/**
 * Rapporteren (sprint 4). De server quarantineert automatisch bij drie flags,
 * of meteen bij 'private_person' (ADR 0008) — vandaar de aparte uitlegtekst
 * wanneer de melding door jouw rapport verdween.
 */
function RapporteerSectie({ reportId }: { reportId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState('');
  const [bezig, setBezig] = useState(false);
  const [klaar, setKlaar] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const verstuur = async (reason: FlagReason) => {
    setBezig(true);
    setFout(null);
    try {
      await ensureSession();
      const resultaat = await flagReport(reportId, reason, detail);
      setKlaar(
        resultaat.status === 'quarantined'
          ? 'Bedankt. De melding is van de kaart gehaald en wordt nagekeken.'
          : 'Bedankt voor je rapport. Bij meerdere rapporten wordt de melding nagekeken.',
      );
      // De kaart kan veranderd zijn (quarantaine); de detailquery laten we met
      // rust — voor een niet-eigenaar zou een refetch nu report_not_found geven.
      void queryClient.invalidateQueries({ queryKey: ['map-reports'] });
    } catch (e) {
      const parsed = parseApiError(e);
      setFout(errorText(parsed.code, parsed.detail));
    } finally {
      setBezig(false);
    }
  };

  if (klaar) {
    return <Text style={styles.rapporteerKlaar}>{klaar}</Text>;
  }

  if (!open) {
    return (
      <Pressable
        style={styles.rapporteerKnop}
        accessibilityRole="button"
        accessibilityLabel="Rapporteer deze melding"
        onPress={() => setOpen(true)}
      >
        <Text style={styles.rapporteerKnopTekst}>Klopt hier iets niet? Rapporteer</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.rapporteerVak}>
      <Text style={styles.rapporteerTitel}>Wat klopt er niet?</Text>
      {FLAG_REASONS.map((reason) => (
        <Pressable
          key={reason}
          style={styles.redenKnop}
          accessibilityRole="button"
          accessibilityLabel={FLAG_REASON_NL[reason]}
          disabled={bezig}
          onPress={() => void verstuur(reason)}
        >
          <Text style={styles.redenTekst}>{FLAG_REASON_NL[reason]}</Text>
        </Pressable>
      ))}
      <TextInput
        style={styles.rapporteerInput}
        value={detail}
        onChangeText={setDetail}
        placeholder="Toelichting (niet verplicht)"
        placeholderTextColor={theme.color.textMuted}
        maxLength={280}
        accessibilityLabel="Toelichting bij je rapport, niet verplicht"
      />
      {bezig ? <ActivityIndicator color={theme.color.accent} /> : null}
      {fout ? <Text style={styles.rapporteerFout}>{fout}</Text> : null}
    </View>
  );
}

function Rij({ label, waarde }: { label: string; waarde: string }) {
  return (
    <View style={styles.rij}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.waarde}>{waarde}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: theme.space(5), gap: theme.space(3), backgroundColor: theme.color.bg },
  midden: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space(8),
    gap: theme.space(3),
    backgroundColor: theme.color.bg,
  },
  titel: { fontSize: 20, fontWeight: '700', color: theme.color.text },
  tekst: { color: theme.color.textMuted, lineHeight: 22, textAlign: 'center' },
  notitie: { color: theme.color.text, fontSize: 15, lineHeight: 22 },
  foto: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: theme.radius.m,
    backgroundColor: theme.color.bgElevated,
  },
  geenFoto: { alignItems: 'center', justifyContent: 'center' },
  kaart: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.m,
    backgroundColor: theme.color.bgElevated,
  },
  rij: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.space(3),
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.line,
  },
  label: { color: theme.color.textMuted },
  waarde: { color: theme.color.text, fontWeight: '600' },
  klein: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18 },
  rapporteerKnop: {
    minHeight: theme.minTouch,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  rapporteerKnopTekst: { color: theme.color.textMuted, fontWeight: '600' },
  rapporteerVak: {
    gap: theme.space(2),
    padding: theme.space(4),
    borderRadius: theme.radius.m,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.bgElevated,
  },
  rapporteerTitel: { fontSize: 15, fontWeight: '700', color: theme.color.text },
  redenKnop: {
    minHeight: theme.minTouch,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.s,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.bg,
  },
  redenTekst: { color: theme.color.text, fontWeight: '600' },
  rapporteerInput: {
    minHeight: theme.minTouch,
    padding: theme.space(3),
    borderRadius: theme.radius.s,
    borderWidth: 1,
    borderColor: theme.color.line,
    color: theme.color.text,
    backgroundColor: theme.color.bg,
  },
  rapporteerFout: { color: theme.color.danger, fontSize: 13 },
  rapporteerKlaar: { color: theme.color.accent, fontWeight: '600', lineHeight: 20 },
});
