import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Eén foto kiezen, met camera of uit de bibliotheek. Permissies worden hier
 * pas gevraagd — bij het tikken op "foto", met de uitleg uit app.json
 * (docs/05-mobile-client.md, permissietabel). Geweigerd of geannuleerd is
 * geen fout: melden zonder foto blijft gewoon werken.
 */
export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** De camera bestaat niet in een desktopbrowser; daar alleen de bibliotheek. */
export const CAMERA_BESCHIKBAAR = Platform.OS !== 'web';

export async function pickPhoto(bron: 'camera' | 'bibliotheek'): Promise<PickedPhoto | null> {
  let resultaat: ImagePicker.ImagePickerResult;

  if (bron === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    resultaat = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      // Volle kwaliteit hier; verkleinen en re-encoderen (EXIF weg) gebeurt in
      // processPhoto, in één stap in plaats van twee generatieverliezen.
      quality: 1,
    });
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    resultaat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      selectionLimit: 1,
    });
  }

  const asset = resultaat.canceled ? null : (resultaat.assets?.[0] ?? null);
  if (!asset) return null;
  return { uri: asset.uri, width: asset.width ?? 0, height: asset.height ?? 0 };
}
