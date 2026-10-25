import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { errorText, parseApiError, type ReportStatus } from '@civiceye/shared';
import { fetchMyReports, type MyReport } from '@/api/reports';
import { currentUserId } from '@/auth/session';
import { relativeTimeNl, sizeLabelNl, SIZE_ICON, KIND_ICON } from '@/map/markers';
import { verwijderMislukt } from '@/outbox';
import { useOutbox } from '@/outbox/useOutbox';
import { t } from '@/i18n';
import { theme } from '@/ui/theme';

/**
 * Eigen meldingen, uit `reports` via RLS (reports_own_read) — dus óók de
 * meldingen die in quarantaine staan en niet op de publieke kaart verschijnen.
 * De offline wachtrij komt hier bij in sprint 3.
 */
export default function MijnMeldingen() {
  const router = useRouter();
  const outbox = useOutbox();
  const [userId, setUserId] = useState<string | null>(null);
  const [sessieGezocht, setSessieGezocht] = useState(false);

  useEffect(() => {
    void currentUserId().then((id) => {
      setUserId(id);
      setSessieGezocht(true);
    });
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-reports', userId],
    queryFn: () => fetchMyReports(userId!),
    enabled: userId !== null,
    staleTime: 30_000,
  });

  if (!sessieGezocht || (userId !== null && isLoading)) {
    return (
      <View style={styles.midden}>
        <ActivityIndicator color={theme.color.accent} />
      </View>
    );
  }

  if (userId === null) {
    return (
      <View style={styles.root}>
        <Text style={styles.titel} accessibilityRole="header">
          {t('mijn.titel')}
        </Text>
        <WachtrijSectie outbox={outbox} />
        <Text style={styles.tekst}>{t('mijn.geenSessie')}</Text>
      </View>
    );
  }

  if (error) {
    const fout = parseApiError(error);
    return (
      <View style={styles.root}>
        <Text style={styles.titel} accessibilityRole="header">
          {t('mijn.titel')}
        </Text>
        <WachtrijSectie outbox={outbox} />
        <Text style={styles.tekst} accessibilityLiveRegion="polite">
          {errorText(fout.code, fout.detail)}
        </Text>
      </View>
    );
  }

  const meldingen = data ?? [];

  return (
    <View style={styles.root}>
      <Text style={styles.titel} accessibilityRole="header">
        {t('mijn.titel')}
      </Text>
      <WachtrijSectie outbox={outbox} />
      {meldingen.length === 0 ? (
        <Text style={styles.tekst}>{t('mijn.leeg')}</Text>
      ) : (
        <FlatList
          data={meldingen}
          keyExtractor={(m) => m.reportId}
          contentContainerStyle={styles.lijst}
          renderItem={({ item }) => <MeldingRij melding={item} router={router} />}
        />
      )}
    </View>
  );
}

/**
 * De offline wachtrij en de definitief mislukte meldingen, bovenaan: dit is
 * wat er met je meldingen gebeurt vóór ze op de server staan (ADR 0006).
 */
function WachtrijSectie({ outbox }: { outbox: ReturnType<typeof useOutbox> }) {
  if (outbox.items.length === 0 && outbox.mislukt.length === 0) return null;

  return (
    <View style={styles.wachtrij}>
      {outbox.items.map((item) => (
        <View key={item.clientRef} style={styles.rij}>
          <Text style={styles.icoon}>{item.payload.size ? SIZE_ICON[item.payload.size] : '🗑️'}</Text>
          <View style={styles.rijTekst}>
            <Text style={styles.label}>{sizeLabelNl(item.payload.size)}</Text>
            <Text style={styles.klein}>
              {relativeTimeNl(new Date(item.createdAt).toISOString())}
              {item.photoUri || item.photoPath ? ` · ${t('algemeen.metFoto')}` : ''}
            </Text>
          </View>
          <Text style={[styles.status, { color: theme.color.warning }]}>
            {t('mijn.wachtOpVerbinding')}
          </Text>
        </View>
      ))}
      {outbox.mislukt.map((m) => (
        <Pressable
          key={m.clientRef}
          style={styles.rij}
          accessibilityRole="button"
          accessibilityLabel={t('mijn.misluktLabel', { reden: errorText(m.code) })}
          onPress={() => verwijderMislukt(m.clientRef)}
        >
          <Text style={styles.icoon}>⚠️</Text>
          <View style={styles.rijTekst}>
            <Text style={styles.label}>{t('mijn.nietGelukt')}</Text>
            <Text style={styles.klein}>{errorText(m.code)}</Text>
          </View>
          <Text style={[styles.status, { color: theme.color.danger }]}>
            {t('mijn.tikWeghalen')}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function statusLabelNl(status: ReportStatus): { tekst: string; kleur: string } {
  switch (status) {
    case 'published':
      return { tekst: t('mijn.statusPublished'), kleur: theme.color.accent };
    case 'quarantined':
      return { tekst: t('mijn.statusQuarantined'), kleur: theme.color.warning };
    case 'cleaned':
      return { tekst: t('mijn.statusCleaned'), kleur: theme.color.textMuted };
    case 'removed':
      return { tekst: t('mijn.statusRemoved'), kleur: theme.color.textMuted };
  }
}

function MeldingRij({
  melding,
  router,
}: {
  melding: MyReport;
  router: ReturnType<typeof useRouter>;
}) {
  const status = statusLabelNl(melding.status);
  const icoon =
    melding.kind === 'litter' && melding.size ? SIZE_ICON[melding.size] : KIND_ICON[melding.kind];

  return (
    <Pressable
      style={styles.rij}
      accessibilityRole="button"
      accessibilityLabel={`${sizeLabelNl(melding.size)}, ${status.tekst}, ${relativeTimeNl(melding.createdAt)}`}
      onPress={() => router.push(`/report/${melding.reportId}`)}
    >
      <Text style={styles.icoon}>{icoon}</Text>
      <View style={styles.rijTekst}>
        <Text style={styles.label}>{sizeLabelNl(melding.size)}</Text>
        <Text style={styles.klein} numberOfLines={1}>
          {relativeTimeNl(melding.createdAt)}
          {melding.note ? ` · ${melding.note}` : ''}
        </Text>
      </View>
      <Text style={[styles.status, { color: status.kleur }]}>{status.tekst}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: theme.space(6), gap: theme.space(3), backgroundColor: theme.color.bg },
  midden: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.bg,
  },
  titel: { fontSize: 22, fontWeight: '700', color: theme.color.text },
  tekst: { color: theme.color.textMuted, lineHeight: 22 },
  klein: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18 },
  lijst: { gap: theme.space(2) },
  wachtrij: { gap: theme.space(2) },
  rij: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    minHeight: theme.minTouch + 12,
    padding: theme.space(3),
    borderRadius: theme.radius.m,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.bgElevated,
  },
  icoon: { fontSize: 24 },
  rijTekst: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: '700', color: theme.color.text },
  status: { fontSize: 12, fontWeight: '700' },
});
