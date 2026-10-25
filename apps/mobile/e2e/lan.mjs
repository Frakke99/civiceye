import os from 'node:os';

/**
 * De IPv4-adressen van deze machine, bruikbaarste eerst.
 *
 * Op Windows staan er vaak virtuele adapters tussen (WSL, Hyper-V, VPN's,
 * VirtualBox) en die enumereren nogal eens vóór de echte wifi-adapter. Een
 * telefoon kan zo'n virtueel adres nooit bereiken — wie het eerste adres
 * blind inbakt of toont, stuurt de tester dus de mist in. De adapternaam
 * verraadt ze; echte adapters ("Wi-Fi", "Ethernet", "en0", "wlan0") komen
 * eerst.
 */
const VIRTUEEL = /vethernet|wsl|hyper-v|virtualbox|vmware|docker|veth|tailscale|zerotier|bluetooth|loopback|vpn/i;

export function lanAdressen() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([naam, lijst]) => (lijst ?? []).map((n) => ({ naam, ...n })))
    .filter((n) => n.family === 'IPv4' && !n.internal)
    .sort((a, b) => Number(VIRTUEEL.test(a.naam)) - Number(VIRTUEEL.test(b.naam)))
    .map((n) => ({ adres: n.address, virtueel: VIRTUEEL.test(n.naam), naam: n.naam }));
}
