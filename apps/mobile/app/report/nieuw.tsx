import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  errorText,
  newClientRef,
  parseApiError,
  type LitterSize,
  type NearbyReport,
  type ParsedApiError,
} from '@civiceye/shared';
import { ApiError, confirmReport, fetchNearbyReports } from '@/api/reports';
import { ensureSession } from '@/auth/session';
import { MapCanvas } from '@/map/MapCanvas';
import { MapErrorBoundary } from '@/map/ErrorBoundary';
import { relativeTimeNl, sizeLabelNl, SIZE_ICON } from '@/map/markers';
import { enqueueReport, syncNow, verwijderMislukt } from '@/outbox';
import { CAMERA_BESCHIKBAAR, pickPhoto } from '@/photo/pickPhoto';
import { processPhoto, type ProcessedPhoto } from '@/photo/processPhoto';
import { duplicatesFor, optimisticMarker } from '@/report/logic';
import { addReportToMapCache } from '@/report/optimistic';
import { useCurrentLocation } from '@/report/useCurrentLocation';
import type { Viewport } from '@/map/types';
import { theme } from '@/ui/theme';

/** Zelfde startpunt als de kaart: Antwerpen, tot GPS iets beters weet. */
const START = { lng: 4.4025, lat: 51.2194, zoom: 16 };

/** Zoomniveau waarop je een pin op een paar meter nauwkeurig kan zetten. */
const PIN_ZOOM = 17;

const SIZES: { size: LitterSize; uitleg: string }[] = [
  { size: 'piece', uitleg: 'één stuk, past in je hand' },
  { size: 'bag', uitleg: 'ongeveer één zak vol' },
  { size: 'heap', uitleg: 'meer dan één zak' },
];

type Stap =
  | { naam: 'locatie' }
  | { naam: 'type' }
  | { naam: 'duplicaat'; buren: NearbyReport[]; size: LitterSize };

/**
 * De meldflow (docs/05-mobile-client.md): locatie → grootte → posten, met een
 * duplicaatvraag wanneer er binnen 20 m al hetzelfde gemeld is. De
 * grootte-keuze is meteen de bevestiging — geen extra "verstuur"-scherm. Foto's
 * en de offline outbox komen in sprint 3.
 */
