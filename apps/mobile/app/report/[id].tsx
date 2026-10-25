import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LitterSize } from '@civiceye/shared';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { errorText, parseApiError } from '@civiceye/shared';
import { fetchReportDetails, photoUrl } from '@/api/reports';
import { relativeTimeNl, sizeLabelNl } from '@/map/markers';
import { env } from '@/config/env';
import { theme } from '@/ui/theme';

export default function MeldingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // 'nieuw' is de route van de meldflow (sprint 2). Bewust een aparte component
  // en geen early return: hooks moeten in elke render in dezelfde volgorde
  // aangeroepen worden, ook wanneer je van /report/nieuw naar /report/<uuid> gaat.
  if (id === 'nieuw') return <MeldflowNogNiet />;
  return <MeldingInhoud id={id} />;
}

function MeldflowNogNiet() {
  return (
    <View style={styles.midden}>
      <Text style={styles.titel}>Melden komt in de volgende versie</Text>
      <Text style={styles.tekst}>
        Deze versie toont de kaart met bestaande meldingen. De meldflow — locatie, type,
        foto, offline wachtrij — is sprint 2.
      </Text>
    </View>
  );
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
      <View style={styles.chips}>
        {data.size ? <GrootteChip size={data.size} /> : null}
        <View style={styles.chip}>
          <Text style={styles.chipTekst}>{data.status === 'cleaned' ? 'Opgeruimd' : 'Open'}</Text>
        </View>
      </View>
      <Text style={styles.kop}>{sizeLabelNl(data.size)}</Text>
      <Text style={styles.ondertitel}>Gemeld {relativeTimeNl(data.createdAt)}</Text>

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
        <Rij label="Status" waarde={data.status === 'cleaned' ? 'opgeruimd' : 'open'} />
        {data.confirmCount > 0 ? (
          <Rij label="Bevestigd door" waarde={`${data.confirmCount} mensen`} />
        ) : null}
        {data.isMine ? <Rij label="Van jou" waarde="ja" /> : null}
      </View>

      {/* Opruimen en rapporteren komen in sprint 2 en 4. */}
      <Text style={styles.klein}>
        Opruimen markeren en rapporteren komen in een volgende versie.
      </Text>
    </ScrollView>
  );
}

const GROOTTE_NL: Record<LitterSize, string> = { piece: 'Klein', bag: 'Medium', heap: 'Groot' };

/** Zelfde kleur als de marker op de kaart, met de grootte ook als woord. */
function GrootteChip({ size }: { size: LitterSize }) {
  const kleur = theme.size[size];
  return (
    <View style={[styles.chip, { backgroundColor: kleur.soft }]}>
      <View style={[styles.chipStip, { backgroundColor: kleur.fill }]} />
      <Text style={[styles.chipTekst, { color: kleur.softText }]}>{GROOTTE_NL[size]}</Text>
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
  root: { padding: theme.space(5), gap: theme.space(4), backgroundColor: theme.color.bg },
  midden: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space(8),
    gap: theme.space(3),
    backgroundColor: theme.color.bg,
  },
  titel: { ...theme.text.heading, textAlign: 'center' },
  tekst: { ...theme.text.bodyMuted, textAlign: 'center' },
  chips: { flexDirection: 'row', gap: theme.space(2) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
    height: 28,
    paddingHorizontal: theme.space(2.5),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.bgSubtle,
  },
  chipStip: { width: 8, height: 8, borderRadius: 4 },
  chipTekst: { ...theme.text.label, fontFamily: theme.font.bold, fontSize: 13 },
  kop: { ...theme.text.title, fontSize: 24, lineHeight: 28, marginTop: -theme.space(1) },
  ondertitel: { ...theme.text.small, fontSize: 14, marginTop: -theme.space(3) },
  notitie: { ...theme.text.body, fontSize: 15, lineHeight: 22 },
  foto: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: theme.radius.l,
    backgroundColor: theme.color.bgSubtle,
  },
  geenFoto: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.color.lineStrong,
  },
  kaart: {
    borderRadius: theme.radius.l,
    backgroundColor: theme.color.bgElevated,
    overflow: 'hidden',
    ...theme.shadow.card,
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
  label: { ...theme.text.small, fontSize: 15 },
  waarde: { ...theme.text.label, fontSize: 15 },
  klein: theme.text.small,
});
