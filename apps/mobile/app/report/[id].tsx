import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { errorText, parseApiError } from '@civiceye/shared';
import { fetchReportDetails, photoUrl } from '@/api/reports';
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
        <Rij label="Status" waarde={data.status === 'cleaned' ? 'opgeruimd' : 'open'} />
        {data.confirmCount > 0 ? (
          <Rij label="Bevestigd door" waarde={`${data.confirmCount} mensen`} />
        ) : null}
        {data.isMine ? <Rij label="Van jou" waarde="ja" /> : null}
      </View>

      {/* Rapporteren komt in sprint 4; opruimen is fase 2 (feature_disabled). */}
      <Text style={styles.klein}>
        Opruimen markeren en rapporteren komen in een volgende versie.
      </Text>
    </ScrollView>
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
});
