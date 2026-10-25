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
import { t } from '@/i18n';
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
      <Text style={styles.titel} accessibilityRole="header">
        {sizeLabelNl(data.size)}
      </Text>
      <Text style={styles.tekst}>{relativeTimeNl(data.createdAt)}</Text>

      {foto ? (
        <Image
          source={{ uri: photoUrl(env.supabaseUrl, foto.bucket, foto.path) }}
          style={styles.foto}
          resizeMode="cover"
          accessibilityLabel={t('detail.fotoLabel')}
        />
      ) : (
        <View style={[styles.foto, styles.geenFoto]}>
          <Text style={styles.klein}>
            {data.photos.length > 0 ? t('detail.fotoInControle') : t('detail.geenFoto')}
          </Text>
        </View>
      )}

      {data.note ? <Text style={styles.notitie}>{data.note}</Text> : null}

      <View style={styles.kaart}>
        <Rij label={t('detail.locatie')} waarde={`${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`} />
        <Rij
          label={t('detail.gps')}
          waarde={
            data.accuracyM === null
              ? t('detail.gpsOnbekend')
              : t('detail.gpsWaarde', { m: Math.round(data.accuracyM) })
          }
        />
        <Rij label={t('detail.status')} waarde={statusTekstNl(data.status)} />
        {data.confirmCount > 0 ? (
          <Rij
            label={t('detail.bevestigdDoor')}
            waarde={t('detail.bevestigdWaarde', { n: data.confirmCount })}
          />
        ) : null}
        {data.isMine ? <Rij label={t('detail.vanJou')} waarde={t('detail.ja')} /> : null}
      </View>

      {data.status === 'quarantined' && data.isMine ? (
        <Text style={styles.klein}>{t('detail.quarantaineUitleg')}</Text>
      ) : null}

      {/* Eigen meldingen rapporteer je niet; die kan je in fase 2 opruimen. */}
      {!data.isMine ? <RapporteerSectie reportId={id} /> : null}

      <Text style={styles.klein}>{t('detail.opruimenLater')}</Text>
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
          ? t('rapporteer.bedanktQuarantaine')
          : t('rapporteer.bedankt'),
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
        accessibilityLabel={t('rapporteer.knopLabel')}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.rapporteerKnopTekst}>{t('rapporteer.knop')}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.rapporteerVak}>
      <Text style={styles.rapporteerTitel} accessibilityRole="header">
        {t('rapporteer.titel')}
      </Text>
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
        placeholder={t('rapporteer.toelichtingPlaceholder')}
        placeholderTextColor={theme.color.textMuted}
        maxLength={280}
        accessibilityLabel={t('rapporteer.toelichtingLabel')}
      />
      {bezig ? <ActivityIndicator color={theme.color.accent} /> : null}
      {fout ? (
        <Text style={styles.rapporteerFout} accessibilityLiveRegion="polite">
          {fout}
        </Text>
      ) : null}
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