export default function NieuweMelding() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [stap, setStap] = useState<Stap>({ naam: 'locatie' });
  const [center, setCenter] = useState(START);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<ParsedApiError | null>(null);
  const [notitie, setNotitie] = useState('');
  const [foto, setFoto] = useState<ProcessedPhoto | null>(null);
  const [fotoBezig, setFotoBezig] = useState(false);

  // Heeft de gebruiker de kaart zelf versleept? State voor de render (de
  // nauwkeurigheidshint), plus een ref-spiegel zodat de GPS-callback hieronder
  // de actuele waarde ziet zonder opnieuw aangemaakt te worden.
  const [gepand, setGepand] = useState(false);
  const gepandRef = useRef(false);

  // De identiteit van deze melding, aangemaakt zodra de flow start. Elke retry
  // hergebruikt hem, dus dubbel tikken of een herhaalde post kan nooit een
  // tweede melding worden (ADR 0006).
  const clientRef = useRef(newClientRef());
  const laatsteActie = useRef<(() => Promise<void>) | null>(null);

  // GPS gevonden en nog niet gesleept: pin naar de eigen positie. Komt de fix
  // pas ná een handmatige sleep binnen, dan wint de sleep (docs/13, risico
  // "GPS-nauwkeurigheid tussen bomen is slecht").
  const gps = useCurrentLocation(
    useCallback((f) => {
      if (!gepandRef.current) {
        setCenter({ lng: f.lng, lat: f.lat, zoom: PIN_ZOOM });
      }
    }, []),
  );

  const onViewportChange = useCallback(
    (v: Viewport) => {
      const afstand =
        Math.abs(v.centerLng - center.lng) + Math.abs(v.centerLat - center.lat);
      // De kaart meldt bij het laden zijn eigen (programmatische) centrum;
      // alles daarbuiten is een echte sleep van de gebruiker.
      if (afstand > 5e-5) {
        gepandRef.current = true;
        setGepand(true);
      }
      setViewport(v);
    },
    [center],
  );

  /** Waar de pin nu staat: het kaartcentrum, of de programmatische start. */
  const pin = viewport
    ? { lat: viewport.centerLat, lng: viewport.centerLng }
    : { lat: center.lat, lng: center.lng };

  /** GPS-nauwkeurigheid geldt alleen zolang de pin niet handmatig verplaatst is. */
  const accuracyM = gps.status === 'ok' && !gepand ? gps.accuracyM : null;

  const uitvoeren = useCallback(async (actie: () => Promise<void>) => {
    laatsteActie.current = actie;
    setFout(null);
    setBezig(true);
    try {
      await actie();
    } catch (e) {
      setFout(parseApiError(e));
    } finally {
      setBezig(false);
    }
  }, []);

  /**
   * Posten loopt via de outbox (ADR 0006): eerst in de lokale wachtrij, dan
   * één directe verzendpoging. Online voelt dat als direct posten; offline
   * blijft de melding veilig staan en toont de kaart de wachtrij.
   */
  const post = useCallback(
    async (size: LitterSize) => {
      await enqueueReport(
        clientRef.current,
        {
          lat: pin.lat,
          lng: pin.lng,
          kind: 'litter',
          size,
          note: notitie.trim() ? notitie.trim() : undefined,
          accuracyM,
        },
        foto?.uri ?? null,
      );

      const gevolg = await syncNow();

      // Definitief geweigerd (buiten servicegebied, geblokkeerd, …): hier in
      // de flow tonen, niet als lijk in de wachtrij laten liggen.
      const definitief = gevolg.mislukt.find((m) => m.clientRef === clientRef.current);
      if (definitief) {
        verwijderMislukt(clientRef.current);
        throw new ApiError(definitief.code);
      }

      const verzonden = gevolg.verzonden.find((v) => v.clientRef === clientRef.current);
      if (verzonden) {
        addReportToMapCache(
          queryClient,
          optimisticMarker({
            reportId: verzonden.reportId,
            lat: pin.lat,
            lng: pin.lng,
            kind: 'litter',
            size,
            createdAt: new Date().toISOString(),
          }),
        );
      }
      // Niet verzonden en niet mislukt = wacht op verbinding; de banner op de
      // kaart maakt dat zichtbaar. In beide gevallen: terug naar de kaart.
      router.replace('/');
    },
    [accuracyM, foto, notitie, pin.lat, pin.lng, queryClient, router],
  );

  const kiesFoto = useCallback(async (bron: 'camera' | 'bibliotheek') => {
    setFotoBezig(true);
    try {
      const gekozen = await pickPhoto(bron);
      if (gekozen) setFoto(await processPhoto(gekozen));
    } catch {
      // De foto is optioneel; een picker- of verkleinfout mag het melden nooit
      // blokkeren (docs/05: "de foto blokkeert niets").
    } finally {
      setFotoBezig(false);
    }
  }, []);

  const kiesGrootte = useCallback(
    (size: LitterSize) =>
      uitvoeren(async () => {
        // Ligt hier al een melding? Kan de check niet uitgevoerd worden (geen
        // netwerk, RPC-fout), dan posten we gewoon: de vraag is een hulpmiddel
        // tegen dubbels, geen poort vóór het melden.
        let buren: NearbyReport[];
        try {
          buren = duplicatesFor(await fetchNearbyReports(pin.lat, pin.lng, 25), 'litter');
        } catch {
          buren = [];
        }
        if (buren.length > 0) {
          setStap({ naam: 'duplicaat', buren, size });
          return;
        }
        await post(size);
      }),
    [pin.lat, pin.lng, post, uitvoeren],
  );

  const bevestigBestaande = useCallback(
    (reportId: string) =>
      uitvoeren(async () => {
        await ensureSession();
        await confirmReport(reportId);
        void queryClient.invalidateQueries({ queryKey: ['report', reportId] });
        router.replace('/');
      }),
    [queryClient, router, uitvoeren],
  );

  return (
    <View style={styles.root}>
      {stap.naam === 'locatie' ? (
        <LocatieStap
          center={center}
          gps={gps}
          accuracyM={accuracyM}
          onViewportChange={onViewportChange}
          onKlaar={() => setStap({ naam: 'type' })}
        />
      ) : null}

      {stap.naam === 'type' ? (
        <TypeStap
          notitie={notitie}
          onNotitie={setNotitie}
          foto={foto}
          fotoBezig={fotoBezig}
          onKiesFoto={(bron) => void kiesFoto(bron)}
          onVerwijderFoto={() => setFoto(null)}
          onKies={kiesGrootte}
          onTerug={() => setStap({ naam: 'locatie' })}
        />
      ) : null}

      {stap.naam === 'duplicaat' ? (
        <DuplicaatStap
          buren={stap.buren}
          onBevestig={() => {
            const eerste = stap.buren[0];
            if (eerste) void bevestigBestaande(eerste.reportId);
          }}
          onTochMelden={() => uitvoeren(() => post(stap.size))}
        />
      ) : null}

      {fout ? (
        <View style={styles.foutBalk}>
          <Text style={styles.foutTekst}>
            {fout.code === 'network'
              ? 'Geen verbinding. Probeer het opnieuw zodra je netwerk hebt.'
              : errorText(fout.code, fout.detail)}
          </Text>
          {/* Een fout ontstaat altijd uit een actie, dus er valt altijd iets te
              herhalen; de ref lezen mag alleen in de handler, niet in de render. */}
          <Pressable
            style={styles.foutKnop}
            accessibilityRole="button"
            accessibilityLabel="Opnieuw proberen"
            onPress={() => {
              const actie = laatsteActie.current;
              if (actie) void uitvoeren(actie);
            }}
          >
            <Text style={styles.foutKnopTekst}>Opnieuw proberen</Text>
          </Pressable>
        </View>
      ) : null}

      {bezig ? (
        <View style={styles.sluier} accessibilityLabel="Bezig met versturen">
          <ActivityIndicator size="large" color={theme.color.accent} />
          <Text style={styles.sluierTekst}>Versturen…</Text>
        </View>
      ) : null}
    </View>
  );
}

