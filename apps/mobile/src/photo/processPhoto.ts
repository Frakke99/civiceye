import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { JPEG_KWALITEIT, resizeActie } from './logic';
import type { PickedPhoto } from './pickPhoto';

/**
 * Verkleinen naar max 1600 px langste zijde, JPEG q80. Het re-encoderen is de
 * privacymaatregel: alle EXIF (GPS, toestel-id, tijdstempel) verdwijnt vóór de
 * foto het toestel verlaat (docs/adr/0005-foto-pipeline.md). Daarom wordt óók
 * een foto die al klein genoeg is opnieuw geëncodeerd.
 */
export interface ProcessedPhoto {
  uri: string;
  width: number;
  height: number;
}

export async function processPhoto(foto: PickedPhoto): Promise<ProcessedPhoto> {
  const actie = resizeActie(foto.width, foto.height);
  const resultaat = await manipulateAsync(foto.uri, actie ? [{ resize: actie }] : [], {
    compress: JPEG_KWALITEIT,
    format: SaveFormat.JPEG,
  });
  return { uri: resultaat.uri, width: resultaat.width, height: resultaat.height };
}
