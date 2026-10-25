import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

/**
 * Eén GPS-positie voor de meldflow. De permissie wordt hier pas gevraagd — op
 * het moment dat de gebruiker echt wil melden, met de uitleg uit app.json
 * (docs/05-mobile-client.md, permissietabel). Geweigerd is geen fout: de pin
 * blijft versleepbaar en alles werkt.
 */
export type LocationFix =
  | { status: 'busy' }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'ok'; lat: number; lng: number; accuracyM: number | null };

export function useCurrentLocation(
  /** Wordt één keer aangeroepen zodra er een positie is — bv. om de kaart te centreren. */
  onFix?: (fix: { lat: number; lng: number; accuracyM: number | null }) => void,
): LocationFix {
  const [fix, setFix] = useState<LocationFix>({ status: 'busy' });

  useEffect(() => {
    let actief = true;

    void (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          if (actief) setFix({ status: 'denied' });
          return;
        }
        // Balanced is genoeg: de pin is toch versleepbaar, en High kost op een
        // wandelpad makkelijk tien seconden — de hele flow moet onder de vijftien.
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (actief) {
          const gevonden = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy ?? null,
          };
          setFix({ status: 'ok', ...gevonden });
          onFix?.(gevonden);
        }
      } catch {
        // GPS uit, geen hardware, of een timeout: melden kan nog steeds.
        if (actief) setFix({ status: 'unavailable' });
      }
    })();

    return () => {
      actief = false;
    };
  }, [onFix]);

  return fix;
}
