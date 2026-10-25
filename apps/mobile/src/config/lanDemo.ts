/**
 * Demo-hulp: draait de app tegen het nagemaakte backend op een laptop, dan
 * moeten de dataverzoeken naar dezelfde machine gaan als waar de pagina
 * vandaan komt — ongeacht via welk adres (127.0.0.1, wifi-IP, hotspot-IP) de
 * tester hem opent. Zuiver gehouden en los van env.ts zodat dit testbaar is.
 */

/** Loopback of privéadres (RFC 1918)? Echte omgevingen draaien daar nooit. */
export function isLokaalAdres(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/**
 * Wijst de API-URL naar een lokaal adres en komt de pagina van een ánder
 * lokaal adres, dan volgt de API de pagina. Dat dekt zowel de klassieke
 * loopback-valkuil (127.0.0.1 is op een telefoon de telefoon zelf) als een
 * ingebakken adres van de verkeerde adapter (WSL/Hyper-V enumereert op
 * Windows vaak vóór de echte wifi). Echte omgevingen (https, publieke
 * domeinen) blijven onaangeroerd.
 */
export function volgPagina(apiUrl: string, paginaHost: string | undefined): string {
  if (!paginaHost) return apiUrl;
  try {
    const doel = new URL(apiUrl);
    if (
      isLokaalAdres(doel.hostname) &&
      isLokaalAdres(paginaHost) &&
      doel.hostname !== paginaHost
    ) {
      doel.hostname = paginaHost;
      return doel.toString().replace(/\/$/, '');
    }
  } catch {
    // Geen geldige URL: laat de bestaande foutafhandeling dit melden.
  }
  return apiUrl;
}