function LocatieStap({
  center,
  gps,
  accuracyM,
  onViewportChange,
  onKlaar,
}: {
  center: { lng: number; lat: number; zoom: number };
  gps: ReturnType<typeof useCurrentLocation>;
  accuracyM: number | null;
  onViewportChange: (v: Viewport) => void;
  onKlaar: () => void;
}) {
  const hint =
    gps.status === 'busy'
      ? 'GPS zoekt je positie… je kan de kaart ook zelf verslepen.'
      : gps.status === 'denied'
        ? 'Geen locatietoegang — versleep de kaart tot de pin op het afval staat.'
        : gps.status === 'unavailable'
          ? 'GPS niet beschikbaar — versleep de kaart tot de pin op het afval staat.'
          : Platform.OS === 'web'
            ? 'Controleer de pin: op een computer is GPS vaak onnauwkeurig.'
            : accuracyM !== null
              ? `GPS gevonden (± ${Math.round(accuracyM)} m). Versleep de kaart als de pin niet klopt.`
              : 'Versleep de kaart tot de pin op het afval staat.';

  return (
    <View style={styles.stap}>
      <View style={styles.kaartVak}>
        <MapErrorBoundary
          fallback={() => (
            <View style={styles.kaartFallback}>
              <Text style={styles.tekst}>
                De kaart kan hier niet getekend worden. We gebruiken{' '}
                {gps.status === 'ok' ? 'je GPS-positie' : 'het startpunt van de kaart'} als
                locatie van de melding.
              </Text>
            </View>
          )}
        >
          <MapCanvas
            key={`${center.lng},${center.lat},${center.zoom}`}
            markers={[]}
            initialCenter={center}
            onViewportChange={onViewportChange}
            onSelectReport={() => {}}
            onSelectCluster={() => {}}
          />
        </MapErrorBoundary>
        {/* De pin staat vast in het midden; de kaart beweegt eronder. Dat is de
            "versleepbare pin" zonder een tweede aanrakingsmodel op de kaart. */}
        <View pointerEvents="none" style={styles.pinLaag}>
          <Text style={styles.pin} accessibilityLabel="Pin op de plek van het afval">
            📍
          </Text>
        </View>
      </View>

      <View style={styles.paneel}>
        <Text style={styles.titel}>Waar ligt het afval?</Text>
        <Text style={styles.tekst}>{hint}</Text>
        <Pressable
          style={styles.primair}
          accessibilityRole="button"
          accessibilityLabel="Deze plek klopt"
          onPress={onKlaar}
        >
          <Text style={styles.primairTekst}>Deze plek klopt</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TypeStap({
  notitie,
  onNotitie,
  foto,
  fotoBezig,
  onKiesFoto,
  onVerwijderFoto,
  onKies,
  onTerug,
}: {
  notitie: string;
  onNotitie: (tekst: string) => void;
  foto: ProcessedPhoto | null;
  fotoBezig: boolean;
  onKiesFoto: (bron: 'camera' | 'bibliotheek') => void;
  onVerwijderFoto: () => void;
  onKies: (size: LitterSize) => void;
  onTerug: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.paneelVol}>
      <Text style={styles.titel}>Hoe groot is het?</Text>
      <Text style={styles.tekst}>Kies één van de drie — je keuze verstuurt de melding meteen.</Text>

      {SIZES.map(({ size, uitleg }) => (
        <Pressable
          key={size}
          style={styles.grootteKnop}
          accessibilityRole="button"
          accessibilityLabel={`${sizeLabelNl(size)} — ${uitleg}`}
          onPress={() => onKies(size)}
        >
          <Text style={styles.grootteIcoon}>{SIZE_ICON[size]}</Text>
          <View style={styles.grootteTekst}>
            <Text style={styles.grootteLabel}>{sizeLabelNl(size)}</Text>
            <Text style={styles.klein}>{uitleg}</Text>
          </View>
        </Pressable>
      ))}

      {foto ? (
        <View style={styles.fotoRij}>
          <Image source={{ uri: foto.uri }} style={styles.fotoMini} accessibilityLabel="Gekozen foto" />
          <Pressable
            style={styles.secundair}
            accessibilityRole="button"
            accessibilityLabel="Foto weghalen"
            onPress={onVerwijderFoto}
          >
            <Text style={styles.secundairTekst}>Foto weghalen</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.fotoKnoppen}>
          {CAMERA_BESCHIKBAAR ? (
            <Pressable
              style={[styles.secundair, styles.fotoKnop]}
              accessibilityRole="button"
              accessibilityLabel="Foto nemen met de camera, niet verplicht"
              disabled={fotoBezig}
              onPress={() => onKiesFoto('camera')}
            >
              <Text style={styles.secundairTekst}>📷 Foto nemen</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.secundair, styles.fotoKnop]}
            accessibilityRole="button"
            accessibilityLabel="Foto kiezen uit je bibliotheek, niet verplicht"
            disabled={fotoBezig}
            onPress={() => onKiesFoto('bibliotheek')}
          >
            <Text style={styles.secundairTekst}>
              {fotoBezig ? 'Foto verkleinen…' : '🖼️ Foto kiezen'}
            </Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.klein}>
        Een foto is niet verplicht. Ze wordt verkleind en zonder metadata verstuurd, en pas
        getoond na een automatische controle.
      </Text>

      <TextInput
        style={styles.notitie}
        value={notitie}
        onChangeText={onNotitie}
        placeholder="Notitie (niet verplicht), bv. 'achter het bankje'"
        placeholderTextColor={theme.color.textMuted}
        maxLength={280}
        multiline
        accessibilityLabel="Notitie bij de melding, niet verplicht"
      />

      <Pressable
        style={styles.secundair}
        accessibilityRole="button"
        accessibilityLabel="Terug naar de locatie"
        onPress={onTerug}
      >
        <Text style={styles.secundairTekst}>Locatie aanpassen</Text>
      </Pressable>
    </ScrollView>
  );
}

function DuplicaatStap({
  buren,
  onBevestig,
  onTochMelden,
}: {
  buren: NearbyReport[];
  onBevestig: () => void;
  onTochMelden: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.paneelVol}>
      <Text style={styles.titel}>Hier is al iets gemeld</Text>
      <Text style={styles.tekst}>
        Vlak bij je pin {buren.length === 1 ? 'staat al een melding' : 'staan al meldingen'}. Gaat
        het om hetzelfde afval, bevestig dan — zo blijft de kaart leesbaar.
      </Text>

      <View style={styles.lijst}>
        {buren.slice(0, 3).map((b) => (
          <View key={b.reportId} style={styles.lijstRij}>
            <Text style={styles.grootteIcoon}>{b.size ? SIZE_ICON[b.size] : '🗑️'}</Text>
            <View style={styles.grootteTekst}>
              <Text style={styles.grootteLabel}>{sizeLabelNl(b.size)}</Text>
              <Text style={styles.klein}>
                {Math.max(1, Math.round(b.distanceM))} m van je pin · {relativeTimeNl(b.createdAt)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        style={styles.primair}
        accessibilityRole="button"
        accessibilityLabel="Het ligt er nog, bevestig de bestaande melding"
        onPress={onBevestig}
      >
        <Text style={styles.primairTekst}>Het ligt er nog — bevestig</Text>
      </Pressable>
      <Pressable
        style={styles.secundair}
        accessibilityRole="button"
        accessibilityLabel="Toch apart melden"
        onPress={onTochMelden}
      >
        <Text style={styles.secundairTekst}>Dit is iets anders — toch melden</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  stap: { flex: 1 },
  kaartVak: { flex: 1 },
  kaartFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space(6),
    backgroundColor: theme.color.bgElevated,
  },
  pinLaag: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // De punt van 📍 staat onderaan het teken: til het icoon een halve hoogte op
  // zodat de punt op het kaartcentrum wijst, niet het midden van de emoji.
  pin: { fontSize: 40, transform: [{ translateY: -20 }] },
  paneel: {
    padding: theme.space(5),
    gap: theme.space(3),
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
    backgroundColor: theme.color.bg,
  },
  paneelVol: { padding: theme.space(5), gap: theme.space(3) },
  titel: { fontSize: 20, fontWeight: '700', color: theme.color.text },
  tekst: { color: theme.color.textMuted, lineHeight: 22 },
  klein: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18 },
  primair: {
    minHeight: theme.minTouch + 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.accent,
    paddingHorizontal: theme.space(5),
  },
  primairTekst: { color: theme.color.accentText, fontWeight: '700', fontSize: 16 },
  secundair: {
    minHeight: theme.minTouch,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingHorizontal: theme.space(5),
  },
  secundairTekst: { color: theme.color.text, fontWeight: '600', fontSize: 15 },
  grootteKnop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(4),
    minHeight: theme.minTouch + 24,
    padding: theme.space(4),
    borderRadius: theme.radius.m,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.bgElevated,
  },
  grootteIcoon: { fontSize: 30 },
  grootteTekst: { flex: 1, gap: 2 },
  grootteLabel: { fontSize: 17, fontWeight: '700', color: theme.color.text },
  fotoKnoppen: { flexDirection: 'row', gap: theme.space(2) },
  fotoKnop: { flex: 1 },
  fotoRij: { flexDirection: 'row', alignItems: 'center', gap: theme.space(3) },
  fotoMini: {
    width: 96,
    height: 72,
    borderRadius: theme.radius.s,
    backgroundColor: theme.color.bgElevated,
  },
  notitie: {
    minHeight: theme.minTouch + 12,
    padding: theme.space(3),
    borderRadius: theme.radius.m,
    borderWidth: 1,
    borderColor: theme.color.line,
    color: theme.color.text,
    textAlignVertical: 'top',
  },
  lijst: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.m,
    backgroundColor: theme.color.bgElevated,
  },
  lijstRij: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(4),
    padding: theme.space(4),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.line,
  },
  foutBalk: {
    position: 'absolute',
    left: theme.space(3),
    right: theme.space(3),
    bottom: theme.space(6),
    padding: theme.space(3),
    gap: theme.space(2),
    borderRadius: theme.radius.m,
    backgroundColor: '#fdecea',
    borderWidth: 1,
    borderColor: theme.color.danger,
  },
  foutTekst: { color: theme.color.danger, fontSize: 13, lineHeight: 18 },
  foutKnop: {
    minHeight: theme.minTouch,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.danger,
  },
  foutKnopTekst: { color: '#ffffff', fontWeight: '700' },
  sluier: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(3),
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  sluierTekst: { color: theme.color.text, fontWeight: '600' },
});
